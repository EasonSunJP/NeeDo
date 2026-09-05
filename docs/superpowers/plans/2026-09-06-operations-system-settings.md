# Operations System Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the incorrect role-page system-settings link with a four-tab, formally persisted and enforced operations system-settings workspace, while aligning the existing NDP exchange-rate UI.

**Architecture:** Use one immutable `PlatformSettingVersion` aggregate for coherent site/login/brand/payment state, the existing `ImPolicy` aggregate for prospective IM expiry, and a document catalog with language-specific drafts and immutable releases for legal text. Public projections expose only safe active configuration; every operations mutation uses typed Service/Repository boundaries, RBAC, strict Zod validation, optimistic locking, and audit logs.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Vitest 4, Node.js 22, Express 4, Zod 3, Prisma 7, MySQL 8, Redis, Jest/Supertest.

## Global Constraints

- Execute in an isolated Git worktree created with `superpowers:using-git-worktrees`; the current checkout contains unrelated uncommitted changes.
- Work only on this Step 12 system-settings microstep. Do not implement role-member lists or permission-tree reconciliation.
- Do not add mock, demo, placeholder, fake API, provider credential, fake payment capability, or plaintext secret handling.
- Preserve React/TSX/Vite, the `/api/v1` response envelope, Route → Controller → Service → Repository → Prisma layering, strict Zod bodies, OpenAPI, pagination, soft-delete conventions, RBAC, and audit logs.
- PayPay, PayPal, Stripe, Apple, and LINE remain non-actionable “项目未配置” entries with no provider API calls.
- Legal content is edited and published independently for `zh-CN`, `zh-TW`, `ja`, `en`, and `ko`; missing locales never silently fall back.
- IM retention is prospective: 30 days for new messages and 3 days for newly bound IM media by default; device-local history/cache is not deleted by server retention.
- The site switch must preserve operations recovery and health/readiness access while server-side enforcement blocks ordinary portals.
- Run `npm --prefix backend run prisma:generate` after Prisma changes. Never edit an already-applied migration.
- Tests/builds do not replace formal runtime, browser, database, migration, and cross-surface acceptance.

---

## File Structure

### Backend foundations

- `backend/src/domain/platform-settings.ts` — immutable settings types, public/full projections, mutation results, and access-policy port.
- `backend/src/repositories/platform-settings.repository.ts` — current-version reads and serializable, audited version creation.
- `backend/src/services/platform-settings.service.ts` — validation, operations identity checks, public projection, optimistic conflict mapping, and cache invalidation.
- `backend/src/services/platform-settings.resolver.ts` — bounded active-setting cache shared by auth, maintenance, checkout, and public routes.
- `backend/src/validators/platform-settings.validator.ts` — strict basic/payment bodies.
- `backend/src/controllers/platform-settings.controller.ts` — request/response only.
- `backend/src/routes/platform-settings.routes.ts` — public and RBAC-protected operations routes.
- `backend/src/middlewares/platform-maintenance.middleware.ts` — blocks non-operations public business routes with stable 503 behavior.
- `backend/src/domain/legal-document.ts` — catalog, locale draft, release, and mutation contracts.
- `backend/src/repositories/legal-document.repository.ts` — paginated catalog, language draft, immutable publication, current release.
- `backend/src/services/legal-document.service.ts` — internal-path validation, locale isolation, hash/version publication, operations checks.
- `backend/src/validators/legal-document.validator.ts`, `backend/src/controllers/legal-document.controller.ts`, `backend/src/routes/legal-document.routes.ts` — formal legal APIs.
- `backend/src/repositories/im-policy.repository.ts`, `backend/src/services/im-policy.service.ts`, `backend/src/validators/im-policy.validator.ts`, `backend/src/controllers/im-policy.controller.ts`, `backend/src/routes/im-policy.routes.ts` — retention reads/version updates.
- `backend/src/services/im-server-retention.service.ts`, `backend/src/repositories/im-server-retention.repository.ts`, `backend/src/workers/im-server-retention.worker.ts` — server-only expiry without instructing devices to erase local history.
- `backend/scripts/backfill-system-settings.ts`, `backend/scripts/check-system-settings-flow.ts` — guarded non-production bootstrap/checker.

### Frontend

- `src/features/platform-settings/api.ts`, `types.ts`, `PlatformSettingsProvider.tsx` — validated safe public projection.
- `src/features/admin-system-settings/api.ts`, `types.ts`, `i18n.ts`, `SystemSettingsPage.tsx` — operations workspace shell and request adapter.
- `src/features/admin-system-settings/BasicSettingsTab.tsx` — site, registration, Google, password OTP, LOGO, Request image, previews.
- `src/features/admin-system-settings/LegalDocumentsTab.tsx` — catalog, language buttons, draft/publish, history, related-page link.
- `src/features/admin-system-settings/RetentionSettingsTab.tsx` — 30/3 day settings and prospective-only explanation.
- `src/features/admin-system-settings/PaymentSettingsTab.tsx` — offline/NDP switches and non-actionable provider project rows.
- Existing consumers: `src/pages/auth/LoginPage.tsx`, `src/components/mobile/MobileShell.tsx`, `src/pages/user/UserOrderDetailPage.tsx`, `src/features/settings/UnifiedSettingsPages.tsx`, `src/features/identity-applications/AffiliateActivationPage.tsx`, `src/features/identity-applications/MerchantApplicationPage.tsx`, `src/pages/admin/NdpExchangeRatePage.tsx`, `src/components/admin/AdminLayout.tsx`, and `src/App.tsx`.

---

### Task 1: Add typed persistence and additive migration

**Files:**
- Create: `backend/tests/system-settings-schema.test.ts`
- Create: `backend/prisma/migrations/20260906100000_operations_system_settings/migration.sql`
- Create: `backend/src/domain/platform-settings.ts`
- Create: `backend/src/domain/legal-document.ts`
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/tests/user-management-seed.test.ts`

**Interfaces:**
- Produces `PlatformSettingVersion`, `LegalDocument`, `LegalDocumentDraft`, and `LegalDocumentRelease` Prisma models.
- Produces `PLATFORM_SETTINGS_PERMISSIONS` and `LEGAL_DOCUMENT_PERMISSIONS` constants used by all later routes and UI gates.

- [ ] **Step 1: Write the failing schema and permission test**

```ts
const expectedPermissions = [
  "backoffice:system-settings:read",
  "backoffice:system-settings:write",
  "backoffice:system-brand-media:activate",
  "backoffice:im-retention:read",
  "backoffice:im-retention:write",
  "backoffice:legal-documents:read",
  "backoffice:legal-documents:write",
  "backoffice:legal-documents:publish",
  "backoffice:payment-settings:read",
  "backoffice:payment-settings:write"
];

it("defines versioned platform and locale-specific legal persistence", () => {
  expect(schema).toContain("model PlatformSettingVersion");
  expect(schema).toContain("model LegalDocument");
  expect(schema).toContain("model LegalDocumentDraft");
  expect(schema).toContain("model LegalDocumentRelease");
  expect(schema).toContain("@@unique([documentId, locale, version]");
  expect(migration).toContain("platform_setting_versions");
  expect(migration).toContain("legal_document_releases");
  for (const code of expectedPermissions) expect(SYSTEM_PERMISSION_CODES).toContain(code);
});
```

- [ ] **Step 2: Run RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/system-settings-schema.test.ts --runInBand`

Expected: FAIL because the models, migration, and permissions do not exist.

- [ ] **Step 3: Add the exact domain enums and contracts**

```ts
export const PLATFORM_LOGIN_VERIFICATION_RULES = ["first_login", "monthly_first", "every_login"] as const;
export type PlatformLoginVerificationRule = typeof PLATFORM_LOGIN_VERIFICATION_RULES[number];
export const LEGAL_DOCUMENT_LOCALES = ["zh-CN", "zh-TW", "ja", "en", "ko"] as const;
export type LegalDocumentLocale = typeof LEGAL_DOCUMENT_LOCALES[number];

export const PLATFORM_SETTINGS_PERMISSIONS = {
  read: "backoffice:system-settings:read",
  write: "backoffice:system-settings:write",
  brandMediaActivate: "backoffice:system-brand-media:activate",
  imRetentionRead: "backoffice:im-retention:read",
  imRetentionWrite: "backoffice:im-retention:write",
  paymentRead: "backoffice:payment-settings:read",
  paymentWrite: "backoffice:payment-settings:write"
} as const;

export const LEGAL_DOCUMENT_PERMISSIONS = {
  read: "backoffice:legal-documents:read",
  write: "backoffice:legal-documents:write",
  publish: "backoffice:legal-documents:publish"
} as const;
```

- [ ] **Step 4: Add Prisma models and reviewed SQL**

Implement a complete immutable settings row with unique `version` and nullable unique `activeKey`, typed booleans, the OTP rule enum, nullable LOGO/Request `MediaAsset` relations, `createdByUserId`, and all timestamp/soft-delete fields. Implement catalog metadata with unique `slug`, `internalPath`, `displayLocations` JSON, `isEnabled`, and `lockVersion`; language drafts with `(documentId, locale)` uniqueness; releases with `(documentId, locale, version)` and `(documentId, locale, activeKey)` uniqueness, immutable body/hash/publication data, actor relations, timestamps, and indexes for every relation/deleted lookup.

The migration must insert permissions and grant read/write/publish only to `admin` and the intended `operator` role; `viewer` receives read permissions only. Seed the first active platform version as site/registration/Google/offline/NDP enabled, password OTP disabled, rule `first_login`, new-IP false, and no media override.

- [ ] **Step 5: Generate Prisma Client and run GREEN**

Run: `npm --prefix backend run prisma:generate`

Run: `npm --prefix backend test -- --runTestsByPath tests/system-settings-schema.test.ts tests/user-management-seed.test.ts --runInBand`

Expected: PASS with no duplicate permission codes or missing role assignments.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260906100000_operations_system_settings/migration.sql backend/src/domain/platform-settings.ts backend/src/domain/legal-document.ts backend/src/constants/permissions.constants.ts backend/tests/system-settings-schema.test.ts backend/tests/user-management-seed.test.ts
git commit -m "feat(backoffice): add system settings persistence"
```

### Task 2: Implement the platform-settings aggregate

**Files:**
- Create: `backend/tests/platform-settings.service.test.ts`
- Create: `backend/tests/platform-settings.repository.test.ts`
- Create: `backend/src/repositories/platform-settings.repository.ts`
- Create: `backend/src/services/platform-settings.resolver.ts`
- Create: `backend/src/services/platform-settings.service.ts`
- Modify: `backend/src/constants/error-codes.ts`

**Interfaces:**
- Produces `PlatformSettingsResolver.getActive(): Promise<PlatformSettingsSnapshot>` and `invalidate(): void`.
- Produces `PlatformSettingsService.getPublic()`, `getForOperations(actor)`, `updateBasic(actor, context, input)`, and `updatePayment(actor, context, input)`.

- [ ] **Step 1: Write failing service tests**

```ts
it("creates one coherent next version and rejects stale updates", async () => {
  repository.current = setting({ version: 4, offlinePaymentEnabled: true });
  const updated = await service.updateBasic(operator, context, {
    expectedVersion: 4,
    siteEnabled: false,
    selfRegistrationEnabled: true,
    googleLoginEnabled: true,
    passwordLoginOtpEnabled: true,
    passwordLoginOtpRule: "monthly_first",
    passwordLoginOtpOnNewIp: true,
    loginLogoMediaPublicId: null,
    requestButtonMediaPublicId: null
  });
  expect(updated.version).toBe(5);
  expect(updated.offlinePaymentEnabled).toBe(true);
  await expect(service.updatePayment(operator, context, {
    expectedVersion: 4,
    offlinePaymentEnabled: false,
    ndpPaymentEnabled: true
  })).rejects.toMatchObject({ statusCode: 409 });
});
```

Add tests proving inactive/non-content media is rejected, public projections omit internal IDs and actor data, non-global identities fail closed, audit metadata contains field names but no image bytes, and resolver invalidation makes a successful update immediately visible.

- [ ] **Step 2: Run RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/platform-settings.service.test.ts tests/platform-settings.repository.test.ts --runInBand`

Expected: FAIL on missing repository/service modules.

- [ ] **Step 3: Implement repository transaction result types**

```ts
export type PlatformSettingsMutationResult =
  | { kind: "updated"; value: PlatformSettingsRecord }
  | { kind: "version_conflict" }
  | { kind: "media_not_found"; field: "loginLogo" | "requestButton" };

export interface PlatformSettingsRepositoryPort {
  getActive(): Promise<PlatformSettingsRecord | null>;
  replaceWithAudit(input: ReplacePlatformSettingsInput): Promise<PlatformSettingsMutationResult>;
}
```

Use a serializable Prisma transaction: re-read `activeKey="active"`, compare `expectedVersion`, validate both optional `MediaAsset` rows are active `content_publication_upload` images, clear the prior active key, create the complete next row, and insert one audit log before commit.

- [ ] **Step 4: Implement service and bounded resolver**

```ts
export class PlatformSettingsResolver {
  private cached: { expiresAt: number; value: PlatformSettingsSnapshot } | null = null;
  constructor(private readonly repository: Pick<PlatformSettingsRepositoryPort, "getActive">, private readonly ttlMs = 5_000) {}
  public async getActive() { /* return unexpired cache or require the active database row */ }
  public invalidate() { this.cached = null; }
}
```

Map missing active configuration to `error.platform_settings.unavailable`/503, version conflicts to `error.platform_settings.version_conflict`/409, and invalid media to `error.platform_settings.media_not_found`/404. Call `resolver.invalidate()` only after a committed update.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm --prefix backend test -- --runTestsByPath tests/platform-settings.service.test.ts tests/platform-settings.repository.test.ts --runInBand`

Expected: PASS.

```bash
git add backend/src/domain/platform-settings.ts backend/src/repositories/platform-settings.repository.ts backend/src/services/platform-settings.resolver.ts backend/src/services/platform-settings.service.ts backend/src/constants/error-codes.ts backend/tests/platform-settings.service.test.ts backend/tests/platform-settings.repository.test.ts
git commit -m "feat(backoffice): add versioned platform settings service"
```

### Task 3: Expose formal platform-settings APIs

**Files:**
- Create: `backend/tests/platform-settings-api.test.ts`
- Create: `backend/tests/platform-settings-openapi.test.ts`
- Create: `backend/src/validators/platform-settings.validator.ts`
- Create: `backend/src/controllers/platform-settings.controller.ts`
- Create: `backend/src/routes/platform-settings.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`

**Interfaces:**
- Produces public `GET /api/v1/platform/settings/public`.
- Produces protected `GET /api/v1/backoffice/system-settings`, `PUT .../basic`, and `PUT .../payment`.

- [ ] **Step 1: Write failing route/RBAC/OpenAPI tests**

```ts
expect(await request(app).get("/api/v1/platform/settings/public")).toMatchObject({
  status: 200,
  body: { data: { siteEnabled: true, selfRegistrationEnabled: true } }
});
await request(app).put("/api/v1/backoffice/system-settings/basic").set("Authorization", "Bearer read-only").send(validBasic).expect(403);
await request(app).put("/api/v1/backoffice/system-settings/basic").set("Authorization", "Bearer writer").send({ ...validBasic, unknown: true }).expect(400);
expect(openapi.paths["/api/v1/backoffice/system-settings/basic"].put.security).toEqual([{ bearerAuth: [] }]);
```

- [ ] **Step 2: Run RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/platform-settings-api.test.ts tests/platform-settings-openapi.test.ts --runInBand`

Expected: FAIL with 404 routes.

- [ ] **Step 3: Add strict validators and thin controller**

```ts
export const platformBasicSettingsBodySchema = z.object({
  expectedVersion: z.number().int().positive(),
  siteEnabled: z.boolean(),
  selfRegistrationEnabled: z.boolean(),
  googleLoginEnabled: z.boolean(),
  passwordLoginOtpEnabled: z.boolean(),
  passwordLoginOtpRule: z.enum(PLATFORM_LOGIN_VERIFICATION_RULES),
  passwordLoginOtpOnNewIp: z.boolean(),
  loginLogoMediaPublicId: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  requestButtonMediaPublicId: z.string().regex(/^[a-f0-9]{64}$/).nullable()
}).strict();
```

Payment accepts only `expectedVersion`, `offlinePaymentEnabled`, and `ndpPaymentEnabled`. Controller methods parse, pass authenticated access/request context, and return `successResponse`.

- [ ] **Step 4: Wire one shared resolver/service and document schemas**

Construct the resolver once inside `createApp`, expose injectable ports on `AppDependencies`, and reuse the same resolver in routes and later enforcement. Document unavailable providers as fixed response rows with `configured:false`, `enabled:false`, and `actionable:false`; never expose a write field for them.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm --prefix backend test -- --runTestsByPath tests/platform-settings-api.test.ts tests/platform-settings-openapi.test.ts --runInBand`

Expected: PASS.

```bash
git add backend/src/validators/platform-settings.validator.ts backend/src/controllers/platform-settings.controller.ts backend/src/routes/platform-settings.routes.ts backend/src/app.ts backend/src/api/openapi.ts backend/tests/platform-settings-api.test.ts backend/tests/platform-settings-openapi.test.ts
git commit -m "feat(api): expose platform settings contracts"
```

### Task 4: Enforce maintenance, registration, Google, and password-login OTP

**Files:**
- Create: `backend/tests/platform-access-policy.test.ts`
- Create: `backend/tests/password-login-verification.test.ts`
- Create: `backend/src/services/platform-access-policy.service.ts`
- Create: `backend/src/middlewares/platform-maintenance.middleware.ts`
- Modify: `backend/src/services/auth.service.ts`
- Modify: `backend/src/repositories/auth.repository.ts`
- Modify: `backend/src/services/auth-verification-challenge.store.ts`
- Modify: `backend/src/controllers/auth.controller.ts`
- Modify: `backend/src/routes/auth.routes.ts`
- Modify: `backend/src/validators/auth.validator.ts`
- Modify: `backend/src/middlewares/authenticate.middleware.ts`
- Modify: `backend/src/api/openapi.ts`

**Interfaces:**
- `AuthService.login()` returns `PasswordLoginResult`, either authenticated tokens or `verification_required`.
- New `POST /api/v1/auth/login/verify` consumes `{challengeId, otp}` and returns tokens.
- `PlatformAccessPolicyService` supplies registration, Google, login, authenticated-route, and public maintenance guards.

- [ ] **Step 1: Write failing policy tests**

```ts
it.each(["customer", "technician", "merchant_owner", "scout"])("blocks %s while site is closed", async (role) => {
  resolver.value = settings({ siteEnabled: false });
  await expect(policy.assertAuthenticatedAccess(actor(role))).rejects.toMatchObject({ statusCode: 503 });
});

it("allows global operations recovery while site is closed", async () => {
  resolver.value = settings({ siteEnabled: false });
  await expect(policy.assertAuthenticatedAccess(globalOperator)).resolves.toBeUndefined();
});

it("blocks self-registration but not operations-created users", async () => {
  resolver.value = settings({ selfRegistrationEnabled: false });
  await expect(auth.startRegistration(registration)).rejects.toMatchObject({ message: "error.auth.registration_disabled" });
  await expect(userService.create(userInput, globalOperator, context)).resolves.toBeDefined();
});
```

- [ ] **Step 2: Write failing OTP decision tests**

Cover master-off, first successful login, Tokyo monthly boundary, every login, same-IP, new-IP, combined OR behavior, no token before verification, one-time challenge completion, expiry, cooldown, and no account-enumeration response.

```ts
expect(await auth.login("user@example.com", password, context)).toEqual({
  status: "verification_required",
  challengeId: expect.any(String),
  maskedEmail: "u***@example.com",
  expiresIn: 600,
  cooldownSeconds: 60
});
expect(sessionStore.storedRefreshTokens).toHaveLength(0);
```

- [ ] **Step 3: Run RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/platform-access-policy.test.ts tests/password-login-verification.test.ts --runInBand`

Expected: FAIL because policies and login challenge result do not exist.

- [ ] **Step 4: Implement the access policy and auth result union**

```ts
export type PasswordLoginResult =
  | ({ status: "authenticated" } & TokenPairPayload)
  | ({ status: "verification_required" } & RegistrationChallengePayload);
```

Extend challenge purposes with `password_login`. After valid password/account-state checks, query successful `LoginLog` evidence by user, Tokyo month range, and request IP. If the rule requires OTP, create/deliver a challenge containing only `userId`, `loginIdentityId`, and `platformSettingsVersion`; do not issue tokens or create a successful login log. Completion reserves the challenge, re-reads the active user, calls the existing successful-login transaction, finalizes the challenge, and revokes any partially stored refresh token if finalization fails.

Check self-registration both when creating and when completing a pending registration challenge. Check Google availability before init/credential/login/link calls, and check self-registration before creating a new Google user while preserving existing bindings.

- [ ] **Step 5: Add maintenance enforcement**

Allow `/health`, `/ready`, the public settings projection, operations authentication completion, and `/backoffice/*` routing to proceed to their own auth/RBAC. Block other unauthenticated public business routes with `error.platform.maintenance`/503. Extend authenticated access handling so non-global identities are blocked while global/platform operations identities remain usable.

- [ ] **Step 6: Run GREEN and regression tests**

Run: `npm --prefix backend test -- --runTestsByPath tests/platform-access-policy.test.ts tests/password-login-verification.test.ts tests/auth.test.ts --runInBand`

Expected: PASS; existing Google binding verification remains mandatory.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/platform-access-policy.service.ts backend/src/middlewares/platform-maintenance.middleware.ts backend/src/services/auth.service.ts backend/src/repositories/auth.repository.ts backend/src/services/auth-verification-challenge.store.ts backend/src/controllers/auth.controller.ts backend/src/routes/auth.routes.ts backend/src/validators/auth.validator.ts backend/src/middlewares/authenticate.middleware.ts backend/src/api/openapi.ts backend/tests/platform-access-policy.test.ts backend/tests/password-login-verification.test.ts backend/tests/auth.test.ts
git commit -m "feat(auth): enforce platform access and login verification"
```

### Task 5: Enforce supported payment availability

**Files:**
- Create: `backend/tests/platform-payment-settings.test.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/validators/booking.validator.ts`
- Modify: `backend/src/routes/booking.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `src/features/booking/api.ts`
- Modify: `src/pages/user/UserOrderDetailPage.tsx`
- Modify: `src/pages/user/UserOrderDetailPage.formal.test.tsx`

**Interfaces:**
- Checkout projection adds `availablePaymentMethods: Array<"cash" | "ndp">`.
- Payment selection accepts only methods returned by the authoritative projection; legacy `other` submissions fail closed.

- [ ] **Step 1: Write failing backend payment tests**

```ts
it("filters and rejects disabled methods from the same settings snapshot", async () => {
  resolver.value = settings({ offlinePaymentEnabled: false, ndpPaymentEnabled: true });
  expect((await service.getCheckout(customer, 88)).availablePaymentMethods).toEqual(["ndp"]);
  await expect(service.selectCheckoutPaymentMethod(customer, 88, { method: "cash", idempotencyKey: key }, context))
    .rejects.toMatchObject({ message: "error.payment.method_disabled" });
});

it.each(["paypay", "paypal"])("does not treat %s as manual other payment", async (code) => {
  await expect(selectOther(code)).rejects.toMatchObject({ message: "error.payment.provider_unconfigured" });
});
```

- [ ] **Step 2: Run RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/platform-payment-settings.test.ts tests/order-fulfillment-api.test.ts --runInBand`

Expected: FAIL because checkout does not resolve platform availability.

- [ ] **Step 3: Inject the shared resolver and enforce before writes**

Add one `PlatformPaymentPolicyPort` to `BookingService` and route construction. Return stable arrays in `getCheckout`; reject disabled cash/NDP before repository mutation. Retain legacy parsing only to return an explicit unavailable-provider error for `other`; do not create a PayPay/PayPal/Stripe command.

- [ ] **Step 4: Update the actual checkout UI from server data**

Render buttons from `checkout.availablePaymentMethods`, map `cash` to the line/offline explanation, map `ndp` to the formal NDP flow, and remove the generic selectable “other” control. Preserve selected-method idempotency and confirmation behavior.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm --prefix backend test -- --runTestsByPath tests/platform-payment-settings.test.ts tests/order-fulfillment-api.test.ts --runInBand`

Run: `npm test -- src/pages/user/UserOrderDetailPage.formal.test.tsx src/features/booking/api.test.ts`

Expected: PASS.

```bash
git add backend/src/services/booking.service.ts backend/src/repositories/booking.repository.ts backend/src/validators/booking.validator.ts backend/src/routes/booking.routes.ts backend/src/api/openapi.ts backend/tests/platform-payment-settings.test.ts src/features/booking/api.ts src/pages/user/UserOrderDetailPage.tsx src/pages/user/UserOrderDetailPage.formal.test.tsx src/features/booking/api.test.ts
git commit -m "feat(checkout): enforce platform payment availability"
```

### Task 6: Add prospective IM retention and media lifecycle

**Files:**
- Create: `backend/tests/im-policy.service.test.ts`
- Create: `backend/tests/im-server-retention.test.ts`
- Create: `backend/src/repositories/im-policy.repository.ts`
- Create: `backend/src/services/im-policy.service.ts`
- Create: `backend/src/validators/im-policy.validator.ts`
- Create: `backend/src/controllers/im-policy.controller.ts`
- Create: `backend/src/routes/im-policy.routes.ts`
- Create: `backend/src/repositories/im-server-retention.repository.ts`
- Create: `backend/src/services/im-server-retention.service.ts`
- Create: `backend/src/workers/im-server-retention.worker.ts`
- Modify: `backend/src/services/im-media.service.ts`
- Modify: `backend/src/services/im-media.storage.ts`
- Modify: `backend/src/repositories/im-message-send.transaction.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/api/openapi.ts`

**Interfaces:**
- Produces `GET/PUT /api/v1/backoffice/system-settings/im-retention` using whole days.
- Extends IM media upload persistence through `MediaAsset` with a send-time binding and `purgeAt`.
- Produces server-retention worker results `{scanned, messagesPurged, mediaPurged, failed}` without a client deletion broadcast.

- [ ] **Step 1: Write failing policy/API tests**

```ts
expect(await service.get(globalOperator)).toMatchObject({ messageDays: 30, mediaDays: 3, version: 1 });
await expect(service.update(globalOperator, context, { expectedVersion: 1, messageDays: 0, mediaDays: 3 }))
  .rejects.toMatchObject({ statusCode: 400 });
expect(await service.update(globalOperator, context, { expectedVersion: 1, messageDays: 45, mediaDays: 7 }))
  .toMatchObject({ messageDays: 45, mediaDays: 7, version: 2 });
```

- [ ] **Step 2: Write failing lifecycle tests**

Prove a pre-update message keeps its original `expiresAt`, a post-update message snapshots the new policy version, media binding sets `purgeAt` from the active media rule, expired server content is removed, and no `message.deleted` event or device-local deletion directive is published for `SERVER_RETENTION_EXPIRED`/`MEDIA_EXPIRED`.

- [ ] **Step 3: Run RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/im-policy.service.test.ts tests/im-server-retention.test.ts --runInBand`

Expected: FAIL on missing policy/worker modules.

- [ ] **Step 4: Implement versioned `ImPolicy` update and API**

Convert whole days using `days * 86_400`, enforce safe positive integer limits, create a new active policy row in a serializable transaction, preserve recall/traceless fields, clear the former `activeKey`, record changed fields in audit, and map stale `expectedVersion` to HTTP 409. Set the bootstrap active policy to `textRetentionSeconds=2_592_000` and image/video retention to `259_200` without rewriting existing message expiries.

- [ ] **Step 5: Bind IM media to formal lifecycle**

On upload, create an active `MediaAsset` row with `entityType="im_media_upload"`, `entityId=conversationId`, owner IDs, opaque `/media/im/` URL, checksum/file metadata, and a short unbound-upload purge boundary. During message creation, validate referenced same-conversation IM media, change it to `entityType="message"`, set `entityId=message.id`, and set `purgeAt` from the active `imageRetentionSeconds`/`videoRetentionSeconds` policy snapshot.

- [ ] **Step 6: Implement and wire the server-retention worker**

Select due global-retention messages where `expiresAt <= now`, `expiredAt IS NULL`, and `privacyPolicyVersionAtSend IS NULL`; purge content/translations/reactions and server row state transactionally with `SERVER_RETENTION_EXPIRED` audit evidence but no realtime deletion broadcast. Select due IM `MediaAsset` rows, delete the physical file through the storage port, then mark `purgedAt`; retain rows for audit and retry failed file deletions.

- [ ] **Step 7: Run GREEN and commit**

Run: `npm --prefix backend test -- --runTestsByPath tests/im-policy.service.test.ts tests/im-server-retention.test.ts tests/im-privacy-expiry.service.test.ts --runInBand`

Expected: PASS; privacy-mode expiry behavior remains unchanged.

```bash
git add backend/src/repositories/im-policy.repository.ts backend/src/services/im-policy.service.ts backend/src/validators/im-policy.validator.ts backend/src/controllers/im-policy.controller.ts backend/src/routes/im-policy.routes.ts backend/src/repositories/im-server-retention.repository.ts backend/src/services/im-server-retention.service.ts backend/src/workers/im-server-retention.worker.ts backend/src/services/im-media.service.ts backend/src/services/im-media.storage.ts backend/src/repositories/im-message-send.transaction.ts backend/src/app.ts backend/src/server.ts backend/src/api/openapi.ts backend/tests/im-policy.service.test.ts backend/tests/im-server-retention.test.ts
git commit -m "feat(im): add prospective server retention settings"
```

### Task 7: Implement the legal document catalog and publication flow

**Files:**
- Create: `backend/tests/legal-document.service.test.ts`
- Create: `backend/tests/legal-document-api.test.ts`
- Create: `backend/tests/legal-document-openapi.test.ts`
- Create: `backend/src/bootstrap/legal-document-bootstrap.ts`
- Create: `backend/src/repositories/legal-document.repository.ts`
- Create: `backend/src/services/legal-document.service.ts`
- Create: `backend/src/validators/legal-document.validator.ts`
- Create: `backend/src/controllers/legal-document.controller.ts`
- Create: `backend/src/routes/legal-document.routes.ts`
- Modify: `backend/src/services/needo-contract-catalog.service.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`

**Interfaces:**
- Produces paginated `GET/POST /api/v1/backoffice/legal-documents`, metadata `PATCH /api/v1/backoffice/legal-documents/:publicId`, locale `GET .../:publicId/locales/:locale`, draft `PUT .../:locale/draft`, publish `POST .../:locale/publish`, and paginated `GET .../:locale/releases` routes.
- Produces public `GET /api/v1/legal-documents/:slug/current?locale=...`.
- Makes `NeedoContractCatalogService.getCurrent(type, language)` resolve published `merchant-agreement` and `affiliate-agreement` releases.

- [ ] **Step 1: Write failing service tests**

```ts
it("isolates language drafts and publishes immutable exact content", async () => {
  const zh = await service.saveDraft(operator, context, id, "zh-CN", { expectedLockVersion: null, title: "利用规约", body: "中文正文" });
  const ja = await service.saveDraft(operator, context, id, "ja", { expectedLockVersion: null, title: "利用規約", body: "日本語本文" });
  const published = await service.publish(operator, context, id, "zh-CN", { expectedDraftLockVersion: zh.lockVersion, publishedAt });
  expect(published).toMatchObject({ locale: "zh-CN", version: 1, body: "中文正文", publishedAt });
  expect((await service.getLocale(operator, id, "ja")).draft?.body).toBe(ja.body);
  await expect(repository.updateReleaseBody(published.publicId, "changed")).rejects.toBeDefined();
});
```

Also test strict internal paths (`/me/settings/terms` accepted; `https://example.com`, `//evil`, backslashes, and traversal rejected), disabled/no-release public 404, missing-locale unavailable, stale metadata/draft conflicts, pagination, RBAC, hash stability, and audit bodies excluded.

- [ ] **Step 2: Run RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/legal-document.service.test.ts tests/legal-document-api.test.ts tests/legal-document-openapi.test.ts --runInBand`

Expected: FAIL with missing modules/routes.

- [ ] **Step 3: Implement repository and service**

```ts
const normalizeInternalPath = (value: string) => {
  const trimmed = value.trim();
  if (!/^\/(?!\/)[A-Za-z0-9/_?=&.-]*$/.test(trimmed) || trimmed.includes("..") || trimmed.includes("\\")) {
    throw validationError("error.legal_document.internal_path_invalid");
  }
  return trimmed;
};

const contentHash = createHash("sha256")
  .update(JSON.stringify({ locale, title, body }), "utf8")
  .digest("hex");
```

Publication runs serializably: lock/re-read the exact draft, verify lock version, compute next locale release version, clear the previous release’s active key, insert immutable release, update document visibility only when requested, and insert audit metadata without the full body.

- [ ] **Step 4: Preserve bootstrap sources, then add routes/OpenAPI and the persisted contract catalog**

Move the current merchant/Affiliate source records unchanged into `backend/src/bootstrap/legal-document-bootstrap.ts`; this module is import-only seed input and is never used as a runtime fallback. Implement the approved routes with exact read/write/publish permissions. Replace in-code current merchant/Affiliate resolution with repository-backed release lookup while leaving acceptance snapshots and conflict checks unchanged.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm --prefix backend test -- --runTestsByPath tests/legal-document.service.test.ts tests/legal-document-api.test.ts tests/legal-document-openapi.test.ts tests/contract-acceptance.service.test.ts --runInBand`

Expected: PASS.

```bash
git add backend/src/bootstrap/legal-document-bootstrap.ts backend/src/repositories/legal-document.repository.ts backend/src/services/legal-document.service.ts backend/src/validators/legal-document.validator.ts backend/src/controllers/legal-document.controller.ts backend/src/routes/legal-document.routes.ts backend/src/services/needo-contract-catalog.service.ts backend/src/app.ts backend/src/api/openapi.ts backend/tests/legal-document.service.test.ts backend/tests/legal-document-api.test.ts backend/tests/legal-document-openapi.test.ts
git commit -m "feat(backoffice): add legal document publication"
```

### Task 8: Bootstrap existing legal content with guarded real-data tooling

**Files:**
- Create: `backend/scripts/backfill-system-settings.ts`
- Create: `backend/scripts/check-system-settings-flow.ts`
- Create: `backend/tests/system-settings-flow-script.test.ts`
- Modify: `backend/package.json`
- Read as source: `src/features/settings/legalTermsContent.ts`
- Read as source: `src/features/settings/legalPrivacyContent.ts`
- Read as source: `backend/src/bootstrap/legal-document-bootstrap.ts`

**Interfaces:**
- Produces `npm --prefix backend run backfill:system-settings` and `check:system-settings-flow`.
- Imports exact existing text into four stable slugs across available locales without inventing missing translations.

- [ ] **Step 1: Write failing script-contract test**

```ts
expect(packageJson.scripts["backfill:system-settings"]).toBe("tsx scripts/backfill-system-settings.ts");
expect(packageJson.scripts["check:system-settings-flow"]).toBe("tsx scripts/check-system-settings-flow.ts");
expect(backfillSource).toContain("assertNonProductionLocalDatabase");
expect(backfillSource).toContain("terms-of-use");
expect(backfillSource).toContain("privacy-policy");
expect(backfillSource).toContain("merchant-agreement");
expect(backfillSource).toContain("affiliate-agreement");
```

- [ ] **Step 2: Run RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/system-settings-flow-script.test.ts --runInBand`

Expected: FAIL because scripts are absent.

- [ ] **Step 3: Implement idempotent guarded backfill**

Reject production-looking `NODE_ENV`/`DEPLOY_ENV`, remote DB hosts, and non-local database names. Parse/import the exact existing documents, calculate hashes with the same service function, create missing catalog/draft/release rows and inactive future guideline entries, and return `created`, `verified`, or `conflict` per slug/locale. Never overwrite a non-matching existing release.

- [ ] **Step 4: Implement rollback-contained checker**

Create marker-scoped settings/document drafts in a transaction, exercise repository/service version conflicts, legal publish, RBAC, audit redaction, IM prospective expiry, payment filtering, and restore/rollback every marker. Separately assert no residue and verify initial release hashes against source content.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm --prefix backend test -- --runTestsByPath tests/system-settings-flow-script.test.ts --runInBand`

Expected: PASS.

```bash
git add backend/scripts/backfill-system-settings.ts backend/scripts/check-system-settings-flow.ts backend/tests/system-settings-flow-script.test.ts backend/package.json
git commit -m "test(backoffice): add system settings data checker"
```

### Task 9: Add the frontend public-settings runtime and login challenge UI

**Files:**
- Create: `src/features/platform-settings/types.ts`
- Create: `src/features/platform-settings/api.ts`
- Create: `src/features/platform-settings/PlatformSettingsProvider.tsx`
- Create: `src/features/platform-settings/PlatformSettingsProvider.test.tsx`
- Modify: `src/api/auth.ts`
- Modify: `src/api/auth.test.ts`
- Modify: `src/auth/AuthProvider.tsx`
- Modify: `src/auth/AuthProvider.test.ts`
- Modify: `src/pages/auth/LoginPage.tsx`
- Modify: `src/pages/auth/LoginPage.test.ts`
- Modify: `src/components/mobile/MobileShell.tsx`
- Modify: `src/components/mobile/MobileShell.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces `usePlatformSettings()` with safe active projection and fail-closed capability defaults.
- Extends password login result handling with `verification_required` and `verifyPasswordLogin`.

- [ ] **Step 1: Write failing adapter/provider tests**

```ts
expect(parsePublicPlatformSettings(envelope)).toEqual({
  version: 3,
  siteEnabled: true,
  selfRegistrationEnabled: false,
  loginMethods: { password: true, google: true },
  loginLogo: null,
  requestButton: { url: "/media/content/request.webp", altText: "Request" },
  paymentMethods: ["cash", "ndp"]
});
```

Reject unknown keys/types. On fetch failure, retain bundled brand images but default public registration, Google, and payments to disabled until authoritative configuration loads.

- [ ] **Step 2: Write failing maintenance/login/branding tests**

Prove the customer/merchant/technician portals render the maintenance screen when `siteEnabled=false` while the operations entry remains available; registration and Google controls follow public settings; password login can enter the same six-digit challenge panel without tokens; successful verification completes the existing portal check; failed verification preserves the challenge; LOGO uses the active URL; and `NeedoFeaturedNavButton` uses the configured Request image with bundled fallback only when no override exists.

- [ ] **Step 3: Run RED**

Run: `npm test -- src/features/platform-settings/PlatformSettingsProvider.test.tsx src/api/auth.test.ts src/auth/AuthProvider.test.ts src/pages/auth/LoginPage.test.ts src/components/mobile/MobileShell.test.ts`

Expected: FAIL on missing provider and login result union.

- [ ] **Step 4: Implement runtime, validated auth union, and UI state**

```ts
export type PasswordLoginResult =
  | ({ status: "authenticated" } & TokenPairPayload)
  | ({ status: "verification_required" } & VerificationChallengePayload);
```

Add `/auth/login/verify`, store no challenge secret in persistent browser storage, and issue browser password-save only after final authenticated completion. Reuse the existing verification panel with `kind:"password_login"` and the login account’s masked email.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm test -- src/features/platform-settings/PlatformSettingsProvider.test.tsx src/api/auth.test.ts src/auth/AuthProvider.test.ts src/pages/auth/LoginPage.test.ts src/components/mobile/MobileShell.test.ts`

Expected: PASS.

```bash
git add src/features/platform-settings/types.ts src/features/platform-settings/api.ts src/features/platform-settings/PlatformSettingsProvider.tsx src/features/platform-settings/PlatformSettingsProvider.test.tsx src/api/auth.ts src/api/auth.test.ts src/auth/AuthProvider.tsx src/auth/AuthProvider.test.ts src/pages/auth/LoginPage.tsx src/pages/auth/LoginPage.test.ts src/components/mobile/MobileShell.tsx src/components/mobile/MobileShell.test.ts src/App.tsx
git commit -m "feat(frontend): consume active platform settings"
```

### Task 10: Build the four-tab operations system-settings workspace

**Files:**
- Create: `src/features/admin-system-settings/types.ts`
- Create: `src/features/admin-system-settings/api.ts`
- Create: `src/features/admin-system-settings/i18n.ts`
- Create: `src/features/admin-system-settings/SystemSettingsPage.tsx`
- Create: `src/features/admin-system-settings/BasicSettingsTab.tsx`
- Create: `src/features/admin-system-settings/RetentionSettingsTab.tsx`
- Create: `src/features/admin-system-settings/PaymentSettingsTab.tsx`
- Create: `src/features/admin-system-settings/SystemSettingsPage.test.tsx`
- Create: `src/features/admin-system-settings/SystemSettingsPage.i18n.test.tsx`
- Modify: `src/components/admin/AdminLayout.tsx`
- Modify: `src/pages/admin/AdminCapabilityRoutes.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Produces `/admin/settings/system?tab=basic|legal|storage|payment` behind `backoffice:system-settings:read`.
- Produces exact basic/payment/retention adapters and keeps legal loading independent for Task 11.

- [ ] **Step 1: Write failing navigation/tab tests**

```ts
expect(adminLayoutSource).toContain('to: "/admin/settings/system"');
expect(adminLayoutSource).not.toContain('to: "/admin/roles?module=system"');
for (const tab of ["基础设置", "政策和协议", "储存设置", "支付设置"]) expect(container.textContent).toContain(tab);
expect(screen.getByRole("tab", { name: "储存设置" })).toHaveAttribute("aria-selected", "true");
```

Test keyboard arrows, URL deep-link persistence, read-only rendering, dirty badges, 409 draft retention, stale-request cancellation, media-upload/activation permission separation, invalid day inputs, and unavailable provider rows.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/features/admin-system-settings/SystemSettingsPage.test.tsx src/pages/admin/AdminCapabilityRoutes.test.ts src/App.test.tsx`

Expected: FAIL because the route/page do not exist and navigation still targets roles.

- [ ] **Step 3: Implement typed API and page shell**

Use `httpClient` for the exact formal routes, request-generation guards per tab, `PermissionGate` for each write, and URL search params for tab state. Use existing `AdminLayout`, `ModuleShell`, `Button`, `Badge`, and `ToggleSwitch`; do not add a new color system.

- [ ] **Step 4: Implement basic, storage, and payment tabs**

Basic groups site access, self-registration/Google, fixed non-actionable Apple/LINE future entries, OTP master/radio/new-IP, and media upload/preview. Storage uses positive integer days and prospective-only copy. Payment exposes working toggles only for offline/NDP and fixed non-actionable PayPay/PayPal/Stripe rows with `configured:false`.

- [ ] **Step 5: Run GREEN, i18n audit, and commit**

Run: `npm test -- src/features/admin-system-settings/SystemSettingsPage.test.tsx src/features/admin-system-settings/SystemSettingsPage.i18n.test.tsx src/pages/admin/AdminCapabilityRoutes.test.ts src/App.test.tsx`

Run: `npm run i18n:audit`

Expected: PASS with all five languages registered.

```bash
git add src/features/admin-system-settings src/components/admin/AdminLayout.tsx src/pages/admin/AdminCapabilityRoutes.test.ts src/App.tsx src/App.test.tsx src/i18n/translations.ts
git commit -m "feat(backoffice): add system settings workspace"
```

### Task 11: Build legal editing and switch public/contract consumers

**Files:**
- Create: `src/features/admin-system-settings/LegalDocumentsTab.tsx`
- Create: `src/features/admin-system-settings/LegalDocumentsTab.test.tsx`
- Modify: `src/features/admin-system-settings/api.ts`
- Modify: `src/features/admin-system-settings/types.ts`
- Modify: `src/features/settings/UnifiedSettingsPages.tsx`
- Modify: `src/features/settings/UnifiedSettingsPages.test.ts`
- Modify: `src/features/identity-applications/api.ts`
- Modify: `src/features/identity-applications/AffiliateActivationPage.tsx`
- Modify: `src/features/identity-applications/MerchantApplicationPage.tsx`

**Interfaces:**
- Completes the legal tab with paginated catalog, five locale buttons, draft save, publication, release history, and related internal link.
- Public terms/privacy and contract screens consume persisted current releases.

- [ ] **Step 1: Write failing legal-editor tests**

```ts
for (const locale of ["简体中文", "繁體中文", "日本語", "English", "한국어"]) {
  expect(container.textContent).toContain(locale);
}
expect(api.saveDraft).toHaveBeenCalledWith(documentId, "ja", expect.objectContaining({ body: "日本語本文" }));
expect(api.publish).not.toHaveBeenCalled();
```

Test separate unsaved drafts per locale, draft/save/publish separation, version/date display, disabled future documents, new-document metadata, internal-link validation feedback, related-page navigation, paginated history, 409 retention, missing-locale public state, and no static cross-language fallback.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/features/admin-system-settings/LegalDocumentsTab.test.tsx src/features/settings/UnifiedSettingsPages.test.ts`

Expected: FAIL because the legal editor and public adapter are absent.

- [ ] **Step 3: Implement editor and public document hook**

Keep catalog and selected-locale requests independently cancellable. Save `{title, body, expectedLockVersion}` as a draft; publish only the exact server draft lock version and an ISO publication timestamp. Open related pages only after validating that the API returned a same-origin path.

- [ ] **Step 4: Replace static runtime reads while preserving acceptance evidence**

Terms/privacy pages fetch by stable slug and current language and render authored body without passing it through UI i18n. Merchant/Affiliate application screens continue using their existing contract API, now backed by persisted releases. Static source modules remain only as guarded bootstrap sources until a separate removal microstep proves every environment is migrated.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm test -- src/features/admin-system-settings/LegalDocumentsTab.test.tsx src/features/settings/UnifiedSettingsPages.test.ts src/features/identity-applications/api.test.ts`

Expected: PASS.

```bash
git add src/features/admin-system-settings/LegalDocumentsTab.tsx src/features/admin-system-settings/LegalDocumentsTab.test.tsx src/features/admin-system-settings/api.ts src/features/admin-system-settings/types.ts src/features/settings/UnifiedSettingsPages.tsx src/features/settings/UnifiedSettingsPages.test.ts src/features/identity-applications/api.ts src/features/identity-applications/AffiliateActivationPage.tsx src/features/identity-applications/MerchantApplicationPage.tsx
git commit -m "feat(backoffice): add multilingual legal editor"
```

### Task 12: Align the NDP exchange-rate page and complete formal verification

**Files:**
- Modify: `src/pages/admin/NdpExchangeRatePage.tsx`
- Modify: `src/pages/admin/NdpExchangeRatePage.test.tsx`
- Modify: `src/pages/admin/NdpExchangeRatePage.i18n.test.tsx`
- Modify: `docs/backoffice-real-data.md`

**Interfaces:**
- Preserves `ndpExchangeRateApi`, `classifyNdpExchangeRate`, idempotency, 409 handling, evaluated-time pagination, and permission gates.
- Produces final documented API/migration/RBAC/browser acceptance record.

- [ ] **Step 1: Write failing visual-contract tests**

Assert the page uses the same operations summary-card, section-header, form-field, error-banner, history-table, and responsive wrapper class contracts as system settings while retaining every behavior assertion in `NdpExchangeRatePage.test.tsx`.

```ts
expect(container.querySelector('[data-admin-surface="summary"]')).not.toBeNull();
expect(container.querySelector('[data-admin-surface="history"]')).not.toBeNull();
expect(ndpExchangeRateApi.publish).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 3, idempotencyKey: expect.stringMatching(/^[a-f0-9]{32}$/) }));
```

- [ ] **Step 2: Run RED**

Run: `npm test -- src/pages/admin/NdpExchangeRatePage.test.tsx src/pages/admin/NdpExchangeRatePage.i18n.test.tsx`

Expected: FAIL only on the new shared visual contracts.

- [ ] **Step 3: Restyle without changing financial behavior**

Replace generic Slate-only surface classes with the operations `ink/paper/line/mist` tokens and shared component patterns. Keep current/scheduled/history semantics, form validation, explicit confirmation, command fingerprint/idempotency reuse, conflict refresh lock, and permission behavior byte-for-byte equivalent at the adapter boundary.

- [ ] **Step 4: Run focused and full automated verification**

Run: `npm test -- src/pages/admin/NdpExchangeRatePage.test.tsx src/pages/admin/NdpExchangeRatePage.i18n.test.tsx src/features/admin-system-settings src/pages/auth/LoginPage.test.ts src/components/mobile/MobileShell.test.ts src/pages/user/UserOrderDetailPage.formal.test.tsx`

Run: `npm --prefix backend test -- --runInBand`

Run: `npm --prefix backend run lint`

Run: `npm --prefix backend run build`

Run: `npm run test`

Run: `npm run lint`

Run: `npm run verify:production-build`

Run: `git diff --check`

Expected: every command exits 0 with zero test failures and zero lint/build errors.

- [ ] **Step 5: Apply and reconcile only the focused non-production migration**

Run: `ENV_FILE=.env.dev npm --prefix backend run prisma:status`

Review pending migrations. Continue only if `20260906100000_operations_system_settings` is the sole pending repository migration; otherwise stop and report the unrelated-migration blocker.

Run: `ENV_FILE=.env.dev npm --prefix backend run prisma:migrate:deploy`

Run: `ENV_FILE=.env.dev npm --prefix backend run prisma:status`

Run: `ENV_FILE=.env.dev npm --prefix backend run backfill:system-settings`

Run: `ENV_FILE=.env.dev npm --prefix backend run check:system-settings-flow`

Expected: physical tables/constraints/indexes/FKs, initial settings, permissions/grants, source document hashes, audit evidence, rollback cleanup, and migration history reconcile with `issues: []`.

- [ ] **Step 6: Perform formal runtime and browser acceptance**

Start the formal backend with `npm --prefix backend run dev`, and the frontend with `npm run dev:frontend`. Record listener PID, process cwd, branch/commit, proxy target, `/api/v1/health`, and `/api/v1/ready` before interacting.

Using an authenticated operations session, verify distinct system/role routes, all tab deep links, MySQL persistence after reload, LOGO and Request image activation on their real surfaces, public-registration close with operations user creation retained, password email-code modes, new-IP combination, maintenance close/restore, prospective IM expiry, language-isolated legal draft/publication/links, disabled payment method rejection, and NDP exchange-rate behavior. Restore every destructive setting to its initial version and record the restoration audit/version.

- [ ] **Step 7: Update docs and commit**

Document files, APIs, migration, RBAC, exact commands/results, database evidence, browser evidence, restored state, completed scope, and deferred provider/role/permission work in `docs/backoffice-real-data.md`.

```bash
git add src/pages/admin/NdpExchangeRatePage.tsx src/pages/admin/NdpExchangeRatePage.test.tsx src/pages/admin/NdpExchangeRatePage.i18n.test.tsx docs/backoffice-real-data.md
git commit -m "feat(backoffice): align system settings experience"
```

---

## Final Review Checklist

- [ ] `系统设置` resolves only to `/admin/settings/system`; `/admin/roles` remains role management.
- [ ] Site, self-registration, Google, password OTP, offline payment, and NDP payment are enforced by the backend configuration snapshot.
- [ ] Apple, LINE, PayPay, PayPal, and Stripe contain no callable fake integration.
- [ ] LOGO and Request media are formal assets and only become active after a successful settings version.
- [ ] IM settings are 30/3 days by default, prospective-only, and server retention does not instruct devices to erase local history/cache.
- [ ] Legal documents support five independent language drafts, immutable releases, version/publication dates, same-origin display links, disabled future entries, and acceptance snapshots.
- [ ] Every write is Zod-validated, RBAC-protected, optimistic, audited, and documented in OpenAPI.
- [ ] NDP exchange-rate financial behavior is unchanged and its UI matches the operations design system.
- [ ] Full frontend/backend verification and real formal runtime/database/browser acceptance have fresh evidence.
- [ ] No unrelated dirty files were staged, overwritten, deleted, merged, pushed, deployed, or migrated.
