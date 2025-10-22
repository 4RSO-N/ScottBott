const crypto = require('node:crypto');
const logger = require('./logger');

class WebhookValidator {
    constructor() {
        this.publicKey = process.env.DISCORD_PUBLIC_KEY;
        this.enabled = (process.env.ENABLE_WEBHOOK_VALIDATION || 'false').toLowerCase() === 'true';

        if (!this.enabled) {
            logger.info('ℹ️ Webhook validation disabled by config');
        } else if (this.publicKey) {
            logger.info('✅ Webhook validator initialized');
        } else {
            logger.info('ℹ️ Discord public key not set; webhook validation will be disabled');
            this.enabled = false;
        }
    }

    /**
     * Validate Discord webhook signature
     * @param {string} signature - X-Signature-Ed25519 header
     * @param {string} timestamp - X-Signature-Timestamp header
     * @param {string|Buffer} body - Raw request body
     * @returns {boolean} Whether the signature is valid
     */
    validateSignature(signature, timestamp, body) {
        if (!this.enabled) {
            logger.debug('Webhook signature validation skipped (disabled)');
            return false;
        }

        if (!signature || !timestamp || !body) {
            logger.warn('Missing required signature validation parameters');
            return false;
        }

        try {
            // Convert body to buffer if it's a string
            const bodyBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');

            // Create the message to verify (timestamp + body)
            const message = Buffer.concat([
                Buffer.from(timestamp, 'utf8'),
                bodyBuffer
            ]);

            // Decode the signature from hex
            const signatureBuffer = Buffer.from(signature, 'hex');

            // Verify the signature using Ed25519
            const isValid = crypto.verify(
                null, // algorithm (null for Ed25519)
                message,
                {
                    key: this.publicKey,
                    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
                    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
                },
                signatureBuffer
            );

            if (!isValid) {
                logger.warn('Invalid webhook signature received', {
                    timestamp,
                    bodyLength: bodyBuffer.length,
                    signatureLength: signatureBuffer.length
                });
            }

            return isValid;

        } catch (error) {
            logger.error('Error validating webhook signature:', error);
            return false;
        }
    }

    /**
     * Validate Discord interaction payload
     * @param {Object} payload - Parsed interaction payload
     * @returns {Object} Validation result
     */
    validateInteraction(payload) {
        if (!payload) {
            return { valid: false, reason: 'No payload provided' };
        }

        // Check required fields
        if (!payload.type) {
            return { valid: false, reason: 'Missing interaction type' };
        }

        if (!payload.token) {
            return { valid: false, reason: 'Missing interaction token' };
        }

        // Validate interaction type
        const validTypes = [1, 2, 3, 4, 5]; // PING, APPLICATION_COMMAND, MESSAGE_COMPONENT, etc.
        if (!validTypes.includes(payload.type)) {
            return { valid: false, reason: `Invalid interaction type: ${payload.type}` };
        }

        // For application commands, validate command data
        if (payload.type === 2 && !payload.data?.name) {
            return { valid: false, reason: 'Invalid application command data' };
        }

        // Check timestamp (interactions should be recent)
        if (payload.timestamp) {
            const interactionTime = new Date(payload.timestamp).getTime();
            const now = Date.now();
            const fiveMinutes = 5 * 60 * 1000;

            if (Math.abs(now - interactionTime) > fiveMinutes) {
                return { valid: false, reason: 'Interaction timestamp too old' };
            }
        }

        return { valid: true };
    }

    /**
     * Create a scoped webhook URL for a specific guild/channel
     * @param {string} baseUrl - Base webhook URL
     * @param {string} guildId - Discord guild ID
     * @param {string} channelId - Discord channel ID
     * @param {Object} scope - Scope configuration
     * @returns {string} Scoped webhook URL with token
     */
    createScopedWebhook(baseUrl, guildId, channelId, scope = {}) {
        const url = new URL(baseUrl);

        // Add scope parameters
        const scopeParams = {
            guild_id: guildId,
            channel_id: channelId,
            scope: JSON.stringify({
                allowed_commands: scope.allowedCommands || ['imagine', 'chat'],
                max_uses: scope.maxUses || 1000,
                expires_at: scope.expiresAt || (Date.now() + (30 * 24 * 60 * 60 * 1000)), // 30 days
                rate_limit: scope.rateLimit || { max: 10, window: 60 } // 10 per minute
            })
        };

        // Sign the scope parameters
        const scopeString = JSON.stringify(scopeParams);
        const signature = this.signData(scopeString);

        url.searchParams.set('scope_sig', signature);

        return url.toString();
    }

    /**
     * Validate scoped webhook request
     * @param {string} url - Full webhook URL with scope
     * @param {Object} payload - Request payload
     * @returns {Object} Validation result
     * Note: High cognitive complexity is inherent to security validation logic
     */
    validateScopedWebhook(url, payload) {
        try {
            const urlObj = new URL(url);
            const signature = urlObj.searchParams.get('scope_sig');

            if (!signature) {
                return { valid: false, reason: 'No scope signature found' };
            }

            // Extract scope data from URL
            const scopeData = {};
            for (const [key, value] of urlObj.searchParams) {
                if (key !== 'scope_sig') {
                    scopeData[key] = key === 'scope' ? JSON.parse(value) : value;
                }
            }

            // Verify signature
            const scopeString = JSON.stringify(scopeData);
            if (!this.verifyData(scopeString, signature)) {
                return { valid: false, reason: 'Invalid scope signature' };
            }

            // Check expiration
            if (scopeData.scope && scopeData.scope.expires_at < Date.now()) {
                return { valid: false, reason: 'Scoped webhook expired' };
            }

            // Validate guild/channel match
            if (payload.guild_id && payload.guild_id !== scopeData.guild_id) {
                return { valid: false, reason: 'Guild ID mismatch' };
            }

            if (payload.channel_id && payload.channel_id !== scopeData.channel_id) {
                return { valid: false, reason: 'Channel ID mismatch' };
            }

            // Check command permissions
            if (payload.data?.name) {
                const allowedCommands = scopeData.scope?.allowed_commands || [];
                if (!allowedCommands.includes(payload.data.name)) {
                    return { valid: false, reason: `Command '${payload.data.name}' not allowed in scope` };
                }
            }

            return { valid: true, scope: scopeData.scope };

        } catch (error) {
            logger.error('Error validating scoped webhook:', error);
            return { valid: false, reason: 'Validation error' };
        }
    }

    /**
     * Sign data with bot's private key
     * @param {string} data - Data to sign
     * @returns {string} Hex-encoded signature
     */
    signData(data) {
        const privateKey = process.env.WEBHOOK_PRIVATE_KEY;
        if (!privateKey) {
            throw new Error('Webhook private key not configured');
        }

        const sign = crypto.createSign('RSA-SHA256');
        sign.update(data);
        return sign.sign(privateKey, 'hex');
    }

    /**
     * Verify data signature
     * @param {string} data - Original data
     * @param {string} signature - Hex-encoded signature
     * @returns {boolean} Whether signature is valid
     */
    verifyData(data, signature) {
        const publicKey = process.env.WEBHOOK_PUBLIC_KEY;
        if (!publicKey) {
            throw new Error('Webhook public key not configured');
        }

        const verify = crypto.createVerify('RSA-SHA256');
        verify.update(data);
        return verify.verify(publicKey, signature, 'hex');
    }

    /**
     * Generate a new key pair for webhook signing
     * @returns {Object} Public and private keys
     */
    generateKeyPair() {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem'
            }
        });

        return { publicKey, privateKey };
    }

    /**
     * Middleware function for Express.js to validate Discord webhooks
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next function
     */
    middleware(req, res, next) {
        const signature = req.get('X-Signature-Ed25519');
        const timestamp = req.get('X-Signature-Timestamp');

        if (!signature || !timestamp) {
            logger.warn('Missing webhook signature headers');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Get raw body (needs raw body parser middleware)
        const rawBody = req.rawBody || JSON.stringify(req.body);

        if (!this.validateSignature(signature, timestamp, rawBody)) {
            logger.warn('Invalid webhook signature');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Validate interaction payload
        const interactionValidation = this.validateInteraction(req.body);
        if (!interactionValidation.valid) {
            logger.warn('Invalid interaction payload:', interactionValidation.reason);
            return res.status(400).json({ error: interactionValidation.reason });
        }

        next();
    }
}

module.exports = new WebhookValidator();
