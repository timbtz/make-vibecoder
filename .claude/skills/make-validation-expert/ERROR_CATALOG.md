# Error Catalog — Every Validation Error + Fix

Full catalog of all validation errors and warnings with root causes and fixes.

---

## Structure of Error Messages

Error messages follow this format:
```
Flow[N] (module:ID): Error description.
```
Where `N` is the 0-based index in the flow array, and `module:ID` is the module identifier.

For nested routes:
```
Flow[2].routes[0].Flow[1] (module:ID): Error description.
```

---

## BLOCKING ERRORS (must fix before deploying)

---

### `Missing required parameter "X"`

**Message:** `Flow[1] (slack:ActionPostMessage): Missing required parameter "channel".`

**Root cause:** A required parameter is absent from both `parameters` and `mapper`.

**Fix:** Add the missing parameter. Check where it belongs:
- If it's a connection or static config → add to `parameters`
- If it's a dynamic value → add to `mapper`

```javascript
// Find what's required
get_module({moduleId: "slack:ActionPostMessage", essentials: true})
// → shows only required params

// Fix: add to mapper
{"mapper": {"channel": "#general", "text": "{{1.data}}"}}
```

---

### `Unknown module "X". Use search_modules to find valid IDs.`

**Message:** `Flow[0]: Unknown module "slack:sendMessage". Use search_modules to find valid IDs.`

**Root cause:** Module ID not in the 559-module catalog. Usually a typo or wrong format.

**Fix:**
```javascript
search_modules({query: "slack send"})
// → slack:ActionPostMessage ✅
```

Module ID format: `appName:PascalCaseAction`

---

### `Forward references are not allowed in Make.com`

**Message:** `Module 1 (slack:ActionPostMessage) references future module 3 (json:ParseJSON). Forward references are not allowed in Make.com.`

**Root cause:** `{{3.data}}` in module 1, but module 3 is after module 1 in the flow.

**Fix:** Reorder flow so referenced modules appear BEFORE the referencing module.

---

### `references itself {{N.*}}. Self-references are not allowed.`

**Message:** `Module 2 (slack:ActionPostMessage): references itself {{2.*}}. Self-references are not allowed.`

**Fix:** Change `{{2.field}}` to reference a DIFFERENT module's ID.

---

### `references unknown module id N`

**Message:** `Module 1 (slack:ActionPostMessage) references unknown module id 5. No module with that id exists in this flow.`

**Fix:** Either add the missing module, or update the IML expression to reference an existing module ID.

---

### `Flow array is empty. Add at least one module.`

**Fix:**
```json
{"flow": [
  {"id": 1, "module": "gateway:CustomWebHook", "parameters": {}, "mapper": {}}
]}
```

---

### `Blueprint must contain a "flow" array of modules.`

**Message:** `Blueprint must contain a "flow" array of modules.`

**Root cause:** The blueprint JSON has no `flow` property or it's not an array.

**Fix:**
```json
{
  "name": "My Scenario",
  "flow": [...]   // ← required
}
```

---

### `Each flow item must be an object.`

**Fix:** Ensure every element in the `flow` array is an object `{}`, not a string, number, or null.

---

### `Missing or invalid "module" property.`

**Fix:** Every flow item must have a `module` string property:
```json
{"id": 1, "module": "gateway:CustomWebHook", ...}
```

---

### `Router must have a "routes" array with at least one route.`

**Fix:**
```json
{
  "id": 3,
  "module": "builtin:BasicRouter",
  "mapper": null,
  "routes": [
    {"flow": [{"id": 4, "module": "slack:ActionPostMessage", ...}]},
    {"flow": [{"id": 5, "module": "gmail:ActionSendEmail", ...}]}
  ]
}
```

---

### `Parameter "X" must be one of: A, B, C. Got: Y`

**Message:** `Flow[1] (http:ActionSendData): Parameter "method" must be one of: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS. Got: get`

**Root cause:** Enum value is wrong. Make is case-sensitive for enums.

**Fix:**
```json
// Wrong
{"method": "get"}

// Correct
{"method": "GET"}
```

Other common enum issues:
- `"bodyType"` must be: `"raw"`, `"x_www_form_urlencoded"`, `"multipart_form_data"`, `"json"`
- `"valueInputOption"` must be: `"USER_ENTERED"`, `"RAW"`, `"FORMULA"`
- `"dateTimeRenderOption"` must be: `"SERIAL_NUMBER"`, `"FORMATTED_STRING"`

---

### `Parameter "X" should be number, got string.`

**Fix:** Remove quotes from numeric values:
```json
// Wrong
{"feeder": "3"}

// Correct
{"feeder": 3}
```

---

### `Parameter "X" should be boolean, got string.`

**Fix:**
```json
// Wrong
{"parseResponse": "true"}

// Correct
{"parseResponse": true}
```

---

### `Module "X" is not available in this Make account/region. Suggested replacement: "Y".`

**Root cause:** Live catalog check found the module doesn't exist in the account.

**Fix:** Use the suggested replacement module, or use `http:ActionSendData` to call the API directly.

---

### `Invalid JSON. Ensure the blueprint is valid JSON.`

**Root cause:** The `blueprint` parameter wasn't properly stringified.

**Fix:**
```javascript
// Wrong
validate_scenario({blueprint: myBlueprintObject})

// Correct
validate_scenario({blueprint: JSON.stringify(myBlueprintObject)})
```

---

## NON-BLOCKING WARNINGS (review but can deploy)

---

### `Not in verified registry — may require manual verification.`

**Meaning:** Module not in VERIFIED_MODULE_VERSIONS. May work, may fail with IM007.

**Action:** Try deploying. If IM007 error:
1. Don't set a version in blueprint (let create_scenario handle it)
2. Or replace with an HTTP call to the same API

---

### `Module "X": Not in verified registry — deploy will attempt but may fail`

Same as above.

---

### `Missing "id" field. Each module should have a unique numeric ID.`

**Warning:** Module doesn't have an `id` field.

**Action:** Add sequential numeric IDs (required for `{{N.field}}` mapping to work):
```json
{"id": 1, "module": "gateway:CustomWebHook", ...}
{"id": 2, "module": "slack:ActionPostMessage", ...}
```

---

### `Version X specified but verified working version is Y. create_scenario will auto-correct this.`

**Action:** No action needed — create_scenario fixes this automatically. Or update manually to the verified version.

---

### `Module "version" is set in blueprint. This can trigger IM007 for unverified modules; create_scenario will strip it.`

**Action:** Remove the `version` field from unverified modules in your blueprint. `create_scenario` handles versions automatically.

---

### `Blueprint is missing "metadata" section. It will be auto-injected during deployment.`

**Action:** No action needed. `create_scenario` injects this automatically:
```json
{
  "metadata": {
    "version": 1,
    "scenario": {
      "roundtrips": 1, "maxErrors": 3, "autoCommit": true
    }
  }
}
```

---

### `First module should typically be a trigger.`

**Meaning:** The first module in the flow is not a trigger type.

**Action:** Review if intentional. Usually the first module should be:
- `gateway:CustomWebHook` (webhook trigger)
- `shopify:WatchNewOrders` (polling trigger)
- `gmail:WatchEmails` (polling trigger)
- etc.

---

### `Expression {{N.field}} references non-existent module N.`

**Meaning:** An IML expression references a module position that doesn't exist.

**Note:** Expression validation uses 0-based position, but Make.com IML uses the module's `id` field value. This warning may be a false positive if your module IDs aren't sequential starting at 0.

**Action:** Ensure all `{{N.field}}` expressions use the correct module `id` value.

---

### `Potentially malformed expression in "X".`

**Meaning:** Detected single braces `{field}`, triple braces `{{{field}}}`, or non-numeric start `{{field.name}}`.

**Fix:** Make.com expressions must be `{{N.field}}` where N is a positive integer:
```
✅ {{1.email}}
✅ {{3.data.name}}
❌ {1.email}      (single brace)
❌ {{{1.email}}}  (triple brace)
❌ {{email}}      (no module number)
```

---

### `OpenAI modules often fail via API deployment. Alternative: http:ActionSendData`

**Action:** Replace with `http:ActionSendData` (v3) calling OpenAI API directly:
```json
{
  "url": "https://api.openai.com/v1/chat/completions",
  "method": "POST",
  "headers": [{"name": "Authorization", "value": "Bearer sk-..."}],
  "body": "{\"model\": \"gpt-4o\", \"messages\": [{\"role\": \"user\", \"content\": \"...\"}]}",
  "bodyType": "raw",
  "parseResponse": true
}
```
