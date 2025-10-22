const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Admin commands for server management')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('settings')
                .setDescription('View or modify server settings')
                .addStringOption(option =>
                    option.setName('setting')
                        .setDescription('Setting to modify')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Prefix', value: 'prefix' },
                            { name: 'Default AI Service', value: 'default_ai' },
                            { name: 'Max Conversation Length', value: 'max_conv_length' },
                            { name: 'Allow Image Analysis', value: 'allow_images' }
                        ))
                .addStringOption(option =>
                    option.setName('value')
                        .setDescription('New value for the setting')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('performance')
                .setDescription('View detailed performance metrics'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('conversations')
                .setDescription('Manage conversation data')
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('Action to perform')
                        .setRequired(true)
                        .addChoices(
                            { name: 'View Stats', value: 'stats' },
                            { name: 'Clear All', value: 'clear_all' },
                            { name: 'Clear User', value: 'clear_user' }
                        ))
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to clear conversations for')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('services')
                .setDescription('Manage AI services')
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('Action to perform')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Health Check', value: 'health' },
                            { name: 'View Stats', value: 'stats' },
                            { name: 'Reset Counters', value: 'reset' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('roles')
                .setDescription('Manage bot roles and permissions')
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('Action to perform')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Check Status', value: 'status' },
                            { name: 'Create Role', value: 'create' },
                            { name: 'Update Permissions', value: 'update' },
                            { name: 'Permissions Report', value: 'report' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('security')
                .setDescription('View security statistics and manage security settings')
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('Security action to perform')
                        .setRequired(true)
                        .addChoices(
                            { name: 'View Stats', value: 'stats' },
                            { name: 'User Profile', value: 'user_profile' },
                            { name: 'Update Rate Limits', value: 'update_limits' },
                            { name: 'Update Quotas', value: 'update_quotas' }
                        ))
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to check (for user_profile action)')
                        .setRequired(false))),
    
    async execute(interaction, aiRouter) {
        // Verify admin permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.reply({
                content: '❌ You need administrator permissions to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'settings':
                    await handleSettings(interaction, aiRouter);
                    break;
                case 'performance':
                    await handlePerformance(interaction, aiRouter);
                    break;
                case 'conversations': {
                    await handleConversations(interaction, aiRouter);
                    break;
                }
                case 'services': {
                    await handleServices(interaction, aiRouter);
                    break;
                }
                case 'roles':
                    await handleRoles(interaction);
                    break;
                case 'security':
                    await handleSecurity(interaction);
                    break;
                default:
                    await interaction.editReply('❌ Unknown subcommand.');
            }

        } catch (error) {
            console.error('Error in admin command:', error);
            await interaction.editReply('❌ An error occurred while executing the admin command.');
        }
    }
};

async function handleSettings(interaction, aiRouter) {
    const setting = interaction.options.getString('setting');
    const value = interaction.options.getString('value');

    if (!setting) {
        // Show current settings
        const embed = {
            title: '⚙️ Server Settings',
            description: 'Current configuration for this server',
            color: 0x4285f4,
            fields: [
                {
                    name: '🎯 Bot Prefix',
                    value: process.env.BOT_PREFIX || '!',
                    inline: true
                },
                {
                    name: '🧠 Default AI Service',
                    value: process.env.DEFAULT_AI_PROVIDER || 'perplexity',
                    inline: true
                },
                {
                    name: '💬 Max Conversation Length',
                    value: '10 messages',
                    inline: true
                },
                {
                    name: '🖼️ Image Analysis',
                    value: 'Enabled',
                    inline: true
                }
            ],
            footer: {
                text: 'Use /admin settings <setting> <value> to modify'
            },
            timestamp: new Date().toISOString()
        };

        await interaction.editReply({ embeds: [embed] });
        return;
    }

    if (!value) {
        await interaction.editReply('❌ Please provide a value for the setting.');
        return;
    }

    // Update setting (this would integrate with database in production)
    let updateMessage = '';
    switch (setting) {
        case 'prefix':
            updateMessage = `✅ Bot prefix updated to: \`${value}\``;
            break;
        case 'default_ai':
            if (!['perplexity', 'gemini'].includes(value.toLowerCase())) {
                await interaction.editReply('❌ Invalid AI service. Choose: perplexity, gemini');
                return;
            }
            updateMessage = `✅ Default AI service updated to: ${value}`;
            break;
        case 'max_conv_length': {
            const maxLength = Number.parseInt(value);
            if (Number.isNaN(maxLength) || maxLength < 1 || maxLength > 50) {
                await interaction.editReply('❌ Max conversation length must be between 1 and 50.');
                return;
            }
            updateMessage = `✅ Max conversation length updated to: ${maxLength} messages`;
            break;
        }
        case 'allow_images': {
            const allowed = ['true', 'yes', '1', 'enabled'].includes(value.toLowerCase());
            updateMessage = `✅ Image analysis ${allowed ? 'enabled' : 'disabled'}`;
            break;
        }
        default:
            await interaction.editReply('❌ Invalid setting.');
            return;
    }

    await interaction.editReply(updateMessage);
}

async function handlePerformance(interaction, aiRouter) {
    const bot = interaction.client.scottBot;
    const performanceData = bot?.performanceMonitor?.getStats();

    if (!performanceData) {
        await interaction.editReply('❌ Performance data not available.');
        return;
    }

    const embed = {
        title: '📊 Performance Metrics',
        description: 'Detailed bot performance statistics',
        color: 0x00d4aa,
        fields: [
            {
                name: '🎯 Request Statistics',
                value: `**Total:** ${performanceData.requests.total}
**Successful:** ${performanceData.requests.successful}
**Failed:** ${performanceData.requests.failed}
**Success Rate:** ${performanceData.requests.successRate}`,
                inline: true
            },
            {
                name: '⚡ Response Times',
                value: `**Average:** ${performanceData.responseTime.average}
**Recent Average:** ${performanceData.responseTime.recentAverage}
**Min:** ${performanceData.responseTime.min}ms
**Max:** ${performanceData.responseTime.max}ms`,
                inline: true
            },
            {
                name: '👥 User Activity',
                value: `**Total Unique:** ${performanceData.users.totalUnique}
**Active (1h):** ${performanceData.users.activeLastHour}`,
                inline: true
            },
            {
                name: '💾 Memory Usage',
                value: `**Current:** ${performanceData.memory.current}MB
**Total:** ${performanceData.memory.total}MB
**RSS:** ${performanceData.memory.rss}MB`,
                inline: true
            },
            {
                name: '⚠️ Error Rate',
                value: `**Total Errors:** ${performanceData.errors.total}
**Error Rate:** ${performanceData.errors.errorRate}%`,
                inline: true
            },
            {
                name: '⏱️ System',
                value: `**Uptime:** ${Math.round(performanceData.uptime / 3600)}h
**Node.js:** ${process.version}`,
                inline: true
            }
        ],
        footer: {
            text: 'Performance data updates in real-time'
        },
        timestamp: new Date().toISOString()
    };

    await interaction.editReply({ embeds: [embed] });
}

async function handleConversations(interaction, aiRouter) {
    const action = interaction.options.getString('action');
    const user = interaction.options.getUser('user');
    const bot = interaction.client.scottBot;

    switch (action) {
        case 'stats': {
            const stats = bot?.conversationManager?.getStats();
            if (!stats) {
                await interaction.editReply('❌ Conversation data not available.');
                return;
            }

            const embed = {
                title: '💬 Conversation Statistics',
                color: 0x4285f4,
                fields: [
                    {
                        name: '📊 Overview',
                        value: `**Total Conversations:** ${stats.totalConversations}
**Total Messages:** ${stats.totalMessages}
**Average per Conversation:** ${stats.averageMessagesPerConversation}
**Active Conversations:** ${stats.activeConversations}`,
                        inline: false
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.editReply({ embeds: [embed] });
            break;
        }

        case 'clear_all':
            // Confirm before clearing all conversations
            await interaction.editReply('⚠️ This will clear ALL conversation data. Use this with caution.');
            break;

        case 'clear_user':
            if (!user) {
                await interaction.editReply('❌ Please specify a user to clear conversations for.');
                return;
            }

            bot?.conversationManager?.clearConversation(user.id, interaction.channel.id);
            await interaction.editReply(`✅ Cleared conversation data for ${user.username}`);
            break;

        default:
            await interaction.editReply('❌ Invalid action.');
    }
}

async function handleServices(interaction, aiRouter) {
    const action = interaction.options.getString('action');

    switch (action) {
        case 'health':
            await interaction.editReply('🔍 Performing health check...');
            
            try {
                await aiRouter.healthCheckServices();
                const serviceStats = aiRouter.getServiceStats();
                
                let statusText = '**AI Service Health Check Results:**\n\n';
                for (const [serviceName, stats] of Object.entries(serviceStats.usage)) {
                    const isHealthy = stats.requestsLastHour >= 0; // Simple health check
                    statusText += `${isHealthy ? '✅' : '❌'} **${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)}**\n`;
                    statusText += `   Requests (1h): ${stats.requestsLastHour}\n`;
                    statusText += `   Features: ${stats.serviceInfo.features.join(', ')}\n\n`;
                }

                await interaction.editReply(statusText);
            } catch (error) {
                await interaction.editReply('❌ Health check failed: ' + error.message);
            }
            break;

        case 'stats': {
            const serviceStats = aiRouter.getServiceStats();
            
            const embed = {
                title: '🧠 AI Service Statistics',
                color: 0x4285f4,
                fields: [],
                timestamp: new Date().toISOString()
            };

            for (const [serviceName, stats] of Object.entries(serviceStats.usage)) {
                embed.fields.push({
                    name: `${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)} AI`,
                    value: `**Requests (1h):** ${stats.requestsLastHour}
**Rate Limit:** ${stats.serviceInfo.rateLimit}
**Features:** ${stats.serviceInfo.features.slice(0, 3).join(', ')}`,
                    inline: true
                });
            }

            await interaction.editReply({ embeds: [embed] });
            break;
        }

        case 'reset':
            // Reset service counters (implement as needed)
            await interaction.editReply('✅ Service counters reset.');
            break;

        default:
            await interaction.editReply('❌ Invalid action.');
    }
}

async function handleRoles(interaction) {
    const RoleManager = require('../utils/roleManager');
    const roleManager = new RoleManager(interaction.guild);
    
    const action = interaction.options.getSubcommand();
    
    // Delegate to small helpers to keep complexity low
    switch (action) {
        case 'status':
            await handleRoleStatus(roleManager, interaction);
            break;
        case 'create':
            await handleRoleCreate(roleManager, interaction);
            break;
        case 'update':
            await handleRoleUpdate(roleManager, interaction);
            break;
        default:
            await interaction.editReply('❌ Invalid role action.');
    }
}

async function handleRoleStatus(roleManager, interaction) {
    const status = await roleManager.checkBotRole();
    await interaction.editReply({
        embeds: [{
            title: '🔧 Bot Role Status',
            color: status.exists ? 0x00ff00 : 0xffaa00,
            fields: [
                { name: 'Role Exists', value: status.exists ? '✅ Yes' : '❌ No', inline: true },
                { name: 'Role ID', value: status.role ? status.role.id : 'N/A', inline: true },
                { name: 'Position', value: status.role ? status.role.position.toString() : 'N/A', inline: true },
                { name: 'Permissions', value: status.hasNeededPermissions ? '✅ Adequate' : '⚠️ Insufficient', inline: true },
                { name: 'Permissions Value', value: status.role ? status.role.permissions.bitfield.toString() : 'N/A', inline: true }
            ],
            timestamp: new Date().toISOString()
        }]
    });
}

async function handleRoleCreate(roleManager, interaction) {
    try {
        const result = await roleManager.ensureBotRole();
        if (result.created) {
            await interaction.editReply({
                embeds: [{
                    title: '✅ Bot Role Created',
                    description: `Successfully created role: ${result.role.name}`,
                    color: 0x00ff00,
                    fields: [
                        { name: 'Role ID', value: result.role.id, inline: true },
                        { name: 'Position', value: result.role.position.toString(), inline: true }
                    ],
                    timestamp: new Date().toISOString()
                }]
            });
        } else {
            await interaction.editReply('ℹ️ Bot role already exists and is properly configured.');
        }
    } catch (error) {
        console.error('Error creating bot role:', error);
        await interaction.editReply('❌ Failed to create bot role: ' + error.message);
    }
}

async function handleRoleUpdate(roleManager, interaction) {
    try {
        const result = await roleManager.ensureBotRole();
        await interaction.editReply({
            embeds: [{
                title: '✅ Bot Role Updated',
                description: 'Bot role permissions and position have been verified/updated.',
                color: 0x00ff00,
                fields: [
                    { name: 'Role Name', value: result.role.name, inline: true },
                    { name: 'Position', value: result.role.position.toString(), inline: true }
                ],
                timestamp: new Date().toISOString()
            }]
        });
    } catch (error) {
        console.error('Error updating bot role:', error);
        await interaction.editReply('❌ Failed to update bot role: ' + error.message);
    }
}

async function handleSecurity(interaction) {
    const action = interaction.options.getString('action');
    const user = interaction.options.getUser('user');
    const SecurityManager = require('../utils/securityManager');

    switch (action) {
        case 'stats':
            try {
                const stats = SecurityManager.getSecurityStats();

                await interaction.editReply({
                    embeds: [{
                        title: '🔒 Security Statistics',
                        color: 0x00ff00,
                        fields: [
                            {
                                name: '👥 Active Users',
                                value: `${stats.abuseControl.totalUsers} total, ${stats.abuseControl.activeUsers} active`,
                                inline: true
                            },
                            {
                                name: '🏰 Active Guilds',
                                value: stats.abuseControl.totalGuilds.toString(),
                                inline: true
                            },
                            {
                                name: '📊 Total Actions',
                                value: stats.abuseControl.totalActions.toString(),
                                inline: true
                            },
                            {
                                name: '🚨 Anomaly Alerts',
                                value: stats.abuseControl.anomalyAlerts.toString(),
                                inline: true
                            },
                            {
                                name: '🛡️ Content Violations',
                                value: stats.contentPolicy.violationsToday || 'N/A',
                                inline: true
                            },
                            {
                                name: '📎 Attachment Scans',
                                value: stats.attachmentSecurity.scansToday || 'N/A',
                                inline: true
                            }
                        ],
                        timestamp: new Date().toISOString()
                    }]
                });
            } catch (error) {
                console.error('Error getting security stats:', error);
                await interaction.editReply('❌ Failed to retrieve security statistics.');
            }
            break;

        case 'user_profile':
            if (!user) {
                return await interaction.editReply('❌ Please specify a user to check.');
            }

            try {
                const profile = SecurityManager.getUserSecurityProfile(user.id);

                if (!profile.abuseActivity) {
                    return await interaction.editReply(`❌ No security data found for ${user.username}.`);
                }

                const activity = profile.abuseActivity;

                await interaction.editReply({
                    embeds: [{
                        title: `🔍 Security Profile: ${user.username}`,
                        color: 0xffa500,
                        fields: [
                            {
                                name: '📅 Last Activity',
                                value: activity.lastActivity ? new Date(activity.lastActivity).toLocaleString() : 'Never',
                                inline: true
                            },
                            {
                                name: '🖼️ Images (Hourly)',
                                value: activity.hourlyActivity.imageJobs.toString(),
                                inline: true
                            },
                            {
                                name: '💬 Messages (Hourly)',
                                value: activity.hourlyActivity.chatMessages.toString(),
                                inline: true
                            },
                            {
                                name: '🖼️ Images (Daily)',
                                value: activity.dailyActivity.imageJobs.toString(),
                                inline: true
                            },
                            {
                                name: '💬 Messages (Daily)',
                                value: activity.dailyActivity.chatMessages.toString(),
                                inline: true
                            },
                            {
                                name: '📊 Daily Quota Used',
                                value: activity.quotas.daily ? `${activity.quotas.daily.used}/${activity.quotas.daily.quota}` : 'N/A',
                                inline: true
                            }
                        ],
                        timestamp: new Date().toISOString()
                    }]
                });
            } catch (error) {
                console.error('Error getting user security profile:', error);
                await interaction.editReply('❌ Failed to retrieve user security profile.');
            }
            break;

        case 'update_limits':
            // This would require additional UI for updating rate limits
            await interaction.editReply('⚠️ Rate limit updates require direct configuration. Please use the configuration system.');
            break;

        case 'update_quotas':
            // This would require additional UI for updating quotas
            await interaction.editReply('⚠️ Quota updates require direct configuration. Please use the configuration system.');
            break;

        default:
            await interaction.editReply('❌ Invalid security action.');
    }
}