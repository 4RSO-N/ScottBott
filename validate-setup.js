const fs = require('node:fs');
const path = require('node:path');

console.log('🔍 ScottBot Setup Validation\n');

// Check if all required files exist
const requiredFiles = [
    'package.json',
    'src/bot.js',
    'src/index.js',
    'src/services/aiRouter.js',
    'src/services/geminiService.js',
    'src/services/perplexityService.js',
    'src/utils/logger.js',
    'src/commands/help.js',
    'src/commands/status.js',
    'src/commands/stats.js',
    '.env',
    '.gitignore',
    'README.md'
];

console.log('📁 Checking file structure...');
let allFilesExist = true;

for (const file of requiredFiles) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
        console.log(`✅ ${file}`);
    } else {
        console.log(`❌ ${file} - MISSING`);
        allFilesExist = false;
    }
}

console.log('\n🔧 Checking environment configuration...');

// Load environment variables
require('dotenv').config();

const envChecks = [
    { name: 'DISCORD_TOKEN', required: true },
    { name: 'GEMINI_API_KEY', required: true },
    { name: 'PERPLEXITY_API_KEY', required: true },
    { name: 'BOT_PREFIX', required: false, default: '!' },
    { name: 'DEFAULT_AI_PROVIDER', required: false, default: 'perplexity' },
    { name: 'LOG_LEVEL', required: false, default: 'info' }
];

let allEnvVarsValid = true;

for (const check of envChecks) {
    const value = process.env[check.name];
    if (check.required && !value) {
        console.log(`❌ ${check.name} - MISSING (Required)`);
        allEnvVarsValid = false;
    } else if (value) {
        const maskedValue = check.name.includes('TOKEN') || check.name.includes('KEY') 
            ? '*'.repeat(Math.min(value.length, 20)) 
            : value;
        console.log(`✅ ${check.name} - ${maskedValue}`);
    } else {
        console.log(`⚠️ ${check.name} - Using default: ${check.default}`);
    }
}

console.log('\n📦 Checking dependencies...');

try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const dependencies = Object.keys(packageJson.dependencies || {});
    
    for (const dep of dependencies) {
        try {
            require.resolve(dep);
            console.log(`✅ ${dep}`);
        } catch (error) {
            console.log(`❌ ${dep} - NOT INSTALLED (${error.message})`);
            allFilesExist = false;
        }
    }
} catch (error) {
    console.log(`❌ Error reading package.json: ${error.message}`);
    allFilesExist = false;
}

console.log('\n📊 Summary:');
if (allFilesExist && allEnvVarsValid) {
    console.log('🎉 ScottBot is ready to start!');
    console.log('\nTo start the bot, run:');
    console.log('  npm start           # Production mode');
    console.log('  npm run dev         # Development mode with auto-restart');
    console.log('\nTo test the setup without starting the bot:');
    console.log('  node src/bot.js     # Direct execution');
} else {
    console.log('⚠️ Setup incomplete. Please fix the issues above before starting the bot.');
    
    if (!allEnvVarsValid) {
        console.log('\n🔑 Environment Variables Help:');
        console.log('1. Make sure your .env file exists in the project root');
        console.log('2. Add the required API keys:');
        console.log('   DISCORD_TOKEN=your_bot_token_from_discord_developer_portal');
        console.log('   GEMINI_API_KEY=your_gemini_api_key_from_google_ai_studio');
        console.log('   PERPLEXITY_API_KEY=your_perplexity_api_key');
    }
    
    if (!allFilesExist) {
        console.log('\n📁 Missing Files Help:');
        console.log('1. Make sure all source files are in place');
        console.log('2. Run "npm install" to install dependencies');
    }
}