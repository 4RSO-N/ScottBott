const logger = require('./logger');

class PresetManager {
    constructor(databaseManager) {
        this.databaseManager = databaseManager;
        this.presets = new Map(); // Cache for faster access
    }

    /**
     * Initialize preset tables
     */
    async initialize() {
        try {
            await this.databaseManager.runQuery(`
                CREATE TABLE IF NOT EXISTS user_presets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    style TEXT NOT NULL,
                    aspect_ratio TEXT NOT NULL,
                    quality TEXT NOT NULL,
                    additional_params TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, name)
                )
            `);

            logger.info('✅ Preset manager initialized');
        } catch (error) {
            logger.error('Failed to initialize preset manager:', error);
            throw error;
        }
    }

    /**
     * Save a preset for a user
     * @param {string} userId - Discord user ID
     * @param {string} name - Preset name
     * @param {Object} settings - Preset settings
     */
    async savePreset(userId, name, settings) {
        try {
            const { style, aspectRatio, quality, additionalParams = [] } = settings;

            await this.databaseManager.runQuery(`
                INSERT OR REPLACE INTO user_presets
                (user_id, name, style, aspect_ratio, quality, additional_params, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [
                userId,
                name,
                style,
                aspectRatio,
                quality,
                JSON.stringify(additionalParams)
            ]);

            // Update cache
            const cacheKey = `${userId}:${name}`;
            this.presets.set(cacheKey, {
                ...settings,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            logger.info(`Saved preset '${name}' for user ${userId}`);
            return true;

        } catch (error) {
            logger.error('Error saving preset:', error);
            return false;
        }
    }

    /**
     * Load a preset for a user
     * @param {string} userId - Discord user ID
     * @param {string} name - Preset name
     */
    async loadPreset(userId, name) {
        try {
            // Check cache first
            const cacheKey = `${userId}:${name}`;
            if (this.presets.has(cacheKey)) {
                return this.presets.get(cacheKey);
            }

            const row = await this.databaseManager.getQuery(`
                SELECT * FROM user_presets
                WHERE user_id = ? AND name = ?
            `, [userId, name]);

            if (!row) {
                return null;
            }

            const preset = {
                style: row.style,
                aspectRatio: row.aspect_ratio,
                quality: row.quality,
                additionalParams: JSON.parse(row.additional_params || '[]'),
                created_at: row.created_at,
                updated_at: row.updated_at
            };

            // Cache the result
            this.presets.set(cacheKey, preset);

            return preset;

        } catch (error) {
            logger.error('Error loading preset:', error);
            return null;
        }
    }

    /**
     * List all presets for a user
     * @param {string} userId - Discord user ID
     */
    async listPresets(userId) {
        try {
            const rows = await this.databaseManager.getAllQuery(`
                SELECT name, style, aspect_ratio, quality, created_at, updated_at
                FROM user_presets
                WHERE user_id = ?
                ORDER BY updated_at DESC
            `, [userId]);

            return rows.map(row => ({
                name: row.name,
                style: row.style,
                aspectRatio: row.aspect_ratio,
                quality: row.quality,
                created_at: row.created_at,
                updated_at: row.updated_at
            }));

        } catch (error) {
            logger.error('Error listing presets:', error);
            return [];
        }
    }

    /**
     * Delete a preset
     * @param {string} userId - Discord user ID
     * @param {string} name - Preset name
     */
    async deletePreset(userId, name) {
        try {
            const result = await this.databaseManager.runQuery(`
                DELETE FROM user_presets
                WHERE user_id = ? AND name = ?
            `, [userId, name]);

            if (result.changes > 0) {
                // Remove from cache
                const cacheKey = `${userId}:${name}`;
                this.presets.delete(cacheKey);

                logger.info(`Deleted preset '${name}' for user ${userId}`);
                return true;
            }

            return false;

        } catch (error) {
            logger.error('Error deleting preset:', error);
            return false;
        }
    }

    /**
     * Get preset suggestions based on current settings
     * @param {Object} currentSettings - Current parsed prompt settings
     */
    getPresetSuggestions(currentSettings) {
        const suggestions = [];

        // Common preset combinations
        const commonPresets = [
            {
                name: 'cinematic',
                style: 'cinematic',
                aspectRatio: '21:9',
                quality: 'high res',
                additionalParams: ['dramatic lighting', 'moody atmosphere']
            },
            {
                name: 'product-shot',
                style: 'realistic',
                aspectRatio: '1:1',
                quality: 'ultra high res',
                additionalParams: ['bright lighting', 'clean background']
            },
            {
                name: 'portrait',
                style: 'artistic',
                aspectRatio: '3:4',
                quality: 'high res',
                additionalParams: ['dramatic lighting', 'professional']
            },
            {
                name: 'anime-style',
                style: 'anime',
                aspectRatio: '16:9',
                quality: 'high res',
                additionalParams: ['vibrant colors', 'dynamic composition']
            }
        ];

        // Find presets that match current settings
        for (const preset of commonPresets) {
            let matchScore = 0;

            if (preset.style === currentSettings.style) matchScore += 0.4;
            if (preset.aspectRatio === currentSettings.aspectRatio) matchScore += 0.3;
            if (preset.quality === currentSettings.quality) matchScore += 0.3;

            if (matchScore >= 0.5) {
                suggestions.push({
                    ...preset,
                    matchScore: matchScore
                });
            }
        }

        // Sort by match score
        return suggestions.sort((a, b) => b.matchScore - a.matchScore);
    }

    /**
     * Create a preset from current settings
     * @param {Object} settings - Current settings
     * @param {string} customName - Custom name (optional)
     */
    createPresetFromSettings(settings, customName = null) {
        const { style, aspectRatio, quality, additionalParams = [] } = settings;

        // Generate a name if not provided
        let name = customName;
        if (!name) {
            name = `${style}-${aspectRatio.replace(':', 'x')}`;
            if (additionalParams.length > 0) {
                name += `-${additionalParams[0].replaceAll(/\s+/g, '-').toLowerCase()}`;
            }
        }

        return {
            name: name.toLowerCase().replaceAll(/[^a-z0-9-]/g, ''),
            style,
            aspectRatio,
            quality,
            additionalParams
        };
    }

    /**
     * Clear cache for a user (useful after bulk operations)
     * @param {string} userId - Discord user ID
     */
    clearUserCache(userId) {
        for (const [key] of this.presets) {
            if (key.startsWith(`${userId}:`)) {
                this.presets.delete(key);
            }
        }
    }

    /**
     * Get usage statistics
     */
    async getStats() {
        try {
            const result = await this.databaseManager.get(`
                SELECT
                    COUNT(*) as total_presets,
                    COUNT(DISTINCT user_id) as unique_users,
                    AVG(julianday(updated_at) - julianday(created_at)) as avg_lifespan_days
                FROM user_presets
            `);

            return {
                totalPresets: result.total_presets || 0,
                uniqueUsers: result.unique_users || 0,
                averageLifespanDays: result.avg_lifespan_days || 0
            };

        } catch (error) {
            logger.error('Error getting preset stats:', error);
            return {
                totalPresets: 0,
                uniqueUsers: 0,
                averageLifespanDays: 0
            };
        }
    }
}

module.exports = PresetManager;
