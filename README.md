# ScottBot - Multi-AI Discord Chatbot

A powerful Discord bot that leverages multiple AI APIs for cost-efficient and intelligent responses. ScottBot uses **Gemini AI** for image descriptions and **Perplexity AI** for text responses, with smart routing to optimize costs and maintain high availability.

## 🚀 Features

- **Multi-AI Integration**: Seamlessly switches between Gemini and Perplexity APIs
- **Smart Routing**: Automatically selects the best AI service for each request
- **Cost Optimization**: Uses free tiers efficiently with intelligent load balancing
- **Image Analysis**: Upload images for AI-powered analysis and descriptions
- **Current Information**: Get up-to-date news, weather, and trending topics
- **Fallback System**: Automatic failover if one service is unavailable
- **Rate Limiting**: Built-in protection against spam and API overuse
- **Comprehensive Logging**: Detailed logs for monitoring and debugging

## 🛠️ Technologies

- **Node.js** - Runtime environment
- **Discord.js v14** - Discord API wrapper
- **Gemini AI** - Google's multimodal AI for text and vision
- **Perplexity AI** - Real-time search and chat AI
- **Winston** - Professional logging
- **Axios** - HTTP client for API requests

## 📋 Prerequisites

Before you begin, ensure you have:

- **Node.js 16.0.0+** installed
- A **Discord Bot Token** (from Discord Developer Portal)
- **Gemini API Key** (from Google AI Studio)
- **Perplexity API Key** (from Perplexity AI)

## 🔧 Installation

1. **Clone or download this project**
   ```bash
   git clone <your-repo-url>
   cd ScottBott
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   - Copy `.env.example` to `.env` (if exists) or create a `.env` file
   - Add your API keys:
   ```env
   DISCORD_TOKEN=your_discord_bot_token_here
   GEMINI_API_KEY=your_gemini_api_key_here
   PERPLEXITY_API_KEY=your_perplexity_api_key_here
   BOT_PREFIX=!
   DEFAULT_AI_PROVIDER=perplexity
   LOG_LEVEL=info
   ```

4. **Configure the bot on Discord**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application and bot
   - Copy the bot token to your `.env` file
   - Invite the bot to your server with appropriate permissions

## 🎮 Usage

### Starting the Bot

```bash
# Production
npm start

# Development (with auto-restart)
npm run dev
```

### Bot Commands

| Command | Description |
|---------|-------------|
| `!help` | Show available commands and features |
| `!status` | Check bot and AI service health |
| `!stats` | View detailed usage statistics |

### Interacting with AI

**Chat Responses:**
- Mention the bot: `@ScottBot What's the weather today?`
- Send a DM: Direct message for private conversations
- Ask anything: Current events, explanations, general questions

**Image Requests:**
- `@ScottBot generate image of a sunset over mountains`
- `@ScottBot create picture of a futuristic city`
- Upload an image and ask: "What's in this picture?"

## 🧠 AI Service Details

### Gemini AI
- **Purpose**: Image analysis, visual descriptions, general text
- **Models**: `gemini-2.5-pro`, `gemini-2.5-pro-vision`
- **Strengths**: Multimodal understanding, detailed descriptions
- **Rate Limits**: 60 requests per minute (free tier)

### Perplexity AI
- **Purpose**: Real-time information, current events, search-based responses
- **Models**: `sonar`
- **Strengths**: Current information, web search, citations
- **Rate Limits**: 50 requests per hour (free tier)

## 🔀 Smart Routing Logic

The bot automatically chooses the best AI service based on:

1. **Request Type**: Image requests → Gemini, Search queries → Perplexity
2. **Service Health**: Automatically switches if a service is down
3. **Load Balancing**: Distributes requests evenly across services
4. **Fallback Chain**: If primary service fails, tries backup services

## 📊 Monitoring & Logging

- **Log Files**: Located in `logs/` directory
  - `combined.log` - All log levels
  - `error.log` - Error messages only
  - `exceptions.log` - Uncaught exceptions
- **Real-time Monitoring**: Use `!status` command for live health checks
- **Usage Analytics**: Use `!stats` command for detailed metrics

## 🛡️ Security Features

- **API Key Protection**: All keys stored in environment variables
- **Rate Limiting**: Prevents spam and API abuse
- **Error Handling**: Graceful failure handling without exposing internals
- **Input Validation**: Sanitizes user inputs before processing

## 🚀 Deployment

### Local Development
```bash
npm run dev
```

### Production Server
```bash
npm start
```

### Process Management (PM2)
```bash
npm install -g pm2
pm2 start src/bot.js --name scottbot
pm2 startup
pm2 save
```

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DISCORD_TOKEN` | Required | Discord bot token |
| `GEMINI_API_KEY` | Required | Google Gemini API key |
| `PERPLEXITY_API_KEY` | Required | Perplexity AI API key |
| `BOT_PREFIX` | `!` | Command prefix |
| `DEFAULT_AI_PROVIDER` | `perplexity` | Preferred AI service |
| `RATE_LIMIT_REQUESTS` | `10` | Max requests per user per minute |
| `LOG_LEVEL` | `info` | Logging verbosity |

### Adding New AI Services

To add a new AI service:

1. Create a service class in `src/services/`
2. Implement required methods: `generateText()`, `healthCheck()`, `getUsageStats()`
3. Register the service in `aiRouter.js`
4. Update fallback order and routing logic

## 🐛 Troubleshooting

### Common Issues

**Bot doesn't respond:**
- Check Discord token validity
- Verify bot permissions in server
- Check `logs/error.log` for details

**AI services failing:**
- Verify API keys are correct
- Check service quotas and rate limits
- Use `!status` command to diagnose

**High memory usage:**
- Monitor with `!stats` command
- Check log file sizes in `logs/` directory
- Restart bot if needed

### Debug Mode

Enable verbose logging:
```env
LOG_LEVEL=debug
```

## 📈 Performance Tips

1. **Monitor API Usage**: Use `!stats` to track request patterns
2. **Optimize Prompts**: Shorter prompts = faster responses
3. **Load Balance**: Bot automatically balances, but monitor with `!status`
4. **Log Rotation**: Logs auto-rotate, but monitor disk space

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **Google Gemini AI** for multimodal AI capabilities
- **Perplexity AI** for real-time search and information
- **Discord.js** for the excellent Discord API wrapper
- **Winston** for robust logging functionality

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review the logs in `logs/` directory
3. Use `!status` and `!stats` commands for diagnostics
4. Create an issue with detailed error information

---

**Made with ❤️ for efficient AI-powered Discord interactions**