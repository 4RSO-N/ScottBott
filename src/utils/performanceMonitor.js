const logger = require('./logger');

class PerformanceMonitor {
    constructor() {
        this.metrics = {
            requests: {
                total: 0,
                successful: 0,
                failed: 0,
                byService: new Map()
            },
            responseTime: {
                total: 0,
                count: 0,
                min: Infinity,
                max: 0,
                recent: []
            },
            errors: {
                total: 0,
                byType: new Map(),
                recent: []
            },
            users: {
                unique: new Set(),
                active: new Map() // userId -> last activity timestamp
            },
            memory: {
                measurements: [],
                maxMeasurements: 100
            }
        };

        // Start periodic monitoring
        this.startPeriodicMonitoring();
    }

    /**
     * Start periodic system monitoring
     */
    startPeriodicMonitoring() {
        // Memory monitoring every 30 seconds
        setInterval(() => {
            this.recordMemoryUsage();
        }, 30000);

        // Clean old data every 5 minutes
        setInterval(() => {
            this.cleanOldData();
        }, 5 * 60 * 1000);

        // Log performance summary every hour
        setInterval(() => {
            this.logPerformanceSummary();
        }, 60 * 60 * 1000);
    }

    /**
     * Record the start of a request
     */
    startRequest(requestId, service, type) {
        return {
            requestId,
            service,
            type,
            startTime: Date.now(),
            startMemory: process.memoryUsage().heapUsed
        };
    }

    /**
     * Record the completion of a request
     */
    endRequest(requestData, success = true, error = null) {
        const endTime = Date.now();
        const responseTime = endTime - requestData.startTime;
        const endMemory = process.memoryUsage().heapUsed;

        // Update request metrics
        this.metrics.requests.total++;
        if (success) {
            this.metrics.requests.successful++;
        } else {
            this.metrics.requests.failed++;
            this.recordError(error, requestData);
        }

        // Update service metrics
        const serviceMetrics = this.metrics.requests.byService.get(requestData.service) || {
            total: 0,
            successful: 0,
            failed: 0,
            totalResponseTime: 0
        };

        serviceMetrics.total++;
        serviceMetrics.totalResponseTime += responseTime;
        if (success) {
            serviceMetrics.successful++;
        } else {
            serviceMetrics.failed++;
        }

        this.metrics.requests.byService.set(requestData.service, serviceMetrics);

        // Update response time metrics
        this.updateResponseTimeMetrics(responseTime);

        // Log performance data
        logger.debug(`Request completed: ${requestData.service} - ${responseTime}ms - ${success ? 'SUCCESS' : 'FAILED'}`);

        return {
            responseTime,
            memoryDelta: endMemory - requestData.startMemory,
            success
        };
    }

    /**
     * Update response time metrics
     */
    updateResponseTimeMetrics(responseTime) {
        this.metrics.responseTime.total += responseTime;
        this.metrics.responseTime.count++;
        this.metrics.responseTime.min = Math.min(this.metrics.responseTime.min, responseTime);
        this.metrics.responseTime.max = Math.max(this.metrics.responseTime.max, responseTime);

        // Keep last 100 response times for calculating recent averages
        this.metrics.responseTime.recent.push({
            time: responseTime,
            timestamp: Date.now()
        });

        if (this.metrics.responseTime.recent.length > 100) {
            this.metrics.responseTime.recent.shift();
        }
    }

    /**
     * Record an error
     */
    recordError(error, requestData = null) {
        this.metrics.errors.total++;

        const errorType = error?.name || 'Unknown';
        const errorCount = this.metrics.errors.byType.get(errorType) || 0;
        this.metrics.errors.byType.set(errorType, errorCount + 1);

        // Keep recent errors for analysis
        this.metrics.errors.recent.push({
            type: errorType,
            message: error?.message || 'No message',
            timestamp: Date.now(),
            service: requestData?.service || 'unknown',
            requestType: requestData?.type || 'unknown'
        });

        // Keep only last 50 errors
        if (this.metrics.errors.recent.length > 50) {
            this.metrics.errors.recent.shift();
        }

        logger.warn(`Error recorded: ${errorType} - ${error?.message}`);
    }

    /**
     * Record user activity
     */
    recordUserActivity(userId) {
        this.metrics.users.unique.add(userId);
        this.metrics.users.active.set(userId, Date.now());
    }

    /**
     * Record memory usage
     */
    recordMemoryUsage() {
        const memUsage = process.memoryUsage();
        const measurement = {
            timestamp: Date.now(),
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external,
            rss: memUsage.rss
        };

        this.metrics.memory.measurements.push(measurement);

        // Keep only recent measurements
        if (this.metrics.memory.measurements.length > this.metrics.memory.maxMeasurements) {
            this.metrics.memory.measurements.shift();
        }
    }

    /**
     * Get current performance statistics
     */
    getStats() {
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000);
        const activeUsers = Array.from(this.metrics.users.active.entries())
            .filter(([userId, lastActivity]) => lastActivity > oneHourAgo)
            .length;

        const avgResponseTime = this.metrics.responseTime.count > 0 
            ? Math.round(this.metrics.responseTime.total / this.metrics.responseTime.count)
            : 0;

        const recentAvgResponseTime = this.metrics.responseTime.recent.length > 0
            ? Math.round(this.metrics.responseTime.recent.reduce((sum, r) => sum + r.time, 0) / this.metrics.responseTime.recent.length)
            : 0;

        const successRate = this.metrics.requests.total > 0
            ? Math.round((this.metrics.requests.successful / this.metrics.requests.total) * 100)
            : 0;

        const currentMemory = process.memoryUsage();

        return {
            requests: {
                total: this.metrics.requests.total,
                successful: this.metrics.requests.successful,
                failed: this.metrics.requests.failed,
                successRate: `${successRate}%`
            },
            responseTime: {
                average: `${avgResponseTime}ms`,
                recentAverage: `${recentAvgResponseTime}ms`,
                min: this.metrics.responseTime.min === Infinity ? 0 : this.metrics.responseTime.min,
                max: this.metrics.responseTime.max
            },
            users: {
                totalUnique: this.metrics.users.unique.size,
                activeLastHour: activeUsers
            },
            memory: {
                current: Math.round(currentMemory.heapUsed / 1024 / 1024),
                total: Math.round(currentMemory.heapTotal / 1024 / 1024),
                rss: Math.round(currentMemory.rss / 1024 / 1024)
            },
            errors: {
                total: this.metrics.errors.total,
                errorRate: this.metrics.requests.total > 0 
                    ? Math.round((this.metrics.errors.total / this.metrics.requests.total) * 100)
                    : 0
            },
            uptime: Math.round(process.uptime())
        };
    }

    /**
     * Get service-specific statistics
     */
    getServiceStats() {
        const serviceStats = {};

        for (const [serviceName, metrics] of this.metrics.requests.byService) {
            const avgResponseTime = metrics.total > 0 
                ? Math.round(metrics.totalResponseTime / metrics.total)
                : 0;

            const successRate = metrics.total > 0
                ? Math.round((metrics.successful / metrics.total) * 100)
                : 0;

            serviceStats[serviceName] = {
                requests: metrics.total,
                successful: metrics.successful,
                failed: metrics.failed,
                successRate: `${successRate}%`,
                avgResponseTime: `${avgResponseTime}ms`
            };
        }

        return serviceStats;
    }

    /**
     * Get recent error analysis
     */
    getErrorAnalysis() {
        const errorTypes = Array.from(this.metrics.errors.byType.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const recentErrors = this.metrics.errors.recent
            .slice(-10)
            .reverse();

        return {
            topErrorTypes: errorTypes.map(([type, count]) => ({ type, count })),
            recentErrors: recentErrors.map(error => ({
                type: error.type,
                message: error.message.substring(0, 100),
                service: error.service,
                timestamp: new Date(error.timestamp).toLocaleString()
            }))
        };
    }

    /**
     * Clean old data to prevent memory leaks
     */
    cleanOldData() {
        const oneHourAgo = Date.now() - (60 * 60 * 1000);

        // Clean old user activity data
        for (const [userId, lastActivity] of this.metrics.users.active) {
            if (lastActivity < oneHourAgo) {
                this.metrics.users.active.delete(userId);
            }
        }

        // Clean old response time data
        this.metrics.responseTime.recent = this.metrics.responseTime.recent
            .filter(r => r.timestamp > oneHourAgo);

        logger.debug('Cleaned old performance data');
    }

    /**
     * Log performance summary
     */
    logPerformanceSummary() {
        const stats = this.getStats();
        logger.info('Performance Summary:', {
            requests: stats.requests.total,
            successRate: stats.requests.successRate,
            avgResponseTime: stats.responseTime.average,
            activeUsers: stats.users.activeLastHour,
            memoryUsage: `${stats.memory.current}MB`,
            uptime: `${Math.round(stats.uptime / 3600)}h`
        });
    }

    /**
     * Generate performance report
     */
    generateReport() {
        return {
            timestamp: new Date().toISOString(),
            general: this.getStats(),
            services: this.getServiceStats(),
            errors: this.getErrorAnalysis(),
            system: {
                nodeVersion: process.version,
                platform: process.platform,
                uptime: process.uptime()
            }
        };
    }
}

module.exports = PerformanceMonitor;