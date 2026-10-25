# Vendored: cascade-api MCP server

`index.js` is a single self-contained bundle of
`harnesses/mcp-servers/cascade-api/src/index.ts` with all runtime deps
(@modelcontextprotocol/sdk, @supabase/supabase-js, zod) inlined via esbuild.

This copy and `packages/cascade-kit/mcp-server/` are BOTH produced by the
single-source MCP build (`scripts/build-mcp.mjs`) and are byte-identical
for `index.js` + `skill-registry.json`.

DO NOT hand-edit. Regenerate with `npm run build:mcp` (or `npm run build:cse-plugin`).
