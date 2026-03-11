---
description: Create a Make.com scenario PRD from initial.md or conversation input
argument-hint: [output-filename]
---

# Create Make.com Scenario PRD

## Overview

Generate a **Make.com Scenario Product Requirements Document** that gives Claude everything it needs to build, validate, and deploy the scenario in one pass — with zero ambiguity about modules, data mapping, connections, or flow structure.

## Input Sources

Check for input in this order:

1. **`initial.md`** — If a file named `initial.md` exists in the current directory, read it first. It contains the user's initial scenario description.
2. **`$ARGUMENTS`** — If a filename argument was passed, read that file.
3. **Conversation context** — Extract requirements from the current conversation.
4. **Ask clarifying questions** — If critical information is missing after the above, ask before generating.

## Output File

Write the PRD to: `$ARGUMENTS` (default: `PRD.md`)

---

## Clarifying Questions (ask if not answerable from input)

Before generating, identify and resolve these gaps. Group them into one message — do not ask one at a time.

**Critical (must know):**
- What **triggers** the scenario? (Webhook call, new record in app X, schedule, manual)
- What **apps/services** are involved? (Source and destination)
- What is the **core action** — what should happen when it runs?

**Important (assume defaults if unclear):**
- Should it **respond** to the trigger caller or fire-and-forget?
- Are there **conditions** — does it branch based on data values?
- Does it process a **list of items** or one item per run?
- What **connections** does the user already have in Make? (Or note as placeholder)
- How often should it run / what scheduling type?

**Nice to know:**
- Any **error handling** preferences (stop on first error vs continue)?
- **Naming convention** for the deployed scenario?
- Are there specific **field names** in the trigger data to map?

---

## PRD Structure

Generate a PRD with all sections below. Depth scales with available information — be specific where you have details, flag assumptions where you don't.

---

### 1. Scenario Summary

One paragraph. What this scenario does, why it exists, and who uses it.

- **Scenario name:** (for deployment — e.g. "Typeform → HubSpot + Slack notify")
- **Trigger type:** Webhook / Polling / Scheduled / On-demand
- **Primary apps:** List every app involved
- **Estimated complexity:** Simple (2–3 modules) / Medium (4–7) / Complex (8+)
- **Pattern type:** Webhook→Action / Polling→Multi-Action / Router / Iterator+Aggregator / AI-Augmented / Data Sync

---

### 2. Trigger Definition

Define exactly how the scenario starts.

| Property | Value |
|----------|-------|
| Module ID | e.g. `gateway:CustomWebHook` or `shopify:WatchNewOrders` |
| Connection needed | Yes / No |
| Scheduling | `immediately` / `indefinitely` (interval Xs) / `on-demand` |
| Max results per run | e.g. 1, 2, 100 |
| Trigger filters | Any server-side filters on the trigger itself |

**Trigger output fields** — fields available to downstream modules as `{{1.field}}`:

List the key output fields by name and what they contain. Example:
- `{{1.data.email}}` — submitter's email address
- `{{1.data.name}}` — full name
- `{{1.total_price}}` — order total in store currency

---

### 3. Module Flow

The ordered sequence of modules in the scenario. This is the blueprint's `flow` array.

For each module:

```
Module N — [Module ID]
  Purpose: What this module does in context
  Connection: __IMTCONN__ (app: [AppName]) / none
  Key parameters: [static config values]
  Key mapper values: [dynamic IML expressions]
  Output used by: downstream module M via {{N.field}}
```

Example format:
```
Module 1 — gateway:CustomWebHook
  Purpose: Receive form submission via HTTP POST
  Connection: none
  Parameters: maxResults: 1
  Outputs used by: Module 2 ({{1.data.email}}), Module 3 ({{1.data.name}})

Module 2 — hubspotcrm:ActionCreateContact
  Purpose: Create or update contact in HubSpot
  Connection: __IMTCONN__ (app: HubSpot CRM)
  Parameters: none
  Mapper: email → {{1.data.email}}, firstname → {{1.data.name}}

Module 3 — slack:ActionPostMessage
  Purpose: Notify #leads channel of new submission
  Connection: __IMTCONN__ (app: Slack)
  Parameters: none
  Mapper: channel → #leads, text → "New lead: {{1.data.name}} ({{1.data.email}})"
```

**Flow diagram** (text):
```
[Trigger] → [Module 2] → [Module 3]
```
Or for branching:
```
[Trigger] → [Router] → Route A: [Module 3]
                      → Route B: [Module 4]
```
Or for iteration:
```
[Trigger] → [Iterator] → [Module 3] → [Aggregator] → [Module 5]
```

**Total module count:** N

---

### 4. Data Mapping Specification

The critical IML expressions connecting modules. List every field that flows from one module to another.

| Target Module | Target Field | Source Expression | Notes |
|--------------|-------------|-------------------|-------|
| Module 2 | `email` | `{{1.data.email}}` | From webhook body |
| Module 2 | `firstname` | `{{split(1.data.name, " ")[0]}}` | First word of name |
| Module 3 | `text` | `"New lead: {{1.data.name}}"` | Slack message text |

**IML transformations needed** (list any non-trivial expressions):
- Date formatting: `{{formatDate(1.created_at, "YYYY-MM-DD")}}`
- Conditionals: `{{if(1.amount > 100, "VIP", "standard")}}`
- String ops: `{{upper(1.status)}}`, `{{trim(1.email)}}`

---

### 5. Connection Requirements

Every `__IMTCONN__` placeholder that must be replaced before deploying.

| Module | App | Connection Type | Notes |
|--------|-----|----------------|-------|
| Module 2 | HubSpot CRM | OAuth 2.0 | User must have HubSpot connected in Make |
| Module 3 | Slack | OAuth 2.0 | User must have Slack workspace connected |

**Modules that need NO connection:**
- `gateway:CustomWebHook`, `gateway:WebhookRespond`
- `builtin:BasicRouter`, `builtin:BasicFeeder`, `builtin:BasicAggregator`
- `json:ParseJSON`, `json:CreateJSON`
- `http:ActionSendData` (unless using auth)
- `util:SetVariable`, `util:GetVariable`

**Steps to get connection IDs:**
```
mcp__claude_ai_Make__connections_list({teamId: YOUR_TEAM_ID})
→ Find connection by name/type → use numeric id
```

---

### 6. Router / Branching Logic (if applicable)

If the scenario includes `builtin:BasicRouter`, define each route:

**Route 1 — [Label]**
- Condition: [describe the filter condition, e.g. `{{1.total_price}} > 500`]
- Modules in route: [list module IDs]
- ⚠️ Note: Filter conditions cannot be set via API — must be configured in Make.com UI after deployment

**Route 2 — [Label]**
- Condition: [e.g. all other cases / fallthrough]
- Modules in route: [list module IDs]

---

### 7. Iterator / Aggregator Pattern (if applicable)

If the scenario processes a list of items:

- **Iterator module:** `builtin:BasicFeeder` — Module N
  - Input array: `{{X.field.items}}` (from module X)
  - Item access: `{{N.value}}`, `{{N.value.fieldname}}`

- **Processing module(s):** Module N+1, N+2...
  - Operates on each `{{N.value}}` independently

- **Aggregator module:** `builtin:BasicAggregator` — Module M
  - `"feeder": N` — references the iterator's id
  - Collects into: `{{M.array}}`

---

### 8. Scheduling & Deployment Config

| Property | Value |
|----------|-------|
| Scenario name (for API) | e.g. "Typeform → HubSpot + Slack" |
| Scheduling type | `immediately` / `indefinitely` / `on-demand` |
| Interval (if indefinitely) | e.g. 900 (15 min), 3600 (1 hr) |
| Team ID | `MAKE_TEAM_ID` from .env |
| Activate after deploy | Yes / No |

---

### 9. Template Discovery Strategy

Before building from scratch, check for existing templates:

**Primary search queries** (run in parallel):
```javascript
search_templates({query: "[keyword from scenario]"})
search_templates({category: "[relevant category]", difficulty: "beginner"})
search_templates({query: "[app1] [app2]"})
```

**Category candidates:** (pick most relevant)
`ai` | `crm` | `ecommerce` | `marketing` | `social-media` | `communication` | `project-management` | `data` | `file-management` | `automation` | `analytics` | `hr`

**Template fit criteria:**
- ✅ Use template if: same trigger type + same apps + similar flow
- ⚠️ Adapt template if: same apps but different mapping
- ❌ Build from scratch if: no matching template found

---

### 10. Known Constraints & Warnings

List every Make.com constraint that applies to this scenario:

- [ ] **Router filters** — must configure conditions in Make.com UI post-deploy (cannot set via API)
- [ ] **Connection placeholders** — all `__IMTCONN__` must be replaced with real numeric IDs
- [ ] **Scheduling** — never use `"type": "interval"` (use `"indefinitely"` with interval in seconds)
- [ ] **Version numbers** — omit `version` field; `create_scenario` auto-injects verified versions
- [ ] **Forward references** — module N cannot reference `{{M.field}}` where M > N
- [ ] **Problematic modules** — list any that apply:
  - `openai:*` modules → replace with `http:ActionSendData` → OpenAI API
  - `email:ActionSendEmail` → replace with `gmail:ActionSendEmail`
  - `ai-provider:ActionChatCompletion` → replace with `http:ActionSendData`

**App-specific notes** (add relevant ones):
- Slack: channel must start with `#` or use channel ID
- Google Sheets: `spreadsheetId` is the path, not the URL; `values` keys are column indices (`"0"` = col A)
- Webhook trigger: set scheduling to `immediately`, not `indefinitely`
- `builtin:BasicAggregator`: output is always `{{N.array}}` regardless of mapper key name

---

### 11. Blueprint Skeleton

A minimal JSON skeleton showing the structure — not the full blueprint, but enough to confirm the shape before building:

```json
{
  "name": "SCENARIO_NAME",
  "flow": [
    {"id": 1, "module": "TRIGGER_MODULE", "parameters": {}, "mapper": {}},
    {"id": 2, "module": "MODULE_2", "parameters": {"__IMTCONN__": "REPLACE"}, "mapper": {}},
    {"id": 3, "module": "MODULE_3", "parameters": {"__IMTCONN__": "REPLACE"}, "mapper": {}}
  ],
  "scheduling": {"type": "SCHEDULING_TYPE"}
}
```

**Note on `__IMTCONN__`:** Replace with real numeric connection ID. Use `connections_list` MCP tool to get IDs.

---

### 12. Validation Checklist

Before running `validate_scenario`, confirm:

- [ ] All module IDs are in `appName:ModuleName` format (lowercase app, PascalCase module)
- [ ] Module IDs exist — verify with `search_modules({query: "..."})`
- [ ] All required parameters present in `parameters` or `mapper`
- [ ] No module references a future module (`{{N.x}}` where N > current id)
- [ ] No self-references (`{{id.x}}` within same module)
- [ ] `builtin:BasicRouter` has a `routes` array with at least one route
- [ ] Scheduling type is valid (`on-demand`, `immediately`, or `indefinitely`)
- [ ] `version` field omitted from all modules

**Expected `validate_scenario` result:**
```json
{"valid": true, "errors": [], "warnings": [...]}
```
Warnings are OK — errors must be fixed before deploying.

---

### 13. Test Cases

Define what to test after deployment:

**Test case 1 — Happy path**
- Input: [describe sample trigger data or payload]
- Expected: [what should happen — which modules run, what data flows where]
- Verify with: `list_executions({scenarioId: ...})`

**Test case 2 — Edge case** (if applicable)
- Input: [edge case data — empty field, large number, special characters]
- Expected: [graceful handling]

**Manual test steps:**
1. Deploy with `create_scenario`
2. Run `run_scenario({scenarioId: ...})` or POST to webhook URL
3. Check `list_executions({scenarioId: ...})` for success/error
4. Verify output in destination app (Slack channel, Google Sheet, etc.)

---

### 14. Success Criteria

The scenario is complete when:

- [ ] Blueprint validates with `validate_scenario` returning `valid: true`
- [ ] Scenario deploys successfully via `create_scenario` (returns scenarioId + URL)
- [ ] Test run completes without errors (`list_executions` shows success)
- [ ] Data appears correctly in destination app(s)
- [ ] All `__IMTCONN__` placeholders replaced with real connection IDs
- [ ] Router filter conditions set in Make.com UI (if applicable)
- [ ] Scheduling is correct (right trigger type and interval)

---

### 15. Future Enhancements (post-MVP)

List improvements deferred from the initial build:

- Error handling / retry logic
- Notifications on failure
- Additional routing branches
- Data enrichment steps
- Archiving / logging to data store
- Rate limiting or deduplication

---

## Implementation Instructions (for Claude)

When this PRD is used to implement the scenario, follow this sequence:

```
Step 1: health_check() — verify API credentials
Step 2: Search templates in parallel (Section 9 queries)
Step 3: If template found → get_template({id}) → adapt to PRD spec
        If no template  → search_modules for each module in Section 3
Step 4: Get connection IDs → mcp__claude_ai_Make__connections_list
Step 5: Build blueprint from Section 11 skeleton + Section 3-4 details
Step 6: validate_scenario({blueprint}) → fix all errors
Step 7: create_scenario({name, blueprint}) → deploy
Step 8: run_scenario → list_executions → confirm success
```

**Key skills to invoke:**
- `make-mcp-tools-expert` — tool usage, deployment flow
- `make-blueprint-syntax` — IML expressions from Section 4
- `make-module-configuration` — Section 3 module configs, parameters vs mapper
- `make-validation-expert` — fix any errors from Section 12
- `make-workflow-patterns` — pattern identification from Section 1

---

## Output Confirmation

After writing the PRD:
1. Confirm the file path
2. List every module that will be used (module IDs)
3. List every connection required (app names)
4. Flag any assumptions made due to missing information
5. State which template search queries to try first
6. Rate implementation confidence: High / Medium / Low — with reason
