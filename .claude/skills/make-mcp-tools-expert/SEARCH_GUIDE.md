# Make MCP — Search & Discovery Guide

How to find the right modules and templates for any automation task.

---

## Strategy 1: Template-First (Recommended)

Templates are complete, production-tested blueprints. Always search templates first.

```javascript
// Broad keyword search
search_templates({query: "shopify slack"})

// Category + keyword
search_templates({query: "email", category: "communication"})

// Difficulty filter (good for learning)
search_templates({difficulty: "beginner"})

// Category only (browse all templates in a domain)
search_templates({category: "ecommerce"})
```

**If templates match:** Use `get_template` → modify connections → validate → deploy.
**If no match:** Fall back to module search (Strategy 2).

---

## Strategy 2: Module Search

Use when you need to build from scratch or a template doesn't match well enough.

### Step 1: Search broadly
```javascript
search_modules({query: "shopify"})
// Returns all Shopify modules (triggers, actions, searches)
```

### Step 2: Identify module type needed
- **Trigger** — starts the scenario (e.g., "Watch New Orders")
- **Action** — does something (e.g., "Post a Message")
- **Search** — finds records (e.g., "Search Records")
- **Instant Trigger** — webhook-based trigger

### Step 3: Get full details
```javascript
get_module({moduleId: "shopify:WatchNewOrders"})
// Returns all parameters, output fields, connection type
```

### Step 4: Check output_fields for mapping
```javascript
// output_fields shows what {{moduleId.field}} expressions are valid
get_module({moduleId: "shopify:WatchNewOrders"})
// output_fields: [{name: "id", ...}, {name: "total_price", ...}, ...]
// → can use {{1.id}}, {{1.total_price}} in next modules
```

---

## Search Query Tips

### Keyword strategies
```javascript
// App name
search_modules({query: "gmail"})
search_modules({query: "google sheets"})

// Action concept
search_modules({query: "send email"})
search_modules({query: "create record"})
search_modules({query: "watch new"})  // finds trigger modules

// Combo: app + action
search_modules({query: "slack message"})
search_modules({query: "airtable create"})
```

### App filter for precision
```javascript
// All Slack modules
search_modules({query: "*", app: "Slack"})

// Slack send actions only
search_modules({query: "send", app: "Slack"})
```

### Use list_apps first if unsure of app name
```javascript
list_apps()
// Returns all 148 apps with exact names
// → confirm "Google Sheets" not "GoogleSheets" or "google-sheets"
```

---

## Template Category Reference

| Category | Example Templates |
|----------|-----------------|
| `ai` | ChatGPT summarize, Claude analyze, AI web scraping |
| `crm` | HubSpot → Slack, Salesforce lead creation, contact sync |
| `ecommerce` | Shopify → Sheets, Stripe → Salesforce, WooCommerce orders |
| `marketing` | Mailchimp subscriber sync, LinkedIn post, social scheduling |
| `social-media` | Twitter → Sheets, Facebook → Slack, Instagram monitor |
| `communication` | Email → Slack, Gmail → Notion, Telegram bot |
| `project-management` | Asana task from Slack, Trello → Jira, ClickUp notify |
| `data` | Google Sheets sync, Airtable → Datastore, CSV import |
| `file-management` | Google Drive → Slack, Dropbox → Sheets, file categorize |
| `automation` | Webhook → multi-step flow, scheduled data pulls |
| `analytics` | GA4 reports, Metabase → Sheets |
| `hr` | New hire onboarding, Greenhouse → Slack |

---

## Fallback Strategies When Nothing Matches

### Template not found?
1. Try different keywords: "Shopify order" → "new order" → "ecommerce notification"
2. Search by category alone: `search_templates({category: "ecommerce"})`
3. Pick closest template and adapt it

### Module not found?
1. Try the app name alone: `search_modules({query: "shopify"})`
2. List all apps: `list_apps()` to find exact app names
3. Use HTTP module as fallback: `http:ActionSendData` can call any REST API

### Module ID format wrong?
Always: `appName:ActionOrTriggerName`
- The app name is lowercase with hyphens: `google-sheets`, `openai-gpt-3`
- The action name is PascalCase: `ActionAddRow`, `WatchNewOrders`
- Full example: `google-sheets:ActionAddRow`

---

## What search_modules Covers

The search indexes **559 modules** across **148 apps** including:

**Communication:** Slack, Gmail, Telegram, Discord, Microsoft Teams, Twilio, WhatsApp, Intercom
**Productivity:** Google Sheets, Notion, Airtable, Trello, Asana, ClickUp, Monday.com
**CRM/Sales:** HubSpot, Salesforce, Pipedrive, Zoho CRM
**Ecommerce:** Shopify, WooCommerce, Stripe, PayPal
**Marketing:** Mailchimp, ActiveCampaign, Klaviyo, LinkedIn, Facebook
**AI:** anthropic-claude, openai-gpt-3 (use HTTP for deployment)
**Data/Storage:** Google Drive, Dropbox, Datastore, PostgreSQL, MySQL
**Utilities:** HTTP, JSON, built-in Router/Iterator/Aggregator, Webhook

---

## Template vs. Module: Decision Matrix

| Scenario | Use Templates | Use Modules |
|----------|--------------|-------------|
| Common automation pattern | ✅ | ❌ |
| 2-3 popular apps | ✅ | ❌ |
| Need to see working example | ✅ | ❌ |
| Very custom logic | ❌ | ✅ |
| Unusual app combination | ❌ | ✅ |
| Learning module parameters | ❌ | ✅ |
| Need exact parameter control | ❌ | ✅ |
