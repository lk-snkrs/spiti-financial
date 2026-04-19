#!/usr/bin/env bash
# Debug Agent - Systematic Bug Investigation Script
# 
# Usage: source scripts/run_debug_analysis.sh "<issue description>"
#
# This script provides a structured framework for systematic debugging.
# It guides through the 4-phase debugging process: Reproduce, Isolate,
# Hypothesize, and Fix.

set -e

ISSUE_DESC="${1:-}"
REPRO_SCRIPT="${2:-}"
ERROR_LOG="${3:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Debug Agent - Systematic Investigation${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Phase 1: Triage
echo -e "${YELLOW}[Phase 1] Reproduce & Document${NC}"
echo "-------------------------------------------"
if [ -n "$ISSUE_DESC" ]; then
    echo "Issue Description: $ISSUE_DESC"
else
    echo "No issue description provided"
fi
echo ""

# Check for error logs
if [ -f "$ERROR_LOG" ]; then
    echo -e "${YELLOW}Error Log Contents:${NC}"
    tail -100 "$ERROR_LOG"
    echo ""
fi

# Reproduce the issue if a repro script is provided
if [ -n "$REPRO_SCRIPT" ] && [ -f "$REPRO_SCRIPT" ]; then
    echo -e "${YELLOW}Running reproduction script...${NC}"
    if bash "$REPRO_SCRIPT" 2>&1; then
        echo -e "${RED}! Issue reproduced - script failed as expected${NC}"
    else
        echo -e "${RED}! Issue reproduced - script failed with exit code $?${NC}"
    fi
elif [ -n "$REPRO_SCRIPT" ]; then
    echo -e "${RED}Reproduction script not found: $REPRO_SCRIPT${NC}"
fi
echo ""

# Phase 2: Gather Evidence
echo -e "${YELLOW}[Phase 2] Isolate & Gather Evidence${NC}"
echo "-------------------------------------------"

# System info
echo "System Information:"
echo "  Date: $(date)"
echo "  Working directory: $(pwd)"
echo "  User: $(whoami)"
echo ""

# Recent git changes
if [ -d ".git" ]; then
    echo "Recent commits (last 5):"
    git log --oneline -5 2>/dev/null || echo "  (not a git repo)"
    echo ""
    
    echo "Uncommitted changes:"
    git diff --stat 2>/dev/null || echo "  (none or not a git repo)"
    echo ""
fi

# Phase 3: Analysis
echo -e "${YELLOW}[Phase 3] Analyze & Form Hypothesis${NC}"
echo "-------------------------------------------"
echo "Based on evidence gathered, document your hypothesis:"
echo ""
echo "Hypothesis Template:"
echo "  I believe the root cause is [X] because [Y]."
echo "  Evidence supporting this: [list key evidence]"
echo "  To test: [minimal test case]"
echo ""

# Phase 4: Resolution
echo -e "${YELLOW}[Phase 4] Test Fix & Validate${NC}"
echo "-------------------------------------------"
echo "After implementing fix:"
echo "  1. Create/run regression test"
echo "  2. Run full test suite"
echo "  3. Document the fix"
echo ""

echo -e "${GREEN}Debug session complete.${NC}"
echo "Report format:"
echo "  ## Root Cause: [1-2 sentences]"
echo "  ## Evidence: [bullet points]"
echo "  ## Fix Applied: [what changed]"
echo "  ## Verification: [test results]"

# Export for use in hermes
export DEBUG_AGENT_PHASE="complete"
