# ScottBot Security Implementation

This document outlines the comprehensive security and safety features implemented for ScottBot, a Discord AI chatbot with image generation capabilities.

## Overview

ScottBot implements enterprise-grade security measures to protect against abuse, ensure content safety, and maintain system integrity. The security system is modular and consists of multiple layers working together.

## Security Components

### 1. Secret Management System (`SecretManager`)
**Location:** `src/utils/secretManager.js`

**Purpose:** KMS-like secret management with encryption, rotation, and scoping.

**Features:**
- AES-256-GCM encryption for all secrets
- Automatic secret rotation with configurable intervals
- Environment and guild-based scoping
- Secure key derivation and storage
- Audit logging for all secret operations

**Key Methods:**
- `storeSecret(name, value, scope)` - Store encrypted secret
- `getSecret(name, scope)` - Retrieve decrypted secret
- `rotateSecret(name, scope)` - Rotate encryption keys
- `getScopedSecrets(scope)` - Get all secrets for a scope

### 2. Content Policy Gate (`ContentPolicyGate`)
**Location:** `src/utils/contentPolicyGate.js`

**Purpose:** Content filtering and sanitization for prompts and messages.

**Features:**
- Regex-based content violation detection
- Severity levels (low, medium, high, critical)
- Automatic prompt sanitization with alternatives
- Configurable violation policies
- User-friendly violation responses

**Key Methods:**
- `checkContent(content, type)` - Check content against policies
- `sanitizePrompt(prompt)` - Clean and provide safe alternatives
- `generateViolationResponse(violation)` - Create user feedback

### 3. Attachment Sanitizer (`AttachmentSanitizer`)
**Location:** `src/utils/attachmentSanitizer.js`

**Purpose:** Secure file upload processing and malware detection.

**Features:**
- File signature analysis
- Metadata stripping and validation
- Entropy analysis for encrypted content
- Dimension validation for images
- MIME type verification
- Size limits and format restrictions

**Key Methods:**
- `sanitizeAttachment(attachment)` - Main processing pipeline
- `performSecurityScan(buffer, metadata)` - Threat detection
- `stripAndValidateMetadata(buffer, metadata)` - Content cleaning

### 4. Abuse Control System (`AbuseControl`)
**Location:** `src/utils/abuseControl.js`

**Purpose:** Rate limiting, quota management, and anomaly detection.

**Features:**
- Multi-level rate limiting (user, guild, global)
- Daily/monthly usage quotas
- Velocity analysis and spike detection
- Anomaly alerting for suspicious behavior
- Automatic cleanup of old tracking data

**Rate Limits:**
- Images: 10 per minute per user, 50 per minute per guild
- Chat messages: 30 per minute per user
- API calls: 100 per minute per user

**Quotas:**
- Daily: 100 images, 1000 API calls per user
- Monthly: 2000 images, 20000 API calls per user

**Key Methods:**
- `checkRateLimit(userId, action, guildId)` - Rate limit validation
- `checkQuota(userId, action, period)` - Quota validation
- `recordAction(userId, action, guildId)` - Track user activity
- `detectAnomalies(userId, action, guildId)` - Anomaly detection

### 5. Webhook Validator (`WebhookValidator`)
**Location:** `src/utils/webhookValidator.js`

**Purpose:** Discord webhook signature validation and scoped access control.

**Features:**
- Ed25519 signature verification
- Scoped webhook URLs with expiration
- Command-level permissions
- Interaction payload validation
- RSA-signed scope tokens

**Key Methods:**
- `validateSignature(signature, timestamp, body)` - Verify Discord signatures
- `createScopedWebhook(baseUrl, guildId, channelId, scope)` - Create restricted webhooks
- `validateScopedWebhook(url, payload)` - Validate scoped requests

### 6. Security Manager (`SecurityManager`)
**Location:** `src/utils/securityManager.js`

**Purpose:** Unified security orchestration and integration.

**Features:**
- Centralized security checks for all bot operations
- Comprehensive request validation
- User-friendly security responses
- Security statistics and monitoring
- Admin security management interface

**Key Methods:**
- `checkImageRequest(interaction, prompt, attachments)` - Full image request security
- `checkChatRequest(message, content)` - Chat request security
- `getSecurityStats()` - Security metrics
- `getUserSecurityProfile(userId)` - User security data

## Integration Points

### Bot Message Handling
Security checks are integrated into all message processing:

```javascript
// In bot.js messageCreate handler
if (message.attachments.size > 0) {
    const securityCheck = await this.securityManager.checkImageRequest(
        { user: message.author, guild: message.guild },
        message.content || 'Image upload',
        Array.from(message.attachments.values())
    );

    if (!securityCheck.allowed) {
        const embed = this.securityManager.createSecurityResponse(securityCheck);
        await message.reply({ embeds: [embed] });
        return;
    }
}
```

### Slash Command Handling
All slash commands go through security validation:

```javascript
// In bot.js interactionCreate handler
if (commandName === 'imagine') {
    const securityCheck = await this.securityManager.checkImageRequest(
        interaction,
        prompt,
        Array.from(attachments.values())
    );

    if (!securityCheck.allowed) {
        const embed = this.securityManager.createSecurityResponse(securityCheck);
        await interaction.editReply({ embeds: [embed] });
        return;
    }
}
```

### API Error Tracking
All API errors are recorded for anomaly detection:

```javascript
// In error handling
this.securityManager.recordApiError(
    interaction.user.id,
    error.statusCode || 500,
    `slash-command-${interaction.commandName}`
);
```

## Admin Monitoring

### Security Statistics Command
Admins can monitor security through `/admin security stats`:

- Active users and guilds
- Total actions and anomaly alerts
- Content violations and attachment scans
- Rate limit and quota usage

### User Security Profiles
Admins can check individual user security profiles:

- Activity patterns (hourly/daily)
- Quota usage
- Violation history
- Anomaly flags

## Configuration

### Environment Variables
```env
# Discord Webhook Security
DISCORD_PUBLIC_KEY=your_discord_public_key
WEBHOOK_PRIVATE_KEY=your_webhook_private_key
WEBHOOK_PUBLIC_KEY=your_webhook_public_key

# Security Settings
SECURITY_ENCRYPTION_KEY=your_encryption_key
SECURITY_KEY_ROTATION_DAYS=30
```

### Security Settings
Rate limits and quotas can be configured through the admin interface or configuration files.

## Security Response Types

### Rate Limit Exceeded
```
🚫 Security Check Failed
⏰ Rate Limited
Please wait X seconds before trying again.
```

### Quota Exceeded
```
🚫 Security Check Failed
📊 Quota Exceeded
You have reached your daily limit. Try again tomorrow.
```

### Content Policy Violation
```
🚫 Security Check Failed
🛡️ Content Policy Violation
Suggestions: [sanitized alternatives]
```

### Attachment Security Issue
```
🚫 Security Check Failed
🔒 Attachment Security Issue
The attached file failed security scanning.
```

## Anomaly Detection

The system automatically detects and alerts on:
- Sudden activity spikes (5x normal)
- Repeated 4xx errors (10+ in a row)
- High error rates (50%+ errors)
- Unusual activity hours (outside 6 AM - 10 PM)

## Best Practices

1. **Regular Key Rotation:** Rotate encryption keys every 30 days
2. **Monitor Anomalies:** Check anomaly alerts daily
3. **Review Violations:** Audit content policy violations weekly
4. **Update Signatures:** Keep file signatures updated for new threats
5. **Backup Security Data:** Regularly backup security configurations

## Emergency Procedures

### Security Breach Response
1. Immediately disable affected API keys
2. Rotate all encryption keys
3. Review recent anomaly alerts
4. Check user activity logs
5. Update security policies if needed

### System Compromise
1. Shut down bot services
2. Rotate all secrets and keys
3. Audit all recent changes
4. Restore from clean backup
5. Monitor for continued attacks

## Compliance

This security implementation helps meet:
- Content moderation requirements
- Data protection standards
- Abuse prevention mandates
- User privacy protections
- Platform security guidelines

## Future Enhancements

- Machine learning-based anomaly detection
- Advanced threat intelligence integration
- Automated incident response
- Security policy versioning
- Multi-region key management