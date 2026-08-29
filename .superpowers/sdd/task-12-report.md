# Task 12 Report: Localized carousel publication verification

Status: COMPLETE; AUTOMATED, REAL-DB, RBAC, FAILURE-DEGRADATION AND ROOT BROWSER GATES PASS

## Delivered files

- `backend/scripts/check-localized-carousel-publication-flow.ts`
- `backend/tests/localized-carousel-publication-flow-script.test.ts`
- `backend/package.json` (`check:localized-carousel-publication-flow` only)
- `docs/localized-carousel-publication.md`
- `.superpowers/sdd/task-12-report.md`
- `src/pages/user/ServiceDetailPage.tsx`
- `src/pages/user/ServiceDetailPage.test.ts`

All pre-existing auth, profile, Social, settings, translation and share changes in the worktree were preserved and are excluded from this Task 12 commit.

## TDD evidence

The checker source/safety contract test was added before the script and package command. Its first run failed 4 tests because those files/contracts did not exist.

Two defects found while executing the real database lifecycle were converted into independent RED tests before fixes:

1. A unique run marker exceeded the 40-character `badge` column. The source contract first failed, then the checker switched to fixed `badge: "TEST"` while retaining the marker in marker-safe fields.
2. Historical rollback releases refer to source releases through `source_release_id`. The cleanup contract first failed, then cleanup was changed to null only the captured release ID sets before exact-ID deletion.

The safety review remediation added six independently observed RED contract failures for deploy/database normalization, exact command IDs and complete residue checks. The gated real-MySQL regression was separately RED because the exact-ID cleanup helper did not exist.

Final safety-focused results: checker contract 1 suite / 21 tests passed; exact cleanup real-MySQL regression 1 suite / 1 test passed.

The final integration rerun first hit a sandbox-only Prisma pool timeout because the restricted process could not open the local database socket. The same guarded command was rerun with approved local-database access and passed in 109 ms; no product assertion failed in the approved run.

## Safety and architecture review

- Explicit `ENV_FILE` is required and must exist.
- The checker accepts only development/test runtime, `DEPLOY_ENV=local|test`, local MySQL/Redis, and the exact database allowlist `needo_dev|needo_test`.
- The database pathname is URL-decoded, NFKC-normalized and lowercased before connector-insensitive `prod|production|staging` detection. Encoded and concatenated variants fail closed before Prisma and business services are dynamically imported.
- Console output contains a credential-free database target only; credentials, access/refresh tokens and bank data are not logged.
- One unique marker is generated per run.
- Real `ContentMediaService`, `OfficialAnnouncementService`, `CarouselPublicationService`, `ContentPublicationSchedulerService`, Affiliate marketplace policy and repositories are used. There is no mock/fallback/browser storage path.
- Before changing either fixed carousel scene, the checker refuses to run if that scene already contains releases. It does not archive or overwrite pre-existing local content.
- Every Service and scheduler command is resolved from its unique run-owned idempotency key to a command ID; `finally` deletes commands only by those exact IDs, never a cross-aggregate numeric release ID.
- `finally` verifies captured IDs for every created root/translation/slide/profile/wallet/identity/link/audit/command table plus the physical media file. Any residue prevents `cleanup=complete`.
- Final error composition is behavior-tested for operation-only, cleanup-only and combined failures. A combined failure throws one `AggregateError` containing the original operation error followed by every cleanup/disconnect error, so cleanup evidence cannot be masked.

## Real database lifecycle

The ignored local configuration was inspected without exposing credentials:

```text
NODE_ENV=development
DEPLOY_ENV=local
database=mysql://127.0.0.1:3307/needo_dev
redis=localhost:6379
backend health=200 ok
backend ready=200 ready (MySQL and Redis ready)
```

Command:

```bash
ENV_FILE='/Users/eason/Documents/New project/backend/.env.dev' \
  npm --prefix backend run check:localized-carousel-publication-flow
```

Observed checks:

```text
PASS independent English announcement edit persisted
PASS both carousel scenes published
PASS historical release rolled back as a higher version
PASS scheduled successor activated
PASS published scene disabled
PASS all five localized public projections reconciled
PASS publication audit actions reconciled
PASS cleanup residue verification across all captured rows and media files: 0
status=ok
cleanup=complete
```

The run covered `zh-CN`, `zh-TW`, `en`, `ja`, `ko`; `USER_HOME` and `AFFILIATE_HOME_NOTICE`; real image storage; a valid Shop/Technician/Service; published announcement plus valid AffiliateTask; immediate publish, schedule/activation, disable and rollback; public projections; task-action reconciliation; AuditLog and publication-command reconciliation.

One earlier run failed during cleanup at the newly discovered self-FK ordering boundary. A read-only exact-marker query found exactly two marker users and their marker-owned rows. A temporary exact-ID cleanup script nulled only their captured source release IDs, removed exactly that cohort and its media file, reported two users/three carousel releases/two announcement releases cleaned, and was then deleted. The final checker rerun completed with marker residue zero.

## Safety review remediation evidence

Before changing cleanup, a read-only query of the explicit local `needo_dev` target returned zero `content_publication_commands`, zero announcement releases, zero carousel releases and zero `content.*` audit rows. This proves there is no current surviving publication cohort to repair, but it cannot prove that an older unsafe run never deleted an opposite-aggregate command, and no absent row can be reconstructed without a backup or prior immutable log. No recovery write was attempted.

The real-MySQL regression then created two unique commands with the same numeric `release_id`, one Carousel and one OfficialAnnouncement. Deleting the captured Carousel command ID left the opposite aggregate command unchanged; test cleanup subsequently deleted both test IDs exactly. After the fixed full checker, a second read-only query again returned zero commands, announcements, announcement releases, carousels and content audits.

The second review first added three behavior tests for final error composition. RED was the missing `composeLocalizedPublicationCheckerError` export. GREEN proves the original error is returned for operation-only failure, cleanup-only remains an explicit cleanup `AggregateError`, and simultaneous operation/cleanup failures retain all errors in one combined `AggregateError`. The runbook now puts the empty fixed-scene precondition before the checker command and explicitly forbids deleting business content to satisfy it.

## Automated verification

Focused backend command from the implementation plan:

- 16 suites passed, 186 tests passed.
- The first sandboxed attempt hit `listen EPERM 0.0.0.0` in Supertest; an approved local rerun outside the binding sandbox passed. This was an execution-policy boundary, not a product assertion failure.

Focused frontend command from the implementation plan:

- 10 files passed, 149 tests passed.

Repository gates:

- Full backend: 226 suites / 1,548 tests passed; 9 suites / 37 tests conditionally skipped, including the explicitly gated local-MySQL cleanup integration.
- Full frontend: 195 files / 1,113 tests passed.
- Backend lint: passed.
- Backend build: passed.
- Frontend TypeScript lint: passed.
- i18n quality: exit 0, 14,196 entries, zero missing for `zh-Hant`, `ja`, `en`, `ko`; zero spreadsheet errors and zero English/Korean/traditional leak gates. Existing report baseline retains 460 Japanese simplified-character candidates and 41 same-as-source entries.
- i18n informational audit: exit 0, 11,547 Chinese source strings, 7,527 covered and 4,020 repository-wide extraction candidates; not treated as proof of the database publication lifecycle.
- Formal production build and production bundle audit: passed.
- `git diff --check`: passed.

Second-review focused gates after error-composition remediation: source contract 1 suite / 21 tests passed; backend lint passed; backend TypeScript build passed; `git diff --check` passed. The full-suite counts above are the immediately preceding Task 12 repository-gate run; the second review changed only the checker helper, its focused tests and documentation.

## Root browser acceptance

Root independently completed the ten-item acceptance workflow against isolated formal services on backend `3002` and frontend `5181`, with MySQL `3307` and Redis `6379` ready. The password was read only from ignored local environment data and was never emitted.

Observed browser evidence:

- separate `USER_HOME` and `AFFILIATE_HOME_NOTICE` editors and public scenes;
- exact five locale tabs, initial-copy provenance and an independent English edit that did not alter Japanese;
- real media upload, preview, immediate publish, v2 disable, rollback clone and final published v3;
- user-home click-through to the real `AC Cleaning Diagnostics` UUID service;
- formal affiliate announcement plus independent affiliate carousel and public announcement detail;
- affiliate header and same-session user/affiliate identity switching;
- viewer page read plus formal API HTTP 200 read and HTTP 403/code `40301` edit/publish denial, followed by restoration of the original operator role;
- local API outage contained to the carousel region while search, recommendations and bottom navigation remained usable;
- backend restart and retry restored the persisted v3 carousel;
- clean final pages for user home, service detail, affiliate home, announcement detail and backoffice editor with zero relevant console warnings/errors.

The browser run exposed one duplicate React key when a Service contained `Tokyo` in both `serviceAreas` and `tags`. A RED regression test was added, `buildServiceTagLabels` now deduplicates those combined chips, the focused test passed, and a fresh browser page confirmed the Service detail console is clean.

The real-database checker remains the direct evidence for native datetime scheduling/scheduler activation and all target-kind/claimable projections. The browser automation could not reliably drive Chromium's segmented `datetime-local` control, so the report does not mislabel a DOM-only value change as a browser schedule action. Full browser evidence and this limitation are recorded in `docs/localized-carousel-publication.md`.
