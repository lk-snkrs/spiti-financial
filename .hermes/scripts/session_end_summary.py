#!/usr/bin/env python3
"""
Session-End Mem0 Summary — pushes session summary to Mem0 at session end.
Integrates with hermes session end protocol.
Usage: python3 session_end_summary.py "<session_summary>"
"""
import requests, os, sys, time
from datetime import datetime

MEM0_API_KEY = os.environ.get("MEM0_API_KEY", "m0-40cao7JUJzWboKj7zOebyA2spHR8xl26RhiVXMDn")

def mem0_conclude(content, user_id="hermes-user"):
    url = "https://api.mem0.ai/v1/memories/"
    payload = {
        "messages": [
            {"role": "user", "content": f"Session summary: {content}"}
        ],
        "user_id": user_id,
        "agent_id": "hermes"
    }
    for i in range(3):
        try:
            r = requests.post(url, json=payload, headers={
                "Authorization": f"Token {MEM0_API_KEY}",
                "Content-Type": "application/json"
            }, timeout=15)
            if r.status_code in (200, 201):
                return r.json()
            time.sleep(2 ** i)
        except Exception as e:
            print(f"Attempt {i+1} failed: {e}")
            time.sleep(2 ** i)
    return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: session_end_summary.py '<summary_text>'")
        sys.exit(1)
    
    summary = sys.argv[1]
    result = mem0_conclude(summary)
    if result:
        print(f"✅ Session summary pushed to Mem0")
    else:
        print("⚠️ Could not push to Mem0 (check API key or network)")
