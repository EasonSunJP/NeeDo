# Official Notice API Recovery

**Goal:** Restore the platform notice API on the current split-service backend with formal persisted delivery and current-identity receipt access.

**Scope:** Step 13, following the merged Prisma recovery `055a6199`. Reuse the existing, previously developed notice implementation as a recovery source; review and repair its transaction boundaries before enabling it. Platform management belongs to ops-api. Recipient APIs belong to the shared authenticated surface. Merchant publication, merchant audiences, frontend restoration and cross-portal browser acceptance remain subsequent microsteps in the approved boundary design.

## Work sequence

- [x] Restore existing validator, service, worker, repository, API and RBAC tests; confirm absent implementation fails.
- [x] Restore only official-notice backend source files, permission declarations and OpenAPI contracts.
- [x] Split management and recipient router factories and register them under explicit ownership.
- [x] Repair bounded audience snapshots and delivery batches, idempotent create/lifecycle replay, notice locking, read synchronization and retry fairness. Add regression tests around those behaviors.
- [x] Wire the worker and cross-instance event gateway to the formal server and independent API runtimes.
- [x] Run notice tests, service-boundary tests, schema/migration tests, lint and backend build.
- [x] Exercise a rollback-contained local MySQL delivery fixture, including identity isolation and duplicate dispatch.
- [x] Record evidence and verify the scoped backend slice for local-main integration. Continue merchant publication and frontend acceptance after this boundary passes.

## Earlier verification state

The schema recovery was merged after 10 focused assertions, Prisma validation/generation, backend build/lint and read-only physical database checks. The four tables matched 67 columns, 24 secondary indexes and 15 foreign keys. Full regression shard 1 passed 148 suites / 977 tests; subsequent shards were interrupted when their execution session disappeared. One auth ECONNRESET case passed an isolated rerun. The interrupted full run is not a full-suite pass.

## API recovery evidence

- Explicit-path focused regression: 19 suites / 154 assertions passed, including
  routes, RBAC, validator, OpenAPI, schema, transaction locking, service isolation,
  session store/audiences, realtime gateway and shutdown. Backend lint/build passed.
- Local MySQL rollback fixture: 508 recipient identities, 250-per-pass delivery,
  source snapshots, idempotent creation/delivery/read/cancel, wrong-identity rejection,
  elapsed-schedule replay and invalid past schedule rejection passed.
- Both single and all-read actions in the existing notification center synchronize
  the official receipt and preserve timestamps on replay.
- Two independent transactions dispatched to six existing test identities with
  exactly six Notifications and six captured events. A separate rendezvous made
  notice-detail and inbox read commands compete; the initial query ordering
  reproduced MySQL 1213. Uniform primary-key delivery locks fixed it; final check
  verified one timestamp and one audit. All uniquely marked committed fixtures
  were cleaned and the larger fixture rolled back.
- Review also fixed stale Repeatable Read snapshots, retry visibility, retry versus
  terminal finalization, and SSE shutdown ordering. Source copies are not translated
  content; worker totals are selected-notice cumulative totals.
- An earlier path-pattern invocation inadvertently matched the worktree directory
  name and selected the full suite. It exhausted the Node heap and is not counted
  as a successful full regression. Verification was rerun with explicit file paths.
- Concurrent local main changes were detected at `f9f35ac8`; integration must preserve
  those changes and rerun the focused gate on the merged state.

### Final integration gate

Implementation commit `db914697` was combined with local main `0d3e8fd3` by merge
`70cc6351`. The merged state passed 19 explicit-path suites / **155 tests** and
backend lint/build. Formatting was reconciled with main without changing unrelated
behavior. The local MySQL checker also passed concurrent notice/inbox reads with
one shared timestamp and one audit after the primary-key lock correction.
No pending DB migration was applied by this task. Local main was fast-forwarded
to `e39e014d`. The main checkout then passed the post-merge transaction/runtime/
route-ownership smoke gate: 3 suites / 16 tests. This is a local integration, not
a GitHub push, runtime/browser acceptance or online release.

No frontend, merchant issuer migration, live runtime restart, GitHub push or online
deployment is included in this recovery slice. Remaining product work is listed
in `docs/official-notice-delivery.md` and the approved boundary design.
