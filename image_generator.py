"""
Image generation utilities using Hugging Face Inference API / diffusers.

This module implements:
- async generate_image(prompt) -> bytes | str

It uses an API key from the environment variable HUGGINGFACE_API_KEY. The
implementation below calls the Hugging Face Inference API and returns the raw
image bytes when possible or a URL if the model returns a link.
"""
import os
try:
    import aiohttp
except Exception:
    aiohttp = None

HUGGINGFACE_API_KEY = os.getenv("HUGGINGFACE_API_KEY")
HF_MODEL_ID = "google/flux-schnell-1"  # placeholder — replace with the real model id

async def generate_image(prompt: str):
    if not HUGGINGFACE_API_KEY:
        raise RuntimeError("HUGGINGFACE_API_KEY not set")

    if aiohttp is None:
        raise RuntimeError("aiohttp is required for image generation. Please install it (pip install aiohttp).")

    url = f"https://api-inference.huggingface.co/models/{HF_MODEL_ID}"
    headers = {"Authorization": f"Bearer {HUGGINGFACE_API_KEY}"}
    payload = {"inputs": prompt}

    if aiohttp is None:
        raise RuntimeError("aiohttp is required for image generation. Please install it (pip install aiohttp).")

    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, headers=headers, timeout=60) as resp:
            if resp.status != 200:
                text = await resp.text()
                raise RuntimeError(f"Hugging Face error: {resp.status} - {text}")

            content_type = resp.headers.get("content-type", "")
            if content_type.startswith("image/"):
                # Direct image bytes
                return await resp.read()
            else:
                # Assume JSON with either a url or base64; adapt as needed
                data = await resp.json()
                if isinstance(data, dict) and "url" in data:
                    return data["url"]
                # Some HF Inference endpoints return base64 strings in a list
                if isinstance(data, list) and data and isinstance(data[0], dict) and "generated_image" in data[0]:
                    # placeholder field name
                    return data[0]["generated_image"]
                # Fallback: return raw JSON
                return str(data)
