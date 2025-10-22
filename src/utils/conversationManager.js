const logger = require('./logger');

class ConversationManager {
    constructor() {
        this.conversations = new Map();
        // Max number of messages we retain per conversation (env override)
        const envMax = Number.parseInt(process.env.MAX_HISTORY_MESSAGES || process.env.MAX_CONVERSATION_LENGTH || '100', 10);
        this.maxHistoryLength = Number.isNaN(envMax) ? 100 : Math.max(1, Math.min(envMax, 500));
        
        // Soft character budget for history we send to models (env override)
        const envBudget = Number.parseInt(process.env.HISTORY_CHAR_BUDGET || '4000', 10);
        this.historyCharBudget = Number.isNaN(envBudget) ? 4000 : Math.max(500, Math.min(envBudget, 20000));
        this.conversationTimeout = 30 * 60 * 1000; // 30 minutes
        
        // Clean up old conversations every 5 minutes
        setInterval(() => this.cleanupOldConversations(), 5 * 60 * 1000);
    }

    /**
     * Get conversation history for a user
     */
    getConversation(userId, channelId) {
        const conversationId = `${userId}-${channelId}`;
        return this.conversations.get(conversationId) || {
            messages: [],
            lastActivity: Date.now(),
            context: {}
        };
    }

    /**
     * Add message to conversation history
     */
    addMessage(userId, channelId, message, isBot = false) {
        const conversationId = `${userId}-${channelId}`;
        const conversation = this.getConversation(userId, channelId);

        const messageEntry = {
            content: message,
            timestamp: Date.now(),
            isBot: isBot,
            role: isBot ? 'assistant' : 'user'
        };

        conversation.messages.push(messageEntry);
        conversation.lastActivity = Date.now();

        // Keep only the last N messages to prevent memory bloat
        if (conversation.messages.length > this.maxHistoryLength) {
            conversation.messages = conversation.messages.slice(-this.maxHistoryLength);
        }

        this.conversations.set(conversationId, conversation);
        
        logger.debug(`Added message to conversation ${conversationId}. History length: ${conversation.messages.length}`);
    }

    /**
     * Build conversation context for AI
     */
    buildContextForAI(userId, channelId, currentMessage, identity = {}) {
        const conversation = this.getConversation(userId, channelId);
        
        // Build message history for AI context
        const { getSystemPrompt } = require('../config/personality');
        const messages = [
            {
                role: 'system',
                content: getSystemPrompt({
                    userId,
                    channelId,
                    username: identity.username,
                    displayName: identity.displayName,
                    channelType: identity.channelType || 'text'
                })
            }
        ];

        // Add conversation history with char budget, most recent first then reversed
        // We iterate from newest to oldest accumulating until we hit the budget,
        // then reverse to maintain chronological order for the AI models.
        let charCount = 0;
        const selected = [];
        for (let i = conversation.messages.length - 1; i >= 0; i--) {
            const msg = conversation.messages[i];
            if (!msg.content || msg.content.length === 0) continue;
            const projected = charCount + msg.content.length;
            if (selected.length >= this.maxHistoryLength) break;
            if (projected > this.historyCharBudget && selected.length > 0) {
                // Stop when budget exceeded (allow at least one message)
                break;
            }
            selected.push({ role: msg.role, content: msg.content });
            charCount = projected;
        }
        selected.reverse();
        
        // Enforce alternation: filter out consecutive messages from the same role
        // This is required by Perplexity API which mandates user/assistant alternation
        let lastRole = 'system'; // Start after system message
        for (const msg of selected) {
            if (msg.role !== lastRole) {
                messages.push(msg);
                lastRole = msg.role;
            } else {
                // Skip consecutive messages of the same role
                logger.debug(`Skipping consecutive ${msg.role} message to enforce alternation`);
            }
        }

        // Add current message
        messages.push({
            role: 'user',
            content: currentMessage
        });

        return {
            messages: messages,
            conversationLength: conversation.messages.length,
            includedHistory: selected.length,
            hasHistory: conversation.messages.length > 0
        };
    }

    /**
     * Set conversation context (user preferences, etc.)
     */
    setContext(userId, channelId, key, value) {
        const conversation = this.getConversation(userId, channelId);
        conversation.context[key] = value;
        conversation.lastActivity = Date.now();
        
        const conversationId = `${userId}-${channelId}`;
        this.conversations.set(conversationId, conversation);
        
        logger.debug(`Set context ${key} for conversation ${conversationId}`);
    }

    /**
     * Get conversation context
     */
    getContext(userId, channelId, key) {
        const conversation = this.getConversation(userId, channelId);
        return conversation.context[key];
    }

    /**
     * Clear conversation history for a user
     */
    clearConversation(userId, channelId) {
        const conversationId = `${userId}-${channelId}`;
        this.conversations.delete(conversationId);
        logger.info(`Cleared conversation ${conversationId}`);
    }

    /**
     * Get conversation summary for user
     */
    getConversationSummary(userId, channelId) {
        const conversation = this.getConversation(userId, channelId);
        
        return {
            messageCount: conversation.messages.length,
            lastActivity: new Date(conversation.lastActivity).toLocaleString(),
            context: Object.keys(conversation.context),
            hasActiveConversation: conversation.messages.length > 0
        };
    }

    /**
     * Clean up old conversations
     */
    cleanupOldConversations() {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [conversationId, conversation] of this.conversations.entries()) {
            if (now - conversation.lastActivity > this.conversationTimeout) {
                this.conversations.delete(conversationId);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            logger.info(`Cleaned up ${cleanedCount} old conversations`);
        }
    }

    /**
     * Get statistics about conversations
     */
    getStats() {
        const stats = {
            totalConversations: this.conversations.size,
            totalMessages: 0,
            averageMessagesPerConversation: 0,
            activeConversations: 0
        };

        const now = Date.now();
        const activeThreshold = 5 * 60 * 1000; // 5 minutes

        for (const conversation of this.conversations.values()) {
            stats.totalMessages += conversation.messages.length;
            
            if (now - conversation.lastActivity < activeThreshold) {
                stats.activeConversations++;
            }
        }

        if (stats.totalConversations > 0) {
            stats.averageMessagesPerConversation = Math.round(stats.totalMessages / stats.totalConversations);
        }

    }

    /**
     * Save all conversations to persistent storage
     */
    async saveAllConversations() {
        try {
            const fs = require('node:fs').promises;
            const path = require('node:path');
            
            // Convert Map to serializable object
            const conversationsData = {};
            for (const [conversationId, conversation] of this.conversations) {
                conversationsData[conversationId] = {
                    messages: conversation.messages,
                    lastActivity: conversation.lastActivity,
                    context: conversation.context
                };
            }
            
            const backupDir = path.join(process.cwd(), 'backups', 'conversations');
            await fs.mkdir(backupDir, { recursive: true });
            
            const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
            const filename = `conversations-${timestamp}.json`;
            const filepath = path.join(backupDir, filename);
            
            await fs.writeFile(filepath, JSON.stringify(conversationsData, null, 2));
            
            logger.info(`Saved ${this.conversations.size} conversations to ${filepath}`);
            
            // Keep only the last 10 conversation backups
            const files = await fs.readdir(backupDir);
            const conversationFiles = files
                .filter(f => f.startsWith('conversations-'))
                .sort((a, b) => a.localeCompare(b))
                .reverse();
                
            if (conversationFiles.length > 10) {
                const filesToDelete = conversationFiles.slice(10);
                for (const file of filesToDelete) {
                    await fs.unlink(path.join(backupDir, file));
                }
                logger.debug(`Cleaned up ${filesToDelete.length} old conversation backups`);
            }
            
        } catch (error) {
            logger.error('Error saving conversations:', error);
            // Don't throw - this shouldn't crash the shutdown
        }
    }

    /**
     * Export conversation for debugging/analysis
     */
    exportConversation(userId, channelId) {
        const conversation = this.getConversation(userId, channelId);
        return {
            conversationId: `${userId}-${channelId}`,
            messageCount: conversation.messages.length,
            messages: conversation.messages,
            context: conversation.context,
            lastActivity: conversation.lastActivity
        };
    }
}

module.exports = ConversationManager;