# Discord AI Bot (scaffold)

This repository is a scaffold for a Discord bot that integrates:
- Google Gemini (primary LLM)
- Perplexity Sonar (backup LLM)
- Hugging Face Flux Schnell 1 (image generation)
- LangChain for per-channel memory

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

