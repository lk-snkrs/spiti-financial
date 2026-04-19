# Research Agent Skill

## Purpose
Deep-dive web research agent for comprehensive topic investigation using multi-source search and extraction.

## How It Works
1. Accepts a research query from the user
2. Performs parallel web searches to gather diverse sources
3. Extracts content from top relevant URLs
4. Synthesizes findings into a structured intelligence report

## Usage
```bash
python3 ~/.hermes/scripts/research_agent.py "your research query here"
```

## Output
- Structured research report with:
  - Key findings
  - Source citations with URLs
  - Knowledge gaps/areas needing deeper research
- Displayed in terminal with clear formatting

## Features
- Parallel web search execution
- Content extraction from multiple sources
- Source diversity validation
- Structured markdown output

## Test Query
```bash
python3 ~/.hermes/scripts/research_agent.py "latest developments in quantum computing 2024"
```
