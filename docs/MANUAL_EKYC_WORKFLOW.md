# Manual eKYC workflow — Step 12

An applicant explicitly submits a complete profile. Reading a page or either list does not create an application. Submission creates `submitted` only and never marks the user verified. Operations personnel must independently check external identity evidence and provide an explicit confirmation and review note before approving; self-review is forbidden.

## API

All paths use the configured `/api/v1` prefix, standard JSON envelopes, JWT authentication and dedicated permissions. IDs are positive Prisma integers. Lists are latest-first with `page` (1–100000), `page_size` (1–100, default 20), and optional `status`.

| Method and path | Permission | Body/result |
| --- | --- | --- |
| GET `/ekyc-applications/mine` | `ekyc-application:own` | Paginated own summaries |
| GET `/ekyc-applications/:id` | `ekyc-application:own` | Own summary and decrypted profile; other owners return 404 |
| POST `/ekyc-applications` | `ekyc-application:own` | `{profile}`; returns 201 detail in submitted state |
| POST `/ekyc-applications/:id/withdraw` | `ekyc-application:own` | `{expectedVersion}`; submitted → withdrawn |
| GET `/ops/ekyc-applications` | `ops:ekyc-application:read` | Paginated summaries |
| GET `/ops/ekyc-applications/:id` | `ops:ekyc-application:read` | Summary and decrypted profile |
| POST `/ops/ekyc-applications/:id/approve` | `ops:ekyc-application:review` | `{expectedVersion, reviewNote, identityConfirmed:true}` |
| POST `/ops/ekyc-applications/:id/reject` | `ops:ekyc-application:review` | `{expectedVersion,rejectionReason}` |

`reviewNote` and `rejectionReason` must be nonblank and at most 1000 characters. Review notes are visible to applicants: record the decision and kind of external check without copying sensitive document identifiers. Summaries contain `id,userId,status,version,createdAt,updatedAt,reviewedAt,reviewNote,rejectionReason`; lists never decrypt or return profiles.

Profile fields are exclusively `familyName,givenName,familyNameKana,givenNameKana,birthYear,birthMonth,birthDay,sex,postalCode,city,street,building,occupation,otherOccupation`. All are strings. Names and kana are limited to 100 characters; city/building/other occupation to 200; street to 500. Kana is NFKC-normalized katakana; postal code becomes seven digits after NFKC and space/hyphen removal. Birth date must be a real nonfuture date no more than 120 years ago. Sex is male/female. Occupation accepts employee, executive, civil_servant, self_employed, part_time, contract, homemaker, student, retired, other; other requires explanatory text. Unknown fields are rejected.

## Persistence and concurrency

`EkycApplication` stores the entire immutable submitted profile with the existing AES-256-GCM `SensitiveFieldCipherService`. No edit route exists. The nullable unique `activeUserId` key permits one submitted application per user. Applicant row updates acquire a transaction lock before duplicate/verified checks and before decisions; transactions use Read Committed so a waiter sees the preceding commit. Every terminal decision clears the active key. Withdrawn/rejected applicants can submit a new application, while a current verified record blocks a new submission.

Every decision atomically compares both submitted status and expected version. A stale/competing decision gets 409. Unique/deadlock Prisma conflicts map to the same safe conflict error; callers refresh and retry. Approval updates the application, inserts the existing `EkycVerification` model, and appends the actor audit in one transaction. Failures roll the transaction back.

The verification uses provider `operations_manual`, unique provider reference `manual-application-ID`, verified status, actual `verifiedAt`, no expiry, encrypted full name and kana, the existing bank-holder name normalization/HMAC, and a SHA-256 result digest bound to application, actor, version, timestamp and encrypted snapshot. Existing `UserPolicyEnforcementRepository` and `ProtectedBankAccountRepository` consume this verified record without alternative paths. Audit metadata contains identifiers/status/version only, never profile fields, notes, or ciphertext.

Permission constants feed the existing seed builder. The migration copies existing active grants from identity applicant and operations merchant-review permissions; customers and merchant roles receive no operations review privilege. Support receives read only where it already had operations merchant-review read access.

## Validation and rollout

New unit/HTTP/schema-contract suites cover complete profile normalization, malformed and excluded fields, read-only page entry, encrypted submission without verification, owner isolation, no self-review, stale/terminal decisions, version race winner, active duplicates, already verified users, terminal key release, verified field compatibility and actor audit ordering. Supertest runs require local temporary sockets. Tests use injected repository/Prisma boundaries; they do not claim live MySQL concurrency acceptance.

Local commands: `npm run prisma:generate`, `npm run build`, `npm run lint`, and targeted Jest suites matching `ekyc-application`, `identity-application-permissions`, `protected-bank-account.service`. Apply the new migration through the normal deployment gate; no existing migration may be edited. Live acceptance must separately verify concurrent submissions, competing decisions, reject/withdraw and resubmit, persisted verification/audits, and authenticated role behavior against the intended running environment.

## Related application navigation and recovery

Operations shop sidebar places Shop applications below Shop categories, replacing the old onboarding tab. Employee applications appear under merchant staff management. The operator summary review card opens the independent Manual eKYC review section. All routes retain formal RBAC guards.

Saved verified bank accounts can be reused from masked owner evidence; choosing to change the account starts fresh sensitive inputs. Existing corporate registration media is retained. Contract read failures expose retry without enabling submission. Merchant and technician activation allocate their public identity aliases in the approval transaction so authenticated identity switching can discover the approved role. For a previously approved local application missing its alias, `ENV_FILE=/absolute/local/env npx tsx scripts/repair-approved-identity-identifier.ts --application-id ID` verifies the active identity and existing scoped role, writes only the missing alias and system audit, and is idempotent. The maintenance command rejects staging and production; it never changes approvals or grants roles.
