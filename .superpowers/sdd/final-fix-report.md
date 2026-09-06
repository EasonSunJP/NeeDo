# Final review fixes — current recall policy state

## Completed scope

- `PlatformMembershipService.hasEffectiveBenefitAt` resolves the effective tier through the existing entitlement/adjustment/expiry path, then reads that tier's current published version at the recall timestamp. Its tier switch and global catalog switch govern recall. Missing published versions, catalogs, or entries reject with `error.platform_membership.benefit_catalog_unavailable` (500); non-customers remain ineligible.
- Existing entitlement-bound XP, theme, and price snapshot resolution is unchanged. Regression coverage proves both v2 off and v2 on override the opposite v1 switch while `resolveMembershipAt` retains v1.
- Each newly observed traceless terminal ID invalidates the bootstrap generation. An in-flight refresh discards a response from an older generation and serially performs a trailing authoritative request. Ordinary callers share the same refresh promise, and duplicate deletion events do not advance the generation. Existing message/history/summary terminal barriers remain in place.
- The deferred frontend regression observes a deletion and duplicate event during a pending pre-recall request, confirms ordinary coalescing, then verifies exactly one trailing request and the authoritative unread count and last-message summary.

## RED evidence

1. `npm --prefix backend test -- --runTestsByPath tests/current-membership-benefits.service.test.ts --runInBand`
   - 3 failed, 9 passed, 12 total.
   - Published v2 off incorrectly returned true; published v2 on incorrectly returned false; missing current published version incorrectly resolved true.
2. `npm test -- --run src/features/im/store.test.ts`
   - 1 failed, 41 passed, 42 total.
   - Deferred recall regression expected the third bootstrap call (the post-recall refresh), but only two calls occurred.

## Verification

- Frontend: `npm test -- --run src/features/realtime/api.test.ts src/features/im/formal-api.test.ts src/features/im/store.test.ts src/features/im/pages.test.ts` — PASS, 5 files, 237 tests.
- Backend: `npm --prefix backend test -- --runTestsByPath tests/current-membership-benefits.service.test.ts tests/realtime-service.test.ts tests/im-standard-recall.repository.test.ts tests/realtime-api.test.ts tests/openapi.test.ts --runInBand` — PASS, 5 suites / 112 tests.
- Root lint: `npm run lint` — PASS, exit 0.
- Root build: `npm run build` — PASS, 649 modules transformed. Existing mixed-import and chunk-size advisories remain unchanged.
- i18n audit: `npm run i18n:audit` — PASS, exit 0, existing baseline 7,473 missing source strings. The new test fixture uses an ASCII-only non-user-facing username so this slice does not increase the baseline.
- Final frontend regression after the fixture-only audit cleanup: `npm test -- --run src/features/im/store.test.ts` — PASS, 1 file / 42 tests.
- `git diff --check`: PASS before report staging; checked again before commit.

## Release boundary

- No schema change, migration, database write, rebase, merge, push, deployment, or authenticated browser acceptance was performed.
- Existing `.superpowers/sdd/progress.md` changes and untracked `node_modules` / `backend/node_modules` are excluded from this commit.
- Commit subject: `fix(im): honor current recall policy state`.
