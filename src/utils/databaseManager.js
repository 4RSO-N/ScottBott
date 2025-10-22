const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');
const logger = require('./logger');

class DatabaseManager {
    constructor() {
        this.dbPath = path.join(process.cwd(), 'data', 'scottbot.db');
        this.db = null;
        // Don't call init in constructor - will be called externally
    }

    /**
     * Initialize database connection and create tables
     */
    async init() {
        try {
            // Create data directory if it doesn't exist
            const fs = require('node:fs');
            const dataDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            // Connect to database
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    logger.error('Error opening database:', err);
                    throw err;
                }
                logger.info('✅ Database connected successfully');
            });

            // Create tables
            await this.createTables();
            
        } catch (error) {
            logger.error('Database initialization failed:', error);
            throw error;
        }
    }

    /**
     * Create database tables
     */
    async createTables() {
        const tables = [
            // User preferences and settings
            `CREATE TABLE IF NOT EXISTS user_preferences (
                user_id TEXT PRIMARY KEY,
                username TEXT,
                preferred_ai_service TEXT DEFAULT 'perplexity',
                language TEXT DEFAULT 'en',
                conversation_style TEXT DEFAULT 'friendly',
                image_analysis_focus TEXT DEFAULT 'general',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Conversation history for persistent memory
            `CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                channel_id TEXT,
                message_content TEXT,
                is_bot_message BOOLEAN,
                ai_service TEXT,
                response_time INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Usage statistics
            `CREATE TABLE IF NOT EXISTS usage_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                command_type TEXT,
                ai_service TEXT,
                success BOOLEAN,
                response_time INTEGER,
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Server settings
            `CREATE TABLE IF NOT EXISTS server_settings (
                guild_id TEXT PRIMARY KEY,
                prefix TEXT DEFAULT '!',
                default_ai_service TEXT DEFAULT 'perplexity',
                max_conversation_length INTEGER DEFAULT 10,
                allow_image_analysis BOOLEAN DEFAULT 1,
                admin_only_commands TEXT DEFAULT '[]',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // API usage tracking
            `CREATE TABLE IF NOT EXISTS api_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                service_name TEXT,
                endpoint TEXT,
                tokens_used INTEGER,
                cost_estimate REAL,
                success BOOLEAN,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        for (const tableSQL of tables) {
            await this.runQuery(tableSQL);
        }

        logger.info('✅ Database tables created/verified');
    }

    /**
     * Run a database query with promise wrapper
     */
    runQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    logger.error('Database query error:', err);
                    reject(err);
                } else {
                    resolve({ lastID: this.lastID, changes: this.changes });
                }
            });
        });
    }

    /**
     * Get data from database
     */
    getQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    logger.error('Database get error:', err);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    /**
     * Get multiple rows from database
     */
    getAllQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    logger.error('Database getAll error:', err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * Save user preferences
     */
    async saveUserPreferences(userId, username, preferences) {
        const sql = `INSERT OR REPLACE INTO user_preferences 
            (user_id, username, preferred_ai_service, language, conversation_style, image_analysis_focus, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;
        
        const params = [
            userId,
            username,
            preferences.preferredAI || 'perplexity',
            preferences.language || 'en',
            preferences.conversationStyle || 'friendly',
            preferences.imageAnalysisFocus || 'general'
        ];

        await this.runQuery(sql, params);
        logger.info(`Saved preferences for user ${userId}`);
    }

    /**
     * Get user preferences
     */
    async getUserPreferences(userId) {
        const sql = 'SELECT * FROM user_preferences WHERE user_id = ?';
        const result = await this.getQuery(sql, [userId]);
        
        return result || {
            user_id: userId,
            preferred_ai_service: 'perplexity',
            language: 'en',
            conversation_style: 'friendly',
            image_analysis_focus: 'general'
        };
    }

    /**
     * Save conversation message
     */
    async saveConversation(userId, channelId, messageContent, isBotMessage, aiService = null, responseTime = null) {
        const sql = `INSERT INTO conversations 
            (user_id, channel_id, message_content, is_bot_message, ai_service, response_time)
            VALUES (?, ?, ?, ?, ?, ?)`;
        
        const params = [userId, channelId, messageContent, isBotMessage, aiService, responseTime];
        await this.runQuery(sql, params);
    }

    /**
     * Get conversation history
     */
    async getConversationHistory(userId, channelId, limit = 10) {
        const sql = `SELECT * FROM conversations 
            WHERE user_id = ? AND channel_id = ? 
            ORDER BY created_at DESC 
            LIMIT ?`;
        
        const results = await this.getAllQuery(sql, [userId, channelId, limit]);
        return results.reverse(); // Return in chronological order
    }

    /**
     * Save usage statistics
     */
    async saveUsageStats(userId, commandType, aiService, success, responseTime, errorMessage = null) {
        const sql = `INSERT INTO usage_stats 
            (user_id, command_type, ai_service, success, response_time, error_message)
            VALUES (?, ?, ?, ?, ?, ?)`;
        
        const params = [userId, commandType, aiService, success, responseTime, errorMessage];
        await this.runQuery(sql, params);
    }

    /**
     * Get usage statistics
     */
    async getUsageStats(timeframe = '24 HOURS') {
        const sql = `SELECT 
            command_type,
            ai_service,
            COUNT(*) as total_requests,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_requests,
            AVG(response_time) as avg_response_time
            FROM usage_stats 
            WHERE created_at >= datetime('now', '-${timeframe}')
            GROUP BY command_type, ai_service`;
        
        return await this.getAllQuery(sql);
    }

    /**
     * Save server settings
     */
    async saveServerSettings(guildId, settings) {
        const sql = `INSERT OR REPLACE INTO server_settings 
            (guild_id, prefix, default_ai_service, max_conversation_length, allow_image_analysis, admin_only_commands, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;
        
        const params = [
            guildId,
            settings.prefix || '!',
            settings.defaultAI || 'perplexity',
            settings.maxConversationLength || 10,
            settings.allowImageAnalysis === false ? 0 : 1,
            JSON.stringify(settings.adminOnlyCommands || [])
        ];

        await this.runQuery(sql, params);
        logger.info(`Saved settings for guild ${guildId}`);
    }

    /**
     * Get server settings
     */
    async getServerSettings(guildId) {
        const sql = 'SELECT * FROM server_settings WHERE guild_id = ?';
        const result = await this.getQuery(sql, [guildId]);
        
        if (result) {
            result.admin_only_commands = JSON.parse(result.admin_only_commands || '[]');
            result.allow_image_analysis = Boolean(result.allow_image_analysis);
        }
        
        return result || {
            guild_id: guildId,
            prefix: '!',
            default_ai_service: 'perplexity',
            max_conversation_length: 10,
            allow_image_analysis: true,
            admin_only_commands: []
        };
    }

    /**
     * Clean old data to prevent database bloat
     */
    async cleanOldData() {
        const queries = [
            // Keep only last 1000 conversation messages per user
            `DELETE FROM conversations WHERE id NOT IN (
                SELECT id FROM conversations c1 
                WHERE (
                    SELECT COUNT(*) FROM conversations c2 
                    WHERE c2.user_id = c1.user_id AND c2.created_at >= c1.created_at
                ) <= 1000
            )`,
            
            // Keep only last 30 days of usage stats
            `DELETE FROM usage_stats WHERE created_at < datetime('now', '-30 days')`,
            
            // Keep only last 90 days of API usage
            `DELETE FROM api_usage WHERE created_at < datetime('now', '-90 days')`
        ];

        for (const sql of queries) {
            try {
                const result = await this.runQuery(sql);
                logger.info(`Cleaned database: ${result.changes} rows affected`);
            } catch (error) {
                logger.error('Error cleaning database:', error);
            }
        }
    }

    /**
     * Get database statistics
     */
    async getDatabaseStats() {
        const stats = {};
        
        const tables = ['user_preferences', 'conversations', 'usage_stats', 'server_settings', 'api_usage'];
        
        for (const table of tables) {
            try {
                const result = await this.getQuery(`SELECT COUNT(*) as count FROM ${table}`);
                stats[table] = result.count;
            } catch (error) {
                logger.warn(`Failed to get count for table ${table}:`, error.message);
                stats[table] = 0;
            }
        }

        // Get database file size
        try {
            const fs = require('node:fs');
            const dbStats = fs.statSync(this.dbPath);
            stats.database_size_mb = Math.round(dbStats.size / 1024 / 1024 * 100) / 100;
        } catch (error) {
            logger.warn('Failed to get database size:', error.message);
            stats.database_size_mb = 0;
        }

        return stats;
    }

    /**
     * Close database connection
     */
    async close() {
        return new Promise((resolve) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        logger.error('Error closing database:', err);
                    } else {
                        logger.info('Database connection closed');
                    }
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = DatabaseManager;