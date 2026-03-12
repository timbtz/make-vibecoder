# Make MCP — Full Tool Reference

Complete parameter reference for every tool in the Make.com MCP server.

---

## tools_documentation

**Purpose:** Returns full documentation for all tools. Call this first.

**Parameters:** none

**Returns:**
```json
{
  "server": {"name": "make-mcp-server", "version": "1.5.0"},
  "quickStart": [...],
  "tools": {"search_modules": "...", ...},
  "blueprintFormat": {"example": {...}},
  "tips": [...]
}
```

---

## search_modules

**Purpose:** Full-text search across 559 Make.com modules.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | ✅ | Search keyword. Use `"*"` to list all modules |
| `app` | string | ❌ | Filter by app name (e.g., `"Slack"`, `"Gmail"`) |

**Returns:**
```json
{
  "count": 8,
  "modules": [
    {
      "id": "slack:ActionPostMessage",
      "name": "Post a Message",
      "app": "Slack",
      "type": "action",
      "description": "Posts a message to a Slack channel"
    }
  ]
}
```

**Module types:** `trigger`, `action`, `search`, `instant_trigger`, `universal`, `aggregator`

**Tips:**
- Max 20 results per query; use `app` filter to narrow results
- Use `"*"` with `app` filter to see all modules for one app
- Search is FTS5 — case-insensitive, partial matches work

---

## get_module

**Purpose:** Get full parameter schema for a specific module.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `moduleId` | string | ✅ | Module ID (e.g., `"slack:ActionPostMessage"`) |
| `essentials` | boolean | ❌ | If `true`, return only required params (fewer tokens) |

**Returns:**
```json
{
  "id": "slack:ActionPostMessage",
  "name": "Post a Message",
  "app": "Slack",
  "type": "action",
  "description": "...",
  "parameters": [
    {
      "name": "channel",
      "type": "select",
      "required": true,
      "label": "Channel",
      "description": "Select or map a Slack channel"
    }
  ],
  "output_fields": [
    {"name": "ts", "type": "text", "label": "Message timestamp"},
    {"name": "channel", "type": "text", "label": "Channel ID"}
  ],
  "connection_type": "account:slack",
  "is_deprecated": false,
  "documentation": "...",
  "examples": [...]
}
```

**`output_fields`** = what `{{moduleId.field}}` can reference in downstream modules.

---

## search_module_examples

**Purpose:** Get real-world configuration examples for a module, extracted from 266 production blueprints. Use to see how a module is actually configured before building your own. Complements `get_module` (which also includes examples in non-essentials mode).

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `moduleId` | string | ✅ | Module ID (e.g., `"slack:CreateMessage"`, `"google-sheets:addRow"`) |
| `limit` | number | ❌ | Max examples to return (default: 5, max: 10) |

**Returns:**
```json
{
  "moduleId": "slack:CreateMessage",
  "count": 3,
  "note": "Real configurations from production blueprints. Sensitive values replaced with {{REDACTED}}.",
  "examples": [
    {
      "source": "blueprint:Generate sentiment analysis from product surveys.blueprint.json",
      "config": {
        "text": "New survey response!\nRating: {{35.Star Rating}}\nComment: {{35.Question_2}}",
        "channel": "DM4UHB7HT",
        "channelType": "im"
      }
    }
  ]
}
```

**When to use:**
- Before configuring a module from scratch — see what values others use
- When `get_module` returns unfamiliar parameters — examples show real usage
- To understand IML expression patterns (`{{N.field}}`) for a specific module

**Coverage:** 502 examples across 291 modules. If a module returns `count: 0`, use `get_module` for the schema.

---

## search_templates

**Purpose:** Search 266 real blueprint templates by keyword/category/difficulty.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | ❌ | Keyword search across name, description, modules |
| `category` | string | ❌ | Filter by category |
| `difficulty` | string | ❌ | Filter by difficulty level |

**Valid categories:** `ai`, `crm`, `ecommerce`, `marketing`, `social-media`, `communication`, `project-management`, `data`, `file-management`, `automation`, `analytics`, `hr`

**Valid difficulty:** `beginner`, `intermediate`, `advanced`

**Returns:**
```json
{
  "count": 5,
  "templates": [
    {
      "id": 23,
      "name": "Shopify order → Slack notification",
      "description": "Sends a Slack message for each new Shopify order",
      "category": "ecommerce",
      "difficulty": "beginner",
      "modules_used": ["shopify:WatchNewOrders", "slack:ActionPostMessage"]
    }
  ]
}
```

---

## get_template

**Purpose:** Get a complete, deployable blueprint JSON by template ID.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | number | ✅ | Template ID from `search_templates` |

**Returns:** Full blueprint JSON object with `name`, `flow`, `metadata`.

**After getting a template:**
1. Replace connection placeholders with real connection IDs
2. Update hard-coded spreadsheet IDs, channel names, etc.
3. Run `validate_scenario` before deploying

---

## list_apps

**Purpose:** List all 148 apps with module counts.

**Parameters:** none

**Returns:**
```json
{
  "count": 148,
  "apps": [
    {"name": "Slack", "modules": 12},
    {"name": "Google Sheets", "modules": 18},
    {"name": "HTTP", "modules": 4}
  ]
}
```

---

## check_account_compatibility

**Purpose:** Verify whether module IDs are available in your Make account.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `moduleIds` | string[] | ❌ | List of module IDs to check |
| `blueprint` | string | ❌ | Blueprint JSON — extracts module IDs automatically |

At least one of `moduleIds` or `blueprint` required.

**Returns:**
```json
{
  "liveCatalogChecked": false,
  "verifiedRegistryChecked": true,
  "compatible": null,
  "modules": [
    {
      "moduleId": "slack:ActionPostMessage",
      "verified": true,
      "recommendedVersion": 1,
      "problematic": false,
      "warning": null,
      "alternative": null
    }
  ],
  "summary": "1 module(s) have verified versions."
}
```

`compatible: true` = all verified, no issues
`compatible: null` = some unverified, deploy may succeed
`compatible: false` = problematic modules found

---

## validate_scenario

**Purpose:** Validate a blueprint before deploying. Always run before `create_scenario`.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `blueprint` | string | ✅ | Blueprint JSON as a **string** (use `JSON.stringify(bp)`) |

**Returns:**
```json
{
  "valid": true,
  "errors": [],
  "warnings": [
    "Module 'builtin:BasicRouter': Not in verified registry — may require manual verification."
  ],
  "modulesValidated": ["gateway:CustomWebHook", "slack:ActionPostMessage"],
  "accountCompatibility": {
    "liveCatalogChecked": false,
    "verifiedRegistryChecked": true,
    "incompatibleModules": []
  },
  "summary": "Blueprint is valid. 2 module(s) checked, 1 warning(s)."
}
```

**Rule:** If `valid: false`, fix all `errors` before proceeding.

---

## create_scenario

**Purpose:** Deploy a blueprint to Make.com via API.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Scenario name (max 500 chars) |
| `blueprint` | string | ✅ | Blueprint JSON as a **string** |
| `teamId` | number | ❌ | Make team ID (uses `MAKE_TEAM_ID` env var if omitted) |
| `folderId` | number | ❌ | Folder ID to place scenario in |

**Returns on success:**
```json
{
  "success": true,
  "scenarioId": 4712345,
  "name": "My Automation",
  "url": "https://eu1.make.com/scenarios/4712345",
  "scheduling": {"type": "on-demand"}
}
```

**Auto-healing performed:**
- Injects verified module versions
- Strips versions from unknown modules (prevents IM007)
- Auto-injects `metadata` if missing
- Auto-injects `designer` coords on each module
- Converts `builtin:Schedule` to scenario scheduling config

---

## list_scenarios

**Purpose:** List all existing scenarios in your Make account.

**Parameters:** none

**Returns:** Array of scenario objects with `id`, `name`, `scheduling`, `isActive`, `lastEdit`, `usedPackages`.

---

## get_scenario

**Purpose:** Fetch full blueprint and metadata of an existing scenario.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `scenarioId` | number | ✅ | Scenario ID from `list_scenarios` |

**Returns:** Full scenario object including `blueprint` JSON.

**Use before `update_scenario`** — always fetch current blueprint first.

---

## update_scenario

**Purpose:** Overwrite an existing scenario's blueprint, name, or scheduling.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `scenarioId` | number | ✅ | ID of scenario to update |
| `name` | string | ❌ | New name |
| `blueprint` | string | ❌ | New blueprint JSON (as string) |
| `scheduling` | object | ❌ | New scheduling config |

⚠️ This **replaces** the scenario entirely — validate first!

---

## delete_scenario

**Purpose:** Permanently delete a scenario.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `scenarioId` | number | ✅ | ID of scenario to delete |
| `confirm` | boolean | ✅ | Must be `true` — prevents accidental deletion |

⚠️ **Irreversible.** Confirm with user before calling.

---

## health_check

**Purpose:** Verify API key validity and retrieve account details.

**Parameters:** none

**Returns:** User info, available scopes, team/org IDs.

**Call this first if:** API key errors, need team/org IDs, or debugging auth issues.

---

## run_scenario

**Purpose:** Manually trigger a scenario to run immediately.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `scenarioId` | number | ✅ | Scenario to trigger |
| `data` | object | ❌ | Optional input data (for on-demand scenarios) |

**Requires** `scenarios:run` API scope.

---

## list_executions

**Purpose:** Show recent execution history for a scenario.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `scenarioId` | number | ✅ | Scenario to inspect |
| `limit` | number | ❌ | Max executions to return (default: 10) |

**Returns:** Array of executions with status, timestamp, errors, operations count.

**Use after `run_scenario`** to verify success or diagnose errors.
