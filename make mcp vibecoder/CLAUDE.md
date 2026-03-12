# CLAUDE.md

This file provides guidance to Claude Code when working on the **make-mcp** project inside the `make mcp/` directory.

## Project Overview

**make-mcp** is an unofficial MCP server for Make.com that allows AI assistants to search, build, validate, and deploy Make.com automation scenarios through the Model Context Protocol. It is the Make.com equivalent of the `n8n-mcp` server also present in this repository.

The server exposes a catalog of **559 modules across 148 apps** and **266 real blueprint templates** extracted from production Make.com flows. AI assistants can use it to compose and deploy complete automation scenarios directly from conversation.

### What it is NOT
- Not affiliated with Make.com / Integromat
- Not a wrapper for the official Make MCP (in `official make mcp/` — that folder is not used)
- Not a general automation tool — it is specifically for building Make.com scenario blueprints

---

## Architecture

```
make mcp/
├── src/
│   ├── mcp/
│   │   └── server.ts              # All MCP tool definitions (~1700 lines)
│   ├── database/
│   │   ├── db.ts                  # SQLite wrapper (searchModules, searchTemplates, getTemplate, insertModule, insertTemplate)
│   │   └── schema.sql             # Tables: modules, templates, examples + FTS5 index
│   └── scrapers/
│       ├── scrape-modules.ts      # Module catalog (~4960 lines) + populateDatabase()
│       ├── populate-templates.ts  # Loads blueprint JSON files into templates table
│       ├── extract-from-blueprints.ts  # Core blueprint extraction engine
│       └── module-mapping.ts      # Type mapping utilities
├── data/
│   ├── make-modules.db            # SQLite database (source of truth at runtime)
│   ├── flows2-new-modules.ts      # Generated code from "Make example flows 2"
│   └── tier1/2/3-modules.ts      # Generated code from "Make example flows 1"
├── dist/                          # Compiled output (run npm run build to update)
├── .env                           # MAKE_API_KEY, MAKE_API_URL, MAKE_TEAM_ID, MAKE_ORGANIZATION_ID
├── package.json
└── CHANGELOG.md
```

The blueprint source folders live at the repo root (sibling to `make mcp/`):
- `Make example flows/` — 42 blueprints (original batch)
- `Make example flows 2/` — 223 blueprints (expanded batch)

---

## MCP Tools

| Tool | Description |
|------|-------------|
| `tools_documentation` | Entry point — call first to understand capabilities |
| `search_modules` | FTS search across 559 modules |
| `get_module` | Full parameter schema for a module ID |
| `check_account_compatibility` | Live Make API check for module availability |
| `validate_scenario` | Blueprint validation before deployment |
| `create_scenario` | Deploy blueprint to Make.com (requires API key) |
| `list_scenarios` | List existing scenarios in the account |
| `search_templates` | Search 266 real blueprints by keyword / category / difficulty |
| `get_template` | Return complete deployable blueprint JSON by template ID |
| `list_apps` | List all 148 apps with module counts |

**Fastest workflow for building a scenario:**
1. `search_templates` — find a matching real blueprint
2. `get_template` — get the full JSON
3. Modify connection IDs and parameters
4. `validate_scenario` → `create_scenario`

---

## Common Commands

```bash
cd "make mcp"

# Build TypeScript → dist/
npm run build

# Rebuild SQLite database (modules + templates)
npm run scrape
# or with local tsx:
./node_modules/.bin/tsx src/scrapers/scrape-modules.ts

# Run tests
npm test

# Dev mode (watch)
npm run dev
```

**Always run `npm run build` after editing any TypeScript file before testing.**

The MCP server needs to be reloaded in Claude Desktop after a rebuild — remind the user to reload it.

---

## Adding New Blueprints

When new blueprint JSON files are available in a new folder:

1. Run `node extract-flows2.js` (update the folder path inside the script first) to generate a new `data/flows-new-modules.ts`
2. The merge script appends new modules to `src/scrapers/scrape-modules.ts` before the closing `];`
3. Run `npm run scrape` to rebuild the database — this also auto-loads all blueprint files from all `Make example flows*/` folders into the templates table via `populate-templates.ts`

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

- `scrape-modules.ts` is ~5000 lines — search for the insertion point (`        ];`) at line ~4932 when adding new modules
- The FTS5 table (`modules_fts`) must be kept in sync with the `modules` table — `insertModule()` in `db.ts` handles both
- Template search is LIKE-based (multi-word), not FTS5 — each word is searched independently across name, description, and modules_used
- The `LIMIT 1000` on `searchModules('*')` covers the full catalog; FTS search returns max 20 results per query
- `.env` is gitignored — the API key, team ID, and org ID must be set locally
- `Make example flows*/` folder paths are hardcoded in `populate-templates.ts` — update `getBlueprintFolders()` if folders are renamed
- The `official make mcp/` directory is unused — do not modify it
