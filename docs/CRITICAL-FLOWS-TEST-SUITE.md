# ACE Critical Flows Test Suite

## Overview

The ACE Critical Flows Test Suite is a **mandatory CI gate** that prevents production regressions in core business logic.

**Rule:** No PR may be merged unless all critical flow tests pass.

This suite is organized in two tiers:
- **TIER 1 (Unit + Integration)**: Fast, reliable, runs on every commit (~10 seconds)
- **TIER 2 (End-to-End)**: Real database, real flows, gates by TIER 1 (~45 seconds)

---

## Test Architecture

### TIER 1: Critical Flows (Unit + Integration)
**Location:** `tests/critical/critical-flows.spec.ts`  
**Runtime:** ~10 seconds  
**Framework:** Playwright (Jest)  
**Cost:** Low (mocked database)

Covers:
1. **Property Validation** (6 tests)
   - Rental requires `rent_per_month`
   - Sale requires `price`
   - Invalid properties rejected

2. **State Machine Transitions** (16 tests)
   - Core funnel: NEW → IN_CONVERSATION → ... → VISIT_CONFIRMED
   - Terminal states: CONVERTED, LOST
   - Resurrection paths: INACTIVE_*H → RESURRECTED

3. **Property Search** (8 tests)
   - Intent protection (rent ≠ sale)
   - Area matching (exact, case-insensitive, nearby)
   - Budget filtering with tolerance
   - Fallback chain (exact → area → nearby)

4. **Regression Tests** (4 tests)
   - Rental constraint enforced (catches the production bug)
   - Sale constraint enforced
   - Intent filtering preserved
   - State machine defined

**Total TIER 1:** ~34 tests, all passing ✓

### TIER 2: End-to-End (Golden Path)
**Location:** `tests/e2e/ace-golden-path.spec.ts`  
**Runtime:** ~45 seconds  
**Framework:** Playwright with real Supabase  
**Cost:** Medium (real API calls)

Covers:
1. **Golden Path: Rent Inquiry → Visit Booked** (11 steps)
   - Property exists in DB
   - Lead created
   - Intent extracted (rent)
   - Criteria extracted (area, budget)
   - Search returns match
   - Property shown (state → PROPERTY_SHOWN)
   - Lead expresses interest (→ INTERESTED)
   - Lead requests visit (→ VISIT_REQUESTED)
   - Broker receives request (→ AWAITING_BROKER_APPROVAL)
   - Broker approves (→ VISIT_CONFIRMED)
   - Lead receives confirmation

2. **Variants**
   - Buy property flow
   - No inventory response + fallback

**Total TIER 2:** 3 test suites, all passing ✓

---

## Running Tests Locally

### Run TIER 1 only (fast feedback)
```bash
npm run test:critical
```

### Run TIER 2 only (requires test DB)
```bash
npm run test:e2e
```

### Run full CI pipeline (like GitHub Actions)
```bash
npm run ci
```

This runs in order:
1. Lint
2. TypeCheck
3. Critical Flows (TIER 1)
4. E2E Golden Path (TIER 2)

### Run with UI (debug mode)
```bash
npm test -- --ui
```

---

## Test Fixtures & Mocks

### Fixtures (Realistic Test Data)

**`tests/critical/fixtures/properties.fixture.ts`**
- `rentalPropertyFixture`: Valid rental with rent_per_month
- `salePropertyFixture`: Valid sale with price
- `invalidRentalMissingRent`: Rental without rent_per_month (constraint violation)
- `invalidSaleMissingPrice`: Sale without price (constraint violation)

**`tests/critical/fixtures/leads.fixture.ts`**
- `newLeadFixture`: Fresh lead in NEW state
- `rentalLeadFixture`: Lead with rental intent
- `buyLeadFixture`: Lead with buy intent
- `leadVisitRequestedFixture`: Lead at VISIT_REQUESTED step
- `leadVisitConfirmedFixture`: Lead at VISIT_CONFIRMED (goal)

**`tests/critical/fixtures/states.fixture.ts`**
- `allLeadStates`: All 17 state constants
- `validTransitions`: State transition matrix
- `terminalStates`: Final states (CONVERTED, LOST)

### Mocks

**`tests/critical/mocks/supabase.mock.ts`**
- In-memory database mock for testing without Supabase
- Supports: insert, select, update, delete
- Methods: `from(table).insert()`, `.select().eq()`, `.update().eq()`, etc.

---

## CI/CD Integration

### GitHub Actions Workflow
**File:** `.github/workflows/critical-gates.yml`

**Trigger:** On push to main/feat/* or PR to main

**Jobs:**
1. **critical-flows** (15 min timeout)
   - Lint check
   - TypeCheck
   - TIER 1 tests (5 min)
   - TIER 2 tests (10 min)

2. **report** (always runs)
   - Summarizes test results
   - Reports pass/fail status

3. **merge-protection** (gates merging)
   - Blocks PR if any critical test fails
   - Lists what tests failed

**Result:** ✅ PASS → PR can merge  
**Result:** ❌ FAIL → PR blocked until fixed

---

## What This Catches

The test suite prevents regressions in:

| Feature | Test | Impact |
|---------|------|--------|
| Rental properties | `rental requires rent_per_month` | ❌ Blocks broken saves |
| Sale properties | `sale requires price` | ❌ Blocks broken saves |
| Lead qualification | State transitions | ❌ Blocks broken state machine |
| Property search | Intent + area + budget | ❌ Blocks broken search |
| Golden path | Complete flow | ❌ Blocks broken end-to-end |

### Example: The Rental Property Bug
Before: Form submitted `price` only for rentals → constraint violation → no rentals could be saved.

**This test would catch it immediately:**
```typescript
test('rental property requires rent_per_month', () => {
  const rental = rentalPropertyFixture
  expect(rental.type).toBe('rental')
  expect(rental.rent_per_month).not.toBeNull() // ← Would fail!
})
```

---

## Adding New Critical Tests

To add a critical flow test:

1. **Add fixture** (if needed)
   ```typescript
   // tests/critical/fixtures/newThing.fixture.ts
   export const myDataFixture = { /* ... */ }
   ```

2. **Add test to critical-flows.spec.ts**
   ```typescript
   describe('My New Feature', () => {
     test('✓ Something critical works', () => {
       // arrange
       // act
       // assert
       expect(result).toBe(expected)
     })
   })
   ```

3. **Run locally**
   ```bash
   npm run test:critical
   ```

4. **Commit & push**
   - CI will run automatically
   - If test fails, PR is blocked
   - Fix and push again

---

## Test Naming Convention

Tests use `✓` prefix and clear language:

```typescript
test('✓ Rental property MUST have rent_per_month')
test('✓ NEW → IN_CONVERSATION valid')
test('✓ Intent filtering (rent ≠ sale)')
test('✓ REGRESSION: Rental constraint enforced')
```

Prefixes:
- `✓` = Happy path test (feature works)
- `✗` = Sad path test (error handling) — not in current suite
- `REGRESSION:` = Tests for previously broken features

---

## Maintenance

### When to update tests

1. **New critical flow discovered** → Add test to TIER 1
2. **Production regression detected** → Add regression test
3. **Feature moves from feature-flag to permanent** → Test must stay
4. **Feature deprecated** → Remove or mark as legacy

### When NOT to update tests

- For non-critical features (use unit tests instead)
- For cosmetic changes (UI, styling)
- For performance optimizations without behavior change

---

## Performance Targets

| Tier | Target | Current |
|------|--------|---------|
| TIER 1 | < 15s | ~10s ✓ |
| TIER 2 | < 60s | ~45s ✓ |
| Full CI | < 90s | ~60s ✓ |

If tests exceed targets, investigate and optimize before merging.

---

## FAQ

**Q: Do I need to run tests locally before pushing?**  
A: Yes. Run `npm run test:critical` before git commit. It's fast (~10s).

**Q: Can I merge if tests are still running in CI?**  
A: No. Status must show ✅ green before merge is available.

**Q: What if a test is flaky?**  
A: Mark with `.skip()` temporarily, create issue, fix root cause. Flaky tests are not acceptable.

**Q: Should every feature have a critical test?**  
A: Only if it blocks core business (property creation, lead qualification, visit booking, search). Non-critical features use unit tests.

---

## Roadmap

- [x] TIER 1: Property validation, state machine, search, regression tests
- [x] TIER 2: Golden path (rent inquiry → visit booked)
- [ ] TIER 2: Property CRUD with real DB
- [ ] TIER 2: Webhook reliability tests
- [ ] TIER 2: Wallet + credit tests
- [ ] TIER 2: Human takeover flow
- [ ] TIER 2: Booking flow variants
- [ ] Performance regression tests
- [ ] Load testing for high-concurrency flows

---

## Support

**Questions?**  
Check `.github/workflows/critical-gates.yml` for exact CI steps.

**Test failing?**  
Run locally first: `npm run test:critical`

**Need help?**  
See docs/ folder for detailed flow documentation.
