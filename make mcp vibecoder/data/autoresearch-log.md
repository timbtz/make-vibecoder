# Autoresearch Log

---

## Session 2026-03-16 — 1 round (incomplete — server reload required)

| Recipe | Result | Notes |
|--------|--------|-------|
| webhook→slack | ✗ (pending retry after server reload) | 3 fixes applied |

**Root causes found:**
1. `slack:ActionPostMessage` does not exist in Make.com — real module is `slack:CreateMessage` v4
2. `slack:CreateMessage` not in `VERIFIED_MODULE_VERSIONS` → version stripped → HTTP 500 (Postgres 23502)
3. `scheduling` inside blueprint JSON causes HTTP 400 — must be stripped before sending
4. `metadata.instant: true` + `on-demand` scheduling causes HTTP 500

**Schemas updated:** `slack:CreateMessage` (connection_type, parameters, output_fields)
**Server patched:** `VERIFIED_MODULE_VERSIONS['slack:CreateMessage'] = 4` (rebuilt, awaiting reload)
**Gotchas added:** 4 entries across `slack:ActionPostMessage`, `slack:CreateMessage`, `gateway:CustomWebHook`
**Corrections applied:** 3
**Final success rate:** 0/1 (0%) — retry blocked on MCP server reload

**Next session:** reload MCP server, retry Recipe 1, then continue with Recipe 3 (webhook→google-sheets)
