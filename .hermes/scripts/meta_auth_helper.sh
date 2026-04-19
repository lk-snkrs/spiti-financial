#!/bin/bash
# Meta Ads Auth Helper
# Prepara tudo para Lucas só precisar colar o novo token
# NÃO faz a autenticação - apenas guia o processo

ACCOUNT_ID="act_10153947479906477"
DOPPLER_PROJECT="lc-keys"
DOPPLER_CONFIG="prd"

echo "=========================================="
echo "  META ADS AUTH HELPER"
echo "  LK Sneakers - Meta Advertising"
echo "=========================================="
echo

# Step 1: Show current status
echo "📍 PASSO 1: Status Atual do Token"
echo "-----------------------------------"
/root/.hermes/scripts/meta_token_test.sh
echo

# Step 2: Instructions for Lucas
echo "📍 PASSO 2: Como Obter Novo Token"
echo "-----------------------------------"
echo "O token atual está inválido (OAuth 190)."
echo "Você precisa gerar um novo token no Meta Business."
echo
echo "OPÇÃO 1 - Business.facebook.com (Recomendado):"
echo "  1. Acesse: https://business.facebook.com"
echo "  2. Vá em: Settings → Users → System Users"
echo "  3. Ou: https://business.facebook.com/settings/system-users"
echo "  4. Crie/gere um token com permissões: ads_read, ads_management"
echo
echo "OPÇÃO 2 - Developers Console:"
echo "  1. Acesse: https://developers.facebook.com/tools/debug/accesstoken/"
echo "  2. Cole o token atual para ver detalhes"
echo "  3. Se expirado, gere novo pelo Business Dashboard"
echo
echo "⚠️ IMPORTANTE:"
echo "  - O token precisa ser do tipo 'System User' ou 'Admin'"
echo "  - Permissões necessárias: ads_read, ads_management"
echo "  - Não use token de usuário pessoal (expira rápido)"
echo

# Step 3: Command to update token
echo "📍 PASSO 3: Como Atualizar o Token"
echo "-----------------------------------"
echo "Após obter o novo token, execute:"
echo
echo "  # Opção A: Via Doppler (recomendado para produção)"
echo "  doppler secrets set META_ACCESS_TOKEN=\"SEU_NOVO_TOKEN\" -p lc-keys -c prd"
echo
echo "  # Opção B: Via env (temporário, para testes)"
echo "  export META_ACCESS_TOKEN=\"SEU_NOVO_TOKEN\""
echo
echo "  # Opção C: Editar diretamente o .env"
echo "  nano /root/.hermes/.env"
echo

# Step 4: How to test after update
echo "📍 PASSO 4: Testar o Novo Token"
echo "-----------------------------------"
echo "Após atualizar, teste com:"
echo
echo "  # Opção A: Script de teste"
echo "  /root/.hermes/scripts/meta_token_test.sh"
echo
echo "  # Opção B: Teste direto com curl"
echo "  TOKEN=\"SEU_NOVO_TOKEN\""
echo "  curl -s \"https://graph.facebook.com/v19.0/${ACCOUNT_ID}?access_token=\$TOKEN\""
echo

# Step 5: Links importantes
echo "📍 LINKS ÚTEIS"
echo "-----------------------------------"
echo "  Debug Token: https://developers.facebook.com/tools/debug/accesstoken/"
echo "  Business Settings: https://business.facebook.com/settings"
echo "  Meta Graph API: https://developers.facebook.com/docs/graph-api"
echo "  Doppler Secrets: https://dashboard.doppler.com/workplace/lc-keys/secrets"
echo

echo "=========================================="
echo "  RESUMO PARA COPIAR"
echo "=========================================="
echo
echo "1. Obtenha o novo token no Meta Business"
echo "2. Execute:"
echo "   doppler secrets set META_ACCESS_TOKEN=\"COLE_AQUI\" -p lc-keys -c prd"
echo "3. Teste:"
echo "   /root/.hermes/scripts/meta_token_test.sh"
echo
echo "Pronto! 🚀"
