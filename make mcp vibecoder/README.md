# Make MCP Vibecoder

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/make-mcp-server)](https://www.npmjs.com/package/make-mcp-server)
[![Make.com](https://img.shields.io/badge/Make.com-unofficial-blueviolet)](https://make.com)
[![MCP](https://img.shields.io/badge/MCP-compatible-green)](https://modelcontextprotocol.io)

> **Unofficial, community-driven project.** Not affiliated with, endorsed by, or officially supported by Make.com.

An MCP server + Claude agent system for building, validating, and deploying [Make.com](https://make.com) automation scenarios through conversation. Describe what you want to automate — Claude does the rest.

**Search 559 modules across 170 apps. Use 266 real blueprint templates. Deploy validated scenarios to Make.com in seconds.**

---

## What Is This?

**Make MCP Vibecoder** is two things in one repo:

1. **An MCP server** (`make mcp vibecoder/`) — gives Claude direct access to Make.com module documentation, scenario validation, and deployment via the [Model Context Protocol](https://modelcontextprotocol.io/). Connect it once and Claude can build and ship Make scenarios from any conversation.

2. **A vibecoder agent system** (`.claude/skills/` + `CLAUDE.md`) — a set of Claude skills and a CLAUDE.md instruction file that turn Claude Code into an expert Make.com automation engineer. When you open this repo in Claude Code, Claude knows how to use every tool, avoid every pitfall, and follow best-practice patterns for building scenarios.

Together they form a workflow where Claude both *knows* Make.com deeply (skills) and can *act* on Make.com directly (MCP tools).

---

## Quick Start

### Step 1 — Connect the MCP server to Claude

**Option A: npx (no installation needed)**

```json
// claude_desktop_config.json — documentation only
{
  "mcpServers": {
    "make-mcp-server": {
      "command": "npx",
      "args": ["-y", "make-mcp-server"],
      "env": {
        "LOG_LEVEL": "error"
      }
    }
  }
}
```

```json
// claude_desktop_config.json — full (with deployment)
{
  "mcpServers": {
    "make-mcp-server": {
      "command": "npx",
      "args": ["-y", "make-mcp-server"],
      "env": {
        "LOG_LEVEL": "error",
        "MAKE_API_KEY": "your_api_key_here",
        "MAKE_TEAM_ID": "your_team_id",
        "MAKE_API_URL": "https://eu1.make.com/api/v2"
      }
    }
  }
}
```

**Option B: Docker**

```json
{
  "mcpServers": {
    "make-mcp-server": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "-e", "LOG_LEVEL=error",
        "-e", "MAKE_API_KEY=your_api_key_here",
        "-e", "MAKE_TEAM_ID=your_team_id",
        "-e", "MAKE_API_URL=https://eu1.make.com/api/v2",
        "make-mcp-server"
      ]
    }
  }
}
```

Build the image first: `docker build -t make-mcp-server ./make\ mcp\ vibecoder/`

**Option C: Claude Code CLI**

```bash
claude mcp add make-mcp-server -- npx -y make-mcp-server
```

Then set env vars in your Claude Code settings or `.env`.

**Config file locations:**

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

Restart Claude Desktop after updating the config.

---

### Step 2 — Get a Make.com API key

1. Go to [Make.com](https://make.com) → your avatar → **Profile** → **API**
2. Generate a new token with scopes: `scenarios:read`, `scenarios:write`, `scenarios:run`
3. Copy your **Team ID** from the URL when you're in your workspace: `https://eu1.make.com/{TEAM_ID}/...`

---

### Step 3 — Use the vibecoder system (optional but recommended)

Clone this repo and open it in Claude Code:

```bash
git clone https://github.com/yourusername/make-vibecoder.git
cd make-vibecoder
cp makemcpclaude.md CLAUDE.md
claude
```

With `CLAUDE.md` in place, Claude Code automatically loads deep Make.com knowledge — including all tool patterns, validation rules, IML syntax, and the 5 specialist skills. No extra setup required.

---

## Usage

With the MCP server connected, ask Claude anything:

> "Build a Make scenario that watches new Shopify orders and posts them to Slack"

> "Create a webhook that receives form submissions, summarizes them with Claude AI, and adds a row to Google Sheets"

> "Find a template for syncing Airtable to HubSpot and deploy it to my account"

> "What modules does Make have for sending emails?"

> "Validate this blueprint JSON..."

Claude will automatically use the MCP tools to search templates, find modules, build blueprints, validate, and deploy — all without you writing any JSON.

---

## Available Tools (18 total)

### Discovery

| Tool | Description |
|------|-------------|
| `search_templates` | Search 266 real scenario blueprints by keyword, category, or difficulty |
| `search_modules` | Full-text search across 559 modules |
| `list_apps` | Browse all 170 apps with module counts |

### Inspection

| Tool | Description |
|------|-------------|
| `get_template` | Retrieve complete deployable blueprint JSON by template ID |
| `get_module` | Full parameter schema, output fields, and docs for any module |
| `tools_documentation` | Complete server capability overview — Claude calls this first |

### Validation & Deployment

| Tool | Description |
|------|-------------|
| `validate_scenario` | Check blueprint for errors before deploying |
| `check_account_compatibility` | Verify modules are available in your Make account/region |
| `create_scenario` | Deploy a validated blueprint to Make.com |

### Lifecycle

| Tool | Description |
|------|-------------|
| `health_check` | Verify API credentials and get team/org IDs |
| `list_scenarios` | List all scenarios in your team |
| `get_scenario` | Get an existing scenario's blueprint by ID |
| `update_scenario` | Overwrite an existing scenario with a new blueprint |
| `delete_scenario` | Delete a scenario (requires `confirm: true`) |
| `run_scenario` | Manually trigger a scenario |
| `list_executions` | View execution history and error logs |

---

## Auto-Healing

`create_scenario` automatically fixes common issues in AI-generated blueprints so deployment just works:

| Issue | Fix Applied |
|-------|-------------|
| Missing `metadata` section | Injects full metadata with scenario config and designer |
| Missing designer coordinates on modules | Adds `{x, y}` positions for the visual editor |
| Router `filter` property in route objects | Strips it — filters must be set in Make.com UI |
| Module version conflicts | Injects verified versions from internal registry; strips unknown versions |
| `builtin:Schedule` trigger | Converts to proper scenario scheduling |

---

## The Vibecoder Skills System

When you open this repo in Claude Code with `CLAUDE.md` present, Claude has access to 5 specialist skills that activate automatically based on what you're doing:

| Skill | Activates When... |
|-------|-------------------|
| `make-mcp-tools-expert` | Building or deploying a scenario, using any MCP tool |
| `make-blueprint-syntax` | Writing blueprint JSON, using IML `{{...}}` expressions |
| `make-validation-expert` | Validation fails, blueprint has errors, scenario won't deploy |
| `make-workflow-patterns` | User describes a goal ("automate X when Y happens") |
| `make-module-configuration` | Configuring a specific module, understanding parameters vs. mapper |

Each skill is a focused markdown file in `.claude/skills/` containing deep domain knowledge — module patterns, error taxonomies, IML function references, and real blueprint examples.

The `CLAUDE.md` (copied from `makemcpclaude.md`) ties everything together: it tells Claude how to work silently, execute tool calls in parallel, check templates before building from scratch, and follow the 8-step deployment workflow.

---

## How It Was Made

### The Module Catalog (559 modules)

The module catalog was built by extracting data from **265 real Make.com blueprint files** collected across two batches:

- `Make example flows 1/` — 42 production blueprints
- `Make example flows 2/` — 223 production blueprints

Each blueprint was parsed by `extract-flows2.js` → `scrape-modules.ts` to extract module IDs, parameters, types, and descriptions. The resulting catalog covers 170 apps including Slack, Google Sheets, Shopify, HubSpot, Anthropic Claude, OpenAI, Airtable, Salesforce, Stripe, Notion, and 160+ more.

### The Template Library (266 blueprints)

The same blueprint files are loaded directly into the database as searchable templates. `populate-templates.ts` auto-categorizes each blueprint into one of 12 categories (`ai`, `crm`, `ecommerce`, `marketing`, `social-media`, `communication`, `project-management`, `data`, `file-management`, `automation`, `analytics`, `hr`) and assigns a difficulty level based on module count and complexity.

### The Validation Engine

`validate_scenario` runs a multi-pass check on blueprint JSON:
- Structural validation (module IDs, required fields, JSON shape)
- Module catalog lookup (against 559 known module IDs)
- Forward reference detection (module N cannot reference module M where M > N)
- Required parameter checks (using the `get_module` parameter registry)
- Problematic module detection (openai:*, email:*, ai-provider:*)
- Account compatibility check (live API check against your Make account)

### The Skills System

The 5 skill files in `.claude/skills/` were written to mirror the structure of the n8n-mcp skills system (in `n8n-skills/`), adapted entirely for Make.com. Each skill is a standalone markdown reference that Claude loads on demand, keeping the main CLAUDE.md concise while providing deep knowledge when needed.

---

## Repo Structure

```
make-vibecoder/
├── make mcp vibecoder/         # The MCP server (npm: make-mcp-server)
│   ├── src/
│   │   ├── mcp/server.ts       # All 18 MCP tool definitions
│   │   ├── database/           # SQLite + FTS5 layer
│   │   └── scrapers/           # Module catalog + template population
│   ├── data/
│   │   └── make-modules.db     # Pre-built SQLite database (bundled in npm)
│   ├── dist/                   # Compiled output
│   ├── Dockerfile
│   └── package.json            # make-mcp-server v1.5.0
│
├── .claude/
│   └── skills/                 # Claude specialist skills
│       ├── make-mcp-tools-expert/SKILL.md
│       ├── make-blueprint-syntax/SKILL.md
│       ├── make-validation-expert/SKILL.md
│       ├── make-workflow-patterns/SKILL.md
│       └── make-module-configuration/SKILL.md
│
├── makemcpclaude.md            # → copy to CLAUDE.md when working in this repo
│
├── Make example flows 1/       # 42 source blueprints (catalog input)
├── Make example flows 2/       # 223 source blueprints (catalog input)
│
├── make-skills/                # Reference materials and EXAMPLECLAUDE.md
├── n8n-mcp/                    # n8n MCP server (inspiration + comparison)
├── n8n-skills/                 # n8n skills (reference schema)
└── README.md
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MAKE_API_KEY` | For deployment | — | Make.com API token (Profile → API) |
| `MAKE_TEAM_ID` | For deployment | — | Your Make team ID (from URL) |
| `MAKE_API_URL` | No | `https://eu1.make.com/api/v2` | API base URL — change for US/AU zones |
| `LOG_LEVEL` | No | `info` | `debug` \| `info` \| `warn` \| `error` \| `silent` |
| `DATABASE_PATH` | No | `<package>/data/make-modules.db` | Custom SQLite path |

**Zone URLs:**
- EU: `https://eu1.make.com/api/v2` (default)
- US: `https://us1.make.com/api/v2`
- AU: `https://au1.make.com/api/v2`

---

## Development

```bash
cd "make mcp vibecoder"

# Install dependencies
npm install

# Build TypeScript → dist/
npm run build

# Rebuild SQLite database from catalog + blueprints
npm run scrape

# Run tests (43 tests: database, logger, server integration)
npm test

# Dev mode with file watching
npm run dev

# Start the MCP server directly
npm start
```

**After editing TypeScript:** always `npm run build`, then reload the MCP server in Claude Desktop.

**After adding new blueprints:** update `populate-templates.ts` if the folder path changed, then `npm run scrape`.

### Publishing

```bash
npm run prepublishOnly   # Build + populate DB + verify
npm publish              # Publish to npm as make-mcp-server
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript + Node.js (ESM) |
| MCP protocol | `@modelcontextprotocol/sdk` |
| Database | SQLite via `better-sqlite3` + FTS5 full-text search |
| Schema validation | `zod` |
| HTTP client | `axios` (Make.com API) |
| Tests | `vitest` (43 tests) |
| Packaging | Pre-built database bundled in npm |

---

## Roadmap

The MCP server is the foundation. The vibecoder repo will grow around it:

- **Vercel AI SDK agent** — A browser-based agent interface for building Make scenarios without Claude Desktop, deployable as a Vercel app
- **Self-improving loops** — Claude agents that run scenarios, observe failures, and improve the blueprint autonomously
- **Testing harness** — Automated execution testing with assertion-based validation of scenario outputs
- **More templates** — Continuous expansion of the 266-template library from production flows

---

## Supported Apps (170+)

Slack, Google Sheets, Gmail, Shopify, HubSpot CRM, Airtable, Notion, Google Drive, Google Docs, Google Calendar, Salesforce, Stripe, GitHub, Trello, Asana, Monday.com, Jira, Discord, Telegram, WhatsApp Business, Microsoft Teams, Microsoft Outlook, Mailchimp, ActiveCampaign, Typeform, Webflow, WordPress, Dropbox, OneDrive, Twilio, Anthropic Claude, OpenAI, Perplexity AI, Google Gemini AI, Leonardo AI, DeepL, Zendesk, Intercom, Pipedrive, Zoho CRM, Salesflare, Bitrix24, Revolut, Stripe, WooCommerce, BigCommerce, Magento, Facebook Pages, Instagram, LinkedIn, Twitter/X, YouTube, Pinterest, TikTok, Datastore, JSON, HTTP, Webhooks, Text Parser, CSV, RSS, and 100+ more.

---

## License

MIT — see [LICENSE](make%20mcp%20vibecoder/LICENSE) for details.

Community project. Not affiliated with Make.com / Celonis.
