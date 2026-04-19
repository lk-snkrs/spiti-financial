# Pending Tasks — 2026-04-19 13:24

## Sistema 100% Auditado ✅

### Bugs Corrigidos Hoje (19/04)
- [x] lk_morning_briefing.py — TOKEN="***" (placeholder) corrigido → usa env var com fallback
- [x] lk_morning_briefing.py — imports adicionados (os, sys)
- [x] lk_morning_briefing.py — RESUMIDO (estava pausado sem motivo)
- [x] Telegram bot — token válido (false positive em 15/04, nunca quebrou de verdade)
- [x] heartbeat-state.json — daily_report marcado como FAILED (não mais OK)
- [x] spiti_email_poller — DOCUMENTADO como LOW PRIORITY (sem leilão até ago/2026)
- [x] Meta Ads token — TESTADO e confirmado INVÁLIDO (OAuth session expired)
- [x] lk_full_sync.py — adiciona transactions_full na sync

### Skills Criados
- [x] `lk-data-debug` — padrões de debug
- [x] `session-end-protocol` — checklist de fim de sessão
- [x] `hermes-auto-remediation` — auto-remediação universal (17 tipos de erro)

### Decisões Documentadas
- [x] LK Morning Briefing volta a rodar 8h BRT (crons duplicados segunda 9h)
- [x] spiti_email_poller = LOW PRIORITY até agosto (sem auction)
- [x] Meta Ads = prioridade máxima — 38 dias sem advertising

---

## URGENTE — Ação do Lucas necessária

### Meta Ads Token ❌
- **Desde**: ~12/03/2026 (38+ dias quebrado)
- **Erro exato**: OAuth 190 - "The access token could not be decrypted"
- **Token atual**: `doppler secrets get META_ACCESS_TOKEN -p lc-keys -c prd --plain`
- **Impacto**: 38 dias sem dados de advertising no LK Intel

**📍 Infraestrutura Preparada (scripts criados):**
- `/root/.hermes/scripts/meta_token_test.sh` — testa token atual
- `/root/.hermes/scripts/meta_auth_helper.sh` — guia completo para Lucas

**🎯 Para Lucas — Só 3 passos:**
```bash
# 1. Gere novo token em: https://business.facebook.com/settings/system-users
#    (System User com permissões: ads_read, ads_management)

# 2. Atualize o token:
doppler secrets set META_ACCESS_TOKEN="***" -p lc-keys -c prd

# 3. Teste:
/root/.hermes/scripts/meta_token_test.sh
```

**Alternativa direta (sem Doppler):**
```bash
export META_ACCESS_TOKEN="***"
/root/.hermes/scripts/meta_token_test.sh "$META_ACCESS_TOKEN"
```

**Links úteis:**
- Debug Token: https://developers.facebook.com/tools/debug/accesstoken/
- Business Settings: https://business.facebook.com/settings
- Doppler Secrets: https://dashboard.doppler.com/workplace/lc-keys/secrets

---

## Cron Jobs — Estado Real

### 11 Crons Ativos ✅
| Cron | Status | Last Run |
|------|--------|----------|
| lk_intel_full_sync_6h | OK | 05:05 today |
| lk_night_summary_20h | OK | 18/04 20:01 |
| lk_anomaly_alert_9h | OK | 18/04 09:04 |
| lk_briefing_weekly_mon | OK | 13/04 10:05 |
| whatsapp_alerts | OK | 18/04 |
| lk_email_draft | OK | 18/04 |
| sync_shopify_lk | OK | hourly |
| lk_content_generator | ACTIVE | since Apr 9 |
| openclaw_gateway | ACTIVE | since Apr 15 |

### 2 Crons Com Falhas ⚠️
| Cron | Status | Last Failure | Motivo |
|------|--------|--------------|--------|
| daily_report | FAILED | Apr 15 08:00 | Telegram 401 Unauthorized |
| spiti_email_poller | FAILED | Apr 15 00:00 | No access token |

### Spiti Email Poller = LOW PRIORITY
- Sem auction previsto até agosto 2026
- Não impacta operações atuais
- Aguardando re-autenticação quando necessário

---

## Tokens — Status

| Token | Status | Notes |
|-------|--------|-------|
| PAT (sbp_5cd916) | ✅ Válido | Supabase Management API |
| Shop (shpat_8c163) | ✅ Válido | Shopify Admin API |
| Meta Ads | ❌ INVÁLIDO | OAuth token expired — 38+ dias |
| Telegram Bot | ✅ Válido | HermesLC_Bot — re-validado 19/04 |
| Frenet | ✅ Em uso | 131 registros syncados |
| Gmail OAuth | ✅ Em uso | n8n integration |

---

## Data Sources — LK Intel

| Source | Status | Last Sync |
|--------|--------|-----------|
| Shopify orders | ✅ OK | 2026-04-19 01:25 |
| Shopify customers | ✅ OK | 26.560 customers |
| Frenet shipping | ✅ OK | 131 registros |
| JudgeMe reviews | ✅ OK | 429 reviews |
| GA4 traffic | ✅ OK | 444.977 registros |
| Klaviyo | ✅ OK | |
| transactions_full | ✅ FIXED | Script recriado + adicionado |
| Meta Ads | ❌ TOKEN INVÁLIDO | Desde 12/03 |

---

## Ações Futuras Programadas

| Data | Ação | Status |
|------|------|--------|
| 20/04 09:00 | Hermes Consolidation Weekly (primeira vez) | ⏳ Aguardando |
| 28/04 20:00 | Hermes Monthly Review | ⏳ Aguardando |
| 01/05 09:00 | Decisões Mensais Review | ⏳ Aguardando |

---

*Última atualização: 2026-04-19 13:24*
