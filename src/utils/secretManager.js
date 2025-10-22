const crypto = require('node:crypto');
const fs = require('node:fs').promises;
const path = require('node:path');
const logger = require('./logger');

class SecretManager {
    constructor() {
        this.secrets = new Map();
        this.keyRotationInterval = 24 * 60 * 60 * 1000; // 24 hours
        this.encryptionKey = null;
        this.initialized = false;
    }

    /**
     * Initialize encryption system
     */
    async initializeEncryption() {
        try {
            const keyPath = path.join(process.cwd(), 'data', 'master.key');

            // Try to load existing key
            try {
                this.encryptionKey = await fs.readFile(keyPath);
                logger.info('✅ Loaded existing master encryption key');
            } catch (error) {
                // Generate new key if it doesn't exist - this is expected behavior
                this.encryptionKey = crypto.randomBytes(32);
                await fs.mkdir(path.dirname(keyPath), { recursive: true });
                await fs.writeFile(keyPath, this.encryptionKey);
                logger.info('🔐 Generated new master encryption key');
            }

            // Load encrypted secrets
            await this.loadEncryptedSecrets();

            // Start key rotation schedule
            this.scheduleKeyRotation();

            this.initialized = true;
            logger.info('✅ Secret manager initialized');

        } catch (error) {
            logger.error('Failed to initialize secret manager:', error);
            throw error;
        }
    }

    /**
     * Load encrypted secrets from storage
     */
    async loadEncryptedSecrets() {
        try {
            const secretsPath = path.join(process.cwd(), 'data', 'secrets.enc');

            try {
                const encryptedData = await fs.readFile(secretsPath);
                const decryptedData = this.decrypt(encryptedData);
                const secrets = JSON.parse(decryptedData);

                // Load secrets into memory
                for (const [key, value] of Object.entries(secrets)) {
                    this.secrets.set(key, value);
                }

                logger.info(`Loaded ${this.secrets.size} encrypted secrets`);

            } catch (error) {
                // No secrets file exists yet - this is expected for first run
                logger.info('No encrypted secrets file found, starting fresh');
            }

        } catch (error) {
            logger.error('Failed to load encrypted secrets:', error);
        }
    }

    /**
     * Store a secret securely
     */
    async storeSecret(key, value, scope = 'global') {
        if (!this.initialized) {
            throw new Error('Secret manager not initialized');
        }

        const secretData = {
            value: value,
            scope: scope,
            created: new Date().toISOString(),
            rotated: new Date().toISOString(),
            version: 1
        };

        this.secrets.set(key, secretData);
        await this.persistSecrets();

        logger.info(`Stored secret: ${key} (scope: ${scope})`);
    }

    /**
     * Retrieve a secret securely
     */
    async getSecret(key, scope = null) {
        if (!this.initialized) {
            throw new Error('Secret manager not initialized');
        }

        const secret = this.secrets.get(key);

        if (!secret) {
            return null;
        }

        // Check scope if specified
        if (scope && secret.scope !== 'global' && secret.scope !== scope) {
            logger.warn(`Access denied for secret ${key} in scope ${scope}`);
            return null;
        }

        return secret.value;
    }

    /**
     * Rotate a secret (generate new value)
     */
    async rotateSecret(key) {
        const secret = this.secrets.get(key);
        if (!secret) {
            throw new Error(`Secret ${key} not found`);
        }

        // Generate new value (this would integrate with actual key rotation services)
        const newValue = crypto.randomBytes(32).toString('hex');

        secret.value = newValue;
        secret.rotated = new Date().toISOString();
        secret.version++;

        await this.persistSecrets();

        logger.info(`Rotated secret: ${key} (version ${secret.version})`);
        return newValue;
    }

    /**
     * Schedule automatic key rotation
     */
    scheduleKeyRotation() {
        setInterval(async () => {
            try {
                logger.info('🔄 Starting scheduled secret rotation');

                // Rotate high-risk secrets
                const secretsToRotate = ['GEMINI_API_KEY', 'PERPLEXITY_API_KEY'];

                for (const key of secretsToRotate) {
                    if (this.secrets.has(key)) {
                        await this.rotateSecret(key);
                    }
                }

                logger.info('✅ Secret rotation completed');

            } catch (error) {
                logger.error('Secret rotation failed:', error);
            }
        }, this.keyRotationInterval);
    }

    /**
     * Encrypt data using AES-256-GCM
     */
    encrypt(data) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey);

        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        return JSON.stringify({
            iv: iv.toString('hex'),
            encrypted: encrypted,
            authTag: authTag.toString('hex')
        });
    }

    /**
     * Decrypt data using AES-256-GCM
     */
    decrypt(encryptedData) {
        const { encrypted, authTag } = JSON.parse(encryptedData);

        const decipher = crypto.createDecipher('aes-256-gcm', this.encryptionKey);
        decipher.setAuthTag(Buffer.from(authTag, 'hex'));

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }

    /**
     * Persist secrets to encrypted storage
     */
    async persistSecrets() {
        try {
            const secretsPath = path.join(process.cwd(), 'data', 'secrets.enc');

            // Convert Map to plain object for encryption
            const secretsObj = {};
            for (const [key, value] of this.secrets) {
                secretsObj[key] = value;
            }

            const encryptedData = this.encrypt(secretsObj);
            await fs.writeFile(secretsPath, encryptedData);

        } catch (error) {
            logger.error('Failed to persist secrets:', error);
            throw error;
        }
    }

    /**
     * Get secret metadata (without revealing values)
     */
    getSecretMetadata() {
        const metadata = {};

        for (const [key, secret] of this.secrets) {
            metadata[key] = {
                scope: secret.scope,
                created: secret.created,
                rotated: secret.rotated,
                version: secret.version
            };
        }

        return metadata;
    }

    /**
     * Secure logging - never log actual secret values
     */
    createSecureLogger() {
        return {
            info: (message, data = {}) => {
                const sanitized = this.sanitizeForLogging(data);
                logger.info(message, sanitized);
            },
            warn: (message, data = {}) => {
                const sanitized = this.sanitizeForLogging(data);
                logger.warn(message, sanitized);
            },
            error: (message, data = {}) => {
                const sanitized = this.sanitizeForLogging(data);
                logger.error(message, sanitized);
            }
        };
    }

    /**
     * Sanitize data for secure logging
     */
    sanitizeForLogging(data) {
        if (typeof data === 'string') {
            // Never log prompts or headers that might contain secrets
            if (data.length > 100) {
                return `[${data.length} chars]`;
            }
            return data;
        }

        if (typeof data === 'object' && data !== null) {
            const sanitized = { ...data };

            // Remove or mask sensitive fields
            const sensitiveFields = ['authorization', 'api_key', 'token', 'secret', 'password', 'prompt'];

            for (const field of sensitiveFields) {
                if (sanitized[field]) {
                    sanitized[field] = '[REDACTED]';
                }
            }

            return sanitized;
        }

        return data;
    }

    /**
     * Validate secret access for environment/guild
     */
    validateSecretAccess(key, environment, guildId = null) {
        const secret = this.secrets.get(key);

        if (!secret) {
            return false;
        }

        // Global secrets can be accessed everywhere
        if (secret.scope === 'global') {
            return true;
        }

        // Environment-specific secrets
        if (secret.scope === `env:${environment}`) {
            return true;
        }

        // Guild-specific secrets
        if (guildId && secret.scope === `guild:${guildId}`) {
            return true;
        }

        return false;
    }

    /**
     * Get secrets for a specific environment/guild
     */
    getScopedSecrets(environment, guildId = null) {
        const scopedSecrets = {};

        for (const [key, secret] of this.secrets) {
            if (this.validateSecretAccess(key, environment, guildId)) {
                scopedSecrets[key] = secret.value;
            }
        }

        return scopedSecrets;
    }
}

module.exports = SecretManager;
