# AWS Staging environment-only SDD progress

Plan: docs/superpowers/plans/2026-09-03-aws-staging-environment-only.md
Branch: codex/aws-staging-deployment-design
Merge base: 3cc5a978e8afec42baa41bee0077bb4166c47265

Task 1: complete (commits 96a9eafc..375b5c55, review clean)
Task 2: complete (commits 375b5c55..3af34ba5, review clean)
Task 3: complete (commits 3af34ba5..efb8473c, review clean)
Task 4: complete (commits efb8473c..26dadf2b, review clean)
Task 5: complete (commits 26dadf2b..3a0245c5, final review approved)
Task 6: complete (commits 3a0245c5..5bbe1d6d, review approved)
Domain amendment: complete (commits 5bbe1d6d..4192aaeb, review approved; staging.needo.life)
Task 7: complete (commits 4192aaeb..977a4262, final review approved)
Task 8: complete (commits 977a4262..95988b4c, review approved)
Task 9: complete (commits 95988b4c..ecefac94, final review approved; 451/451 gate)

## Dual-region gate plan (2026-09-04)

Plan: docs/superpowers/plans/2026-09-04-aws-staging-dual-region.md
Task 1: complete (commits 6c7aad79..325c1fae, review clean; 89/89 focused tests)
Task 2: complete (commits 325c1fae..1143df57, review clean; 89/89 and 137/137 focused gates)
Task 3: complete (commits 1143df57..fead1126, review clean; 76/76 focused tests)
Task 4: complete (commits fead1126..ed516353, review clean after exact ARN-name fix; 162/162 focused tests)
Task 5: complete (commits ed516353..f5ca1295, review clean after credential-contract doc fix; 464/464 full AWS gate)
Final whole-branch review: needs fixes at f5ca1295 (atomic create-only, mutation-time identity binding, SSM document attestation, evidence/hostname/retained-policy corrections)
Final security amendment: approved by user; unified fix wave pending from f5ca1295

## Staging registration disable and selective account sync (2026-09-05)

Registration plan: docs/superpowers/plans/2026-09-05-staging-registration-disable-implementation.md
Account sync plan: docs/superpowers/plans/2026-09-05-staging-selective-test-account-sync-implementation.md
Start commit: b6131a23e72f67a418c98fb1eef685dc0aac68a5

Registration Task 1: complete (commits b6131a23..7b5310d5, review approved; 51/51 auth tests, build/lint clean)
Registration Task 2: complete (commits 7b5310d5..5a2b98ec, review approved; 22/22 UI tests, formal build clean)
Registration Task 3: complete (commits 5a2b98ec..4a552983, review approved; 13/13 release-contract tests)
Registration Task 4A: complete (commit 1df5c687, review approved; production bundles within unchanged budgets)
Registration Task 4: pending
Account sync Task 1: pending
Account sync Task 2: pending
Account sync Task 3: pending
Account sync Task 4: pending
Account sync Task 5: pending
Account sync Task 6: pending
Account sync Task 7: pending
## Supplemental latest-main integration

- Integrated latest local `main` (`09be4818`, technician public-ID canonicalization) into the Staging branch at merge commit `53424685`.
- Repaired the merged i18n bundle budget regression at `fdfdeef5`; focused tests, both i18n audits, and the unchanged-budget production build passed.
- Independent review: APPROVED with no Critical, Important, or Minor findings.
- Next: deploy exact `fdfdeef5`, verify migrations and public HTTPS, then continue selective account synchronization.

## Latest-main live release

- Deployed exact `fdfdeef5` to AWS account `430611185505` in `ap-southeast-2` through the immutable release path.
- Migration-precondition EBS snapshot completed; SSM deployment succeeded; all Prisma migrations are applied; Seed did not run.
- Activated the existing HTTPS configuration after release switch; HTTPS 200, HTTP-to-HTTPS 301, public readiness code 0.
- Both registration endpoints return exact 40313; database user/challenge counts were unchanged by controlled fail-closed calls.
- Desktop 1920px and mobile 546px login surfaces have no registration UI, no overflow, and no console errors.

## Latest-main follow-up release

- Deployed exact latest-main merge `d5c494a4` through the immutable Staging
  release path after a completed pre-migration snapshot.
- Activated the exact release HTTPS configuration by recreating only web;
  HTTPS readiness returned 200/code 0 and HTTP redirected 301.
- Registration and registration-verification remained fail-closed at 40313;
  a read-only count confirmed one undeleted Staging user. No account sync ran.

## Selective account sync Task 1

- `c637149c` defined the fixed 11-table account-sync bundle contract.
- `3e11744c` replaced locale collation with deterministic ordinal key ordering and added a Unicode regression test.
- Contract suite 8/8 and backend build passed; independent re-review APPROVED.

## Selective account sync Task 2

- `b718f6d2` implemented the loopback-only selective exporter and non-disclosing CLI.
- `c7fd808c` hardened date handling, final-row reference checks, role scopes, affiliation filtering, and written-file verification.
- `d14b2dae` restricted role scope aliases to the approved contract.
- Focused contract/exporter suites 19/19, backend build/lint, and diff checks passed; independent final review APPROVED.
- No real database connection or account bundle was produced during implementation.

## Selective account sync Task 3

- `0011aea2` implemented the single-transaction Staging importer and production MariaDB adapter.
- `2d685e24` hardened the real administrator baseline, MariaDB JSON/boolean handling, physical unique-key checks, and null scopes.
- `8e4f580f` and `1417ee4f` strengthened the production-adapter success fixture to exact 11-table physical row shapes and all approved mapping branches.
- Contract/importer suites 18/18, backend build/lint, and diff checks passed; independent final review APPROVED.
- No real database or AWS mutation occurred during implementation.

## Selective account sync Task 4

- `c42c4d68` implemented the AWS snapshot, backup, transfer, SSM import, cleanup, and redacted evidence orchestrator.
- `c9cc59ba` fixed AWS CLI namespaces, silent host output, authenticated backup, exact cleanup, strict evidence, and SSM polling.
- `29328d86` carried the exact logical-backup VersionId end-to-end through validation and evidence.
- Orchestrator suite 11/11, backend build/lint, syntax, and diff checks passed; independent final review APPROVED.
- No live AWS/database synchronization occurred during implementation.

## Selective account sync Task 5

- Deployed immutable importer-capable, registration-disabled Staging release
  `a9dfcbe2` to the approved Sydney staging account after a completed
  pre-migration snapshot.
- Activated the exact current release HTTPS configuration by recreating only
  the web service. HTTPS readiness returned 200/code 0; HTTP redirected 301.
- Both registration endpoints returned 40313, and a bounded read-only check
  confirmed exactly one undeleted user. No account sync or seed ran.

## Task 6 execution checkpoint (2026-09-05)

- User authorized current 251 source / 252 target baseline. `8b5be51c`
  implements that baseline and fixes S3 CLI flags and non-root bundle ownership;
  independent review approved.
- `5e9e9e02` fixes host Python/active-release manifest compatibility. Root reran
  account-sync orchestration tests: 12/12 passed. Independent review approved.
- Actual source export contains 251 users. No account import has run.
- Read-only migration comparison: source 126 completed, target 125 completed.
  Source-only migration is `20260903100000_exchange_matched_booking_conversion`.
  It exists in the exchange-matched-booking-conversion worktree, not pinned main
  `886dc470` or the staging branch. It changes Exchange/Booking and permission
  data, outside the approved 11-table selective sync scope.
- Do not weaken migration parity, deploy unrelated Exchange changes, alter
  migration history, or import until this plan boundary is resolved. Exact
  account-table schema comparison is in progress. Current deployed revision
  remains `d5c494a401d622288c92239033f9581f81aff66e`; current target has only its
  existing administrator.
