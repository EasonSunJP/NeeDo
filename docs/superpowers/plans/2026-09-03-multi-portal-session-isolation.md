# Multi-Portal Session Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow one formal account to stay signed in across every NeeDo portal without one portal overwriting or terminating another portal's browser session.

**Architecture:** Replace the coarse `frontend`/`backend` auth persistence boundary with seven explicit portal scopes. Each portal keeps its existing strict V8 envelope, atomic Web Lock writes, same-portal tab synchronization, and token-specific logout, but uses a distinct storage key and lock name. The backend refresh-session model remains unchanged because it already stores multiple JTIs per user.

**Tech Stack:** React 19, TypeScript, Vitest, browser localStorage, Web Locks, formal JWT/refresh sessions

## Global Constraints

- Do not weaken strict persisted-envelope parsing or persist access tokens.
- Do not restore legacy distributed auth keys.
- Do not revoke all user sessions during ordinary login or portal logout.
- Preserve same-portal logout synchronization across tabs.
- Do not add mock authentication or test-only production branches.
- Preserve all unrelated dirty worktree files.

---

### Task 1: Resolve an explicit persistence scope for every portal

**Files:**
- Modify: `src/auth/authPersistenceScope.test.ts`
- Modify: `src/auth/authPersistenceScope.ts`

**Interfaces:**
- Consumes: browser `pathname` and hash route.
- Produces: `AuthPersistenceScope`, `resolveAuthPersistenceScope`, `getAuthEnvelopeStorageKey`, and `getAuthEnvelopeLockName` with seven portal-specific values.

- [ ] **Step 1: Write the failing scope matrix test**

Replace the current coarse expectations with:

```ts
it.each([
  ["/", "#/", "user"],
  ["/user.html", "#/", "user"],
  ["/merchant.html", "#/merchant", "merchant"],
  ["/technician.html", "#/technician", "technician"],
  ["/afirieito.html", "#/afirieito", "affiliate"],
  ["/pf-admin.html", "#/admin", "operations-admin"],
  ["/store-admin.html", "#/merchant-admin", "merchant-admin"],
  ["/afirieito-admin.html", "#/NDA-admin", "affiliate-admin"],
  ["/", "#/login/admin", "operations-admin"],
  ["/", "#/login/merchant-admin", "merchant-admin"],
  ["/", "#/login/afirieito-admin", "affiliate-admin"],
  ["/", "#/business", "affiliate"]
] as const)("resolves %s %s to %s", (pathname, hash, expected) => {
  expect(resolveAuthPersistenceScope({ pathname, hash })).toBe(expected);
});
```

Add a uniqueness assertion:

```ts
it("gives every portal a distinct envelope and lock", () => {
  const scopes: AuthPersistenceScope[] = [
    "user", "merchant", "technician", "affiliate",
    "operations-admin", "merchant-admin", "affiliate-admin"
  ];
  expect(new Set(scopes.map(getAuthEnvelopeStorageKey))).toHaveSize(scopes.length);
  expect(new Set(scopes.map(getAuthEnvelopeLockName))).toHaveSize(scopes.length);
});
```

- [ ] **Step 2: Run the scope test and verify RED**

Run:

```bash
npm test -- --run src/auth/authPersistenceScope.test.ts
```

Expected: FAIL because the implementation only returns `frontend` or `backend`.

- [ ] **Step 3: Implement explicit portal resolution**

Use this public type and deterministic maps in `src/auth/authPersistenceScope.ts`:

```ts
export type AuthPersistenceScope =
  | "user"
  | "merchant"
  | "technician"
  | "affiliate"
  | "operations-admin"
  | "merchant-admin"
  | "affiliate-admin";

const entryScope = new Map<string, AuthPersistenceScope>([
  ["user.html", "user"],
  ["merchant.html", "merchant"],
  ["technician.html", "technician"],
  ["afirieito.html", "affiliate"],
  ["pf-admin.html", "operations-admin"],
  ["store-admin.html", "merchant-admin"],
  ["afirieito-admin.html", "affiliate-admin"]
]);
```

Resolve route prefixes from most specific to least specific so `/merchant-admin` is never classified as `/merchant`. Return `user` only when neither entry nor route identifies another portal.

Generate keys without reading the old shared keys:

```ts
export const getAuthEnvelopeStorageKey = (scope: AuthPersistenceScope) =>
  `needo.auth.envelope.v8.${scope}`;

export const getAuthEnvelopeLockName = (scope: AuthPersistenceScope) =>
  `needo-auth-envelope-v8-${scope}`;
```

- [ ] **Step 4: Run the scope test and verify GREEN**

Run:

```bash
npm test -- --run src/auth/authPersistenceScope.test.ts
```

Expected: PASS with all entry, route, key, and lock cases green.

### Task 2: Prove cross-portal storage events do not terminate a session

**Files:**
- Modify: `src/auth/AuthProvider.test.ts`
- Verify: `src/auth/AuthProvider.tsx`

**Interfaces:**
- Consumes: the portal-specific `persistedAuthEnvelopeStorageKey` selected by `authEnvelope.ts`.
- Produces: a regression test proving that another portal's envelope event is ignored while same-portal tombstones remain authoritative.

- [ ] **Step 1: Write the failing cross-portal event regression test**

Add a test beside the existing remote tombstone test:

```ts
it("ignores a storage event from another portal envelope", async () => {
  mocked.authApi.loginFormal.mockResolvedValue(
    formalLoginPayload(customerMe, "access-user", "refresh-user")
  );
  await renderProvider();
  await invoke(() => auth.loginWithFormalPassword("user", "u0000000007", "secret"));

  window.dispatchEvent(new StorageEvent("storage", {
    key: getAuthEnvelopeStorageKey("merchant-admin"),
    newValue: JSON.stringify(createAnonymousAuthEnvelope({
      authInstanceId: "00000000-0000-4000-8000-000000000099",
      credentialVersion: 1
    })),
    storageArea: window.localStorage
  }));

  expect(auth.session?.portal).toBe("user");
  expect(mocked.tokenState.refreshToken).toBe("refresh-user");
  expect(mocked.authApi.logout).not.toHaveBeenCalled();
});
```

Import `getAuthEnvelopeStorageKey` from `./authPersistenceScope`.

- [ ] **Step 2: Run the focused provider test and verify RED against the old shared boundary**

Run the test before implementing Task 1 by temporarily targeting the old `backend` key, or use the Task 1 scope test as the mandatory RED evidence and confirm this provider test protects the integrated behavior after implementation.

Run:

```bash
npm test -- --run src/auth/AuthProvider.test.ts -t "ignores a storage event from another portal envelope"
```

Expected after Task 1: PASS because the event key differs from the current portal key. The existing `uses a remote tombstone event as authority` test must continue to PASS for same-portal logout.

- [ ] **Step 3: Run the full auth regression set**

Run:

```bash
npm test -- --run src/auth/authPersistenceScope.test.ts src/auth/authEnvelope.test.ts src/auth/AuthProvider.test.ts src/auth/rbac.test.ts src/api/auth.test.ts
```

Expected: all auth tests pass with no warning or unhandled rejection.

### Task 3: Verify backend multi-session behavior remains intact

**Files:**
- Verify: `backend/src/services/auth-session.store.ts`
- Verify: `backend/src/services/auth.service.ts`
- Verify: `backend/tests/auth-session.store.test.ts`
- Verify: `backend/tests/auth.test.ts`

**Interfaces:**
- Consumes: password login issuing a unique refresh-token JTI.
- Produces: evidence that two logins for one user coexist and token-specific logout does not revoke the other JTI.

- [ ] **Step 1: Run the focused backend session tests**

Run:

```bash
cd backend && npm test -- --runInBand tests/auth-session.store.test.ts tests/auth.test.ts
```

Expected: tests proving multiple refresh JTIs and token-specific revocation pass. If that behavior is not already covered, first add a failing integration test that logs in twice, logs out the first refresh token, refreshes the second token successfully, and then implement only the missing backend behavior.

### Task 4: Perform real multi-portal browser acceptance

**Files:**
- Verify only; do not add browser-local fixtures.

**Interfaces:**
- Consumes: the running frontend on port 5180 and formal backend on port 3000.
- Produces: recorded evidence that independent portal envelopes coexist and each portal can still call `/api/v1/auth/me`.

- [ ] **Step 1: Verify listener ownership and dependencies**

Run:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:5180 -sTCP:LISTEN
curl -sS http://127.0.0.1:3000/api/v1/health
curl -sS http://127.0.0.1:3000/api/v1/ready
```

Expected: backend cwd is this repository's `backend`, frontend cwd is this repository root, and health/ready return code `0` with MySQL and Redis healthy.

- [ ] **Step 2: Sign the same formal account into every allowed portal**

Open the separate HTML entry points and authenticate without printing credentials or tokens. After each login, revisit all earlier portals and confirm they remain authenticated.

- [ ] **Step 3: Verify storage isolation and logout behavior**

Confirm localStorage contains distinct envelope keys for the portals used. Log out one portal and verify only its key becomes anonymous while every other portal remains authenticated and can refresh `/auth/me`.

- [ ] **Step 4: Run static and production verification**

Run:

```bash
npm run lint
env VITE_LEGACY_AUTHORIZATION= VITE_LEGACY_AUTH_BASE_URL= npm run build
git diff --check
```

Expected: all commands exit `0`; report unrelated pre-existing warnings separately.

- [ ] **Step 5: Record scope boundary**

Report this microstep as complete only if automated tests and real browser acceptance pass. Explicitly defer independent `ops-api`/`merchant-api`, formal employee roles, merchant publishing, cross-end notification delivery, and cross-backend data consistency to their own subsequent microsteps.
