# Affiliate Task Five-Language Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist, edit, audit, submit, review, and display every Affiliate task in independent Japanese, English, Korean, Traditional Chinese, and Simplified Chinese versions while preserving the existing real budget-freeze and review lifecycle.

**Architecture:** Add one soft-deletable `AffiliateTaskTranslation` row per task and content locale, backfill all historical tasks from the existing canonical fields, and keep `AffiliateTask.name/description` as the source-locale compatibility snapshot. Draft creation copies the entered source version to all five locales; an optimistic-lock locale command either changes one locale or synchronizes it to all locales. Task submission requires publishable content in at least one locale before touching Wallet/Ledger, and every read returns the available translation map so the marketplace client can choose the active language without machine translation.

**Tech Stack:** Prisma 7/MySQL 8, Express, TypeScript strict, Zod, OpenAPI, Jest/Supertest, React 19/Vite/Vitest.

## Global Constraints

- Execute only the Step 12 Affiliate-task localization microstep; merchant workspace UI remains the next separate microstep.
- Supported content locales are exactly `zh-CN`, `zh-TW`, `en`, `ja`, and `ko`; UI display order remains Japanese, English, Korean, Traditional Chinese, Simplified Chinese.
- Creating a draft from any source locale initializes every language with the same content; later locale edits remain independent unless `syncToAll=true`.
- Submitting for review requires at least one active translation with a non-empty valid task name before any NDP freeze; the other four language versions are optional.
- No machine translation, browser-local task content, fake API, fake metrics, second Affiliate identity, or direct Wallet mutation.
- Existing task, Claim, attribution, Wallet/Ledger, RBAC, AuditLog, idempotency, and shop-scope behavior must remain intact.
- All new API input is Zod-validated, protected by the existing merchant Affiliate permissions, documented in OpenAPI, and audited.

---

### Task 1: Translation schema and safe historical backfill

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260829223000_affiliate_task_translations/migration.sql`
- Test: `backend/tests/affiliate-task-localization-schema.test.ts`

**Interfaces:**
- Consumes: existing `ContentLocale` and `AffiliateTask`.
- Produces: `AffiliateTaskTranslation` with unique `(taskId, locale)` and `AffiliateTask.translations`.

- [ ] **Step 1: Write the failing schema test**

```ts
expect(schema).toContain("model AffiliateTaskTranslation");
expect(schema).toContain("@@unique([taskId, locale])");
expect(migration).toContain("CREATE TABLE `affiliate_task_translations`");
expect(migration).toContain("INSERT INTO `affiliate_task_translations`");
```

- [ ] **Step 2: Run the schema test and verify RED**

Run: `npm test -- --runInBand tests/affiliate-task-localization-schema.test.ts`

Expected: FAIL because the model and migration do not exist.

- [ ] **Step 3: Add the model and migration**

```prisma
model AffiliateTaskTranslation {
  id            Int           @id @default(autoincrement())
  taskId        Int           @map("task_id")
  locale        ContentLocale
  name          String        @db.VarChar(160)
  description   String?       @db.Text
  sourceLocale  ContentLocale @map("source_locale")
  isInitialCopy Boolean       @default(false) @map("is_initial_copy")
  createdAt     DateTime      @default(now()) @map("created_at")
  updatedAt     DateTime      @updatedAt @map("updated_at")
  deletedAt     DateTime?     @map("deleted_at")

  task AffiliateTask @relation(fields: [taskId], references: [id], onDelete: Restrict)

  @@unique([taskId, locale])
  @@index([locale, deletedAt])
  @@index([deletedAt])
  @@map("affiliate_task_translations")
}
```

The migration creates the table and inserts exactly five rows per existing non-deleted or historical task from `affiliate_tasks.name/description`, marking non-`zh-CN` rows as initial copies. It must add the foreign key only after the guarded backfill and must not modify existing task rows.

- [ ] **Step 4: Generate Prisma Client and verify GREEN**

Run: `npm run prisma:generate && npm test -- --runInBand tests/affiliate-task-localization-schema.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260829223000_affiliate_task_translations/migration.sql backend/tests/affiliate-task-localization-schema.test.ts
git commit -m "feat: add affiliate task translations"
```

### Task 2: Five-language draft commands and submit gate

**Files:**
- Modify: `backend/src/validators/affiliate-task.validator.ts`
- Modify: `backend/src/services/affiliate-task.service.ts`
- Modify: `backend/src/repositories/affiliate-task.repository.ts`
- Modify: `backend/src/controllers/affiliate-task.controller.ts`
- Modify: `backend/src/routes/affiliate-task.routes.ts`
- Test: `backend/tests/affiliate-task.service.test.ts`
- Test: `backend/tests/affiliate-task-api.test.ts`
- Test: `backend/tests/affiliate-task.repository.test.ts`

**Interfaces:**
- Consumes: `CONTENT_LOCALES`, `ContentLocaleCode`, existing task optimistic lock and publisher-scope checks.
- Produces: `translations: Record<ContentLocaleCode, AffiliateTaskTranslationPayload>` on every task response and `PUT /merchant-admin/affiliate/tasks/:taskId/locales/:locale`.

- [ ] **Step 1: Write failing service tests**

```ts
const created = await service.createDraft(shopActor, { ...taskFields, sourceLocale: "ja" });
expect(created.translations.ja.name).toBe(taskFields.name);
expect(Object.keys(created.translations)).toHaveLength(5);
expect(created.translations.en).toMatchObject({ sourceLocale: "ja", isInitialCopy: true });

const updated = await service.updateDraftLocale(shopActor, created.id, "en", {
  lockVersion: created.lockVersion,
  name: "English campaign",
  description: "English instructions",
  syncToAll: false
});
expect(updated.translations.en.name).toBe("English campaign");
expect(updated.translations.ja.name).toBe(taskFields.name);
```

Add a second test proving `syncToAll=true` replaces all five rows, a third proving one publishable language is enough to submit and freeze once, and a fourth proving an entirely blank/missing set rejects before `freezeAffiliateTaskBudget` is called.

- [ ] **Step 2: Run focused service tests and verify RED**

Run: `npm test -- --runInBand tests/affiliate-task.service.test.ts`

Expected: FAIL because translation records and locale update do not exist.

- [ ] **Step 3: Implement repository translation persistence**

Extend `taskInclude` with active translations, map DB locale values to API locale codes, create five rows in `createTask`, and add:

```ts
updateDraftTranslation(input: {
  taskId: number;
  lockVersion: number;
  locale: ContentLocaleCode;
  name: string;
  description: string | null;
  syncToAll: boolean;
}): Promise<AffiliateTaskRecord | null>;
```

The update runs inside the existing task transaction, updates only a `DRAFT` task with the expected lock version, upserts the selected/all locale rows, updates the compatibility `name/description` only when the source locale is updated or synchronized, and increments task `lockVersion` exactly once.

- [ ] **Step 4: Implement validator and service rules**

Add optional `sourceLocale` defaulting to `zh-CN` on create and this strict locale body:

```ts
z.object({
  lockVersion: z.number().int().positive(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(10_000).nullable(),
  syncToAll: z.boolean()
}).strict()
```

`updateDraftLocale` must reuse publisher scope, draft-state checks, optimistic locking and write `affiliate.task.translation_updated` with locale and `syncToAll`. `submit()` must assert that at least one publishable translation exists before `transitionAffiliateTask` and before the ledger freeze; otherwise it returns `error.affiliate.task_content_required`.

- [ ] **Step 5: Verify service GREEN**

Run: `npm test -- --runInBand tests/affiliate-task.service.test.ts tests/affiliate-task.repository.test.ts`

Expected: PASS.

- [ ] **Step 6: Write failing API tests**

Prove the locale route accepts `en`, rejects unsupported locales/extra fields, requires merchant create permission, passes actor scope to the service, and returns the complete translation map.

- [ ] **Step 7: Add controller and route**

```text
PUT /api/v1/merchant-admin/affiliate/tasks/:taskId/locales/:locale
permission: button:merchant-affiliate-task-create
```

- [ ] **Step 8: Verify API GREEN**

Run: `npm test -- --runInBand tests/affiliate-task-api.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src backend/tests/affiliate-task.service.test.ts backend/tests/affiliate-task-api.test.ts backend/tests/affiliate-task.repository.test.ts
git commit -m "feat: localize affiliate task drafts"
```

### Task 3: OpenAPI and marketplace active-language rendering

**Files:**
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/src/repositories/affiliate-marketplace.repository.ts`
- Modify: `backend/src/services/affiliate-marketplace.service.ts`
- Modify: `src/api/affiliateMarketplace.ts`
- Modify: `src/features/affiliate-marketplace/model.ts`
- Modify: `src/pages/mobile/AffiliateMarketplacePage.tsx`
- Modify: `src/pages/mobile/AffiliateTaskDetailPage.tsx`
- Test: `backend/tests/openapi.test.ts`
- Test: `backend/tests/affiliate-marketplace.service.test.ts`
- Test: `backend/tests/affiliate-marketplace.repository.test.ts`
- Test: `src/features/affiliate-marketplace/model.test.ts`
- Test: `src/pages/mobile/AffiliateMarketplacePage.test.tsx`
- Test: `src/pages/mobile/AffiliateTaskDetailPage.test.tsx`

**Interfaces:**
- Consumes: task `translations` map and frontend `I18nLanguage`.
- Produces: `resolveAffiliateTaskTranslation(task, language)` with explicit mapping `zh -> zh-CN`, `zh-Hant -> zh-TW`, `en -> en`, `ja -> ja`, `ko -> ko`.

- [ ] **Step 1: Write failing OpenAPI and marketplace tests**

Assert the task schema requires `translations`, documents the locale PUT route and `syncToAll`, repository responses include translations, and the frontend resolver returns the correct independent language value.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --runInBand tests/openapi.test.ts tests/affiliate-marketplace.service.test.ts tests/affiliate-marketplace.repository.test.ts`

Run: `npm test -- src/features/affiliate-marketplace/model.test.ts src/pages/mobile/AffiliateMarketplacePage.test.tsx src/pages/mobile/AffiliateTaskDetailPage.test.tsx`

Expected: FAIL only on missing localization contract/rendering.

- [ ] **Step 3: Extend OpenAPI and repository mapping**

Document `AffiliateTaskTranslation`, the five-key translation object, create `sourceLocale`, and the locale PUT route. Include active translations in marketplace task loads; search matches task code or any active translation name without changing pagination.

- [ ] **Step 4: Add the frontend resolver and render localized content**

```ts
export function resolveAffiliateTaskTranslation(task: AffiliateMarketplaceTask, language: I18nLanguage) {
  const locale = { zh: "zh-CN", "zh-Hant": "zh-TW", en: "en", ja: "ja", ko: "ko" }[language];
  return task.translations[locale];
}
```

Task cards and detail use the resolver for merchant-authored name/description; they never call `translateText` for authored content and never synthesize a missing version.

- [ ] **Step 5: Verify GREEN**

Run the same focused backend and frontend commands from Step 2; expect PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/api/openapi.ts backend/src/repositories/affiliate-marketplace.repository.ts backend/src/services/affiliate-marketplace.service.ts backend/tests/openapi.test.ts backend/tests/affiliate-marketplace.service.test.ts backend/tests/affiliate-marketplace.repository.test.ts src/api/affiliateMarketplace.ts src/features/affiliate-marketplace src/pages/mobile/AffiliateMarketplacePage.tsx src/pages/mobile/AffiliateMarketplacePage.test.tsx src/pages/mobile/AffiliateTaskDetailPage.tsx src/pages/mobile/AffiliateTaskDetailPage.test.tsx
git commit -m "feat: render localized affiliate tasks"
```

### Task 4: Real-database guard, documentation, and full verification

**Files:**
- Create: `backend/scripts/check-affiliate-task-localization-flow.ts`
- Modify: `backend/package.json`
- Create: `backend/tests/affiliate-task-localization-flow-script.test.ts`
- Modify: `docs/affiliate-marketplace-mobile-ui.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: local non-production MySQL, real repository/service, existing Affiliate task cleanup conventions.
- Produces: `npm --prefix backend run check:affiliate-task-localization-flow`.

- [ ] **Step 1: Write failing checker contract test**

Assert the script rejects production/remote databases, creates one uniquely marked draft, verifies initial five-copy state, independent edit, synchronize-all, all-content-missing rejection without a freeze, one-language submit with one budget freeze, audit evidence, and marker-only cleanup.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --runInBand tests/affiliate-task-localization-flow-script.test.ts`

Expected: FAIL because the checker does not exist.

- [ ] **Step 3: Implement checker and docs**

The checker must use the real Service/Repository/Prisma path, refuse production-like targets, compare marker-owned row counts before/after cleanup, and never seed a visible marketplace task. README and Affiliate UI docs must state the five-language contract and keep merchant task management UI in Remaining Formal Microsteps.

- [ ] **Step 4: Run migration and guarded checker**

Run:

```bash
ENV_FILE=.env.dev npm --prefix backend run prisma:status
ENV_FILE=.env.dev npm --prefix backend run prisma:migrate:deploy
ENV_FILE=.env.dev npm --prefix backend run check:affiliate-task-localization-flow
```

Expected: migration applies once; checker passes and cleans its rows.

- [ ] **Step 5: Run full verification**

```bash
npm test -- --run
npm run lint
npm run verify:production-build
npm --prefix backend test -- --runInBand
npm --prefix backend run lint
npm --prefix backend run build
```

Expected: all suites pass; existing configured skips and non-blocking bundle warnings remain unchanged.

- [ ] **Step 6: Commit**

```bash
git add backend/scripts backend/package.json backend/tests/affiliate-task-localization-flow-script.test.ts README.md docs/affiliate-marketplace-mobile-ui.md
git commit -m "docs: verify affiliate task localization"
```

## Self-Review

- Spec coverage: independent five-language values, default copy, explicit synchronize-all, at-least-one-language submit gate, audit, RBAC, OpenAPI, real DB and active-language marketplace rendering are covered. Merchant task-management UI is explicitly left to its separate next microstep.
- Placeholder scan: no TBD/TODO/FIXME or unspecified implementation step remains.
- Type consistency: backend and frontend use the existing five content-locale codes; every task response carries the same translation payload shape; the locale update route uses the existing task lock version and merchant create permission.
