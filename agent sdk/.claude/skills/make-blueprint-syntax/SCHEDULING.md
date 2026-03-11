# Scheduling Configuration

Reference for all Make.com scenario scheduling types and configurations.

---

## Valid Scheduling Types

Only three scheduling types are valid. **Never use anything else.**

| Type | Description | Use When |
|------|-------------|---------|
| `on-demand` | Runs only when manually triggered or via `run_scenario` | Batch jobs, testing, one-off tasks |
| `immediately` | Runs immediately when trigger fires (webhook-based) | Webhook triggers, instant triggers |
| `indefinitely` | Runs on a fixed interval (polling) | Watching for new data, scheduled tasks |

❌ **INVALID types that will fail:** `interval`, `scheduled`, `cron`, `periodic`, `recurring`, `hourly`, `daily`

---

## Type: `on-demand`

Runs only when manually triggered.

```json
{"scheduling": {"type": "on-demand"}}
```

**When to use:**
- Testing scenarios
- Scenarios triggered via `run_scenario` API
- Batch jobs you run manually
- Scenarios triggered by another scenario

**Default:** If you don't set scheduling, it defaults to `on-demand`.

---

## Type: `immediately`

Runs immediately when the trigger fires (webhook/instant trigger).

```json
{"scheduling": {"type": "immediately"}}
```

```json
// With optional rate limiting
{"scheduling": {"type": "immediately", "maximum_runs_per_minute": 60}}
```

**When to use:**
- `gateway:CustomWebHook` (webhook trigger)
- Instant trigger modules (Slack events, form submissions in real-time)
- Any scenario where latency matters

**Notes:**
- Must be used with webhook/instant triggers
- `maximum_runs_per_minute: null` = unlimited
- Real Make.com accounts from the Slack Data Model Analyst scenario: `{"type": "immediately", "maximum_runs_per_minute": null}`

---

## Type: `indefinitely`

Runs on a fixed schedule. Interval is in **seconds**.

```json
{"scheduling": {"type": "indefinitely", "interval": 900}}
```

**Common intervals:**

| Interval Value | Description |
|---------------|-------------|
| `60` | Every 1 minute |
| `300` | Every 5 minutes |
| `900` | Every 15 minutes (default) |
| `1800` | Every 30 minutes |
| `3600` | Every 1 hour |
| `7200` | Every 2 hours |
| `21600` | Every 6 hours |
| `43200` | Every 12 hours |
| `86400` | Every 1 day |
| `604800` | Every 1 week |

**When to use:**
- Polling triggers (`shopify:WatchNewOrders`, `gmail:WatchEmails`)
- Scheduled data syncs
- Regular report generation

**Notes:**
- Make.com's minimum interval depends on your plan (typically 1 minute minimum)
- The server converts `builtin:Schedule` modules to `indefinitely` scheduling automatically

---

## Scheduling in Blueprint vs. Separate Parameter

The `create_scenario` tool accepts an optional `scheduling` at top level, but the standard pattern is to include it in the blueprint:

### In the blueprint (recommended)
```json
{
  "name": "My Scenario",
  "flow": [...],
  "scheduling": {"type": "indefinitely", "interval": 3600}
}
```

### Via create_scenario (if blueprint has no scheduling)
```javascript
create_scenario({
  name: "My Scenario",
  blueprint: JSON.stringify(blueprint),
  // scheduling defaults to on-demand if not in blueprint
})
```

---

## Real Examples from Production Scenarios

From `list_scenarios()` on a live Make account:

```json
// Slack Data Model Analyst (webhook-triggered)
{"type": "immediately", "maximum_runs_per_minute": null}

// Setup/Update Knowledge about Database (on-demand batch job)
{"type": "on-demand"}

// Summarize website content (immediate webhook)
{"type": "immediately"}
```

---

## Scheduling and Triggers — Compatibility Matrix

| Trigger Module | Required Scheduling |
|---------------|--------------------:|
| `gateway:CustomWebHook` | `immediately` |
| `shopify:WatchNewOrders` | `indefinitely` with interval |
| `gmail:WatchEmails` | `indefinitely` with interval |
| `typeform:WatchResponses` | `indefinitely` with interval |
| `google-forms:watchRows` | `indefinitely` with interval |
| `airtable:WatchRecords` | `indefinitely` with interval |
| `salesforce:WatchNewRecords` | `indefinitely` with interval |
| No trigger (starts with action) | `on-demand` |

---

## Scheduling Auto-Normalization

The `create_scenario` tool auto-converts `builtin:Schedule` modules:

If your blueprint includes a `builtin:Schedule` module (e.g., copied from a template):
```json
{
  "id": 1,
  "module": "builtin:Schedule",
  "parameters": {"interval": "every 15 minutes"}
}
```

`create_scenario` automatically:
1. Removes the `builtin:Schedule` module from the flow
2. Sets scheduling to `{"type": "indefinitely", "interval": 900}`

This prevents deployment failures with the Schedule module.

---

## Scheduling Anti-Patterns

```json
// ❌ Wrong type names
{"type": "interval"}
{"type": "scheduled"}
{"type": "cron"}
{"type": "15 minutes"}
{"type": "every_hour"}

// ❌ Interval in minutes (should be seconds)
{"type": "indefinitely", "interval": 15}   // means 15 SECONDS, not 15 minutes!

// ✅ Correct: 15 minutes in seconds
{"type": "indefinitely", "interval": 900}

// ❌ Using immediately with polling trigger
// (polling triggers need indefinitely, not immediately)
{"type": "immediately"}   // wrong for shopify:WatchNewOrders

// ✅ Correct for Shopify
{"type": "indefinitely", "interval": 900}
```
