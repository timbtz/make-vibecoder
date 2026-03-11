# Webhook Patterns

Patterns for building webhook-triggered Make.com scenarios.

---

## Core Concepts

- **Trigger module:** `gateway:CustomWebHook` (v1) — receives HTTP POST
- **Response module:** `gateway:WebhookRespond` (v1) — sends response back
- **Scheduling:** Always `"immediately"` for webhook-triggered scenarios
- **Webhook URL:** Assigned by Make when scenario is saved; not configurable via API

---

## Pattern 1: Simple Webhook → Action

Receive data and do something with it.

```json
{
  "name": "Webhook → Slack",
  "flow": [
    {
      "id": 1,
      "module": "gateway:CustomWebHook",
      "parameters": {"maxResults": 2},
      "mapper": {}
    },
    {
      "id": 2,
      "module": "slack:ActionPostMessage",
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "channel": "#webhooks",
        "text": "Received: {{1.data}}"
      }
    }
  ],
  "scheduling": {"type": "immediately"}
}
```

**Webhook payload access:**
- `{{1.data}}` — full request body (if JSON: `{{1.data.field}}`)
- `{{1.headers}}` — request headers
- `{{1.method}}` — HTTP method

---

## Pattern 2: Webhook → Transform → Store + Notify

Receive, parse, store, and notify.

```json
{
  "name": "Form Submission Handler",
  "flow": [
    {
      "id": 1,
      "module": "gateway:CustomWebHook",
      "parameters": {"maxResults": 1},
      "mapper": {}
    },
    {
      "id": 2,
      "module": "datastore:ActionAddRecord",
      "parameters": {"datastore": 12345},
      "mapper": {
        "key": "{{1.data.email}}",
        "data": {
          "name": "{{1.data.name}}",
          "email": "{{1.data.email}}",
          "message": "{{1.data.message}}",
          "timestamp": "{{now}}"
        }
      }
    },
    {
      "id": 3,
      "module": "slack:ActionPostMessage",
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "channel": "#leads",
        "text": "New form submission from {{1.data.name}} ({{1.data.email}})"
      }
    },
    {
      "id": 4,
      "module": "gateway:WebhookRespond",
      "parameters": {},
      "mapper": {
        "status": 200,
        "body": "{\"success\": true, \"message\": \"Received\"}",
        "headers": [{"key": "Content-Type", "value": "application/json"}]
      }
    }
  ],
  "scheduling": {"type": "immediately"}
}
```

---

## Pattern 3: Webhook → AI Processing → Respond

Process with AI and return the result to the caller.

⚠️ `anthropic-claude:createAMessage` is NOT in VERIFIED_MODULE_VERSIONS — if IM007 error occurs, fall back to `http:ActionSendData` → Anthropic API.

```json
{
  "name": "AI Webhook Processor",
  "flow": [
    {
      "id": 1,
      "module": "gateway:CustomWebHook",
      "parameters": {"maxResults": 1},
      "mapper": {}
    },
    {
      "id": 2,
      "module": "anthropic-claude:createAMessage",
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "model": "claude-opus-4-6",
        "max_tokens": 1000,
        "messages": [
          {
            "role": "user",
            "content": [{"type": "text", "text": "{{1.data.prompt}}"}]
          }
        ]
      }
    },
    {
      "id": 3,
      "module": "gateway:WebhookRespond",
      "parameters": {},
      "mapper": {
        "status": 200,
        "body": "{\"response\": \"{{2.content}}\", \"model\": \"claude\"}",
        "headers": [{"key": "Content-Type", "value": "application/json"}]
      }
    }
  ],
  "scheduling": {"type": "immediately"}
}
```

---

## Pattern 4: Webhook → Parse JSON → Multiple Actions

When the webhook body needs JSON parsing.

```json
{
  "name": "Parse and Route Webhook",
  "flow": [
    {
      "id": 1,
      "module": "gateway:CustomWebHook",
      "parameters": {"maxResults": 1},
      "mapper": {}
    },
    {
      "id": 2,
      "module": "json:ParseJSON",
      "parameters": {},
      "mapper": {"json": "{{1.data}}"}
    },
    {
      "id": 3,
      "module": "google-sheets:ActionAddRow",
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "spreadsheetId": "/path/to/sheet",
        "sheetName": "Sheet1",
        "values": {
          "0": "{{2.id}}",
          "1": "{{2.email}}",
          "2": "{{2.event}}"
        }
      }
    },
    {
      "id": 4,
      "module": "gateway:WebhookRespond",
      "parameters": {},
      "mapper": {
        "status": 200,
        "body": "{\"status\": \"logged\"}",
        "headers": [{"key": "Content-Type", "value": "application/json"}]
      }
    }
  ],
  "scheduling": {"type": "immediately"}
}
```

**`values` keys:** Column indices — `"0"` = column A, `"1"` = column B, etc.

---

## Pattern 5: Webhook → Router → Branch Actions

Route based on event type.

```json
{
  "name": "Event Router",
  "flow": [
    {
      "id": 1,
      "module": "gateway:CustomWebHook",
      "parameters": {"maxResults": 1},
      "mapper": {}
    },
    {
      "id": 2,
      "module": "builtin:BasicRouter",
      "mapper": null,
      "routes": [
        {
          "flow": [
            {
              "id": 3,
              "module": "slack:ActionPostMessage",
              "parameters": {"__IMTCONN__": "__IMTCONN__"},
              "mapper": {
                "channel": "#order-events",
                "text": "Order event: {{1.data.id}}"
              }
            }
          ]
        },
        {
          "flow": [
            {
              "id": 4,
              "module": "gmail:ActionSendEmail",
              "parameters": {"__IMTCONN__": "__IMTCONN__"},
              "mapper": {
                "to": "{{1.data.email}}",
                "subject": "Account event",
                "content": "Your account was updated.",
                "contentType": "text"
              }
            }
          ]
        }
      ]
    },
    {
      "id": 5,
      "module": "gateway:WebhookRespond",
      "parameters": {},
      "mapper": {
        "status": 200,
        "body": "{\"routed\": true}",
        "headers": [{"key": "Content-Type", "value": "application/json"}]
      }
    }
  ],
  "scheduling": {"type": "immediately"}
}
```

⚠️ Router filters (which branch runs based on condition) must be configured in the Make.com UI after deployment.

---

## Webhook Data Access Reference

| Expression | What it returns |
|-----------|----------------|
| `{{1.data}}` | Full request body |
| `{{1.data.field}}` | Specific JSON field |
| `{{1.data.nested.field}}` | Nested JSON field |
| `{{1.headers}}` | All request headers |
| `{{1.headers.authorization}}` | Specific header |
| `{{1.method}}` | HTTP method (POST, GET, etc.) |
| `{{1.query.param}}` | URL query parameter |

---

## Real Template Example

From production blueprint: "Add webhook data to a Google Sheet"

```json
{
  "name": "Add webhook data to a Google Sheet",
  "flow": [
    {
      "id": 1,
      "module": "gateway:CustomWebHook",
      "parameters": {"maxResults": 2},
      "mapper": {}
    },
    {
      "id": 2,
      "module": "google-sheets:addRow",
      "version": 2,
      "parameters": {},
      "mapper": {
        "from": "drive",
        "mode": "select",
        "values": {},
        "sheetName": "Sheet1",
        "spreadsheetId": "/your-spreadsheet",
        "includesHeaders": true,
        "insertDataOption": "INSERT_ROWS",
        "valueInputOption": "USER_ENTERED",
        "insertUnformatted": false
      }
    }
  ],
  "scheduling": {"type": "immediately"}
}
```
