# Decisões Permanentes — Grupo Cimino

## Infraestrutura
| Decisão | Motivo | Data |
|---------|--------|------|
| Doppler = fonte de verdade de credenciais | Centralizado, rotacionável, nunca hardcode | 2026-03-17 |
| Git sempre push após commit | Cerebro só vale se estiver no GitHub | 2026-03-17 |
| Evolution instância `Clo` para envios LK | Separar envio (Clo) de recebimento (SPITI) | 2026-03-24 |
| Supabase: SERVICE_KEY para writes | Segurança — ANON_KEY só para reads públicos | 2026-03-17 |

## Bancos de Dados (definitivo)
| Banco | Project ID | Uso |
|-------|-----------|-----|
| LK Sneakers | `cnjimxglpktznenpbail` | pedidos, clientes, produtos |
| Zipper Vendas | `pcstqxpdzibheuopjkas` | vendas_tango (2.058 registros) |
| SPITI / Zipper CRM | `rmdugdkantdydivgnimb` | spiti_lotes, spiti_contacts, crm_spiti |

## Shopify
| Item | Valor |
|------|-------|
| Store handle | lk-sneakerss.myshopify.com |
| Token Doppler | `SHOPIFY_ACCESS_TOKEN` (não `SHOPIFY_API_TOKEN`) |
| API version | 2024-01 |

## Comunicação
| Decisão | Regra |
|---------|-------|
| Notificação Lucas | → Telegram (171397651) |
| Cross-sell / CRM LK | → Klaviyo (email) + Evolution Clo (WhatsApp) |
| Monitor SPITI | → Evolution Clo → Grupo SPITI.M |
| Comunicação Zipper | → Evolution ZipperGaleria |
| Preview antes de envio em massa | Aprovação obrigatória do Lucas |
| Claw não é a voz do Lucas em grupos | Risco de representação incorreta da marca |

## Autonomia
| Nível | O que faz | O que precisa aprovação |
|-------|-----------|------------------------|
| L2 (Executor) | Executa rotinas, analisa, consulta dados | External actions (emails, posts, WA em massa) |
| External actions | — | SEMPRE aprovação do Lucas |

## Processo de Projetos
| Fase | Regra |
|------|-------|
| Ideia | SUPERPOWER obrigatório antes de qualquer código |
| PRD | Sem PRD aprovado = não começa |
| Fluxo | Ideia → SUPERPOWER → PRD → Implementar → Skill documentada |

## Prioridade de Ferramentas
1. **CLI oficial** — Vercel, Supabase, Shopify, GitHub, Doppler (se instalada)
2. **MCP** — se não tem CLI mas tem MCP configurado
3. **API REST manual** — último recurso (curl/python/fetch)

## Regras de Ouro
- **Dúvida → consulta. Sem consulta → sem resposta sobre dados.**
- Nunca dizer "zerado" ou "sem lance" sem consultar banco primeiro
- Nunca inventar informação sobre estoque, preço ou prazo
- Credenciais: SEMPRE no Doppler, nunca hardcode
- Após deploy: confirmar PID/porta do processo que está rodando

## Decisões Reorg 19/04/2026
| Decisão | Detalhe | Data |
|---------|---------|------|
| Crons duplicados Monday 9h | 3 crons → 1 (hermes_consolidation_weekly.py) | 2026-04-19 |
| Crons pausados | hermes_learning_loop.py + hermes_knowledge_freshness.py (redundantes) | 2026-04-19 |
| 3 briefing crons pausados | lk_briefing_night_fixed + 2 others (Consolidation cobre) | 2026-04-19 |
| Hermes Monthly Review | Nunca rodou — first run 28/04 | 2026-04-19 |
| /tmp scripts com token old | 23 scripts token revogado → novo (sbp_5cd916...) | 2026-04-19 |
| transactions_full sync | Script recriado + adicionado ao full_sync como 6ª fonte | 2026-04-19 |
| Hero crons auditados | 26 crons: 11 ativos, 9 pausados, 3 nunca rodaram | 2026-04-19 |
| spiti_email_poller = LOW PRIORITY | Sem auction até ago 2026 — não priorizar | 2026-04-19 |
| Telegram 401 = false positive | Bot token válido — daily_report precisa investigação | 2026-04-19 |

## Meta Ads - Prioridade Máxima
| Decisão | Detalhe | Data |
|---------|---------|------|
| Meta Ads token INVALID | OAuth session expired desde ~12/03/2026 | 2026-04-19 |
| Ação necessária | Lucas precisa re-autenticar no Business Facebook | 2026-04-19 |
| Scripts preparados | meta_token_test.sh + meta_auth_helper.sh prontos | 2026-04-19 |

## Infraestrutura Sync LK (19/04/2026)
| Decisão | Data |
|---------|------|
| lk_transactions_full_sync.py RECRIADO | 2026-04-19 |
| Script original: token placeholder shpat_...f1ba quebrado | 2026-04-19 |
| Script original: SHOP="lksneakers" (nome errado) | 2026-04-19 |
| Script original: URL com domínio dobrado (lk-sneakerss.myshopify.com.myshopify.com) | 2026-04-19 |
| Transactions sync parou em 12/04 — 7 dias sem sync | 2026-04-19 |
| Token corrigido: lk_transactions_full_sync.py agora usa Doppler | 2026-04-19 |
| Shop corrigido: SHOP="lk-sneakerss" (script concatena .myshopify.com) | 2026-04-19 |
| lk_sort_batch.py token corrigido: shpat_8c163692 inválido → Doppler | 2026-04-19 |
| Health check expandido: shop name + transactions freshness | 2026-04-19 |

## Meta Ads
| Decisão | Data |
|---------|------|
| Meta Ads token INVALID | OAuth session expired desde ~12/03/2026 | 2026-04-19 |
| Ação necessária | Lucas precisa re-autenticar no Business Facebook | 2026-04-19 |
| Scripts preparados | meta_token_test.sh + meta_auth_helper.sh prontos | 2026-04-19 |

## Health Check (19/04/2026)
| Decisão | Data |
|---------|------|
| hermes_health_check.py checava só PAT — NÃO tokens dentro dos scripts | 2026-04-19 |
| Adicionado: check_shopify_shop_name() — detecta domínio dobrado .myshopify.com | 2026-04-19 |
| Adicionado: check_transactions_stale() — alerta se >12h sem transaction nova | 2026-04-19 |
| shop name de Shopify tem 2 padrões: f"https://{SHOP}/..." vs f"https://{SHOP}.myshopify.com/..." | 2026-04-19 |
| Regex de validação precisa entender o padrão de cada script | 2026-04-19 |

## Fonte
Sincronizado do cerebro-cimino (VPS: /root/cerebro-cimino) para hermes-brain (/root/hermes-brain)
