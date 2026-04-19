---
name: hermes-auto-remediation
description: Auto-remediação universal de erros conhecidos do Hermes. Quando heartbeat detecta erro específico, tenta corrigir automaticamente ANTES de reportar ao Lucas. Framework de 17+ erros tratáveis.
area: operations
tags: [heartbeat, auto-fix, remediation, ops, reliability]
created: 2026-04-19
updated: 2026-04-19
---

# Hermes Auto-Remediation Framework

## Conceito COO

**Regra de ouro:** Quando eu corrijo algo manualmente, a pergunta automática é: "Isso pode ser auto-corrigido? Se sim, implementar antes de fechar a sessão."

Erros tratados automaticamente = menos incômodo pro Lucas = mais tempo pra trabalho estratégico.

## Arquitetura

```
Heartbeat detecta erro
  → Erro é known_type?
      → NÃO: reporta Lucas imediatamente
      → SIM: hermes_remediate.sh <service> <error_type> [args]
          → RESOLVED: loga + silêncio (ok)
          → FAILED: reporta Lucas com contexto do erro
          → REVIEW_NEEDED: reporta Lucas
```

## Script

**Path:** `/root/.hermes/scripts/hermes_remediate.sh`

**Testado:**
```
hermes_remediate.sh vps ssh_refused     → RESOLVED ✅
hermes_remediate.sh script syntax_error /path/to/script.py → OK ✅
hermes_remediate.sh lk frenet_error     → tested ✅
```

## Cobertura (17 erros tratáveis)

### VPS
| Erro | Comando | O que faz |
|------|---------|-----------|
| SSH refused | `vps ssh_refused` | Verifica SSHD, fail2ban unban, UFW rule, testa conexão |
| Service down | `vps service_down <service>` | Restart + verifica se voltou |
| Disk full | `vps disk_full` | Limpa logs, docker prune, find old files |

### Supabase
| Erro | Comando | O que faz |
|------|---------|-----------|
| Connection error | `supabase connection_error <db>` | Testa conexão via REST API |
| Rate limit | `supabase rate_limit` | Sleep 60s + retry |

### Shopify
| Erro | Comando | O que faz |
|------|---------|-----------|
| Rate limit | `shopify rate_limit` | Sleep 60s + retry |
| Auth error | `shopify auth_error` | Verifica token via API, reporta se inválido |

### Evolution WhatsApp
| Erro | Comando | O que faz |
|------|---------|-----------|
| Instance error | `evolution instance_error <instance>` | Verifica status, tenta reconnect |
| Message failed | `evolution message_failed <phone>` | Verifica queue, reporta |

### n8n
| Erro | Comando | O que faz |
|------|---------|-----------|
| Workflow failed | `n8n workflow_failed <workflow_id>` | Verifica n8n online, retry webhook |
| Credential error | `n8n credential_error` | Testa credenciais OAuth |

### Cron
| Erro | Comando | O que faz |
|------|---------|-----------|
| Job failed | `cron job_failed <job_id>` | Localiza script, testa execução direta |
| Lock stuck | `cron lock_stuck <lock_file>` | Remove lock se >30min old |

### Script
| Erro | Comando | O que faz |
|------|---------|-----------|
| Syntax error | `script syntax_error <path>` | Valida bash -n / python -m py_compile / node --check |
| Dep missing | `script dep_missing <path>` | Extrai imports Python, tenta pip install |

### LK
| Erro | Comando | O que faz |
|------|---------|-----------|
| Sync stale | `lk sync_stale` | Verifica idade do último sync, re-roda se >2h |
| Frenet error | `lk frenet_error` | Testa API Frenet |
| Shopify token placeholder | `lk shopify_token_check` | Verifica se token é placeholder vs real (via Doppler) |
| Transactions stale | `lk transactions_stale` | Verifica MAX(created_at) da tabela — se >24h, alerta vermelho |
| Shop name wrong | `lk shopify_shop_name` | Verifica se SHOP name é compatível com o padrão URL do script |

### Generic
| Erro | Comando | O que faz |
|------|---------|-----------|
| Retry | `generic retry <description>` | Sleep 30s genérico |

## Anti-Patterns

- ❌ Não remediar erro que não é deterministicamente corrigível
- ❌ Não remediar sem evidência (suspeita ≠ confirmação)
- ❌ Não remediar se já estamos em loop de retry (max 2 attempts/hora)
- ❌ Não remediar se envolve credenciais que precisam de rotação manual

## Adicionando Novo Erro

1. Identificar o erro e a causa raiz
2. Decidir se é determinístico ( dá pra corrigir sem decisão humana)
3. Se sim → adicionar função em `hermes_remediate.sh`:
   ```bash
   remediate_<service>_<error>() {
       log "<Service>" "=== <Error>: Starting ==="
       # diagnóstico
       # ação
       # teste
       return 0  # RESOLVED
   }
   ```
4. Adicionar no dispatch case do main()
5. Documentar na tabela acima
6. Testar: `hermes_remediate.sh <service> <error> [args]`

## Log

`/root/.hermes/logs/remediation.log` — todo remediation é logado com timestamp.

## Lição Aprendida: transactions_full_sync quebrado (19/04)

**Contexto real:** `lk_transactions_full_sync.py` quebrou em 12/04 e só voltou em 19/04. Cron reportava OK mas dados pararam de entrar.

**3 bugs independentes que causaram a falha:**
1. **Token hardcoded placeholder** — `SHOP_TOKEN="shpat_...f1ba"` em vez de Doppler
2. **Shop name errado** — `SHOP = "lksneakers"` (sem traço, vs `lk-sneakerss` correto)
3. **Domínio dobrado na URL** — `f"https://{SHOP}.myshopify.com"` onde `SHOP="lk-sneakerss.myshopify.com"` gerava URL `lk-sneakerss.myshopify.com.myshopify.com`

**Padrão de falha silenciosa:** Script terminava com "DONE" mas insertava 0 rows porque a API retornava erro 401 tratado como "sem transactions".

**Regra operacional:**
- Antes de declarar sync OK → verificar `MAX(created_at)` da tabela destino
- "0 insertions" em sync que deveria ter dados = ALERTA Vermelho
- Scripts com token hardcoded quebrado: trocam `subprocess.run(["doppler", ...])` por token direto quando rodam manualmente mas falham em produção
- Shop name de Shopify varia por script: alguns precisam de `lk-sneakerss`, outros de `lk-sneakerss.myshopify.com` — regex deve detectar o padrão de cada um

## Lição Aprendida: Token Detection False Positive (19/04/2026)

**Contexto:** `scan_scripts_for_bad_tokens()` em `hermes_health_check.py` detectou o token `sbp_2297055...` como INVÁLIDO — mas ele estava na lista `INVALID_TOKENS` DO PRÓPRIO SCRIPT (documentação, não uso real).

**Problema:** Regex `sbp_[a-z0-9]{40}` pegava tokens dentro de strings de documentação, não só em uso real.

**Solução:** Adicionar `if fname == "hermes_health_check.py": continue` no loop — o script não deve se escanear.

**Regra:** Quando um health check reporta um erro sobre SI MESMO, verificar se é documentação vs uso real antes de treatar como bug real.

## Lição Aprendida: Shopify Shop Name — 2 Padrões de Concatenação

**Problema:** Cada script Shopify concatena o SHOP name diferente — não existe um valor universalmente correto.

| Script | URL Pattern | SHOP Value Correto |
|--------|------------|-------------------|
| `lk_transactions_full_sync.py` | `f"https://{SHOP}.myshopify.com/..."` | `lk-sneakerss` |
| `lk_shopify_sync.py` | `f"https://{SHOP}/admin/..."` | `lk-sneakerss.myshopify.com` |
| `lk_sort_batch.py` | `f"https://{SHOP}/admin/api/..."` | `lk-sneakerss.myshopify.com` |

**Regra prática:** Ao corrigir shop name em script Shopify, NÃO assumir que todos usam o mesmo formato. Ler o código primeiro — ver como o SHOP é usado na URL. Sempre testar API com `curl` depois de corrigir.

## Lição Aprendida: Token Supabase (19/04)

**Contexto real:** Token Management API (`sbp_...`) foi revogado. Todos os scripts LK pararam de funcionar ao mesmo tempo.

**Tipos de API Supabase:**
- **Management API** (`api.supabase.com/v1/projects/X/database/query`) → requer **PAT** (`sbp_...`)
- **REST API** (`project.supabase.co/rest/v1/`) → aceita **service_role JWT**

**Quando o Management token morre:**
1. Todos os scripts que usam `api.supabase.com` falham silenciosamente
2. Scripts com `[0]` crasham feio (sem try/except)
3. Solução: conseguir novo PAT via Supabase Dashboard

**Regra operacional:**
- Quando um script quebra com 401 Unauthorized em Supabase Management API → verificar TODOS os outros scripts ao mesmo tempo
- Não esperar cada um falhar individualmente
- Cadastrar novo token → atualizar TODO mundo de uma vez

## Lição Aprendida: Monitor Daemon Bugs Descobertos em Audit (19/04)

**Problema:** O monitor daemon tinha 5+ bugs que faziam o sistema parecer mais broken do que estava.

| Bug | Sintoma | Causa Raiz |
|-----|---------|-----------|
| Snap disks spammando alerts | 7 alerts repetidos a cada 60s | Partições squashfs em 100% são expected — não deveria alertar |
| Deduplication 60s curta demais | Mesmo alert disparando a cada 60s | `< 60` deveria ser `< 300` |
| cpu_percent(interval=None) = 0.0 sempre | CPU mostra 0% no dashboard | psutil requer inicialização com interval real antes do loop |
| WARNING + CRITICAL share bucket | CRITICAL bloqueado por WARNING | Rate-limit key deve ser `metric:severity` não só `metric` |
| Cost spike math era no-op | Spikes não detectados | Divisão cancelava dos dois lados |

**Regra de auditoria:** Antes de assumir que "sistema está OK porque health check passou", verificar:
- Alertas repetindo no log nos últimos 5 min?
- Métricas mostrando 0 mas sistema tem uso real?
- Threshold makes sense for this machine's specs?

## Lição Aprendida: VPS SSH Com sshpass (19/04)

**Contexto:** SSH via chave pública estava bloqueado (fail2ban com 281 falhas, 26 bans). A senha estava disponível mas `sshpass` precisa ser usado explicitamente.

**Padrão para conectar no VPS:**
```bash
sshpass -p '+gryuk#TGk9JQF)q' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@72.60.150.124 "comando"
sshpass -p '+gryuk#TGk9JQF)q' scp -o StrictHostKeyChecking=no arquivo.txt root@72.60.150.124:/destino/
```

**VPS credenciais:**
- IP: 72.60.150.124
- Password: `+gryuk#TGk9JQF)q`
- Porta: 22

**Debugando SSH no VPS:**
```bash
sshpass ... "fail2ban-client status sshd"
sshpass ... "iptables -L INPUT -n | grep 22"
sshpass ... "ss -tlnp | grep :22"
```

## Lição Aprendida: Git Repo Topology (19/04)

**Problema:** Tentando commitar em repo errado repetidamente.

**Arquitetura real:**
```
/root/                          # Git repo: lk-snkrs/spiti-financial
  .hermes/                     # Git repo SEPARADO
    memories/                  # Brain — source of truth
    scripts/                   # Scripts operacionais
    skills/                    # Skills Hermes
    hermes-agent/             # SUBMODULE — fork NousResearch (não temos push)
```

**Regras de commit:**
- `.hermes/memories/`, `.hermes/scripts/`, `.hermes/skills/` → commitar no repo `/root/.hermes/`
- `.hermes/hermes-agent/` → submodule (NousResearch fork) — push pode estar bloqueado
- Se `git add` dá "pathspec did not match" → está no repo errado

## Lição Aprendida: PRD via Subagents Paralelos (19/04)

**Padrão que funcionou:** 3 subagents rodando em paralelo para auditoria:

```
delegate_task (x3 em paralelo):
  → Auditor Infrastructure  → /tmp/hermes_prd_v2_infra.md
  → Auditor Intelligence   → /tmp/hermes_prd_v2_intelligence.md
  → Auditor Reliability     → /tmp/hermes_prd_v2_reliability.md
→ Consolidador (eu) → PRD Master
```

**Duração:** ~3 subagents × 5-10 min = 15-20 min total para análise completa.

**O que NÃO funcionou:**
- Subagents para EXECUTAR fixes (vs pesquisar) — bugs interrompiam, diffs complexos
- Subagents com tasks=[] muito grandes — iteration limit estourado

**O que funcionou:**
- 1 subagent por área de análise (não por item de execução)
- Execução direta via terminal para fixes críticos

---

## Decisão: Reportar ou Silenciar

| Resultado | Ação |
|-----------|------|
| RESOLVED | Loga e silêncio (nothing to report) |
| FAILED | Reporta Lucas com o que tentou e o erro |
| REVIEW_NEEDED | Reporta Lucas (precisa de judgment humano) |
