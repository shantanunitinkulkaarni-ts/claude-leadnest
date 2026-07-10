# Handoff - 2026-07-04 - Codex bot/webhook review

Read this first if continuing in Claude or another model.

The founder wants simple English, one small fix at a time, review after each fix, and explicit approval before commit.

## Product / brand state

- Product name: **TING**
- Company/legal/domain identity: **Convorian**
- Keep `convorian.in` domains and emails unchanged.

## Known stable fallback

Stable bot fallback was saved before break-testing:

- commit `49cc04a`
- tag `stable-bot-2026-07-04`
- branch `fallback/stable-bot-2026-07-04`
- pushed to GitHub

If new bot/webhook work goes wrong, compare against or restore from this fallback.

## Current uncommitted work

Intentional uncommitted changes:

- `app/api/webhook/route.ts`
- `lib/timeParser.ts`
- `tests/unit/time-parser.spec.ts`

Unrelated untracked local file:

- `.claude/settings.local.json`

This handoff file is also untracked:

- `HANDOFF_2026-07-04_CODEX.md`

Do **not** commit yet unless the founder approves.

Latest status check from Codex:

- Branch: `main`, tracking `origin/main`.
- Working tree still has the three intentional modified files above.
- Diff size at latest check: 130 insertions, 16 deletions across those three files.
- Git status works, but prints warnings because it cannot read `C:\Users\rahul\.config\git\ignore`.

## Completed fix: visit time checker

Problem:

- User said a valid time like **8 July 11 AM**, but the bot replied that it was outside 9 AM to 7 PM.
- Cause: visit time was saved as server/world time, then the office-hours checker read the server hour instead of India hour.
- Example: **11 AM India** was stored as **5:30 AM UTC**, and the checker treated it as 5:30 AM.

Change made:

- `lib/timeParser.ts`
  - `visitHourIST()` now converts stored visit time back to India time before checking office hours.

Tests added:

- `tests/unit/time-parser.spec.ts`
  - Valid 11 AM India time stored as UTC now passes.
  - Invalid 8 PM India time stored as UTC still gets blocked.

Checks already run:

- Focused time tests: passed.
- Full unit tests: **935 passed**.
- Type/code check: passed.
- Full app build: passed.

This fix has **not** been committed yet.

Plain-English summary of what Codex changed:

- The bot was checking the stored timestamp's visible hour instead of converting it back to India time.
- `visitHourIST()` now uses JavaScript `Date` plus the `Asia/Kolkata` timezone before applying office-hour rules.
- Tests now prove that **8 July 2026, 11 AM IST** is accepted even when stored as UTC, and **8 PM IST** is still rejected.

## Current review flow: webhook file, fix 1

File being reviewed:

- `app/api/webhook/route.ts`

What this file does:

- It is the front door for WhatsApp messages.
- It checks the incoming message, finds the agent, finds or creates the lead, saves the message, handles opt-out/manual mode/guardrails, then sends the message to the AI bot.

Issue being fixed:

- The webhook originally assumed Meta sends only one WhatsApp message in a request.
- That is not strong enough. Meta webhook payloads can contain more than one message.

Change made so far:

- The webhook now collects incoming messages into `inboundMessages`.
- It processes messages one by one.
- If one message is duplicate/manual/opt-out/guardrail/error, it records that result and continues with the next message.
- If a webhook batch mixes different WhatsApp business phone IDs, it rejects the batch instead of risking wrong-agent routing.
- If one message crashes unexpectedly, it logs that message as failed and continues.
- The response now returns `status: "ok"`, `processed`, and per-message `results` after the batch is handled.

Plain-English summary of what Codex changed:

- Before: one webhook request effectively meant one message; early returns could stop the rest of the batch.
- After: the route builds a list of inbound messages first, then handles each message separately.
- This makes duplicate/manual/opt-out/guardrail failures local to that message instead of killing the whole request.
- The routing safety check rejects a batch if it appears to contain messages for different WhatsApp business phone numbers.

Checks already run for webhook fix:

- Type/code check: passed.
- Focused webhook parsing tests: **18 passed**.

Important self-review note:

- The webhook fix is improved and closer to normal webhook practice, but the edited section is still not as clean as ideal because it was patched around old damaged comments/text encoding.
- Before commit, inspect `app/api/webhook/route.ts` carefully and consider whether to clean the parser into a small helper function.
- The truly scale-ready version would save the message quickly and put bot work in a queue. That is **not** done in this fix.
- Current code still mutates `fromPhone`, `messageText`, `waMessageId`, and `isNonTextMedia` inside the loop. It works, but a cleaner follow-up would pass `inbound` values through narrower local constants or helper functions.
- The webhook fix should be reviewed carefully before commit because it touches the front door for customer messages.

## Other issues found but not fixed yet

In `app/api/webhook/route.ts`:

- Agent lookup still loads the full agent record instead of only needed fields.
- Agent lookup does not clearly separate "database error" from "agent not found."
- It assumes `wa_phone_number_id` is unique; verify database protection later.
- Simulate/test path can act for any agent if someone has the test secret.
- Reply channel is built even if WhatsApp credentials are missing.
- Message counter still adds a fixed amount instead of counting actual sent messages.
- Non-text media is detected but not handled in a useful customer-facing way.
- High-scale design should use a queue, not do all AI work inside the webhook request.

## Workflow the founder wants

- Explain each file/module in plain English first.
- Review for misalignment, mistakes, odd logic, and scale risk.
- Fix **one issue at a time**.
- After each fix: report what changed, run checks, self-review, wait for founder approval before commit.
- After deploys, reset test lead/chat for phone `6393260332` when founder asks or after bot deploy testing.

## Next recommended step

Continue with webhook fix 1:

1. Re-open `app/api/webhook/route.ts`.
2. Self-review the current diff.
3. If clean enough, report to founder and ask approval to commit.
4. If not clean enough, refactor only the message collection into a small helper inside the same file or nearby helper, then rerun checks.

Do not move to the next issue until founder approves this first fix.

## Update - 2026-07-07 - Codex after laptop reset

Workspace recovery:

- Restored the repo into `TING`.
- Reattached real Git metadata using the bundled Codex Git runtime.
- Installed dependencies with bundled `pnpm` because system `node`, `npm`, `git`, and `gh` were not on PATH after the reset.

Webhook fix 1 follow-up:

- Cleaned `app/api/webhook/route.ts` parser into small helpers:
  - `metaMessageText`
  - `toInboundMessage`
  - `parseInboundMessages`
- The main `POST` flow now receives a clean parsed object instead of building `inboundMessages` inline.
- Meta batches are collected by walking all entries/changes/messages once.
- Mixed `phone_number_id` batches still return `mixed_agent_batch` with HTTP 400.
- Form-urlencoded simulate requests still use `AgentId`.
- Per-message processing now uses local `fromPhone`, `messageText`, and `waMessageId` constants inside the loop.

Validation run:

- Typecheck: passed.
- Focused tests: `time-parser.spec.ts` + `webhook-parsing.spec.ts` passed, 83 tests.
- Full unit suite: passed, 1157 tests.
- Lint: passed with existing warnings outside this fix.
- Build: compiled, typechecked, linted, generated static pages, then failed at the final standalone copy step because Windows denied symlink creation inside `.next/standalone` from pnpm-linked dependencies. This looks like a local reset/Windows symlink permission issue, not a TypeScript or app compile failure.

Current caveats:

- Raw `git status` is noisy because the original ZIP checkout and attached `.git` metadata disagree on line endings across many files.
- `git diff --ignore-space-at-eol --name-only` shows the meaningful code diff is only `app/api/webhook/route.ts`.
- No commit has been made.
