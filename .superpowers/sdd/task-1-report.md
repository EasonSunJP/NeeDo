# Task 1 — Membership traceless recall enforcement

## Scope completed

- Added `PlatformMembershipBenefitResolverPort.hasEffectiveBenefitAt(userId, "traceless_recall", occurredAt)` and the formal implementation on `PlatformMembershipService`.
- Marked `traceless_recall` as an available delivery capability; qualification now requires the current resolved membership, configured tier switch, global benefit switch, and delivery capability.
- Kept request `mode: "standard"` as the only accepted generic client action. `RealtimeService` determines the terminal mode server-side before repository mutation.
- Persisted `STANDARD` or `TRACELESS` terminal mode, matching deletion-sync action and content-free audit action/metadata. A newly applied traceless recall decrements only unread recipient counters and the shared visible-message filter omits `TRACELESS` while retaining `STANDARD` tombstones.
- Preserved an already stored terminal mode on replay and widened the OpenAPI response action to `standard_recall | traceless_recall`.
- Wired one formal platform-membership resolver through `createApp` and the realtime-route fallback, while leaving dependency overrides injectable for tests.

## RED evidence

1. Command:

   ```sh
   npm --prefix backend test -- --runTestsByPath tests/current-membership-benefits.service.test.ts tests/realtime-service.test.ts --runInBand
   ```

   Result: failed as expected before implementation. TypeScript reported `PlatformMembershipService.hasEffectiveBenefitAt` missing and `RealtimeService` accepted only five constructor arguments (no resolver dependency).

2. Command:

   ```sh
   npm --prefix backend test -- --runTestsByPath tests/im-standard-recall.repository.test.ts --runInBand
   ```

   Result: failed as expected before implementation. TypeScript reported `RecallMessageInput` did not contain `mode`.

## GREEN evidence

1. Core focused tests:

   ```sh
   npm --prefix backend test -- --runTestsByPath tests/current-membership-benefits.service.test.ts tests/realtime-service.test.ts tests/im-standard-recall.repository.test.ts --runInBand
   ```

   Result: PASS — 3 suites, 63 tests.

2. Required focused verification:

   ```sh
   npm --prefix backend test -- --runTestsByPath tests/current-membership-benefits.service.test.ts tests/realtime-service.test.ts tests/im-standard-recall.repository.test.ts tests/realtime-api.test.ts tests/openapi.test.ts --runInBand
   ```

   Result: PASS — 5 suites, 105 tests. The first sandboxed attempt could not bind Supertest (`listen EPERM 0.0.0.0`); the permitted local-listener rerun passed without warnings.

3. TypeScript production build:

   ```sh
   npm --prefix backend run build
   ```

   Result: PASS.

4. Lint:

   ```sh
   npm --prefix backend run lint
   ```

   Result: PASS.

## Files changed

- `backend/src/services/membership-benefit-capability.service.ts`
- `backend/src/services/platform-membership.service.ts`
- `backend/src/services/realtime.service.ts`
- `backend/src/repositories/realtime.repository.ts`
- `backend/src/app.ts`
- `backend/src/routes/realtime.routes.ts`
- `backend/src/api/openapi.ts`
- `backend/tests/current-membership-benefits.service.test.ts`
- `backend/tests/realtime-service.test.ts`
- `backend/tests/im-standard-recall.repository.test.ts`
- `backend/tests/realtime-api.test.ts`
- `backend/tests/openapi.test.ts`

## Self-review

- The client validator remains `z.literal("standard")`; no client-controlled traceless request was introduced.
- Resolver failure happens before `repository.recallMessage`, so there is no silent fallback mutation.
- Replay action derives from the persisted `message.recallMode`, not the current eligibility result.
- Traceless audit metadata contains only conversation ID and terminal mode and remains content-free.
- Shared `availableMessageWhere` is used by both history and conversation last-message selection, avoiding traceless preview/history leakage while standard tombstones remain visible.
- No migrations were applied, no deployment/push was performed, and no frontend files were changed.

## Concerns / deferred scope

- No database migration was applied; this task relies on the existing `TRACELESS` enum/schema groundwork and intentionally does not modify it.
- `backend/src/app.ts` already mounted `createPlatformSettingsRoutes` without its import and dependency types, which prevented the required API/OpenAPI suites from compiling. I added the missing import and injectable dependency declarations in the same app-wiring file; this is a compile repair, not a behavior expansion.
- Real browser cross-account validation, database migration application, staging, and deployment remain outside this task.
