# ScottBot - Architecture Overview

## 🎯 Vision
A production-ready Discord AI bot with fast, streaming chat responses and async image generation, optimized for low latency and cost efficiency.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Discord                              │
│                    (User Interface)                          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ├── Text Messages
                  ├── Slash Commands
                  └── Button Interactions
                  │
┌─────────────────▼───────────────────────────────────────────┐
│                    ScottBot Main Process                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │          Message Handler & Intent Router                │ │
│  │  • Classify intent (chat vs image vs search)           │ │
│  │  • Route to appropriate service                         │ │
│  │  • Handle disambiguation                                │ │
│  └────────────────────────────────────────────────────────┘ │
└───────┬──────────────────────────────────────┬──────────────┘
        │                                      │
        │                                      │
   ┌────▼─────┐                          ┌────▼─────────┐
   │  Sonar   │                          │  Job Queue   │
   │  (Chat)  │                          │   (Bull)     │
   └────┬─────┘                          └────┬─────────┘
        │                                     │
        │ Streaming                           │ Async
        │ Response                            │ Processing
        │                                     │
   ┌────▼──────────────┐              ┌──────▼──────────┐
   │  Perplexity API   │              │  Image Worker   │
   │                   │              │                 │
   │  • sonar model    │              │  • Gemini VEO   │
   │  • Streaming      │              │  • Generation   │
   │  • Search mode    │              │  • Upscaling    │
   └───────────────────┘              └─────────────────┘
                                              │
                                              │
                                       ┌──────▼──────────┐
                                       │   Gemini API    │
                                       │  • Image gen    │
                                       │  • Variations   │
                                       └─────────────────┘
```

---

## 🔄 Request Flow

### Chat Request
```
User Message
    ↓
Intent Router (is it a question? task? lookup?)
    ↓
    ├─→ General Chat ──→ Sonar (no search) ──→ Stream to Discord
    └─→ Lookup Request ──→ Sonar (search mode) ──→ Stream to Discord
```

### Image Request
```
User: "generate an image of a duck"
    ↓
Intent Router (confidence: 98% image)
    ↓
Immediate Response: "🎨 Generating your image... (Job #1234)"
    ↓
Enqueue Job ──→ Redis Queue
    ↓
Worker picks up job
    ↓
Status Update: "Generating... 25%"
    ↓
Gemini API ──→ Generate Image
    ↓
Status Update: "Upscaling... 75%"
    ↓
Upload to Discord CDN
    ↓
Post Result: [Image] with metadata (seed, style, resolution)
```

### Mixed Request
```
User: "tell me about ducks and generate an image"
    ↓
Intent Router (confidence: chat + image)
    ↓
Split Request:
  ├─→ Chat: "tell me about ducks" ──→ Sonar ──→ Immediate Response
  └─→ Image: "duck image" ──→ Queue ──→ Async Generation
```

---

## 📊 Current Implementation Status

### ✅ Completed (Phase 0)
- [x] Basic Perplexity Sonar integration
- [x] Chat with 100-message history
- [x] Health checks and monitoring
- [x] Role management system
- [x] Error handling and logging
- [x] Character limit protection
- [x] Search mode control (disabled by default)
- [x] Image intent detection

### 🚧 In Progress (Phase 1)
- [ ] Streaming chat responses
- [ ] Async job queue for images
- [ ] Real Gemini image generation
- [ ] Enhanced intent routing

### 📅 Planned (Phase 2+)
- [ ] Slash commands (`/imagine`, `/style`, `/seed`)
- [ ] Interactive buttons (variations, upscale)
- [ ] Caching layer (Redis)
- [ ] Gallery system
- [ ] A/B testing framework

---

## 🧠 Prompt Routing Logic

### Classification Rules

| Message Pattern | Route | Model | Search Mode |
|----------------|-------|-------|-------------|
| General chat | Chat | Sonar | ❌ Off |
| "look up...", "search for..." | Chat | Sonar | ✅ On |
| "generate image", "make a picture" | Image | Gemini | N/A |
| "create logo of..." | Image | Gemini | N/A |
| Mixed intent | Split | Both | Depends |

### Confidence Thresholds
- **High confidence** (>90%): Route immediately
- **Medium confidence** (70-90%): Ask for clarification
- **Low confidence** (<70%): Default to chat

---

## ⚡ Performance Characteristics

### Latency Targets

| Operation | Target | Current | Status |
|-----------|--------|---------|--------|
| First token (chat) | <500ms | ~3s | 🔴 Needs streaming |
| Image ACK | <200ms | N/A | 🟡 To implement |
| Image complete (1024) | <30s | N/A | 🟡 To implement |
| Queue throughput | 10/min | N/A | 🟡 To implement |

### Resource Usage

| Resource | Limit | Current | Status |
|----------|-------|---------|--------|
| Memory | 512MB | ~150MB | ✅ Good |
| CPU | 2 cores | ~0.5 cores | ✅ Good |
| Redis | 256MB | N/A | 🟡 To add |
| Disk | 10GB | ~100MB | ✅ Good |

---

## 💰 Cost Model

### Per-Operation Costs (Estimated)

| Operation | Model | Cost | Notes |
|-----------|-------|------|-------|
| Chat (short) | Sonar | $0.0005 | <200 tokens |
| Chat (long) | Sonar | $0.001 | 200-400 tokens |
| Search | Sonar | $0.002 | With web access |
| Image (512) | Gemini | $0.02 | Fast, lower quality |
| Image (1024) | Gemini | $0.04 | Standard |
| Image (2048) | Gemini | $0.10 | HD, slower |

### Monthly Projections (100 active users)

| Scenario | Usage | Cost |
|----------|-------|------|
| Light (chat-heavy) | 10k chats, 500 images | $15 |
| Moderate | 20k chats, 2k images | $100 |
| Heavy (image-heavy) | 30k chats, 5k images | $250 |

---

## 🔒 Safety & Moderation

### Content Filtering Pipeline

```
User Input
    ↓
1. Discord AutoMod (first line)
    ↓
2. Pre-filter with Sonar
    ↓
3. Policy check against rules
    ↓
4. Rewrite if needed
    ↓
5. Send to generation
    ↓
6. Post-filter result
    ↓
7. Deliver to user
```

### Safety Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| **Strict** | Block most content | Public servers |
| **Medium** | Balanced (default) | Most use cases |
| **Permissive** | Allow more | Private/creative servers |

---

## 📦 Technology Stack

### Core Dependencies
```json
{
  "runtime": "Node.js v22+",
  "framework": "Discord.js v14",
  "ai": {
    "chat": "Perplexity Sonar API",
    "images": "Google Gemini VEO"
  },
  "queue": "Bull/BullMQ",
  "cache": "Redis/ioredis",
  "logging": "Winston",
  "monitoring": "Prometheus (planned)"
}
```

### Infrastructure
- **Hosting**: VPS or cloud (DigitalOcean, AWS, GCP)
- **Redis**: Managed Redis or self-hosted
- **Storage**: Local or S3 for image cache
- **CDN**: Discord's native CDN for images

---

## 🎮 User Experience

### Chat Example
```
User: @ScottBot what's the weather like?
Bot: I don't have real-time weather data, but you can say 
     "look up weather in [city]" and I'll search for you!

User: @ScottBot look up weather in Seattle
Bot: [Streaming] Currently in Seattle: 52°F, partly cloudy...
```

### Image Example
```
User: /imagine a serene mountain landscape at sunset
Bot: 🎨 Generating your image... (Job #4721)
     ⏱️ ETA: ~25 seconds
     
[25 seconds later]

Bot: ✅ Your image is ready!
     [Mountain landscape image]
     
     📊 Metadata:
     • Seed: 12345678
     • Style: Realistic
     • Resolution: 1024×1024
     • Model: Gemini 2.5 Flash
     
     [Buttons: 🔄 Regenerate | 📈 Upscale | 🎨 Vary Style]
```

---

## 📈 Monitoring & Observability

### Key Metrics
- **Latency**: p50, p95, p99 for all operations
- **Throughput**: Requests per minute by type
- **Error Rate**: % failed requests by cause
- **Queue Depth**: Pending jobs count
- **Cost**: $ per operation, daily/monthly totals

### Alerts
- Queue depth > 50
- Error rate > 5%
- Latency p95 > 5s
- Daily cost > $10

---

## 🚀 Deployment

### Development
```bash
npm install
cp .env.example .env
# Configure API keys
npm run dev
```

### Production
```bash
npm install --production
# Set environment variables
npm start

# Or with PM2
pm2 start src/index.js --name scottbot
```

### Docker (Planned)
```bash
docker-compose up -d
```

---

## 📚 Documentation

- **ARCHITECTURE.md** - This file
- **ROADMAP.md** - Implementation plan
- **API.md** - API reference (to be created)
- **DEPLOYMENT.md** - Deployment guide (to be created)

---

## 🤝 Contributing

See `ROADMAP.md` for upcoming features and how to contribute.

---

**Last Updated**: October 17, 2025
**Version**: 1.0.0 (Current), 2.0.0 (Target)
