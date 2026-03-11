---
name: make-blueprint-syntax
description: Deep reference for Make.com blueprint JSON format and IML (Integrated Mapping Language) data mapping. Use when writing or editing blueprint JSON, using {{...}} data mapping expressions, configuring flow control modules (Router, Iterator, Aggregator), setting up scheduling, or understanding the full blueprint schema.
---

# Make Blueprint Syntax

Deep reference for Make.com blueprint JSON structure and IML data mapping.

---

## Full Blueprint Schema

```json
{
  "name": "Scenario Name",
  "flow": [
    // Array of module nodes — see module node schema below
  ],
  "metadata": {
    "version": 1,
    "scenario": {
      "roundtrips": 1,
      "maxErrors": 3,
      "autoCommit": true,
      "autoCommitTriggerLast": true,
      "sequential": false,
      "confidential": false,
      "dataloss": false,
      "dlq": false,
      "freshVariables": false
    },
    "designer": {
      "orphans": []
    }
  },
  "scheduling": {
    "type": "on-demand"
  }
}
```

**Notes:**
- `metadata` is **optional** — `create_scenario` auto-injects it if missing
- `scheduling` should be set in the top-level blueprint, not inside metadata
- `name` is required by `create_scenario`

---

## Module Node Schema

```json
{
  "id": 1,                           // Required: unique sequential integer
  "module": "slack:ActionPostMessage", // Required: app:ModuleName format
  "version": 1,                       // Optional: omit; create_scenario manages this
  "parameters": {
    "__IMTCONN__": 1234567,           // Static config: connection ID, selects, flags
    "spreadsheetId": "/path/to/file"
  },
  "mapper": {
    "channel": "#general",            // Dynamic values, can contain {{N.field}}
    "text": "Order: {{1.id}}"
  },
  "metadata": {                       // Optional: UI layout info
    "designer": {"x": 300, "y": 0}
  }
}
```

**`id` field rules:**
- Must be a unique positive integer
- Sequential starting at 1: 1, 2, 3, ...
- Used in IML expressions: `{{1.field}}`, `{{2.data}}`
- IDs inside router routes continue the main sequence (no reuse)

---

## IML Data Mapping Syntax

IML = Integrated Mapping Language — Make.com's expression language.

### Basic Expression
```
{{moduleId.fieldName}}
```

Where `moduleId` is the integer `id` of the module you're referencing.

### Examples
```
{{1.data}}                    // Full data from module 1
{{1.customer.email}}          // Nested field
{{1.items[0].name}}           // First array item's name
{{1.headers.content-type}}    // Header value
{{2.choices[0].message.content}}  // OpenAI response
```

### Nested Object Access
```
{{1.address.street}}
{{1.user.profile.avatar_url}}
```

### Array Access
```
{{1.items[0]}}        // First item
{{1.items[0].name}}   // Field from first item
{{length(1.items)}}   // Array length
```

---

## Built-in Variables

| Variable | Description |
|----------|-------------|
| `{{now}}` | Current timestamp (ISO 8601) |
| `{{timestamp}}` | Unix timestamp (seconds) |
| `{{random}}` | Random decimal 0–1 |
| `{{uuid}}` | Random UUID v4 |

---

## IML Functions Reference

See [DATA_MAPPING.md](DATA_MAPPING.md) for the full function reference.

### String Functions
```
{{trim("  hello  ")}}              → "hello"
{{lower("HELLO")}}                 → "hello"
{{upper("hello")}}                 → "HELLO"
{{replace("hello world", "world", "Make")}} → "hello Make"
{{contains("hello", "ell")}}       → true
{{length("hello")}}                → 5
{{split("a,b,c", ",")}}           → ["a","b","c"]
{{join(array, ", ")}}              → "a, b, c"
{{substring("hello", 0, 3)}}       → "hel"
{{md5("text")}}                    → MD5 hash
{{base64("text")}}                 → base64 encoded
```

### Number Functions
```
{{add(1, 2)}}        → 3
{{subtract(10, 3)}}  → 7
{{multiply(4, 5)}}   → 20
{{divide(10, 4)}}    → 2.5
{{ceil(2.3)}}        → 3
{{floor(2.8)}}       → 2
{{round(2.5)}}       → 3
{{abs(-5)}}          → 5
{{max(1, 5, 3)}}     → 5
{{min(1, 5, 3)}}     → 1
{{sum(array)}}       → sum of array numbers
```

### Date Functions
```
{{formatDate(now, "YYYY-MM-DD")}}           → "2026-03-11"
{{formatDate(now, "DD/MM/YYYY HH:mm")}}     → "11/03/2026 14:30"
{{parseDate("2026-03-11", "YYYY-MM-DD")}}   → timestamp
{{addDays(now, 7)}}                          → 7 days from now
{{addHours(now, 24)}}                        → 24 hours from now
{{dateDifference(date1, date2, "days")}}     → difference in days
```

### Conditional / Logic
```
{{if(condition, trueValue, falseValue)}}
{{if(1.status == "active", "yes", "no")}}
{{if(1.amount > 100, "high", "low")}}
{{ifempty(1.field, "default")}}   → value or "default" if empty
```
Inside `{{...}}`, reference module fields without extra braces: `1.field`, not `{{1.field}}`.

### Type Conversion
```
{{toString(123)}}      → "123"
{{toNumber("42")}}     → 42
{{toBool("true")}}     → true
{{parseJSON(string)}}  → parsed object
{{stringify(object)}}  → JSON string
```

### Array Functions
```
{{first(array)}}        → first item
{{last(array)}}         → last item
{{length(array)}}       → item count
{{slice(array, 0, 3)}}  → first 3 items
{{sort(array)}}         → sorted array
{{reverse(array)}}      → reversed array
{{filter(array, value)}} → filtered array
{{map(array, "field")}} → array of field values
{{flatten(array)}}      → flattened array
{{distinct(array)}}     → unique values
```

---

## Flow Control Modules

### Router (`builtin:BasicRouter`)

```json
{
  "id": 3,
  "module": "builtin:BasicRouter",
  "version": 1,
  "mapper": null,
  "routes": [
    {
      "label": "Route 1",
      "flow": [
        {"id": 4, "module": "slack:ActionPostMessage", ...}
      ]
    },
    {
      "label": "Route 2",
      "flow": [
        {"id": 5, "module": "gmail:ActionSendEmail", ...}
      ]
    }
  ]
}
```

⚠️ **Route filters** (conditions that determine which route runs) cannot be set via API. Configure in Make.com UI after deploying.

---

### Iterator (`builtin:BasicFeeder`)

Splits an array into individual bundles — downstream modules process each item.

```json
{
  "id": 2,
  "module": "builtin:BasicFeeder",
  "version": 1,
  "parameters": {},
  "mapper": {
    "array": "{{1.data.items}}"
  }
}
```

**Output:** Each array item becomes `{{2.value}}` for downstream modules.
- `{{2.value}}` — the current item
- `{{2.value.name}}` — field on the current item
- `{{2.__IMTINDEX__}}` — current index (0-based)
- `{{2.__IMTLENGTH__}}` — total items count

See [FLOW_CONTROL.md](FLOW_CONTROL.md) for detailed iterator patterns.

---

### Aggregator (`builtin:BasicAggregator`)

Collects iterator results back into one bundle.

```json
{
  "id": 5,
  "module": "builtin:BasicAggregator",
  "parameters": {
    "feeder": 2
  },
  "mapper": {
    "results": "{{4.result}}"
  }
}
```

`"feeder": 2` = references the iterator module with `id: 2`

**Mapper key names are arbitrary** — you choose the field name (`"results"`, `"items"`, `"data"`, etc.). The key name does NOT affect the output: the aggregated array is always accessed as `{{5.array}}` regardless of the mapper key.

**Output:** `{{5.array}}` — array of all collected values

---

## Scheduling Configuration

```json
// On-demand (manual or via run_scenario)
{"scheduling": {"type": "on-demand"}}

// Webhook-triggered (immediately when webhook fires)
{"scheduling": {"type": "immediately"}}

// Periodic with optional rate limit
{"scheduling": {"type": "immediately", "maximum_runs_per_minute": null}}

// Scheduled polling — interval in SECONDS
{"scheduling": {"type": "indefinitely", "interval": 900}}   // 15 min
{"scheduling": {"type": "indefinitely", "interval": 1800}}  // 30 min
{"scheduling": {"type": "indefinitely", "interval": 3600}}  // 1 hour
{"scheduling": {"type": "indefinitely", "interval": 86400}} // 1 day
```

❌ **INVALID scheduling types:** `"interval"`, `"scheduled"`, `"cron"`, `"periodic"`

---

## Metadata Section (auto-injected)

```json
{
  "metadata": {
    "version": 1,
    "scenario": {
      "roundtrips": 1,           // Bundles processed per run
      "maxErrors": 3,            // Errors before pausing
      "autoCommit": true,        // Commit after each bundle
      "autoCommitTriggerLast": true,
      "sequential": false,       // Process bundles in parallel
      "confidential": false,     // Log data visibility
      "dataloss": false,         // Allow data loss on error
      "dlq": false,              // Dead letter queue
      "freshVariables": false    // Reset vars between bundles
    },
    "designer": {
      "orphans": []              // Disconnected module IDs
    }
  }
}
```

You can omit `metadata` entirely — `create_scenario` injects it with sensible defaults.

---

## Designer Coordinates (auto-injected)

Each module can have positional coordinates for the visual editor:

```json
{
  "metadata": {
    "designer": {
      "x": 0,    // X position in pixels (steps of ~300)
      "y": 0     // Y position in pixels
    }
  }
}
```

Typical layout: x=0, 300, 600, 900... for linear flows. `create_scenario` auto-injects these if missing.

---

## Complete Minimal Blueprint Example

```json
{
  "name": "Webhook → Slack Notify",
  "flow": [
    {
      "id": 1,
      "module": "gateway:CustomWebHook",
      "version": 1,
      "parameters": {"maxResults": 2},
      "mapper": {}
    },
    {
      "id": 2,
      "module": "slack:ActionPostMessage",
      "version": 1,
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "channel": "#notifications",
        "text": "Event received: {{1.data.type}} at {{formatDate(now, \"YYYY-MM-DD HH:mm\")}}"
      }
    }
  ],
  "scheduling": {"type": "immediately"}
}
```

---

## See Also

- [DATA_MAPPING.md](DATA_MAPPING.md) — IML functions full reference
- [FLOW_CONTROL.md](FLOW_CONTROL.md) — Router, Iterator, Aggregator, Repeater
- [SCHEDULING.md](SCHEDULING.md) — Scheduling types and examples
