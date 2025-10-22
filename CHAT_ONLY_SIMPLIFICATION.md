# Bot Simplification - Chat Only Mode

## Changes Made

### 1. **Removed Image Generation Completely**
- ❌ Removed Gemini service initialization
- ❌ Removed imageQueue initialization
- ❌ Disabled `/imagine` command (shows friendly message)
- ❌ Removed all image-related code paths

### 2. **Optimized for Fast Chat Responses**

#### Perplexity Service Optimizations:
- **Faster Model**: Changed to `llama-3.1-sonar-small-128k-chat` (faster than regular sonar)
- **Short Responses**: Default 150 tokens (1-2 sentences)
- **Higher Creativity**: Temperature 0.9 for more human-like responses
- **Better Timeout**: Increased to 20 seconds (Perplexity can be slow)
- **Improved Error Handling**: Detailed logging to diagnose API issues

#### Personality Improvements:
```javascript
"You are ScottBot, a witty and laid-back friend chatting on Discord."

PERSONALITY:
- Talk like a real person, not an AI assistant
- Understand sarcasm, jokes, and hidden meanings
- Keep responses SHORT (1-2 sentences max)
- Be playful, use humor when appropriate
- Don't be overly helpful or formal
```

### 3. **Removed Blocking Operations**
- ❌ Health checks no longer block startup (run in background)
- ❌ Removed image queue delays
- ❌ No Redis connection attempts

### 4. **Fixed Bot Initialization**
- ✅ Removed duplicate bot instantiation (was creating 2 bots!)
- ✅ Proper signal handling (SIGINT/SIGTERM)
- ✅ Clean shutdown process

## Current Status

### ✅ Working:
- Bot starts quickly
- Connects to Discord
- Loads all commands
- Stays online (no random exits)
- Redis errors completely gone

### ⚠️ Needs Testing:
- Perplexity API responses (currently timing out)
- Chat conversation quality
- Response speed

## API Configuration

### Required:
- `PERPLEXITY_API_KEY` - For all chat responses

### Not Required (removed):
- ~~GEMINI_API_KEY~~ - Image generation disabled
- ~~REDIS_URL~~ - No queue system needed

## Bot Behavior

### Chat Responses:
- **Style**: Conversational, witty, laid-back
- **Length**: 1-2 sentences (150 tokens max)
- **Speed**: Target < 5 seconds
- **Tone**: Friendly, understands jokes and sarcasm

### Image Requests:
- `/imagine` command → "Image generation disabled" message
- Focus is on conversations only

## Next Steps

1. **Test Perplexity API**:
   - Verify API key is valid
   - Check if requests are timing out
   - Review error logs for specific issues

2. **Optimize Response Time**:
   - If Perplexity is too slow, consider:
     - Using a faster model
     - Reducing token count further
     - Adding response caching

3. **Test Conversation Quality**:
   - Try different message types
   - Test jokes, sarcasm, casual chat
   - Verify personality is natural

## Troubleshooting

### If Bot Won't Respond:
1. Check logs for "Perplexity API error"
2. Verify `PERPLEXITY_API_KEY` in `.env`
3. Test API key with curl:
```bash
curl -X POST https://api.perplexity.ai/chat/completions \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"llama-3.1-sonar-small-128k-chat","messages":[{"role":"user","content":"hi"}]}'
```

### If Responses Are Slow:
- Perplexity can take 10-20 seconds sometimes
- Consider adding "typing" indicator
- May need to switch AI providers if too slow

### If Personality Is Off:
- Adjust system prompt in `perplexityService.js`
- Change temperature (higher = more creative)
- Modify max_tokens for longer/shorter responses

## Files Modified

- `src/services/aiRouter.js` - Removed Gemini, simplified routing
- `src/services/perplexityService.js` - Optimized for speed and personality
- `src/bot.js` - Removed imageQueue, fixed initialization
- `src/index.js` - Fixed signal handling
- `src/commands/imagine.js` - Disabled with friendly message

## Performance Improvements

**Before**:
- Redis connection errors spamming console
- Health checks blocking startup (15+ seconds)
- Image queue overhead
- Duplicate bot instances
- Complex AI routing logic

**After**:
- Clean startup (< 3 seconds)
- No Redis errors
- Simple chat-only architecture
- Single bot instance
- Direct Perplexity integration

**Startup Time**: ~2-3 seconds
**Target Response Time**: < 5 seconds
**Memory Usage**: Reduced (no Bull queue, no Gemini service)

