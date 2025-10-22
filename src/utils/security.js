const logger = require('./logger');

// Load environment variables
require('dotenv').config();

class SecurityManager {
    constructor() {
        this.validateEnvironment();
    }

    /**
     * Validate all environment variables and security settings
     */
    validateEnvironment() {
        const requiredVars = [
            { name: 'DISCORD_TOKEN', minLength: 50 },
            { name: 'PERPLEXITY_API_KEY', minLength: 30 }
        ];

        const { issues, warnings } = this._checkEnvironmentVariables(requiredVars);

        this._logWarnings(warnings);
        this._throwIfIssues(issues);
        this._logValidationSuccess(warnings);
    }

    _checkEnvironmentVariables(requiredVars) {
        const issues = [];
        const warnings = [];

        for (const { name, minLength } of requiredVars) {
            const value = process.env[name];
            this._validateVariable(name, value, minLength, issues, warnings);
        }

        return { issues, warnings };
    }

    _validateVariable(name, value, minLength, issues, warnings) {
        if (!value) {
            issues.push(`Missing required environment variable: ${name}`);
        } else if (this.isPlaceholder(value)) {
            this._addPlaceholderWarning(name, warnings);
        } else if (value.length < minLength) {
            issues.push(`${name} appears to be invalid (too short)`);
        }
    }

    _addPlaceholderWarning(name, warnings) {
        const message = name === 'DISCORD_TOKEN' 
            ? `${name} is using a placeholder value - Discord features will be disabled`
            : `${name} is using a placeholder value - bot functionality will be limited`;
        warnings.push(message);
    }

    _logWarnings(warnings) {
        if (warnings.length > 0) {
            logger.warn('⚠️  Security warnings:');
            for (const warning of warnings) {
                logger.warn(`  - ${warning}`);
            }
            logger.warn('   Note: Some features may not work with placeholder API keys');
        }
    }

    _throwIfIssues(issues) {
        if (issues.length > 0) {
            logger.error('Security validation failed:');
            for (const issue of issues) {
                logger.error(`  - ${issue}`);
            }
            throw new Error('Environment security validation failed');
        }
    }

    _logValidationSuccess(warnings) {
        if (warnings.length === 0) {
            logger.info('✅ Environment security validation passed');
        } else {
            logger.info('⚠️  Environment validation passed with warnings');
        }
    }

    /**
     * Check if a value is a placeholder
     */
    isPlaceholder(value) {
        const placeholders = [
            'your_',
            'placeholder',
            'example',
            'test_key',
            'sample',
            'demo'
        ];

        return placeholders.some(placeholder => 
            value.toLowerCase().includes(placeholder)
        );
    }

    /**
     * Sanitize data for logging (mask sensitive information)
     */
    sanitizeForLogging(data) {
        if (typeof data === 'string') {
            return this.maskSensitiveString(data);
        }
        
        if (typeof data === 'object' && data !== null) {
            const sanitized = {};
            for (const [key, value] of Object.entries(data)) {
                if (this.isSensitiveKey(key)) {
                    sanitized[key] = this.maskSensitiveString(String(value));
                } else if (typeof value === 'object') {
                    sanitized[key] = this.sanitizeForLogging(value);
                } else {
                    sanitized[key] = value;
                }
            }
            return sanitized;
        }

        return data;
    }

    /**
     * Check if a key name indicates sensitive data
     */
    isSensitiveKey(key) {
        const sensitiveKeywords = [
            'token', 'key', 'secret', 'password', 'auth', 'api', 'credential'
        ];
        
        const lowerKey = key.toLowerCase();
        return sensitiveKeywords.some(keyword => lowerKey.includes(keyword));
    }

    /**
     * Mask sensitive strings for display
     */
    maskSensitiveString(str) {
        if (!str || str.length < 8) {
            return '****';
        }
        
        const start = str.substring(0, 4);
        const end = str.substring(str.length - 4);
        const middle = '*'.repeat(Math.min(str.length - 8, 20));
        
        return `${start}${middle}${end}`;
    }

    /**
     * Validate user input to prevent injection attacks
     */
    validateUserInput(input) {
        if (typeof input !== 'string') {
            return false;
        }

        // Check for potentially malicious patterns
        const dangerousPatterns = [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            /eval\s*\(/gi,
            /expression\s*\(/gi
        ];

        return !dangerousPatterns.some(pattern => pattern.test(input));
    }

    /**
     * Rate limiting check
     */
    checkRateLimit(userId, action = 'general') {
        // This would integrate with the existing rate limiting in bot.js
        // For now, just validate the inputs
        if (!userId || typeof userId !== 'string') {
            return false;
        }

        if (!action || typeof action !== 'string') {
            return false;
        }

        return true;
    }

    /**
     * Generate security report
     */
    generateSecurityReport() {
        const report = {
            timestamp: new Date().toISOString(),
            environment: {
                nodeVersion: process.version,
                platform: process.platform,
                envVarsSet: this.getSetEnvironmentVars()
            },
            security: {
                gitignoreExists: this.checkGitignore(),
                logsDirSecure: this.checkLogsDirectory(),
                envFileSecure: this.checkEnvFileSecurity()
            }
        };

        return report;
    }

    /**
     * Get list of set environment variables (names only)
     */
    getSetEnvironmentVars() {
        const envVars = Object.keys(process.env);
        const botEnvVars = envVars.filter(name => 
            name.startsWith('DISCORD_') || 
            name.startsWith('GEMINI_') || 
            name.startsWith('PERPLEXITY_') ||
            name.startsWith('BOT_') ||
            name.startsWith('LOG_')
        );
        
        return botEnvVars;
    }

    /**
     * Check if .gitignore exists and includes .env
     */
    checkGitignore() {
        try {
            const fs = require('node:fs');
            const gitignore = fs.readFileSync('.gitignore', 'utf8');
            return gitignore.includes('.env');
        } catch (error) {
            logger.warn('Failed to check .gitignore:', error.message);
            return false;
        }
    }

    /**
     * Check logs directory security
     */
    checkLogsDirectory() {
        try {
            const fs = require('node:fs');
            const path = require('node:path');
            const logsDir = path.join(process.cwd(), 'logs');
            return fs.existsSync(logsDir);
        } catch (error) {
            logger.warn('Failed to check logs directory:', error.message);
            return false;
        }
    }

    /**
     * Check .env file security
     */
    checkEnvFileSecurity() {
        try {
            const fs = require('node:fs');
            const stats = fs.statSync('.env');
            return {
                exists: true,
                size: stats.size,
                modified: stats.mtime
            };
        } catch (error) {
            logger.warn('Failed to check .env file security:', error.message);
            return { exists: false };
        }
    }
}

module.exports = new SecurityManager();