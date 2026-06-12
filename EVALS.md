# Engine Eval Lab — the prompt-training environment

The bot's conversation quality is graded by **scenario evals** before any prompt change ships. This is how we improve the engine without guessing or regressing.

## Run it
```bash
npm run eval
```
Needs `GROQ_API_KEY` in `.env`. Runs the **real** engine prompt (`buildEnginePrompt` in `lib/gemini.ts`) against ~15 tricky scenarios and uses Groq as an AI judge to grade each reply against a behavioural rule (PASS/FAIL). Prints each reply + the judge's verdict.

Evals do NOT run in normal `npm test` / CI (they call the paid Groq API) — only via `npm run eval`.

## Workflow for any engine/prompt change
1. Edit the prompt in `lib/gemini.ts`.
2. `npm run eval` → confirm all scenarios still PASS (and your target one now passes).
3. Only ship if green. Add a NEW scenario for any bug you fix, so it can never regress.

## Scenarios live in
`tests/evals/engine-eval.spec.ts` — each is `{ name, lead (mock), messages, rule }`. Add cases as we find issues (e.g. "asks for photos → must not claim to send"). This file is the growing spec of how the bot must behave.

## Why this matters
This is the standard way serious AI teams ship prompts: a measurable eval set + an AI judge, so "is the bot better?" is answered with data, not vibes. Over time, feed real winning/losing conversations in as new scenarios (the data flywheel — see ENGINE_ROADMAP.md).
