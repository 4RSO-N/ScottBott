const { PermissionsBitField } = require('discord.js');
const logger = require('./logger');

class RoleManager {
    constructor(client) {
        this.client = client;
        this.botRoleName = 'ScottBot';
        this.botRoleColor = [52, 152, 219]; // Nice blue color (RGB array)
        this.requiredPermissions = [
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.EmbedLinks,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.UseExternalEmojis,
            PermissionsBitField.Flags.AddReactions,
            PermissionsBitField.Flags.ManageMessages, // For cleaning up if needed
            PermissionsBitField.Flags.UseApplicationCommands
        ];
    }

    /**
     * Create or update the bot's role in a guild
     */
    async ensureBotRole(guild) {
        try {
            // Check if the bot role already exists
            let botRole = guild.roles.cache.find(role => 
                role.name === this.botRoleName && role.managed === false
            );

            const botMember = guild.members.cache.get(this.client.user.id);
            if (!botMember) {
                logger.warn(`Bot member not found in guild ${guild.name}`);
                return null;
            }

            if (botRole) {
                // Update existing role permissions if needed
                await this.updateRolePermissions(botRole);
            } else {
                // Create the bot role
                botRole = await this.createBotRole(guild);
                if (!botRole) return null;
            }

            // Assign the role to the bot
            if (!botMember.roles.cache.has(botRole.id)) {
                await botMember.roles.add(botRole);
                logger.info(`Assigned ${this.botRoleName} role to bot in ${guild.name}`);
            }

            // Position the role appropriately
            await this.positionBotRole(guild, botRole);

            return botRole;

        } catch (error) {
            logger.error(`Error ensuring bot role in guild ${guild.name}:`, error);
            return null;
        }
    }

    /**
     * Create a new bot role
     */
    async createBotRole(guild) {
        try {
            const botRole = await guild.roles.create({
                name: this.botRoleName,
                color: this.botRoleColor,
                permissions: this.requiredPermissions,
                hoist: true, // Display separately in member list
                mentionable: false,
                reason: 'Automatic role creation for ScottBot'
            });

            logger.info(`Created ${this.botRoleName} role in ${guild.name}`);
            return botRole;

        } catch (error) {
            logger.error(`Failed to create bot role in guild ${guild.name}:`, error);
            return null;
        }
    }

    /**
     * Update role permissions
     */
    async updateRolePermissions(role) {
        try {
            const currentPermissions = role.permissions.bitfield;
            const requiredPermissions = new PermissionsBitField(this.requiredPermissions);
            
            if (currentPermissions !== requiredPermissions.bitfield) {
                await role.setPermissions(this.requiredPermissions, 'Updating bot role permissions');
                logger.info(`Updated permissions for ${this.botRoleName} role in ${role.guild.name}`);
            }
        } catch (error) {
            logger.error(`Failed to update role permissions in ${role.guild.name}:`, error);
        }
    }

    /**
     * Position the bot role to have proper hierarchy
     */
    async positionBotRole(guild, botRole) {
        try {
            const botMember = guild.members.cache.get(this.client.user.id);
            if (!botMember) return;

            // Get the bot's highest role (usually the managed role from Discord)
            const botHighestRole = botMember.roles.highest;
            
            // Position our custom role just below the bot's highest managed role
            // This ensures it has authority but doesn't conflict with Discord's managed role
            const targetPosition = Math.max(1, botHighestRole.position - 1);

            if (botRole.position !== targetPosition) {
                await botRole.setPosition(targetPosition, 'Positioning bot role in hierarchy');
                logger.info(`Positioned ${this.botRoleName} role at position ${targetPosition} in ${guild.name}`);
            }

        } catch (error) {
            logger.error(`Failed to position bot role in ${guild.name}:`, error);
        }
    }

    /**
     * Check if the bot has necessary permissions in a channel
     */
    hasRequiredPermissions(channel) {
        const botMember = channel.guild.members.cache.get(this.client.user.id);
        if (!botMember) return false;

        const permissions = channel.permissionsFor(botMember);
        if (!permissions) return false;

        return this.requiredPermissions.every(permission => 
            permissions.has(permission)
        );
    }

    /**
     * Get missing permissions for a channel
     */
    getMissingPermissions(channel) {
        const botMember = channel.guild.members.cache.get(this.client.user.id);
        if (!botMember) return this.requiredPermissions;

        const permissions = channel.permissionsFor(botMember);
        if (!permissions) return this.requiredPermissions;

        return this.requiredPermissions.filter(permission => 
            !permissions.has(permission)
        );
    }

    /**
     * Create a permissions report for a guild
     */
    async createPermissionsReport(guild) {
        try {
            const botMember = guild.members.cache.get(this.client.user.id);
            if (!botMember) return null;

            const botRole = guild.roles.cache.find(role => 
                role.name === this.botRoleName && role.managed === false
            );

            const report = {
                guildName: guild.name,
                guildId: guild.id,
                botRoleExists: !!botRole,
                botRoleId: botRole?.id,
                botRolePosition: botRole?.position,
                botHighestRole: botMember.roles.highest.name,
                botHighestRolePosition: botMember.roles.highest.position,
                hasAllPermissions: this.hasRequiredPermissions(guild.systemChannel || guild.channels.cache.first()),
                totalChannels: guild.channels.cache.size,
                accessibleChannels: 0,
                restrictedChannels: 0
            };

            // Check permissions in all text channels
            const textChannels = guild.channels.cache.filter(channel => channel.isTextBased());
            for (const channel of textChannels.values()) {
                if (this.hasRequiredPermissions(channel)) {
                    report.accessibleChannels++;
                } else {
                    report.restrictedChannels++;
                }
            }

            return report;

        } catch (error) {
            logger.error(`Error creating permissions report for ${guild.name}:`, error);
            return null;
        }
    }

    /**
     * Handle guild join event
     */
    async onGuildJoin(guild) {
        logger.info(`Bot joined guild: ${guild.name} (${guild.id})`);
        
        // Wait a moment for Discord to process the join
        setTimeout(async () => {
            await this.ensureBotRole(guild);
        }, 2000);
    }

    /**
     * Initialize role management for all guilds
     */
    async initializeAllGuilds() {
        logger.info('Initializing bot roles for all guilds...');
        
        const guilds = this.client.guilds.cache;
        let processed = 0;
        let successful = 0;

        for (const [, guild] of guilds) {
            try {
                const role = await this.ensureBotRole(guild);
                processed++;
                if (role) successful++;
                
                // Add a small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                logger.error(`Failed to initialize role for guild ${guild.name}:`, error);
                processed++;
            }
        }

        logger.info(`Role initialization complete: ${successful}/${processed} guilds processed successfully`);
        return { processed, successful };
    }
}

module.exports = RoleManager;