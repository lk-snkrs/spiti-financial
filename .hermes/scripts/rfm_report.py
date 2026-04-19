#!/usr/bin/env python3
"""
RFM Report — Weekly customer segmentation report.
Sends Telegram report with segment distribution and churn risk alerts.
Run: python3 rfm_report.py
Schedule: Weekly (Monday 09:00)
"""
import requests, time
from datetime import datetime

PAT = "sbp_5cd916280ef631f32155ee303c19f0f15d69223d"
PROJECT = "cnjimxglpktznenpbail"
URL = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"
TG_TOKEN = "8704483790:AAGUfWgApYRWGgKvdnCoboUhjshJec1-974"
TG_CHAT = "171397651"

def sql(q, retry=3):
    for i in range(retry):
        try:
            r = requests.post(URL, headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"},
                            json={"query": q}, timeout=30)
            if r.status_code == 200:
                d = r.json()
                if isinstance(d, dict) and "error" in d and d.get("code") == "rate_limit_exceeded":
                    time.sleep(2 ** i)
                    continue
                return d
            return r.json()
        except Exception as e:
            time.sleep(2 ** i)
    return []

def get_segment_dist():
    q = """
    SELECT segment, COUNT(*) as count 
    FROM lk_intel.customer_rfm 
    GROUP BY segment 
    ORDER BY count DESC
    """
    return sql(q)

def get_churn_risk():
    """Champions who haven't purchased in 30+ days."""
    q = """
    SELECT email, recency_days, monetary
    FROM lk_intel.customer_rfm
    WHERE segment = 'Champions' AND recency_days > 30
    ORDER BY monetary DESC
    LIMIT 10
    """
    return sql(q)

def get_top_customers():
    q = """
    SELECT email, rfm_score, segment, monetary
    FROM lk_intel.customer_rfm
    ORDER BY rfm_score DESC
    LIMIT 10
    """
    return sql(q)

def send_telegram(msg):
    r = requests.post(f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
        json={"chat_id": TG_CHAT, "text": msg, "parse_mode": "HTML"},
        timeout=10)
    return r.json().get("ok", False)

def main():
    dist = get_segment_dist() or []
    churn = get_churn_risk() or []
    top = get_top_customers() or []
    
    now = datetime.now().strftime("%d/%m %H:%M")
    
    lines = [f"📊 <b>RFM Report</b> — {now}", ""]
    
    lines.append("<b>Segmentação:</b>")
    for row in dist:
        pct = row["count"] / sum(r["count"] for r in dist) * 100 if dist else 0
        lines.append(f"  {row['segment']}: {row['count']} ({pct:.0f}%)")
    
    lines.append("")
    lines.append("<b>⚠️ Churn Risk</b> (Champions sem compra 30+ dias):")
    if churn:
        for row in churn[:5]:
            lines.append(f"  {row['email'][:30]} — {row['recency_days']}d sem comprar (R${row['monetary']:,.0f})")
    else:
        lines.append("  Nenhum — todos os Champions ativos ✅")
    
    lines.append("")
    lines.append("<b>🏆 Top 10 Customers:</b>")
    for row in top:
        lines.append(f"  {row['rfm_score']}pts | {row['segment']:10s} | R${row['monetary']:,.0f} | {row['email'][:25]}")
    
    msg = "\n".join(lines)
    print(msg)
    ok = send_telegram(msg)
    print(f"\nTelegram: {'✅' if ok else '❌'}")

if __name__ == "__main__":
    main()
