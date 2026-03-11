# Blueprint Pre-Deployment Checklist

Run through this checklist before calling `create_scenario`.

---

## Checklist

### 1. Blueprint Structure
- [ ] Blueprint has a `name` string field
- [ ] Blueprint has a `flow` array with at least 1 module
- [ ] Each flow item is an object with a `module` string

### 2. Module IDs
- [ ] All module IDs follow `appName:ModuleName` format
- [ ] No typos — verified against `search_modules` or known catalog
- [ ] No PROBLEMATIC modules: `openai:*`, `email:ActionSendEmail`, `ai-provider:*`

### 3. Module IDs (sequential)
- [ ] Each module has a numeric `id` field
- [ ] IDs are unique integers (1, 2, 3, ...)
- [ ] First module is a trigger type (or webhook)

### 4. Parameters & Mapper
- [ ] Connection IDs (`__IMTCONN__`) are in `parameters`, not `mapper`
- [ ] All required parameters are present (in either `parameters` or `mapper`)
- [ ] Enum values use exact case (`"GET"` not `"get"`)
- [ ] Numeric parameters are numbers, not strings
- [ ] Boolean parameters are `true`/`false`, not `"true"`/`"false"`

### 5. Data Mapping
- [ ] All `{{N.field}}` expressions use the correct module `id` (not array index)
- [ ] No forward references (each `{{N.field}}` refers to a module EARLIER in flow)
- [ ] No self-references (module N doesn't use `{{N.field}}`)
- [ ] Expressions use double braces: `{{` and `}}`

### 6. Router (if present)
- [ ] `builtin:BasicRouter` has a `routes` array
- [ ] Each route has a `flow` array
- [ ] Router's `mapper` is `null`
- [ ] Module IDs inside routes are unique and sequential (no ID reuse)

### 7. Scheduling
- [ ] `scheduling.type` is one of: `"on-demand"`, `"immediately"`, `"indefinitely"`
- [ ] NOT `"interval"` — invalid type
- [ ] If `"indefinitely"`, `interval` is in seconds (not minutes)

### 8. Versions
- [ ] Don't manually set `version` in blueprint (let create_scenario handle it)
- [ ] If you must set version, use verified versions (see COMMON_MODULES.md)

### 9. Metadata
- [ ] `metadata` can be omitted (auto-injected)
- [ ] If included, `metadata.designer` should have x/y coordinates for each module

### 10. Final Validation
- [ ] Run `validate_scenario({blueprint: JSON.stringify(bp)})`
- [ ] Result shows `valid: true`
- [ ] All `errors` are empty
- [ ] Reviewed all `warnings`

---

## Quick Validation Command

```javascript
const result = validate_scenario({
  blueprint: JSON.stringify(myBlueprint)
})

if (!result.valid) {
  // Print each error
  result.errors.forEach(e => console.error("ERROR:", e))
  // Don't proceed until all errors fixed
} else {
  // Safe to deploy
  create_scenario({
    name: "My Scenario",
    blueprint: JSON.stringify(myBlueprint)
  })
}
```

---

## Common Last-Minute Fixes

### Connection IDs
Replace all `"__IMTCONN__"` string placeholders with actual numeric connection IDs:
```json
// Before
{"parameters": {"__IMTCONN__": "__IMTCONN__"}}

// After
{"parameters": {"__IMTCONN__": 1234567}}
```

### Scheduling
```json
// Fix invalid
{"scheduling": {"type": "interval", "interval": 900}}

// Use valid
{"scheduling": {"type": "indefinitely", "interval": 900}}
```

### Missing trigger
```json
// First module should be a trigger
{"flow": [
  {"id": 1, "module": "gateway:CustomWebHook", "parameters": {"maxResults": 2}, "mapper": {}},
  ...
]}
```

---

## Post-Deploy Verification

After `create_scenario` succeeds:

1. `list_scenarios()` → confirm scenario appears
2. `run_scenario({scenarioId: N})` → trigger a test run
3. `list_executions({scenarioId: N})` → check for errors
4. If errors: `get_scenario({scenarioId: N})` → inspect and fix → `update_scenario`
