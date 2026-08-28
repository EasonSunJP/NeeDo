# Affiliate Alliance Invitations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a production-backed 72-hour Affiliate alliance invitation loop in which an alliance owner can invite eligible reciprocal NeeDo friends, and the invited Affiliate can accept or reject with durable MySQL state, RBAC, audit records, expiry, and a usable responsive UI.

**Architecture:** Extend the existing alliance aggregate instead of creating a parallel identity or organization model. HTTP requests pass through Zod controllers and the existing alliance service into a Prisma repository; all send/respond state transitions are transactional, while both request-time expiry checks and a no-overlap worker enforce the 72-hour boundary. The existing `/afirieito/organization` page consumes only formal `/api/v1/` endpoints and always refreshes server state after mutations.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Express, Zod, Prisma, MySQL 8, Redis-backed JWT/RBAC, Jest, Supertest, OpenAPI.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-28-affiliate-alliance-invitations-design.md` as the accepted behavior contract.
- Keep the existing `User`, `Contact`, `AffiliateProfile`, `AffiliateAlliance`, `AffiliateAllianceMember`, and `AffiliateAlliancePermission` records authoritative.
- Do not add browser-stored fallback records, fixture candidates, demo responses, or a second alliance page.
- Only an active alliance owner may list candidates, list sent invitations, list members, or send an invitation in this slice.
- Invitees are addressed by immutable public `needoId`; responses must not expose internal user, identity, contact, eKYC, or bank identifiers.
- Revalidate reciprocal unblocked contacts, active Affiliate identity/profile, alliance state, parent membership, and unique active membership on both send and accept.
- Use UTC `Date` values in persistence and ISO 8601 strings at the API boundary. The business duration is exactly `72 * 60 * 60 * 1000` milliseconds and is not configurable.
- Keep expiry scan interval and batch size configurable through the validated backend environment.
- Preserve unrelated dirty-worktree changes. Each task is independently testable and ends with a focused commit.
- Do not implement permission editing, exit, removal, ownership transfer, task assignment, settlement, ranking, merchant administration, or platform administration in this plan.

---

### Task 1: Add the invitation schema, migration, error contract, and RBAC permissions

**Files:**

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260828210000_affiliate_alliance_invitations/migration.sql`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Modify: `backend/tests/affiliate-alliance-schema.test.ts`
- Modify: `backend/tests/affiliate-alliance-migrations.test.ts`
- Modify: `backend/tests/affiliate-permissions.test.ts`

- [ ] **Step 1: Write failing schema and permission tests**

  Assert that the Prisma schema includes both invitation enums, the invitation model, all three timestamps, soft deletion, versioning, relations, the unique nullable `pendingKey`, and query indexes. Assert that the permission catalog and role maps contain exactly these new keys:

  ```ts
  const invitationPermissions = [
    "affiliate-alliance:members:list",
    "affiliate-alliance:candidates:list",
    "affiliate-alliance:invitations:list",
    "button:affiliate-alliance-invite",
    "button:affiliate-alliance-invitation-respond",
  ] as const;
  ```

  The migration test must read the new SQL file and prove it creates the table, foreign keys, indexes, nullable unique key, role/parent check, and incremental role-permission assignments without editing the earlier alliance migrations.

- [ ] **Step 2: Run the focused tests and confirm the intended red state**

  Run:

  ```bash
  cd backend
  npm test -- --runInBand tests/affiliate-alliance-schema.test.ts tests/affiliate-alliance-migrations.test.ts tests/affiliate-permissions.test.ts
  ```

  Expected: failures identify the missing invitation model, migration, and five permission keys.

- [ ] **Step 3: Add the Prisma invitation model and relations**

  Add these enums and model, adapting relation names only where Prisma requires uniqueness:

  ```prisma
  enum AffiliateAllianceInvitationRole {
    PARTNER     @map("partner")
    SUBORDINATE @map("subordinate")

    @@map("affiliate_alliance_invitation_role")
  }

  enum AffiliateAllianceInvitationStatus {
    PENDING  @map("pending")
    ACCEPTED @map("accepted")
    REJECTED @map("rejected")
    EXPIRED  @map("expired")

    @@map("affiliate_alliance_invitation_status")
  }

  model AffiliateAllianceInvitation {
    id                     Int                               @id @default(autoincrement())
    allianceId             Int                               @map("alliance_id")
    inviterMemberId        Int                               @map("inviter_member_id")
    inviteeUserId          Int                               @map("invitee_user_id")
    role                   AffiliateAllianceInvitationRole
    proposedParentMemberId Int?                              @map("proposed_parent_member_id")
    status                 AffiliateAllianceInvitationStatus @default(PENDING)
    pendingKey             String?                           @unique @map("pending_key") @db.VarChar(191)
    expiresAt              DateTime                          @map("expires_at")
    respondedAt            DateTime?                         @map("responded_at")
    expiredAt              DateTime?                         @map("expired_at")
    version                Int                               @default(1)
    createdAt              DateTime                          @default(now()) @map("created_at")
    updatedAt              DateTime                          @updatedAt @map("updated_at")
    deletedAt              DateTime?                         @map("deleted_at")

    alliance             AffiliateAlliance        @relation(fields: [allianceId], references: [id], onDelete: Restrict)
    inviterMember        AffiliateAllianceMember  @relation("AllianceInvitationInviter", fields: [inviterMemberId], references: [id], onDelete: Restrict)
    invitee              User                     @relation("AffiliateAllianceInvitationInvitee", fields: [inviteeUserId], references: [id], onDelete: Restrict)
    proposedParentMember AffiliateAllianceMember? @relation("AllianceInvitationParent", fields: [proposedParentMemberId], references: [id], onDelete: Restrict)

    @@index([allianceId, status, createdAt])
    @@index([inviteeUserId, status, createdAt])
    @@index([status, expiresAt, id])
    @@index([inviterMemberId])
    @@index([proposedParentMemberId])
    @@index([deletedAt])
    @@map("affiliate_alliance_invitations")
  }
  ```

  Add inverse relations to `User`, `AffiliateAlliance`, and `AffiliateAllianceMember`. Keep the existing member `activeKey` unique constraint unchanged.

- [ ] **Step 4: Create the incremental SQL migration**

  Generate the migration in the feature worktree using the approved local development database, then inspect the SQL. Ensure it contains the database check:

  ```sql
  CONSTRAINT `AffiliateAllianceInvitation_role_parent_check`
    CHECK (
      (`role` = 'PARTNER' AND `proposedParentMemberId` IS NULL)
      OR (`role` = 'SUBORDINATE' AND `proposedParentMemberId` IS NOT NULL)
    )
  ```

  In the same incremental migration, insert the five permissions, assign them only to active `admin` and `scout` roles, and soft-delete corresponding role assignments for every other role. Never modify an already-applied migration.

- [ ] **Step 5: Add stable error keys and permission constants**

  Add the nine accepted error keys to the existing error-code structure:

  ```ts
  ownerRequired: "error.affiliate_alliance.owner_required",
  inviteeNotEligible: "error.affiliate_alliance.invitee_not_eligible",
  mutualContactRequired: "error.affiliate_alliance.mutual_contact_required",
  invitationDuplicate: "error.affiliate_alliance.invitation_duplicate",
  invitationNotFound: "error.affiliate_alliance.invitation_not_found",
  invitationExpired: "error.affiliate_alliance.invitation_expired",
  invitationStateConflict: "error.affiliate_alliance.invitation_state_conflict",
  parentInvalid: "error.affiliate_alliance.parent_invalid",
  alreadyJoined: "error.affiliate_alliance.already_joined",
  ```

  Add the five permission definitions and role mappings without broadening any unrelated role.

- [ ] **Step 6: Generate Prisma, validate, and make focused tests green**

  Run:

  ```bash
  cd backend
  npm run prisma:generate
  npx prisma validate
  npm test -- --runInBand tests/affiliate-alliance-schema.test.ts tests/affiliate-alliance-migrations.test.ts tests/affiliate-permissions.test.ts
  ```

- [ ] **Step 7: Commit the schema slice**

  ```bash
  git add backend/prisma/schema.prisma backend/prisma/migrations/20260828210000_affiliate_alliance_invitations/migration.sql backend/src/constants/permissions.constants.ts backend/src/constants/error-codes.ts backend/tests/affiliate-alliance-schema.test.ts backend/tests/affiliate-alliance-migrations.test.ts backend/tests/affiliate-permissions.test.ts
  git commit -m "feat: add affiliate alliance invitation schema"
  ```

---

### Task 2: Define strict request validation and service-domain rules

**Files:**

- Modify: `backend/src/validators/affiliate-alliance.validator.ts`
- Modify: `backend/src/services/affiliate-alliance.service.ts`
- Modify: `backend/tests/affiliate-alliance-validator.test.ts`
- Modify: `backend/tests/affiliate-alliance.service.test.ts`

- [ ] **Step 1: Write failing validator tests**

  Cover default pagination, maximum `pageSize=100`, optional trimmed search, status filtering, immutable NeeDo ID, lower-case API roles, parent-role combinations, positive invitation IDs, strict empty response bodies, and unknown-field rejection.

  The intended schemas are:

  ```ts
  export const affiliateAllianceListQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    q: z.string().trim().max(80).optional(),
  }).strict();

  export const createAffiliateAllianceInvitationSchema = z.discriminatedUnion("role", [
    z.object({
      inviteeNeedoId: needoIdSchema,
      role: z.literal("partner"),
      proposedParentMemberId: z.null().optional(),
    }).strict(),
    z.object({
      inviteeNeedoId: needoIdSchema,
      role: z.literal("subordinate"),
      proposedParentMemberId: z.number().int().positive(),
    }).strict(),
  ]);
  ```

- [ ] **Step 2: Write failing service tests for authorization and time boundaries**

  Extend the repository test double and assert:

  - current active identity must remain `scout`;
  - owner-only operations reject partners/subordinates with `owner_required`;
  - received invitation operations are scoped to `inviteeUserId` and foreign IDs map to `invitation_not_found`;
  - `expiresAt === now` is expired, while `expiresAt > now` can proceed;
  - expiration time passed to the repository is exactly 72 hours after the injected clock;
  - accepted member permissions are all false;
  - repository conflicts map to stable domain errors rather than raw Prisma errors.

  Inject a clock instead of using fake timers in production code:

  ```ts
  const ALLIANCE_INVITATION_TTL_MS = 72 * 60 * 60 * 1000;

  type AffiliateAllianceServiceDependencies = {
    repository: AffiliateAllianceRepositoryPort;
    now?: () => Date;
  };
  ```

- [ ] **Step 3: Run the focused tests and confirm red**

  ```bash
  cd backend
  npm test -- --runInBand tests/affiliate-alliance-validator.test.ts tests/affiliate-alliance.service.test.ts
  ```

- [ ] **Step 4: Implement validator schemas and exported inferred types**

  Reuse the repository-wide pagination and NeeDo ID validation conventions. Add separate sent-invitation and received-invitation query schemas with optional status values `pending`, `accepted`, `rejected`, and `expired`. Use `.strict()` for every object body.

- [ ] **Step 5: Extend the service port and public DTOs**

  Add explicit methods for:

  ```ts
  listMembers(context, query)
  listEligibleContacts(context, query)
  listSentInvitations(context, query)
  createInvitation(context, input)
  listReceivedInvitations(context, query)
  acceptInvitation(context, invitationId)
  rejectInvitation(context, invitationId)
  ```

  Define public summaries using only public alliance, member, parent, inviter, and invitee projections. Centralize lower-case API role/status mapping and do not cast raw Prisma records in controllers.

- [ ] **Step 6: Implement service orchestration and error mapping**

  Keep domain authorization in the service even when the route has RBAC. Pass `now` into repository mutation methods so expiry decisions and audits share one timestamp. Map repository result unions such as `owner_required`, `mutual_contact_required`, `duplicate`, `expired`, `state_conflict`, `parent_invalid`, and `already_joined` to the accepted API error keys and HTTP statuses.

- [ ] **Step 7: Make focused tests green and commit**

  ```bash
  cd backend
  npm test -- --runInBand tests/affiliate-alliance-validator.test.ts tests/affiliate-alliance.service.test.ts
  cd ..
  git add backend/src/validators/affiliate-alliance.validator.ts backend/src/services/affiliate-alliance.service.ts backend/tests/affiliate-alliance-validator.test.ts backend/tests/affiliate-alliance.service.test.ts
  git commit -m "feat: define alliance invitation rules"
  ```

---

### Task 3: Persist candidate discovery and invitation state transitions

**Files:**

- Modify: `backend/src/repositories/affiliate-alliance.repository.ts`
- Create: `backend/src/services/affiliate-alliance-invitation-expiry.service.ts`
- Create: `backend/src/workers/affiliate-alliance-invitation-expiry.worker.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/tests/affiliate-alliance.repository.test.ts`
- Create: `backend/tests/affiliate-alliance-invitation-expiry.service.test.ts`
- Create: `backend/tests/affiliate-alliance-invitation-expiry.worker.test.ts`
- Create: `backend/tests/affiliate-alliance-invitation-expiry-config.test.ts`

- [ ] **Step 1: Write failing repository tests for candidate discovery and pagination**

  Prove the candidate query requires both contact rows to be active and unblocked:

  ```text
  inviter -> invitee: deletedAt IS NULL AND blockedAt IS NULL
  invitee -> inviter: deletedAt IS NULL AND blockedAt IS NULL
  ```

  Also require active `User`, active `scout` `UserIdentity`, active `AffiliateProfile`, no active alliance membership, and no same-alliance pending invitation. Verify search only matches `needoId` and display name, sorting is deterministic, and pagination returns `{list,total,page,page_size}`.

- [ ] **Step 2: Write failing transaction tests for send, accept, reject, and expiry**

  Use an injectable Prisma-compatible transaction client. Assert each successful transition writes its audit record in the same transaction:

  ```text
  affiliate_alliance.invitation_created
  affiliate_alliance.invitation_accepted
  affiliate_alliance.invitation_rejected
  affiliate_alliance.invitation_expired
  ```

  Cover rollback on invalid contacts/profile/parent, pending-key uniqueness, accepting with five false permissions, clearing `pendingKey`, incrementing `version`, idempotency conflicts, foreign-invitee 404 behavior, and mapping the member `activeKey` unique collision to `already_joined`.

- [ ] **Step 3: Write failing expiry-service, worker, and env tests**

  The service test must prove cursor-batched scanning, conditional pending-only updates, system audit with `actorId=null`, and no update after another request wins the race. The worker test must prove startup execution, no overlapping interval runs, error logging without process exit, and clean stop. The env test must cover:

  ```ts
  AFFILIATE_ALLIANCE_INVITATION_EXPIRY_INTERVAL_MS: z.coerce.number().int().min(60_000).default(300_000),
  AFFILIATE_ALLIANCE_INVITATION_EXPIRY_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(100),
  ```

- [ ] **Step 4: Run the focused tests and confirm red**

  ```bash
  cd backend
  npm test -- --runInBand tests/affiliate-alliance.repository.test.ts tests/affiliate-alliance-invitation-expiry.service.test.ts tests/affiliate-alliance-invitation-expiry.worker.test.ts tests/affiliate-alliance-invitation-expiry-config.test.ts
  ```

- [ ] **Step 5: Implement read queries using public projections**

  Add repository methods for paged members, paged eligible reciprocal contacts, sent invitations, and received invitations. Use Prisma `select` objects that omit internal identifiers except the invitation/member IDs required for subsequent domain actions. Filter `deletedAt: null` consistently and use a deterministic secondary `id` order.

- [ ] **Step 6: Implement the create-invitation transaction**

  Inside one `$transaction`, re-read the owner member, active alliance, reciprocal contacts, invitee account/identity/profile, active membership, pending invitation, and proposed parent. Create:

  ```ts
  pendingKey: `alliance:${allianceId}:invitee:${inviteeUserId}`,
  status: "PENDING",
  expiresAt,
  version: 1,
  ```

  Catch only known Prisma unique codes and distinguish the pending-invitation key from unrelated constraints before mapping to `invitation_duplicate`.

- [ ] **Step 7: Implement accept and reject transactions**

  Accept must re-read and scope the invitation to the caller, revalidate all send-time eligibility, create the member with `activeKey=user:<inviteeUserId>`, create the five-false permission row, conditionally update the versioned pending invitation, and audit. When `expiresAt <= now`, the repository transaction must commit the `EXPIRED` state and system audit, return an `expired` result union, and only then may the service throw the stable expiry error; throwing inside that transaction would incorrectly roll back expiration. Reject must conditionally end only the caller's unexpired pending invitation and audit. Both successful response paths return public DTO records freshly read from the database.

- [ ] **Step 8: Implement expiry service and no-overlap worker**

  Mirror the existing task-expiry worker lifecycle. The expiry repository method selects `PENDING`, `deletedAt:null`, `expiresAt <= now` by ascending ID, then each conditional transaction updates only the same `version` and pending status. Start the worker after the HTTP listener is ready and stop it in every server shutdown path.

- [ ] **Step 9: Make focused tests green and commit**

  ```bash
  cd backend
  npm test -- --runInBand tests/affiliate-alliance.repository.test.ts tests/affiliate-alliance-invitation-expiry.service.test.ts tests/affiliate-alliance-invitation-expiry.worker.test.ts tests/affiliate-alliance-invitation-expiry-config.test.ts
  cd ..
  git add backend/src/repositories/affiliate-alliance.repository.ts backend/src/services/affiliate-alliance-invitation-expiry.service.ts backend/src/workers/affiliate-alliance-invitation-expiry.worker.ts backend/src/config/env.ts backend/src/server.ts backend/tests/affiliate-alliance.repository.test.ts backend/tests/affiliate-alliance-invitation-expiry.service.test.ts backend/tests/affiliate-alliance-invitation-expiry.worker.test.ts backend/tests/affiliate-alliance-invitation-expiry-config.test.ts
  git commit -m "feat: persist alliance invitations"
  ```

---

### Task 4: Expose the seven formal HTTP endpoints with RBAC and OpenAPI

**Files:**

- Modify: `backend/src/routes/affiliate-alliance.routes.ts`
- Modify: `backend/src/controllers/affiliate-alliance.controller.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/affiliate-alliance-api.test.ts`
- Modify: `backend/tests/openapi.test.ts`

- [ ] **Step 1: Write failing API tests for all endpoints**

  Add Supertest cases for:

  ```text
  GET  /api/v1/affiliate/alliances/me/members
  GET  /api/v1/affiliate/alliances/me/eligible-contacts
  GET  /api/v1/affiliate/alliances/me/invitations
  POST /api/v1/affiliate/alliances/me/invitations
  GET  /api/v1/affiliate/alliance-invitations/mine
  POST /api/v1/affiliate/alliance-invitations/:id/accept
  POST /api/v1/affiliate/alliance-invitations/:id/reject
  ```

  Test missing JWT, each missing permission, wrong current identity, owner/invitee scope, strict queries/bodies, pagination response shape, 201 create, 200 respond, stable 403/404/409 errors, and absence of internal IDs/sensitive account fields.

- [ ] **Step 2: Write failing OpenAPI coverage tests**

  Assert every operation documents authentication, the exact permission, parameters/body schemas, paginated envelope, success status, and stable error envelopes. Add reusable schemas for public person, member, invitation, and page metadata.

- [ ] **Step 3: Run the focused tests and confirm red**

  ```bash
  cd backend
  npm test -- --runInBand tests/affiliate-alliance-api.test.ts tests/openapi.test.ts
  ```

- [ ] **Step 4: Implement thin controller actions**

  Controllers must parse only through the new schemas, retrieve authenticated context, call the service, and format the standard response envelope. No Prisma calls, parent validation, or membership logic belongs in controllers.

- [ ] **Step 5: Register routes with exact RBAC permissions**

  Apply list permissions to the four reads, invite permission to create, and response permission to accept/reject. Keep service-layer owner and invitee checks. Register static `/mine` before `/:id` paths if route ordering could make them ambiguous.

- [ ] **Step 6: Extend dependency injection and OpenAPI**

  Reuse the single alliance service instance in `app.ts` and retain test injection compatibility. Document API roles/statuses in lower case and ISO dates as strings.

- [ ] **Step 7: Make API tests green and commit**

  ```bash
  cd backend
  npm test -- --runInBand tests/affiliate-alliance-api.test.ts tests/openapi.test.ts
  cd ..
  git add backend/src/routes/affiliate-alliance.routes.ts backend/src/controllers/affiliate-alliance.controller.ts backend/src/app.ts backend/src/api/openapi.ts backend/tests/affiliate-alliance-api.test.ts backend/tests/openapi.test.ts
  git commit -m "feat: expose alliance invitation api"
  ```

---

### Task 5: Add the typed formal frontend API adapter

**Files:**

- Modify: `src/api/affiliateAlliance.ts`
- Modify: `src/api/affiliateAlliance.test.ts`

- [ ] **Step 1: Write failing adapter tests**

  Cover encoded search/status/page parameters, all seven endpoint paths, strict POST payloads, empty accept/reject bodies, standard envelope unwrapping, 201 handling, abort signals, and preservation of server error keys.

- [ ] **Step 2: Run the focused test and confirm red**

  ```bash
  npm test -- --run src/api/affiliateAlliance.test.ts
  ```

- [ ] **Step 3: Add public API types**

  Add explicit types without internal user IDs:

  ```ts
  export type AffiliateAllianceInvitationRole = "partner" | "subordinate";
  export type AffiliateAllianceInvitationStatus = "pending" | "accepted" | "rejected" | "expired";

  export interface AffiliateAlliancePublicPerson {
    needoId: string;
    displayName: string;
    avatarUrl: string | null;
  }
  ```

  Add member/invitation/page DTOs matching OpenAPI and keep snake-case page metadata exactly as the backend response defines it.

- [ ] **Step 4: Implement the seven adapter methods**

  Reuse the formal authenticated HTTP client. Construct query strings with `URLSearchParams`; do not persist results in `localStorage`, indexed DB, or module-level caches. Accept and reject must post `{}` only.

- [ ] **Step 5: Make the focused test green and commit**

  ```bash
  npm test -- --run src/api/affiliateAlliance.test.ts
  git add src/api/affiliateAlliance.ts src/api/affiliateAlliance.test.ts
  git commit -m "feat: add alliance invitation client"
  ```

---

### Task 6: Build the owner and invitee workflows in the existing alliance page

**Files:**

- Modify: `src/features/affiliate-alliance/AffiliateAlliancePage.tsx`
- Modify: `src/features/affiliate-alliance/AffiliateAlliancePage.test.tsx`
- Modify: `src/features/affiliate-alliance/i18n.ts`
- Modify: `src/features/affiliate-alliance/i18n.test.ts`

- [ ] **Step 1: Replace obsolete page assertions with failing behavior tests**

  Preserve foundation coverage, but replace the earlier “no invite UI” assertion. Add tests for:

  - owner loads paged members, candidates, and sent invitations from the API;
  - partner selection hides/clears parent, subordinate requires an owner/partner parent;
  - invite submit uses the candidate `needoId` and refreshes candidates plus sent invitations;
  - no-alliance Affiliate sees received invitations before the create form;
  - accept/reject refresh received invitations and `/alliances/me`;
  - joined non-owner sees own role and permissions but not owner management controls;
  - wallet balance is absent when `canViewAllianceWallet` is false;
  - loading, empty, paged, expired, conflict, permission-error, and retry states are accessible;
  - no business data is read from or written to browser storage.

  If the current create button contains duplicate rendering, first add a test that the label appears once, then remove only the duplicate while touching this component.

- [ ] **Step 2: Add failing scoped-i18n tests**

  Enumerate every new key and require non-empty Simplified Chinese, Traditional Chinese, Japanese, English, and Korean translations. Prove the page translator does not overwrite global generic words.

- [ ] **Step 3: Run focused frontend tests and confirm red**

  ```bash
  npm test -- --run src/features/affiliate-alliance/AffiliateAlliancePage.test.tsx src/features/affiliate-alliance/i18n.test.ts
  ```

- [ ] **Step 4: Refactor page state into server-backed view states**

  Keep a single page component and existing theme tokens. Use abortable effects keyed by alliance state and page filters. Derive three modes from `/alliances/me`: owner, joined non-owner, and not joined. Never optimistically invent member or invitation records; after each mutation, show progress, then refetch authoritative state.

- [ ] **Step 5: Implement owner management sections**

  Below the charter, render:

  - paged member list with public identity, role, and parent;
  - an accessible invite drawer/panel with candidate search and pagination;
  - role selection and conditional parent selection;
  - paged sent-invitation history with status and expiry time.

  Disable duplicate submissions, preserve search when pagination changes, and surface stable backend errors using scoped translations.

- [ ] **Step 6: Implement invitee and non-owner states**

  For not-joined Affiliates, render received invitations before alliance creation. Accept/reject controls must be disabled while submitting. On successful accept, refetch alliance state and transition to member view. For non-owner members, render only summary, owner, own role, own actual permissions, and conditionally the wallet.

- [ ] **Step 7: Add all five language dictionaries and make tests green**

  Use “联盟营销” in Simplified Chinese, “聯盟行銷” in Traditional Chinese, “アフィリエイト” in Japanese, and “Affiliate” in English; preserve the established Korean product wording. Do not globally translate the English product term.

  Run:

  ```bash
  npm test -- --run src/features/affiliate-alliance/AffiliateAlliancePage.test.tsx src/features/affiliate-alliance/i18n.test.ts src/api/affiliateAlliance.test.ts
  ```

- [ ] **Step 8: Commit the formal UI workflow**

  ```bash
  git add src/features/affiliate-alliance/AffiliateAlliancePage.tsx src/features/affiliate-alliance/AffiliateAlliancePage.test.tsx src/features/affiliate-alliance/i18n.ts src/features/affiliate-alliance/i18n.test.ts
  git commit -m "feat: add alliance invitation workflow"
  ```

---

### Task 7: Prove the complete flow against guarded real MySQL and document acceptance

**Files:**

- Create: `backend/scripts/check-affiliate-alliance-invitation-flow.ts`
- Create: `backend/scripts/support/affiliate-alliance-invitation-safety.ts`
- Create: `backend/tests/check-affiliate-alliance-invitation-flow-script.test.ts`
- Modify: `backend/package.json`
- Create: `docs/affiliate-alliance-invitations.md`
- Modify: `README.md`

- [ ] **Step 1: Write failing safety-helper tests**

  Prove the checker refuses missing `ENV_FILE`, production/staging environments, non-loopback MySQL hosts, production-style database names, and cleanup without captured IDs. Prove accepted local database inputs resolve to an explicit masked summary before mutation.

- [ ] **Step 2: Run the focused safety test and confirm red**

  ```bash
  cd backend
  npm test -- --runInBand tests/check-affiliate-alliance-invitation-flow-script.test.ts
  ```

- [ ] **Step 3: Implement the safety helper and checker**

  Add the script:

  ```json
  "check:affiliate-alliance-invitation-flow": "tsx scripts/check-affiliate-alliance-invitation-flow.ts"
  ```

  The checker must generate one unique marker, capture every created ID, use only the explicit local env file, and clean in foreign-key order inside `finally`. It must fail if post-cleanup counts for marker users, contacts, identities, profiles, alliances, members, permissions, invitations, wallets, ledgers, or audits are nonzero.

- [ ] **Step 4: Encode the nine real-database assertions**

  Against fresh repository/service instances, prove:

  1. one-way, blocked, non-Affiliate, and already-joined users are excluded;
  2. reciprocal eligible Affiliates receive partner and subordinate invitations;
  3. duplicate pending invitation is rejected;
  4. rejection creates no member;
  5. the 72-hour boundary cannot be accepted and becomes expired;
  6. acceptance creates one member, one five-false permission row, and one accepted audit;
  7. concurrent accepts from two alliances yield exactly one membership;
  8. a fresh process-equivalent repository/service rereads durable state;
  9. exact cleanup leaves zero marker residue.

- [ ] **Step 5: Document configuration, operation, and acceptance evidence**

  In `docs/affiliate-alliance-invitations.md`, document the seven endpoints, five RBAC permissions, 72-hour rule, worker env values, error keys, checker command, rollback boundary, and explicit exclusions for later microsteps. Link the accepted design and this implementation plan. Add a concise README entry pointing to the formal alliance foundation and invitation documents without presenting this slice as the completed Affiliate platform.

- [ ] **Step 6: Run schema, focused, and full automated verification**

  Run from the repository root:

  ```bash
  cd backend
  npm run prisma:generate
  npx prisma validate
  npm test -- --runInBand tests/affiliate-alliance-schema.test.ts tests/affiliate-alliance-migrations.test.ts tests/affiliate-alliance-validator.test.ts tests/affiliate-alliance.service.test.ts tests/affiliate-alliance.repository.test.ts tests/affiliate-alliance-invitation-expiry.service.test.ts tests/affiliate-alliance-invitation-expiry.worker.test.ts tests/affiliate-alliance-invitation-expiry-config.test.ts tests/affiliate-alliance-api.test.ts tests/check-affiliate-alliance-invitation-flow-script.test.ts
  npm test -- --runInBand
  npm run lint
  npm run build
  cd ..
  npm test -- --run src/api/affiliateAlliance.test.ts src/features/affiliate-alliance/AffiliateAlliancePage.test.tsx src/features/affiliate-alliance/i18n.test.ts
  npm test -- --run
  npm run verify:production-build
  ```

- [ ] **Step 7: Scan changed production files for forbidden placeholders and unsafe persistence**

  Run targeted scans without counting the scan expression itself:

  ```bash
  rg -n 'TO[D]O|FIX[M]E|not implement[e]d|mock|placeholder|localStorage|sessionStorage' backend/src src/features/affiliate-alliance src/api/affiliateAlliance.ts
  rg -n 'passwordHash|accessToken|refreshToken|bankAccount|ekyc' src/features/affiliate-alliance backend/src/controllers/affiliate-alliance.controller.ts
  ```

  Review every hit. Existing shared infrastructure references may remain only when unrelated; no new alliance implementation may depend on them.

- [ ] **Step 8: Apply the migration and run the guarded real MySQL checker**

  With the explicit approved local env file:

  ```bash
  cd backend
  ENV_FILE=.env npm run prisma:migrate:deploy
  ENV_FILE=.env npm run check:affiliate-alliance-invitation-flow
  ```

  Record the database target summary, assertion count, cleanup result, and command exit status in the implementation notes. Never run this checker against remote, staging, or production databases.

- [ ] **Step 9: Perform two-account browser acceptance**

  Start the formal backend and frontend, verify health/readiness, then use two real local Affiliate sessions with a reciprocal contact relationship:

  1. Owner opens `/afirieito/organization`, searches the candidate, and sends an invitation.
  2. Invitee signs in through a separate real session, sees the invitation before the create form, and rejects one invitation.
  3. Owner sends a fresh invitation; invitee accepts it.
  4. Owner refreshes and sees the durable member; invitee refreshes and remains in the joined view.
  5. Verify no-wallet-permission hiding, 390×844 layout, full scrolling, Simplified Chinese/Japanese/English text, and zero console errors.

  Do not substitute component tests or HTTP checks for this visual and interactive acceptance.

- [ ] **Step 10: Commit verification assets**

  ```bash
  git add backend/scripts/check-affiliate-alliance-invitation-flow.ts backend/scripts/support/affiliate-alliance-invitation-safety.ts backend/tests/check-affiliate-alliance-invitation-flow-script.test.ts backend/package.json docs/affiliate-alliance-invitations.md README.md
  git commit -m "test: verify alliance invitation flow"
  ```

---

### Task 8: Review the complete branch and integrate only after all gates pass

**Files:**

- Review: all files changed from the implementation branch base

- [ ] **Step 1: Inspect the complete diff and commit history**

  ```bash
  git status --short
  git log --oneline --decorate --max-count=12
  git diff --check main...HEAD
  git diff --stat main...HEAD
  git diff main...HEAD -- backend/prisma backend/src backend/tests src/api src/features/affiliate-alliance docs
  ```

  Confirm there are no unrelated user changes, generated secrets, environment files, test artifacts, or edits to already-applied migrations.

- [ ] **Step 2: Review against every accepted design section**

  Create a reviewer checklist that maps design sections 4–10 to code and test evidence. Explicitly verify endpoint scope, public-data projections, both contact directions, request-time expiry, worker expiry, transaction audits, active-member concurrency, five-false permissions, wallet hiding, all five languages, and exact cleanup.

- [ ] **Step 3: Re-run the final verification commands after review fixes**

  Re-run every command from Task 7 steps 6–9 that a review change could affect. Fresh output is required; earlier green output is not sufficient after edits.

- [ ] **Step 4: Use the branch-finishing workflow**

  Invoke `superpowers:finishing-a-development-branch`, present the verified integration options, and perform only the option authorized by the user. A local merge does not imply push, deployment, or live-environment acceptance.
