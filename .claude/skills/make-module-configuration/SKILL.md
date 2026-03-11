---
name: make-module-configuration
description: Expert knowledge of Make.com module anatomy, parameter structure, and connection patterns. Use when configuring a specific module, understanding what parameters it needs, debugging module configuration errors, or figuring out what connection type to use for Slack, Google Sheets, HTTP, webhooks, or any Make.com app.
---

# Make Module Configuration Expert

Deep reference for correctly configuring Make.com modules in blueprints.

---

## Module ID Format

Every Make.com module follows this pattern:

```
appName:ModuleName
```

- **appName** is lowercase with hyphens: `google-sheets`, `openai-gpt-3`, `anthropic-claude`
- **ModuleName** is PascalCase: `ActionPostMessage`, `WatchNewOrders`, `ActionAddRow`

```
✅ slack:ActionPostMessage
✅ google-sheets:ActionAddRow
✅ http:ActionSendData
✅ gateway:CustomWebHook
✅ builtin:BasicRouter

❌ Slack:postMessage          (wrong casing)
❌ GoogleSheets:AddRow        (wrong app name format)
❌ http:sendData              (wrong module name casing)
```

---

## Module Anatomy — The Two Config Sections

Every module node in a blueprint has two configuration sections:

### `parameters` — Static configuration (connection + app-level settings)
These are values configured ONCE when setting up the module, not per-run.
They do NOT change based on data flowing through the scenario.

```json
{
  "parameters": {
    "__IMTCONN__": 1234567,      // Connection ID (account-specific)
    "spreadsheetId": "/path/to/spreadsheet",  // Which spreadsheet to use
    "sheetName": "Sheet1"         // Which tab
  }
}
```

### `mapper` — Dynamic values (data mapping + IML expressions)
These can contain `{{moduleId.field}}` expressions that reference previous modules.
They change each time the scenario runs.

```json
{
  "mapper": {
    "channel": "#general",              // Static text is fine here too
    "text": "New order: {{1.name}}",    // IML expression from module 1
    "amount": "{{1.total_price}}"       // Another IML expression
  }
}
```

### Key Rule: Static vs. Dynamic

| Put in `parameters` | Put in `mapper` |
|---------------------|-----------------|
| Connection IDs | Dynamic field values |
| Static config (spreadsheet ID, sheet name) | IML expressions `{{N.field}}` |
| Select/enum values | User-supplied text templates |
| Boolean flags | Computed or mapped values |

⚠️ **Common mistake:** Putting connection IDs in `mapper` instead of `parameters`. Connection config goes in `parameters`.

---

## Connection Pattern — `__IMTCONN__`

Most modules need a connection (OAuth credentials). The pattern is:

```json
{
  "parameters": {
    "__IMTCONN__": 1234567
  }
}
```

Where `1234567` is the numeric ID of the user's connection in their Make account.

**In templates and examples:** Use `__IMTCONN__` as a placeholder:
```json
{"parameters": {"__IMTCONN__": "__IMTCONN__"}}
```

The user replaces this with their actual connection ID before deploying.

Modules that DON'T need connections: `gateway:CustomWebHook`, `gateway:WebhookRespond`, `builtin:BasicRouter`, `builtin:BasicFeeder`, `builtin:BasicAggregator`, `json:ParseJSON`, `json:CreateJSON`, `util:SetVariable`, `util:GetVariable`, `util:SetMultipleVariables`

---

## MODULE VERSIONS

**Omit `version` in blueprints. `create_scenario` auto-injects verified versions.** Do not hardcode version numbers in your blueprints — let the server handle it.

For the canonical verified versions list, see [make-mcp-tools-expert VERIFIED MODULE VERSIONS](../make-mcp-tools-expert/SKILL.md).

**Version conflict rule:** If you see a version mismatch warning during validation, it's non-blocking — `create_scenario` auto-corrects it.

---

## PROBLEMATIC MODULES — Avoid These

| Module | Problem | Use Instead |
|--------|---------|-------------|
| `openai:ActionCreateCompletion` | Fails via API deployment | `http:ActionSendData` (v3) → OpenAI API |
| `openai-gpt-3:ActionCreateChatCompletion` | Fails via API deployment | `http:ActionSendData` (v3) → OpenAI API |
| `openai:ActionAnalyzeImages` | Fails via API deployment | `http:ActionSendData` → OpenAI vision API |
| `email:ActionSendEmail` | Not universally available | `gmail:ActionSendEmail` or SMTP |
| `ai-provider:ActionChatCompletion` | Not deployable via API | `http:ActionSendData` → any AI API |

---

## Top Module Configurations

See [COMMON_MODULES.md](COMMON_MODULES.md) for full configuration examples for the 20 most-used modules.

---

## Module Types

| Type | Description | Example |
|------|-------------|---------|
| `trigger` | Starts scenario, watches for new data | `shopify:WatchNewOrders` |
| `instant_trigger` | Webhook-based trigger | `gateway:CustomWebHook` |
| `action` | Performs one operation, returns result | `slack:ActionPostMessage` |
| `search` | Returns multiple results (iterates) | `google-sheets:ActionSearchRows` |
| `aggregator` | Collects multiple items into one | `builtin:BasicAggregator` |

**Rule:** First module in a flow must be a trigger or instant_trigger.

---

## Output Fields — What Can Be Referenced

Every module exposes `output_fields` — the fields that downstream modules can reference with `{{moduleId.field}}`.

```javascript
// Get available output fields
get_module({moduleId: "shopify:WatchNewOrders"})
// output_fields: [
//   {name: "id", label: "Order ID"},
//   {name: "total_price", label: "Total Price"},
//   {name: "customer.email", label: "Customer Email"},
//   ...
// ]
```

In the next module, reference them:
```json
{
  "mapper": {
    "text": "Order #{{1.id}} for ${{1.total_price}} from {{1.customer.email}}"
  }
}
```

---

## How to Find Your Connection ID

Every module with `__IMTCONN__` needs a real numeric connection ID from your Make account.

```
Step 1: List your connections
  mcp__claude_ai_Make__connections_list({teamId: 895750})
  → [{id: 1234567, name: "My Slack workspace", type: "slack"}, ...]

Step 2: Find the right connection by name/type
  Use the numeric id value

Step 3: Replace __IMTCONN__ placeholder
  {"parameters": {"__IMTCONN__": 1234567}}
```

**Connection not listed?** The user hasn't connected that app yet in Make.com. They need to go to Make.com → Connections → Add Connection.

---

## 5-Second Config Quick Reference

### Webhook trigger (no connection needed)
```json
{"id": 1, "module": "gateway:CustomWebHook", "parameters": {"maxResults": 1}, "mapper": {}}
```

### Slack post message
```json
{"id": 2, "module": "slack:ActionPostMessage",
 "parameters": {"__IMTCONN__": 1234567},
 "mapper": {"channel": "#general", "text": "{{1.data.message}}"}}
```

### Google Sheets add row
```json
{"id": 3, "module": "google-sheets:ActionAddRow",
 "parameters": {"__IMTCONN__": 1234567},
 "mapper": {"spreadsheetId": "/Sheet Name", "sheetName": "Sheet1",
            "values": {"0": "{{1.name}}", "1": "{{1.email}}"}}}
```
`values` keys are column indices: `"0"` = column A, `"1"` = column B, etc.

### HTTP request (no connection needed)
```json
{"id": 4, "module": "http:ActionSendData", "parameters": {},
 "mapper": {"url": "https://api.example.com/endpoint", "method": "POST",
            "headers": [{"name": "Authorization", "value": "Bearer {{1.apiKey}}"}],
            "body": "{\"key\": \"{{1.value}}\"}", "bodyType": "raw", "parseResponse": true}}
```

---

## See Also

- [COMMON_MODULES.md](COMMON_MODULES.md) — Full config for 20 most-used modules
- [CONNECTION_TYPES.md](CONNECTION_TYPES.md) — Connection patterns by app
- [PARAMETER_PATTERNS.md](PARAMETER_PATTERNS.md) — When to use parameters vs. mapper
