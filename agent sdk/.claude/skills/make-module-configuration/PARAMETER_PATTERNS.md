# Parameter Patterns — parameters vs. mapper

How to correctly distribute configuration between `parameters` and `mapper`.

---

## The Core Rule

| `parameters` | `mapper` |
|--------------|----------|
| Static config set once | Dynamic values that change per run |
| Connection IDs | IML expressions `{{N.field}}` |
| Cannot contain `{{...}}` | Can contain `{{...}}` |
| App-level settings | Data field values |
| Select/enum choices | Text templates |

---

## Visual Pattern

```json
{
  "id": 2,
  "module": "google-sheets:ActionAddRow",
  "parameters": {
    "__IMTCONN__": 1234567,        // ← CONNECTION: always parameters
    "spreadsheetId": "/doc/abc",   // ← STATIC CONFIG: which spreadsheet
    "sheetName": "Sheet1",         // ← STATIC CONFIG: which tab (correct param name)
    "tableContainsHeaders": true,  // ← STATIC FLAG (correct param name)
    "valueInputOption": "USER_ENTERED"  // ← ENUM CHOICE
  },
  "mapper": {
    "values": {                    // ← DYNAMIC DATA
      "0": "{{1.email}}",          // ← IML EXPRESSION
      "1": "{{1.name}}",           // ← IML EXPRESSION
      "2": "{{now}}"               // ← BUILT-IN VARIABLE
    }
  }
}
```

---

## What Goes Where — By Field Type

### Always in `parameters`
- Connection: `"__IMTCONN__": 1234567`
- Datastore ID: `"datastore": 12345`
- Which resource: `"spreadsheetId": "..."`, `"base": "appXXX"`, `"database": "uuid"`
- Enum/select choices when static: `"method": "POST"` (if always POST)
- Boolean flags: `"includesHeaders": true`, `"parseResponse": true`

### Always in `mapper`
- Data values from upstream: `"text": "{{1.message}}"`
- Computed/conditional values: `"amount": "{{1.total}}"`
- User-supplied text: `"subject": "New Order #{{1.id}}"`

### Can go in either (but `mapper` is more common for flexibility)
- Static text strings: `"channel": "#general"` (ok in mapper)
- Method type if always the same: `"method": "POST"` (ok in either)

---

## Common Mistakes

### ❌ Mistake 1: Connection in mapper
```json
// WRONG
{
  "mapper": {"__IMTCONN__": 1234567}
}

// CORRECT
{
  "parameters": {"__IMTCONN__": 1234567}
}
```

### ❌ Mistake 2: Dynamic value in parameters
```json
// WRONG — parameters don't support IML expressions
{
  "parameters": {"subject": "{{1.title}}"}
}

// CORRECT
{
  "mapper": {"subject": "{{1.title}}"}
}
```

### ❌ Mistake 3: Spreading required params only in one section
```json
// If validate_scenario reports "Missing required parameter 'channel'":
// Check BOTH parameters AND mapper — the validator checks both

// This is fine:
{
  "parameters": {},
  "mapper": {"channel": "#general", "text": "{{1.data}}"}
}
```

---

## HTTP Module Pattern (v3)

```json
{
  "id": 3,
  "module": "http:ActionSendData",
  "version": 3,
  "parameters": {},  // ← Empty — no connection needed
  "mapper": {
    "url": "https://api.example.com/v1/items",
    "method": "POST",
    "headers": [
      {"name": "Authorization", "value": "Bearer sk-xxxx"},
      {"name": "Content-Type", "value": "application/json"}
    ],
    "body": "{\"name\": \"{{1.name}}\"}",
    "bodyType": "raw",
    "parseResponse": true
  }
}
```

All config goes in `mapper` for HTTP module since there's no connection to configure.

---

## Webhook Trigger Pattern

```json
{
  "id": 1,
  "module": "gateway:CustomWebHook",
  "version": 1,
  "parameters": {
    "maxResults": 2  // ← goes in parameters (static limit)
  },
  "mapper": {}  // ← always empty for triggers
}
```

Triggers never have meaningful `mapper` content — they produce data, not consume it.

---

## Router Pattern

```json
{
  "id": 3,
  "module": "builtin:BasicRouter",
  "version": 1,
  "parameters": {},  // ← empty
  "mapper": null,    // ← null for router
  "routes": [...]    // ← routes is a top-level sibling, not in parameters or mapper
}
```

---

## Aggregator Pattern

```json
{
  "id": 5,
  "module": "builtin:BasicAggregator",
  "version": 1,
  "parameters": {
    "feeder": 3  // ← module ID of the iterator — goes in parameters
  },
  "mapper": {
    "value": "{{4.result}}"  // ← what to collect — goes in mapper
  }
}
```

---

## Datastore Pattern

```json
{
  "id": 4,
  "module": "datastore:ActionAddRecord",
  "version": 1,
  "parameters": {
    "datastore": 12345  // ← datastore ID in parameters (static config)
  },
  "mapper": {
    "key": "{{1.id}}",           // ← dynamic key
    "data": {                     // ← dynamic data fields
      "email": "{{1.email}}",
      "name": "{{1.name}}"
    }
  }
}
```

---

## IML Built-in Variables (Available in mapper)

| Variable | Value |
|----------|-------|
| `{{now}}` | Current timestamp (ISO 8601) |
| `{{timestamp}}` | Current Unix timestamp |
| `{{random}}` | Random number 0-1 |
| `{{uuid}}` | Random UUID |

---

## IML Functions (Available in mapper)

```
{{if(condition, trueValue, falseValue)}}
{{toString(number)}}
{{toNumber(string)}}
{{trim(string)}}
{{lower(string)}}
{{upper(string)}}
{{length(array)}}
{{first(array)}}
{{last(array)}}
{{join(array, separator)}}
{{split(string, separator)}}
{{replace(string, search, replacement)}}
{{contains(string, substring)}}
{{formatDate(date, "YYYY-MM-DD")}}
{{parseDate(string, "YYYY-MM-DD")}}
{{add(a, b)}}
{{subtract(a, b)}}
{{multiply(a, b)}}
{{divide(a, b)}}
{{ceil(number)}}
{{floor(number)}}
{{round(number)}}
{{max(a, b)}}
{{min(a, b)}}
```

See [make-blueprint-syntax/DATA_MAPPING.md](../../make-blueprint-syntax/DATA_MAPPING.md) for full IML reference.
