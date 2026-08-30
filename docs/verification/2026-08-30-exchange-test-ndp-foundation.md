# Exchange Test NDP Foundation Verification

## Scope and stop gate

- Date/time zone: 2026-08-30, Asia/Tokyo.
- Isolated branch: `codex/exchange-demand-claim-step1`.
- Browser-tested implementation commit: `04a693df722f255af9ee7691a73cb7d545cc27ed`.
- Applied migration: `20260830210000_exchange_test_ndp_foundation`.
- This evidence covers only account classification, Test NDP currency/provisioning, wallet reads, finance separation, export exclusion, RBAC/audit, and the existing high-fidelity UI integration.
- Exchange Request publication fees, claiming, matching, booking, and payment remain unstarted behind the agreed stop gate.
- Push/deployment/payment status: not performed.

## Local database migration and backfill

Preflight before the migration/backfill reported:

- Active/deleted users: `251 / 1`.
- Wallets / NDP wallets / Test NDP wallets: `111 / 111 / 0`.
- NDP available/frozen totals: `807,000 / 0`.
- Ledger transactions / NDP ledger transactions / reconciliation rows: `106 / 106 / 106`.
- Order-financial rows: `1,399`.
- Wallet currency collisions: `0`.
- Relationship inconsistencies: `0`.

The non-mutating preview identified 251 users, 109 existing user wallets, 248 required credits totalling 24,298,000 Test NDP, no debits, and 3 unchanged accounts. Migration deploy then applied the foundation once. The audited backfill processed all 251 current users. A second preview proposed zero credits/debits and reported all 251 unchanged, proving rerun idempotency.

Postflight reported:

- Active users / test users / non-test users: `251 / 251 / 0`.
- Current user Test NDP wallets at exactly 100,000 available: `251`.
- Test NDP available/frozen totals: `25,100,000 / 0`.
- Frozen balance before/after: `0 / 0`.
- Currency mismatches: `0`.
- Formal-exportable Test NDP rows: `0`.
- Prisma status: `74` repository migrations; local database up to date.

## Automated verification

- Targeted backend: 14 suites, 216 tests passed.
- Targeted frontend: 6 files, 27 tests passed.
- Full backend Jest: 306 suites and 2,039 tests passed; 10 pre-existing suites / 38 tests skipped; no failures.
- Backend TypeScript lint and production build passed.
- Full frontend Vitest after the browser-found pagination fix: 239 files and 1,428 tests passed.
- Frontend TypeScript lint passed.
- Formal frontend production build and bundle audit passed: 8 HTML entries and 22 assets. Existing Vite dynamic-import/chunk-size warnings remained warnings, not failures.

## Real browser acceptance

Runtime ownership was the isolated worktree: formal backend on port 3000 and Vite frontend on port 5180. `/api/v1/health` was `ok`; `/api/v1/ready` was `ready` with MySQL and Redis healthy.

Operations administrator (`admin@lifedance.com`), `/pf-admin.html#/admin/users`:

- The real paginated users API returned total `251`, page size `20`.
- Page 1 rendered 20 Test Account badges with separate `0 NDP` and `100,000 Test NDP` balances.
- Browser exercise found that the existing UI had no way to navigate the server-paginated result. Commit `04a693df` added five-language previous/next/page controls and a regression test.
- Clicking next loaded page 2 and different persisted accounts. Selecting the test-account filter reset to page 1 and retained server pagination (`1 / 13`).
- The permission-gated classification action was visible to the administrator. No account classification was mutated merely for acceptance.

Operations administrator, `/pf-admin.html#/admin/finance`:

- All six NDP metrics displayed formal NDP as the primary value and `+ n Test NDP` as the secondary value.
- The settlement area displayed formal-only settleable NDP and explicitly stated that Test NDP is excluded.
- The API period used `Asia/Tokyo` and returned paired `{ ndp, testNdp }` values plus formal-only `settleableNdp`.
- The protected formal settlement CSV returned HTTP 200, the expected filename/header, zero data rows in the all-test current database, and no `TEST_NDP` row.
- Switching the live page to English showed the English settleable/exclusion labels; all five language dictionaries are covered by the frontend test.

Customer (`sim.customer.030@needo.local`), `/user.html#/me`:

- The personal center displayed `100,000 Test NDP` from the formal wallet API.
- Reload retained the same value.
- The session was logged out, the save-password control was disabled, and the same real test account was manually logged in again; the personal center still displayed `100,000 Test NDP`.
- Direct protected API verification returned active wallet currency `TEST_NDP`, available `100000`, frozen `0`; the summary returned formal `0/0` and Test NDP `100000/0` available/frozen.

Responsive/runtime checks:

- Desktop acceptance used 1280×720.
- At 390×844, the operations finance page and customer personal center had no document-level horizontal overflow; the paired finance labels and Test NDP wallet remained visible.
- Browser console inspection reported no errors or warnings on the accepted operations and customer pages.
- No failed application request was observed; the protected users, wallet, finance-summary, and CSV calls used the formal API and returned HTTP 200. Backend health/ready remained green after acceptance.

## Rollback boundary

All code is isolated on `codex/exchange-demand-claim-step1`. No push, merge, deployment, external payment, or real deduction was performed. The migration and audited calibration are independently identifiable; future Request/claim work must begin as another microstep only after this checkpoint is reviewed.
