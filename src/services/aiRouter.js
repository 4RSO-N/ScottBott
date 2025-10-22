const PerplexityService = require('./perplexityService');
const GeminiService = require('./geminiService');
const HuggingFaceService = require('./huggingfaceService');
const logger = require('../utils/logger');

class AIRouter {
    constructor() {
        this.services = new Map();
        this.requestCounts = new Map();
        this.lastRequestTime = new Map();
        this.loadingPromise = null;
        
        // Rate limit tracking for sustained fallback
        this.geminiRateLimitCooldown = 60000; // 60 seconds cooldown after rate limit
        this.lastGeminiRateLimit = null; // Timestamp of last rate limit
    }
    
    async initialize() {
        if (this.loadingPromise === null) {
            this.loadingPromise = this.initializeServices();
        }
        await this.loadingPromise;
    }
    
    async waitForInitialization() {
        if (this.loadingPromise === null) {
            await this.initialize();
            return;
        }
        await this.loadingPromise;
    }

    async initializeServices() {
        try {
            // Initialize Gemini service (primary for chat)
                if (this.hasValidApiKey('GEMINI_API_KEY')) {
                    this.services.set('gemini', new GeminiService());
                    logger.info('✅ Gemini 2.5 Flash ready for chat');
                } else {
                    logger.info('ℹ️ Gemini service skipped - API key missing or invalid (check GEMINI_API_KEY)');
            }

            // Initialize Perplexity as backup for chat
            if (this.hasValidApiKey('PERPLEXITY_API_KEY')) {
                this.services.set('perplexity', new PerplexityService());
                logger.info('✅ Perplexity Sonar ready as backup');
            } else {
                logger.info('ℹ️ Perplexity service skipped - API key missing');
            }

            // Initialize Hugging Face for image generation (free!)
            if (this.hasValidApiKey('HUGGINGFACE_API_KEY')) {
                this.services.set('huggingface', new HuggingFaceService());
                logger.info('✅ Hugging Face ready for image generation (FLUX.1-dev)');
            } else {
                logger.warn('⚠️  Hugging Face service skipped - API key missing');
            }
        } catch (error) {
            logger.error('❌ Failed to initialize AI services:', error.message);
        }

        logger.info('✅ AI services initialized');
    }

    /**
     * Check if an API key is valid (not a placeholder)
     */
    hasValidApiKey(keyName) {
        const key = process.env[keyName];
        if (!key) return false;
        
        const placeholders = ['your_', 'placeholder', 'example', 'test_key', 'sample', 'demo'];
        return !placeholders.some(placeholder => key.toLowerCase().includes(placeholder));
    }

    // Small helper to centralize rate-limit detection logic
    isRateLimitError(err) {
        if (!err?.message) return false;
        const msg = String(err.message).toLowerCase();
        return msg.includes('429') || msg.includes('rate limit') || msg.includes('quota exceeded');
    }

    /**
     * Get chat response using Gemini 2.5 Flash with Perplexity fallback
     */
    async getChatResponse(prompt, context = {}) {
        try {
            const gemini = this.services.get('gemini');
            const perplexity = this.services.get('perplexity');
            
            // Check if Gemini is in cooldown period after rate limit
            const inCooldown = this.lastGeminiRateLimit && 
                               (Date.now() - this.lastGeminiRateLimit < this.geminiRateLimitCooldown);
            
            if (inCooldown) {
                logger.debug(`Gemini in cooldown (${Math.ceil((this.geminiRateLimitCooldown - (Date.now() - this.lastGeminiRateLimit)) / 1000)}s remaining), using Perplexity`);
            }
            
            // Try Gemini first (unless in cooldown)
            if (gemini && !inCooldown) {
                try {
                    logger.debug(`Chat request to Gemini: "${prompt.substring(0, 50)}..."`);
                    const response = await gemini.generateText(prompt, context);

                    if (response?.success) {
                        // Clear rate limit tracking on success
                        this.lastGeminiRateLimit = null;
                        this.updateUsageStats('gemini', 'chat');
                        return this.formatResponse(response);
                    }
                } catch (geminiError) {
                    if (this.isRateLimitError(geminiError)) {
                        this.lastGeminiRateLimit = Date.now();
                        logger.warn(`Gemini rate limit hit, falling back to Perplexity for ${this.geminiRateLimitCooldown / 1000}s`);
                    } else {
                        logger.warn('Gemini failed, falling back to Perplexity:', geminiError.message);
                    }
                }
            }

            // Fallback to Perplexity
            if (!perplexity) {
                return {
                    content: 'Sorry, I\'m not available right now.',
                    provider: 'Error'
                };
            }

            logger.debug(`Chat request to Perplexity (fallback): "${prompt.substring(0, 50)}..."`);
            const response = await perplexity.generateChatResponse(prompt, context);

            this.updateUsageStats('perplexity', 'chat');
            const formatted = this.formatResponse(response);
            // Log usage if available
            if (response.usage) {
                logger.debug(`Perplexity usage: prompt_tokens=${response.usage.prompt_tokens || '?'} completion_tokens=${response.usage.completion_tokens || '?'} total_tokens=${response.usage.total_tokens || '?'}`);
            }
            return formatted;

        } catch (error) {
            logger.error('Chat error:', error.message);
            return {
                content: 'Sorry, something went wrong. Try again?',
                provider: 'Error'
            };
        }
    }

    /**
     * Generate images using Hugging Face (free FLUX model)
     */
    async generateImage(prompt, options = {}) {
        try {
            const huggingface = this.services.get('huggingface');
            
            if (!huggingface) {
                return {
                    content: '❌ Image generation is not available right now.',
                    embeds: [{
                        title: '🎨 Service Unavailable',
                        description: 'Hugging Face service is not initialized.',
                        color: 0xff0000
                    }]
                };
            }

            logger.info(`Generating image: "${prompt.substring(0, 50)}..."`);
            
            const result = await huggingface.generateImage(prompt, {
                width: options.width || 1024,
                height: options.height || 1024
            });

            if (!result.success) {
                throw new Error('Image generation failed');
            }

            this.updateUsageStats('huggingface', 'image');

            // Send just the image attachment without embed
            const fileName = `${Date.now()}-generated.png`;

            return {
                files: [{
                    attachment: result.imageBuffer,
                    name: fileName
                }]
            };

        } catch (error) {
            logger.warn(`Hugging Face image generation failed: ${error.message}`);
            logger.debug('Attempting Gemini Imagen fallback...');
            // Attempt fallback to Gemini Imagen if available
            try {
                const gemini = this.services.get('gemini');
                if (!gemini || typeof gemini.generateImage !== 'function') {
                    throw new Error('Gemini image service not available');
                }

                const geminiResult = await gemini.generateImage(prompt, {
                    sampleCount: 1,
                    aspectRatio: options.width && options.height ? `${options.width}:${options.height}` : '1:1'
                });

                if (!geminiResult?.success || !geminiResult.imageData) {
                    throw new Error('Gemini did not return image data');
                }

                const buffer = Buffer.from(geminiResult.imageData, 'base64');
                const fileName = `${Date.now()}-generated.png`;
                this.updateUsageStats('gemini', 'image');

                // Send just the image, consistent with HF response format
                logger.info('Image generated via Gemini Imagen fallback');
                return {
                    files: [{ attachment: buffer, name: fileName }]
                };
            } catch (fallbackError) {
                logger.error('Image generation failed after fallback:', fallbackError.message);
                return {
                    content: '❌ Sorry, I couldn\'t generate that image.',
                    embeds: [{
                        title: '🎨 Generation Failed',
                        description: error.message || fallbackError.message || 'Unknown error occurred',
                        color: 0xff0000
                    }]
                };
            }
        }
    }

    /**
     * Analyze uploaded images
     */
    async analyzeImage(imageBuffer, prompt = "What's in this image?", context = {}) {
        // Image analysis is disabled — return a consistent disabled response
        return {
            content: '❌ Image analysis is disabled.',
            embeds: []
        };
    }

    /**
     * Select the optimal service based on request type
     * Chat: Always Gemini 2.5 Flash
     * Images: Hugging Face (with Gemini fallback)
     */
    selectOptimalService(requestType, prompt = '') {
        const availableServices = Array.from(this.services.keys()).filter(service => {
            return this.services.get(service) !== null;
        });

        if (availableServices.length === 0) {
            return null;
        }

        // For image-related requests, prefer Hugging Face (handled by image service)
        if (requestType === 'image' || requestType === 'vision') {
            return 'huggingface';
        }

        // For all chat requests, always use Gemini
        if (requestType === 'chat') {
            if (availableServices.includes('gemini')) {
                return 'gemini';
            }
        }

        // Fallback
        return availableServices[0];
    }

    /**
     * Handle failover to backup services
     */
    /**
     * Format response for Discord
     */
    formatResponse(response) {
        if (!response?.success) {
            return {
                content: '❌ Sorry, I couldn\'t process your request right now.'
            };
        }

        let content = response.text || response.description || 'No response generated';

        // Build embeds array
        const embeds = [];
        
        // Add single embed if present
        if (response.embed) {
            embeds.push(response.embed);
        }
        
        // Add embeds array if present
        if (response.embeds && Array.isArray(response.embeds)) {
            embeds.push(...response.embeds);
        }

        return {
            content: content || null,
            embeds: embeds.length > 0 ? embeds : []
        };
    }

    /**
     * Update usage statistics
     */
    updateUsageStats(serviceName, requestType) {
        const now = Date.now();
        
        // Update request counts
        const counts = this.requestCounts.get(serviceName) || [];
        counts.push(now);
        
        // Keep only last hour of data
        const oneHourAgo = now - 3600000;
        const recentCounts = counts.filter(timestamp => timestamp > oneHourAgo);
        
        this.requestCounts.set(serviceName, recentCounts);
        this.lastRequestTime.set(serviceName, now);
        
        logger.info(`Service usage: ${serviceName} - ${requestType} (${recentCounts.length} requests in last hour)`);
    }

    /**
     * Health check all services (runs in background, doesn't block initialization)
     */
    async healthCheckServices() {
        logger.info('Performing health checks on AI services...');
        
        // Run health checks in background without blocking
        for (const [name, service] of this.services) {
            // Fire and forget - don't await
            service.healthCheck()
                .then(isHealthy => {
                    if (isHealthy) {
                        logger.info(`✅ ${name} service is healthy`);
                    } else {
                        logger.warn(`⚠️ ${name} service health check failed`);
                    }
                })
                .catch(error => {
                    logger.warn(`⚠️ ${name} service health check error:`, error.message);
                });
        }
        
        logger.info('✅ Health checks started in background');
    }

    /**
     * Get service statistics
     */
    getServiceStats() {
        const stats = {
            availableServices: Array.from(this.services.keys()),
            totalServices: this.services.size,
            usage: {}
        };

        for (const [name, service] of this.services) {
            const counts = this.requestCounts.get(name) || [];
            const lastHour = counts.filter(t => t > Date.now() - 3600000).length;
            
            stats.usage[name] = {
                requestsLastHour: lastHour,
                lastRequestTime: this.lastRequestTime.get(name) || 'Never',
                serviceInfo: service.getUsageStats()
            };
        }

        return stats;
    }

    /**
     * Create a placeholder response when services aren't available
     */
    createPlaceholderResponse(type, reason) {
        const responses = {
            chat: {
                content: `🤖 **Bot Response (Demo Mode)**\n\nI'd love to help you, but I'm currently running in demo mode because the AI API keys are placeholders.\n\n**Your message:** "${reason}"\n\n**What I would normally do:** Process your request using advanced AI services and provide a thoughtful response.\n\n**To enable full functionality:** Replace the placeholder API keys in the .env file with real keys.`,
                embeds: [{
                    title: '⚠️ Demo Mode Active',
                    description: 'AI services unavailable - placeholder API keys detected',
                    color: 0xff9900,
                    footer: { text: 'ScottBot Demo Mode' }
                }]
            },
            image: {
                content: `🎨 **Image Generation (Demo Mode)**\n\nI'd generate an image description for you, but I'm currently running with placeholder API keys.\n\n**What I would normally do:** Create a detailed, creative description of your requested image using Gemini AI.\n\n**To enable full functionality:** Replace the placeholder API keys in the .env file with real keys.`,
                embeds: [{
                    title: '🎨 Image Generation Demo',
                    description: 'Gemini service unavailable - placeholder API key detected',
                    color: 0xff9900,
                    footer: { text: 'ScottBot Demo Mode' }
                }]
            }
        };

        return responses[type] || {
            content: `⚠️ Service unavailable: ${reason}`,
            embeds: [{
                title: 'Service Unavailable',
                description: reason,
                color: 0xff0000
            }]
        };
    }

    /**
     * Add a new AI service
     */
    addService(name, service) {
        this.services.set(name, service);
        logger.info(`Added new AI service: ${name}`);
    }

    /**
     * Remove a service
     */
    removeService(name) {
        this.services.delete(name);
        this.requestCounts.delete(name);
        this.lastRequestTime.delete(name);
        logger.info(`Removed AI service: ${name}`);
    }
}

module.exports = AIRouter;