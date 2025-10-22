const { REST, Routes } = require('discord.js');
require('dotenv').config();

try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const clientId = '1428715040999084133';
    
    console.log('🔍 Fetching registered commands...\n');
    const commands = await rest.get(Routes.applicationCommands(clientId));
    
    console.log(`✅ Found ${commands.length} registered commands:\n`);
    for (const cmd of commands) {
        console.log(`/${cmd.name}`);
        if (cmd.options && cmd.options.length > 0) {
            for (const opt of cmd.options) {
                let typeLabel = 'other';
                if (opt.type === 3) typeLabel = 'string';
                else if (opt.type === 4) typeLabel = 'integer';
                console.log(`  - ${opt.name} (${typeLabel})`);
            }
        }
        console.log('');
    }
} catch (error) {
    console.error('❌ Error:', error.message);
}
