#!/usr/bin/env bash
# Data Analysis Agent - Structured Data Investigation Script
# 
# Usage: source scripts/run_data_analysis.sh "<data_path>" "<analysis_type>"
#
# Provides a framework for systematic data analysis following
# the Profile -> Explore -> Visualize -> Synthesize -> Report workflow.

set -e

DATA_PATH="${1:-}"
ANALYSIS_TYPE="${2:-profile}"  # profile, explore, visualize, full
OUTPUT_FORMAT="${3:-summary}"  # summary, json, notebook

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Data Analysis Agent${NC}"
echo -e "${BLUE}  Structured Data Investigation${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Validate data path
if [ -z "$DATA_PATH" ]; then
    echo -e "${YELLOW}No data path provided.${NC}"
    echo "Usage: source scripts/run_data_analysis.sh <data_path> [analysis_type]"
    echo ""
    echo "Analysis types:"
    echo "  profile   - Basic data profiling (default)"
    echo "  explore   - Exploratory analysis with correlations"
    echo "  visualize - Create key visualizations"
    echo "  full      - Complete analysis pipeline"
    echo ""
    ANALYSIS_TYPE="interactive"
else
    echo -e "${GREEN}Data path: ${DATA_PATH}${NC}"
    
    if [ ! -f "$DATA_PATH" ]; then
        echo -e "${RED}File not found: ${DATA_PATH}${NC}"
        exit 1
    fi
    
    # Detect file type
    EXT="${DATA_PATH##*.}"
    echo "Detected type: .${EXT}"
    echo ""
fi

# Phase 1: Profile
phase_profile() {
    echo -e "${YELLOW}[Phase 1] Data Profiling${NC}"
    echo "-------------------------------------------"
    
    case "$EXT" in
        csv)
            echo "Analyzing CSV file..."
            python3 << EOF
import pandas as pd
import sys

try:
    df = pd.read_csv("$DATA_PATH")
    print(f"\nShape: {df.shape[0]} rows x {df.shape[1]} columns")
    print(f"\nColumn types:\n{df.dtypes}")
    missing = df.isnull().sum()
    if missing.sum() > 0:
        print(f"\nMissing values:\n{missing[missing > 0]}")
    else:
        print(f"\nNo missing values found")
    print(f"\nSummary statistics:\n{df.describe()}")
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
EOF
            ;;
        json)
            echo "Analyzing JSON file..."
            python3 << EOF
import json
import pandas as pd

try:
    with open("$DATA_PATH") as f:
        data = json.load(f)
    if isinstance(data, list):
        df = pd.DataFrame(data)
        print(f"\nShape: {df.shape[0]} rows x {df.shape[1]} columns")
        print(f"\nSummary:\n{df.describe()}")
    else:
        print(f"\nJSON structure: {type(data).__name__}")
        print(f"Keys: {list(data.keys()) if isinstance(data, dict) else 'N/A'}")
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
EOF
            ;;
        *)
            echo "Unsupported file type: .$EXT"
            echo "Supported: csv, json, xlsx, parquet"
            ;;
    esac
}

# Phase 2: Explore
phase_explore() {
    echo -e "${YELLOW}[Phase 2] Exploratory Analysis${NC}"
    echo "-------------------------------------------"
    
    python3 << EOF
import pandas as pd

try:
    df = pd.read_csv("$DATA_PATH")
    
    # Numeric correlations
    numeric_df = df.select_dtypes(include=['number'])
    if not numeric_df.empty and len(numeric_df.columns) > 1:
        print("\nCorrelation matrix (numeric columns):")
        corr = numeric_df.corr()
        print(corr.round(2))
    
    # Categorical summaries
    cat_df = df.select_dtypes(include=['object', 'category'])
    if not cat_df.empty:
        print("\n\nCategorical column value counts:")
        for col in cat_df.columns:
            print(f"\n{col}:")
            print(df[col].value_counts().head(10))
    
    # Missing value analysis
    missing = df.isnull().sum()
    if missing.sum() > 0:
        print("\n\nMissing values analysis:")
        missing_pct = (missing / len(df) * 100).round(1)
        print(missing_pct[missing_pct > 0])
    
except Exception as e:
    print(f"Note: {e}")
    print("(Install required packages for full analysis)")
EOF
}

# Phase 3: Visualize
phase_visualize() {
    echo -e "${YELLOW}[Phase 3] Visualization Planning${NC}"
    echo "-------------------------------------------"
    
    echo "Recommended visualizations based on data:"
    echo ""
    echo "  Distribution:    histogram, boxplot (numeric data)"
    echo "  Comparison:      bar chart, grouped bar (categorical)"
    echo "  Relationship:    scatter plot, heatmap (two+ variables)"
    echo "  Trend:           line chart (time series)"
    echo "  Composition:     pie chart, stacked bar (part-to-whole)"
    echo ""
    echo "To generate visualizations, use jupyter-live-kernel with:"
    echo "  import matplotlib.pyplot as plt"
    echo "  import seaborn as sns"
    echo "  # (your visualization code)"
    echo "  plt.savefig('output.png')"
}

# Phase 4: Report
phase_report() {
    echo -e "${YELLOW}[Phase 4] Analysis Summary${NC}"
    echo "-------------------------------------------"
    
    echo "Based on the analysis framework:"
    echo ""
    echo "## Key Findings Template"
    echo ""
    echo "### Finding 1: [Title]"
    echo "**What:** [Description of what was discovered]"
    echo "**Evidence:** [Supporting statistics]"
    echo "**Confidence:** [High/Medium/Low based on sample size]"
    echo ""
    echo "### Finding 2: ..."
    echo ""
    echo "### Recommended Actions"
    echo "1. [Action 1 based on insight]"
    echo "2. [Action 2 based on insight]"
    echo ""
    echo "### Technical Notes"
    echo "- Data source: $DATA_PATH"
    echo "- Analysis type: $ANALYSIS_TYPE"
    echo "- Generated: $(date)"
}

# Main execution based on analysis type
case "$ANALYSIS_TYPE" in
    profile)
        phase_profile
        ;;
    explore)
        phase_profile
        phase_explore
        ;;
    visualize)
        phase_profile
        phase_explore
        phase_visualize
        ;;
    full)
        phase_profile
        phase_explore
        phase_visualize
        phase_report
        ;;
    interactive)
        echo -e "${CYAN}Entering interactive mode...${NC}"
        echo "Available commands: profile, explore, visualize, report, quit"
        ;;
    *)
        echo -e "${RED}Unknown analysis type: ${ANALYSIS_TYPE}${NC}"
        ;;
esac

echo ""
echo -e "${GREEN}Analysis session complete.${NC}"

# Export for hermes context
export DATA_ANALYSIS_COMPLETE="true"
export DATA_ANALYSIS_DATA_PATH="$DATA_PATH"
export DATA_ANALYSIS_TYPE="$ANALYSIS_TYPE"
