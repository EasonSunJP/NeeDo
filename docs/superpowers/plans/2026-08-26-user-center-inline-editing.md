# User Center Inline Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/me` use one inline-editable information card, remove its bottom navigation in every state, provide a red-X cancel control plus a viewport-fixed save action, and persist formal customer profile edits across refreshes.

**Architecture:** Add one protected current-customer profile read/write API that derives scope from the authenticated customer identity, validates and audits every change, persists profile fields in Prisma, and stores cropped avatars through a bounded filesystem storage adapter backed by `MediaAsset`. The existing `CompleteUserCenterPage` remains the only UI; formal data flows through the new API while explicit frontend-preview sessions retain the existing compatibility store. `MobileShell` disables navigation with `showBottomNav={false}`, and edit/save/cancel state stays local to the page.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Vitest 4, Node.js 22, Express, Zod, Prisma, MySQL 8, Jest, Supertest.

## Global Constraints

- This is one formal microstep; do not modify Booking, NDP calculations, RBAC architecture, IM, Social, or other pages' navigation.
- Keep React / TSX / Vite and the single `CompleteUserCenterPage`; do not create formal/demo duplicate pages.
- Formal customer edits must use `/api/v1`, real Prisma records, Zod validation, authenticated customer scope, permission checks, audit logs, OpenAPI, and tests.
- `/me` never shows the ordinary bottom navigation: view, loading, error, editing, and saving states all use `showBottomNav={false}`.
- The edit-state save action is viewport-fixed, respects `env(safe-area-inset-bottom)`, and does not move with the page scroll.
- The edit-state top-right control is a red X; cancel discards the unsaved draft.
- NDP, usage count, credit score, NeeDo ID, and membership level remain read-only.
- Do not store data URLs in MySQL; decode validated avatar data into the configured media directory and persist only the resulting media URL.
- Preserve unrelated dirty-worktree changes and stage only task-owned files in each commit.

---

### Task 1: Formal Customer Profile Schema, Permission, and Validation Contract

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260826090000_customer_profile_self_edit/migration.sql`
- Modify: `backend/src/constants/permissions.constants.ts`
- Create: `backend/src/validators/customer-profile.validator.ts`
- Create: `backend/tests/customer-profile-validator.test.ts`
- Modify: `backend/.env.dev.example`
- Modify: `backend/src/config/env.ts`

**Interfaces:**
- Consumes: existing `CustomerProfile`, `MediaAsset`, permission seed, and `AppConfig` patterns.
- Produces: `CustomerProfileVisibility`, `customerProfileUpdateBodySchema`, `CustomerProfileUpdateBody`, `CUSTOMER_PROFILE_ROUTE_PERMISSIONS`, `CUSTOMER_AVATAR_STORAGE_DIR`, and `CUSTOMER_AVATAR_PUBLIC_BASE_URL`.

- [ ] **Step 1: Write the failing validator and schema-contract tests**

```ts
import { describe, expect, it } from "@jest/globals";
import { customerProfileUpdateBodySchema } from "../src/validators/customer-profile.validator";

describe("customer profile self-edit validation", () => {
  it("accepts the complete editable card payload", () => {
    expect(customerProfileUpdateBodySchema.parse({
      displayName: "松尾 雄大",
      gender: "private",
      age: 36,
      heightCm: 171,
      languages: ["日本語", "English"],
      bio: "日々の暮らしで見つけたお気に入りを紹介します。",
      visibility: "network"
    })).toMatchObject({ displayName: "松尾 雄大", visibility: "network" });
  });

  it.each([
    { age: 151 },
    { heightCm: 299 },
    { languages: [] },
    { visibility: "friends" },
    { avatarDataUrl: "data:text/plain;base64,SGVsbG8=" }
  ])("rejects an invalid editable field: %o", (body) => {
    expect(() => customerProfileUpdateBodySchema.parse(body)).toThrow();
  });
});
```

- [ ] **Step 2: Run the validator test and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/customer-profile-validator.test.ts`

Expected: FAIL because `customer-profile.validator.ts` does not exist.

- [ ] **Step 3: Add the migration and Prisma fields**

Add to `CustomerProfile`:

```prisma
  gender          String    @default("private") @db.VarChar(20)
  age             Int?
  heightCm        Decimal?  @map("height_cm") @db.Decimal(5, 2)
  languages       Json?
  visibility      String    @default("public") @db.VarChar(20)
```

Create migration SQL:

```sql
ALTER TABLE `customer_profiles`
  ADD COLUMN `gender` VARCHAR(20) NOT NULL DEFAULT 'private',
  ADD COLUMN `age` INTEGER NULL,
  ADD COLUMN `height_cm` DECIMAL(5,2) NULL,
  ADD COLUMN `languages` JSON NULL,
  ADD COLUMN `visibility` VARCHAR(20) NOT NULL DEFAULT 'public';

UPDATE `customer_profiles`
SET `languages` = JSON_ARRAY('日本語'),
    `visibility` = CASE WHEN `is_public` = TRUE THEN 'public' ELSE 'privateAll' END
WHERE `languages` IS NULL;

CREATE INDEX `customer_profiles_visibility_idx`
  ON `customer_profiles`(`visibility`);
```

- [ ] **Step 4: Implement the exact Zod update contract**

```ts
import { z } from "zod";

const avatarDataUrl = z.string().max(900_000).regex(
  /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/
);

export const customerProfileVisibilitySchema = z.enum([
  "public",
  "privateAll",
  "limited",
  "network"
]);

export const customerProfileUpdateBodySchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  avatarDataUrl: avatarDataUrl.optional(),
  gender: z.enum(["female", "male", "private"]).optional(),
  age: z.number().int().min(0).max(150).nullable().optional(),
  heightCm: z.number().min(30).max(250).nullable().optional(),
  languages: z.array(z.string().trim().min(1).max(40)).min(1).max(10).optional(),
  bio: z.string().trim().max(2_000).nullable().optional(),
  visibility: customerProfileVisibilitySchema.optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "At least one profile field is required"
});

export type CustomerProfileUpdateBody = z.infer<typeof customerProfileUpdateBodySchema>;
export type CustomerProfileVisibility = z.infer<typeof customerProfileVisibilitySchema>;
```

- [ ] **Step 5: Add permission and media configuration**

Add `customer-profile:read` and `customer-profile:write` with `api/customer-profile` metadata to the system permissions, and include both in `CUSTOMER_BOOKING_PERMISSION_CODES`. Add:

```ts
CUSTOMER_AVATAR_STORAGE_DIR: z.string().min(1).default("runtime/customer-avatars"),
CUSTOMER_AVATAR_PUBLIC_BASE_URL: z.string().url()
```

Add local example values:

```dotenv
CUSTOMER_AVATAR_STORAGE_DIR=runtime/customer-avatars
CUSTOMER_AVATAR_PUBLIC_BASE_URL=http://localhost:3000/media/customer-avatars
```

- [ ] **Step 6: Verify GREEN and validate Prisma**

Run: `npm --prefix backend test -- --runInBand tests/customer-profile-validator.test.ts`

Expected: PASS.

Run: `ENV_FILE=.env.dev npm --prefix backend run prisma:validate`

Expected: Prisma schema valid.

- [ ] **Step 7: Commit Task 1 only**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260826090000_customer_profile_self_edit/migration.sql backend/src/constants/permissions.constants.ts backend/src/validators/customer-profile.validator.ts backend/tests/customer-profile-validator.test.ts backend/.env.dev.example backend/src/config/env.ts
git commit -m "feat: define customer profile self-edit contract"
```

---

### Task 2: Customer Avatar Storage, Repository, and Service

**Files:**
- Create: `backend/src/services/customer-avatar.storage.ts`
- Create: `backend/src/repositories/customer-profile.repository.ts`
- Create: `backend/src/services/customer-profile.service.ts`
- Create: `backend/tests/customer-avatar-storage.test.ts`
- Create: `backend/tests/customer-profile.service.test.ts`

**Interfaces:**
- Consumes: `CustomerProfileUpdateBody`, authenticated access/context, `AuditLogService`, Prisma `CustomerProfile` and `MediaAsset`.
- Produces: `CustomerAvatarStoragePort.save(dataUrl): Promise<StoredCustomerAvatar>`, `CustomerProfileRepositoryPort`, `CustomerProfilePayload`, `CustomerProfileService.getMine`, and `CustomerProfileService.updateMine`.

- [ ] **Step 1: Write failing storage tests**

```ts
it("writes validated image bytes under a content hash and returns the public URL", async () => {
  const storage = new CustomerAvatarFileStorage(tempDirectory, "http://localhost:3000/media/customer-avatars");
  const result = await storage.save("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB");
  expect(result.url).toMatch(/^http:\/\/localhost:3000\/media\/customer-avatars\/[a-f0-9]{64}\.png$/);
  await expect(readFile(result.absolutePath)).resolves.toBeInstanceOf(Buffer);
});

it("rejects bytes whose magic signature does not match the declared MIME type", async () => {
  const storage = new CustomerAvatarFileStorage(tempDirectory, "http://localhost:3000/media/customer-avatars");
  await expect(storage.save("data:image/png;base64,SGVsbG8=")).rejects.toMatchObject({ statusCode: 400 });
});
```

- [ ] **Step 2: Run storage tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/customer-avatar-storage.test.ts`

Expected: FAIL because the storage module does not exist.

- [ ] **Step 3: Implement bounded content-addressed avatar storage**

Implement `save` using `node:crypto`, `node:fs/promises`, and `node:path`:

```ts
export interface StoredCustomerAvatar {
  absolutePath: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  url: string;
}

export interface CustomerAvatarStoragePort {
  save(dataUrl: string): Promise<StoredCustomerAvatar>;
}
```

Decode the payload, reject buffers over `675_000` bytes, verify JPEG (`ff d8 ff`), PNG (`89 50 4e 47 0d 0a 1a 0a`), or WebP (`RIFF....WEBP`) signatures, derive a SHA-256 filename, create the configured directory, and write with `{ flag: "wx" }`; treat `EEXIST` as idempotent success. Never use client-provided filenames or paths.

- [ ] **Step 4: Write failing service tests for scope, persistence, avatar, and audit**

```ts
it("updates only the current customer identity and audits changed fields", async () => {
  const actor = {
    userId: 11,
    currentIdentityType: "customer",
    currentIdentityScopeType: "customer_profile",
    currentIdentityScopeId: 41
  } as AuthenticatedAccessContext;
  repository.updateMine.mockResolvedValue(updatedProfile);

  await service.updateMine(actor, requestContext, {
    displayName: "松尾 雄大",
    languages: ["日本語", "English"],
    visibility: "network"
  });

  expect(repository.updateMine).toHaveBeenCalledWith(11, 41, expect.objectContaining({
    displayName: "松尾 雄大",
    isPublic: false,
    visibility: "network"
  }));
  expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
    action: "customer_profile.self_update",
    targetId: 41,
    metadata: { changedFields: ["displayName", "languages", "visibility"] }
  }));
});

it("rejects a non-customer identity before repository access", async () => {
  await expect(service.getMine({
    userId: 9,
    currentIdentityType: "technician",
    currentIdentityScopeType: "technician_profile",
    currentIdentityScopeId: 7
  } as AuthenticatedAccessContext)).rejects.toMatchObject({ statusCode: 403 });
  expect(repository.findMine).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Run service tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/customer-profile.service.test.ts`

Expected: FAIL because repository/service modules do not exist.

- [ ] **Step 6: Implement repository transaction and service scope rules**

Repository input:

```ts
export interface CustomerProfileMutation {
  displayName?: string;
  gender?: "female" | "male" | "private";
  age?: number | null;
  heightCm?: number | null;
  languages?: string[];
  bio?: string | null;
  visibility?: "public" | "privateAll" | "limited" | "network";
  isPublic?: boolean;
  avatar?: { url: string; mimeType: string };
}
```

`findMine(userId, profileId)` must filter `{ id: profileId, userId, deletedAt: null }`. `updateMine` must use one Prisma transaction to update `CustomerProfile`, soft-deactivate the previous active avatar when `avatar` exists, create the new `MediaAsset` with `entityType: "customer_profile"`, `usageType: "avatar"`, and update `User.avatarUrl` so Auth/IM use the same avatar. Serialize `languages` only after confirming it is a JSON string array; return `[]` only for legacy null data.

Service rules:

```ts
private getCustomerScope(actor: AuthenticatedAccessContext) {
  if (
    actor.currentIdentityType !== "customer" ||
    actor.currentIdentityScopeType !== "customer_profile" ||
    !actor.currentIdentityScopeId
  ) throw new AppError({ code: ERROR_CODES.FORBIDDEN, message: "error.forbidden", statusCode: 403 });
  return { userId: actor.userId, profileId: actor.currentIdentityScopeId };
}
```

When `avatarDataUrl` exists, call storage first and pass only `{ url, mimeType }` to the repository. Map `visibility === "public"` to `isPublic: true`; every other visibility maps to `false`. Record audit metadata with sorted changed field names and never include the data URL.

- [ ] **Step 7: Verify GREEN**

Run: `npm --prefix backend test -- --runInBand tests/customer-avatar-storage.test.ts tests/customer-profile.service.test.ts`

Expected: both suites PASS with no warnings.

- [ ] **Step 8: Commit Task 2 only**

```bash
git add backend/src/services/customer-avatar.storage.ts backend/src/repositories/customer-profile.repository.ts backend/src/services/customer-profile.service.ts backend/tests/customer-avatar-storage.test.ts backend/tests/customer-profile.service.test.ts
git commit -m "feat: persist current customer profile edits"
```

---

### Task 3: Protected API, Static Avatar Delivery, and OpenAPI

**Files:**
- Create: `backend/src/controllers/customer-profile.controller.ts`
- Create: `backend/src/routes/customer-profile.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/customer-profile-api.test.ts`
- Modify: `backend/tests/openapi.test.ts`
- Modify: `docs/api.md`

**Interfaces:**
- Consumes: Task 2 service/repository/storage and Task 1 permissions/config.
- Produces: authenticated `GET /api/v1/customer-profile/me`, authenticated `PATCH /api/v1/customer-profile/me`, and public read-only avatar bytes under `/media/customer-avatars/:contentHash.ext`.

- [ ] **Step 1: Write failing API tests**

```ts
it("reads and updates only the authenticated customer profile", async () => {
  const token = await loginAsCustomer();
  await request(app)
    .get("/api/v1/customer-profile/me")
    .set("Authorization", `Bearer ${token}`)
    .expect(200)
    .expect(({ body }) => expect(body.data.id).toBe(41));

  await request(app)
    .patch("/api/v1/customer-profile/me")
    .set("Authorization", `Bearer ${token}`)
    .send({ displayName: "松尾 雄大", visibility: "network" })
    .expect(200)
    .expect(({ body }) => expect(body.data).toMatchObject({ displayName: "松尾 雄大", visibility: "network" }));
});

it("rejects missing auth, missing permission, wrong identity, and invalid bodies", async () => {
  await request(app).patch("/api/v1/customer-profile/me").send({ displayName: "x" }).expect(401);
  await request(app).patch("/api/v1/customer-profile/me").set("Authorization", `Bearer ${technicianToken}`).send({ displayName: "x" }).expect(403);
  await request(app).patch("/api/v1/customer-profile/me").set("Authorization", `Bearer ${customerToken}`).send({ age: 999 }).expect(400);
});
```

- [ ] **Step 2: Run the API tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/customer-profile-api.test.ts`

Expected: FAIL with route not found.

- [ ] **Step 3: Implement controller and routes**

Route contract:

```ts
export const CUSTOMER_PROFILE_ROUTE_PERMISSIONS = {
  read: "customer-profile:read",
  write: "customer-profile:write"
} as const;

router.get("/customer-profile/me", authenticate(), authorize(CUSTOMER_PROFILE_ROUTE_PERMISSIONS.read), controller.getMine);
router.patch(
  "/customer-profile/me",
  authenticate(),
  authorize(CUSTOMER_PROFILE_ROUTE_PERMISSIONS.write),
  validateRequest({ body: customerProfileUpdateBodySchema }),
  controller.updateMine
);
```

Controller methods call `getAuthenticatedAccess(response)` and `getRequestContext(request)`, then return `successResponse(...)`. Register `createCustomerProfileRoutes(config, resolvedDependencies)` in `app.ts`, inject repository/storage through `AppDependencies`, and expose the configured storage directory with `express.static` at `/media/customer-avatars` before `notFoundMiddleware`. Set immutable cache headers for hashed avatar filenames and disable directory listing.

- [ ] **Step 4: Add exact OpenAPI schemas and paths**

Document bearer security, the `CustomerSelfProfile` response, `CustomerSelfProfileUpdate` request, `400/401/403/404/500` errors, and both paths. Add assertions:

```ts
expect(response.body.paths).toHaveProperty("/api/v1/customer-profile/me");
expect(response.body.paths["/api/v1/customer-profile/me"].patch.security).toEqual([{ bearerAuth: [] }]);
expect(response.body.components.schemas.CustomerSelfProfile.required).toEqual(expect.arrayContaining([
  "id", "displayName", "avatarUrl", "gender", "age", "heightCm", "languages", "bio", "visibility", "membershipLevel"
]));
```

- [ ] **Step 5: Verify GREEN**

Run: `npm --prefix backend test -- --runInBand tests/customer-profile-api.test.ts tests/openapi.test.ts`

Expected: both suites PASS.

- [ ] **Step 6: Commit Task 3 only**

```bash
git add backend/src/controllers/customer-profile.controller.ts backend/src/routes/customer-profile.routes.ts backend/src/app.ts backend/src/api/openapi.ts backend/tests/customer-profile-api.test.ts backend/tests/openapi.test.ts docs/api.md
git commit -m "feat: expose current customer profile API"
```

---

### Task 4: Frontend Formal Profile Adapter

**Files:**
- Create: `src/features/core-read/customerProfileApi.ts`
- Create: `src/features/core-read/customerProfileApi.test.ts`
- Modify: `src/features/core-read/api.ts`
- Modify: `src/pages/user/UserCenterFormalIntegration.test.ts`

**Interfaces:**
- Consumes: `httpClient`, Task 3 API response, and existing `mapCoreCustomerToCustomer`.
- Produces: `CustomerSelfProfile`, `CustomerSelfProfileUpdate`, `customerProfileApi.getMine()`, `customerProfileApi.updateMine(input)`, and complete formal profile mapping.

- [ ] **Step 1: Write failing adapter tests**

```ts
it("uses the protected current-profile routes", async () => {
  await customerProfileApi.getMine();
  expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining("/api/v1/customer-profile/me"), expect.objectContaining({ headers: expect.any(Headers) }));

  await customerProfileApi.updateMine({ displayName: "松尾 雄大", visibility: "network" });
  expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining("/api/v1/customer-profile/me"), expect.objectContaining({ method: "PATCH" }));
});

it("maps every persisted editable field into the customer view model", () => {
  expect(mapCoreCustomerToCustomer(profile)).toMatchObject({
    nickname: "松尾 雄大",
    gender: "private",
    age: "36",
    height: "171cm",
    languages: ["日本語", "English"],
    bio: "自己紹介"
  });
});
```

- [ ] **Step 2: Run adapter tests and verify RED**

Run: `npm test -- src/features/core-read/customerProfileApi.test.ts`

Expected: FAIL because `customerProfileApi` and fields are absent.

- [ ] **Step 3: Implement adapter and mapping**

```ts
export const customerProfileApi = {
  getMine() {
    return httpClient.request<CustomerSelfProfile>("/customer-profile/me");
  },
  updateMine(input: CustomerSelfProfileUpdate) {
    return httpClient.request<CustomerSelfProfile>("/customer-profile/me", {
      method: "PATCH",
      body: input
    });
  }
};
```

Extend `CoreCustomerProfile` and `mapCoreCustomerToCustomer` with `gender`, `age`, `heightCm`, `languages`, and `visibility`; preserve public profile compatibility by making these additions optional in the public type and required in `CustomerSelfProfile`.

- [ ] **Step 4: Change formal user-center loading to the protected self read**

Replace `coreReadApi.getCustomerProfile(customerProfileId)` with `customerProfileApi.getMine()`. Keep the route-derived profile ID only as the authentication gate; assert that the returned profile ID matches the active identity scope before rendering.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- src/features/core-read/customerProfileApi.test.ts src/pages/user/UserCenterFormalIntegration.test.ts`

Expected: both suites PASS.

- [ ] **Step 6: Commit Task 4 only**

```bash
git add src/features/core-read/customerProfileApi.ts src/features/core-read/customerProfileApi.test.ts src/features/core-read/api.ts src/pages/user/UserCenterFormalIntegration.test.ts
git commit -m "feat: connect current customer profile adapter"
```

---

### Task 5: Inline Edit Controls, Removed `/me` Navigation, and Fixed Save Action

**Files:**
- Modify: `src/pages/user/UserCenterPage.tsx`
- Modify: `src/pages/user/UserCenterPage.test.tsx`
- Modify: `src/pages/user/UserCenterFormalIntegration.test.ts`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: Task 4 `customerProfileApi`, current card draft helpers, `IconButton`, `MobileShell`, and existing avatar crop output.
- Produces: one `/me` UI with view/edit/save states, red-X cancellation, no bottom nav, and fixed formal save.

- [ ] **Step 1: Replace the obsolete navigation test with failing interaction-source contracts**

```ts
it("removes the bottom navigation from every user-center state", () => {
  expect(source.match(/showBottomNav=\{false\}/g)).toHaveLength(2);
  expect(source).not.toContain("navItems={userNavItems}");
});

it("turns the card action into edit and a red cancel X", () => {
  expect(source).not.toContain('to="/me/settings/account"');
  expect(source).toContain('icon={isEditingProfile ? "x" : "edit"}');
  expect(source).toContain('label={isEditingProfile ? "取消编辑" : "编辑资料"}');
  expect(source).toContain("isEditingProfile ? cancelProfileEdit : startProfileEdit");
  expect(source).toContain("bg-red-500");
});

it("shows a viewport-fixed save action only during editing", () => {
  expect(source).toContain('data-testid="user-profile-save-action"');
  expect(source).toContain("fixed inset-x-0 bottom-0");
  expect(source).toContain("env(safe-area-inset-bottom)");
  expect(source).toContain("保存并退出编辑模式");
});
```

- [ ] **Step 2: Run page tests and verify RED**

Run: `npm test -- src/pages/user/UserCenterPage.test.tsx src/pages/user/UserCenterFormalIntegration.test.ts`

Expected: FAIL because the page still renders `userNavItems`, routes formal users to account settings, and has inline cancel/save buttons.

- [ ] **Step 3: Remove `/me` bottom navigation explicitly**

Set both the data-status shell and complete-page shell to:

```tsx
<MobileShell showBottomNav={false} navPanelStyle="plain" showTopEdgeMask={false}>
```

Remove the now-unused `userNavItems` import. Reduce normal content bottom padding to the page safe area; while editing, add enough padding for the fixed save action.

- [ ] **Step 4: Make the card action a red-X state toggle**

Use one button for formal and preview sessions:

```tsx
<IconButton
  className={cn(
    "absolute right-0 top-0 z-10 text-white shadow-[0_14px_30px_rgba(0,0,0,0.22)]",
    isEditingProfile ? "border-red-400 bg-red-500 hover:bg-red-600" : membershipSurface.metric
  )}
  icon={isEditingProfile ? "x" : "edit"}
  label={isEditingProfile ? "取消编辑" : "编辑资料"}
  onClick={isSavingProfile ? undefined : isEditingProfile ? cancelProfileEdit : startProfileEdit}
/>
```

Remove the inline `取消` and `保存` button grid from the information card so there is one cancel control and one save control.

- [ ] **Step 5: Implement formal save and failure preservation**

Make `saveProfileEdit` async. For formal sessions call:

```ts
const updated = await customerProfileApi.updateMine({
  displayName: nextProfile.nickname,
  avatarDataUrl: nextProfile.avatar.startsWith("data:image/") ? nextProfile.avatar : undefined,
  gender: nextProfile.gender,
  age: nextProfile.age ? Number(nextProfile.age) : null,
  heightCm: nextProfile.height ? Number(formatUserHeightInput(nextProfile.height)) : null,
  languages: nextProfile.languages,
  bio: nextProfile.bio || null,
  visibility: profilePrivacyEnabled ? profilePrivacyVisibility : "public"
});
```

Pass the returned profile to `FormalUserCenterDataGate` through `onFormalProfileUpdated`, then clear the draft and exit edit mode. On error, set a translated failure message, keep the draft, and leave `isEditingProfile` true. For an explicit frontend-preview session only, retain `updateCustomerEntity` compatibility.

- [ ] **Step 6: Add the fixed save action**

```tsx
{isEditingProfile ? (
  <div
    className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] px-4 pb-[calc(max(env(safe-area-inset-bottom),12px)+12px)] pt-8"
    data-testid="user-profile-save-action"
  >
    <button
      className="pointer-events-auto mx-auto block w-full max-w-[620px] rounded-[22px] bg-[color:var(--client-primary)] px-5 py-4 text-sm font-black text-[color:var(--client-needo-text)] shadow-[0_18px_46px_rgba(0,0,0,0.36)] disabled:opacity-60"
      disabled={isSavingProfile}
      onClick={() => void saveProfileEdit()}
      type="button"
    >
      {isSavingProfile ? "正在保存资料" : "保存并退出编辑模式"}
    </button>
  </div>
) : null}
```

Add Chinese source keys plus Japanese, English, Traditional Chinese, and Korean translations for `取消编辑`, `正在保存资料`, `保存并退出编辑模式`, `资料保存失败，请保留当前内容后重试`, and the success message.

- [ ] **Step 7: Verify GREEN**

Run: `npm test -- src/pages/user/UserCenterPage.test.tsx src/pages/user/UserCenterFormalIntegration.test.ts src/features/core-read/customerProfileApi.test.ts`

Expected: all suites PASS.

Run: `npm run i18n:audit`

Expected: no missing translations introduced by this task.

- [ ] **Step 8: Commit Task 5 only**

```bash
git add src/pages/user/UserCenterPage.tsx src/pages/user/UserCenterPage.test.tsx src/pages/user/UserCenterFormalIntegration.test.ts src/i18n/translations.ts
git commit -m "feat: add inline user center editing"
```

---

### Task 6: Documentation, Regression Verification, and Live Acceptance

**Files:**
- Modify: `README.md`
- Modify: `docs/MOCK_RETIREMENT_MAP.md`
- Modify: `docs/superpowers/specs/2026-08-26-user-center-inline-edit-design.md`
- Test: all task-owned frontend/backend suites plus production checks.

**Interfaces:**
- Consumes: Tasks 1-5 complete implementation.
- Produces: current documentation and evidence that the formal `/me` flow persists across refresh without affecting other navigation.

- [ ] **Step 1: Update documentation with the final formal contract**

Replace the README statement that formal customer editing waits for a protected contract with the new `GET|PATCH /api/v1/customer-profile/me` behavior. Document the avatar storage environment variables, identity-derived scope, audit action `customer_profile.self_update`, and the `/me` navigation/edit-state behavior. Mark the user-center profile row in `MOCK_RETIREMENT_MAP.md` as formal read/write while keeping frontend-preview compatibility explicit.

- [ ] **Step 2: Run focused backend verification**

Run: `npm --prefix backend test -- --runInBand tests/customer-profile-validator.test.ts tests/customer-avatar-storage.test.ts tests/customer-profile.service.test.ts tests/customer-profile-api.test.ts tests/openapi.test.ts`

Expected: all listed suites PASS.

- [ ] **Step 3: Run focused frontend verification**

Run: `npm test -- src/features/core-read/customerProfileApi.test.ts src/pages/user/UserCenterPage.test.tsx src/pages/user/UserCenterFormalIntegration.test.ts`

Expected: all listed suites PASS.

- [ ] **Step 4: Run repository quality gates**

Run: `npm --prefix backend run lint`

Expected: PASS.

Run: `npm --prefix backend run build`

Expected: PASS.

Run: `npm run lint`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

Run: `npm run verify:production-build`

Expected: formal production build and bundle audit PASS.

- [ ] **Step 5: Apply and inspect the local migration**

Run: `ENV_FILE=.env.dev npm --prefix backend run prisma:status`

Expected: `20260826090000_customer_profile_self_edit` is applied or ready to apply, with no edited historical migration.

Run: `ENV_FILE=.env.dev npm --prefix backend run prisma:migrate:deploy`

Expected: migration applies successfully to the local non-production database.

- [ ] **Step 6: Perform actual `/me` acceptance in the local app**

Start/reuse `npm run dev`, sign in as a formal customer, and verify at the real mobile viewport:

1. `/me` view/loading/error states do not show the ordinary bottom navigation.
2. The card's edit button opens the existing card inline.
3. The top-right control becomes a red X and discards unsaved changes.
4. The fixed save action remains at the viewport bottom while scrolling and does not obscure the final field.
5. Invalid or failed saves retain the draft.
6. Successful save exits editing and updates the card.
7. A hard refresh preserves nickname, avatar, gender, age, height, languages, bio, and visibility.
8. Home, Moments, Messages, and Contacts retain their normal bottom navigation.

Capture the tested URL, account identity type, viewport, API response status, and result for each item; do not substitute build/test results for this live check.

- [ ] **Step 7: Check task scope and commit documentation**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: task files plus any pre-existing unrelated dirty files; no task-generated temporary avatar files are tracked.

```bash
git add README.md docs/MOCK_RETIREMENT_MAP.md docs/superpowers/specs/2026-08-26-user-center-inline-edit-design.md
git commit -m "docs: document formal customer profile editing"
```

Do not stage `.superpowers/sdd/task-1-report.md`, technician-ranking files, or any other pre-existing unrelated changes.
