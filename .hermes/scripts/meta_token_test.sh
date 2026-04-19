#!/bin/bash
# Meta Ads Token Test Script
# Usage: ./meta_token_test.sh [token]
# If no token provided, reads from Doppler

set -e

ACCOUNT_ID="act_10153947479906477"

# Get token from Doppler if not provided
if [ -z "$1" ]; then
    echo "🔍 Fetching token from Doppler..."
    TOKEN=$(doppler secrets get META_ACCESS_TOKEN -p lc-keys -c prd --plain 2>/dev/null)
else
    TOKEN="$1"
fi

if [ -z "$TOKEN" ]; then
    echo "❌ No token provided and couldn't fetch from Doppler"
    exit 1
fi

# Mask token for display
MASKED=$(echo "$TOKEN" | cut -c1-20)"..."
echo "📋 Testing token: ${MASKED}..."
echo

# Test the token
RESPONSE=$(curl -s "https://graph.facebook.com/v19.0/${ACCOUNT_ID}?access_token=${TOKEN}")

# Check for errors
if echo "$RESPONSE" | grep -q '"error"'; then
    ERROR_TYPE=$(echo "$RESPONSE" | grep -o '"code":[0-9]*' | head -1 | cut -d: -f2)
    ERROR_MSG=$(echo "$RESPONSE" | grep -o '"message":"[^"]*"' | head -1)
    ERROR_FBTRACE=$(echo "$RESPONSE" | grep -o '"fbtrace_id":"[^"]*"' | head -1)
    
    echo "❌ TOKEN INVÁLIDO"
    echo "   Error Code: $ERROR_TYPE"
    echo "   Message: $ERROR_MSG"
    echo "   Trace: $ERROR_FBTRACE"
    echo
    
    case "$ERROR_TYPE" in
        190) echo "   → OAuth token expirado ou invalidado" ;;
        102) echo "   → Session token mismatch" ;;
        *)   echo "   → Erro desconhecido" ;;
    esac
    
    exit 1
else
    echo "✅ TOKEN VÁLIDO"
    ACCOUNT_NAME=$(echo "$RESPONSE" | grep -o '"name":"[^"]*"' | head -1)
    echo "   Account: $ACCOUNT_NAME"
    echo "   Account ID: $ACCOUNT_ID"
    exit 0
fi
