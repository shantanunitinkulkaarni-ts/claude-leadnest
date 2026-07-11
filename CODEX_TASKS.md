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

## STATUS: Phase 1 cleanup already done (by Codex, commit bb3c422)

✅ Dead lib modules removed (14 files)
✅ Dead test files removed (20 files)
✅ Dead routes removed (test-integration)
✅ Root files cleaned (test_phase1.ps1, TEMPLATE_*.md)
✅ Old docs archived to docs/archive/
✅ Source of truth renamed to docs/TING_SOURCE_OF_TRUTH.md
✅ .gitignore updated (/reports/, _cleanup_backup/)
✅ No broken imports remain
✅ Merge conflicts resolved (commit 9e893b6)

---

## REMAINING TASKS

### Task A — Write a proper README.md
The current `README.md` is just `# TING` (6 bytes). Write a proper one:

- [x] Project name + one-line description ("AI WhatsApp assistant SaaS for Indian real-estate agents")
- [x] Live URL (https://convorian.in)
- [x] Tech stack summary (Next.js 14, Supabase, Groq/GLM, Meta Cloud API, Razorpay, Vercel)
- [x] Link to `docs/TING_SOURCE_OF_TRUTH.md` for full documentation
- [x] Quick start: `npm install` → `npm run dev`
- [x] Scripts: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:critical`
- [x] Keep it under 50 lines. Do NOT duplicate the source of truth.

### Task B — Run typecheck and lint
- [x] `npm run typecheck` — must be clean
- [x] `npm run lint` — must be clean
- [x] If any errors: fix them (only the errors, do not refactor). Commit.

### Task C — Run tests
- [ ] `npm test` — run full suite
- [ ] If any failures: note them in BLOCKERS below. Do NOT fix unless it's a trivial import/path issue caused by the cleanup.
- [ ] If all pass: proceed to Task D.

### Task D — Verify no stray files remain
- [ ] `ls *.sql *.html *.py *.txt *.mjs` at repo root → should be empty
- [ ] `ls lib/*.sql` → should be empty
- [ ] `grep -r "lib/gemini" . --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v docs/archive` → should be empty
- [ ] `grep -r "botOrchestrator" . --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v docs/archive` → should be empty

---

## PHASE 7: CI → MERGE → DEPLOY

**Only after all tasks above are checked and committed:**

### Step 1: Create a branch and push
```bash
git checkout -b chore/codebase-hygiene-final
git push origin chore/codebase-hygiene-final
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
git merge chore/codebase-hygiene-final
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

### Step 6: Clean up
- [ ] Delete the feature branch: `git branch -d chore/codebase-hygiene-final` + `git push origin --delete chore/codebase-hygiene-final`
- [ ] Update this file — mark all tasks complete

---

## NOTES FOR CODEX

- **Do NOT refactor anything beyond what's listed here.** Behaviour-preserving changes only.
- **Do NOT touch `lib/ai-bot.ts` or `lib/bot/prompt.ts`** — these are the live bot engine.
- **If you hit a blocker:** stop, note it in this file under "BLOCKERS" below, commit, and wait for guidance.
- **Commit message format:** `chore: <short description>` for cleanup, `fix: <short description>` for fixes.

---

## BLOCKERS

(none yet)

---

## COMPLETION LOG

- [x] Phase 1 dead code removal (Codex, commit bb3c422)
- [x] Merge conflict resolution (commit 9e893b6)
- [x] Task A: README.md (Codex, updated README and kept it under 50 lines)
- [x] Task B: typecheck + lint (Codex, ran equivalent local binaries because npm is not on PATH; typecheck clean, lint exits 0 with existing warnings)
- [ ] Task C: tests
- [ ] Task D: stray file verification
- [ ] Phase 7: CI → merge → deploy
