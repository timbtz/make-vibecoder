# CLAUDE.md

This file provides guidance to Claude Code when working on the **make-mcp** project inside the `make mcp/` directory.

## Project Overview

**make-mcp** is an unofficial MCP server for Make.com that allows AI assistants to search, build, validate, and deploy Make.com automation scenarios through the Model Context Protocol. It is the Make.com equivalent of the `n8n-mcp` server also present in this repository.

The server exposes a catalog of **1000+ modules across 176+ apps** and **266 real blueprint templates** extracted from production Make.com flows. AI assistants can use it to compose and deploy complete automation scenarios directly from conversation.

### What it is NOT
- Not affiliated with Make.com / Integromat
- Not a wrapper for the official Make MCP (in `official make mcp/` — that folder is not used)
- Not a general automation tool — it is specifically for building Make.com scenario blueprints

---

## Architecture

```
make mcp vibecoder/
├── src/
│   ├── mcp/
│   │   └── server.ts                    # All MCP tool definitions (~1700 lines)
│   ├── database/
│   │   ├── db.ts                        # SQLite wrapper — all DB access goes through here
│   │   └── schema.sql                   # Tables: modules, templates, examples + FTS5 index
│   └── scrapers/
│       ├── scrape-modules.ts            # Module catalog (~5000 lines) + populateDatabase()
│       ├── populate-templates.ts        # Loads blueprint JSON → templates table
│       ├── populate-examples.ts         # Extracts module configs → examples table
│       ├── enrich-from-blueprints.ts    # Blueprint metadata → DB enrichment (schema_source: blueprint-extracted)
│       ├── enrich-from-official-mcp.ts  # official-mcp-schemas.json → DB enrichment (highest priority)
│       ├── scrape-from-make-api.ts      # Full API-driven rebuild (requires MAKE_API_KEY)
│       ├── extract-from-blueprints.ts   # Core blueprint extraction engine
│       └── module-mapping.ts            # Type mapping utilities
├── data/
│   ├── make-modules.db                  # SQLite database (source of truth at runtime)
│   ├── official-mcp-schemas.json        # Authoritative schemas from Make MCP harvest (565 entries, 116 with full params)
│   ├── additional-nodes-schema.json     # Supplemental schemas not yet in official-mcp-schemas.json
│   ├── GOTCHAS.md                       # Module behavioral gotchas — loaded at startup into get_module responses
│   ├── SERVER-CHANGES.md               # ⚠️ Server bug/fix backlog — READ THIS before touching server.ts
│   ├── autoresearch-log.md             # Autoresearch session outcomes
│   ├── autoresearch/                   # Tracker JSON files (sessions, attempts, corrections)
│   ├── flows2-new-modules.ts            # Generated code from "Make example flows 2"
│   └── tier1/2/3-modules.ts            # Generated code from "Make example flows 1"
├── dist/                                # Compiled output (run npm run build to update)
├── .env                                 # MAKE_API_KEY, MAKE_API_URL, MAKE_TEAM_ID, MAKE_ORGANIZATION_ID
├── package.json
└── CHANGELOG.md
```

The blueprint source folders live at the repo root (sibling to `make mcp vibecoder/`):
- `Make example Blueprints/` — 224 blueprints (batch 3, added v1.8.0)

> **Note:** `Make example flows/` and `Make example flows 2/` referenced in older docs no longer exist as separate folders. The active folder is `Make example Blueprints/`.

---

## Server Bug Backlog

Before modifying `server.ts`, read **`data/SERVER-CHANGES.md`** first.
It contains:
- `[ ]` **Pending bugs** discovered during autoresearch sessions (with root cause, file + line, and exact fix instructions)
- `[x]` **Applied fixes** (for history)

Key pending items as of 2026-03-16:
- **BUG-001** — `scheduling` key leaks into blueprint JSON → HTTP 400 from Make API
- **BUG-002** — Webhook triggers always deploy with `on-demand` scheduling instead of `immediately`
- **BUG-003** — `get_scenario` rejects numeric IDs (Zod coercion missing)
- **SCHEMA-001** — `slack:ActionPostMessage` stub in catalog (wrong module ID)
- **INFRA-001** — `VERIFIED_MODULE_VERSIONS` incomplete → HTTP 500 for many real modules

---

## MCP Tools

| Tool | Description |
|------|-------------|
| `tools_documentation` | Entry point — call first to understand capabilities |
| `search_modules` | FTS search across 649 modules |
| `get_module` | Full parameter schema for a module ID (`essentials: true` = required params only) |
| `search_module_examples` | Real-world module configs from 502 production blueprints |
| `check_account_compatibility` | Live Make API check for module availability |
| `validate_scenario` | Blueprint validation before deployment |
| `create_scenario` | Deploy blueprint to Make.com (requires API key) |
| `get_scenario` | Get a scenario's blueprint by ID |
| `update_scenario` | Overwrite an existing scenario |
| `delete_scenario` | Delete a scenario (requires `confirm: true`) |
| `run_scenario` | Manually trigger a scenario |
| `list_scenarios` | List all scenarios in the account |
| `list_executions` | View execution history and errors |
| `health_check` | Verify API key + return account details |
| `search_templates` | Search 266 real blueprints by keyword / category / difficulty |
| `get_template` | Return complete deployable blueprint JSON by template ID |
| `list_apps` | List all 176+ apps with module counts |

**Fastest workflow for building a scenario:**
1. `search_templates` — find a matching real blueprint
2. `get_template` — get the full JSON
3. Modify connection IDs and parameters
4. `validate_scenario` → `create_scenario`

---

## Common Commands

```bash
cd "make mcp vibecoder"

# Build TypeScript → dist/
npm run build

# Rebuild SQLite database (modules + templates + examples + enrichments)
npm run scrape

# Run tests
npm test

# Dev mode (watch)
npm run dev
```

**Always run `npm run build` after editing any TypeScript file before testing.**

The MCP server needs to be reloaded in Claude Desktop after a rebuild — remind the user to reload it.

---

## Adding New Blueprints

When new `.blueprint.json` files arrive in a new folder:

1. Add the folder path to `getBlueprintFolders()` in **both**:
   - `src/scrapers/populate-templates.ts`
   - `src/scrapers/populate-examples.ts`
2. Run `npm run scrape` — templates, examples, and enrichments auto-populate.
3. Update module/template counts in this file and in the root `CLAUDE.md`.

---

## Development Guidelines

### What to do when modifying `server.ts`
- All MCP tools are registered with `server.registerTool(...)` — follow the existing pattern
- Use `ok(...)` and `fail(...)` helper functions for return values
- Always update `tools_documentation` if a new tool is added (the tools object around line 500)
- Run `npm run build` and ask the user to reload the MCP server before testing
- **Always add an entry to `CHANGELOG.md`** for any new tool, scraper, or database change

### What to do when modifying the database schema
- Edit `src/database/schema.sql`
- Update the wrapper methods in `src/database/db.ts`
- Run `npm run scrape` to rebuild the database from scratch

### What to do when adding modules
- Add them to the `getModuleCatalog()` array in `src/scrapers/scrape-modules.ts`
- Use the `m(id, name, app, type, description, [params])` helper
- Use the `p(name, type, required, description, extra?)` helper for parameters
- Run `npm run scrape` to rebuild

---

## Agent Usage Guidelines

Three specialized agents are available in `.claude/agents/` that are relevant to this project. Use them when appropriate — do not invoke them for trivial or single-file changes.

### `mcp-backend-engineer`
Use when modifying the MCP layer: adding or changing tools in `server.ts`, updating tool schemas, debugging MCP protocol issues, or updating the `@modelcontextprotocol/sdk` version. This agent understands MCP specifications and will ensure correct tool registration, proper TypeScript types from the SDK, and backward compatibility.

### `code-reviewer`
Use after writing or significantly modifying code — especially for `server.ts`, `db.ts`, `populate-templates.ts`, and any scraper logic. The agent runs `git diff`, checks for security issues, missing error handling, and code quality, and returns structured feedback with critical / warning / suggestion tiers.

### `context-manager`
Use when a session has grown long (multiple large files read, many changes made) or when resuming work after a break. It captures the current state of what was changed, what decisions were made, and what remains to be done — and writes a focused briefing to the memory file at `.claude/projects/.../memory/MEMORY.md`.

**Agent constraints:**
- Sub-agents must not commit or push to git — that stays with the main session
- Sub-agents must not spawn further sub-agents

---

## Key Pitfalls

- `scrape-modules.ts` is ~5000 lines — search for the insertion point (`        ];`) near the end when adding new modules. Use `Grep` to find `^        \];`
- **Never use `INSERT OR REPLACE` for modules** — `insertModule()` uses a priority-aware `ON CONFLICT DO UPDATE` with CASE guards. Direct `INSERT OR REPLACE` would silently wipe `official-mcp`-quality schemas with lower-priority data.
- **`official-mcp-schemas.json` is the highest-priority schema source** — grow it by querying `mcp__make__app-module_get` for each app. Format: `{ "moduleId": { name, description, type, app, connection_type, parameters, output_fields } }`. Run `npm run scrape` after updating it.
- The FTS5 table (`modules_fts`) must stay in sync with `modules` — `insertModule()` in `db.ts` handles both; never INSERT directly into `modules`
- `templates_fts` is only populated by `insertTemplate()` — a fresh DB without a scrape will return empty template searches
- Template search is LIKE-based (multi-word), NOT FTS5 — each word is searched independently; keep queries short and specific
- The `LIMIT 1000` on `searchModules('*')` covers the full catalog; FTS search returns max 20 results
- `.env` is gitignored — `MAKE_API_KEY`, `MAKE_TEAM_ID`, `MAKE_ORGANIZATION_ID`, `MAKE_API_URL` must be set locally
- Blueprint folder paths are hardcoded in `getBlueprintFolders()` in both `populate-templates.ts` and `populate-examples.ts` — update both if folders change
- **The Make.com module catalog API endpoint does NOT exist** — `GET /apps/{name}/modules` returns HTTP 404. Do not try to scrape modules from the live API; use the static catalog
- `dist/` is stale until `npm run build` runs — edits to `src/` have no effect on the running server without a rebuild
- `scrape-modules.ts` does NOT load dotenv (by design) — the API scraper routing (`MAKE_API_KEY` in env → API scraper) relies on shell env, not the .env file
- Port 6277 used by the MCP inspector can get stuck — kill it with `kill $(lsof -ti :6277)` before retrying
