---
name: ingest
description: Use when you point at an external source — YouTube video, article URL, or pasted text — to mine it into a Cascade knowledge package.
when_to_use: Deep, roadmap-grade mining of a named external source — drop a YouTube link, any article URL, or paste raw text. Reliably pulls the content (YouTube transcript adapter, a URL-readability adapter with a fallback ladder, or direct paste), runs a deep extraction (frameworks, key points, competitive signals, specable Cascade implications), lets you judge whether it's worth going deep, then persists it (dedup-aware on URL) and optionally promotes implications into idea/execution packages to delegate.
argument-hint: "<youtube url|id | article url | pasted text | search phrase>"
allowed-tools: Bash(python3 *), Bash(node *cascade.js *), WebSearch, WebFetch, Read, Write, Agent, cascade_list_packages, cascade_create_package, cascade_update_package, cascade_manage_dependencies, cascade_log_decision
---

# /cse:ingest — External Content → Knowledge Package → Roadmap

This is the front of Cascade's idea-intake loop: **feed → extract → judge → roadmap → execution packages → delegate.** You name a source — a **YouTube video, any article URL, or pasted text** — and the skill pulls it in reliably, mines it for product-grade intelligence, and turns the worthwhile parts into trackable packages an agent (or a human overseeing agents) can build.

It is deliberately **distinct** from two neighbors — don't duplicate them:
- `cascade_ingest_curator_item` / `/cse:curator` = shallow *firehose triage* (Haiku: oneline / novelty / suggested-action) for a high-volume queue.
- `/cse:mine` = deep extraction of a *local meeting transcript* routed to org decisions/risks.
- **`/cse:ingest` (this)** = deep, roadmap-grade mining of a *named external source you point at*, tuned for product/competitive expansion.

CLI/interactive-first by design. (A paid web-app version would run this through the Claude Agent SDK, which is billed via API differently from interactive sessions — see "Productionization notes".)

---

## Phase 0 — Resolve the source TYPE → route to an adapter

Source adapters are an explicit seam. **Detect the source type from `$ARGUMENTS` and route to exactly one Phase-1 adapter.** Every adapter returns the SAME contract — `{ text, provenance }` — so Phases 2-5 stay source-agnostic.

Routing rules, in order:

1. **YouTube** → the **YouTube adapter** (Phase 1A, UNCHANGED). Match when `$ARGUMENTS` is:
   - a URL whose host is `youtube.com`, `www.youtube.com`, `m.youtube.com`, `music.youtube.com`, or `youtu.be` (any `/watch?v=…`, `/shorts/…`, `youtu.be/…` form), OR
   - a bare 11-char video id matching `^[A-Za-z0-9_-]{11}$` (if such a token turns out not to be a real video — the YouTube adapter returns `INVALID_VIDEO_ID`/`NO_TRANSCRIPT` — treat it as paste text instead), OR
   - a **search phrase** (not a URL, e.g. "Nate B Jones five levels of AI coding") → run `WebSearch`, pick the most likely `youtube.com/watch?v=…` result, and **confirm the title with the user** before pulling. (Phrases resolve to YouTube; if the user clearly wants a non-YouTube source, ask them for the URL.)

2. **Any other `http(s)` URL** (not a YouTube host) → the **URL adapter** (Phase 1B).

3. **Non-URL free text** (a pasted passage, tweet body, excerpt — anything that isn't a single URL or a short search phrase) → the **paste adapter** (Phase 1C), using the text directly.

4. **Empty** → ask: **"Drop a YouTube link, an article URL, or paste the text you want ingested."** If they paste text → paste adapter; if they give a URL → URL/YouTube adapter per above.

> Disambiguation: a single token that looks like a URL routes by host (YouTube vs other). A short phrase with no URL is treated as a YouTube search. A long passage of prose (or text the user explicitly says is pasted content) is the paste adapter — when ambiguous between "search phrase" and "pasted text", ask.

> The Phase-1 contract is `{ text, provenance }`. `text` = the clean body (transcript / article text / pasted text). `provenance` = `{ kind, url, title, author, site, published_date, … }` (fields an adapter can't determine are omitted). Keep Phases 2-5 source-agnostic — they only see `{ text, provenance }`.

## Phase 1A — YouTube adapter: pull the transcript (reliable adapter)

*(Used only when Phase 0 routed to YouTube. UNCHANGED.)*

Run the deterministic adapter that ships with this skill (uses `youtube-transcript-api`; transcript-only — no yt-dlp/ffmpeg/browser):

```bash
python3 "<skill-dir>/youtube_transcript.py" "<url-or-id>" --text-only
```

`<skill-dir>` is this skill's directory: in the repo that's `cse/skills/ingest/`; when installed as a plugin it's `${CLAUDE_PLUGIN_ROOT}/skills/ingest/`. It prints one JSON object; persist it to `.cascade/ingest/<slug>.json` for provenance.

**Reliability + failure handling.** It's reliable from a **residential IP** (a normal laptop). On `ok:false`, react to the stable `error.code` — do not retry blindly:
- `IP_BLOCKED` / `REQUEST_BLOCKED` → you're on a flagged/cloud IP; tell the user this must run locally (or via a proxy). This is the expected cloud-daemon limitation.
- `TRANSCRIPTS_DISABLED` / `NO_TRANSCRIPT` → no captions; offer to fall back to `WebFetch` of a summary/article instead, or stop.
- `AGE_RESTRICTED` / `VIDEO_UNAVAILABLE` / `INVALID_VIDEO_ID` → report and stop.
- First time only: if the dependency is missing, install once: `pip3 install --user youtube-transcript-api`.

Report the pull: language, generated-vs-manual, duration, word count.

The YouTube adapter returns `text` = transcript and `provenance` = `{ kind:"youtube", url, video_id, title, author, ingested_at, ingest_tool, transcript_artifact, duration_min, word_count }`. Then go to **Phase 1D (dedup)**.

## Phase 1B — URL adapter: web page → clean article text + provenance

*(Used when Phase 0 routed to a non-YouTube `http(s)` URL.)*

Goal: turn a web page into the SAME `{ text, provenance }` contract the YouTube adapter returns — clean readable body, no nav/ads/boilerplate.

1. **Fetch + clean:** `WebFetch` the URL with a prompt like:
   > "Extract the main readable article/body text of this page — the actual content the author wrote. Drop navigation, ads, cookie/consent banners, related-links, comments, and boilerplate. Then report the provenance you can determine: title, author, site/publication name, and published date. Return the cleaned body text followed by the provenance."

   Take the model's cleaned body as `text` and assemble `provenance = { kind:"url", url:<normalized — see Phase 1D>, title, author, site, published_date }`. Omit any provenance field you can't determine.

2. **Fallback ladder** — apply in order, only on failure:
   - **WebFetch returns empty / blocked / clearly truncated / implausibly short** (paywall, consent wall, JS-only render, "enable JavaScript", "are you a robot", OR a cleaned body under ~120 words — a soft-paywall teaser like "subscribe to read") → re-fetch through a readability proxy: `WebFetch` **`https://r.jina.ai/<original-url>`** (prepend the proxy origin to the full original URL). This returns server-side-rendered, readability-cleaned markdown for most pages. Use its output as `text`; keep the ORIGINAL url in provenance (not the proxy url).
   - **Still nothing usable** → ask the user: **"I couldn't read that page (likely paywalled or JS-only). Paste the article text and I'll ingest it."** On paste → fall through to the **paste adapter** (Phase 1C) with the original URL recorded as `provenance.url`. Because a URL is known, Phase 1C routes this through **Phase 1D** (dedup on that URL) — it does NOT skip dedup.

   Report which rung succeeded (direct WebFetch / r.jina.ai proxy / paste fallback) and the word count.

Then go to **Phase 1D (dedup)**.

## Phase 1C — Paste adapter: raw text → knowledge package

*(Used when Phase 0 routed to pasted/free text, or as the URL adapter's final fallback. This is the first-class path for no-API sources — tweets/X threads, gated articles, Slack/email excerpts.)*

1. Use the pasted text **directly** as `text`. No fetching.
2. Capture whatever provenance the user supplies — ask once, optionally: **"Any source label or URL for this? (optional)"** Assemble `provenance = { kind:"paste", url?, title?, author?, site? }` — all optional; if the user gives nothing, just `{ kind:"paste" }`.
3. **Dedup branch — depends on whether a source URL is known:**
   - **Pure paste (no URL)** — no reliable key, so create a NEW package and **skip Phase 1D**.
   - **Paste reached via the URL adapter's fallback (a URL IS known)** — set `provenance.url` to the normalized form (Phase 1D step 1) and **go to Phase 1D**. The body came from paste, but the source key is the URL, so an already-ingested URL must still be caught (open-or-refresh) rather than duplicated.

Then: **pure paste → Phase 2**; **paste-with-URL → Phase 1D**.

## Phase 1D — Dedup (URL sources only)

*(Runs for YouTube and URL sources, including **paste reached via the URL fallback** — anything with a known source key. Only **pure paste** (no URL) skips this entirely.)*

The dedup **key** depends on the source kind:
- **YouTube** → key on the **`video_id`** (NOT the URL): `youtu.be/<id>`, `youtube.com/watch?v=<id>`, `m.youtube.com/…`, `/shorts/<id>`, and `…&t=30s` are all the SAME video, so a URL key would false-negative. Compare `provenance.video_id` against existing packages' `type_data.source.video_id`.
- **URL** (and paste-via-URL-fallback) → key on the **normalized URL** (below).

1. **Normalize the URL** (the form you store in `provenance.url` and compare against):
   - lowercase the **host**; strip a leading **`www.`**; force scheme to **`https`** (so `http`/`https` and `www`/bare collapse),
   - strip the **fragment** (`#…`),
   - strip tracking query params: every `utm_*`, plus `fbclid`, `gclid` (keep all other query params),
   - strip a **trailing slash** on the path (but keep `/` as the root path),
   - keep scheme + host + remaining path + remaining query.

2. **Look up existing knowledge packages**: call `cascade_list_packages` (filter to knowledge packages — `package_type` `research`/`intelligence` or tags `knowledge-package`/`external-ingest`/`scout`) and compare on the key for this source kind — `type_data.source.video_id` for YouTube, else `type_data.source.url` (normalized). (Volume is small; a client-side scan over the returned packages is fine — no new RPC/index needed.)

3. **On a hit** (a package with the same normalized url already exists) — DON'T create a duplicate. Surface it ("Already ingested as «<title>» (package <id>) on <ingested_at>.") and offer:
   - **open** → no-op; just show the existing package's card/summary and stop (or jump to Phase 5 to promote implications from it).
   - **refresh** → re-run Phases 2-4 extraction on the freshly-pulled `text`, then **`cascade_update_package`** the SAME package: refresh `type_data.card` + the extraction fields + `type_data.source.ingested_at`. Do NOT create a new package.

4. **On no hit** → proceed to Phase 2 and create a new package in Phase 4 as normal.

## Phase 2 — Deep extraction (fan out an agent)

Hand the transcript text to a subagent via the `Agent` tool and require it to return the canonical schema in `extraction-schema.json` (this skill's directory) — `summary`, `frameworks`, `key_points`, `notable_quotes`, `competitive_signals`, `cascade_implications`, `contradictions_or_risks`. Fanning out keeps the long transcript out of the main context and is the same shape that scales to mining many sources in parallel.

Prime the agent with what Cascade IS (specification infrastructure: CSE discovery→spec→wave→verify; the composable package primitive; agents that read org context) so `cascade_implications` map to real primitives. Demand specifics from the source (real numbers, names, examples) — reject generic-ified output. `cascade_implications` is the load-bearing field: each must be concrete enough to `/cse:spec`, mapped to an existing concept, and sized S/M/L.

Auto-generated transcripts have no punctuation/speaker labels and mis-transcribe names — tell the agent to infer intended meaning.

## Phase 3 — Judge: is this worth going deep on?

Present the extraction to the user — lead with `summary`, the top `key_points`, `competitive_signals`, and especially the `cascade_implications` table (idea · maps-to · effort). Then ask the **go/no-go**: is this source worth turning into a knowledge package and roadmap items, or archive/skip? Respect a "skip" — not every source earns a package. This is the human judgment the loop is built around.

## Phase 4 — Persist as a knowledge package

On "go" (and only if Phase 1D found NO existing package — a dedup **refresh** updates the existing package via `cascade_update_package` instead), create the knowledge package:

```
cascade_create_package
  title:        "Knowledge: <author|site> — <short title>"
  package_type: "research"
  executor_type:"human"
  tags:         ["knowledge-package","external-ingest","nugget","<source-kind>","competitive-analysis", …topical tags]
  description:  <the summary + one line of provenance>
  type_data:    { knowledge_kind:"external_ingest",
                  card:{ oneline, what, why, theme },   # the short briefing — see below
                  source: <the Phase-1 provenance>,     # see shape below
                  frameworks, key_points, notable_quotes, competitive_signals,
                  cascade_implications, contradictions_or_risks }
```

`type_data.source` carries the Phase-1 `provenance` verbatim — its shape is **source-agnostic** (`<source-kind>` is its `kind`):
- **YouTube:** `{ kind:"youtube", url, video_id, title, author, ingested_at, ingest_tool, transcript_artifact, duration_min, word_count }`
- **URL:** `{ kind:"url", url:<NORMALIZED>, title, author, site, published_date, ingested_at, word_count }`
- **Paste:** `{ kind:"paste", url?, title?, author?, site?, ingested_at, word_count }` (most fields optional)

Always persist the **normalized** `url` (the same form Phase 1D compared) so future re-ingests dedup. `<source-kind>` (`youtube`/`url`/`paste`) goes in `tags` too.

**Always emit `type_data.card`** — the bite-sized briefing the Scout cards + ScoutDetailSheet render (instead of clamping the long `description`). Produce it from your own extraction; it must satisfy the SAME contract the code validates:

- `oneline` — a punchy headline, **≤ 140 chars**
- `what` — what it is, **≤ 280 chars**
- `why` — why it matters to Cascade specifically, **≤ 280 chars**
- `theme` — exactly ONE of the FIXED set: **`architecture`, `code`, `strategy`, `product`, `competitive`, `operations`, `other`** (use `other` if none fits)

> The theme list + length caps are owned by `cascade-web/src/lib/scout/card.ts` (`THEMES`, `parseCard`) — that file is the source of truth; an out-of-set theme is coerced to `other` on read. Keep this block in sync with it.

The structured `type_data` is what makes the package **agent-readable** later — future design/spec agents pull it as context.

## Phase 5 — Promote implications into the roadmap

For each `cascade_implication` the user marks worth pursuing, create a child work package so it enters the delegation pipeline:

```
cascade_create_package
  title:        <the idea, as an action>
  package_type: "idea"            # or "feature" when the user wants it build-ready
  executor_type:"ai_session"      # or human_mediated_ai
  description:  <idea + rationale>
  type_data:    { effort, maps_to_existing, sourced_from:"<knowledge package id>" }
  must_haves:   [ …if the user can already name acceptance conditions ]
```

Link each back to the knowledge package with `cascade_manage_dependencies` (a "derived_from" edge) so the roadmap item traces to its source. Offer to hand any of them straight to `/cse:spec` (turn the idea into a full execution spec) or `/cse:delegate` (package it for a human-led build).

## Phase 6 — Record

Log one `cascade_log_decision` capturing what was ingested and which implications were promoted (category `process`, tag `external-ingest`). If 3+ artifacts/files resulted, the work is already tracked via the packages — no separate `/cse:capture` needed.

---

## Productionization notes (not built here — CLI-first today)

- **Vendoring:** `youtube_transcript.py` ships in this skill dir so the plugin stays self-contained; re-release via `/cse:release` to distribute.
- **Cloud / web-app:** the existing `cascade_ingest_curator_item` MCP tool scrapes the watch page for `captionTracks` — fragile (breaks on tracks whose `name` carries nested `runs:[…]`, and bot-blocked/consent-walled + PoToken-gated server-side). A reliable web/paid version should call a youtube-transcript-api-equivalent behind a residential proxy, OR keep ingest client-side.
- **Billing:** the paid web version runs via the Claude Agent SDK (API billing), which differs from interactive-session billing — gate it behind per-user API billing/consent, reusing the Execution Control (Airplane Mode) credential resolver + spend caps.
- **Adapters today:** YouTube (transcript), URL (WebFetch readability + `r.jina.ai` proxy fallback + paste fallback), paste (raw text). **Still to add:** podcast (RSS + transcript), X thread (native), PDF — each only needs to satisfy the Phase-1 `{ text, provenance }` contract; Phases 2-6 are unchanged.
- **URL readability ceiling (v1):** the URL adapter is WebFetch-first with an `r.jina.ai` proxy + paste fallback — no dedicated readability dependency (Mozilla Readability / `@postlight/parser`) and no headless browser. JS-rendered / auth-walled pages beyond the proxy fall back to paste. A richer web/paid version could add a real readability lib or headless capture behind the same Phase-1 seam.
