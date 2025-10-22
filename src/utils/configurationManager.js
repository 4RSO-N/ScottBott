const fs = require('node:fs');
const path = require('node:path');

class ConfigurationManager {
    constructor(configPath = './config.json') {
        this.configPath = configPath;
        this.config = this.loadConfig();
        this.defaultConfig = {
            server: {
                prefix: process.env.BOT_PREFIX || '!',
                defaultAI: process.env.DEFAULT_AI_PROVIDER || 'perplexity',
                maxConversationLength: 10,
                allowImageAnalysis: true,
                autoDeleteCommands: false,
                commandCooldown: 3000
            },
            ai: {
                gemini: {
                    enabled: true,
                    maxTokens: 8192,
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    timeout: 30000
                },
                perplexity: {
                    enabled: true,
                    model: 'sonar',
                    maxTokens: 4096,
                    temperature: 0.2,
                    timeout: 30000
                }
            },
            features: {
                conversationMemory: true,
                imageProcessing: true,
                webDashboard: true,
                performanceMonitoring: true,
                advancedLogging: true,
                slashCommands: true
            },
            security: {
                inputValidation: true,
                rateLimiting: true,
                commandPermissions: true,
                apiKeyMasking: true,
                maxInputLength: 2000,
                bannedWords: []
            },
            performance: {
                cacheSize: 1000,
                cleanupInterval: 3600000, // 1 hour
                maxMemoryUsage: 512, // MB
                requestTimeout: 30000
            },
            dashboard: {
                enabled: true,
                port: 3000,
                autoRefresh: 30000,
                showSensitiveData: false
            }
        };
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const configData = fs.readFileSync(this.configPath, 'utf8');
                return JSON.parse(configData);
            }
        } catch (error) {
            console.error('Error loading config:', error);
        }
        return {};
    }

    saveConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving config:', error);
            return false;
        }
    }

    get(path, defaultValue = null) {
        const keys = path.split('.');
        let current = { ...this.defaultConfig, ...this.config };
        
        for (const key of keys) {
            if (current[key] === undefined) {
                return defaultValue;
            }
            current = current[key];
        }
        
        return current;
    }

    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let current = this.config;
        
        // Create nested structure if it doesn't exist
        for (const key of keys) {
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[lastKey] = value;
        return this.saveConfig();
    }

    reset(section = null) {
        if (section) {
            this.config[section] = { ...this.defaultConfig[section] };
        } else {
            this.config = { ...this.defaultConfig };
        }
        return this.saveConfig();
    }

    validate() {
        const issues = [];
        
        // Validate server config
        const prefix = this.get('server.prefix');
        if (!prefix || prefix.length > 5) {
            issues.push('Server prefix must be 1-5 characters');
        }
        
        const maxConvLength = this.get('server.maxConversationLength');
        if (maxConvLength < 1 || maxConvLength > 50) {
            issues.push('Max conversation length must be between 1-50');
        }
        
        // Validate AI config
        const geminiTokens = this.get('ai.gemini.maxTokens');
        if (geminiTokens < 100 || geminiTokens > 32768) {
            issues.push('Gemini max tokens must be between 100-32768');
        }
        
        const perplexityTokens = this.get('ai.perplexity.maxTokens');
        if (perplexityTokens < 100 || perplexityTokens > 16384) {
            issues.push('Perplexity max tokens must be between 100-16384');
        }
        
        // Validate performance config
        const maxMemory = this.get('performance.maxMemoryUsage');
        if (maxMemory < 128 || maxMemory > 4096) {
            issues.push('Max memory usage must be between 128-4096 MB');
        }
        
        return {
            isValid: issues.length === 0,
            issues
        };
    }

    getServerConfig(guildId) {
        // In production, this would load server-specific config from database
        return this.get('server');
    }

    setServerConfig(guildId, config) {
        // In production, this would save server-specific config to database
        // For now, we'll update the global config
        for (const [key, value] of Object.entries(config)) {
            this.set(`server.${key}`, value);
        }
        return this.saveConfig();
    }

    getAIConfig(service) {
        return this.get(`ai.${service}`);
    }

    updateAIConfig(service, config) {
        for (const [key, value] of Object.entries(config)) {
            this.set(`ai.${service}.${key}`, value);
        }
        return this.saveConfig();
    }

    getFeatureConfig() {
        return this.get('features');
    }

    toggleFeature(feature, enabled = null) {
        const currentState = this.get(`features.${feature}`);
        const newState = enabled !== null ? enabled : !currentState;
        return this.set(`features.${feature}`, newState);
    }

    getSecurityConfig() {
        return this.get('security');
    }

    updateSecurityConfig(config) {
        for (const [key, value] of Object.entries(config)) {
            this.set(`security.${key}`, value);
        }
        return this.saveConfig();
    }

    getPerformanceConfig() {
        return this.get('performance');
    }

    updatePerformanceConfig(config) {
        for (const [key, value] of Object.entries(config)) {
            this.set(`performance.${key}`, value);
        }
        return this.saveConfig();
    }

    getDashboardConfig() {
        return this.get('dashboard');
    }

    updateDashboardConfig(config) {
        for (const [key, value] of Object.entries(config)) {
            this.set(`dashboard.${key}`, value);
        }
        return this.saveConfig();
    }

    exportConfig() {
        return {
            config: this.config,
            defaults: this.defaultConfig,
            timestamp: new Date().toISOString(),
            version: '1.0.0'
        };
    }

    importConfig(configData) {
        try {
            if (configData.config) {
                this.config = configData.config;
                return this.saveConfig();
            }
            return false;
        } catch (error) {
            console.error('Error importing config:', error);
            return false;
        }
    }

    getConfigSummary() {
        const validation = this.validate();
        return {
            isValid: validation.isValid,
            issues: validation.issues,
            totalSettings: this.countSettings(this.config),
            customizedSettings: this.countCustomized(),
            lastModified: this.getLastModified(),
            features: {
                enabled: Object.entries(this.get('features')).filter(([k, v]) => v).map(([k, v]) => k),
                disabled: Object.entries(this.get('features')).filter(([k, v]) => !v).map(([k, v]) => k)
            }
        };
    }

    countSettings(obj, count = 0) {
        for (const key in obj) {
            if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                count = this.countSettings(obj[key], count);
            } else {
                count++;
            }
        }
        return count;
    }

    countCustomized() {
        // Compare with defaults to count customized settings
        let count = 0;
        const compareObjects = (obj1, obj2, path = '') => {
            for (const key in obj1) {
                const currentPath = path ? `${path}.${key}` : key;
                if (typeof obj1[key] === 'object' && obj1[key] !== null && !Array.isArray(obj1[key])) {
                    if (obj2[key]) {
                        compareObjects(obj1[key], obj2[key], currentPath);
                    }
                } else if (obj1[key] !== obj2[key]) {
                    count++;
                }
            }
        };
        
        compareObjects(this.config, this.defaultConfig);
        return count;
    }

    getLastModified() {
        try {
            const stats = fs.statSync(this.configPath);
            return stats.mtime.toISOString();
        } catch (error) {
            console.warn(`Unable to get last modified time for ${this.configPath}:`, error.message);
            return null;
        }
    }

    // Configuration templates for quick setup
    getTemplate(templateName) {
        const templates = {
            development: {
                ai: {
                    gemini: { temperature: 0.9, topK: 50 },
                    perplexity: { temperature: 0.3 }
                },
                features: {
                    conversationMemory: true,
                    webDashboard: true,
                    advancedLogging: true
                },
                dashboard: {
                    enabled: true,
                    showSensitiveData: true
                }
            },
            production: {
                ai: {
                    gemini: { temperature: 0.7, topK: 40 },
                    perplexity: { temperature: 0.2 }
                },
                security: {
                    inputValidation: true,
                    rateLimiting: true,
                    apiKeyMasking: true
                },
                performance: {
                    maxMemoryUsage: 256,
                    requestTimeout: 15000
                },
                dashboard: {
                    enabled: false,
                    showSensitiveData: false
                }
            },
            minimal: {
                features: {
                    conversationMemory: false,
                    imageProcessing: false,
                    webDashboard: false,
                    performanceMonitoring: false
                },
                ai: {
                    gemini: { maxTokens: 2048 },
                    perplexity: { maxTokens: 2048 }
                }
            }
        };
        
        return templates[templateName] || null;
    }

    applyTemplate(templateName) {
        const template = this.getTemplate(templateName);
        if (!template) {
            return false;
        }
        
        // Deep merge template with current config
        const mergeDeep = (target, source) => {
            for (const key in source) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    if (!target[key]) target[key] = {};
                    mergeDeep(target[key], source[key]);
                } else {
                    target[key] = source[key];
                }
            }
        };
        
        mergeDeep(this.config, template);
        return this.saveConfig();
    }
}

module.exports = ConfigurationManager;