# Make.com Module Gotchas

A living document of module-specific behavioral gotchas — facts not captured in parameter schemas.
Populated exclusively by the autoresearch loop (`/autotest-vibecoder`).

Format: one `## moduleId` header per module, bullet points below.
Each gotcha should include a `[Discovered: YYYY-MM-DD]` tag.

---

## slack:ActionPostMessage
- **WRONG MODULE ID** — This module does not exist in Make.com. The real module is `slack:CreateMessage` version 4.  [Discovered: 2026-03-16]
- The vibecoder's DB still contains `slack:ActionPostMessage` as a hand-written stub — use `slack:CreateMessage` instead.  [Discovered: 2026-03-16]

## slack:CreateMessage
- Version **4** is required — without it Make's API returns HTTP 500 (Postgres 23502 not-null violation).  [Discovered: 2026-03-16]
- Connection type is `account:slack` (bot token).  [Discovered: 2026-03-16]
- Mapper fields: `channel` (channel ID, e.g. `C0AJVPMJV19`), `channelWType` (`"manualy"` — typo is intentional in Make's code), `text`.  [Discovered: 2026-03-16]
- `parameters` only needs `{"__IMTCONN__": <connectionId>}` — all message fields go in `mapper`.  [Discovered: 2026-03-16]

## gateway:CustomWebHook
- `hook` (integer webhook ID) is **required** in the blueprint parameters — Make does NOT auto-create a webhook on deploy.  [Discovered: 2026-03-16]
- Must be created first via `mcp__make__hooks_create` with `typeName: "gateway-webhook"` and `data: {headers: false, method: false, stringify: false}`.  [Discovered: 2026-03-16]
- Including `"scheduling": {"type": "immediately"}` inside the blueprint JSON causes HTTP 400 ("should NOT have additional properties"). `scheduling` must NOT be in the blueprint — it is a separate API parameter.  [Discovered: 2026-03-16]
- Including `"metadata.instant": true` with `on-demand` scheduling causes HTTP 500 (23502). Only set `instant: true` when scheduling is `immediately`.  [Discovered: 2026-03-16]
