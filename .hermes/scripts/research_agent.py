#!/usr/bin/env python3
"""
Research Agent - Deep-Dive Web Research Tool
Performs comprehensive topic investigation using Wikipedia API and web extraction.
"""

import sys
import json
import subprocess
import re
from urllib.parse import quote


def search_wikipedia(query, num_results=5):
    """Search Wikipedia using their API."""
    try:
        # Try the query as-is first
        encoded_query = quote(query)
        url = f"https://en.wikipedia.org/w/api.php?action=opensearch&search={encoded_query}&limit={num_results}&namespace=0&format=json"
        
        result = subprocess.run(
            ['curl', '-s', '-L', '--max-time', '30', url],
            capture_output=True,
            text=True,
            timeout=35
        )
        
        data = json.loads(result.stdout)
        
        results = []
        if len(data) >= 2:
            titles = data[1]
            urls = data[3]
            for i, title in enumerate(titles):
                if i < len(urls):
                    results.append({
                        'title': title,
                        'url': urls[i]
                    })
        
        # If no results, try extracting the main topic from the query
        if not results:
            # Try the first significant word/phrase
            words = query.split()
            for try_query in [' '.join(words[:2]), words[0]]:
                encoded = quote(try_query)
                url = f"https://en.wikipedia.org/w/api.php?action=opensearch&search={encoded}&limit={num_results}&namespace=0&format=json"
                result = subprocess.run(['curl', '-s', url], capture_output=True, text=True, timeout=30)
                data = json.loads(result.stdout)
                if len(data) >= 2 and len(data[1]) > 0:
                    titles = data[1]
                    urls = data[3]
                    for i, title in enumerate(titles):
                        if i < len(urls):
                            results.append({
                                'title': title,
                                'url': urls[i]
                            })
                    break
        
        return results
    except Exception as e:
        print(f"Wikipedia search error: {e}", file=sys.stderr)
        return []


def get_wikipedia_content(title):
    """Get Wikipedia article content."""
    try:
        encoded_title = quote(title)
        url = f"https://en.wikipedia.org/w/api.php?action=query&titles={encoded_title}&prop=extracts&exintro=1&explaintext=1&format=json"
        
        result = subprocess.run(
            ['curl', '-s', '-L', '--max-time', '30', url],
            capture_output=True,
            text=True,
            timeout=35
        )
        
        data = json.loads(result.stdout)
        pages = data.get('query', {}).get('pages', {})
        for page_id, page_data in pages.items():
            if page_id != '-1':
                return page_data.get('extract', '')
        return ''
    except Exception as e:
        print(f"Wikipedia content error: {e}", file=sys.stderr)
        return ''


def extract_web_content(url):
    """Extract content from a URL using curl."""
    try:
        result = subprocess.run(
            ['curl', '-s', '-L', '--max-time', '20', '-A', 
             'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36', url],
            capture_output=True,
            text=True,
            timeout=25
        )
        
        html = result.stdout
        
        # Remove scripts, styles, navigation, etc
        html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL)
        html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL)
        html = re.sub(r'<nav[^>]*>.*?</nav>', '', html, flags=re.DOTALL)
        html = re.sub(r'<footer[^>]*>.*?</footer>', '', html, flags=re.DOTALL)
        html = re.sub(r'<header[^>]*>.*?</header>', '', html, flags=re.DOTALL)
        
        # Convert to text
        text = re.sub(r'<[^>]+>', ' ', html)
        text = re.sub(r'\s+', ' ', text)
        text = text.strip()
        
        # Clean entities
        text = re.sub(r'&nbsp;', ' ', text)
        text = re.sub(r'&amp;', '&', text)
        text = re.sub(r'&lt;', '<', text)
        text = re.sub(r'&gt;', '>', text)
        text = re.sub(r'&quot;', '"', text)
        
        if len(text) > 2500:
            text = text[:2500] + "..."
        
        return text
    except Exception as e:
        return f"Error: {e}"


def research(query, max_sources=5):
    """
    Main research function.
    Performs deep-dive research using Wikipedia and web sources.
    """
    print(f"\n{'='*60}")
    print(f"RESEARCH AGENT - Deep Dive Research")
    print(f"{'='*60}")
    print(f"Query: {query}")
    print(f"{'='*60}\n")
    
    # Step 1: Search Wikipedia
    print("[1/4] Searching Wikipedia...")
    results = search_wikipedia(query, num_results=max_sources)
    print(f"    Found {len(results)} Wikipedia sources")
    
    if not results:
        print("\nNo Wikipedia results found for this query.")
        return None
    
    # Step 2: Extract content
    print("[2/4] Extracting content from sources...")
    
    all_content = []
    for r in results[:max_sources]:
        if 'wikipedia.org' in r['url']:
            content = get_wikipedia_content(r['title'])
        else:
            content = extract_web_content(r['url'])
        all_content.append(content)
    
    print(f"    Extracted from {len(all_content)} sources")
    
    # Step 3: Generate report
    print("[3/4] Preparing research report...\n")
    
    print(f"{'='*60}")
    print("RESEARCH REPORT")
    print(f"{'='*60}\n")
    
    print(f"## Topic: {query}\n")
    print(f"**Sources Analyzed:** {len(results[:max_sources])}\n")
    
    print("---")
    print("## Key Findings\n")
    
    for i, content in enumerate(all_content):
        if i < len(results):
            r = results[i]
            print(f"### {r['title']}")
            print(f"**URL:** {r['url']}")
            print()
            
            if content:
                lines = content.strip().split(' ')
                formatted_lines = []
                current = []
                for word in lines:
                    current.append(word)
                    if len(current) >= 10:
                        formatted_lines.append(' '.join(current))
                        current = []
                if current:
                    formatted_lines.append(' '.join(current))
                
                for line in formatted_lines[:15]:
                    if line.strip():
                        print(f"  {line.strip()}")
                
                if len(formatted_lines) > 15:
                    print(f"  ... (truncated, {len(formatted_lines)-15} more lines)")
            else:
                print("  No content available")
            
            print("\n---\n")
    
    # Source summary
    print("## Source Summary\n")
    for i, r in enumerate(results[:max_sources]):
        print(f"{i+1}. **{r['title']}**")
        print(f"   {r['url']}")
        print()
    
    print(f"{'='*60}")
    print("Research complete.")
    print(f"{'='*60}\n")
    
    return {
        'query': query,
        'sources': results[:max_sources],
        'content': all_content
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 research_agent.py <your research query>")
        print("Example: python3 research_agent.py 'quantum computing developments 2024'")
        sys.exit(1)
    
    query = ' '.join(sys.argv[1:])
    research(query)


if __name__ == "__main__":
    main()
