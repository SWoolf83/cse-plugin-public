---
name: system-map
description: Analyze the local codebase and populate the Cascade System Map with architecture components.
allowed-tools: Read, Write, Bash, Glob, Grep
---

# /cse:system-map

Analyze the local codebase and populate the Cascade System Map — an interactive architecture visualization showing services, databases, vendors, frameworks, CI/CD, and all infrastructure components.

## Execution

### Step 1: Gather Architecture Signals

Read the following files to detect architecture components (skip any that don't exist):

**Package & dependency files:**
- `package.json`, `package-lock.json` — Node.js dependencies, scripts
- `requirements.txt`, `pyproject.toml`, `Pipfile` — Python dependencies
- `go.mod` — Go dependencies
- `Cargo.toml` — Rust dependencies
- `Gemfile` — Ruby dependencies

**Infrastructure & deployment:**
- `Dockerfile`, `docker-compose.yml`, `docker-compose.yaml`
- `.github/workflows/*.yml` — GitHub Actions CI/CD
- `.gitlab-ci.yml` — GitLab CI
- `railway.json`, `railway.toml` — Railway config
- `vercel.json` — Vercel config
- `netlify.toml` — Netlify config
- `fly.toml` — Fly.io config
- `render.yaml` — Render config
- `Procfile` — Heroku
- `terraform/`, `*.tf` — Terraform IaC
- `k8s/`, `kubernetes/` — Kubernetes manifests

**Database & storage:**
- `supabase/` directory — Supabase project
- `prisma/schema.prisma` — Prisma ORM schema
- `drizzle.config.ts` — Drizzle ORM
- Migration directories

**Auth & security:**
- Auth provider configs (Supabase Auth, Auth0, Clerk, NextAuth)
- `.env.example`, `.env.local.example` — environment variable patterns (never read actual .env files)

**Framework detection:**
- `next.config.*` — Next.js
- `nuxt.config.*` — Nuxt
- `vite.config.*` — Vite
- `angular.json` — Angular
- `svelte.config.*` — SvelteKit

**Also read if available:**
- `.cascade/context/scans/codebase-latest.json` — existing Cascade scan data
- `CLAUDE.md`, `README.md` — project documentation

### Step 2: Gap-Filling Questions

After gathering signals, identify gaps in knowledge that can't be inferred from code. Ask up to 5 focused questions using `AskUserQuestion`. Common gaps:

- **Monitoring/Analytics**: "What monitoring or analytics platforms do you use? (e.g., Datadog, Sentry, PostHog, Google Analytics)"
- **ML/AI pipelines**: "Do you have any ML/AI pipelines or model serving infrastructure?"
- **Third-party integrations**: "What third-party APIs or services does this project integrate with beyond what's in the codebase?"
- **Vendor subscriptions**: "Are there any paid vendor subscriptions or SaaS tools used in production?"
- **Authentication details**: "How is authentication handled? (e.g., Supabase Auth, Auth0, custom JWT)"

Skip questions where the answer is clearly inferrable from the code analysis.

### Step 3: Generate System Map

Build `SystemMapNode[]` and `SystemMapEdge[]` arrays with:

**Node ID convention**: Use deterministic, readable IDs:
- `service-{name}` (e.g., `service-nextjs`, `service-fastify`)
- `db-{name}` (e.g., `db-postgresql`, `db-redis`)
- `vendor-{name}` (e.g., `vendor-supabase`, `vendor-stripe`)
- `framework-{name}` (e.g., `framework-react`, `framework-tailwind`)
- `lang-{name}` (e.g., `lang-typescript`, `lang-python`)
- `infra-{name}` (e.g., `infra-railway`, `infra-docker`)
- `cicd-{name}` (e.g., `cicd-github-actions`)
- `integration-{name}` (e.g., `integration-slack`, `integration-gmail`)
- `auth-{name}` (e.g., `auth-supabase`)
- `analytics-{name}` (e.g., `analytics-posthog`)
- `ml-{name}` (e.g., `ml-anthropic`)
- `config-{name}` (e.g., `config-env-vars`)

**Auto-layout positions**: Group nodes by category in columns:
- Column 0 (x=0): services
- Column 1 (x=300): frameworks & languages
- Column 2 (x=600): databases
- Column 3 (x=900): infrastructure & CI/CD
- Column 4 (x=1200): vendors & integrations
- Column 5 (x=1500): auth, analytics, ML

Within each column, space nodes vertically at y increments of 120px.

**Edge relationships**: Create edges for detected relationships:
- `uses`: service uses a framework or library
- `depends_on`: component depends on another
- `deploys_to`: service deploys to infrastructure
- `authenticates_via`: service uses auth provider
- `stores_in`: service stores data in database
- `sends_to`/`receives_from`: API integrations
- `monitors`: analytics/monitoring observing a service
- `integrates_with`: third-party integration

**Completeness map**: Set categories to `true` for each area you've mapped:
```json
{
  "hosting": true,      // if deployment platform identified
  "git_vcs": true,      // if git/GitHub/GitLab detected
  "dependencies": true, // if package files read
  "databases": true,    // if any database detected
  "cicd": true,         // if CI/CD config found
  "authentication": true, // if auth provider identified
  "api_surface": true,  // if API routes detected
  "third_party_integrations": true, // if external APIs found
  "monitoring_analytics": true,     // if monitoring/analytics found
  "security": true,     // if security measures detected
  "subscriptions_vendors": true,    // if paid vendors identified
  "ml_ai_pipelines": true          // if ML/AI infrastructure found
}
```

### Step 4: Push to Cascade

Call `cascade_save_system_map` with:
- `nodes`: the generated node array
- `edges`: the generated edge array
- `completeness`: the completeness map
- `merge_mode`: `"merge"` (preserves any existing manual edits)

### Step 5: Report Summary

Print a summary:
```
System Map populated:
- X nodes across Y categories
- Z relationships mapped
- Completeness: N/12 categories

View at: [your Cascade PWA URL]/system-map
```

## Notes
- Never read actual `.env` files — only `.env.example` or `.env.local.example`
- Use `merge` mode by default to preserve manual edits
- Include version numbers when available from package files
- Set status to `healthy` for all auto-detected components (user can change manually)
- This skill is idempotent — safe to run multiple times
