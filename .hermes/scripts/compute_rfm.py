#!/usr/bin/env python3
"""
RFM Computation — Recency, Frequency, Monetary customer segmentation.
Computes RFM scores from lk_intel.orders and populates customer_rfm table.
Run: python3 compute_rfm.py
Schedule: Weekly (Sunday 23:00)
"""
import requests, sys
from datetime import datetime, timedelta

PAT = "sbp_5cd916280ef631f32155ee303c19f0f15d69223d"
PROJECT = "cnjimxglpktznenpbail"
URL = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"

def sql(q, retry=3):
    for i in range(retry):
        try:
            r = requests.post(URL, headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"},
                            json={"query": q}, timeout=30)
            if r.status_code == 200:
                d = r.json()
                if isinstance(d, dict) and "error" in d and d.get("code") == "rate_limit_exceeded":
                    sleep_time = int(r.headers.get("retry-after", 2 ** i))
                    print(f"Rate limited, waiting {sleep_time}s...")
                    time.sleep(sleep_time)
                    continue
                return d
            elif r.status_code == 401:
                print(f"❌ PAT unauthorized — check Doppler config")
                return []
            elif r.status_code >= 500:
                print(f"Server error {r.status_code}, retrying...")
                time.sleep(2 ** i)
                continue
            return r.json()
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(2)
    return []

def compute_rfm():
    """Compute RFM scores for all customers with paid orders."""
    print("Computing RFM scores...")
    
    # Get customer order aggregates from last 90 days
    q = """
    SELECT 
        email,
        COUNT(*) as frequency,
        SUM(total_price) as monetary,
        MAX(created_at) as last_order,
        MIN(created_at) as first_order
    FROM lk_intel.orders
    WHERE financial_status = 'paid'
      AND email IS NOT NULL
      AND created_at >= NOW() - INTERVAL '90 days'
    GROUP BY email
    HAVING COUNT(*) >= 1
    """
    customers = sql(q)
    if not customers:
        print("No customers found")
        return 0
    
    # Compute RFM scores
    now = datetime.now()
    inserted = 0
    
    for c in customers:
        email = c['email']
        freq = c['frequency']
        monetary = float(c['monetary'] or 0)
        
        # Recency: days since last purchase
        last = c['last_order']
        if last:
            if isinstance(last, str):
                last_dt = datetime.fromisoformat(last.replace("+00", ""))
            else:
                last_dt = last
            recency_days = (now - last_dt).days
        else:
            recency_days = 999
        
        # RFM scores (1-5 each)
        # R: 5 = purchased within 30 days, 1 = >90 days
        r_score = 5 if recency_days <= 30 else 4 if recency_days <= 60 else 3 if recency_days <= 90 else 2 if recency_days <= 180 else 1
        
        # F: 5 = >10 orders, 1 = 1 order
        if freq >= 10: f_score = 5
        elif freq >= 7: f_score = 4
        elif freq >= 5: f_score = 3
        elif freq >= 3: f_score = 2
        else: f_score = 1
        
        # M: 5 = top 20% spenders, 1 = bottom 20%
        # (simplified: just use absolute value)
        m_score = 5 if monetary >= 5000 else 4 if monetary >= 2000 else 3 if monetary >= 1000 else 2 if monetary >= 500 else 1
        
        # Segment
        rfm_score = r_score * 100 + f_score * 10 + m_score
        if rfm_score >= 444: segment = "Champions"
        elif rfm_score >= 433: segment = "Loyal"
        elif rfm_score >= 323: segment = "Potential"
        elif rfm_score >= 212: segment = "At Risk"
        elif rfm_score >= 111: segment = "Churned"
        else: segment = "New"
        
        # Insert/Update customer_rfm
        insert_q = f"""
        INSERT INTO lk_intel.customer_rfm 
        (email, recency_days, frequency, monetary, r_score, f_score, m_score, rfm_score, segment, computed_at)
        VALUES ('{email}', {recency_days}, {freq}, {monetary}, {r_score}, {f_score}, {m_score}, {rfm_score}, '{segment}', NOW())
        ON CONFLICT (email) DO UPDATE SET
            recency_days = {recency_days},
            frequency = {freq},
            monetary = {monetary},
            r_score = {r_score},
            f_score = {f_score},
            m_score = {m_score},
            rfm_score = {rfm_score},
            segment = '{segment}',
            computed_at = NOW()
        """
        sql(insert_q)
        inserted += 1
    
    return inserted

if __name__ == "__main__":
    import time
    count = compute_rfm()
    print(f"✅ RFM computed: {count} customers processed")
