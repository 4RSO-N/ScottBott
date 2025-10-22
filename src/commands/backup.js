const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('backup')
        .setDescription('Manage bot backups and data')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new backup')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type of backup to create')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Full Backup', value: 'full' },
                            { name: 'Incremental Backup', value: 'incremental' },
                            { name: 'Config Only', value: 'config_only' },
                            { name: 'Data Only', value: 'data_only' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all available backups'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Get detailed information about a backup')
                .addStringOption(option =>
                    option.setName('backup_id')
                        .setDescription('ID of the backup to inspect')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('verify')
                .setDescription('Verify the integrity of a backup')
                .addStringOption(option =>
                    option.setName('backup_id')
                        .setDescription('ID of the backup to verify')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a backup')
                .addStringOption(option =>
                    option.setName('backup_id')
                        .setDescription('ID of the backup to delete')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('View backup system statistics'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('cleanup')
                .setDescription('Clean up old backups according to retention policy')),
    
    async execute(interaction, aiRouter) {
        const bot = interaction.client.scottBot;
        if (!bot?.backupManager) {
            return await interaction.reply({
                content: '❌ Backup system not available.',
                ephemeral: true
            });
        }

        // Check if backup is already running
        if (bot.backupManager.isBackupRunning && 
            ['create'].includes(interaction.options.getSubcommand())) {
            return await interaction.reply({
                content: '⏳ A backup operation is already in progress. Please wait for it to complete.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'create':
                    await handleCreateBackup(interaction, bot.backupManager);
                    break;
                case 'list':
                    await handleListBackups(interaction, bot.backupManager);
                    break;
                case 'info':
                    await handleBackupInfo(interaction, bot.backupManager);
                    break;
                case 'verify':
                    await handleVerifyBackup(interaction, bot.backupManager);
                    break;
                case 'delete':
                    await handleDeleteBackup(interaction, bot.backupManager);
                    break;
                case 'stats':
                    await handleBackupStats(interaction, bot.backupManager);
                    break;
                case 'cleanup':
                    await handleCleanupBackups(interaction, bot.backupManager);
                    break;
                default:
                    await interaction.editReply('❌ Unknown backup command.');
            }

        } catch (error) {
            console.error('Error in backup command:', error);
            await interaction.editReply('❌ An error occurred while managing backups.');
        }
    }
};

async function handleCreateBackup(interaction, backupManager) {
    const backupType = interaction.options.getString('type') || 'incremental';
    
    try {
        await interaction.editReply(`🔄 Creating ${backupType} backup... This may take a few moments.`);
        
        const backupInfo = await backupManager.createBackup(backupType, false);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Backup Created Successfully')
            .setColor(0x00d4aa)
            .addFields(
                { name: '📁 Backup ID', value: backupInfo.id, inline: true },
                { name: '📊 Type', value: backupInfo.type.replace('_', ' '), inline: true },
                { name: '📏 Size', value: formatFileSize(backupInfo.size), inline: true },
                { name: '📄 Files', value: backupInfo.filesCount.toString(), inline: true },
                { name: '⏱️ Duration', value: `${backupInfo.duration}ms`, inline: true },
                { name: '🕒 Created', value: new Date(backupInfo.timestamp).toLocaleString(), inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ content: '', embeds: [embed] });

    } catch (error) {
        await interaction.editReply(`❌ Backup failed: ${error.message}`);
    }
}

async function handleListBackups(interaction, backupManager) {
    const backupHistory = backupManager.getBackupHistory();
    
    if (backupHistory.length === 0) {
        return await interaction.editReply('📂 No backups found. Use `/backup create` to create your first backup.');
    }

    const embed = new EmbedBuilder()
        .setTitle('📂 Backup History')
        .setColor(0x4285f4)
        .setDescription(`Found ${backupHistory.length} backup(s)`);

    // Show latest 10 backups
    const recentBackups = backupHistory.slice(0, 10);
    
    for (const backup of recentBackups) {
        const typeIcon = getBackupTypeIcon(backup.type);
        const statusIcon = backup.isAutomatic ? '🤖' : '👤';
        
        embed.addFields({
            name: `${typeIcon} ${backup.id}`,
            value: `**Type:** ${backup.type.replace('_', ' ')}\n**Size:** ${backup.sizeFormatted}\n**Files:** ${backup.filesCount}\n**Created:** ${statusIcon} ${new Date(backup.timestamp).toLocaleString()}`,
            inline: true
        });
    }

    if (backupHistory.length > 10) {
        embed.setFooter({ text: `Showing 10 of ${backupHistory.length} backups. Use backup info for details.` });
    }

    await interaction.editReply({ embeds: [embed] });
}

async function handleBackupInfo(interaction, backupManager) {
    const backupId = interaction.options.getString('backup_id');
    const backupHistory = backupManager.getBackupHistory();
    const backup = backupHistory.find(b => b.id === backupId);
    
    if (!backup) {
        return await interaction.editReply(`❌ Backup with ID \`${backupId}\` not found.`);
    }

    const embed = new EmbedBuilder()
        .setTitle(`📋 Backup Information: ${backup.id}`)
        .setColor(0x4285f4)
        .addFields(
            { name: '📊 Type', value: backup.type.replace('_', ' '), inline: true },
            { name: '📏 Size', value: backup.sizeFormatted, inline: true },
            { name: '📄 Files Count', value: backup.filesCount.toString(), inline: true },
            { name: '⏱️ Duration', value: backup.durationFormatted, inline: true },
            { name: '🕒 Created', value: new Date(backup.timestamp).toLocaleString(), inline: true },
            { name: '🤖 Automatic', value: backup.isAutomatic ? 'Yes' : 'No', inline: true }
        );

    if (backup.checksums) {
        const checksumCount = Object.keys(backup.checksums).length;
        embed.addFields({
            name: '🔐 Integrity',
            value: `${checksumCount} file checksums available`,
            inline: true
        });
    }

    embed.addFields({
        name: '📍 Location',
        value: `\`${backup.path}\``,
        inline: false
    });

    await interaction.editReply({ embeds: [embed] });
}

async function handleVerifyBackup(interaction, backupManager) {
    const backupId = interaction.options.getString('backup_id');
    
    try {
        await interaction.editReply(`🔍 Verifying backup \`${backupId}\`... Please wait.`);
        
        const verification = await backupManager.verifyBackup(backupId);
        const embed = await createVerificationEmbed(backupId, verification);
        
        await interaction.editReply({ content: '', embeds: [embed] });

    } catch (error) {
        await interaction.editReply(`❌ Verification failed: ${error.message}`);
    }
}

async function createVerificationEmbed(backupId, verification) {
    const embed = new EmbedBuilder()
        .setTitle(`🔍 Backup Verification: ${backupId}`)
        .setColor(verification.fileExists && verification.canDecompress ? 0x00d4aa : 0xff0000);

    if (verification.error) {
        return addErrorFields(embed, verification.error);
    }
    
    addBasicVerificationFields(embed, verification);
    addChecksumFields(embed, verification);
    
    return embed;
}

function addErrorFields(embed, error) {
    return embed.addFields({
        name: '❌ Verification Failed',
        value: error,
        inline: false
    });
}

function addBasicVerificationFields(embed, verification) {
    embed.addFields(
        { name: '📄 File Exists', value: verification.fileExists ? '✅ Yes' : '❌ No', inline: true },
        { name: '📦 Can Decompress', value: verification.canDecompress ? '✅ Yes' : '❌ No', inline: true },
        { name: '📊 Files Count', value: verification.filesCount?.toString() || 'Unknown', inline: true }
    );
}

function addChecksumFields(embed, verification) {
    if (!verification.checksumVerification) return;
    
    const checksumStatus = verification.checksumVerification.passed ? '✅ Passed' : '❌ Failed';
    embed.addFields({
        name: '🔐 Checksum Verification',
        value: checksumStatus,
        inline: true
    });

    if (!verification.checksumVerification.passed && verification.checksumVerification.differences.length > 0) {
        const differences = verification.checksumVerification.differences.slice(0, 5);
        const diffText = differences.map(diff => `${diff.file}: ${diff.issue}`).join('\n');
        embed.addFields({
            name: '⚠️ Checksum Issues',
            value: `\`\`\`${diffText}\`\`\``,
            inline: false
        });
    }
}

async function handleDeleteBackup(interaction, backupManager) {
    const backupId = interaction.options.getString('backup_id');
    
    try {
        await backupManager.deleteBackup(backupId);
        await interaction.editReply(`✅ Backup \`${backupId}\` deleted successfully.`);
    } catch (error) {
        await interaction.editReply(`❌ Failed to delete backup: ${error.message}`);
    }
}

async function handleBackupStats(interaction, backupManager) {
    const stats = backupManager.getBackupStats();
    
    const embed = new EmbedBuilder()
        .setTitle('📊 Backup System Statistics')
        .setColor(0x4285f4)
        .addFields(
            { name: '📁 Total Backups', value: stats.totalBackups.toString(), inline: true },
            { name: '💾 Total Size', value: stats.totalSize, inline: true },
            { name: '📊 Average Size', value: stats.averageSize, inline: true },
            { name: '⏰ System Status', value: stats.isRunning ? '🔄 Running' : '✅ Idle', inline: true }
        );

    if (stats.lastBackup) {
        embed.addFields({
            name: '🕒 Last Backup',
            value: new Date(stats.lastBackup).toLocaleString(),
            inline: true
        });
    }

    if (stats.nextAutoBackup) {
        embed.addFields({
            name: '⏭️ Next Auto Backup',
            value: new Date(stats.nextAutoBackup).toLocaleString(),
            inline: true
        });
    }

    await interaction.editReply({ embeds: [embed] });
}

async function handleCleanupBackups(interaction, backupManager) {
    try {
        const beforeCount = backupManager.getBackupHistory().length;
        await backupManager.cleanupOldBackups();
        const afterCount = backupManager.getBackupHistory().length;
        
        const deletedCount = beforeCount - afterCount;
        
        if (deletedCount > 0) {
            await interaction.editReply(`✅ Cleanup completed. Removed ${deletedCount} old backup(s).`);
        } else {
            await interaction.editReply('ℹ️ No old backups to clean up.');
        }
    } catch (error) {
        await interaction.editReply(`❌ Cleanup failed: ${error.message}`);
    }
}

function getBackupTypeIcon(type) {
    const icons = {
        'full': '📦',
        'incremental': '📁',
        'config_only': '⚙️',
        'data_only': '💾'
    };
    return icons[type] || '📄';
}

function formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    return `${Math.round(size * 100) / 100} ${units[unitIndex]}`;
}