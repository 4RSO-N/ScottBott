# ScottBot Implementation Roadmap

## Current Status ✅
- [x] Basic Perplexity Sonar integration
- [x] Chat functionality with 100 message history
- [x] Image description generation (text only)
- [x] Discord bot with role management
- [x] Health checks and error handling
- [x] Character limit handling for Discord

## Phase 1: Core Improvements (Priority: HIGH)

### 1.1 Enhanced Prompt Routing ⏳
- [ ] Create dedicated `promptRouter.js` with intent classification
- [ ] Implement confidence scoring for image vs chat detection
- [ ] Add disambiguation logic for mixed requests
- [ ] Separate search mode detection from general chat
- **Estimate**: 2-3 hours

### 1.2 Streaming Chat Responses ⏳
- [ ] Implement Perplexity streaming API
- [ ] Add Discord typing indicators
- [ ] Progressive message updates
- [ ] Token-by-token sending for perceived speed
- **Estimate**: 3-4 hours

### 1.3 Async Image Queue System ⏳
- [ ] Install Bull/BullMQ for job queuing
- [ ] Create `imageQueue.js` worker
- [ ] Implement job status tracking
- [ ] Add ephemeral status messages
- [ ] Post-completion notification system
- **Estimate**: 4-5 hours

### 1.4 Gemini Image Integration ⏳
- [ ] Replace text descriptions with actual image generation
- [ ] Implement proper Gemini image API calls
- [ ] Add seed control and reproducibility
- [ ] Resolution options (512, 1024, 2048)
- [ ] Image upload to Discord CDN
- **Estimate**: 3-4 hours

## Phase 2: Discord UX Enhancement (Priority: MEDIUM)

### 2.1 Slash Commands
- [ ] `/imagine` - Image generation with options
- [ ] `/style` - Set default style preferences
- [ ] `/size` - Set default resolution
- [ ] `/seed` - Reproducible generation
- [ ] `/queue` - View generation queue status
- [ ] `/history` - Recent generations with seeds
- **Estimate**: 2-3 hours

### 2.2 Interactive Components
- [ ] Buttons for image variations
- [ ] Upscale buttons (1024 → 2048)
- [ ] Regenerate with same seed
- [ ] Style variation buttons
- **Estimate**: 2-3 hours

### 2.3 Status & Progress
- [ ] Ephemeral "Generating..." messages
- [ ] Progress bar for long operations
- [ ] Queue position indicator
- [ ] ETA estimation
- **Estimate**: 2 hours

## Phase 3: Performance & Reliability (Priority: MEDIUM)

### 3.1 Caching Layer
- [ ] Install Redis/Memcached
- [ ] Cache recent conversation context
- [ ] Image thumbnail caching
- [ ] Prompt deduplication
- **Estimate**: 3 hours

### 3.2 Rate Limiting & Quotas
- [ ] Per-user rate limits
- [ ] Per-guild quotas
- [ ] Graceful degradation
- [ ] Queue priority system
- **Estimate**: 2 hours

### 3.3 Error Handling & Retry
- [ ] Exponential backoff for API failures
- [ ] Automatic retry with fallback
- [ ] User-friendly error messages
- [ ] Error telemetry
- **Estimate**: 2 hours

## Phase 4: Advanced Features (Priority: LOW)

### 4.1 Image Variations
- [ ] Seed-based variations
- [ ] Style transfer
- [ ] Aspect ratio controls
- [ ] Quality/detail settings
- **Estimate**: 3 hours

### 4.2 Multi-turn Refinement
- [ ] "Make it more..." commands
- [ ] Iterative improvements
- [ ] Context-aware edits
- **Estimate**: 4 hours

### 4.3 Gallery & History
- [ ] Per-user gallery
- [ ] Favorite/save system
- [ ] Share to gallery channel
- [ ] Voting system
- **Estimate**: 4-5 hours

## Phase 5: Monitoring & Optimization (Priority: LOW)

### 5.1 Observability
- [ ] Prometheus metrics
- [ ] Grafana dashboards
- [ ] Request tracing
- [ ] Cost tracking per feature
- **Estimate**: 3 hours

### 5.2 A/B Testing
- [ ] Feature flags
- [ ] Model comparison
- [ ] Performance testing
- **Estimate**: 2 hours

## Immediate Next Steps (Today)

### Priority 1: Fix Current Issues
1. ✅ Fixed character limit error
2. ✅ Fixed health check with "sonar" model
3. ✅ Prevented automatic web searches
4. ✅ Fixed image description generation

### Priority 2: Quick Wins (Next 2-3 hours)
1. **Enhanced Intent Detection** - Better routing logic
2. **Async Image Queue** - Non-blocking image generation
3. **Status Messages** - User feedback during processing

### Priority 3: Foundation (Next Week)
1. **Streaming Responses** - Faster perceived latency
2. **Slash Commands** - Better UX
3. **Real Image Generation** - Actual Gemini images

## Dependencies & Prerequisites

### Required Packages
```json
{
  "bull": "^4.12.0",          // Job queue
  "ioredis": "^5.3.2",        // Redis client
  "axios": "^1.6.2",           // Already installed
  "discord.js": "^14.14.1",    // Already installed
  "@google/generative-ai": "^0.2.1"  // Already installed
}
```

### Infrastructure
- Redis server (local or cloud)
- Sufficient memory for job queue
- Worker process management

## Success Metrics

### Performance Targets
- Chat response first token: <500ms
- Image generation acknowledgment: <200ms
- Image completion: <30s (1024×1024)
- Queue throughput: 10 images/min

### Quality Targets
- Intent classification accuracy: >95%
- Error rate: <1%
- User satisfaction: >4.5/5

### Cost Targets
- Average cost per chat: <$0.001
- Average cost per image: <$0.05
- Monthly operational cost: <$50

## Risk Assessment

### High Risk
- **Gemini API quotas**: Mitigate with queue throttling
- **Discord rate limits**: Implement exponential backoff
- **Memory usage**: Monitor and optimize queue size

### Medium Risk
- **Redis availability**: Add connection retry logic
- **Worker crashes**: Implement process supervision
- **Cost overruns**: Add budget alerts

### Low Risk
- **Feature complexity**: Start simple, iterate
- **User adoption**: Gradual rollout with testing
