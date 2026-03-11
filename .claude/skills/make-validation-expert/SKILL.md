---
name: make-validation-expert
description: Expert guide for validating Make.com scenario blueprints and fixing errors. Use when validation fails, blueprint has errors, scenario won't deploy, seeing "missing parameter" or "unknown module" errors, or after any create_scenario failure. Covers every validation error type with fixes.
---

# Make Validation Expert

Interpret and fix every class of Make.com blueprint validation error.

---

## The Golden Rule

**Always run `validate_scenario` before `create_scenario`.**

```
Step 1: Validate
  mcp__claude_ai_Make__validate_blueprint_schema({blueprint: myBlueprint})
  OR validate_scenario({blueprint: JSON.stringify(myBlueprint)})

Step 2: Check result
  If valid: true → proceed to deploy
  If errors: [...] → fix each error, then re-validate

Step 3: Deploy only after valid: true
  create_scenario({name: "My Scenario", blueprint: JSON.stringify(myBlueprint)})
```

---

## Validation Result Structure

```json
{
  "valid": false,
  "errors": [
    "Flow[1] (slack:ActionPostMessage): Missing required parameter \"channel\"."
  ],
  "warnings": [
    "Flow[0] (gateway:CustomWebHook): Not in verified registry — may require manual verification.",
    "Blueprint is missing \"metadata\" section. It will be auto-injected during deployment."
  ],
  "modulesValidated": ["gateway:CustomWebHook", "slack:ActionPostMessage"],
  "accountCompatibility": {
    "liveCatalogChecked": false,
    "verifiedRegistryChecked": true,
    "incompatibleModules": []
  },
  "summary": "1 error(s) found. Fix them before deploying."
}
```

- **`errors`** = blocking — must fix before deploying
- **`warnings`** = non-blocking — review but can deploy
- **`valid: true`** = no errors (warnings OK, proceed to deploy)

---

## Error Taxonomy

### E1: Missing Required Parameter

```
Flow[1] (slack:ActionPostMessage): Missing required parameter "channel".
Flow[2] (google-sheets:ActionAddRow): Missing required parameter "spreadsheetId".
```

**Root cause:** A required field is absent from both `parameters` and `mapper`.

**Fix:**
```javascript
// Get the full parameter list
get_module({moduleId: "slack:ActionPostMessage"})
// Find the required params and add them

// Add missing param to mapper
{
  "mapper": {
    "channel": "#general",     // ← add required field
    "text": "{{1.data}}"
  }
}
```

---

### E2: Unknown Module

```
Flow[0]: Unknown module "slack:sendMessage". Use search_modules to find valid IDs.
Flow[1]: Unknown module "google:sheets_addRow". Use search_modules to find valid IDs.
```

**Root cause:** Module ID doesn't exist in the 559-module catalog.

**Fix:**
```javascript
// Search for the correct ID
search_modules({query: "slack message"})
// → slack:ActionPostMessage

// Replace in blueprint
{"module": "slack:ActionPostMessage"}  // ✅
// NOT:
{"module": "slack:sendMessage"}        // ❌
```

**Common wrong IDs and correct versions:**

| Wrong | Correct |
|-------|---------|
| `slack:sendMessage` | `slack:ActionPostMessage` |
| `google:sheets_add` | `google-sheets:ActionAddRow` |
| `http:get` | `http:ActionSendData` |
| `webhook:CustomWebhook` | `gateway:CustomWebHook` |
| `builtin:router` | `builtin:BasicRouter` |
| `builtin:iterator` | `builtin:BasicFeeder` |

---

### E3: Forward Reference

```
Module 1 (slack:ActionPostMessage): references future module 3 (google-sheets:ActionAddRow). Forward references are not allowed in Make.com.
```

**Root cause:** A module's `mapper` contains `{{3.field}}` but module 3 comes AFTER module 1.

**Fix:** Reorder the flow array so referenced modules always come before the referencing one.

```javascript
// WRONG order:
"flow": [
  {id: 1, module: "slack:...", mapper: {"text": "{{3.data}}"}},  // references id:3
  {id: 2, module: "http:..."},
  {id: 3, module: "json:ParseJSON"}  // ← this should come BEFORE id:1
]

// CORRECT order:
"flow": [
  {id: 1, module: "gateway:CustomWebHook"},  // trigger first
  {id: 2, module: "http:..."},
  {id: 3, module: "json:ParseJSON"},          // parse before using
  {id: 4, module: "slack:...", mapper: {"text": "{{3.data}}"}}  // ✅
]
```

---

### E4: Self-Reference

```
Module 2 (slack:ActionPostMessage): references itself {{2.*}}. Self-references are not allowed.
```

**Fix:** A module cannot reference its own output. Check your IML expressions and ensure you're referencing a different module's ID.

---

### E5: Module Not in Flow

```
Module 1 (slack:ActionPostMessage): references unknown module id 5. No module with that id exists in this flow.
```

**Root cause:** `{{5.field}}` used but there's no module with `id: 5` in the flow.

**Fix:** Check all `{{N.field}}` expressions and ensure `N` matches an actual module `id`.

---

### E6: Type Mismatch

```
Flow[2] (http:ActionSendData): Parameter "method" must be one of: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS. Got: get
Flow[1] (builtin:BasicAggregator): Parameter "feeder" should be number, got string.
```

**Fix:**
```javascript
// Wrong: lowercase method
{"method": "get"}

// Correct: uppercase
{"method": "GET"}

// Wrong: string feeder
{"feeder": "3"}

// Correct: number
{"feeder": 3}
```

---

### E7: Empty Flow

```
Flow array is empty. Add at least one module.
```

**Fix:** Add at least one module to the `flow` array.

---

### E8: Missing `module` Property

```
Flow[0]: Missing or invalid "module" property.
```

**Fix:**
```json
// WRONG
{"id": 1, "parameters": {}}

// CORRECT
{"id": 1, "module": "gateway:CustomWebHook", "parameters": {}, "mapper": {}}
```

---

### E9: Router Has No Routes

```
Flow[2] (builtin:BasicRouter): Router must have a "routes" array with at least one route.
```

**Fix:**
```json
{
  "id": 3,
  "module": "builtin:BasicRouter",
  "mapper": null,
  "routes": [
    {"flow": [...]},  // ← at least one route
    {"flow": [...]}
  ]
}
```

---

### E10: Module Version Mismatch (Warning)

```
Flow[1] (google-sheets:ActionAddRow): Version 2 specified but verified working version is 1. create_scenario will auto-correct this.
```

**This is a warning, not an error.** `create_scenario` will fix it automatically. But you can also fix manually:
```json
// Remove version or set to verified version
{"module": "google-sheets:ActionAddRow", "version": 1}
```

---

### E11: Problematic Module (Warning)

```
Flow[2] (openai:ActionCreateCompletion): OpenAI modules often fail via API deployment. Use http:ActionSendData (v3) to call the OpenAI API directly. Alternative: http:ActionSendData
```

**This is a warning** but deployment will likely fail. Replace with the suggested alternative.

---

## Warnings — Review But Don't Block

| Warning | Action |
|---------|--------|
| `Not in verified registry` | Try to deploy; if it fails with IM007, remove version field |
| `Missing "id" field` | Add sequential numeric id to each module |
| `Missing "metadata" section` | Safe to ignore — auto-injected during deploy |
| `First module should be a trigger` | Review if non-trigger first module is intentional |
| `Version X specified but verified is Y` | Let create_scenario auto-correct it |

---

## Post-Deployment Failures

Even with `valid: true`, deployment can fail:

### IM007: Module not found
```
Error: IM007 - Module not found: openai:ActionCreateCompletion version '1'
```
**Fix:** The module exists in our database but not in your Make account/zone. Use `check_account_compatibility` before deploying. Replace with verified alternative.

### API Key Not Set
```
Error: MAKE_API_KEY not configured
```
**Fix:** Set MAKE_API_KEY in the `.env` file. Get it from Make.com → Profile → API.

### Team ID Missing
```
Error: Team ID required
```
**Fix:** Set `MAKE_TEAM_ID` in `.env` or pass `teamId` to `create_scenario`.

### Connection ID Invalid
Scenario deploys but fails on first run with "Connection error"
**Fix:** Replace the `__IMTCONN__` placeholder with a real numeric connection ID from your Make account.

---

## See Also

- [ERROR_CATALOG.md](ERROR_CATALOG.md) — Complete error catalog with all fix patterns
- [BLUEPRINT_CHECKLIST.md](BLUEPRINT_CHECKLIST.md) — Pre-deployment checklist
