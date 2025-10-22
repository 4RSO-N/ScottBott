const ScottBot = require('./bot');

console.log('🚀 Starting ScottBot...');
console.log('📊 Environment Configuration:');
console.log(`- Node.js Version: ${process.version}`);
console.log(`- Bot Prefix: ${process.env.BOT_PREFIX || '!'}`);
console.log(`- Default AI Provider: ${process.env.DEFAULT_AI_PROVIDER || 'perplexity'}`);
console.log(`- Log Level: ${process.env.LOG_LEVEL || 'info'}`);
console.log('');

// Health check for environment variables
const requiredEnvVars = ['DISCORD_TOKEN', 'PERPLEXITY_API_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    for (const varName of missingVars) {
        console.error(`   - ${varName}`);
    }
    console.error('\nPlease check your .env file and ensure all required variables are set.');
    process.exit(1);
}

console.log('✅ All environment variables configured');
console.log('🤖 Initializing ScottBot...\n');

console.log('🤖 Initializing ScottBot...\n');

// Start the bot
let bot;
try {
    bot = new ScottBot();
    await bot.init();
} catch (error) {
    console.error('❌ Failed to start ScottBot:', error.message);
    console.error(error.stack);
    process.exit(1);
}

// Handle process termination
process.on('SIGINT', async () => {
    console.log('\n📛 Received SIGINT, shutting down gracefully...');
    if (bot) {
        await bot.shutdown();
    }
});

process.on('SIGTERM', async () => {
    console.log('\n📛 Received SIGTERM, shutting down gracefully...');
    if (bot) {
        await bot.shutdown();
    }
});