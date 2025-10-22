const { Client, GatewayIntentBits, Collection, ChannelType } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const logger = require('./utils/logger');
const security = require('./utils/security');
const AIRouter = require('./services/aiRouter');
const ConversationManager = require('./utils/conversationManager');
const ImageProcessor = require('./utils/imageProcessor');
const PerformanceMonitor = require('./utils/performanceMonitor');
const SlashCommandManager = require('./utils/slashCommandManager');
const DatabaseManager = require('./utils/databaseManager');
const WebDashboard = require('./utils/webDashboard');
const ConfigurationManager = require('./utils/configurationManager');
const ErrorHandler = require('./utils/errorHandler');
const BackupManager = require('./utils/backupManager');
const RoleManager = require('./utils/roleManager');
const PresetManager = require('./utils/presetManager');
const SecurityManager = require('./utils/securityManager');

class ScottBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.GuildMembers
            ]
        });

        this.commands = new Collection();
    this.aiRouter = new AIRouter();
        this.rateLimits = new Map();
        
        // Initialize new components
        this.conversationManager = new ConversationManager();
    this.imageProcessor = new ImageProcessor();
    const ImageQueueClass = require('./services/imageQueue');
    this.imageQueue = null; // will initialize after services are ready
        this.performanceMonitor = new PerformanceMonitor();
        this.slashCommandManager = new SlashCommandManager(this);
        this.databaseManager = new DatabaseManager();
        this.configurationManager = new ConfigurationManager();
        this.errorHandler = new ErrorHandler(this);
        this.backupManager = new BackupManager({
            backupDir: './backups',
            maxBackups: 15,
            autoBackupInterval: 86400000 // 24 hours
        });
        this.webDashboard = new WebDashboard(this, {
            port: this.configurationManager.get('dashboard.port', 3000),
            enabled: this.configurationManager.get('dashboard.enabled', true)
        });
        this.roleManager = new RoleManager(this.client);
        this.presetManager = new PresetManager(this.databaseManager);
        this.securityManager = SecurityManager;
        
        // Don't call init in constructor - will be called externally
    }

    async init() {
        try {
            console.log('🚀 Initializing ScottBot...');
            
            // Initialize AI router
            console.log('🤖 Initializing AI Router...');
            await this.aiRouter.initialize();
            console.log('✅ AI Router initialized');

            // Initialize image queue with available image services (prefer HF, fallback Gemini)
            try {
                const ImageQueueClass = require('./services/imageQueue');
                const geminiSvc = this.aiRouter.services.get('gemini');
                const huggingfaceSvc = this.aiRouter.services.get('huggingface');

                this.imageQueue = new ImageQueueClass();
                // Attach huggingface reference for preference
                this.imageQueue.huggingfaceService = huggingfaceSvc;
                await this.imageQueue.initialize(geminiSvc, this.client);
                logger.info('✅ ImageQueue initialized with Gemini and Hugging Face services');
            } catch (e) {
                logger.warn('ImageQueue initialization skipped or failed:', e.message || e);
                // Keep imageQueue null — image endpoints will return friendly error
                this.imageQueue = null;
            }
            
            // Initialize database first
            console.log('💾 Initializing Database...');
            await this.databaseManager.init();
            console.log('✅ Database initialized');
            
            // Initialize preset manager
            console.log('📋 Initializing Preset Manager...');
            await this.presetManager.initialize();
            console.log('✅ Preset Manager initialized');
            
            // Initialize backup manager
            console.log('💼 Initializing Backup Manager...');
            await this.backupManager.initialize();
            console.log('✅ Backup Manager initialized');
            
            // Load commands and setup
            console.log('📚 Loading Commands...');
            await this.loadCommands();
            await this.loadSlashCommands();
            console.log('✅ Commands loaded');
            
            console.log('👂 Setting up Event Listeners...');
            this.setupEventListeners();
            console.log('✅ Event Listeners ready');
            
            // Start web dashboard if enabled
            if (this.configurationManager.get('dashboard.enabled', true)) {
                await this.webDashboard.start();
                console.log('📊 Web dashboard started on port', this.configurationManager.get('dashboard.port', 3000));
            }
            
            // Login to Discord
            await this.login();

            // Image generation disabled - focusing on chat
            logger.info('🚀 ScottBot ready for conversations!');
            
            console.log('✅ ScottBot initialization complete!');
            
        } catch (error) {
            // Log full stack to help diagnose initialization failures
            console.error('❌ Failed to initialize ScottBot:', error.stack || error);
            try {
                await this.errorHandler.handleError(error, { context: 'initialization' });
            } catch (error_) {
                console.error('ErrorHandler failed while handling initialization error:', error_.stack || error_);
            }
            process.exit(1);
        }
    }

    async loadCommands() {
        const commandsPath = path.join(__dirname, 'commands');
        
        if (!fs.existsSync(commandsPath)) {
            logger.warn('Commands directory not found');
            return;
        }

        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            
            if ('data' in command && 'execute' in command) {
                this.commands.set(command.data.name, command);
                logger.info(`Loaded command: ${command.data.name}`);
            } else {
                logger.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        }
    }

    async loadSlashCommands() {
        try {
            this.slashCommandManager.loadSlashCommands();
            
            // Store slash commands in the client for easy access
            this.client.commands = this.commands;
            
            logger.info('Slash commands loaded successfully');
        } catch (error) {
            logger.error('Error loading slash commands:', error);
        }
    }

    setupEventListeners() {
        this.client.once('clientReady', async () => {
            logger.info(`✅ ${this.client.user.tag} is online and ready!`);
            this.client.user.setActivity('with AI APIs', { type: 'PLAYING' });
            
            // Initialize bot roles for existing guilds
            setTimeout(async () => {
                await this.roleManager.initializeAllGuilds();
            }, 3000); // Wait a bit for Discord to be fully ready
        });

        // Handle slash command interactions
        this.client.on('interactionCreate', async (interaction) => {
            const requestData = this.performanceMonitor.startRequest(
                `interaction-${Date.now()}`,
                'discord',
                interaction.isChatInputCommand() ? 'slash-command' : 'button'
            );

            try {
                // Security check for slash commands
                if (interaction.isChatInputCommand()) {
                }

                if (interaction.isChatInputCommand()) {
                    await this.slashCommandManager.handleInteraction(interaction, this.aiRouter, this.imageQueue, this.presetManager);
                } else if (interaction.isButton()) {
                    await this.slashCommandManager.handleButtonInteraction(interaction, this.aiRouter, this.imageQueue, this.presetManager);
                }
                this.performanceMonitor.endRequest(requestData, true);
            } catch (error) {
                // Record API error for anomaly detection
                if (interaction.user) {
                    this.securityManager.recordApiError(
                        interaction.user.id,
                        error.statusCode || 500,
                        `slash-command-${interaction.commandName}`
                    );
                }

                await this.errorHandler.handleError(error, {
                    interaction,
                    commandName: interaction.commandName,
                    context: 'slash-command'
                });
                this.performanceMonitor.endRequest(requestData, false, error);
            }
        });

        this.client.on('messageCreate', async (message) => {
            // Skip messages from bots (including self)
            if (message.author.bot) return;

            // Record user activity for performance monitoring
            this.performanceMonitor.recordUserActivity(message.author.id);

            // Rate limiting disabled for testing

            // Handle image uploads
            if (message.attachments.size > 0) {
                await this.handleImageUpload(message);
                return;
            }

            // Handle direct mentions or DMs
            const isMentioned = this.isBotMentioned(message);
            
            // Debug logging for mention detection
            if (isMentioned) {
                logger.info(`Bot mentioned by ${message.author.username} in ${message.guild?.name || 'DM'}: "${message.content}"`);
            }
            
            if (isMentioned) {
                await this.handleAIRequest(message);
                return;
            }

            // Handle prefix commands
            const prefix = process.env.BOT_PREFIX || '!';
            if (message.content.startsWith(prefix)) {
                await this.handleCommand(message, prefix);
            }
        });

        // Handle guild join events for role management
        this.client.on('guildCreate', async (guild) => {
            await this.roleManager.onGuildJoin(guild);
        });

        // Handle when bot is added to a guild (alternative event)
        this.client.on('guildMemberAdd', async (member) => {
            if (member.user.id === this.client.user.id) {
                await this.roleManager.onGuildJoin(member.guild);
            }
        });

        this.client.on('error', (error) => {
            logger.error('Discord client error:', error);
            this.performanceMonitor.recordError(error);
        });

        this.client.on('warn', (warning) => {
            logger.warn('Discord client warning:', warning);
        });
    }

    async handleCommand(message, prefix) {
        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        const command = this.commands.get(commandName);

        if (!command) {
            return message.reply(`❌ Unknown command. Use \`${prefix}help\` for available commands.`);
        }

        try {
            await command.execute(message, args, this.aiRouter);
        } catch (error) {
            await this.errorHandler.handleError(error, {
                message,
                commandName,
                context: 'prefix-command'
            });
        }
    }

    /**
     * Check if the bot is mentioned in a message
     */
    isBotMentioned(message) {
        // Direct mentions or DMs
        if (message.mentions.has(this.client.user) || 
            message.content.includes(`<@${this.client.user.id}>`) ||
            message.content.includes(`<@!${this.client.user.id}>`) ||
            message.channel.type === ChannelType.DM) {
            return true;
        }

        // Check for casual triggers anywhere in message (case-insensitive)
        const content = message.content.toLowerCase();
        const triggers = ['scott', 'scottbot'];
        
        // Check if message contains any trigger as a word (not part of another word)
        return triggers.some(trigger => {
            const regex = new RegExp(`\\b${trigger}\\b`, 'i');
            return regex.test(content);
        });
    }

    /**
     * Clean mention from message content
     */
    cleanMentionFromMessage(content) {
        let cleaned = content
            .replaceAll(`<@${this.client.user.id}>`, '')
            .replaceAll(`<@!${this.client.user.id}>`, '');
        
        // Remove casual triggers from anywhere in the message
        const triggers = ['scottbot', 'scott'];
        
        for (const trigger of triggers) {
            // Use word boundary regex to avoid replacing parts of other words
            const regex = new RegExp(`\\b${trigger}\\b[,!?]?`, 'gi');
            cleaned = cleaned.replace(regex, '');
        }
        
        // Clean up extra spaces and punctuation
        cleaned = cleaned.replace(/\s{2,}/g, ' ').replace(/^\s*[,!?]\s*/, '');
        
        return cleaned.trim();
    }

    async handleAIRequest(message) {
        const requestData = this.performanceMonitor.startRequest(
            `ai-${Date.now()}`,
            'ai-router',
            'chat'
        );

        try {
            // Validate user input for security and clean mention formats
            const userMessage = this.cleanMentionFromMessage(message.content);
            
            if (!security.validateUserInput(userMessage)) {
                logger.warn(`Potentially malicious input from user ${message.author.id}: ${security.sanitizeForLogging(userMessage)}`);
                this.performanceMonitor.endRequest(requestData, false, new Error('Invalid input'));
                return message.reply('❌ Invalid input detected. Please check your message and try again.');
            }
            
            if (!userMessage) {
                this.performanceMonitor.endRequest(requestData, true);
                return message.reply('👋 Hi! How can I help you today? Ask me anything or request an image!');
            }

            // Show typing indicator
            await message.channel.sendTyping();

            // Build conversation context
            const conversationContext = this.conversationManager.buildContextForAI(
                message.author.id,
                message.channel.id,
                userMessage,
                {
                    username: message.author?.username,
                    displayName: message.member?.displayName || message.author?.globalName || message.author?.username,
                    channelType: message.channel?.type === 1 ? 'dm' : 'text'
                }
            );

            // Lightweight observability for history inclusion
            logger.debug(`Conversation history included: ${conversationContext.includedHistory}/${conversationContext.conversationLength} (budgeted)`);

            // Determine if this is an image request
            const isImageRequest = this.isImageRequest(userMessage);

            let response;
            if (isImageRequest) {
                response = await this.aiRouter.generateImage(userMessage, {
                    userId: message.author.id,
                    username: message.author.username,
                    displayName: message.member?.displayName || message.author?.globalName || message.author.username,
                    hasHistory: conversationContext.hasHistory
                });
            } else {
                response = await this.aiRouter.getChatResponse(userMessage, {
                    userId: message.author.id,
                    username: message.author.username,
                    displayName: message.member?.displayName || message.author?.globalName || message.author.username,
                    conversationContext: conversationContext,
                    hasHistory: conversationContext.hasHistory
                });
            }

            // Add to conversation history
            this.conversationManager.addMessage(message.author.id, message.channel.id, userMessage, false);
            this.conversationManager.addMessage(message.author.id, message.channel.id, response.content || 'Response generated', true);

            await message.reply(response);
            this.performanceMonitor.endRequest(requestData, true);

        } catch (error) {
            await this.errorHandler.handleError(error, {
                message,
                aiRouter: this.aiRouter,
                currentService: 'auto-detect',
                context: 'ai-request',
                originalFunction: () => this.handleAIRequest(message)
            });
            this.performanceMonitor.endRequest(requestData, false, error);
        }
    }

    async handleImageUpload(message) {
        // Image analysis disabled - bot will not automatically analyze uploaded images
        // Users can still use /analyze command if they want image analysis
        logger.info('Image upload received but automatic analysis is disabled.');
        return;
    }

    isImageRequest(message) {
        const lowerMessage = message.toLowerCase();
        
        // Check for explicit image generation phrases
        const imageKeywords = [
            'generate image', 'create image', 'make image', 'make an image',
            'generate a picture', 'create a picture', 'generate an image',
            'draw me', 'draw a', 'paint me', 'paint a', 'sketch me', 'sketch a',
            'show me an image', 'show me a picture'
        ];
        
        // Check for explicit matches first
        if (imageKeywords.some(keyword => lowerMessage.includes(keyword))) {
            return true;
        }
        
        // Check for "image of" or "picture of" patterns
        if ((lowerMessage.includes('image of') || lowerMessage.includes('picture of')) &&
            (lowerMessage.includes('generate') || lowerMessage.includes('create') || lowerMessage.includes('make') || lowerMessage.includes('show'))) {
            return true;
        }
        
        return false;
    }

    isRateLimited(userId) {
        const now = Date.now();
        const userLimits = this.rateLimits.get(userId) || { count: 0, resetTime: now + 60000 };

        if (now > userLimits.resetTime) {
            userLimits.count = 0;
            userLimits.resetTime = now + 60000;
        }

        userLimits.count++;
        this.rateLimits.set(userId, userLimits);

        const maxRequests = Number.parseInt(process.env.RATE_LIMIT_REQUESTS) || 10;
        return userLimits.count > maxRequests;
    }

    async login() {
        try {
            const token = process.env.DISCORD_TOKEN;
            
            // Check if token is a placeholder
            if (this.isPlaceholderToken(token)) {
                logger.warn('⚠️  Discord login skipped - placeholder token detected');
                logger.warn('   Bot will run in demo mode without Discord connection');
                logger.warn('   Replace DISCORD_TOKEN in .env with a real bot token to enable Discord features');
                console.log('⚠️  Running in DEMO MODE - Discord features disabled');
                return;
            }
            
            await this.client.login(token);
            logger.info('✅ Successfully logged into Discord');
        } catch (error) {
            logger.error('Failed to login to Discord:', error);
            logger.warn('Bot will continue in demo mode without Discord connection');
            console.log('⚠️  Discord login failed - running in DEMO MODE');
        }
    }

    /**
     * Check if Discord token is a placeholder
     */
    isPlaceholderToken(token) {
        if (!token) return true;
        
        const placeholders = ['your_', 'placeholder', 'example', 'test_', 'sample', 'demo', '_here'];
        return placeholders.some(placeholder => token.toLowerCase().includes(placeholder));
    }

    async shutdown() {
        logger.info('🔄 Starting graceful shutdown...');
        
        try {
            // Save any pending data
            if (this.conversationManager) {
                await this.conversationManager.saveAllConversations();
            }
            
            // Close database connections
            if (this.databaseManager) {
                await this.databaseManager.close();
            }
            
            // Stop web dashboard
            if (this.webDashboard) {
                await this.webDashboard.stop();
            }
            
            // Create final backup
            if (this.backupManager && this.configurationManager.get('features.autoBackupOnShutdown', true)) {
                logger.info('📦 Creating shutdown backup...');
                await this.backupManager.createBackup('incremental', true);
            }
            
            // Destroy Discord client
            await this.client.destroy();
            
            logger.info('✅ Graceful shutdown completed');
        } catch (error) {
            logger.error('❌ Error during shutdown:', error);
        }
        
        process.exit(0);
    }
}

module.exports = ScottBot;