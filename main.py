import os
import re
import asyncio
import uuid
import datetime
try:
    from dotenv import load_dotenv
    HAS_DOTENV = True
except Exception:
    # dotenv not installed; provide a no-op so env vars can still be read from
    # the OS environment.
    def load_dotenv():
        return None
    HAS_DOTENV = False

import discord
from discord.ext import commands
from discord import app_commands
import io
import json
from pathlib import Path
import logging
# Ensure environment variables from .env are loaded before importing modules
# that may read them at import-time.
load_dotenv()
if not HAS_DOTENV:
    print("python-dotenv not installed; ensure environment variables are set in the OS environment or install python-dotenv.")

# Non-sensitive startup info: report whether keys are present (True/False)
import os as _os
print("Startup env check: ", end="")
print(f"GEMINI={bool(_os.getenv('GEMINI_API_KEY'))}, PERPLEXITY={bool(_os.getenv('PERPLEXITY_API_KEY'))}, HUGGINGFACE={bool(_os.getenv('HUGGINGFACE_API_KEY'))}")

# Basic logging configuration so subsystems (llm_handler, image_generator)
# can emit logs that are visible when running the bot in the foreground.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

from llm_handler import get_response
from image_generator import generate_image
try:
    from langchain.memory import ConversationBufferMemory
    HAS_LANGCHAIN = True
except Exception:
    # Provide a minimal fallback memory implementation so the scaffold can run
    # in environments without langchain installed. This stores history in
    # memory for the current process only (not persistent).
    HAS_LANGCHAIN = False

    class ConversationBufferMemory:
        def __init__(self):
            self._history = []

        def load_memory_variables(self, _inputs):
            return {"history": "\n".join(self._history)}

        def save_context(self, inputs, outputs):
            user = inputs.get("input", "")
            bot = outputs.get("output", "")
            if user:
                self._history.append(f"User: {user}")
            if bot:
                self._history.append(f"Assistant: {bot}")

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")

INTENTS = discord.Intents.default()
INTENTS.message_content = True

bot = commands.Bot(command_prefix="!", intents=INTENTS)

# Per-channel memory store: {channel_id: ConversationBufferMemory}
channel_memories = {}


# Common message used when a command must be run in a guild (not in DMs)
GUILD_ONLY_MSG = "This command must be used in a server/guild."

# Persistence file for per-guild NSFW toggles and reminders
_NSFW_FILE = Path(__file__).parent / "guild_nsfw.json"
REMINDERS_FILE = Path(__file__).parent / "reminders.json"

# Developer override (can be set via env var or hard-coded)
DEVELOPER_ID = int(os.getenv("DEV_USER_ID") or "398077353785294853")

# --- Reminder Helper Functions ---

def parse_natural_language_reminder(message_text: str) -> tuple[int | None, str, str]:
    """
    Parses a natural language string to find a reminder.
    Handles formats like "[...] to [task] in [time]" and "[...] in [time] to [task]".
    Returns a tuple of (seconds, reminder_text, time_string) or (None, "", "")
    """
    # Pattern 1: looks for "... to [task] in/after [time]"
    pattern1 = re.compile(
        r"to (.+?)\s(?:in|after)\s+(\d+)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours)",
        re.IGNORECASE
    )
    # Pattern 2: looks for "... in/after [time] to [task]"
    pattern2 = re.compile(
        r"(?:in|after)\s+(\d+)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours)\s+to\s+(.+)",
        re.IGNORECASE
    )

    match = pattern1.search(message_text) or pattern2.search(message_text)

    if not match:
        return None, "", ""

    if match.re.pattern == pattern1.pattern:
        reminder, value, unit = match.groups()
    else:  # pattern2
        value, unit, reminder = match.groups()

    value = int(value)
    unit_lower = unit.lower()
    
    seconds = 0
    if unit_lower in ['s', 'sec', 'second', 'seconds']:
        seconds = value
    elif unit_lower in ['m', 'min', 'minute', 'minutes']:
        seconds = value * 60
    elif unit_lower in ['h', 'hr', 'hour', 'hours']:
        seconds = value * 3600
    
    # Create a user-friendly string for the reply
    time_str = f"{value} {unit.lower()}"
    if value == 1 and time_str.endswith('s'):
        time_str = time_str[:-1] # Make singular (e.g., "1 minute")
    
    return seconds, reminder.strip(), time_str


async def check_reminders_loop():
    """Continuously checks for due reminders and sends them."""
    await bot.wait_until_ready()
    while not bot.is_closed():
        try:
            if not REMINDERS_FILE.exists():
                await asyncio.sleep(15)
                continue

            with REMINDERS_FILE.open("r+", encoding="utf-8") as f:
                reminders = json.load(f)
                now_ts = datetime.datetime.now(datetime.timezone.utc).timestamp()
                
                due_reminders = [r for r in reminders if r['trigger_time'] <= now_ts]
                future_reminders = [r for r in reminders if r['trigger_time'] > now_ts]

                if due_reminders:
                    for reminder in due_reminders:
                        try:
                            channel = bot.get_channel(reminder['channel_id'])
                            user = await bot.fetch_user(reminder['user_id'])
                            if channel and user:
                                await channel.send(f"{user.mention}, here is your reminder: **{reminder['reminder_text']}**")
                        except Exception as e:
                            logger.error(f"Failed to send reminder {reminder['id']}: {e}")
                    
                    # Rewrite the file with only the future reminders
                    f.seek(0)
                    f.truncate()
                    json.dump(future_reminders, f, indent=2)
        except Exception as e:
            logger.error(f"Error in reminder loop: {e}")
        
        await asyncio.sleep(15) # Check every 15 seconds


@bot.event
async def on_ready():
    print(f"Logged in as {bot.user} (ID: {bot.user.id})")
    bot.loop.create_task(check_reminders_loop())

    # Register application (slash) commands with Discord
    try:
        await bot.tree.sync()
        print("Synced application commands")
    except Exception as e:
        print("Failed to sync application commands:", e)









async def handle_reminder(message: discord.Message) -> bool:
    """Handle natural language reminder requests. Returns True if handled."""
    if "remind " not in message.content.lower() and "set a reminder" not in message.content.lower():
        return False

    target_user = message.mentions[0] if message.mentions else message.author
    seconds, reminder_text, time_str = parse_natural_language_reminder(message.content)
    
    if seconds is None or not reminder_text:
        return False

    if seconds > (30 * 24 * 3600):  # Limit reminders to 30 days
        await message.reply("Sorry, I can only set reminders up to 30 days in the future.")
        return True
    
    trigger_time = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=seconds)).timestamp()
    
    new_reminder = {
        "id": str(uuid.uuid4()),
        "user_id": target_user.id,
        "channel_id": message.channel.id,
        "reminder_text": reminder_text,
        "trigger_time": trigger_time
    }

    reminders = []
    if REMINDERS_FILE.exists():
        with REMINDERS_FILE.open("r", encoding="utf-8") as f:
            try:
                reminders = json.load(f)
            except json.JSONDecodeError:
                pass  # File is empty or corrupt, start fresh
    
    reminders.append(new_reminder)
    
    with REMINDERS_FILE.open("w", encoding="utf-8") as f:
        json.dump(reminders, f, indent=2)

    await message.reply(f"Okay, I will remind {target_user.mention} to '{reminder_text}' in {time_str}.")
    return True


@bot.event
async def on_message(message: discord.Message):
    # Ignore messages from the bot itself
    if message.author == bot.user:
        return

    # Handle reminders
    if await handle_reminder(message):
        return

    # Simple command pass-through for legacy '!' commands if any exist
    await bot.process_commands(message)

    # Only respond if "scottbott" is mentioned, if it's a reply to a message that mentions it, or if it's a reply to the bot
    if ("scottbott" not in message.content.lower() and
        not (message.reference and message.reference.resolved and "scottbott" in message.reference.resolved.content.lower()) and
        not (message.reference and message.reference.resolved and message.reference.resolved.author == bot.user)):
        return

async def process_llm_message(message: discord.Message) -> None:
    """Process a message for LLM response."""
    channel_id = str(message.channel.id)

    # Retrieve or create memory for this channel
    memory = channel_memories.get(channel_id)
    if memory is None:
        memory = ConversationBufferMemory()
        channel_memories[channel_id] = memory

    # Clean the user input for the LLM
    raw_content = message.content
    cleaned = raw_content
    if message.guild is not None and bot.user is not None:
        # strip mention forms
        cleaned = cleaned.replace(f"<@{bot.user.id}>", "").replace(f"<@!{bot.user.id}>", "")

    # Case-insensitive remove of the trigger word
    cleaned = re.sub(r'scottbott', '', cleaned, flags=re.IGNORECASE)

    # If this is a reply to another message, include the replied-to message for context
    if message.reference and message.reference.resolved:
        replied_to = message.reference.resolved
        if replied_to.content:
            # Include the message being replied to in the context
            cleaned = f"[Replying to: {replied_to.content}]\n{cleaned}"

    # Trim whitespace
    user_input = cleaned.strip()

    # If the user only said the trigger, reply with a short ack
    if not user_input:
        await message.channel.send("What's up?")
        return

    try:
        # Show typing indicator while we call the LLM and enforce a timeout
        LLM_TIMEOUT = int(os.getenv("LLM_TIMEOUT", "20"))
        try:
            async with message.channel.typing():
                response_text = await asyncio.wait_for(get_response(user_input, memory), timeout=LLM_TIMEOUT)
        except asyncio.TimeoutError:
            await message.channel.send("LLM request timed out. Try again or increase LLM_TIMEOUT.")
            return

        # Check if response is too long for Discord (4000 char limit) and rewrite if needed
        if len(response_text) > 4000:
            try:
                async with message.channel.typing():
                    rewrite_prompt = f"Please rewrite the following response to be under 4000 characters while keeping the key points and sarcastic tone: {response_text[:1500]}..."  # Truncate for the rewrite prompt
                    response_text = await asyncio.wait_for(get_response(rewrite_prompt, memory), timeout=LLM_TIMEOUT)
            except asyncio.TimeoutError:
                response_text = response_text[:3997] + "..."  # Fallback: just truncate

        # Send response
        await message.channel.send(response_text)

        # Update memory with the interaction
        memory.save_context({"input": user_input}, {"output": response_text})

    except Exception as e:
        await message.channel.send("Sorry, I encountered an error while processing your message.")
        print("Error in process_llm_message:", e)


@bot.event
async def on_message(message: discord.Message):
    # Ignore messages from the bot itself
    if message.author == bot.user:
        return

    # Handle reminders
    if await handle_reminder(message):
        return

    # Simple command pass-through for legacy '!' commands if any exist
    await bot.process_commands(message)

    # Only respond if "scottbott" is mentioned, if it's a reply to a message that mentions it, or if it's a reply to the bot
    if ("scottbott" not in message.content.lower() and
        not (message.reference and message.reference.resolved and "scottbott" in message.reference.resolved.content.lower()) and
        not (message.reference and message.reference.resolved and message.reference.resolved.author == bot.user)):
        return

    await process_llm_message(message)


@bot.tree.command(name="imagine", description="Generate an image from text using Hugging Face")
@app_commands.describe(prompt="Text prompt to generate an image from")
async def imagine_slash(interaction: discord.Interaction, prompt: str):
    await interaction.response.defer()
    try:
        img_result = await generate_image(prompt)
        if isinstance(img_result, bytes):
            await interaction.followup.send(file=discord.File(fp=io.BytesIO(img_result), filename="image.png"))
        elif isinstance(img_result, str):
            await interaction.followup.send(img_result)
        else:
            await interaction.followup.send("Image generation returned an unexpected result.")
    except Exception as e:
        await interaction.followup.send("Failed to generate image.")
        print("Error in imagine_slash:", e)


@bot.tree.command(name="purge", description="Delete a specified number of messages from the channel")
@app_commands.describe(amount="Number of messages to delete (max 1000)")
async def purge_slash(interaction: discord.Interaction, amount: int):
    # Check permissions
    if not interaction.user.guild_permissions.manage_messages:
        await interaction.response.send_message("You don't have permission to manage messages.", ephemeral=True)
        return

    if amount < 1 or amount > 1000:
        await interaction.response.send_message("Amount must be between 1 and 1000.", ephemeral=True)
        return

    await interaction.response.defer(ephemeral=True)

    try:
        # Discord bulk delete limit is 100 messages per request
        deleted_count = 0
        remaining = amount

        while remaining > 0:
            # Delete in batches of 100 (Discord's limit)
            batch_size = min(remaining, 100)

            # Fetch messages to delete
            messages_to_delete = []
            async for message in interaction.channel.history(limit=batch_size):
                messages_to_delete.append(message)

            if not messages_to_delete:
                break

            # Bulk delete the messages
            await interaction.channel.delete_messages(messages_to_delete)
            deleted_count += len(messages_to_delete)
            remaining -= len(messages_to_delete)

        await interaction.followup.send(f"Successfully deleted {deleted_count} messages.", ephemeral=True)

    except Exception as e:
        await interaction.followup.send(f"Failed to delete messages: {str(e)}", ephemeral=True)
        print("Error in purge_slash:", e)


if __name__ == "__main__":
    if not DISCORD_TOKEN:
        print("DISCORD_TOKEN is not set. Please create a .env file with DISCORD_TOKEN=")
    else:
        bot.run(DISCORD_TOKEN)

