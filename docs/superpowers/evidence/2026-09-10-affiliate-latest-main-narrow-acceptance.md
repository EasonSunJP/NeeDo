# Affiliate latest-main and narrow-viewport acceptance

Date: 2026-09-10 (Asia/Tokyo)

## Release boundary

- Branch: `codex/affiliate-merchant-task-workspace`
- Worktree: `/Users/eason/Documents/New project/.worktrees/affiliate-merchant-task-workspace`
- Latest local `main` synchronized for this acceptance: `6a3d1d9e9ca7571c1c01739a9092fd20cbf41d8d`
- Latest-main merge commit in this worktree: `40f84399`
- The final merge completed without conflicts, including an automatic merge of the shared OpenAPI module. The final post-merge cross-impact suite passed with 15 frontend files / 128 tests and 6 backend suites / 57 tests.
- This branch remains a quarantined future major release. Do not merge, cherry-pick, push, or deploy it until the user explicitly schedules the Affiliate release.

## Completed merchant Affiliate workspace

- Formal merchant-scoped publisher, shop, service, task list/detail, draft update, fee preview, and submit routes are mounted through the current merchant API architecture.
- Task display IDs are rendered as `AFF-...` values.
- Public shop IDs are rendered as `shop...` values.
- Merchant Account IDs, service database IDs, internal shop IDs, user IDs, identity IDs, and media IDs are not rendered as user-facing labels.
- Task access and actions use the formal RBAC permissions for page access, draft creation, and submission.
- The task editor covers publisher scope, shops/services, reward, date window, five-language content, server fee preview, optimistic-lock conflict recovery, and idempotent submission.
- The identity switch page renders one `TEST` badge beside Affiliate Marketing only.
- The merchant Affiliate route is lazy-loaded behind a route-level `Suspense` boundary so the quarantined workspace does not inflate the normal application entry chunk.

No Prisma schema or migration was added by this merchant-workspace batch. The Affiliate shop-public-ID-unavailable error uses the unique code `41040`.

## Exact 390 x 844 authenticated acceptance

The acceptance used a temporary merchant account created through the formal local models on `mysql://127.0.0.1:3307/needo_dev`. It performed normal password login, `/auth/me`, identity switching, task draft creation, reload, list inspection, editor inspection, and identity-page inspection.

- Viewport: `390 x 844`.
- Task ID: `AFF-e1cb5e7d-5ab0-4e25-b911-173d1724bb1a` was visible in the task list.
- Public shop ID: `shop7628618413` was visible in the list/editor evidence.
- Document widths for the list, editor, and identity page were all `390` for `innerWidth`, `clientWidth`, document `scrollWidth`, and body `scrollWidth`.
- The wide task table retains its deliberate internal horizontal-scroll region; no document-level horizontal overflow was present.
- `联盟营销 TEST` had exactly one TEST badge.
- Browser console errors: `0`.
- Page errors: `0`.
- Failed application responses: `0`.

Evidence:

- [Merchant Affiliate task list at 390 x 844](../../../artifacts/affiliate-qa-20260910/merchant-affiliate-list-390x844.png)
- [Merchant Affiliate editor at 390 x 844](../../../artifacts/affiliate-qa-20260910/merchant-affiliate-editor-390x844.png)
- [Identity switch Affiliate TEST badge at 390 x 844](../../../artifacts/affiliate-qa-20260910/identity-switch-affiliate-test-390x844.png)

The temporary task remained `DRAFT`. Guarded cleanup verified zero budget reservations and zero Affiliate ledger rows before deletion. Post-cleanup output was:

```text
{"status":"cleaned","marker":"affiliate-browser-qa-1789017370622-ed21860a","taskCount":1,"financeResidue":0}
```

## Fresh local verification

- Final frontend full Vitest suite after the last main refresh: 542 files / 3,586 tests passed.
- Lazy-load red/green regression: the new assertion failed against the static import, then passed after the route became lazy-loaded.
- Frontend TypeScript lint passed.
- Backend ESLint passed.
- Backend TypeScript build passed.
- i18n quality audit passed with 15,281 entries and zero missing entries in Traditional Chinese, Japanese, English, or Korean; spreadsheet errors and English CJK leaks were zero.
- Formal MySQL Affiliate checker passed publisher pagination, public IDs, display projection, fee-preview immutability, exact single/multi-shop freezes, idempotency, rollback cases, outsider-scope rejection, fresh-service persistence, and cleanup residue verification.
- The formal frontend Vite build completed with 871 transformed modules and emitted eight HTML entries. The lazy-loaded Affiliate page is a separate 64.09 kB asset and keeps the latest combined main JavaScript asset at 3,549.03 kB instead of the pre-lazy 3,610.52 kB measurement.

## Inherited latest-main findings

- The full backend run has one unrelated stale test assertion in `tests/realtime-social-activity.test.ts`: production code intentionally selects current customer, technician, and merchant display-name profiles, while this older test still expects the pre-change narrow Prisma selection. The Affiliate branch does not change either file. The Affiliate backend target suites and formal database checker pass.
- The production bundle audit reports the same latest-main i18n budget finding already recorded by the mainline stability batch: `3,705,956` bytes versus a `3,704,096`-byte limit, an overage of `1,860` bytes. The Affiliate branch has no diff under `src/i18n`; the budget was not raised. The formal build itself succeeds.
- A local background Exchange expiry worker logs application error code `40971` during runtime startup. It is outside the Affiliate flow and did not produce any failed Affiliate/browser response.
- Frontend dependency audit has inherited development/document-tool findings (2 moderate and 2 high). No unsafe dependency downgrade or broad `npm audit fix` was applied. Backend dependency audit reports zero vulnerabilities.

## Runtime isolation

- Acceptance runtime ports: backend `3003`, operations API `3004`, merchant API `3005`, frontend `5190`.
- All four acceptance listeners were stopped after evidence capture.
- Port `5180` remained owned by its pre-existing process and was neither stopped, restarted, killed, nor reconfigured.
- No Git remote, staging, or production operation was performed.
