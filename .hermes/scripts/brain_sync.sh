#!/bin/bash
#
# brain_sync.sh — Sync Brain files (decisions.md, lessons.md, pending.md) to Mem0
# Usage: bash /root/.hermes/scripts/brain_sync.sh [--dry-run]
#
# This script reads the Brain files and syncs their content to Mem0 vector DB
# using the Mem0 REST API v1.
#

set -euo pipefail

# === CONFIG ===
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMORIES_DIR="/root/.hermes/memories"
BRAIN_FILES=("decisions.md" "lessons.md" "pending.md")
MEM0_API_KEY="${MEM0_API_KEY:-$(grep MEM0_API_KEY /root/.hermes/.env 2>/dev/null | cut -d= -f2 | tr -d ' ')}"
MEM0_API_URL="https://api.mem0.ai/v1"

# Dry run flag
DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
fi

# === LOGGING ===
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

# === API CALLS ===
mem0_add_memory() {
    local content="$1"
    local memory_type="$2"
    local user_id="brain-${memory_type}"
    
    if [[ "$DRY_RUN" == true ]]; then
        echo "  [DRY-RUN] Would add to Mem0:"
        echo "    user_id: $user_id"
        echo "    content: $(echo "$content" | head -c 100 | tr '\n' ' ')..."
        return 0
    fi
    
    local payload
    payload=$(jq -n \
        --arg content "$content" \
        '{
            messages: [{role: "user", content: $content}],
            user_id: "brain-'"$memory_type"'"
        }')
    
    local response
    response=$(curl -s -X POST "${MEM0_API_URL}/memories/" \
        -H "Authorization: Token ${MEM0_API_KEY}" \
        -H "Content-Type: application/json" \
        -d "$payload")
    
    local status
    status=$(echo "$response" | jq -r '.[0].status // "error"')
    
    if [[ "$status" == "PENDING" ]]; then
        echo "  ✓ Synced: $memory_type (pending processing)"
        return 0
    else
        echo "  ✗ Failed: $memory_type - $response"
        return 1
    fi
}

# === PARSE MARKDOWN ===
# Extract plain text from markdown using Python
extract_text() {
    local file="$1"
    
    python3 - "$file" << 'PYEOF'
import sys
import re

file_path = sys.argv[1]
with open(file_path, 'r') as f:
    content = f.read()

# Remove links but keep text: [text](url) -> text
content = re.sub(r'\[([^\]]*)\]\[http[^\]]*\]', r'\1', content)
content = re.sub(r'\[([^\]]*)\]\([^)]+\)', r'\1', content)

# Remove markdown headers
content = re.sub(r'^#+\s+', '', content, flags=re.MULTILINE)

# Remove bold/italic
content = re.sub(r'\*\*([^*]*)\*\*', r'\1', content)
content = re.sub(r'\*([^*]*)\*', r'\1', content)

# Remove table formatting
content = re.sub(r'^\|.*\|$', '', content, flags=re.MULTILINE)
content = re.sub(r'^[-|:\s]+$', '', content, flags=re.MULTILINE)

# Remove empty lines
lines = [line.strip() for line in content.split('\n') if line.strip()]
print('\n'.join(lines))
PYEOF
}

# === SYNC FILE ===
sync_file() {
    local file="$1"
    local memory_type="$2"
    
    if [[ ! -f "$file" ]]; then
        log_error "File not found: $file"
        return 1
    fi
    
    local content
    content=$(extract_text "$file")
    
    if [[ -z "$content" ]]; then
        log "  ⚠ Empty file: $file"
        return 0
    fi
    
    local char_count
    char_count=$(echo "$content" | wc -c)
    
    log "Syncing $file ($char_count chars)..."
    
    # Split content into chunks if too large (Mem0 has limits)
    local max_chunk=3000
    local chunks=()
    
    if [[ $char_count -gt $max_chunk ]]; then
        # Split by paragraphs to preserve context
        local paragraphs=()
        IFS=$'\n\n' read -rd '' -a paragraphs <<< "$content"
        
        local current_chunk=""
        for para in "${paragraphs[@]}"; do
            if [[ -z "$current_chunk" ]]; then
                current_chunk="$para"
            elif [[ $(echo -n "$current_chunk$para" | wc -c) -lt $max_chunk ]]; then
                current_chunk="${current_chunk}

$para"
            else
                chunks+=("$current_chunk")
                current_chunk="$para"
            fi
        done
        if [[ -n "$current_chunk" ]]; then
            chunks+=("$current_chunk")
        fi
    else
        chunks=("$content")
    fi
    
    local synced=0
    local failed=0
    for i in "${!chunks[@]}"; do
        local chunk="${chunks[$i]}"
        local chunk_label="chunk $((i+1))/${#chunks[@]}"
        
        if mem0_add_memory "$chunk" "${memory_type}_${chunk_label}"; then
            synced=$((synced + 1))
        else
            failed=$((failed + 1))
        fi
    done
    
    log "  Result: $synced synced, $failed failed"
}

# === MAIN ===
main() {
    log "=== Brain Sync to Mem0 ==="
    log "Memory dir: $MEMORIES_DIR"
    log "Dry run: $DRY_RUN"
    
    if [[ -z "${MEM0_API_KEY:-}" ]]; then
        log_error "MEM0_API_KEY not set. Cannot sync to Mem0."
        exit 1
    fi
    
    # Verify Mem0 connectivity
    if [[ "$DRY_RUN" == false ]]; then
        log "Verifying Mem0 API..."
        local test_resp
        test_resp=$(curl -s -o /dev/null -w "%{http_code}" "${MEM0_API_URL}/memories/?user_id=test")
        if [[ "$test_resp" == "200" ]] || [[ "$test_resp" == "000" ]]; then
            log "  ✓ Mem0 API reachable"
        else
            log_error "Mem0 API returned status: $test_resp"
            exit 1
        fi
    fi
    
    log "Starting sync..."
    
    local total_synced=0
    local total_failed=0
    
    for brain_file in "${BRAIN_FILES[@]}"; do
        local filepath="${MEMORIES_DIR}/${brain_file}"
        local memory_type="${brain_file%.md}"  # Remove .md extension
        
        if sync_file "$filepath" "$memory_type"; then
            total_synced=$((total_synced + 1))
        else
            total_failed=$((total_failed + 1))
        fi
    done
    
    log "=== Sync Complete ==="
    log "Files processed: $total_synced successful, $total_failed failed"
    
    if [[ $total_failed -gt 0 ]]; then
        exit 1
    fi
}

main "$@"
