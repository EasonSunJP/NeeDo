# Merchant Notice Publication Implementation Plan

> **For agentic workers:** Use executing-plans to implement this single Step 13 slice with test-first checkpoints and a read-only review before integration.

**Goal:** Let the independently authenticated merchant API publish and manage notices only for the current shop's formal cardholders, employees and technicians.

**Architecture:** Reuse the recovered notice service, persisted audience/delivery pipeline and recipient inbox. Add immutable issuer scope to existing notice rows and separate strict merchant routes; do not create another notification database or bypass formal merchant-shop selection.

**Tech Stack:** Express / TypeScript / Zod / Prisma / MySQL / Jest.

## Constraints

- Approved design: `docs/superpowers/specs/2026-09-03-portal-backend-notification-boundaries-design.md`.
- Keep platform management and merchant management route ownership distinct; worker and recipient routes remain shared.
- Merchant bodies cannot contain shop IDs, exact user IDs, platform audiences or issuer fields.
- Publication needs the current authenticated shop plus an active formal employee record; read-only operations preview cannot publish.
- Membership qualification requires an active, already-issued, unexpired card and active membership relation. Employees include currently employed personnel; technicians additionally require a current technician role and matching profile/affiliation.
- Employee/technician audiences are qualifying accounts' active identities, matching existing exact-account delivery semantics. Cardholder notices target customer identities. Never create recipients for unrelated accounts.
- Existing platform records default to PLATFORM; historical creator identity stays null rather than being invented.
- No frontend, online deployment, GitHub push or unrelated migrations in this slice.

## Task: Isolated merchant publication and lifecycle

**Files:** existing `backend/src/{services,repositories,validators,routes}/official-notice*`; new `backend/src/repositories/merchant-notice-audience.ts`; `backend/prisma/schema.prisma` and additive scope migration; permissions, app manifest mounting, OpenAPI; merchant notice tests and guarded local flow checker.

**Interfaces:** `NoticeIssuerScope = { type: "platform" } | { type: "shop"; shopId: number; actorUserId: number; actorIdentityId: number }`. The service derives scope, repositories enforce it, and the HTTP body cannot set it. `buildMerchantNoticeRecipientWhere(shopId, audience, now)` yields a Prisma identity predicate used by the existing bounded snapshot loop.

- [ ] Write strict merchant validator and scope tests: reject all/exact-users/foreign shop fields and verify current-shop/preview handling. Run explicit test paths and observe failure before source changes.
- [ ] Add PLATFORM/SHOP issuer model, Restrict foreign keys, scope indexes, merchant audience enum values, database constraint and dedicated read/create/review/send grants. Schema tests must cover historical defaults and immutable prior migration checksums.
- [ ] Add the recipient predicate and active publisher check. Test card expiry, absent card, ended employment, wrong shop, technician-role/affiliation mismatch and empty audience against real MySQL.
- [ ] Thread server-derived issuer scope through create/list/lifecycle operations. Keep platform idempotency fingerprints compatible and merchant scope part of merchant fingerprints. Scope must be checked before idempotency replay.
- [ ] Mount strict `/merchant-admin/official-notices` list/create/cancel/archive/retry routes only in merchant ownership, with dedicated RBAC. Document them in OpenAPI.
- [ ] Run explicit notice/merchant/auth boundary tests, lint, build and Prisma validation. Apply only this additive migration to the verified local DB when no unrelated migration is included.
- [ ] Exercise publication, frozen recipients, cross-shop denial, platform/merchant management isolation and cleanup using a local-only guarded checker. Review and fix important findings.
- [ ] Commit the verified slice, reconcile any newer local main changes and merge locally. Report browser/UI and cross-surface acceptance as still pending.
