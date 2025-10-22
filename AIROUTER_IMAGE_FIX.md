# AIRouter Image Generation Fix

## Problem
Image generation requests were being routed to Perplexity AI instead of Gemini Imagen API. Perplexity was generating text descriptions of images rather than actually creating images.

## Root Causes

### 1. Missing Gemini Service Registration
**File:** `src/services/aiRouter.js`
**Issue:** The `initializeServices()` method only registered Perplexity service, never Gemini
```javascript
// BEFORE - Only Perplexity was registered
async initializeServices() {
    // Initialize Perplexity service
    this.services.set('perplexity', new PerplexityService());
    // ❌ Gemini was never registered!
}
```

**Fix:** Added Gemini service registration
```javascript
// AFTER - Both services registered
async initializeServices() {
    // Perplexity for chat
    this.services.set('perplexity', new PerplexityService());
    
    // Gemini for image generation and vision
    const GeminiService = require('./geminiService');
    this.services.set('gemini', new GeminiService());
}
```

### 2. Wrong Implementation of generateImage()
**File:** `src/services/aiRouter.js`
**Issue:** `generateImage()` method was asking Perplexity to create text descriptions instead of using Gemini to generate actual images

```javascript
// BEFORE - Perplexity generating descriptions
async generateImage(prompt, context = {}) {
    const perplexity = this.services.get('perplexity');
    const imagePrompt = `Create a detailed visual description...`;
    const result = await perplexity.generateChatResponse(imagePrompt);
    return { content: description }; // ❌ Returns text, not an image!
}
```

**Fix:** Changed to use Gemini Imagen API for actual image generation
```javascript
// AFTER - Gemini generating real images
async generateImage(prompt, options = {}) {
    const gemini = this.services.get('gemini');
    const result = await gemini.generateImage(prompt, options);
    return result; // ✅ Returns actual image data
}
```

### 3. Incorrect Service Instance in Bot
**File:** `src/bot.js`
**Issue:** Bot was requiring the GeminiService class instead of using the instantiated service from AIRouter

```javascript
// BEFORE - Creating new instance
const geminiService = require('./services/geminiService'); // ❌ Class, not instance
await this.imageQueue.initialize(geminiService, this.client);
```

**Fix:** Use the properly initialized Gemini service from AIRouter
```javascript
// AFTER - Using AIRouter's instance
const geminiService = this.aiRouter.services.get('gemini'); // ✅ Proper instance
if (geminiService) {
    await this.imageQueue.initialize(geminiService, this.client);
}
```

## Changes Made

### 1. `src/services/aiRouter.js`
- ✅ Added Gemini service registration in `initializeServices()`
- ✅ Completely rewrote `generateImage()` to use Gemini Imagen API
- ✅ Updated logging to reflect proper service usage
- ✅ Gemini now automatically included in health checks

### 2. `src/bot.js`
- ✅ Changed to get Gemini service from AIRouter instead of requiring class
- ✅ Added null check for Gemini service availability
- ✅ Added warning log if Gemini service not available

## How It Works Now

### Image Generation Flow:
```
User: /imagine a cat
  ↓
Bot Command Handler
  ↓
ImageQueue.addImageJob()
  ↓
ImageQueue.processImageGeneration()
  ↓
geminiService.generateImage(prompt) ← ✅ GEMINI IMAGEN API
  ↓
Real Image Generated
  ↓
Posted to Discord with Embed
```

### Service Routing:
- **Chat/Text:** Perplexity AI
- **Image Generation:** Gemini Imagen API ✅
- **Image Analysis:** Gemini Vision API

## Testing Checklist

- [ ] Bot starts successfully
- [ ] Gemini service registers: `✅ Gemini service registered - handling image generation and vision`
- [ ] `/imagine` command generates actual images (not text descriptions)
- [ ] Image queue uses Gemini service
- [ ] Health checks include Gemini
- [ ] No Perplexity calls for image generation

## Expected Log Output

### Startup:
```
✅ Perplexity service registered - handling chat
✅ Gemini service registered - handling image generation and vision
Performing health checks on AI services...
✅ perplexity service is healthy
✅ gemini service is healthy
✅ Image queue initialized (direct processing, no Redis required)
```

### During Image Generation:
```
Processing image generation request with Gemini Imagen
Image generated successfully with Gemini
Service usage: gemini - image (1 requests in last hour)
```

## API Usage After Fix

| Service    | Purpose                  | API Used          |
|------------|--------------------------|-------------------|
| Perplexity | Chat responses           | Perplexity API    |
| Gemini     | Image generation         | Gemini Imagen API |
| Gemini     | Image analysis (vision)  | Gemini Vision API |

## Cost Efficiency Maintained

✅ Chat: Perplexity (cost-effective for text)
✅ Images: Gemini Imagen (designed for image generation)
✅ Vision: Gemini Vision (image understanding)

This maintains your original cost-efficiency strategy while routing each task to the appropriate AI service!

## Summary

**Problem:** Images being "generated" by Perplexity as text descriptions
**Root Cause:** Gemini service never registered, wrong generateImage() implementation
**Solution:** Properly register Gemini, rewrite generateImage() to use Imagen API
**Result:** Real image generation via Gemini Imagen API ✅
