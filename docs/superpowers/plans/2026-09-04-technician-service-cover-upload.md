# Technician Service Cover Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one persisted JPEG/PNG/WebP cover image to the existing technician service create/edit flow and display it through the shared `coverImageUrl` contract.

**Architecture:** Wrap the existing `ContentMediaFileStorage`, `MediaAsset`, and `PricingModeRepository` in a focused technician-service cover service. Expose authenticated PUT/DELETE cover subresources, then extend the existing pricing-mode frontend adapter and technician service editor; every read surface continues to use `TechnicianServicePayload.coverImageUrl` and `UnifiedServiceInfoCard`.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Express, Zod, Prisma/MySQL, Jest/Supertest, JWT/RBAC/audit infrastructure.

## Global Constraints

- Work only in `/Users/eason/Documents/New project/.worktrees/technician-profile-unification` on `codex/technician-profile-unification` until final integration.
- This is one Step 09 microstep. Do not change Booking, Order, Wallet, Schedule, IM, Social, pricing-mode rules, or technician ID formats.
- One service has one cover. Accepted MIME types are exactly `image/jpeg`, `image/png`, and `image/webp`; maximum size is exactly 8 MiB.
- Reuse `ContentMediaFileStorage`, `MediaAsset`, `TechnicianService.coverImageUrl`, and `technician:services:write`.
- Do not add a schema migration, mock API, base64 persistence, second service-card component, S3 integration, or gallery editor.
- Derive user, identity, and technician scope from the authenticated active identity. The request never accepts those actor identifiers.
- Create/update service text before the cover request. If the cover request fails, preserve the successful text record and present a retryable partial-success state.
- Add new copy to Simplified Chinese, Traditional Chinese, Japanese, English, and Korean translations.
- Preserve unrelated dirty files. Do not merge or push `main` during Tasks 1–5.

---

### Task 1: Transactional technician-service cover domain

**Files:**
- Create: `backend/src/services/technician-service-cover.service.ts`
- Create: `backend/tests/technician-service-cover.service.test.ts`
- Modify: `backend/src/services/pricing-mode.service.ts`
- Modify: `backend/src/repositories/pricing-mode.repository.ts`
- Modify: `backend/tests/pricing-mode-repository.test.ts`
- Modify: `backend/tests/pricing-mode-service.test.ts`

**Interfaces:**
- Consumes: `ContentMediaStoragePort`, `ContentMediaRepositoryPort.withChecksumLock`, `AuthenticatedAccessContext`, and the existing service-card projection.
- Produces: `TechnicianServiceCoverService.uploadCover`, `removeCover`, and four `PricingModeRepositoryPort` methods.
- Returns: the existing `TechnicianServicePayload`, never a parallel card DTO.

- [ ] **Step 1: Write failing service tests**

Create `backend/tests/technician-service-cover.service.test.ts` with typed repository, storage, and checksum-lock mocks. Use these core cases:

```ts
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb]);
const actor = {
  userId: 8,
  email: "technician@example.com",
  accessTokenJti: "jti",
  accessTokenExpiresAt: Date.now() + 60_000,
  currentIdentityId: 18,
  currentIdentityType: "technician",
  currentIdentityScopeType: "technician_profile",
  currentIdentityScopeId: 3,
  roles: ["technician"],
  permissions: ["technician:services:write"]
};
const context = { ip: "127.0.0.1", userAgent: "jest" };

it("uploads one owned service cover", async () => {
  const repository = createRepository();
  const storage = createStorage();
  const service = new TechnicianServiceCoverService(repository, storage, createChecksumLock());
  await expect(service.uploadCover(actor, context, 1, 11, {
    bytes: jpeg,
    mimeType: "image/jpeg",
    now: new Date("2026-09-04T00:00:00.000Z")
  })).resolves.toMatchObject({ id: 11, coverImageUrl: "/media/content/cover.jpg" });
  expect(repository.replaceTechnicianServiceCover).toHaveBeenCalledWith(
    expect.objectContaining({
      shopId: 1,
      technicianId: 3,
      serviceId: 11,
      ownerUserId: 8,
      ownerIdentityId: 18,
      fileSize: jpeg.length,
      action: "technician.service.cover.updated"
    })
  );
});

it("does not store bytes for an unowned service", async () => {
  const repository = createRepository({ coverTarget: null });
  const storage = createStorage();
  await expect(new TechnicianServiceCoverService(repository, storage, createChecksumLock())
    .uploadCover(actor, context, 1, 99, {
      bytes: jpeg,
      mimeType: "image/jpeg",
      now: new Date()
    })).rejects.toMatchObject({
      statusCode: 404,
      message: "error.technician_service.not_found"
    });
  expect(storage.save).not.toHaveBeenCalled();
});

it("keeps an exact cover retry idempotent", async () => {
  const repository = createRepository({ currentChecksum: "a".repeat(64) });
  const storage = createStorage({ checksumSha256: "a".repeat(64) });
  await new TechnicianServiceCoverService(repository, storage, createChecksumLock())
    .uploadCover(actor, context, 1, 11, {
      bytes: jpeg,
      mimeType: "image/jpeg",
      now: new Date()
    });
  expect(repository.replaceTechnicianServiceCover).not.toHaveBeenCalled();
});

it("removes an existing cover and treats no-cover removal as idempotent", async () => {
  const repository = createRepository();
  const service = new TechnicianServiceCoverService(repository, createStorage(), createChecksumLock());
  await expect(service.removeCover(actor, context, 1, 11, new Date())).resolves.toMatchObject({
    id: 11,
    coverImageUrl: null
  });
});

it("deletes only a newly-created unreferenced blob after persistence failure", async () => {
  const repository = createRepository();
  repository.replaceTechnicianServiceCover.mockRejectedValueOnce(new Error("database failed"));
  repository.hasActiveMediaUrl.mockResolvedValueOnce(false);
  const storage = createStorage({ created: true });
  await expect(new TechnicianServiceCoverService(repository, storage, createChecksumLock())
    .uploadCover(actor, context, 1, 11, {
      bytes: jpeg,
      mimeType: "image/jpeg",
      now: new Date()
    })).rejects.toThrow("database failed");
  expect(storage.delete).toHaveBeenCalledWith(expect.stringMatching(/\.jpg$/));
});
```

Also test invalid active identity, wrong shop affiliation, storage validation mapping, a referenced file that must not be deleted, and compensation-delete logging that preserves the original database error.

- [ ] **Step 2: Run service tests and verify RED**

Run:

```bash
npm --prefix backend test -- --runInBand tests/technician-service-cover.service.test.ts
```

Expected: FAIL because the cover service and repository methods do not exist.

- [ ] **Step 3: Define the repository contract**

Extend `PricingModeRepositoryPort` in `backend/src/services/pricing-mode.service.ts` with:

```ts
export interface TechnicianServiceCoverTarget {
  service: TechnicianServicePayload;
  activeMediaAssetId: number | null;
  checksumSha256: string | null;
  mimeType: string | null;
}

export interface TechnicianServiceCoverWriteInput {
  shopId: number;
  technicianId: number;
  serviceId: number;
  ownerUserId: number;
  ownerIdentityId: number;
  url: string;
  fileKey: string;
  mimeType: ContentMediaMimeType;
  checksumSha256: string;
  fileSize: number;
  now: Date;
  action: "technician.service.cover.updated";
  context: AuthRequestContext;
}

findTechnicianServiceCoverTarget(input: {
  shopId: number;
  technicianId: number;
  serviceId: number;
}): Promise<TechnicianServiceCoverTarget | null>;
replaceTechnicianServiceCover(input: TechnicianServiceCoverWriteInput): Promise<TechnicianServicePayload | null>;
removeTechnicianServiceCover(input: {
  shopId: number;
  technicianId: number;
  serviceId: number;
  ownerUserId: number;
  ownerIdentityId: number;
  now: Date;
  action: "technician.service.cover.removed";
  context: AuthRequestContext;
}): Promise<TechnicianServicePayload | null>;
hasActiveMediaUrl(url: string): Promise<boolean>;
```

Update all existing typed pricing-mode test repositories with these four methods so TypeScript cannot hide interface drift behind incomplete casts.

- [ ] **Step 4: Implement the cover service**

Create this public API:

```ts
export class TechnicianServiceCoverService {
  public constructor(
    private readonly repository: PricingModeRepositoryPort,
    private readonly storage: ContentMediaStoragePort,
    private readonly checksumLock: Pick<ContentMediaRepositoryPort, "withChecksumLock">
  ) {}

  public uploadCover(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    shopId: number,
    serviceId: number,
    input: { bytes: Buffer; mimeType: ContentMediaMimeType; now: Date }
  ): Promise<TechnicianServicePayload>;

  public removeCover(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    shopId: number,
    serviceId: number,
    now: Date
  ): Promise<TechnicianServicePayload>;
}
```

Use the exact identity guard:

```ts
if (
  actor.currentIdentityType !== "technician" ||
  actor.currentIdentityScopeType !== "technician_profile" ||
  !actor.currentIdentityScopeId ||
  !actor.currentIdentityId
) {
  throw new AppError({
    code: ERROR_CODES.IDENTITY_FORBIDDEN,
    message: "error.identity.forbidden",
    statusCode: 403
  });
}
```

Then verify `findTechnicianShopScope(scopeId).shopId === shopId` and call `findTechnicianServiceCoverTarget` before saving bytes. Prepare the checksum, enter `withChecksumLock`, return immediately for an exact checksum/MIME/URL retry, otherwise save and call `replaceTechnicianServiceCover`. On persistence failure, delete only when `stored.created` and `hasActiveMediaUrl(url)` is false. Map content-storage errors to `error.technician_service.cover_invalid` and `error.technician_service.cover_too_large`, preserving 400/413.

- [ ] **Step 5: Write and run failing repository transaction tests**

Add replacement/removal tests to `backend/tests/pricing-mode-repository.test.ts`. Assert one transaction performs:

```ts
expect(transaction.mediaAsset.updateMany).toHaveBeenCalledWith({
  where: {
    entityType: "technician_service",
    entityId: 11,
    usageType: "cover",
    isActive: true,
    deletedAt: null
  },
  data: { isActive: false, deletedAt: now }
});
expect(transaction.mediaAsset.create).toHaveBeenCalledWith({
  data: expect.objectContaining({
    entityType: "technician_service",
    entityId: 11,
    shopId: 1,
    technicianProfileId: 3,
    ownerUserId: 8,
    ownerIdentityId: 18,
    usageType: "cover",
    checksumSha256: "a".repeat(64),
    isActive: true
  })
});
expect(transaction.technicianService.update).toHaveBeenCalledWith({
  where: { id: 11 },
  data: { coverImageUrl: "/media/content/cover.jpg", updatedBy: 8 },
  include: expect.any(Object)
});
expect(transaction.auditLog.create).toHaveBeenCalledWith({
  data: expect.objectContaining({
    action: "technician.service.cover.updated",
    targetType: "technician_service",
    targetId: 11
  })
});
```

Removal soft-deletes the active cover rows, sets `coverImageUrl: null`, and writes `technician.service.cover.removed`. Cross-shop/cross-technician writes return `null` without media or audit mutations. `hasActiveMediaUrl` filters `isActive=true`, `deletedAt=null`, and `purgedAt=null`.

Run:

```bash
npm --prefix backend test -- --runInBand tests/pricing-mode-repository.test.ts
```

Expected before implementation: FAIL on missing methods.

- [ ] **Step 6: Implement repository methods**

Reuse `technicianServiceCardInclude` and `mapTechnicianService`. Both mutations lock and validate the service inside one Prisma transaction:

```ts
const locked = await transaction.$queryRaw<Array<{ id: number }>>(
  Prisma.sql`SELECT id FROM technician_services
    WHERE id = ${input.serviceId}
      AND shop_id = ${input.shopId}
      AND technician_id = ${input.technicianId}
      AND deleted_at IS NULL
    FOR UPDATE`
);
if (locked.length !== 1) return null;
```

Within that transaction, mutate `MediaAsset`, update `TechnicianService.coverImageUrl`, and write `toAuditLogCreateData(...)`. Do not update `imagesJson`. `findTechnicianServiceCoverTarget` returns only an active, non-deleted, non-purged `usageType=cover` media row for the owned service.

- [ ] **Step 7: Verify Task 1 GREEN and commit**

Run:

```bash
npm --prefix backend test -- --runInBand tests/technician-service-cover.service.test.ts tests/pricing-mode-repository.test.ts tests/pricing-mode-service.test.ts
```

Expected: all suites PASS.

Commit:

```bash
git add backend/src/services/technician-service-cover.service.ts backend/src/services/pricing-mode.service.ts backend/src/repositories/pricing-mode.repository.ts backend/tests/technician-service-cover.service.test.ts backend/tests/pricing-mode-repository.test.ts backend/tests/pricing-mode-service.test.ts
git commit -m "feat(technician): persist service cover media"
```

---

### Task 2: Authenticated raw-image routes and OpenAPI

**Files:**
- Create: `backend/src/controllers/technician-service-cover.controller.ts`
- Create: `backend/src/middlewares/content-image-upload.middleware.ts`
- Create: `backend/tests/content-image-upload.middleware.test.ts`
- Modify: `backend/src/routes/pricing-mode.routes.ts`
- Modify: `backend/src/routes/content-media.routes.ts`
- Modify: `backend/src/routes/social-media.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/pricing-mode-api.test.ts`
- Modify: `backend/tests/openapi.test.ts`

**Interfaces:**
- Consumes: Task 1 cover service, existing `technicianServiceIdParamSchema`, content storage/repository dependencies, and `technician:services:write`.
- Produces: PUT/DELETE `/api/v1/technicians/me/shops/{shopId}/services/{serviceId}/cover`.

- [ ] **Step 1: Write failing API and OpenAPI tests**

Extend `backend/tests/pricing-mode-api.test.ts` with injected storage/checksum-lock mocks and this authenticated flow:

```ts
const upload = await request(fixture.app)
  .put("/api/v1/technicians/me/shops/1/services/11/cover")
  .set("Authorization", `Bearer ${accessToken}`)
  .set("Content-Type", "image/jpeg")
  .send(Buffer.from([0xff, 0xd8, 0xff, 0xdb]))
  .expect(200);
expect(upload.body.data).toMatchObject({
  id: 11,
  coverImageUrl: "/media/content/cover.jpg"
});

await request(fixture.app)
  .delete("/api/v1/technicians/me/shops/1/services/11/cover")
  .set("Authorization", `Bearer ${accessToken}`)
  .expect(200);
```

Also assert 401 without a token, 403 without permission, 415 for `text/plain`, 400 for empty/invalid bytes, and 413 above 8 MiB. Storage/repository mocks must be untouched on auth or MIME rejection.

Add to `backend/tests/openapi.test.ts`:

```ts
const coverPath = response.body.paths[
  "/api/v1/technicians/me/shops/{shopId}/services/{serviceId}/cover"
];
expect(coverPath.put.requestBody.content).toEqual(expect.objectContaining({
  "image/jpeg": expect.any(Object),
  "image/png": expect.any(Object),
  "image/webp": expect.any(Object)
}));
expect(coverPath.put.responses["200"]).toBeDefined();
expect(coverPath.delete.responses["200"]).toBeDefined();
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm --prefix backend test -- --runInBand tests/pricing-mode-api.test.ts tests/openapi.test.ts
```

Expected: FAIL with 404 and missing OpenAPI path.

- [ ] **Step 3: Extract one shared image-body helper**

Create `backend/src/middlewares/content-image-upload.middleware.ts`:

```ts
export const CONTENT_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const createContentImageBodyParser = (): RequestHandler =>
  express.raw({ type: [...CONTENT_IMAGE_MIME_TYPES], limit: "8mb" });

export const createContentImageBodyErrorHandler = (messages: {
  invalid: string;
  tooLarge: string;
}): ErrorRequestHandler => (error, _request, _response, next) => {
  const status = readParserStatus(error);
  if (status === 413 || isEntityTooLarge(error)) {
    next(new AppError({
      code: ERROR_CODES.VALIDATION,
      message: messages.tooLarge,
      statusCode: 413,
      cause: error
    }));
    return;
  }
  if (!(error instanceof AppError) && status >= 400 && status < 500) {
    next(new AppError({
      code: ERROR_CODES.VALIDATION,
      message: messages.invalid,
      statusCode: status,
      cause: error
    }));
    return;
  }
  next(error);
};
```

Define `readParserStatus` and `isEntityTooLarge` in the same file using the current content/social route logic. Prove supplied 400/413 messages in `content-image-upload.middleware.test.ts`, then replace both duplicated legacy route blocks while preserving their current error keys.

- [ ] **Step 4: Add controller and routes**

Create `TechnicianServiceCoverController`. `upload` parses params, normalizes the header before any service call, rejects unsupported type with 415, rejects missing Buffer with 400, and calls:

```ts
await this.service.uploadCover(
  getAuthenticatedAccess(response),
  getRequestContext(request),
  shopId,
  serviceId,
  {
    bytes: request.body,
    mimeType: mimeType as ContentMediaMimeType,
    now: new Date()
  }
)
```

`remove` parses the same params and calls `removeCover(..., new Date())`.

In `createPricingModeRoutes`, instantiate one shared pricing repository, the existing content storage dependency, and the existing content-media checksum-lock repository. Register:

```ts
router.put(
  "/technicians/me/shops/:shopId/services/:serviceId/cover",
  authenticate(),
  authorize(PRICING_MODE_ROUTE_PERMISSIONS.technicianServicesWrite),
  validateRequest({ params: technicianServiceIdParamSchema }),
  createContentImageBodyParser(),
  createContentImageBodyErrorHandler({
    invalid: "error.technician_service.cover_invalid",
    tooLarge: "error.technician_service.cover_too_large"
  }),
  coverController.upload
);
```

Register DELETE with authenticate, the same permission, params validation, and `coverController.remove`; it has no body parser.

- [ ] **Step 5: Add OpenAPI binary contract**

Define one path object. Each PUT content entry uses:

```ts
schema: { type: "string", format: "binary", maxLength: 8 * 1024 * 1024 }
```

Reuse the `TechnicianService` success schema. PUT documents 200, 400, 401, 403, 404, 413, 415, and 500. DELETE documents 200, 401, 403, 404, and 500.

- [ ] **Step 6: Verify Task 2 GREEN and commit**

Run:

```bash
npm --prefix backend test -- --runInBand tests/content-image-upload.middleware.test.ts tests/pricing-mode-api.test.ts tests/openapi.test.ts
```

Locate existing media route tests with `rg --files backend/tests | rg '(content-media|social-media).*test'` and run every matching API suite. Expected: all selected suites PASS.

Commit:

```bash
git add backend/src/controllers/technician-service-cover.controller.ts backend/src/middlewares/content-image-upload.middleware.ts backend/src/routes/pricing-mode.routes.ts backend/src/routes/content-media.routes.ts backend/src/routes/social-media.routes.ts backend/src/api/openapi.ts backend/tests/content-image-upload.middleware.test.ts backend/tests/pricing-mode-api.test.ts backend/tests/openapi.test.ts
git commit -m "feat(technician): expose service cover endpoints"
```

---

### Task 3: Frontend binary cover adapter

**Files:**
- Modify: `src/features/pricing-mode/api.ts`
- Modify: `src/features/pricing-mode/api.test.ts`
- Modify: `src/api/httpClient.test.ts`

**Interfaces:**
- Consumes: Task 2 PUT/DELETE endpoints and existing Blob-aware `httpClient.request`.
- Produces: `uploadTechnicianServiceCover` and `removeTechnicianServiceCover`, both returning `TechnicianServicePayload`.

- [ ] **Step 1: Write failing adapter tests**

```ts
it("uploads a technician service cover as raw image bytes", async () => {
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "cover.jpg", {
    type: "image/jpeg"
  });
  vi.mocked(httpClient.request).mockResolvedValue(serviceFixture);
  await pricingModeApi.uploadTechnicianServiceCover(71, 901, file);
  expect(httpClient.request).toHaveBeenCalledWith(
    "/technicians/me/shops/71/services/901/cover",
    { body: file, headers: { "Content-Type": "image/jpeg" }, method: "PUT" }
  );
});

it("removes a technician service cover", async () => {
  vi.mocked(httpClient.request).mockResolvedValue({ ...serviceFixture, coverImageUrl: null });
  await pricingModeApi.removeTechnicianServiceCover(71, 901);
  expect(httpClient.request).toHaveBeenCalledWith(
    "/technicians/me/shops/71/services/901/cover",
    { method: "DELETE" }
  );
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- --run src/features/pricing-mode/api.test.ts src/api/httpClient.test.ts
```

Expected: FAIL because both methods are absent.

- [ ] **Step 3: Implement the two adapter methods**

```ts
uploadTechnicianServiceCover(shopId: number, serviceId: number, file: File) {
  return httpClient.request<TechnicianServicePayload>(
    `/technicians/me/shops/${shopId}/services/${serviceId}/cover`,
    { body: file, headers: { "Content-Type": file.type }, method: "PUT" }
  );
},

removeTechnicianServiceCover(shopId: number, serviceId: number) {
  return httpClient.request<TechnicianServicePayload>(
    `/technicians/me/shops/${shopId}/services/${serviceId}/cover`,
    { method: "DELETE" }
  );
},
```

Do not add base64 or a cover URL to the JSON body used by this UI.

- [ ] **Step 4: Verify GREEN and commit**

Run:

```bash
npm test -- --run src/features/pricing-mode/api.test.ts src/api/httpClient.test.ts
```

Expected: both suites PASS.

Commit:

```bash
git add src/features/pricing-mode/api.ts src/features/pricing-mode/api.test.ts src/api/httpClient.test.ts
git commit -m "feat(technician): add service cover client"
```

---

### Task 4: Single-cover editor and partial-success UX

**Files:**
- Create: `src/features/pricing-mode/TechnicianServiceCoverField.tsx`
- Create: `src/features/pricing-mode/TechnicianServiceCoverField.test.tsx`
- Modify: `src/pages/mobile/TechnicianPortalPage.tsx`
- Modify: `src/pages/mobile/TechnicianPortalPage.profile.render.test.tsx`
- Modify: `src/pages/mobile/TechnicianPortalPage.test.tsx`
- Modify: `src/i18n/translations.ts`
- Modify: `src/i18n/translations.test.ts`

**Interfaces:**
- Consumes: Task 3 methods, current `coverImageUrl`, and the existing editor `saving` state.
- Produces: one controlled field and retryable cover draft in `FormalTechnicianServicesPanel`.

- [ ] **Step 1: Write failing field tests**

In jsdom, prove valid preview/replacement, object-URL cleanup, removal intent, and exact local policy:

```tsx
it.each([
  [new File(["text"], "cover.txt", { type: "text/plain" }), "仅支持 JPEG、PNG 或 WebP 图片"],
  [new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" }), "图片不能超过 8 MiB"]
])("rejects an invalid file", async (file, message) => {
  const onValidationError = vi.fn();
  renderCoverField({ onValidationError });
  await selectFile(file);
  expect(onValidationError).toHaveBeenCalledWith(message);
});
```

Mock `URL.createObjectURL` and `URL.revokeObjectURL`; replacing or unmounting must revoke only object URLs created by the component. The component never uses `FileReader.readAsDataURL`.

- [ ] **Step 2: Write failing save-flow tests**

Extend `TechnicianPortalPage.profile.render.test.tsx` for new-with-cover, edit-replace, edit-remove, cancel-without-request, and partial success. The partial case must assert:

```ts
expect(screen.getByRole("alert").textContent).toContain(
  "服务已保存，封面上传失败，请重试"
);
expect(pricingModeApi.createTechnicianService).toHaveBeenCalledTimes(1);
expect(pricingModeApi.deleteTechnicianService).not.toHaveBeenCalled();
```

On retry, create/update remains at one call and only `uploadTechnicianServiceCover` runs again. Preserve existing up/down/edit and single shared service-card assertions.

- [ ] **Step 3: Verify RED**

Run:

```bash
npm test -- --run src/features/pricing-mode/TechnicianServiceCoverField.test.tsx src/pages/mobile/TechnicianPortalPage.profile.render.test.tsx src/pages/mobile/TechnicianPortalPage.test.tsx src/i18n/translations.test.ts
```

Expected: FAIL because the field and cover save stages are absent.

- [ ] **Step 4: Implement the controlled cover field**

```tsx
export const TECHNICIAN_SERVICE_COVER_MAX_BYTES = 8 * 1024 * 1024;
export const TECHNICIAN_SERVICE_COVER_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp"
] as const;

export interface TechnicianServiceCoverFieldProps {
  disabled: boolean;
  persistedUrl: string | null;
  selectedFile: File | null;
  removePersisted: boolean;
  onFileChange: (file: File | null) => void;
  onRemovePersisted: (remove: boolean) => void;
  onValidationError: (message: string) => void;
}
```

Render `selectedFile` using `URL.createObjectURL`; otherwise render `persistedUrl` unless `removePersisted`. Select uses `accept="image/jpeg,image/png,image/webp"`, validates exact MIME and size, clears removal intent, and reports exact local messages. Removal clears a selected file first or marks the persisted cover removed. Provide a “恢复当前封面” action when appropriate.

- [ ] **Step 5: Wire ordered save stages**

Add:

```ts
const [coverFile, setCoverFile] = useState<File | null>(null);
const [removeCover, setRemoveCover] = useState(false);
const [persistedAfterPartialSave, setPersistedAfterPartialSave] =
  useState<TechnicianServicePayload | null>(null);
```

Use a pure `upsertTechnicianService` helper. The save sequence is:

```ts
let saved = existing ?? persistedAfterPartialSave;
if (!persistedAfterPartialSave) {
  saved = existing
    ? await pricingModeApi.updateTechnicianService(existing.shopId, existing.id, body)
    : await pricingModeApi.createTechnicianService(targetShopId, {
        ...body,
        sortOrder: services.length
      });
  setServices((current) => upsertTechnicianService(current, saved));
}

try {
  if (coverFile) {
    saved = await pricingModeApi.uploadTechnicianServiceCover(saved.shopId, saved.id, coverFile);
  } else if (removeCover && saved.coverImageUrl) {
    saved = await pricingModeApi.removeTechnicianServiceCover(saved.shopId, saved.id);
  }
  setServices((current) => upsertTechnicianService(current, saved));
  closeAndResetServiceEditor();
} catch {
  setPersistedAfterPartialSave(saved);
  setEditingId(saved.id);
  setError("服务已保存，封面上传失败，请重试");
}
```

General text-save failures continue through `describeServiceError` and never enter partial success. Retry skips the successful create/update and retries only the cover operation. Render the field before service name. Disable file actions while saving; preserve quota, delete, reorder, and the action slot.

- [ ] **Step 6: Add five-language copy**

Add translation entries and direct assertions for:

```text
服务封面
上传服务封面
更换图片
移除图片
恢复当前封面
JPEG / PNG / WebP，最大 8 MiB
仅支持 JPEG、PNG 或 WebP 图片
图片不能超过 8 MiB
服务已保存，封面上传失败，请重试
封面上传失败，请重试
```

Each source key defines `zh-Hant`, `ja`, `en`, and `ko`.

- [ ] **Step 7: Verify GREEN and commit**

Run:

```bash
npm test -- --run src/features/pricing-mode/TechnicianServiceCoverField.test.tsx src/pages/mobile/TechnicianPortalPage.profile.render.test.tsx src/pages/mobile/TechnicianPortalPage.test.tsx src/features/pricing-mode/api.test.ts src/i18n/translations.test.ts
```

Expected: all selected suites PASS.

Commit:

```bash
git add src/features/pricing-mode/TechnicianServiceCoverField.tsx src/features/pricing-mode/TechnicianServiceCoverField.test.tsx src/pages/mobile/TechnicianPortalPage.tsx src/pages/mobile/TechnicianPortalPage.profile.render.test.tsx src/pages/mobile/TechnicianPortalPage.test.tsx src/i18n/translations.ts src/i18n/translations.test.ts
git commit -m "feat(technician): add service cover editor"
```

---

### Task 5: Documentation and full acceptance

**Files:**
- Modify: `docs/api.md`
- Modify: `docs/MOCK_RETIREMENT_MAP.md`
- Modify: `docs/superpowers/specs/2026-09-04-technician-service-cover-upload-design.md`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: documented contract, verified runtime, database/audit evidence, and a clean feature branch.

- [ ] **Step 1: Update formal documentation**

Add to `docs/api.md`:

```md
### Technician service cover

- `PUT /api/v1/technicians/me/shops/{shopId}/services/{serviceId}/cover`
  accepts one authenticated raw JPEG/PNG/WebP body up to 8 MiB and returns the
  updated `TechnicianService`.
- `DELETE /api/v1/technicians/me/shops/{shopId}/services/{serviceId}/cover`
  removes the current public cover association and returns the updated service.

Both routes require `technician:services:write`, derive actor scope from the
session, and persist `MediaAsset` plus audit evidence.
```

Update `docs/MOCK_RETIREMENT_MAP.md`: the editor uses the formal binary API, and all cards read `coverImageUrl`; no base64/localStorage/mock image record exists. Change the design spec status to complete only after Steps 2–5 pass.

- [ ] **Step 2: Run complete automated verification**

```bash
npm --prefix backend test -- --runInBand tests/technician-service-cover.service.test.ts tests/pricing-mode-repository.test.ts tests/pricing-mode-service.test.ts tests/content-image-upload.middleware.test.ts tests/pricing-mode-api.test.ts tests/openapi.test.ts
npm --prefix backend run lint
npm --prefix backend run build
npm test -- --run src/features/pricing-mode/TechnicianServiceCoverField.test.tsx src/features/pricing-mode/api.test.ts src/api/httpClient.test.ts src/pages/mobile/TechnicianPortalPage.profile.render.test.tsx src/pages/mobile/TechnicianPortalPage.test.tsx src/shared/service-card src/i18n/translations.test.ts
npm run lint
npm run build
```

Expected: every command exits 0. Record existing Vite chunk-size warnings separately.

- [ ] **Step 3: Prove runtime ownership**

For frontend and backend listeners, record PID, cwd, branch, command, and proxy target. Use the formal backend and this worktree frontend. Verify:

```bash
curl -s http://127.0.0.1:3000/api/v1/health
curl -s http://127.0.0.1:3000/api/v1/ready
```

If occupied ports belong to another branch, use explicit alternate ports and report them; do not replace a deployment/main runtime.

- [ ] **Step 4: Perform authenticated browser persistence acceptance**

Using an existing formal technician test account:

1. Open `/technician.html#/technician/me?meTab=info` on the proven feature frontend.
2. Verify the cover entry, accepted-format text, preview, replace, and remove controls.
3. Select a repository image under 8 MiB and create a uniquely named acceptance service.
4. Refresh and verify the same `/media/content/...` cover in the shared card.
5. Replace, refresh, and verify only the replacement is active.
6. Remove, refresh, and verify the honest no-cover state.
7. Verify up/down/edit still work and restore the service order.
8. Open the public technician detail and verify it reads the same cover while present.
9. Verify mobile width has no horizontal overflow and the console has no new error.

An alternate-port result does not prove the standard 5180 runtime.

- [ ] **Step 5: Verify and clean formal acceptance data**

Using only the captured service ID, verify API/MySQL evidence:

```text
technician_services.cover_image_url matches the last action
media_assets entity_type = technician_service
media_assets entity_id = captured service ID
one active usage_type = cover row while a cover exists
replaced/removed rows have is_active = 0 and deleted_at IS NOT NULL
audit_logs includes technician.service.cover.updated and technician.service.cover.removed
```

Delete the uniquely named acceptance service through the authenticated service DELETE API and confirm soft deletion. Do not run broad SQL deletes or alter pre-existing services.

- [ ] **Step 6: Commit docs and verify a clean branch**

```bash
git add docs/api.md docs/MOCK_RETIREMENT_MAP.md docs/superpowers/specs/2026-09-04-technician-service-cover-upload-design.md
git commit -m "docs(technician): record service cover contract"
git status --short --branch
git log -5 --oneline --decorate
```

Expected: clean `codex/technician-profile-unification`. Report cover upload complete while keeping ID-format unification and `main` integration pending.

---

## Plan Self-Review

- Spec coverage: Tasks 1–2 cover storage, ownership, RBAC, Zod params, OpenAPI, transaction, audit, retry, removal, and compensation. Tasks 3–4 cover binary transport, preview/replace/remove, partial success, i18n, and shared-card reuse. Task 5 covers documentation, tests, runtime ownership, browser persistence, database evidence, and cleanup.
- Scope coverage: no schema migration, gallery, object storage, base64, second service card, technician-ID change, or `main` mutation is included.
- Type consistency: every backend and frontend cover mutation returns the existing `TechnicianServicePayload`; actor and service IDs use current repository names.
- Placeholder scan: the plan contains no deferred implementation marker or unspecified error-handling step.
