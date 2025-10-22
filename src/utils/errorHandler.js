const { EmbedBuilder } = require('discord.js');
const logger = require('./logger');

class ErrorHandler {
    constructor(bot) {
        this.bot = bot;
        this.errorStats = {
            total: 0,
            byType: {},
            byCommand: {},
            recent: [],
            maxRecentErrors: 100
        };
        
        this.recoveryStrategies = new Map();
        this.setupRecoveryStrategies();
        this.setupGlobalHandlers();
    }

    setupGlobalHandlers() {
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
            this.recordError('uncaughtException', error);
            
            // Attempt graceful shutdown
            this.attemptGracefulShutdown('uncaughtException');
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            let reasonStr;
            if (reason instanceof Error) {
                reasonStr = reason.message;
            } else if (typeof reason === 'object' && reason !== null) {
                try {
                    reasonStr = JSON.stringify(reason);
                } catch {
                    // JSON.stringify can fail on circular references
                    reasonStr = Object.prototype.toString.call(reason);
                }
            } else {
                reasonStr = String(reason);
            }
            logger.error('Unhandled Rejection', { 
                reason: reasonStr, 
                promise: promise?.constructor?.name || 'Promise' 
            });
            this.recordError('unhandledRejection', reason);
        });

        // Handle warnings
        process.on('warning', (warning) => {
            logger.warn('Process Warning', {
                name: warning.name,
                message: warning.message,
                stack: warning.stack
            });
        });
    }

    setupRecoveryStrategies() {
        // Discord API errors
        this.recoveryStrategies.set('DiscordAPIError', {
            maxRetries: 3,
            retryDelay: 1000,
            exponentialBackoff: true,
            canRecover: (error) => error.code !== 50013, // Can't recover from Missing Permissions
            recovery: async (error, context) => {
                if (error.code === 50001) { // Missing Access
                    return 'Bot lacks access to this channel or server.';
                }
                if (error.code === 50013) { // Missing Permissions
                    return 'Bot lacks required permissions for this action.';
                }
                if (error.code === 50035) { // Invalid Form Body
                    return 'Invalid data sent to Discord. Please try again.';
                }
                return 'Discord API error occurred. Retrying...';
            }
        });

        // AI Service errors
        this.recoveryStrategies.set('AIServiceError', {
            maxRetries: 2,
            retryDelay: 2000,
            exponentialBackoff: true,
            canRecover: () => true,
            recovery: async (error, context) => {
                // Try fallback AI service
                if (context.aiRouter && context.currentService) {
                    try {
                        const fallbackService = context.currentService === 'gemini' ? 'perplexity' : 'gemini';
                        logger.info(`Attempting fallback to ${fallbackService} service`);
                        return await context.aiRouter.processRequest(
                            context.request, 
                            fallbackService
                        );
                    } catch (fallbackError) {
                        logger.error('Fallback service also failed', { error: fallbackError.message });
                    }
                }
                return 'AI service temporarily unavailable. Please try again later.';
            }
        });

        // Rate limit errors
        this.recoveryStrategies.set('RateLimitError', {
            maxRetries: 1,
            retryDelay: 60000, // 1 minute
            exponentialBackoff: false,
            canRecover: () => true,
            recovery: async (error, context) => {
                const resetTime = error.resetTimestamp || Date.now() + 60000;
                const waitTime = Math.max(0, resetTime - Date.now());
                
                if (waitTime > 0) {
                    logger.info(`Rate limited. Waiting ${waitTime}ms before retry`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
                
                return 'retry'; // Special return value to indicate retry
            }
        });

        // Database errors
        this.recoveryStrategies.set('DatabaseError', {
            maxRetries: 3,
            retryDelay: 500,
            exponentialBackoff: true,
            canRecover: (error) => !error.message.includes('SQLITE_CORRUPT'),
            recovery: async (error, context) => {
                if (error.message.includes('database is locked')) {
                    // Wait and retry for locked database
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    return 'retry';
                }
                
                if (error.message.includes('no such table')) {
                    // Attempt to recreate table
                    try {
                        if (context.databaseManager) {
                            await context.databaseManager.initializeDatabase();
                            return 'retry';
                        }
                    } catch (initError) {
                        logger.error('Failed to reinitialize database', { error: initError.message });
                    }
                }
                
                return 'Database temporarily unavailable. Some features may be limited.';
            }
        });

        // Memory errors
        this.recoveryStrategies.set('MemoryError', {
            maxRetries: 1,
            retryDelay: 0,
            exponentialBackoff: false,
            canRecover: () => true,
            recovery: async (error, context) => {
                // Force garbage collection
                if (globalThis.gc) {
                    globalThis.gc();
                }
                
                // Clear caches
                if (this.bot.conversationManager) {
                    this.bot.conversationManager.clearOldConversations();
                }
                
                // Log memory usage
                const memUsage = process.memoryUsage();
                logger.warn('Memory cleanup performed', {
                    rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
                    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
                    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
                });
                
                return 'Memory cleaned up. Please try again.';
            }
        });
    }

    async handleError(error, context = {}) {
        this.recordError(this.classifyError(error), error, context);

        const errorType = this.classifyError(error);
        const strategy = this.recoveryStrategies.get(errorType);

        if (!strategy) {
            return await this.genericErrorHandling(error, context);
        }

        if (!strategy.canRecover(error)) {
            logger.error(`Non-recoverable ${errorType}`, { 
                error: error.message, 
                context: this.sanitizeContext(context) 
            });
            return await this.sendErrorResponse(error, context);
        }

        return await this.attemptRecovery(strategy, error, context);
    }

    async attemptRecovery(strategy, error, context) {
        let attempts = 0;
        let lastError = error;

        while (attempts < strategy.maxRetries) {
            try {
                const result = await strategy.recovery(lastError, context);
                return await this.processRecoveryResult(result, context);
            } catch (recoveryError) {
                lastError = recoveryError;
                attempts++;
                
                if (attempts < strategy.maxRetries) {
                    await this.waitForRetry(strategy, attempts);
                }
            }
        }

        return await this.handleRecoveryFailure(lastError, context, attempts);
    }

    async processRecoveryResult(result, context) {
        if (result === 'retry') {
            if (context.originalFunction) {
                return await context.originalFunction();
            }
        } else if (typeof result === 'string') {
            return await this.sendErrorResponse(new Error(result), context);
        } else {
            logger.info('Successfully recovered from error');
            return result;
        }
    }

    async waitForRetry(strategy, attempts) {
        const delay = strategy.exponentialBackoff 
            ? strategy.retryDelay * Math.pow(2, attempts - 1)
            : strategy.retryDelay;
        
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    async handleRecoveryFailure(error, context, attempts) {
        logger.error(`Failed to recover after ${attempts} attempts`, {
            error: error.message,
            context: this.sanitizeContext(context)
        });

        return await this.sendErrorResponse(error, context);
    }

    classifyError(error) {
        if (error.name === 'DiscordAPIError' || error.code) {
            return 'DiscordAPIError';
        }
        
        if (error.message?.includes('AI service') || error.message?.includes('API')) {
            return 'AIServiceError';
        }
        
        if (error.message?.includes('rate limit') || error.message?.includes('429')) {
            return 'RateLimitError';
        }
        
        if (error.message?.includes('database') || error.message?.includes('SQLITE')) {
            return 'DatabaseError';
        }
        
        if (error.message?.includes('memory') || error.name === 'RangeError') {
            return 'MemoryError';
        }
        
        return 'UnknownError';
    }

    async genericErrorHandling(error, context) {
        logger.error('Generic error handling', { 
            error: error.message, 
            stack: error.stack,
            context: this.sanitizeContext(context)
        });

        // Check if this is a command interaction
        if (context.interaction) {
            try {
                const embed = new EmbedBuilder()
                    .setTitle('❌ An Error Occurred')
                    .setDescription('Something went wrong while processing your request.')
                    .setColor(0xff0000)
                    .addFields(
                        { name: 'Error Type', value: this.classifyError(error), inline: true },
                        { name: 'Timestamp', value: new Date().toISOString(), inline: true }
                    )
                    .setFooter({ text: 'Please try again or contact support if the issue persists.' });

                if (context.interaction.deferred || context.interaction.replied) {
                    await context.interaction.editReply({ embeds: [embed] });
                } else {
                    await context.interaction.reply({ embeds: [embed], ephemeral: true });
                }
                return true;
            } catch (replyError) {
                logger.error('Failed to send error response', { error: replyError.message });
                return false;
            }
        }

        return false;
    }

    async sendErrorResponse(error, context) {
        if (!context.interaction && !context.message) {
            return false;
        }

        try {
            const embed = new EmbedBuilder()
                .setTitle('⚠️ Error')
                .setDescription(error.message || 'An unexpected error occurred.')
                .setColor(0xff9900)
                .setTimestamp();

            // Add helpful information based on error type
            const errorType = this.classifyError(error);
            if (errorType === 'DiscordAPIError' && error.code) {
                embed.addFields({ 
                    name: 'Discord Error Code', 
                    value: error.code.toString(), 
                    inline: true 
                });
            }

            // Handle interaction responses (slash commands)
            if (context.interaction) {
                if (context.interaction.deferred || context.interaction.replied) {
                    await context.interaction.editReply({ embeds: [embed] });
                } else {
                    await context.interaction.reply({ embeds: [embed], ephemeral: true });
                }
            }
            // Handle message responses (regular chat)
            else if (context.message) {
                await context.message.reply({ embeds: [embed] });
            }

            return true;
        } catch (replyError) {
            logger.error('Failed to send error response', { error: replyError.message });
            return false;
        }
    }

    recordError(type, error, context = {}) {
        this.errorStats.total++;
        this.errorStats.byType[type] = (this.errorStats.byType[type] || 0) + 1;
        
        if (context.commandName) {
            this.errorStats.byCommand[context.commandName] = 
                (this.errorStats.byCommand[context.commandName] || 0) + 1;
        }

        // Add to recent errors (keep only last N)
        this.errorStats.recent.unshift({
            type,
            message: error.message,
            timestamp: new Date().toISOString(),
            context: this.sanitizeContext(context)
        });

        if (this.errorStats.recent.length > this.errorStats.maxRecentErrors) {
            this.errorStats.recent = this.errorStats.recent.slice(0, this.errorStats.maxRecentErrors);
        }
    }

    sanitizeContext(context) {
        // Remove sensitive information from context
        const sanitized = { ...context };
        delete sanitized.interaction; // Too large and contains sensitive data
        delete sanitized.bot; // Circular reference
        delete sanitized.aiRouter; // Contains API keys
        
        return sanitized;
    }

    getErrorStats() {
        return {
            ...this.errorStats,
            errorRate: this.calculateErrorRate(),
            topErrors: this.getTopErrors(),
            recentTrends: this.getRecentTrends()
        };
    }

    calculateErrorRate() {
        const recentErrors = this.errorStats.recent.filter(
            error => Date.now() - new Date(error.timestamp).getTime() < 3600000 // Last hour
        );
        
        // This would be more accurate with total request count
        return {
            lastHour: recentErrors.length,
            total: this.errorStats.total
        };
    }

    getTopErrors() {
        return Object.entries(this.errorStats.byType)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([type, count]) => ({ type, count }));
    }

    getRecentTrends() {
        const now = Date.now();
        const hourAgo = now - 3600000;
        const dayAgo = now - 86400000;

        const lastHour = this.errorStats.recent.filter(
            error => new Date(error.timestamp).getTime() > hourAgo
        ).length;

        const lastDay = this.errorStats.recent.filter(
            error => new Date(error.timestamp).getTime() > dayAgo
        ).length;

        return { lastHour, lastDay };
    }

    async attemptGracefulShutdown(reason) {
        logger.error('Attempting graceful shutdown', { reason });
        
        try {
            // Save important state
            if (this.bot.conversationManager) {
                await this.bot.conversationManager.saveAllConversations();
            }
            
            // Close database connections
            if (this.bot.databaseManager) {
                await this.bot.databaseManager.close();
            }
            
            // Stop web dashboard
            if (this.bot.webDashboard) {
                await this.bot.webDashboard.stop();
            }
            
            logger.info('Graceful shutdown completed');
            
        } catch (shutdownError) {
            logger.error('Error during graceful shutdown', { error: shutdownError.message });
        }
        
        // Exit after a short delay
        setTimeout(() => {
            process.exit(1);
        }, 5000);
    }

    // Method to manually trigger error testing (for development)
    async testErrorHandling(errorType, context = {}) {
        const testErrors = {
            DiscordAPIError: new Error('Mock Discord API Error'),
            AIServiceError: new Error('Mock AI service error'),
            RateLimitError: new Error('Rate limit exceeded'),
            DatabaseError: new Error('Database connection failed'),
            MemoryError: new RangeError('Maximum call stack size exceeded')
        };
        
        testErrors.DiscordAPIError.name = 'DiscordAPIError';
        testErrors.DiscordAPIError.code = 50013;
        
        const error = testErrors[errorType];
        if (!error) {
            throw new Error(`Unknown error type: ${errorType}`);
        }
        
        return await this.handleError(error, context);
    }
}

module.exports = ErrorHandler;