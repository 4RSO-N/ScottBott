const axios = require('axios');
const logger = require('../utils/logger');

class HuggingFaceService {
    constructor() {
        this.apiKey = process.env.HUGGINGFACE_API_KEY;
        if (!this.apiKey) {
            throw new Error('HUGGINGFACE_API_KEY is required');
        }

    // Using FLUX.1-schnell for faster, lower-memory generation
    // FLUX.1-dev is higher-quality but may cause OOM on some HF nodes
        // Alternative options:
        // - 'black-forest-labs/FLUX.1-schnell' (faster but lower quality)
        // - 'stabilityai/stable-diffusion-xl-base-1.0' (better prompt adherence)
        // - 'stabilityai/sdxl-turbo' (very fast)
    this.imageModel = 'black-forest-labs/FLUX.1-schnell';
        this.baseURL = 'https://api-inference.huggingface.co/models';
        
        this.client = axios.create({
            baseURL: this.baseURL,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
            },
            timeout: 60000, // 60 seconds for image generation
            responseType: 'arraybuffer' // Important for image data
        });

        logger.info('✅ Hugging Face service initialized with FLUX.1-dev');

        // Retry config
        this.maxRetries = Number.parseInt(process.env.HF_MAX_RETRIES || '2', 10);
        this.baseDelayMs = Number.parseInt(process.env.HF_RETRY_BASE_DELAY_MS || '1500', 10);
    }

    /**
     * Generate image using Hugging Face Inference API
     */
    async generateImage(prompt, options = {}) {
        try {
            logger.info(`Generating image with Hugging Face: "${prompt.substring(0, 50)}..."`);

            const requestData = {
                inputs: prompt,
                    // FLUX schnell doesn't use these parameters
            };

            const doRequest = async () => {
                return await this.client.post(`/${this.imageModel}`, requestData, {
                    headers: { 'Accept': '*/*' }
                });
            };

            const response = await this.withRetries(doRequest);

            // Check if model is loading
            if (response.headers['content-type']?.includes('application/json')) {
                const jsonData = JSON.parse(Buffer.from(response.data).toString());
                if (jsonData.error?.includes('loading')) {
                    const estimatedTime = jsonData.estimated_time || 20;
                    logger.warn(`Model loading, estimated time: ${estimatedTime}s`);
                    
                    // Wait and retry
                    await new Promise(resolve => setTimeout(resolve, estimatedTime * 1000));
                    return this.generateImage(prompt, options);
                }
                throw new Error(jsonData.error || 'Unknown error from Hugging Face');
            }

            // Response is image data
            const imageBuffer = Buffer.from(response.data);
            
            if (imageBuffer.length === 0) {
                throw new Error('Received empty image data');
            }

            logger.info('Successfully generated image via Hugging Face');
            
            return {
                success: true,
                imageBuffer: imageBuffer,
                provider: 'HuggingFace',
                model: this.imageModel,
                prompt: prompt,
                format: 'png'
            };

        } catch (error) {
            // Better error logging
            if (error.response) {
                const errorText = Buffer.from(error.response.data).toString();
                logger.error('Hugging Face API error:', {
                    status: error.response.status,
                    error: errorText.substring(0, 200)
                });
                
                if (error.response.status === 503) {
                    throw new Error('Hugging Face model is currently unavailable. Try again in a moment.');
                } else if (error.response.status === 429) {
                    throw new Error('Rate limit exceeded. Please try again later.');
                }
            } else if (error.request) {
                logger.error('Hugging Face no response:', error.message);
            } else {
                logger.error('Hugging Face request error:', error.message);
            }

            throw error;
        }
    }

    /**
     * Generic retry wrapper with exponential backoff and jitter for transient HF errors
     */
    async withRetries(fn) {
        let attempt = 0;
        let lastError;
        while (attempt <= this.maxRetries) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                const status = error.response?.status;
                const retriable = status === 429 || status === 503 || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT';
                if (!retriable || attempt === this.maxRetries) break;
                const delay = Math.round((this.baseDelayMs * Math.pow(2, attempt)) * (1 + Math.random() * 0.2));
                logger.warn(`HF request failed (status ${status || error.code}). Retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`);
                await new Promise(r => setTimeout(r, delay));
                attempt++;
            }
        }
        throw lastError;
    }

    /**
     * Check if service is available
     */
    async healthCheck() {
        try {
            const testPrompt = "test";
            await this.generateImage(testPrompt);
            return true;
        } catch (error) {
            logger.warn('Hugging Face health check failed:', error.message);
            return false;
        }
    }
}

module.exports = HuggingFaceService;
