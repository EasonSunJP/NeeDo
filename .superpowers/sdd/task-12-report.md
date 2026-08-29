# Task 12 Report: Localized carousel publication verification

Status: AUTOMATED AND REAL-DB GATES PASS; ROOT BROWSER ACCEPTANCE PENDING

## Delivered files

- `backend/scripts/check-localized-carousel-publication-flow.ts`
- `backend/tests/localized-carousel-publication-flow-script.test.ts`
- `backend/package.json` (`check:localized-carousel-publication-flow` only)
- `docs/localized-carousel-publication.md`
- `.superpowers/sdd/task-12-report.md`

All pre-existing auth, profile, Social, settings, translation and share changes in the worktree were preserved and are excluded from this Task 12 commit.

## TDD evidence

The checker source/safety contract test was added before the script and package command. Its first run failed 4 tests because those files/contracts did not exist.

Two defects found while executing the real database lifecycle were converted into independent RED tests before fixes:

1. A unique run marker exceeded the 40-character `badge` column. The source contract first failed, then the checker switched to fixed `badge: "TEST"` while retaining the marker in marker-safe fields.
2. Historical rollback releases refer to source releases through `source_release_id`. The cleanup contract first failed, then cleanup was changed to null only the captured release ID sets before exact-ID deletion.

The safety review remediation added six independently observed RED contract failures for deploy/database normalization, exact command IDs and complete residue checks. The gated real-MySQL regression was separately RED because the exact-ID cleanup helper did not exist.

Final safety-focused results: checker contract 1 suite / 18 tests passed; exact cleanup real-MySQL regression 1 suite / 1 test passed.

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

## Browser handoff to root

No checker records survive cleanup, so there are no checker IDs to reuse. Root should use formal local fixtures selected through the actual picker.

Prerequisites:

- backend `3000`, frontend `5180`, MySQL `3307`, Redis `6379` ready;
- `admin@lifedance.com` with password read only from ignored local environment;
- a formal `viewer` role account for 403 checks;
- a formal customer account;
- an activated Affiliate/scout account with marketplace read permission;
- valid published Shop, Technician, Service and visible AffiliateTask targets.

Routes:

- `/pf-admin.html#/admin/carousel`
- `/pf-admin.html#/admin/afirieito/announcements/carousel`
- `/user.html#/`
- `/afirieito.html#/afirieito`
- `/afirieito.html#/afirieito/announcements/:announcementPublicId`

Acceptance is the ten-item checklist in `docs/localized-carousel-publication.md`: both separate editors/scenes, initial copy and independent locale edit, lifecycle controls, real target navigation, announcement/task behavior, persistence across refresh/login/restart, viewer 403, contained API failure, and zero console warnings/errors.

This report does not claim those browser actions were performed by this subtask. Root must independently review the commit and record browser evidence afterward.
