# Flow Control — Router, Iterator, Aggregator, Repeater

Reference for Make.com's built-in flow control modules.

---

## Overview

| Module | Type | Use Case |
|--------|------|---------|
| `builtin:BasicRouter` | Router | Branch flow based on conditions |
| `builtin:BasicFeeder` | Iterator | Process each item in an array |
| `builtin:BasicAggregator` | Aggregator | Collect iterator results into one bundle |
| `builtin:BasicRepeater` | Repeater | Run a flow N times |

---

## Router (`builtin:BasicRouter` v1)

Splits the flow into multiple parallel branches (routes).

```json
{
  "id": 3,
  "module": "builtin:BasicRouter",
  "version": 1,
  "mapper": null,
  "routes": [
    {
      "label": "High Value",
      "flow": [
        {
          "id": 4,
          "module": "slack:ActionPostMessage",
          "parameters": {"__IMTCONN__": "__IMTCONN__"},
          "mapper": {"channel": "#vip", "text": "VIP order: {{1.id}}"}
        }
      ]
    },
    {
      "label": "Standard",
      "flow": [
        {
          "id": 5,
          "module": "google-sheets:ActionAddRow",
          "parameters": {"__IMTCONN__": "__IMTCONN__"},
          "mapper": {
            "spreadsheetId": "/orders",
            "sheetName": "Sheet1",
            "values": {"0": "{{1.id}}", "1": "{{1.total_price}}"}
          }
        }
      ]
    }
  ]
}
```

### Router Rules

1. **Route filters** (conditions) cannot be set via API — configure in Make.com UI after deployment
2. Module IDs inside routes must be **unique** across the entire blueprint (no reuse)
3. IDs inside routes continue the main sequence: if main flow ends at id:3, routes use id:4, id:5, etc.
4. `mapper: null` is correct for the router itself
5. Multiple routes run in parallel by default (first matching filter wins if filters are set)

### After Router — Fallback Pattern

To run code after ALL routes complete, use an aggregator after the router.

---

## Iterator (`builtin:BasicFeeder` v1)

Takes an array and emits each item as a separate bundle. Downstream modules run once per item.

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

### Iterator Output Fields

| Expression | Description |
|-----------|-------------|
| `{{2.value}}` | Current item (the whole item) |
| `{{2.value.fieldName}}` | Field on current item |
| `{{2.__IMTINDEX__}}` | Current index (0-based) |
| `{{2.__IMTLENGTH__}}` | Total items in array |
| `{{2.__IMTSTART__}}` | Is this the first item? (boolean: true/false) |
| `{{2.__IMTEND__}}` | Is this the last item? (boolean: true/false) |

### Example: Process Each Order Item

```json
{
  "flow": [
    {"id": 1, "module": "shopify:WatchNewOrders", ...},
    {
      "id": 2,
      "module": "builtin:BasicFeeder",
      "parameters": {},
      "mapper": {"array": "{{1.line_items}}"}
    },
    {
      "id": 3,
      "module": "google-sheets:ActionAddRow",
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "spreadsheetId": "/line-items",
        "sheetName": "Sheet1",
        "values": {
          "0": "{{1.id}}",
          "1": "{{2.value.title}}",
          "2": "{{2.value.quantity}}",
          "3": "{{2.value.price}}"
        }
      }
    }
  ]
}
```

---

## Aggregator (`builtin:BasicAggregator` v1)

Collects the output of an iterator back into a single bundle with an array.

Must be paired with an iterator — the `feeder` parameter references the iterator's `id`.

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

**Mapper key names are arbitrary** — choose any name (`"results"`, `"items"`, `"data"`, etc.). The key name does NOT affect the output field; the collected array is always `{{5.array}}`.

### Aggregator Parameters

| Parameter | Where | Description |
|-----------|-------|-------------|
| `feeder` | `parameters` | Integer `id` of the iterator module |
| *(any key)* | `mapper` | What to collect from each iteration — key name is user-defined |

### Aggregator Output

| Expression | Description |
|-----------|-------------|
| `{{5.array}}` | Array of all collected items (regardless of mapper key name) |
| `{{length({{5.array}})}}` | Count of collected items |
| `{{join({{5.array}}, ", ")}}` | Join all strings |

### Example: Collect Processed Items

```json
{
  "flow": [
    {"id": 1, "module": "gateway:CustomWebHook", ...},
    {"id": 2, "module": "builtin:BasicFeeder", "mapper": {"array": "{{1.data.ids}}"}},
    {
      "id": 3, "module": "http:ActionSendData",
      "mapper": {"url": "https://api.example.com/item/{{2.value}}", "method": "GET", "parseResponse": true}
    },
    {
      "id": 4,
      "module": "builtin:BasicAggregator",
      "parameters": {"feeder": 2},
      "mapper": {"names": "{{3.data.name}}"}
    },
    {
      "id": 5, "module": "slack:ActionPostMessage",
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "channel": "#results",
        "text": "Processed {{length(4.array)}} items: {{join(4.array, \", \")}}"
      }
    }
  ]
}
```

---

## Repeater (`builtin:BasicRepeater` v1)

Runs the downstream modules a fixed number of times.

```json
{
  "id": 1,
  "module": "builtin:BasicRepeater",
  "version": 1,
  "parameters": {},
  "mapper": {
    "repeats": 5,
    "start": 1,
    "step": 1
  }
}
```

### Repeater Output

| Expression | Description |
|-----------|-------------|
| `{{1.i}}` | Current iteration value (starts at `start`, increments by `step` each iteration) |
| `{{1.repeats}}` | Total repeats configured |

**`step` parameter:** Increment per iteration. `step: 1` → values 1,2,3,4,5. `step: 2` → values 1,3,5,7,9. Useful for pagination offsets or indexed operations.

### Example: Send 3 Reminder Emails

```json
{
  "flow": [
    {
      "id": 1,
      "module": "builtin:BasicRepeater",
      "mapper": {"repeats": 3, "start": 1, "step": 1}
    },
    {
      "id": 2,
      "module": "gmail:ActionSendEmail",
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "to": "user@example.com",
        "subject": "Reminder {{1.i}} of 3",
        "content": "This is reminder number {{1.i}}.",
        "contentType": "text"
      }
    }
  ]
}
```

---

## Nested Flows — Router Inside Iterator

You can nest flow control:

```json
{
  "flow": [
    {"id": 1, "module": "shopify:WatchNewOrders", ...},
    {"id": 2, "module": "builtin:BasicFeeder", "mapper": {"array": "{{1.line_items}}"}},
    {
      "id": 3, "module": "builtin:BasicRouter", "mapper": null,
      "routes": [
        {
          "flow": [
            {"id": 4, "module": "slack:ActionPostMessage", ...}
          ]
        },
        {
          "flow": [
            {"id": 5, "module": "google-sheets:ActionAddRow", ...}
          ]
        }
      ]
    },
    {"id": 6, "module": "builtin:BasicAggregator", "parameters": {"feeder": 2}, "mapper": {"ids": "{{2.value.id}}"}}
  ]
}
```

---

## ID Numbering in Complex Flows

IDs must be globally unique across the entire blueprint including all routes:

```
Main flow:     id: 1, 2, 3 (router)
  Route 1:     id: 4, 5
  Route 2:     id: 6, 7
Continue:      id: 8 (aggregator after router)
```

Never reuse an ID. Even modules inside deep routes need unique IDs.
