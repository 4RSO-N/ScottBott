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
        console.log(`✅ Loaded: ${command.data.name}`);
    }
}

// Deploy commands
async function deployCommands() {
    try {
        console.log(`\n🚀 Started refreshing ${commands.length} application (/) commands.`);

        // Create a minimal client to get the application ID
        const client = new Client({ intents: [GatewayIntentBits.Guilds] });
        
        await client.login(process.env.DISCORD_TOKEN);
        const clientId = client.user.id;
        console.log(`Bot ID: ${clientId}`);
        
        // Construct REST module
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

        // The put method is used to fully refresh all commands with the current set
        const data = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log(`✅ Successfully reloaded ${data.length} application (/) commands globally!`);
        console.log('\n📝 Deployed commands:');
        for (const cmd of data) {
            console.log(`   - /${cmd.name}: ${cmd.description}`);
        }
        console.log('\n✨ Commands should appear in Discord within a few minutes.');
        
        await client.destroy();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
        process.exit(1);
    }
}

deployCommands();
