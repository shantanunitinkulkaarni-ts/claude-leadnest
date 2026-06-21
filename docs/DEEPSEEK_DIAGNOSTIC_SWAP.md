# DeepSeek V3 Diagnostic Swap — GLM → DeepSeek

**Status:** ACTIVE (Diagnostic, Temporary)  
**Date:** 2026-06-21  
**Purpose:** Determine whether current behavior issues stem from GLM model quality or application/business logic.

---

## Overview

GLM (Z.ai API) has been **temporarily replaced** with DeepSeek V3 as the primary LLM provider. All interfaces remain identical — application code is unaware of the provider change.

**No changes to:**
- Webhook flow
- State machine
- Property search (Sprint 1)
- Lead criteria extraction
- Nurture system
- Database schema
- Prompt templates

---

## Files Changed

| File | Change | Notes |
|---|---|---|
| `lib/llm.ts` | Provider swap: GLM → DeepSeek | glmChat → deepseekChat, glmKey → deepseekKey, API endpoint + model updated |
| `app/api/demo-chat/route.ts` | Import + usage updated | glmChat/glmKey → deepseekChat/deepseekKey |
| `app/api/support-chat/route.ts` | Import + usage updated | glmChat/glmKey → deepseekChat/deepseekKey |
| `tests/unit/llm-fallback.spec.ts` | Test updated | Test descriptions + mocks: glm → deepseek |

**Not changed:**
- `lib/gemini.ts` — uses callLLM() interface (unchanged)
- Webhook route — uses callLLM() interface (unchanged)
- Property search — uses callLLM() via lib/gemini.ts (unchanged)
- State machine — no LLM dependency

---

## Environment Variables

### Required

Add to Vercel environment:

```bash
DEEPSEEK_API_KEY = <founder's DeepSeek API key>
```

### Optional (for testing/debugging)

If you want to temporarily disable:

```bash
# Comment out or unset this to fall back immediately to Cerebras
DEEPSEEK_API_KEY = ""
```

### Removed

`GLM_API_KEY` is no longer used. Can leave in Vercel for now (ignored), or delete.

---

## Model Details

| Aspect | Value |
|---|---|
| Model ID | `deepseek-chat` |
| Provider | https://api.deepseek.com/chat/completions |
| API Format | OpenAI-compatible |
| Max Tokens | 450 (unchanged from GLM) |
| Temperature | 0.7 (unchanged from GLM) |
| Hedging Strategy | Identical to GLM (6 max attempts, 2 in flight, 12s per attempt) |

---

## Test Results

### LLM Fallback Tests (4 tests)
✅ **PASS** — All 4 tests passing

```
ok 1 returns DeepSeek result without touching Cerebras when DeepSeek succeeds
ok 2 falls back to Cerebras when DeepSeek throws
ok 3 propagates the Cerebras error when both providers fail
ok 4 passes maxTokens/temperature through to the fallback call
```

### Full Test Suite

**TypeCheck:** ✅ Clean  
**Lint:** ✅ Clean  
**Unit Tests:** ✅ All passing

---

## Verification Examples

### Example 1: Rental criteria extraction
```
Input message: "rent 2 bhk baner 30000"

Expected extraction:
{
  intent: "rent",
  area: "baner",
  budget_max: 30000,
  bhk: "2bhk"
}

Status: ✅ Ready for manual testing via WhatsApp/demo-chat
```

### Example 2: Purchase in different area
```
Input message: "buy flat in wakad 80 lakh"

Expected extraction:
{
  intent: "buy",
  area: "wakad",
  budget_max: 8000000
}

Status: ✅ Ready for manual testing
```

### Example 3: Visit time
```
Input message: "tomorrow 4 pm"

Expected extraction:
{
  action: "visit_request",
  preferred_time: "tomorrow 4 PM"
}

Status: ✅ Ready for manual testing
```

---

## Monitoring

### Logs to watch

In Vercel Logs / Sentry, look for:

- **DeepSeek success:** `"DeepSeek ok: N attempt(s) in Xms"`
- **DeepSeek fallback:** `"DeepSeek gave up after N attempt(s)... Sentry tag: provider=deepseek, fallback=cerebras"`
- **Cerebras fallback:** Captured in Sentry with provider tag `fallback=cerebras`

### Production dashboard

- Check Sentry for error trends: https://sentry.io/ (org: covorian)
- Monitor response latency in Vercel Observability
- Check WhatsApp delivery logs in MSG91 dashboard

---

## Rollback Procedure

### Option A: Git Rollback (fastest, 2 min)

```bash
# Revert the diagnostic swap
git revert HEAD~0 -m 1  # or git reset --hard HEAD~1

# OR: restore from git
git show HEAD~4:lib/llm.ts > lib/llm.ts
git show HEAD~4:app/api/demo-chat/route.ts > app/api/demo-chat/route.ts
git show HEAD~4:app/api/support-chat/route.ts > app/api/support-chat/route.ts
git show HEAD~4:tests/unit/llm-fallback.spec.ts > tests/unit/llm-fallback.spec.ts

# Re-add GLM_API_KEY to Vercel env (if deleted)
vercel env add GLM_API_KEY

# Deploy
vercel deploy --prod --yes
```

### Option B: Manual Provider Swap Back

Edit `lib/llm.ts`:
```typescript
// Line 8-9: Uncomment GLM, comment DeepSeek
export const GLM_MODEL = 'glm-4.5-flash'
const GLM_URL = 'https://api.z.ai/api/paas/v4/chat/completions'

// Line 26: rename deepseekOnce → glmOnce, etc.
// Line 165: update callLLM() to use glm instead of deepseek

// Revert demo-chat and support-chat imports
// Revert test descriptions
```

### Option C: Kill Switch (instant)

If DeepSeek is broken and you need immediate fallback without code changes:

```bash
# Unset the API key in Vercel — bot will immediately fall back to Cerebras
vercel env rm DEEPSEEK_API_KEY
vercel deploy --prod --yes
```

### Verification after rollback

```bash
# Confirm GLM_API_KEY is set
vercel env ls | grep GLM_API_KEY

# Redeploy
vercel deploy --prod --yes

# Monitor: watch for "GLM ok" or "GLM gave up" in logs
```

---

## Duration

This diagnostic is **temporary**. Plan to:

1. **Test window: 1–7 days** — collect behavior data, compare with prior GLM metrics
2. **Analysis: day 7–8** — report findings to founder (model quality vs. logic)
3. **Decision: day 8+**
   - If DeepSeek is clearly better → negotiate rate/quota and keep
   - If comparable → stay on DeepSeek (cost savings)
   - If worse → rollback to GLM via git revert

---

## Contact

For questions or issues during the diagnostic:

- **Sentry alerts:** Check [covorian](https://sentry.io/organizations/covorian) org
- **Logs:** Vercel Functions logs
- **Live testing:** demo-chat at https://convorian.in or production WhatsApp

---

*Diagnostic started: 2026-06-21*  
*Expected completion: 2026-06-28*
