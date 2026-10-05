import os
import subprocess
import markdown

CHROME_PATHS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]

def get_browser_exe():
    for p in CHROME_PATHS:
        if os.path.exists(p):
            return p
    raise RuntimeError("No Chrome or Edge executable found.")

def md_to_html_ideas(md_text):
    html_content = markdown.markdown(md_text, extensions=['tables', 'fenced_code'])
    css = """
    @page {
        size: A4 landscape;
        margin: 15mm;
        @bottom-right {
            content: counter(page);
        }
    }
    *, *::before, *::after {
        box-sizing: border-box;
    }
    body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: #1e293b;
        background: #ffffff;
        margin: 0;
        padding: 10px;
        font-size: 13px;
        line-height: 1.5;
    }
    .header {
        margin-bottom: 24px;
        padding-bottom: 14px;
        border-bottom: 2px solid #e2e8f0;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
    }
    h1 {
        color: #0f172a;
        font-size: 24px;
        font-weight: 700;
        margin: 0 0 6px 0;
        letter-spacing: -0.02em;
    }
    .subtitle {
        color: #64748b;
        font-size: 12px;
        margin: 0;
    }
    .badge-registry {
        background: #0284c7;
        color: white;
        padding: 4px 10px;
        border-radius: 9999px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }
    table {
        width: 100%;
        border-collapse: collapse;
        border-spacing: 0;
        margin-top: 10px;
        font-size: 11.5px;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        overflow: hidden;
    }
    th {
        background-color: #0f172a;
        color: #f8fafc;
        text-align: left;
        padding: 10px 12px;
        font-weight: 600;
        font-size: 11px;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        border: 1px solid #1e293b;
    }
    td {
        padding: 10px 12px;
        border: 1px solid #e2e8f0;
        vertical-align: middle;
    }
    tr:nth-child(even) {
        background-color: #f8fafc;
    }
    tr:hover {
        background-color: #f1f5f9;
    }
    code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        background-color: #f1f5f9;
        color: #0f172a;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 11px;
        border: 1px solid #e2e8f0;
        font-weight: 600;
    }
    .status-paper {
        background: #dcfce7;
        color: #15803d;
        border: 1px solid #bbf7d0;
        padding: 2px 8px;
        border-radius: 9999px;
        font-weight: 600;
        display: inline-block;
    }
    .status-audit {
        background: #fef3c7;
        color: #b45309;
        border: 1px solid #fde68a;
        padding: 2px 8px;
        border-radius: 9999px;
        font-weight: 600;
        display: inline-block;
    }
    .priority-1 {
        color: #0369a1;
        font-weight: 700;
    }
    .footer {
        margin-top: 30px;
        padding-top: 10px;
        border-top: 1px solid #e2e8f0;
        font-size: 10px;
        color: #94a3b8;
        display: flex;
        justify-content: space-between;
    }
    """
    
    # Post-process table badges
    processed_html = html_content
    processed_html = processed_html.replace("<code>paper</code>", "<span class='status-paper'>paper</span>")
    processed_html = processed_html.replace("<code>audit</code>", "<span class='status-audit'>audit</span>")
    
    full_html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Strategy Ideas Backlog Registry</title>
<style>{css}</style>
</head>
<body>
    <div class="header">
        <div>
            <h1>Strategy Ideas Backlog Registry</h1>
            <p class="subtitle">Quantitative Arbitrage & Yield Capture Engine • Active Backlog</p>
        </div>
        <div>
            <span class="badge-registry">M5 Pipeline Active</span>
        </div>
    </div>
    
    {processed_html.replace('<h1>Strategy Ideas Backlog Registry</h1>', '')}
    
    <div class="footer">
        <span>Funding Rate Bot Documentation</span>
        <span>Generated: 2026-08-28</span>
    </div>
</body>
</html>
"""
    return full_html

def md_to_html_changelog(md_text):
    html_content = markdown.markdown(md_text, extensions=['fenced_code'])
    css = """
    @page {
        size: A4 portrait;
        margin: 14mm 16mm 14mm 16mm;
        @bottom-right {
            content: counter(page);
        }
    }
    *, *::before, *::after {
        box-sizing: border-box;
    }
    body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: #1e293b;
        background: #ffffff;
        margin: 0;
        padding: 0;
        font-size: 12px;
        line-height: 1.45;
    }
    .header-banner {
        border-bottom: 2px solid #0f172a;
        padding-bottom: 10px;
        margin-bottom: 14px;
    }
    h1 {
        color: #0f172a;
        font-size: 20px;
        font-weight: 700;
        margin: 0 0 4px 0;
        letter-spacing: -0.02em;
    }
    .intro-desc {
        color: #475569;
        font-size: 12px;
        margin: 0;
        line-height: 1.4;
    }
    .entry-card {
        margin-bottom: 12px;
        page-break-inside: avoid;
    }
    h2 {
        color: #0f172a;
        font-size: 13px;
        font-weight: 700;
        margin: 12px 0 6px 0;
        padding: 6px 10px;
        background: #f1f5f9;
        border-left: 4px solid #0284c7;
        border-radius: 0 4px 4px 0;
        page-break-after: avoid;
    }
    hr {
        display: none;
    }
    ul {
        margin: 4px 0 10px 0;
        padding-left: 18px;
    }
    li {
        margin-bottom: 4px;
        color: #334155;
    }
    li strong {
        color: #0f172a;
    }
    code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        background-color: #f1f5f9;
        color: #0369a1;
        padding: 1px 5px;
        border-radius: 3px;
        font-size: 11px;
        border: 1px solid #e2e8f0;
        font-weight: 600;
    }
    .footer {
        margin-top: 16px;
        padding-top: 8px;
        border-top: 1px solid #e2e8f0;
        font-size: 10px;
        color: #94a3b8;
        display: flex;
        justify-content: space-between;
    }
    """
    
    full_html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Swarm Plan Changelog</title>
<style>{css}</style>
</head>
<body>
    <div class="header-banner">
        <h1>Swarm Plan Changelog (Append-Only)</h1>
        <p class="intro-desc">This document tracks all formal modifications to the research plan, backlog prioritization, timebox estimates, and data source allocations.</p>
    </div>
    
    {html_content.replace('<h1>Swarm Plan Changelog (Append-Only)</h1>', '').replace('<p>This document tracks all formal modifications to the research plan, backlog prioritization, timebox estimates, and data source allocations.</p>', '')}
    
    <div class="footer">
        <span>Funding Rate Bot Architecture & Planning</span>
        <span>Append-Only Ledger</span>
    </div>
</body>
</html>
"""
    return full_html

def md_to_html_concepts(md_text):
    html_content = markdown.markdown(md_text, extensions=['fenced_code'])
    css = """
    @page {
        size: A4 portrait;
        margin: 16mm 18mm 16mm 18mm;
        @bottom-right {
            content: counter(page);
        }
    }
    *, *::before, *::after {
        box-sizing: border-box;
    }
    body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: #1e293b;
        background: #ffffff;
        margin: 0;
        padding: 0;
        font-size: 12.5px;
        line-height: 1.5;
    }
    .header-banner {
        border-bottom: 2px solid #0f172a;
        padding-bottom: 12px;
        margin-bottom: 16px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
    }
    h1 {
        color: #0f172a;
        font-size: 18px;
        font-weight: 700;
        margin: 0;
        letter-spacing: -0.01em;
    }
    .badge-phase {
        background: #0284c7;
        color: #ffffff;
        font-size: 10px;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 4px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        white-space: nowrap;
    }
    h2 {
        color: #0f172a;
        font-size: 13.5px;
        font-weight: 700;
        margin: 16px 0 8px 0;
        padding: 6px 10px;
        background: #f8fafc;
        border-left: 4px solid #0284c7;
        border-radius: 0 4px 4px 0;
    }
    pre {
        background-color: #0f172a;
        color: #38bdf8;
        padding: 12px 14px;
        border-radius: 6px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 12px;
        overflow-x: auto;
        margin: 8px 0 12px 0;
        border: 1px solid #1e293b;
    }
    pre code {
        background: transparent;
        color: inherit;
        padding: 0;
        border: none;
    }
    p {
        margin: 6px 0 10px 0;
    }
    .formula-box {
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        border-left: 4px solid #6366f1;
        padding: 10px 14px;
        border-radius: 4px;
        font-family: ui-monospace, monospace;
        font-size: 12px;
        color: #1e1b4b;
        font-weight: 600;
        margin: 8px 0 12px 0;
    }
    ul {
        margin: 6px 0 12px 0;
        padding-left: 20px;
    }
    li {
        margin-bottom: 6px;
        color: #334155;
    }
    li strong {
        color: #0f172a;
    }
    code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        background-color: #f1f5f9;
        color: #0369a1;
        padding: 2px 5px;
        border-radius: 3px;
        font-size: 11.5px;
        border: 1px solid #e2e8f0;
        font-weight: 600;
    }
    .signoff-box {
        background: #f0fdf4;
        border: 1px solid #bbf7d0;
        border-radius: 6px;
        padding: 8px 12px;
        margin-top: 12px;
    }
    .footer {
        margin-top: 24px;
        padding-top: 8px;
        border-top: 1px solid #e2e8f0;
        font-size: 10px;
        color: #94a3b8;
        display: flex;
        justify-content: space-between;
    }
    """
    
    # Process formula block if paragraph
    processed = html_content
    # Wrap math proof line
    processed = processed.replace(
        "<p>N_L = Q_L * P_L = N_H = Q_H * P_H = target_notional / 2 =&gt; Net Delta = N_L - N_H = 0.0</p>",
        "<div class='formula-box'>N_L = Q_L · P_L = N_H = Q_H · P_H = target_notional / 2 &nbsp;⟹&nbsp; <strong>Net Delta = N_L − N_H = 0.0</strong></div>"
    )
    
    full_html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>PHASE A: CONCEPT FORMALIZATION</title>
<style>{css}</style>
</head>
<body>
    <div class="header-banner">
        <div>
            <h1>PHASE A: CONCEPT FORMALIZATION</h1>
            <p style="color: #64748b; font-size: 12px; margin: 4px 0 0 0;">Strategy Specification • <code>idea-03-cross-exchange-funding</code></p>
        </div>
        <div>
            <span class="badge-phase">Phase A Complete</span>
        </div>
    </div>
    
    {processed.replace('<h1>PHASE A: CONCEPT FORMALIZATION — idea-03-cross-exchange-funding</h1>', '')}
    
    <div class="footer">
        <span>Funding Rate Bot • Strategy Ideas Backlog</span>
        <span>Cryptographic Audit Proof Signed</span>
    </div>
</body>
</html>
"""
    return full_html

def convert_to_pdf(html_path, pdf_path):
    browser_exe = get_browser_exe()
    html_url = "file:///" + os.path.abspath(html_path).replace("\\", "/")
    cmd = [
        browser_exe,
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={os.path.abspath(pdf_path)}",
        html_url
    ]
    print(f"Running: {' '.join(cmd)}")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print("Error converting:", res.stderr)
    else:
        print(f"Successfully created: {pdf_path} (Size: {os.path.getsize(pdf_path)} bytes)")

def main():
    import sys
    base_dir = r"c:\Users\Asus\Downloads\prj\funding-rate-bot\docs"
    
    # 1. IDEAS.md
    ideas_md_path = os.path.join(base_dir, "IDEAS.md")
    ideas_html_path = os.path.join(base_dir, "IDEAS.html")
    ideas_pdf_path = os.path.join(base_dir, "IDEAS.pdf")
    
    with open(ideas_md_path, "r", encoding="utf-8") as f:
        ideas_md = f.read()
    ideas_html = md_to_html_ideas(ideas_md)
    with open(ideas_html_path, "w", encoding="utf-8") as f:
        f.write(ideas_html)
    convert_to_pdf(ideas_html_path, ideas_pdf_path)
    
    # 2. PLAN_CHANGELOG.md
    changelog_md_path = os.path.join(base_dir, "PLAN_CHANGELOG.md")
    changelog_html_path = os.path.join(base_dir, "PLAN_CHANGELOG.html")
    changelog_pdf_path = os.path.join(base_dir, "PLAN_CHANGELOG.pdf")
    
    with open(changelog_md_path, "r", encoding="utf-8") as f:
        changelog_md = f.read()
    changelog_html = md_to_html_changelog(changelog_md)
    with open(changelog_html_path, "w", encoding="utf-8") as f:
        f.write(changelog_html)
    convert_to_pdf(changelog_html_path, changelog_pdf_path)

    # 3. idea-03-cross-exchange-funding/CONCEPTS.md
    concepts_dir = os.path.join(base_dir, "ideas", "idea-03-cross-exchange-funding")
    concepts_md_path = os.path.join(concepts_dir, "CONCEPTS.md")
    concepts_html_path = os.path.join(concepts_dir, "CONCEPTS.html")
    concepts_pdf_path = os.path.join(concepts_dir, "CONCEPTS.pdf")
    
    if os.path.exists(concepts_md_path):
        with open(concepts_md_path, "r", encoding="utf-8") as f:
            concepts_md = f.read()
        concepts_html = md_to_html_concepts(concepts_md)
        with open(concepts_html_path, "w", encoding="utf-8") as f:
            f.write(concepts_html)
        convert_to_pdf(concepts_html_path, concepts_pdf_path)

if __name__ == "__main__":
    main()
