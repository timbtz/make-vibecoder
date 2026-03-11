# AI Patterns

Patterns for integrating AI models into Make.com scenarios.

---

## Core Rule

⚠️ **Do NOT use `openai:*` or `openai-gpt-3:*` modules** — they fail via API deployment.

✅ **For Claude:** Use `anthropic-claude:createAMessage` (Messages API) or `anthropic-claude:createACompletion` (Completions API). Neither is in VERIFIED_MODULE_VERSIONS — if deployment fails, fall back to `http:ActionSendData` calling the Anthropic API directly.

✅ **For OpenAI/GPT:** Use `http:ActionSendData` (v3) → call OpenAI API directly.

✅ **For any other AI:** Use `http:ActionSendData` (v3) to call their API.

---

## Pattern 1: Claude AI Analysis

Trigger any event → Claude analyzes → Output result.

```json
{
  "name": "Claude AI Analyzer",
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
        "max_tokens": 1024,
        "messages": [
          {
            "role": "user",
            "content": [{"type": "text", "text": "Analyze this content and provide key insights:\n\n{{1.data.content}}"}]
          }
        ]
      }
    },
    {
      "id": 3,
      "module": "slack:ActionPostMessage",
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "channel": "#ai-insights",
        "text": "*Claude Analysis:*\n{{2.content}}"
      }
    }
  ],
  "scheduling": {"type": "immediately"}
}
```

**Claude output field:** `{{2.content}}` — the response text

**Available Claude models:** `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`

---

## Pattern 2: OpenAI via HTTP (GPT-4)

Use `http:ActionSendData` to call OpenAI — NOT the openai:* modules.

```json
{
  "name": "GPT-4 Processor",
  "flow": [
    {
      "id": 1,
      "module": "gateway:CustomWebHook",
      "parameters": {"maxResults": 1},
      "mapper": {}
    },
    {
      "id": 2,
      "module": "http:ActionSendData",
      "parameters": {},
      "mapper": {
        "url": "https://api.openai.com/v1/chat/completions",
        "method": "POST",
        "headers": [
          {"name": "Authorization", "value": "Bearer sk-your-openai-key"},
          {"name": "Content-Type", "value": "application/json"}
        ],
        "body": "{\"model\": \"gpt-4o\", \"messages\": [{\"role\": \"user\", \"content\": \"{{1.data.prompt}}\"}], \"max_tokens\": 500}",
        "bodyType": "raw",
        "parseResponse": true
      }
    },
    {
      "id": 3,
      "module": "slack:ActionPostMessage",
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "channel": "#ai-results",
        "text": "{{2.data.choices[0].message.content}}"
      }
    }
  ],
  "scheduling": {"type": "immediately"}
}
```

**OpenAI response field:** `{{2.data.choices[0].message.content}}`

---

## Pattern 3: Email → AI Summary → Slack

Watch emails, summarize with AI, post to Slack.

```json
{
  "name": "Email AI Summarizer",
  "flow": [
    {
      "id": 1,
      "module": "gmail:WatchEmails",
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {}
    },
    {
      "id": 2,
      "module": "anthropic-claude:createAMessage",
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 200,
        "messages": [
          {
            "role": "user",
            "content": [{"type": "text", "text": "Summarize this email in 2 sentences. Subject: {{1.subject}}\n\nBody: {{1.snippet}}"}]
          }
        ]
      }
    },
    {
      "id": 3,
      "module": "slack:ActionPostMessage",
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "channel": "#inbox-summary",
        "text": "*From:* {{1.from}}\n*Subject:* {{1.subject}}\n*Summary:* {{2.content}}"
      }
    }
  ],
  "scheduling": {"type": "indefinitely", "interval": 300}
}
```

---

## Pattern 4: Web Scraping → AI Extraction → Store

Scrape a URL, extract data with AI, store in Airtable.

```json
{
  "name": "Web Scrape + AI Extract",
  "flow": [
    {
      "id": 1,
      "module": "gateway:CustomWebHook",
      "parameters": {"maxResults": 1},
      "mapper": {}
    },
    {
      "id": 2,
      "module": "http:ActionSendData",
      "parameters": {},
      "mapper": {
        "url": "{{1.data.url}}",
        "method": "GET",
        "parseResponse": true
      }
    },
    {
      "id": 3,
      "module": "anthropic-claude:createAMessage",
      "parameters": {"__IMTCONN__": "__IMTCONN__"},
      "mapper": {
        "model": "claude-sonnet-4-6",
        "max_tokens": 1000,
        "messages": [
          {
            "role": "user",
            "content": [{"type": "text", "text": "Extract the following from this web page content as JSON: {title, author, date, summary}.\n\nContent: {{2.data}}"}]
          }
        ]
      }
    },
    {
      "id": 4,
      "module": "json:ParseJSON",
      "parameters": {},
      "mapper": {"json": "{{3.content}}"}
    },
    {
      "id": 5,
      "module": "airtable:ActionCreateRecord",
      "parameters": {
        "__IMTCONN__": "__IMTCONN__",
        "base": "appXXXXXXXXXXXXXX",
        "table": "tblXXXXXXXXXXXXXX"
      },
      "mapper": {
        "fields": {
          "Title": "{{4.title}}",
          "Author": "{{4.author}}",
          "Date": "{{4.date}}",
          "Summary": "{{4.summary}}",
          "URL": "{{1.data.url}}"
        }
      }
    }
  ],
  "scheduling": {"type": "immediately"}
}
```

---

## Pattern 5: AI Social Media Post Generator

Trigger → AI generates content → Post to multiple platforms.

```json
{
  "name": "AI Social Media Generator",
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
        "model": "claude-sonnet-4-6",
        "max_tokens": 500,
        "messages": [
          {
            "role": "user",
            "content": [{"type": "text", "text": "Create a LinkedIn post about: {{1.data.topic}}. Make it professional, 150-200 words, with hashtags."}]
          }
        ]
      }
    },
    {
      "id": 3,
      "module": "http:ActionSendData",
      "parameters": {},
      "mapper": {
        "url": "https://api.linkedin.com/v2/ugcPosts",
        "method": "POST",
        "headers": [
          {"name": "Authorization", "value": "Bearer {{1.data.linkedinToken}}"},
          {"name": "Content-Type", "value": "application/json"}
        ],
        "body": "{\"author\": \"urn:li:person:PERSON_ID\", \"lifecycleState\": \"PUBLISHED\", \"specificContent\": {\"com.linkedin.ugc.ShareContent\": {\"shareCommentary\": {\"text\": \"{{2.content}}\"}, \"shareMediaCategory\": \"NONE\"}}, \"visibility\": {\"com.linkedin.ugc.MemberNetworkVisibility\": \"PUBLIC\"}}",
        "bodyType": "raw",
        "parseResponse": true
      }
    }
  ],
  "scheduling": {"type": "immediately"}
}
```

---

## AI Module Comparison

| Use Case | Module | Notes |
|----------|--------|-------|
| Claude (Messages API) | `anthropic-claude:createAMessage` | ⚠️ Not in VERIFIED_MODULE_VERSIONS |
| Claude (Completions API) | `anthropic-claude:createACompletion` | ⚠️ Not in VERIFIED_MODULE_VERSIONS |
| Claude (safe fallback) | `http:ActionSendData` → Anthropic API | ✅ Always works |
| GPT-4 / GPT-4o | `http:ActionSendData` → OpenAI API | ✅ Use HTTP module |
| Gemini | `http:ActionSendData` → Google AI API | ✅ Use HTTP module |
| Perplexity | `http:ActionSendData` → Perplexity API | ✅ Use HTTP module |
| DeepSeek | `http:ActionSendData` → DeepSeek API | ✅ Use HTTP module |
| OpenAI (old modules) | `openai-gpt-3:*` | ❌ Fails via API |
| Generic AI | `ai-provider:ActionChatCompletion` | ❌ Fails via API |

---

## Real Template Discovery

```javascript
// Find AI templates
search_templates({category: "ai"})
search_templates({query: "ChatGPT"})
search_templates({query: "Claude summarize"})
search_templates({query: "AI web scraping"})
```

Real templates available include:
- "AI Crawling for ChatGPT, DeepSeek, and Claude"
- "[AI Tools 101] AI web scraping with Google Sheets"
- "Enrich company data with ChatGPT, create Salesforce leads"
- "Create social media posts from a blog using ChatGPT"
