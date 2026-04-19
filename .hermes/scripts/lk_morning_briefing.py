#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LK Morning Briefing - COO Edition
7+ topicos, uma mensagem por topico no Telegram
Dados: yesterday | Exclui outlier 09/04
"""

import requests, os
from datetime import date, timedelta, datetime, timezone
import sys

# Ler do env ou usar token direto (fallback)
TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "8704483790:AAGUfWgApYRWGgKvdnCoboUhjshJec1-974")
CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "171397651")

# Supabase Management API
MGMT = "sbp_5cd916280ef631f32155ee303c19f0f15d69223d"
PROJECT = "cnjimxglpktznenpbail"
URL = "https://api.supabase.com/v1/projects/" + PROJECT + "/database/query"
HEADERS = {"Authorization": "Bearer " + MGMT, "Content-Type": "application/json"}

# Outlier date to exclude from all monthly calculations
OUTLIER_DATE = "2026-04-09"


def sql(q):
    r = requests.post(URL, headers=HEADERS, json={"query": q}, timeout=25)
    d = r.json()
    if not isinstance(d, list):
        print(f"SQL Error: expected list, got {type(d).__name__} — {str(d)[:200]}", file=sys.stderr)
        return []
    return d


def first_row(q):
    """Execute query and return first row as dict, or empty dict on error."""
    rows = sql(q)
    return rows[0] if rows else {}


def fmt_money(v):
    if v is None:
        return "R$ 0"
    try:
        val = float(v)
        return f"R$ {val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except (ValueError, TypeError):
        return "R$ 0"


def send(texto):
    """Send a message via Telegram bot."""
    try:
        requests.get(
            "https://api.telegram.org/bot" + TOKEN + "/sendMessage",
            params={"chat_id": CHAT_ID, "text": texto, "parse_mode": "Markdown"},
            timeout=15
        )
    except Exception as e:
        print("Send error:", e, file=sys.stderr)


# ============================================================
# DATE HELPERS (BRT = UTC-3)
# ============================================================
# NOTE: Brazil is UTC-3 (no DST). Use naive datetime for BRT.
# Python's date.today() uses server local time (UTC on this machine).
# We must explicitly use BRT so date math matches order_created_at AT TIME ZONE 'America/Sao_Paulo' in SQL.
BRT_OFFSET = timedelta(hours=-3)

def brt_now():
    return datetime.now(timezone.utc) + BRT_OFFSET

def brt_today():
    return (brt_now().replace(hour=0, minute=0, second=0, microsecond=0)).date()

today = brt_today()
ystr = str(today - timedelta(days=1))   # yesterday BRT
# ystr_utc: the UTC date that corresponds to yesterday BRT
# Since BRT = UTC-3, yesterday BRT 00:00 = UTC+3 = today UTC 03:00
# And yesterday BRT 23:59 = UTC+3 = today UTC 23:59 = tomorrow UTC 02:59
# So we need to query CURRENT_DATE - 1 in UTC terms for BRT dates
# The SQL uses AT TIME ZONE 'America/Sao_Paulo' on order_created_at (UTC) -> gives BRT date
# So 'ystr' as BRT date is correct to feed into SQL with AT TIME ZONE conversion
ystr_utc = str((brt_now() - timedelta(days=1)).date())   # yesterday UTC
twod = str(today - timedelta(days=2))   # 2 days ago BRT
wstr = str(today - timedelta(days=7))   # 7 days ago BRT
mstr = str(today.replace(day=1))        # month start BRT
today_str = str(today)

df = (today - timedelta(days=1)).strftime('%d/%m')
df2 = (today - timedelta(days=2)).strftime('%d/%m')


# ============================================================
# TOPICO 1: FATURAMENTO
# ============================================================

on_ontem = first_row(f"""
SELECT COUNT(*) FILTER (WHERE financial_status = 'paid') as ped,
       SUM(total_price) FILTER (WHERE financial_status = 'paid') as receita,
       AVG(total_price) FILTER (WHERE financial_status = 'paid') as ticket
FROM lk_intel.orders
WHERE order_created_at::date = '{ystr}' AND source_name = 'web'
  AND financial_status = 'paid'""")

fi_ontem = first_row(f"""
SELECT COUNT(*) FILTER (WHERE financial_status = 'paid') as ped,
       SUM(total_price) FILTER (WHERE financial_status = 'paid') as receita,
       AVG(total_price) FILTER (WHERE financial_status = 'paid') as ticket
FROM lk_intel.orders
WHERE order_created_at::date = '{ystr}' AND source_name = 'pos'
  AND financial_status = 'paid'""")

on_ante = first_row(f"""
SELECT SUM(total_price) FILTER (WHERE financial_status = 'paid') as receita
FROM lk_intel.orders
WHERE order_created_at::date = '{twod}' AND source_name NOT IN ('shopify_draft_order', '')
  AND financial_status = 'paid'""")

fi_ante = first_row(f"""
SELECT SUM(total_price) FILTER (WHERE financial_status = 'paid') as receita
FROM lk_intel.orders
WHERE order_created_at::date = '{twod}' AND source_name IN ('web','pos')
  AND financial_status = 'paid'""")

# Total month = paid + partially_refunded (como Shopify), ate hoje, excl outlier
total_mes = first_row(f"""
SELECT
  COUNT(*) FILTER (WHERE financial_status IN ('paid','partially_refunded')) as pedidos,
  SUM(total_price) FILTER (WHERE financial_status IN ('paid','partially_refunded')) as receita
FROM lk_intel.orders
WHERE order_created_at::date >= '{mstr}' AND order_created_at::date <= '{today_str}'
  AND source_name NOT IN ('shopify_draft_order', '')
  AND order_created_at::date != '{OUTLIER_DATE}'
  AND financial_status IN ('paid','partially_refunded')""")

on_mes = first_row(f"""
SELECT
  COUNT(*) FILTER (WHERE financial_status IN ('paid','partially_refunded')) as pedidos,
  SUM(total_price) FILTER (WHERE financial_status IN ('paid','partially_refunded')) as receita
FROM lk_intel.orders
WHERE order_created_at::date >= '{mstr}' AND order_created_at::date <= '{today_str}'
  AND source_name = 'web'
  AND order_created_at::date != '{OUTLIER_DATE}'
  AND financial_status IN ('paid','partially_refunded')""")

fi_mes = first_row(f"""
SELECT
  COUNT(*) FILTER (WHERE financial_status IN ('paid','partially_refunded')) as pedidos,
  SUM(total_price) FILTER (WHERE financial_status IN ('paid','partially_refunded')) as receita
FROM lk_intel.orders
WHERE order_created_at::date >= '{mstr}' AND order_created_at::date <= '{today_str}'
  AND source_name = 'pos'
  AND order_created_at::date != '{OUTLIER_DATE}'
  AND financial_status IN ('paid','partially_refunded')""")

# Parsed values - yesterday
on_rec_ontem = float(on_ontem['receita'] or 0)
on_ped_ontem = on_ontem['ped'] or 0
on_ticket = float(on_ontem['ticket'] or 0)
fi_rec_ontem = float(fi_ontem['receita'] or 0)
fi_ped_ontem = fi_ontem['ped'] or 0
fi_ticket = float(fi_ontem['ticket'] or 0)
total_rec_ontem = on_rec_ontem + fi_rec_ontem
total_ped_ontem = on_ped_ontem + fi_ped_ontem

# Parsed values - 2 days ago (for variance)
on_rec_ante = float(on_ante['receita'] or 0)
fi_rec_ante = float(fi_ante['receita'] or 0)
total_rec_ante = on_rec_ante + fi_rec_ante

# Parsed values - monthly totals
total_rec_mes = float(total_mes['receita'] or 0)
total_ped_mes = total_mes['pedidos'] or 0
on_rec_mes = float(on_mes['receita'] or 0)
on_ped_mes = on_mes['pedidos'] or 0
fi_rec_mes = float(fi_mes['receita'] or 0)
fi_ped_mes = fi_mes['pedidos'] or 0

# Media 7 dias (exclude outlier)
on_sem = sql(f"""
SELECT SUM(total_price) FILTER (WHERE financial_status = 'paid') as daily_revenue
FROM lk_intel.orders
WHERE order_created_at::date >= '{wstr}' AND order_created_at::date < '{ystr}'
  AND source_name = 'web'
GROUP BY order_created_at::date""")

fi_sem = sql(f"""
SELECT SUM(total_price) FILTER (WHERE financial_status = 'paid') as daily_revenue
FROM lk_intel.orders
WHERE order_created_at::date >= '{wstr}' AND order_created_at::date < '{ystr}'
  AND source_name = 'pos'
GROUP BY order_created_at::date""")

on_dias = [float(d['daily_revenue']) for d in on_sem if float(d['daily_revenue']) < 500000]
fi_dias = [float(d['daily_revenue']) for d in fi_sem if float(d['daily_revenue']) < 500000]
on_media = sum(on_dias) / len(on_dias) if on_dias else 0
fi_media = sum(fi_dias) / len(fi_dias) if fi_dias else 0
total_media = on_media + fi_media

# Variance calculations
var_total = ((total_rec_ontem - total_rec_ante) / total_rec_ante * 100) if total_rec_ante > 0 else 0
var_on = ((on_rec_ontem - on_rec_ante) / on_rec_ante * 100) if on_rec_ante > 0 else 0
var_fi = ((fi_rec_ontem - fi_rec_ante) / fi_rec_ante * 100) if fi_rec_ante > 0 else 0

sinal_total = "+" if var_total >= 0 else ""
sinal_on = "+" if var_on >= 0 else ""
sinal_fi = "+" if var_fi >= 0 else ""

var_on_str = (sinal_on + str(int(var_on)) + "%") if on_rec_ante > 0 else "sem dado"
var_fi_str = (sinal_fi + str(int(var_fi)) + "%") if fi_rec_ante > 0 else "sem dado"

msg = "*💰 FATURAMENTO - " + df + "*\n\n"

msg += "*📦 Ontem*\n"
msg += f"Total: {fmt_money(total_rec_ontem)} ({total_ped_ontem} ped)\n"
seta_t = "↑" if var_total >= 0 else "↓"
msg += f"{seta_t} {sinal_total}{int(var_total)}% vs {df2}\n"

msg += "\n*🛒 Online*\n"
msg += f"{fmt_money(on_rec_ontem)} ({on_ped_ontem} ped) | ticket {fmt_money(on_ticket)}\n"
seta_o = "↑" if var_on >= 0 else "↓"
msg += f"{seta_o} {var_on_str} vs {df2}\n"

msg += "\n*🏬 Física*\n"
msg += f"{fmt_money(fi_rec_ontem)} ({fi_ped_ontem} ped) | ticket {fmt_money(fi_ticket)}\n"
seta_f = "↑" if var_fi >= 0 else "↓"
msg += f"{seta_f} {var_fi_str} vs {df2}\n"

msg += "\n*📊 Resumo*\n"
msg += f"Média/dia (7d): {fmt_money(total_media)}\n"
pct_on = int(on_rec_mes * 100 / total_rec_mes) if total_rec_mes > 0 else 0
pct_fi = int(fi_rec_mes * 100 / total_rec_mes) if total_rec_mes > 0 else 0
msg += f"Mês: {fmt_money(total_rec_mes)} ({total_ped_mes} ped)\n"
msg += f"  🛒 Online: {fmt_money(on_rec_mes)} ({on_ped_mes} ped) — {pct_on}%\n"
msg += f"  🏬 Física: {fmt_money(fi_rec_mes)} ({fi_ped_mes} ped) — {pct_fi}%\n"

print(f"[TOPICO 1] FATURAMENTO - Enviando {len(msg)} chars", flush=True)
send(msg)


# ============================================================
# TOPICO 2: OPERACIONAL
# ============================================================
pag_pendente = first_row(f"SELECT COUNT(*) as total FROM lk_intel.orders WHERE order_created_at::date = '{ystr}' AND financial_status = 'paid' AND fulfillment_status != 'fulfilled'")
cancelados = first_row(f"SELECT COUNT(*) as total FROM lk_intel.orders WHERE order_created_at::date = '{ystr}' AND financial_status IN ('canceled', 'voided')")
refunds = first_row(f"SELECT COUNT(*) as total FROM lk_intel.orders WHERE order_created_at::date = '{ystr}' AND financial_status = 'refunded'")
novos_hoje = first_row(f"SELECT COUNT(*) as total FROM lk_intel.orders WHERE order_created_at::date = '{str(today)}' AND financial_status = 'paid'")

linhas = []
pp = pag_pendente['total'] or 0
ca = cancelados['total'] or 0
ref_total = refunds['total'] or 0
nh = novos_hoje['total'] or 0
if pp > 0:
    linhas.append("Pagos sem enviar: " + str(pp))
if ca > 0:
    linhas.append("Cancelados: " + str(ca))
if ref_total > 0:
    linhas.append("Reembolsos: " + str(ref_total))
if nh > 0:
    linhas.append("Novos hoje: " + str(nh))
if not linhas:
    linhas.append("Nenhum alerta operacional.")

msg = "*⚙️ OPERACIONAL - " + df + "*\n\n" + "\n".join(["- " + l for l in linhas])
print(f"[TOPICO 2] OPERACIONAL - Enviando {len(msg)} chars", flush=True)
send(msg)


# ============================================================
# TOPICO 3: PRODUTOS E MARCAS
# ============================================================
marcas = sql(f"""
SELECT oi.vendor as brand, SUM(oi.line_total) as revenue, SUM(oi.quantity) as qty
FROM lk_intel.orders o JOIN lk_intel.order_items oi ON o.id = oi.order_id
WHERE o.order_created_at::date = '{ystr}' AND o.financial_status = 'paid'
GROUP BY oi.vendor ORDER BY revenue DESC LIMIT 5""")

produtos = sql(f"""
SELECT oi.title as product, oi.vendor as brand, SUM(oi.quantity) as qty
FROM lk_intel.orders o JOIN lk_intel.order_items oi ON o.id = oi.order_id
WHERE o.order_created_at::date = '{ystr}' AND o.financial_status = 'paid'
GROUP BY oi.title, oi.vendor ORDER BY qty DESC LIMIT 5""")

if marcas or produtos:
    partes = []
    if marcas:
        top_marcas = "\n".join([b['brand'] + ": " + fmt_money(b['revenue']) + " (" + str(b['qty']) + " un)" for b in marcas])
        partes.append("*Marcas:*\n" + top_marcas)
    if produtos:
        top_prod = "\n".join([p['product'] + ": " + str(p['qty']) + " un" for p in produtos])
        partes.append("*Produtos:*\n" + top_prod)
    msg = "*🏷️ PRODUTOS - " + df + "*\n\n" + "\n\n".join(partes)
else:
    msg = "*🏷️ PRODUTOS - " + df + "*\n\nSem vendas ontem."

print(f"[TOPICO 3] PRODUTOS - Enviando {len(msg)} chars", flush=True)
send(msg)


# ============================================================
# TOPICO 4: ESTOQUE
# ============================================================
critico = sql(f"""
SELECT p.title, p.vendor as brand, v.inventory_quantity as qty
FROM lk_intel.products p 
JOIN lk_intel.variants v ON p.shopify_id = v.shopify_product_id
WHERE v.is_active = true AND v.inventory_quantity > 0 AND v.inventory_quantity < 5
ORDER BY v.inventory_quantity ASC LIMIT 5""")

mortos = sql(f"""
SELECT p.title, p.vendor as brand
FROM lk_intel.products p 
JOIN lk_intel.variants v ON p.shopify_id = v.shopify_product_id
WHERE v.is_active = true AND v.inventory_quantity = 0
  AND p.created_at < NOW() - INTERVAL '30 days'
ORDER BY p.created_at ASC LIMIT 3""")

msg_parts = []
if critico:
    itens = "\n".join([e['title'] + " (" + e['brand'] + "): " + str(e['qty']) + " un" for e in critico])
    msg_parts.append("*⚠️ Critico (-5 un):*\n" + itens)
if mortos:
    itens = "\n".join([e['title'] + ": sem estoque 30d+" for e in mortos])
    msg_parts.append("*💀 Mortos (sem giro 30d+):*\n" + itens)

if msg_parts:
    msg = "*📦 ESTOQUE - " + df + "*\n\n" + "\n\n".join(msg_parts)
else:
    msg = "*📦 ESTOQUE - " + df + "*\n\nSem alertas de estoque."

print(f"[TOPICO 4] ESTOQUE - Enviando {len(msg)} chars", flush=True)
send(msg)


# ============================================================
# TOPICO 5: WEB + COMUNICAO
# ============================================================

# --- GA4 DATA ---
ga4_ontem = first_row(f"""
SELECT SUM(sessions) as sessions, SUM(pageviews) as pageviews, SUM(conversions) as conversions
FROM lk_intel.ga4_daily_traffic WHERE date = '{ystr}'""")

ga4_collections = sql(f"""
SELECT page_path, SUM(sessions) as sess
FROM lk_intel.ga4_daily_traffic
WHERE date >= '{str(today - timedelta(days=3))}' AND date <= '{ystr}'
  AND page_path LIKE '/collections/%%'
GROUP BY page_path ORDER BY sess DESC LIMIT 5""")

ga4_products = sql(f"""
SELECT page_path, SUM(sessions) as sess
FROM lk_intel.ga4_daily_traffic
WHERE date >= '{str(today - timedelta(days=3))}' AND date <= '{ystr}'
  AND page_path LIKE '/products/%%'
GROUP BY page_path ORDER BY sess DESC LIMIT 5""")

ga4_total_sess = first_row(f"""
SELECT SUM(sessions) as total FROM lk_intel.ga4_daily_traffic
WHERE date >= '{str(today - timedelta(days=3))}' AND date <= '{ystr}'""")

ga4_device = sql(f"""
SELECT device_category, SUM(sessions) as sess
FROM lk_intel.ga4_daily_traffic
WHERE date >= '{str(today - timedelta(days=3))}' AND date <= '{ystr}'
GROUP BY device_category ORDER BY sess DESC""")


def limpa_nome(path):
    """Clean product/collection page path into readable name."""
    if not path or not isinstance(path, str):
        return '/'
    nome = path.replace('/collections/', '').replace('/products/', '')
    nome = nome.replace('-', ' ')
    to_remove = [
        'alabaster', 'amarelo', 'bege', 'branco', 'preto', 'preta', 'marrom',
        'verde', 'azul', 'rosa', 'vinho', 'off white', 'offwhite', 'cinza',
        'grey', 'black', 'white', 'stone', 'mushroom', 'khaki', 'arid',
        'timberwolf', 'castanho', 'laranja', 'roxo', 'sp',
        'unissex', 'masculino', 'feminino', 'feminina', 'masculina',
        'jpg', 'png', 'webp', 'jpeg', 'alt1', 'alt2', 'alt3', 'alt4'
    ]
    for t in to_remove:
        nome = nome.replace(t, '')
    nome = ' '.join(nome.split()).strip().title()
    return nome or '/'


sess_y = int(ga4_ontem.get('sessions') or 0)
conv_y = int(ga4_ontem.get('conversions') or 0)
total_sess = int(ga4_total_sess.get('total') or 0)

# --- BUILD ---
msg = "*🌐 TRÁFEGO WEB - " + df + "*\n\n"

if ga4_collections:
    msg += "*📊 Coleções (3d)*\n"
    for i, p in enumerate(ga4_collections, 1):
        nome = limpa_nome(p['page_path'])
        pct = int(p['sess']) * 100 // total_sess if total_sess > 0 else 0
        barra = "▓" * (pct // 3) if pct >= 3 else ""
        msg += f"{i}. {nome}  {p['sess']} ({pct}%) {barra}\n"

if ga4_products:
    msg += "\n*🔥 Produtos (3d)*\n"
    for i, p in enumerate(ga4_products, 1):
        nome = limpa_nome(p['page_path'])
        pct = int(p['sess']) * 100 // total_sess if total_sess > 0 else 0
        barra = "▓" * (pct // 3) if pct >= 3 else ""
        msg += f"{i}. {nome}  {p['sess']} ({pct}%) {barra}\n"

msg += "\n*📱 Dispositivo*\n"
if ga4_device and total_sess > 0:
    devs = " | ".join([d['device_category'].upper() + " " + str(int(d['sess'] * 100 // total_sess)) + "%" for d in ga4_device if d['sess'] > 0])
    msg += devs + "\n"

msg += "\n*💡 O que fazer*\n"
if conv_y == 0 and sess_y > 0:
    top_prod_path = ga4_products[0]['page_path'] if ga4_products else ''
    msg += f"• {limpa_nome(top_prod_path)} tem tráfego mas não converte.\n"
    msg += "• Verificar: preço visível? CTA claro?\n"
    msg += "• Criar post/promoção pra esse produto.\n"
elif conv_y > 0:
    msg += "• Funcionando. Manter conteúdo.\n"
else:
    msg += "• Sem tráfego. Verificar se ads estão ativas.\n"

print(f"[TOPICO 5] WEB/TRAFEGO - Enviando {len(msg)} chars", flush=True)
send(msg)


# ============================================================
# TOPICO 6: INSIGHTS SEMANAIS E MENSAIS
# ============================================================

# --- DATE RANGES ---
today_d = date.today()
week_end = ystr
week_start = str(today_d - timedelta(days=7))
prev_week_end = str(today_d - timedelta(days=8))
prev_week_start = str(today_d - timedelta(days=14))
month_this_start = mstr
month_last_end = str(date(today_d.year, today_d.month - 1, 1) - timedelta(days=1)) if today_d.month > 1 else str(date(today_d.year - 1, 12, 31))
month_last_start = str(date(int(month_last_end[:4]), int(month_last_end[5:7]), 1))

# --- WEEK vs WEEK ---
w_this = first_row(f"""
SELECT COUNT(*) FILTER (WHERE financial_status = 'paid') as ped,
       SUM(total_price) FILTER (WHERE financial_status = 'paid') as rec
FROM lk_intel.orders
WHERE order_created_at::date >= '{week_start}' AND order_created_at::date <= '{week_end}'
  AND order_created_at::date != '{OUTLIER_DATE}'
  AND source_name IN ('web','pos')""")

w_prev = first_row(f"""
SELECT COUNT(*) FILTER (WHERE financial_status = 'paid') as ped,
       SUM(total_price) FILTER (WHERE financial_status = 'paid') as rec
FROM lk_intel.orders
WHERE order_created_at::date >= '{prev_week_start}' AND order_created_at::date <= '{prev_week_end}'
  AND source_name IN ('web','pos')""")

# --- BRANDS: this week vs last week ---
brands_this = sql(f"""
SELECT oi.vendor, SUM(oi.line_total) as rev, SUM(oi.quantity) as qty
FROM lk_intel.orders o JOIN lk_intel.order_items oi ON o.id = oi.order_id
WHERE o.order_created_at::date >= '{week_start}' AND o.order_created_at::date <= '{week_end}'
  AND o.financial_status = 'paid' AND o.order_created_at::date != '{OUTLIER_DATE}'
GROUP BY oi.vendor ORDER BY rev DESC LIMIT 5""")

brands_prev = sql(f"""
SELECT oi.vendor, SUM(oi.line_total) as rev
FROM lk_intel.orders o JOIN lk_intel.order_items oi ON o.id = oi.order_id
WHERE o.order_created_at::date >= '{prev_week_start}' AND o.order_created_at::date <= '{prev_week_end}'
  AND o.financial_status = 'paid'
GROUP BY oi.vendor ORDER BY rev DESC""")

# --- PRODUCTS: this week vs last week ---
prods_this = sql(f"""
SELECT oi.title, oi.vendor, SUM(oi.quantity) as qty, SUM(oi.line_total) as rev
FROM lk_intel.orders o JOIN lk_intel.order_items oi ON o.id = oi.order_id
WHERE o.order_created_at::date >= '{week_start}' AND o.order_created_at::date <= '{week_end}'
  AND o.financial_status = 'paid' AND o.order_created_at::date != '{OUTLIER_DATE}'
GROUP BY oi.title, oi.vendor ORDER BY qty DESC LIMIT 5""")

prods_prev = sql(f"""
SELECT oi.title, SUM(oi.quantity) as qty
FROM lk_intel.orders o JOIN lk_intel.order_items oi ON o.id = oi.order_id
WHERE o.order_created_at::date >= '{prev_week_start}' AND o.order_created_at::date <= '{prev_week_end}'
  AND o.financial_status = 'paid'
GROUP BY oi.title ORDER BY qty DESC LIMIT 5""")

# --- MONTH vs MONTH ---
m_this = first_row(f"""
SELECT COUNT(*) FILTER (WHERE financial_status = 'paid') as ped,
       SUM(total_price) FILTER (WHERE financial_status = 'paid') as rec
FROM lk_intel.orders
WHERE order_created_at::date >= '{month_this_start}' AND order_created_at::date <= '{ystr}'
  AND order_created_at::date != '{OUTLIER_DATE}'
  AND source_name IN ('web','pos')""")

# --- REFUND RATE ---
refund_30d = first_row("""
SELECT COUNT(*) FILTER (WHERE financial_status = 'refunded') as r,
       COUNT(*) FILTER (WHERE financial_status = 'paid') as p
FROM lk_intel.orders WHERE created_at >= NOW() - INTERVAL '30 days'""")
taxa_refund = (refund_30d['r'] / refund_30d['p'] * 100) if refund_30d['p'] > 0 else 0

# --- CALCULATE VARIATIONS ---
w_ped_this = w_this['ped'] or 0
w_rec_this = float(w_this['rec'] or 0)
w_ped_prev = w_prev['ped'] or 0
w_rec_prev = float(w_prev['rec'] or 0)

w_ped_var = ((w_ped_this - w_ped_prev) / w_ped_prev * 100) if w_ped_prev > 0 else None
w_rec_var = ((w_rec_this - w_rec_prev) / w_rec_prev * 100) if w_rec_prev > 0 else None

m_rec_this = float(m_this['rec'] or 0)

# media 3 dias para topico 7
week_days = sql(f"""
SELECT order_created_at::date as dia, SUM(total_price) FILTER (WHERE financial_status = 'paid') as rec
FROM lk_intel.orders
WHERE order_created_at::date >= '{week_start}' AND order_created_at::date <= '{week_end}'
  AND source_name IN ('web','pos')
GROUP BY order_created_at::date""")
dias_rec = [float(d['rec']) for d in week_days if float(d.get('rec') or 0) < 500000]
media_3d = sum(dias_rec[:3]) / len(dias_rec[:3]) if len(dias_rec) >= 3 else (sum(dias_rec) / len(dias_rec) if dias_rec else 0)

# Brand dict for comparison
prev_brands = {b['vendor']: float(b['rev']) for b in brands_prev}

# --- BUILD INSIGHT MESSAGE ---
msg = "*📊 INSIGHTS - " + df + "*\n\n"

# Receita
msg += "*💰 Receita*\n"
if w_rec_var is not None:
    seta = "↑" if w_rec_var >= 0 else "↓"
    cor = "+" if w_rec_var >= 0 else ""
    msg += f"Semana: {seta} {cor}{int(w_rec_var)}% vs semana passada\n"
    msg += f"  {fmt_money(w_rec_this)} (esta) vs {fmt_money(w_rec_prev)} (passada)\n"
else:
    msg += f"Semana: {fmt_money(w_rec_this)}\n"

msg += "\n*🏷 Marcas (semana)*\n"
if brands_this:
    for b in brands_this[:3]:
        nome = b['vendor']
        rev = float(b['rev'])
        prev_rev = prev_brands.get(nome, 0)
        if prev_rev > 0:
            var = ((rev - prev_rev) / prev_rev) * 100
            seta = "↑" if var >= 0 else "↓"
            msg += f"{nome}: {seta} {int(abs(var))}%\n"
        elif rev > 0:
            msg += f"{nome}: NOVO ↑\n"
        else:
            msg += f"{nome}: 0\n"
else:
    msg += "Sem dado.\n"

# Produtos
msg += "\n*👟 Produtos (semana)*\n"
prev_prods = {p['title']: p['qty'] for p in prods_prev}
if prods_this:
    for p in prods_this[:3]:
        nome = limpa_nome(p['title']) if isinstance(p['title'], str) else '/'
        qty = p['qty'] or 0
        prev_qty = prev_prods.get(p['title'], 0)
        if prev_qty > 0:
            var = ((qty - prev_qty) / prev_qty) * 100
            seta = "↑" if var >= 0 else "↓"
            msg += f"{nome}: {seta} {int(abs(var))}%\n"
        elif qty > 0:
            msg += f"{nome}: NOVO ↑ ({qty} un)\n"
else:
    msg += "Sem dado.\n"

# Refund
msg += "\n*↩️ Reembolso*\n"
if taxa_refund > 8:
    msg += f"⚠️ {round(taxa_refund, 1)}% em 30d — taxa alta. Auditar produtos.\n"
elif taxa_refund > 5:
    msg += f"{round(taxa_refund, 1)}% em 30d — monitorar.\n"
else:
    msg += f"{round(taxa_refund, 1)}% em 30d — normal.\n"

print(f"[TOPICO 6] INSIGHTS - Enviando {len(msg)} chars", flush=True)
send(msg)


# ============================================================
# TOPICO 7: AÇÃO DO DIA
# ============================================================
# --- META ADS ---
ads_last = first_row("SELECT MAX(date) as last_date FROM lk_intel.meta_ad_insights WHERE spend > 0")
last_spend_date = ads_last.get('last_date') or ''

acoes = []

if total_rec_ontem < media_3d * 0.5 and media_3d > 0:
    acoes.append("RECEITA: Abaixo de 50% da media. Revisar ads, estoque, post organico.")
elif taxa_refund > 8:
    acoes.append("REFUND: Taxa critica. Auditar produtos com mais return.")
elif pp > 3:
    acoes.append("PENDENTES: " + str(pp) + " pedidos sem enviar. Enviar hoje.")
elif not last_spend_date:
    acoes.append("META ADS: Campaign sem dado. Verificar se esta ativa.")
elif taxa_refund > 5:
    acoes.append("REFUND: Taxa elevada. Investigar produtos com mais returns.")
else:
    acoes.append("Dia normal. Continuar operacao.")

msg = "*🎯 AÇÃO DO DIA - " + today.strftime('%d/%m') + "*\n\n" + "\n".join(["- " + a for a in acoes])
print(f"[TOPICO 7] ACAO DO DIA - Enviando {len(msg)} chars", flush=True)
send(msg)

print("=== TODAS AS 7 MENSAGENS ENVIADAS ===", flush=True)
