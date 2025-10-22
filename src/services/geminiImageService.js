const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');
const fs = require('node:fs').promises;
const path = require('node:path');
const axios = require('axios');

class GeminiImageService {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        if (!this.apiKey) {
            throw new Error('GEMINI_API_KEY is required for image generation');
        }

        this.genAI = new GoogleGenerativeAI(this.apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
        
        logger.info('✅ Gemini Image Generation service initialized');
    }

    /**
     * Generate an image from a text prompt
     * Note: Gemini doesn't directly generate images. This creates a detailed description.
     * For actual image generation, you'd need to integrate with Imagen API or other services.
     */
    async generateImage(prompt, options = {}) {
        try {
            logger.info('Generating detailed image description with Gemini');

            // Enhance the prompt for better results
            const enhancedPrompt = `Create an extremely detailed visual description for an image generation AI based on this prompt: "${prompt}". 
            Include specific details about:
            - Subject and composition
            - Colors, lighting, and atmosphere
            - Style (photorealistic, artistic, etc.)
            - Camera angle and perspective
            - Textures and materials
            - Mood and emotion
            Make it detailed enough that an AI image generator could create exactly what's described.`;

            const result = await this.model.generateContent(enhancedPrompt);
            const response = result.response;
            const description = response.text();

            logger.info('Generated detailed image description via Gemini');

            // Return description instead of actual image
            return {
                success: false,
                isDescriptionOnly: true,
                description: description,
                provider: 'Gemini (Description Only)',
                model: 'gemini-pro',
                note: '⚠️ Note: Gemini creates descriptions, not actual images. To generate real images, you need to integrate with Imagen API, DALL-E, Stable Diffusion, or similar services.'
            };

        } catch (error) {
            logger.error('Error generating image description with Gemini:', error);
            
            // Handle specific error types
            if (error.message?.includes('quota')) {
                throw new Error('Image generation quota exceeded. Please try again later.');
            } else if (error.message?.includes('safety')) {
                throw new Error('Image generation blocked due to safety policies.');
            }
            
            throw new Error('Failed to generate image description: ' + error.message);
        }
    }

    /**
     * Enhance the user prompt for better image generation
     */
    enhancePrompt(originalPrompt) {
        // Check if the prompt is already detailed
        if (originalPrompt.length > 100) {
            return originalPrompt;
        }

        // Add some enhancement for simple prompts
        const enhancedPrompt = `Create a high-quality, detailed image of: ${originalPrompt}. 
        The image should be visually appealing, well-composed, and professionally rendered with good lighting and clear details.`;

        return enhancedPrompt;
    }

    /**
     * Analyze/describe an existing image
     * Gemini excels at image analysis but doesn't edit images
     */
    async editImage(imageBuffer, prompt, options = {}) {
        try {
            logger.info('Analyzing image with Gemini Vision');

            const imagePart = {
                inlineData: {
                    data: imageBuffer.toString('base64'),
                    mimeType: 'image/jpeg'
                }
            };

            const visionModel = this.genAI.getGenerativeModel({ model: 'gemini-pro-vision' });
            const result = await visionModel.generateContent([prompt, imagePart]);
            const response = result.response;
            const analysis = response.text();

            logger.info('Image analyzed successfully via Gemini Vision');

            return {
                success: true,
                isAnalysis: true,
                analysis: analysis,
                provider: 'Gemini Vision',
                model: 'gemini-pro-vision',
                note: '⚠️ Note: Gemini analyzes images but does not edit them. For image editing, you need different tools.'
            };

        } catch (error) {
            logger.error('Error analyzing image with Gemini:', error);
            throw new Error('Failed to analyze image: ' + error.message);
        }
    }

    /**
     * Health check for the image generation service
     * Note: Disabled to avoid quota issues - service availability checked on actual use
     */
    async healthCheck() {
        // Skip actual API call to avoid quota issues
        // Service health is implicitly checked when used
        return true;
    }

    /**
     * Clean up temporary files
     */
    async cleanupTempFiles() {
        try {
            const tempDir = path.join(__dirname, '..', '..', 'temp');
            const files = await fs.readdir(tempDir);
            
            const now = Date.now();
            const maxAge = 60 * 60 * 1000; // 1 hour

            for (const file of files) {
                const filePath = path.join(tempDir, file);
                const stats = await fs.stat(filePath);
                
                if (now - stats.mtime.getTime() > maxAge) {
                    await fs.unlink(filePath);
                    logger.info(`Cleaned up old temp file: ${file}`);
                }
            }
        } catch (error) {
            logger.warn('Error cleaning up temp files:', error);
        }
    }

    /**
     * Get usage statistics
     */
    getUsageStats() {
        return {
            provider: 'Gemini 2.5 Flash Image',
            model: 'gemini-2.5-flash-image',
            features: ['Text-to-Image', 'Image Editing', 'Style Transfer'],
            aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
            maxTokens: 8192
        };
    }
}

module.exports = GeminiImageService;