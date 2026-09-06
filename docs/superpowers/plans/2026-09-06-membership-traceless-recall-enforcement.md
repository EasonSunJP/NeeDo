# Membership Traceless Recall Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing `traceless_recall` platform-membership benefit determine the authoritative recall mode so entitled users remove the message and recall residue for every participant while non-entitled users retain the existing standard tombstone.

**Architecture:** `PlatformMembershipService` exposes a narrow effective-benefit resolver backed by the current entitlement, published tier version, tier switch, and global catalog switch. `RealtimeService` resolves that benefit at recall time and passes the server-selected mode to the existing repository transaction. The repository persists either terminal mode, filters traceless rows from histories and conversation previews, adjusts unread counters, and emits only content-free facts. The frontend continues to send one generic recall action and applies the returned/SSE mode: standard upserts a tombstone; traceless deletes the row and refreshes the authoritative conversation summary.

**Tech Stack:** TypeScript strict mode, Express, Prisma/MySQL, Zod, Jest/Supertest, React, Vitest.

## Global Constraints

- The client must not select or infer `traceless`; the server resolves the current effective `traceless_recall` benefit at recall time.
- Current sender authorization, participant scope, and the 180-second authoritative recall window remain unchanged.
- `free` defaults off and `silver`, `gold`, and `black_diamond` default on through the already-migrated formal benefit catalog; the global benefit switch has highest priority.
- A standard recall remains a visible content-free tombstone; a traceless recall is absent from both participants' history and conversation preview.
- The persisted recall mode is terminal and idempotent; later membership changes cannot reinterpret it.
- Audit, SSE, and deletion-sync payloads must not contain message content, translations, media URLs, storage keys, file names, or thumbnails.
- Entitlement infrastructure failures must fail the recall without changing the message; they must not silently downgrade to standard recall.
- Do not add mock APIs, parallel membership configuration, a user-selectable mode, or a new database schema/migration in this microstep.
- Do not upload to GitHub, deploy, or apply migrations to a formal database.

---

### Task 1: Resolve effective benefit and persist the authoritative terminal mode

**Files:**
- Modify: `backend/src/services/membership-benefit-capability.service.ts`
- Modify: `backend/src/services/platform-membership.service.ts`
- Modify: `backend/src/services/realtime.service.ts`
- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/routes/realtime.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Test: `backend/tests/current-membership-benefits.service.test.ts`
- Test: `backend/tests/realtime-service.test.ts`
- Test: `backend/tests/im-standard-recall.repository.test.ts`
- Test: `backend/tests/realtime-api.test.ts`
- Test: `backend/tests/openapi.test.ts`

**Interfaces:**
- Produces: `PlatformMembershipBenefitResolverPort.hasEffectiveBenefitAt(userId, "traceless_recall", occurredAt): Promise<boolean>`.
- Consumes: `PlatformMembershipService.resolveMembershipAt`, `ResolvedPlatformMembership.benefitCatalog`, and the existing membership capability catalog.
- Produces: `RecallMessageInput.mode: "standard" | "traceless"` and response `action: "standard_recall" | "traceless_recall"`.

- [x] **Step 1: Write failing service tests**

Add tests proving effective-benefit resolution requires both tier and global switches, capability is marked available, Realtime selects `traceless` only when the resolver returns true, resolver failures reject before repository mutation, and an already-recalled mode is returned unchanged.

- [x] **Step 2: Run service tests and verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/current-membership-benefits.service.test.ts tests/realtime-service.test.ts --runInBand`

Expected: FAIL because `hasEffectiveBenefitAt` and the membership resolver dependency do not exist and recall always passes standard.

- [x] **Step 3: Write failing repository tests**

Extend the recall fixture with `conversationParticipant.updateMany` and assert `mode: "traceless"` writes `MessageRecallMode.TRACELESS`, `ImDeletionAction.TRACELESS_RECALL`, content-free `im.message.traceless_recall` audit metadata, decrements unread counters for unread recipients, and returns `recallMode: "traceless"`. Add source-level/query tests proving history and last-message selection exclude `TRACELESS` while keeping `STANDARD` rows.

- [x] **Step 4: Run repository tests and verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/im-standard-recall.repository.test.ts --runInBand`

Expected: FAIL because the repository hard-codes standard mode and does not filter traceless rows.

- [x] **Step 5: Implement the minimal backend behavior**

Mark `traceless_recall` delivery capability available. Add the narrow resolver to `PlatformMembershipService` using `resolveMembershipAt` and the current catalog entry. Inject it into `RealtimeService`; resolve before calling the repository and pass the selected mode. Generalize the repository terminal write and content-free action/audit values, decrement unread recipients only for a newly applied traceless recall, and exclude `TRACELESS` from the shared visible-message filter. Preserve the stored mode on idempotent replay.

- [x] **Step 6: Update API contract and dependency wiring**

Keep request `{ mode: "standard" }` as the compatible generic action. Widen response action to `standard_recall | traceless_recall`, document that the server selects the mode, and construct one formal membership resolver from `PlatformMembershipRepository` for realtime routes/app wiring. Dependency overrides must remain injectable in tests.

- [x] **Step 7: Run backend focused verification and commit**

Run: `npm --prefix backend test -- --runTestsByPath tests/current-membership-benefits.service.test.ts tests/realtime-service.test.ts tests/im-standard-recall.repository.test.ts tests/realtime-api.test.ts tests/openapi.test.ts --runInBand`

Expected: PASS with no new warnings.

Commit: `feat(im): enforce membership traceless recall`

---

### Task 2: Apply authoritative standard versus traceless results in the client

**Files:**
- Modify: `src/features/realtime/api.ts`
- Modify: `src/features/im/contract.ts`
- Modify: `src/features/im/model.ts`
- Modify: `src/features/im/formal-api.ts`
- Modify: `src/features/im/store.ts`
- Test: `src/features/realtime/api.test.ts`
- Test: `src/features/im/formal-api.test.ts`
- Test: `src/features/im/store.test.ts`
- Test: `src/features/im/pages.test.ts`

**Interfaces:**
- Consumes: backend response `action` and message `recallMode`.
- Produces: `ImRecallMessageResult.mode: "standard" | "traceless"` and `ImStoreUpdate` deletion reason `traceless_recall`.

- [x] **Step 1: Write failing adapter and store tests**

Add tests showing a `traceless_recall` HTTP response maps to mode `traceless`; a traceless `message.recalled` SSE event maps to message deletion; local recall and duplicate SSE remove the row, purge terminal media, rebuild the last-message summary from remaining rows, and never render a recall residue. Keep standard tests unchanged.

- [x] **Step 2: Run frontend tests and verify RED**

Run: `npm test -- --run src/features/realtime/api.test.ts src/features/im/formal-api.test.ts src/features/im/store.test.ts src/features/im/pages.test.ts`

Expected: FAIL because the API result only accepts `standard_recall` and the store always upserts a tombstone.

- [x] **Step 3: Implement the minimal frontend behavior**

Widen only response/result mode types. Keep the request mode literal `standard`. Validate that response action and message recall mode agree. For traceless HTTP or SSE outcomes, purge terminal media, remove the message by ID, rebuild the current conversation summary from remaining messages, and refresh the authoritative bootstrap; for standard outcomes, preserve the existing tombstone and draft restoration behavior. Give traceless deletion precedence over stale history and duplicate events.

- [x] **Step 4: Run frontend focused verification and commit**

Run: `npm test -- --run src/features/realtime/api.test.ts src/features/im/formal-api.test.ts src/features/im/store.test.ts src/features/im/pages.test.ts`

Expected: PASS with no new warnings.

Commit: `feat(im): remove traceless recalls from chat`

---

### Task 3: Update documentation and verify the complete local slice

**Files:**
- Modify: `docs/realtime.md`
- Modify: `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`
- Modify: `docs/superpowers/plans/2026-09-06-membership-traceless-recall-enforcement.md`

**Interfaces:**
- Consumes: the tested backend and frontend behavior from Tasks 1 and 2.
- Produces: an explicit local acceptance record and rollback boundary.

- [x] **Step 1: Document the final behavior**

Record server-authoritative membership resolution, terminal mode persistence, history/preview filtering, unread adjustment, content-free realtime/deletion facts, and frontend removal behavior. State that no migration was added or applied and no staging deployment occurred.

- [x] **Step 2: Run focused and static verification**

Run the backend and frontend commands from Tasks 1 and 2, then `npm run lint`, `npm run build`, and `npm run i18n:audit`.

Expected: all focused tests, lint, build, and i18n audit pass. Any unrelated repository-wide baseline failure must be reported separately with focused rerun evidence.

- [x] **Step 3: Review and commit**

Inspect `git diff --check`, `git status --short`, and the branch diff. Confirm no dependency symlink or scratch artifact is staged.

Commit: `docs(im): record traceless recall enforcement`

- [x] **Step 4: Rebase and merge locally**

Pending for the controller: rebase onto the latest local `main`, rerun the focused acceptance suite, then fast-forward the feature branch into the local `main` worktree while preserving unrelated dirty files. Do not push or deploy.
