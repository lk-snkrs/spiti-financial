#!/usr/bin/env python3
"""
Sync Audit Log — inserts audit trail records into lk_intel.sync_log.
Call at the START and END of every sync script.
Usage: python3 sync_log.py start|end <script_name> [details]
"""
import requests, sys, time
from datetime import datetime

PAT = "sbp_5cd916280ef631f32155ee303c19f0f15d69223d"
PROJECT = "cnjimxglpktznenpbail"
URL = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"

def sql(q):
    for i in range(3):
        try:
            r = requests.post(URL, headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"},
                           json={"query": q}, timeout=15)
            if r.status_code == 200: return r.json()
        except: pass
        time.sleep(2 ** i)
    return None

def log_sync(script_name, event, details=""):
    q = f"""
    INSERT INTO lk_intel.sync_log (script_name, event, details, created_at)
    VALUES ('{script_name}', '{event}', '{details}', NOW())
    RETURNING id
    """
    return sql(q)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: sync_log.py start|end <script_name> [details]")
        print("Example: sync_log.py start lk_shopify_sync 'syncing orders from Shopify'")
        sys.exit(1)
    
    event = sys.argv[1]  # 'start' or 'end'
    script = sys.argv[2]
    details = sys.argv[3] if len(sys.argv) > 3 else ""
    
    result = log_sync(script, event, details)
    if result:
        print(f"✅ Logged: {event} {script}")
    else:
        print("⚠️ Could not log (check PAT or table exists)")
