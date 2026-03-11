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

Modules that DON'T need connections: `gateway:CustomWebHook`, `builtin:BasicRouter`, `builtin:BasicFeeder`, `builtin:BasicAggregator`, `json:ParseJSON`, `json:CreateJSON`, `util:SetVariable`, `util:GetVariable`, `util:SetMultipleVariables`

---

## VERIFIED MODULE VERSIONS

Always use these exact versions. `create_scenario` auto-injects them, but include them in blueprints for clarity:

```
gateway:CustomWebHook v1       gateway:WebhookRespond v1
builtin:BasicRouter v1         builtin:BasicFeeder v1
builtin:BasicAggregator v1
json:ParseJSON v1              json:CreateJSON v1
http:ActionSendData v3         http:ActionSendDataBasicAuth v3
http:ActionGetFile v3          http:ActionSendDataAdvanced v3
google-sheets:ActionAddRow v1  google-sheets:ActionUpdateRow v1
google-sheets:ActionDeleteRow v1
util:SetVariable v1            util:GetVariable v1
util:SetMultipleVariables v1
slack:ActionPostMessage v1
datastore:ActionGetRecord v1   datastore:ActionAddRecord v1
datastore:ActionUpdateRecord v1 datastore:ActionDeleteRecord v1
datastore:ActionSearchRecords v1
```

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

## See Also

- [COMMON_MODULES.md](COMMON_MODULES.md) — Full config for 20 most-used modules
- [CONNECTION_TYPES.md](CONNECTION_TYPES.md) — Connection patterns by app
- [PARAMETER_PATTERNS.md](PARAMETER_PATTERNS.md) — When to use parameters vs. mapper
