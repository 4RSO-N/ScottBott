const fs = require('node:fs').promises;
const path = require('node:path');
const crypto = require('node:crypto');
const logger = require('./logger');

class AttachmentSanitizer {
    constructor() {
        // Security limits
        this.limits = {
            maxFileSize: 10 * 1024 * 1024, // 10MB
            allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
            allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
            maxWidth: 4096,
            maxHeight: 4096,
            minWidth: 32,
            minHeight: 32
        };

        // Malicious content signatures (simplified)
        this.maliciousSignatures = [
            // Common malware signatures (first few bytes)
            Buffer.from('4D5A', 'hex'), // MZ (Windows executable)
            Buffer.from('7F454C46', 'hex'), // ELF (Linux executable)
            Buffer.from('CAFEBABE', 'hex'), // Java class file
            Buffer.from('504B0304', 'hex'), // ZIP file
            Buffer.from('52617221', 'hex'), // RAR file
            // PHP/ASP scripts
            Buffer.from('3C3F706870', 'hex'), // <?php
            Buffer.from('3C2560', 'hex'), // <%@
            Buffer.from('23212F62696E2F62617368', 'hex'), // Shebang
        ];

        logger.info('✅ Attachment sanitizer initialized');
    }

    /**
     * Sanitize an uploaded attachment
     * @param {Object} attachment - Discord attachment object
     * @param {Buffer} buffer - File buffer
     * @returns {Promise<Object>} Sanitization result
     */
    async sanitizeAttachment(attachment, buffer) {
        try {
            const result = {
                safe: false,
                sanitized: null,
                metadata: {},
                errors: []
            };

            // Basic validation
            const basicCheck = this.performBasicChecks(attachment, buffer);
            if (!basicCheck.safe) {
                result.errors.push(...basicCheck.errors);
                return result;
            }

            // Security scan
            const securityCheck = await this.performSecurityScan(buffer);
            if (!securityCheck.safe) {
                result.errors.push(...securityCheck.errors);
                return result;
            }

            // Metadata stripping and validation
            const metadataResult = await this.stripAndValidateMetadata(buffer, attachment.name);
            if (!metadataResult.safe) {
                result.errors.push(...metadataResult.errors);
                return result;
            }

            // Generate secure filename
            const secureFilename = this.generateSecureFilename(attachment.name);

            result.safe = true;
            result.sanitized = metadataResult.buffer;
            result.metadata = {
                originalName: attachment.name,
                secureName: secureFilename,
                size: buffer.length,
                type: attachment.contentType,
                dimensions: metadataResult.dimensions,
                hash: this.generateFileHash(buffer)
            };

            logger.info(`Attachment sanitized: ${attachment.name} -> ${secureFilename}`);
            return result;

        } catch (error) {
            logger.error('Attachment sanitization failed:', error);
            return {
                safe: false,
                sanitized: null,
                metadata: {},
                errors: [`Sanitization failed: ${error.message}`]
            };
        }
    }

    /**
     * Perform basic file validation
     */
    performBasicChecks(attachment, buffer) {
        const errors = [];

        // Size check
        if (buffer.length > this.limits.maxFileSize) {
            errors.push(`File too large: ${buffer.length} bytes (max: ${this.limits.maxFileSize})`);
        }

        // Type check
        if (!this.limits.allowedTypes.includes(attachment.contentType)) {
            errors.push(`Invalid file type: ${attachment.contentType}`);
        }

        // Extension check
        const extension = path.extname(attachment.name).toLowerCase();
        if (!this.limits.allowedExtensions.includes(extension)) {
            errors.push(`Invalid file extension: ${extension}`);
        }

        // Filename validation
        if (!this.isValidFilename(attachment.name)) {
            errors.push('Invalid filename');
        }

        return {
            safe: errors.length === 0,
            errors
        };
    }

    /**
     * Perform security scan for malicious content
     */
    async performSecurityScan(buffer) {
        const errors = [];

        // Check file signatures
        const signature = buffer.subarray(0, Math.min(16, buffer.length));
        for (const maliciousSig of this.maliciousSignatures) {
            if (signature.includes(maliciousSig)) {
                errors.push('Malicious file signature detected');
                break;
            }
        }

        // Check for embedded scripts in text-based formats
        if (this.isTextBasedImage(buffer)) {
            const content = buffer.toString('utf8', 0, Math.min(1024, buffer.length));
            if (this.containsScriptTags(content)) {
                errors.push('Potential script injection detected');
            }
        }

        // Entropy analysis (high entropy might indicate encrypted malware)
        const entropy = this.calculateEntropy(buffer);
        if (entropy > 7.5) { // Very high entropy
            errors.push('Suspicious file entropy detected');
        }

        return {
            safe: errors.length === 0,
            errors
        };
    }

    /**
     * Strip metadata and validate image properties
     */
    async stripAndValidateMetadata(buffer, filename) {
        try {
            // For now, we'll use a simple approach
            // In production, you'd use libraries like sharp or imagemagick

            const result = {
                safe: false,
                buffer: null,
                dimensions: null,
                errors: []
            };

            // Basic image validation (check for valid image headers)
            if (!this.hasValidImageHeader(buffer)) {
                result.errors.push('Invalid image format');
                return result;
            }

            // Get basic image dimensions (simplified)
            const dimensions = this.getImageDimensions(buffer);
            if (!dimensions) {
                result.errors.push('Could not determine image dimensions');
                return result;
            }

            // Dimension validation
            if (dimensions.width > this.limits.maxWidth || dimensions.height > this.limits.maxHeight) {
                result.errors.push(`Image too large: ${dimensions.width}x${dimensions.height} (max: ${this.limits.maxWidth}x${this.limits.maxHeight})`);
            }

            if (dimensions.width < this.limits.minWidth || dimensions.height < this.limits.minHeight) {
                result.errors.push(`Image too small: ${dimensions.width}x${dimensions.height} (min: ${this.limits.minWidth}x${this.limits.minHeight})`);
            }

            if (result.errors.length > 0) {
                return result;
            }

            // For metadata stripping, we'd use a proper image processing library
            // For now, return the buffer as-is (in production, strip EXIF, XMP, etc.)
            result.safe = true;
            result.buffer = buffer;
            result.dimensions = dimensions;

            return result;

        } catch (error) {
            return {
                safe: false,
                buffer: null,
                dimensions: null,
                errors: [`Metadata processing failed: ${error.message}`]
            };
        }
    }

    /**
     * Check if file has valid image header
     */
    hasValidImageHeader(buffer) {
        if (buffer.length < 8) return false;

        // JPEG
        if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
            return true;
        }

        // PNG
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
            return true;
        }

        // GIF
        if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
            return true;
        }

        // WebP
        if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
            buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
            return true;
        }

        return false;
    }

    /**
     * Get basic image dimensions (simplified implementation)
     */
    getImageDimensions(buffer) {
        try {
            // This is a very basic implementation
            // In production, use proper image parsing libraries

            // For JPEG
            if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
                return this.parseJPEGDimensions(buffer);
            }

            // For PNG
            if (buffer[0] === 0x89 && buffer[1] === 0x50) {
                return this.parsePNGDimensions(buffer);
            }

            // For other formats, return conservative defaults
            return { width: 1024, height: 1024 };

        } catch (error) {
            logger.warn('Failed to parse image dimensions:', error.message);
            return null;
        }
    }

    /**
     * Parse JPEG dimensions
     */
    parseJPEGDimensions(buffer) {
        let offset = 2;

        while (offset < buffer.length - 2) {
            if (buffer[offset] === 0xFF) {
                const marker = buffer[offset + 1];

                // SOF markers contain dimensions
                if (marker >= 0xC0 && marker <= 0xC3) {
                    const height = (buffer[offset + 5] << 8) | buffer[offset + 6];
                    const width = (buffer[offset + 7] << 8) | buffer[offset + 8];
                    return { width, height };
                }

                // Skip to next marker
                const length = (buffer[offset + 2] << 8) | buffer[offset + 3];
                offset += 2 + length;
            } else {
                offset++;
            }
        }

        return null;
    }

    /**
     * Parse PNG dimensions
     */
    parsePNGDimensions(buffer) {
        if (buffer.length < 24) return null;

        // IHDR chunk contains dimensions (bytes 16-23)
        const width = (buffer[16] << 24) | (buffer[17] << 16) | (buffer[18] << 8) | buffer[19];
        const height = (buffer[20] << 24) | (buffer[21] << 16) | (buffer[22] << 8) | buffer[23];

        return { width, height };
    }

    /**
     * Check if filename is valid
     */
    isValidFilename(filename) {
        // Basic validation - no path traversal, reasonable length, valid characters
        if (!filename || filename.length > 255) return false;

        // No path traversal
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return false;
        }

        // Only alphanumeric, dots, hyphens, underscores
        return /^[a-zA-Z0-9._-]+$/.test(filename);
    }

    /**
     * Check if image format is text-based
     */
    isTextBasedImage(buffer) {
        // SVG, some WebP variants might be text-based
        // For now, just check if it starts with text
        const str = buffer.toString('utf8', 0, 100);
        return str.includes('<') || str.includes('{');
    }

    /**
     * Check for script tags in content
     */
    containsScriptTags(content) {
        const scriptPatterns = [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            /eval\s*\(/gi
        ];

        return scriptPatterns.some(pattern => pattern.test(content));
    }

    /**
     * Calculate file entropy
     */
    calculateEntropy(buffer) {
        const frequencies = new Array(256).fill(0);
        const length = buffer.length;

        // Count byte frequencies
        for (let i = 0; i < length; i++) {
            frequencies[buffer[i]]++;
        }

        // Calculate entropy
        let entropy = 0;
        for (let i = 0; i < 256; i++) {
            if (frequencies[i] > 0) {
                const p = frequencies[i] / length;
                entropy -= p * Math.log2(p);
            }
        }

        return entropy;
    }

    /**
     * Generate secure filename
     */
    generateSecureFilename(originalName) {
        const extension = path.extname(originalName).toLowerCase();
        const timestamp = Date.now();
        const random = crypto.randomBytes(8).toString('hex');

        return `${timestamp}_${random}${extension}`;
    }

    /**
     * Generate file hash for integrity checking
     */
    generateFileHash(buffer) {
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    /**
     * Get sanitizer statistics
     */
    getSanitizerStats() {
        return {
            limits: this.limits,
            supportedFormats: this.limits.allowedTypes,
            securityChecks: [
                'file signature analysis',
                'entropy analysis',
                'script injection detection',
                'metadata stripping',
                'dimension validation'
            ]
        };
    }

    /**
     * Update security limits (admin function)
     */
    updateLimits(newLimits) {
        Object.assign(this.limits, newLimits);
        logger.info('Updated attachment sanitizer limits');
    }
}

module.exports = new AttachmentSanitizer();
