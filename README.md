# Discord AI Bot (scaffold)

This repository is a scaffold for a Discord bot that integrates:
- Google Gemini (primary LLM)
- Perplexity Sonar (backup LLM)
- Hugging Face Flux Schnell 1 (image generation)
- LangChain for per-channel memory

Important: This scaffold does NOT include any code to disable vendor safety
filters or to bypass content moderation. Running a bot that violates Discord's
Terms of Service or other platforms' policies can result in bans or account
suspension.

Quick start
1. Create a virtual environment and install dependencies:

```powershell
python -m venv .venv; .\.venv\Scripts\Activate; pip install -r requirements.txt
```

2. Copy `.env.example` to `.env` and fill in API keys.
3. Run the bot:

```powershell
python main.py
```

Files
- `main.py` - Bot entrypoint and event handlers
- `llm_handler.py` - Gemini + Sonar calling logic and failover
- `image_generator.py` - Hugging Face image generation wrapper
- `.env.example` - Example environment variables
- `requirements.txt` - Python dependencies

Notes on safety and legal considerations
- The bot must still follow Discord's Community Guidelines and Terms of Service.
- Third-party APIs may independently enforce content rules; the scaffold will
  not circumvent those protections.

Extending the scaffold
- Replace the placeholder HTTP calls with vendor-specific SDKs and auth.
- Add database-backed memory (Chroma, Redis, etc.) for persistence.
- Add rate-limit handling, retries with exponential backoff, and tests.
