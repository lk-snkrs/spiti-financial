# Lições Aprendidas — Grupo Cimino

## 🔒 Estratégicas (Permanentes)

### Dados antes de afirmar
- Lucas afirma → verificar no banco. Nunca contradizer sem dados.
- Dizer "zerado" sem consultar Supabase = erro grave.
- **Regra:** dúvida → consulta. Sem consulta → sem resposta sobre dados.

### Credenciais
- NUNCA hardcodar credenciais. Usar `doppler secrets get NOME --plain`
- Fallback explícito: `os.getenv('A') or os.getenv('B')` — sem isso crashes são silenciosos
- `SUPABASE_CRM_SERVICE_KEY` não existe → usar `SUPABASE_ZIPPER_SERVICE_KEY`
- Shopify: `SHOPIFY_ACCESS_TOKEN` (não `SHOPIFY_API_TOKEN`)

### REGRA COO: Health Check Proativo (19/04/2026)
- \"Sistema 100%\" ≠ cron não reportou erro — é preciso verificar os DADOS, não só status
- Health check antigo checava só PAT — NÃO checava tokens DENTRO dos scripts
- Script pode rodar sem inserir dados (token fake, shop name errado) → cron diz OK, DB fica vazio
- **Regra**: health check precisa checar (1) tokens nos scripts, (2) shop names, (3) freshness dos dados

### Shopify Shop Name: 2 Padrões de Concatenação (19/04/2026)
- `f"https://{SHOP}/admin/api/..."` → SHOP precisa ser `lk-sneakerss.myshopify.com`
- `f"https://{SHOP}.myshopify.com/..."` → SHOP precisa ser só `lk-sneakerss`
- Regex de validação PRECISA saber qual padrão cada script usa
- Regra prática: cada novo script Shopify → testar API com curl antes de pushar

### Transactions Full Sync: 3 Bugs Silenciosos (19/04/2026)
1. Token placeholder → script roda sem inserir, ninguém percebe
2. Shop name errado → API retorna 0 results, INSERT faz nothing
3. URL dobrada (lk-sneakerss.myshopify.com.myshopify.com) → SSL error silencioso
- **Prevenção**: health check com `check_transactions_stale()` + `check_shopify_shop_name()`

### REGRA COO: Corrigir + Prevenir + Testar (19/04/2026)
- Bug encontrado → (1) corrigir, (2) previnir auto-corrigido, (3) TESTAR
- \"Funciona\" sem testar = não funciona em produção
- Testar = rodar script + verificar resultado no banco, não só output do terminal

---

## 🗂️ 2026-04-19 evening — Correções Proativas
- Se posso corrigir sozinho → FAÇA. Não pergunte.
- "Você quer que eu corrija?" → já deveria estar corrigido
- Erro encontrado → consertar antes de dizer que encontrou
- Reportar SOMENTE após corrigir
- **Exceção:** quando precisa de ação do Lucas (ex: re-autenticar token)

### REGRA COO: Auto-Remediation
- Quando consertar algo manualmente → perguntar: "Isso pode acontecer de novo?"
- Se sim → criar preventor automático antes de fechar sessão

### Skill ≠ Hook Real (19/04/2026)
- Criar um skill NÃO significa que ele executa automaticamente
- Session-start-protocol existia mas não era carregado automaticamente
- **Regra:** ao criar skill que deveria ser obrigatório → verificar se tem trigger/hook, não só criar e pronto
- Se não tem como automatizar → documentar explicitamente como "executar manualmente" no skill

### Brain: 3 Fontes de Verdade (19/04/2026)
1. `/root/.hermes/memories/` — local (pending, lessons, decisions)
2. `/root/hermes-brain/` — VPS brain
3. Mem0 vector DB — memories da sessão
- **Regra:** após cada sessão → sync bidirecional + `mem0_conclude` para fatos

### Scripts: Dual Location (19/04/2026)
- `/root/.hermes/scripts/` — **canonical** (versionado, backup-safe)
- `/tmp/` — **cópias ativas** que o cron executa
- **Regra:** após editar script → copiar para ambos os lugares:
  ```bash
  cp /root/.hermes/scripts/lk_*.py /tmp/
  ```
- Scripts em `/tmp` chamados por cron:
  `lk_full_sync.py`, `lk_shopify_sync.py`, `lk_meta_sync_v3.py`, `lk_klaviyo_sync_v2.py`, `lk_judgeme_sync_v2.py`, `lk_ga4_sync_v4.py`, `lk_frenet_sync.py`, `lk_transactions_full_sync.py`, `lk_anomaly_deepdive.py`, `lk_morning_briefing.py`

### Webhook async é obrigatório
- Qualquer endpoint com processamento >2s deve responder 200/202 imediatamente
- n8n timeout ~10s. Playwright ~7s/lote → n8n abortava → 6 lances perdidos
- **Regra:** endpoint webhook → responde 2xx imediato → thread separada para trabalho

---

## 📊 LK Sneakers

### Cross-sell (5.7k pedidos analisados)
- Onitsuka Tiger = hub central (1.290 pedidos), 91.6% lealdade
- Jason Markk = upsell universal (funciona com qualquer tênis)
- NB 9060 → Onitsuka Tiger = fluxo mais forte (25 clientes)
- 378 clientes NB 9060 sem recompra = segmento prioritário Klaviyo

### Timezone Bug (19/04/2026)
- `CURRENT_DATE` no Postgres = UTC. Scripts comparavam `order_created_at >= CURRENT_DATE` achando que era BRT.
- Depois das 12h BRT (15h UTC), `CURRENT_DATE` já era "amanhã" no Brasil.
- **Fix**: `WHERE (order_created_at AT TIME ZONE 'America/Sao_Paulo') >= CURRENT_DATE`
- Aplicado em: `lk_anomaly_check.py`, `lk_anomaly_deepdive.py`, `lk_morning_briefing.py`

### Shopify Pagination Bug (19/04/2026)
- `page_info` cursor quebrava quando checkpoint ficava muito antigo.
- **Fix**: detect error + fallback pra timestamp quando `page_info` falha.

### Transactions Full Sync (19/04/2026)
- Script `lk_transactions_full_sync.py` estava no archive (não no lugar certo).
- Recriado e adicionado ao `lk_full_sync.py` como 6ª fonte.

---

## 📱 Integrações

### Evolution API / WhatsApp
- Links no caption de imagem NÃO são clicáveis
- **Solução:** enviar URL como mensagem de texto separada após a mídia (1s delay)
- Sempre usar `limit: 20-30` max, nunca 100+ (timeout em 562 conversas)

---

## 🗂️ 2026-04-19 afternoon — Correção Sistêmica do Brain

### O que fizemos
- Auditoria completa: 26 crons, 15+ scripts, 3 fontes de dados
- Encontrado: Meta token quebrado há 38 dias, transactions_full faltando, timezone bugs, cron duplicatas Monday 9h
- Corrigido sozinho: Shopify pagination, timezone (2 scripts), NameError import, transactions_full_sync
- `brain_sync.sh` criado — sync bidirecional local↔VPS ✅ testado
- Lições unificadas num arquivo só

### Lição aprendida
1. **"Você quer que eu corrija?"** → eu deveria ter corrigido antes de perguntar
2. Dual location: editar em `/root/.hermes/scripts/` → SEMPRE copiar pro `/tmp/`
3. Brain 3 fontes: nunca estão 100% sincronizadas — preciso rodar sync após cada sessão
4. **"100% auditado"** ≠ "100% funcionando" — crons nunca executados, Meta token quebrado

### Bugs Corrigidos (19/04)
1. Shopify pagination — page_info fallback ✅
2. Timezone anomaly_deepdive + anomaly_check — 16x CURRENT_DATE ✅
3. lk_morning_briefing — NameError (datetime/timezone import) ✅
4. transactions_full_sync — script recriado + full_sync atualizado ✅
5. Cron Monday 9h — 3 duplicatas → 1 (pausados 2) ✅

---

## 🗂️ 2026-04-19 evening — Brain Protocols Completos

### O que fizemos
- **Session End Protocol** criado como skill separado (`session-end-protocol`)
- **Consolidation Weekly output** agora salva em `memories/consolidation_weekly/{date}.md`
- **Decisions.md** atualizado com decisões da reorg 19/04 (7 novas decisões)
- **Cron Brain Sync Night** criado — roda 22h BRT diário
- **Pending.md** atualizado com todas as ações

### Lição aprendida
1. Session-start e session-end são dois lados — um não funciona sem o outro
2. Consolidation output sem salvar = resultado se perde. Agora permanente.
3. Decisions.md precisa de "decisões de sessão" além de "decisões estratégicas"

### Brain atualizado
- `/root/.hermes/CURRENT_WORK.md` — COMPLETO ✅
- `/root/.hermes/pending.md` — atualizado
- `/root/hermes-brain/memories/decisions.md` — decisões reorg 19/04
- `/root/hermes/skills/protocol/session-end-protocol/SKILL.md` — criado
- `/root/.hermes/scripts/hermes_consolidation_weekly.py` — output now saves to brain
