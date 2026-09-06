# Task 3 — Traceless recall documentation and local verification

## Documentation completed

- `docs/realtime.md` records server-authoritative effective-benefit resolution, persisted `STANDARD` / `TRACELESS` terminal modes, history and preview filtering, unread-counter adjustment, content-free realtime/deletion facts, client removal behavior, and the local-only release boundary.
- `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md` adds the Step 13 local-code acceptance record with the same contract and identifies remaining migration/database and authenticated cross-account browser gates.

## Focused verification

1. Backend:

   ```sh
   npm --prefix backend test -- --runTestsByPath tests/current-membership-benefits.service.test.ts tests/realtime-service.test.ts tests/im-standard-recall.repository.test.ts tests/realtime-api.test.ts tests/openapi.test.ts --runInBand
   ```

   Result: PASS — 5 suites, 109 tests. The initial sandboxed attempt was blocked only because Supertest could not create its temporary `0.0.0.0` listener (`listen EPERM`); the same command rerun with the permitted local listener passed. No database mutation or migration was performed.

2. Frontend:

   ```sh
   npm test -- --run src/features/realtime/api.test.ts src/features/im/formal-api.test.ts src/features/im/store.test.ts src/features/im/pages.test.ts
   ```

   Result: PASS — 5 files, 236 tests, no warnings.

3. Root lint:

   ```sh
   npm run lint
   ```

   Result: PASS — `tsc -b --noEmit`, exit 0.

4. Root production build:

   ```sh
   npm run build
   ```

   Result: PASS — 649 modules transformed, exit 0. Existing Vite advisories remain: `SocialProfilePage.tsx` is both statically and dynamically imported, and the minified `main` chunk exceeds the 3,600 kB advisory threshold. They are warnings only and were not changed in this task.

5. i18n audit:

   ```sh
   npm run i18n:audit
   ```

   Result: command exit 0. The repository-wide audit reports an existing 7,473 missing-source-string baseline (`7,683` covered); this documentation-only slice adds no frontend source strings and does not alter that baseline.

## Review and release boundary

- `git diff --check` passes.
- Only `docs/realtime.md`, `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`, and this report are intended for this task's commit. Existing `.superpowers/sdd/progress.md` modification and untracked `node_modules` / `backend/node_modules` are not staged.
- No migration was added or applied. No database acceptance, push, staging/production deployment, authenticated browser acceptance, Task 3 rebase/merge, or worktree cleanup was performed.
- Rollback may revert the code to standard recall, but already traceless-recalled content must never be restored; the persisted terminal fact remains authoritative.

## Documentation correction — offline deletion-sync boundary

- The completed local slice delivers the server-authoritative traceless terminal result to online clients through `message.recalled` SSE and persists a content-free `TRACELESS_RECALL` `ImDeletionSync` fact.
- It does **not** add an `/im/sync` route or a client deletion-sync reader. Durable offline-device consumption, local-cache purge driven by that durable cursor, and cross-device offline acceptance remain pending and are not claimed by this task.
- `docs/realtime.md` now describes realtime terminal messages and persisted deletion facts as content-free and explicitly excludes prohibited original-content/media identifiers without asserting an exact minimal safe-field schema.
- Task 1 and Task 2 checkboxes, plus Task 3 documentation/static/review checkboxes, are marked complete in the implementation plan. Task 3 Step 4 remains unchecked and is explicitly reserved for the controller; no rebase, merge, migration, push, deployment, or browser acceptance occurred.

### Correction verification

- `rg` confirms `TRACELESS_RECALL` is represented by the existing Prisma `ImDeletionSync` model/action and selected by the realtime repository; `RealtimeService` publishes `message.recalled`, and the formal client maps that online event to terminal deletion.
- `rg -n '/im/sync' backend/src/routes src/features/im` returned no route or client-reader match.
- `git diff --check` passes after the documentation correction.
