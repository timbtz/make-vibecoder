# Data Pipeline Patterns

Patterns for data storage, sync, and transformation workflows.

---

## Pattern 1: Google Sheets Logger

Append new data to a Google Sheet from any trigger.

```json
{
  "name": "Event Logger to Google Sheets",
  "flow": [
    {
      "id": 1,
      "module": "gateway:CustomWebHook",
      "version": 1,
      "parameters": {"maxResults": 1},
      "mapper": {}
    },
    {
      "id": 2,
      "module": "google-sheets:ActionAddRow",
      "version": 1,
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "spreadsheetId": "/path/to/your/spreadsheet",
        "sheetName": "Sheet1",
        "values": {
          "0": "{{1.data.id}}",
          "1": "{{1.data.name}}",
          "2": "{{1.data.email}}",
          "3": "{{now}}"
        },
        "includesHeaders": true,
        "insertDataOption": "INSERT_ROWS",
        "valueInputOption": "USER_ENTERED"
      }
    }
  ],
  "scheduling": {"type": "immediately"}
}
```

**Column mapping in `values`:**
- `"0"`, `"1"`, `"2"` = column index (0-based)
- Or use header names if `includesHeaders: true`

---

## Pattern 2: Google Forms → Process → Slack

Watch form responses, process them, notify.

```json
{
  "name": "Form Response Handler",
  "flow": [
    {
      "id": 1,
      "module": "google-forms:watchRows",
      "version": 2,
      "parameters": {
        "__IMTCONN__": "__IMTCONN__",
        "limit": 2,
        "tableFirstRow": "A1:Z1",
        "includesHeaders": "true",
        "valueRenderOption": "FORMATTED_VALUE",
        "dateTimeRenderOption": "FORMATTED_STRING"
      },
      "mapper": {}
    },
    {
      "id": 2,
      "module": "datastore:ActionAddRecord",
      "version": 1,
      "parameters": {"datastore": 12345},
      "mapper": {
        "key": "{{1.__ROW_NUMBER__}}",
        "data": {
          "name": "{{1.Name}}",
          "email": "{{1.Email}}",
          "message": "{{1.Message}}"
        }
      }
    },
    {
      "id": 3,
      "module": "slack:ActionPostMessage",
      "version": 1,
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "channel": "#form-responses",
        "text": "New form response from {{1.Name}}: {{1.Message}}"
      }
    }
  ],
  "scheduling": {"type": "indefinitely", "interval": 300}
}
```

Real template: "Add records to Data Store from Google Forms responses and send a Slack message"

---

## Pattern 3: Airtable → Google Sheets Sync

One-way sync from Airtable to Google Sheets.

```json
{
  "name": "Airtable → Google Sheets",
  "flow": [
    {
      "id": 1,
      "module": "airtable:WatchRecords",
      "version": 1,
      "parameters": {
        "__IMTCONN__": "__IMTCONN__",
        "base": "appXXXXXXXXXXXXXX",
        "table": "tblXXXXXXXXXXXXXX"
      },
      "mapper": {}
    },
    {
      "id": 2,
      "module": "google-sheets:ActionAddRow",
      "version": 1,
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "spreadsheetId": "/sync-spreadsheet",
        "sheetName": "Data",
        "values": {
          "0": "{{1.id}}",
          "1": "{{1.fields.Name}}",
          "2": "{{1.fields.Email}}",
          "3": "{{1.fields.Status}}",
          "4": "{{1.createdTime}}"
        }
      }
    }
  ],
  "scheduling": {"type": "indefinitely", "interval": 900}
}
```

---

## Pattern 4: Datastore CRUD Operations

Store, retrieve, and update records in Make's built-in Datastore.

### Store a Record
```json
{
  "id": 2,
  "module": "datastore:ActionAddRecord",
  "version": 1,
  "parameters": {"datastore": 12345},
  "mapper": {
    "key": "{{1.data.userId}}",
    "data": {
      "email": "{{1.data.email}}",
      "name": "{{1.data.name}}",
      "plan": "{{1.data.plan}}",
      "created": "{{now}}"
    }
  }
}
```

### Search Records
```json
{
  "id": 3,
  "module": "datastore:ActionSearchRecords",
  "version": 1,
  "parameters": {"datastore": 12345},
  "mapper": {
    "filter": {
      "conditions": [
        [{"a": "email", "b": "{{1.data.email}}", "o": "text:equal"}]
      ]
    },
    "limit": 1
  }
}
```

### Update a Record
```json
{
  "id": 4,
  "module": "datastore:ActionUpdateRecord",
  "version": 1,
  "parameters": {"datastore": 12345},
  "mapper": {
    "key": "{{1.data.userId}}",
    "data": {
      "lastLogin": "{{now}}",
      "plan": "{{1.data.newPlan}}"
    }
  }
}
```

---

## Pattern 5: HTTP API → Transform → Store

Fetch data from an API, transform it, store in Airtable.

```json
{
  "name": "API Poller → Airtable",
  "flow": [
    {
      "id": 1,
      "module": "http:ActionSendData",
      "version": 3,
      "parameters": {},
      "mapper": {
        "url": "https://api.example.com/v1/records",
        "method": "GET",
        "headers": [{"name": "Authorization", "value": "Bearer {{apiKey}}"}],
        "parseResponse": true
      }
    },
    {
      "id": 2,
      "module": "builtin:BasicFeeder",
      "version": 1,
      "parameters": {},
      "mapper": {"array": "{{1.data.items}}"}
    },
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
          "ID": "{{2.value.id}}",
          "Name": "{{2.value.name}}",
          "Value": "{{2.value.amount}}",
          "Imported At": "{{now}}"
        }
      }
    }
  ],
  "scheduling": {"type": "indefinitely", "interval": 3600}
}
```

---

## Pattern 6: Deduplication with Datastore

Check if record exists before inserting.

```json
{
  "name": "Deduplication Flow",
  "flow": [
    {"id": 1, "module": "gateway:CustomWebHook", "parameters": {"maxResults": 1}, "mapper": {}},
    {
      "id": 2,
      "module": "datastore:ActionGetRecord",
      "version": 1,
      "parameters": {"datastore": 12345},
      "mapper": {"key": "{{1.data.email}}"}
    },
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
              "module": "datastore:ActionAddRecord",
              "version": 1,
              "parameters": {"datastore": 12345},
              "mapper": {
                "key": "{{1.data.email}}",
                "data": {"name": "{{1.data.name}}", "email": "{{1.data.email}}"}
              }
            }
          ]
        }
      ]
    }
  ],
  "scheduling": {"type": "immediately"}
}
```

⚠️ Router filter (branch 1 only runs if record not found) must be set in Make.com UI after deploy.

---

## Template Discovery

```javascript
// Data pipeline templates
search_templates({category: "data"})
search_templates({query: "Google Sheets sync"})
search_templates({query: "Airtable record"})
search_templates({query: "webhook Google Sheet"})

// Real templates available:
// "Add webhook data to a Google Sheet"
// "Add records to Data Store from Google Forms responses and send a Slack message"
// "Add or update records in Airtable from newly created..."
// "Add or update Webhook data on a Google Sheet and send email notifications"
```
