# Exchange Demand Cover Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one optional immutable 16:9 cover image to Exchange demands, use a shared five-language editor and default cover, and prove the persisted like/comment/share chain end to end.

**Architecture:** Reuse the existing content-image storage and `ImageAdjustmentEditor`, but add an Exchange-specific pending-upload boundary and an optional `ExchangeDemand.coverMediaAssetId` relation. Publication validates exact identity ownership and binds the media inside the existing idempotent post transaction; feed/detail projections resolve one demand-cover contract and never fall back to a publisher avatar.

**Tech Stack:** React 19, TypeScript strict, Vite 7, Tailwind, Vitest; Node.js 22+, Express, Zod, Prisma 7/MySQL, Jest/Supertest, existing content-media file storage.

## Global Constraints

- A demand accepts zero or one JPEG, PNG, or WebP image.
- The shared editor crops to exactly `16 / 9`; the published image is immutable.
- `zh`, `zh-Hant`, `ja`, `en`, and `ko` reuse one component, one draft field, one upload state, and one media record.
- Missing media, including historical rows, resolves to one locale-neutral repository-owned default cover.
- Publisher avatars are never used as demand covers.
- Do not add a post-publication image update, replacement, removal, or rebind route.
- Preserve the existing Exchange publication fee, wallet, matching, booking, identity, authorization, idempotency, audit, and transaction boundaries.
- Add a new migration; do not edit an applied migration.
- Follow red-green-refactor for every behavior change and commit only task-scoped files.

## File Structure

- `backend/prisma/schema.prisma`: optional persisted relation from `ExchangeDemand` to `MediaAsset`.
- `backend/prisma/migrations/20260923120000_exchange_demand_cover_image/migration.sql`: forward-only schema change.
- `backend/src/validators/exchange.validators.ts`: upload query and publication checksum contract.
- `backend/src/services/content-media.service.ts`: extend the existing shared upload scope for Exchange demand covers.
- `backend/src/repositories/content-media.repository.ts`: persist the new scope through the existing checksum lock, media row, and audit flow.
- `backend/src/services/exchange.service.ts`: authorize the active customer identity and delegate cover upload to the shared media service.
- `backend/src/controllers/exchange.controller.ts`: expose the binary upload adapter on the existing Exchange controller.
- `backend/src/routes/exchange.routes.ts`: protected `/exchange/demand-cover` upload route.
- `backend/src/repositories/exchange.repository.ts`: bind cover in publication and project cover data.
- `backend/src/services/exchange.service.ts`: carry the optional cover public ID through validation and publication.
- `backend/src/api/openapi.ts`: document upload and demand cover contracts.
- `public/images/exchange-demand-default-cover.svg`: shared locale-neutral fallback asset.
- `src/features/exchange/DemandCoverField.tsx`: the only demand-cover editor/upload component used in all locales.
- `src/features/exchange/exchange-composer-model.ts`: shared draft and normalized payload field.
- `src/features/exchange/ExchangeComposer.tsx`: mount the shared field and gate publication until upload completion.
- `src/features/exchange/ExchangePublicationReview.tsx`: show the exact 16:9 cover preview.
- `src/features/exchange/api.ts`: upload function and expanded publication contract.
- `src/features/exchange/types.ts`: cover projection and upload response types.
- `src/features/exchange/i18n.ts`: five-language labels and errors.
- `src/components/mobile/OfferInfoCard.tsx`: explicit wide-cover rendering mode.
- `src/features/exchange/ExchangeFeedPage.tsx`: pass demand cover rather than publisher avatar.
- `src/features/exchange/ExchangePostDetailPage.tsx`: render the same demand cover projection.
- Related frontend/backend test files listed in each task below.

---

### Task 1: Persist the optional immutable demand-cover relation

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260923120000_exchange_demand_cover_image/migration.sql`
- Test: `backend/tests/exchange-demand-cover-schema.test.ts`

**Interfaces:**
- Produces: `ExchangeDemand.coverMediaAssetId: number | null` and `ExchangeDemand.coverMediaAsset: MediaAsset | null`.
- Produces: reverse relation `MediaAsset.exchangeDemandCover: ExchangeDemand | null`.

- [ ] **Step 1: Write the failing schema test**

```ts
import { readFileSync } from "node:fs";

describe("Exchange demand cover schema", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const migration = readFileSync(
    "prisma/migrations/20260923120000_exchange_demand_cover_image/migration.sql",
    "utf8"
  );

  it("adds one optional restrictive cover relation without changing historical rows", () => {
    expect(schema).toMatch(/coverMediaAssetId\s+Int\?\s+@unique/);
    expect(schema).toMatch(/coverMediaAsset\s+MediaAsset\?[^\n]*onDelete: Restrict/);
    expect(schema).toMatch(/exchangeDemandCover\s+ExchangeDemand\?/);
    expect(migration).toContain("ADD COLUMN `cover_media_asset_id` INTEGER NULL");
    expect(migration).toContain("ON DELETE RESTRICT ON UPDATE CASCADE");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/exchange-demand-cover-schema.test.ts`

Expected: FAIL because the migration file and Prisma relation do not exist.

- [ ] **Step 3: Add the relation and migration**

Add to `ExchangeDemand`:

```prisma
coverMediaAssetId Int?        @unique @map("cover_media_asset_id")
coverMediaAsset   MediaAsset? @relation("ExchangeDemandCover", fields: [coverMediaAssetId], references: [id], onDelete: Restrict, onUpdate: Cascade)
```

Add to `MediaAsset`:

```prisma
exchangeDemandCover ExchangeDemand? @relation("ExchangeDemandCover")
```

Migration body:

```sql
ALTER TABLE `exchange_demands`
  ADD COLUMN `cover_media_asset_id` INTEGER NULL;

CREATE UNIQUE INDEX `exchange_demands_cover_media_asset_id_key`
  ON `exchange_demands`(`cover_media_asset_id`);

ALTER TABLE `exchange_demands`
  ADD CONSTRAINT `exchange_demands_cover_media_asset_id_fkey`
  FOREIGN KEY (`cover_media_asset_id`) REFERENCES `media_assets`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 4: Verify schema and generated client**

Run:

```bash
npm --prefix backend test -- --runTestsByPath tests/exchange-demand-cover-schema.test.ts
npm --prefix backend run prisma:generate
npm --prefix backend run build
```

Expected: schema test PASS, Prisma generation exit 0, backend build exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260923120000_exchange_demand_cover_image/migration.sql backend/tests/exchange-demand-cover-schema.test.ts
git commit -m "feat: persist Exchange demand cover media"
```

### Task 2: Add the protected pending-cover upload boundary

**Files:**
- Modify: `backend/src/services/content-media.service.ts`
- Modify: `backend/src/repositories/content-media.repository.ts`
- Modify: `backend/src/services/exchange.service.ts`
- Modify: `backend/src/controllers/exchange.controller.ts`
- Modify: `backend/src/validators/exchange.validators.ts`
- Modify: `backend/src/routes/exchange.routes.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/content-media.service.test.ts`
- Test: `backend/tests/exchange.service.test.ts`
- Test: `backend/tests/exchange.routes.test.ts`

**Interfaces:**
- Produces: `POST /api/v1/exchange/demand-cover` with raw JPEG/PNG/WebP body.
- Produces: `ExchangeDemandCoverUpload = { publicId: string; url: string; mimeType: "image/jpeg" | "image/png" | "image/webp"; width: number; height: number }`.
- Extends: the existing `UploadContentMediaScope` with one `exchange_demand_cover_pending` variant; no parallel upload repository, storage class, checksum lock, or media record is introduced.
- Produces: exact-owner pending-media resolution inside `ExchangePostRepository.createPost` for Task 3.

- [ ] **Step 1: Write failing shared-media and Exchange service tests**

```ts
it("stores an Exchange cover through the shared content-media pipeline", async () => {
  storage.prepare.mockResolvedValue({
    fileKey: "aa.webp",
    checksumSha256: "a".repeat(64),
    mimeType: "image/webp",
    width: 1280,
    height: 720
  });
  storage.save.mockResolvedValue({
    fileKey: "aa.webp",
    checksumSha256: "a".repeat(64),
    mimeType: "image/webp",
    width: 1280,
    height: 720,
    created: true
  });
  locked.create.mockResolvedValue({
    publicId: "a".repeat(64),
    mediaAssetId: 81,
    url: "/media/content/aa.webp",
    mimeType: "image/webp",
    width: 1280,
    height: 720,
    checksumSha256: "a".repeat(64)
  });

  await expect(service.upload(actor, context, input, {
    entityType: "exchange_demand_cover_pending",
    entityId: actor.identityId,
    ownerIdentityId: actor.identityId,
    usageType: "exchange_demand_cover_pending"
  })).resolves.toMatchObject({ publicId: "a".repeat(64), width: 1280, height: 720 });

  expect(locked.create).toHaveBeenCalledWith(expect.objectContaining({
    ownerUserId: actor.userId,
    ownerIdentityId: actor.identityId,
    entityType: "exchange_demand_cover_pending",
    usageType: "exchange_demand_cover_pending"
  }));
});
```

Add an Exchange service test asserting only the active `customer` identity can invoke the shared upload and that the service supplies the exact user/identity scope. Also assert dimensions outside 16:9, invalid MIME, corrupt bytes, and over-limit bodies return stable Exchange errors without creating a media row.

- [ ] **Step 2: Run service tests and verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/content-media.service.test.ts tests/exchange.service.test.ts`

Expected: FAIL because the shared upload scope and Exchange upload method do not exist.

- [ ] **Step 3: Extend the shared upload service and repository**

Add one union variant to `UploadContentMediaScope`:

```ts
export type UploadContentMediaScope =
  | ExistingShopPresentationScope
  | {
      entityType: "exchange_demand_cover_pending";
      entityId: number;
      ownerIdentityId: number;
      usageType: "exchange_demand_cover_pending";
    };
```

Extend the existing repository input unions and audit selection with the same scope. Keep `ContentMediaRepository.withChecksumLock`, `ContentMediaFileStorage.prepare/save/delete`, and `MediaAsset` as the only implementation. For the Exchange scope, use the existing `social` validation profile, then reject unless the decoded dimensions are 16:9 within one output pixel before `save` and `locked.create`.

The resulting existing repository create call must persist:

```ts
{
  entityType: "exchange_demand_cover_pending",
  entityId: actor.identityId,
  ownerUserId: actor.userId,
  ownerIdentityId: actor.identityId,
  usageType: "exchange_demand_cover_pending"
}
```

The shared repository writes audit action `exchange.demand_cover.uploaded`. Add `ExchangeService.uploadDemandCover` to enforce the active customer identity and delegate to the injected `ContentMediaService`; do not add an Exchange-specific file storage, checksum lock, or media repository.

- [ ] **Step 4: Write failing route tests**

```ts
await request(app)
  .post("/api/v1/exchange/demand-cover")
  .set(auth)
  .set("Content-Type", "image/webp")
  .send(Buffer.from("valid-image"))
  .expect(201)
  .expect(({ body }) => expect(body.data.publicId).toMatch(/^[a-f0-9]{64}$/u));
```

Assert missing auth is 401, missing `exchange:posts:create-demand` is 403, and JSON bodies are rejected.

- [ ] **Step 5: Wire the controller and route, then verify GREEN**

Route shape:

```ts
router.post(
  "/exchange/demand-cover",
  authenticate(),
  createAuthorizeMiddleware("exchange:posts:create-demand"),
  createContentImageBodyParser(),
  createContentImageBodyErrorHandler({
    invalid: "error.exchange.demand_cover_invalid",
    tooLarge: "error.exchange.demand_cover_too_large"
  }),
  controller.uploadDemandCover
);
```

Construct or reuse the same `ContentMediaService` dependency already used by content publication and shop presentation, inject it into `ExchangeService`, and have `ExchangeController.uploadDemandCover` pass the authenticated access, request context, raw bytes, declared MIME, and optional alt text.

Run:

```bash
npm --prefix backend test -- --runTestsByPath tests/content-media.service.test.ts tests/exchange.service.test.ts tests/exchange.routes.test.ts
npm --prefix backend run build
```

Expected: all three suites PASS and build exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/content-media.service.ts backend/src/repositories/content-media.repository.ts backend/src/services/exchange.service.ts backend/src/controllers/exchange.controller.ts backend/src/validators/exchange.validators.ts backend/src/routes/exchange.routes.ts backend/src/app.ts backend/tests/content-media.service.test.ts backend/tests/exchange.service.test.ts backend/tests/exchange.routes.test.ts
git commit -m "feat: upload pending Exchange demand covers"
```

### Task 3: Bind the cover atomically and project one immutable contract

**Files:**
- Modify: `backend/src/domain/exchange.ts` if present, otherwise the Exchange input types in `backend/src/services/exchange.service.ts`
- Modify: `backend/src/validators/exchange.validators.ts`
- Modify: `backend/src/services/exchange.service.ts`
- Modify: `backend/src/repositories/exchange.repository.ts`
- Modify: `backend/src/api/openapi.ts`
- Test: `backend/tests/exchange.repository.test.ts`
- Test: `backend/tests/exchange.service.test.ts`
- Test: `backend/tests/exchange.routes.test.ts`
- Test: `backend/tests/exchange.openapi.test.ts`

**Interfaces:**
- Consumes: `coverMediaAssetPublicId?: string` and the shared pending `MediaAsset` scope from Task 2.
- Produces: `ExchangeDemandPayload.cover = { url: string; isDefault: boolean }`.
- Produces: null database relation projected as `{ url: "/images/exchange-demand-default-cover.svg", isDefault: true }`.

- [ ] **Step 1: Write failing validator/service tests**

```ts
expect(publishExchangePostSchema.parse({
  ...validDemandBody,
  coverMediaAssetPublicId: "a".repeat(64)
})).toMatchObject({ coverMediaAssetPublicId: "a".repeat(64) });

expect(() => publishExchangePostSchema.parse({
  ...validIntelligenceBody,
  coverMediaAssetPublicId: "a".repeat(64)
})).toThrow();
```

Assert the payload fingerprint changes when only the cover checksum changes and an idempotency key cannot replay with another cover.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/exchange.service.test.ts tests/exchange.repository.test.ts`

Expected: FAIL because the input and projection do not contain cover media.

- [ ] **Step 3: Implement atomic binding in `createPost`**

Before post creation, resolve the optional pending cover from `transaction.mediaAsset` by checksum, `entityType`, `usageType`, active/not-deleted state, and exact actor user/identity. Reject a missing or non-owned checksum with `error.exchange.demand_cover_not_owned`.

Create the demand with:

```ts
demand: {
  create: {
    ...demandData,
    coverMediaAssetId: coverMediaAsset?.id ?? null
  }
}
```

When a cover is present, update the same `MediaAsset` row in the transaction:

```ts
await transaction.mediaAsset.update({
  where: { id: coverMediaAsset.id },
  data: {
    entityType: "exchange_demand",
    entityId: created.demand!.id,
    purgeAt: null,
    updatedAt: input.now
  }
});
```

All post list/detail selects must include `demand.coverMediaAsset.url`; the mapper returns:

```ts
cover: row.demand.coverMediaAsset
  ? { url: row.demand.coverMediaAsset.url, isDefault: false }
  : { url: "/images/exchange-demand-default-cover.svg", isDefault: true }
```

- [ ] **Step 4: Add immutability and identity tests**

Cover repository tests must assert:

```ts
expect(mediaResolution).toHaveBeenCalledWith(expect.objectContaining({
  ownerUserId: actor.userId,
  ownerIdentityId: actor.identityId,
  publicId: "a".repeat(64)
}));
expect(exchangeDemandCreate.coverMediaAssetId).toBe(81);
expect(projected.demand?.cover).toEqual({ url: "/media/content/exchange/aa.webp", isDefault: false });
expect(historical.demand?.cover).toEqual({ url: "/images/exchange-demand-default-cover.svg", isDefault: true });
```

Search routes and assert no `PATCH`, `PUT`, or delete route targets a published demand cover.

- [ ] **Step 5: Update OpenAPI and run the contract suites**

Document the upload binary content types, `coverMediaAssetPublicId`, and response `demand.cover` object.

Run:

```bash
npm --prefix backend test -- --runTestsByPath tests/exchange.repository.test.ts tests/exchange.service.test.ts tests/exchange.routes.test.ts tests/exchange.openapi.test.ts
npm --prefix backend run build
```

Expected: four suites PASS and backend build exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/src/validators/exchange.validators.ts backend/src/services/exchange.service.ts backend/src/repositories/exchange.repository.ts backend/src/api/openapi.ts backend/tests/exchange.repository.test.ts backend/tests/exchange.service.test.ts backend/tests/exchange.routes.test.ts backend/tests/exchange.openapi.test.ts
git commit -m "feat: bind immutable Exchange demand covers"
```

### Task 4: Build one shared five-language demand-cover editor

**Files:**
- Create: `src/features/exchange/DemandCoverField.tsx`
- Create: `src/features/exchange/DemandCoverField.test.tsx`
- Modify: `src/features/exchange/api.ts`
- Modify: `src/features/exchange/api.test.ts`
- Modify: `src/features/exchange/types.ts`
- Modify: `src/features/exchange/exchange-composer-model.ts`
- Modify: `src/features/exchange/ExchangeComposer.tsx`
- Modify: `src/features/exchange/ExchangeComposer.test.tsx`
- Modify: `src/features/exchange/ExchangePublicationReview.tsx`
- Modify: `src/features/exchange/i18n.ts`

**Interfaces:**
- Consumes: `POST /exchange/demand-cover` and `ExchangeDemandCoverUpload` from Task 2.
- Produces: `RequestComposerDraft.cover` with one shared state object.
- Produces: optional `PublishDemandInput.coverMediaAssetPublicId` from a completed upload only.

- [ ] **Step 1: Write the failing five-locale component test**

```ts
it.each(["zh", "zh-Hant", "ja", "en", "ko"] as const)(
  "uses the shared cover field in %s without duplicating uploads",
  async (language) => {
    const { container, rerender } = renderCoverField(language);
    expect(container.querySelectorAll('[data-testid="exchange-demand-cover-field"]')).toHaveLength(1);
    await chooseAndApplyImage(container, file);
    await waitFor(() => expect(uploadExchangeDemandCover).toHaveBeenCalledTimes(1));
    rerender(renderCoverField(language === "zh" ? "ja" : "zh"));
    expect(container.querySelector('img[src="/media/content/exchange/aa.webp"]')).not.toBeNull();
    expect(uploadExchangeDemandCover).toHaveBeenCalledTimes(1);
  }
);
```

Also test replace, remove, retry, abort on replacement, and the 16:9 editor props.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- src/features/exchange/DemandCoverField.test.tsx`

Expected: FAIL because `DemandCoverField` does not exist.

- [ ] **Step 3: Implement the upload API and shared field**

API:

```ts
export function uploadExchangeDemandCover(file: Blob, signal?: AbortSignal) {
  return httpClient.request<ExchangeDemandCoverUpload>("/exchange/demand-cover", {
    body: file,
    headers: { "Content-Type": file.type },
    method: "POST",
    signal
  });
}
```

Shared draft shape:

```ts
export type DemandCoverDraft = {
  previewUrl: string;
  publicId: string | null;
  status: "ready" | "uploading" | "failed";
  uploadedUrl: string | null;
};
```

Mount exactly one `ImageAdjustmentEditor` with:

```tsx
<ImageAdjustmentEditor
  aspectRatio={16 / 9}
  outputMimeType="image/webp"
  outputQuality={0.84}
  outputWidth={1280}
  onApply={uploadCroppedCover}
  onCancel={closeEditor}
  source={sourceUrl}
  title={t("demandCoverEdit")}
/>
```

The component owns upload cancellation and object-URL cleanup, but its current `DemandCoverDraft | null` value lives in `ExchangeComposer`, so language rerenders do not reset it.

- [ ] **Step 4: Write failing composer normalization tests**

```ts
expect(normalizeRequestDraft({ ...validDraft, cover: null }, context)).toMatchObject({
  ok: true,
  value: { coverMediaAssetPublicId: undefined }
});

expect(normalizeRequestDraft({
  ...validDraft,
  cover: { previewUrl: "blob:x", publicId: null, status: "uploading", uploadedUrl: null }
}, context)).toEqual({ ok: false, errorKey: "demandCoverUploading" });
```

- [ ] **Step 5: Integrate edit/review/publish and verify GREEN**

The review receives one optional image URL and renders:

```tsx
{coverUrl ? (
  <img
    alt={t("demandCoverPreviewAlt")}
    className="aspect-video w-full rounded-2xl object-cover"
    src={coverUrl}
  />
) : null}
```

Run:

```bash
npm test -- src/features/exchange/DemandCoverField.test.tsx src/features/exchange/ExchangeComposer.test.tsx src/features/exchange/api.test.ts
npm run build
```

Expected: three test files PASS and frontend build exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/exchange/DemandCoverField.tsx src/features/exchange/DemandCoverField.test.tsx src/features/exchange/api.ts src/features/exchange/api.test.ts src/features/exchange/types.ts src/features/exchange/exchange-composer-model.ts src/features/exchange/ExchangeComposer.tsx src/features/exchange/ExchangeComposer.test.tsx src/features/exchange/ExchangePublicationReview.tsx src/features/exchange/i18n.ts
git commit -m "feat: add shared Exchange demand cover editor"
```

### Task 5: Render the same 16:9 demand cover in feed and detail

**Files:**
- Create: `public/images/exchange-demand-default-cover.svg`
- Modify: `src/components/mobile/OfferInfoCard.tsx`
- Modify: `src/features/exchange/ExchangeFeedPage.tsx`
- Modify: `src/features/exchange/ExchangePostDetailPage.tsx`
- Modify: `src/features/exchange/types.ts`
- Test: `src/features/exchange/ExchangeFeedPage.test.tsx`
- Test: `src/features/exchange/ExchangePostDetailPage.test.tsx`
- Test: `src/components/mobile/OfferInfoCard.test.tsx`

**Interfaces:**
- Consumes: `post.demand.cover.url` from Task 3.
- Produces: `OfferInfoCard.imageLayout = "thumbnail" | "wide"` with `wide` using a full-width 16:9 frame.

- [ ] **Step 1: Write failing presentation tests**

```ts
expect(renderFeed({ posts: [demandWithCover] })).toContain(
  'src="/media/content/exchange/aa.webp"'
);
expect(renderFeed({ posts: [demandWithoutCover] })).toContain(
  'src="/images/exchange-demand-default-cover.svg"'
);
expect(renderFeed({ posts: [demandWithCover] })).not.toContain(
  demandWithCover.publisher!.avatarUrl!
);
expect(renderFeed({ posts: [demandWithCover] })).toContain('data-image-layout="wide"');
```

Detail tests assert the same URL and `aspect-video object-cover` classes.

- [ ] **Step 2: Run presentation tests and verify RED**

Run:

```bash
npm test -- src/components/mobile/OfferInfoCard.test.tsx src/features/exchange/ExchangeFeedPage.test.tsx src/features/exchange/ExchangePostDetailPage.test.tsx
```

Expected: FAIL because the feed still uses `publisher.avatarUrl` and the card has no wide mode.

- [ ] **Step 3: Add the locale-neutral default SVG**

Use a 1600×900 `viewBox`, existing NeeDo green tokens, simple service/image shapes, and no text so the same asset is valid in all five languages. The SVG must contain no scripts, external references, embedded credentials, or locale-specific copy.

- [ ] **Step 4: Implement the explicit wide image layout**

Add to `OfferInfoCard`:

```ts
imageLayout?: "thumbnail" | "wide";
```

For `wide`, render before the title grid:

```tsx
<div className="relative aspect-video w-full overflow-hidden rounded-[22px]" data-image-layout="wide">
  <img alt={imageAlt} className="h-full w-full object-cover" src={image} />
  {imageLabel ? <span className={labelClassName}>{imageLabel}</span> : null}
</div>
```

Keep the existing thumbnail branch unchanged for non-demand consumers.

Feed wiring:

```tsx
image={post.demand?.cover.url}
imageAlt={post.title}
imageLabel={t("demand")}
imageLayout="wide"
```

Remove `fallbackPublisherImage` and demand `publisherName` usage from the feed. Use the same `post.demand.cover.url` in detail.

- [ ] **Step 5: Verify GREEN and surrounding regressions**

Run:

```bash
npm test -- src/components/mobile/OfferInfoCard.test.tsx src/features/exchange/ExchangeFeedPage.test.tsx src/features/exchange/ExchangePostDetailPage.test.tsx src/features/exchange/ExchangeInteractions.test.tsx
npm run build
```

Expected: four test files PASS and frontend build exit 0.

- [ ] **Step 6: Commit**

```bash
git add public/images/exchange-demand-default-cover.svg src/components/mobile/OfferInfoCard.tsx src/components/mobile/OfferInfoCard.test.tsx src/features/exchange/ExchangeFeedPage.tsx src/features/exchange/ExchangeFeedPage.test.tsx src/features/exchange/ExchangePostDetailPage.tsx src/features/exchange/ExchangePostDetailPage.test.tsx src/features/exchange/types.ts
git commit -m "feat: show wide images on Exchange demands"
```

### Task 6: Prove like, comment, and share persistence in automated tests

**Files:**
- Modify: `src/features/exchange/ExchangeFeedPage.test.tsx`
- Modify: `src/features/exchange/ExchangeInteractions.test.tsx`
- Modify: `backend/tests/exchange.repository.test.ts`
- Modify: `backend/tests/exchange.service.test.ts`
- Modify: `backend/tests/exchange.routes.test.ts`

**Interfaces:**
- Consumes: existing `PUT|DELETE /exchange/posts/:id/like`, `GET|POST /exchange/posts/:id/comments`, and `POST /exchange/posts/:id/shares`.
- Produces: regression proof that every card uses the shared action bar and returned persisted counts.

- [ ] **Step 1: Write failing frontend persistence-contract tests**

```ts
it("applies server counts only after a successful like and share", async () => {
  likeExchangePost.mockResolvedValue({ comments: 6, likes: 30, shares: 6 });
  recordExchangeShare.mockResolvedValue({ comments: 6, likes: 30, shares: 7 });
  shareContent.mockResolvedValue({ status: "copied" });

  await clickCardAction("like");
  expect(replaceCounts).toHaveBeenCalledWith(13, { comments: 6, likes: 30, shares: 6 }, { liked: true });

  await clickCardAction("share");
  expect(replaceCounts).toHaveBeenCalledWith(13, { comments: 6, likes: 30, shares: 7 }, { liked: true });
});

it("does not record a cancelled share", async () => {
  shareContent.mockResolvedValue({ status: "cancelled" });
  await clickCardAction("share");
  expect(recordExchangeShare).not.toHaveBeenCalled();
});
```

Assert the comment action navigates to the matching detail route and the detail composer prepends the returned persisted comment, then reloads from `listExchangeComments`.

- [ ] **Step 2: Run frontend tests and verify any missing behavior fails**

Run: `npm test -- src/features/exchange/ExchangeFeedPage.test.tsx src/features/exchange/ExchangeInteractions.test.tsx`

Expected: new assertions fail until any missing callback/state behavior is implemented; if they pass immediately, retain them as explicit regression coverage and do not alter production code unnecessarily.

- [ ] **Step 3: Add backend atomic-count and idempotency tests**

```ts
await expect(repository.setLike(likeInput)).resolves.toEqual({
  kind: "success",
  value: { comments: 6, likes: 30, shares: 6 }
});
await expect(repository.createComment(commentInput)).resolves.toMatchObject({
  kind: "success",
  value: { author: { publicId: "s2433935375", identityType: "technician" } }
});
await expect(repository.recordShare(shareInput)).resolves.toEqual({
  kind: "success",
  value: { comments: 7, likes: 30, shares: 7 }
});
```

Repeat each idempotency key and assert one persisted record and unchanged counts. Assert the same account's different identity cannot reuse another identity's like state.

- [ ] **Step 4: Run the complete focused Exchange suite**

Run:

```bash
npm --prefix backend test -- --runTestsByPath tests/exchange.repository.test.ts tests/exchange.service.test.ts tests/exchange.routes.test.ts tests/exchange.openapi.test.ts
npm test -- src/features/exchange/api.test.ts src/features/exchange/ExchangeFeedPage.test.tsx src/features/exchange/ExchangePostDetailPage.test.tsx src/features/exchange/ExchangeInteractions.test.tsx src/features/exchange/ExchangeComposer.test.tsx src/features/exchange/DemandCoverField.test.tsx
```

Expected: all focused suites PASS with zero failed assertions.

- [ ] **Step 5: Commit**

```bash
git add src/features/exchange/ExchangeFeedPage.test.tsx src/features/exchange/ExchangeInteractions.test.tsx backend/tests/exchange.repository.test.ts backend/tests/exchange.service.test.ts backend/tests/exchange.routes.test.ts
git commit -m "test: prove Exchange demand interactions persist"
```

### Task 7: Verify final main runtime, browser behavior, and database evidence

**Files:**
- Modify only if a directly related failure requires a tested fix.
- Evidence target: local command output and browser/database observations; do not add credentials or tokens to tracked files.

**Interfaces:**
- Consumes: final integrated code from Tasks 1–6.
- Produces: acceptance evidence separated into code/tests, runtime, browser, database, push, deployment, and device status.

- [ ] **Step 1: Verify clean integrated state and listeners**

Run:

```bash
git status --short --branch
git log --oneline -8
lsof -nP -iTCP:5180 -sTCP:LISTEN
lsof -nP -iTCP:3000 -sTCP:LISTEN
curl -fsS http://127.0.0.1:3000/api/v1/health
curl -fsS http://127.0.0.1:3000/api/v1/ready
```

Expected: worktree clean, listeners owned by this worktree, health `ok`, readiness `ready` with database and Redis `ok`.

- [ ] **Step 2: Apply the new migration to the guarded local database**

Require the worktree-local ignored backend environment file and reject any non-local database target without printing credentials, then run:

```bash
test -f backend/.env.dev
node --input-type=module -e 'import { readFileSync } from "node:fs"; import { parse } from "./backend/node_modules/dotenv/lib/main.js"; const value=parse(readFileSync("backend/.env.dev")).DATABASE_URL; if (!value) throw new Error("DATABASE_URL missing"); const target=new URL(value); if (!["127.0.0.1","localhost"].includes(target.hostname)) throw new Error("database must be local"); console.log(`local database target verified: ${target.hostname}:${target.port || "3306"}/${target.pathname.slice(1)}`);'
ENV_FILE=.env.dev npm --prefix backend run prisma:migrate:deploy
```

Expected: only the new migration is applied and the command exits 0. The resolved path must point to a local non-production database; if that cannot be proven, stop and report the migration gate as blocked.

- [ ] **Step 3: Run final automated gates**

Run:

```bash
npm run lint
npm test -- src/features/exchange/api.test.ts src/features/exchange/ExchangeFeedPage.test.tsx src/features/exchange/ExchangePostDetailPage.test.tsx src/features/exchange/ExchangeInteractions.test.tsx src/features/exchange/ExchangeComposer.test.tsx src/features/exchange/DemandCoverField.test.tsx
npm run build
npm --prefix backend run lint
npm --prefix backend test -- --runTestsByPath tests/exchange-demand-cover-schema.test.ts tests/content-media.service.test.ts tests/exchange.repository.test.ts tests/exchange.service.test.ts tests/exchange.routes.test.ts tests/exchange.openapi.test.ts
npm --prefix backend run build
```

Expected: every command exits 0.

- [ ] **Step 4: Browser acceptance for image upload and fallback**

Use the formal login UI and identity switch UI. In each of the five application languages, open the same shared demand composer and verify the same cover field appears. Upload and crop a local non-sensitive test image in one language, switch language, and confirm the same preview remains without a second upload.

Publish one demand with the cropped image and one without an image. Verify feed and detail show respectively the uploaded image and `/images/exchange-demand-default-cover.svg` in 16:9 frames, and neither uses the publisher avatar. Reload both pages and repeat the assertions. Confirm no published image edit control exists.

- [ ] **Step 5: Browser/API/database acceptance for interactions**

On one retained local test demand:

1. Record baseline counts from `GET /api/v1/exchange/posts/:id` and matching database rows.
2. Click like; assert UI `+1`, reload persistence, one active identity-scoped like row, then unlike and verify restoration.
3. Click comment to open detail; submit `Exchange interaction acceptance 2026-09-23 120000`, reload, and assert exact content, active identity public ID, display name, and identity-specific avatar in UI/API/database.
4. Trigger share/clipboard fallback; assert the share endpoint is called only after success, UI `+1`, reload persistence, and one idempotent share row/audit.
5. Do not directly delete the comment or share record. Report their IDs as retained local test evidence.

- [ ] **Step 6: Review final diff and report boundaries**

Run:

```bash
git status --short --branch
git diff --check
git log --oneline --decorate -12
```

Report separately:

- local code and tests;
- local migration state;
- 5180/3000 runtime evidence;
- browser and database acceptance;
- installed PWA/device status;
- origin push status;
- staging/deployment status;
- whether the task is safe to archive.
