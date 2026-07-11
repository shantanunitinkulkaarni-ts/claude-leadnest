# CODEX TASKS — Execution Instructions for Codex (GPT-5.5)

> **You are the executor. Claude/ZCode is the lead.**
> Read this file at the start of every work block. Do exactly what is listed.
> Do NOT invent, refactor, or go beyond what is asked.
> When done with a task, commit, push, and update the checkbox here.

---

## HOW WE WORK

1. **Claude plans. Codex executes.** You do what's in this file — nothing more.
2. **One task at a time.** Commit after each task. Use clear commit messages.
3. **Never push straight to main without CI green.**
4. **After all tasks done:** run CI → merge → deploy (instructions at bottom).
5. **Update this file** — check the box when a task is done, add notes if anything blocked.

---

## PHASE 1: BROKEN IMPORTS (fix first — tests are broken)

`lib/gemini.ts` was renamed to `lib/promptEngine.ts`. The functions now live there
(`buildEnginePrompt`, `parseEngineResponse`, `detectMessageLanguage`,
`buildNudgeMemoryContext`, `isMediaPlaceholder`, `stripEmojisFromReplyLine`)
and `detectStage` lives in `lib/stageMachine.ts`.

### Task 1.1 — Repoint broken test imports
Fix every file below. Replace `'../../lib/gemini'` or `'@/lib/gemini'` with the
correct module path. Split imports if needed (promptEngine vs stageMachine).

- [ ] `tests/evals/engine-eval-replay.spec.ts` — imports `detectStage` (→ `lib/stageMachine`), `parseEngineResponse` (→ `lib/promptEngine`)
- [ ] `tests/unit/bot-personality.spec.ts` — imports `buildEnginePrompt`, `stripEmojisFromReplyLine` (→ `lib/promptEngine`)
- [ ] `tests/unit/conversation-scenarios.spec.ts` — imports `detectMessageLanguage` (→ `lib/promptEngine`)
- [ ] `tests/unit/engine-parsing.spec.ts` — imports `parseEngineResponse`, `isMediaPlaceholder` (→ `lib/promptEngine`)
- [ ] `tests/unit/engine-prompt.spec.ts` — imports `buildEnginePrompt` (→ `lib/promptEngine`)
- [ ] `tests/unit/gemini-memory.spec.ts` — imports `buildNudgeMemoryContext` (→ `lib/promptEngine`). ALSO rename this file to `tests/unit/prompt-engine-memory.spec.ts`.
- [ ] `tests/unit/language-detection.spec.ts` — imports `detectMessageLanguage` (→ `lib/promptEngine`)
- [ ] `tests/unit/phase0-integrity.spec.ts` — line 120, just a test title string mentions "gemini engine". Update the string to say "prompt engine" for clarity. No import change needed.

**After fixing:** run `npm run typecheck` — must be clean.

### Task 1.2 — Verify no other references to `lib/gemini`
- [ ] `grep -r "lib/gemini" .` across the entire repo. Fix any remaining references. Must be zero results.

---

## PHASE 2: DELETE DEAD/STALE FILES

Delete these files (use `git rm`):

- [ ] `lib/schema.sql` — self-declared stale duplicate of `db/schema.sql`, imported by nothing
- [ ] `test_phase1.ps1` — leftover debug demo script, exercises no real code
- [ ] `reports/full-flow-transcript.txt` — generated output, should not be committed
- [ ] `reports/live-booking-transcript.txt` — test-generated output, should not be committed
- [ ] `files/CONVORIAN_LAUNCH_BLUEPRINT.md` — orphan, referenced by nothing
- [ ] `files/SETUP_AND_INTEGRATION_PLAN.md` — orphan, referenced by nothing
- [ ] `docs/DEEPSEEK_DIAGNOSTIC_SWAP.md` — transient diagnostic note, referenced by nothing

**After deleting:** run `npm run typecheck` — must still be clean (confirms nothing imported them).

---

## PHASE 3: DELETE REDUNDANT DOCS

These are now fully covered by `what_is_convorian-TING`. Delete with `git rm`:

- [ ] `docs/TING_V1_SOURCE_OF_TRUTH.md`
- [ ] `docs/convorian-state-machine.md`
- [ ] `docs/SPRINT_2_PLAN.md`
- [ ] `docs/CRITICAL-FLOWS-TEST-SUITE.md`
- [ ] `TEMPLATE_NURTURE_PLAN.md` (root)
- [ ] `TEMPLATE_SUITE.md` (root) — note: `lib/outreach.ts:77` has a comment referencing this. Update the comment to say "see what_is_convorian-TING" instead.

**Before deleting:** grep for any code imports of these files. If any exist (unlikely for .md), do NOT delete — report back.

---

## PHASE 4: RENAME AND RELOCATE SOURCE OF TRUTH

- [ ] Rename `what_is_convorian-TING` → `TING_SOURCE_OF_TRUTH.md` (add .md extension, cleaner name)
- [ ] Move it to `docs/TING_SOURCE_OF_TRUTH.md`
- [ ] Grep entire repo for any references to `what_is_convorian-TING` and update them to `docs/TING_SOURCE_OF_TRUTH.md`

---

## PHASE 5: GITIGNORE AND CLEANUP

- [ ] Add `/reports/` to `.gitignore` (generated test outputs should not be committed)
- [ ] Verify `reports/` directory can be deleted from tracking: `git rm -r --cached reports/` (if any tracked files remain after Phase 2)
- [ ] Add `tsconfig.tsbuildinfo` to `.gitignore` if not already there
- [ ] Run `npm run typecheck` one final time — must be clean

---

## PHASE 6: FINAL VALIDATION

- [ ] `npm run typecheck` — clean
- [ ] `npm run lint` — clean
- [ ] `npm test` — all passing (or only pre-existing failures, note them)
- [ ] `git status` — all changes staged/committed, working tree clean

---

## PHASE 7: CI → MERGE → DEPLOY

**Only after all tasks above are checked and committed:**

### Step 1: Create a branch and push
```bash
git checkout -b chore/codebase-hygiene-cleanup
git push origin chore/codebase-hygiene-cleanup
```

### Step 2: Wait for CI to pass
- Monitor GitHub Actions on the branch
- CI must be fully green (lint + typecheck + tests)
- If CI fails: fix the issue, push again, wait for green
- Do NOT merge until CI is green

### Step 3: Merge to main
```bash
git checkout main
git pull origin main
git merge chore/codebase-hygiene-cleanup
git push origin main
```

### Step 4: Deploy to production
```bash
vercel deploy --prod --yes
```

### Step 5: Verify production
- [ ] https://convorian.in loads
- [ ] No CSP violations in browser console
- [ ] Bot responds to a test WhatsApp message (if testable)

### Step 6: Update this file
- [ ] Mark all tasks complete
- [ ] Note the deploy commit hash and Vercel URL
- [ ] Delete the feature branch: `git branch -d chore/codebase-hygiene-cleanup` + delete remote

---

## NOTES FOR CODEX

- **Do NOT refactor anything beyond what's listed here.** Behaviour-preserving changes only.
- **Do NOT touch `lib/ai-bot.ts` or `lib/bot/prompt.ts`** — these are the live bot engine.
- **If you hit a blocker:** stop, note it in this file under "BLOCKERS" below, commit, and wait for guidance.
- **Commit message format:** `chore: <short description>` for cleanup tasks, `fix: <short description>` for import fixes.

---

## BLOCKERS

(none yet)

---

## COMPLETION LOG

(fill in as tasks complete)

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
- [ ] Phase 7 complete (deployed to prod)
