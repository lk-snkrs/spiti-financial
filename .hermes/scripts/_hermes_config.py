#!/usr/bin/env python3
"""
Shared Hermes config — single source of truth for all scripts.
Import in every script: from _hermes_config import PAT, SB_URL, get_secret
"""
import subprocess, os

def get_secret(name, fallback=""):
    """Get secret from Doppler → env var → fallback."""
    val = os.environ.get(name)
    if val:
        return val
    try:
        result = subprocess.run(
            ["doppler", "secrets", "get", name, "-p", "lc-keys", "-c", "prd", "--plain"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except:
        pass
    return fallback

# Supabase
PAT = get_secret("SUPABASE_LK_SERVICE_KEY", "sbp_5cd916280ef631f32155ee303c19f0f15d69223d")
PROJECT = "cnjimxglpktznenpbail"
SB_URL = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"

# Shopify
SHOPIFY_TOKEN = get_secret("SHOPIFY_ACCESS_TOKEN", "")

# Telegram
TG_TOKEN = get_secret("TELEGRAM_BOT_TOKEN", "8704483790:AAGUfWgApYRWGgKvdnCoboUhjshJec1-974")
TG_CHAT_ID = "171397651"

# Mem0
MEM0_API_KEY = get_secret("MEM0_API_KEY", "m0-40cao7JUJzWboKj7zOebyA2spHR8xl26RhiVXMDn")
