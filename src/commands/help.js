const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Shows available commands and bot information'),
    
    async execute(message, args, aiRouter) {
        const prefix = process.env.BOT_PREFIX || '!';
        
        const helpEmbed = {
            title: '🤖 ScottBot - AI Assistant',
            description: 'I\'m a multi-AI Discord bot that can chat and help with various tasks!',
            color: 0x4285f4,
            fields: [
                {
                    name: '💬 Chat with AI',
                    value: `• Mention me (@ScottBot) to start a conversation\n• Send me a DM for private chat\n• I use Perplexity AI for intelligent responses`,
                    inline: false
                },
                {
                    name: '🎨 Image Descriptions',
                    value: `• Ask me to "generate image of..." or "create picture of..."\n• I'll create detailed visual descriptions using Gemini AI\n• Upload images and I can analyze them for you`,
                    inline: false
                },
                {
                    name: '📋 Commands',
                    value: `\`${prefix}help\` - Show this help message\n\`${prefix}status\` - Check bot and AI service status\n\`${prefix}stats\` - View usage statistics`,
                    inline: false
                },
                {
                    name: '🔍 Smart Features',
                    value: `• **Current Information**: Ask about news, weather, or recent events\n• **Load Balancing**: Automatically switches between AI services\n• **Fallback System**: If one AI fails, I'll try another`,
                    inline: false
                },
                {
                    name: '⚡ Examples',
                    value: `• "What's the weather today?"\n• "Generate image of a cyberpunk city"\n• "Explain quantum computing"\n• "What's trending on social media?"`,
                    inline: false
                }
            ],
            footer: {
                text: 'Powered by Gemini AI & Perplexity AI • Made with ❤️'
            },
            timestamp: new Date().toISOString()
        };

        await message.reply({ embeds: [helpEmbed] });
    }
};