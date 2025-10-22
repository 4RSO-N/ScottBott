const logger = require('../utils/logger');

class ImageQueue {
    constructor() {
        this.initialized = false;
        this.activeJobs = new Map(); // Track active jobs per user
        this.jobHistory = []; // Keep recent job history
        this.maxHistorySize = 100;
        this.userJobs = new Map(); // Track jobs per user for debouncing
        this.debounceTimeout = 2500; // 2.5 seconds debounce window
        this.jobCounter = 0; // Simple job ID counter
    }

    /**
     * Initialize the image queue (simplified without Redis)
     * @param {Object} geminiService - The Gemini service instance for image generation
     * @param {Object} discordClient - The Discord client for posting images
     */
    async initialize(geminiService, discordClient) {
        try {
            // Store services for job processing
            this.geminiService = geminiService;
            this.discordClient = discordClient;

            this.initialized = true;
            logger.info('✅ Image queue initialized (direct processing, no Redis required)');
            
        } catch (error) {
            logger.error('Failed to initialize image queue:', error);
            throw error;
        }
    }

    /**
     * Add an image generation job (process directly without queue)
     * @param {Object} data - Job data
     * @param {string} data.prompt - Image generation prompt
     * @param {string} data.userId - Discord user ID
     * @param {string} data.channelId - Discord channel ID
     * @param {string} data.messageId - Discord message ID (for status updates)
     * @param {Object} data.parsedPrompt - Parsed prompt data
     * @returns {Promise<Object>} Job object
     */
    async addImageJob(data) {
        if (!this.initialized) {
            throw new Error('Image queue not initialized');
        }

        try {
            const userId = data.userId;
            const now = Date.now();

            // Check for existing jobs from this user within debounce window
            const existingJob = this.userJobs.get(userId);
            if (existingJob && (now - existingJob.timestamp) < this.debounceTimeout) {
                logger.info(`Debouncing job for user ${userId}, cancelling previous request`);
                existingJob.cancelled = true;
            }

            // Create job object (simplified, no Bull)
            const jobId = `${userId}_${now}_${++this.jobCounter}`;
            const tier = 'high'; // Always use high quality without queue management

            const job = {
                id: jobId,
                data: {
                    prompt: data.prompt,
                    userId: data.userId,
                    channelId: data.channelId,
                    messageId: data.messageId,
                    parsedPrompt: data.parsedPrompt,
                    tier: tier,
                    requestedAt: now
                },
                state: 'active',
                progress: 0,
                attemptsMade: 0
            };

            // Store job reference for debouncing
            this.userJobs.set(userId, {
                job: job,
                timestamp: now,
                prompt: data.prompt,
                cancelled: false
            });

            // Clean up old job references after debounce window
            setTimeout(() => {
                if (this.userJobs.get(userId)?.timestamp === now) {
                    this.userJobs.delete(userId);
                }
            }, this.debounceTimeout + 1000);

            // Track active job
            this.activeJobs.set(jobId, job);

            logger.info(`Created image generation job ${job.id}`, {
                userId: data.userId,
                prompt: data.prompt.substring(0, 50),
                tier: tier
            });

            // Process the job immediately (async, don't wait)
            this.processImageGeneration(job).catch(error => {
                logger.error(`Job ${job.id} processing failed:`, error);
            });

            return job;

        } catch (error) {
            logger.error('Failed to add image job:', error);
            throw error;
        }
    }

    /**
     * Process an image generation job (direct processing without queue)
     * @param {Object} job - Job object
     */
    async processImageGeneration(job) {
        const { prompt, userId, channelId, messageId, parsedPrompt, tier, requestedAt } = job.data;

        try {
            // Check if job was cancelled during debounce
            const userJob = this.userJobs.get(userId);
            if (userJob?.cancelled && userJob.job.id !== job.id) {
                logger.info(`Job ${job.id} cancelled by debounce`);
                return { success: false, cancelled: true };
            }

            // Update job progress
            job.progress = 10;
            job.state = 'active';
            logger.info(`Processing ${tier} tier image generation for user ${userId}`);

            // Update status message - Generating
            await this.updateStatusMessage(channelId, messageId, {
                status: 'generating',
                progress: 10,
                tier: tier
            });

            // Generate the image using high quality settings
            job.progress = 30;

            const qualityOptions = {
                aspectRatio: parsedPrompt.aspectRatio,
                sampleCount: 1,
                safetyFilterLevel: "block_some",
                quality: 'high',
                size: this.getHighResSize(parsedPrompt.aspectRatio)
            };

            // Prefer Hugging Face for image generation, fallback to Gemini if HF fails
            let imageResult = null;
            try {
                const hf = this.huggingfaceService;
                if (hf) {
                    imageResult = await hf.generateImage(prompt, {
                        width: parseInt(qualityOptions.size.split('x')[0], 10) || 1024,
                        height: parseInt(qualityOptions.size.split('x')[1], 10) || 1024
                    });
                }
            } catch (hfError) {
                logger.warn('Hugging Face image generation failed, attempting Gemini fallback:', hfError.message || hfError);
            }

            if (!imageResult || !imageResult.success) {
                // Gemini fallback
                const gemini = this.geminiService;
                if (!gemini) {
                    throw new Error('No image service available (Hugging Face failed and Gemini not initialized)');
                }

                imageResult = await gemini.generateImage(prompt, qualityOptions);

                if (!imageResult || !imageResult.success) {
                    throw new Error(imageResult?.error || 'Image generation failed');
                }
            }

            // Update status message - Uploading
            job.progress = 70;
            await this.updateStatusMessage(channelId, messageId, {
                status: 'uploading',
                progress: 70,
                tier: tier
            });

            // Post the image to Discord
            job.progress = 90;
            await this.postImageToDiscord(channelId, messageId, imageResult, prompt, userId, tier);

            job.progress = 100;
            job.state = 'completed';

            const processingTime = Date.now() - requestedAt;
            logger.info(`${tier} tier image generation completed in ${processingTime}ms`);

            // Add to history and clean up
            this.addToHistory(job, true);
            this.activeJobs.delete(job.id);

            return {
                success: true,
                imageUrl: imageResult.imageUrl,
                processingTime,
                tier: tier
            };

        } catch (error) {
            logger.error('Error processing image generation job:', error);
            job.state = 'failed';
            job.failedReason = error.message;

            // Update status message - Failed
            await this.updateStatusMessage(channelId, messageId, {
                status: 'failed',
                error: error.message,
                tier: tier
            });

            // Add to history and clean up
            this.addToHistory(job, false);
            this.activeJobs.delete(job.id);

            throw error;
        }
    }

    /**
     * Add job to history
     * @param {Object} job - Job object
     * @param {boolean} success - Whether job succeeded
     */
    addToHistory(job, success) {
        this.jobHistory.push({
            id: job.id,
            userId: job.data.userId,
            prompt: job.data.prompt.substring(0, 50),
            tier: job.data.tier,
            success: success,
            timestamp: job.data.requestedAt,
            processingTime: Date.now() - job.data.requestedAt
        });

        // Keep history size limited
        if (this.jobHistory.length > this.maxHistorySize) {
            this.jobHistory.shift();
        }
    }

    /**
     * Get high resolution size based on aspect ratio
     * @param {string} aspectRatio - Aspect ratio string (e.g., "16:9")
     * @returns {string} Size string for high quality
     */
    getHighResSize(aspectRatio) {
        const ratioMap = {
            '1:1': '1024x1024',
            '4:3': '1024x768',
            '16:9': '1024x576',
            '3:4': '768x1024',
            '9:16': '576x1024',
            '21:9': '1024x438'
        };
        return ratioMap[aspectRatio] || '1024x1024';
    }

    /**
     * Update the status message in Discord
     * @param {string} channelId - Discord channel ID
     * @param {string} messageId - Discord message ID
     * @param {Object} status - Status update object
     */
    async updateStatusMessage(channelId, messageId, status) {
        try {
            const channel = await this.discordClient.channels.fetch(channelId);
            if (!channel) return;

            const message = await channel.messages.fetch(messageId);
            if (!message) return;

            let statusText = '';
            let emoji = '';

            switch (status.status) {
                case 'queued':
                    emoji = '⏳';
                    statusText = 'Your image is queued for generation...';
                    break;
                case 'generating':
                    emoji = '🎨';
                    statusText = `Generating your image${status.tier ? ` (${status.tier} quality)` : ''}...`;
                    break;
                case 'uploading':
                    emoji = '📤';
                    statusText = 'Uploading your image...';
                    break;
                case 'rate_limited':
                    emoji = '⏱️';
                    statusText = `Rate limited, switching to fast tier...`;
                    break;
                case 'rate_limited_queue':
                    emoji = '⏱️';
                    statusText = `Rate limited, will retry in ${status.eta}s...`;
                    break;
                case 'switched_to_fast':
                    emoji = '⚡';
                    statusText = `Switched to fast tier (ready in ${status.eta}s)...`;
                    break;
                case 'failed':
                    emoji = '❌';
                    statusText = `Image generation failed: ${status.error}`;
                    break;
                default:
                    statusText = 'Processing...';
            }

            const progressBar = this.createProgressBar(status.progress || 0);
            const content = `${emoji} ${statusText}\n${progressBar}`;

            await message.edit(content);

        } catch (error) {
            logger.error('Error updating status message:', error);
            // Don't throw - status updates are non-critical
        }
    }

    /**
     * Create a progress bar string
     * @param {number} progress - Progress percentage (0-100)
     * @returns {string} Progress bar
     */
    createProgressBar(progress) {
        const barLength = 20;
        const filledLength = Math.round((progress / 100) * barLength);
        const emptyLength = barLength - filledLength;
        
        const filled = '█'.repeat(filledLength);
        const empty = '░'.repeat(emptyLength);
        
        return `[${filled}${empty}] ${progress}%`;
    }

    /**
     * Handle variation button clicks
     * @param {Object} interaction - Discord button interaction
     * @param {Object} imageQueue - Image queue instance
     */
    async handleVariation(interaction, imageQueue) {
        const [action, userId] = interaction.customId.split('_').slice(1);

        // Verify the button is for this user
        if (userId !== interaction.user.id) {
            return await interaction.reply({
                content: '❌ This button is not for you!',
                ephemeral: true
            });
        }

        await interaction.deferUpdate();

        try {
            // Get the original message and extract prompt
            const originalMessage = interaction.message;
            const embed = originalMessage.embeds[0];
            const originalPrompt = embed.description.match(/\*\*Prompt:\*\* (.+)/)?.[1];

            if (!originalPrompt) {
                return await interaction.followUp({
                    content: '❌ Could not extract original prompt for variation.',
                    ephemeral: true
                });
            }

            let newPrompt = originalPrompt;
            let variationType = '';

            switch (action) {
                case 'more':
                    variationType = 'More like this';
                    // Keep the same prompt for similar result
                    break;

                case 'style': {
                    variationType = 'Style variation';
                    // Parse current prompt and change style
                    const PromptParser = require('../utils/promptParser');
                    const parsed = PromptParser.parsePrompt(originalPrompt);
                    const styles = ['realistic', 'artistic', 'cartoon', 'fantasy', 'sci-fi', 'anime'];
                    const currentStyleIndex = styles.indexOf(parsed.style);
                    const nextStyle = styles[(currentStyleIndex + 1) % styles.length];
                    parsed.style = nextStyle;
                    newPrompt = PromptParser.generateEnhancedPrompt(parsed);
                    break;
                }

                case 'wider':
                    variationType = 'Wider aspect ratio';
                    newPrompt = `${originalPrompt}, wider aspect ratio 16:9`;
                    break;

                case 'taller':
                    variationType = 'Taller aspect ratio';
                    newPrompt = `${originalPrompt}, taller aspect ratio 9:16`;
                    break;

                case 'sharpen':
                    variationType = 'Sharper text/details';
                    newPrompt = `${originalPrompt}, with sharper text, more detailed, high resolution`;
                    break;

                default:
                    return await interaction.followUp({
                        content: '❌ Unknown variation type.',
                        ephemeral: true
                    });
            }

            // Send status message for variation
            const statusMessage = await interaction.followUp({
                content: `🎨 Creating ${variationType.toLowerCase()}...\n[░░░░░░░░░░░░░░░░░░░░] 0%`
            });

            // Parse the prompt to get settings
            const PromptParser = require('../utils/promptParser');
            const parsedPrompt = PromptParser.parsePrompt(newPrompt);

            // Create new job for variation
            const job = await imageQueue.addImageJob({
                prompt: newPrompt,
                userId: interaction.user.id,
                channelId: interaction.channel.id,
                messageId: statusMessage.id,
                parsedPrompt: parsedPrompt,
                variationOf: originalMessage.id,
                variationType: variationType
            });

            logger.info(`Created variation job ${job.id} for user ${userId}`, {
                type: variationType,
                originalPrompt: originalPrompt.substring(0, 50),
                newPrompt: newPrompt.substring(0, 50)
            });

        } catch (error) {
            logger.error('Error handling variation:', error);
            await interaction.followUp({
                content: '❌ Failed to create variation. Please try again.',
                ephemeral: true
            });
        }
    }

    /**
     * Handle upscale button clicks for fast tier images
     * @param {Object} interaction - Discord button interaction
     */
    async handleUpscale(interaction) {
        const [action, userId] = interaction.customId.split('_').slice(1);

        // Verify the button is for this user
        if (userId !== interaction.user.id) {
            return await interaction.reply({
                content: '❌ This button is not for you!',
                ephemeral: true
            });
        }

        await interaction.deferUpdate();

        try {
            // Get the original message and extract prompt
            const originalMessage = interaction.message;
            const embed = originalMessage.embeds[0];
            const originalPrompt = embed.description.match(/\*\*Prompt:\*\* (.+)/)?.[1];

            if (!originalPrompt) {
                return await interaction.followUp({
                    content: '❌ Could not extract original prompt for upscale.',
                    ephemeral: true
                });
            }

            // Parse the prompt to get settings
            const PromptParser = require('../utils/promptParser');
            const parsedPrompt = PromptParser.parsePrompt(originalPrompt);

            // Send status message for upscale
            const statusMessage = await interaction.followUp({
                content: '⬆️ Upscaling to high quality...\n[░░░░░░░░░░░░░░░░░░░░] 0%'
            });

            // Add high-quality job to queue
            const job = await this.addImageJob({
                prompt: originalPrompt,
                userId: userId,
                channelId: interaction.channel.id,
                messageId: statusMessage.id,
                parsedPrompt: parsedPrompt
            });

            logger.info(`Created upscale job ${job.id} for user ${userId}`, {
                originalPrompt: originalPrompt.substring(0, 50)
            });

        } catch (error) {
            logger.error('Error handling upscale:', error);
            await interaction.followUp({
                content: '❌ Failed to upscale image. Please try again.',
                ephemeral: true
            });
        }
    }

    /**
     * Post the generated image to Discord with tier-specific features
     * @param {string} channelId - Discord channel ID
     * @param {string} messageId - Original status message ID
     * @param {Object} imageResult - Image generation result
     * @param {string} prompt - Original prompt
     * @param {string} userId - User ID who requested the image
     * @param {string} tier - Quality tier ('fast' or 'high')
     */
    async postImageToDiscord(channelId, messageId, imageResult, prompt, userId, tier = 'high') {
        try {
            const channel = await this.discordClient.channels.fetch(channelId);
            if (!channel) throw new Error('Channel not found');

            const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

            // Create embed for the image
            const embed = new EmbedBuilder()
                .setTitle(`🎨 Generated Image ${tier === 'fast' ? '(Fast Preview)' : ''}`)
                .setDescription(`**Prompt:** ${prompt}`)
                .setColor(tier === 'fast' ? '#FFA500' : '#5865F2')
                .setFooter({
                    text: `Requested by ${userId} • ${tier.toUpperCase()} tier • Job completed`
                })
                .setTimestamp();

            // If we have a URL, set it as the image
            if (imageResult.imageUrl) {
                embed.setImage(imageResult.imageUrl);
            }

            // Create buttons based on tier
            const components = [];

            if (tier === 'fast') {
                // Fast tier: add upscale button + variation buttons
                const upscaleRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`upscale_${userId}_${Date.now()}`)
                            .setLabel('⬆️ Upscale to High Quality')
                            .setStyle(ButtonStyle.Primary)
                    );
                components.push(upscaleRow);

                const variationRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`variation_more_${userId}_${Date.now()}`)
                            .setLabel('🔄 More like this')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId(`variation_style_${userId}_${Date.now()}`)
                            .setLabel('🎭 Change Style')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId(`variation_wider_${userId}_${Date.now()}`)
                            .setLabel('⬌ Wider')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId(`variation_taller_${userId}_${Date.now()}`)
                            .setLabel('⬍ Taller')
                            .setStyle(ButtonStyle.Secondary)
                    );
                components.push(variationRow);
            } else {
                // High tier: only variation buttons
                const variationRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`variation_more_${userId}_${Date.now()}`)
                            .setLabel('🔄 More like this')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId(`variation_style_${userId}_${Date.now()}`)
                            .setLabel('🎭 Change Style')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId(`variation_wider_${userId}_${Date.now()}`)
                            .setLabel('⬌ Wider')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId(`variation_taller_${userId}_${Date.now()}`)
                            .setLabel('⬍ Taller')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId(`variation_sharpen_${userId}_${Date.now()}`)
                            .setLabel('🔍 Sharpen Text')
                            .setStyle(ButtonStyle.Secondary)
                    );
                components.push(variationRow);
            }

            const messageOptions = {
                embeds: [embed],
                components: components
            };

            // If we have binary data, attach it
            if (imageResult.imageData) {
                const attachment = new AttachmentBuilder(
                    Buffer.from(imageResult.imageData, 'base64'),
                    { name: 'generated-image.png' }
                );
                messageOptions.files = [attachment];
            }

            await channel.send(messageOptions);

            // Delete the status message
            try {
                const statusMessage = await channel.messages.fetch(messageId);
                if (statusMessage) await statusMessage.delete();
            } catch (err) {
                logger.debug('Could not delete status message:', err.message);
            }

        } catch (error) {
            logger.error('Error posting image to Discord:', error);
            throw error;
        }
    }

    /**
     * Get job status by ID
     * @param {string} jobId - Job ID
     * @returns {Promise<Object>} Job status
     */
    async getJobStatus(jobId) {
        try {
            // Check active jobs
            const job = this.activeJobs.get(jobId);
            if (job) {
                return {
                    id: job.id,
                    state: job.state,
                    progress: job.progress,
                    data: job.data,
                    attemptsMade: job.attemptsMade,
                    failedReason: job.failedReason
                };
            }

            // Check history
            const historyJob = this.jobHistory.find(h => h.id === jobId);
            if (historyJob) {
                return {
                    id: historyJob.id,
                    state: historyJob.success ? 'completed' : 'failed',
                    progress: 100,
                    data: { userId: historyJob.userId, prompt: historyJob.prompt }
                };
            }

            return null;

        } catch (error) {
            logger.error('Error getting job status:', error);
            return null;
        }
    }

    /**
     * Get queue statistics (simplified without Redis)
     * @returns {Promise<Object>} Queue stats
     */
    async getStats() {
        try {
            const completed = this.jobHistory.filter(j => j.success).length;
            const failed = this.jobHistory.filter(j => !j.success).length;
            const active = this.activeJobs.size;

            return {
                waiting: 0, // No queue, jobs process immediately
                active: active,
                completed: completed,
                failed: failed,
                delayed: 0,
                total: active + completed + failed
            };

        } catch (error) {
            logger.error('Error getting queue stats:', error);
            return null;
        }
    }

    /**
     * Close the queue (cleanup)
     */
    async close() {
        // Cancel all active jobs
        for (const [jobId, job] of this.activeJobs) {
            job.state = 'cancelled';
            logger.info(`Cancelled job ${jobId} during shutdown`);
        }
        this.activeJobs.clear();
        this.userJobs.clear();
        logger.info('Image queue closed');
    }
}

module.exports = ImageQueue;
