---
name: eval
description: Evaluate a Cascade research or strategy report with multi-dimensional LLM scoring. Produces a quality scorecard.
argument-hint: "[path to report.md] [--compare golden.md]"
allowed-tools: Task, Read, Write, Bash(date *), Bash(pwd), Bash(ls *), Bash(echo *), Bash(wc *)
---

# Cascade Report Eval

You are an evaluation orchestrator. You will score a report across quality dimensions using parallel judge agents, then produce a scorecard. You support two report types (research and strategy) with auto-detection, optional golden reference comparison, and learning capture.

## Phase 1 — Load & Validate

1. Parse `$ARGUMENTS` to extract:
   - **Report path**: the path to a `.md` report file (required)
   - **Compare flag**: if `--compare <golden.md>` is present, extract the golden reference path (optional)

   If no report path provided or the file doesn't exist, print this usage message and stop:

```
Usage: /cse:eval <path-to-report.md> [--compare golden.md]

Evaluates a Cascade research or strategy report across quality dimensions.
Produces a .eval.json scorecard and .eval.md summary alongside the report.

Options:
  --compare <golden.md>   Compare against a golden reference report (optional)

Examples:
  /cse:eval cascade-research-ai-governance-2026-02-28.md
  /cse:eval strategy-jtbd-analysis.md
  /cse:eval report.md --compare golden-reference.md
```

2. Read the report file using the Read tool.
3. **Detect report type** by examining the content:
   - **Strategy report** if the content contains any of these indicators: "Strategic Analysis", "JTBD", "Jobs to Be Done", "Economic Moat", "Blue Ocean", "Scenario Wargaming", "Pricing Strategy", "GTM Wedge", "PESTLE", "Go-to-Market", "Competitive Positioning", "Executive Summary Deck", framework-style headings like "## Strategic Implications" or "## Competitive Landscape"
   - **Research report** otherwise (default)
4. Read the appropriate rubric using the Read tool:
   - Strategy: `${CLAUDE_PLUGIN_ROOT}/skills/eval/strategy-rubric.md`
   - Research: `${CLAUDE_PLUGIN_ROOT}/skills/eval/rubric.md`
5. Run `date -u +%Y-%m-%dT%H:%M:%SZ` to get the current UTC timestamp.
6. Run `pwd` to get the working directory.
7. Extract the report title from the first `# ` heading in the markdown. Extract an approximate source count by counting unique URLs or reference-style citations.

## Phase 1.5 — Golden Reference Analysis (only if --compare flag present)

If a golden reference path was provided:

1. Read the golden reference file using the Read tool.
2. Extract structural metrics from **both** the report and the golden reference:
   - Number of headings (## and ###)
   - Number of sections
   - Approximate word count (run `wc -w` on each file)
   - Number of URLs/citations (source count)
3. Store these metrics for use in Phase 2.5.

If no `--compare` flag, skip this phase entirely.

## Phase 2 — Parallel Judging

**CRITICAL instructions for each judge agent prompt:**

- Include the **full report text** in the prompt
- Include the **rubric definitions** for that judge's assigned dimensions only
- Tell the judge: "Think step-by-step. First analyze the report against each dimension's rubric anchors. Cite specific passages, sections, or examples from the report. Then output your scores."
- Tell the judge to return **only** a JSON block in this exact format (no other text outside the JSON):

```json
{
  "dimensions": [
    {
      "name": "Dimension Name",
      "score": 4,
      "reasoning": "2-4 sentence explanation citing specific report content",
      "evidence": ["Specific quote or reference from the report...", "Another specific reference..."]
    }
  ]
}
```

### If RESEARCH report — 3 judges x 3 dimensions each (9 total)

Launch exactly **3 Task agents simultaneously** (all `subagent_type: "general-purpose"`).

#### Judge 1 — Research Rigor

Dimensions: **Source Quality**, **Factual Accuracy**, **Evidence Strength**

Prompt framing: "You are evaluating research rigor. Focus on verifiability. Check if cited sources seem real and authoritative. Flag any claims that appear unsupported or potentially hallucinated. Assess whether evidence is concrete (named examples, specific numbers, real organizations) vs. vague assertions ('experts say...', 'studies show...')."

#### Judge 2 — Analysis Quality

Dimensions: **Analytical Depth**, **Completeness**, **Balance & Objectivity**

Prompt framing: "You are evaluating analytical quality. Focus on intellectual substance. Does the report go beyond Wikipedia-level summary? Are all relevant angles covered or are there obvious omissions? Is the contrarian view genuinely challenging or a strawman that's easily dismissed? Look for causal reasoning, cross-source synthesis, and non-obvious insights."

#### Judge 3 — Communication

Dimensions: **Coherence & Structure**, **Writing Quality**, **Actionability**

Prompt framing: "You are evaluating communication effectiveness. Focus on the reader experience. Can a busy executive extract value from the Executive Summary alone? Do sections build on each other logically? Is the prose clean and professional? Do recommendations lead to concrete next steps or are they vague platitudes?"

### If STRATEGY report — 3 judges x 2 dimensions each (6 total)

Launch exactly **3 Task agents simultaneously** (all `subagent_type: "general-purpose"`).

#### Judge 1 — Methodology & Insight

Dimensions: **Framework Fidelity**, **Strategic Insight**

Prompt framing: "You are evaluating strategic methodology. Focus on whether the named framework is correctly and deeply applied — not just structurally present but genuinely driving analysis. Then assess whether the insights are company-specific and non-obvious, or generic observations that could apply to anyone."

#### Judge 2 — Evidence & Competition

Dimensions: **Market Evidence**, **Competitive Analysis**

Prompt framing: "You are evaluating market evidence and competitive intelligence. Focus on specificity: are there named data sources with real numbers (TAM, growth rates, market share)? Are competitors named with specific positioning analysis, recent strategic moves, and genuine differentiation — or is it vague hand-waving about 'the competitive landscape'?"

#### Judge 3 — Execution & Risk

Dimensions: **Actionability of Recommendations**, **Risk Coverage**

Prompt framing: "You are evaluating actionability and risk coverage. Focus on whether recommendations include timelines, investment ranges, decision criteria, and sequencing — or are they vague platitudes? For risk, is there a genuine steelmanned contrarian view that would give a board member pause, or just token risk mentions?"

## Phase 2.5 — Golden Reference Comparison (only if --compare flag present)

If a golden reference was loaded in Phase 1.5, launch **1 additional Task agent** (`subagent_type: "general-purpose"`):

#### Comparison Judge

Dimensions: **Structural Match**, **Depth Match**

Prompt: Include both the report text and the golden reference text. Include the structural metrics from Phase 1.5. Ask the judge to assess:

1. **Structural Match (1-5)**: How closely does the report match the golden reference's structure? Same sections covered? Similar organizational pattern? Similar source density?
2. **Depth Match (1-5)**: How closely does the report match the golden reference's analytical depth? Similar word count per section? Comparable level of evidence and detail?

Tell the judge to return the same JSON format as other judges.

If no `--compare` flag, skip this phase entirely.

## Phase 3 — Aggregation

After all judges return:

1. Parse each judge's JSON output. If a judge returned text around the JSON, extract the JSON block (look for `{` to `}` matching).
2. Collect all dimension scores into a single scorecard.
3. Compute the **overall score** as the arithmetic mean of all primary dimension scores (9 for research, 6 for strategy), rounded to 1 decimal place. **Do NOT include comparison scores in the overall average.**
4. Assign a **letter grade**:
   - **A** : overall >= 4.5
   - **B** : overall >= 3.5
   - **C** : overall >= 2.5
   - **D** : overall >= 1.5
   - **F** : overall < 1.5
5. Identify **strengths**: the 2 highest-scoring dimensions.
6. Identify **improvement areas**: the 2 lowest-scoring dimensions.

## Phase 4 — Write Output Files

Derive the output basename from the report filename: strip `.md` extension.

### File 1: `{basename}.eval.json`

Write this JSON structure using the Write tool.

**For RESEARCH reports:**

```json
{
  "version": "1.1",
  "eval_type": "research",
  "report_file": "<original filename>",
  "evaluated_at": "<UTC timestamp from Phase 1>",
  "eval_model": "claude-opus-4-6",
  "prompt_version": "1.1",
  "dimensions": {
    "source_quality": { "score": "<1-5>", "reasoning": "<from judge>" },
    "factual_accuracy": { "score": "<1-5>", "reasoning": "<from judge>" },
    "analytical_depth": { "score": "<1-5>", "reasoning": "<from judge>" },
    "completeness": { "score": "<1-5>", "reasoning": "<from judge>" },
    "balance_objectivity": { "score": "<1-5>", "reasoning": "<from judge>" },
    "coherence_structure": { "score": "<1-5>", "reasoning": "<from judge>" },
    "writing_quality": { "score": "<1-5>", "reasoning": "<from judge>" },
    "actionability": { "score": "<1-5>", "reasoning": "<from judge>" },
    "evidence_strength": { "score": "<1-5>", "reasoning": "<from judge>" }
  },
  "overall_score": "<mean, 1 decimal>",
  "grade": "<A/B/C/D/F>",
  "strengths": ["<name>", "<name>"],
  "improvement_areas": ["<name>", "<name>"]
}
```

**For STRATEGY reports:**

```json
{
  "version": "1.1",
  "eval_type": "strategy",
  "report_file": "<original filename>",
  "evaluated_at": "<UTC timestamp from Phase 1>",
  "eval_model": "claude-opus-4-6",
  "prompt_version": "1.1",
  "dimensions": {
    "framework_fidelity": { "score": "<1-5>", "reasoning": "<from judge>" },
    "strategic_insight": { "score": "<1-5>", "reasoning": "<from judge>" },
    "market_evidence": { "score": "<1-5>", "reasoning": "<from judge>" },
    "competitive_analysis": { "score": "<1-5>", "reasoning": "<from judge>" },
    "actionability": { "score": "<1-5>", "reasoning": "<from judge>" },
    "risk_coverage": { "score": "<1-5>", "reasoning": "<from judge>" }
  },
  "overall_score": "<mean, 1 decimal>",
  "grade": "<A/B/C/D/F>",
  "strengths": ["<name>", "<name>"],
  "improvement_areas": ["<name>", "<name>"]
}
```

If `--compare` was used, add a top-level `"comparison"` key to the JSON:

```json
{
  "comparison": {
    "golden_file": "<golden reference filename>",
    "structural_match": { "score": "<1-5>", "reasoning": "<from comparison judge>" },
    "depth_match": { "score": "<1-5>", "reasoning": "<from comparison judge>" }
  }
}
```

### File 2: `{basename}.eval.md`

Write a human-readable scorecard using the Write tool.

**For RESEARCH reports**, use this template:

```markdown
# Evaluation Scorecard

**Report:** <report title from Phase 1>
**Type:** Research
**Evaluated:** <date>
**Overall: <grade> (<overall_score>/5.0)**

## Scores

| Dimension | Score | |
|-----------|-------|-|
| Source Quality | <n>/5 | <bar> |
| Factual Accuracy | <n>/5 | <bar> |
| Analytical Depth | <n>/5 | <bar> |
| Completeness | <n>/5 | <bar> |
| Balance & Objectivity | <n>/5 | <bar> |
| Coherence & Structure | <n>/5 | <bar> |
| Writing Quality | <n>/5 | <bar> |
| Actionability | <n>/5 | <bar> |
| Evidence Strength | <n>/5 | <bar> |

## Strengths

- **<dimension> (<score>/5):** <reasoning>
- **<dimension> (<score>/5):** <reasoning>

## Areas for Improvement

- **<dimension> (<score>/5):** <reasoning>
- **<dimension> (<score>/5):** <reasoning>

## Detailed Judge Notes

### Research Rigor

**Source Quality (<score>/5)**
<reasoning>
- Evidence: <evidence items>

**Factual Accuracy (<score>/5)**
<reasoning>
- Evidence: <evidence items>

**Evidence Strength (<score>/5)**
<reasoning>
- Evidence: <evidence items>

### Analysis Quality

**Analytical Depth (<score>/5)**
<reasoning>
- Evidence: <evidence items>

**Completeness (<score>/5)**
<reasoning>
- Evidence: <evidence items>

**Balance & Objectivity (<score>/5)**
<reasoning>
- Evidence: <evidence items>

### Communication

**Coherence & Structure (<score>/5)**
<reasoning>
- Evidence: <evidence items>

**Writing Quality (<score>/5)**
<reasoning>
- Evidence: <evidence items>

**Actionability (<score>/5)**
<reasoning>
- Evidence: <evidence items>
```

**For STRATEGY reports**, use this template:

```markdown
# Evaluation Scorecard

**Report:** <report title from Phase 1>
**Type:** Strategy
**Evaluated:** <date>
**Overall: <grade> (<overall_score>/5.0)**

## Scores

| Dimension | Score | |
|-----------|-------|-|
| Framework Fidelity | <n>/5 | <bar> |
| Strategic Insight | <n>/5 | <bar> |
| Market Evidence | <n>/5 | <bar> |
| Competitive Analysis | <n>/5 | <bar> |
| Actionability | <n>/5 | <bar> |
| Risk Coverage | <n>/5 | <bar> |

## Strengths

- **<dimension> (<score>/5):** <reasoning>
- **<dimension> (<score>/5):** <reasoning>

## Areas for Improvement

- **<dimension> (<score>/5):** <reasoning>
- **<dimension> (<score>/5):** <reasoning>

## Detailed Judge Notes

### Methodology & Insight

**Framework Fidelity (<score>/5)**
<reasoning>
- Evidence: <evidence items>

**Strategic Insight (<score>/5)**
<reasoning>
- Evidence: <evidence items>

### Evidence & Competition

**Market Evidence (<score>/5)**
<reasoning>
- Evidence: <evidence items>

**Competitive Analysis (<score>/5)**
<reasoning>
- Evidence: <evidence items>

### Execution & Risk

**Actionability (<score>/5)**
<reasoning>
- Evidence: <evidence items>

**Risk Coverage (<score>/5)**
<reasoning>
- Evidence: <evidence items>
```

If `--compare` was used, add a **Comparison** section after Detailed Judge Notes:

```markdown
## Golden Reference Comparison

**Compared against:** <golden filename>

| Metric | Score | |
|--------|-------|-|
| Structural Match | <n>/5 | <bar> |
| Depth Match | <n>/5 | <bar> |

**Structural Match:** <reasoning>
**Depth Match:** <reasoning>
```

For score bars in all templates, use block characters: `█` for filled and `░` for empty. A score of 3/5 renders as `███░░`.

## Phase 5 — Report to User

Print a summary to the console:

```
Evaluation complete!

  Report:  <report title>
  Type:    <Research|Strategy>
  Grade:   <grade> (<overall_score>/5.0)

  Strengths:     <top 2 dimensions with scores>
  Improve:       <bottom 2 dimensions with scores>

  Scorecard:     <path to .eval.md>
  Raw data:      <path to .eval.json>
```

If `--compare` was used, also print:
```
  Comparison:    Structural Match <n>/5, Depth Match <n>/5
```

If the overall score is below 3.0, add: "Consider re-running the report with more specific topic framing to improve quality."

## Phase 5.5 — Learning Capture (only if score < 3.0)

If the overall score is below 3.0 **and** the file `~/.cascade/auth.json` exists:

1. Build a learning payload JSON object:
   ```json
   {
     "source": "cascade-eval",
     "report_file": "<report filename>",
     "eval_type": "<research|strategy>",
     "overall_score": "<score>",
     "grade": "<grade>",
     "weakest_dimensions": [
       { "name": "<dim name>", "score": "<score>", "reasoning": "<reasoning>" },
       { "name": "<dim name>", "score": "<score>", "reasoning": "<reasoning>" }
     ],
     "improvement_guidance": "<1-2 sentence summary of what would most improve quality>",
     "created_at": "<UTC timestamp>"
   }
   ```
2. Write this payload to `/tmp/cse:eval-learning-<timestamp>.json` using the Write tool (where `<timestamp>` is epoch seconds from `date +%s`).
3. Print: `"Low score detected. Learning captured to /tmp/cse:eval-learning-<timestamp>.json"`

If overall score >= 3.0 or `~/.cascade/auth.json` doesn't exist, skip this phase.
