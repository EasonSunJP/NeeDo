# Manual eKYC backend report

Status: DONE for assigned implementation and automated validation. Runtime acceptance is parent-owned. Parent reported local migration applied; this agent did not apply migrations, create/seed accounts, restart services, commit, push, deploy, or edit frontend files.

## Delivered

- Complete profile Zod validation, NFKC kana/postal normalization, valid nonfuture date and occupation rules, bounded strings, strict unknown-field rejection.
- Encrypted immutable EkycApplication schema with user/reviewer FKs and indexes, nullable unique active applicant key, submitted/approved/rejected/withdrawn lifecycle and optimistic versioning.
- One transaction for applicant locking, duplicate/valid-verification protection and submission audit. One transaction for versioned terminal decision, EkycVerification approval record and actor audit. Unique/deadlock conflict mapping to 409.
- Owner and ops routes, controllers/service/repository; owner routes mounted shared and ops routes backoffice; dependency injection through AppDependencies.
- Dedicated permissions and seed constants; applied migration copies analogous existing active role grants only, including support read-only behavior.
- Existing policy/bank consumers read operations_manual verified records with compatible encrypted names and normalized nameMatchHash.
- Exact OpenAPI paths, bodies, pagination, errors and response schemas, plus docs/MANUAL_EKYC_WORKFLOW.md.

## API and frontend keys

No change to agreed eight-route contract. Lists additionally accept optional status for owners as well as ops. New profile detail contains the exact approved profile fields only. POST creation is 201; other successes 200.

Approval requires `{expectedVersion,reviewNote,identityConfirmed:true}`. Reject requires `{expectedVersion,rejectionReason}`. No other fields accepted in mutation bodies. Notes/reasons are nonblank <=1000. reviewNote/rejectionReason are visible in applicant summaries.

New keys:
- error.ekyc_application.not_found (404)
- error.ekyc_application.self_review_forbidden (403)
- error.ekyc_application.version_conflict (409)
- error.ekyc_application.active_application_exists (409)
- error.ekyc_application.already_verified (409)
- error.ekyc_application.invalid_birth_date (Zod issue; outer error.validation)
- error.ekyc_application.other_occupation_required (Zod issue; outer error.validation)

Other Zod/permission/auth failures use existing error.validation/error.forbidden/auth keys. Permissions: ekyc-application:own, ops:ekyc-application:read, ops:ekyc-application:review.

## Validation evidence

- TDD RED: new validator/service/repository/contract modules absent; API then failed expected status checks with 404 before route implementation. RED/GREEN outputs observed.
- Prisma generate PASS (Prisma Client 7.8.0). No migration apply by this agent.
- Backend `npm run build` PASS (exit 0).
- Full backend `npm run lint` PASS (exit 0).
- Targeted Jest PASS: 7 suites, 48 tests, 0 failures (16.005s). New manual-eKYC suites: 36 tests; compatibility includes identity application permissions and protected bank account service.
- Supertest initially hit sandbox listen EPERM; same test rerun with approved temporary local socket access passed. This was an environment restriction, not a product failure.
- Targeted command: `./node_modules/.bin/jest --runInBand tests/ekyc-application.validator.test.ts tests/ekyc-application.service.test.ts tests/ekyc-application.repository.test.ts tests/ekyc-application-contract.test.ts tests/ekyc-application-api.test.ts tests/identity-application-permissions.test.ts tests/protected-bank-account.service.test.ts tests/user-policy-enforcement.repository.test.ts`. Last name did not match a file; seven actual suites are those shown above (no user-policy repository test claimed).

## Limits and parent next gates

Injected Prisma tests verify lock-before-check order, unique schema, optimistic winner, active-key release, approval verification and audit ordering; they do not establish live MySQL isolation/rollback by themselves. Parent must verify real concurrent submission and competing decision outcomes and DB policy propagation, plus browser authenticated acceptance and staging rollout as separately authorized.

Existing unrelated merchant review default-list leak inspected only: backend/src/repositories/merchant-application-review.repository.ts:178 omits status when absent, allowing drafts. Existing query validator already excludes draft. Parent owns fix default allowed status set; this agent did not change it.

## Files

Modified:
- backend/prisma/schema.prisma
- backend/src/app.ts
- backend/src/constants/permissions.constants.ts
- backend/src/api/openapi.ts

Added:
- backend/prisma/migrations/20260907110000_manual_ekyc_applications/migration.sql (parent reports applied; immutable now)
- backend/src/validators/ekyc-application.validator.ts
- backend/src/services/ekyc-application.service.ts
- backend/src/repositories/ekyc-application.repository.ts
- backend/src/controllers/ekyc-application.controller.ts
- backend/src/routes/ekyc-application.routes.ts
- backend/src/api/ekyc-application.openapi.ts
- backend/tests/ekyc-application.validator.test.ts
- backend/tests/ekyc-application.service.test.ts
- backend/tests/ekyc-application.repository.test.ts
- backend/tests/ekyc-application-api.test.ts
- backend/tests/ekyc-application-contract.test.ts
- docs/MANUAL_EKYC_WORKFLOW.md

## Reviewer P2 follow-up: refresh validity time after acquiring lock

Fixed the race where create used service input.now captured before waiting for the applicant lock. An approval committing during that wait could have a newer verifiedAt, causing the old comparison to miss a valid verification. Repository create now captures evaluatedAt after the awaited user lock and active-application query, and uses that same fresh Date for both verifiedAt <= evaluatedAt and expiresAt > evaluatedAt.

Regression advances the fake clock during applicant lock acquisition, with an existing verification committed after the older submission time. Before the fix it failed because create resolved to submitted; after the fix it returns 409 error.ekyc_application.already_verified without creating an application or audit. It also checks both query timestamps match the post-lock time.

Fresh verification: repository/service Jest 2 suites / 17 tests PASS (6.226s); targeted ESLint PASS; backend npm run build PASS (exit 0); git diff --check PASS. Only repository and its regression test changed, plus this append-only report. Applied migration untouched; API/error contract unchanged. Reviewer /root/review_application_changes notified for review.

## Real local HTTP / database QA follow-up

Completed parent-authorized live acceptance with independent TEST user 1828 created through formal operations users/test-account APIs. Did not access guide accounts 1826/1827. Active user3000/PID23863 and ops3004/PID23862 both served the runtime worktree; read-only target verified as local needo_dev:3307.

18 HTTP assertions PASS and 10 read-only DB assertions PASS. Concurrent submits → 201/409, one application. Cross-owner pending detail →404. Withdraw/reapply and reject/reapply pass. Simultaneous approval/rejection →409/200 (rejection wins), no duplicate terminal audit. Final application4 approval changes /me/platform-membership ekycVerified false→true; reapply/reapproval then409. Applications1–4 final withdrawn/rejected/rejected/approved (all v2). Exactly one EkycVerification row ID1/provider operations_manual/reference manual-application-4 and eight application audits, approval actor1. Encrypted snapshots/name/kana/hash and no-PII audit metadata verified without printing decrypted fields.

Detailed credential-free evidence: docs/qa/2026-09-07-manual-ekyc-live.md. No source edits, restarts, migrations, seeds, commits or deployment performed in this QA pass. Initial read-only tool harness omitted token audience and then DB URL loaded from ENV_FILE; correcting harness environment resolution completed verification with no product changes. Full backend implementation gates remain those above; this follow-up closes the requested live concurrency/lifecycle/propagation gap for the tested schedules.

## Local missing-contract recovery follow-up

Parent reported empty legal catalog/current-contract 404 during the merchant walkthrough. Read and ran the existing backend/scripts/backfill-system-settings.ts, which imports unchanged src/bootstrap/legal-document-bootstrap.ts and existing legal terms/privacy sources, writes only missing catalogs/releases, rejects conflicting existing content, and records system backfill audits. Explicit root backend/.env.dev safety checks resolved local mysql://127.0.0.1:3307/needo_dev; production/staging rejected by the existing script. No source edits or contract wording changes.

Before: merchant/affiliate current routes in zh-CN/ja/en all404 error.contract.unavailable. After: all six200 success; merchant-2026-08-26-v1 and affiliate-2026-08-26-v1. Merchant text lengths zh-CN1109/ja668/en1871; affiliate1207/784/1998. Read-only DB matched all16 restored releases exactly to repository source title/body/contentHash and found7 catalog plus16 release backfill audits. Active platform settings remained ID1, updatedAt2026-09-06T09:50:05.167Z.

Idempotence: rerun returned23 verified entries, zero created/conflict; before/after DB snapshots were byte-identical for settings, catalog/release IDs/timestamps and audit counts. Existing system-settings-flow-script Jest5 tests PASS. Admin session used by this agent got403 for operations legal-document list; no permission bypass attempted, and user-facing current endpoints were independently verified200. Parent has separate operations browser session for catalog UI verification.

## Merchant bank resume UI follow-up

Bounded frontend fix requested by parent: MerchantApplicationPage now derives saved-bank reuse exclusively from existing bankAccountId + verified merchant bank status + verified reviewEvidence.bankAccount. It shows bank/branch/type, safe account/name masks and verified state in read-only fields, continuing without a bind mutation. Explicit Change bank account clears all bank inputs and opens the existing validated binding flow; masked evidence never enters input state or bind payload. Unverified/declared evidence is not reused. Existing corporate_registration mediaPurposes satisfies the upload requirement and shows saved status rather than forcing reupload.

Files touched: src/features/identity-applications/MerchantApplicationPage.tsx (bank state/action/UI only), matching test file (three new behavior cases), new bankResumeI18n.ts with zh/zh-Hant/ja/en/ko localized saved-account/change/document texts and fallback to existing translator. Parent's contractFailed/contractRevision/retry edits retained; no shared translation file edits and no new API/decryption path.

TDD: initial two new tests failed (mask missing and edit button absent). GREEN: MerchantApplicationPage + formModel Vitest two files /45 tests PASS, including resumed reuse/no reupload, explicit blank editing/no masked payload, and nonverified evidence validation. Full frontend TypeScript `npx tsc -p tsconfig.app.json --noEmit --pretty false` PASS (exit0, empty diagnostics), git diff --check PASS. Browser verification remains parent-owned.

## First approved merchant/technician identity visibility fix

Root cause verified against local TEST user1826: application3 approved, active merchant_owner identity7614/shop553 and scoped role existed, but publicIdentifier was null; real /auth/me200 exposed only customer7611. AuthService correctly filters unnumbered nondefault identities. Activation now calls the existing IdentifierAllocator/PublicIdentifierRepository for B merchant_owner and S technician aliases in the same approval transaction, reusing the existing accountNo; no auth filter bypass or fake identity added. Scout/shared customer behavior is unchanged.

Targeted recovery: new backend/scripts/repair-approved-identity-identifier.ts requires exactly --application-id ID and the existing explicit local nonproduction ENV_FILE guard. Its repository repairs only an approved merchant/technician application's exact activation activeKey, matching active user identity/scope and existing scoped role. Disabled/deleted identifiers are rejected, existing active identifiers yield verified without writes; new identifier and system audit are atomic. It does not scan other identities or change approval/roles.

TDD: merchant+technician activation alias assertions failed before implementation. Fresh tests: 5 suites /19 tests PASS (activation, targeted repair, merchant/technician review, affiliate activation), backend build PASS, targeted ESLint PASS, diffcheck PASS. Files: modified identity-activation.repository.ts and three repository tests; new identity-activation-identifier-repair.repository.ts, repair-approved-identity-identifier.ts, identity-activation-identifier-repair.test.ts. No eKYC or frontend edits in this pass.

Local authorized recovery for application3 returned repaired, then verified on second invocation. Real /auth/me200 now includes merchant_owner7614 with B identifier1156/publicId b9616829227 as well as customer. Read-only DB confirms app3 remains approved/version7/reviewer1 and exactly one system.identity_activation.identifier_repaired audit. Only user1826's previously approved identity was repaired. Complete browser workflow/staging acceptance follows parent release sequence; this targeted regression does not claim full release acceptance.
