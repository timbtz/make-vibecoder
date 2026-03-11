---
name: make-mcp-tools-expert
description: Expert guide for using Make.com MCP server tools to build, validate, and deploy automation scenarios. Use when building a Make scenario, automating with Make, finding Make modules, deploying to Make, listing scenarios, or using any Make MCP tool. Covers tool selection, chaining patterns, and end-to-end deployment flow.
---

# Make.com MCP Tools Expert

Master guide for using the Make.com MCP server to build and deploy automation scenarios.

---

## Tool Categories

The Make MCP server provides tools in four categories:

1. **Discovery** — Find modules and templates: `search_modules`, `search_templates`, `list_apps`
2. **Inspection** — Get details: `get_module`, `get_template`, `tools_documentation`
3. **Validation & Deployment** — `check_account_compatibility`, `validate_scenario`, `create_scenario`
4. **Lifecycle** — `list_scenarios`, `get_scenario`, `update_scenario`, `delete_scenario`, `run_scenario`, `list_executions`, `health_check`

---

## Quick Start — Fastest Path to a Deployed Scenario

```
1. search_templates({query: "slack notification"})   → get template IDs
2. get_template({id: 42})                            → full deployable blueprint JSON
3. Edit connection IDs and parameters
4. validate_scenario({blueprint: JSON.stringify(bp)}) → check for errors
5. create_scenario({name: "My Flow", blueprint: ...}) → deploy to Make.com
```

⚠️ **ALWAYS validate before create_scenario** — the validator catches errors that would cause silent deployment failures.

---

## Decision Tree: Which Tool First?

```
User wants to automate something
        │
        ▼
Does a pre-built template fit?
  YES → search_templates → get_template → modify → validate → create_scenario
  NO  → search_modules → get_module → build blueprint from scratch → validate → create_scenario
        │
        ▼
Not sure?
  → search_templates FIRST (faster, battle-tested blueprints)
  → Fall back to search_modules if no template fits
```

---

## Tool Quick Reference

| Tool | When to Use | Key Params |
|------|-------------|------------|
| `tools_documentation` | First call — understand all capabilities | none |
| `search_modules` | Find modules by keyword | `query`, `app` (optional) |
| `get_module` | Full parameter schema for a module | `moduleId`, `essentials` (optional) |
| `search_templates` | Find real blueprint templates | `query`, `category`, `difficulty` |
| `get_template` | Get complete deployable blueprint JSON | `id` |
| `list_apps` | Browse all 170 apps | none |
| `check_account_compatibility` | Verify modules available in your account | `moduleIds`, `blueprint` |
| `validate_scenario` | Check blueprint before deploying | `blueprint` (JSON string) |
| `create_scenario` | Deploy blueprint to Make.com | `name`, `blueprint`, `teamId` |
| `list_scenarios` | List existing scenarios | none |
| `get_scenario` | Get scenario blueprint by ID | `scenarioId` |
| `update_scenario` | Overwrite existing scenario | `scenarioId`, `name`, `blueprint` |
| `delete_scenario` | Delete a scenario | `scenarioId`, `confirm: true` |
| `health_check` | Verify API key + account details | none |
| `run_scenario` | Manually trigger a scenario | `scenarioId` |
| `list_executions` | Show execution history | `scenarioId` |

---

## Tool Chains (Most Common Patterns)

### Pattern A: Template-Based (Recommended)
```
search_templates({query: "shopify slack"})
  → get_template({id: 23})
  → [edit connection IDs manually]
  → validate_scenario({blueprint: JSON.stringify(bp)})
  → create_scenario({name: "Shopify → Slack", blueprint: ...})
```

### Pattern B: Build From Scratch
```
search_modules({query: "google sheets"})
  → get_module({moduleId: "google-sheets:ActionAddRow"})
  → build blueprint JSON
  → check_account_compatibility({moduleIds: ["google-sheets:ActionAddRow"]})
  → validate_scenario({blueprint: ...})
  → create_scenario({name: "...", blueprint: ...})
```

### Pattern C: Update Existing Scenario
```
list_scenarios()
  → get_scenario({scenarioId: 4705007})
  → [modify the returned blueprint]
  → validate_scenario({blueprint: JSON.stringify(modified)})
  → update_scenario({scenarioId: 4705007, blueprint: ...})
```

### Pattern D: Debug Failing Scenario
```
list_scenarios()
  → list_executions({scenarioId: 4705007})
  → [read error messages]
  → get_scenario({scenarioId: 4705007})
  → [fix blueprint]
  → update_scenario(...)
```

---

## search_modules — How to Use

```javascript
// Search by keyword
search_modules({query: "slack"})
// Returns up to 20 modules matching "slack"

// Search within a specific app
search_modules({query: "message", app: "Slack"})

// Get ALL modules (wildcard — returns up to 1000)
search_modules({query: "*"})

// Search by action type
search_modules({query: "send email gmail"})
```

**Output fields:** `id`, `name`, `app`, `type`, `description`

Module ID format: `appName:ActionOrTriggerName`
- ✅ `slack:ActionPostMessage`
- ✅ `google-sheets:ActionAddRow`
- ✅ `http:ActionSendData`
- ❌ `Slack:postMessage` (wrong format)

---

## get_module — How to Use

```javascript
// Full details (all params, docs, examples)
get_module({moduleId: "slack:ActionPostMessage"})

// Essentials only (required params, fewer tokens)
get_module({moduleId: "slack:ActionPostMessage", essentials: true})
```

**Output includes:**
- All parameters with types, required/optional, and valid options
- `output_fields` — what data this module outputs for `{{id.field}}` mapping
- `connection_type` — what connection type it needs
- `examples` (when not in essentials mode)

---

## search_templates — How to Use

```javascript
// Search by keyword
search_templates({query: "shopify orders slack"})

// Filter by category
search_templates({category: "ecommerce"})

// Filter by difficulty
search_templates({difficulty: "beginner"})

// Combined
search_templates({query: "webhook", category: "automation", difficulty: "intermediate"})
```

**Valid categories:** `ai`, `crm`, `ecommerce`, `marketing`, `social-media`, `communication`, `project-management`, `data`, `file-management`, `automation`, `analytics`, `hr`

**Valid difficulty:** `beginner`, `intermediate`, `advanced`

**Output:** list of template IDs, names, descriptions, categories — use IDs with `get_template`

---

## get_template — How to Use

```javascript
get_template({id: 42})
// Returns complete blueprint JSON ready to modify and deploy
```

The returned blueprint includes:
- `name` — template name
- `flow` — array of module nodes
- `metadata` — scenario settings (auto-injected if missing during create_scenario)

**After getting a template:**
1. Replace `__IMTCONN__` placeholder values with real connection IDs from your Make account
2. Customize parameters (spreadsheet IDs, channel names, etc.)
3. Run `validate_scenario` before deploying

---

## validate_scenario — How to Use

```javascript
validate_scenario({
  blueprint: JSON.stringify(myBlueprint)
})
```

**Returns:**
- `valid: true/false`
- `errors[]` — must fix before deploying
- `warnings[]` — non-blocking but worth reviewing
- `modulesValidated` — list of validated module IDs
- `accountCompatibility` — problematic modules and suggestions

**Common errors to fix:**
- `Missing required parameter "X"` → add the parameter to `mapper` or `parameters`
- `Unknown module "X"` → use `search_modules` to find the correct ID
- `Forward reference` → module N references a module that comes AFTER it
- `Router must have "routes" array` → add routes to the router

---

## create_scenario — How to Use

```javascript
create_scenario({
  name: "My Automation Scenario",
  blueprint: JSON.stringify(validBlueprint),
  // teamId is optional if MAKE_TEAM_ID is set in .env
  teamId: 895750
})
```

**Auto-healing performed by create_scenario:**
- Injects correct versions for verified modules (from VERIFIED_MODULE_VERSIONS registry)
- Strips versions from unknown modules (prevents IM007 errors)
- Auto-injects missing `metadata` section
- Auto-injects `designer` coordinates on each flow node
- Converts `builtin:Schedule` modules to proper scenario scheduling

**Returns on success:**
```json
{
  "scenarioId": 4712345,
  "name": "My Automation Scenario",
  "url": "https://eu1.make.com/4712345/scenarios/...",
  "scheduling": {"type": "on-demand"}
}
```

---

## health_check — First Step When API Key Issues

```javascript
health_check()
// Returns: user details, API scopes, team/org IDs
```

Run this first if:
- `create_scenario` returns "MAKE_API_KEY not configured"
- `list_scenarios` returns empty or auth errors
- You need to confirm your team ID or org ID

Required API key scopes:
- `scenarios:read` — for `list_scenarios`, `get_scenario`
- `scenarios:write` — for `create_scenario`, `update_scenario`, `delete_scenario`
- `scenarios:run` — for `run_scenario`

---

## Scheduling Types

When creating scenarios, scheduling is auto-set to `on-demand`. Override in the blueprint `scheduling` field:

```json
// On-demand (run manually or via run_scenario)
{"type": "on-demand"}

// Webhook-triggered (runs immediately when webhook receives data)
{"type": "immediately"}

// Scheduled polling (every N seconds)
{"type": "indefinitely", "interval": 900}   // 15 minutes
{"type": "indefinitely", "interval": 3600}  // 1 hour
{"type": "indefinitely", "interval": 86400} // 1 day
```

⚠️ **NEVER use `"type": "interval"`** — it's not a valid scheduling type and will cause deployment errors.

---

## PROBLEMATIC MODULES — Never Use These

The following modules fail consistently via API deployment:

| Module ID | Problem | Use Instead |
|-----------|---------|-------------|
| `openai:ActionCreateCompletion` | API deployment fails | `http:ActionSendData` to OpenAI API |
| `openai-gpt-3:ActionCreateChatCompletion` | API deployment fails | `http:ActionSendData` to OpenAI API |
| `email:ActionSendEmail` | Not universally available | `gmail:ActionSendEmail` or SMTP module |
| `ai-provider:ActionChatCompletion` | Not deployable via API | `http:ActionSendData` to AI API |

⚠️ **`anthropic-claude:createAMessage` and `anthropic-claude:createACompletion`** exist in the DB but are NOT in VERIFIED_MODULE_VERSIONS. Use `http:ActionSendData` → Anthropic API as a safe fallback.

---

## VERIFIED MODULE VERSIONS

These modules have known-good versions (auto-injected by create_scenario):

```
json:ParseJSON v1
json:CreateJSON v1
gateway:CustomWebHook v1
gateway:WebhookRespond v1
builtin:BasicRouter v1
builtin:BasicFeeder v1
builtin:BasicAggregator v1
http:ActionSendData v3
http:ActionSendDataBasicAuth v3
http:ActionGetFile v3
http:ActionSendDataAdvanced v3
google-sheets:ActionAddRow v1
google-sheets:ActionUpdateRow v1
google-sheets:ActionDeleteRow v1
util:SetVariable v1
util:GetVariable v1
util:SetMultipleVariables v1
slack:ActionPostMessage v1
datastore:ActionGetRecord v1
datastore:ActionAddRecord v1
datastore:ActionUpdateRecord v1
datastore:ActionDeleteRecord v1
datastore:ActionSearchRecords v1
```

Do NOT manually set versions in your blueprint — let create_scenario handle it.

---

## Full Lifecycle Example

```javascript
// 1. Check health
health_check()
// → confirms API key valid, team ID = 895750

// 2. Find a template
search_templates({query: "slack notification new order"})
// → [{id: 15, name: "Shopify → Slack order notification", ...}]

// 3. Get blueprint
get_template({id: 15})
// → returns full blueprint JSON

// 4. Validate (after editing connection IDs)
validate_scenario({blueprint: JSON.stringify(editedBlueprint)})
// → {valid: true, warnings: [...]}

// 5. Deploy
create_scenario({
  name: "Shopify Order → Slack",
  blueprint: JSON.stringify(editedBlueprint)
})
// → {scenarioId: 4799001, url: "https://eu1.make.com/..."}

// 6. Test run
run_scenario({scenarioId: 4799001})
// → triggers the scenario

// 7. Check execution
list_executions({scenarioId: 4799001})
// → shows run history, errors if any
```

---

## See Also

- [TOOL_REFERENCE.md](TOOL_REFERENCE.md) — Full parameter reference for every tool
- [SEARCH_GUIDE.md](SEARCH_GUIDE.md) — Module and template discovery strategies
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) — End-to-end deployment workflow
