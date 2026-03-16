# Server Infrastructure Change Log

Tracks server-level bugs, fixes, and required changes discovered during autoresearch sessions.
This file is the handoff document between Claude instances.

**Format rules:**
- `[ ]` = pending (not yet fixed in source code)
- `[x]` = applied (code changed, built, and deployed)
- Always include: discovery date, which session, root cause, exact file + line, fix description
- Another Claude instance can pick up any `[ ]` item and implement it end-to-end

---

## Pending Fixes

### [ ] BUG-001 — `scheduling` leaks into blueprint JSON sent to Make API
**Discovered:** 2026-03-16, Session 1 (Recipe 1: webhook→slack)
**File:** `src/mcp/server.ts` — `create_scenario` handler, `buildPayload()` (~line 1464)
**Symptom:** HTTP 400 from Make API — "should NOT have additional properties, additionalProperty: 'scheduling'"
**Root cause:** When the caller includes `"scheduling": {...}` inside the blueprint JSON string, the server parses it into `parsed`, then serializes `parsed` back into `blueprint: JSON.stringify(parsed)`. The `scheduling` key remains in the serialized string. Make's blueprint schema does NOT allow `scheduling` inside the blueprint — it must be a separate top-level field in the API payload.
**Fix:** In `create_scenario`, after parsing the blueprint and before `buildPayload()`, strip the scheduling key from the parsed object and use it as the scheduling config if present:
```typescript
// After line ~1356 (after normalizeSchedulingModules block)
if (parsed.scheduling && !schedulingConfig) {
    schedulingConfig = parsed.scheduling;
}
delete parsed.scheduling;
```
Also strip `parsed.name` and `parsed.interface` to avoid similar extra-property rejections.
**Test:** Pass a blueprint with `"scheduling": {"type": "immediately"}` — should deploy successfully and the scenario should have `immediately` scheduling.

---

### [ ] BUG-002 — Webhook-triggered scenarios always deploy with `on-demand` scheduling
**Discovered:** 2026-03-16, Session 1 (Recipe 1: webhook→slack)
**File:** `src/mcp/server.ts` — `create_scenario` handler (~line 1338)
**Symptom:** Scenarios with `gateway:CustomWebHook` as the first module are deployed with `on-demand` scheduling instead of `immediately`. They won't fire automatically on webhook events.
**Root cause:** `schedulingConfig` defaults to `{ type: 'on-demand' }`. `normalizeSchedulingModules` only changes this if a `builtin:Schedule` module is in the flow — there's no detection for webhook triggers.
**Fix:** After `normalizeSchedulingModules`, check if the first module is a known instant/webhook trigger and auto-set scheduling:
```typescript
const INSTANT_TRIGGER_MODULES = new Set([
    'gateway:CustomWebHook',
    'slack:HookNewEvent',
    'slack:HookNewEventMake',
    'telegram-bot-api:TriggerNewUpdates',
    // add others as discovered
]);
const firstModule = parsed.flow?.[0]?.module;
if (!schedulingConfig || schedulingConfig.type === 'on-demand') {
    if (firstModule && INSTANT_TRIGGER_MODULES.has(firstModule)) {
        schedulingConfig = { type: 'immediately' };
    }
}
```
Also: BUG-001's fix (reading `parsed.scheduling`) would already handle this if callers pass `scheduling` in the blueprint, making this fix the fallback for cases where they don't.
**Test:** Deploy a `gateway:CustomWebHook → slack:CreateMessage` scenario without explicit scheduling — resulting scenario should have `immediately` scheduling.

---

### [ ] BUG-003 — `get_scenario` tool rejects numeric scenarioId with type error
**Discovered:** 2026-03-16, Session 1
**File:** `src/mcp/server.ts` — `get_scenario` tool registration
**Symptom:** Calling `mcp__make-vibecoder__get_scenario` with a numeric ID (e.g. `4803076`) returns: `"Invalid input: expected number, received string"`
**Root cause:** Likely a Zod schema or MCP framework serialization issue — the tool registers `scenarioId` as `z.number()` but the MCP framework passes it as a string. Needs `.transform(Number)` or `z.coerce.number()`.
**Fix:** Find the `get_scenario` tool registration in `server.ts` and change the `scenarioId` schema:
```typescript
// Change from:
scenarioId: z.number()
// To:
scenarioId: z.coerce.number().int().positive()
```
Apply the same fix to any other tools with numeric ID parameters (e.g. `delete_scenario`, `run_scenario`, `list_executions` if they have the same issue).
**Test:** Call `get_scenario` with a known numeric scenario ID — should return the blueprint without errors.

---

### [ ] SCHEMA-001 — `slack:ActionPostMessage` stub remains in scrape-modules.ts catalog
**Discovered:** 2026-03-16, Session 1
**File:** `src/scrapers/scrape-modules.ts` — `getModuleCatalog()` array
**Symptom:** `search_modules` and `get_module` return `slack:ActionPostMessage` as a valid module, but it doesn't exist in Make.com (real module: `slack:CreateMessage` v4).
**Root cause:** Hand-written catalog entry was created with the wrong module ID. The `official-mcp-schemas.json` has been updated with `slack:CreateMessage`, but the old `slack:ActionPostMessage` stub still exists in `scrape-modules.ts` and the DB.
**Fix:**
1. Search `scrape-modules.ts` for `slack:ActionPostMessage` and rename to `slack:CreateMessage`
2. Update parameters to match official schema (mapper fields: `type`, `channelId`, `text`)
3. Run `npm run scrape` to rebuild the DB
**Note:** `official-mcp-schemas.json` already has the correct `slack:CreateMessage` entry — the scrape will apply it via the enrichment pipeline.

---

### [ ] SCHEMA-002 — Many real Slack modules missing from catalog
**Discovered:** 2026-03-16, Session 1 (via `mcp__make__app-modules_list`)
**Context:** The official Make MCP lists 28 Slack modules for `slack@2`. The vibecoder catalog likely only has a small subset under incorrect IDs.
**Known correct module IDs (from official MCP, slack@2):**
```
slack:TriggerNewMessage       (Watch messages)
slack:TriggerNewFile          (Watch files)
slack:TriggerNewUser          (Watch users)
slack:HookNewEvent            (Listen for new events — instant trigger)
slack:ActionCreateMessage     (Create a message — NOTE: blueprint uses slack:CreateMessage)
slack:ActionUpdateMessage     (Update a message)
slack:ActionDeleteMessage     (Delete a message)
slack:ActionUploadFile        (Upload a file)
slack:ActionCreateChannel     (Create a channel)
slack:ActionListChannels      (List public channels)
slack:ActionListUsers         (List users)
slack:ActionSearchMessages    (Search messages)
slack:ActionSetStatus         (Set a status)
```
**Fix:** For each module, call `mcp__make__app-module_get` (org: 6367982, app: slack, version: 2) to get full parameter schemas, then run `tsx src/scrapers/merge-schemas.ts` with the results.

---

### [ ] INFRA-001 — `VERIFIED_MODULE_VERSIONS` is incomplete — causes HTTP 500 for unknown modules
**Discovered:** 2026-03-16, Session 1
**File:** `src/mcp/server.ts` — `VERIFIED_MODULE_VERSIONS` constant (~line 96)
**Root cause:** Any module not in this registry has its version stripped before sending to Make's API. Make's DB has NOT NULL on the module version field → HTTP 500 (Postgres 23502).
**Current entries:** 17 modules (JSON, gateway, builtin, http, google-sheets, util, slack:CreateMessage)
**Needed approach:** For every new module tested in the autoresearch loop, confirm its version from an existing blueprint (via `mcp__make__scenarios_get`) or from `mcp__make__app-modules_list`, then add to registry.
**Known missing (high priority from recipe list):**
```typescript
'google-sheets:addRow': ?,        // verify version from existing scenario blueprint
'hubspotcrm:createContact': 2,    // confirmed from blueprint 4803076
'slack:CreateMessage': 4,         // ✅ already applied (2026-03-16)
```

---

## Applied Fixes

### [x] FIX-001 — Wrong Slack module in VERIFIED_MODULE_VERSIONS
**Applied:** 2026-03-16, Session 1
**File:** `src/mcp/server.ts` line ~122
**Change:** `'slack:ActionPostMessage': 1` → `'slack:CreateMessage': 4`
**Built:** Yes (`npm run build` — clean)
**MCP reload required:** Yes — pending user reload

---

### [x] FIX-002 — Added `slack:CreateMessage` to official-mcp-schemas.json
**Applied:** 2026-03-16, Session 1
**Tool:** `tsx src/scrapers/merge-schemas.ts`
**Fields added:** `connection_type: "account:slack"`, `parameters` (type, channelId), `output_fields` (ts, channel)
**Scrape run:** Yes

---

### [x] FIX-003 — Added gotchas for slack:CreateMessage, gateway:CustomWebHook, slack:ActionPostMessage
**Applied:** 2026-03-16, Session 1
**File:** `data/GOTCHAS.md`
**Entries:** Wrong module ID warning, version requirement, mapper field format, blueprint scheduling rules

---

## How to use this file

**During autoresearch sessions:**
1. When you discover a server bug → add a `[ ]` entry under Pending Fixes
2. When you fix something in server.ts → move it to Applied Fixes and mark `[x]`
3. When a schema is wrong (not a server bug) → add to SCHEMA-* section
4. After `npm run build` → note "Built: Yes" on the fix entry
5. After MCP server reload → note "MCP reload: done"

**For a dedicated server-fix session (another Claude instance):**
1. Read this file
2. Pick the highest-priority `[ ]` items
3. Implement the fix in `src/mcp/server.ts`
4. Run `npm run build`
5. Move entry to Applied Fixes
6. Tell the user to reload the MCP server
