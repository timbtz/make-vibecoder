# CRM & Ecommerce Patterns

Patterns for Shopify, Salesforce, HubSpot, Stripe, and other business system workflows.

---

## Template Discovery

```javascript
// CRM templates
search_templates({category: "crm"})
search_templates({query: "HubSpot Salesforce"})
search_templates({query: "contact lead"})

// Ecommerce templates
search_templates({category: "ecommerce"})
search_templates({query: "Shopify orders Slack"})
search_templates({query: "Stripe payment"})
```

---

## Pattern 1: New Shopify Order → Slack + Sheets

Most common ecommerce automation.

```json
{
  "name": "Shopify Order Alert",
  "flow": [
    {
      "id": 1,
      "module": "shopify:WatchNewOrders",
      "version": 1,
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {}
    },
    {
      "id": 2,
      "module": "slack:ActionPostMessage",
      "version": 1,
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "channel": "#orders",
        "text": "New Shopify order #{{1.order_number}}!\n*Customer:* {{1.customer.first_name}} {{1.customer.last_name}}\n*Total:* ${{1.total_price}}\n*Items:* {{1.line_items_count}}"
      }
    },
    {
      "id": 3,
      "module": "google-sheets:ActionAddRow",
      "version": 1,
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "spreadsheetId": "/path/to/orders-sheet",
        "sheetName": "Orders",
        "values": {
          "0": "{{1.order_number}}",
          "1": "{{1.customer.email}}",
          "2": "{{1.total_price}}",
          "3": "{{1.financial_status}}",
          "4": "{{1.created_at}}"
        }
      }
    }
  ],
  "scheduling": {"type": "indefinitely", "interval": 900}
}
```

Real template: "Add new Shopify orders to Salesforce as contacts and send Slack notifications"

---

## Pattern 2: Stripe Payment → HubSpot Deal

Create a CRM deal when payment succeeds.

```json
{
  "name": "Stripe → HubSpot Deal",
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
      "module": "json:ParseJSON",
      "version": 1,
      "parameters": {},
      "mapper": {"json": "{{1.data}}"}
    },
    {
      "id": 3,
      "module": "hubspotcrm:ActionCreateContact",
      "version": 1,
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "email": "{{2.data.object.customer_details.email}}",
        "firstname": "{{2.data.object.customer_details.name}}"
      }
    },
    {
      "id": 4,
      "module": "slack:ActionPostMessage",
      "version": 1,
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "channel": "#sales",
        "text": "New payment ${{2.data.object.amount_total}} — contact created in HubSpot"
      }
    }
  ],
  "scheduling": {"type": "immediately"}
}
```

Real template: "Create a HubSpot CRM deal (and contact if it doesn't exist) from a succeeded Stripe payment intent"

---

## Pattern 3: Typeform → HubSpot + Slack

Capture form leads and route to CRM.

```json
{
  "name": "Typeform Lead Capture",
  "flow": [
    {
      "id": 1,
      "module": "typeform:WatchResponses",
      "version": 1,
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {}
    },
    {
      "id": 2,
      "module": "hubspotcrm:ActionCreateContact",
      "version": 1,
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "email": "{{1.answers.email}}",
        "firstname": "{{1.answers.first_name}}",
        "lastname": "{{1.answers.last_name}}",
        "phone": "{{1.answers.phone}}"
      }
    },
    {
      "id": 3,
      "module": "slack:ActionPostMessage",
      "version": 1,
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "channel": "#leads",
        "text": "New lead: {{1.answers.first_name}} {{1.answers.last_name}} ({{1.answers.email}})"
      }
    }
  ],
  "scheduling": {"type": "indefinitely", "interval": 900}
}
```

---

## Pattern 4: Salesforce → Slack Notifications

Alert sales team on Salesforce events.

```json
{
  "name": "Salesforce Lead → Slack Alert",
  "flow": [
    {
      "id": 1,
      "module": "salesforce:WatchNewRecords",
      "version": 1,
      "parameters": {
        "__IMTCONN__": "__IMTCONN__",
        "type": "Lead"
      },
      "mapper": {}
    },
    {
      "id": 2,
      "module": "slack:ActionPostMessage",
      "version": 1,
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "channel": "#sales-leads",
        "text": "New Salesforce lead: {{1.FirstName}} {{1.LastName}}\nCompany: {{1.Company}}\nEmail: {{1.Email}}\nPhone: {{1.Phone}}"
      }
    }
  ],
  "scheduling": {"type": "indefinitely", "interval": 900}
}
```

---

## Pattern 5: Shopify + Salesforce Sync

Sync Shopify customers to Salesforce.

```json
{
  "name": "Shopify Customers → Salesforce",
  "flow": [
    {
      "id": 1,
      "module": "shopify:WatchNewCustomers",
      "version": 1,
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {}
    },
    {
      "id": 2,
      "module": "salesforce:ActionCreateRecord",
      "version": 1,
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "type": "Contact",
        "fields": {
          "FirstName": "{{1.first_name}}",
          "LastName": "{{1.last_name}}",
          "Email": "{{1.email}}",
          "Phone": "{{1.phone}}"
        }
      }
    }
  ],
  "scheduling": {"type": "indefinitely", "interval": 3600}
}
```

Real template: "Add new Shopify customers as new contacts in Salesforce"

---

## Pattern 6: AI Enrichment → CRM

Enrich lead data with AI before storing in CRM.

```json
{
  "name": "AI Lead Enrichment → Salesforce",
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
      "module": "anthropic-claude:createAMessage",
      "version": 1,
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 300,
        "messages": [
          {
            "role": "user",
            "content": "Given this company name: {{1.data.company}}, provide a brief description of what the company does and their industry. Reply in JSON: {\"description\": \"...\", \"industry\": \"...\"}"
          }
        ]
      }
    },
    {
      "id": 3,
      "module": "json:ParseJSON",
      "version": 1,
      "parameters": {},
      "mapper": {"json": "{{2.content}}"}
    },
    {
      "id": 4,
      "module": "salesforce:ActionCreateRecord",
      "version": 1,
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "type": "Lead",
        "fields": {
          "FirstName": "{{1.data.firstName}}",
          "LastName": "{{1.data.lastName}}",
          "Email": "{{1.data.email}}",
          "Company": "{{1.data.company}}",
          "Description": "{{3.description}}",
          "Industry": "{{3.industry}}"
        }
      }
    },
    {
      "id": 5,
      "module": "slack:ActionPostMessage",
      "version": 1,
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "channel": "#enriched-leads",
        "text": "New lead: {{1.data.firstName}} {{1.data.lastName}} from {{1.data.company}}\nIndustry: {{3.industry}}"
      }
    }
  ],
  "scheduling": {"type": "immediately"}
}
```

Real template: "Enrich company data with ChatGPT, create Salesforce leads, and notify via Slack"

---

## CRM Module Reference

| App | Watch Module | Create Module |
|-----|-------------|--------------|
| HubSpot | `hubspotcrm:WatchContacts` | `hubspotcrm:ActionCreateContact` |
| Salesforce | `salesforce:WatchNewRecords` | `salesforce:ActionCreateRecord` |
| Pipedrive | `pipedrive:WatchDeals` | `pipedrive:ActionAddDeal` |
| Zoho CRM | `zoho-crm:WatchRecords` | `zoho-crm:ActionCreateRecord` |

## Ecommerce Module Reference

| App | Watch Module | Action |
|-----|-------------|--------|
| Shopify | `shopify:WatchNewOrders` | `shopify:ActionUpdateOrder` |
| WooCommerce | `woocommerce:WatchOrders` | `woocommerce:ActionUpdateOrder` |
| Stripe | (via webhook) | `stripe:ActionCreateCharge` |
| PayPal | (via webhook) | `paypal:ActionCreateOrder` |
