# Make MCP — Deployment Guide

End-to-end workflow for going from user request to deployed Make.com scenario.

---

## Phase 1: Discovery

### Option A — Template Path (Preferred)
```javascript
// 1. Search for a matching template
search_templates({query: "webhook slack notification"})

// 2. Get the full blueprint
get_template({id: 42})
```

### Option B — Build From Scratch
```javascript
// 1. Find trigger module
search_modules({query: "shopify new order"})
// → shopify:WatchNewOrders

// 2. Find action module
search_modules({query: "slack post message"})
// → slack:ActionPostMessage

// 3. Get parameters for each
get_module({moduleId: "shopify:WatchNewOrders"})
get_module({moduleId: "slack:ActionPostMessage"})
```

---

## Phase 2: Blueprint Construction

### Minimal valid blueprint structure
```json
{
  "name": "My Automation",
  "flow": [
    {
      "id": 1,
      "module": "gateway:CustomWebHook",
      "version": 1,
      "parameters": {},
      "mapper": {}
    },
    {
      "id": 2,
      "module": "slack:ActionPostMessage",
      "version": 1,
      "parameters": {
        "__IMTCONN__": 123456
      },
      "mapper": {
        "channel": "#general",
        "text": "New event: {{1.data.message}}"
      }
    }
  ]
}
```

### Rules during construction
1. **IDs are sequential integers** starting at 1: `id: 1, 2, 3, ...`
2. **No forward references** — `{{2.field}}` cannot appear in module 1
3. **Data mapping uses module `id`** not array position: `{{1.field}}` references the module with `id: 1`
4. **Connection IDs go in `parameters`** (static): `{"__IMTCONN__": 123456}`
5. **Dynamic values go in `mapper`**: `{"text": "{{1.data.title}}"}`
6. **DO NOT set versions manually** — create_scenario handles this

---

## Phase 3: Pre-Deployment Checks

### Check 1: Account Compatibility
```javascript
check_account_compatibility({
  blueprint: JSON.stringify(myBlueprint)
})
// Look for: problematic: true (use alternative module)
// Look for: verified: false (may work, may not)
```

### Check 2: Validate the Blueprint
```javascript
validate_scenario({
  blueprint: JSON.stringify(myBlueprint)
})
// Must return: valid: true
// Fix all errors before proceeding
```

**Common fix patterns:**
```
Error: "Missing required parameter 'channel'"
Fix: Add channel to mapper: {"channel": "#general"}

Error: "Unknown module 'slack:sendMessage'"
Fix: Use correct ID: "slack:ActionPostMessage"

Error: "Forward reference: module 2 references module 3"
Fix: Reorder modules so referenced modules come before referencing ones
```

---

## Phase 4: Deployment

```javascript
create_scenario({
  name: "Shopify → Slack Order Alert",
  blueprint: JSON.stringify(validatedBlueprint),
  // teamId optional if MAKE_TEAM_ID env var is set
})
```

**If deployment fails with IM007 (module not found):**
```javascript
// The error tells you which module failed
// 1. Remove the problematic module
// 2. Or replace with an HTTP call to the same API
// 3. Re-validate and re-deploy
```

**If deployment fails with "MAKE_API_KEY not configured":**
```javascript
health_check()  // Verify API key is set
// Set MAKE_API_KEY in the .env file in make mcp/ directory
```

---

## Phase 5: Verify & Test

```javascript
// 1. Confirm scenario exists
list_scenarios()
// → find your new scenario by name

// 2. Trigger a test run
run_scenario({scenarioId: 4712345})

// 3. Check results
list_executions({scenarioId: 4712345})
// → look for status: "success" or error messages
```

---

## Updating an Existing Scenario

```javascript
// 1. Get current state
get_scenario({scenarioId: 4712345})
// → returns current blueprint JSON

// 2. Modify the blueprint
// (make your changes to the parsed JSON)

// 3. Validate the modified blueprint
validate_scenario({blueprint: JSON.stringify(modifiedBlueprint)})

// 4. Update it
update_scenario({
  scenarioId: 4712345,
  name: "Updated Name",           // optional
  blueprint: JSON.stringify(modifiedBlueprint)
})
```

---

## Connection IDs — How to Handle

Connection IDs are account-specific. You cannot know them in advance.

**In blueprints:**
- Use `__IMTCONN__` as a placeholder in examples/templates
- The actual numeric connection ID must be filled in before deployment

**How to find connection IDs:**
1. Open Make.com UI → go to Connections
2. Note the numeric ID in the connection URL
3. Or use the `connections_list` MCP tool if available

**In the blueprint:**
```json
// ❌ Template placeholder (must replace before deploying)
{"parameters": {"__IMTCONN__": "__IMTCONN__"}}

// ✅ Actual connection ID (numeric)
{"parameters": {"__IMTCONN__": 1234567}}
```

---

## Scheduling Configuration

Set scheduling in the top-level blueprint OR let it default to `on-demand`.

```json
// On-demand (manual trigger or via run_scenario)
{"scheduling": {"type": "on-demand"}}

// Webhook-triggered (scenario runs immediately on webhook data)
{"scheduling": {"type": "immediately"}}

// Scheduled (every N seconds)
{"scheduling": {"type": "indefinitely", "interval": 900}}

// NOT valid:
{"scheduling": {"type": "interval"}}  // ❌ WRONG — will cause deployment error
```

---

## Troubleshooting Quick Reference

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `MAKE_API_KEY not configured` | Missing API key | Set MAKE_API_KEY in .env |
| `IM007 Module not found` | Wrong module version | Let create_scenario auto-inject versions |
| `Missing required parameter` | Parameter not in mapper | Add param to `mapper` object |
| `Unknown module "X"` | Wrong module ID | Use search_modules to find correct ID |
| `Forward reference` | Module references later module | Reorder flow array |
| `Invalid JSON` | Blueprint not stringified | Use `JSON.stringify(blueprint)` |
| `Scenario deploys but never runs` | No trigger module | Add a trigger as the first module |
| `Router has no routes` | Empty routes array | Add at least one route with a flow |
