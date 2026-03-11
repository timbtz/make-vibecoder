# Common Modules — Configuration Reference

Full configuration examples for the 20 most-used Make.com modules.

> ⚠️ **VERIFIED API IDs vs UI-Exported IDs**
>
> When building from scratch via `create_scenario`, use **VERIFIED API IDs** (the module IDs in this guide).
> When using `get_template` blueprints, those use **UI-exported IDs** (e.g., `addRow` v2, `CreateMessage` v4) which also work.
> Both are valid — VERIFIED IDs are auto-versioned by `create_scenario`; UI IDs come as-is from templates.

---

## 1. gateway:CustomWebHook (v1)
**Type:** instant_trigger | **Connection:** none

Starts a scenario when an HTTP POST is sent to a webhook URL.

```json
{
  "id": 1,
  "module": "gateway:CustomWebHook",
  "version": 1,
  "parameters": {},
  "mapper": {
    "maxResults": 2
  }
}
```

**Output fields:** Everything in the webhook payload. Access as `{{1.field}}`, `{{1.data}}`, `{{1.headers.content-type}}`

**Parameters (in `parameters`):**
- `name` (required) — display name for the webhook in Make.com
- `dataStructure` (optional) — ID of a Make data structure to validate incoming payload

**Mapper fields:**
- `maxResults` — how many webhook calls to process per run (default: 1)

**Notes:**
- The webhook URL is assigned by Make when the scenario is saved
- Use `gateway:WebhookRespond` to send a response back

---

## 2. gateway:WebhookRespond (v1)
**Type:** action | **Connection:** none

Sends a response back to the webhook caller.

```json
{
  "id": 4,
  "module": "gateway:WebhookRespond",
  "version": 1,
  "parameters": {},
  "mapper": {
    "status": 200,
    "body": "{\"message\": \"OK\"}",
    "headers": [{"key": "Content-Type", "value": "application/json"}]
  }
}
```

---

## 3. slack:ActionPostMessage (v1)
**Type:** action | **Connection:** `__IMTCONN__` (OAuth Slack)

Posts a message to a Slack channel.

```json
{
  "id": 2,
  "module": "slack:ActionPostMessage",
  "version": 1,
  "parameters": {
    "__IMTCONN__": "__IMTCONN__"
  },
  "mapper": {
    "channel": "#general",
    "text": "New order: {{1.id}} — ${{1.total_price}}",
    "username": "Make Bot",
    "icon_emoji": ":robot_face:"
  }
}
```

**Required mapper fields:** `channel`, `text`

**Channel formats:**
- `#channel-name` — by name
- `C0123456789` — by channel ID (more reliable)
- `@username` — direct message

---

## 4. http:ActionSendData (v3)
**Type:** action | **Connection:** none (or optional auth)

Makes an HTTP request to any API. Most versatile module.

```json
{
  "id": 3,
  "module": "http:ActionSendData",
  "version": 3,
  "parameters": {},
  "mapper": {
    "url": "https://api.openai.com/v1/chat/completions",
    "method": "post",
    "headers": [
      {"name": "Authorization", "value": "Bearer {{1.apiKey}}"},
      {"name": "Content-Type", "value": "application/json"}
    ],
    "body": "{\"model\": \"gpt-4\", \"messages\": [{\"role\": \"user\", \"content\": \"{{1.text}}\"}]}",
    "bodyType": "raw",
    "parseResponse": true
  }
}
```

**Required mapper fields:** `url`, `method`

**Valid methods:** `get`, `post`, `put`, `patch`, `delete`, `head`, `options`

**bodyType options:** `raw`, `x_www_form_urlencoded`, `multipart_form_data`, `json`

**Optional mapper fields:** `serializeUrl: true` (encode URL query params automatically)

**Output fields:** `data` (parsed JSON), `status` (HTTP status code), `headers`

---

## 5. google-sheets:ActionAddRow (v1)
**Type:** action | **Connection:** `__IMTCONN__` (OAuth Google)

Appends a new row to a Google Sheet.

```json
{
  "id": 2,
  "module": "google-sheets:ActionAddRow",
  "version": 1,
  "parameters": {
    "__IMTCONN__": "__IMTCONN__"
  },
  "mapper": {
    "spreadsheetId": "/path/to/spreadsheet",
    "sheetName": "Sheet1",
    "values": {
      "0": "{{1.email}}",
      "1": "{{1.name}}",
      "2": "{{1.timestamp}}"
    },
    "from": "drive",
    "mode": "select",
    "tableContainsHeaders": true,
    "insertDataOption": "INSERT_ROWS",
    "valueInputOption": "USER_ENTERED"
  }
}
```

**`values`** is an object where keys are column indices (`"0"`, `"1"`, `"2"`, ...) or header names.

**Note:** VERIFIED API ID is `ActionAddRow` v1; UI-exported blueprints use `addRow` v2 — both work.

---

## 6. json:ParseJSON (v1)
**Type:** action | **Connection:** none

Parses a JSON string into an accessible data structure.

```json
{
  "id": 3,
  "module": "json:ParseJSON",
  "version": 1,
  "parameters": {},
  "mapper": {
    "json": "{{2.body}}"
  }
}
```

**Output:** Access parsed fields as `{{3.field}}`, `{{3.nested.field}}`

---

## 7. json:CreateJSON (v1)
**Type:** action | **Connection:** none

Creates a JSON string from mapped values.

```json
{
  "id": 4,
  "module": "json:CreateJSON",
  "version": 1,
  "parameters": {},
  "mapper": {
    "object": {
      "name": "{{1.name}}",
      "email": "{{1.email}}",
      "timestamp": "{{now}}"
    }
  }
}
```

**Output:** `{{4.json}}` — the JSON string

---

## 8. builtin:BasicRouter (v1)
**Type:** flow control | **Connection:** none

Splits the flow into multiple parallel branches.

```json
{
  "id": 3,
  "module": "builtin:BasicRouter",
  "version": 1,
  "mapper": null,
  "routes": [
    {
      "flow": [
        {
          "id": 4,
          "module": "slack:ActionPostMessage",
          "parameters": {"__IMTCONN__": "__IMTCONN__"},
          "mapper": {"channel": "#orders", "text": "New order: {{1.id}}"}
        }
      ]
    },
    {
      "flow": [
        {
          "id": 5,
          "module": "google-sheets:ActionAddRow",
          "parameters": {"__IMTCONN__": "__IMTCONN__"},
          "mapper": {"spreadsheetId": "...", "sheetName": "Sheet1", "values": {"0": "{{1.id}}"}}
        }
      ]
    }
  ]
}
```

**Notes:**
- `routes` is an array of route objects, each with a `flow` array
- Router filters (conditions) cannot be set via API — configure in Make.com UI after deploying
- IDs inside routes must continue the sequential numbering from the main flow

---

## 9. builtin:BasicFeeder (v1) — Iterator
**Type:** flow control | **Connection:** none

Iterates over an array, processing each item individually.

```json
{
  "id": 3,
  "module": "builtin:BasicFeeder",
  "version": 1,
  "parameters": {},
  "mapper": {
    "array": "{{1.items}}"
  }
}
```

**Output:** Each item in the array, accessible as `{{3.value}}`, `{{3.value.field}}`

---

## 10. builtin:BasicAggregator (v1)
**Type:** aggregator | **Connection:** none

Collects items from an iterator into a single bundle.

```json
{
  "id": 5,
  "module": "builtin:BasicAggregator",
  "version": 1,
  "parameters": {
    "feeder": 3
  },
  "mapper": {
    "value": "{{4.field}}"
  }
}
```

**`feeder`** = the module ID of the iterator this aggregates from.
**Output:** `{{5.array}}` — array of all collected values

---

## 11. util:SetVariable (v1)
**Type:** action | **Connection:** none

Sets a variable to be used later in the flow.

```json
{
  "id": 2,
  "module": "util:SetVariable",
  "version": 1,
  "parameters": {},
  "mapper": {
    "name": "orderTotal",
    "value": "{{1.total_price}}"
  }
}
```

**Output:** `{{2.value}}` — the variable value

---

## 12. util:SetMultipleVariables (v1)
**Type:** action | **Connection:** none

Sets multiple variables at once.

```json
{
  "id": 2,
  "module": "util:SetMultipleVariables",
  "version": 1,
  "parameters": {},
  "mapper": {
    "variables": [
      {"name": "orderId", "value": "{{1.id}}"},
      {"name": "customerEmail", "value": "{{1.customer.email}}"},
      {"name": "amount", "value": "{{1.total_price}}"}
    ]
  }
}
```

**Output:** `{{2.orderId}}`, `{{2.customerEmail}}`, `{{2.amount}}`

---

## 13. datastore:ActionAddRecord (v1)
**Type:** action | **Connection:** none (uses Make datastore)

Adds a record to a Make.com Datastore.

```json
{
  "id": 3,
  "module": "datastore:ActionAddRecord",
  "version": 1,
  "parameters": {
    "datastore": 12345
  },
  "mapper": {
    "key": "{{1.id}}",
    "data": {
      "email": "{{1.email}}",
      "name": "{{1.name}}",
      "timestamp": "{{now}}"
    }
  }
}
```

**`datastore`** = numeric ID of the datastore in your Make account.

---

## 14. datastore:ActionSearchRecords (v1)
**Type:** search | **Connection:** none

Searches records in a Make.com Datastore.

```json
{
  "id": 2,
  "module": "datastore:ActionSearchRecords",
  "version": 1,
  "parameters": {
    "datastore": 12345
  },
  "mapper": {
    "filter": {
      "conditions": [
        [{"a": "email", "b": "{{1.email}}", "o": "text:equal"}]
      ]
    },
    "limit": 10
  }
}
```

---

## 15. anthropic-claude — Claude AI Modules

**Type:** action | **Connection:** `__IMTCONN__` (API key-based)

Two real modules exist in the DB (from blueprint corpus analysis):

### `anthropic-claude:createAMessage` (Messages API — 17 blueprint uses)

```json
{
  "id": 3,
  "module": "anthropic-claude:createAMessage",
  "version": 1,
  "parameters": {
    "__IMTCONN__": "__IMTCONN__"
  },
  "mapper": {
    "model": "claude-opus-4-6",
    "max_tokens": 1024,
    "messages": [
      {
        "role": "user",
        "content": "Summarize this: {{2.body}}"
      }
    ]
  }
}
```

### `anthropic-claude:createACompletion` (Completions API — 15 blueprint uses)

```json
{
  "id": 3,
  "module": "anthropic-claude:createACompletion",
  "version": 1,
  "parameters": {
    "__IMTCONN__": "__IMTCONN__"
  },
  "mapper": {
    "model": "claude-opus-4-6",
    "max_tokens": 1024,
    "prompt": "Summarize this: {{2.body}}"
  }
}
```

⚠️ **Neither module is in VERIFIED_MODULE_VERSIONS** — `create_scenario` won't auto-inject their versions. If deployment fails, fall back to `http:ActionSendData` calling the Anthropic API directly (see section 20 pattern for OpenAI — same approach applies).

**Available Claude models:** `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`

---

## 16. gmail:ActionSendEmail (v1)
**Type:** action | **Connection:** `__IMTCONN__` (OAuth Google)

Sends an email via Gmail.

```json
{
  "id": 4,
  "module": "gmail:ActionSendEmail",
  "version": 1,
  "parameters": {
    "__IMTCONN__": "__IMTCONN__"
  },
  "mapper": {
    "to": "{{1.email}}",
    "subject": "Order Confirmation #{{1.orderId}}",
    "content": "Dear {{1.name}},\n\nYour order has been received.",
    "contentType": "text"
  }
}
```

---

## 17. airtable:ActionCreateRecord (v1)
**Type:** action | **Connection:** `__IMTCONN__` (API key or OAuth)

Creates a record in an Airtable base.

```json
{
  "id": 3,
  "module": "airtable:ActionCreateRecord",
  "version": 1,
  "parameters": {
    "__IMTCONN__": "__IMTCONN__",
    "base": "appXXXXXXXXXXXXXX",
    "table": "tblXXXXXXXXXXXXXX"
  },
  "mapper": {
    "fields": {
      "Name": "{{1.name}}",
      "Email": "{{1.email}}",
      "Status": "New"
    }
  }
}
```

---

## 18. hubspotcrm:ActionCreateContact (v1)
**Type:** action | **Connection:** `__IMTCONN__` (OAuth HubSpot)

Creates a contact in HubSpot CRM.

⚠️ **App name is `hubspotcrm` (no hyphen)** — `hubspot-crm:*` will fail with "Unknown module".

```json
{
  "id": 3,
  "module": "hubspotcrm:ActionCreateContact",
  "version": 1,
  "parameters": {
    "__IMTCONN__": "__IMTCONN__"
  },
  "mapper": {
    "email": "{{1.email}}",
    "firstname": "{{1.firstName}}",
    "lastname": "{{1.lastName}}",
    "phone": "{{1.phone}}"
  }
}
```

---

## 19. notion:ActionCreateDatabaseItem (v1)
**Type:** action | **Connection:** `__IMTCONN__` (OAuth Notion)

Creates an item in a Notion database.

```json
{
  "id": 4,
  "module": "notion:ActionCreateDatabaseItem",
  "version": 1,
  "parameters": {
    "__IMTCONN__": "__IMTCONN__",
    "database": "database-uuid-here"
  },
  "mapper": {
    "properties": {
      "Name": {"title": [{"text": {"content": "{{1.name}}"}}]},
      "Status": {"select": {"name": "New"}},
      "Email": {"email": "{{1.email}}"}
    }
  }
}
```

---

## 20. http:ActionSendData for OpenAI (v3)
**Type:** action | **Connection:** none

**Use this instead of openai:* modules** — they fail via API deployment.

```json
{
  "id": 3,
  "module": "http:ActionSendData",
  "version": 3,
  "parameters": {},
  "mapper": {
    "url": "https://api.openai.com/v1/chat/completions",
    "method": "post",
    "headers": [
      {"name": "Authorization", "value": "Bearer sk-your-key-here"},
      {"name": "Content-Type", "value": "application/json"}
    ],
    "body": "{\"model\": \"gpt-4o\", \"messages\": [{\"role\": \"user\", \"content\": \"{{1.text}}\"}], \"max_tokens\": 500}",
    "bodyType": "raw",
    "parseResponse": true
  }
}
```

**Output:** `{{3.data.choices[0].message.content}}` — the AI response text
