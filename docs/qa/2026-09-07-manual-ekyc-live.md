
## Isolated live HTTP and persistence acceptance — manual eKYC

Date: 2026-09-07. Scope: isolated local TEST user **1828**, provisioned through authenticated operations `POST /users` and audited `PATCH /users/:id/test-account`. Existing guide shop user 1826 and technician user 1827 were not accessed or modified. The profile and operations notes explicitly describe local QA; this evidence does not assert a real natural person's identity was verified.

Runtime proved by listeners: user API 3000/PID 23863 and operations API 3004/PID 23862, both cwd `/Users/eason/Documents/New project/.worktrees/merchant-main-runtime/backend`. Read-only DB verification resolved the active environment to `127.0.0.1:3307/needo_dev`. No service restart, migration, direct permission/status DB mutation, or source edits performed in this QA pass.

**18 real HTTP assertions passed**, using separate login sessions and a two-thread start barrier for competing requests:

| Check | Observed result |
| --- | --- |
| Initial membership and applications | `ekycVerified=false`, application total 0 |
| Two simultaneous submissions | HTTP 201 and 409; only application 1 created |
| Pending submission | Membership remained false |
| Another authenticated owner reads pending detail | HTTP 404 |
| Owner withdrawal | Application 1 → withdrawn, version 2 |
| Withdrawn reapply | Application 2 → submitted |
| Operations rejection | Application 2 → rejected, version 2; membership remained false |
| Rejected reapply | Application 3 → submitted |
| Simultaneous approve and reject for version 1 | Approve 409, reject 200; application 3 rejected, version 2 |
| Reapply after competing rejection | Application 4 submitted; membership still false before approval |
| Final explicit test approval | Application 4 approved, version 2; membership changed to true |
| Verified user submits again | HTTP 409 |
| Repeated approval | HTTP 409 |
| Own list privacy | No profile or ciphertext fields in list |

**10 read-only database assertions passed**:

- User 1828 remains formally marked as TEST.
- Four application rows: 1 withdrawn, 2 rejected, 3 rejected, 4 approved; all version 2, all active keys cleared.
- Exactly one verification row: ID 1, provider `operations_manual`, reference `manual-application-4`, status verified, nonnull verifiedAt and null expiresAt.
- Every submitted snapshot remains encrypted and contains all 14 specified profile fields after authorized verification in memory; neither raw profile nor decrypted fields were logged.
- Encrypted verified name/kana and bank-compatible normalized nameMatchHash match the dedicated QA profile.
- Exactly eight application audits: four submitted events and four terminal decisions. Approved event has actor 1 and target application 4. The competing decision application 3 has exactly one terminal audit.
- Audit metadata contains identifiers, status and version only; failed competing requests produced no extra application/approval audit or verification row.

Runtime evidence files under `/tmp` contain no credentials: `needo-manual-ekyc-live-evidence.json`, `needo-manual-ekyc-db-evidence.json`, `needo-manual-ekyc-runtime-evidence.json`. Account credentials are kept separately in a mode-0600 temporary file and are intentionally omitted from this document.

This proves the tested real concurrent outcomes and persistence. It does not force a database fault to test rollback failure paths or reproduce every possible lock scheduling order; those remain covered by transaction structure and targeted regression tests. Staging and browser walkthrough acceptance are separate parent-task gates.
