const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const logger = require('../utils/logger');

class SlashCommandManager {
    constructor() {
        this.commands = [];
        this.rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    }

    /**
     * Load all slash commands from commands directory
     */
    loadSlashCommands() {
        const commandsPath = path.join(__dirname, '../commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            
            if ('data' in command && 'execute' in command) {
                this.commands.push(command.data.toJSON());
                logger.info(`Loaded slash command: ${command.data.name}`);
            }
        }
    }

    /**
     * Deploy slash commands to Discord
     */
    async deployCommands(clientId, guildId = null) {
        try {
            logger.info(`Started refreshing ${this.commands.length} application (/) commands.`);

            let route;
            if (guildId) {
                // Guild-specific commands (for testing)
                route = Routes.applicationGuildCommands(clientId, guildId);
            } else {
                // Global commands (for production)
                route = Routes.applicationCommands(clientId);
            }

            const data = await this.rest.put(route, { body: this.commands });

            logger.info(`Successfully reloaded ${data.length} application (/) commands.`);
            return true;
        } catch (error) {
            logger.error('Error deploying slash commands:', error);
            return false;
        }
    }

    /**
     * Handle slash command interactions
     */
    async handleInteraction(interaction, aiRouter, imageQueue, presetManager) {
        if (!interaction.isChatInputCommand()) return;

        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            logger.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction, aiRouter, imageQueue, presetManager);
        } catch (error) {
            logger.error(`Error executing ${interaction.commandName}:`, error);
            
            const errorMessage = '❌ There was an error while executing this command!';
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    }

    /**
     * Handle button interactions
     */
    async handleButtonInteraction(interaction, aiRouter, imageQueue, presetManager) {
        if (!interaction.isButton()) return;

        const customId = interaction.customId;

        // Handle imagine command buttons
        if (customId.startsWith('imagine_')) {
            const imagineCommand = require('../commands/imagine');
            if (imagineCommand.handleButton) {
                await imagineCommand.handleButton(interaction, imageQueue);
            }
            return;
        }

        // Handle variation buttons
        if (customId.startsWith('variation_')) {
            await imageQueue.handleVariation(interaction, imageQueue);
            return;
        }

        // Handle upscale buttons
        if (customId.startsWith('upscale_')) {
            await imageQueue.handleUpscale(interaction);
            return;
        }

        // Handle preset buttons
        if (customId.startsWith('preset_')) {
            const presetCommand = require('../commands/preset');
            if (presetCommand.handleButton) {
                await presetCommand.handleButton(interaction, presetManager);
            }
            return;
        }

        // Handle other button interactions here as needed
        logger.debug(`Unhandled button interaction: ${customId}`);
    }
}

module.exports = SlashCommandManager;