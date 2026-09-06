# Exchange Quick Matching — local acceptance record

Date: 2026-09-07 JST  
Scope: formal Quick claim capacity, automatic all-claim matching, exact owner budget confirmation, persisted card presentation, privacy, concurrency, and financial non-mutation.  
Environment: local only. No push, deployment, staging migration, production write, or real payment was performed.

## Delivered behavior

- A Quick Request accepts claims through the existing authenticated claim API until the active count reaches its persisted effective target.
- The final within-budget claim atomically creates all Participants, marks every active claim and the Request/matching aggregate matched, and appends exactly one `QUICK_MATCHED` event.
- An over-budget full claim set stays open and returns the exact total, current effective maximum, required maximum, and required increase to the owner. New claims are closed at capacity.
- The owner can only confirm `increase_to_selected_total` for the exact full-set total. There is no checkbox or subset-selection path. Confirmation appends `BUDGET_INCREASED` before exactly one `QUICK_MATCHED` event.
- Idempotent replay returns the persisted result; the same key with a changed payload is rejected. Optimistic versioning and transaction locks produce one terminal winner under concurrency.
- Matching creates no Booking or payment rows, changes no wallet/hold/ledger/reconciliation values, and does not increment `ScheduleSlot.bookedCount`. The Request publication hold remains `active` and its financial projection remains `HELD`.

## Automated and database evidence

- Prisma status after synchronizing the latest local `main`: local MySQL `127.0.0.1:3307/needo_dev`; all 150 repository migrations applied and schema up to date.
- Backend Exchange regression: 55 suites discovered; 50 passed and 5 explicitly environment-gated integration suites skipped. 521 tests passed and 13 skipped; zero failures.
- Frontend Exchange regression: 13 files and 107 tests passed.
- Focused Quick concurrency proof on two independent connections: 2/2 passed. It proved one automatic winner for the final concurrent claims and one terminal winner plus identical replay for racing owner confirmations.
- Frontend lint/build and backend lint/build passed. The production bundle emitted only the repository's existing chunk-size/dynamic-import warnings.
- The rollback-only Quick checker reported every gate `true`: below-budget automatic match, exact over-budget decision, third-claim rejection, one Quick event, idempotent replay, changed-payload rejection, held publication fee, unchanged wallet/hold/ledger/reconciliation/schedule snapshots, zero Booking/payment rows, matched-participant privacy, and cleanup.

The final checker fixture used the formal service/repository transaction boundary and printed `cleanupVerified: true`. Its marker-owned database rows were absent after rollback.

## Isolated runtime ownership

- Backend listener: PID 616, port 3012, cwd `/Users/eason/.codex/worktrees/3625/New project/backend`.
- Frontend listener: PID 3695, port 5192, cwd `/Users/eason/.codex/worktrees/3625/New project`.
- Served branch during acceptance: `codex/exchange-quick-matching`, base feature tip `0257d1cc`; the final presentation corrections were loaded from the same worktree before commit.
- Backend environment file: `/Users/eason/Documents/New project/backend/.env.dev`.
- Database target: MySQL `127.0.0.1:3307/needo_dev`; Redis target: `localhost:6379`; token audience: `needo-backend`; Vite proxy target: `http://127.0.0.1:3012`.
- `/api/v1/health` returned `status: ok`; `/api/v1/ready` returned `status: ready` with both database and Redis healthy. The existing 3000/5180 listeners belonged to another runtime and were not touched.

Before final integration, local `main` had advanced from the feature base to `a6ae0e91`. It merged cleanly into the Quick branch as `687c7e9c`. The newer schema required regeneration of this worktree's generated Prisma Client; after `npm run prisma:generate`, the unchanged Exchange gate, Quick checker, concurrency proof, lint, and builds all passed against the synchronized tree.

## Authenticated browser acceptance

All browser actions used persisted ephemeral test accounts, formal Auth/RBAC/API calls, the isolated frontend/backend pair above, and real local MySQL/Redis state.

1. Within-budget Request post 86 received provider quotes of ¥11,000 and ¥12,000. The first remained active and withdrawable. The second atomically matched both claims for ¥23,000. Reload preserved both matched cards.
2. Over-budget Request post 87 received two ¥16,000 claims against a ¥25,000 ceiling. The owner saw 2/2 claims, ¥32,000 total, ¥25,000 current maximum, and the exact ¥7,000 increase. Only the all-claim confirmation was available. Desktop confirmation persisted the ¥32,000 effective maximum and both matched claims.
3. Capacity Request post 88 had two active claims while its over-budget decision was pending. A third provider at 440 px saw no claim form or enabled submit action; the footer showed matching closed.
4. Owner and provider cards showed the persisted provider public IDs, technician names, shop, service, schedule, quote, original-language message, and the persisted avatar projection or deterministic fallback. Matched providers received the allowed filled-address/publisher projection; telephone, email, tokens, and financial internals were absent.
5. At 320 px, viewport/document/body widths were 320/320/320. At 440 px they were 440/430/430, and at desktop 1280 px they were 1280/1270/1270. No horizontal overflow was present.
6. Product console and request observations contained no application errors or failed API calls. Chrome produced only browser-extension async-channel noise, which was outside the application origin; the clean capacity tab had zero console errors.

Browser acceptance found two presentation defects before completion: an accepted budget increase left the detail/footer on the original maximum, and a matched Quick Request reverted to the Selective explanation. Regression tests were added first; the detail page now consumes the persisted effective budget from matching, and the claims panel keeps its explanation keyed to the Request's immutable match mode. Both tests and the full frontend Exchange suite pass.

## Database reconciliation and cleanup

Before cleanup, post 86 was `MATCHED` with selected total ¥23,000, original/effective maximum ¥25,000, two matched claims, two Participants, and one `QUICK_MATCHED` event. Post 87 was `MATCHED` with selected total ¥32,000, original maximum ¥25,000, effective maximum ¥32,000, two matched claims, two Participants, and one `QUICK_MATCHED` event.

For both posts, Booking count and `OrderFinancial` count were zero; the publication hold remained `HELD`; wallet values, ledger rows, and reconciliation rows were unchanged. Cleanup deleted only captured fixture IDs, including generated technician work-state rows, and then returned zero remaining rows for every tracked fixture group. The separate post 88 capacity fixture also returned zero remaining rows. Browser sessions were logged out before cleanup.

## Explicitly deferred

- Manual matching close and Request publication half-fee capture/release.
- Any appointment-state expansion beyond the already separate matched-participant-to-`PENDING`-Request-order conversion.
- Service payment, external payment, and real settlement.
- Remote push, staging or production migration/deployment, and staging authenticated acceptance.
- Starting the next Exchange microstep.

## Final local main integration

Local `main` was fast-forwarded from `a6ae0e91` after the latest `main` had first been merged into the feature branch without conflicts. On the merged `main`, the same 55-suite backend Exchange gate passed with 50 suites/521 tests passing and only 5 suites/13 tests skipped behind their documented environment flags; all 13 frontend Exchange files and 107 tests passed. Frontend/backend lint and builds passed, and the explicitly enabled Quick checker and two-connection concurrency suite passed again with cleanup verified. The main worktree's pre-existing, unrelated identity-application edits were neither staged nor committed. The isolated 3012/5192 acceptance runtime was stopped, and no remote push or deployment followed.
