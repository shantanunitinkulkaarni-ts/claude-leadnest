# Plan: AI reading project websites (consent → fetch → feed engine)

*Drafted June 13, 2026 — status: PLAN + Phase-1 stub shipped*

## Goal
When an agent adds a property and provides the project website (e.g.
`lodhatowers.com`) **with consent**, the AI may use that site's public
information — amenities, possession date, floor plans, photos, location
highlights — to answer leads more richly and accurately.

## What's already shipped (this batch)
- Property form: optional **Project website** field + a **consent checkbox**
  with disclaimer ("AI may suggest based on info published on that site").
- DB: `properties.project_website`, `properties.website_ai_consent`.
- Engine: when `website_ai_consent` is true, the property line in the prompt
  includes `PROJECT SITE (agent-approved, you may reference its public info): <url>`.
  So the model already knows it's allowed to talk about that project.

## Phase 2 — actual fetching (next)
1. **Cron-side fetch, not request-time.** Never fetch the site while a lead is
   waiting (latency + abuse). A daily/weekly job fetches consented sites and
   caches a text summary.
2. **Pipeline per consented property:**
   - Fetch `project_website` HTML (timeout 8s, follow ≤2 redirects, 1MB cap).
   - Strip tags → readable text; also collect `<img>`/PDF links (floor plans).
   - Summarise with GLM into a compact structured block: amenities[],
     possession, configurations, USPs, nearby landmarks, media URLs.
   - Store in a new `property_site_cache` table (`property_id`, `summary`,
     `media_urls[]`, `fetched_at`, `source_url`, `hash`).
3. **Engine use:** inject the cached summary (not raw HTML) into the property
   line, capped to ~400 chars. Media URLs become "photos available" the agent
   can forward.
4. **Refresh:** re-fetch weekly or when the URL changes (hash compare).

## Safety / guardrails
- Only fetch when `website_ai_consent = true` AND a non-empty URL.
- Allowlist scheme http/https only; block private IPs/localhost (SSRF guard).
- Respect `robots.txt` disallow; skip if blocked.
- Never present scraped claims as guarantees — engine keeps the "confirm with
  team / never fabricate" rules; site text is context, not gospel.
- Disclaimer already shown to the agent at input time.

## New table (Phase 2 migration)
```sql
create table if not exists property_site_cache (
  property_id uuid primary key references properties(id) on delete cascade,
  source_url text,
  summary text,
  media_urls text[],
  hash text,
  fetched_at timestamptz default now()
);
```

## Why staged this way
Storing URL + consent now (done) unblocks the engine to *acknowledge* the
project today, with zero latency/abuse risk. The fetch/summarise loop is
additive and runs offline — ship it once the property dataset has real
consented URLs to test against.
