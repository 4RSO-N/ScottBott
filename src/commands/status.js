const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check bot and AI service status'),
    
    async execute(message, args, aiRouter) {
        try {
            // Get service statistics
            const stats = aiRouter.getServiceStats();
            
            // Check bot uptime
            const uptime = process.uptime();
            const uptimeString = formatUptime(uptime);
            
            // Memory usage
            const memUsage = process.memoryUsage();
            const memUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
            
            // Build status embed
            const statusEmbed = {
                title: '📊 ScottBot Status',
                color: 0x00ff00, // Green for online
                fields: [
                    {
                        name: '🤖 Bot Status',
                        value: `✅ Online\n⏱️ Uptime: ${uptimeString}\n💾 Memory: ${memUsageMB}MB`,
                        inline: true
                    },
                    {
                        name: '🧠 AI Services',
                        value: generateServiceStatus(stats),
                        inline: true
                    },
                    {
                        name: '📈 Usage (Last Hour)',
                        value: generateUsageStats(stats),
                        inline: false
                    }
                ],
                footer: {
                    text: 'All systems operational'
                },
                timestamp: new Date().toISOString()
            };

            await message.reply({ embeds: [statusEmbed] });
            
        } catch (error) {
            console.error('Error in status command:', error);
            await message.reply('❌ Error retrieving status information.');
        }
    }
};

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

function generateServiceStatus(stats) {
    if (!stats.availableServices || stats.availableServices.length === 0) {
        return '❌ No services available';
    }
    
    return stats.availableServices.map(service => {
        const serviceData = stats.usage[service];
        const status = serviceData ? '✅' : '❌';
        return `${status} ${service.charAt(0).toUpperCase() + service.slice(1)}`;
    }).join('\n');
}

function generateUsageStats(stats) {
    if (!stats.usage || Object.keys(stats.usage).length === 0) {
        return 'No usage data available';
    }
    
    return Object.entries(stats.usage).map(([service, data]) => {
        return `**${service.charAt(0).toUpperCase() + service.slice(1)}**: ${data.requestsLastHour} requests`;
    }).join('\n');
}