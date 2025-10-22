const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('preset')
        .setDescription('Manage your image generation presets')
        .addSubcommand(subcommand =>
            subcommand
                .setName('save')
                .setDescription('Save current settings as a preset')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Name for your preset')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('style')
                        .setDescription('Art style')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Realistic', value: 'realistic' },
                            { name: 'Artistic', value: 'artistic' },
                            { name: 'Cartoon', value: 'cartoon' },
                            { name: 'Fantasy', value: 'fantasy' },
                            { name: 'Sci-Fi', value: 'scifi' },
                            { name: 'Anime', value: 'anime' },
                            { name: 'Cinematic', value: 'cinematic' }
                        ))
                .addStringOption(option =>
                    option.setName('ratio')
                        .setDescription('Aspect ratio')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Square (1:1)', value: '1:1' },
                            { name: 'Landscape (4:3)', value: '4:3' },
                            { name: 'Wide (16:9)', value: '16:9' },
                            { name: 'Portrait (3:4)', value: '3:4' },
                            { name: 'Tall (9:16)', value: '9:16' },
                            { name: 'Cinematic (21:9)', value: '21:9' }
                        ))
                .addStringOption(option =>
                    option.setName('quality')
                        .setDescription('Image quality')
                        .setRequired(true)
                        .addChoices(
                            { name: 'High Res', value: 'high res' },
                            { name: 'Ultra High Res', value: 'ultra high res' },
                            { name: '4K', value: '4k' },
                            { name: '8K', value: '8k' },
                            { name: 'Detailed', value: 'detailed' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List your saved presets'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('use')
                .setDescription('Use a saved preset')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Name of the preset to use')
                        .setRequired(true)
                        .setAutocomplete(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a preset')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Name of the preset to delete')
                        .setRequired(true)
                        .setAutocomplete(true))),

    async execute(interaction, aiRouter, imageQueue, presetManager) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'save':
                await this.handleSave(interaction, presetManager);
                break;
            case 'list':
                await this.handleList(interaction, presetManager);
                break;
            case 'use':
                await this.handleUse(interaction, presetManager);
                break;
            case 'delete':
                await this.handleDelete(interaction, presetManager);
                break;
            default:
                await interaction.reply({
                    content: '❌ Unknown preset command.',
                    ephemeral: true
                });
        }
    },

    async handleSave(interaction, presetManager) {
        const name = interaction.options.getString('name');
        const style = interaction.options.getString('style');
        const aspectRatio = interaction.options.getString('ratio');
        const quality = interaction.options.getString('quality');

        const settings = {
            style,
            aspectRatio,
            quality,
            additionalParams: []
        };

        const success = await presetManager.savePreset(interaction.user.id, name, settings);

        if (success) {
            const embed = new EmbedBuilder()
                .setTitle('💾 Preset Saved')
                .setDescription(`Successfully saved preset **${name}**`)
                .addFields(
                    { name: '🎭 Style', value: style, inline: true },
                    { name: '📐 Aspect Ratio', value: aspectRatio, inline: true },
                    { name: '✨ Quality', value: quality, inline: true }
                )
                .setColor('#00ff00')
                .setFooter({ text: 'Use /preset use to apply this preset to your images' });

            await interaction.reply({ embeds: [embed] });
        } else {
            await interaction.reply({
                content: '❌ Failed to save preset. Please try again.',
                ephemeral: true
            });
        }
    },

    async handleList(interaction, presetManager) {
        const presets = await presetManager.listPresets(interaction.user.id);

        if (presets.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('📋 Your Presets')
                .setDescription('You don\'t have any saved presets yet.\n\nUse `/preset save` to create your first preset!')
                .setColor('#ffa500');

            await interaction.reply({ embeds: [embed] });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('📋 Your Presets')
            .setDescription(`You have ${presets.length} saved preset${presets.length !== 1 ? 's' : ''}:`)
            .setColor('#4285f4');

        let presetList = '';
        presets.forEach((preset, index) => {
            presetList += `${index + 1}. **${preset.name}**\n`;
            presetList += `   🎭 ${preset.style} • 📐 ${preset.aspectRatio} • ✨ ${preset.quality}\n`;
            presetList += `   _Updated: ${new Date(preset.updated_at).toLocaleDateString()}_\n\n`;
        });

        embed.addFields({
            name: 'Saved Presets',
            value: presetList.substring(0, 1024) // Discord field limit
        });

        const components = [];
        if (presets.length > 0) {
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const row = new ActionRowBuilder();

            presets.slice(0, 4).forEach(preset => {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`preset_use_${interaction.user.id}_${preset.name}`)
                        .setLabel(preset.name)
                        .setStyle(ButtonStyle.Secondary)
                );
            });

            components.push(row);
        }

        await interaction.reply({ embeds: [embed], components });
    },

    async handleUse(interaction, presetManager) {
        const name = interaction.options.getString('name');

        const preset = await presetManager.loadPreset(interaction.user.id, name);

        if (!preset) {
            await interaction.reply({
                content: `❌ Preset "${name}" not found. Use \`/preset list\` to see your saved presets.`,
                ephemeral: true
            });
            return;
        }

        // Store the preset for use in imagine command
        if (!interaction.client.userPresets) {
            interaction.client.userPresets = new Map();
        }

        interaction.client.userPresets.set(interaction.user.id, {
            preset: preset,
            timestamp: Date.now()
        });

        // Clean up after 10 minutes
        setTimeout(() => {
            interaction.client.userPresets?.delete(interaction.user.id);
        }, 10 * 60 * 1000);

        const embed = new EmbedBuilder()
            .setTitle('🎯 Preset Applied')
            .setDescription(`Preset **${name}** is now active for your next image generation!`)
            .addFields(
                { name: '🎭 Style', value: preset.style, inline: true },
                { name: '📐 Aspect Ratio', value: preset.aspectRatio, inline: true },
                { name: '✨ Quality', value: preset.quality, inline: true }
            )
            .setColor('#00ff00')
            .setFooter({ text: 'Use /imagine to generate an image with this preset' });

        await interaction.reply({ embeds: [embed] });
    },

    async handleDelete(interaction, presetManager) {
        const name = interaction.options.getString('name');

        const success = await presetManager.deletePreset(interaction.user.id, name);

        if (success) {
            const embed = new EmbedBuilder()
                .setTitle('🗑️ Preset Deleted')
                .setDescription(`Successfully deleted preset **${name}**`)
                .setColor('#ff0000');

            await interaction.reply({ embeds: [embed] });
        } else {
            await interaction.reply({
                content: `❌ Preset "${name}" not found or could not be deleted.`,
                ephemeral: true
            });
        }
    },

    /**
     * Handle autocomplete for preset names
     */
    async autocomplete(interaction, presetManager) {
        const focusedOption = interaction.options.getFocused(true);

        if (focusedOption.name === 'name') {
            const presets = await presetManager.listPresets(interaction.user.id);
            const filtered = presets
                .filter(preset => preset.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
                .slice(0, 25) // Discord limit
                .map(preset => ({
                    name: preset.name,
                    value: preset.name
                }));

            await interaction.respond(filtered);
        }
    },

    /**
     * Handle preset button clicks
     */
    async handleButton(interaction, presetManager) {
        const [action, userId, presetName] = interaction.customId.split('_').slice(1);

        if (userId !== interaction.user.id) {
            return await interaction.reply({
                content: '❌ This button is not for you!',
                ephemeral: true
            });
        }

        if (action === 'use') {
            // Simulate using the preset
            const preset = await presetManager.loadPreset(userId, presetName);

            if (!preset) {
                return await interaction.reply({
                    content: '❌ Preset not found.',
                    ephemeral: true
                });
            }

            // Store the preset for use in imagine command
            if (!interaction.client.userPresets) {
                interaction.client.userPresets = new Map();
            }

            interaction.client.userPresets.set(userId, {
                preset: preset,
                timestamp: Date.now()
            });

            await interaction.reply({
                content: `✅ Preset **${presetName}** applied! Use \`/imagine\` to generate an image with this preset.`,
                ephemeral: true
            });
        }
    }
};
