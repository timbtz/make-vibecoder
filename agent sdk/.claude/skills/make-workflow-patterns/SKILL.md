---
name: make-workflow-patterns
description: Pattern library for building Make.com automation scenarios. Use when a user describes an automation goal in plain language, asks to "automate X when Y happens", "build a workflow that...", or needs help choosing the right flow structure. Maps user intent to proven blueprint patterns from 266 production templates.
---

# Make Workflow Patterns

Pattern library for translating automation goals into Make.com scenarios.

---

## Pattern Selection Guide

### By Trigger Type

| User Says | Trigger Module | Pattern |
|-----------|---------------|---------|
| "when a webhook arrives" | `gateway:CustomWebHook` | Webhook Pattern |
| "when a form is submitted" | `typeform:WatchResponses` or `google-forms:watchRows` | Webhook/Form Pattern |
| "when a new Shopify order" | `shopify:WatchNewOrders` | Polling Trigger Pattern |
| "every hour / daily / on schedule" | Any polling trigger (e.g., `shopify:WatchNewOrders`) + `scheduling: {"type": "indefinitely", "interval": 3600}` | Scheduled Pattern |
| "when an email arrives" | `gmail:WatchEmails` | Email Trigger Pattern |
| "when Slack message" | `slack:TriggerNewMessage` | Instant Trigger Pattern |
| "run manually" | `gateway:CustomWebHook` or on-demand | On-Demand Pattern |

### By Action Type

| User Wants To... | Module Category | Key Modules |
|-----------------|----------------|-------------|
| Notify on Slack | Communication | `slack:ActionPostMessage` |
| Send email | Communication | `gmail:ActionSendEmail` |
| Add to spreadsheet | Data | `google-sheets:ActionAddRow` |
| Create CRM record | CRM | `hubspotcrm:ActionCreateContact`, `salesforce:ActionCreateRecord` |
| Call an AI | AI | `anthropic-claude:createAMessage`, `http:ActionSendData` → OpenAI |
| Call an API | Universal | `http:ActionSendData` |
| Store data | Storage | `datastore:ActionAddRecord`, `airtable:ActionCreateRecord` |
| Create task | PM | `asana:ActionCreateTask`, `notion:ActionCreateDatabaseItem` |

---

## Pattern 1: Webhook → Action

**Use when:** External system sends data to Make via HTTP POST.

**Template search:** `search_templates({query: "webhook", category: "automation"})`

```json
{
  "name": "Webhook → Slack Notification",
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
        "channel": "#notifications",
        "text": "New event from {{1.source}}: {{1.data.message}}"
      }
    }
  ],
  "scheduling": {"type": "immediately"}
}
```

**Scheduling:** Always `"immediately"` for webhook-triggered scenarios.

See [webhook_patterns.md](webhook_patterns.md) for full patterns.

---

## Pattern 2: Webhook → Process → Respond

**Use when:** Need to respond to the caller (API integration, chatbot, form handler).

⚠️ `anthropic-claude:createAMessage` is NOT in VERIFIED_MODULE_VERSIONS — if IM007 error occurs, fall back to `http:ActionSendData` → Anthropic API.

```json
{
  "flow": [
    {
      "id": 1, "module": "gateway:CustomWebHook",
      "parameters": {"maxResults": 1}, "mapper": {}
    },
    {
      "id": 2, "module": "anthropic-claude:createAMessage",
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "model": "claude-opus-4-6",
        "max_tokens": 500,
        "messages": [{"role": "user", "content": [{"type": "text", "text": "{{1.data.query}}"}]}]
      }
    },
    {
      "id": 3, "module": "gateway:WebhookRespond",
      "parameters": {},
      "mapper": {
        "status": 200,
        "body": "{\"response\": \"{{2.content}}\"}",
        "headers": [{"key": "Content-Type", "value": "application/json"}]
      }
    }
  ],
  "scheduling": {"type": "immediately"}
}
```

---

## Pattern 3: Polling Trigger → Multi-Action

**Use when:** Watching an external system for new events on a schedule.

**Template search:** `search_templates({query: "shopify orders slack", category: "ecommerce"})`

```json
{
  "name": "Shopify Orders → Slack + Google Sheets",
  "flow": [
    {
      "id": 1,
      "module": "shopify:WatchNewOrders",
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {}
    },
    {
      "id": 2,
      "module": "slack:ActionPostMessage",
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "channel": "#orders",
        "text": "New order #{{1.id}} — ${{1.total_price}} from {{1.customer.email}}"
      }
    },
    {
      "id": 3,
      "module": "google-sheets:ActionAddRow",
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "spreadsheetId": "/your-spreadsheet-path",
        "sheetName": "Orders",
        "values": {
          "0": "{{1.id}}",
          "1": "{{1.total_price}}",
          "2": "{{1.customer.email}}",
          "3": "{{now}}"
        }
      }
    }
  ],
  "scheduling": {"type": "indefinitely", "interval": 900}
}
```

**`values` keys:** Column indices — `"0"` = column A, `"1"` = column B, etc.

---

## Pattern 4: AI-Augmented Flow

**Use when:** Transform or analyze data with an AI model before taking action.

**Template search:** `search_templates({query: "ChatGPT summarize", category: "ai"})`

See [ai_patterns.md](ai_patterns.md) for Claude, GPT, and Perplexity patterns.

⚠️ `anthropic-claude:createAMessage` is NOT in VERIFIED_MODULE_VERSIONS — if IM007 error occurs, fall back to `http:ActionSendData` → Anthropic API.

```json
{
  "name": "Email → AI Summary → Slack",
  "flow": [
    {
      "id": 1, "module": "gmail:WatchEmails",
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {}
    },
    {
      "id": 2, "module": "anthropic-claude:createAMessage",
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "model": "claude-opus-4-6",
        "max_tokens": 200,
        "messages": [{"role": "user", "content": [{"type": "text", "text": "Summarize this email in 2 sentences: {{1.snippet}}"}]}]
      }
    },
    {
      "id": 3, "module": "slack:ActionPostMessage",
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "channel": "#email-summaries",
        "text": "*From:* {{1.from}}\n*Subject:* {{1.subject}}\n*Summary:* {{2.content}}"
      }
    }
  ],
  "scheduling": {"type": "indefinitely", "interval": 300}
}
```

---

## Pattern 5: Data Sync (Source → Transform → Destination)

**Use when:** Syncing or migrating data between two systems.

**Template search:** `search_templates({query: "sync", category: "data"})`

See [data_pipeline_patterns.md](data_pipeline_patterns.md).

```json
{
  "name": "Airtable → Google Sheets Sync",
  "flow": [
    {
      "id": 1, "module": "airtable:WatchRecords",
      "parameters": {"__IMTCONN__": "__IMTCONN__", "base": "appXXX", "table": "tblXXX"},
      "mapper": {}
    },
    {
      "id": 2, "module": "google-sheets:ActionAddRow",
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "spreadsheetId": "/your-sheet",
        "sheetName": "Sheet1",
        "values": {
          "0": "{{1.fields.Name}}",
          "1": "{{1.fields.Email}}",
          "2": "{{1.fields.Status}}"
        }
      }
    }
  ],
  "scheduling": {"type": "indefinitely", "interval": 900}
}
```

---

## Pattern 6: Router — Conditional Branching

**Use when:** Different actions needed based on data content.

⚠️ Router filters cannot be set via API — deploy without filters, then configure in Make.com UI.

```json
{
  "name": "Route by Order Value",
  "flow": [
    {"id": 1, "module": "shopify:WatchNewOrders", "parameters": {"__IMTCONN__": "__IMTCONN__"}, "mapper": {}},
    {
      "id": 2, "module": "builtin:BasicRouter", "mapper": null,
      "routes": [
        {
          "flow": [
            {
              "id": 3, "module": "slack:ActionPostMessage",
              "parameters": {"__IMTCONN__": "__IMTCONN__"},
              "mapper": {"channel": "#vip-orders", "text": "VIP Order #{{1.id}} — ${{1.total_price}}"}
            }
          ]
        },
        {
          "flow": [
            {
              "id": 4, "module": "google-sheets:ActionAddRow",
              "parameters": {"__IMTCONN__": "__IMTCONN__"},
              "mapper": {"spreadsheetId": "...", "sheetName": "Sheet1", "values": {"0": "{{1.id}}", "1": "{{1.total_price}}"}}
            }
          ]
        }
      ]
    }
  ],
  "scheduling": {"type": "indefinitely", "interval": 900}
}
```

---

## Pattern 7: Iterator + Aggregator

**Use when:** Processing a list of items and collecting results.

```json
{
  "flow": [
    {"id": 1, "module": "gateway:CustomWebHook", "parameters": {"maxResults": 2}, "mapper": {}},
    {
      "id": 2, "module": "builtin:BasicFeeder",
      "parameters": {},
      "mapper": {"array": "{{1.data.items}}"}
    },
    {
      "id": 3, "module": "http:ActionSendData",
      "parameters": {},
      "mapper": {
        "url": "https://api.example.com/process/{{2.value.id}}",
        "method": "POST",
        "parseResponse": true
      }
    },
    {
      "id": 4, "module": "builtin:BasicAggregator",
      "parameters": {"feeder": 2},
      "mapper": {"results": "{{3.data.result}}"}
    },
    {
      "id": 5, "module": "slack:ActionPostMessage",
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {"channel": "#results", "text": "Processed {{length(4.array)}} items"}
    }
  ],
  "scheduling": {"type": "immediately"}
}
```

**BasicAggregator mapper key names are arbitrary** — you choose the field name. `"results": "{{3.data.result}}"` collects into `{{4.array}}` (the output is always `array`, regardless of the key name you use in mapper). Examples: `"results"`, `"items"`, `"data"` — all valid.

---

## Pattern 8: CRM / Ecommerce

**Use when:** New lead, order, or customer needs to flow between business systems.

**Template search:** `search_templates({category: "crm"})` or `search_templates({category: "ecommerce"})`

See [crm_ecommerce_patterns.md](crm_ecommerce_patterns.md).

Common flows:
- Typeform submission → HubSpot contact + Slack notify
- Shopify order → Salesforce lead + email confirm
- Stripe payment → create invoice + notify

---

## Template Discovery by Use Case

```javascript
// Communication / notifications
search_templates({query: "slack notification"})
search_templates({query: "email alert"})

// AI automation
search_templates({category: "ai"})
search_templates({query: "ChatGPT summarize"})
search_templates({query: "Claude analyze"})

// CRM workflows
search_templates({category: "crm"})
search_templates({query: "HubSpot Salesforce"})

// Ecommerce
search_templates({category: "ecommerce"})
search_templates({query: "Shopify order"})

// Data sync
search_templates({category: "data"})
search_templates({query: "Google Sheets sync"})

// Project management
search_templates({category: "project-management"})
search_templates({query: "Asana task Slack"})
```

---

## See Also

- [webhook_patterns.md](webhook_patterns.md) — Webhook trigger flows
- [ai_patterns.md](ai_patterns.md) — Claude, ChatGPT, Perplexity AI flows
- [data_pipeline_patterns.md](data_pipeline_patterns.md) — Sheets, Airtable, Datastore
- [crm_ecommerce_patterns.md](crm_ecommerce_patterns.md) — HubSpot, Salesforce, Shopify
