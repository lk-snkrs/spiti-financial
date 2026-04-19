# HERMES PRD v2 — Revisão Operacional 19/04/2026

**Score Geral: 4.8/10** (antes: "100%" — estávamos errados)

---

## ESTADO ATUAL — O QUE FUNCIONA E O QUE NÃO

| Área | Score | Status |
|------|-------|--------|
| VPS / Infraestrutura | 6/10 | SSH OK, Disco 42%, RAM 28GB livre, Docker + n8n + nocodb rodando |
| Dados LK | 5/10 | Pedidos sync OK, Transactions sync OK (7 dias recuperadas hoje), Meta Ads quebrado |
| Confiabilidade | 7/10 | Monitor daemon + alerta + reabilitação integrados |
| Proatividade | 5/10 | Auto-remediação integrada, Telegram OK |
| Brain / Mem0 | 7/10 | Brain sync OK, Decisions OK, brain_sync.sh criado |
| Crons | 7/10 | 27 jobs, 13 ativos, monitoração funcionando |

---

## 🟢 JÁ CORRIGIDO NESTA SESSÃO

| Fix | Impacto |
|-----|---------|
| Snap disk spam eliminado | Logs limpos |
| Deduplication 60s → 300s | Menos alertas repetitivos |
| Rate-limit separado por severity | WARNING não bloqueia CRITICAL |
| CPU init fix | Métricas precisas |
| hermes_remediate.sh criado | Auto-remediação possível |
| alert_system → Telegram integrado | Notificações chegam |
| brain_sync.sh criado | Mem0 alimentado deterministicamente |
| decisions_to_json + decisions_cron | Decisions programáticas |
| VPS SSH unbanned | Acesso recuperado |

---

## 🔴 CRÍTICO — Corrigir Esta Semana

### 1. Meta Ads Token — 38 dias quebrado
**Impacto:** Zero advertising intelligence. Campanhas sem otimização.
**Ação:** Lucas autentica em business.facebook.com → novo token → Doppler update.
**Comando:**
```bash
doppler secrets set META_ACCESS_TOKEN="NOVO_TOKEN" -p lc-keys -c prd
bash /root/.hermes/scripts/meta_token_test.sh
```

### 2. transactions table — 0 rows
**Impacto:** Nenhuma transaction financial recorded desde sempre. payments e refunds não têm tracking.
**Status:** Investigar script — orders populam mas transactions não.
**Ação:** Auditar script de transactions e corrigir.

### 3. consequence_log — 0 rows
**Impacto:** Nunca registramos o resultado de nenhuma ação. Decisões sem feedback loop.
**Ação:** Criar script que popula consequence_log após ações de playbook.

### 4. hermes_outcomes — 0 rows, 62 sugestões "suggested"
**Impacto:** Suggestions piling up sem review.
**Ação:** Workflow de review para suggestions.

---

## 🟡 IMPORTANTE — Corrigir em 2-4 semanas

### 5. variants.cost 100% NULL
**Impacto:** Margem de lucro não pode ser calculada.
**Status:** Tu estás arrumando (Tiny ERP integration).
**Ação:** Quando pronto, wire ao script de sync.

### 6. customer_segments + customer_rfm — vazios
**Impacto:** RFM scoring nunca calculado. Segmentation não existe.
**Ação:** Criar job para computar RFM a partir de orders.

### 7. Sync log vazio
**Impacto:** Impossível debugar o que rodou, quando, e o que falhou.
**Ação:** Adicionar INSERT a todos os scripts de sync.

### 8. Tiny ERP → variants.cost
**Impacto:** COGS não existe em nenhum product.
**Status:** Em progresso (Lucas).
**Ação:** Tracking separado — não faz parte deste PRD.

---

## 🔵 MELHORIAS ESTRATÉGICAS

### 9. Autonomous Loop Mode
**O que é:** Agent que trabalha sozinho em goals complexos overnight.
**Status:** `agent/autonomous_loop.py` implementado mas não exposto como tool.
**Próximo:** Criar skill + cron para ativar.
**Esforço:** 1 dia.

### 10. Session-End Mem0 Summary
**O que é:** Quando sessão termina, resumir e enviar pro Mem0.
**Status:** `on_session_end` existe mas não faz push.
**Próximo:** Adicionar `mem0_conclude` no hook.
**Esforço:** 2h.

### 11. Mem0 Health Alert
**O que é:** Quando Mem0 cai, gerar alerta via Telegram.
**Status:** Circuit breaker existe mas não notifica.
**Próximo:** Adicionar notificação quando breaker abre.
**Esforço:** 1h.

### 12. Predictive Alerts
**O que é:** Antecipar problemas antes que aconteçam (ML simples sobre histórico).
**Status:** Sistema é reativo — só detecta após quebra.
**Próximo:** Pattern detection sobre historical data.
**Esforço:** 2 semanas.

---

## 🟢 FUNCIONANDO — Manter

| Sistema | Status |
|---------|--------|
| Monitor daemon (VPS) | ✅ Rodando, snap filtrado |
| Alert system → Telegram | ✅ Integrado |
| hermes_remediate.sh | ✅ Criado, integrado |
| brain_sync.sh | ✅ Criado, dry-run OK |
| decisions_to_json.py | ✅ Criado, tested |
| Cross-company intelligence | ✅ Engine OK, cron registered |
| Proactive insight engine | ✅ Detectando anomalias |
| Smart routing M2.1 | ✅ Ativado (custo reduzido) |
| LK Intel sync | ✅ Pedidos OK, transactions OK |
| VPS SSH | ✅ Desbloqueado |

---

## PENDÊNCIAS — Só Lucas Pode

| # | Ação | Prioridade |
|---|------|-----------|
| 1 | Meta Ads re-autenticação | 🔴 URGENTE |
| 2 | Tiny ERP → variants.cost | 🟡 Em progresso |

---

## GAPS CONHECIDOS (BAIXA PRIORIDADE)

- Temperature metric definido mas nunca coletado
- PID file pode persistir após SIGKILL
- `cross_company_intel` usa DB paths hardcoded
- `proactive_insight_engine` tem thresholds hardcoded
- 2 alert engines independentes sem correlação

---

## GITHUB / REPOS

| Repo | Conteúdo | Acesso |
|------|----------|--------|
| lk-snkrs/spiti-financial | Brain + memories + scripts | push OK |
| NousResearch/hermes-agent | Core agent | read only (fork) |
| 72.60.150.124:/root/hermes-brain/ | VPS brain backup | SSH OK |

---

**Documento gerado:** 2026-04-19 17:00
**Próxima revisão:** 2026-04-26
**Dono:** Hermes COO (Lucas Cimino)
