# User Home Core Read Recovery Implementation Plan

> **Scope:** Step 09 micro-step only. Restore the formal user Home recommendation read after a transient network timeout without introducing fallback data or changing the backend contract.

**Goal:** A temporary `error.network.timeout` or equivalent network interruption must not leave the mounted Home page permanently failed.

**Architecture:** Keep `/api/v1/home/recommendations` as the single source of truth. Add a small, tested transient-retry helper for one bounded retry, use it only for the Home recommendation request, and expose a Home-local revision control for an explicit manual reload after the bounded retry is exhausted.

**Tech stack:** React 19, TypeScript, Vitest, Vite, existing runtime i18n.

---

### Task 1: Specify bounded transient recovery

**Files:**
- Create: `src/features/core-read/transientRetry.test.ts`
- Create: `src/features/core-read/transientRetry.ts`

- [ ] Add a failing test proving that a first `error.network.timeout` is retried once and can recover.
- [ ] Add tests proving non-transient API errors are not retried and a second transient failure is returned.
- [ ] Run the focused test and confirm RED before implementation.
- [ ] Implement the minimal one-retry helper with a bounded delay and no mock-data fallback.
- [ ] Run the focused test and confirm GREEN.

### Task 2: Wire recovery into the formal Home read

**Files:**
- Modify: `src/pages/user/HomePage.tsx`
- Modify: `src/pages/user/HomePage.test.ts`
- Modify: `src/i18n/translations.ts`

- [ ] Add a Home recommendation revision state and include it in the query dependencies.
- [ ] Wrap only `coreReadApi.getHomeRecommendations({ limit: 20 })` with the tested bounded transient retry.
- [ ] Add a visible `重新加载` action to both Home failure panels.
- [ ] Verify `重新加载` has Simplified Chinese, Traditional Chinese, Japanese, English, and Korean entries.
- [ ] Add focused source-contract assertions for the formal API, bounded retry, revision dependency, and reload action.

### Task 3: Verify the micro-step

**Files:**
- Modify: `docs/MOCK_RETIREMENT_MAP.md`

- [ ] Record the formal Home recovery behavior without changing the API contract or adding fallback data.
- [ ] Run focused Home/core-read tests.
- [ ] Run TypeScript lint, i18n audit, full tests, and the formal build.
- [ ] Recheck the direct and Vite-proxied `/api/v1/home/recommendations?limit=20` response.
- [ ] Inspect the final diff and confirm no unrelated user changes were overwritten.
