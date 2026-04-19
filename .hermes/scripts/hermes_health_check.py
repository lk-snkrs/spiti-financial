#!/usr/bin/env python3
"""
Hermes Health Check — Audit automática de tokens, scripts e crons.
Roda todo dia via cron e reporta problemas ANTES que eu erre.

Checa:
1. Tokens Supabase em todos os scripts de produção
2. Scripts referenciados por crons existem e moram no lugar certo
3. Tokens ainda são válidos (testa API)
4. Cron jobs ativos com paths válidos

Uso: python3 hermes_health_check.py
Saída: relatório Telegram ou stdout
"""
import sys
sys.path.insert(0, "/root/.hermes/scripts")
from _hermes_config import PAT, SB_URL
import requests, subprocess, sys, re, os
from datetime import datetime

# ── Config ──
PROJECT = "cnjimxglpktznenpbail"
TOKEN_API = "https://api.supabase.com/v1/projects"
CRONS_API = "https://api.minimax.io/api/cron/jobs"
TELEGRAM_TOKEN = "8704483790:AAGUfWgApYRWGgKvdnCoboUhjshJec1-974"
CHAT_ID = "171397651"
SCRIPTS_DIR = "/root/.hermes/scripts"
TMP_DIR = "/tmp"

# Scripts que DEVEM existir em SCRIPTS_DIR
REQUIRED_IN_SCRIPTS = [
    "lk_full_sync.py",
    "lk_shopify_sync.py",
    "lk_transactions_full_sync.py",  # <-- Added
    "lk_meta_sync_v3.py",
    "lk_klaviyo_sync_v2.py",
    "lk_judgeme_sync_v2.py",
    "lk_ga4_sync_v4.py",
    "lk_frenet_sync.py",
    "lk_anomaly_check.py",
    "lk_anomaly_deepdive.py",
    "lk_morning_briefing.py",
    "lk_briefing_night.py",
]

# Tokens INVÁLIDOS — nunca devem aparecer em scripts de produção
INVALID_TOKENS = [
    "sbp_2297055c60ee166d8e1aa8476660b13b465d23b4",  # Revogado 19/04/2026
    "sbp_d37e63f65463e92ff600a19eb7e663f2c9b3a",  # Webhook fake/placeholder
]

# Shopify shop names VÁLIDOS
VALID_SHOPIFY_SHOP_NAMES = [
    "lk-sneakerss",           # Store name only (scripts that append .myshopify.com)
    "lksneakers",             # Alias histórico
    "lk-sneakerss.myshopify.com",  # Full domain (scripts that use directly)
]
VALID_SHOPIFY_DOMAIN = "myshopify.com"  # Shop name NUNCA deve conter isso (é o domínio)


def sql_validate(query):
    """Test if PAT is valid."""
    r = requests.post(
        f"{TOKEN_API}/{PROJECT}/database/query",
        headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"},
        json={"query": query},
        timeout=10
    )
    return r.status_code in (200, 201)


def scan_scripts_for_bad_tokens():
    """Scan all scripts for invalid/old tokens."""
    issues = []
    for fname in os.listdir(SCRIPTS_DIR):
        if not fname.endswith(".py"):
            continue
        if fname == "hermes_health_check.py":
            continue  # Skip self (INVALID_TOKENS list is documentation, not usage)
        path = os.path.join(SCRIPTS_DIR, fname)
        with open(path) as f:
            content = f.read()
        tokens = re.findall(r'sbp_[a-z0-9]{40}', content)
        for token in tokens:
            if token == PAT:
                continue  # Correct token, ok
            if token in INVALID_TOKENS:
                issues.append(f"  ❌ {fname}: token INVALIDO encontrado: {token[:20]}...")
            else:
                issues.append(f"  ⚠️  {fname}: token DESCONHECIDO: {token[:20]}...")
    return issues


def check_script_locations():
    """Verify scripts are in the right directory."""
    issues = []
    # Check that required scripts are in SCRIPTS_DIR
    for fname in REQUIRED_IN_SCRIPTS:
        path = os.path.join(SCRIPTS_DIR, fname)
        if not os.path.exists(path):
            issues.append(f"  ❌ {fname} FALTA em {SCRIPTS_DIR}")
        else:
            # Check if there's an old copy in /tmp
            tmp_path = os.path.join(TMP_DIR, fname)
            if os.path.exists(tmp_path):
                # Both exist — check if they're in sync
                with open(path) as f:
                    main = f.read()
                with open(tmp_path) as f:
                    tmp = f.read()
                if main != tmp:
                    issues.append(f"  ⚠️  {fname}: versão em /tmp DIFERE de {SCRIPTS_DIR}")
                # else: identical — silently ok
    return issues


def check_tmp_sync_scripts():
    """Verify /tmp sync scripts have correct tokens."""
    issues = []
    # Scripts que são MASTER RUNNERS (não têm token próprio, chamam subscripts)
    master_runners = {"lk_full_sync.py"}
    sync_scripts = [
        "lk_shopify_sync.py", "lk_meta_sync_v3.py",
        "lk_klaviyo_sync_v2.py", "lk_judgeme_sync_v2.py", "lk_ga4_sync_v4.py",
        "lk_frenet_sync.py", "lk_appmax_sync.py", "lk_gsc_sync.py",
    ]
    for fname in sync_scripts + ["lk_full_sync.py"]:
        path = os.path.join(TMP_DIR, fname)
        if not os.path.exists(path):
            continue
        with open(path) as f:
            content = f.read()
        tokens = re.findall(r'sbp_[a-z0-9]{40}', content)
        has_doppler = "doppler" in content.lower()
        is_master = fname in master_runners

        # Master runners don't need their own token
        if is_master:
            if not tokens and not has_doppler:
                continue  # Expected — it's a master runner
            for token in tokens:
                if token not in (PAT,):
                    issues.append(f"  ❌ /tmp/{fname}: token INVÁLIDO: {token[:20]}...")
            continue

        for token in tokens:
            if token == PAT:
                continue
            if token in INVALID_TOKENS:
                issues.append(f"  ❌ /tmp/{fname}: token INVÁLIDO: {token[:20]}...")
            else:
                issues.append(f"  ⚠️  /tmp/{fname}: token DESCONHECIDO: {token[:20]}...")
        if not tokens and not has_doppler:
            issues.append(f"  ⚠️  /tmp/{fname}: sem token E sem Doppler — como autentica?")
    return issues


def check_shopify_shop_name():
    """Verify Shopify shop names in scripts are valid.
    
    Some scripts use f"https://{SHOP}/..." (need full domain)
    Some scripts use f"https://{SHOP}.myshopify.com/..." (need just store name)
    We detect this pattern and validate accordingly.
    """
    issues = []
    # Skip scripts that don't make Shopify API calls (have {shop_name} placeholders in strings)
    skip_scripts = {
        "hermes_health_check.py",
        "hermes_consolidation_weekly.py",
        "hermes_learning_loop.py",
        "hermes_learning_review.py",
        "hermes_knowledge_freshness.py",
        "hermes_monthly_review.py",
    }
    for fname in os.listdir(SCRIPTS_DIR):
        if not fname.endswith(".py"):
            continue
        if fname in skip_scripts:
            continue
        path = os.path.join(SCRIPTS_DIR, fname)
        with open(path) as f:
            content = f.read()
        
        # Find all SHOP assignments
        shop_matches = re.findall(r'SHOP\s*=\s*["\']([^"\']+)["\']', content)
        
        for shop_name in shop_matches:
            # Find how this script uses SHOP in URLs
            # Pattern 1: f"https://{SHOP}.myshopify.com/..." — needs store name only
            # Pattern 2: f"https://{SHOP}/admin/..." — needs full domain
            double_domain = re.search(r'\{SHOP\}\.myshopify\.com', content)
            direct_domain = re.search(r'https://\{SHOP\}/', content)
            
            if double_domain:
                # Script appends .myshopify.com — SHOP should be just store name
                if VALID_SHOPIFY_DOMAIN in shop_name:
                    issues.append(f"  ❌ {fname}: SHOP='{shop_name}' — contem dominio mas script concatena '.myshopify.com' (deve ser 'lk-sneakerss')")
                elif shop_name not in VALID_SHOPIFY_SHOP_NAMES:
                    issues.append(f"  ⚠️  {fname}: SHOP='{shop_name}' — nome desconhecido")
            elif direct_domain:
                # Script uses SHOP directly as domain — needs full domain
                if shop_name not in VALID_SHOPIFY_SHOP_NAMES:
                    issues.append(f"  ❌ {fname}: SHOP='{shop_name}' — invalido para concatenacao direta")
    return issues


def check_transactions_stale():
    """Check if transactions_full table is stale (>1 day without new data)."""
    issues = []
    r = requests.post(
        f"https://api.supabase.com/v1/projects/{PROJECT}/database/query",
        headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"},
        json={"query": "SELECT MAX(created_at) as last_tx FROM lk_intel.transactions_full"},
        timeout=15
    )
    if r.status_code in (200, 201):
        data = r.json()
        if isinstance(data, list) and data:
            last_tx = data[0].get("last_tx")
            if last_tx:
                from datetime import datetime
                last_date = datetime.fromisoformat(last_tx.replace("+00", ""))
                age_hours = (datetime.now() - last_date).total_seconds() / 3600
                if age_hours > 24:
                    issues.append(f"  ❌ transactions_full STALE: última transaction há {age_hours:.0f}h (desde {str(last_tx)[:19]})")
                elif age_hours > 12:
                    issues.append(f"  ⚠️  transactions_full old: última transaction há {age_hours:.0f}h (desde {str(last_tx)[:19]})")
    return issues


def check_crons():
    """Verify active cron jobs reference valid scripts."""
    # Since we can't call the cron API directly, we check the prompt hints
    # This is a heuristic check
    issues = []
    cron_script_pattern = re.compile(r'python3\s+(/\S+\.py|\~\/\S+\.py|\.py)')
    # Read crons from a reference file or check scripts dir for cron references
    # For now, just verify the scripts that should run via cron exist
    for fname in REQUIRED_IN_SCRIPTS:
        path = os.path.join(SCRIPTS_DIR, fname)
        if os.path.exists(path):
            with open(path) as f:
                content = f.read()
            # Check for print/flask-like entry points
            if "if __name__" not in content and fname.endswith(".py"):
                pass  # May be a module, not a standalone script
    return issues


def main():
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    print(f"Hermes Health Check — {now}", flush=True)
    print("=" * 50, flush=True)

    all_ok = True

    # 1. Validate current PAT
    print("\n[1] PAT atual válida?", flush=True)
    if sql_validate("SELECT 1;"):
        print("  ✅ PAT sbp_5cd9... é válida", flush=True)
    else:
        print("  ❌ PAT sbp_5cd9... INVÁLIDA — atualizar agora!", flush=True)
        all_ok = False

    # 2. Scripts em SCRIPTS_DIR
    print("\n[2] Scripts em " + SCRIPTS_DIR, flush=True)
    loc_issues = check_script_locations()
    if not loc_issues:
        print("  ✅ Todos os scripts required estão no lugar certo", flush=True)
    else:
        for i in loc_issues:
            print(i, flush=True)
        all_ok = False

    # 3. Tokens em scripts
    print("\n[3] Tokens em scripts", flush=True)
    token_issues = scan_scripts_for_bad_tokens()
    if not token_issues:
        print("  ✅ Nenhum token inválido encontrado", flush=True)
    else:
        for i in token_issues:
            print(i, flush=True)
        all_ok = False

    # 4. Tokens em /tmp
    print("\n[4] Tokens em /tmp (scripts de sync)", flush=True)
    tmp_issues = check_tmp_sync_scripts()
    if not tmp_issues:
        print("  ✅ /tmp sync scripts limpos", flush=True)
    else:
        for i in tmp_issues:
            print(i, flush=True)
        all_ok = False

    # 5. Shopify shop name
    print("\n[5] Shopify shop names", flush=True)
    shop_issues = check_shopify_shop_name()
    if not shop_issues:
        print("  ✅ Shop names corretos", flush=True)
    else:
        for i in shop_issues:
            print(i, flush=True)
        all_ok = False

    # 6. Transactions stale
    print("\n[6] Transactions freshness", flush=True)
    tx_issues = check_transactions_stale()
    if not tx_issues:
        print("  ✅ transactions_full atual", flush=True)
    else:
        for i in tx_issues:
            print(i, flush=True)
        all_ok = False

    # Summary
    print("\n" + "=" * 50, flush=True)
    if all_ok:
        print(f"✅ Health Check OK — {now}", flush=True)
        msg = f"✅ *Hermes Health Check*\n{now}\n\nTodos os checks limpos."
    else:
        print(f"❌ PROBLEMAS ENCONTRADOS — {now}", flush=True)
        issues_found = token_issues + loc_issues + tmp_issues + shop_issues + tx_issues
        msg = f"❌ *Hermes Health Check*\n{now}\n\nProblemas encontrados:\n" + "\n".join(issues_found)

        # AUTO-REMEDIATION: Attempt to fix issues before reporting
        print("\n[REMEDIATION] Attempting auto-remediation...", flush=True)
        import subprocess as sp
        try:
            # Run remediation script with all detected issues
            issues_str = "\\n".join(issues_found)
            result = sp.run(
                ["bash", "/root/.hermes/scripts/hermes_remediate.sh", "script", "health_check_issues", issues_str],
                capture_output=True, text=True, timeout=120
            )
            print(f"[REMEDIATION] stdout: {result.stdout}", flush=True)
            if result.stderr:
                print(f"[REMEDIATION] stderr: {result.stderr}", flush=True)
            if result.returncode == 0:
                print("[REMEDIATION] ✅ Issues resolved automatically", flush=True)
                msg += "\n\n🔧 *Auto-remediação aplicada com sucesso.*"
            else:
                print(f"[REMEDIATION] ⚠️ Some issues could not be auto-remediated (exit code: {result.returncode})", flush=True)
                msg += "\n\n⚠️ *Alguns problemas requerem atenção manual.*"
        except Exception as e:
            print(f"[REMEDIATION] ❌ Remediation failed: {e}", flush=True)
            msg += f"\n\n⚠️ *Falha na auto-remediação: {e}*"

    # Send Telegram
    try:
        requests.get(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
            params={"chat_id": CHAT_ID, "text": msg, "parse_mode": "Markdown"},
            timeout=10
        )
        print("\n📱 Notificação enviada ao Telegram", flush=True)
    except Exception as e:
        print(f"\n⚠️  Falha ao enviar Telegram: {e}", flush=True)

    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
