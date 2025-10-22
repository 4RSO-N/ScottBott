const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View detailed usage statistics and AI service information'),
    
    async execute(message, args, aiRouter) {
        try {
            const stats = aiRouter.getServiceStats();
            
            const statsEmbed = {
                title: '📊 ScottBot Analytics',
                description: 'Detailed statistics for AI services and usage patterns',
                color: 0x4285f4,
                fields: [],
                footer: {
                    text: 'Statistics reset on bot restart'
                },
                timestamp: new Date().toISOString()
            };

            // Add service details
            for (const [serviceName, serviceData] of Object.entries(stats.usage)) {
                const serviceInfo = serviceData.serviceInfo;
                const lastRequest = serviceData.lastRequestTime === 'Never'
                    ? 'Never'
                    : new Date(serviceData.lastRequestTime).toLocaleString();                statsEmbed.fields.push({
                    name: `🤖 ${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)} AI`,
                    value: `**Requests (Last Hour):** ${serviceData.requestsLastHour}
**Last Request:** ${lastRequest}
**Rate Limit:** ${serviceInfo.rateLimit}
**Features:** ${serviceInfo.features.slice(0, 3).join(', ')}${serviceInfo.features.length > 3 ? '...' : ''}`,
                    inline: true
                });
            }

            // Add overall statistics
            const totalRequests = Object.values(stats.usage).reduce((sum, data) => sum + data.requestsLastHour, 0);
            
            statsEmbed.fields.push({
                name: '📈 Overall Statistics',
                value: `**Total Services:** ${stats.totalServices}
**Available Services:** ${stats.availableServices.length}
**Total Requests (1h):** ${totalRequests}
**Bot Version:** 1.0.0`,
                inline: false
            });

            await message.reply({ embeds: [statsEmbed] });
            
        } catch (error) {
            console.error('Error in stats command:', error);
            await message.reply('❌ Error retrieving statistics.');
        }
    }
};