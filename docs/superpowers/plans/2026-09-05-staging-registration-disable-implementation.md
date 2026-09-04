# Staging Registration Disable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Temporarily remove NeeDo Staging self-registration from the public UI and reject both registration APIs before validation, rate limiting, OTP delivery, or database work, without affecting existing-account login.

**Architecture:** Add a default-on backend capability flag and an Express guard placed before every registration middleware, plus a matching default-on Vite flag that removes the registration entry and panel. Pin both values to `false` only in the immutable Staging release contract, leaving local and production defaults unchanged and allowing a later release to restore registration by setting both values to `true`.

**Tech Stack:** Node.js 22, TypeScript, Zod, Express, Jest/Supertest, React 19, Vite 7, Vitest, Docker Compose, Node test runner, AWS immutable release tooling.

## Global Constraints

- `AUTH_REGISTRATION_ENABLED` defaults to `true`; an absent flag must not disable registration in other environments.
- `VITE_AUTH_REGISTRATION_ENABLED` defaults to `true`; an absent build variable must not hide registration in other environments.
- Staging pins both flags to `false` without creating a new Secrets Manager version.
- Disabled registration returns HTTP `403`, code `40313`, message `error.auth.registration_disabled`, and `data: null`.
- The backend guard runs before rate limiting and Zod validation and must not create a challenge, deliver OTP, or write a user.
- Existing password login, refresh, logout, `/auth/me`, RBAC, identity switching, administrator bootstrap, Google-disable behavior, DNS, TLS, MySQL schema, and Redis remain unchanged.
- No mock API, fake account, Prisma migration, seed, or unrelated main-worktree change is allowed.

---

### Task 1: Backend registration capability boundary

**Files:**
- Modify: `backend/tests/auth.test.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Modify: `backend/src/routes/auth.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/.env.dev.example`
- Modify: `backend/.env.staging.example`
- Modify: `backend/.env.prod.example`
- Modify: `docs/environment.md`
- Modify: `docs/api.md`

**Interfaces:**
- Consumes: `booleanSchema`, `AppConfig`, `AppError`, `ERROR_CODES`, `createAuthRoutes`.
- Produces: `AppConfig.AUTH_REGISTRATION_ENABLED: boolean`, `ERROR_CODES.REGISTRATION_DISABLED = 40313`, and a route-first `createRequireRegistrationEnabled(config): RequestHandler` guard.

- [ ] **Step 1: Write the failing disabled-route integration test**

Add this test at the start of the verified-registration describe block. Using deliberately invalid bodies proves the capability guard runs before request validation; side-effect assertions prove it also runs before registration services:

```ts
it("fails closed before validation and side effects when registration is disabled", async () => {
  const fixture = await createAuthFixture({
    ...env,
    AUTH_REGISTRATION_ENABLED: false
  } as Parameters<typeof createApp>[0]);

  for (const path of ["/api/v1/auth/register", "/api/v1/auth/register/verify"]) {
    const response = await request(fixture.app).post(path).send({ secret: "must-not-be-read" });
    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      code: ERROR_CODES.REGISTRATION_DISABLED,
      message: "error.auth.registration_disabled",
      data: null
    });
  }

  expect(fixture.deliveredOtps).toHaveLength(0);
  expect(fixture.otpDeliveryClient.sendOtp).not.toHaveBeenCalled();
  expect(fixture.repository.createVerifiedBaselineCustomer).not.toHaveBeenCalled();
  expect(fixture.registrations).toHaveLength(0);
});
```

- [ ] **Step 2: Run the integration test and prove it fails**

Run:

```bash
cd backend
npm test -- --runInBand tests/auth.test.ts
```

Expected: TypeScript/Jest fails because `REGISTRATION_DISABLED` and `AUTH_REGISTRATION_ENABLED` are not defined, or the endpoints return validation errors instead of the required `403`.

- [ ] **Step 3: Add the backend flag and stable error code**

Add the flag next to the existing registration rate limit in `envSchema`:

```ts
AUTH_REGISTRATION_RATE_LIMIT_MAX: z.coerce.number().int().positive(),
AUTH_REGISTRATION_ENABLED: booleanSchema.default(true),
AUTH_GOOGLE_ENABLED: booleanSchema.default(true),
```

Add the unused `40313` slot without changing existing values:

```ts
REGISTRATION_DISABLED: 40313,
```

- [ ] **Step 4: Put the guard before rate limiting and validation**

Import `RequestHandler` and add this factory below `AUTH_ROUTE_PERMISSIONS`:

```ts
export const createRequireRegistrationEnabled = (config: AppConfig): RequestHandler =>
  (_request, _response, next): void => {
    if (config.AUTH_REGISTRATION_ENABLED === false) {
      next(new AppError({
        code: ERROR_CODES.REGISTRATION_DISABLED,
        message: "error.auth.registration_disabled",
        statusCode: 403
      }));
      return;
    }
    next();
  };
```

Create one guard in `createAuthRoutes` and place it first on both routes:

```ts
const requireRegistrationEnabled = createRequireRegistrationEnabled(config);

router.post(
  "/auth/register",
  requireRegistrationEnabled,
  registrationRateLimit,
  validateRequest({ body: registerBodySchema }),
  controller.register
);
router.post(
  "/auth/register/verify",
  requireRegistrationEnabled,
  verificationRateLimit,
  validateRequest({ body: registerVerifyBodySchema }),
  controller.verifyRegistration
);
```

- [ ] **Step 5: Document API and environment contracts**

Add `AUTH_REGISTRATION_ENABLED=true` to dev/prod examples and `false` to Staging. In `docs/environment.md`, define the default-on behavior and the exact disabled response. In `docs/api.md` and both OpenAPI registration operations, add this response:

```ts
"403": jsonErrorResponse(
  "40313 error.auth.registration_disabled — registration is disabled for this environment"
),
```

- [ ] **Step 6: Run the backend regression gate**

Run:

```bash
cd backend
npm test -- --runInBand tests/auth.test.ts
npm run build
npm run lint
```

Expected: the auth suite passes, TypeScript exits `0`, lint exits `0`, enabled registration tests still pass, and the disabled test observes no OTP or repository writes.

- [ ] **Step 7: Commit the backend boundary**

```bash
git add backend/tests/auth.test.ts backend/src/config/env.ts backend/src/constants/error-codes.ts backend/src/routes/auth.routes.ts backend/src/api/openapi.ts backend/.env.dev.example backend/.env.staging.example backend/.env.prod.example docs/environment.md docs/api.md
git commit -m "feat: add registration capability boundary"
```

---

### Task 2: Frontend registration capability boundary

**Files:**
- Modify: `src/pages/auth/LoginPage.test.ts`
- Modify: `src/pages/auth/LoginPage.tsx`
- Modify: `src/vite-env.d.ts`

**Interfaces:**
- Consumes: `import.meta.env`, `LoginPage`, existing `LoginPanelMode` state.
- Produces: `isRegistrationEnabled(value?: string): boolean` and optional `LoginPage.registrationEnabled` test seam.

- [ ] **Step 1: Write the failing UI test**

Import `isRegistrationEnabled`, verify its default-on parser, then render a disabled user login page:

```ts
it("defaults registration on and removes every registration surface when disabled", async () => {
  expect(isRegistrationEnabled(undefined)).toBe(true);
  expect(isRegistrationEnabled("true")).toBe(true);
  expect(isRegistrationEnabled("false")).toBe(false);

  await act(async () => root.unmount());
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(LoginPage, {
      googleAuthEnabled: false,
      registrationEnabled: false,
      navigateToPortal: mocked.navigateToPortal
    }));
  });
  await flushUi();

  expect(container.querySelector('[data-testid="show-registration"]')).toBeNull();
  expect(container.querySelector('[data-testid="registration-form"]')).toBeNull();
  expect(container.querySelector('[data-testid="auth-verification-panel"]')).toBeNull();
  expect(container.querySelector('[data-testid="show-password-login"]')).not.toBeNull();
  expect(mocked.auth.startRegistration).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the UI test and prove it fails**

Run:

```bash
npx vitest run src/pages/auth/LoginPage.test.ts
```

Expected: FAIL because the parser and prop do not exist and the registration button still renders.

- [ ] **Step 3: Add the default-on build flag and render guard**

Declare the Vite variable:

```ts
readonly VITE_AUTH_REGISTRATION_ENABLED?: string;
```

Add the parser and prop:

```ts
export function isRegistrationEnabled(
  value = import.meta.env.VITE_AUTH_REGISTRATION_ENABLED
) {
  return value?.trim().toLowerCase() !== "false";
}

export function LoginPage({
  googleAuthEnabled = isGoogleAuthEnabled(),
  registrationEnabled = isRegistrationEnabled(),
  navigateToPortal = openPortalEntry
}: {
  googleAuthEnabled?: boolean;
  registrationEnabled?: boolean;
  navigateToPortal?: (portal: PortalScope, route: string) => void;
}) {
```

Require the flag on both registration render branches:

```tsx
) : panelMode === "register" && registrationEnabled ? (
```

```tsx
{activePortal === "user" && registrationEnabled ? (
  <button
    className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-base font-black text-[color:var(--client-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--client-primary)]"
    data-testid="show-registration"
    onClick={() => leaveGoogleWelcome("register")}
    type="button"
  >
    {copy.createAccount}
  </button>
) : null}
```

Registration verification can only be reached from the guarded form in an immutable build; do not change password-login or remembered-session behavior.

- [ ] **Step 4: Run frontend tests and formal build**

Run:

```bash
npx vitest run src/pages/auth/LoginPage.test.ts
npm run build -- --mode formal
```

Expected: the focused suite passes and the formal bundle builds without a new compilation or asset error.

- [ ] **Step 5: Commit the frontend boundary**

```bash
git add src/pages/auth/LoginPage.test.ts src/pages/auth/LoginPage.tsx src/vite-env.d.ts
git commit -m "feat: hide disabled registration surfaces"
```

---

### Task 3: Pin the immutable Staging release to registration disabled

**Files:**
- Modify: `deploy/staging/runtime-contract.test.mjs`
- Modify: `deploy/staging/docker-compose.yml`
- Modify: `scripts/aws-staging-package-application.mjs`
- Modify: `docs/aws-staging-application-runbook.md`
- Modify: `docs/superpowers/specs/2026-09-05-staging-selective-test-account-sync-design.md`

**Interfaces:**
- Consumes: the backend and frontend flags from Tasks 1 and 2.
- Produces: Staging Compose with `AUTH_REGISTRATION_ENABLED=false` and Staging bundle build with `VITE_AUTH_REGISTRATION_ENABLED=false`.

- [ ] **Step 1: Write the failing immutable-release contract**

Extend `runtime-contract.test.mjs`:

```js
test("immutable staging release disables self-registration at both edges", () => {
  const compose = read("./docker-compose.yml");
  const packager = read("../../scripts/aws-staging-package-application.mjs");

  assert.match(compose, /AUTH_REGISTRATION_ENABLED:\s*"false"/);
  assert.match(packager, /VITE_AUTH_REGISTRATION_ENABLED:\s*"false"/);
});
```

- [ ] **Step 2: Run the contract and prove it fails**

Run:

```bash
node --test deploy/staging/runtime-contract.test.mjs
```

Expected: FAIL because neither immutable Staging value is present.

- [ ] **Step 3: Bind the Staging backend and frontend values**

Add the backend flag to the shared API environment anchor so all API processes parse the same safe configuration:

```yaml
AUTH_REGISTRATION_ENABLED: "false"
```

Extend the packager child environment:

```js
VITE_AUTH_GOOGLE_ENABLED: "false",
VITE_AUTH_REGISTRATION_ENABLED: "false"
```

Do not add a Secrets Manager version: Compose overrides the backend value, and Vite compiles the frontend value into the immutable bundle.

- [ ] **Step 4: Document disable and one-release re-enable**

Add a runbook section stating the current Staging values, the exact `40313` contract, and the recovery procedure: change both immutable values to `true`, build a new clean revision, deploy it, and rerun the registration flow. State that EC2, EBS, MySQL, Redis, DNS, and TLS are reused.

Update the approved design status to `实施计划已确认，待执行` only after all focused tests pass.

- [ ] **Step 5: Run release-contract regression tests**

Run:

```bash
node --test deploy/staging/runtime-contract.test.mjs scripts/aws-staging-application-lib.test.mjs
git diff --check
```

Expected: both Node test suites pass and the diff check is clean.

- [ ] **Step 6: Commit the Staging binding and documentation**

```bash
git add deploy/staging/runtime-contract.test.mjs deploy/staging/docker-compose.yml scripts/aws-staging-package-application.mjs docs/aws-staging-application-runbook.md docs/superpowers/specs/2026-09-05-staging-selective-test-account-sync-design.md
git commit -m "ops: disable staging self-registration"
```

---

### Task 4: Package, deploy, and accept the registration-disabled release

**Files:**
- Generate locally, do not commit: `outputs/aws-staging/application-package.json`
- Generate locally, do not commit: `outputs/aws-staging/application-deployment.json`

**Interfaces:**
- Consumes: a clean full Git revision and the existing accepted AWS Staging environment.
- Produces: a content-addressed deployed release and redacted deployment evidence.

- [ ] **Step 1: Run the complete pre-package gate**

```bash
cd backend
npm test -- --runInBand tests/auth.test.ts
npm run build
cd ..
npx vitest run src/pages/auth/LoginPage.test.ts
node --test deploy/staging/runtime-contract.test.mjs scripts/aws-staging-application-lib.test.mjs
npm run verify:production-build
git diff --check
git status --porcelain=v1
```

Expected: all focused checks pass and `git status` is empty. Stop if the repository is dirty or a test fails.

- [ ] **Step 2: Package the exact clean revision**

```bash
release_revision="$(git rev-parse HEAD)"
node scripts/aws-staging-package-application.mjs \
  --source-revision "$release_revision" \
  --environment-evidence outputs/aws-staging/environment-acceptance.json
```

Expected: `application-package.json` reports `status: passed` and the exact `sourceRevision`; the command prints no credential or account data.

- [ ] **Step 3: Deploy through the existing bounded AWS path**

```bash
NEEDO_AWS_CLI="$(command -v aws)" node scripts/aws-staging-deploy-application.mjs \
  --profile needo-staging-bootstrap \
  --account-id 430611185505 \
  --region ap-southeast-2 \
  --source-revision "$release_revision"
```

Expected: EBS snapshot completes, the SSM deployment succeeds, all three readiness checks pass, and the active release points to `release_revision`. This does not write imported accounts.

- [ ] **Step 4: Verify the public API fail-closed contract**

```bash
curl -sS -o /private/tmp/needo-register-disabled.json -w '%{http_code}\n' \
  -X POST https://staging.needo.life/api/v1/auth/register \
  -H 'content-type: application/json' \
  --data '{"secret":"must-not-be-read"}'
curl -sS -o /private/tmp/needo-register-verify-disabled.json -w '%{http_code}\n' \
  -X POST https://staging.needo.life/api/v1/auth/register/verify \
  -H 'content-type: application/json' \
  --data '{"secret":"must-not-be-read"}'
jq -e '.code == 40313 and .message == "error.auth.registration_disabled" and .data == null' \
  /private/tmp/needo-register-disabled.json /private/tmp/needo-register-verify-disabled.json
rm -f -- /private/tmp/needo-register-disabled.json /private/tmp/needo-register-verify-disabled.json
```

Expected for both: HTTP `403` with `{ "code": 40313, "message": "error.auth.registration_disabled", "data": null }`. Verify via a redacted SSM count query that no registration challenge/user count changed.

- [ ] **Step 5: Perform browser and existing-login acceptance**

Open `https://staging.needo.life/#/login/user?redirect=%2F` at desktop and mobile widths. Confirm the create-account control and registration panel are absent, password login is present, and there is no console error or horizontal overflow. Log in using the existing Staging administrator credential read from the approved private source; verify `/auth/me`, then log out. Do not print or capture the password or tokens.

- [ ] **Step 6: Record separate completion states**

Record the source revision, release object version, EBS snapshot ID, SSM command ID, active release, API response contract, browser acceptance, and existing-login result. State explicitly: code committed, release deployed, database migration not run, account synchronization not yet run.
