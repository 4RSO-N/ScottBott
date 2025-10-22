# ScottBot Architecture Documentation

## Overview
ScottBot is a Discord AI chatbot with text and image generation capabilities, designed for low latency and async task handling.

## Core Architecture

### Runtime
- **Platform**: Node.js v22+
- **Main Process**: Handles Discord events, chat routing, and coordination
- **Worker Threads**: Async image generation to prevent blocking chat
- **Job Queue**: Bull/BullMQ for reliable async task processing

### AI Services

#### Perplexity Sonar (Chat)
- **Purpose**: All conversational interactions
- **Model**: `sonar`
- **Features**:
  - Streaming responses for low perceived latency
  - Search mode (disabled by default, enabled on explicit request)
  - Max tokens: 400 (conversational), 800 (search mode)
  - Temperature: 0.7 (chat), 0.3 (search)

#### Gemini VEO (Images)
- **Purpose**: Text-to-image generation and editing
- **Model**: `gemini-2.5-flash` or `gemini-veo`
- **Features**:
  - Async generation with job queue
  - Status updates during generation
  - Seed control for reproducibility
  - Resolution options (1024×1024 default, upscale on demand)

## Routing Logic

### Message Intent Detection
1. **Image Request Detection**:
   - Keywords: "generate", "create", "make" + "image/picture/photo/poster/logo"
   - Explicit: Size params (1024x1024), aspect ratios (16:9), style modifiers
   - Commands: `/imagine`, `/img`, slash commands

2. **Chat Default**:
   - All other messages route to Sonar
   - Search mode ONLY if: "look up", "search for", "find information about"
   - Otherwise: Pure conversational mode (no web search)

3. **Disambiguation**:
   - Mixed requests split into two parts:
     - Immediate: Chat response via Sonar (streaming)
     - Queued: Image generation via Gemini (async with job ID)

### Fallback Strategy
- **Gemini rate limit**: Inform user, suggest retry or lower resolution
- **Gemini error**: Explain briefly, offer alternatives
- **Queue full**: Inform about estimated wait time

## Latency Controls

### Streaming Chat (Sonar)
- Use Perplexity streaming API
- Send first tokens within 200-500ms
- Cap tokens: 256-512 for routine chat
- Discord typing indicator while streaming

### Async Images (Gemini)
- Immediate acknowledgment: "🎨 Generating your image..."
- Job ID displayed for tracking
- Status updates: queued → generating → upscaling → complete
- Post result when ready (non-blocking)

### Caching
- Cache recent prompts (last 100)
- Store image seeds for variations
- Thumbnail cache for quick previews
- Redis/KV store for distributed caching

## Discord Interaction Model

### Slash Commands
- `/imagine <prompt>` - Explicit image generation
  - Options: `--style`, `--size`, `--seed`, `--hd`
- `/style <preset>` - Set default style (realistic, artistic, cartoon)
- `/size <resolution>` - Default resolution (512, 1024, 2048)
- `/seed <number>` - Control reproducibility
- `/queue` - Check image generation queue status

### Natural Chat
- Free-form messages use router logic
- Only switch to Gemini on clear image intent
- Always prefer Sonar for ambiguous cases

### Status Updates
- Ephemeral messages for processing status
- Non-intrusive progress indicators
- Edit original message when complete
- Include metadata (seed, steps, model) in results

## Safety & Moderation

### Pre-filtering
- Run Sonar classifier before Gemini
- Reject or rewrite policy-violating prompts
- Explain constraints clearly to users

### Provider Policies
- Respect Gemini safety settings
- Default: BLOCK_MEDIUM_AND_ABOVE
- Allow server admins to configure within limits

### Content Logging
- Log prompts without API keys
- Store generation metadata
- Track usage per guild/user
- Retention: 30 days

## Configuration

### Environment Variables
```env
# AI Services
PERPLEXITY_API_KEY=<sonar-key>
GEMINI_API_KEY=<gemini-key>

# Bot Config
DISCORD_TOKEN=<bot-token>
BOT_PREFIX=!
DEFAULT_AI_PROVIDER=perplexity

# Performance
MAX_CONVERSATION_LENGTH=100
RATE_LIMIT_REQUESTS=10
STREAM_CHUNK_SIZE=50

# Image Generation
IMAGE_DEFAULT_SIZE=1024x1024
IMAGE_DEFAULT_STYLE=realistic
IMAGE_QUEUE_MAX_SIZE=100
IMAGE_GENERATION_TIMEOUT=300000

# Caching
REDIS_URL=redis://localhost:6379
CACHE_TTL=3600
```

### Per-Guild Settings (Redis)
```json
{
  "guild_id": "123456789",
  "default_style": "artistic",
  "default_size": "1024x1024",
  "allow_search_mode": true,
  "safety_level": "medium",
  "rate_limit_override": 20
}
```

## Cost Optimization

### Prioritize Sonar
- Default to Sonar for all chat (lower cost, faster)
- Only use Gemini for explicit image requests
- Batch similar requests when possible

### Image Generation Tiers
- **Standard** (512×512): Fast, low cost
- **HD** (1024×1024): Default, balanced
- **Ultra** (2048×2048): Gated, high cost
- Encourage variations before upscaling

### Rate Limiting
- Per-user: 10 images/hour
- Per-guild: 100 images/hour
- Queue throttling during high load

## Monitoring & Observability

### Metrics
- Request latency (p50, p95, p99)
- Token usage per model
- Queue depth and processing time
- Error rates by type
- Cost per operation

### Logging
- Structured JSON logs (Winston)
- Log levels: error, warn, info, debug
- Request tracing with correlation IDs
- Performance monitoring integration

## Future Enhancements

### Phase 2
- [ ] Multi-turn image refinement
- [ ] Image variations (seed-based)
- [ ] Style transfer
- [ ] Batch generation

### Phase 3
- [ ] Voice-to-image
- [ ] Image-to-image editing
- [ ] Animation generation
- [ ] 3D model preview

### Phase 4
- [ ] Custom model fine-tuning
- [ ] User-specific style presets
- [ ] Collaborative generation
- [ ] Gallery system with voting
