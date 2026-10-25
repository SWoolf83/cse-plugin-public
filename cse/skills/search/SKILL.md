---
name: search
description: Search organizational knowledge using natural language
allowed-tools: Read, Bash(curl*), Bash(npx supabase*), Grep, Glob
argument-hint: "<natural language query>"
---

# /cse:search — Semantic Knowledge Search

Search across all organizational knowledge — decisions, assumptions, and research reports — using natural language queries.

## Instructions

1. Parse `<args>` as the natural language query. If no args provided, ask the user what they want to search for.

2. Read environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL from .env.local
   SUPABASE_SERVICE_ROLE_KEY from .env.local
   OPENAI_API_KEY from .env.local
   ```

3. Generate an embedding for the query using OpenAI:
   ```bash
   curl -s https://api.openai.com/v1/embeddings \
     -H "Authorization: Bearer $OPENAI_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"model":"text-embedding-3-small","input":"<query>","dimensions":1536}'
   ```

4. Query Supabase for similar decisions:
   ```bash
   curl -s "$SUPABASE_URL/rest/v1/rpc/match_decisions" \
     -H "apikey: $SERVICE_KEY" \
     -H "Authorization: Bearer $SERVICE_KEY" \
     -H "Content-Type: application/json" \
     -d '{"query_embedding":"[...]","match_threshold":0.5,"match_count":5}'
   ```

5. Query for similar assumptions:
   ```bash
   curl -s "$SUPABASE_URL/rest/v1/rpc/match_assumptions" \
     -H "apikey: $SERVICE_KEY" \
     -H "Authorization: Bearer $SERVICE_KEY" \
     -H "Content-Type: application/json" \
     -d '{"query_embedding":"[...]","match_threshold":0.5,"match_count":5}'
   ```

6. Query for similar research:
   ```bash
   curl -s "$SUPABASE_URL/rest/v1/rpc/match_research" \
     -H "apikey: $SERVICE_KEY" \
     -H "Authorization: Bearer $SERVICE_KEY" \
     -H "Content-Type: application/json" \
     -d '{"query_embedding":"[...]","match_threshold":0.5,"match_count":5}'
   ```

7. Merge all results, sort by similarity score descending.

8. Display results in a structured table:

```
KNOWLEDGE SEARCH: "<query>"

DECISIONS
  [92%] "Chose Next.js over Remix for web platform"
        Description: Evaluated frameworks for the main web app...
  [78%] "PostgreSQL as primary database"
        Description: Compared PostgreSQL, MySQL, and DynamoDB...

ASSUMPTIONS
  [85%] "React ecosystem maintains current momentum"
        Status: active | Depends on: 2 decisions
  [71%] "Supabase pricing remains competitive at scale"
        Status: active | Depends on: 1 decision

RESEARCH
  [88%] "Authentication Architecture Deep Dive"
        Status: saved
  [73%] "Database Scaling Strategy"
        Status: active

Total: {n} matches across {types} categories
```

9. If no results found, suggest:
   - The query may not match any embedded content yet
   - Try broader search terms
   - Ensure OPENAI_API_KEY is configured

## Quality Gates

- All three knowledge types (decisions, assumptions, research) are queried
- Results show similarity percentage
- Assumptions show their status (active/changed/invalidated)
- Research shows exploration status
- Zero results handled gracefully with suggestions
