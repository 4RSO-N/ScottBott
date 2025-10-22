const logger = require('./logger');
const SecretManager = require('./secretManager');
const ContentPolicyGate = require('./contentPolicyGate');
const AttachmentSanitizer = require('./attachmentSanitizer');
const AbuseControl = require('./abuseControl');
const WebhookValidator = require('./webhookValidator');

class SecurityManager {
    constructor() {
        this.secretManager = SecretManager;
        this.contentPolicyGate = ContentPolicyGate;
        this.attachmentSanitizer = AttachmentSanitizer;
        this.abuseControl = AbuseControl;
        this.webhookValidator = WebhookValidator;

        logger.info('✅ Security manager initialized with all security systems');
    }

    /**
     * Comprehensive security check for image generation requests
     * @param {Object} interaction - Discord interaction
     * @param {string} prompt - User prompt
     * @param {Array} attachments - Message attachments
     * @returns {Object} Security check result
     */
    async checkImageRequest(interaction, prompt, attachments = []) {
        const userId = interaction.user.id;
        const guildId = interaction.guild?.id;

        try {
            // 1. Check abuse control (rate limits and quotas)
            const rateLimitCheck = this.abuseControl.checkRateLimit(userId, 'imageJobs', guildId);
            if (!rateLimitCheck.allowed) {
                return {
                    allowed: false,
                    reason: rateLimitCheck.reason,
                    retryAfter: rateLimitCheck.resetIn,
                    type: 'rate_limit'
                };
            }

            const quotaCheck = this.abuseControl.checkQuota(userId, 'imageJobs', 'daily');
            if (!quotaCheck.allowed) {
                return {
                    allowed: false,
                    reason: `Daily image quota exceeded (${quotaCheck.used}/${quotaCheck.quota})`,
                    type: 'quota_exceeded'
                };
            }

            // 2. Check content policy
            const contentCheck = this.contentPolicyGate.checkContent(prompt, 'image');
            if (!contentCheck.allowed) {
                return {
                    allowed: false,
                    reason: contentCheck.reason,
                    suggestions: contentCheck.suggestions,
                    type: 'content_policy'
                };
            }

            // 3. Sanitize attachments if any
            if (attachments && attachments.length > 0) {
                for (const attachment of attachments) {
                    const sanitizeResult = await this.attachmentSanitizer.sanitizeAttachment(attachment);
                    if (!sanitizeResult.safe) {
                        return {
                            allowed: false,
                            reason: `Attachment security issue: ${sanitizeResult.reason}`,
                            type: 'attachment_security'
                        };
                    }
                }
            }

            // 4. Record the action for abuse monitoring
            this.abuseControl.recordAction(userId, 'imageJobs', guildId);

            return { allowed: true };

        } catch (error) {
            logger.error('Error in security check:', error);
            return {
                allowed: false,
                reason: 'Security check failed due to internal error',
                type: 'internal_error'
            };
        }
    }

    /**
     * Comprehensive security check for chat requests
     * @param {Object} message - Discord message
     * @param {string} content - Message content
     * @returns {Object} Security check result
     */
    async checkChatRequest(message, content) {
        const userId = message.author.id;
        const guildId = message.guild?.id;

        try {
            // 1. Check abuse control
            const rateLimitCheck = this.abuseControl.checkRateLimit(userId, 'chatMessages', guildId);
            if (!rateLimitCheck.allowed) {
                return {
                    allowed: false,
                    reason: rateLimitCheck.reason,
                    retryAfter: rateLimitCheck.resetIn,
                    type: 'rate_limit'
                };
            }

            const quotaCheck = this.abuseControl.checkQuota(userId, 'apiCalls', 'daily');
            if (!quotaCheck.allowed) {
                return {
                    allowed: false,
                    reason: `Daily API quota exceeded (${quotaCheck.used}/${quotaCheck.quota})`,
                    type: 'quota_exceeded'
                };
            }

            // 2. Check content policy
            const contentCheck = this.contentPolicyGate.checkContent(content, 'text');
            if (!contentCheck.allowed) {
                return {
                    allowed: false,
                    reason: contentCheck.reason,
                    suggestions: contentCheck.suggestions,
                    type: 'content_policy'
                };
            }

            // 3. Record the action
            this.abuseControl.recordAction(userId, 'chatMessages', guildId);

            return { allowed: true };

        } catch (error) {
            logger.error('Error in chat security check:', error);
            return {
                allowed: false,
                reason: 'Security check failed due to internal error',
                type: 'internal_error'
            };
        }
    }

    /**
     * Handle API errors for anomaly detection
     * @param {string} userId - User ID
     * @param {number} statusCode - HTTP status code
     * @param {string} endpoint - API endpoint
     */
    recordApiError(userId, statusCode, endpoint) {
        this.abuseControl.recordApiError(userId, statusCode, endpoint);
    }

    /**
     * Get security statistics
     * @returns {Object} Security stats
     */
    getSecurityStats() {
        return {
            abuseControl: this.abuseControl.getAbuseStats(),
            secretManager: {
                secretsCount: this.secretManager.getSecretsCount ? this.secretManager.getSecretsCount() : 'N/A'
            },
            contentPolicy: {
                violationsToday: this.contentPolicyGate.getViolationStats ? this.contentPolicyGate.getViolationStats() : 'N/A'
            },
            attachmentSecurity: {
                scansToday: this.attachmentSanitizer.getScanStats ? this.attachmentSanitizer.getScanStats() : 'N/A'
            }
        };
    }

    /**
     * Get user security profile
     * @param {string} userId - User ID
     * @returns {Object} User security data
     */
    getUserSecurityProfile(userId) {
        return {
            abuseActivity: this.abuseControl.getUserActivity(userId),
            contentViolations: this.contentPolicyGate.getUserViolations ? this.contentPolicyGate.getUserViolations(userId) : [],
            attachmentScans: this.attachmentSanitizer.getUserScans ? this.attachmentSanitizer.getUserScans(userId) : []
        };
    }

    /**
     * Admin function to update security settings
     * @param {string} component - Component to update ('rateLimits', 'quotas', 'contentPolicy')
     * @param {Object} settings - New settings
     */
    updateSecuritySettings(component, settings) {
        switch (component) {
            case 'rateLimits':
                this.abuseControl.updateRateLimits(settings);
                break;
            case 'quotas':
                this.abuseControl.updateQuotas(settings);
                break;
            case 'contentPolicy':
                if (this.contentPolicyGate.updateSettings) {
                    this.contentPolicyGate.updateSettings(settings);
                }
                break;
            default:
                throw new Error(`Unknown security component: ${component}`);
        }

        logger.info(`Updated security settings for ${component}`);
    }

    /**
     * Validate incoming webhook
     * @param {Object} req - Express request
     * @returns {boolean} Whether webhook is valid
     */
    validateWebhook(req) {
        const signature = req.get('X-Signature-Ed25519');
        const timestamp = req.get('X-Signature-Timestamp');
        const rawBody = req.rawBody || JSON.stringify(req.body);

        return this.webhookValidator.validateSignature(signature, timestamp, rawBody);
    }

    /**
     * Create formatted security response for Discord
     * @param {Object} securityResult - Result from security check
     * @returns {Object} Discord embed response
     */
    createSecurityResponse(securityResult) {
        try {
            const { EmbedBuilder } = require('discord.js');

            // Ensure description is valid (string, not null/undefined, max 4096 chars)
            let description = securityResult.reason || 'Security check failed';
            if (typeof description !== 'string') {
                description = String(description);
            }
            // Truncate if too long for Discord embed
            if (description.length > 4096) {
                description = description.substring(0, 4093) + '...';
            }

            const embed = new EmbedBuilder()
                .setColor('#ff4444')
                .setTitle('🚫 Security Check Failed')
                .setDescription(description);

            switch (securityResult.type) {
                case 'rate_limit':
                    embed.addFields({
                        name: '⏰ Rate Limited',
                        value: `Please wait ${securityResult.retryAfter || 'a moment'} seconds before trying again.`,
                        inline: false
                    });
                    break;

                case 'quota_exceeded':
                    embed.addFields({
                        name: '📊 Quota Exceeded',
                        value: 'You have reached your daily limit. Try again tomorrow.',
                        inline: false
                    });
                    break;

                case 'content_policy':
                    embed.addFields({
                        name: '🛡️ Content Policy Violation',
                        value: securityResult.suggestions ?
                            `Suggestions: ${securityResult.suggestions.join(', ')}` :
                            'Please review your content and try again.',
                        inline: false
                    });
                    break;

                case 'attachment_security':
                    embed.addFields({
                        name: '🔒 Attachment Security Issue',
                        value: 'The attached file failed security scanning.',
                        inline: false
                    });
                    break;

                default:
                    embed.addFields({
                        name: '⚠️ Security Error',
                        value: 'An unexpected security error occurred.',
                        inline: false
                    });
            }

            embed.setFooter({ text: 'Contact admins if you believe this is an error' });

            return embed;

        } catch (error) {
            // Fallback to simple text if embed creation fails
            const logger = require('./logger');
            logger.error('Failed to create security embed:', error);
            
            // Return a minimal valid embed as last resort
            const { EmbedBuilder } = require('discord.js');
            return new EmbedBuilder()
                .setColor('#ff4444')
                .setTitle('🚫 Security Check Failed')
                .setDescription('A security check prevented this action.');
        }
    }
}

module.exports = new SecurityManager();
