const { REST, Routes } = require('discord.js');
require('dotenv').config();

try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const clientId = '1428715040999084133';
    
    console.log('🗑️  Deleting all global commands...');
    
    // Delete all global commands by setting to empty array
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    
    console.log('✅ Successfully deleted all global commands!');
    console.log('📝 Guild-specific commands will remain and appear only once now.');
    process.exit(0);
} catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
}
