# Phase 1 — Code-first bot (BOT_V2) — built, behind a flag, for your review

> Branch `feat/bot-v2-code-first`. **Nothing live changes** — gated by `BOT_V2` (off).
> typecheck + lint clean; 686 unit tests pass (41 new this phase).

## What this does (the architecture you asked for)
The AI now has ONE job: **decode** the customer's message (even Marathi/Hindi/typos) into
structured data — `{buy/rent, area, budget, BHK, message type}`. **Code does everything
factual.** The AI never types a property fact, so a made-up "₹18,000 rental in Baner" is
**structurally impossible** — proven by an automated test using your exact live inventory.

**Flow when `BOT_V2=true`:**
1. AI decodes the message → structured intent (`lib/intentExtractor.ts`). Garbage/typos/AI
   failure → safe default → bot asks a clarifying question (never invents).
2. Code decides (`lib/botOrchestrator.ts`):
   - Don't know buy/rent yet → ask. Don't know area → ask.
   - Know enough → **code matches + ranks (best-fit first) + presents the EXACT property
     block(s)** from the database (`lib/propertyPresenter.ts`): up to 3, with photos.
   - More than 3 → shows 3 + "want a quick call?" + **alerts the agent**.
   - No match → "no property matching that right now" + **your contact card**.
   - Wants a human → contact card + alerts the agent.
3. Booking, objections (and anything not yet migrated) → **fall through to the current AI
   engine** for now (still protected by the price-fabrication guard that's already live).

## The pieces (all unit-tested)
- `lib/propertyPresenter.ts` — builds exact property blocks from DB (12 tests)
- `lib/propertyMatcher.ts` `rankPropertiesForLead` — best-fit ordering (6 tests)
- `lib/intentExtractor.ts` — AI → validated structured intent (14 tests)
- `lib/botOrchestrator.ts` — the decision + runner (9 tests)
- `app/api/webhook/route.ts` — a self-contained `BOT_V2` branch (off by default)

## How to try it on staging (when you want)
On a preview deploy, set env `BOT_V2=true`, then message the bot. Try: "rental in Baner" (→
no-match + card, NOT a fabrication), "buy 2bhk in Baner 90 lakh" (→ shows Lodha exactly),
"hi" (→ asks buy/rent). **Do NOT set this on production until you've seen it on staging.**

## What's NOT in Phase 1 (next)
- **Phase 2 — code-first booking** (your priority): slots, validation, agent-approval-by-WhatsApp.
  Today booking still uses the legacy engine.
- **Phase 3** — fence the AI fully (nurture/objection wrappers so they can't emit facts either).

## Status of the interim guard
The price-fabrication guard shipped earlier is LIVE on production, so customers are protected
the whole time — Phase 1 is the permanent, structural fix, switched on only after your review.
