#!/usr/bin/env python3
"""
Consequence Tracker — logs second-order effects of playbook actions.
Run after each action: consequence_tracker.py <action_id> <expected> <observed> [severity]
Schedule: After each playbook action
"""
import sys
sys.path.insert(0, "/root/.hermes/scripts")
from _hermes_config import PAT, SB_URL
import requests, sys, time

PROJECT = "cnjimxglpktznenpbail"
URL = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"

def sql(q):
    for i in range(3):
        try:
            r = requests.post(URL, headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"},
                           json={"query": q}, timeout=15)
            if r.status_code == 200: return r.json()
            time.sleep(2 ** i)
        except: time.sleep(2)
    return None

def log_consequence(action_id, expected, observed, severity="medium"):
    q = f"""
    INSERT INTO lk_intel.consequence_log 
    (action_id, expected_outcome, observed_outcome, severity, created_at)
    VALUES ('{action_id}', '{expected}', '{observed}', '{severity}', NOW())
    RETURNING id
    """
    result = sql(q)
    return result

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: consequence_tracker.py <action_id> <expected> <observed> [severity]")
        print("Example: consequence_tracker.py lk_morning_briefing 'briefing sent' '9 users received' low")
        sys.exit(1)
    
    action_id, expected, observed = sys.argv[1], sys.argv[2], sys.argv[3]
    severity = sys.argv[4] if len(sys.argv) > 4 else "medium"
    
    result = log_consequence(action_id, expected, observed, severity)
    if result:
        print(f"✅ Logged: {result}")
    else:
        print("❌ Failed to log consequence")
