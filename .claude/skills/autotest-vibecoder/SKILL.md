---
name: autotest-vibecoder
description: Autoresearch loop for the Make MCP Vibecoder. Deploys test scenarios, detects schema errors, patches official-mcp-schemas.json and GOTCHAS.md, and iterates until a batch succeeds.
trigger: /autotest-vibecoder
---

# Autotest Vibecoder — Autoresearch Loop

You are running the **Make MCP Vibecoder autoresearch loop**. Your goal is to find and fix schema errors in the vibecoder's module database by deploying real test scenarios, observing failures, and patching the schemas with ground-truth data from the official Make MCP.

All session data is tracked via `autoresearch-tracker.ts`. Use it throughout the loop.

---

## Session Lifecycle

**Start of session:**
```bash
cd "make mcp vibecoder"
tsx src/scrapers/autoresearch-tracker.ts start-session
# → prints sessionId (e.g. session_1710600000000) — save it for the session
```

**End of session:**
```bash
tsx src/scrapers/autoresearch-tracker.ts stats
# → review stats, then:
# 1. Write session log entry to autoresearch-log.md (see Session Log Format below)
# 2. Review data/SERVER-CHANGES.md — ensure all bugs found this session have a [ ] entry
# 3. If server.ts was modified: run npm run build and note "MCP reload required" to user
```

---

## Key Files

| File | Purpose |
|------|---------|
| `data/GOTCHAS.md` | Behavioral gotchas per module — loaded at server startup into `get_module` responses |
| `data/SERVER-CHANGES.md` | **Server infrastructure change log** — pending bugs `[ ]` and applied fixes `[x]`. Write here whenever you discover a server-level issue. Another Claude instance can pick up pending items. |
| `data/autoresearch-log.md` | Session-level outcome log (successes, failures, fix summary) |
| `data/autoresearch/` | Tracker JSON files (sessions, validation-attempts, schema-corrections) |
| `data/official-mcp-schemas.json` | Ground-truth schemas — patched via `merge-schemas.ts` |

---

## Loop Protocol (6 Steps, 3–5 rounds per session)

```
PICK RECIPE → BUILD BLUEPRINT → VALIDATE → DEPLOY →
  ✓ SUCCESS → RUN → DELETE → TRACK → LOG → NEXT ROUND
  ✗ FAILURE → INVESTIGATE (official Make MCP) → FIX SCHEMAS → TRACK → REBUILD DB → RETRY
```

### Step 1 — PICK RECIPE
Choose the next recipe from the list below (skip any already completed this session).
Default to round-robin through the list, starting at the first untested recipe.

### Step 2 — BUILD BLUEPRINT
1. Call `mcp__make-vibecoder__get_module` for each module in the recipe.
2. Read the `gotchas` field in each response — follow any gotchas before building.
3. Call `mcp__make__connections_list` to get real connection IDs for the apps needed.
4. Assemble the blueprint JSON using correct module IDs, connection IDs, and parameter structure.
5. Use `on-demand` scheduling (`{"type": "on-demand"}`).

### Step 3 — VALIDATE
Call `mcp__make-vibecoder__validate_scenario` on the assembled blueprint.
Fix any validation errors before proceeding.

### Step 4 — DEPLOY
Call `mcp__make-vibecoder__create_scenario` with the validated blueprint.

### Step 5a — SUCCESS PATH
1. Call `mcp__make-vibecoder__run_scenario` on the new scenario ID (optional verification run).
2. Call `mcp__make-vibecoder__delete_scenario` with `confirm: true` to clean up.
3. **Track the attempt:**
   ```bash
   # Log a successful ValidationAttempt via the tracker (inline script or ts-node):
   tsx -e "
   import { logValidationAttempt } from './src/scrapers/autoresearch-tracker.ts';
   logValidationAttempt({
     timestamp: new Date().toISOString(),
     testCase: 'Recipe N: trigger→action',
     attemptNumber: 1,
     blueprintValid: true,
     moduleValidations: [],
     overallResult: 'success'
   });
   "
   ```
4. Move to next recipe.

### Step 5b — FAILURE PATH
1. Note the exact error message from `create_scenario`.
2. Identify the failing module.
3. **Schema Discovery** — Call the official Make MCP for ground truth:
   - `mcp__make__app-module_get` with `appName` and `moduleName`
   - `mcp__make__app-modules_list` to discover available modules for the app
4. Compare the official schema with vibecoder's `get_module` output.
5. Identify the discrepancy: missing param, wrong type, missing connection_type, wrong module ID, etc.
6. **Track the failure and correction:**
   ```bash
   tsx -e "
   import { logValidationAttempt, logSchemaCorrection, createCorrection } from './src/scrapers/autoresearch-tracker.ts';
   // Log the failed attempt
   logValidationAttempt({
     timestamp: new Date().toISOString(),
     testCase: 'Recipe N: trigger→action',
     attemptNumber: 1,
     blueprintValid: false,
     moduleValidations: [{
       module: 'moduleId',
       appName: 'app',
       moduleName: 'ModuleName',
       valid: false,
       errors: [{ field: 'fieldName', error: 'description', actual: 'x', expected: 'y' }]
     }],
     overallResult: 'failed'
   });
   // Log the correction
   logSchemaCorrection(createCorrection('moduleId', 'fieldName', 'actual', 'correct'));
   "
   ```
7. **Fix** — Choose the appropriate action:
   - **Schema discrepancy** → Run `merge-schemas.ts` then rebuild DB:
     ```bash
     cd "make mcp vibecoder"
     tsx src/scrapers/merge-schemas.ts '{"moduleId": { ... }}'
     npm run scrape
     ```
   - **Behavioral gotcha** → Append to `data/GOTCHAS.md` under the module's `## moduleId` header:
     ```
     - <observation>  [Discovered: YYYY-MM-DD]
     ```
   - **Wrong module ID** → Fix in the blueprint and add a gotcha note.
   - **Server-level bug** (wrong version registry, tool input schema, handler logic) → Add a `[ ]` entry to `data/SERVER-CHANGES.md` under "Pending Fixes" using the format in that file. If you also fix it immediately: implement the fix in `server.ts`, run `npm run build`, move entry to "Applied Fixes" and mark `[x]`, note "MCP reload required".
8. After applying schema fixes, mark corrections as applied:
   ```bash
   tsx src/scrapers/autoresearch-tracker.ts pending   # verify before marking
   tsx -e "import { markCorrectionsApplied } from './src/scrapers/autoresearch-tracker.ts'; markCorrectionsApplied();"
   ```
9. `npm run build` is NOT needed after `npm run scrape` (scrape updates the DB directly).
10. **RETRY** — Rebuild the blueprint with the fix and go back to Step 3.
11. If retry fails again, log as ✗ (unresolved) and move to next recipe.

---

## Scenario Recipes (15 starter combos)

| # | Trigger | Action | Apps |
|---|---------|--------|------|
| 1 | `gateway:CustomWebHook` | `slack:ActionPostMessage` | Slack |
| 2 | `slack:ListenForAnEvent` | `hubspotcrm:ActionCreateContact` | Slack, HubSpot |
| 3 | `gateway:CustomWebHook` | `google-sheets:addRow` | Google Sheets |
| 4 | `gateway:CustomWebHook` | `airtable:createRecord` | Airtable |
| 5 | `scheduler` (on-demand) | `gmail:ActionSendEmail` | Gmail |
| 6 | `slack:ListenForAnEvent` | `discord:ActionCreateMessage` | Slack, Discord |
| 7 | `gateway:CustomWebHook` | `http:ActionSendData` (OpenAI API) | HTTP |
| 8 | `google-sheets:GetRows` | `slack:ActionPostMessage` | Google Sheets, Slack |
| 9 | `gateway:CustomWebHook` | `trello:createCard` | Trello |
| 10 | `slack:ListenForAnEvent` | `notion:createPage` | Slack, Notion |
| 11 | `gateway:CustomWebHook` | `jira:createIssue` | Jira |
| 12 | `gateway:CustomWebHook` | `asana:createTask` | Asana |
| 13 | `gateway:CustomWebHook` | `monday:createItem` | Monday.com |
| 14 | `slack:ListenForAnEvent` | `google-calendar:createEvent` | Slack, Google Calendar |
| 15 | `gateway:CustomWebHook` | `clickup:createTask` | ClickUp |

**Skip a recipe if the required connection is not available** (check with `mcp__make__connections_list`).

---

## Schema Discovery Protocol

When a deployment fails, look up the module's ground-truth schema from the official Make MCP:

```
1. mcp__make__app-module_get  →  exact module schema with all parameters
2. mcp__make__app-modules_list  →  list modules for an app (find the right module ID)
3. Compare response with mcp__make-vibecoder__get_module output
4. Identify: missing params | wrong types | missing connection_type | wrong ID
5. Build a partial schema object (only include fields that differ or are missing)
6. Run: tsx src/scrapers/merge-schemas.ts '<JSON>'
7. Run: npm run scrape   (applies JSON enrichments to SQLite DB)
8. Re-test the same scenario
```

**The merge-schemas CLI format:**
```json
{
  "slack:ActionPostMessage": {
    "connection_type": "account:slack",
    "parameters": [
      {"name": "channel", "type": "text", "required": true, "label": "Channel ID"},
      {"name": "text", "type": "text", "required": false, "label": "Message Text"}
    ]
  }
}
```

**Export pending corrections to merge-schemas format:**
```bash
tsx src/scrapers/autoresearch-tracker.ts export > /tmp/corrections.json
tsx src/scrapers/merge-schemas.ts --file /tmp/corrections.json
npm run scrape
```

---

## Gotcha Recording Format

When a deployment fails due to a **behavioral issue** (not a missing/wrong parameter schema), record it as a gotcha:

1. Open `make mcp vibecoder/data/GOTCHAS.md`
2. Find or create the `## moduleId` section
3. Append: `- <observation>  [Discovered: YYYY-MM-DD]`
4. The server picks up gotchas at the next startup — note to user: "reload MCP server to apply"

Example gotcha entry:
```markdown
## slack:ActionPostMessage
- `channel` requires channel ID (C0123ABC456) not channel name (#general)  [Discovered: 2026-03-16]
```

---

## Session Log Format

Append to `make mcp vibecoder/data/autoresearch-log.md` at the end of each session.
Pull numbers from `tsx src/scrapers/autoresearch-tracker.ts stats`.

```markdown
## Session YYYY-MM-DD — N rounds

| Recipe | Result | Notes |
|--------|--------|-------|
| webhook→slack | ✓ | |
| slack→hubspot | ✗→✓ | Fixed: missing connection_type |
| webhook→sheets | ✓ | |

**Schemas updated:** hubspot:ActionCreateContact, ...
**Gotchas added:** N
**Final success rate:** X/Y (Z%)
```

---

## Stopping Criteria

Stop the loop when ANY of these are true:
- 3–5 rounds completed (default session size)
- All 15 recipes tested
- Same recipe fails twice after schema fix (mark unresolved, move on)
- User says stop

---

## Key Notes

- **Never use `interval`, `cron`, or `scheduled`** scheduling — always `on-demand` or `immediately`
- **Always clean up** after success — call `delete_scenario` with `confirm: true`
- **Test names** — use `[AUTOTEST] Recipe N: trigger→action` as scenario name for easy identification
- **Connection IDs** — always use real IDs from `mcp__make__connections_list`, never `__IMTCONN__`
- **Module versions** — do NOT set `"version"` in blueprint modules
- **After `npm run scrape`** — the DB is updated; no MCP server reload needed for DB changes
- **After modifying `server.ts`** — run `npm run build` AND ask user to reload MCP server
- **After modifying `GOTCHAS.md`** — ask user to reload MCP server (gotchas are loaded at startup)
- **Tracker data** lives in `data/autoresearch/` (gitignored if desired) — three JSON files: `sessions.json`, `validation-attempts.json`, `schema-corrections.json`
