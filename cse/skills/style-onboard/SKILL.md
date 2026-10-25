---
name: style-onboard
description: Use when you want to onboard your writing style — analyzes samples, asks follow-ups, builds a profile that shapes all Cascade AI output.
allowed-tools: Bash(node *cascade.js *), Bash(curl *), Read
---

# Work Style Onboarding

Guide the user through building their Cascade work style profile. This is a conversational experience — you ask questions, they answer, and their profile gets refined.

## Prerequisites

The user must be authenticated (`cascade whoami`) and have at least one analyzed work sample.

## Flow

### 1. Check current state

```bash
node bin/cascade.js style-profile --samples
```

If they have no samples, help them upload one:
```bash
node bin/cascade.js upload-sample <file> --type <type> --title "Title"
```

Valid types: `patent_specification`, `office_action`, `research_analysis`, `competitive_analysis`, `legal_brief`, `technical_report`, `client_memo`, `proposal`, `presentation`, `email_draft`, `marketing_copy`, `code_review`, `documentation`, `other`

### 2. View existing profile (if any)

```bash
node bin/cascade.js style-profile
```

### 3. Run interactive onboarding

```bash
node bin/cascade.js style-onboard
```

This generates AI-powered questions derived from the user's analyzed work samples and submits their answers to refine the profile.

### 4. After onboarding

Show them their updated profile:
```bash
node bin/cascade.js style-profile
```

## Conversational guidelines

- If the user wants to upload files during the conversation, help them with `upload-sample`
- If samples are pending analysis, tell them to use the web app Settings page to trigger analysis
- You can discuss the user's style preferences naturally — the `style-onboard` command handles the formal Q&A
- If the user describes their style preferences conversationally (outside the formal Q&A), suggest they run `cascade style-onboard` to capture those insights into the profile
- Recommend uploading 3-5 diverse samples for best results
