const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Manage bot configuration and settings')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommandGroup(subcommandGroup =>
            subcommandGroup
                .setName('view')
                .setDescription('View configuration settings')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('all')
                        .setDescription('View all configuration settings'))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('section')
                        .setDescription('View a specific configuration section')
                        .addStringOption(option =>
                            option.setName('section')
                                .setDescription('Configuration section to view')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'Server Settings', value: 'server' },
                                    { name: 'AI Configuration', value: 'ai' },
                                    { name: 'Features', value: 'features' },
                                    { name: 'Security', value: 'security' },
                                    { name: 'Performance', value: 'performance' },
                                    { name: 'Dashboard', value: 'dashboard' }
                                ))))
        .addSubcommandGroup(subcommandGroup =>
            subcommandGroup
                .setName('set')
                .setDescription('Modify configuration settings')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('server')
                        .setDescription('Update server settings')
                        .addStringOption(option =>
                            option.setName('setting')
                                .setDescription('Setting to modify')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'Bot Prefix', value: 'prefix' },
                                    { name: 'Default AI Service', value: 'defaultAI' },
                                    { name: 'Max Conversation Length', value: 'maxConversationLength' },
                                    { name: 'Allow Image Analysis', value: 'allowImageAnalysis' }
                                ))
                        .addStringOption(option =>
                            option.setName('value')
                                .setDescription('New value for the setting')
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('ai')
                        .setDescription('Update AI service settings')
                        .addStringOption(option =>
                            option.setName('service')
                                .setDescription('AI service to configure')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'Gemini', value: 'gemini' },
                                    { name: 'Perplexity', value: 'perplexity' }
                                ))
                        .addStringOption(option =>
                            option.setName('setting')
                                .setDescription('Setting to modify')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'Max Tokens', value: 'maxTokens' },
                                    { name: 'Temperature', value: 'temperature' },
                                    { name: 'Enabled', value: 'enabled' }
                                ))
                        .addStringOption(option =>
                            option.setName('value')
                                .setDescription('New value for the setting')
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('feature')
                        .setDescription('Toggle bot features')
                        .addStringOption(option =>
                            option.setName('feature')
                                .setDescription('Feature to toggle')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'Conversation Memory', value: 'conversationMemory' },
                                    { name: 'Image Processing', value: 'imageProcessing' },
                                    { name: 'Web Dashboard', value: 'webDashboard' },
                                    { name: 'Performance Monitoring', value: 'performanceMonitoring' },
                                    { name: 'Advanced Logging', value: 'advancedLogging' }
                                ))
                        .addBooleanOption(option =>
                            option.setName('enabled')
                                .setDescription('Enable or disable the feature')
                                .setRequired(true))))
        .addSubcommandGroup(subcommandGroup =>
            subcommandGroup
                .setName('template')
                .setDescription('Apply configuration templates')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('apply')
                        .setDescription('Apply a configuration template')
                        .addStringOption(option =>
                            option.setName('template')
                                .setDescription('Template to apply')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'Development', value: 'development' },
                                    { name: 'Production', value: 'production' },
                                    { name: 'Minimal', value: 'minimal' }
                                )))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('list')
                        .setDescription('List available configuration templates')))
        .addSubcommandGroup(subcommandGroup =>
            subcommandGroup
                .setName('backup')
                .setDescription('Backup and restore configuration')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('export')
                        .setDescription('Export current configuration'))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('reset')
                        .setDescription('Reset configuration to defaults')
                        .addStringOption(option =>
                            option.setName('section')
                                .setDescription('Section to reset (leave empty for all)')
                                .setRequired(false)
                                .addChoices(
                                    { name: 'Server Settings', value: 'server' },
                                    { name: 'AI Configuration', value: 'ai' },
                                    { name: 'Features', value: 'features' },
                                    { name: 'Security', value: 'security' },
                                    { name: 'Performance', value: 'performance' }
                                )))),
    
    async execute(interaction, aiRouter) {
        const bot = interaction.client.scottBot;
        if (!bot?.configurationManager) {
            return await interaction.reply({
                content: '❌ Configuration manager not available.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const subcommandGroup = interaction.options.getSubcommandGroup();
            const subcommand = interaction.options.getSubcommand();

            switch (subcommandGroup) {
                case 'view':
                    await handleViewConfig(interaction, bot.configurationManager, subcommand);
                    break;
                case 'set':
                    await handleSetConfig(interaction, bot.configurationManager, subcommand);
                    break;
                case 'template':
                    await handleTemplateConfig(interaction, bot.configurationManager, subcommand);
                    break;
                case 'backup':
                    await handleBackupConfig(interaction, bot.configurationManager, subcommand);
                    break;
                default:
                    await interaction.editReply('❌ Unknown subcommand group.');
            }

        } catch (error) {
            console.error('Error in config command:', error);
            await interaction.editReply('❌ An error occurred while managing configuration.');
        }
    }
};

async function handleViewConfig(interaction, configManager, subcommand) {
    switch (subcommand) {
        case 'all': {
            const summary = configManager.getConfigSummary();
            const embed = new EmbedBuilder()
                .setTitle('⚙️ Bot Configuration Summary')
                .setColor(0x4285f4)
                .addFields(
                    {
                        name: '📊 Overview',
                        value: `**Total Settings:** ${summary.totalSettings}
**Customized:** ${summary.customizedSettings}
**Status:** ${summary.isValid ? '✅ Valid' : '❌ Invalid'}`,
                        inline: true
                    },
                    {
                        name: '🔧 Features',
                        value: `**Enabled:** ${summary.features.enabled.length}
**Disabled:** ${summary.features.disabled.length}`,
                        inline: true
                    },
                    {
                        name: '🕒 Last Modified',
                        value: summary.lastModified ? 
                            new Date(summary.lastModified).toLocaleString() : 'Never',
                        inline: true
                    }
                );

            if (!summary.isValid && summary.issues.length > 0) {
                embed.addFields({
                    name: '⚠️ Issues Found',
                    value: summary.issues.slice(0, 5).join('\n'),
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });
            break;
        }
        case 'section': {
            const section = interaction.options.getString('section');
            const sectionData = configManager.get(section);
            
            const sectionEmbed = new EmbedBuilder()
                .setTitle(`⚙️ ${section.charAt(0).toUpperCase() + section.slice(1)} Configuration`)
                .setColor(0x4285f4)
                .setDescription('```json\n' + JSON.stringify(sectionData, null, 2) + '\n```');

            await interaction.editReply({ embeds: [sectionEmbed] });
            break;
        }
    }
}

async function handleSetConfig(interaction, configManager, subcommand) {
    switch (subcommand) {
        case 'server': {
            const serverSetting = interaction.options.getString('setting');
            const serverValue = interaction.options.getString('value');
            
            // Validate and set server setting
            const validation = validateServerSetting(serverSetting, serverValue);
            if (!validation.valid) {
                return await interaction.editReply(`❌ ${validation.error}`);
            }

            configManager.set(`server.${serverSetting}`, validation.value);
            await interaction.editReply(`✅ Server setting **${serverSetting}** updated to: \`${validation.value}\``);
            break;
        }
        case 'ai': {
            const service = interaction.options.getString('service');
            const aiSetting = interaction.options.getString('setting');
            const aiValue = interaction.options.getString('value');
            
            const aiValidation = validateAISetting(aiSetting, aiValue);
            if (!aiValidation.valid) {
                return await interaction.editReply(`❌ ${aiValidation.error}`);
            }

            configManager.set(`ai.${service}.${aiSetting}`, aiValidation.value);
            await interaction.editReply(`✅ ${service} AI setting **${aiSetting}** updated to: \`${aiValidation.value}\``);
            break;
        }
        case 'feature': {
            const feature = interaction.options.getString('feature');
            const enabled = interaction.options.getBoolean('enabled');
            
            configManager.toggleFeature(feature, enabled);
            await interaction.editReply(`✅ Feature **${feature}** ${enabled ? 'enabled' : 'disabled'}`);
            break;
        }
    }
}

async function handleTemplateConfig(interaction, configManager, subcommand) {
    switch (subcommand) {
        case 'apply': {
            const template = interaction.options.getString('template');
            const success = configManager.applyTemplate(template);
            
            if (success) {
                await interaction.editReply(`✅ Configuration template **${template}** applied successfully!`);
            } else {
                await interaction.editReply(`❌ Failed to apply template **${template}**. Template not found.`);
            }
            break;
        }
        case 'list': {
            const templates = ['development', 'production', 'minimal'];
            const templateDescriptions = {
                development: 'High verbosity, all features enabled, debug settings',
                production: 'Optimized for performance, security focused, minimal logging',
                minimal: 'Basic functionality only, low resource usage'
            };

            const templateEmbed = new EmbedBuilder()
                .setTitle('📋 Available Configuration Templates')
                .setColor(0x4285f4);

            for (const template of templates) {
                templateEmbed.addFields({
                    name: template.charAt(0).toUpperCase() + template.slice(1),
                    value: templateDescriptions[template],
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [templateEmbed] });
            break;
        }
    }
}

async function handleBackupConfig(interaction, configManager, subcommand) {
    switch (subcommand) {
        case 'export': {
            const configExport = configManager.exportConfig();
            const exportData = JSON.stringify(configExport, null, 2);
            
            // Create a text file attachment
            const buffer = Buffer.from(exportData, 'utf8');
            const attachment = {
                attachment: buffer,
                name: `scottbot-config-${new Date().toISOString().split('T')[0]}.json`
            };

            await interaction.editReply({
                content: '📦 Configuration exported successfully!',
                files: [attachment]
            });
            break;
        }
        case 'reset': {
            const resetSection = interaction.options.getString('section');
            const success = configManager.reset(resetSection);
            
            if (success) {
                const message = resetSection ? 
                    `✅ Configuration section **${resetSection}** reset to defaults.` :
                    '✅ All configuration reset to defaults.';
                await interaction.editReply(message);
            } else {
                await interaction.editReply('❌ Failed to reset configuration.');
            }
            break;
        }
    }
}

function validateServerSetting(setting, value) {
    switch (setting) {
        case 'prefix':
            if (!value || value.length > 5) {
                return { valid: false, error: 'Prefix must be 1-5 characters long.' };
            }
            return { valid: true, value };

        case 'defaultAI':
            if (!['gemini', 'perplexity'].includes(value.toLowerCase())) {
                return { valid: false, error: 'Default AI must be either "gemini" or "perplexity".' };
            }
            return { valid: true, value: value.toLowerCase() };

        case 'maxConversationLength': {
            const length = Number.parseInt(value, 10);
            if (Number.isNaN(length) || length < 1 || length > 50) {
                return { valid: false, error: 'Max conversation length must be between 1 and 50.' };
            }
            return { valid: true, value: length };
        }
        case 'allowImageAnalysis': {
            const allowed = ['true', 'yes', '1', 'enabled', 'false', 'no', '0', 'disabled'].includes(value.toLowerCase());
            if (!allowed) {
                return { valid: false, error: 'Value must be true/false, yes/no, 1/0, or enabled/disabled.' };
            }
            return { valid: true, value: ['true', 'yes', '1', 'enabled'].includes(value.toLowerCase()) };
        }

        default:
            return { valid: false, error: 'Unknown server setting.' };
    }
}

function validateAISetting(setting, value) {
    switch (setting) {
        case 'maxTokens': {
            const tokens = Number.parseInt(value, 10);
            if (Number.isNaN(tokens) || tokens < 100 || tokens > 32768) {
                return { valid: false, error: 'Max tokens must be between 100 and 32768.' };
            }
            return { valid: true, value: tokens };
        }
        case 'temperature': {
            const temp = Number.parseFloat(value);
            if (Number.isNaN(temp) || temp < 0 || temp > 2) {
                return { valid: false, error: 'Temperature must be between 0 and 2.' };
            }
            return { valid: true, value: temp };
        }
        case 'enabled': {
            const enabled = ['true', 'yes', '1', 'enabled', 'false', 'no', '0', 'disabled'].includes(value.toLowerCase());
            if (!enabled) {
                return { valid: false, error: 'Value must be true/false, yes/no, 1/0, or enabled/disabled.' };
            }
            return { valid: true, value: ['true', 'yes', '1', 'enabled'].includes(value.toLowerCase()) };
        }

        default:
            return { valid: false, error: 'Unknown AI setting.' };
    }
}