# Localized Carousel Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first formal five-language content-publication slice: operations can independently manage a real user-home carousel and an Affiliate image-announcement carousel, with persisted drafts, preview, immediate/scheduled publication, disable, rollback, RBAC, audit, and real front-end targets.

**Architecture:** Add versioned Carousel and OfficialAnnouncement aggregates with domain-specific translation tables and one shared locale contract. Backoffice writes pass through Route → Controller → Service → Repository, while public reads return only the current locale and active release; React reuses the existing `FeatureCarousel` through a formal API-backed adapter and removes the user-home route's browser-store dependency.

**Tech Stack:** React 19, TypeScript strict, Vite 7, Express 4, Prisma 7/MySQL 8, Zod 3, JWT/RBAC, Jest/Supertest, Vitest, OpenAPI 3.1, existing file-backed MediaAsset storage pattern.

## Global Constraints

- Execute only the first micro-step from `docs/superpowers/specs/2026-08-29-localized-carousel-publication-design.md`.
- Formal content locales are exactly `zh-CN`, `zh-TW`, `en`, `ja`, and `ko`; frontend aliases are exactly `zh -> zh-CN` and `zh-Hant -> zh-TW`.
- First save copies one source locale to all five rows in one transaction; later locale edits are independent.
- On first save, the source row stores `sourceLocale` equal to itself and `isInitialCopy=false`; the other four rows store the source locale and `isInitialCopy=true`. A direct locale edit resets that row to itself/false. Explicit copy-to-all records the selected source locale on all five rows with `isInitialCopy=false` because it is an operator action, not initialization.
- Publishing, scheduling, disabling, and rollback are server-authoritative, version-checked, audited operations.
- `USER_HOME` and `AFFILIATE_HOME_NOTICE` share rendering/editor code but never share releases, permissions, drafts, or content.
- `USER_HOME` targets exactly one live Shop, TechnicianProfile, or Service. `AFFILIATE_HOME_NOTICE` targets one published OfficialAnnouncement and may reference one visible AffiliateTask.
- Do not add mock data, demo persistence, local-storage business state, fake APIs, hard-coded secrets, or client-only authorization.
- Do not import browser keys such as `needo.carousel-scenes.formal-state.v1` into MySQL.
- Keep the old `timeline` carousel compatibility boundary unchanged; only user-home formal reading leaves `homeCarouselStore` in this plan.
- Published rows are immutable. Slide removal or edit clones a new draft; rollback clones history into a higher version.
- API dates are ISO 8601 UTC; display dates use the current UI locale/time zone.
- Every protected write has Zod, OpenAPI, explicit permission, stable error keys, optimistic locking, and AuditLog.
- Preserve the existing React/TSX/Vite portals, Affiliate identity rules, alliance structure, NDP rules, and unrelated dirty-worktree changes.
- Do not modify an applied migration. Add new additive migrations and stage only files owned by each task.

## Deliverable Boundary

After this plan passes acceptance:

- `/admin/carousel` is the formal user-home carousel editor.
- `/admin/afirieito/announcements/carousel` is a separate Affiliate announcement-carousel editor.
- Operations can save five-language announcement and carousel drafts, preview, publish now, schedule one release, disable, and rollback.
- `/api/v1/content/carousels/user-home?locale=...` serves the authenticated user portal.
- `/api/v1/affiliate/content/carousel?locale=...` and `/api/v1/affiliate/announcements/:publicId?locale=...` serve the activated Affiliate portal.
- User-home slides navigate to real store, technician, or service routes.
- Affiliate slides navigate to a formal announcement; the announcement exposes a task action only when that task is visible to the current Affiliate.
- Refresh, relogin, and backend restart preserve all published state.
- Shop, technician, service, Affiliate profile, alliance, Affiliate task, rules, Social, chat, and Request localization remain outside this implementation slice.

## File Responsibility Map

### Database, locale contract, and permissions

- `backend/prisma/schema.prisma`: content enums, Announcement/Release/Translation, CarouselRelease/Slide/Translation, publication command idempotency, Service public UUID, relations, indexes, soft deletion, active-slot keys.
- `backend/prisma/migrations/20260829090000_localized_carousel_publication/migration.sql`: additive tables, enums, foreign keys, indexes, and unique active/scheduled slot keys.
- `backend/prisma/migrations/20260829093000_localized_carousel_permissions/migration.sql`: permission rows and role assignments for customer/Affiliate reads and the two backoffice domains.
- `backend/src/constants/content-locales.ts`: canonical locale type, frontend alias normalization, and five-row initializer.
- `backend/src/constants/permissions.constants.ts`: system permission declarations and role-assignment arrays.
- `backend/src/validators/content-publication.validator.ts`: locale, IDs, draft, translation, publication, scheduling, rollback, history, and target-search contracts.

### Backend media and publication domains

- `backend/src/services/content-media.storage.ts`: public-content image validation and file storage.
- `backend/src/repositories/content-media.repository.ts`: MediaAsset creation/read and audited ownership.
- `backend/src/services/content-media.service.ts`: upload/read policy.
- `backend/src/controllers/content-media.controller.ts`: raw-image upload adaptation.
- `backend/src/routes/content-media.routes.ts`: protected backoffice upload.
- `backend/src/app.ts`: strict hash-filename static delivery for non-sensitive public content images.
- `backend/src/repositories/official-announcement.repository.ts`: announcement versions/translations and atomic publication writes.
- `backend/src/services/official-announcement.service.ts`: draft initialization, locale editing, target validation, publication, scheduling, disable, rollback, and public projection.
- `backend/src/controllers/official-announcement.controller.ts`: backoffice and Affiliate detail adapters.
- `backend/src/routes/official-announcement.routes.ts`: backoffice management and Affiliate detail routes.
- `backend/src/repositories/carousel-publication.repository.ts`: scene releases, slides/translations, targets, history, and atomic active-slot switching.
- `backend/src/services/carousel-publication.service.ts`: scene policy, complete-five-locale validation, publication lifecycle, and public scene projection.
- `backend/src/controllers/carousel-publication.controller.ts`: public/backoffice request adapters.
- `backend/src/routes/carousel-publication.routes.ts`: fixed-scene public routes and backoffice lifecycle routes.
- `backend/src/services/content-publication-scheduler.service.ts`: due announcement/carousel activation with failure isolation.
- `backend/src/workers/content-publication.worker.ts`: non-overlapping scheduled runner.
- `backend/src/app.ts`: injectable services/repositories/storage and route registration.
- `backend/src/server.ts`: worker start/stop and content storage wiring.
- `backend/src/config/env.ts`, `backend/.env.dev.example`, `backend/tests/setup-env.ts`: content media directory and scheduler interval/batch settings.
- `backend/src/api/openapi.ts`: all new request/response/error schemas.
- `backend/src/repositories/core-read.repository.ts`, `backend/src/services/core-read.service.ts`, `backend/src/controllers/core-read.controller.ts`, `backend/src/routes/core-read.routes.ts`, `backend/src/validators/core-read.validator.ts`: UUID-compatible public Service detail without breaking numeric legacy links.

### Frontend shared publication UI

- `src/api/contentPublication.ts`: typed formal API client and raw image upload.
- `src/features/content-publication/locales.ts`: frontend language-to-content-locale mapping.
- `src/features/content-publication/usePublishedCarousel.ts`: cancellation-safe load/retry state.
- `src/features/content-publication/PublishedCarousel.tsx`: shared loading/error/empty adapter around `FeatureCarousel`.
- `src/features/content-publication/LocalizedCarouselEditor.tsx`: shared five-language draft editor.
- `src/features/content-publication/AnnouncementEditor.tsx`: Affiliate announcement draft editor.
- `src/features/content-publication/AffiliateAnnouncementDetailPage.tsx`: current-locale announcement detail and optional task action.
- `src/features/content-publication/i18n.ts`: five-language UI chrome copy; business content comes from the API.
- `src/features/core-read/api.ts`, `src/pages/user/ServiceDetailPage.tsx`: accept a formal Service public UUID route from the carousel while retaining current numeric links.
- `src/pages/admin/CarouselPage.tsx`: real `USER_HOME` editor wrapper.
- `src/pages/admin/AffiliateNoticeCarouselPage.tsx`: real `AFFILIATE_HOME_NOTICE` editor wrapper.
- `src/pages/user/HomePage.tsx`: replace `homeCarouselStore` usage with formal `USER_HOME` API state.
- `src/pages/mobile/BusinessCpsPage.tsx`: place formal Affiliate notice carousel below the existing Affiliate header and preserve the capability boundary for unrelated marketplace modules.
- `src/components/admin/AdminLayout.tsx`, `src/App.tsx`: separate menu items and routes.

### Tests, checker, and delivery notes

- `backend/tests/content-locales.test.ts`
- `backend/tests/localized-carousel-schema.test.ts`
- `backend/tests/localized-carousel-permissions.test.ts`
- `backend/tests/content-publication-validator.test.ts`
- `backend/tests/content-media.service.test.ts`
- `backend/tests/content-media-api.test.ts`
- `backend/tests/official-announcement.repository.test.ts`
- `backend/tests/official-announcement.service.test.ts`
- `backend/tests/official-announcement-api.test.ts`
- `backend/tests/carousel-publication.repository.test.ts`
- `backend/tests/carousel-publication.service.test.ts`
- `backend/tests/content-publication-api.test.ts`
- `backend/tests/content-publication-scheduler.service.test.ts`
- `backend/tests/content-publication.worker.test.ts`
- `backend/tests/core-read-api.test.ts`
- `backend/tests/openapi.test.ts`
- `backend/tests/localized-carousel-publication-flow-script.test.ts`
- `backend/scripts/check-localized-carousel-publication-flow.ts`: local non-production real-DB lifecycle and cleanup checker.
- `src/api/contentPublication.test.ts`
- `src/features/content-publication/PublishedCarousel.test.tsx`
- `src/features/content-publication/LocalizedCarouselEditor.test.tsx`
- `src/features/content-publication/AffiliateAnnouncementDetailPage.test.tsx`
- `src/pages/user/HomePage.test.ts`
- `src/pages/user/ServiceDetailPage.test.ts`
- `src/pages/mobile/BusinessCpsPage.test.tsx`
- `src/pages/admin/AdminCapabilityRoutes.test.ts`
- `src/i18n/translations.test.ts`
- `docs/localized-carousel-publication.md`: final contracts, migrations, permissions, verification, and browser evidence.

---

### Task 1: Canonical locale contract and additive publication schema

**Files:**
- Create: `backend/src/constants/content-locales.ts`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260829090000_localized_carousel_publication/migration.sql`
- Create: `backend/tests/content-locales.test.ts`
- Create: `backend/tests/localized-carousel-schema.test.ts`

**Interfaces:**
- Produces `CONTENT_LOCALES`, `ContentLocaleCode`, `normalizeContentLocale(value)`, and `initializeContentTranslations(sourceLocale, value)`.
- Produces Prisma models `OfficialAnnouncement`, `OfficialAnnouncementRelease`, `OfficialAnnouncementTranslation`, `CarouselRelease`, `CarouselSlide`, `CarouselSlideTranslation`, and `ContentPublicationCommand`.
- Produces nullable unique `draftSlotKey`/`publishedSlotKey`/`scheduledSlotKey` fields used by Tasks 4-7 to guarantee one current draft, one live version, and one scheduled version per aggregate.
- Produces required unique `Service.publicId` UUIDs so carousel responses do not expose a Service numeric primary key.

- [ ] **Step 1: Write failing locale and schema contract tests**

```ts
import { CONTENT_LOCALES, initializeContentTranslations, normalizeContentLocale } from "../src/constants/content-locales";

describe("content locale contract", () => {
  it("normalizes only the five approved locales", () => {
    expect(CONTENT_LOCALES).toEqual(["zh-CN", "zh-TW", "en", "ja", "ko"]);
    expect(normalizeContentLocale("zh")).toBe("zh-CN");
    expect(normalizeContentLocale("zh-Hant")).toBe("zh-TW");
    expect(() => normalizeContentLocale("fr")).toThrow("error.content.locale_invalid");
  });

  it("copies the first value to all five locale rows", () => {
    expect(initializeContentTranslations("ja", { title: "お知らせ" })).toEqual({
      "zh-CN": { title: "お知らせ" },
      "zh-TW": { title: "お知らせ" },
      en: { title: "お知らせ" },
      ja: { title: "お知らせ" },
      ko: { title: "お知らせ" }
    });
  });
});
```

The schema test must read `schema.prisma` and the migration, then assert all seven models, `createdAt/updatedAt/deletedAt`, translation uniqueness, `(scene, version)` uniqueness, command idempotency uniqueness, foreign keys, target indexes, all three nullable unique slot keys, and the non-null unique `Service.publicId` backfill.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/content-locales.test.ts tests/localized-carousel-schema.test.ts`

Expected: FAIL because the locale module, models, and migration are absent.

- [ ] **Step 3: Implement the locale module**

```ts
import { ERROR_CODES } from "./error-codes";
import { AppError } from "../utils/app-error";

export const CONTENT_LOCALES = ["zh-CN", "zh-TW", "en", "ja", "ko"] as const;
export type ContentLocaleCode = (typeof CONTENT_LOCALES)[number];

const localeAliases: Readonly<Record<string, ContentLocaleCode>> = {
  "zh-CN": "zh-CN",
  zh: "zh-CN",
  "zh-TW": "zh-TW",
  "zh-Hant": "zh-TW",
  en: "en",
  ja: "ja",
  ko: "ko"
};

export function normalizeContentLocale(value: unknown): ContentLocaleCode {
  const locale = typeof value === "string" ? localeAliases[value] : undefined;
  if (!locale) {
    throw new AppError({ code: ERROR_CODES.VALIDATION, message: "error.content.locale_invalid", statusCode: 400 });
  }
  return locale;
}

export function initializeContentTranslations<T extends object>(
  sourceLocale: ContentLocaleCode,
  value: T
): Record<ContentLocaleCode, T> {
  normalizeContentLocale(sourceLocale);
  return Object.fromEntries(CONTENT_LOCALES.map((locale) => [locale, structuredClone(value)])) as Record<ContentLocaleCode, T>;
}
```

- [ ] **Step 4: Add the exact Prisma aggregate contract**

Add enums for the five locales, two scenes, release status, aggregate type, and target type. Add the seven models with these required keys:

```prisma
enum ContentLocale {
  ZH_CN @map("zh-CN")
  ZH_TW @map("zh-TW")
  EN    @map("en")
  JA    @map("ja")
  KO    @map("ko")
}

enum CarouselScene {
  USER_HOME             @map("user_home")
  AFFILIATE_HOME_NOTICE @map("affiliate_home_notice")
}

enum ContentReleaseStatus {
  DRAFT     @map("draft")
  SCHEDULED @map("scheduled")
  PUBLISHED @map("published")
  DISABLED  @map("disabled")
  ARCHIVED  @map("archived")
}

enum CarouselTargetType {
  SHOP                  @map("shop")
  TECHNICIAN            @map("technician")
  SERVICE               @map("service")
  AFFILIATE_ANNOUNCEMENT @map("affiliate_announcement")
}

enum ContentPublicationAggregateType {
  OFFICIAL_ANNOUNCEMENT @map("official_announcement")
  CAROUSEL              @map("carousel")
}
```

Use this exact field contract; SQL column names use the repository's existing snake-case `@map` convention:

| Model | Required scalar fields and constraints |
|---|---|
| `OfficialAnnouncement` | `id Int @id @default(autoincrement())`; `publicId String @unique @db.Char(36)`; `announcementType String @default("affiliate_notice") @db.VarChar(40)`; `visibilityScope String @default("all_affiliates") @db.VarChar(40)`; nullable `affiliateTaskId`; `createdById Int`; `createdAt`; `updatedAt`; `deletedAt`; indexes for task, creator, visibility, and soft deletion |
| `OfficialAnnouncementRelease` | `id`; `announcementId`; `version`; `status`; `lockVersion @default(1)`; nullable unique `draftSlotKey @db.VarChar(80)`; nullable unique `publishedSlotKey @db.VarChar(80)`; nullable unique `scheduledSlotKey @db.VarChar(80)`; nullable `publishAt`, `visibleFrom`, `visibleUntil`, `activatedAt`, `disabledAt`, `archivedAt`; `activationAttempts @default(0)`; nullable `lastActivationAttemptAt`, `lastActivationError @db.VarChar(160)`; nullable `sourceReleaseId`; `createdById`; nullable `updatedById`, `publishedById`, `disabledById`; timestamps and `deletedAt`; unique `(announcementId, version)`; indexes for due scheduled rows, source release, actors, and soft deletion |
| `OfficialAnnouncementTranslation` | `id`; `releaseId`; `locale`; `title @db.VarChar(160)`; nullable `summary @db.VarChar(500)`; `body @db.Text`; `sourceLocale`; `isInitialCopy @default(false)`; timestamps and `deletedAt`; unique `(releaseId, locale)`; index `(locale, deletedAt)` |
| `CarouselRelease` | `id`; `scene`; `version`; `status`; `lockVersion @default(1)`; nullable unique `draftSlotKey @db.VarChar(80)`; nullable unique `publishedSlotKey @db.VarChar(80)`; nullable unique `scheduledSlotKey @db.VarChar(80)`; nullable `publishAt`, `activatedAt`, `disabledAt`, `archivedAt`; `activationAttempts @default(0)`; nullable `lastActivationAttemptAt`, `lastActivationError @db.VarChar(160)`; nullable `sourceReleaseId`; `createdById`; nullable `updatedById`, `publishedById`, `disabledById`; timestamps and `deletedAt`; unique `(scene, version)`; indexes for due scheduled rows, source release, actors, and soft deletion |
| `CarouselSlide` | `id`; `publicId String @unique @db.Char(36)`; `releaseId`; `mediaAssetId`; `sortOrder`; `isEnabled @default(true)`; nullable `visibleFrom`/`visibleUntil`; `targetType`; nullable `shopId`, `technicianProfileId`, `serviceId`, `announcementId`, `affiliateTaskId`; timestamps and `deletedAt`; unique `(releaseId, sortOrder)`; indexes for every foreign key and `(releaseId, isEnabled, deletedAt)` |
| `CarouselSlideTranslation` | `id`; `slideId`; `locale`; nullable `badge @db.VarChar(40)`; `title @db.VarChar(160)`; nullable `caption @db.VarChar(500)`; nullable `ctaLabel @db.VarChar(60)`; `imageAltText @db.VarChar(255)`; `sourceLocale`; `isInitialCopy @default(false)`; timestamps and `deletedAt`; unique `(slideId, locale)`; index `(locale, deletedAt)` |
| `ContentPublicationCommand` | `id`; `idempotencyKey String @unique @db.VarChar(191)`; `requestFingerprint @db.Char(64)`; `aggregateType`; `aggregateKey @db.VarChar(80)`; nullable `releaseId`; `action @db.VarChar(40)`; nullable `actorUserId`; `result Json`; timestamps and `deletedAt`; indexes `(aggregateType, aggregateKey, action)`, `(actorUserId)`, and `(deletedAt)` |

Add explicit relations to existing `User`, `MediaAsset`, `Shop`, `TechnicianProfile`, `Service`, and `AffiliateTask` models. `OfficialAnnouncement.affiliateTaskId` is the canonical optional task action; `CarouselSlide.affiliateTaskId`, when present, must match that canonical task. `announcementId` references `OfficialAnnouncement.id`; Services resolve the public UUID before persistence. Use `onDelete: Restrict` for release, media, and target lineage and `onDelete: SetNull` only for optional actor relations. The migration must add matching foreign keys and must not cascade-delete publication history.

Add `publicId String @unique @default(uuid()) @map("public_id") @db.Char(36)` to `Service`. The migration adds it nullable, backfills every existing live or soft-deleted Service with a distinct `UUID()`, then makes it non-null and unique; it must abort rather than silently retain a null or duplicate.

Slot values are server generated, never accepted from clients: `announcement:{announcementId}:draft|published|scheduled` and `carousel:{scene}:draft|published|scheduled`. All non-current releases store `NULL`, allowing MySQL's nullable unique indexes to enforce one occupied slot without blocking history. Publishing or scheduling clears the draft slot in the same transaction; cloning history for edit or rollback must first prove no other current draft exists.

- [ ] **Step 5: Generate, inspect, and apply the additive migration**

Run: `npm --prefix backend exec prisma migrate dev -- --create-only --name localized_carousel_publication`

Expected: one new migration containing only the seven content tables, enums, indexes, foreign keys, Service public-ID backfill, and required User/MediaAsset/Shop/TechnicianProfile/Service/AffiliateTask relations. Rename the generated folder to `20260829090000_localized_carousel_publication` before applying.

Run: `npm --prefix backend run prisma:migrate:dev`

Run: `npm --prefix backend exec prisma validate`

Expected: both commands exit 0.

- [ ] **Step 6: Run focused tests and commit**

Run: `npm --prefix backend test -- --runInBand tests/content-locales.test.ts tests/localized-carousel-schema.test.ts`

Expected: PASS.

```bash
git add backend/src/constants/content-locales.ts backend/prisma/schema.prisma backend/prisma/migrations/20260829090000_localized_carousel_publication/migration.sql backend/tests/content-locales.test.ts backend/tests/localized-carousel-schema.test.ts
git commit -m "feat: add localized carousel publication schema"
```

### Task 2: RBAC and strict publication validators

**Files:**
- Modify: `backend/src/constants/permissions.constants.ts`
- Create: `backend/prisma/migrations/20260829093000_localized_carousel_permissions/migration.sql`
- Create: `backend/src/validators/content-publication.validator.ts`
- Create: `backend/tests/localized-carousel-permissions.test.ts`
- Create: `backend/tests/content-publication-validator.test.ts`

**Interfaces:**
- Produces `CONTENT_PUBLICATION_PERMISSIONS` with separate read/edit/publish rights for user-home, Affiliate announcements, Affiliate notice carousel, and content media upload.
- Produces exported Zod types `CarouselSceneParam`, `CarouselDraftBody`, `AnnouncementDraftBody`, `PublishBody`, `ScheduleBody`, `DisableBody`, `RollbackBody`, `ContentHistoryQuery`, and `CarouselTargetSearchQuery`.

- [ ] **Step 1: Write failing permission and validator tests**

Require these codes and assignments:

```ts
export const CONTENT_PUBLICATION_PERMISSIONS = {
  userHomeRead: "page:backoffice-user-home-carousel",
  userHomeEdit: "button:backoffice-user-home-carousel-edit",
  userHomePublish: "button:backoffice-user-home-carousel-publish",
  affiliateAnnouncementRead: "page:backoffice-affiliate-announcement",
  affiliateAnnouncementEdit: "button:backoffice-affiliate-announcement-edit",
  affiliateAnnouncementPublish: "button:backoffice-affiliate-announcement-publish",
  affiliateNoticeRead: "page:backoffice-affiliate-notice-carousel",
  affiliateNoticeEdit: "button:backoffice-affiliate-notice-carousel-edit",
  affiliateNoticePublish: "button:backoffice-affiliate-notice-carousel-publish",
  contentMediaUpload: "button:backoffice-content-media-upload"
} as const;
```

Tests must assert admin receives all codes, operator receives all content-operation codes, viewer receives read codes only, and scout keeps `page:affiliate-marketplace` for public Affiliate reads without backoffice writes.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/localized-carousel-permissions.test.ts tests/content-publication-validator.test.ts`

Expected: FAIL because permissions and schemas are absent.

- [ ] **Step 3: Implement strict validators**

Use discriminated unions so invalid target combinations cannot enter Services:

```ts
const localeSchema = z.enum(["zh-CN", "zh-TW", "en", "ja", "ko"]);
const userTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("shop"), shopId: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("technician"), technicianProfileId: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("service"), serviceId: z.number().int().positive() }).strict()
]);
const affiliateTargetSchema = z.object({
  type: z.literal("affiliate_announcement"),
  announcementPublicId: z.string().uuid(),
  affiliateTaskId: z.number().int().positive().nullable().default(null)
}).strict();

export const translationBodySchema = z.object({
  locale: localeSchema,
  badge: z.string().trim().max(40).nullable(),
  title: z.string().trim().min(1).max(160),
  caption: z.string().trim().max(500).nullable(),
  ctaLabel: z.string().trim().max(60).nullable(),
  imageAltText: z.string().trim().min(1).max(255)
}).strict();
```

Define separate fixed scene schemas for `user-home` and `affiliate-home-notice`. Creating a draft carries a UUID `idempotencyKey`; mutations of an existing draft/release carry a positive `expectedLockVersion`; publish/schedule/disable carry both; rollback carries `expectedCurrentVersion` plus a UUID `idempotencyKey`. Repository transactions insert `ContentPublicationCommand` with a SHA-256 request fingerprint and cached JSON result; an exact retry returns the stored result, while reuse of the key with a different fingerprint returns `error.idempotency_key_reused`.

`ScheduleBody` requires an ISO 8601 UTC `publishAt` in the future. `DisableBody` and `RollbackBody` require a trimmed operator `reason` of 1-500 characters; publish/schedule accept an optional reason of the same maximum. Announcement drafts validate optional `visibleFrom < visibleUntil`; slide drafts validate optional `visibleFrom < visibleUntil` and require the announcement Release to cover that full window.

Declare and test this complete error contract in the validators/OpenAPI work: `error.content.locale_invalid`, `error.content.media_invalid`, `error.content.media_too_large`, `error.content.not_found`, `error.content.release_not_found`, `error.content.draft_exists`, `error.content.lock_conflict`, `error.content.incomplete_translations`, `error.content.schedule_conflict`, `error.content.target_invalid`, `error.content.target_unavailable`, `error.content.invalid_state_transition`, and `error.idempotency_key_reused`. Authentication and RBAC continue to use the repository's existing auth/permission error keys.

- [ ] **Step 4: Add permission declarations and migration**

Export `CONTENT_PUBLICATION_PERMISSIONS` from `backend/src/constants/permissions.constants.ts`, add those same values to `SYSTEM_PERMISSIONS`, and use the constant in the exact operator/viewer/admin role arrays. The migration must upsert the new permissions and role mappings without deleting existing role permissions.

- [ ] **Step 5: Run tests and commit**

Run: `npm --prefix backend test -- --runInBand tests/localized-carousel-permissions.test.ts tests/content-publication-validator.test.ts`

Expected: PASS.

```bash
git add backend/src/constants/permissions.constants.ts backend/src/validators/content-publication.validator.ts backend/prisma/migrations/20260829093000_localized_carousel_permissions/migration.sql backend/tests/localized-carousel-permissions.test.ts backend/tests/content-publication-validator.test.ts
git commit -m "feat: add localized content publication permissions"
```

### Task 3: Formal public-content MediaAsset upload and delivery

**Files:**
- Create: `backend/src/services/content-media.storage.ts`
- Create: `backend/src/repositories/content-media.repository.ts`
- Create: `backend/src/services/content-media.service.ts`
- Create: `backend/src/controllers/content-media.controller.ts`
- Create: `backend/src/routes/content-media.routes.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/.env.dev.example`
- Modify: `backend/tests/setup-env.ts`
- Modify: `backend/src/app.ts`
- Create: `backend/tests/content-media.service.test.ts`
- Create: `backend/tests/content-media-api.test.ts`

**Interfaces:**
- Produces `ContentMediaStoragePort.save/read/delete` for JPEG, PNG, and WebP up to 8 MiB.
- Produces protected `POST /api/v1/backoffice/content/media` and public immutable `/media/content/:hash.ext` delivery.
- Returns `{ publicId, mediaAssetId, url, mimeType, width: number | null, height: number | null, checksumSha256 }`; only backoffice responses include `mediaAssetId`. This slice stores `NULL` dimensions rather than adding a new image-decoder dependency.

- [ ] **Step 1: Write failing storage/service/API tests**

Cover valid magic bytes, extension-independent MIME validation, empty/oversize files, path traversal, checksum de-duplication, upload permission, strict public hash-path delivery, missing asset, and AuditLog creation.

```ts
const result = await service.upload(actor, context, {
  bytes: validPng,
  mimeType: "image/png",
  altText: "NeeDo announcement",
  now
});
expect(result).toMatchObject({ mimeType: "image/png", checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
  entityType: "content_publication_upload",
  entityId: actor.userId,
  ownerUserId: actor.userId
}));
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/content-media.service.test.ts tests/content-media-api.test.ts`

Expected: FAIL because the content-media domain is absent.

- [ ] **Step 3: Implement storage and service**

Use the existing identity-media safety pattern but a separate directory and public-content error keys:

```ts
export type ContentMediaMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface ContentMediaStoragePort {
  save(input: { bytes: Buffer; mimeType: ContentMediaMimeType }): Promise<{
    fileKey: string;
    checksumSha256: string;
    mimeType: ContentMediaMimeType;
  }>;
  read(fileKey: string): Promise<Buffer>;
  delete(fileKey: string): Promise<void>;
}
```

Store only hash-derived filenames, reject filename input, inspect file signatures, and delete the file if the database transaction fails. `publicId` is the SHA-256 checksum and `url` is `/media/content/{checksum}.{extension}`; no separate mutable media identifier is exposed to the public page. Deduplicate the immutable file bytes by checksum, but create a separate `MediaAsset` row for each upload with `entityType="content_publication_upload"`, `entityId=actor.userId`, and `ownerUserId=actor.userId`, so an earlier uploader's ownership is never reused.

- [ ] **Step 4: Wire env, repository, controller, and routes**

Add:

```text
CONTENT_MEDIA_STORAGE_DIR=runtime/content-media
CONTENT_PUBLICATION_INTERVAL_MS=60000
CONTENT_PUBLICATION_BATCH_SIZE=50
CONTENT_PUBLICATION_MAX_ACTIVATION_ATTEMPTS=3
```

The raw upload route uses `express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "8mb" })` after authentication, permission, and query validation. `app.ts` mounts a static middleware that accepts only `/[a-f0-9]{64}.(?:jpg|png|webp)`, sets the stored MIME type through Express, `Content-Disposition: inline`, and `Cache-Control: public, max-age=31536000, immutable`. It is intentionally unauthenticated because browser `<img>` requests do not carry the in-memory Bearer token and these assets are non-sensitive publication media; sensitive identity media remains on its protected route.

- [ ] **Step 5: Run tests and commit**

Run: `npm --prefix backend test -- --runInBand tests/content-media.service.test.ts tests/content-media-api.test.ts`

Expected: PASS.

```bash
git add backend/src/services/content-media.storage.ts backend/src/repositories/content-media.repository.ts backend/src/services/content-media.service.ts backend/src/controllers/content-media.controller.ts backend/src/routes/content-media.routes.ts backend/src/config/env.ts backend/.env.dev.example backend/tests/setup-env.ts backend/src/app.ts backend/tests/content-media.service.test.ts backend/tests/content-media-api.test.ts
git commit -m "feat: add formal content media uploads"
```

### Task 4: Official Affiliate announcement lifecycle

**Files:**
- Create: `backend/src/repositories/official-announcement.repository.ts`
- Create: `backend/src/services/official-announcement.service.ts`
- Create: `backend/src/controllers/official-announcement.controller.ts`
- Create: `backend/src/routes/official-announcement.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/official-announcement.repository.test.ts`
- Create: `backend/tests/official-announcement.service.test.ts`
- Create: `backend/tests/official-announcement-api.test.ts`

**Interfaces:**
- Produces `OfficialAnnouncementService.createDraft`, `updateLocale`, `copyLocaleToAll`, `preview`, `publish`, `schedule`, `disable`, `rollback`, `history`, and `getPublishedForAffiliate`.
- Produces backoffice `/api/v1/backoffice/affiliate/announcements` lifecycle endpoints and Affiliate detail `GET /api/v1/affiliate/announcements/:publicId`.
- Produces `OfficialAnnouncementPayload` with five translations only for protected backoffice/preview responses; public detail contains one locale.

- [ ] **Step 1: Write failing Service tests**

Test first-save five-row initialization, one-current-draft conflict, independent locale update, explicit copy-to-all, missing-title/body rejection, optimistic conflict, immediate publication, scheduled slot conflict, disable, clone rollback, inaccessible task redaction, and audit input.

```ts
const draft = await service.createDraft(actor, context, {
  idempotencyKey,
  sourceLocale: "ja",
  affiliateTaskId: visibleTask.id,
  translation: { title: "重要なお知らせ", summary: "概要", body: "本文" }
});
expect(Object.keys(draft.translations).sort()).toEqual(["en", "ja", "ko", "zh-CN", "zh-TW"].sort());

const edited = await service.updateLocale(actor, context, draft.publicId, draft.releaseId, {
  expectedLockVersion: draft.lockVersion,
  locale: "en",
  title: "Important notice",
  summary: "Summary",
  body: "Body"
});
expect(edited.translations.ja.title).toBe("重要なお知らせ");
```

- [ ] **Step 2: Run Service tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/official-announcement.repository.test.ts tests/official-announcement.service.test.ts`

Expected: FAIL because the repository and service are absent.

- [ ] **Step 3: Implement the repository transaction ports**

Expose focused methods instead of Prisma objects:

```ts
export interface OfficialAnnouncementRepositoryPort {
  createDraft(input: CreateAnnouncementDraftMutation): Promise<OfficialAnnouncementPayload>;
  findDraft(publicId: string, releaseId: number): Promise<OfficialAnnouncementPayload | null>;
  updateLocale(input: UpdateAnnouncementLocaleMutation): Promise<OfficialAnnouncementPayload>;
  publish(input: PublishAnnouncementMutation): Promise<OfficialAnnouncementPayload>;
  schedule(input: ScheduleAnnouncementMutation): Promise<OfficialAnnouncementPayload>;
  disable(input: DisableAnnouncementMutation): Promise<OfficialAnnouncementPayload>;
  cloneForRollback(input: RollbackAnnouncementMutation): Promise<OfficialAnnouncementPayload>;
  listHistory(input: { publicId: string; page: number; pageSize: number }): Promise<{ list: OfficialAnnouncementPayload[]; total: number }>;
  findPublished(publicId: string, locale: ContentLocaleCode, now: Date): Promise<PublishedAnnouncementPayload | null>;
}
```

Publication transactions update the old slot key and new slot key atomically, write AuditLog in the same transaction, and never mutate translation rows of a Published release.

For create/publish/schedule/disable/rollback, the same transaction first checks `ContentPublicationCommand.idempotencyKey`: matching fingerprints return the stored `result`; mismatched fingerprints throw `error.idempotency_key_reused`; new commands persist their result before commit. This is the only idempotency source—do not infer success from the latest status alone.

- [ ] **Step 4: Implement Service, controller, routes, and OpenAPI**

The Service must build five initial rows with `initializeContentTranslations`, persist the optional canonical `OfficialAnnouncement.affiliateTaskId`, verify that task's existence/status without exposing unauthorized task details, and return the exact stable error keys from Task 2. Public detail resolves the current Release by time and uses the existing marketplace visibility policy before returning `taskAction`. Controllers only parse validated values, get auth/request context, call Service, and wrap `successResponse`.

Register these exact routes; all `:publicId` values are UUIDs and all `:releaseId` values are positive integers. Draft creation carries `idempotencyKey`; PATCH carries `expectedLockVersion`; publish/schedule/disable carry both; rollback carries `expectedCurrentVersion` plus `idempotencyKey`, exactly as defined in Task 2:

```text
GET    /api/v1/backoffice/affiliate/announcements
POST   /api/v1/backoffice/affiliate/announcements
GET    /api/v1/backoffice/affiliate/announcements/:publicId/history
GET    /api/v1/backoffice/affiliate/announcements/:publicId/releases/:releaseId
PATCH  /api/v1/backoffice/affiliate/announcements/:publicId/releases/:releaseId
GET    /api/v1/backoffice/affiliate/announcements/:publicId/releases/:releaseId/preview
POST   /api/v1/backoffice/affiliate/announcements/:publicId/releases/:releaseId/publish
POST   /api/v1/backoffice/affiliate/announcements/:publicId/releases/:releaseId/schedule
POST   /api/v1/backoffice/affiliate/announcements/:publicId/releases/:releaseId/disable
POST   /api/v1/backoffice/affiliate/announcements/:publicId/releases/:releaseId/rollback
GET    /api/v1/affiliate/announcements/:publicId
```

The list/history endpoints use `page` and `pageSize` from `ContentHistoryQuery`; the public route requires `locale` and returns only the active one-locale projection.

- [ ] **Step 5: Run HTTP and OpenAPI tests**

Run: `npm --prefix backend test -- --runInBand tests/official-announcement.repository.test.ts tests/official-announcement.service.test.ts tests/official-announcement-api.test.ts tests/openapi.test.ts`

Expected: PASS with no internal User/Prisma fields in public responses.

- [ ] **Step 6: Commit**

```bash
git add backend/src/repositories/official-announcement.repository.ts backend/src/services/official-announcement.service.ts backend/src/controllers/official-announcement.controller.ts backend/src/routes/official-announcement.routes.ts backend/src/app.ts backend/src/api/openapi.ts backend/tests/official-announcement.repository.test.ts backend/tests/official-announcement.service.test.ts backend/tests/official-announcement-api.test.ts backend/tests/openapi.test.ts
git commit -m "feat: add localized affiliate announcements"
```

### Task 5: Carousel draft, target validation, and publication lifecycle

**Files:**
- Create: `backend/src/repositories/carousel-publication.repository.ts`
- Create: `backend/src/services/carousel-publication.service.ts`
- Create: `backend/src/controllers/carousel-publication.controller.ts`
- Create: `backend/src/routes/carousel-publication.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/carousel-publication.repository.test.ts`
- Create: `backend/tests/carousel-publication.service.test.ts`
- Create: `backend/tests/content-publication-api.test.ts`

**Interfaces:**
- Produces `CarouselPublicationService.getBackofficeScene`, `createDraft`, `replaceDraft`, `updateLocale`, `copyLocaleToAll`, `preview`, `publish`, `schedule`, `disable`, `rollback`, `history`, and `getPublishedScene`.
- Produces `CarouselPublicationService.searchTargets(scene, actor, query)` for protected, paginated target pickers.
- Public `getPublishedScene(scene, locale, actor, now)` returns one-locale `PublishedCarouselPayload`.
- Backoffice routes fix the scene from the path/route wrapper and never trust a body-supplied scene.

- [ ] **Step 1: Write failing target and state-machine tests**

Cover every approved combination:

```ts
expect(() => service.assertTarget("USER_HOME", { type: "shop", shopId: 7 })).not.toThrow();
expect(() => service.assertTarget("USER_HOME", { type: "affiliate_announcement", announcementPublicId })).toThrow("error.carousel.target_invalid");
expect(() => service.assertTarget("AFFILIATE_HOME_NOTICE", { type: "service", serviceId: 4 })).toThrow("error.carousel.target_invalid");
```

Also cover five-language completeness, image validity, contiguous sort order, slide windows, at least one potentially visible slide, dead target rejection, independent scenes, one-current-draft conflict, immediate publication, one scheduled slot, disable, rollback clone, idempotent repeat, optimistic conflict, old Published immutability, and audit. Target-search tests must cover pagination, text query, allowed-type enforcement, scope filtering, soft deletion, live status, and public-safe identifiers.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/carousel-publication.repository.test.ts tests/carousel-publication.service.test.ts tests/content-publication-api.test.ts`

Expected: FAIL because the Carousel domain is absent.

- [ ] **Step 3: Implement scene policy and public payloads**

Use explicit public contracts:

```ts
export type PublishedCarouselTarget =
  | { type: "shop"; publicId: string }
  | { type: "technician"; publicId: string }
  | { type: "service"; publicId: string }
  | { type: "affiliate_announcement"; publicId: string };

export interface PublishedCarouselSlide {
  id: string;
  badge: string | null;
  title: string;
  caption: string | null;
  ctaLabel: string | null;
  imageAltText: string;
  imageUrl: string;
  target: PublishedCarouselTarget;
}

export interface PublishedCarouselPayload {
  scene: "USER_HOME" | "AFFILIATE_HOME_NOTICE";
  locale: ContentLocaleCode;
  releaseVersion: number | null;
  generatedAt: string;
  slides: PublishedCarouselSlide[];
}
```

Resolve Shop targets through `Shop.publicIdentifier.publicId`. Resolve Technician targets through the profile's active `UserIdentity(type="technician") -> PublicIdentifier.publicId`; never return `TechnicianProfile.id` or `User.id`. Resolve Service targets through the `Service.publicId` introduced in Task 1; carousel responses never return Service numeric IDs.

Publication validation re-queries every target: Shop/Technician/Service must be published and not soft-deleted; Shop and Technician must have active public identifiers; an Affiliate announcement must have a currently published Release that covers the slide visibility window; an optional slide task must equal `OfficialAnnouncement.affiliateTaskId` and pass the existing Affiliate marketplace visibility policy. A task may be omitted from the public action when the current viewer cannot see it, but the slide may not publish with a mismatched task.

- [ ] **Step 4: Implement atomic repository methods**

The repository accepts complete mutation DTOs, creates all slide/translation rows in one transaction, uses `updateMany` with `lockVersion`, and switches nullable slot keys only after every validation query succeeds. `rollback` clones the selected history version into new rows and increments the scene version. Create and lifecycle transactions use `ContentPublicationCommand` with the same fingerprint/replay/reuse rules as Task 4.

- [ ] **Step 5: Wire fixed-scene routes and OpenAPI**

Backoffice routes:

```text
GET  /backoffice/content/carousels/user-home
POST /backoffice/content/carousels/user-home/releases
GET  /backoffice/content/carousels/user-home/history
GET  /backoffice/content/carousels/user-home/targets
GET  /backoffice/content/carousels/user-home/releases/:releaseId
PATCH /backoffice/content/carousels/user-home/releases/:releaseId
GET  /backoffice/content/carousels/user-home/releases/:releaseId/preview
POST /backoffice/content/carousels/user-home/releases/:releaseId/publish
POST /backoffice/content/carousels/user-home/releases/:releaseId/schedule
POST /backoffice/content/carousels/user-home/releases/:releaseId/disable
POST /backoffice/content/carousels/user-home/releases/:releaseId/rollback
GET  /backoffice/content/carousels/affiliate-home-notice
POST /backoffice/content/carousels/affiliate-home-notice/releases
GET  /backoffice/content/carousels/affiliate-home-notice/history
GET  /backoffice/content/carousels/affiliate-home-notice/targets
GET  /backoffice/content/carousels/affiliate-home-notice/releases/:releaseId
PATCH /backoffice/content/carousels/affiliate-home-notice/releases/:releaseId
GET  /backoffice/content/carousels/affiliate-home-notice/releases/:releaseId/preview
POST /backoffice/content/carousels/affiliate-home-notice/releases/:releaseId/publish
POST /backoffice/content/carousels/affiliate-home-notice/releases/:releaseId/schedule
POST /backoffice/content/carousels/affiliate-home-notice/releases/:releaseId/disable
POST /backoffice/content/carousels/affiliate-home-notice/releases/:releaseId/rollback
```

Every path above is mounted below `/api/v1`. Apply user-home permissions to only the first set and Affiliate notice permissions to only the second set. The shared release controller receives a server-created scene constant from each route registration.

`/targets` accepts `type`, `q`, `page`, and `pageSize`. User-home allows only `shop|technician|service`; Affiliate notice allows only `announcement|affiliate_task`. Responses use the standard paginated envelope and return display label, current status, and safe target DTO only—never arbitrary internal scene selection or unrestricted task rows.

- [ ] **Step 6: Run tests and commit**

Run: `npm --prefix backend test -- --runInBand tests/carousel-publication.repository.test.ts tests/carousel-publication.service.test.ts tests/content-publication-api.test.ts tests/openapi.test.ts`

Expected: PASS.

```bash
git add backend/src/repositories/carousel-publication.repository.ts backend/src/services/carousel-publication.service.ts backend/src/controllers/carousel-publication.controller.ts backend/src/routes/carousel-publication.routes.ts backend/src/app.ts backend/src/api/openapi.ts backend/tests/carousel-publication.repository.test.ts backend/tests/carousel-publication.service.test.ts backend/tests/content-publication-api.test.ts backend/tests/openapi.test.ts
git commit -m "feat: add formal carousel publication lifecycle"
```

### Task 6: Scheduled activation Worker with failure isolation

**Files:**
- Create: `backend/src/services/content-publication-scheduler.service.ts`
- Create: `backend/src/workers/content-publication.worker.ts`
- Modify: `backend/src/server.ts`
- Create: `backend/tests/content-publication-scheduler.service.test.ts`
- Create: `backend/tests/content-publication.worker.test.ts`

**Interfaces:**
- Produces `ContentPublicationSchedulerService.activateDue({ now, batchSize })`.
- Produces `ContentPublicationWorker.start/stop/runOnce` with no overlapping executions.
- Reuses announcement/carousel repository atomic activation methods from Tasks 4 and 5.

- [ ] **Step 1: Write failing scheduler and Worker tests**

```ts
const result = await service.activateDue({ now, batchSize: 50 });
expect(result).toEqual({ scanned: 3, activated: 2, failed: 1 });
expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ aggregateType: "carousel" }));
```

Scheduler tests must also assert each failed item writes an `AuditLog` action `content_publication.schedule_failed` with aggregate type/id, release ID, stable error key, and request/run correlation ID, while later due items continue. Worker tests must assert immediate first run, one `unref()` interval, overlap prevention, logged failure recovery, and clean double stop.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/content-publication-scheduler.service.test.ts tests/content-publication.worker.test.ts`

Expected: FAIL because scheduler files are absent.

- [ ] **Step 3: Implement scheduler and Worker**

Inject `AuditLogRepositoryPort` from `backend/src/repositories/audit-log.repository.ts` into the scheduler. Fetch due rows in deterministic `(publishAt, id)` order. For each row, open a transaction, lock that exact release with a parameterized `Prisma.sql ... FOR UPDATE` query following the existing Affiliate task repository pattern, re-check `SCHEDULED`, slot ownership, due time, and `activationAttempts < CONTENT_PUBLICATION_MAX_ACTIVATION_ATTEMPTS`, then activate atomically. Use the stable command key `content-publication:{aggregateType}:{aggregateKey}:release:{releaseId}:activate` so concurrent workers replay instead of double-switching.

Catch failures per due row, increment `activationAttempts` and store the stable error key/attempt time, then call `auditLogRepository.create` with `actorId: null`, action `content_publication.schedule_failed`, the release target, and the failure metadata. On the configured final attempt, set the release to `DISABLED` and clear its scheduled slot; otherwise leave it scheduled for the next interval. Call the failure observer, increment `failed`, and continue the batch; only an inability to enumerate due work fails the whole run.

```ts
export interface ContentPublicationActivationResult {
  scanned: number;
  activated: number;
  failed: number;
}

export class ContentPublicationWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(
    private readonly service: { activateDue(input: { now: Date; batchSize: number }): Promise<ContentPublicationActivationResult> },
    private readonly logger: { info(context: Record<string, unknown>, message: string): void; error(context: Record<string, unknown>, message: string): void },
    private readonly intervalMs: number,
    private readonly batchSize: number,
    private readonly now: () => Date = () => new Date()
  ) {}

  public start(): void {
    if (this.timer) return;
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    this.timer.unref();
  }

  public stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  public async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.service.activateDue({ now: this.now(), batchSize: this.batchSize });
      this.logger.info(result, "Content publication activation completed");
    } catch (error) {
      this.logger.error({ error }, "Content publication activation failed");
    } finally {
      this.running = false;
    }
  }
}
```

- [ ] **Step 4: Wire start and shutdown**

Instantiate the scheduler with real repositories in `server.ts`, start it only after `listen`, and stop it alongside all existing workers in `createShutdownHandler`.

- [ ] **Step 5: Run tests and commit**

Run: `npm --prefix backend test -- --runInBand tests/content-publication-scheduler.service.test.ts tests/content-publication.worker.test.ts`

Expected: PASS.

```bash
git add backend/src/services/content-publication-scheduler.service.ts backend/src/workers/content-publication.worker.ts backend/src/server.ts backend/tests/content-publication-scheduler.service.test.ts backend/tests/content-publication.worker.test.ts
git commit -m "feat: activate scheduled content releases"
```

### Task 7: Public fixed-scene APIs and target privacy

**Files:**
- Modify: `backend/src/controllers/carousel-publication.controller.ts`
- Modify: `backend/src/routes/carousel-publication.routes.ts`
- Modify: `backend/src/controllers/official-announcement.controller.ts`
- Modify: `backend/src/routes/official-announcement.routes.ts`
- Modify: `backend/src/repositories/core-read.repository.ts`
- Modify: `backend/src/services/core-read.service.ts`
- Modify: `backend/src/controllers/core-read.controller.ts`
- Modify: `backend/src/routes/core-read.routes.ts`
- Modify: `backend/src/validators/core-read.validator.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/content-publication-api.test.ts`
- Modify: `backend/tests/official-announcement-api.test.ts`
- Modify: `backend/tests/core-read-api.test.ts`
- Modify: `backend/tests/openapi.test.ts`

**Interfaces:**
- Produces `GET /api/v1/content/carousels/user-home?locale=...` for authenticated users.
- Produces `GET /api/v1/affiliate/content/carousel?locale=...` requiring `page:affiliate-marketplace`.
- Produces `GET /api/v1/affiliate/announcements/:publicId?locale=...` requiring active Affiliate identity and page permission.

- [ ] **Step 1: Extend failing API tests**

Assert fixed scene selection, five accepted locales, alias rejection at the API boundary, one-locale response, active time filtering, zero-slide success, unauthenticated 401, Affiliate permission 403, hidden task action, and no `releaseId`, `userId`, numeric Shop/Technician/Service IDs, draft translations, slot keys, or audit metadata. Extend core-read tests so `/api/v1/services/:id` accepts a Service UUID, returns the same detail as its legacy numeric route, rejects malformed non-numeric/non-UUID input, and never treats a numeric string as a UUID.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/content-publication-api.test.ts tests/official-announcement-api.test.ts tests/core-read-api.test.ts tests/openapi.test.ts`

Expected: FAIL on missing public routes or over-broad payloads.

- [ ] **Step 3: Implement fixed-scene adapters**

```ts
router.get(
  "/content/carousels/user-home",
  authenticate(),
  validateRequest({ query: publicCarouselQuerySchema }),
  controller.getUserHome
);

router.get(
  "/affiliate/content/carousel",
  authenticate(),
  createAuthorizeMiddleware("page:affiliate-marketplace"),
  validateRequest({ query: publicCarouselQuerySchema }),
  controller.getAffiliateHomeNotice
);
```

The controller hard-codes the scene passed to Service. The Service filters dead targets at read time and never falls back to another locale or historical release.

Add `coreReadServiceIdParamSchema = z.object({ id: z.union([z.coerce.number().int().positive(), z.string().uuid()]) })` only to the public Service detail route. Change `findServiceDetail` to accept `number | string` and build either `{ id }` or `{ publicId }`; Shop/Technician/customer route validators remain numeric and unchanged. Include `publicId` in `ServiceCardPayload` so the carousel target and Service detail route use the same stable identifier.

- [ ] **Step 4: Run tests and commit**

Run: `npm --prefix backend test -- --runInBand tests/content-publication-api.test.ts tests/official-announcement-api.test.ts tests/core-read-api.test.ts tests/openapi.test.ts`

Expected: PASS.

```bash
git add backend/src/controllers/carousel-publication.controller.ts backend/src/routes/carousel-publication.routes.ts backend/src/controllers/official-announcement.controller.ts backend/src/routes/official-announcement.routes.ts backend/src/repositories/core-read.repository.ts backend/src/services/core-read.service.ts backend/src/controllers/core-read.controller.ts backend/src/routes/core-read.routes.ts backend/src/validators/core-read.validator.ts backend/src/api/openapi.ts backend/tests/content-publication-api.test.ts backend/tests/official-announcement-api.test.ts backend/tests/core-read-api.test.ts backend/tests/openapi.test.ts
git commit -m "feat: expose localized carousel reads"
```

### Task 8: Typed frontend API, locale mapping, and shared carousel adapter

**Files:**
- Create: `src/api/contentPublication.ts`
- Create: `src/features/content-publication/locales.ts`
- Create: `src/features/content-publication/usePublishedCarousel.ts`
- Create: `src/features/content-publication/PublishedCarousel.tsx`
- Create: `src/features/content-publication/i18n.ts`
- Modify: `src/features/core-read/api.ts`
- Modify: `src/pages/user/ServiceDetailPage.tsx`
- Create: `src/api/contentPublication.test.ts`
- Create: `src/features/content-publication/PublishedCarousel.test.tsx`
- Modify: `src/pages/user/ServiceDetailPage.test.ts`
- Modify: `src/i18n/translations.test.ts`

**Interfaces:**
- Produces `contentPublicationApi.getUserHomeCarousel`, `getAffiliateCarousel`, `getAffiliateAnnouncement`, and all backoffice lifecycle methods.
- Produces `contentPublicationApi.searchCarouselTargets(scene, query)` against the fixed-scene paginated target endpoints from Task 5.
- Produces `toContentLocale(language): ContentLocaleCode`.
- Produces `<PublishedCarousel scene="user-home" | "affiliate-home-notice" />` with loading/error/empty isolation.

- [ ] **Step 1: Write failing API, locale, and UI tests**

```ts
expect(toContentLocale("zh")).toBe("zh-CN");
expect(toContentLocale("zh-Hant")).toBe("zh-TW");
expect(toContentLocale("ko")).toBe("ko");
```

API tests assert exact endpoint/query/body contracts and raw image `Blob` upload. Component tests assert loading skeleton, retry after rejected Promise, explicit empty state, no global throw, slide rendering, and scene-specific target navigation. Service detail tests assert both a legacy numeric route and the new UUID route call the exact same typed core-read API without coercing the UUID to `NaN`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/api/contentPublication.test.ts src/features/content-publication/PublishedCarousel.test.tsx src/pages/user/ServiceDetailPage.test.ts`

Expected: FAIL because the modules are absent.

- [ ] **Step 3: Implement exact public types and API calls**

```ts
export type ContentLocaleCode = "zh-CN" | "zh-TW" | "en" | "ja" | "ko";
export type PublishedCarouselScene = "USER_HOME" | "AFFILIATE_HOME_NOTICE";

export const contentPublicationApi = {
  getUserHomeCarousel(locale: ContentLocaleCode) {
    return httpClient.request<PublishedCarouselPayload>("/content/carousels/user-home", { query: { locale } });
  },
  getAffiliateCarousel(locale: ContentLocaleCode) {
    return httpClient.request<PublishedCarouselPayload>("/affiliate/content/carousel", { query: { locale } });
  },
  getAffiliateAnnouncement(publicId: string, locale: ContentLocaleCode) {
    return httpClient.request<PublishedAnnouncementPayload>(`/affiliate/announcements/${encodeURIComponent(publicId)}`, { query: { locale } });
  }
};
```

Add protected backoffice methods, including paginated target search, using the same `httpClient`, `expectedLockVersion`, and idempotency bodies; do not create a second fetch wrapper.

- [ ] **Step 4: Implement cancellation-safe state and shared renderer**

Map server targets to existing routes:

```ts
export function carouselTargetPath(target: PublishedCarouselTarget): string {
  if (target.type === "shop") return `/stores/${encodeURIComponent(target.publicId)}`;
  if (target.type === "technician") return `/profiles/technician/${encodeURIComponent(target.publicId)}`;
  if (target.type === "service") return `/services/${encodeURIComponent(target.publicId)}`;
  return `/afirieito/announcements/${encodeURIComponent(target.publicId)}`;
}
```

The hook uses an effect cancellation flag and a revision counter for Retry; locale or scene change starts a fresh request. `PublishedCarousel` passes only API slides to the existing `FeatureCarousel`. Update `coreReadIdFromRoute` and `getServiceDetail` to preserve a valid UUID string while keeping positive numeric behavior; do not broaden Shop or Technician API signatures.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- src/api/contentPublication.test.ts src/features/content-publication/PublishedCarousel.test.tsx src/pages/user/ServiceDetailPage.test.ts src/i18n/translations.test.ts`

Expected: PASS for all five locales and state branches.

```bash
git add src/api/contentPublication.ts src/features/content-publication/locales.ts src/features/content-publication/usePublishedCarousel.ts src/features/content-publication/PublishedCarousel.tsx src/features/content-publication/i18n.ts src/features/core-read/api.ts src/pages/user/ServiceDetailPage.tsx src/api/contentPublication.test.ts src/features/content-publication/PublishedCarousel.test.tsx src/pages/user/ServiceDetailPage.test.ts src/i18n/translations.test.ts
git commit -m "feat: add shared formal carousel client"
```

### Task 9: Five-language backoffice announcement and carousel editors

**Files:**
- Create: `src/features/content-publication/LocalizedCarouselEditor.tsx`
- Create: `src/features/content-publication/AnnouncementEditor.tsx`
- Modify: `src/pages/admin/CarouselPage.tsx`
- Create: `src/pages/admin/AffiliateNoticeCarouselPage.tsx`
- Modify: `src/components/admin/AdminLayout.tsx`
- Modify: `src/App.tsx`
- Create: `src/features/content-publication/LocalizedCarouselEditor.test.tsx`
- Modify: `src/pages/admin/AdminCapabilityRoutes.test.ts`

**Interfaces:**
- Produces one editor with fixed `scene`, `readPermission`, `editPermission`, and `publishPermission` props.
- `CarouselPage` passes only `user-home`; `AffiliateNoticeCarouselPage` passes only `affiliate-home-notice` and embeds `AnnouncementEditor`.
- Produces separate menu entries with independent permissions.

- [ ] **Step 1: Write failing editor and route tests**

Test: server draft loading; five exact language tabs; initial-copy indicator; independent locale edits; explicit copy confirmation; media upload; server-backed paginated typed target search; reorder; preview; save; publish now; schedule; disable/rollback reason capture; 403 read-only; 409 conflict reload; preserved in-memory input after failed save; and no scene value read from URL/body input.

```tsx
render(<LocalizedCarouselEditor scene="user-home" />);
expect(screen.getAllByRole("tab").map((node) => node.textContent)).toEqual(["简体中文", "繁體中文", "English", "日本語", "한국어"]);
```

Route tests require `/admin/carousel` and `/admin/afirieito/announcements/carousel`, plus the two separate AdminLayout labels.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/features/content-publication/LocalizedCarouselEditor.test.tsx src/pages/admin/AdminCapabilityRoutes.test.ts`

Expected: FAIL because the formal editor and Affiliate notice route are absent.

- [ ] **Step 3: Implement editor state without browser persistence**

Use one reducer with explicit server state:

```ts
type EditorState = {
  load: "loading" | "ready" | "error";
  draft: BackofficeCarouselRelease | null;
  selectedLocale: ContentLocaleCode;
  dirty: boolean;
  saving: boolean;
  error: string | null;
};
```

Do not import `homeCarouselStore`, `browserStorage`, or `localStorage`. Save sends the complete server draft with `expectedLockVersion`; successful save replaces the local draft with the returned version.

- [ ] **Step 4: Implement wrappers, menu, and protected routes**

```tsx
export function CarouselPage() {
  return <LocalizedCarouselEditor scene="user-home" />;
}

export function AffiliateNoticeCarouselPage() {
  return <LocalizedCarouselEditor scene="affiliate-home-notice" announcementEditor={<AnnouncementEditor />} />;
}
```

Protect routes with the corresponding page permission and use `PermissionGate` for edit/publish controls. Rename the platform item to “用户端首页轮播图” and add “联盟营销公告轮播” under the `TEST` Affiliate section.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- src/features/content-publication/LocalizedCarouselEditor.test.tsx src/pages/admin/AdminCapabilityRoutes.test.ts src/App.test.tsx`

Expected: PASS.

```bash
git add src/features/content-publication/LocalizedCarouselEditor.tsx src/features/content-publication/AnnouncementEditor.tsx src/pages/admin/CarouselPage.tsx src/pages/admin/AffiliateNoticeCarouselPage.tsx src/components/admin/AdminLayout.tsx src/App.tsx src/features/content-publication/LocalizedCarouselEditor.test.tsx src/pages/admin/AdminCapabilityRoutes.test.ts src/App.test.tsx
git commit -m "feat: add localized carousel backoffice editors"
```

### Task 10: Replace user-home browser carousel with formal API

**Files:**
- Modify: `src/pages/user/HomePage.tsx`
- Modify: `src/pages/user/HomePage.test.ts`

**Interfaces:**
- Consumes `<PublishedCarousel scene="user-home" />` from Task 8.
- Removes user-home imports/calls to `getResolvedCarouselSlides`, `resolveCarouselTargetPath`, and `useCarouselStore`.
- Leaves `src/state/homeCarouselStore.ts` available only for the separate legacy timeline boundary.

- [ ] **Step 1: Write the failing source and component contract**

```ts
expect(source).toContain('<PublishedCarousel scene="user-home"');
expect(source).not.toContain("useCarouselStore");
expect(source).not.toContain('getResolvedCarouselSlides("home"');
expect(source).not.toContain("resolveCarouselTargetPath");
```

Add a rendered test proving an API failure shows a retry region between the reminder and quick actions without hiding recommendations or triggering the root recovery view.

- [ ] **Step 2: Run test and verify RED**

Run: `npm test -- src/pages/user/HomePage.test.ts`

Expected: FAIL because HomePage still reads the browser store.

- [ ] **Step 3: Replace only the user-home carousel slice**

Remove local carousel memo/revision state and render:

```tsx
<PublishedCarousel cardHeightClassName="h-[204px]" scene="user-home" />
```

Keep the existing reminder above and quick-action section below. Do not alter recommendation, booking, Social, or layout-store behavior.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- src/pages/user/HomePage.test.ts src/features/content-publication/PublishedCarousel.test.tsx src/components/client-ui/FeatureCarousel.test.tsx`

Expected: PASS.

```bash
git add src/pages/user/HomePage.tsx src/pages/user/HomePage.test.ts
git commit -m "feat: connect user home carousel to formal API"
```

### Task 11: Affiliate notice carousel and announcement detail

**Files:**
- Modify: `src/pages/mobile/BusinessCpsPage.tsx`
- Modify: `src/pages/mobile/BusinessCpsPage.test.tsx`
- Create: `src/features/content-publication/AffiliateAnnouncementDetailPage.tsx`
- Create: `src/features/content-publication/AffiliateAnnouncementDetailPage.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes `<PublishedCarousel scene="affiliate-home-notice" />`.
- Produces route `/afirieito/announcements/:announcementPublicId`.
- Consumes `contentPublicationApi.getAffiliateAnnouncement` and shows task CTA only when `taskAction.available === true`.

- [ ] **Step 1: Write failing page and route tests**

Require the carousel directly below `MobileFullscreenHeader`, five-language reload through the shared hook, isolated retry, announcement title/body rendering, inaccessible task CTA omission, visible task CTA navigation, 404 unavailable state, and route registration.

```tsx
expect(source).toContain('<PublishedCarousel scene="affiliate-home-notice"');
expect(appSource).toContain('path="/afirieito/announcements/:announcementPublicId"');
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/pages/mobile/BusinessCpsPage.test.tsx src/features/content-publication/AffiliateAnnouncementDetailPage.test.tsx src/App.test.tsx`

Expected: FAIL because the carousel/detail route is absent.

- [ ] **Step 3: Add the formal carousel without claiming unrelated features complete**

```tsx
<MobileFullscreenHeader dark={isNight} title={t("联盟营销")} />
<main className="space-y-5 px-4 pb-28 pt-4">
  <PublishedCarousel scene="affiliate-home-notice" />
  <ExistingAffiliateCapabilityBoundary />
</main>
```

Extract the existing unrelated-feature notice into a named local component. The real announcement carousel is live; the task marketplace gate remains explicit until its separate micro-step.

- [ ] **Step 4: Implement announcement detail**

Load by route public ID and current content locale. Render server title, summary, body, publication time, back action, and a task button only when the API provides an available action. Do not render raw HTML; preserve line breaks with CSS or structured paragraphs.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- src/pages/mobile/BusinessCpsPage.test.tsx src/features/content-publication/AffiliateAnnouncementDetailPage.test.tsx src/App.test.tsx`

Expected: PASS.

```bash
git add src/pages/mobile/BusinessCpsPage.tsx src/pages/mobile/BusinessCpsPage.test.tsx src/features/content-publication/AffiliateAnnouncementDetailPage.tsx src/features/content-publication/AffiliateAnnouncementDetailPage.test.tsx src/App.tsx src/App.test.tsx
git commit -m "feat: add affiliate announcement carousel"
```

### Task 12: Real-database checker, full verification, and browser acceptance

**Files:**
- Create: `backend/scripts/check-localized-carousel-publication-flow.ts`
- Modify: `backend/package.json`
- Create: `backend/tests/localized-carousel-publication-flow-script.test.ts`
- Create: `docs/localized-carousel-publication.md`

**Interfaces:**
- Produces `npm --prefix backend run check:localized-carousel-publication-flow`.
- Checker refuses production flags, remote MySQL, and production-looking database names; it creates uniquely tagged records and removes only those records in `finally`.
- Documentation records actual commands/results and browser evidence, not planned outcomes.

- [ ] **Step 1: Write the failing checker safety test**

Test the script source for production refusal, local-host enforcement, unique run marker, `try/finally`, both scenes, all five locales, immediate/scheduled/disable/rollback, audit reconciliation, and scoped cleanup.

- [ ] **Step 2: Run test and verify RED**

Run: `npm --prefix backend test -- --runInBand tests/localized-carousel-publication-flow-script.test.ts`

Expected: FAIL because the checker is absent.

- [ ] **Step 3: Implement checker and package script**

The checker must execute this real lifecycle through Services/Repositories against the configured local database:

```text
create real MediaAsset
create five-language announcement draft
edit English independently
publish announcement
create USER_HOME draft with Shop/Technician/Service targets
create AFFILIATE_HOME_NOTICE draft with announcement and task targets
publish both scenes
read all five locales and reconcile targets
schedule successor and activate it
disable one scene
rollback to a historical release as a higher version
reconcile AuditLog actions
delete only the run marker's records and stored media file
```

Add `"check:localized-carousel-publication-flow": "tsx scripts/check-localized-carousel-publication-flow.ts"` to backend scripts.

- [ ] **Step 4: Run focused and full automated verification**

Run:

```bash
npm --prefix backend test -- --runInBand tests/content-locales.test.ts tests/localized-carousel-schema.test.ts tests/localized-carousel-permissions.test.ts tests/content-media.service.test.ts tests/content-media-api.test.ts tests/official-announcement.repository.test.ts tests/official-announcement.service.test.ts tests/official-announcement-api.test.ts tests/carousel-publication.repository.test.ts tests/carousel-publication.service.test.ts tests/content-publication-api.test.ts tests/content-publication-scheduler.service.test.ts tests/content-publication.worker.test.ts tests/core-read-api.test.ts tests/openapi.test.ts tests/localized-carousel-publication-flow-script.test.ts
npm test -- src/api/contentPublication.test.ts src/features/content-publication/PublishedCarousel.test.tsx src/features/content-publication/LocalizedCarouselEditor.test.tsx src/features/content-publication/AffiliateAnnouncementDetailPage.test.tsx src/pages/user/HomePage.test.ts src/pages/user/ServiceDetailPage.test.ts src/pages/mobile/BusinessCpsPage.test.tsx src/pages/admin/AdminCapabilityRoutes.test.ts src/App.test.tsx src/i18n/translations.test.ts
npm --prefix backend run lint
npm --prefix backend run build
npm run lint
npm test
npm run verify:production-build
```

Expected: all commands exit 0. If a repository-wide pre-existing failure remains, record its exact file/error separately and do not describe the feature as complete until the changed-file and acceptance gates are green.

- [ ] **Step 5: Run real DB checker**

Run: `ENV_FILE=.env.dev npm --prefix backend run check:localized-carousel-publication-flow`

Expected: reports both scenes, all five locales, lifecycle transitions, audit reconciliation, and cleanup success; exits 0.

- [ ] **Step 6: Perform browser acceptance on formal local services**

Start or verify backend `3000`, frontend `5180`, MySQL `3307`, and Redis `6379`. Use formal operations and Affiliate/customer accounts, then verify:

1. `/pf-admin.html#/admin/carousel` creates and publishes `USER_HOME`.
2. `/pf-admin.html#/admin/afirieito/announcements/carousel` creates the announcement and `AFFILIATE_HOME_NOTICE` release.
3. Initial Japanese input appears in all five draft tabs; editing English leaves Japanese unchanged.
4. Preview, immediate publish, schedule, disable, and rollback work with real API requests.
5. `/user.html#/` shows the current-locale carousel between reminder and quick actions; Shop, Technician, and Service links open real detail pages.
6. `/afirieito.html#/afirieito` shows the separate announcement carousel; detail opens and optional task visibility is correct.
7. Refresh, logout/login, and backend restart preserve content.
8. Read-only operations account cannot edit or publish.
9. API failure leaves the rest of each home page usable and does not open the root recovery page.
10. Final console warning/error count is zero.

- [ ] **Step 7: Write evidence-backed delivery documentation**

Document exact migrations, tables, API endpoints, permissions, audit actions, test counts, checker output, browser routes, language screenshots, remaining deferred domains, and rollback procedure in `docs/localized-carousel-publication.md`.

- [ ] **Step 8: Commit final checker and evidence**

```bash
git add backend/scripts/check-localized-carousel-publication-flow.ts backend/package.json backend/tests/localized-carousel-publication-flow-script.test.ts docs/localized-carousel-publication.md
git commit -m "test: verify localized carousel publication"
```

## Rollback Boundary

- Application rollback removes only the new routes, Worker, and UI wiring; published rows remain readable for forensic/audit use.
- Database rollback is additive and must not drop content tables after production data exists. Disable both scenes through the formal API, deploy the previous application, and retain tables until a separately approved archival migration.
- The user-home frontend can temporarily render the formal empty/error state after route rollback; it must not reactivate `homeCarouselStore` as business truth.
- Existing Affiliate task, alliance, profile, wallet, Social, chat, Request, Booking, and customer-home recommendation flows remain untouched by this rollback.
