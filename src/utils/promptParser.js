const logger = require('./logger');

class PromptParser {
    constructor() {
        // Common style keywords
        this.styles = [
            'realistic', 'artistic', 'cartoon', 'anime', 'manga', 'fantasy', 'sci-fi', 'cyberpunk',
            'steampunk', 'medieval', 'renaissance', 'impressionist', 'abstract', 'minimalist',
            'photorealistic', 'cinematic', 'moody', 'bright', 'dark', 'vibrant', 'muted',
            'watercolor', 'oil painting', 'digital art', 'sketch', 'pencil', 'charcoal',
            '3d render', 'isometric', 'pixel art', 'low poly', 'geometric'
        ];

        // Common aspect ratios and sizes
        this.aspectRatios = {
            'square': '1:1',
            'portrait': '3:4',
            'landscape': '4:3',
            'wide': '16:9',
            'tall': '9:16',
            'cinematic': '21:9',
            'banner': '3:1'
        };

        // Quality/size modifiers
        this.qualities = [
            'low res', 'high res', 'ultra high res', '4k', '8k', 'hd', 'detailed', 'simple'
        ];
    }

    /**
     * Parse a user prompt and extract structured information
     * @param {string} prompt - Raw user prompt
     * @returns {Object} Parsed prompt data
     */
    parsePrompt(prompt) {
        const lowerPrompt = prompt.toLowerCase();

        // Extract subject (everything before style/quality modifiers)
        let subject = this.extractSubject(prompt);

        // Extract style
        const style = this.extractStyle(lowerPrompt);

        // Extract aspect ratio/size
        const aspectRatio = this.extractAspectRatio(lowerPrompt);

        // Extract quality
        const quality = this.extractQuality(lowerPrompt);

        // Extract additional parameters
        const additionalParams = this.extractAdditionalParams(lowerPrompt);

        return {
            original: prompt,
            subject: subject,
            style: style,
            aspectRatio: aspectRatio,
            quality: quality,
            additionalParams: additionalParams,
            confidence: this.calculateConfidence(subject, style, aspectRatio)
        };
    }

    /**
     * Extract the main subject from the prompt
     */
    extractSubject(prompt) {
        // Remove common prefixes and style/quality words
        let subject = prompt;

        // Remove style words
        for (const style of this.styles) {
            const regex = new RegExp(`\\b${style}\\b`, 'gi');
            subject = subject.replace(regex, '');
        }

        // Remove quality words
        for (const quality of this.qualities) {
            const regex = new RegExp(`\\b${quality}\\b`, 'gi');
            subject = subject.replace(regex, '');
        }

        // Remove aspect ratio words
        for (const ratio of Object.keys(this.aspectRatios)) {
            const regex = new RegExp(`\\b${ratio}\\b`, 'gi');
            subject = subject.replace(regex, '');
        }

        // Remove common separators and clean up
        subject = subject
            .replaceAll(/\s+/g, ' ')
            .replace(/^(in|with|as|create|generate|make|draw)\s+/i, '')
            .replace(/\s+(style|quality|resolution|size|ratio)$/i, '')
            .trim();

        return subject || 'unspecified subject';
    }

    /**
     * Extract style from prompt
     */
    extractStyle(lowerPrompt) {
        for (const style of this.styles) {
            if (lowerPrompt.includes(style)) {
                return style;
            }
        }
        return 'artistic'; // default
    }

    /**
     * Extract aspect ratio from prompt
     */
    extractAspectRatio(lowerPrompt) {
        for (const [name, ratio] of Object.entries(this.aspectRatios)) {
            if (lowerPrompt.includes(name)) {
                return ratio;
            }
        }

        // Check for direct ratio mentions
        const ratioMatch = lowerPrompt.match(/(\d+):(\d+)/);
        if (ratioMatch) {
            return `${ratioMatch[1]}:${ratioMatch[2]}`;
        }

        return '1:1'; // default square
    }

    /**
     * Extract quality from prompt
     */
    extractQuality(lowerPrompt) {
        for (const quality of this.qualities) {
            if (lowerPrompt.includes(quality)) {
                return quality;
            }
        }
        return 'high res'; // default
    }

    /**
     * Extract additional parameters
     */
    extractAdditionalParams(lowerPrompt) {
        const params = [];

        // Lighting
        if (lowerPrompt.includes('dark') || lowerPrompt.includes('moody')) params.push('dark lighting');
        if (lowerPrompt.includes('bright') || lowerPrompt.includes('sunny')) params.push('bright lighting');
        if (lowerPrompt.includes('dramatic')) params.push('dramatic lighting');

        // Mood
        if (lowerPrompt.includes('peaceful') || lowerPrompt.includes('calm')) params.push('peaceful mood');
        if (lowerPrompt.includes('energetic') || lowerPrompt.includes('dynamic')) params.push('energetic mood');

        // Composition
        if (lowerPrompt.includes('close up') || lowerPrompt.includes('close-up')) params.push('close-up composition');
        if (lowerPrompt.includes('wide shot')) params.push('wide shot composition');

        return params;
    }

    /**
     * Calculate confidence score for the parsing
     */
    calculateConfidence(subject, style, aspectRatio) {
        let confidence = 0;

        if (subject && subject !== 'unspecified subject') confidence += 0.4;
        if (style && style !== 'artistic') confidence += 0.3;
        if (aspectRatio && aspectRatio !== '1:1') confidence += 0.3;

        return Math.min(confidence, 1);
    }

    /**
     * Generate a human-readable summary
     */
    generateSummary(parsedPrompt) {
        const { subject, style, aspectRatio, quality, additionalParams } = parsedPrompt;

        let summary = `**Subject:** ${subject}\n`;
        summary += `**Style:** ${style}\n`;
        summary += `**Aspect Ratio:** ${aspectRatio}\n`;
        summary += `**Quality:** ${quality}`;

        if (additionalParams.length > 0) {
            summary += `\n**Additional:** ${additionalParams.join(', ')}`;
        }

        return summary;
    }

    /**
     * Generate enhanced prompt for AI
     */
    generateEnhancedPrompt(parsedPrompt) {
        const { subject, style, aspectRatio, quality, additionalParams } = parsedPrompt;

        let enhanced = subject;

        if (style !== 'artistic') {
            enhanced += ` in ${style} style`;
        }

        if (quality !== 'high res') {
            enhanced += `, ${quality}`;
        }

        if (aspectRatio !== '1:1') {
            enhanced += `, aspect ratio ${aspectRatio}`;
        }

        if (additionalParams.length > 0) {
            enhanced += `, ${additionalParams.join(', ')}`;
        }

        return enhanced;
    }

    /**
     * Generate variation suggestions
     */
    generateVariations(parsedPrompt) {
        const variations = [];
        const { style, aspectRatio } = parsedPrompt;

        // Style variations
        const styleVariations = this.styles.filter(s => s !== style).slice(0, 3);
        for (const newStyle of styleVariations) {
            variations.push({
                type: 'style',
                label: `Change to ${newStyle}`,
                value: newStyle,
                prompt: this.generateEnhancedPrompt({ ...parsedPrompt, style: newStyle })
            });
        }

        // Aspect ratio variations
        const ratioVariations = Object.entries(this.aspectRatios)
            .filter(([name, ratio]) => ratio !== aspectRatio)
            .slice(0, 3);

        for (const [name, ratio] of ratioVariations) {
            variations.push({
                type: 'aspect',
                label: `${name} (${ratio})`,
                value: ratio,
                prompt: this.generateEnhancedPrompt({ ...parsedPrompt, aspectRatio: ratio })
            });
        }

        return variations;
    }
}

module.exports = new PromptParser();
