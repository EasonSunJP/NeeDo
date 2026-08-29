# NeeDo User Home Multilingual Carousel Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current single Service carousel release with one non-clickable NeeDo welcome slide and four real Shop slides while adding per-locale image overrides to the formal carousel publication system.

**Architecture:** Keep `CarouselSlide.mediaAssetId` as the required default image, add an optional localized media relation on each `CarouselSlideTranslation`, and add an explicit `NONE` target valid only for `USER_HOME`. The backoffice editor writes localized copy and optional localized media through the existing RBAC, idempotency, optimistic-lock, MediaAsset, audit, preview, and publication lifecycle; the public projection returns only the requested locale and its resolved image.

**Tech Stack:** Node.js 22, Express, TypeScript strict, Prisma/MySQL, Zod, Jest, React, Vite, Vitest, existing content-publication APIs, existing `FeatureCarousel`, SVG plus FFmpeg for the language-neutral welcome raster.

## Global Constraints

- Execute only this content-publication micro-step; do not refactor unrelated NeeDo modules.
- Preserve the existing React/TSX/Vite frontend and Express/Prisma backend layering.
- Do not modify already-applied migrations; create `20260829213000_carousel_locale_media_none_target`.
- Do not add mock/demo/fake APIs, browser-local business state, direct SQL publication, or unaudited content mutation.
- All formal mutations must continue through `/api/v1`, Zod, RBAC, Service, Repository, Prisma, idempotency, optimistic locking, and AuditLog.
- `none` is valid only for `USER_HOME`; `AFFILIATE_HOME_NOTICE` must reject it.
- The public API must expose Shop public identifiers, never numeric Shop IDs.
- The five content locales remain exactly `zh-CN`, `zh-TW`, `en`, `ja`, and `ko`.
- A slide always has one default image; each locale may optionally override it with another formal `MediaAsset`.
- Welcome is slide 1, has `target: { type: "none" }`, `ctaLabel: null`, and no link.
- Slides 2–5 target, in order, 麻布十番超级按摩, Roppongi Recovery Lounge, Daikanyama Skin & Lash, and Aoyama Care Studio.
- Preserve unrelated dirty worktree changes, including the existing Home avatar fix and any other user-owned file changes.
- Do not push, deploy, or publish outside the local formal environment.

---

## File Map

- `backend/prisma/schema.prisma`: canonical `NONE` target and localized translation-media relation.
- `backend/prisma/migrations/20260829213000_carousel_locale_media_none_target/migration.sql`: forward-only enum/column/index/FK migration.
- `backend/src/validators/content-publication.validator.ts`: strict per-scene target and localized media input validation.
- `backend/src/services/carousel-publication.service.ts`: shared carousel target/media contracts and scene policy.
- `backend/src/repositories/carousel-publication.repository.ts`: media authorization, persistence, cloning, validation, and locale projection.
- `backend/src/api/openapi.ts`: exact request/response schemas for the extended contract.
- `src/api/contentPublication.ts`: frontend backoffice/public TypeScript contract.
- `src/features/content-publication/LocalizedCarouselEditor.tsx`: default image, locale image override, and no-target editing.
- `src/features/content-publication/i18n.ts`: five-language editor labels for the added controls.
- `src/features/content-publication/PublishedCarousel.tsx`: map `none` to an unlinked slide.
- `public/images/carousel/needo-welcome-v1.svg`: editable, language-neutral NeeDo brand source.
- `public/images/carousel/needo-welcome-v1.png`: accepted formal upload asset.
- `docs/localized-carousel-publication.md`: final contract, migration, verification, publication, and browser evidence.
- `docs/MOCK_RETIREMENT_MAP.md`: record that the populated carousel remains formally published and shared by Home/Social.

---

### Task 1: Add the forward-only schema foundation

**Files:**
- Create: `backend/prisma/migrations/20260829213000_carousel_locale_media_none_target/migration.sql`
- Create: `backend/tests/carousel-locale-media-schema.test.ts`
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Consumes: existing `CarouselTargetType`, `CarouselSlide`, `CarouselSlideTranslation`, and `MediaAsset` models.
- Produces: Prisma enum member `CarouselTargetType.NONE`, `CarouselSlideTranslation.mediaAssetId: number | null`, `CarouselSlideTranslation.mediaAsset`, and `MediaAsset.carouselSlideTranslations`.

- [ ] **Step 1: Write the failing schema/migration test**

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("carousel localized media and none target schema", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260829213000_carousel_locale_media_none_target/migration.sql"
  );
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

  it("adds an explicit none target without rewriting the original carousel migration", () => {
    expect(schema).toMatch(/enum CarouselTargetType[\s\S]*NONE\s+@map\("none"\)/);
    expect(migration).toContain("ALTER TABLE `carousel_slides` MODIFY `target_type` ENUM('shop', 'technician', 'service', 'affiliate_announcement', 'none') NOT NULL");
  });

  it("links optional translation media with a restrictive foreign key and index", () => {
    expect(schema).toMatch(/model CarouselSlideTranslation[\s\S]*mediaAssetId\s+Int\?\s+@map\("media_asset_id"\)/);
    expect(schema).toMatch(/mediaAsset\s+MediaAsset\?[^\n]*onDelete: Restrict/);
    expect(schema).toMatch(/@@index\(\[mediaAssetId\]\)/);
    expect(migration).toContain("ADD COLUMN `media_asset_id` INTEGER NULL");
    expect(migration).toContain("carousel_slide_translations_media_asset_id_idx");
    expect(migration).toContain("carousel_slide_translations_media_asset_id_fkey");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/carousel-locale-media-schema.test.ts`

Expected: FAIL because `NONE`, `mediaAssetId`, and the new migration do not exist.

- [ ] **Step 3: Add the minimal Prisma model changes**

```prisma
enum CarouselTargetType {
  SHOP                   @map("shop")
  TECHNICIAN             @map("technician")
  SERVICE                @map("service")
  AFFILIATE_ANNOUNCEMENT @map("affiliate_announcement")
  NONE                   @map("none")

  @@map("carousel_target_type")
}

```

Insert this relation field inside the current `MediaAsset` model, next to `carouselSlides`:

```prisma
carouselSlideTranslations CarouselSlideTranslation[] @relation("CarouselSlideTranslationMedia")
```

Insert these fields and index inside the current `CarouselSlideTranslation` model without removing its current fields, relations, unique constraint, or locale/deleted index:

```prisma
mediaAssetId Int? @map("media_asset_id")

mediaAsset MediaAsset? @relation("CarouselSlideTranslationMedia", fields: [mediaAssetId], references: [id], onDelete: Restrict)

@@index([mediaAssetId])
```

- [ ] **Step 4: Create the forward-only SQL migration**

```sql
ALTER TABLE `carousel_slides`
  MODIFY `target_type` ENUM('shop', 'technician', 'service', 'affiliate_announcement', 'none') NOT NULL;

ALTER TABLE `carousel_slide_translations`
  ADD COLUMN `media_asset_id` INTEGER NULL;

CREATE INDEX `carousel_slide_translations_media_asset_id_idx`
  ON `carousel_slide_translations`(`media_asset_id`);

ALTER TABLE `carousel_slide_translations`
  ADD CONSTRAINT `carousel_slide_translations_media_asset_id_fkey`
  FOREIGN KEY (`media_asset_id`) REFERENCES `media_assets`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 5: Generate Prisma Client and verify GREEN**

Run:

```bash
npm --prefix backend run prisma:generate
npm --prefix backend test -- --runInBand tests/carousel-locale-media-schema.test.ts tests/localized-carousel-schema.test.ts
```

Expected: both suites PASS and Prisma generation exits 0.

- [ ] **Step 6: Commit the schema slice**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260829213000_carousel_locale_media_none_target/migration.sql backend/tests/carousel-locale-media-schema.test.ts
git commit -m "feat: add localized carousel media schema"
```

---

### Task 2: Extend strict validators and Service contracts

**Files:**
- Modify: `backend/src/validators/content-publication.validator.ts`
- Modify: `backend/src/services/carousel-publication.service.ts`
- Modify: `backend/tests/content-publication-validator.test.ts`
- Modify: `backend/tests/carousel-publication.service.test.ts`

**Interfaces:**
- Consumes: Task 1 `CarouselTargetType.NONE` and translation-media column.
- Produces: `CarouselTargetInput | CarouselTarget | PublishedCarouselTarget` member `{ type: "none" }`; `CarouselTranslationInput.mediaAssetPublicId: string | null`; `CarouselTranslationPayload.imageUrl: string`; slide field `defaultMediaAssetPublicId`.

- [ ] **Step 1: Add failing validator tests**

```ts
it("accepts none only for user-home and normalizes an omitted locale image to null", () => {
  const parsed = userHomeCarouselDraftCreateBodySchema.parse({
    idempotencyKey,
    sourceLocale: "ja",
    slides: [{
      ...userSlide,
      defaultMediaAssetPublicId: mediaAssetPublicId,
      target: { type: "none" },
      translations: [{ ...translation, ctaLabel: null }]
    }]
  });
  expect(parsed.slides[0]?.target).toEqual({ type: "none" });
  expect(parsed.slides[0]?.translations[0]?.mediaAssetPublicId).toBeNull();

  expect(affiliateNoticeCarouselDraftCreateBodySchema.safeParse({
    idempotencyKey,
    sourceLocale: "ja",
    slides: [{
      ...affiliateSlide,
      defaultMediaAssetPublicId: mediaAssetPublicId,
      target: { type: "none" }
    }]
  }).success).toBe(false);
});

it("accepts a per-locale media checksum and rejects invalid checksums", () => {
  expect(translationBodySchema.parse({
    ...translation,
    mediaAssetPublicId: "b".repeat(64)
  }).mediaAssetPublicId).toBe("b".repeat(64));
  expect(translationBodySchema.safeParse({
    ...translation,
    mediaAssetPublicId: "not-a-checksum"
  }).success).toBe(false);
});
```

- [ ] **Step 2: Add failing Service scene-policy tests**

```ts
it("allows a non-clickable USER_HOME slide and rejects it in Affiliate notice", () => {
  expect(() => service.assertTarget("USER_HOME", { type: "none" })).not.toThrow();
  expect(() => service.assertTarget("AFFILIATE_HOME_NOTICE", { type: "none" })).toThrow(
    "error.carousel.target_invalid"
  );
});
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
npm --prefix backend test -- --runInBand tests/content-publication-validator.test.ts tests/carousel-publication.service.test.ts
```

Expected: FAIL because `none`, `defaultMediaAssetPublicId`, and localized media are absent.

- [ ] **Step 4: Implement strict input and output contracts**

```ts
const mediaPublicIdSchema = z.string().regex(/^[a-f0-9]{64}$/, "error.content.media_invalid");

const userTargetSchema = z.union([
  z.object({ type: z.literal("none") }).strict(),
  z.object({ type: z.literal("shop"), shopId: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("shop"), publicId: z.string().regex(/^shop[0-9]{10}$/u) }).strict(),
  z
    .object({
      type: z.literal("technician"),
      technicianProfileId: z.number().int().positive()
    })
    .strict(),
  z.object({ type: z.literal("technician"), publicId: z.string().regex(/^s[0-9]{10}$/u) }).strict(),
  z.object({ type: z.literal("service"), serviceId: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("service"), publicId: z.string().uuid() }).strict()
]);

export const translationBodySchema = z.object({
  locale: localeSchema,
  mediaAssetPublicId: mediaPublicIdSchema.nullable().optional().default(null),
  badge: z.string().trim().max(40).nullable(),
  title: z.string().trim().min(1).max(160),
  caption: z.string().trim().max(500).nullable(),
  ctaLabel: z.string().trim().max(60).nullable(),
  imageAltText: z.string().trim().min(1).max(255)
}).strict();

const slideBaseShape = {
  publicId: z.string().uuid().optional(),
  defaultMediaAssetPublicId: mediaPublicIdSchema,
  sortOrder: z.number().int().nonnegative(),
  isEnabled: z.boolean().default(true),
  visibleFrom: nullableUtcDateTimeSchema,
  visibleUntil: nullableUtcDateTimeSchema
};
```

```ts
export type CarouselTarget =
  | { type: "none" }
  | { type: "shop"; shopId: number }
  | { type: "technician"; technicianProfileId: number }
  | { type: "service"; serviceId: number }
  | {
      type: "affiliate_announcement";
      announcementPublicId: string;
      affiliateTaskId: number | null;
    };

export type PublishedCarouselTarget =
  | { type: "none" }
  | { type: "shop"; publicId: string }
  | { type: "technician"; publicId: string }
  | { type: "service"; publicId: string }
  | { type: "affiliate_announcement"; publicId: string };

export interface CarouselTranslationInput {
  mediaAssetPublicId: string | null;
  badge: string | null;
  title: string;
  caption: string | null;
  ctaLabel: string | null;
  imageAltText: string;
}

export interface CarouselTranslationPayload extends CarouselTranslationInput {
  imageUrl: string;
  sourceLocale: ContentLocaleCode;
  isInitialCopy: boolean;
}
```

Update `assertTarget` so `USER_HOME` accepts `none`, Shop, Technician, and Service, while Affiliate accepts only `affiliate_announcement`. In `normalizeSlides`, reject a `none` slide whose `ctaLabel` is non-null in any locale with `error.carousel.target_invalid`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm --prefix backend test -- --runInBand tests/content-publication-validator.test.ts tests/carousel-publication.service.test.ts`

Expected: both suites PASS.

- [ ] **Step 6: Commit the contract slice**

```bash
git add backend/src/validators/content-publication.validator.ts backend/src/services/carousel-publication.service.ts backend/tests/content-publication-validator.test.ts backend/tests/carousel-publication.service.test.ts
git commit -m "feat: extend carousel locale media contracts"
```

---

### Task 3: Persist and resolve localized media and none targets

**Files:**
- Modify: `backend/src/repositories/carousel-publication.repository.ts`
- Modify: `backend/tests/carousel-publication.repository.test.ts`
- Modify: `backend/tests/carousel-publication.repository.integration.test.ts`

**Interfaces:**
- Consumes: Task 2 `defaultMediaAssetPublicId`, translation `mediaAssetPublicId`, and `{ type: "none" }`.
- Produces: locale output resolution `translation.mediaAsset ?? slide.mediaAsset`, validated `NONE` persistence with all domain FKs null, cloning/rollback preservation of localized media.

- [ ] **Step 1: Extend the local MySQL integration fixture and write RED assertions**

Tighten `assertSafeDatabase` so this write-capable suite accepts only the dedicated database name:

```ts
if (
  url.protocol !== "mysql:" ||
  !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) ||
  database !== "needo_test"
) {
  throw new Error("Carousel integration requires the local needo_test database");
}
```

Add a second formal media asset owned by the test actor and use it only for `ja`:

```ts
const localizedMediaPublicId = fingerprint("media-ja");
const localizedMedia = await prisma.mediaAsset.create({
  data: {
    entityType: "content_publication_upload",
    entityId: actorUserId,
    ownerUserId: actorUserId,
    url: `/media/content/${localizedMediaPublicId}.png`,
    mimeType: "image/png",
    usageType: "content_publication_public",
    isActive: true,
    checksumSha256: localizedMediaPublicId
  }
});
extraMediaAssetIds.push(localizedMedia.id);
```

Create a `none` slide whose Japanese translation has the checksum and assert the stored/public projections:

```ts
expect(draft.slides[0]).toMatchObject({
  target: { type: "none" },
  defaultMediaAssetPublicId: fingerprint("media")
});
expect(draft.slides[0]?.translations.ja).toMatchObject({
  mediaAssetPublicId: localizedMediaPublicId,
  imageUrl: `/media/content/${localizedMediaPublicId}.png`
});
expect(draft.slides[0]?.translations.en).toMatchObject({
  mediaAssetPublicId: null,
  imageUrl: `/media/content/${fingerprint("media")}.png`
});

const japanese = await repository.findPublishedScene("USER_HOME", "ja", actor(), new Date());
const english = await repository.findPublishedScene("USER_HOME", "en", actor(), new Date());
expect(japanese.slides[0]?.imageUrl).toBe(`/media/content/${localizedMediaPublicId}.png`);
expect(english.slides[0]?.imageUrl).toBe(`/media/content/${fingerprint("media")}.png`);
expect(japanese.slides[0]?.target).toEqual({ type: "none" });
```

- [ ] **Step 2: Run the enabled integration test and verify RED**

Run only against a dedicated, empty local `needo_test` database configured by an ignored `backend/.env.carousel-test` file. The guard in the test must continue rejecting remote hosts, production runtime markers, any database name other than `needo_test`, and any populated `USER_HOME` scene. Never point this command at `.env.dev` or `needo_dev`.

Run:

```bash
RUN_CAROUSEL_PUBLICATION_INTEGRATION=true ENV_FILE=.env.carousel-test npm --prefix backend test -- --runInBand tests/carousel-publication.repository.integration.test.ts
```

Expected: FAIL because translation media and `none` cannot be resolved or persisted.

- [ ] **Step 3: Include localized media in release records and resolved slides**

```ts
const releaseInclude = {
  slides: {
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" as const },
    include: {
      mediaAsset: true,
      shop: { include: { publicIdentifier: true } },
      technicianProfile: {
        include: {
          user: {
            include: {
              identities: {
                where: { type: "technician", isActive: true, deletedAt: null },
                include: { publicIdentifier: true },
                take: 1
              }
            }
          }
        }
      },
      service: { include: { shop: true } },
      announcement: true,
      affiliateTask: true,
      translations: {
        where: { deletedAt: null },
        orderBy: { id: "asc" as const },
        include: { mediaAsset: true }
      }
    }
  }
} satisfies Prisma.CarouselReleaseInclude;

type ResolvedCarouselSlide = Omit<StoredCarouselSlide, "target"> & {
  defaultMediaAssetId: number;
  localizedMediaAssetIds: Record<ContentLocaleCode, number | null>;
  target: CarouselTarget;
};
```

Extract one helper that applies the existing ownership/authorization policy to both default and localized checksums:

```ts
private async resolveContentMedia(
  transaction: Prisma.TransactionClient,
  checksumSha256: string,
  actorUserId: number,
  authorizedMediaAssetIds: ReadonlySet<number>
): Promise<number> {
  const media = await transaction.mediaAsset.findFirst({
    where: {
      checksumSha256,
      entityType: "content_publication_upload",
      usageType: "content_publication_public",
      isActive: true,
      purgedAt: null,
      deletedAt: null,
      ...(authorizedMediaAssetIds.size > 0
        ? { OR: [{ ownerUserId: actorUserId }, { id: { in: [...authorizedMediaAssetIds] } }] }
        : { ownerUserId: actorUserId })
    },
    select: { id: true },
    orderBy: { id: "desc" }
  });
  if (!media) throw this.contentError("error.content.media_invalid", 409);
  return media.id;
}
```

- [ ] **Step 4: Persist and map localized media and none**

Implement these exact rules:

```ts
if (scene === "USER_HOME" && target.type === "none") return { type: "none" };
```

```ts
if (slide.targetType === CarouselTargetType.NONE) return { type: "none" };
```

```ts
const targetType =
  slide.target.type === "none"
    ? CarouselTargetType.NONE
    : slide.target.type === "shop"
      ? CarouselTargetType.SHOP
      : slide.target.type === "technician"
        ? CarouselTargetType.TECHNICIAN
        : slide.target.type === "service"
          ? CarouselTargetType.SERVICE
          : CarouselTargetType.AFFILIATE_ANNOUNCEMENT;
```

For `none`, set `shopId`, `technicianProfileId`, `serviceId`, `announcementId`, and `affiliateTaskId` to `null`. When creating translations, set `mediaAssetId` from `localizedMediaAssetIds[locale]`. When mapping translation payloads, emit:

```ts
mediaAssetPublicId: translation.mediaAsset?.checksumSha256 ?? null,
imageUrl: translation.mediaAsset?.url ?? slide.mediaAsset.url
```

During publish validation, validate the default media and every non-null localized media with `mediaAvailable`. `publicTarget` returns `{ type: "none" }` only when `targetType === NONE` and all five domain FKs are null.

- [ ] **Step 5: Prove rollback cloning preserves overrides**

Extend the integration lifecycle: publish the localized draft, clone it through `cloneForRollback`, then assert the cloned Japanese translation still references the Japanese MediaAsset and English still resolves to default.

- [ ] **Step 6: Run repository tests and verify GREEN**

Run:

```bash
npm --prefix backend test -- --runInBand tests/carousel-publication.repository.test.ts
RUN_CAROUSEL_PUBLICATION_INTEGRATION=true ENV_FILE=.env.carousel-test npm --prefix backend test -- --runInBand tests/carousel-publication.repository.integration.test.ts
```

Expected: unit and enabled local-MySQL integration suites PASS with cleanup residue 0.

- [ ] **Step 7: Commit the repository slice**

```bash
git add backend/src/repositories/carousel-publication.repository.ts backend/tests/carousel-publication.repository.test.ts backend/tests/carousel-publication.repository.integration.test.ts
git commit -m "feat: persist localized carousel media"
```

---

### Task 4: Align API, OpenAPI, and frontend contracts

**Files:**
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/content-publication-api.test.ts`
- Modify: `backend/tests/openapi.test.ts`
- Modify: `src/api/contentPublication.ts`
- Modify: `src/api/contentPublication.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3 backend payload contract.
- Produces: one exact typed contract used by the backoffice editor and public carousel.

- [ ] **Step 1: Add failing API/OpenAPI assertions**

```ts
expect(publicPayload.slides[0]).toMatchObject({
  imageUrl: "/media/content/ja.png",
  target: { type: "none" }
});
```

```ts
expect(openapi.components.schemas.CarouselTranslation.properties).toMatchObject({
  mediaAssetPublicId: { type: "string", nullable: true, pattern: "^[a-f0-9]{64}$" },
  imageUrl: { type: "string", format: "uri-reference" }
});
expect(openapi.components.schemas.UserHomeCarouselTarget.oneOf).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ properties: { type: { const: "none" } } })
  ])
);
```

- [ ] **Step 2: Run contract tests and verify RED**

Run:

```bash
npm --prefix backend test -- --runInBand tests/content-publication-api.test.ts tests/openapi.test.ts
npm test -- src/api/contentPublication.test.ts
```

Expected: FAIL on missing localized image and `none` schemas.

- [ ] **Step 3: Update frontend types**

```ts
export type PublishedCarouselTarget =
  | { type: "none" }
  | { type: "shop"; publicId: string }
  | { type: "technician"; publicId: string }
  | { type: "service"; publicId: string }
  | { type: "affiliate_announcement"; publicId: string };

export type CarouselTranslationInput = {
  locale: ContentLocaleCode;
  mediaAssetPublicId: string | null;
  badge: string | null;
  title: string;
  caption: string | null;
  ctaLabel: string | null;
  imageAltText: string;
};

export type CarouselTranslation = Omit<CarouselTranslationInput, "locale"> & {
  imageUrl: string;
  sourceLocale: ContentLocaleCode;
  isInitialCopy: boolean;
};

export type UserHomeCarouselTargetInput =
  | { type: "none" }
  | { type: "shop"; shopId: number }
  | { type: "shop"; publicId: string }
  | { type: "technician"; technicianProfileId: number }
  | { type: "technician"; publicId: string }
  | { type: "service"; serviceId: number }
  | { type: "service"; publicId: string };
```

Change `CarouselDraftSlideInput.mediaAssetPublicId` to `defaultMediaAssetPublicId`; change `CarouselReleaseSlide` root fields to `defaultMediaAssetPublicId` and `defaultImageUrl`; keep resolved `imageUrl` inside every translation.

- [ ] **Step 4: Update OpenAPI and API fixtures**

Document the strict scene-specific unions, nullable localized checksum, resolved localized `imageUrl`, and root default media fields. Do not add `none` to Affiliate target schemas or target-search query enums.

- [ ] **Step 5: Run contract tests and verify GREEN**

Run:

```bash
npm --prefix backend test -- --runInBand tests/content-publication-api.test.ts tests/openapi.test.ts
npm test -- src/api/contentPublication.test.ts
```

Expected: all three test files PASS.

- [ ] **Step 6: Commit the API slice**

```bash
git add backend/src/api/openapi.ts backend/tests/content-publication-api.test.ts backend/tests/openapi.test.ts src/api/contentPublication.ts src/api/contentPublication.test.ts
git commit -m "feat: expose localized carousel images"
```

---

### Task 5: Add localized media and no-target controls to the backoffice editor

**Files:**
- Modify: `src/features/content-publication/LocalizedCarouselEditor.tsx`
- Modify: `src/features/content-publication/LocalizedCarouselEditor.test.tsx`
- Modify: `src/features/content-publication/i18n.ts`

**Interfaces:**
- Consumes: Task 4 frontend contract and existing content media upload API.
- Produces: default upload, locale override upload/clear, resolved preview, and `none` target controls.

- [ ] **Step 1: Add failing editor tests**

Extend test fixtures so each translation has `mediaAssetPublicId` and `imageUrl`, then add:

```tsx
it("uploads and clears only the selected locale image override", async () => {
  await renderEditor();
  await selectLocale("ja");
  await uploadFileByLabel("当前语言图片", new File(["ja"], "ja.png", { type: "image/png" }));

  expect(apiMocks.uploadContentImage).toHaveBeenCalledWith(expect.any(File), "画像説明");
  expect(container.querySelector('img[src="/media/uploaded.webp"]')).not.toBeNull();

  await clickButton("使用默认图片");
  await clickButton("保存草稿");
  const body = apiMocks.updateCarouselSlideLocale.mock.calls.at(-1)?.[4];
  expect(body.mediaAssetPublicId).toBeNull();
  expect(container.querySelector('img[src="/media/a.webp"]')).not.toBeNull();
});

it("creates a non-clickable user-home slide without target search or CTA", async () => {
  await renderEditor();
  await selectOptionByName("targetType", "none");
  expect(container.querySelector('input[name="targetQuery"]')).toBeNull();
  expect(container.querySelector('input[name="ctaLabel"]')).toBeNull();
  await clickButton("保存草稿");
  expect(apiMocks.replaceCarouselDraft.mock.calls.at(-1)?.[2].slides[0].target).toEqual({
    type: "none"
  });
});
```

Use the test file's existing `act`, render, upload, and wait helpers; add the named helper functions once at the top of the file so both new cases use real DOM events rather than implementation mocks.

- [ ] **Step 2: Run editor tests and verify RED**

Run: `npm test -- src/features/content-publication/LocalizedCarouselEditor.test.tsx`

Expected: FAIL because the locale upload/clear and `none` controls do not exist.

- [ ] **Step 3: Make translation media part of dirty/provenance tracking**

Add `mediaAssetPublicId` to `translationFieldsEqual`, `draftBody`, locale PATCH payloads, and copy-to-all payload handling. Resolve editor preview with `translation.imageUrl`, never the root default URL.

- [ ] **Step 4: Split default and localized upload actions**

```ts
async function uploadDefaultImage(event: ChangeEvent<HTMLInputElement>) {
  const file = event.currentTarget.files?.[0];
  if (!file || !selectedSlide) return;
  const media = await contentPublicationApi.uploadContentImage(
    file,
    selectedSlide.translations[state.selectedLocale].imageAltText
  );
  replaceSelectedSlide((slide) => ({
    ...slide,
    defaultMediaAssetPublicId: media.publicId,
    defaultImageUrl: media.url,
    translations: Object.fromEntries(contentEditorLocales.map((locale) => {
      const value = slide.translations[locale];
      return [locale, value.mediaAssetPublicId === null ? { ...value, imageUrl: media.url } : value];
    })) as CarouselReleaseSlide["translations"]
  }));
}

async function uploadLocalizedImage(event: ChangeEvent<HTMLInputElement>) {
  const file = event.currentTarget.files?.[0];
  if (!file || !selectedSlide) return;
  const media = await contentPublicationApi.uploadContentImage(file, translation?.imageAltText);
  replaceSelectedSlide((slide) => ({
    ...slide,
    translations: {
      ...slide.translations,
      [state.selectedLocale]: {
        ...slide.translations[state.selectedLocale],
        mediaAssetPublicId: media.publicId,
        imageUrl: media.url,
        sourceLocale: state.selectedLocale,
        isInitialCopy: false
      }
    }
  }), "translation");
}

function clearLocalizedImage() {
  replaceSelectedSlide((slide) => ({
    ...slide,
    translations: {
      ...slide.translations,
      [state.selectedLocale]: {
        ...slide.translations[state.selectedLocale],
        mediaAssetPublicId: null,
        imageUrl: slide.defaultImageUrl,
        sourceLocale: state.selectedLocale,
        isInitialCopy: false
      }
    }
  }), "translation");
}
```

- [ ] **Step 5: Add the no-target editor state**

Add `<option value="none">{t("noTarget")}</option>` only for `user-home`. Selecting it immediately writes `{ type: "none" }`, hides target query/results, and forces all five `ctaLabel` values to `null`. Render no CTA field for a selected `none` slide.

- [ ] **Step 6: Add five-language editor chrome**

Add exact keys for `defaultImage`, `localizedImage`, `useDefaultImage`, and `noTarget` to `src/features/content-publication/i18n.ts` for `zh`, `zh-Hant`, `en`, `ja`, and `ko`. The simplified Chinese labels are “默认图片”, “当前语言图片”, “使用默认图片”, and “不跳转”.

- [ ] **Step 7: Run editor and i18n tests and verify GREEN**

Run:

```bash
npm test -- src/features/content-publication/LocalizedCarouselEditor.test.tsx
npm run i18n:quality
```

Expected: editor suite PASS; i18n quality exits 0 with no new target-language missing entries or mixed-language leakage from these keys.

- [ ] **Step 8: Commit the editor slice**

```bash
git add src/features/content-publication/LocalizedCarouselEditor.tsx src/features/content-publication/LocalizedCarouselEditor.test.tsx src/features/content-publication/i18n.ts
git commit -m "feat: edit localized carousel images"
```

---

### Task 6: Render welcome as a truly non-clickable public slide

**Files:**
- Modify: `src/features/content-publication/PublishedCarousel.tsx`
- Modify: `src/features/content-publication/PublishedCarousel.test.tsx`

**Interfaces:**
- Consumes: Task 4 public `{ type: "none" }` projection.
- Produces: `carouselTargetPath(target): string | null` and an unlinked `FeatureCarouselSlide` for welcome.

- [ ] **Step 1: Write the failing public UI test**

```tsx
it("renders a none target without a card link or CTA and leaves the route unchanged", async () => {
  apiMocks.getUserHomeCarousel.mockResolvedValue(
    payload("USER_HOME", { type: "none" })
  );
  await renderCarousel("user-home");
  await waitFor(() => expect(container.textContent).toContain("东京护理"));

  expect(container.querySelector('a[href]')).toBeNull();
  expect(container.querySelector('[data-feature-carousel-cta="true"]')).toBeNull();
  expect(container.querySelector('[data-testid="location"]')?.textContent).toBe("/");
});
```

Set the fixture's `ctaLabel` to `null` for this case.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/features/content-publication/PublishedCarousel.test.tsx`

Expected: FAIL because `carouselTargetPath` treats every target as navigable.

- [ ] **Step 3: Implement nullable routing**

```ts
export function carouselTargetPath(target: PublishedCarouselTarget): string | null {
  if (target.type === "none") return null;
  if (target.type === "shop") return `/stores/${encodeURIComponent(target.publicId)}`;
  if (target.type === "technician") {
    return `/profiles/technician/${encodeURIComponent(target.publicId)}`;
  }
  if (target.type === "service") return `/services/${encodeURIComponent(target.publicId)}`;
  return `/afirieito/announcements/${encodeURIComponent(target.publicId)}`;
}
```

Map `to` to `undefined` when the path is `null`. Preserve `ctaLabel: null`; existing `FeatureCarousel` already renders a non-link `<div>` when `to` is absent and hides the CTA when `cta === null`.

- [ ] **Step 4: Run the public carousel tests and verify GREEN**

Run:

```bash
npm test -- src/features/content-publication/PublishedCarousel.test.tsx src/components/client-ui/FeatureCarousel.test.tsx src/pages/user/HomePage.test.ts
```

Expected: all focused files PASS.

- [ ] **Step 5: Commit the public UI slice**

```bash
git add src/features/content-publication/PublishedCarousel.tsx src/features/content-publication/PublishedCarousel.test.tsx
git commit -m "feat: render non-clickable carousel slides"
```

---

### Task 7: Create the welcome asset and publish the five-slide formal release

**Files:**
- Create: `public/images/carousel/needo-welcome-v1.svg`
- Create: `public/images/carousel/needo-welcome-v1.png`
- Use as upload inputs without modifying:
  - `public/images/generated/stores/store-cafe-consult.jpg`
  - `public/images/generated/stores/store-calm-body-room.jpg`
  - `public/images/generated/stores/store-beauty-reception.jpg`
  - `public/images/generated/home-merchant-feature.jpg`

**Interfaces:**
- Consumes: completed Tasks 1–6, existing local operator RBAC, formal upload/editor/publish APIs, and the four verified Shops.
- Produces: one published `USER_HOME` version with five ordered slides, five-language copy, one `none` target, four public Shop targets, MediaAssets, commands, and audit evidence.

- [ ] **Step 1: Create the language-neutral brand source**

Use `apply_patch` to create this complete SVG; it contains only the invariant NeeDo wordmark, not localized marketing copy:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="720" viewBox="0 0 1120 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#071016"/>
      <stop offset="0.55" stop-color="#0d1b20"/>
      <stop offset="1" stop-color="#15272b"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.76" cy="0.27" r="0.58">
      <stop offset="0" stop-color="#a7ff32" stop-opacity="0.42"/>
      <stop offset="1" stop-color="#a7ff32" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1120" height="720" fill="url(#bg)"/>
  <rect width="1120" height="720" fill="url(#glow)"/>
  <g fill="none" stroke="#a7ff32" stroke-opacity="0.18" stroke-width="3">
    <path d="M620 90C790 150 870 250 1030 270M570 180C720 245 810 365 1005 410M610 335C760 385 835 520 1020 575"/>
    <circle cx="850" cy="305" r="150"/><circle cx="850" cy="305" r="235"/>
  </g>
  <g transform="translate(760 170)">
    <path d="M90 0c-55 0-100 43-100 97 0 74 100 190 100 190S190 171 190 97C190 43 145 0 90 0Z" fill="#a7ff32"/>
    <circle cx="90" cy="96" r="38" fill="#0b171c"/>
  </g>
  <text x="72" y="455" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="132" font-weight="800" letter-spacing="-8">NeeDo</text>
  <rect x="74" y="500" width="180" height="14" rx="7" fill="#a7ff32"/>
</svg>
```

- [ ] **Step 2: Render the accepted PNG and inspect it**

Run:

```bash
ffmpeg -y -i public/images/carousel/needo-welcome-v1.svg -frames:v 1 public/images/carousel/needo-welcome-v1.png
file public/images/carousel/needo-welcome-v1.png
```

Expected: a `1120 x 720` PNG. Inspect the PNG with `view_image`; reject it if the NeeDo wordmark is clipped, the pin is cropped, or the left half lacks safe contrast for runtime text.

- [ ] **Step 3: Commit the approved asset**

```bash
git add public/images/carousel/needo-welcome-v1.svg public/images/carousel/needo-welcome-v1.png
git commit -m "feat: add NeeDo welcome carousel asset"
```

- [ ] **Step 4: Apply the new migration only to the explicit local formal database**

Run from `backend/`:

```bash
ENV_FILE=.env.dev npm run prisma:status
ENV_FILE=.env.dev npm run prisma:migrate:deploy
ENV_FILE=.env.dev npm run prisma:status
```

Expected: the database host is local, database is `needo_dev` or `needo_test`, the new migration applies once, and final status reports up to date. Stop if the URL is remote or names production/staging.

- [ ] **Step 5: Open the formal backoffice editor with a writable operator**

Route: `http://127.0.0.1:5180/pf-admin.html#/admin/carousel`

If the page is at login, stop browser mutation and ask the user to sign in; do not inspect saved passwords, localStorage, cookies, or credential files. After login, verify the page can read the current published version and exposes edit, upload, and publish controls.

- [ ] **Step 6: Upload the five default images through the formal media API**

Upload exactly these files and verify a success notice and preview after each upload:

1. `public/images/carousel/needo-welcome-v1.png`
2. `public/images/generated/stores/store-cafe-consult.jpg`
3. `public/images/generated/stores/store-calm-body-room.jpg`
4. `public/images/generated/stores/store-beauty-reception.jpg`
5. `public/images/generated/home-merchant-feature.jpg`

Do not upload personal files or unrelated assets. Identical bytes may reuse checksum-backed storage, but each selected default must resolve to an authorized formal MediaAsset.

- [ ] **Step 7: Create/replace the draft with the exact five targets**

Set order and target:

```json
[
  { "sortOrder": 0, "target": { "type": "none" } },
  { "sortOrder": 1, "target": { "type": "shop", "shopId": 217 } },
  { "sortOrder": 2, "target": { "type": "shop", "shopId": 2 } },
  { "sortOrder": 3, "target": { "type": "shop", "shopId": 6 } },
  { "sortOrder": 4, "target": { "type": "shop", "shopId": 1 } }
]
```

Enter the following exact welcome translations (`ctaLabel` is `null` in every language):

| Locale | Badge | Title | Caption | Image alt text |
|---|---|---|---|---|
| `zh-CN` | 欢迎来到 NeeDo | 欢迎进入 NeeDo | 发现东京值得信赖的本地服务 | NeeDo 本地生活服务欢迎图 |
| `zh-TW` | 歡迎來到 NeeDo | 歡迎進入 NeeDo | 探索東京值得信賴的在地服務 | NeeDo 在地生活服務歡迎圖 |
| `en` | Welcome to NeeDo | Welcome to NeeDo | Discover trusted local services across Tokyo | Welcome to NeeDo local services |
| `ja` | NeeDoへようこそ | NeeDoへようこそ | 東京で信頼できるローカルサービスを見つけよう | NeeDoローカルサービスのウェルカム画像 |
| `ko` | NeeDo에 오신 것을 환영합니다 | NeeDo에 오신 것을 환영합니다 | 도쿄의 믿을 수 있는 지역 서비스를 만나보세요 | NeeDo 지역 서비스 환영 이미지 |

For all four Shop slides, keep the formal Shop name as the title and use these exact shared badge/CTA values:

| Locale | Badge | CTA |
|---|---|---|
| `zh-CN` | 精选店铺 | 进入店铺 |
| `zh-TW` | 精選店舖 | 進入店舖 |
| `en` | Featured shop | View shop |
| `ja` | 注目の店舗 | 店舗を見る |
| `ko` | 추천 매장 | 매장 보기 |

Use these exact localized Shop captions:

| Shop | `zh-CN` | `zh-TW` | `en` | `ja` | `ko` |
|---|---|---|---|---|---|
| 麻布十番超级按摩 | 麻布十番的到店护理空间 | 麻布十番的到店護理空間 | In-store care in Azabu-Juban | 麻布十番で受けられる来店型ケア | 아자부주반에서 만나는 매장 케어 |
| Roppongi Recovery Lounge | 六本木的私密恢复护理 | 六本木的私密恢復護理 | Private recovery care in Roppongi | 六本木のプライベートリカバリーケア | 롯폰기의 프라이빗 리커버리 케어 |
| Daikanyama Skin & Lash | 代官山肌肤与美睫护理 | 代官山肌膚與美睫護理 | Skin and lash care in Daikanyama | 代官山のスキン＆アイラッシュケア | 다이칸야마의 스킨 앤 래시 케어 |
| Aoyama Care Studio | 青山的日常身心护理 | 青山的日常身心護理 | Everyday body and wellness care in Aoyama | 青山で受けられる日常のボディ＆ウェルネスケア | 아오야마의 일상 바디 및 웰니스 케어 |

Use the formal Shop name plus these exact locale suffixes for image alt text: `店铺宣传图` (`zh-CN`), `店舖宣傳圖` (`zh-TW`), `shop campaign image` (`en`), `店舗プロモーション画像` (`ja`), and `매장 홍보 이미지` (`ko`). Keep all localized media overrides `null` for the initial release so every locale uses the verified default image; this preserves later per-language upload capability.

- [ ] **Step 8: Preview Chinese and Japanese before publication**

In preview, verify Chinese shows “欢迎进入 NeeDo” and Japanese shows “NeeDoへようこそ”. Verify each Shop slide keeps the formal Shop name, uses localized badge/caption/CTA, and the welcome slide has no CTA. Confirm every image preview resolves and no locale is marked incomplete.

- [ ] **Step 9: Publish the new version and reconcile history/audit**

Publish immediately with reason `Replace legacy Service slide with five-language NeeDo welcome and Shop campaign`. Verify:

- new version status is `published`;
- previous Service version status is `archived`;
- exactly five slides are returned by the public `zh-CN` and `ja` reads;
- `content.media.uploaded`, draft mutation, and `content.carousel.publish` audit evidence exists;
- no release or media row was directly edited outside the formal workflow.

This step mutates only the local formal database and media storage; it has no Git commit.

---

### Task 8: Full verification, browser acceptance, and evidence docs

**Files:**
- Modify: `docs/localized-carousel-publication.md`
- Modify: `docs/MOCK_RETIREMENT_MAP.md`

**Interfaces:**
- Consumes: the complete implementation and published five-slide local release.
- Produces: fresh automated, database, browser, locale, navigation, persistence, console, and rollback evidence.

- [ ] **Step 1: Run focused backend verification**

```bash
npm --prefix backend test -- --runInBand \
  tests/carousel-locale-media-schema.test.ts \
  tests/content-publication-validator.test.ts \
  tests/carousel-publication.service.test.ts \
  tests/carousel-publication.repository.test.ts \
  tests/content-publication-api.test.ts \
  tests/openapi.test.ts
```

Expected: all listed suites PASS with zero failures.

- [ ] **Step 2: Run focused frontend verification**

```bash
npm test -- \
  src/api/contentPublication.test.ts \
  src/features/content-publication/LocalizedCarouselEditor.test.tsx \
  src/features/content-publication/PublishedCarousel.test.tsx \
  src/components/client-ui/FeatureCarousel.test.tsx \
  src/pages/user/HomePage.test.ts
```

Expected: all listed files PASS with zero failures.

- [ ] **Step 3: Run full quality gates**

```bash
npm --prefix backend test -- --runInBand
npm --prefix backend run lint
npm --prefix backend run build
npm test -- --reporter=dot
npm run lint
npm run i18n:quality
npm run i18n:audit
npm run verify:production-build
git diff --check
```

Expected: tests, lint, builds, i18n quality, production bundle audit, and diff check exit 0. Report existing informational audit counts separately; do not call them new failures.

- [ ] **Step 4: Verify local service readiness**

Confirm listeners for MySQL `3307`, Redis `6379`, backend `3000`, and frontend `5180`; then verify:

```bash
curl -fsS http://127.0.0.1:3000/api/v1/health
curl -fsS http://127.0.0.1:3000/api/v1/ready
curl -I -s http://127.0.0.1:5180/user.html
```

Expected: health 200, ready 200/ready, and frontend HTTP 200. If MySQL or Redis recovered after backend startup, restart backend before browser acceptance.

- [ ] **Step 5: Browser-verify locale switching and non-clickable welcome**

On `/user.html#/`:

1. Select simplified Chinese and confirm five indicators, Chinese welcome copy, and welcome image.
2. Click the welcome card outside indicator controls; URL must remain `/`.
3. Select Japanese and confirm Japanese welcome, captions, CTAs, and alt text.
4. Refresh and repeat one locale switch; content must persist.

Use `domcontentloaded` plus target elements because SSE can keep `networkidle` open.

- [ ] **Step 6: Browser-verify all four Shop targets**

Activate slides 2–5 and click each card. Verify the resulting route uses a public Shop identifier and the destination heading is, respectively:

1. 麻布十番超级按摩
2. Roppongi Recovery Lounge
3. Daikanyama Skin & Lash
4. Aoyama Care Studio

Do not accept numeric Carousel response IDs even if the current detail page also supports legacy numeric routes.

- [ ] **Step 7: Browser-verify shared Home/Social publication and console cleanliness**

Open `/user.html#/moments`, confirm the same release version/order/copy appears, switch language once, and verify the same localized response. Inspect console errors/warnings for the backoffice editor, Home, Social, and four Shop detail pages; require zero new errors caused by this change.

- [ ] **Step 8: Prove backend restart persistence**

Restart only the formal backend after dependencies remain ready. Reload Home and Social and confirm the same release version, five slides, localized text, resolved images, and Shop navigation return from MySQL/media storage.

- [ ] **Step 9: Update evidence documentation**

Add to `docs/localized-carousel-publication.md`:

- migration name;
- `none` and locale-media contract;
- exact test counts from fresh output;
- exact published version/history state;
- Chinese/Japanese browser evidence;
- all four public Shop routes/headings;
- backend restart persistence;
- console result;
- rollback procedure.

Add one concise `MOCK_RETIREMENT_MAP.md` entry stating that Home and Social still share the same formal published scene, now with locale-resolved media and explicit non-clickable slides.

- [ ] **Step 10: Commit final evidence**

```bash
git add docs/localized-carousel-publication.md docs/MOCK_RETIREMENT_MAP.md
git commit -m "docs: verify multilingual home carousel content"
```

---

## Completion Checklist

- [ ] The current Service carousel release is archived, not deleted.
- [ ] The published release contains exactly five slides in the approved order.
- [ ] Welcome is a formal `none` target, has no CTA/link, and remains first.
- [ ] Each of the four Shop slides opens the correct public Shop page.
- [ ] Text and optional image override are independently stored per locale.
- [ ] Chinese and Japanese public responses visibly differ in copy and resolve the correct image.
- [ ] Default image fallback works when locale media is null.
- [ ] Affiliate notice carousel rejects `none` and remains behaviorally unchanged.
- [ ] Reload and backend restart preserve the release.
- [ ] Automated, lint, build, i18n, production audit, diff, browser, console, and persistence evidence is fresh.
- [ ] Only local formal data was mutated; no push or deployment occurred.
