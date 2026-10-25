---
name: imagine
description: Use when you want an AI-generated image — Claude crafts the prompt, OpenAI renders it, and it lands as a versioned Cascade artifact.
when_to_use: "/cse:imagine — Claude-prompted image generation via the OpenAI Images API (GPT Image family), persisted as first-class versioned image artifacts. Interviews/refines the ask into a strong image prompt (style, composition, negative space, brand palette from .cascade/brand.json when relevant), states the estimated cost tier BEFORE generating, calls cascade_generate_image, reports the artifact link (/artifacts/{id} + live desktop break-off window), and supports conversational iteration ('make the sky darker') via edit-mode versioning — each edit appends a new artifact version, giving visual evolution history for free. Triggers on 'imagine', 'generate an image', 'make me a picture/logo/cover/illustration', 'edit that image', '/cse:imagine <ask>'."
argument-hint: "[what to imagine]   (then iterate: 'darker sky', '--quality high', '--model gpt-image-1.5')"
allowed-tools: Read, Bash(ls *), Bash(cat *), cascade_generate_image, cascade_get_brand_config, cascade_get_artifact
---

# /cse:imagine — Claude-Prompted Image Artifacts

Claude crafts the prompt. OpenAI (GPT Image family) renders it. The result is a
**versioned image artifact** on the Cascade substrate — visible at `/artifacts/{id}`
on the web and popping **live** in the desktop break-off artifact window via the
existing artifact-render bridge. Iteration is conversational: each refinement calls
the image-EDIT endpoint against the previous version and appends a **new version**,
so the artifact carries its own visual evolution history.

## Cost tiers (state BEFORE generating — always)

| Tier | Model | Quality | Approx. cost/image | Use for |
|------|-------|---------|--------------------|---------|
| Draft | `gpt-image-1-mini` | low | ~$0.005 | roughs, comps, throwaway iterations |
| **Standard (default)** | `gpt-image-2` | medium | ~$0.03 | most real assets |
| Max | `gpt-image-1.5` | high | ~$0.18–0.21 | hero/cover art, final marketing assets |

Sizes: `1024x1024` (default), `1024x1536` (portrait), `1536x1024` (landscape).
User overrides: `--quality low|medium|high`, `--model gpt-image-2|gpt-image-1.5|gpt-image-1-mini`,
`--size <one of the three>`. `--quality max` is shorthand for `gpt-image-1.5` + `high`.

## Instructions

### Step 1 — Understand the ask

Parse `$ARGUMENTS`. If the ask is clear enough to render (subject + rough style),
do NOT over-interview — one short confirmation of the creative direction is plenty.
If it's vague ("make something for the launch"), ask at most 2-3 pointed questions:

- **Subject & purpose** — what is it, where will it be used (cover, slide, hero, icon)?
- **Style** — flat vector / photoreal / painterly / 3D render / line art…
- **Mood & palette** — and whether it should follow the org brand.

### Step 2 — Brand awareness (when relevant)

If the image is org-facing (covers, marketing, product art) check for a brand palette:

1. `Read .cascade/brand.json` if it exists (colors, fonts, style notes), else
2. try the `cascade_get_brand_config` MCP tool.

Weave brand colors/mood into the prompt as *descriptive language* ("deep teal and
indigo on charcoal") — never hex codes alone; image models respond to color names.
Skip branding for personal/creative asks unless the user wants it.

### Step 3 — Craft the prompt

Write a single strong prompt paragraph. Good prompts state:

- **Subject** first, concrete and specific
- **Composition** — framing, focal point, negative space ("generous negative space,
  subject in lower third")
- **Style** — medium, rendering style, era/reference vocabulary
- **Palette & lighting** — named colors, mood, contrast
- **What to avoid** — phrased positively where possible ("clean background, no text")
  — note: there is no separate negative-prompt field; fold it into the prompt.

Show the user the crafted prompt AND the cost line in one compact block:

```
Prompt: <the crafted prompt>
Tier:   Standard — gpt-image-2 / medium / 1024x1024 (~$0.03)
```

If (and only if) the tier is Max, or the user hasn't seen a cost for this session's
first generation, wait for a quick go-ahead. Otherwise proceed.

### Step 4 — Generate

Call the `cascade_generate_image` MCP tool:

```
cascade_generate_image({
  prompt: "<crafted prompt>",
  title:  "<short human title for the artifact>",
  model / quality / size: only when deviating from defaults,
  thread_id / objective_id / tags: when the conversation has an obvious home
})
```

The tool: screens the prompt for PHI (phi_mode orgs — a rejection means rephrase
as a reference, never bypass), checks the org spend cap, calls OpenAI, stores the
PNG in the artifacts bucket, creates the versioned artifact, and emits the live
render to the desktop break-off window automatically.

### Step 5 — Report

From the tool's JSON, tell the user:

- **Artifact link**: `/artifacts/{artifactId}` (and note it popped on the desktop
  window if they run the bridge)
- **Version**: v{versionNo} · model · quality · size · **costUsd**
- The `revisedPrompt` if the model rewrote materially

Do not paste the signed URL into chat unless asked — it expires in 1 hour; the
artifact link is the durable one.

### Step 6 — Iterate (edit-mode versioning)

When the user refines ("make the sky darker", "burgundy background", "more
negative space"), call `cascade_generate_image` again with:

```
source_artifact_id: <the same artifactId>
prompt: "<ONLY the change, stated as an edit instruction>"
```

This hits the image-EDIT endpoint against the latest version's actual pixels and
appends **v(n+1)** — same artifact, new version, visual history preserved. Keep
iterations on the SAME artifact unless the user asks for a genuinely new image.
Edit iterations default to the same tier as the source; suggest dropping to Draft
tier for rapid-fire iteration runs and doing one final pass at the target tier.

### Failure handling

- **No key**: tell the user to either `export OPENAI_API_KEY` (solo/dev) or store
  an org OpenAI key in Settings → Organization → OpenAI API Key (admin).
- **PHI rejection**: the prompt tripped the deterministic PHI screen — rephrase
  using references/IDs, never re-send the flagged content verbatim.
- **Spend cap**: the org's monthly cloud spend cap would be exceeded — surface the
  cap message; an admin can raise it in Settings → Execution Control.
- **Migration pending**: image artifacts need migration 291 applied
  (`npx supabase db push` from `cascade-web/`).
