const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const logger = require('../utils/logger');

class GeminiService {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        if (!this.apiKey) {
            throw new Error('GEMINI_API_KEY is required');
        }

        this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.textModel = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    this.visionModel = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        this.imageModel = 'imagen-3.0-generate-001'; // Imagen 3 model
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

        // Warm connection pool configuration
        this.connectionPool = {
            maxSockets: 10,
            maxFreeSockets: 5,
            timeout: 60000,
            keepAlive: true,
            keepAliveMsecs: 30000
        };

        // Create axios instance with connection pooling
        this.httpClient = axios.create({
            baseURL: this.baseUrl,
            timeout: 60000,
            headers: {
                'Content-Type': 'application/json',
                'Connection': 'keep-alive'
            },
            // HTTP/2 and connection pooling
            httpAgent: new (require('node:http').Agent)({
                keepAlive: true,
                maxSockets: 10,
                maxFreeSockets: 5
            }),
            httpsAgent: new (require('node:https').Agent)({
                keepAlive: true,
                keepAliveMsecs: 30000,
                maxSockets: 10,
                maxFreeSockets: 5,
                rejectUnauthorized: true
            })
        });

        // Warm up connections asynchronously (don't block constructor)
        setTimeout(() => this.warmupConnections(), 100);

        // Rate limiting tracking
        this.rateLimitState = {
            isLimited: false,
            resetTime: 0,
            retryAfter: 0,
            consecutiveFailures: 0
        };

        logger.info('✅ Gemini service initialized with connection pooling');
    }

    /**
     * Warm up HTTP connections to avoid cold starts
     */
    async warmupConnections() {
        // Make a lightweight request to establish connections
        const warmupPromises = [];

        // Warm up text model connection (best-effort)
        try {
            warmupPromises.push(
                this.textModel.generateContent('Hello')
                    .then(() => logger.debug('Text model connection warmed up'))
                    .catch(err => logger.warn('Text model warmup failed:', err?.message || err))
            );

            // Image analysis warmup intentionally disabled
            await Promise.allSettled(warmupPromises);
        } catch (err) {
            logger.debug('Warmup encountered an error (ignored):', err?.message || err);
        }

    }

    async generateImage(prompt, options = {}) {
        try {
            logger.info('Generating image with Imagen 3', { 
                prompt: prompt.substring(0, 100)
            });

            // Imagen 3 API endpoint
            const endpoint = `models/${this.imageModel}:predict`;
            
            const requestData = {
                instances: [{
                    prompt: prompt
                }],
                parameters: {
                    sampleCount: options.sampleCount || 1,
                    aspectRatio: options.aspectRatio || "1:1", // 1:1, 16:9, 9:16, 4:3, 3:4
                    safetyFilterLevel: options.safetyFilter || "block_some",
                    personGeneration: options.personGeneration || "allow_adult"
                }
            };

            const response = await this.httpClient.post(
                `${endpoint}?key=${this.apiKey}`,
                requestData
            );

            // Check for valid response with image data
            if (response.data?.predictions && response.data.predictions.length > 0) {
                const prediction = response.data.predictions[0];
                
                if (prediction.bytesBase64Encoded) {
                    logger.info('Successfully generated image with Imagen 3');
                    
                    return {
                        success: true,
                        imageData: prediction.bytesBase64Encoded,
                        mimeType: prediction.mimeType || 'image/png',
                        model: this.imageModel,
                        prompt: prompt
                    };
                }
            }

            throw new Error('No image data found in Imagen response');

        } catch (error) {
            logger.error('Error generating image with Imagen:', error.response?.data || error.message);
            
            // Handle rate limiting
            if (error.response?.status === 429) {
                this.handleRateLimit(error.response);
                throw new Error('Rate limit exceeded for Imagen API');
            } else if (error.response?.status === 401 || error.response?.status === 403) {
                throw new Error('Invalid API key or Imagen API not enabled');
            } else if (error.response?.status === 400) {
                const errorMessage = error.response?.data?.error?.message || 'Invalid request';
                throw new Error(`Imagen API error: ${errorMessage}`);
            }
            
            throw new Error(`Failed to generate image: ${error.message}`);
        }
    }

    /**
     * Handle rate limit responses and update state
     * @param {Object} response - Axios response object
     */
    handleRateLimit(response) {
        const now = Date.now();
        const retryAfter = response.headers['retry-after'] || 60; // Default 60 seconds
        
        this.rateLimitState.isLimited = true;
        this.rateLimitState.resetTime = now + (retryAfter * 1000);
        this.rateLimitState.retryAfter = retryAfter;
        this.rateLimitState.consecutiveFailures++;

        logger.warn(`Rate limited by Gemini API. Retry after ${retryAfter}s. Failures: ${this.rateLimitState.consecutiveFailures}`);
    }

    /**
     * Check if currently rate limited
     * @returns {Object} Rate limit status
     */
    getRateLimitStatus() {
        const now = Date.now();
        
        // Reset if limit has expired
        if (this.rateLimitState.isLimited && now > this.rateLimitState.resetTime) {
            this.rateLimitState.isLimited = false;
            this.rateLimitState.consecutiveFailures = 0;
            logger.info('Rate limit reset, service available again');
        }

        return {
            isLimited: this.rateLimitState.isLimited,
            resetTime: this.rateLimitState.resetTime,
            retryAfter: Math.max(0, Math.ceil((this.rateLimitState.resetTime - now) / 1000)),
            consecutiveFailures: this.rateLimitState.consecutiveFailures
        };
    }

    /**
     * Get recommended action when rate limited
     * @returns {Object} Recommendation object
     */
    getRateLimitRecommendation() {
        const status = this.getRateLimitStatus();
        
        if (!status.isLimited) {
            return { action: 'proceed', reason: 'not_rate_limited' };
        }

        // For high failure counts, suggest queue with ETA
        if (status.consecutiveFailures > 2) {
            return {
                action: 'queue_with_eta',
                eta: status.retryAfter,
                reason: 'high_failure_rate'
            };
        }

        // For moderate limits, suggest fast tier
        return {
            action: 'use_fast_tier',
            eta: status.retryAfter,
            reason: 'moderate_limit'
        };
    }

    /**
     * Generate an enhanced image description/prompt for image generation
     * @param {string} userPrompt - User's prompt
     * @returns {Promise<string>} Enhanced prompt for image generation
     */
    async generateImageDescription(prompt) {
        try {
            const enhancedPrompt = `Create a detailed, vivid image generation prompt based on this request: "${prompt}". 
Include specific details about:
- Visual style and artistic approach
- Colors, lighting, and atmosphere
- Composition and perspective
- Key elements and their arrangement
- Mood and feeling

Keep it under 200 words and make it optimized for AI image generation.`;

            const result = await this.textModel.generateContent(enhancedPrompt);
            const response = result.response;
            const description = response.text();

            logger.info('Generated enhanced image description via Gemini');
            return description;

        } catch (error) {
            logger.error('Error generating image description with Gemini:', error);
            // Return original prompt as fallback
            return prompt;
        }
    }

    /**
     * Generate text response using Gemini
     */
    async generateText(prompt, context = {}) {
        try {
            // Centralized personality prompt
            const { getSystemPrompt } = require('../config/personality');
            const system = getSystemPrompt({
                username: context?.username,
                displayName: context?.displayName
            });
            const enhancedPrompt = `${system}

User: ${prompt}`;

            const result = await this.textModel.generateContent(enhancedPrompt);
            const response = result.response;
            const text = response.text();

            logger.info('Generated text response via Gemini');
            return {
                success: true,
                text: text,
                provider: 'Gemini'
            };

        } catch (error) {
            logger.error('Error generating text with Gemini:', error);
            throw new Error('Failed to generate text response');
        }
    }

    /**
     * Analyze image content (when users upload images)
     */
    // Image analysis via Gemini Vision AI is disabled/removed as requested.
    async analyzeImage() {
        return {
            success: false,
            analysis: '❌ Image analysis is disabled.',
            provider: 'Gemini Vision'
        };
    }

    /**
     * Check if the service is available
     */
    async healthCheck() {
        try {
            const result = await this.textModel.generateContent('Hello');
            const response = result.response;
            
            if (response.text()) {
                logger.info('✅ Gemini health check passed');
                return {
                    status: 'healthy',
                    model: 'gemini-2.5-flash',
                    available: true
                };
            }

            throw new Error('Invalid response');

        } catch (error) {
            logger.error('❌ Gemini health check failed:', error.message);
            return {
                status: 'unhealthy',
                model: 'gemini-2.5-flash',
                available: false,
                error: error.message
            };
        }
    }

    /**
     * Get usage statistics (mock implementation)
     */
    getUsageStats() {
        return {
            provider: 'Gemini',
            requests: 0, // Would track actual requests in production
            rateLimit: '60 requests per minute',
            features: ['Text Generation', 'Image Analysis', 'Vision Understanding']
        };
    }
}

module.exports = GeminiService;