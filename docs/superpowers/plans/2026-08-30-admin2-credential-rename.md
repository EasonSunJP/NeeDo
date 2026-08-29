# LifeDance admin2 Credential Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the existing local LifeDance admin2 account to `admina@lifedance.com`, reset only that account's password, revoke its sessions, and preserve every existing business relation.

**Architecture:** Extend the existing guarded LifeDance admin2 provisioning path so it recognizes the canonical and legacy email as one account, updates the existing User by id, and fails closed on conflicts. Read the dedicated password only from ignored local environment configuration, then use the existing transaction, Redis session revocation, checker, and formal Auth API for acceptance.

**Tech Stack:** Node.js 22, TypeScript strict mode, Jest, Prisma 7, MySQL 8, Redis, bcryptjs, Express `/api/v1/auth/*`.

## Global Constraints

- Operate only on local `needo_dev`; existing production/remote guards remain mandatory.
- Preserve User id 787, NeeDoID `needo0000000002`, roles, identities, shop, contacts, audit history, and business relations.
- Do not create a replacement user and do not change any other test account password.
- Never write or print the plaintext password in tracked source, tests, Git, logs, JSON output, or final reports.
- Store the authorized password only in ignored `backend/.env.dev`; store only bcrypt cost 12 in MySQL.
- Keep historical login/audit email values unchanged.
- Do not stage, commit, or alter unrelated IM, home, mobile-shell, or CSS worktree changes.

---

### Task 1: Make the new email canonical in the provisioning contract

**Files:**
- Modify: `backend/tests/lifedance-admin2-provisioning.test.ts`
- Modify: `backend/src/simulation/lifedance-admin2-provisioning.ts:1-25`

**Interfaces:**
- Produces: `LIFEDANCE_ADMIN2_PLAN.email === "admina@lifedance.com"`
- Produces: `LIFEDANCE_ADMIN2_PLAN.legacyEmails === ["admin2@lifedance.com"]`

- [ ] **Step 1: Change the contract test first**

Update the existing `toMatchObject` expectation to include the canonical and legacy email contract:

```ts
expect(LIFEDANCE_ADMIN2_PLAN).toMatchObject({
  email: "admina@lifedance.com",
  legacyEmails: ["admin2@lifedance.com"],
  needoId: "needo0000000002",
  numberPart: "0000000002"
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm --prefix backend test -- lifedance-admin2-provisioning.test.ts
```

Expected: FAIL because the current plan still returns `admin2@lifedance.com` and has no `legacyEmails`.

- [ ] **Step 3: Implement the minimal plan change**

Replace the current `email` property and insert `legacyEmails` immediately after it; leave the
remaining existing properties byte-for-byte unchanged:

```ts
email: "admina@lifedance.com",
legacyEmails: ["admin2@lifedance.com"],
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same Jest command. Expected: the provisioning test file passes.

- [ ] **Step 5: Commit only Task 1 files**

```bash
git add backend/tests/lifedance-admin2-provisioning.test.ts backend/src/simulation/lifedance-admin2-provisioning.ts
git commit -m "test: define admina canonical login"
```

---

### Task 2: Resolve the legacy account and update it in place

**Files:**
- Modify: `backend/tests/lifedance-admin2-provisioning.test.ts`
- Modify: `backend/src/simulation/lifedance-admin2-provisioning.ts:32-100,245-305`

**Interfaces:**
- Produces: `selectAdmin2AccountCandidate(candidates): Admin2AccountCandidate | null`
- Consumes: `LIFEDANCE_ADMIN2_PLAN.email` and `legacyEmails`

- [ ] **Step 1: Add failing legacy-resolution tests**

Import `selectAdmin2AccountCandidate` and add these tests:

```ts
it("selects the legacy email account for an in-place canonical rename", () => {
  expect(
    selectAdmin2AccountCandidate([
      { id: 787, email: "admin2@lifedance.com", sessionGeneration: 0 }
    ])
  ).toEqual({ id: 787, email: "admin2@lifedance.com", sessionGeneration: 0 });
});

it("fails closed when canonical and legacy emails belong to different users", () => {
  expect(() =>
    selectAdmin2AccountCandidate([
      { id: 787, email: "admin2@lifedance.com", sessionGeneration: 0 },
      { id: 900, email: "admina@lifedance.com", sessionGeneration: 0 }
    ])
  ).toThrow("canonical and legacy emails belong to different users");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run the focused Jest command. Expected: FAIL because `selectAdmin2AccountCandidate` is not exported.

- [ ] **Step 3: Add the minimal selector**

Add a focused type and selector near the other pure provisioning helpers:

```ts
export interface Admin2AccountCandidate {
  id: number;
  email: string;
  sessionGeneration: number;
}

export const selectAdmin2AccountCandidate = (
  candidates: readonly Admin2AccountCandidate[]
): Admin2AccountCandidate | null => {
  const uniqueCandidates = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  assert(
    uniqueCandidates.size <= 1,
    "LifeDance admin2 canonical and legacy emails belong to different users."
  );
  return [...uniqueCandidates.values()][0] ?? null;
};
```

- [ ] **Step 4: Integrate the selector into the transaction**

Replace the single-email lookup with:

```ts
const accountCandidates = await tx.user.findMany({
  where: {
    email: {
      in: [LIFEDANCE_ADMIN2_PLAN.email, ...LIFEDANCE_ADMIN2_PLAN.legacyEmails]
    }
  },
  select: { id: true, email: true, sessionGeneration: true }
});
const existingUser = selectAdmin2AccountCandidate(accountCandidates);
```

Exclude `existingUser.id` rather than `email` from the fixed-ID conflict query, and add the canonical email to the update payload:

```ts
const conflictingUser = await tx.user.findFirst({
  where: {
    OR: [
      { needoId: LIFEDANCE_ADMIN2_PLAN.needoId },
      { accountNo: LIFEDANCE_ADMIN2_PLAN.numberPart }
    ],
    ...(existingUser ? { id: { not: existingUser.id } } : {})
  },
  select: { id: true }
});

// inside tx.user.update data
email: LIFEDANCE_ADMIN2_PLAN.email,
```

Keep the existing session-generation increment, bcrypt hash write, identity/shop/contact updates, transaction, and audit unchanged.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run the focused Jest command. Expected: all tests in the file pass.

- [ ] **Step 6: Commit only Task 2 files**

```bash
git add backend/tests/lifedance-admin2-provisioning.test.ts backend/src/simulation/lifedance-admin2-provisioning.ts
git commit -m "feat: rename admin2 login in place"
```

---

### Task 3: Isolate the admin2 password source

**Files:**
- Modify: `backend/tests/lifedance-admin2-provisioning.test.ts`
- Modify: `backend/src/simulation/lifedance-admin2-provisioning.ts`
- Modify: `backend/scripts/provision-lifedance-admin2.ts:20-23`
- Modify: `backend/scripts/check-lifedance-admin2.ts:18-21`
- Modify: `backend/.env.dev.example:75-82`

**Interfaces:**
- Produces: `resolveLifeDanceAdmin2Password(env): string`
- Consumes: `LIFEDANCE_ADMIN2_PASSWORD`

- [ ] **Step 1: Add failing password-source tests**

Import `resolveLifeDanceAdmin2Password` and add:

```ts
it("requires the dedicated admin2 password without falling back to shared test credentials", () => {
  expect(
    resolveLifeDanceAdmin2Password({
      LIFEDANCE_ADMIN2_PASSWORD: " Dedicated.Admin2.Password.2026! ",
      TEST_USER_DEFAULT_PASSWORD: "Shared.Password.2026!"
    })
  ).toBe("Dedicated.Admin2.Password.2026!");

  expect(() =>
    resolveLifeDanceAdmin2Password({ TEST_USER_DEFAULT_PASSWORD: "Shared.Password.2026!" })
  ).toThrow("LIFEDANCE_ADMIN2_PASSWORD is required");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run the focused Jest command. Expected: FAIL because the resolver is not exported.

- [ ] **Step 3: Implement the resolver and use it in both scripts**

```ts
export const resolveLifeDanceAdmin2Password = (env: {
  LIFEDANCE_ADMIN2_PASSWORD?: string;
  TEST_USER_DEFAULT_PASSWORD?: string;
}): string => {
  const password = env.LIFEDANCE_ADMIN2_PASSWORD?.trim();
  assert(password, "LIFEDANCE_ADMIN2_PASSWORD is required for LifeDance admin2.");
  return password;
};
```

In both scripts, replace direct `TEST_USER_DEFAULT_PASSWORD` reads with:

```ts
const password = provisioning.resolveLifeDanceAdmin2Password(process.env);
```

The checker names the local variable `expectedPassword` but uses the same resolver. Add this empty, non-secret declaration to the example file:

```dotenv
LIFEDANCE_ADMIN2_PASSWORD=
```

- [ ] **Step 4: Run focused and backend quality checks**

Run:

```bash
npm --prefix backend test -- lifedance-admin2-provisioning.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

Expected: focused tests, lint, and TypeScript build pass without warnings or secret output.

- [ ] **Step 5: Commit only Task 3 tracked files**

```bash
git add backend/tests/lifedance-admin2-provisioning.test.ts backend/src/simulation/lifedance-admin2-provisioning.ts backend/scripts/provision-lifedance-admin2.ts backend/scripts/check-lifedance-admin2.ts backend/.env.dev.example
git commit -m "fix: isolate admin2 test password"
```

---

### Task 4: Provision the local account and verify formal authentication

**Files:**
- Modify locally but never stage: `backend/.env.dev`
- Read/execute: `backend/scripts/provision-lifedance-admin2.ts`
- Read/execute: `backend/scripts/check-lifedance-admin2.ts`

**Interfaces:**
- Consumes: the user-authorized password in ignored `LIFEDANCE_ADMIN2_PASSWORD`
- Produces: canonical login `admina@lifedance.com` for the existing User id

- [ ] **Step 1: Add the authorized password to ignored local configuration**

Use `apply_patch` to add or replace `LIFEDANCE_ADMIN2_PASSWORD` in `backend/.env.dev`. Use the exact value authorized in the active user request, do not echo the file, and verify only a boolean presence check. Confirm `git check-ignore -v backend/.env.dev` still reports `.gitignore`.

- [ ] **Step 2: Run the guarded provisioning transaction**

Run outside the restricted sandbox if local MySQL/Redis access or `tsx` IPC requires it:

```bash
npm --prefix backend run provision:lifedance-admin2
```

Expected JSON: `status: "ok"`, email `admina@lifedance.com`, unchanged NeeDoID, shop, user id, and friend count. The command must not print the password or hash.

- [ ] **Step 3: Run the independent account checker**

```bash
npm --prefix backend run check:lifedance-admin2
```

Expected: `status: "ok"`, canonical email, fixed IDs, full identities/roles, and 21 contacts.

- [ ] **Step 4: Verify new login, `/auth/me`, and formal logout without printing secrets**

Run a short local Node process that loads `backend/.env.dev`, sends `{ loginIdentifier: "admina@lifedance.com", password: process.env.LIFEDANCE_ADMIN2_PASSWORD }` to `http://127.0.0.1:3000/api/v1/auth/login`, keeps returned tokens only in process memory, verifies `/auth/me` includes role `admin` and `menu:admin-console`, calls `/auth/logout`, and prints only HTTP statuses, role names, permission count, and logout status.

Expected: login 200, me 200, admin role present, admin-console menu present, logout 200.

- [ ] **Step 5: Verify the legacy email is rejected and no lock remains**

Using the same environment-loaded password, make one login attempt with `admin2@lifedance.com`. Print only HTTP status and stable message key.

Expected: HTTP 401 with `error.auth.invalid_credentials`. Query `RedisAuthSessionStore.getAccountLoginLock(787)` and expect `false`.

- [ ] **Step 6: Read back database identity and audit evidence**

Use a read-only Prisma query that selects only id, email, needoId, active/deleted state, session generation, roles, identities, latest provisioning audit, and latest login statuses. Do not select `passwordHash`, refresh/access tokens, OTP values, or environment variables.

Expected: same User id, new email, active/not deleted, session generation incremented, existing roles/identities intact, provisioning audit recorded, and no duplicate old-email User.

- [ ] **Step 7: Final repository hygiene check**

Run:

```bash
git diff --check
git status --short
git log -4 --oneline
```

Confirm tracked task files are committed, `backend/.env.dev` is ignored, and all pre-existing IM/UI changes remain unstaged and untouched.
