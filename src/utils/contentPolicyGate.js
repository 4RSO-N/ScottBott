const logger = require('./logger');

class ContentPolicyGate {
    constructor() {
        // Disallowed content categories
        this.disallowedCategories = {
            violence: [
                /\b(kill|murder|death|blood| gore|violent|weapon|gun|knife|fight|war|battle)\b/i,
                /\b(torture|abuse|harm|injure|attack|assault)\b/i
            ],
            adult: [
                /\b(nude|naked|sex|porn|erotic|adult|nsfw|xxx)\b/i,
                /\b(breast|penis|vagina|genital|orgasm|masturbat)\b/i
            ],
            hate: [
                /\b(racist|racism|nazi|swastika|kkk|white.power)\b/i,
                /\b(homophob|transphob|bigot|hate|supremacist)\b/i
            ],
            illegal: [
                /\b(drug|cocaine|heroin|meth|crack|weed|marijuana)\b/i,
                /\b(child|kid|minor|underage|pedophil)\b/i,
                /\b(terrorist|bomb|explosive|illegal|crime)\b/i
            ],
            harassment: [
                /\b(bully|harass|stalk|threaten|intimidat)\b/i,
                /\b(suicide|self.harm|depress|anxiety|mental.health)\b/i
            ]
        };

        // Content severity levels
        this.severityLevels = {
            low: ['harassment'],
            medium: ['violence', 'adult'],
            high: ['hate', 'illegal']
        };

        logger.info('✅ Content policy gate initialized');
    }

    /**
     * Check if content violates policy
     * @param {string} content - Content to check
     * @param {string} type - Content type ('prompt', 'text', 'image_description')
     * @returns {Object} Policy check result
     */
    checkContent(content, type = 'prompt') {
        if (!content || typeof content !== 'string') {
            return { allowed: true, violations: [] };
        }

        const violations = [];
        const contentLower = content.toLowerCase();

        // Check each category
        for (const [category, patterns] of Object.entries(this.disallowedCategories)) {
            for (const pattern of patterns) {
                const match = pattern.exec(contentLower);
                if (match) {
                    violations.push({
                        category,
                        severity: this.getSeverityLevel(category),
                        matched: match[0] || 'unknown'
                    });
                    break; // Only report once per category
                }
            }
        }

        const allowed = violations.length === 0;
        const maxSeverity = violations.length > 0 ?
            Math.max(...violations.map(v => this.getSeverityLevel(v.category))) : 0;

        return {
            allowed,
            violations,
            severity: maxSeverity,
            blocked: !allowed
        };
    }

    /**
     * Get severity level for a category
     */
    getSeverityLevel(category) {
        if (this.severityLevels.high.includes(category)) return 3;
        if (this.severityLevels.medium.includes(category)) return 2;
        if (this.severityLevels.low.includes(category)) return 1;
        return 1;
    }

    /**
     * Sanitize a prompt by removing or replacing problematic content
     * @param {string} prompt - Original prompt
     * @param {Array} violations - List of violations found
     * @returns {string} Sanitized prompt
     */
    sanitizePrompt(prompt, violations) {
        let sanitized = prompt;

        // Remove or replace problematic terms
        const replacements = {
            violence: {
                pattern: /\b(kill|murder|death|blood|gore|violent|weapon|gun|knife|fight|war|battle|torture|abuse|harm|injure|attack|assault)\b/gi,
                replacement: 'peaceful'
            },
            adult: {
                pattern: /\b(nude|naked|sex|porn|erotic|adult|nsfw|xxx|breast|penis|vagina|genital|orgasm|masturbat)\b/gi,
                replacement: 'artistic'
            },
            hate: {
                pattern: /\b(racist|racism|nazi|swastika|kkk|white.power|homophob|transphob|bigot|hate|supremacist)\b/gi,
                replacement: 'inclusive'
            },
            illegal: {
                pattern: /\b(drug|cocaine|heroin|meth|crack|weed|marijuana|child|kid|minor|underage|pedophil|terrorist|bomb|explosive|illegal|crime)\b/gi,
                replacement: 'safe'
            },
            harassment: {
                pattern: /\b(bully|harass|stalk|threaten|intimidat|suicide|self.harm|depress|anxiety|mental.health)\b/gi,
                replacement: 'positive'
            }
        };

        // Apply replacements for violated categories
        const violatedCategories = [...new Set(violations.map(v => v.category))];

        for (const category of violatedCategories) {
            if (replacements[category]) {
                sanitized = sanitized.replace(replacements[category].pattern, replacements[category].replacement);
            }
        }

        // Clean up multiple spaces and punctuation
        sanitized = sanitized.replaceAll(/\s+/g, ' ').trim();
        sanitized = sanitized.replaceAll(/,\s*,/g, ',');
        sanitized = sanitized.replaceAll(/;\s*;/g, ';');

        return sanitized;
    }

    /**
     * Generate a policy violation response with sanitization option
     * @param {Object} checkResult - Result from checkContent
     * @param {string} originalPrompt - Original user prompt
     * @returns {Object} Discord embed response
     */
    generateViolationResponse(checkResult, originalPrompt) {
        const { violations, severity } = checkResult;

        // Group violations by severity
        const highSeverity = violations.filter(v => v.severity === 3);
        const mediumSeverity = violations.filter(v => v.severity === 2);
        const lowSeverity = violations.filter(v => v.severity === 1);

        let description = '⚠️ **Content Policy Violation**\n\n';
        description += `Your prompt contains content that violates our safety guidelines.\n\n`;

        if (highSeverity.length > 0) {
            description += '**🚫 High Priority Violations:**\n';
            for (const v of highSeverity) {
                description += `• ${v.category.charAt(0).toUpperCase() + v.category.slice(1)} content\n`;
            }
            description += '\n';
        }

        if (mediumSeverity.length > 0) {
            description += '**⚠️ Medium Priority Violations:**\n';
            for (const v of mediumSeverity) {
                description += `• ${v.category.charAt(0).toUpperCase() + v.category.slice(1)} content\n`;
            }
            description += '\n';
        }

        if (lowSeverity.length > 0) {
            description += '**ℹ️ Low Priority Violations:**\n';
            for (const v of lowSeverity) {
                description += `• ${v.category.charAt(0).toUpperCase() + v.category.slice(1)} content\n`;
            }
            description += '\n';
        }

        description += '**What would you like to do?**';

        let color;
        if (severity >= 3) {
            color = 0xff0000;
        } else if (severity >= 2) {
            color = 0xffa500;
        } else {
            color = 0xffff00;
        }

        const embed = {
            title: '🛡️ Content Policy Check',
            description: description,
            color: color,
            footer: { text: 'Choose an option below to proceed' }
        };

        // Create action buttons
        const components = [];

        // Sanitize option (always available)
        const sanitizeRow = {
            type: 1,
            components: [{
                type: 2,
                style: 3, // Success (green)
                label: '🧹 Sanitize Prompt',
                custom_id: `policy_sanitize_${Date.now()}`
            }]
        };
        components.push(sanitizeRow);

        // For low severity, also offer to proceed anyway
        if (severity <= 2) {
            const proceedRow = {
                type: 1,
                components: [{
                    type: 2,
                    style: 4, // Danger (red)
                    label: '⚠️ Proceed Anyway',
                    custom_id: `policy_proceed_${Date.now()}`
                }]
            };
            components.push(proceedRow);
        }

        return { embed, components, violations, originalPrompt };
    }

    /**
     * Check if content should be blocked entirely
     * @param {Object} checkResult - Result from checkContent
     * @returns {boolean} Whether to block entirely
     */
    shouldBlockEntirely(checkResult) {
        const { violations } = checkResult;

        // Block if any high-severity violations
        return violations.some(v => v.severity >= 3);
    }

    /**
     * Get policy statistics
     * @returns {Object} Policy statistics
     */
    getPolicyStats() {
        return {
            categories: Object.keys(this.disallowedCategories),
            severityLevels: this.severityLevels,
            totalRules: Object.values(this.disallowedCategories).reduce((sum, patterns) => sum + patterns.length, 0)
        };
    }

    /**
     * Update policy rules (admin function)
     * @param {string} category - Category to update
     * @param {Array} newPatterns - New regex patterns
     */
    updatePolicyRules(category, newPatterns) {
        if (!this.disallowedCategories[category]) {
            throw new Error(`Unknown category: ${category}`);
        }

        this.disallowedCategories[category] = newPatterns.map(pattern => {
            if (typeof pattern === 'string') {
                return new RegExp(pattern, 'i');
            }
            return pattern;
        });

        logger.info(`Updated policy rules for category: ${category}`);
    }
}

module.exports = new ContentPolicyGate();
