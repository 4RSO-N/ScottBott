const axios = require('axios');
const logger = require('./logger');

class ImageProcessor {
    constructor() {
        this.supportedFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        this.maxFileSize = 10 * 1024 * 1024; // 10MB
        this.maxImageDimension = 4096; // 4K max
    }

    /**
     * Download and validate image from Discord attachment
     */
    async processDiscordAttachment(attachment) {
        try {
            // Validate file extension
            const fileExtension = attachment.name.split('.').pop().toLowerCase();
            if (!this.supportedFormats.includes(fileExtension)) {
                throw new Error(`Unsupported image format: ${fileExtension}. Supported formats: ${this.supportedFormats.join(', ')}`);
            }

            // Validate file size
            if (attachment.size > this.maxFileSize) {
                throw new Error(`Image too large: ${Math.round(attachment.size / 1024 / 1024)}MB. Max size: ${this.maxFileSize / 1024 / 1024}MB`);
            }

            // Download image
            const response = await axios.get(attachment.url, {
                responseType: 'arraybuffer',
                timeout: 30000,
                maxContentLength: this.maxFileSize
            });

            const imageBuffer = Buffer.from(response.data);
            
            // Get image metadata
            const metadata = await this.getImageMetadata(imageBuffer);
            
            logger.info(`Processed image: ${attachment.name}, Size: ${metadata.size}KB, Dimensions: ${metadata.width}x${metadata.height}`);

            return {
                success: true,
                buffer: imageBuffer,
                metadata: {
                    filename: attachment.name,
                    format: fileExtension,
                    size: Math.round(imageBuffer.length / 1024), // Size in KB
                    originalSize: attachment.size,
                    width: metadata.width,
                    height: metadata.height,
                    mimeType: this.getMimeType(fileExtension)
                }
            };

        } catch (error) {
            logger.error('Error processing image:', error.message);
            throw new Error(`Failed to process image: ${error.message}`);
        }
    }

    /**
     * Get basic image metadata without external dependencies
     */
    async getImageMetadata(buffer) {
        // Simple metadata extraction without requiring additional dependencies
        // In a production environment, you might want to use a library like 'sharp' or 'jimp'
        
        let width = 0;
        let height = 0;

        try {
            // Basic PNG dimension detection
            if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
                width = buffer.readUInt32BE(16);
                height = buffer.readUInt32BE(20);
            }
            // Basic JPEG dimension detection (simplified)
            else if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
                // This is a simplified JPEG parser - in production, use a proper library
                width = 1920; // Default assumption
                height = 1080;
            }
            // Basic GIF dimension detection
            else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
                width = buffer.readUInt16LE(6);
                height = buffer.readUInt16LE(8);
            }
        } catch (error) {
            logger.warn('Could not extract image dimensions:', error.message);
        }

        return {
            width: width || 'unknown',
            height: height || 'unknown',
            size: Math.round(buffer.length / 1024)
        };
    }

    /**
     * Get MIME type from file extension
     */
    getMimeType(extension) {
        const mimeTypes = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp'
        };

        return mimeTypes[extension.toLowerCase()] || 'image/jpeg';
    }

    /**
     * Validate image dimensions
     */
    validateImageDimensions(width, height) {
        if (width > this.maxImageDimension || height > this.maxImageDimension) {
            throw new Error(`Image dimensions too large: ${width}x${height}. Max dimension: ${this.maxImageDimension}px`);
        }
        return true;
    }

    /**
     * Create image analysis prompt based on image type and user request
     */
    createAnalysisPrompt(userPrompt, metadata) {
        let prompt = userPrompt || "Describe this image in detail";
        
        // Add context based on image metadata
        const contextInfo = [
            `Image format: ${metadata.format.toUpperCase()}`,
            `Dimensions: ${metadata.width}x${metadata.height}`,
            `File size: ${metadata.size}KB`
        ];

        return {
            prompt: prompt,
            context: contextInfo.join(', '),
            enhancedPrompt: `${prompt}\n\nImage context: ${contextInfo.join(', ')}`
        };
    }

    /**
     * Generate image processing statistics
     */
    getProcessingStats() {
        return {
            supportedFormats: this.supportedFormats,
            maxFileSize: `${this.maxFileSize / 1024 / 1024}MB`,
            maxImageDimension: `${this.maxImageDimension}px`,
            features: [
                'Format validation',
                'Size checking',
                'Metadata extraction',
                'Discord attachment processing'
            ]
        };
    }

    /**
     * Create image processing result embed
     */
    createProcessingEmbed(metadata, analysisResult) {
        return {
            title: '🖼️ Image Analysis Complete',
            description: analysisResult,
            fields: [
                {
                    name: '📁 File Info',
                    value: `**Format:** ${metadata.format.toUpperCase()}\n**Size:** ${metadata.size}KB\n**Dimensions:** ${metadata.width}x${metadata.height}`,
                    inline: true
                },
                {
                    name: '🔍 Analysis',
                    value: 'Powered by Gemini Vision AI',
                    inline: true
                }
            ],
            color: 0x4285f4,
            footer: {
                text: `Processed ${metadata.filename}`
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Handle multiple images in a message
     */
    async processMultipleImages(attachments) {
        const results = [];
        const errors = [];

        for (const attachment of attachments) {
            try {
                const result = await this.processDiscordAttachment(attachment);
                results.push(result);
            } catch (error) {
                errors.push({
                    filename: attachment.name,
                    error: error.message
                });
            }
        }

        return {
            successful: results,
            failed: errors,
            totalProcessed: results.length,
            totalFailed: errors.length
        };
    }
}

module.exports = ImageProcessor;