const axios = require('axios');
const logger = require('../utils/logger');

class PerplexityService {
    constructor() {
        this.apiKey = process.env.PERPLEXITY_API_KEY;
        if (!this.apiKey) {
            throw new Error('PERPLEXITY_API_KEY is required');
        }

        this.baseURL = 'https://api.perplexity.ai';
        this.client = axios.create({
            baseURL: this.baseURL,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 45000 // 45 seconds - very generous timeout to see what happens
        });

        logger.info('✅ Perplexity service initialized');
    }

    /**
     * Strip citation numbers and source references from text
     */
    stripCitations(text) {
        if (!text) return text;
        
        // Remove citation numbers like [1], [2], [3][4], etc.
        let cleaned = text.replace(/\[\d+\](\[\d+\])*/g, '');
        
        // Remove extra spaces left by removed citations
        cleaned = cleaned.replace(/\s{2,}/g, ' ');
        
        // Clean up spacing around punctuation
        cleaned = cleaned.replace(/\s+([.,!?])/g, '$1');
        
        // Trim any leading/trailing whitespace
        cleaned = cleaned.trim();
        
        return cleaned;
    }

    /**
     * Clean up completion to avoid repetition
     */
    cleanCompletion(original, completion) {
        // Remove quotes if AI added them
        completion = completion.replace(/^["']|["']$/g, '');
        
        // If completion starts with part of the original, it's trying to repeat it
        // Just append the new part
        const lastWords = original.split(' ').slice(-5).join(' ');
        if (completion.toLowerCase().includes(lastWords.toLowerCase())) {
            // Find where the overlap ends and take only the new content
            const overlapIndex = completion.toLowerCase().indexOf(lastWords.toLowerCase());
            if (overlapIndex !== -1) {
                const afterOverlap = completion.substring(overlapIndex + lastWords.length).trim();
                return original + ' ' + afterOverlap;
            }
        }
        
        // Otherwise just append
        return original + ' ' + completion;
    }

    /**
     * Detect if content contains code and format it appropriately
     */
    formatResponseWithEmbed(content) {
        // Check for code blocks (```language or just ```)
        const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
        const hasCodeBlock = codeBlockRegex.test(content);
        
        logger.debug(`Code block detected: ${hasCodeBlock}`);
        
        if (!hasCodeBlock) {
            // No code blocks, return simple text response
            return {
                success: true,
                text: content,
                provider: 'Perplexity',
                embed: null
            };
        }

        logger.info('Creating code embed for response');
        
        // Extract code blocks and create embed
        const codeBlocks = [];
        let restoreRegex = /```(\w+)?\n?([\s\S]*?)```/g;
        let match;
        let textWithoutCode = content;

        while ((match = restoreRegex.exec(content)) !== null) {
            const language = match[1] || 'text';
            const code = match[2].trim();
            codeBlocks.push({ language, code });
            textWithoutCode = textWithoutCode.replace(match[0], `[Code: ${language}]`);
        }

        // Create embed with code
        const embed = {
            color: 0x00d9ff, // Perplexity blue
            title: '💻 Code Response',
            description: textWithoutCode.length > 0 ? textWithoutCode.substring(0, 2000) : 'Here\'s the code:',
            fields: codeBlocks.slice(0, 3).map((block, idx) => ({
                name: `\`${block.language}\` ${codeBlocks.length > 1 ? `(${idx + 1}/${codeBlocks.length})` : ''}`,
                value: `\`\`\`${block.language}\n${block.code.substring(0, 1000)}\n\`\`\``,
                inline: false
            })),
            footer: {
                text: 'Powered by Perplexity Sonar'
            },
            timestamp: new Date().toISOString()
        };

        return {
            success: true,
            text: codeBlocks.length > 3 ? '⚠️ Response truncated - showing first 3 code blocks' : null,
            provider: 'Perplexity',
            embed: embed
        };
    }

    /**
     * Generate chat response using Perplexity AI
     */
    async generateChatResponse(prompt, context = {}) {
        try {
            // Use provided conversation context if present
            let messages = Array.isArray(context?.conversationContext?.messages)
                ? context.conversationContext.messages.slice()
                : (() => {
                    const { getSystemPrompt } = require('../config/personality');
                    return [{
                        role: 'system',
                        content: getSystemPrompt({
                            username: context?.username,
                            displayName: context?.displayName
                        })
                    }];
                })();

            // Ensure the latest user message is present at the end
            if (!messages.length || messages[messages.length - 1]?.role !== 'user') {
                messages.push({ role: 'user', content: prompt });
            }

            const requestData = {
                model: 'sonar', // Perplexity Sonar model
                messages: messages,
                max_tokens: 300, // Allow longer responses (was 50)
                temperature: 0.7, // Balanced creativity
                top_p: 0.9,
                stream: false,
                search_domain_filter: [], // Try to disable web search
                return_citations: false, // Disable citation numbers
                return_related_questions: false // No related questions
            };

            const response = await this.client.post('/chat/completions', requestData);
            
            if (response.data?.choices?.length > 0) {
                let rawContent = response.data.choices[0].message.content;
                const finishReason = response.data.choices[0].finish_reason;
                
                // Check if response was cut off due to token limit
                if (finishReason === 'length') {
                    logger.warn('Response hit token limit, requesting completion...');
                    
                    // Ask for a shorter, complete version
                    const completionRequest = {
                        model: 'sonar',
                        messages: [
                            {
                                role: 'system',
                                content: 'Complete this sentence naturally and briefly. Add only what\'s needed to finish the thought properly.'
                            },
                            {
                                role: 'user',
                                content: `Complete this: "${rawContent}"`
                            }
                        ],
                        max_tokens: 100,
                        temperature: 0.7,
                        stream: false,
                        return_citations: false
                    };
                    
                    try {
                        const completionResponse = await this.client.post('/chat/completions', completionRequest);
                        if (completionResponse.data?.choices?.length > 0) {
                            const completion = completionResponse.data.choices[0].message.content;
                            // Remove any repetition of the start
                            rawContent = this.cleanCompletion(rawContent, completion);
                            logger.info('Successfully completed cut-off response');
                        }
                    } catch (completionError) {
                        logger.warn('Failed to complete response, using truncated version');
                        // Add ellipsis if incomplete
                        if (!rawContent.match(/[.!?]$/)) {
                            rawContent += '...';
                        }
                    }
                }
                
                // Strip out citation numbers for cleaner conversational responses
                const cleanedContent = this.stripCitations(rawContent);
                
                // Format with embed if code is detected
                const formattedResponse = this.formatResponseWithEmbed(cleanedContent);
                
                logger.info('Generated chat response via Perplexity');
                return {
                    ...formattedResponse,
                    model: requestData.model,
                    usage: response.data.usage || {}
                };
            } else {
                throw new Error('Invalid response format from Perplexity API');
            }

        } catch (error) {
            // Better error logging
            if (error.response) {
                logger.error('Perplexity API error:', {
                    status: error.response.status,
                    data: error.response.data,
                    headers: error.response.headers
                });
            } else if (error.request) {
                logger.error('Perplexity no response:', error.message);
            } else {
                logger.error('Perplexity request setup error:', error.message);
            }
            
            // Handle specific error types
            if (error.response?.status === 429) {
                throw new Error('Rate limit exceeded. Please try again later.');
            } else if (error.response?.status === 401) {
                throw new Error('Invalid API key - check your PERPLEXITY_API_KEY');
            } else if (error.response?.status === 400) {
                throw new Error('Invalid request to Perplexity API.');
            } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                throw new Error('Request timed out - Perplexity is slow right now');
            }
            
            throw new Error('Failed to generate chat response');
        }
    }

    /**
     * Generate search-based response for current information
     */
    async searchAndRespond(query, context = {}) {
        try {
            const messages = [
                {
                    role: 'system',
                    content: `You are ScottBot, a friendly Discord chatbot. The user has explicitly asked you to search for current information.
                    Provide accurate, recent information in a casual and conversational way.
                    Keep it concise and natural - don't be overly formal.
                    You're helping ${context.displayName || context.username || 'someone'}.`
                },
                {
                    role: 'user',
                    content: `Search for current information about: ${query}`
                }
            ];

            const requestData = {
                model: 'sonar',
                messages: messages,
                max_tokens: 1200,
                temperature: 0.3, // Lower temperature for factual information
                top_p: 0.9,
                stream: false
            };

            const response = await this.client.post('/chat/completions', requestData);
            
            if (response.data?.choices?.length > 0) {
                const content = response.data.choices[0].message.content;
                
                logger.info('Generated search response via Perplexity');
                return {
                    success: true,
                    text: content,
                    provider: 'Perplexity Search',
                    model: requestData.model,
                    usage: response.data.usage || {}
                };
            } else {
                throw new Error('Invalid response format from Perplexity API');
            }

        } catch (error) {
            logger.error('Error with search request to Perplexity:', error.response?.data || error.message);
            throw new Error('Failed to search for information');
        }
    }

    /**
     * Check if this is a search-worthy query - only trigger for very explicit search requests
     */
    isSearchQuery(prompt) {
        const lowerPrompt = prompt.toLowerCase();
        
        // Only trigger search for very explicit search requests
        const explicitSearchRequests = [
            'search for',
            'look up',
            'find information about',
            'what is the weather in',
            'weather in',
            'stock price of',
            'current price of',
            'news about',
            'latest news on',
            'what\'s happening with',
            'current events about',
            'trending topics about'
        ];
        
        return explicitSearchRequests.some(phrase => lowerPrompt.includes(phrase));
    }

    /**
     * Health check for Perplexity service
     */
    async healthCheck() {
        try {
            const response = await this.client.post('/chat/completions', {
                model: 'sonar',
                messages: [
                    {
                        role: 'user',
                        content: 'Say OK'
                    }
                ],
                max_tokens: 10,
                temperature: 0
            });

            const isHealthy = Boolean(response.data?.choices?.[0]?.message?.content);
            if (isHealthy) {
                logger.info('✅ Perplexity health check passed');
            }
            return isHealthy;
        } catch (error) {
            logger.error('❌ Perplexity health check failed:', {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                message: error.message
            });
            return false;
        }
    }

    /**
     * Get available models
     */
    async getModels() {
        try {
            const response = await this.client.get('/models');
            return response.data;
        } catch (error) {
            logger.error('Error fetching Perplexity models:', error);
            return {
                models: [
                    'sonar',
                    'sonar-small',
                    'sonar-large'
                ]
            };
        }
    }

    /**
     * Get usage statistics
     */
    getUsageStats() {
        return {
            provider: 'Perplexity',
            requests: 0, // Would track actual requests in production
            rateLimit: '50 requests per hour (free tier)',
            features: ['Chat Completion', 'Web Search', 'Current Information', 'Citation Support']
        };
    }
}

module.exports = PerplexityService;