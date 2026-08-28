# Affiliate Profile, NeeDo ID, and External Channels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first formal affiliate-marketing vertical slice: a real NeeDo user activates the existing affiliate identity, receives no second public ID, and can persistently read and edit an affiliate profile plus safe external social homepage links.

**Architecture:** Extend the existing atomic affiliate-contract activation so it creates one `AffiliateProfile` for the same `User.id` and returns `User.needoId`. Add a focused Route → Controller → Service → Repository profile module with optimistic locking, audited channel CRUD, and a real `/afirieito/me` React page; keep the internal legacy `scout` identity name behind the API boundary.

**Tech Stack:** React 19, TypeScript strict, Vite 7, Express 4, Prisma 7/MySQL 8, Zod 3, JWT/RBAC, Jest/Supertest, Vitest, OpenAPI 3.1.

## Global Constraints

- Execute only this vertical slice; do not begin alliance, merchant marketplace, fee, ranking, or operations-monitoring work in the same change.
- Do not add mock data, demo persistence, local-storage business state, fake APIs, hard-coded secrets, or client-only authorization.
- Use the existing `/api/v1` envelope, JWT, RBAC, Zod, OpenAPI, Prisma migration, AuditLog, UTC timestamps, and three-language i18n conventions.
- The public affiliate identifier is always the existing `User.needoId`; never create or expose a second affiliate public ID.
- Affiliate activation does not require eKYC. Existing eKYC and same-name bank requirements continue to apply only to withdrawal.
- External channels store HTTPS homepage links only. Do not fetch external pages or use external metrics.
- Preserve the existing React/TSX/Vite portals and the internal `scout` compatibility marker.
- Do not modify an applied migration. Generate and commit a new migration.
- Preserve unrelated worktree changes and stage only files belonging to the current task.

## Deliverable Boundary

After this plan passes acceptance:

- A formal user can accept the affiliate contract and receives `{ affiliateStatus: "active", needoId, profileId }`.
- The activation transaction is retry-safe and creates at most one active profile for the user.
- `/api/v1/affiliate/profile` supports authenticated read and optimistic profile update.
- `/api/v1/affiliate/profile/channels` supports authenticated create, update, and soft delete with a maximum of ten active links.
- `/afirieito/me` reads and writes only the formal API and survives reload, relogin, and backend restart.
- Existing task claiming remains functional, but only an activated affiliate role retains claim permission.

## File Responsibility Map

### Backend domain and persistence

- `backend/prisma/schema.prisma`: Affiliate profile/channel enums, models, User relation, indexes, versioning, and soft-delete fields.
- `backend/prisma/migrations/20260828110000_affiliate_profile_channels/migration.sql`: additive MySQL migration.
- `backend/src/validators/affiliate-profile.validator.ts`: strict profile/channel request contracts and HTTPS URL validation.
- `backend/src/services/affiliate-channel-url.service.ts`: deterministic URL normalization and platform-domain validation.
- `backend/src/services/affiliate-profile.service.ts`: ownership, active-identity, optimistic-version, audit, and channel-count rules.
- `backend/src/repositories/affiliate-profile.repository.ts`: Prisma reads and atomic audited writes.
- `backend/src/controllers/affiliate-profile.controller.ts`: request/response adaptation only.
- `backend/src/routes/affiliate-profile.routes.ts`: authentication, permissions, validation, and endpoint wiring.
- `backend/src/repositories/affiliate-identity-activation.repository.ts`: profile creation and `needoId` projection in the existing activation transaction.
- `backend/src/services/affiliate-identity-activation.service.ts`: public activation result contract.
- `backend/src/constants/permissions.constants.ts`: profile read/edit permissions and claim-permission correction.
- `backend/src/app.ts`: dependency port and route registration.
- `backend/src/api/openapi.ts`: complete profile/channel and activation response schemas.

### Frontend

- `src/api/affiliateProfile.ts`: typed formal API client.
- `src/features/affiliate-profile/AffiliateProfilePage.tsx`: real profile editor and external homepage list.
- `src/features/identity-applications/AffiliateActivationPage.tsx`: redirect to the formal profile after activation.
- `src/App.tsx`: route `/afirieito/me` to the formal profile page.
- `src/i18n/translations.ts`: Simplified Chinese source copy with English and Japanese translations.

### Tests and docs

- `backend/tests/affiliate-profile-schema.test.ts`: schema/migration contract.
- `backend/tests/affiliate-channel-url.service.test.ts`: URL policy.
- `backend/tests/affiliate-profile.service.test.ts`: domain rules.
- `backend/tests/affiliate-profile.repository.test.ts`: Prisma query and transaction contract.
- `backend/tests/affiliate-profile-api.test.ts`: HTTP, RBAC, Zod, ownership, and response redaction.
- Existing activation and affiliate-permission tests: retry-safe activation and role assignment regression.
- `src/api/affiliateProfile.test.ts`: frontend request contract.
- `src/features/affiliate-profile/AffiliateProfilePage.test.tsx`: load, save, add, delete, and error behavior.
- Existing activation and i18n tests: redirect and language regression.
- `docs/affiliate-profile.md`: API, persistence, security, and browser-acceptance notes.

---

### Task 1: Affiliate profile schema and additive migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260828110000_affiliate_profile_channels/migration.sql`
- Create: `backend/tests/affiliate-profile-schema.test.ts`

**Interfaces:**
- Produces Prisma enums `AffiliateProfileStatus`, `AffiliateCooperationStatus`, and `AffiliateChannelPlatform`.
- Produces models `AffiliateProfile` and `AffiliateProfileChannel` consumed by Tasks 3-7.
- Guarantees one profile per User and one active normalized URL per profile through unique keys.

- [ ] **Step 1: Write the failing schema contract test**

Create a test that reads the schema and migration from disk and requires exact fields, relations, uniqueness, indexes, and soft-delete columns:

```ts
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const migration = fs.readFileSync(
  path.join(root, "prisma/migrations/20260828110000_affiliate_profile_channels/migration.sql"),
  "utf8"
);

describe("affiliate profile schema", () => {
  it("keeps one versioned profile on the canonical user", () => {
    expect(schema).toMatch(/model AffiliateProfile[\s\S]*userId\s+Int[\s\S]*@unique/);
    expect(schema).toMatch(/model AffiliateProfile[\s\S]*version\s+Int[\s\S]*deletedAt/);
    expect(schema).toContain("affiliateProfile AffiliateProfile?");
  });

  it("stores soft-deletable external homepage channels", () => {
    expect(schema).toMatch(/model AffiliateProfileChannel[\s\S]*homepageUrl[\s\S]*activeKey/);
    expect(schema).toMatch(/model AffiliateProfileChannel[\s\S]*@@index\(\[profileId, sortOrder\]\)/);
    expect(migration).toContain("CREATE TABLE `affiliate_profiles`");
    expect(migration).toContain("CREATE TABLE `affiliate_profile_channels`");
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-profile-schema.test.ts`
Expected: FAIL because the schema and migration do not exist.

- [ ] **Step 3: Add the minimal Prisma enums and models**

Add the following contract, using the repository's existing enum mapping style:

```prisma
enum AffiliateProfileStatus {
  ACTIVE    @map("active")
  SUSPENDED @map("suspended")
  CLOSED    @map("closed")

  @@map("affiliate_profile_status")
}

enum AffiliateCooperationStatus {
  AVAILABLE   @map("available")
  SELECTIVE   @map("selective")
  UNAVAILABLE @map("unavailable")

  @@map("affiliate_cooperation_status")
}

enum AffiliateChannelPlatform {
  X         @map("x")
  INSTAGRAM @map("instagram")
  YOUTUBE   @map("youtube")
  TIKTOK    @map("tiktok")
  CUSTOM    @map("custom")

  @@map("affiliate_channel_platform")
}

model AffiliateProfile {
  id                Int                        @id @default(autoincrement())
  userId            Int                        @unique @map("user_id")
  version           Int                        @default(1)
  status            AffiliateProfileStatus     @default(ACTIVE)
  cooperationStatus AffiliateCooperationStatus @default(AVAILABLE) @map("cooperation_status")
  bio               String?                    @db.VarChar(1000)
  strengths         Json?
  serviceAreas      Json?                       @map("service_areas")
  suspendedReason   String?                     @map("suspended_reason") @db.VarChar(500)
  createdAt         DateTime                    @default(now()) @map("created_at")
  updatedAt         DateTime                    @updatedAt @map("updated_at")
  deletedAt         DateTime?                   @map("deleted_at")

  user     User                      @relation(fields: [userId], references: [id], onDelete: Restrict)
  channels AffiliateProfileChannel[]

  @@index([status, cooperationStatus])
  @@index([updatedAt])
  @@index([deletedAt])
  @@map("affiliate_profiles")
}

model AffiliateProfileChannel {
  id          Int                      @id @default(autoincrement())
  profileId   Int                      @map("profile_id")
  platform    AffiliateChannelPlatform
  customLabel String?                  @map("custom_label") @db.VarChar(60)
  homepageUrl String                   @map("homepage_url") @db.VarChar(500)
  activeKey   String?                  @unique @map("active_key") @db.VarChar(191)
  sortOrder   Int                      @default(0) @map("sort_order")
  createdAt   DateTime                 @default(now()) @map("created_at")
  updatedAt   DateTime                 @updatedAt @map("updated_at")
  deletedAt   DateTime?                @map("deleted_at")

  profile AffiliateProfile @relation(fields: [profileId], references: [id], onDelete: Restrict)

  @@index([profileId, sortOrder])
  @@index([platform])
  @@index([deletedAt])
  @@map("affiliate_profile_channels")
}
```

Add `affiliateProfile AffiliateProfile?` to `User`.

- [ ] **Step 4: Generate and inspect the migration**

Run: `npm --prefix backend exec prisma migrate dev -- --create-only --name affiliate_profile_channels`
Expected: Prisma creates a new unapplied migration. Normalize its directory name to `20260828110000_affiliate_profile_channels`, confirm it only creates the two tables, enums, indexes, and foreign keys, then apply with `npm --prefix backend run prisma:migrate:dev`.

- [ ] **Step 5: Validate and verify GREEN**

Run: `npm --prefix backend exec prisma validate`
Run: `npm --prefix backend test -- --runInBand tests/affiliate-profile-schema.test.ts`
Expected: both commands exit 0.

- [ ] **Step 6: Commit only Task 1 files**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260828110000_affiliate_profile_channels/migration.sql backend/tests/affiliate-profile-schema.test.ts
git commit -m "feat: add affiliate profile data model"
```

### Task 2: Profile request contracts and safe external URLs

**Files:**
- Create: `backend/src/validators/affiliate-profile.validator.ts`
- Create: `backend/src/services/affiliate-channel-url.service.ts`
- Create: `backend/tests/affiliate-channel-url.service.test.ts`

**Interfaces:**
- Produces `AffiliateProfileUpdateBody`, `AffiliateChannelCreateBody`, and `AffiliateChannelUpdateBody`.
- Produces `AffiliateChannelUrlService.normalize(platform, homepageUrl): string`.
- Enforces no credentials, HTTPS only, public hostnames, platform-domain matching, and custom-label rules.

- [ ] **Step 1: Write failing URL-policy tests**

Cover valid X, Instagram, YouTube, TikTok, and custom URLs; lowercase host normalization; hash removal; HTTPS requirement; username/password rejection; localhost/private-IP rejection; platform-domain mismatch; and custom-label requirements.

```ts
const service = new AffiliateChannelUrlService();

expect(service.normalize("instagram", "https://Instagram.com/needo/#bio")).toBe(
  "https://instagram.com/needo/"
);
expect(() => service.normalize("instagram", "https://example.com/needo")).toThrow(
  "error.affiliate_profile.channel_domain_invalid"
);
expect(() => service.normalize("custom", "http://127.0.0.1/profile")).toThrow(
  "error.affiliate_profile.channel_url_invalid"
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-channel-url.service.test.ts`
Expected: FAIL because the URL service is absent.

- [ ] **Step 3: Implement normalization and strict Zod schemas**

Use this public interface:

```ts
export type AffiliateChannelPlatform = "x" | "instagram" | "youtube" | "tiktok" | "custom";

export class AffiliateChannelUrlService {
  public normalize(platform: AffiliateChannelPlatform, homepageUrl: string): string {
    const url = new URL(homepageUrl.trim());
    if (url.protocol !== "https:" || url.username || url.password || this.isPrivateHost(url.hostname)) {
      throw this.invalid("error.affiliate_profile.channel_url_invalid");
    }
    this.assertPlatformHost(platform, url.hostname.toLowerCase());
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    return url.toString();
  }
}
```

Define strict Zod bodies:

```ts
export const affiliateProfileUpdateBodySchema = z.object({
  expectedVersion: z.number().int().positive(),
  bio: z.string().trim().max(1000).nullable().optional(),
  strengths: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  serviceAreas: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
  cooperationStatus: z.enum(["available", "selective", "unavailable"]).optional()
}).strict().refine((value) => Object.keys(value).some((key) => key !== "expectedVersion"), {
  message: "At least one mutable profile field is required"
});

export const affiliateChannelCreateBodySchema = z.object({
  expectedProfileVersion: z.number().int().positive(),
  platform: z.enum(["x", "instagram", "youtube", "tiktok", "custom"]),
  customLabel: z.string().trim().min(1).max(60).nullable().optional(),
  homepageUrl: z.string().trim().min(1).max(500),
  sortOrder: z.number().int().min(0).max(1000).default(0)
}).strict();

export const affiliateChannelUpdateBodySchema = z.object({
  expectedProfileVersion: z.number().int().positive(),
  platform: z.enum(["x", "instagram", "youtube", "tiktok", "custom"]).optional(),
  customLabel: z.string().trim().min(1).max(60).nullable().optional(),
  homepageUrl: z.string().trim().min(1).max(500).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional()
}).strict().refine(
  (value) => Object.keys(value).some((key) => key !== "expectedProfileVersion"),
  { message: "At least one mutable channel field is required" }
);

export const affiliateChannelIdParamSchema = z.object({
  channelId: z.coerce.number().int().positive()
}).strict();

export const affiliateChannelDeleteQuerySchema = z.object({
  expected_profile_version: z.coerce.number().int().positive()
}).strict().transform(({ expected_profile_version }) => ({
  expectedProfileVersion: expected_profile_version
}));
```

Add `superRefine` rules that require `customLabel` only for `custom` and reject it for preset platforms. Re-run the same rule against the merged current channel plus update inside the Service, because a partial update can change only `platform` or only `customLabel`.

- [ ] **Step 4: Verify GREEN**

Run the URL test plus `npm --prefix backend run build`.
Expected: tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit only Task 2 files**

```bash
git add backend/src/validators/affiliate-profile.validator.ts backend/src/services/affiliate-channel-url.service.ts backend/tests/affiliate-channel-url.service.test.ts
git commit -m "feat: validate affiliate profile channels"
```

### Task 3: Repository, service, and atomic activation alignment

**Files:**
- Create: `backend/src/repositories/affiliate-profile.repository.ts`
- Create: `backend/src/services/affiliate-profile.service.ts`
- Create: `backend/tests/affiliate-profile.service.test.ts`
- Create: `backend/tests/affiliate-profile.repository.test.ts`
- Modify: `backend/src/repositories/affiliate-identity-activation.repository.ts`
- Modify: `backend/src/services/affiliate-identity-activation.service.ts`
- Modify: `backend/tests/affiliate-identity-activation.repository.test.ts`
- Modify: `backend/tests/affiliate-identity-activation.service.test.ts`

**Interfaces:**
- Produces `AffiliateProfilePayload` without internal numeric user or identity IDs.
- Produces service methods `getMine`, `updateMine`, `createChannel`, `updateChannel`, and `deleteChannel`.
- Changes activation output to `{ contractAcceptance, affiliate: { affiliateStatus, needoId, profileId } }`.
- Makes profile creation part of the existing contract/identity transaction.

- [ ] **Step 1: Write failing service tests**

Use a mocked repository port and real service rules. Cover active-profile requirement, immutable `needoId`, optimistic version conflict, sorted and deduplicated arrays, maximum ten active channels, ownership, soft delete, audit metadata containing changed field names only, and no external URL fetch.

```ts
export interface AffiliateProfilePayload {
  profileId: number;
  needoId: string;
  displayName: string;
  avatarUrl: string | null;
  affiliateStatus: "active" | "suspended" | "closed";
  cooperationStatus: "available" | "selective" | "unavailable";
  version: number;
  bio: string | null;
  strengths: string[];
  serviceAreas: string[];
  channels: AffiliateProfileChannelPayload[];
  updatedAt: string;
}
```

- [ ] **Step 2: Run the service test and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-profile.service.test.ts`
Expected: FAIL because the service and port are absent.

- [ ] **Step 3: Implement the service and repository port**

Use these exact method signatures:

```ts
export class AffiliateProfileService {
  public getMine(actor: AuthenticatedAccessContext): Promise<AffiliateProfilePayload>;
  public updateMine(actor: AuthenticatedAccessContext, context: AuthRequestContext, input: AffiliateProfileUpdateBody): Promise<AffiliateProfilePayload>;
  public createChannel(actor: AuthenticatedAccessContext, context: AuthRequestContext, input: AffiliateChannelCreateBody): Promise<AffiliateProfilePayload>;
  public updateChannel(actor: AuthenticatedAccessContext, context: AuthRequestContext, channelId: number, input: AffiliateChannelUpdateBody): Promise<AffiliateProfilePayload>;
  public deleteChannel(actor: AuthenticatedAccessContext, context: AuthRequestContext, channelId: number, expectedProfileVersion: number): Promise<AffiliateProfilePayload>;
}
```

The service must require `actor.currentIdentityType === "scout"`, normalize and deduplicate string arrays, pass only normalized URLs to persistence, and create AuditLog inputs with actions `affiliate_profile.updated`, `affiliate_profile.channel_created`, `affiliate_profile.channel_updated`, and `affiliate_profile.channel_deleted`.

- [ ] **Step 4: Write repository transaction tests**

Assert every read filters `deletedAt: null`, includes only active channels ordered by `sortOrder,id`, selects `User.needoId/username/avatarUrl`, and never returns raw `userId`. Assert writes lock/read the owned profile, compare `expectedVersion`, increment version, mutate the channel, write AuditLog, and return the refreshed profile in one transaction.

- [ ] **Step 5: Implement Prisma persistence and verify GREEN**

Use nullable unique `activeKey` as `${profileId}:${sha256(normalizedHomepageUrl)}`; set it to null on soft delete. Use `AppError` keys:

```text
error.affiliate_profile.not_found
error.affiliate_profile.identity_required
error.affiliate_profile.version_conflict
error.affiliate_profile.channel_limit
error.affiliate_profile.channel_conflict
```

Run the service and repository tests. Expected: PASS.

- [ ] **Step 6: Extend activation atomically**

Change the existing activation repository's user projection to `{ id, needoId, username }`. In the same Prisma transaction, create or reuse:

```ts
const profile = await transaction.affiliateProfile.upsert({
  where: { userId: input.userId },
  create: { userId: input.userId },
  update: {},
  select: { id: true, status: true }
});
```

Return:

```ts
{
  contractAcceptance,
  affiliate: {
    affiliateStatus: profile.status.toLowerCase() as "active" | "suspended" | "closed",
    needoId: user.needoId,
    profileId: profile.id
  }
}
```

Do not return `identityId`, `identityType`, `roleCode`, internal `userId`, or `scout` from the activation API result.

- [ ] **Step 7: Verify activation retry and rollback**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-identity-activation.repository.test.ts tests/affiliate-identity-activation.service.test.ts`
Expected: PASS; two activations reuse one ContractAcceptance, one UserIdentity, and one AffiliateProfile.

- [ ] **Step 8: Commit only Task 3 files**

```bash
git add backend/src/repositories/affiliate-profile.repository.ts backend/src/services/affiliate-profile.service.ts backend/tests/affiliate-profile.service.test.ts backend/tests/affiliate-profile.repository.test.ts backend/src/repositories/affiliate-identity-activation.repository.ts backend/src/services/affiliate-identity-activation.service.ts backend/tests/affiliate-identity-activation.repository.test.ts backend/tests/affiliate-identity-activation.service.test.ts
git commit -m "feat: persist affiliate profiles"
```

### Task 4: Formal profile API, RBAC, and OpenAPI

**Files:**
- Create: `backend/src/controllers/affiliate-profile.controller.ts`
- Create: `backend/src/routes/affiliate-profile.routes.ts`
- Create: `backend/tests/affiliate-profile-api.test.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/tests/affiliate-permissions.test.ts`
- Modify: `backend/tests/affiliate-identity-activation-api.test.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/openapi.test.ts`

**Interfaces:**
- Adds `GET/PATCH /api/v1/affiliate/profile`.
- Adds `POST /api/v1/affiliate/profile/channels`.
- Adds `PATCH/DELETE /api/v1/affiliate/profile/channels/:channelId`.
- Adds permissions `page:affiliate-profile` and `button:affiliate-profile-edit` to activated affiliate roles only.

- [ ] **Step 1: Write failing API tests**

Cover success envelopes, strict-body rejection, missing authentication, independent read/edit permissions, current identity requirement, optimistic conflict, channel ownership, maximum channels, redaction of `userId/identityId/scout`, and activation output containing `needoId`.

```ts
await request(app)
  .get("/api/v1/affiliate/profile")
  .set("Authorization", `Bearer ${token}`)
  .expect(200)
  .expect((response) => {
    expect(response.body.data.needoId).toBe("u0000000007");
    expect(response.body.data).not.toHaveProperty("userId");
    expect(JSON.stringify(response.body.data)).not.toContain("scout");
  });
```

- [ ] **Step 2: Run the API test and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/affiliate-profile-api.test.ts`
Expected: FAIL because the router is not registered.

- [ ] **Step 3: Implement controller and routes**

Define permissions and route order exactly:

```ts
export const AFFILIATE_PROFILE_ROUTE_PERMISSIONS = {
  read: "page:affiliate-profile",
  edit: "button:affiliate-profile-edit"
} as const;

router.get("/affiliate/profile", authenticate(), createAuthorizeMiddleware(AFFILIATE_PROFILE_ROUTE_PERMISSIONS.read), controller.getMine);
router.patch("/affiliate/profile", authenticate(), createAuthorizeMiddleware(AFFILIATE_PROFILE_ROUTE_PERMISSIONS.edit), validateRequest({ body: affiliateProfileUpdateBodySchema }), controller.updateMine);
router.post("/affiliate/profile/channels", authenticate(), createAuthorizeMiddleware(AFFILIATE_PROFILE_ROUTE_PERMISSIONS.edit), validateRequest({ body: affiliateChannelCreateBodySchema }), controller.createChannel);
router.patch("/affiliate/profile/channels/:channelId", authenticate(), createAuthorizeMiddleware(AFFILIATE_PROFILE_ROUTE_PERMISSIONS.edit), validateRequest({ params: affiliateChannelIdParamSchema, body: affiliateChannelUpdateBodySchema }), controller.updateChannel);
router.delete("/affiliate/profile/channels/:channelId", authenticate(), createAuthorizeMiddleware(AFFILIATE_PROFILE_ROUTE_PERMISSIONS.edit), validateRequest({ params: affiliateChannelIdParamSchema, query: affiliateChannelDeleteQuerySchema }), controller.deleteChannel);
```

Use `createAuthorizeMiddleware(AFFILIATE_PROFILE_ROUTE_PERMISSIONS.read)` for the GET route as well. Controllers obtain identity and audit context with the existing `getAuthenticatedAccess(response)` and `getRequestContext(request)` helpers from `backend/src/utils/request-context.ts`, parse the validated params/body/query with the Task 2 schemas, and return `successResponse` only.

- [ ] **Step 4: Correct permission assignment**

Register `page:affiliate-profile` and `button:affiliate-profile-edit`. Split marketplace permissions so ordinary customer, technician, and merchant roles can retain the activation entry but do not receive `button:affiliate-claim`; the activated `scout` role receives marketplace read, claim, profile read, and profile edit. Keep admin assigned all system permissions.

Add a regression assertion:

```ts
expect(assignments.customer).not.toContain("button:affiliate-claim");
expect(assignments.scout).toEqual(expect.arrayContaining([
  "page:affiliate-marketplace",
  "button:affiliate-claim",
  "page:affiliate-profile",
  "button:affiliate-profile-edit"
]));
```

- [ ] **Step 5: Register dependencies and routes**

Add `affiliateProfileRepository?: AffiliateProfileRepositoryPort` and `affiliateProfileService?: AffiliateProfileService` to `AppDependencies`. Register `createAffiliateProfileRoutes(config, resolvedDependencies)` immediately after identity activation routes and before marketplace routes.

- [ ] **Step 6: Document exact OpenAPI contracts**

Add component schemas for `AffiliateProfile`, `AffiliateProfileChannel`, profile update, channel create/update, and the activation response. Add all five paths with bearer security and 400/401/403/404/409 responses. Extend `openapi.test.ts` to assert the paths, strict bodies, `needoId`, and absence of internal IDs.

- [ ] **Step 7: Verify GREEN**

Run:

```bash
npm --prefix backend test -- --runInBand tests/affiliate-profile-api.test.ts tests/affiliate-identity-activation-api.test.ts tests/affiliate-permissions.test.ts tests/openapi.test.ts
npm --prefix backend run build
```

Expected: all tests pass and TypeScript exits 0.

- [ ] **Step 8: Commit only Task 4 files**

```bash
git add backend/src/controllers/affiliate-profile.controller.ts backend/src/routes/affiliate-profile.routes.ts backend/tests/affiliate-profile-api.test.ts backend/src/app.ts backend/src/constants/permissions.constants.ts backend/tests/affiliate-permissions.test.ts backend/tests/affiliate-identity-activation-api.test.ts backend/src/api/openapi.ts backend/tests/openapi.test.ts
git commit -m "feat: expose affiliate profile API"
```

### Task 5: Typed frontend API client

**Files:**
- Create: `src/api/affiliateProfile.ts`
- Create: `src/api/affiliateProfile.test.ts`
- Modify: `src/features/identity-applications/api.ts`
- Modify: `src/features/identity-applications/api.test.ts`

**Interfaces:**
- Produces `affiliateProfileApi.getMine/updateMine/createChannel/updateChannel/deleteChannel`.
- Aligns `identityApplicationsApi.activateAffiliate` with `{ affiliateStatus, needoId, profileId }`.

- [ ] **Step 1: Write failing client-contract tests**

Mock `httpClient.request` and assert exact paths, methods, query/body names, and encoded channel IDs.

```ts
await affiliateProfileApi.updateMine({
  expectedVersion: 2,
  bio: "東京の美容サービスを紹介します",
  strengths: ["美容"],
  serviceAreas: ["東京都"],
  cooperationStatus: "available"
});
expect(httpClient.request).toHaveBeenCalledWith("/affiliate/profile", {
  method: "PATCH",
  body: expect.objectContaining({ expectedVersion: 2 })
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- --run src/api/affiliateProfile.test.ts src/features/identity-applications/api.test.ts`
Expected: FAIL because the new client and response type are absent.

- [ ] **Step 3: Implement exact frontend types and methods**

Use API-facing string unions matching Task 2 and do not define `userId`, `identityId`, or `identityType` in any public type.

```ts
export const affiliateProfileApi = {
  getMine: () => httpClient.request<AffiliateProfile>("/affiliate/profile"),
  updateMine: (body: AffiliateProfileUpdateInput) =>
    httpClient.request<AffiliateProfile>("/affiliate/profile", { method: "PATCH", body }),
  createChannel: (body: AffiliateChannelCreateInput) =>
    httpClient.request<AffiliateProfile>("/affiliate/profile/channels", { method: "POST", body }),
  updateChannel: (channelId: number, body: AffiliateChannelUpdateInput) =>
    httpClient.request<AffiliateProfile>(`/affiliate/profile/channels/${channelId}`, { method: "PATCH", body }),
  deleteChannel: (channelId: number, expectedProfileVersion: number) =>
    httpClient.request<AffiliateProfile>(`/affiliate/profile/channels/${channelId}`, {
      method: "DELETE",
      query: { expected_profile_version: expectedProfileVersion }
    })
};
```

- [ ] **Step 4: Verify GREEN and commit**

Run the two focused Vitest files. Expected: PASS.

```bash
git add src/api/affiliateProfile.ts src/api/affiliateProfile.test.ts src/features/identity-applications/api.ts src/features/identity-applications/api.test.ts
git commit -m "feat: add affiliate profile client"
```

### Task 6: Formal `/afirieito/me` profile experience

**Files:**
- Create: `src/features/affiliate-profile/AffiliateProfilePage.tsx`
- Create: `src/features/affiliate-profile/AffiliateProfilePage.test.tsx`
- Modify: `src/features/identity-applications/AffiliateActivationPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/i18n/translations.ts`
- Modify: `src/i18n/translations.test.ts`

**Interfaces:**
- Makes `/afirieito/me` the formal profile editor for an activated affiliate.
- Redirects successful activation to `/afirieito/me` after refreshing the business identity.
- Uses the existing MobileShell, MobileFullscreenHeader, client theme variables, and i18n runtime.

- [ ] **Step 1: Write the failing page interaction test**

Render with `MemoryRouter`, mocked `affiliateProfileApi`, Auth, i18n, and theme providers. Cover:

- initial loading and exact `needoId` display;
- editing bio, strengths, service areas, and cooperation status;
- saving with the current `version` and replacing state with the server response;
- adding a preset or custom HTTPS homepage;
- deleting a channel with the current profile version;
- 409 version conflict message and reload action;
- no localStorage writes and no external fetch.

Use DOM assertions such as:

```ts
expect(container.textContent).toContain("u0000000007");
expect(container.querySelector('input[name="needoId"]')).toHaveProperty("readOnly", true);
expect(affiliateProfileApi.updateMine).toHaveBeenCalledWith(
  expect.objectContaining({ expectedVersion: 3 })
);
```

- [ ] **Step 2: Run the page test and verify RED**

Run: `npm test -- --run src/features/affiliate-profile/AffiliateProfilePage.test.tsx`
Expected: FAIL because the page is absent.

- [ ] **Step 3: Implement the profile page**

Build one responsive page with:

- read-only avatar, display name, and `needoId` identity card;
- editable affiliate bio;
- editable strengths and service areas as removable chips with maximum counts shown;
- cooperation-status select;
- external homepage list showing platform, domain, full safe link, and updated time;
- inline add/edit form with platform, custom label, HTTPS URL, and sort order;
- explicit loading, empty, permission, version-conflict, save-success, and API-error states.

All mutations must await the server response before updating the authoritative page state. No optimistic local-only persistence is allowed.

- [ ] **Step 4: Wire routing and activation handoff**

Import `AffiliateProfilePage` in `App.tsx` and replace only the `/afirieito/me` gate route:

```tsx
<Route path="/afirieito/me" element={protect("business", <AffiliateProfilePage />)} />
```

Change both successful activation paths to refresh the business identity and navigate to `/afirieito/me`. Keep all other `/afirieito/*` capability gates unchanged in this microstep.

- [ ] **Step 5: Add complete English and Japanese copy**

Add translations for every new source string, including:

```text
联盟营销个人资料 / Affiliate profile / アフィリエイトプロフィール
NeeDo用户ID / NeeDo user ID / NeeDoユーザーID
外部社交平台主页 / External social profiles / 外部SNSプロフィール
用户填写的外部主页 / User-provided external profile / ユーザー入力の外部プロフィール
可接受合作 / Available for collaborations / コラボレーション受付中
选择性接受 / Selective / 条件付きで受付
暂不接受 / Unavailable / 受付停止中
```

Extend the i18n test to assert `联盟营销` remains `Affiliate` in English and `アフィリエイト` in Japanese.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```bash
npm test -- --run src/features/affiliate-profile/AffiliateProfilePage.test.tsx src/features/identity-applications/api.test.ts src/i18n/translations.test.ts
npm run verify:production-build
```

Expected: tests pass; formal production build and bundle audit pass.

```bash
git add src/features/affiliate-profile/AffiliateProfilePage.tsx src/features/affiliate-profile/AffiliateProfilePage.test.tsx src/features/identity-applications/AffiliateActivationPage.tsx src/App.tsx src/i18n/translations.ts src/i18n/translations.test.ts
git commit -m "feat: add formal affiliate profile page"
```

### Task 7: Formal flow verification, documentation, and acceptance gate

**Files:**
- Create: `docs/affiliate-profile.md`
- Modify only when required by verified failures: files from Tasks 1-6

**Interfaces:**
- Produces release evidence for the first vertical slice.
- Leaves the next implementation plan blocked until this slice passes API, persistence, build, and browser acceptance.

- [ ] **Step 1: Run all focused backend tests**

Run:

```bash
npm --prefix backend test -- --runInBand tests/affiliate-profile-schema.test.ts tests/affiliate-channel-url.service.test.ts tests/affiliate-profile.service.test.ts tests/affiliate-profile.repository.test.ts tests/affiliate-profile-api.test.ts tests/affiliate-identity-activation.service.test.ts tests/affiliate-identity-activation.repository.test.ts tests/affiliate-identity-activation-api.test.ts tests/affiliate-permissions.test.ts tests/openapi.test.ts
```

Expected: all focused suites pass with zero failing tests.

- [ ] **Step 2: Run backend quality gates**

Run:

```bash
npm --prefix backend exec prisma validate
npm --prefix backend run build
npm --prefix backend run lint
npm --prefix backend run format:check
```

Expected: every command exits 0. If repository-wide lint or format reports pre-existing unrelated failures, record the exact paths and prove all touched files pass the corresponding focused command before proceeding.

- [ ] **Step 3: Run frontend quality gates**

Run:

```bash
npm test -- --run src/api/affiliateProfile.test.ts src/features/affiliate-profile/AffiliateProfilePage.test.tsx src/features/identity-applications/api.test.ts src/i18n/translations.test.ts
npm run verify:production-build
```

Expected: focused tests and formal production build pass.

- [ ] **Step 4: Start and verify formal local services**

Run `npm run dev:formal` and verify listeners and readiness with the repository's formal-service procedure. Required evidence:

```text
MySQL 3307 listening
Redis 6379 listening
backend 3000 /api/v1/health = ok
backend 3000 /api/v1/ready = ready
frontend 5180 returns HTTP 200
frontend proxy /api/v1/health = ok
```

- [ ] **Step 5: Perform real-account API acceptance**

Using an existing formal NeeDo test account:

1. Confirm `/auth/me` returns an immutable `needoId`.
2. Accept the current affiliate contract without eKYC.
3. Confirm the activation response returns the same `needoId` and no internal identity fields.
4. Create/update a profile and two external homepage links.
5. Reload the profile after logout/login and backend restart.
6. Confirm a non-activated account receives 403 from profile edit and cannot claim a task.
7. Confirm bank/eKYC state is unchanged by profile activation.

- [ ] **Step 6: Perform browser acceptance**

Open `/me/identity/affiliate/contract`, activate, and verify redirect to `/afirieito/me`. Inspect desktop and mobile widths in Chinese, English, and Japanese. Save profile fields, add/delete links, refresh, relogin, and verify persistence. Capture screenshots showing the same `needoId`, safe clickable links, and no unimplemented feature claims.

- [ ] **Step 7: Write the evidence document**

Document:

- migration name and applied status;
- endpoint and permission matrix;
- URL security rules;
- exact test/build commands and results;
- formal account identifier in redacted form;
- browser routes, languages, viewport sizes, and screenshot locations;
- known out-of-scope items mapped to the approved design's next microstep.

- [ ] **Step 8: Commit documentation and verified fixes only**

```bash
git add docs/affiliate-profile.md
git commit -m "docs: record affiliate profile acceptance"
```

Do not start the alliance-organization plan until every acceptance item above is green.
