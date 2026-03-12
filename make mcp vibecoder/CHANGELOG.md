# Changelog

All notable changes to this project will be documented in this file.

## [1.6.0] - 2026-03-12

### Added
- **`search_module_examples` tool** — Returns real-world module configurations extracted from production blueprints. 502 examples across 291 modules, sensitive values redacted.
- **`populate-examples.ts` scraper** — Extracts and scores module configs from all blueprints (merger of `mapper` + `parameters`), deduplicates, stores top-5 per module in the `examples` table. Runs automatically as part of `npm run scrape`.
- **`examples` table** populated for the first time — `get_module` (non-essentials mode) now includes real examples in its response.
- **3 new public methods on `MakeDatabase`** — `insertExample`, `clearExamples`, `runInTransaction` — replacing direct `db.db` access in scrapers.

### Changed
- `npm run scrape` now also populates the `examples` table after modules and templates.
- `tools_documentation` updated to list `search_module_examples`.

## [1.5.0] - 2026-03-10

### Added
- **559 modules** (+244 new) extracted from 223 "Make example flows 2" blueprints — up from 315 (+76% growth)
- **148 unique apps** now covered (was ~50)
- **`get_template` tool** — Retrieve complete, deployable blueprint JSON by template ID
- **266 blueprint templates** loaded from real Make.com flows (both example folders) into the database
- **`populate-templates.ts`** scraper — Auto-categorizes blueprints into 12 categories (ai, crm, ecommerce, marketing, social-media, communication, project-management, data, file-management, automation, analytics, hr) and difficulty levels
- **Multi-word template search** — `search_templates("chatgpt slack")` now finds templates matching all words independently
- **New apps**: Anthropic Claude, Telegram, Perplexity AI, BrowserAct, AI Tools, Gmail, DataForSEO, ZeroBounce, Revolut, Facebook Pages, Discord, Gemini AI, Leonardo AI, DeepL, WhatsApp, Zendesk, ActiveCampaign, Salesflare, Bitrix24, Monday.com, and 100+ more
- `difficulty` filter added to `search_templates` tool
- `modules_used` returned by `search_templates` for preview of what apps are involved
- Updated `tools_documentation` to reflect new 559-module catalog and template workflow

### Changed
- `search_templates` now returns `modulesUsed` array and a `hint` for using `get_template`
- `list_apps` and `search_modules('*')` now support up to 1000 results (was 500)
- Quick start guide now recommends templates-first workflow (faster path to deployment)

## [1.3.2] - 2026-03-09

### Added
- **`list_scenarios` tool** — Lists all scenarios in the Make.com account with optional filtering by scheduling type (`on-demand`, `immediately`, `indefinitely`). Returns ID, name, description, scheduling, status, creation date, last edit, operation count, packages used, and creator. Falls back to `MAKE_TEAM_ID`/`MAKE_ORGANIZATION_ID` env vars when not provided.
- **`API_INTEGRATION.md`** — Documents working vs. permission-blocked Make.com API endpoints and comparison with the official Make MCP
- **`tools_documentation`** updated to include `list_scenarios` and API permission tips

## [1.4.0] - 2026-02-09

### Added
- **Blueprint extraction system** — Automated pipeline that parses Make.com blueprint JSON files, extracts parameter schemas from `metadata.expect` arrays, and generates TypeScript module definitions
- **`src/scrapers/extract-from-blueprints.ts`** — Core extraction engine (476 lines): parses 42 production blueprints, maps 30+ blueprint parameter types to internal types, deduplicates and aggregates across blueprints
- **`src/scrapers/module-mapping.ts`** — Type mapping utilities for blueprint → internal type conversion
- **`merge-tiers.js`** — Automated tier merging script for controlled rollout
- **91 new modules** extracted from 42 production blueprints — 203 → 315 total (+55%)
  - Tier 1 (≥5 uses): 3 modules
  - Tier 2 (2–4 uses): 21 modules
  - Tier 3 (1 use): 67 modules
- **18 new apps**: PostgreSQL, QuickBooks, Microsoft Excel, Calendly, Browse AI, ElevenLabs, Gong, Canva, ClickUp, Clearbit, Buffer, Salesloft, Sendinblue, YouTube, LinkedIn Lead Gen Forms, LinkedIn Offline Conversions, Anthropic (Claude), Apify
- **Real Make.com module IDs** corrected from blueprint data: `slack:CreateMessage`, `openai-gpt-3:CreateCompletion`, `google-sheets:addRow`, `notion:watchDatabaseItems`
- **Generated artifacts**: `data/tier1-modules.ts`, `data/tier2-modules.ts`, `data/tier3-modules.ts`

### Changed
- `scrape-modules.ts` expanded with 91 additional modules from the tier extraction

## [1.3.1] - 2026-02-07

### Fixed
- **npx `-y` flag** — All README examples now include `-y` to prevent interactive "Ok to proceed?" prompt that hangs MCP clients

## [1.3.0] - 2026-02-07

### Added
- **Auto-healing** for LLM-generated blueprints — `create_scenario` now auto-injects missing `metadata`, `scenario` config, and `designer` coordinates
- **Router support** — Full `builtin:BasicRouter` deployment with multiple routes (tested & verified)
- **Recursive validation** — `validate_scenario` now traverses into router sub-routes
- **Router filter stripping** — Automatically removes unsupported `filter` property from route objects
- **Enhanced error reporting** — `create_scenario` returns full Make.com API error details including `suberrors`
- **`?confirmed=true`** query parameter on scenario creation to auto-install first-time apps
- 3 new tips in `tools_documentation` about versioning, filters, and auto-healing

### Changed
- Module `version` is no longer auto-injected — Make.com resolves the latest installed version automatically
- Removed false "missing version" warning from `validate_scenario`

### Fixed
- **HTTP module "Module not found"** — Caused by forcing `version: 1` on modules that have been updated (HTTP is now v4)
- **Router 400 Bad Request** — Caused by `filter` property being rejected as additional property on route objects
- **Workspace MCP config override** — `.vscode/mcp.json` was overriding global config; documented that all env vars must be present in workspace config

## [1.2.0] - 2026-02-07

### Added
- **npx support** — `npx make-mcp-server` runs zero-install with pre-built database
- **Docker support** — Multi-stage Dockerfile for isolated deployments
- **CLI entry point** — `make-mcp-server --help`, `--version`, `--scrape` flags
- **Self-hosting options** in README (npx, Docker, local dev)
- **Build script** (`scripts/build.js`) — tsc + copy schema.sql + add shebang
- **Prepublish script** (`scripts/prepublish.js`) — automated package preparation
- **Path resolution** — All paths resolve relative to package root (works from any cwd)
- `.dockerignore` for lean Docker builds
- `.env.example` template

### Changed
- `db.ts` now uses `import.meta.url` for path resolution (npx/global-install safe)
- `package.json` `bin` entry, `files` whitelist, and `scripts` updated for npm distribution
- `postinstall.js` improved with clearer messaging
- README completely rewritten with self-hosting options and IDE setup guides

### Fixed
- Windows ESM `import()` error — use `pathToFileURL()` in CLI entry point
- Schema.sql not found when running from different working directory

## [1.1.0] - 2026-02-06

### Added
- **Production hardening** — migrated to `registerTool`/`registerPrompt`/`registerResource` (SDK v1.26.0)
- **Structured logger** (`src/utils/logger.ts`) — stderr-only, LOG_LEVEL support
- **MCP Prompts** — `build_scenario` (guided creation), `explain_module`
- **MCP Resources** — `make://apps` (apps catalog)
- **`tools_documentation`** meta-tool (START HERE pattern)
- **Tool annotations** — `destructiveHint`/`idempotentHint` on `create_scenario`
- **Input sanitization** on all tool inputs
- **Graceful shutdown** handlers (SIGINT, SIGTERM, uncaughtException)
- **42 Vitest tests** — 14 database + 7 logger + 21 integration
- `isError` flag on all tool error responses

### Fixed
- FTS5 wildcard `*` search crash — added early return for "list all" case

## [1.0.0] - 2026-02-05

### Added
- Initial release
- 224 Make.com modules across 40+ apps
- 6 MCP tools: search_modules, get_module, validate_scenario, create_scenario, search_templates, list_apps
- SQLite database with FTS5 full-text search
- Make.com API integration for scenario deployment
- Module scraper with built-in catalog
