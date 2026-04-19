#!/usr/bin/env python3
"""
Outcomes Tracker — tracks hermes_suggestions review workflow.
Lists pending suggestions, updates status, generates weekly report.
Run: python3 outcomes_tracker.py
Schedule: Weekly (Monday 10:00)
"""
import sys
sys.path.insert(0, "/root/.hermes/scripts")
from _hermes_config import PAT, SB_URL
import requests
from datetime import datetime

PROJECT = "cnjimxglpktznenpbail"
URL = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"
TG_TOKEN = "8704483790:AAGUfWgApYRWGgKvdnCoboUhjshJec1-974"
TG_CHAT = "171397651"

def sql(q):
    for i in range(3):
        try:
            r = requests.post(URL, headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"},
                           json={"query": q}, timeout=15)
            if r.status_code == 200: return r.json()
        except: pass
        import time; time.sleep(2 ** i)
    return None

def get_pending():
    q = """
    SELECT id, suggestion, created_at, domain
    FROM lk_intel.hermes_suggestions
    WHERE status = 'suggested'
    ORDER BY created_at DESC
    LIMIT 20
    """
    return sql(q) or []

def get_dist():
    q = "SELECT status, COUNT(*) as cnt FROM lk_intel.hermes_suggestions GROUP BY status"
    return sql(q) or []

def update_status(suggestion_id, status, notes=""):
    q = f"""
    UPDATE lk_intel.hermes_suggestions 
    SET status = '{status}', notes = '{notes}', updated_at = NOW()
    WHERE id = {suggestion_id}
    """
    return sql(q)

def send_telegram(msg):
    r = requests.post(f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
        json={"chat_id": TG_CHAT, "text": msg, "parse_mode": "HTML"},
        timeout=10)
    return r.json().get("ok", False)

def main():
    pending = get_pending()
    dist = get_dist()
    now = datetime.now().strftime("%d/%m %H:%M")
    
    lines = [f"💡 <b>Hermes Suggestions</b> — {now}", ""]
    
    total = sum(r["cnt"] for r in dist)
    lines.append("<b>Status:</b>")
    for r in dist:
        pct = r["cnt"] / total * 100 if total else 0
        lines.append(f"  {r['status']}: {r['cnt']} ({pct:.0f}%)")
    
    lines.append("")
    lines.append(f"<b>Pendentes de review ({len(pending)}):</b>")
    if pending:
        for s in pending[:10]:
            suggestion_text = str(s.get("suggestion", ""))[:60]
            domain = s.get("domain", "unknown")
            lines.append(f"  [{s['id']}] {domain}: {suggestion_text}...")
    else:
        lines.append("  Nenhuma — tudo limpo ✅")
    
    lines.append("")
    lines.append("<i>Use outcomes_tracker.py update <id> <accepted|rejected|implemented> [notes] para atualizar</i>")
    
    msg = "\n".join(lines)
    print(msg)
    ok = send_telegram(msg)
    print(f"\nTelegram: {'✅' if ok else '❌'}")

if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 3 and sys.argv[1] == "update":
        suggestion_id = int(sys.argv[2])
        new_status = sys.argv[3]
        notes = sys.argv[4] if len(sys.argv) > 4 else ""
        result = update_status(suggestion_id, new_status, notes)
        print(f"Updated: {result}")
    else:
        main()
