# Engine Eval Lab — the prompt-training environment

The bot's conversation quality is graded by **scenario evals** before any prompt change ships. This is how we improve the engine without guessing or regressing.

## Two ways these run

**1. Live (real API calls, manual, never in CI)**
```bash
npm run eval
```
Needs `GROQ_API_KEY` (+ `GLM_API_KEY`/`CEREBRAS_API_KEY`) in `.env`. Runs the **real** engine prompt (`buildEnginePrompt` in `lib/gemini.ts`) against the scenarios in `tests/evals/scenarios.ts` and uses Groq as an AI judge to grade each reply (PASS/FAIL). Prints each reply + the judge's verdict. This is how you check "did my prompt change actually help?"

**2. Fixture replay (zero API calls, runs in every `npm test` / CI)**

`tests/evals/engine-eval-replay.spec.ts` replays committed fixtures from `tests/evals/fixtures/*.json` — each one is a frozen `{ raw LLM output, parsed reply, judge verdict }` from the last time `npm run eval:record` was run for that scenario. It re-runs the real `parseEngineResponse()` against the frozen raw output (catches parser regressions for free) and asserts the recorded judge verdict was PASS. **It does not call any LLM or judge** — that's what makes it safe and free to run on every PR.

A scenario with no committed fixture is skipped (not silently dropped — see the skip message), not failed. See "Known gaps" below.

## Workflow for any engine/prompt change

1. Edit the prompt in `lib/gemini.ts`.
2. `npm run eval` → confirm your target scenario now passes and nothing else regressed.
3. `npm run eval:record` → regenerates `tests/evals/fixtures/*.json` for every scenario (real API calls, same cost as `npm run eval`).
4. Review the fixture diff in your PR — it shows exactly how each scenario's reply and judge verdict changed.
5. Commit the updated fixtures. CI will now replay them for free on every future PR.

## Scenarios live in
`tests/evals/scenarios.ts` — each is `{ name, lead (mock), messages, rule }`, shared by both the live spec and the replay spec so they can never drift apart. Add cases as we find issues (e.g. "asks for photos → must not claim to send").

## Known gaps (as of 2026-06-16)

18 of 38 scenarios currently **fail** their real judge verdict against the live engine — genuine prompt-quality bugs, not infra bugs (e.g. fabricating a Kothrud-area pitch instead of saying "not available," Marathi replies leaking English/emoji, voice notes getting a reply that pretends to have heard them). These were deliberately **not** committed as fixtures so the CI replay gate doesn't go permanently red for pre-existing issues unrelated to a given PR. Tracked as a backlog item — fix the prompt, run `npm run eval:record`, commit the now-passing fixture, and that scenario becomes a permanent regression guard.

## Why this matters
This is the standard way serious AI teams ship prompts: a measurable eval set + an AI judge, so "is the bot better?" is answered with data, not vibes. The fixture-replay layer turns each *fixed* bug into a permanent, free CI check instead of a one-off manual run. Over time, feed real winning/losing conversations in as new scenarios (the data flywheel — see ENGINE_ROADMAP.md).
