# Connection Types by App

How to set up `__IMTCONN__` for each major app.

---

## Pattern

Connections go in the `parameters` section (NOT mapper):

```json
{
  "parameters": {
    "__IMTCONN__": 1234567
  }
}
```

Where `1234567` is the numeric connection ID from the user's Make account.

In examples/templates use the string `"__IMTCONN__"` as a placeholder.

---

## Apps That Need Connections

### Google Apps (OAuth)
Used by: `google-sheets:*`, `gmail:*`, `google-drive:*`, `google-forms:*`, `google-calendar:*`

```json
{"parameters": {"__IMTCONN__": "__IMTCONN__"}}
```

**Connection type:** `account:google` — Google OAuth

---

### Slack (OAuth)
Used by: `slack:*`

```json
{"parameters": {"__IMTCONN__": "__IMTCONN__"}}
```

**Connection type:** `account:slack` — Slack OAuth

---

### HubSpot (OAuth)
Used by: `hubspot-crm:*`, `hubspot:*`

```json
{"parameters": {"__IMTCONN__": "__IMTCONN__"}}
```

**Connection type:** `account:hubspot` — HubSpot OAuth

---

### Salesforce (OAuth)
Used by: `salesforce:*`

```json
{"parameters": {"__IMTCONN__": "__IMTCONN__"}}
```

**Connection type:** `account:salesforce` — Salesforce OAuth

---

### Shopify (OAuth + Custom App)
Used by: `shopify:*`

```json
{"parameters": {"__IMTCONN__": "__IMTCONN__"}}
```

**Connection type:** `account:shopify` — Shopify OAuth or private app

---

### Airtable (API key or OAuth)
Used by: `airtable:*`

```json
{"parameters": {"__IMTCONN__": "__IMTCONN__"}}
```

**Connection type:** `account:airtable` — API key or OAuth

---

### Notion (OAuth)
Used by: `notion:*`

```json
{"parameters": {"__IMTCONN__": "__IMTCONN__"}}
```

---

### Stripe (API key)
Used by: `stripe:*`

```json
{"parameters": {"__IMTCONN__": "__IMTCONN__"}}
```

**Connection type:** `account:stripe` — Stripe API key

---

### Telegram (Bot Token)
Used by: `telegram-bot-api:*`

```json
{"parameters": {"__IMTCONN__": "__IMTCONN__"}}
```

**Connection type:** `account:telegram-bot-api` — Bot API token

---

### Discord (Bot Token or OAuth)
Used by: `discord:*`

```json
{"parameters": {"__IMTCONN__": "__IMTCONN__"}}
```

---

### GitHub (OAuth or PAT)
Used by: `github:*`

```json
{"parameters": {"__IMTCONN__": "__IMTCONN__"}}
```

---

### Anthropic Claude (API key)
Used by: `anthropic-claude:*`

```json
{"parameters": {"__IMTCONN__": "__IMTCONN__"}}
```

**Connection type:** `account:anthropic` — API key connection

---

### Typeform (OAuth)
Used by: `typeform:*`

```json
{"parameters": {"__IMTCONN__": "__IMTCONN__"}}
```

---

### Jira (API key + email)
Used by: `jira:*`

```json
{"parameters": {"__IMTCONN__": "__IMTCONN__"}}
```

---

### Asana (OAuth)
Used by: `asana:*`

```json
{"parameters": {"__IMTCONN__": "__IMTCONN__"}}
```

---

### ClickUp (OAuth)
Used by: `clickup:*`

```json
{"parameters": {"__IMTCONN__": "__IMTCONN__"}}
```

---

### Trello (API key + token)
Used by: `trello:*`

```json
{"parameters": {"__IMTCONN__": "__IMTCONN__"}}
```

---

### Mailchimp (OAuth or API key)
Used by: `mailchimp:*`

```json
{"parameters": {"__IMTCONN__": "__IMTCONN__"}}
```

---

### Monday.com (OAuth)
Used by: `monday:*`

```json
{"parameters": {"__IMTCONN__": "__IMTCONN__"}}
```

---

## Apps That DON'T Need Connections

These modules work without any connection setup:

| Module | Reason |
|--------|--------|
| `gateway:CustomWebHook` | Receives HTTP requests |
| `gateway:WebhookRespond` | Sends HTTP response |
| `builtin:BasicRouter` | Flow control, no API |
| `builtin:BasicFeeder` | Iterator, no API |
| `builtin:BasicAggregator` | Aggregator, no API |
| `json:ParseJSON` | Local JSON parsing |
| `json:CreateJSON` | Local JSON creation |
| `util:SetVariable` | Local variable storage |
| `util:GetVariable` | Local variable retrieval |
| `util:SetMultipleVariables` | Local variable storage |
| `datastore:*` | Uses Make's internal datastore (needs datastore ID, not connection) |

---

## HTTP Module Connection Options

`http:ActionSendData` (v3) doesn't need `__IMTCONN__` — auth is in headers:

```json
{
  "mapper": {
    "url": "https://api.example.com/endpoint",
    "method": "POST",
    "headers": [
      {"name": "Authorization", "value": "Bearer {{apiKey}}"},
      {"name": "Content-Type", "value": "application/json"}
    ]
  }
}
```

For Basic Auth, use `http:ActionSendDataBasicAuth` (v3):
```json
{
  "mapper": {
    "url": "https://api.example.com",
    "method": "GET",
    "username": "myuser",
    "password": "mypassword"
  }
}
```

---

## Datastore Connection Pattern

Datastores use a numeric datastore ID (not `__IMTCONN__`):

```json
{
  "parameters": {
    "datastore": 12345
  }
}
```

Where `12345` is the Make Datastore ID from the user's account.
