# Staging Google Auth Disable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the approved AWS Staging runtime to start without fabricated Google OAuth credentials while keeping password login available and Google authentication disabled explicitly.

**Architecture:** Add a default-on backend capability flag that conditionally permits an empty Google Web Client ID only when explicitly disabled, and guard every Google authentication service entry point with the existing dependency-unavailable contract. Add a matching default-on frontend build flag that prevents Google SDK/API initialization and hides the Google login surface, then bind the immutable Staging package build to the disabled value.

**Tech Stack:** Node.js 22, TypeScript, Zod, Express service layer, Jest, React, Vite, Vitest, Node test runner.

## Global Constraints

- `AUTH_GOOGLE_ENABLED` defaults to `true`; missing flags must never silently disable Google login.
- `AUTH_GOOGLE_ENABLED=true` continues to require a non-placeholder Google Web OAuth Client ID in production.
- `AUTH_GOOGLE_ENABLED=false` disables only Google login, link, unlink, and recovery paths with HTTP `503` / `error.dependency.google_auth_unavailable`.
- Password login, JWT, refresh tokens, RBAC, administrator bootstrap, migrations, audit, and existing production safety flags remain unchanged.
- The Staging frontend must not initialize the Google SDK or render its login surface while disabled.
- Do not add mock credentials, change database schema, modify DNS, or fix waived baseline failures.

---

### Task 1: Backend capability flag and fail-closed Google service boundary

**Files:**
- Modify: `backend/tests/production-safety.test.ts`
- Modify: `backend/tests/google-auth.service.test.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/services/auth.service.ts`
- Modify: `backend/.env.staging.example`

**Interfaces:**
- Consumes: existing `booleanSchema`, `AppConfig`, `AppError`, `ERROR_CODES.DEPENDENCY_UNAVAILABLE`.
- Produces: `AppConfig.AUTH_GOOGLE_ENABLED: boolean` and a private `assertGoogleAuthEnabled(): void` guard used by every public Google auth entry point.

- [x] **Step 1: Write failing production configuration tests**

Add cases proving explicit disable accepts a missing ID while default/explicit enable remains strict:

```ts
it("allows an absent Google client ID only when Google auth is explicitly disabled", async () => {
  setValidProductionEnv();
  process.env.AUTH_GOOGLE_ENABLED = "false";
  delete process.env.GOOGLE_AUTH_CLIENT_ID;

  await expect(importEnv()).resolves.toBeUndefined();
});

it("still rejects an absent Google client ID when Google auth is explicitly enabled", async () => {
  setValidProductionEnv();
  process.env.AUTH_GOOGLE_ENABLED = "true";
  delete process.env.GOOGLE_AUTH_CLIENT_ID;

  await expect(importEnv()).rejects.toThrow("GOOGLE_AUTH_CLIENT_ID");
});
```

- [x] **Step 2: Write the failing service-boundary test**

Make `createFixture` accept `{ googleAuthEnabled?: boolean }`, pass a boolean config value, and add a table of all Google service entry points. Every call must reject before touching repositories, Redis, OTP, tokens, or the Google verifier:

```ts
const fixture = createFixture({ googleAuthEnabled: false });
const unavailable = {
  code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
  message: "error.dependency.google_auth_unavailable",
  statusCode: 503
};
const calls = [
  () => fixture.service.initializeGoogleLogin(),
  () => fixture.service.getGoogleLinkStatus({} as never),
  () => fixture.service.initializeAuthenticatedGoogleLink({} as never),
  () => fixture.service.submitAuthenticatedGoogleLink({ credential: "x", nonceChallengeId: "x" }, {} as never, context),
  () => fixture.service.verifyAuthenticatedGoogleLink("x", "000000", {} as never, context),
  () => fixture.service.startGoogleUnlink({} as never, context),
  () => fixture.service.verifyGoogleUnlink("x", "000000", {} as never, context),
  () => fixture.service.submitGoogleCredential({ credential: "x", nonceChallengeId: "x" }, context),
  () => fixture.service.verifyGoogleRegistrationOrLink("x", "000000", context),
  () => fixture.service.recoverGoogleUnlinkCompletion("x", "x")
];
for (const call of calls) await expect(call()).rejects.toMatchObject(unavailable);
```

- [x] **Step 3: Run tests to verify they fail**

Run:

```bash
cd backend
npm test -- --runInBand tests/production-safety.test.ts tests/google-auth.service.test.ts
```

Expected: FAIL because `AUTH_GOOGLE_ENABLED` is not parsed and disabled service calls are not guarded.

- [x] **Step 4: Implement the minimum backend configuration rule**

Add the two schema fields and cross-field validation:

```ts
AUTH_GOOGLE_ENABLED: booleanSchema.default(true),
GOOGLE_AUTH_CLIENT_ID: z.string().trim().default(""),
```

Before the production-only early return, require a non-empty ID whenever enabled. In the production Google ID pattern check, execute the strict check only when `AUTH_GOOGLE_ENABLED` is true.

- [x] **Step 5: Implement the service guard**

Add this private method and call it as the first statement in every Google public method listed in Step 2:

```ts
private assertGoogleAuthEnabled(): void {
  if (this.config.AUTH_GOOGLE_ENABLED === false) {
    throw new AppError({
      code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
      message: "error.dependency.google_auth_unavailable",
      statusCode: 503
    });
  }
}
```

The exact comparison keeps legacy test fixtures without the new property default-on; parsed runtime configuration always supplies a boolean.

- [x] **Step 6: Document the Staging backend value**

Add this adjacent to the Google rate-limit and client-ID values in `backend/.env.staging.example`:

```dotenv
# Keep false until a real Google Web OAuth client ID is configured.
AUTH_GOOGLE_ENABLED=false
GOOGLE_AUTH_CLIENT_ID=
```

- [x] **Step 7: Run targeted backend tests and build**

Run:

```bash
cd backend
npm test -- --runInBand tests/production-safety.test.ts tests/google-auth.service.test.ts
npm run build
```

Expected: targeted suites PASS and TypeScript build exits `0`.

- [x] **Step 8: Commit backend capability boundary**

```bash
git add backend/.env.staging.example backend/src/config/env.ts backend/src/services/auth.service.ts backend/tests/production-safety.test.ts backend/tests/google-auth.service.test.ts
git commit -m "feat: allow explicit Google auth disable"
```

---

### Task 2: Frontend capability flag and immutable Staging build binding

**Files:**
- Modify: `src/vite-env.d.ts`
- Modify: `src/pages/auth/LoginPage.tsx`
- Modify: `src/pages/auth/LoginPage.test.ts`
- Modify: `scripts/aws-staging-package-application.mjs`
- Modify: `deploy/staging/runtime-contract.test.mjs`

**Interfaces:**
- Consumes: `import.meta.env`, `LoginPage`, the Staging package build environment.
- Produces: `isGoogleAuthEnabled(value?: string): boolean`, optional `LoginPage.googleAuthEnabled`, and a release build pinned to `VITE_AUTH_GOOGLE_ENABLED=false`.

- [x] **Step 1: Write failing frontend behavior tests**

Add a pure parser assertion and render a disabled page:

```ts
expect(isGoogleAuthEnabled(undefined)).toBe(true);
expect(isGoogleAuthEnabled("true")).toBe(true);
expect(isGoogleAuthEnabled("false")).toBe(false);

root.render(createElement(LoginPage, {
  googleAuthEnabled: false,
  navigateToPortal: mocked.navigateToPortal
}));
await flushUi();
expect(container.querySelector('[data-testid="google-identity-button"]')).toBeNull();
expect(mocked.authApi.initializeGoogleLogin).not.toHaveBeenCalled();
expect(container.querySelector('[data-testid="show-password-login"]')).not.toBeNull();
```

- [x] **Step 2: Write the failing Staging packaging contract**

Read `../../scripts/aws-staging-package-application.mjs` from `runtime-contract.test.mjs` and assert:

```js
assert.match(packager, /VITE_AUTH_GOOGLE_ENABLED:\s*"false"/);
```

- [x] **Step 3: Run tests to verify they fail**

Run:

```bash
npx vitest run src/pages/auth/LoginPage.test.ts
node --test deploy/staging/runtime-contract.test.mjs
```

Expected: FAIL because the parser, prop, render guard, and package build binding do not exist.

- [x] **Step 4: Implement the default-on frontend parser and render guard**

Declare the variable in `src/vite-env.d.ts` and implement:

```ts
export function isGoogleAuthEnabled(value = import.meta.env.VITE_AUTH_GOOGLE_ENABLED) {
  return value?.trim().toLowerCase() !== "false";
}
```

Add `googleAuthEnabled = isGoogleAuthEnabled()` to `LoginPage` props. Return early from the Google initialization effect when false, include the boolean in its dependency list, and render the Google surface only when the flag is true. Do not change the password or registration surfaces.

- [x] **Step 5: Bind the immutable Staging build**

Extend the packager's child environment exactly:

```js
env: {
  ...process.env,
  CI: "1",
  NEEDO_BUILD_TARGET: "production",
  VITE_AUTH_GOOGLE_ENABLED: "false"
}
```

- [x] **Step 6: Run targeted frontend and packaging tests**

Run:

```bash
npx vitest run src/pages/auth/LoginPage.test.ts
node --test deploy/staging/runtime-contract.test.mjs
npm run build -- --mode formal
```

Expected: targeted suites PASS. The build may retain the already-waived bundle-size baseline failure, but compilation and asset generation must complete without a new error.

- [x] **Step 7: Commit frontend and release binding**

```bash
git add src/vite-env.d.ts src/pages/auth/LoginPage.tsx src/pages/auth/LoginPage.test.ts scripts/aws-staging-package-application.mjs deploy/staging/runtime-contract.test.mjs
git commit -m "feat: hide disabled Google login in staging"
```

---

### Task 3: Documentation and release-readiness verification

**Files:**
- Modify: `docs/aws-staging-application-runbook.md`
- Modify: `docs/superpowers/specs/2026-09-04-staging-google-auth-disable-design.md`

**Interfaces:**
- Consumes: the two capability flags and existing immutable release procedure.
- Produces: exact disable/enable operator instructions and a reviewed clean source revision ready for packaging.

- [x] **Step 1: Add exact operational instructions**

Document the current Staging values:

```text
AUTH_GOOGLE_ENABLED=false
VITE_AUTH_GOOGLE_ENABLED=false
GOOGLE_AUTH_CLIENT_ID omitted
```

Document re-enable as: create a real Web OAuth client, allow `https://staging.needo.life`, inject the client ID through Secrets Manager, set both flags true, rebuild an immutable release, deploy, and verify login/link/unlink. State explicitly that EC2, EBS, MySQL, Redis, EIP, DNS, and TLS do not need recreation.

- [x] **Step 2: Mark the approved design implemented**

Change the design status from `待用户确认文档` to `已批准并实现`, without changing its approved boundaries.

- [x] **Step 3: Run final focused verification**

Run:

```bash
cd backend
npm test -- --runInBand tests/production-safety.test.ts tests/google-auth.service.test.ts
npm run build
cd ..
npx vitest run src/pages/auth/LoginPage.test.ts
node --test deploy/staging/runtime-contract.test.mjs
git diff --check
git status --short
```

Expected: all focused tests and builds PASS, diff check is clean, and only planned documentation files remain uncommitted.

- [x] **Step 4: Commit documentation and record the release revision**

```bash
git add docs/aws-staging-application-runbook.md docs/superpowers/specs/2026-09-04-staging-google-auth-disable-design.md docs/superpowers/plans/2026-09-04-staging-google-auth-disable.md
git commit -m "docs: document staging Google auth switch"
git rev-parse HEAD
```

Expected: a clean full Git revision suitable for regenerating the content-addressed Staging application package.
