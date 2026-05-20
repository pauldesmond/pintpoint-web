#!/usr/bin/env python3
"""
Generate the printable Beerology scoring-card PDF.

Run: /opt/homebrew/bin/python3 blog/drafts/_generate-scoring-card.py
Output: blog/drafts/beerology-scoring-card.pdf

Requires:
  - WeasyPrint native libs: brew install pango (pulls in cairo, glib, etc.)
  - WeasyPrint package itself: /opt/homebrew/bin/python3 -m pip install --user
    --break-system-packages weasyprint
  - Must use Homebrew's python (not /usr/bin/python3) because the system
    python scrubs DYLD_* env vars before loading C extensions, so it can't
    find brew's libgobject/libpango/libcairo dylibs.
"""
import os
from weasyprint import HTML

OUTPUT = os.path.join(os.path.dirname(__file__), 'beerology-scoring-card.pdf')

html_content = """
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Beerology — Scoring Card</title>
<style>
    *, *::before, *::after { box-sizing: border-box; }
    @page {
        size: A4;
        margin: 15mm 18mm;
        background-color: #ffffff;
        @bottom-left {
            content: "PintPoint Web • Blog Drafts Suite";
            font-family: 'Georgia', serif;
            font-size: 7.5pt;
            color: #777777;
        }
        @bottom-right {
            content: "beerology-scoring-card.md";
            font-family: 'Courier New', monospace;
            font-size: 7.5pt;
            color: #777777;
        }
    }
    body {
        margin: 0;
        padding: 0;
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        color: #111111;
        font-size: 10pt;
        line-height: 1.4;
    }

    .header-area {
        margin-bottom: 20px;
        border-bottom: 3px solid #111111;
        padding-bottom: 6px;
    }
    .title {
        font-family: 'Georgia', serif;
        font-size: 24pt;
        font-weight: normal;
        margin: 0;
        color: #000000;
    }

    .meta-grid {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 25px;
    }
    .meta-grid td {
        padding: 6px 0;
        vertical-align: middle;
        font-size: 10.5pt;
    }
    .label {
        font-weight: bold;
        width: 120px;
        color: #222222;
    }
    .fill-line {
        border-bottom: 1px solid #888888;
    }

    .instruction-callout {
        font-family: 'Georgia', serif;
        font-style: italic;
        font-size: 10.5pt;
        color: #444444;
        margin-bottom: 15px;
        background-color: #f9f9f9;
        padding: 10px 12px;
        border-left: 3px solid #111111;
    }

    .axis-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 25px;
    }
    .axis-table th {
        font-size: 9pt;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        padding: 8px;
        background-color: #111111;
        color: #ffffff;
        border: 1px solid #111111;
    }
    .axis-table td {
        border: 1px solid #dddddd;
        padding: 10px 8px;
        vertical-align: middle;
    }
    .axis-name {
        font-weight: bold;
        font-size: 11pt;
        background-color: #fcfcfc;
        width: 15%;
        border-right: 2px solid #111111 !important;
    }
    .anchor-col {
        width: 32%;
        font-size: 8.5pt;
        color: #333333;
        line-height: 1.2;
    }
    .scale-col {
        text-align: center;
        width: 21%;
        white-space: nowrap;
    }

    .box-row {
        display: inline-block;
        margin: 0 auto;
    }
    .score-box {
        display: inline-block;
        width: 12px;
        height: 12px;
        border: 1px solid #222222;
        margin: 0 2px;
        vertical-align: middle;
    }
    .scale-label {
        font-size: 7pt;
        color: #777777;
        display: block;
        margin-top: 3px;
    }

    .section-header {
        font-family: 'Georgia', serif;
        font-size: 13pt;
        font-weight: bold;
        border-bottom: 1px solid #111111;
        padding-bottom: 3px;
        margin-top: 20px;
        margin-bottom: 10px;
    }

    .cues-container {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        margin-bottom: 15px;
    }
    .cue-item {
        font-size: 9pt;
        color: #222222;
        white-space: nowrap;
    }
    .cue-check {
        display: inline-block;
        width: 10px;
        height: 10px;
        border: 1px solid #444444;
        margin-right: 6px;
        vertical-align: middle;
    }

    .essay-space {
        margin-top: 5px;
        border-bottom: 1px dashed #999999;
        height: 35px;
    }
    .essay-sub {
        font-size: 8.5pt;
        font-style: italic;
        color: #666666;
        margin-top: 2px;
    }
</style>
</head>
<body>

    <div class="header-area">
        <h1 class="title">Beerology — Scoring Card</h1>
    </div>

    <!-- Metadata Section -->
    <table class="meta-grid">
        <tr>
            <td class="label">Beer:</td>
            <td class="fill-line" style="width: 40%;"></td>
            <td class="label" style="padding-left: 20px; width: 80px;">ABV:</td>
            <td class="fill-line" style="width: 30%;"></td>
        </tr>
        <tr>
            <td class="label">Brewery:</td>
            <td class="fill-line"></td>
            <td class="label" style="padding-left: 20px;">Style (declared):</td>
            <td class="fill-line"></td>
        </tr>
        <tr>
            <td class="label">Where / when:</td>
            <td class="fill-line" colspan="3"></td>
        </tr>
    </table>

    <div class="instruction-callout">
        The eight axes (1–10)<br>
        <span style="font-size: 9pt; font-style: normal; color: #555555;">Score the beer's experience, not the brewery's marketing. Anchors are calibration points.</span>
    </div>

    <!-- The 8 Axes Matrix -->
    <table class="axis-table">
        <thead>
            <tr>
                <th style="width:15%;">Axis</th>
                <th style="width:30%;">1 Anchor</th>
                <th style="width:25%; text-align:center;">Scale (1 — 10)</th>
                <th style="width:30%;">10 Anchor</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td class="axis-name">Body</td>
                <td class="anchor-col">Water-thin</td>
                <td class="scale-col">
                    <div class="box-row">
                        <div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div>
                    </div>
                    <span class="scale-label">← light | heavy →</span>
                </td>
                <td class="anchor-col">Barleywine / imperial stout heft</td>
            </tr>
            <tr>
                <td class="axis-name">Bitterness</td>
                <td class="anchor-col">Barely there</td>
                <td class="scale-col">
                    <div class="box-row">
                        <div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div>
                    </div>
                    <span class="scale-label">← low | aggressive →</span>
                </td>
                <td class="anchor-col">West-coast IPA aggressive</td>
            </tr>
            <tr>
                <td class="axis-name">Sweetness</td>
                <td class="anchor-col">Bone-dry</td>
                <td class="scale-col">
                    <div class="box-row">
                        <div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div>
                    </div>
                    <span class="scale-label">← dry | sugary →</span>
                </td>
                <td class="anchor-col">Milkshake IPA / pastry stout</td>
            </tr>
            <tr>
                <td class="axis-name">Roast</td>
                <td class="anchor-col">None</td>
                <td class="scale-col">
                    <div class="box-row">
                        <div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div>
                    </div>
                    <span class="scale-label">← pale | heavy char →</span>
                </td>
                <td class="anchor-col">Imperial stout char / coffee</td>
            </tr>
            <tr>
                <td class="axis-name">Fruit</td>
                <td class="anchor-col">Grain only</td>
                <td class="scale-col">
                    <div class="box-row">
                        <div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div>
                    </div>
                    <span class="scale-label">← clean | expressive →</span>
                </td>
                <td class="anchor-col">NEIPA / saison / fruited sour</td>
            </tr>
            <tr>
                <td class="axis-name">Finish</td>
                <td class="anchor-col">Drops fast, clean</td>
                <td class="scale-col">
                    <div class="box-row">
                        <div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div>
                    </div>
                    <span class="scale-label">← brief | persistent →</span>
                </td>
                <td class="anchor-col">Lingers for minutes</td>
            </tr>
            <tr>
                <td class="axis-name">Softness</td>
                <td class="anchor-col">Crisp / snappy</td>
                <td class="scale-col">
                    <div class="box-row">
                        <div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div>
                    </div>
                    <span class="scale-label">← sharp | pillowy →</span>
                </td>
                <td class="anchor-col">Pillowy / round</td>
            </tr>
            <tr>
                <td class="axis-name">Complexity</td>
                <td class="anchor-col">One-note macro</td>
                <td class="scale-col">
                    <div class="box-row">
                        <div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div><div class="score-box"></div>
                    </div>
                    <span class="scale-label">← direct | multi-layered →</span>
                </td>
                <td class="anchor-col">Multiple layers (BA / Belgian)</td>
            </tr>
        </tbody>
    </table>

    <!-- Drinker Cues Section -->
    <div class="section-header">Drinker cues — pick 3 or 4</div>
    <div class="cues-container">
        <div class="cue-item"><span class="cue-check"></span>first-pint friendly</div>
        <div class="cue-item"><span class="cue-check"></span>better on the second</div>
        <div class="cue-item"><span class="cue-check"></span>quietly complex</div>
        <div class="cue-item"><span class="cue-check"></span>session-safe</div>
        <div class="cue-item"><span class="cue-check"></span>food-proof</div>
        <div class="cue-item"><span class="cue-check"></span>cask purist territory</div>
        <div class="cue-item"><span class="cue-check"></span>soft landing</div>
        <div class="cue-item"><span class="cue-check"></span>sharp finish</div>
        <div class="cue-item"><span class="cue-check"></span>best sipped slowly</div>
        <div class="cue-item"><span class="cue-check"></span>low-noise pub classic</div>
        <div class="cue-item"><span class="cue-check"></span>fireside</div>
        <div class="cue-item"><span class="cue-check"></span>all-nighter risk</div>
        <div class="cue-item"><span class="cue-check"></span>show-offy</div>
        <div class="cue-item"><span class="cue-check"></span>roast-forward</div>
        <div class="cue-item"><span class="cue-check"></span>contemplative</div>
    </div>

    <!-- Gut Take Section -->
    <div class="section-header">What it feels like</div>
    <div class="essay-space"></div>
    <div class="essay-sub">One sentence, gut take. e.g. "Starts round, finishes firmer than it looks."</div>

    <!-- Final Verdict Section -->
    <div class="section-header">Beerology verdict</div>
    <div class="essay-space"></div>
    <div class="essay-sub">One closing line. e.g. "Built for repeat visits, not big entrances."</div>

</body>
</html>
"""

HTML(string=html_content).write_pdf(OUTPUT)
print(f"Wrote {OUTPUT}")
