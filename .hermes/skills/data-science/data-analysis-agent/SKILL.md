---
name: data-analysis-agent
description: >
  Use when the user asks to analyze data, generate insights, create visualizations,
  build reports, or explore datasets. Provides a structured workflow for data
  investigation using Jupyter notebooks for iterative, stateful analysis.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [data-analysis, analytics, visualization, pandas, jupyter, insights, reporting]
    category: data-science
    related_skills: [jupyter-live-kernel]
---

# Data Analysis Agent

A specialized subagent for systematic data exploration, analysis, and visualization.

## Philosophy

**Start with questions, not assumptions. Let the data guide the insights.**

Good data analysis is iterative, methodical, and reproducible. This agent follows a structured approach to turn raw data into actionable insights.

## When to Activate

This skill activates when you receive:
- "Analyze this dataset"
- "What insights can we get from X?"
- "Create a visualization of Y"
- "Build a report on Z"
- "Explore the relationship between A and B"
- Data analysis tasks involving CSVs, databases, or structured data

## Workflow

### Phase 1: Understand the Data

```python
# First: Load and profile the data
delegate_task(
    goal=f"""Profile the following dataset for analysis:
    
    Dataset: {data_path or description}
    
    Tasks:
    1. Load the data and show basic info (shape, columns, types)
    2. Show summary statistics for numeric columns
    3. Identify missing values and data quality issues
    4. Show first few rows
    
    Report back with a data quality summary.""",
    context="Use Jupyter kernel or terminal with Python/pandas. Use jupyter-live-kernel skill if available.",
    toolsets=['terminal', 'file']
)
```

### Phase 2: Explore & Visualize

**Approach:**
1. Form hypotheses about relationships in the data
2. Create visualizations to test each hypothesis
3. Iterate based on findings

**Key techniques:**
- Distribution analysis (histograms, box plots)
- Correlation analysis (heatmaps, scatter plots)
- Trend analysis (line charts over time)
- Segmentation (groupby analysis)

### Phase 3: Generate Insights

**Structure insights as:**
- **Trend**: What direction is something moving?
- **Comparison**: How do groups differ?
- **Distribution**: How is data spread?
- **Correlation**: What relationships exist?

**For each insight, report:**
1. What we found
2. Supporting evidence (statistics, visualizations)
3. Confidence level (high/medium/low)

### Phase 4: Build Deliverables

- Summary statistics table
- Key visualizations with clear labels
- Written interpretation of findings
- Recommendations (if applicable)

## Data Analysis Framework

```
1. PROFILE   ->  Understand structure, types, quality
2. EXPLORE   ->  Find patterns, relationships, outliers
3. VISUALIZE ->  Create charts that tell the story
4. SYNTHESIZE ->  Distill insights, build narrative
5. REPORT    ->  Format for audience (slides, doc...)
```

## Common Analysis Patterns

| Pattern | Use When | Tools |
|---------|----------|-------|
| **Summary stats** | Initial data profiling | `describe()`, `info()` |
| **Group comparison** | Comparing segments | `groupby()`, `pivot_table()` |
| **Time series** | Trends over time | `resample()`, rolling windows |
| **Correlation** | Relationships between vars | `corr()`, scatter plots |
| **Distribution** | Understanding spread | `hist()`, `boxplot()` |
| **Outlier detection** | Finding anomalies | IQR, z-scores |

## Output Format

```
## Data Analysis Report: [Dataset Name]

### Data Overview
- Shape: X rows x Y columns
- Missing values: Z (W%)
- Date range: [if time series]

### Key Findings

#### Finding 1: [Title]
**What:** [Description]
**Evidence:** [Statistics/chart reference]
**Confidence:** High/Medium/Low

#### Finding 2: [Title]
...

### Visualizations
1. [Chart name] - [what it shows]
2. ...

### Recommendations
[If applicable]

### Technical Details
- Notebook: [path]
- Last run: [timestamp]
```

## Jupyter Integration

For iterative analysis, use the `jupyter-live-kernel` skill:
- State persists across cells
- Inspect variables at any point
- Build up complex analyses incrementally
- Save results to notebook for reproducibility

## Examples

| User Says | Data Analysis Action |
|-----------|-------------------|
| "Analyze sales data" | Profile -> trends -> seasonal patterns -> summary |
| "What's driving churn?" | Correlations -> feature importance -> recommendations |
| "Create a dashboard" | Identify KPIs -> select visualizations -> build layout |
| "Compare A vs B" | Segment analysis -> statistical tests -> comparison chart |
