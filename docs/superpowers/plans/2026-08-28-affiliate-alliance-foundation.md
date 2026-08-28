# Affiliate Alliance Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first formal alliance vertical slice: an activated affiliate can create exactly one long-lived alliance, become its owner with full permissions, receive a separate zero-balance alliance NDP wallet, and reload the same state through a real API and `/afirieito/organization`.

**Architecture:** Add a small alliance aggregate beside the current Affiliate models. `AffiliateAllianceService` owns identity and creation rules, `AffiliateAllianceRepository` performs one Prisma transaction for alliance/member/permission/wallet/audit persistence, and a typed React page replaces only the legacy-local organization route. The approved 2026-08-28 design is authoritative: platform fees are paid by merchants outside affiliate/alliance commission and are not calculated in this slice.

**Tech Stack:** React 19, TypeScript, Vite, Express, Zod, Prisma 7, MySQL 8, JWT/RBAC, Jest/Supertest, Vitest.

## Global Constraints

- Scope is create/read only. Invitations, partner bindings, member mutation, owner transfer, wallet transfers, task audience, fee rules, reward allocation, rankings, and merchant/admin pages stay out of scope.
- Reuse the active Affiliate account and immutable `needoId`; never create a second User or public ID.
- Alliance creation does not require eKYC or a bank account. Those remain withdrawal-only gates.
- One user can have only one active alliance membership globally, including an owner membership.
- Owner is a level-one member and always has all five alliance permissions.
- The alliance wallet uses `WalletOwnerType.ALLIANCE`, owner ID `AffiliateAlliance.id`, currency NDP, and starts at exact balances 0/0.
- Never expose `userId`, `identityId`, or the internal name `scout` in API/frontend payloads.
- Use `/api/v1/`, strict Zod, JWT, RBAC, Prisma transaction, AuditLog, unified errors, and the standard response envelope.
- Do not use browser mock data, localStorage alliance state, placeholder actions, raw Prisma errors, or direct balance mutation.
- Terminology: Chinese `联盟营销`/`联盟`, English `Affiliate`/`Alliance`, Japanese `アフィリエイト`/`アライアンス`.

---

### Task 1: Alliance schema, wallet owner type, and migrations

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260828203000_affiliate_alliance_foundation/migration.sql`
- Create: `backend/prisma/migrations/20260828204500_affiliate_alliance_permissions/migration.sql`
- Create: `backend/tests/affiliate-alliance-schema.test.ts`
- Create: `backend/tests/affiliate-alliance-migrations.test.ts`
- Modify: `backend/src/services/ledger.service.ts`
- Modify: `backend/src/repositories/ledger.repository.ts`
- Modify: `backend/tests/ledger-service.test.ts`

**Interfaces:** Produces `AffiliateAlliance`, `AffiliateAllianceMember`, `AffiliateAlliancePermission`, and wallet owner value `alliance`/`ALLIANCE`.

- [ ] **Step 1: Write failing schema/migration tests**

Assert additive enums/models, every `id/createdAt/updatedAt/deletedAt`, relation indexes, nullable unique member `activeKey`, ratio checks 0–10000, two new permissions, and activated-affiliate role assignments. Assert no migration deletes or rewrites existing Affiliate data.

- [ ] **Step 2: Verify RED**

Run `npm --prefix backend test -- --runInBand tests/affiliate-alliance-schema.test.ts tests/affiliate-alliance-migrations.test.ts`.
Expected: FAIL because the schema and migrations are absent.

- [ ] **Step 3: Add exact model contract**

Add enums `AffiliateAllianceStatus = ACTIVE|SUSPENDED|CLOSED` and `AffiliateAllianceMemberRole = OWNER|PARTNER|SUBORDINATE`. Add:

```prisma
model AffiliateAlliance {
  id                      Int                     @id @default(autoincrement())
  ownerUserId             Int                     @map("owner_user_id")
  name                    String                  @db.VarChar(120)
  description             String?                 @db.VarChar(500)
  status                  AffiliateAllianceStatus @default(ACTIVE)
  defaultPromoterShareBps Int                     @map("default_promoter_share_bps")
  version                 Int                     @default(1)
  createdAt               DateTime                @default(now()) @map("created_at")
  updatedAt               DateTime                @updatedAt @map("updated_at")
  deletedAt               DateTime?               @map("deleted_at")
}

model AffiliateAllianceMember {
  id                       Int                         @id @default(autoincrement())
  allianceId               Int                         @map("alliance_id")
  userId                   Int                         @map("user_id")
  role                     AffiliateAllianceMemberRole
  parentMemberId           Int?                        @map("parent_member_id")
  promoterShareBpsOverride Int?                        @map("promoter_share_bps_override")
  activeKey                String?                     @unique @map("active_key") @db.VarChar(191)
  version                  Int                         @default(1)
  joinedAt                 DateTime                    @default(now()) @map("joined_at")
  leftAt                   DateTime?                   @map("left_at")
  leftReason               String?                     @map("left_reason") @db.VarChar(500)
  createdAt                DateTime                    @default(now()) @map("created_at")
  updatedAt                DateTime                    @updatedAt @map("updated_at")
  deletedAt                DateTime?                   @map("deleted_at")
}

model AffiliateAlliancePermission {
  id                       Int       @id @default(autoincrement())
  memberId                 Int       @unique @map("member_id")
  canClaimTasks            Boolean   @default(false) @map("can_claim_tasks")
  canViewAllianceOverview  Boolean   @default(false) @map("can_view_alliance_overview")
  canViewMemberDetails     Boolean   @default(false) @map("can_view_member_details")
  canManageOwnSubordinates Boolean   @default(false) @map("can_manage_own_subordinates")
  canViewAllianceWallet    Boolean   @default(false) @map("can_view_alliance_wallet")
  createdAt                DateTime  @default(now()) @map("created_at")
  updatedAt                DateTime  @updatedAt @map("updated_at")
  deletedAt                DateTime? @map("deleted_at")
}
```

Complete all User/alliance/member/self relations and indexes in the actual schema. Add `ALLIANCE @map("alliance")` to `WalletOwnerType` and SQL check constraints for both BPS fields.

- [ ] **Step 4: Extend ledger mapping safely**

Change `WalletOwnerType` to include `"alliance"`, map `alliance` ↔ `ALLIANCE` in both repository converters, and test `getOrCreateWallet({ ownerType: "alliance", ownerId: 42, currency: "NDP" })`. Keep `walletAdjustmentListQuerySchema.ownerType` unchanged so generic adjustment endpoints do not gain alliance mutation access.

- [ ] **Step 5: Verify GREEN and commit**

Run `npm --prefix backend run prisma:generate`, Prisma validate, the two new tests, and `tests/ledger-service.test.ts`. Commit as `feat: add affiliate alliance foundation`.

### Task 2: Strict validation and service rules

**Files:**
- Create: `backend/src/validators/affiliate-alliance.validator.ts`
- Create: `backend/src/services/affiliate-alliance.service.ts`
- Create: `backend/tests/affiliate-alliance-validator.test.ts`
- Create: `backend/tests/affiliate-alliance.service.test.ts`

**Interfaces:** Produces strict create input and `AffiliateAllianceService.getMine/createMine`.

- [ ] **Step 1: Write validator RED tests**

Accept only `{ name: string(2..120), description?: string(1..500)|null, defaultPromoterShareBps: integer(0..10000) }`. Reject unknown keys, blank/overlong strings, decimals, and out-of-range BPS.

- [ ] **Step 2: Write service RED tests**

Cover active affiliate creation, non-affiliate 403, inactive profile 403, existing membership 409, null read before creation, input normalization, audit action `affiliate_alliance.created`, and payload redaction.

- [ ] **Step 3: Verify RED**

Run `npm --prefix backend test -- --runInBand tests/affiliate-alliance-validator.test.ts tests/affiliate-alliance.service.test.ts`.

- [ ] **Step 4: Implement exact public payload**

```ts
export interface AffiliateAlliancePayload {
  allianceId: number;
  name: string;
  description: string | null;
  status: "active" | "suspended" | "closed";
  version: number;
  defaultPromoterShareBps: number;
  owner: { needoId: string; displayName: string; avatarUrl: string | null };
  membership: {
    memberId: number;
    role: "owner" | "partner" | "subordinate";
    managerNeedoId: string | null;
    promoterShareBpsOverride: number | null;
    permissions: {
      canClaimTasks: boolean;
      canViewAllianceOverview: boolean;
      canViewMemberDetails: boolean;
      canManageOwnSubordinates: boolean;
      canViewAllianceWallet: boolean;
    };
  };
  wallet: { currency: "NDP"; availableBalance: number; frozenBalance: number };
  createdAt: string;
  updatedAt: string;
}
```

Methods return `{ alliance: AffiliateAlliancePayload | null }` for GET and `{ alliance: AffiliateAlliancePayload }` for create. Require current identity `scout`, but never return that name. Do not read eKYC/bank data.

- [ ] **Step 5: Verify GREEN and commit**

Run both focused suites and commit as `feat: define affiliate alliance creation rules`.

### Task 3: Transactional repository

**Files:**
- Create: `backend/src/repositories/affiliate-alliance.repository.ts`
- Create: `backend/tests/affiliate-alliance.repository.test.ts`

**Interfaces:** Produces `findMine`, `findCreationEligibility`, and transactional `createOwned` for Task 2.

- [ ] **Step 1: Write repository RED tests**

Assert reads filter all soft-deleted records, locate the user's current active membership, select only `needoId/username/avatarUrl` from User, and select the `ALLIANCE`/`NDP` wallet. Assert one transaction rechecks active profile/membership, creates alliance, owner member `activeKey=user:<userId>`, all-true permission row, zero alliance wallet, AuditLog, and returns a refreshed aggregate.

Assert Prisma `P2002` on the membership active key maps to 409 `error.affiliate_alliance.already_joined`; other errors pass through.

- [ ] **Step 2: Verify RED**

Run `npm --prefix backend test -- --runInBand tests/affiliate-alliance.repository.test.ts`.

- [ ] **Step 3: Implement minimal Prisma transaction**

Use Prisma operations only, ISO-map dates at the repository boundary, and explicitly lower-case enum values. Never touch the owner's personal wallet.

- [ ] **Step 4: Verify GREEN and commit**

Run service + repository suites and commit as `feat: persist affiliate alliance owners`.

### Task 4: API, RBAC, errors, and OpenAPI

**Files:**
- Create: `backend/src/controllers/affiliate-alliance.controller.ts`
- Create: `backend/src/routes/affiliate-alliance.routes.ts`
- Create: `backend/tests/affiliate-alliance-api.test.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/tests/affiliate-permissions.test.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/openapi.test.ts`

**Interfaces:** Adds `GET /api/v1/affiliate/alliances/me`, `POST /api/v1/affiliate/alliances`, `page:affiliate-alliance`, and `button:affiliate-alliance-create`.

- [ ] **Step 1: Write API RED tests**

Cover auth, separate read/create permission, current identity, strict body, 200 null/read, 201 create, repeated/concurrent conflict, inactive profile, standard envelopes, exact zero wallet, original `needoId`, and internal-field redaction.

- [ ] **Step 2: Verify RED**

Run the alliance API, affiliate permission, and OpenAPI suites.

- [ ] **Step 3: Implement routes/controller/dependencies**

```ts
export const AFFILIATE_ALLIANCE_ROUTE_PERMISSIONS = {
  read: "page:affiliate-alliance",
  create: "button:affiliate-alliance-create"
} as const;
```

Mount authenticated GET `/affiliate/alliances/me` with read permission and POST `/affiliate/alliances` with create permission plus strict body validation. Return 200 and 201 respectively. Register optional repository/service dependencies and mount after profile routes, before marketplace routes.

- [ ] **Step 4: Add stable errors and permissions**

Allocate the next unused error codes after profile codes for `profile_inactive` and `already_joined`. Add both permissions to system permissions, the migration, and activated Affiliate role only; admin inherits all. Assert customer/technician/merchant do not gain create before activation.

- [ ] **Step 5: Add exact OpenAPI**

Document strict create, permissions, alliance, and mine response schemas; bearer auth; 400/401/403/409; `needoId`; and omission of internal identity fields.

- [ ] **Step 6: Verify GREEN and commit**

Run alliance API + permissions + OpenAPI tests and backend build. Commit as `feat: expose affiliate alliance foundation API`.

### Task 5: Typed client and formal alliance page

**Files:**
- Create: `src/api/affiliateAlliance.ts`
- Create: `src/api/affiliateAlliance.test.ts`
- Create: `src/features/affiliate-alliance/AffiliateAlliancePage.tsx`
- Create: `src/features/affiliate-alliance/AffiliateAlliancePage.test.tsx`
- Create: `src/features/affiliate-alliance/i18n.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/mobile/businessNavItems.ts`
- Modify: `src/i18n/translations.test.ts`

**Interfaces:** Replaces only `/afirieito/organization` with the formal page and changes visible nav label `组织` to `联盟`.

- [ ] **Step 1: Write client/page RED tests**

Assert exact GET/POST paths and bodies. Page tests cover loading, empty create form, percent-to-BPS conversion, server-only save, 409 reload, permission error, owner `needoId`, five permissions, separate 0/0 wallet, reload, no localStorage write, and absence of invitation/transfer controls.

- [ ] **Step 2: Verify RED**

Run `npm test -- --run src/api/affiliateAlliance.test.ts src/features/affiliate-alliance/AffiliateAlliancePage.test.tsx`.

- [ ] **Step 3: Implement typed client**

```ts
export const affiliateAllianceApi = {
  getMine: () => httpClient.request<AffiliateAllianceMineResponse>("/affiliate/alliances/me"),
  create: (body: AffiliateAllianceCreateInput) =>
    httpClient.request<AffiliateAllianceMineResponse>("/affiliate/alliances", {
      method: "POST",
      body
    })
};
```

- [ ] **Step 4: Implement the responsive page**

Use `MobileShell`, `MobileFullscreenHeader`, `businessNavItems`, client theme tokens, and feature i18n. Empty state asks only for name, optional description, and actual-promoter percentage. Show `allianceShareBps = 10000 - defaultPromoterShareBps` before submit. Created state shows alliance, owner, `needoId`, owner role/permissions, ratio summary, server timestamp, and exact wallet balances. Do not show fabricated members, GMV, invitations, transfers, or metrics.

- [ ] **Step 5: Wire route and i18n**

Route `/afirieito/organization` to `AffiliateAlliancePage` under `protect("business", ...)`. Add complete Chinese/English/Japanese loading, empty, create, owner, permission, wallet, ratio, error, and success strings through the feature i18n registration pattern.

- [ ] **Step 6: Verify GREEN and commit**

Run the two focused tests, translation test, App test, and `npm run verify:production-build`. Commit as `feat: add formal affiliate alliance page`.

### Task 6: Guarded MySQL and browser acceptance

**Files:**
- Create: `backend/scripts/check-affiliate-alliance-foundation-flow.ts`
- Modify: `backend/package.json`
- Create: `backend/tests/check-affiliate-alliance-foundation-script.test.ts`
- Create: `docs/affiliate-alliance-foundation.md`
- Modify only for verified defects: Task 1–5 files

**Interfaces:** Adds `ENV_FILE=.env.dev npm --prefix backend run check:affiliate-alliance-foundation-flow` and acceptance evidence.

- [ ] **Step 1: Write checker guard RED test**

Require explicit env file; reject production/staging flags, remote MySQL, and production-looking database names; verify cleanup is limited to captured marker IDs.

- [ ] **Step 2: Implement checker**

Create one marker user with active Affiliate identity/profile and no eKYC/bank. Race two create calls; assert one success, one stable conflict, one alliance, one owner active key, one all-true permission row, one separate `ALLIANCE` wallet at 0/0, one audit, and no eKYC/bank rows. Reload through a fresh repository/service. Delete only captured marker records in dependency order and assert zero residue.

- [ ] **Step 3: Run backend gates**

Run Prisma generate/validate; all new schema/migration/validator/service/repository/API/permission/OpenAPI/checker tests; backend build/lint; then the real MySQL checker.

- [ ] **Step 4: Run frontend gates**

Run client/page/i18n/App tests and `npm run verify:production-build`.

- [ ] **Step 5: Browser acceptance**

Start `npm run dev:formal`; prove MySQL 3307, Redis 6379, backend 3000 health/ready, frontend 5180, and proxy health. With a real activated Affiliate account without eKYC/bank: create on `/afirieito/organization`, verify same `needoId`, owner permissions and separate 0/0 wallet, refresh/relogin/backend restart persistence, zh/en/ja, desktop/mobile, non-activated 403, zero application console errors, and no alliance localStorage mutation.

- [ ] **Step 6: Record evidence and commit**

Document migration state, API/permission matrix, concurrency, no-eKYC/no-bank proof, wallet separation, exact commands/results, screenshots, and the next slice: bidirectional-friend candidates plus invitation accept/reject. Commit as `docs: record affiliate alliance foundation acceptance`.

## Plan Self-Review Result

- Covers only the approved alliance foundation create/read boundary.
- Does not implement invitation, hierarchy mutation, transfer, fee, settlement, merchant/admin, or ranking behavior early.
- Uses consistent payload fields across repository, service, API, client, and page.
- Includes TDD RED/GREEN gates, concurrency, real MySQL, restart persistence, and browser acceptance.
- Contains no placeholders or fake-data substitution.
