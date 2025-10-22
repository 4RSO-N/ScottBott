const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Search for current information using AI')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('What would you like to search for?')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of search')
                .setRequired(false)
                .addChoices(
                    { name: 'General', value: 'general' },
                    { name: 'News', value: 'news' },
                    { name: 'Technology', value: 'tech' },
                    { name: 'Science', value: 'science' },
                    { name: 'Business', value: 'business' }
                )),
    
    async execute(interaction, aiRouter) {
        await interaction.deferReply();

        try {
            const query = interaction.options.getString('query');
            const searchType = interaction.options.getString('type') || 'general';

            // Enhance query based on search type
            const enhancedQueries = {
                general: `Current information about: ${query}`,
                news: `Latest news and updates about: ${query}`,
                tech: `Recent technology developments and news about: ${query}`,
                science: `Latest scientific research and discoveries about: ${query}`,
                business: `Current business news and market information about: ${query}`
            };

            const enhancedQuery = enhancedQueries[searchType] || enhancedQueries.general;

            // Use Perplexity for search
            const perplexity = aiRouter.services.get('perplexity');
            if (!perplexity) {
                throw new Error('Search service not available');
            }

            const response = await perplexity.searchAndRespond(enhancedQuery, {
                userId: interaction.user.id,
                username: interaction.user.username,
                searchType: searchType
            });

            const embed = {
                title: `🔍 Search Results: ${searchType.charAt(0).toUpperCase() + searchType.slice(1)}`,
                description: response.text,
                color: 0x00d4aa,
                fields: [
                    {
                        name: '🔎 Your Query',
                        value: query,
                        inline: true
                    },
                    {
                        name: '📂 Search Type',
                        value: searchType.charAt(0).toUpperCase() + searchType.slice(1),
                        inline: true
                    },
                    {
                        name: '⏰ Search Time',
                        value: new Date().toLocaleString(),
                        inline: true
                    }
                ],
                footer: {
                    text: 'Powered by Perplexity AI • Information is current and sourced from the web'
                },
                timestamp: new Date().toISOString()
            };

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in search command:', error);
            await interaction.editReply({
                content: '❌ Sorry, I couldn\'t perform the search right now. Please try again later.',
                ephemeral: true
            });
        }
    }
};