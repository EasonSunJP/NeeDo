# Technician Profile, Detail Page, Service Card, and Review Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one formal-data technician profile experience across self profile and public detail pages, aggregate fixed and custom review tags from completed-order reviews, and render every real service-information card through one shared component.

**Architecture:** Extend existing Prisma-backed profile, review, core-read, and pricing-mode contracts without replacing their routes. Add small shared backend tag-catalog/aggregation modules and two focused frontend presentation units: `UnifiedServiceInfoCard` and `TechnicianProfileInfoView`. Existing pages become adapters that fetch formal DTOs, map them once, and compose the same views; technician management injects service action controls through a slot.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Vitest 4, Node.js 22, Express, Zod, Prisma 7, MySQL 8, Jest, Supertest, Tailwind CSS.

## Global Constraints

- Follow `AGENTS.md`, `docs/00_MASTER_MICRO_STEP_PLAN.md`, `docs/08_CORE_READ_API_AND_API_CONTRACTS.md`, `docs/09_FRONTEND_MOCK_RETIREMENT_BATCH1.md`, and `docs/MOCK_RETIREMENT_MAP.md`.
- Do not add mock, demo, placeholder, fake API, synthetic counts, or fallback entity arrays.
- Do not use `ServiceItem.sales`, review count, exposure count, or static constants as service utilization count.
- Every backend mutation remains Zod-validated, permission-protected, auditable, and documented in OpenAPI.
- Public technician reads must honor `TechnicianProfile.visibility`; auth-free endpoints expose only `visibility = "public"`.
- Fixed special labels are exactly `魅力max`, `服务max`, `情绪max`, and `元气max`, in that order.
- A technician review may select zero to four fixed labels and at most one custom label.
- Each order contributes at most one count to each selected label; custom `×1` is hidden and `×2` or above is shown.
- Technician self-edit cannot write review-derived fixed or custom labels.
- Service-card field order is cover, service name, `￥price/duration分钟`, utilization count, public shop ID, shop address, description, tags.
- Technician service management retains move up, move down, and edit actions without duplicating card body markup.
- Technician personal-center information and data-center tabs do not show bottom navigation.
- Basic-information order is gender/age/height, languages, introduction, fixed special labels, custom review labels, privacy mode; services follow in a borderless outer section.
- Preserve unrelated dirty-worktree changes. Before every commit, run `git diff --cached --name-status` and stage only exact task files.
- Do not push, deploy, or apply production migrations in this plan.

---

## File and Responsibility Map

### Backend

- `backend/src/domain/technician-review-tags.ts`: canonical fixed-tag catalog, aliases, canonicalization, and fixed/custom classification.
- `backend/src/repositories/technician-review-tag-summary.repository.ts`: one aggregate query and deterministic fixed/custom count mapping.
- `backend/src/validators/booking.validator.ts`: technician-review fixed/custom submission limits.
- `backend/src/repositories/booking.repository.ts`: persist canonical fixed labels already produced by validation.
- `backend/prisma/schema.prisma`: additive technician gender field only.
- `backend/prisma/migrations/20260903120000_technician_profile_gender/migration.sql`: reversible additive schema migration.
- `backend/src/validators/technician-profile.validator.ts`: gender self-edit; remove review-derived profile-tag writes.
- `backend/src/repositories/technician-profile.repository.ts`: self-profile gender and review-tag summary.
- `backend/src/services/technician-profile.service.ts`: gender mutation mapping; no profile-tag mutation.
- `backend/src/validators/core-read.validator.ts`: numeric or formal `s##########` technician route IDs.
- `backend/src/repositories/core-read.repository.ts`: public visibility, full technician profile fields, review-tag summary, and formal service utilization count.
- `backend/src/services/core-read.service.ts`: numeric/public technician identifier pass-through.
- `backend/src/controllers/core-read.controller.ts`: typed technician route identifier parsing.
- `backend/src/repositories/pricing-mode.repository.ts`: technician-service public shop metadata and completed-order count without N+1 queries.
- `backend/src/services/pricing-mode.service.ts`: enriched technician-service DTO.
- `backend/src/api/openapi.ts`: all changed request and response schemas.

### Frontend

- `src/shared/order-detail/serviceReviewTagCatalog.ts`: fixed four-label UI catalog with zero default counts and no fake totals.
- `src/shared/order-detail/ServiceSessionUi.tsx`: multi-select fixed stamps and one custom label.
- `src/shared/service-card/model.ts`: one service-card display model.
- `src/shared/service-card/mappers.ts`: formal core, formal technician-service, and legacy-safe adapters.
- `src/shared/service-card/UnifiedServiceInfoCard.tsx`: one card body and optional management action slot.
- `src/shared/service-card/index.ts`: public exports.
- `src/shared/technician-profile/model.ts`: one technician profile display model.
- `src/shared/technician-profile/mappers.ts`: self/core DTO mapping.
- `src/shared/technician-profile/TechnicianProfileInfoView.tsx`: shared read-only technician profile composition.
- `src/shared/technician-profile/index.ts`: public exports.
- `src/features/core-read/api.ts`: enriched technician, review-tag, service-utilization DTOs and formal mappings.
- `src/features/core-read/technicianProfileApi.ts`: gender and review-tag-summary self DTO.
- `src/features/pricing-mode/api.ts`: enriched technician-service DTO.
- `src/shared/profile-card/SocialProfileMiniCard.tsx`: delegate service entities to the shared service card and route technician clicks to pages.
- `src/shared/profile-card/TechnicianShowcaseCard.tsx`: remove modal behavior and navigate to scoped detail routes.
- `src/shared/profile-card/TechnicianPublicInfoCard.tsx`: retain a compatibility adapter around the shared view; remove modal export and static tag counts.
- `src/pages/user/ProfileDetailPage.tsx`: full technician detail-card page.
- `src/pages/user/StoreDetailPage.tsx`: route technician-card clicks instead of opening a modal.
- `src/pages/user/CategoryPage.tsx`: replace the separate service preview UI.
- `src/pages/mobile/TechnicianPortalPage.tsx`: unified self profile, matching edit controls, borderless service section, correct metrics, and no personal-center bottom nav.
- `src/shared/profile-card/PlatformMembershipDetailCard.tsx`: privacy slot after user labels.
- `src/pages/user/UserCenterPage.tsx`: place privacy below labels.
- `src/i18n/translations.ts`: new user-visible labels in all supported languages.

---

### Task 1: Canonical Technician Review-Tag Submission Rules

**Files:**
- Create: `backend/src/domain/technician-review-tags.ts`
- Modify: `backend/src/validators/booking.validator.ts`
- Modify: `backend/tests/order-review-validator.test.ts`
- Modify: `backend/tests/order-review-service.test.ts`
- Modify: `src/shared/order-detail/serviceReviewTagCatalog.ts`
- Modify: `src/shared/order-detail/serviceReviewTagCatalog.test.ts`
- Modify: `src/shared/order-detail/ServiceSessionUi.tsx`
- Modify: `src/shared/order-detail/ServiceSessionUi.test.tsx`
- Modify: `src/pages/user/UserOrderDetailPage.tsx`
- Modify: `src/pages/user/UserOrderDetailPage.formal.test.tsx`

**Interfaces:**
- Produces: `technicianReviewSpecialTags`, `canonicalizeTechnicianReviewTag(label)`, `technicianReviewTagKey(label)`, and `isTechnicianReviewSpecialTag(label)`.
- Produces: technician-review API rule of four canonical fixed labels plus at most one custom label, whether that custom label is selected from existing suggestions or newly entered.
- Consumes: existing `unicodeDefaultCaseFoldKey` and immutable one-review-per-order repository contract.

- [ ] **Step 1: Write failing backend validator tests**

Add cases that require canonical labels, fixed-tag multi-select, alias collapse, and one custom label:

```ts
it("canonicalizes fixed technician labels and permits four fixed plus one custom", () => {
  const parsed = orderReviewCreateBodySchema.parse({
    ...validInput,
    tags: ["魅力值", "服务精神", "情绪价值", "元气", "手法细致"]
  });
  expect(parsed.tags).toEqual(["魅力max", "服务max", "情绪max", "元气max", "手法细致"]);
});

it("rejects two custom tags for a technician but preserves customer-tag rules", () => {
  expect(() => orderReviewCreateBodySchema.parse({
    ...validInput,
    tags: ["魅力max", "手法细致", "沟通耐心"]
  })).toThrow("technician review accepts at most one custom tag");
  expect(orderReviewCreateBodySchema.parse({
    ...validInput,
    targetType: "customer",
    tags: ["礼貌友好", "准时到达"]
  }).tags).toEqual(["礼貌友好", "准时到达"]);
});

it("rejects two aliases for the same fixed tag", () => {
  expect(() => orderReviewCreateBodySchema.parse({
    ...validInput,
    tags: ["魅力值", "魅力max"]
  })).toThrow("review tags must be unique");
});
```

- [ ] **Step 2: Run the validator tests and confirm the new contract fails**

Run: `cd backend && npm test -- --runInBand tests/order-review-validator.test.ts`

Expected: FAIL because aliases are not canonicalized and two custom technician tags are still accepted.

- [ ] **Step 3: Add the backend tag catalog and validator transform**

Create the catalog with exact stable codes and aliases:

```ts
import { unicodeDefaultCaseFoldKey } from "../utils/unicode-default-case-fold";

export const technicianReviewSpecialTags = [
  { code: "appeal_max", label: "魅力max", aliases: ["魅力值", "魅力值MAX", "魅力MAX"] },
  { code: "service_max", label: "服务max", aliases: ["服务精神", "服务精神MAX", "服务MAX"] },
  { code: "emotion_max", label: "情绪max", aliases: ["情绪价值", "情绪价值MAX", "情绪MAX"] },
  { code: "energy_max", label: "元气max", aliases: ["元气", "元气MAX"] }
] as const;

const aliasMap = new Map(
  technicianReviewSpecialTags.flatMap((tag) =>
    [tag.label, ...tag.aliases].map((label) => [unicodeDefaultCaseFoldKey(label.normalize("NFKC").trim()), tag] as const)
  )
);

export function canonicalizeTechnicianReviewTag(label: string): string {
  const normalized = label.normalize("NFKC").trim();
  return aliasMap.get(unicodeDefaultCaseFoldKey(normalized))?.label ?? normalized;
}

export function technicianReviewTagKey(label: string): string {
  return unicodeDefaultCaseFoldKey(canonicalizeTechnicianReviewTag(label));
}

export function isTechnicianReviewSpecialTag(label: string): boolean {
  return aliasMap.has(unicodeDefaultCaseFoldKey(label.normalize("NFKC").trim()));
}
```

In `orderReviewCreateBodySchema`, compare canonical keys during `superRefine`, reject more than one custom label only for `targetType === "technician"`, then transform technician tags with `canonicalizeTechnicianReviewTag` before the service fingerprints and persists them.

- [ ] **Step 4: Write failing frontend interaction tests**

Render four `kind: "stamp"` options, two existing `kind: "chip"` custom suggestions, and a custom input. Click two stamps and one existing custom label. Assert the submission contains all three labels, the other custom chip is disabled, and the custom input is disabled after the first custom selection.

```tsx
expect(submit).toHaveBeenCalledWith({
  rating: 5,
  tags: ["魅力max", "服务max", "手法细致"],
  comment: null
});
```

- [ ] **Step 5: Run the frontend tests and confirm the single-stamp rule fails**

Run: `npm test -- src/shared/order-detail/serviceReviewTagCatalog.test.ts src/shared/order-detail/ServiceSessionUi.test.tsx src/pages/user/UserOrderDetailPage.formal.test.tsx`

Expected: FAIL because stamp selection currently disables the other three and the order page still passes legacy label strings.

- [ ] **Step 6: Implement multi-select fixed stamps and one custom label**

Change the frontend catalog to the exact labels with zero default counts:

```ts
export const serviceReviewSpecialTags = [
  { label: "魅力max", count: 0, kind: "stamp", tone: "appeal" },
  { label: "服务max", count: 0, kind: "stamp", tone: "service" },
  { label: "情绪max", count: 0, kind: "stamp", tone: "empathy" },
  { label: "元气max", count: 0, kind: "stamp", tone: "energy" }
] satisfies ServiceReviewTagOption[];
```

Remove `selectedStampTag` and `disabledByStampLimit` from `ServiceReviewPrompt`. Add `selectedCustomLabel`, defined as the selected non-stamp option, and disable all other non-stamp chips plus the custom input once it exists. Keep duplicate-click protection. Pass `serviceReviewSpecialTags` from `UserOrderDetailPage` and keep `showTagCounts={false}` so the final-review screen does not invent totals.

- [ ] **Step 7: Run focused backend and frontend tests**

Run: `cd backend && npm test -- --runInBand tests/order-review-validator.test.ts tests/order-review-service.test.ts tests/order-review-api.test.ts`

Expected: PASS.

Run: `npm test -- src/shared/order-detail/serviceReviewTagCatalog.test.ts src/shared/order-detail/ServiceSessionUi.test.tsx src/pages/user/UserOrderDetailPage.formal.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit only Task 1 files**

```bash
git add backend/src/domain/technician-review-tags.ts backend/src/validators/booking.validator.ts backend/tests/order-review-validator.test.ts backend/tests/order-review-service.test.ts src/shared/order-detail/serviceReviewTagCatalog.ts src/shared/order-detail/serviceReviewTagCatalog.test.ts src/shared/order-detail/ServiceSessionUi.tsx src/shared/order-detail/ServiceSessionUi.test.tsx src/pages/user/UserOrderDetailPage.tsx src/pages/user/UserOrderDetailPage.formal.test.tsx
git diff --cached --name-status
git commit -m "feat(reviews): formalize technician review tags"
```

### Task 2: Formal Review-Tag Aggregation for Technician Profiles

**Files:**
- Create: `backend/src/repositories/technician-review-tag-summary.repository.ts`
- Create: `backend/tests/technician-review-tag-summary.repository.test.ts`
- Modify: `backend/src/repositories/technician-profile.repository.ts`
- Modify: `backend/tests/technician-profile.repository.test.ts`
- Modify: `backend/src/repositories/core-read.repository.ts`
- Modify: `backend/tests/core-read.repository.test.ts`
- Modify: `backend/tests/core-read-api.test.ts`
- Modify: `src/features/core-read/api.ts`
- Modify: `src/features/core-read/api.test.ts`
- Modify: `src/features/core-read/technicianProfileApi.ts`
- Modify: `src/features/core-read/technicianProfileApi.test.ts`
- Modify: `src/pages/user/UserOrderDetailPage.tsx`
- Modify: `src/pages/user/UserOrderDetailPage.formal.test.tsx`

**Interfaces:**
- Consumes: Task 1 canonical tag functions.
- Produces: `TechnicianReviewTagSummaryPayload` with `special` and `custom` arrays.
- Produces: `loadTechnicianReviewTagSummary(client, technicianProfileId)` used by self and public detail repositories.

- [ ] **Step 1: Write the aggregation repository test**

Use grouped rows containing aliases, repeated custom text, and first-use timestamps:

```ts
const groupedRows = [
  { label: "魅力值", _count: { _all: 1 }, _min: { createdAt: new Date("2026-01-01T00:00:00Z") } },
  { label: "魅力max", _count: { _all: 2 }, _min: { createdAt: new Date("2026-02-01T00:00:00Z") } },
  { label: "手法细致", _count: { _all: 1 }, _min: { createdAt: new Date("2026-01-02T00:00:00Z") } },
  { label: "手法細致", _count: { _all: 2 }, _min: { createdAt: new Date("2026-01-03T00:00:00Z") } }
];
```

Assert four fixed rows in product order, `魅力max.count === 3`, the two genuinely different custom strings remain separate, and zero-count fixed labels remain present.

- [ ] **Step 2: Run the new repository test and confirm the module is missing**

Run: `cd backend && npm test -- --runInBand tests/technician-review-tag-summary.repository.test.ts`

Expected: FAIL because the repository module does not exist.

- [ ] **Step 3: Implement one grouped query and deterministic mapping**

Define the payload:

```ts
export type TechnicianReviewSpecialTagCode = "appeal_max" | "service_max" | "emotion_max" | "energy_max";

export type TechnicianReviewTagSummaryPayload = {
  special: Array<{ code: TechnicianReviewSpecialTagCode; label: string; count: number }>;
  custom: Array<{ label: string; count: number }>;
};
```

Query `orderReviewTag.groupBy` once:

```ts
const rows = await client.orderReviewTag.groupBy({
  by: ["label"],
  where: {
    deletedAt: null,
    orderReview: {
      targetType: "TECHNICIAN",
      technicianProfileId,
      deletedAt: null
    }
  },
  _count: { _all: true },
  _min: { createdAt: true }
});
```

Fold aliases into fixed codes and custom labels into `technicianReviewTagKey`. For equal custom keys, retain the earliest label spelling, sum counts, sort by count descending then first timestamp ascending then UTF-8 label order, and return at most 20 custom rows.

- [ ] **Step 4: Add failing self-profile and public-detail contract tests**

Assert both payloads contain:

```ts
reviewTagSummary: {
  special: [
    { code: "appeal_max", label: "魅力max", count: 3 },
    { code: "service_max", label: "服务max", count: 0 },
    { code: "emotion_max", label: "情绪max", count: 0 },
    { code: "energy_max", label: "元气max", count: 0 }
  ],
  custom: [{ label: "手法细致", count: 2 }]
}
```

Also assert self-profile output no longer derives `specialTags` from `backofficeProfileTags` and no longer presents `profileTags` as user-review labels. Add a user-order-page test that an existing custom summary label is passed to `ServiceReviewPrompt` as a `kind: "chip"` option after the four fixed stamps.

- [ ] **Step 5: Run the profile contract tests and confirm they fail**

Run: `cd backend && npm test -- --runInBand tests/technician-profile.repository.test.ts tests/core-read.repository.test.ts tests/core-read-api.test.ts`

Expected: FAIL because neither payload has `reviewTagSummary`.

- [ ] **Step 6: Wire the aggregate into self and public detail reads**

Add `reviewTagSummary` to `TechnicianProfilePayload` and `TechnicianDetailPayload`. Fetch the profile and aggregate in parallel where possible:

```ts
const [profile, reviewTagSummary] = await Promise.all([
  this.client.technicianProfile.findFirst({
    where: { id: profileId, userId, deletedAt: null },
    include: profileInclude
  }),
  loadTechnicianReviewTagSummary(this.client, profileId)
]);
```

Pass the summary into mapping functions for both `findMine` and the return value of `updateMine`; a profile update does not change review tags, but its response must keep the same complete contract. Remove `backofficeProfileTags` from `profileInclude` if no remaining self-profile field consumes it. Keep legacy database `profileTags` intact but stop treating it as a review-derived field.

- [ ] **Step 7: Update frontend DTOs and mapping tests**

Add the identical `TechnicianReviewTagSummary` shape to `src/features/core-read/api.ts` and `src/features/core-read/technicianProfileApi.ts`; update fixtures without fallback arrays:

```ts
export type TechnicianReviewTagSummary = {
  special: Array<{
    code: "appeal_max" | "service_max" | "emotion_max" | "energy_max";
    label: string;
    count: number;
  }>;
  custom: Array<{ label: string; count: number }>;
};
```

In `UserOrderDetailPage`, load the reviewed technician's formal detail when a technician ID exists and pass:

```ts
[
  ...serviceReviewSpecialTags,
  ...technicianDetail.reviewTagSummary.custom.map((tag) => ({
    label: tag.label,
    count: tag.count,
    kind: "chip" as const
  }))
]
```

If the detail read fails, keep the four fixed options and show the existing formal read error; do not substitute local tag suggestions.

- [ ] **Step 8: Run all Task 2 tests**

Run: `cd backend && npm test -- --runInBand tests/technician-review-tag-summary.repository.test.ts tests/technician-profile.repository.test.ts tests/core-read.repository.test.ts tests/core-read-api.test.ts`

Expected: PASS.

Run: `npm test -- src/features/core-read/api.test.ts src/features/core-read/technicianProfileApi.test.ts src/pages/user/UserOrderDetailPage.formal.test.tsx`

Expected: PASS.

- [ ] **Step 9: Commit only Task 2 files**

```bash
git add backend/src/repositories/technician-review-tag-summary.repository.ts backend/tests/technician-review-tag-summary.repository.test.ts backend/src/repositories/technician-profile.repository.ts backend/tests/technician-profile.repository.test.ts backend/src/repositories/core-read.repository.ts backend/tests/core-read.repository.test.ts backend/tests/core-read-api.test.ts src/features/core-read/api.ts src/features/core-read/api.test.ts src/features/core-read/technicianProfileApi.ts src/features/core-read/technicianProfileApi.test.ts src/pages/user/UserOrderDetailPage.tsx src/pages/user/UserOrderDetailPage.formal.test.tsx
git diff --cached --name-status
git commit -m "feat(profiles): expose formal technician review tag counts"
```

### Task 3: Technician Gender, Self-Edit Contract, and Public Privacy

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260903120000_technician_profile_gender/migration.sql`
- Create: `backend/tests/technician-profile-gender-schema.test.ts`
- Modify: `backend/src/validators/technician-profile.validator.ts`
- Modify: `backend/src/repositories/technician-profile.repository.ts`
- Modify: `backend/src/services/technician-profile.service.ts`
- Modify: `backend/tests/technician-profile-validator.test.ts`
- Modify: `backend/tests/technician-profile.repository.test.ts`
- Modify: `backend/tests/technician-profile.service.test.ts`
- Modify: `backend/tests/technician-profile-api.test.ts`
- Modify: `backend/src/validators/core-read.validator.ts`
- Modify: `backend/src/controllers/core-read.controller.ts`
- Modify: `backend/src/services/core-read.service.ts`
- Modify: `backend/src/repositories/core-read.repository.ts`
- Modify: `backend/tests/core-read.repository.test.ts`
- Modify: `backend/tests/core-read-api.test.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/openapi.test.ts`
- Modify: `src/features/core-read/api.ts`
- Modify: `src/features/core-read/technicianProfileApi.ts`

**Interfaces:**
- Produces: `TechnicianProfileGender = "female" | "male" | "private"` on self and public DTOs.
- Produces: technician route identifier `number | s##########`.
- Changes: `PATCH /api/v1/technician-profile/me` accepts `gender` and rejects `profileTags`.
- Changes: auth-free technician list/detail reads include only public visibility.

- [ ] **Step 1: Write the failing schema contract test**

Read schema and migration files. Assert:

```ts
expect(schema).toMatch(/model TechnicianProfile[\s\S]*gender\s+String\s+@default\("private"\)/);
expect(migration).toContain("ADD COLUMN `gender` VARCHAR(20) NOT NULL DEFAULT 'private'");
expect(migration).not.toContain("DROP TABLE");
```

- [ ] **Step 2: Run the schema test and confirm it fails**

Run: `cd backend && npm test -- --runInBand tests/technician-profile-gender-schema.test.ts`

Expected: FAIL because the column and migration do not exist.

- [ ] **Step 3: Add the field and additive migration**

Add to `TechnicianProfile`:

```prisma
gender String @default("private") @db.VarChar(20)
```

Migration body:

```sql
ALTER TABLE `technician_profiles`
  ADD COLUMN `gender` VARCHAR(20) NOT NULL DEFAULT 'private' AFTER `base_longitude`;
```

- [ ] **Step 4: Write failing validator/service/repository/API tests**

Add `gender: "female"` to valid payloads; reject `gender: "unknown"`; reject `profileTags` in the self-edit body. Assert repository update data contains `gender: "female"`, service audit changed fields contains `gender`, and API output returns the persisted value.

- [ ] **Step 5: Run the technician-profile tests and confirm they fail**

Run: `cd backend && npm test -- --runInBand tests/technician-profile-validator.test.ts tests/technician-profile.repository.test.ts tests/technician-profile.service.test.ts tests/technician-profile-api.test.ts`

Expected: FAIL because gender is absent and profile tags are still writable.

- [ ] **Step 6: Implement the profile contract**

Add this shared backend type near the repository payload:

```ts
export type TechnicianProfileGender = "female" | "male" | "private";
```

Add `gender` to mutation/payload/map/update data and service mutation. In the validator use:

```ts
gender: z.enum(["female", "male", "private"]).optional()
```

Remove `profileTags` from `TechnicianProfileMutation`, `TechnicianProfileUpdateBody`, and service mapping. Do not drop the database column because historical internal metadata may still exist.

- [ ] **Step 7: Write failing public-privacy and public-ID tests**

Assert the core repository query includes `visibility: "public"`. Add API tests for both `/api/v1/technicians/31` and `/api/v1/technicians/s1234567890`. Assert detail returns gender, height, languages, years, metrics, and the Task 2 review summary.

- [ ] **Step 8: Run core-read tests and confirm they fail**

Run: `cd backend && npm test -- --runInBand tests/core-read.repository.test.ts tests/core-read-api.test.ts`

Expected: FAIL because technician identifiers are numeric-only and public visibility/full fields are absent.

- [ ] **Step 9: Implement typed public technician lookup**

Add:

```ts
export const coreReadTechnicianIdParamSchema = z.object({
  id: z.union([
    z.coerce.number().int().positive(),
    z.string().regex(/^s\d{10}$/)
  ])
});
```

Change controller, service, and repository signatures to `number | string`. For string input query the active `PublicIdentifier` relation with kind `S`. Add `visibility: "public"` to `publishedTechnicianProfileWhere()`. Extend `TechnicianDetailPayload` and frontend `CoreTechnicianDetail` with `gender`, `heightCm`, and `languages` sourced from the persisted profile.

- [ ] **Step 10: Update OpenAPI and frontend types**

Document gender enums, the new review-tag summary, the public technician identifier route pattern, and rejection of `profileTags` in self-edit. Add frontend `gender` to self update and detail types.

- [ ] **Step 11: Regenerate Prisma Client and run Task 3 verification**

Run: `cd backend && npm run prisma:generate`

Expected: Prisma Client generation succeeds.

Run: `cd backend && npm test -- --runInBand tests/technician-profile-gender-schema.test.ts tests/technician-profile-validator.test.ts tests/technician-profile.repository.test.ts tests/technician-profile.service.test.ts tests/technician-profile-api.test.ts tests/core-read.repository.test.ts tests/core-read-api.test.ts tests/openapi.test.ts`

Expected: PASS.

Run: `cd backend && npm run build`

Expected: PASS.

- [ ] **Step 12: Commit only Task 3 files**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260903120000_technician_profile_gender/migration.sql backend/tests/technician-profile-gender-schema.test.ts backend/src/validators/technician-profile.validator.ts backend/src/repositories/technician-profile.repository.ts backend/src/services/technician-profile.service.ts backend/tests/technician-profile-validator.test.ts backend/tests/technician-profile.repository.test.ts backend/tests/technician-profile.service.test.ts backend/tests/technician-profile-api.test.ts backend/src/validators/core-read.validator.ts backend/src/controllers/core-read.controller.ts backend/src/services/core-read.service.ts backend/src/repositories/core-read.repository.ts backend/tests/core-read.repository.test.ts backend/tests/core-read-api.test.ts backend/src/api/openapi.ts backend/tests/openapi.test.ts src/features/core-read/api.ts src/features/core-read/technicianProfileApi.ts
git diff --cached --name-status
git commit -m "feat(profiles): add technician gender and public privacy"
```

### Task 4: Formal Service Utilization and Public Shop Metadata

**Files:**
- Modify: `backend/src/repositories/core-read.repository.ts`
- Modify: `backend/tests/core-read.repository.test.ts`
- Modify: `backend/tests/core-read-api.test.ts`
- Modify: `backend/src/repositories/pricing-mode.repository.ts`
- Modify: `backend/src/services/pricing-mode.service.ts`
- Modify: `backend/tests/pricing-mode-repository.test.ts`
- Modify: `backend/tests/pricing-mode-service.test.ts`
- Modify: `backend/tests/pricing-mode-api.test.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `src/features/core-read/api.ts`
- Modify: `src/features/core-read/api.test.ts`
- Modify: `src/features/pricing-mode/api.ts`
- Modify: `src/features/pricing-mode/api.test.ts`
- Modify: `src/types/domain.ts`

**Interfaces:**
- Produces: `CoreServiceCard.usageCount: number`.
- Produces: `TechnicianServicePayload.publicId`, `usageCount`, and `shop: { publicId, name, address }`.
- Produces: `ServiceItem.formal` metadata used only when mapped from a formal DTO.

- [ ] **Step 1: Write failing core and pricing repository tests**

Assert service queries use filtered relation counts:

```ts
_count: {
  select: {
    bookingOrders: {
      where: { status: "COMPLETED", deletedAt: null }
    }
  }
}
```

For technician services also assert the query includes:

```ts
shop: {
  select: {
    name: true,
    address: true,
    publicIdentifier: true
  }
}
```

Expected DTO examples:

```ts
expect(service).toMatchObject({ usageCount: 18 });
expect(technicianService).toMatchObject({
  publicId: "9b9185af-2cdf-48fb-93de-f6d12d595f6b",
  usageCount: 7,
  shop: { publicId: "shop0000000042", name: "LifeDance", address: "东京都港区麻布十番" }
});
```

- [ ] **Step 2: Run repository tests and confirm the fields are absent**

Run: `cd backend && npm test -- --runInBand tests/core-read.repository.test.ts tests/pricing-mode-repository.test.ts`

Expected: FAIL because service records do not include completed-order counts or public shop data.

- [ ] **Step 3: Enrich core service records without N+1 queries**

Add the filtered `_count.bookingOrders` selection to the reusable service include. Map:

```ts
usageCount: service._count.bookingOrders
```

Add `usageCount` to `ServiceCardPayload`, all core API fixtures, OpenAPI, and frontend `CoreServiceCard`.

- [ ] **Step 4: Enrich technician-service records with one reusable include**

Define:

```ts
const technicianServiceCardInclude = {
  shop: {
    select: {
      name: true,
      address: true,
      publicIdentifier: true
    }
  },
  _count: {
    select: {
      bookingOrders: {
        where: { status: "COMPLETED", deletedAt: null }
      }
    }
  }
} satisfies Prisma.TechnicianServiceInclude;
```

Use the include for list, primary, public, create-return, update-return, and reorder-return reads. Map only active `SHOP` public identifiers; return `shop.publicId: null` when unavailable rather than exposing numeric `shopId` as a display identifier.

- [ ] **Step 5: Add formal metadata to `ServiceItem` mapping**

Add:

```ts
formal?: {
  publicId: string;
  usageCount: number;
  currency: string;
  durationMinutes: number;
  shopPublicId: string;
  shopAddress: string;
};
```

In `mapCoreServiceToServiceItem`, set `sales: service.usageCount` for compatibility but make shared-card code consume only `formal.usageCount`. Do not read legacy `sales` when `formal` is absent.

- [ ] **Step 6: Run backend and frontend contract tests**

Run: `cd backend && npm test -- --runInBand tests/core-read.repository.test.ts tests/core-read-api.test.ts tests/pricing-mode-repository.test.ts tests/pricing-mode-service.test.ts tests/pricing-mode-api.test.ts tests/openapi.test.ts`

Expected: PASS.

Run: `npm test -- src/features/core-read/api.test.ts src/features/pricing-mode/api.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit only Task 4 files**

```bash
git add backend/src/repositories/core-read.repository.ts backend/tests/core-read.repository.test.ts backend/tests/core-read-api.test.ts backend/src/repositories/pricing-mode.repository.ts backend/src/services/pricing-mode.service.ts backend/tests/pricing-mode-repository.test.ts backend/tests/pricing-mode-service.test.ts backend/tests/pricing-mode-api.test.ts backend/src/api/openapi.ts src/features/core-read/api.ts src/features/core-read/api.test.ts src/features/pricing-mode/api.ts src/features/pricing-mode/api.test.ts src/types/domain.ts
git diff --cached --name-status
git commit -m "feat(services): expose formal utilization and shop metadata"
```

### Task 5: Shared Unified Service Information Card

**Files:**
- Create: `src/shared/service-card/model.ts`
- Create: `src/shared/service-card/mappers.ts`
- Create: `src/shared/service-card/UnifiedServiceInfoCard.tsx`
- Create: `src/shared/service-card/UnifiedServiceInfoCard.test.tsx`
- Create: `src/shared/service-card/mappers.test.ts`
- Create: `src/shared/service-card/index.ts`
- Modify: `src/shared/profile-card/SocialProfileMiniCard.tsx`
- Modify: `src/shared/profile-card/SocialProfileMiniCard.test.ts`
- Modify: `src/pages/user/CategoryPage.tsx`
- Modify: `src/pages/user/CategoryPage.test.ts`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: Task 4 formal service DTO fields.
- Produces: `UnifiedServiceInfoCardData` and mappers `fromCoreServiceCard(service): UnifiedServiceInfoCardData`, `fromTechnicianServicePayload(service): UnifiedServiceInfoCardData`, and `fromServiceItem(service, provider): UnifiedServiceInfoCardData`.
- Produces: `UnifiedServiceInfoCard({ data, detailTo, actionSlot })`.

- [ ] **Step 1: Write mapper and render tests**

Define the expected model in the test:

```ts
export type UnifiedServiceInfoCardData = {
  id: string;
  coverUrl: string | null;
  name: string;
  priceAmount: number;
  currency: string;
  durationMinutes: number;
  usageCount: number | null;
  shopPublicId: string | null;
  shopAddress: string | null;
  description: string | null;
  tags: string[];
};
```

Render formal data and assert order by string positions:

```ts
expect(markup.indexOf("深层护理")).toBeLessThan(markup.indexOf("￥8,800/60分钟"));
expect(markup.indexOf("￥8,800/60分钟")).toBeLessThan(markup.indexOf("利用回数 18"));
expect(markup.indexOf("利用回数 18")).toBeLessThan(markup.indexOf("店铺ID shop0000000042"));
expect(markup.indexOf("店铺ID shop0000000042")).toBeLessThan(markup.indexOf("东京都港区麻布十番"));
expect(markup.indexOf("东京都港区麻布十番")).toBeLessThan(markup.indexOf("适合日常放松"));
expect(markup.indexOf("适合日常放松")).toBeLessThan(markup.indexOf("女性技师可选"));
```

Also assert a legacy item without `formal` metadata displays `利用回数 未读取`, never `service.sales`.

- [ ] **Step 2: Run tests and confirm the shared module is missing**

Run: `npm test -- src/shared/service-card/UnifiedServiceInfoCard.test.tsx src/shared/service-card/mappers.test.ts`

Expected: FAIL because files do not exist.

- [ ] **Step 3: Implement model and mappers**

`fromCoreServiceCard` uses `usageCount`, `shop.publicId`, `shop.address`, and formal duration. `fromTechnicianServicePayload` uses enriched Task 4 fields. `fromServiceItem` returns formal metadata when present and otherwise returns `usageCount`, shop public ID, and address as `null` instead of using fake legacy metrics.

- [ ] **Step 4: Implement one card body with an action slot**

Use one link wrapper and this content hierarchy:

```tsx
<article data-testid="unified-service-info-card">
  <img alt={data.name} src={data.coverUrl ?? fallbackServiceCover} />
  <div>
    <h3>{data.name}</h3>
    <strong>{formatServicePrice(data)}</strong>
    <p>{formatUsageCount(data.usageCount)}</p>
    <p>{formatShopPublicId(data.shopPublicId)}</p>
    <p>{data.shopAddress ?? t("店铺地址未公开")}</p>
    <p>{data.description ?? t("暂无简介")}</p>
    <div>{data.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
  </div>
  {actionSlot ? <div data-testid="service-card-actions">{actionSlot}</div> : null}
</article>
```

Use full-width `￥`, `toLocaleString("ja-JP")`, and exact `/分钟` formatting. Keep action buttons outside the navigation link so edit/reorder clicks do not navigate.

- [ ] **Step 5: Delegate all `SocialProfileMiniCard` service entities**

Extend service-shaped `SocialProfileMiniData` with `serviceInfo?: UnifiedServiceInfoCardData`; `buildServiceMiniCardData` always supplies it. When `data.entityType === "service"`, return `UnifiedServiceInfoCard` before rendering user/shop/technician social markup. If an externally constructed legacy service object lacks `serviceInfo`, map only known fields and show unavailable formal metrics. Remove the old service-specific layout branches. Replace `CategoryPage.ServicePreviewCard` with the shared card. Keep pure image navigation tiles unchanged.

- [ ] **Step 6: Run focused component/page tests**

Run: `npm test -- src/shared/service-card/UnifiedServiceInfoCard.test.tsx src/shared/service-card/mappers.test.ts src/shared/profile-card/SocialProfileMiniCard.test.ts src/pages/user/CategoryPage.test.ts`

Expected: PASS.

Run: `npm run i18n:audit`

Expected: PASS with the new labels present in all supported languages.

- [ ] **Step 7: Commit only Task 5 files**

```bash
git add src/shared/service-card/model.ts src/shared/service-card/mappers.ts src/shared/service-card/UnifiedServiceInfoCard.tsx src/shared/service-card/UnifiedServiceInfoCard.test.tsx src/shared/service-card/mappers.test.ts src/shared/service-card/index.ts src/shared/profile-card/SocialProfileMiniCard.tsx src/shared/profile-card/SocialProfileMiniCard.test.ts src/pages/user/CategoryPage.tsx src/pages/user/CategoryPage.test.ts src/i18n/translations.ts
git diff --cached --name-status
git commit -m "feat(ui): unify service information cards"
```

### Task 6: Shared Technician Profile Information View

**Files:**
- Create: `src/shared/technician-profile/model.ts`
- Create: `src/shared/technician-profile/mappers.ts`
- Create: `src/shared/technician-profile/TechnicianProfileInfoView.tsx`
- Create: `src/shared/technician-profile/TechnicianProfileInfoView.test.tsx`
- Create: `src/shared/technician-profile/mappers.test.ts`
- Create: `src/shared/technician-profile/index.ts`
- Modify: `src/shared/profile-card/TechnicianPublicInfoCard.tsx`
- Modify: `src/shared/profile-card/TechnicianPublicInfoCard.formal.test.tsx`
- Modify: `src/shared/profile-card/types.ts`

**Interfaces:**
- Consumes: Tasks 2–5 DTOs and `UnifiedServiceInfoCardData`.
- Produces: `TechnicianProfileInfoModel` and `fromTechnicianSelfProfile(profile, detail, services): TechnicianProfileInfoModel` plus `fromCoreTechnicianDetail(detail, services): TechnicianProfileInfoModel`.
- Produces: `TechnicianProfileInfoView({ model, privacySlot, serviceAction })`, where `serviceAction` is `(service: UnifiedServiceInfoCardData, index: number) => ReactNode`.

- [ ] **Step 1: Write the shared-view order and count tests**

Create a fixture with three first-row metrics and one completed-order row. Assert content order:

```ts
const years = markup.indexOf("从业年数");
const acceptance = markup.indexOf("接单率");
const reviews = markup.indexOf("评价");
const completed = markup.indexOf("完成订单数");
const gender = markup.indexOf("性别");
const languages = markup.indexOf("语言能力");
const introduction = markup.indexOf("自我介绍");
const special = markup.indexOf("特殊标签");
const custom = markup.indexOf(">标签<");
const privacy = markup.indexOf("隐私模式");
const services = markup.indexOf("服务信息");

expect(years).toBeLessThan(acceptance);
expect(acceptance).toBeLessThan(reviews);
expect(reviews).toBeLessThan(completed);
expect(gender).toBeLessThan(languages);
expect(languages).toBeLessThan(introduction);
expect(introduction).toBeLessThan(special);
expect(special).toBeLessThan(custom);
expect(custom).toBeLessThan(privacy);
expect(privacy).toBeLessThan(services);
```

Assert all four fixed labels are present at count zero; custom count one renders no multiplier and custom count two renders `×2`.

- [ ] **Step 2: Run tests and confirm the shared view is missing**

Run: `npm test -- src/shared/technician-profile/TechnicianProfileInfoView.test.tsx src/shared/technician-profile/mappers.test.ts`

Expected: FAIL because the files do not exist.

- [ ] **Step 3: Define the shared model and mappers**

Use this stable model:

```ts
export type TechnicianProfileInfoModel = {
  publicId: string;
  displayName: string;
  avatarUrl: string | null;
  identityLabel: string;
  gender: "female" | "male" | "private";
  age: number | null;
  heightCm: number | null;
  languages: string[];
  bio: string | null;
  yearsExperience: number;
  acceptanceRatePercent: number;
  ratingAverage: number | null;
  reviewCount: number;
  completedOrderCount: number;
  reviewTagSummary: TechnicianReviewTagSummary;
  services: UnifiedServiceInfoCardData[];
};
```

`fromTechnicianSelfProfile` accepts self profile, core metrics, and formal technician services. `fromCoreTechnicianDetail` accepts core detail and public formal technician services. Do not read legacy `Technician.profileTags` or static special tag counts.

- [ ] **Step 4: Implement the shared composition**

Render a single outer profile card, a three-column first metric row, a separate completed-order row, and a basic-information section in the approved order. Always render four fixed stamps. Render custom labels with:

```tsx
<span>{tag.label}{tag.count > 1 ? ` ×${tag.count}` : ""}</span>
```

Place `privacySlot` after custom labels. Render services after the basic-information section in a borderless section; render each service with `UnifiedServiceInfoCard` and optional actions from `serviceAction(service, index)`.

- [ ] **Step 5: Convert `TechnicianPublicInfoCard` into an adapter**

Remove `createPortal`, `TechnicianPublicInfoCardModal`, and static `serviceReviewSpecialTags` count rendering. Keep `TechnicianPublicInfoCard` only for direct non-click embedded contexts, mapping its formal data into `TechnicianProfileInfoView`. Mark missing new formal fields as honest unavailable values, not legacy fake values.

- [ ] **Step 6: Run shared profile-card tests**

Run: `npm test -- src/shared/technician-profile/TechnicianProfileInfoView.test.tsx src/shared/technician-profile/mappers.test.ts src/shared/profile-card/TechnicianPublicInfoCard.formal.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit only Task 6 files**

```bash
git add src/shared/technician-profile/model.ts src/shared/technician-profile/mappers.ts src/shared/technician-profile/TechnicianProfileInfoView.tsx src/shared/technician-profile/TechnicianProfileInfoView.test.tsx src/shared/technician-profile/mappers.test.ts src/shared/technician-profile/index.ts src/shared/profile-card/TechnicianPublicInfoCard.tsx src/shared/profile-card/TechnicianPublicInfoCard.formal.test.tsx src/shared/profile-card/types.ts
git diff --cached --name-status
git commit -m "feat(ui): share technician profile information view"
```

### Task 7: Full Technician Detail Page and Removal of Floating Detail Modals

**Files:**
- Modify: `src/pages/user/ProfileDetailPage.tsx`
- Modify: `src/pages/user/ProfileDetailPage.test.ts`
- Create: `src/pages/user/ProfileDetailPage.render.test.tsx`
- Modify: `src/shared/profile-card/SocialProfileMiniCard.tsx`
- Modify: `src/shared/profile-card/SocialProfileMiniCard.test.ts`
- Modify: `src/shared/profile-card/TechnicianShowcaseCard.tsx`
- Modify: `src/shared/profile-card/TechnicianShowcaseCard.test.ts`
- Modify: `src/pages/user/StoreDetailPage.tsx`
- Modify: `src/pages/user/StoreDetailPage.test.ts`
- Modify: `src/shared/profile-card/index.ts`

**Interfaces:**
- Consumes: Task 3 technician public ID lookup, Task 4 public technician services, and Task 6 shared view.
- Produces: scoped full-page technician detail at `/profiles/technician/:id`, `/merchant/profiles/technician/:id`, and `/technician/profiles/technician/:id`.

- [ ] **Step 1: Replace old source assertions with failing route/render tests**

Assert `ProfileDetailPage` no longer returns `SocialProfilePage` for technicians. Render a technician route with mocked formal APIs and assert full header, shared profile view, service card, and no `role="dialog"`.

Add source assertions that these files do not contain `TechnicianPublicInfoCardModal`:

```ts
expect(socialCardSource).not.toContain("TechnicianPublicInfoCardModal");
expect(showcaseSource).not.toContain("TechnicianPublicInfoCardModal");
expect(storeDetailSource).not.toContain("TechnicianPublicInfoCardModal");
```

- [ ] **Step 2: Run route tests and confirm the social page/modal behavior fails**

Run: `npm test -- src/pages/user/ProfileDetailPage.test.ts src/pages/user/ProfileDetailPage.render.test.tsx src/shared/profile-card/SocialProfileMiniCard.test.ts src/shared/profile-card/TechnicianShowcaseCard.test.ts src/pages/user/StoreDetailPage.test.ts`

Expected: FAIL because technician routes still open social pages or modals.

- [ ] **Step 3: Implement the full detail-card page**

Parse numeric or `s##########` IDs. Load `coreReadApi.getTechnicianDetail(id)`, then load public technician services using the returned shop and technician IDs. Render loading/error/empty states without mock fallback. Render:

```tsx
<MobileShell showBottomNav={false}>
  <main className="mx-auto w-full max-w-[480px] space-y-4 px-4 pb-10 pt-4">
    <MobileFullscreenHeader onBack={handleBack} onClose={handleClose} title="详细信息卡" />
    <TechnicianProfileInfoView model={model} />
  </main>
</MobileShell>
```

Expose a separate optional link to the technician dynamic page, but do not make it the card-click default.

- [ ] **Step 4: Replace every modal trigger with scoped navigation**

In social, showcase, and store technician cards, use `getScopedProfileDetailPath(currentScope, "technician", technician.id)` and `Link`. Remove modal state, avatar click handlers that only open dialogs, modal imports, and the modal export from `src/shared/profile-card/index.ts`.

- [ ] **Step 5: Run route and modal-removal tests**

Run: `npm test -- src/pages/user/ProfileDetailPage.test.ts src/pages/user/ProfileDetailPage.render.test.tsx src/shared/profile-card/SocialProfileMiniCard.test.ts src/shared/profile-card/TechnicianShowcaseCard.test.ts src/pages/user/StoreDetailPage.test.ts`

Expected: PASS.

Run: `rg -n "TechnicianPublicInfoCardModal" src`

Expected: no matches.

- [ ] **Step 6: Commit only Task 7 files**

```bash
git add src/pages/user/ProfileDetailPage.tsx src/pages/user/ProfileDetailPage.test.ts src/pages/user/ProfileDetailPage.render.test.tsx src/shared/profile-card/SocialProfileMiniCard.tsx src/shared/profile-card/SocialProfileMiniCard.test.ts src/shared/profile-card/TechnicianShowcaseCard.tsx src/shared/profile-card/TechnicianShowcaseCard.test.ts src/pages/user/StoreDetailPage.tsx src/pages/user/StoreDetailPage.test.ts src/shared/profile-card/index.ts
git diff --cached --name-status
git commit -m "feat(profiles): open technician cards as full detail pages"
```

### Task 8: Technician Personal Center Layout, Edit Controls, and Service Management

**Files:**
- Modify: `src/pages/mobile/TechnicianPortalPage.tsx`
- Modify: `src/pages/mobile/TechnicianPortalPage.test.tsx`
- Create: `src/pages/mobile/TechnicianPortalPage.profile.render.test.tsx`
- Modify: `src/features/core-read/technicianProfileApi.ts`
- Modify: `src/features/core-read/technicianProfileApi.test.ts`

**Interfaces:**
- Consumes: Tasks 2–6 shared models and enriched self service DTO.
- Produces: approved self personal-center layout and edit flow.
- Preserves: existing pricing-mode create, update, delete, and reorder mutations.

- [ ] **Step 1: Write failing personal-center source and render tests**

Assert:

```ts
expect(source).toContain('showBottomNav={activeView !== "me"}');
expect(source).toContain('data-testid="technician-profile-save-action"');
expect(source).toContain("保存并退出编辑模式");
expect(source).not.toContain('data-testid="technician-profile-ndp-card"');
expect(source).not.toContain("profileTags: splitList");
```

In a rendered profile, assert the approved field order, the completed-order row, fixed/custom counts, and services after privacy. Assert the service section root does not have a border class while each shared service card does.

- [ ] **Step 2: Run the tests and confirm current layout fails**

Run: `npm test -- src/pages/mobile/TechnicianPortalPage.test.tsx src/pages/mobile/TechnicianPortalPage.profile.render.test.tsx`

Expected: FAIL because the current page shows wallet/city metrics, places privacy above basic information, exposes profile-tag editing, keeps a service outer card, and shows bottom nav on the info tab.

- [ ] **Step 3: Build the self model from formal data**

Use `fromTechnicianSelfProfile(selfProfile, technician, services.list)`. Do not gate personal-center rendering on wallet summary. Keep wallet loading only if another non-profile view still consumes it; otherwise remove that request and its profile-only tests.

- [ ] **Step 4: Match user edit controls**

Use the customer-page red close style and fixed save footer. The save action sends only:

```ts
{
  gender: draft.gender,
  age: draft.age,
  heightCm: draft.heightCm,
  languages: splitList(draft.languagesText),
  bio: draft.bio || null,
  visibility: draft.visibility
}
```

Closing edit restores a fresh draft from the persisted profile and sends no request. Saving waits for `technicianProfileApi.updateMine`, refreshes the self model, then exits edit.

- [ ] **Step 5: Compose read-only and edit modes in the approved order**

Read-only mode uses `TechnicianProfileInfoView`. Edit mode renders gender/age/height, languages, bio, read-only fixed/custom review tags, and privacy last. Do not render service area, bid budget, payment method, foreigner switch, or self-editable profile tags inside the approved basic-information sequence.

- [ ] **Step 6: Replace service management card body and remove the outer frame**

Keep `FormalTechnicianServicesPanel` data and mutations, but render each payload with `UnifiedServiceInfoCard`. Inject action buttons:

```tsx
actionSlot={
  <div className="flex gap-2">
    <IconButton label="上移" onClick={() => moveService(index, -1)} />
    <IconButton label="下移" onClick={() => moveService(index, 1)} />
    <IconButton label="编辑" onClick={() => openEditor(service)} />
  </div>
}
```

The section root may have spacing classes but no `border`, panel background, or enclosing rounded card class. Keep add-service limits, loading, retry, empty state, editor, reorder idempotency, and persistence behavior.

- [ ] **Step 7: Disable bottom navigation for both personal-center tabs**

Change the shell condition so any `activeView === "me"` hides bottom navigation. Preserve other technician portal views.

- [ ] **Step 8: Run personal-center tests**

Run: `npm test -- src/pages/mobile/TechnicianPortalPage.test.tsx src/pages/mobile/TechnicianPortalPage.profile.render.test.tsx src/features/core-read/technicianProfileApi.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit only Task 8 files**

```bash
git add src/pages/mobile/TechnicianPortalPage.tsx src/pages/mobile/TechnicianPortalPage.test.tsx src/pages/mobile/TechnicianPortalPage.profile.render.test.tsx src/features/core-read/technicianProfileApi.ts src/features/core-read/technicianProfileApi.test.ts
git diff --cached --name-status
git commit -m "feat(technician): unify personal center information card"
```

### Task 9: User Privacy Placement and Cross-Portal Information Order

**Files:**
- Modify: `src/shared/profile-card/PlatformMembershipDetailCard.tsx`
- Modify: `src/shared/profile-card/PlatformMembershipCards.test.tsx`
- Modify: `src/pages/user/UserCenterPage.tsx`
- Modify: `src/pages/user/UserCenterPage.test.tsx`
- Modify: `src/pages/user/UserCenterPage.interaction.test.tsx`
- Modify: `src/pages/user/UserCenterFormalIntegration.test.ts`

**Interfaces:**
- Produces: `afterDetailsSlot?: ReactNode` on the customer detail card.
- Changes: customer privacy controls render after the label section and remain persisted through the existing formal profile API.

- [ ] **Step 1: Write the failing order test**

Render the user information card and assert:

```ts
const tags = markup.indexOf("标签");
const privacy = markup.indexOf("隐私模式");
expect(tags).toBeGreaterThan(-1);
expect(privacy).toBeGreaterThan(tags);
```

Assert `beforeDetailsSlot` no longer contains privacy.

- [ ] **Step 2: Run user-center tests and confirm privacy is above basic information**

Run: `npm test -- src/shared/profile-card/PlatformMembershipCards.test.tsx src/pages/user/UserCenterPage.test.tsx src/pages/user/UserCenterPage.interaction.test.tsx src/pages/user/UserCenterFormalIntegration.test.ts`

Expected: FAIL because privacy currently renders before basic details.

- [ ] **Step 3: Add and use `afterDetailsSlot`**

Render `afterDetailsSlot` after the customer label area in `PlatformMembershipDetailCard`. Pass the existing `profilePrivacyControl` through that prop in view mode and place the edit-mode privacy block after labels. Do not change confirmation dialogs or persistence semantics.

- [ ] **Step 4: Run user-center tests**

Run: `npm test -- src/shared/profile-card/PlatformMembershipCards.test.tsx src/pages/user/UserCenterPage.test.tsx src/pages/user/UserCenterPage.interaction.test.tsx src/pages/user/UserCenterFormalIntegration.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit only Task 9 files**

```bash
git add src/shared/profile-card/PlatformMembershipDetailCard.tsx src/shared/profile-card/PlatformMembershipCards.test.tsx src/pages/user/UserCenterPage.tsx src/pages/user/UserCenterPage.test.tsx src/pages/user/UserCenterPage.interaction.test.tsx src/pages/user/UserCenterFormalIntegration.test.ts
git diff --cached --name-status
git commit -m "fix(profiles): place privacy after basic labels"
```

### Task 10: Cross-Surface Service-Card Audit and Cleanup

**Files:**
- Modify: `src/components/mobile/ServiceCard.tsx`
- Modify: `src/components/mobile/OrderServiceMiniCard.tsx`
- Modify: `src/pages/user/HomePage.tsx`
- Modify: `src/pages/user/HomePage.test.ts`
- Modify: `src/pages/user/UserOrderDetailPage.tsx`
- Modify: `src/pages/user/UserOrderDetailPage.test.ts`
- Modify: `src/pages/user/FormalCheckoutPage.tsx`
- Modify: `src/pages/user/FormalCheckoutPage.test.ts`
- Modify: `src/pages/mobile/MerchantOrderRoutePages.tsx`
- Create: `src/pages/mobile/MerchantOrderRoutePages.test.tsx`
- Modify: `src/pages/user/TechnicianServicesPage.tsx`
- Create: `src/shared/service-card/service-card-usage.test.ts`

**Interfaces:**
- Consumes: Task 5 shared service card and mappers.
- Produces: no remaining real service-information card body outside `UnifiedServiceInfoCard`.
- Preserves: order selection actions and navigation targets.

- [ ] **Step 1: Add a source-level usage contract test**

Read the service-card consumers and assert each imports or reaches `UnifiedServiceInfoCard` through the `SocialProfileMiniCard` service delegation. Assert separate full service card markup such as `ServicePreviewCard` no longer exists. Explicitly exempt only pure image navigation tiles documented in the design spec.

- [ ] **Step 2: Run the usage test and inventory remaining duplicate bodies**

Run: `npm test -- src/shared/service-card/service-card-usage.test.ts`

Expected: FAIL with the remaining duplicate service-card consumer names.

- [ ] **Step 3: Convert each remaining information-card consumer**

Use `UnifiedServiceInfoCard` directly when formal service DTOs are available. When an order wrapper needs buttons, pass them through `actionSlot`; never copy the card fields. If an old order lacks formal service metadata, show honest unavailable fields and retain the order snapshot name/price without manufacturing utilization or shop public ID.

- [ ] **Step 4: Run all consumer tests**

Run: `npm test -- src/shared/service-card/service-card-usage.test.ts src/pages/user/HomePage.test.ts src/pages/user/UserOrderDetailPage.test.ts src/pages/user/FormalCheckoutPage.test.ts src/pages/mobile/MerchantOrderRoutePages.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit only Task 10 files**

```bash
git add src/components/mobile/ServiceCard.tsx src/components/mobile/OrderServiceMiniCard.tsx src/pages/user/HomePage.tsx src/pages/user/HomePage.test.ts src/pages/user/UserOrderDetailPage.tsx src/pages/user/UserOrderDetailPage.test.ts src/pages/user/FormalCheckoutPage.tsx src/pages/user/FormalCheckoutPage.test.ts src/pages/mobile/MerchantOrderRoutePages.tsx src/pages/mobile/MerchantOrderRoutePages.test.tsx src/pages/user/TechnicianServicesPage.tsx src/shared/service-card/service-card-usage.test.ts
git diff --cached --name-status
git commit -m "refactor(ui): use one service information card everywhere"
```

### Task 11: Automated Regression Gate

**Files:**
- Modify only files proven necessary by failures from the commands below.

**Interfaces:**
- Consumes: Tasks 1–10.
- Produces: green focused and project-level build gates without weakening assertions.

- [ ] **Step 1: Run the complete focused backend suite**

Run:

```bash
cd backend && npm test -- --runInBand tests/order-review-validator.test.ts tests/order-review-service.test.ts tests/order-review-api.test.ts tests/technician-review-tag-summary.repository.test.ts tests/technician-profile-gender-schema.test.ts tests/technician-profile-validator.test.ts tests/technician-profile.repository.test.ts tests/technician-profile.service.test.ts tests/technician-profile-api.test.ts tests/core-read.repository.test.ts tests/core-read-api.test.ts tests/pricing-mode-repository.test.ts tests/pricing-mode-service.test.ts tests/pricing-mode-api.test.ts tests/openapi.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run backend lint and build**

Run: `cd backend && npm run lint`

Expected: PASS.

Run: `cd backend && npm run build`

Expected: PASS.

- [ ] **Step 3: Run the complete focused frontend suite**

Run:

```bash
npm test -- src/shared/order-detail/serviceReviewTagCatalog.test.ts src/shared/order-detail/ServiceSessionUi.test.tsx src/pages/user/UserOrderDetailPage.formal.test.tsx src/features/core-read/api.test.ts src/features/core-read/technicianProfileApi.test.ts src/features/pricing-mode/api.test.ts src/shared/service-card/UnifiedServiceInfoCard.test.tsx src/shared/service-card/mappers.test.ts src/shared/service-card/service-card-usage.test.ts src/shared/technician-profile/TechnicianProfileInfoView.test.tsx src/shared/technician-profile/mappers.test.ts src/shared/profile-card/TechnicianPublicInfoCard.formal.test.tsx src/shared/profile-card/SocialProfileMiniCard.test.ts src/shared/profile-card/TechnicianShowcaseCard.test.ts src/pages/user/ProfileDetailPage.test.ts src/pages/user/ProfileDetailPage.render.test.tsx src/pages/user/StoreDetailPage.test.ts src/pages/mobile/TechnicianPortalPage.test.tsx src/pages/mobile/TechnicianPortalPage.profile.render.test.tsx src/shared/profile-card/PlatformMembershipCards.test.tsx src/pages/user/UserCenterPage.test.tsx src/pages/user/UserCenterPage.interaction.test.tsx src/pages/user/UserCenterFormalIntegration.test.ts src/pages/user/CategoryPage.test.ts src/pages/user/HomePage.test.ts src/pages/user/UserOrderDetailPage.test.ts src/pages/user/FormalCheckoutPage.test.ts src/pages/mobile/MerchantOrderRoutePages.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run frontend static and production gates**

Run: `npm run lint`

Expected: PASS.

Run: `npm run i18n:audit`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Inspect forbidden fake/count/modal patterns**

Run:

```bash
rg -n "TechnicianPublicInfoCardModal|count: 13|count: 2|service\.reviewSummary\.reviewCount.*sales|usageCount: service\.sales" src backend/src
```

Expected: no matches.

- [ ] **Step 6: Commit only genuine regression fixes**

Stage exact files shown by `git diff --name-only`, verify cached names, and use:

```bash
git commit -m "test: close technician profile and service card regressions"
```

If no files changed, do not create an empty commit.

### Task 12: Formal Runtime and Mobile Browser Acceptance

**Files:**
- Create: `docs/qa/2026-09-03-technician-profile-service-card-acceptance.md`

**Interfaces:**
- Consumes: completed implementation and standard formal runtime.
- Produces: evidence for runtime identity, API data flow, interaction, mobile layout, and console health.

- [ ] **Step 1: Prove the standard runtime before UI acceptance**

Record frontend/backend listener PIDs, each process cwd, current branch, frontend origin, proxy target, `/api/v1/health`, and `/api/v1/ready`. Do not accept an alternate port as proof of the standard runtime.

- [ ] **Step 2: Verify formal database evidence without mutation**

Read one technician’s formal review tags and completed orders. Record anonymized identifiers and expected aggregates. Confirm the four fixed counts and at least one custom `count=1` or `count>=2` case. Confirm service utilization counts match completed orders for both `serviceId` and `technicianServiceId` sources when fixtures exist.

- [ ] **Step 3: Verify the technician personal center at mobile width**

With the authenticated technician session, verify:

- no bottom navigation on information or data-center tabs;
- first row is years, acceptance, reviews;
- completed orders is on the next row;
- gender/age/height, languages, introduction, fixed labels, custom labels, privacy are in order;
- privacy persists after reload;
- edit close discards draft;
- fixed save exits edit after successful API response;
- service section has no outer frame;
- service cards show public shop ID, address, price/duration, formal utilization, description, and tags;
- move up/down/edit still persist.

- [ ] **Step 4: Verify public detail navigation and parity**

From home, category/search, store detail, order participant, checkout, and any visible technician card entry, click the card. Confirm navigation to a full detail page, no dialog overlay, no bottom nav, and exact parity with the self card’s read-only data for the same technician.

- [ ] **Step 5: Verify review counting behavior**

Using completed test orders only, submit multiple fixed labels and one custom label. Verify each selected fixed label increments once. On a later completed order, submit the same custom text and verify the profile changes from no multiplier at count one to `×2`. Verify a second custom label in one submission is rejected by both UI and API.

- [ ] **Step 6: Verify responsive and console health**

At 390 px and 430 px widths, confirm no horizontal overflow, action buttons remain reachable, service text does not overlap management controls, and browser console/network show no new errors or failed formal requests.

- [ ] **Step 7: Write and commit the acceptance record**

Document observed values, routes, screenshots saved outside the repository or as approved QA assets, console result, and any explicitly deferred gap. Then:

```bash
git add docs/qa/2026-09-03-technician-profile-service-card-acceptance.md
git diff --cached --name-status
git commit -m "docs: record technician profile and service card acceptance"
```

---

## Final Completion Criteria

- Every requested layout and interaction is implemented through formal data.
- Four fixed special labels always render and use real review counts.
- Custom review labels aggregate across orders, hide `×1`, and show `×2` or above.
- Technician public detail is a page, not a floating modal.
- Self and public technician information use the same read-only presentation component.
- Every actual service-information card uses `UnifiedServiceInfoCard`; documented pure navigation tiles are the only exception.
- Service utilization equals completed booking count and public shop IDs never fall back to numeric database IDs.
- Automated backend/frontend gates pass.
- Standard-runtime authenticated mobile acceptance passes with no overflow or console errors.
- Unrelated dirty-worktree changes remain untouched.
