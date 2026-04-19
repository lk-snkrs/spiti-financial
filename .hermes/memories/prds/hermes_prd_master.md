# Hermes COO PRD — Revisão 19/04/2026

**Score Geral: 4.8/10**

---

## Prioridade 0 — Corrigir Esta Semana

| # | Ação | Arquivo/Script | Esforço |
|---|------|---------------|---------|
| P0-1 | **Meta Ads token** — Lucas precisa re-autenticar | Doppler | 5 min |
| P0-2 | **Criar brain_sync.sh** — sync determinístico Brain→Mem0 | `/root/.hermes/scripts/brain_sync.sh` | 2h |
| P0-3 | **Corrigir monitor_daemon** — excluir snap squashfs do disk alert | `monitor_daemon.py` | 30 min |
| P0-4 | **Corrigir deduplication** — janela 60s → 300s | `monitor_daemon.py` | 15 min |
| P0-5 | **Corrigir cost_spike math** — normalização diaria é no-op | `proactive_insight_engine.py` | 15 min |
| P0-6 | **Rate-limit separado** por severity level | `alert_system.py` | 30 min |

---

## Prioridade 1 — Melhorias Estratégicas (2-4 semanas)

### 1. Auto-Remediation Real
**Problema:** `hermes_remediate.sh` existe mas NÃO é chamado por ninguém.
**Solução:** Integrar ao alert_system — quando alerta dispara, tenta consertar primeiro.

```python
# Arquitetura proposta:
Alert Detectado → hermes_remediate.sh --type=<tipo> → Se falhou → Notifica Lucas
```

### 2. VPS Brain Consolidation
**Problema:** SSH bloqueado para 72.60.150.124. Brain duplicado.
**Solução:** Consolidar todo Brain no repo local. Deprecatar VPS brain.

### 3. Tiny ERP → variants.cost
**Problema:** `variants.cost` 100% NULL — margem não funciona.
**Solução:** Integrar API do Tiny ERP para puxar COGS.

### 4. Decisions Programáticas
**Problema:** decisions.md é markdown puro — não consultável.
**Solução:** Exportar para JSON/Supabase com `decided_at`, `status`, `next_review`.

### 5. Session-End Mem0 Summary
**Problema:** `on_session_end` não pusha resumo pro Mem0.
**Solução:** Hook `on_session_end` → `mem0_conclude` com summary da sessão.

---

## Prioridade 2 — Projetos Futuros (1-3 meses)

### 1. Autonomous Loop Mode
**Status:** Implementado em `agent/autonomous_loop.py` — ainda não exposto como tool.
**Próximo:** Expor via skill + cron para rodar goals overnight.

### 2. Real-Time Alert Routing
**Problema:** Alertas vão só pra log/arquivo — não chegam no Telegram.
**Solução:** Integrar `alert_system.py` → Telegram via gateway hook.

### 3. Cross-Company Intelligence
**Status:** Engine criada, cron registrado, 22 tests passing.
**Próximo:** Wire DBs reais (Zipper + Spiti têm credenciais?).

### 4. Predictive Alerts
**Problema:** Sistema é reativo — só detecta depois que quebra.
**Solução:** ML simples sobre histórico — antecipar manutenção.

---

## Análise de Score por Área

| Área | Score | Problema Principal |
|------|-------|------------------|
| Infraestrutura | 5/10 | VPS SSH bloqueado — sem acesso |
| Confiabilidade | 4/10 | Zero auto-remediação real |
| Proatividade | 3/10 | Só detecta depois que quebra |
| Brain/Mem0 | C+/10 | brain_sync.sh não existe |
| Dados LK | 5/10 | transactions 0 rows, cost NULL |
| Crons | 7/10 | Funcionando mas monitoria fraca |

---

## Pendências Só Lucas

1. **Meta Ads token** — autenticar em business.facebook.com
2. **VPS SSH** — desbloquear porta 22 ou resetar credencial
3. **Tiny ERP** — integração COGS para margem real
4. **Zipper + Spiti DB credentials** — ativar cross-company real

---

*Gerado: 2026-04-19*
*Próxima revisão: 2026-04-26*
