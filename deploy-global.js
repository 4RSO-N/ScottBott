const { REST, Routes, Client, GatewayIntentBits } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const commands = [];
const commandsPath = path.join(__dirname, 'src/commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Load all commands
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
    }
}

// Load all commands
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
    }
}

try {
    console.log('🤖 Logging in to get bot and guild info...\n');
    
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    await client.login(process.env.DISCORD_TOKEN);
    
    const clientId = client.user.id;
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    // Delete guild-specific commands from all guilds
    console.log('🗑️  Removing guild-specific commands...');
    for (const [guildId, guild] of client.guilds.cache) {
        try {
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
            console.log(`   ✅ Removed commands from ${guild.name}`);
        } catch (error) {
            console.log(`   ❌ Failed for ${guild.name}: ${error.message}`);
        }
    }
    
    // Deploy globally
    console.log('\n🌍 Deploying commands globally...');
    const data = await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
    );
    
    console.log(`\n✅ Successfully deployed ${data.length} commands globally!`);
    console.log('\n📝 Deployed commands:');
    for (const cmd of data) {
        console.log(`   - /${cmd.name}`);
    }
    console.log('\n⏰ Note: Global commands can take up to 1 hour to appear everywhere.');
    console.log('💡 Tip: They should appear faster in new servers or after Discord restart.\n');
    
    await client.destroy();
    process.exit(0);
} catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
}
