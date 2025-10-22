const express = require('express');
const path = require('node:path');
const logger = require('./logger');

class WebDashboard {
    constructor(bot) {
        this.bot = bot;
        this.app = express();
        this.port = process.env.DASHBOARD_PORT || 3000;
        this.setupMiddleware();
        this.setupRoutes();
    }

    /**
     * Setup Express middleware
     */
    setupMiddleware() {
        // Basic security
        this.app.use((req, res, next) => {
            res.header('X-Content-Type-Options', 'nosniff');
            res.header('X-Frame-Options', 'DENY');
            res.header('X-XSS-Protection', '1; mode=block');
            next();
        });

        // JSON parsing
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Static files
        this.app.use(express.static(path.join(__dirname, '../public')));

        // Request logging
        this.app.use((req, res, next) => {
            logger.info(`Dashboard: ${req.method} ${req.path}`);
            next();
        });
    }

    /**
     * Setup API routes
     */
    setupRoutes() {
        // Dashboard home
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../public', 'dashboard.html'));
        });

        // Bot status API
        this.app.get('/api/status', (req, res) => {
            const status = {
                bot: {
                    online: this.bot.client.isReady(),
                    username: this.bot.client.user?.username || 'Unknown',
                    guilds: this.bot.client.guilds.cache.size,
                    users: this.bot.client.users.cache.size,
                    uptime: process.uptime()
                },
                performance: this.bot.performanceMonitor.getStats(),
                services: this.bot.performanceMonitor.getServiceStats(),
                memory: process.memoryUsage(),
                timestamp: new Date().toISOString()
            };

            res.json(status);
        });

        // Performance metrics API
        this.app.get('/api/performance', (req, res) => {
            const report = this.bot.performanceMonitor.generateReport();
            res.json(report);
        });

        // Conversation statistics
        this.app.get('/api/conversations', (req, res) => {
            const stats = this.bot.conversationManager.getStats();
            res.json(stats);
        });

        // AI service health check
        this.app.get('/api/services/health', async (req, res) => {
            try {
                await this.bot.aiRouter.healthCheckServices();
                const serviceStats = this.bot.aiRouter.getServiceStats();
                res.json({
                    status: 'healthy',
                    services: serviceStats,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                res.status(500).json({
                    status: 'error',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Error analysis
        this.app.get('/api/errors', (req, res) => {
            const errorAnalysis = this.bot.performanceMonitor.getErrorAnalysis();
            res.json(errorAnalysis);
        });

        // Database statistics (if database is available)
        this.app.get('/api/database', async (req, res) => {
            try {
                if (this.bot.databaseManager) {
                    const dbStats = await this.bot.databaseManager.getDatabaseStats();
                    res.json(dbStats);
                } else {
                    res.json({ status: 'disabled', message: 'Database not initialized' });
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Control endpoints
        this.app.post('/api/commands/deploy', async (req, res) => {
            try {
                const { guildId } = req.body;
                const success = await this.bot.slashCommandManager.deployCommands(
                    this.bot.client.user.id,
                    guildId
                );
                
                res.json({ 
                    success,
                    message: success ? 'Commands deployed successfully' : 'Failed to deploy commands'
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Clear conversation for a user
        this.app.post('/api/conversations/clear', (req, res) => {
            try {
                const { userId, channelId } = req.body;
                this.bot.conversationManager.clearConversation(userId, channelId);
                res.json({ success: true, message: 'Conversation cleared' });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // System control
        this.app.post('/api/system/restart', (req, res) => {
            res.json({ message: 'Restart initiated' });
            setTimeout(() => {
                process.exit(0);
            }, 1000);
        });

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });
        });

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({ error: 'Endpoint not found' });
        });

        // Error handler
        this.app.use((err, req, res, next) => {
            logger.error('Dashboard error:', err);
            res.status(500).json({ error: 'Internal server error' });
        });
    }

    /**
     * Start the web server
     */
    start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, () => {
                    logger.info(`🌐 Web dashboard started on http://localhost:${this.port}`);
                    resolve();
                });

                this.server.on('error', (error) => {
                    if (error.code === 'EADDRINUSE') {
                        logger.warn(`Port ${this.port} is in use, trying next port...`);
                        this.port++;
                        this.start().then(resolve).catch(reject);
                    } else {
                        reject(new Error(error.message || 'Unknown server error'));
                    }
                });
            } catch (error) {
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }

    /**
     * Stop the web server
     */
    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    logger.info('Web dashboard stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    /**
     * Get dashboard URL
     */
    getUrl() {
        return `http://localhost:${this.port}`;
    }
}

module.exports = WebDashboard;