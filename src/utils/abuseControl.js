const logger = require('./logger');

class AbuseControl {
    constructor() {
        // Rate limiting configuration
        this.rateLimits = {
            user: {
                imageJobs: { max: 10, window: 60 * 1000 }, // 10 images per minute
                chatMessages: { max: 30, window: 60 * 1000 }, // 30 messages per minute
                apiCalls: { max: 100, window: 60 * 1000 } // 100 API calls per minute
            },
            guild: {
                imageJobs: { max: 50, window: 60 * 1000 }, // 50 images per minute per guild
                totalUsers: { max: 1000 } // Max users per guild
            }
        };

        // Quota configuration
        this.quotas = {
            user: {
                daily: {
                    imageJobs: 100,
                    apiCalls: 1000
                },
                monthly: {
                    imageJobs: 2000,
                    apiCalls: 20000
                }
            },
            guild: {
                daily: {
                    imageJobs: 500,
                    apiCalls: 5000
                }
            }
        };

        // Tracking data
        this.userActivity = new Map();
        this.guildActivity = new Map();
        this.anomalyAlerts = [];

        // Anomaly detection thresholds
        this.anomalyThresholds = {
            suddenSpike: 5, // 5x normal activity
            repeated4xx: 10, // 10 4xx errors in a row
            highErrorRate: 0.5, // 50% error rate
            unusualHour: true // Flag activity outside normal hours
        };

        // Clean up old data every 5 minutes
        setInterval(() => this.cleanupOldData(), 5 * 60 * 1000);

        logger.info('✅ Abuse control system initialized');
    }

    /**
     * Check if a user action is allowed by rate limits
     * @param {string} userId - Discord user ID
     * @param {string} action - Action type ('imageJobs', 'chatMessages', 'apiCalls')
     * @param {string} guildId - Discord guild ID (optional)
     * @returns {Object} Rate limit check result
     */
    checkRateLimit(userId, action, guildId = null) {
        const now = Date.now();

        // Initialize user tracking if needed
        if (!this.userActivity.has(userId)) {
            this.userActivity.set(userId, {
                imageJobs: [],
                chatMessages: [],
                apiCalls: [],
                lastActivity: now
            });
        }

        const userData = this.userActivity.get(userId);
        const actionData = userData[action];

        if (!actionData) {
            return { allowed: false, reason: 'Unknown action type' };
        }

        // Remove old entries outside the time window
        const limit = this.rateLimits.user[action];
        const windowStart = now - limit.window;
        const recentActions = actionData.filter(timestamp => timestamp > windowStart);

        // Check if under limit
        if (recentActions.length >= limit.max) {
            const resetTime = recentActions[0] + limit.window;
            const waitTime = Math.ceil((resetTime - now) / 1000);

            return {
                allowed: false,
                reason: 'Rate limit exceeded',
                resetIn: waitTime,
                limit: limit.max,
                window: limit.window / 1000
            };
        }

        // Check guild limits if provided
        if (guildId && action === 'imageJobs') {
            const guildCheck = this.checkGuildRateLimit(guildId, action);
            if (!guildCheck.allowed) {
                return guildCheck;
            }
        }

        return { allowed: true };
    }

    /**
     * Check guild rate limits
     */
    checkGuildRateLimit(guildId, action) {
        const now = Date.now();

        if (!this.guildActivity.has(guildId)) {
            this.guildActivity.set(guildId, {
                imageJobs: [],
                userCount: 0
            });
        }

        const guildData = this.guildActivity.get(guildId);
        const actionData = guildData[action];

        const limit = this.rateLimits.guild[action];
        const windowStart = now - limit.window;
        const recentActions = actionData.filter(timestamp => timestamp > windowStart);

        if (recentActions.length >= limit.max) {
            const resetTime = recentActions[0] + limit.window;
            const waitTime = Math.ceil((resetTime - now) / 1000);

            return {
                allowed: false,
                reason: 'Guild rate limit exceeded',
                resetIn: waitTime,
                limit: limit.max,
                window: limit.window / 1000
            };
        }

        return { allowed: true };
    }

    /**
     * Record a user action
     * @param {string} userId - Discord user ID
     * @param {string} action - Action type
     * @param {string} guildId - Discord guild ID (optional)
     */
    recordAction(userId, action, guildId = null) {
        const now = Date.now();

        // Record user action
        if (!this.userActivity.has(userId)) {
            this.userActivity.set(userId, {
                imageJobs: [],
                chatMessages: [],
                apiCalls: [],
                lastActivity: now
            });
        }

        const userData = this.userActivity.get(userId);
        userData[action].push(now);
        userData.lastActivity = now;

        // Keep only recent actions (last 24 hours)
        const dayAgo = now - (24 * 60 * 60 * 1000);
        userData[action] = userData[action].filter(timestamp => timestamp > dayAgo);

        // Record guild action
        if (guildId && action === 'imageJobs') {
            if (!this.guildActivity.has(guildId)) {
                this.guildActivity.set(guildId, {
                    imageJobs: [],
                    userCount: 0
                });
            }

            const guildData = this.guildActivity.get(guildId);
            guildData[action].push(now);
            guildData[action] = guildData[action].filter(timestamp => timestamp > dayAgo);
        }

        // Check for anomalies
        this.detectAnomalies(userId, action, guildId);
    }

    /**
     * Check user quota
     * @param {string} userId - Discord user ID
     * @param {string} action - Action type
     * @param {string} period - 'daily' or 'monthly'
     * @returns {Object} Quota check result
     */
    checkQuota(userId, action, period = 'daily') {
        const userData = this.userActivity.get(userId);
        if (!userData) {
            return { allowed: true, remaining: this.quotas.user[period][action] };
        }

        const now = Date.now();
        let periodStart;
        if (period === 'daily') {
            periodStart = new Date(now).setHours(0, 0, 0, 0);
        } else {
            const currentDate = new Date(now);
            periodStart = currentDate.getMonth() === 0
                ? new Date(currentDate.getFullYear() - 1, 11, 1).getTime()
                : new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getTime();
        }

        const periodActions = userData[action].filter(timestamp => timestamp >= periodStart);
        const quota = this.quotas.user[period][action];
        const remaining = Math.max(0, quota - periodActions.length);

        return {
            allowed: periodActions.length < quota,
            used: periodActions.length,
            remaining: remaining,
            quota: quota,
            period: period
        };
    }

    /**
     * Detect anomalous behavior
     */
    detectAnomalies(userId, action, guildId) {
        const userData = this.userActivity.get(userId);
        const now = Date.now();

        // Check for sudden activity spikes
        const hourAgo = now - (60 * 60 * 1000);
        const recentActions = userData[action].filter(timestamp => timestamp > hourAgo);
        const olderActions = userData[action].filter(timestamp =>
            timestamp > hourAgo - (60 * 60 * 1000) && timestamp <= hourAgo
        );

        if (olderActions.length > 0 && recentActions.length > olderActions.length * this.anomalyThresholds.suddenSpike) {
            this.createAnomalyAlert('sudden_spike', {
                userId,
                action,
                recentCount: recentActions.length,
                olderCount: olderActions.length,
                ratio: recentActions.length / olderActions.length
            });
        }

        // Check for unusual hours (if enabled)
        if (this.anomalyThresholds.unusualHour) {
            const hour = new Date(now).getHours();
            if (hour < 6 || hour > 22) { // Outside 6 AM - 10 PM
                const dayActions = userData[action].filter(timestamp =>
                    timestamp > now - (24 * 60 * 60 * 1000)
                );

                if (dayActions.length > 10) { // Only flag if significant activity
                    this.createAnomalyAlert('unusual_hours', {
                        userId,
                        action,
                        hour,
                        dailyCount: dayActions.length
                    });
                }
            }
        }
    }

    /**
     * Record API errors for anomaly detection
     */
    recordApiError(userId, statusCode, endpoint) {
        const userData = this.userActivity.get(userId);
        if (!userData) return;

        if (!userData.errors) {
            userData.errors = [];
        }

        userData.errors.push({
            statusCode,
            endpoint,
            timestamp: Date.now()
        });

        // Keep only recent errors (last hour)
        const hourAgo = Date.now() - (60 * 60 * 1000);
        userData.errors = userData.errors.filter(error => error.timestamp > hourAgo);

        // Check for repeated 4xx errors
        const recent4xx = userData.errors.filter(error =>
            error.statusCode >= 400 && error.statusCode < 500
        );

        if (recent4xx.length >= this.anomalyThresholds.repeated4xx) {
            this.createAnomalyAlert('repeated_4xx', {
                userId,
                errorCount: recent4xx.length,
                recentErrors: recent4xx.slice(-5)
            });
        }

        // Check for high error rate
        const totalRequests = userData.apiCalls.length;
        const errorRate = userData.errors.length / totalRequests;

        if (errorRate > this.anomalyThresholds.highErrorRate && totalRequests > 10) {
            this.createAnomalyAlert('high_error_rate', {
                userId,
                errorRate,
                totalRequests,
                errorCount: userData.errors.length
            });
        }
    }

    /**
     * Create an anomaly alert
     */
    createAnomalyAlert(type, data) {
        const alert = {
            id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
            type,
            data,
            timestamp: Date.now(),
            resolved: false
        };

        this.anomalyAlerts.push(alert);

        // Keep only recent alerts (last 24 hours)
        const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
        this.anomalyAlerts = this.anomalyAlerts.filter(alert => alert.timestamp > dayAgo);

        logger.warn(`🚨 Anomaly detected: ${type}`, { alertId: alert.id, data });

        // In production, this would trigger notifications to admins
    }

    /**
     * Clean up old tracking data
     */
    cleanupOldData() {
        const dayAgo = Date.now() - (24 * 60 * 60 * 1000);

        // Clean user data
        for (const [userId, userData] of this.userActivity) {
            for (const action in userData) {
                if (Array.isArray(userData[action])) {
                    userData[action] = userData[action].filter(timestamp => timestamp > dayAgo);
                }
            }

            // Remove users with no recent activity
            if (userData.lastActivity < dayAgo) {
                this.userActivity.delete(userId);
            }
        }

        // Clean guild data
        for (const [, guildData] of this.guildActivity) {
            for (const action in guildData) {
                if (Array.isArray(guildData[action])) {
                    guildData[action] = guildData[action].filter(timestamp => timestamp > dayAgo);
                }
            }
        }

        logger.debug(`Cleaned up old tracking data. Active users: ${this.userActivity.size}, Active guilds: ${this.guildActivity.size}`);
    }

    /**
     * Get abuse control statistics
     */
    getAbuseStats() {
        const now = Date.now();
        const hourAgo = now - (60 * 60 * 1000);

        let totalUsers = 0;
        let activeUsers = 0;
        let totalActions = 0;

        for (const [, userData] of this.userActivity) {
            totalUsers++;
            if (userData.lastActivity > hourAgo) {
                activeUsers++;
            }

            for (const action in userData) {
                if (Array.isArray(userData[action])) {
                    totalActions += userData[action].length;
                }
            }
        }

        return {
            totalUsers,
            activeUsers,
            totalGuilds: this.guildActivity.size,
            totalActions,
            anomalyAlerts: this.anomalyAlerts.length,
            rateLimits: this.rateLimits,
            quotas: this.quotas
        };
    }

    /**
     * Update rate limits (admin function)
     */
    updateRateLimits(newLimits) {
        Object.assign(this.rateLimits, newLimits);
        logger.info('Updated rate limits');
    }

    /**
     * Update quotas (admin function)
     */
    updateQuotas(newQuotas) {
        Object.assign(this.quotas, newQuotas);
        logger.info('Updated quotas');
    }

    /**
     * Get user activity summary
     */
    getUserActivity(userId) {
        const userData = this.userActivity.get(userId);
        if (!userData) {
            return null;
        }

        const now = Date.now();
        const hourAgo = now - (60 * 60 * 1000);
        const dayAgo = now - (24 * 60 * 60 * 1000);

        return {
            userId,
            lastActivity: userData.lastActivity,
            hourlyActivity: {
                imageJobs: userData.imageJobs.filter(t => t > hourAgo).length,
                chatMessages: userData.chatMessages.filter(t => t > hourAgo).length,
                apiCalls: userData.apiCalls.filter(t => t > hourAgo).length
            },
            dailyActivity: {
                imageJobs: userData.imageJobs.filter(t => t > dayAgo).length,
                chatMessages: userData.chatMessages.filter(t => t > dayAgo).length,
                apiCalls: userData.apiCalls.filter(t => t > dayAgo).length
            },
            quotas: {
                daily: this.checkQuota(userId, 'imageJobs', 'daily'),
                monthly: this.checkQuota(userId, 'imageJobs', 'monthly')
            }
        };
    }
}

module.exports = new AbuseControl();
