# NeeDo Formal Google Third-Party Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver production-grade NeeDo authentication in which users sign in with email or immutable NeeDo ID plus password, or with a verified linked Google identity; first email registration and first Google registration/link require a NeeDo email OTP, and every new public account starts with its generated NeeDo ID as the editable display name.

**Architecture:** Extend the existing Express/Prisma/Redis authentication stack instead of introducing a second auth system. Prisma owns immutable NeeDo IDs and Google-subject bindings, Redis owns one-time nonce and purpose-bound verification challenges, `google-auth-library` verifies Google Identity Services ID tokens, and the current AuthService continues issuing NeeDo JWT/refresh sessions and RBAC payloads. The React login page uses a small Google Identity Services adapter and one shared OTP panel; Account Security uses authenticated formal endpoints for status, link, password setup, and unlink. Google Calendar compatibility remains isolated from login.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Vitest 4, Node.js 22, Express 4, Zod 3, Prisma 7, MySQL 8, Redis 5, Jest 29, Supertest 7, Google Identity Services, `google-auth-library`.

## Global Constraints

- Follow `README.md`, `AGENTS.md`, `docs/00_MASTER_MICRO_STEP_PLAN.md`, `docs/05_AUTH_OTP_TOKEN_SESSION.md`, `docs/User Management.md`, and the approved design at `docs/superpowers/specs/2026-08-26-needo-google-third-party-login-design.md`.
- This is the formal Auth/User Management microstep. Do not implement the external Booking API, Google Calendar authorization, offline access, or provider token storage here.
- Keep the existing React/TSX/Vite frontend and Express/Prisma backend; do not introduce Firebase, Auth0, a parallel auth database, or a second login page.
- Public registration always creates the baseline customer identity. Technician and merchant access continue through the approved identity-application workflow.
- Formal password lookup accepts normalized email or immutable `needoId`; mutable `User.username`/nickname is never a login key.
- First email registration and first Google registration/link require a purpose-bound NeeDo email code. Repeat Google login for an already linked subject is direct after fresh Google credential verification.
- Never persist or log the Google credential, Google access/refresh tokens, raw OTP, raw password, or client secret. Use the verified Google `sub` as the provider key.
- All new endpoints require Zod, standard response envelopes, stable error keys, OpenAPI, focused rate limits, audit/login evidence, and tests.
- Account-security routes derive the current User from the access token; no browser-supplied target user ID is accepted.
- Preserve the legacy `/api/google-account/*` helper only for isolated Google Calendar compatibility. Formal auth source must not import or call it.
- Preserve unrelated worktree changes, especially the existing untracked `artifacts/` directory; stage only files owned by each task.
- No task may be declared complete from a build alone. Use fresh targeted tests, complete suites, local MySQL/Redis checks, and final browser acceptance.

---

### Task 1: Immutable NeeDo ID, Nullable Password, and Provider-Binding Schema

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260826140000_formal_google_auth_identity/migration.sql`
- Create: `backend/src/services/needo-id.service.ts`
- Create: `backend/tests/needo-id.service.test.ts`
- Modify: `backend/src/repositories/auth.repository.ts`
- Modify: `backend/src/repositories/user.repository.ts`
- Modify: `backend/src/repositories/backoffice.repository.ts`
- Modify: `backend/prisma/seed.ts`
- Modify: `backend/scripts/seed-three-month-simulation.ts`
- Modify: `backend/scripts/check-affiliate-marketplace-claim-flow.ts`
- Modify: `backend/scripts/check-affiliate-checkout-attribution-flow.ts`
- Modify: `backend/scripts/check-affiliate-service-completion-reward-flow.ts`
- Modify: `backend/scripts/check-affiliate-task-publishing-flow.ts`
- Modify: `backend/scripts/check-manual-payment-flow.ts`
- Modify: `backend/scripts/check-master-data-flow.ts`
- Modify: `backend/scripts/check-schedule-flow.ts`
- Modify: `backend/tests/customer-profile.repository.integration.test.ts`

**Interfaces:**
- Consumes: Prisma `User`, existing account/profile/identity transactions, guarded seeds and checkers.
- Produces: immutable `User.needoId`, `User.emailVerifiedAt`, nullable `User.passwordHash`, `ExternalAuthAccount`, and `NeedoIdAllocator.withNewId()`.

- [ ] **Step 1: Write failing allocator tests**

```ts
import { describe, expect, it, jest } from "@jest/globals";
import { NeedoIdAllocator } from "../src/services/needo-id.service";

describe("NeedoIdAllocator", () => {
  it("formats a cryptographically supplied candidate as n plus ten digits", async () => {
    const allocator = new NeedoIdAllocator(() => 123);
    await expect(allocator.withNewId(async (needoId) => needoId)).resolves.toBe("n0000000123");
  });

  it("retries only a needoId unique collision", async () => {
    const next = jest.fn().mockReturnValueOnce(123).mockReturnValueOnce(456);
    const allocator = new NeedoIdAllocator(next, (error) => error === "needo-id-conflict");
    const create = jest.fn(async (needoId: string) => {
      if (needoId === "n0000000123") throw "needo-id-conflict";
      return needoId;
    });
    await expect(allocator.withNewId(create)).resolves.toBe("n0000000456");
    expect(create).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the allocator test and verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/needo-id.service.test.ts`

Expected: FAIL because `needo-id.service.ts` does not exist.

- [ ] **Step 3: Implement the shared allocator with database-collision retry**

```ts
import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";

const formatNeedoId = (value: number) => `n${value.toString().padStart(10, "0")}`;

export class NeedoIdAllocator {
  public constructor(
    private readonly nextCandidate = () => randomInt(0, 10_000_000_000),
    private readonly isNeedoIdCollision = (error: unknown) =>
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      String(error.meta?.target).includes("needo")
  ) {}

  public async withNewId<T>(create: (needoId: string) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        return await create(formatNeedoId(this.nextCandidate()));
      } catch (error) {
        if (!this.isNeedoIdCollision(error)) throw error;
      }
    }
    throw new Error("NeeDo ID allocation exhausted");
  }
}
```

Keep the exhaustion error internal; services must map it to a stable dependency/conflict key rather than exposing it.

- [ ] **Step 4: Add the Prisma model and compatibility migration**

Add to `User`:

```prisma
needoId          String                @unique @map("needo_id") @db.VarChar(32)
emailVerifiedAt  DateTime?             @map("email_verified_at")
passwordHash     String?               @map("password_hash") @db.VarChar(255)
externalAccounts ExternalAuthAccount[]
```

Add:

```prisma
model ExternalAuthAccount {
  id                      Int       @id @default(autoincrement())
  userId                  Int       @map("user_id")
  provider                String    @db.VarChar(32)
  providerSubject         String    @map("provider_subject") @db.VarChar(255)
  providerEmail           String    @map("provider_email") @db.VarChar(255)
  providerEmailVerifiedAt DateTime  @map("provider_email_verified_at")
  lastUsedAt              DateTime? @map("last_used_at")
  createdAt               DateTime  @default(now()) @map("created_at")
  updatedAt               DateTime  @updatedAt @map("updated_at")
  deletedAt               DateTime? @map("deleted_at")
  user                    User      @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@unique([provider, providerSubject], map: "external_auth_provider_subject_key")
  @@index([userId, provider, deletedAt], map: "external_auth_user_provider_deleted_idx")
  @@index([providerEmail, provider, deletedAt], map: "external_auth_email_provider_deleted_idx")
  @@map("external_auth_accounts")
}
```

The SQL migration must add nullable columns first, deterministically backfill `needo_id` as `n` plus the zero-padded numeric User ID, mark existing non-deleted accounts verified at `created_at`, make `needo_id` non-null, make `password_hash` nullable, add the unique index, and then create `external_auth_accounts`. Do not add a provider token column.

- [ ] **Step 5: Route every User creation path through `NeedoIdAllocator`**

Wrap the whole transaction/create callback so a `needo_id` P2002 retries the complete operation. Public creation sets username/display names to the generated ID; trusted admin/seed flows may retain their supplied display names but must set a unique `needoId` and an explicit trusted `emailVerifiedAt`.

Run after edits:

`rg -n "user\\.(create|upsert)" backend --glob '!node_modules/**' --glob '!dist/**'`

Expected: every listed `create` branch supplies `needoId` from the allocator; no hard-coded NeeDo ID is reused across accounts.

- [ ] **Step 6: Generate Prisma and verify the migration contract**

Run: `ENV_FILE=.env.dev npm --prefix backend run prisma:generate`

Expected: Prisma client generation succeeds.

Run: `npm --prefix backend test -- --runTestsByPath tests/needo-id.service.test.ts`

Expected: PASS.

Run: `npm --prefix backend run build`

Expected: PASS; this is the compile-time proof that all User creation callers now provide the new required field and handle nullable passwords.

- [ ] **Step 7: Commit Task 1 only**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260826140000_formal_google_auth_identity/migration.sql backend/src/services/needo-id.service.ts backend/tests/needo-id.service.test.ts backend/src/repositories/auth.repository.ts backend/src/repositories/user.repository.ts backend/src/repositories/backoffice.repository.ts backend/prisma/seed.ts backend/scripts backend/tests/customer-profile.repository.integration.test.ts
git commit -m "feat: add immutable NeeDo auth identities"
```

---

### Task 2: Purpose-Bound Verification Challenges and Per-User Session Revocation

**Files:**
- Create: `backend/src/services/auth-verification-challenge.store.ts`
- Create: `backend/tests/auth-verification-challenge.store.test.ts`
- Modify: `backend/src/services/auth-session.store.ts`
- Create: `backend/tests/auth-session.store.test.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/tests/setup-env.ts`
- Modify: `backend/tests/production-safety.test.ts`
- Modify: `backend/.env.dev.example`
- Modify: `backend/.env.staging.example`
- Modify: `backend/.env.prod.example`

**Interfaces:**
- Consumes: Redis client, OTP delivery client, refresh-token storage.
- Produces: `VerificationPurpose`, `VerificationChallengeStore`, `RedisVerificationChallengeStore`, `createEmailChallenge()`, `consumeEmailChallenge()`, `createGoogleNonce()`, `consumeGoogleNonce()`, and `AuthSessionStore.revokeAllRefreshTokens(userId)`.

- [ ] **Step 1: Write failing challenge lifecycle and session-index tests**

Cover all six purposes, digest-only storage, 600-second expiry, 60-second cooldown, five attempts, wrong-purpose rejection, user binding, replay rejection, expiry, attempt exhaustion, nonce one-time consumption, and full refresh-session revocation.

```ts
expect(await store.consumeEmailChallenge({ challengeId, otp: "000000", purpose: "google_unlink", userId: 7 }))
  .toEqual({ ok: false, reason: "purpose_mismatch" });
expect(await store.consumeEmailChallenge({ challengeId, otp: "123456", purpose: "password_setup", userId: 7 }))
  .toMatchObject({ ok: true });
expect(await store.consumeEmailChallenge({ challengeId, otp: "123456", purpose: "password_setup", userId: 7 }))
  .toEqual({ ok: false, reason: "missing" });
```

- [ ] **Step 2: Run targeted tests and verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/auth-verification-challenge.store.test.ts tests/auth-session.store.test.ts`

Expected: FAIL because the purpose-bound store and per-user refresh index do not exist.

- [ ] **Step 3: Implement the Redis challenge contract**

Use cryptographically random challenge IDs/nonces and an HMAC digest derived from `AUTH_VERIFICATION_SECRET`, challenge ID, purpose, and submitted OTP. Store only JSON metadata plus the digest. Use one Redis Lua transaction per verification attempt so purpose/user checks, attempt increment, exhaustion deletion, and successful one-time deletion are atomic. Use `SET ... NX EX` for cooldown.

```ts
export type VerificationPurpose =
  | "email_registration"
  | "google_registration_or_link"
  | "google_authenticated_link"
  | "google_unlink"
  | "password_setup";

export interface VerificationChallengeStore {
  createEmailChallenge(input: CreateVerificationChallengeInput): Promise<CreatedChallenge>;
  consumeEmailChallenge(input: ConsumeVerificationChallengeInput): Promise<ConsumeChallengeResult>;
  createGoogleNonce(input: { userId?: number }): Promise<CreatedGoogleNonce>;
  consumeGoogleNonce(input: { challengeId: string; expectedNonce: string; userId?: number }): Promise<boolean>;
}
```

The stored registration/password metadata may contain a prepared bcrypt hash, never a raw password. Masked email is computed for responses and is not used as a lookup key.

- [ ] **Step 4: Index refresh sessions by user and implement revoke-all**

On `storeRefreshToken`, write both `refresh:<userId>:<jti>` and membership in `refresh:user:<userId>` with aligned expiry. On single-token revocation remove both entries. `revokeAllRefreshTokens(userId)` enumerates the bounded set, deletes every refresh key plus the index, and is safe when the set is absent.

- [ ] **Step 5: Add validated configuration and production guards**

Add:

```dotenv
AUTH_VERIFICATION_SECRET=replace-with-a-dedicated-32-character-secret
AUTH_VERIFICATION_MAX_ATTEMPTS=5
AUTH_GOOGLE_NONCE_TTL_SECONDS=300
GOOGLE_AUTH_VERIFY_TIMEOUT_MS=5000
```

Require the verification secret to be at least 32 characters, differ from both JWT secrets, and reject placeholder values in production. Keep challenge TTL at or below 600 seconds and nonce TTL at or below 600 seconds.

- [ ] **Step 6: Verify GREEN**

Run: `npm --prefix backend test -- --runTestsByPath tests/auth-verification-challenge.store.test.ts tests/auth-session.store.test.ts tests/production-safety.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 2 only**

```bash
git add backend/src/services/auth-verification-challenge.store.ts backend/tests/auth-verification-challenge.store.test.ts backend/src/services/auth-session.store.ts backend/tests/auth-session.store.test.ts backend/src/config/env.ts backend/tests/setup-env.ts backend/tests/production-safety.test.ts backend/.env.dev.example backend/.env.staging.example backend/.env.prod.example
git commit -m "feat: add purpose-bound auth challenges"
```

---

### Task 3: Official Google ID-Token Verification Adapter

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Create: `backend/src/services/google-credential-verifier.service.ts`
- Create: `backend/tests/google-credential-verifier.service.test.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/tests/setup-env.ts`
- Modify: `backend/.env.dev.example`
- Modify: `backend/.env.staging.example`
- Modify: `backend/.env.prod.example`

**Interfaces:**
- Consumes: Google Identity Services ID credential, expected one-time nonce, configured Web client ID.
- Produces: injectable `GoogleCredentialVerifierPort` and normalized `VerifiedGoogleIdentity` containing only `subject`, normalized verified `email`, and optional non-authoritative profile metadata.

- [ ] **Step 1: Write failing verifier tests around an injected ticket client**

Test success plus missing subject, invalid audience, invalid issuer, expired credential, missing/mismatched nonce, missing email, and `email_verified !== true`. The unit tests must not call Google or the network.

```ts
export interface VerifiedGoogleIdentity {
  subject: string;
  email: string;
  emailVerifiedAt: Date;
  name: string | null;
  pictureUrl: string | null;
}
```

- [ ] **Step 2: Run the verifier test and verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/google-credential-verifier.service.test.ts`

Expected: FAIL because the adapter and dependency are absent.

- [ ] **Step 3: Install the official server library**

Run: `npm --prefix backend install google-auth-library`

Expected: `backend/package.json` and `backend/package-lock.json` add the library; no frontend Google auth package is added.

- [ ] **Step 4: Implement strict verification**

```ts
const ticket = await this.withTimeout(
  this.client.verifyIdToken({ idToken: credential, audience: this.config.GOOGLE_AUTH_CLIENT_ID })
);
const payload = ticket.getPayload();
if (!payload?.sub || !payload.email || payload.email_verified !== true) throw invalidCredential();
if (payload.nonce !== expectedNonce) throw invalidNonce();
```

Rely on the official library for signature, configured audience, issuer, and expiry verification, then explicitly validate required claims and nonce. Normalize email to lowercase. Map all provider validation failures to stable public auth keys, and never attach the credential or provider subject to logs/errors.

- [ ] **Step 5: Add `GOOGLE_AUTH_CLIENT_ID` configuration**

Add a non-empty test value and documented blank/local placeholders. Production startup must reject a missing or placeholder client ID. No client secret or redirect URI is added because this is a GIS ID-token flow.

- [ ] **Step 6: Verify GREEN**

Run: `npm --prefix backend test -- --runTestsByPath tests/google-credential-verifier.service.test.ts tests/production-safety.test.ts`

Expected: PASS.

Run: `npm --prefix backend run build`

Expected: PASS.

- [ ] **Step 7: Commit Task 3 only**

```bash
git add backend/package.json backend/package-lock.json backend/src/services/google-credential-verifier.service.ts backend/tests/google-credential-verifier.service.test.ts backend/src/config/env.ts backend/tests/setup-env.ts backend/.env.dev.example backend/.env.staging.example backend/.env.prod.example
git commit -m "feat: verify Google identity credentials"
```

---

### Task 4: Transactional Auth Repository for Registration and Google Bindings

**Files:**
- Modify: `backend/src/repositories/auth.repository.ts`
- Create: `backend/tests/auth-repository-google.integration.test.ts`
- Modify: `backend/scripts/check-registration-flow.ts`

**Interfaces:**
- Consumes: verified challenge data, `NeedoIdAllocator`, customer role, `ExternalAuthAccount`.
- Produces: repository methods for lookup by email/NeeDo ID/Google subject, verified customer creation, create-or-restore Google binding, binding status, password hash update, soft unlink, and last-use updates.

- [ ] **Step 1: Write guarded repository integration tests**

Test deterministic existing-user backfill visibility, email/NeeDo ID lookup, Google-only customer creation, same-email linking, duplicate subject conflict, soft-deleted binding restoration, nullable password, and identical NeeDo ID display values across `User`, `CustomerProfile`, and default customer identity.

- [ ] **Step 2: Run the repository test and verify RED**

Run: `ENV_FILE=.env.dev npm --prefix backend test -- --runTestsByPath tests/auth-repository-google.integration.test.ts`

Expected: FAIL because the new repository methods are absent. If the local integration-test database guard refuses the selected database, stop and use the documented `needo_test` environment; never weaken the guard.

- [ ] **Step 3: Replace username login lookup with email/NeeDo ID lookup**

```ts
findUserByLoginIdentifier(identifier: string) {
  return this.client.user.findFirst({
    where: identifier.includes("@")
      ? { email: identifier, deletedAt: null }
      : { needoId: identifier, deletedAt: null },
    include: authUserInclude
  });
}
```

Do not include `username` in the `OR` query. Change `AuthUserRecord.passwordHash` to `string | null` and return `needoId`/`emailVerifiedAt` everywhere the service needs them.

- [ ] **Step 4: Implement one transactional baseline-customer creator**

The creator receives normalized email, nullable prepared password hash, verified-at timestamp, request context, and optional verified Google identity. It allocates one ID, sets `User.username`, `CustomerProfile.displayName`, and default `UserIdentity.displayName` to that ID, assigns the customer role, creates/restores the Google binding if present, and writes `auth.register` audit evidence in the same transaction.

- [ ] **Step 5: Implement binding and password mutation methods**

Use `(provider, providerSubject)` uniqueness as the authority. Restoring a soft-deleted row updates its user/email/verified/last-used fields only after service-level conflict checks. Unlink updates `deletedAt`; it never deletes provider history. Password setup updates only the prepared bcrypt hash. Every method filters deleted Users and returns enough state for AuthService to enforce disabled/restricted accounts.

- [ ] **Step 6: Convert the guarded registration checker to repository contracts**

Remove direct unverified technician registration. The checker must prove verified baseline-customer creation, immutable NeeDo ID format, all three initial display values, trusted existing-account lookup, audit evidence, and exact marker cleanup.

- [ ] **Step 7: Verify GREEN**

Run: `ENV_FILE=.env.dev npm --prefix backend test -- --runTestsByPath tests/auth-repository-google.integration.test.ts`

Expected: PASS.

Run: `npm --prefix backend run build`

Expected: PASS.

- [ ] **Step 8: Commit Task 4 only**

```bash
git add backend/src/repositories/auth.repository.ts backend/tests/auth-repository-google.integration.test.ts backend/scripts/check-registration-flow.ts
git commit -m "feat: persist verified auth accounts"
```

---

### Task 5: Verified Email Registration and Email/NeeDo-ID Password Login

**Files:**
- Modify: `backend/src/services/auth.service.ts`
- Modify: `backend/src/validators/auth.validator.ts`
- Modify: `backend/tests/auth.test.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Modify: `backend/src/services/auth-otp-delivery.service.ts`

**Interfaces:**
- Consumes: `VerificationChallengeStore`, OTP delivery, new AuthRepository methods, existing token/session issuance.
- Produces: `startRegistration({email,password})`, `verifyRegistration({challengeId,otp})`, and password login by email or NeeDo ID.

- [ ] **Step 1: Rewrite failing auth service/API fixtures for the confirmed contract**

Add cases proving:

- `/auth/register` creates no User and returns challenge metadata;
- correct code creates exactly one customer and tokens;
- replay, wrong purpose, expiry, and five bad codes fail;
- concurrent successful verification creates one account;
- login works by normalized email and NeeDo ID;
- nickname lookup, missing password hash, unknown identifier, and bad password share `error.auth.invalid_credentials`;
- public technician registration fields are rejected.

- [ ] **Step 2: Run the targeted auth tests and verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/auth.test.ts`

Expected: FAIL on the old direct-registration and username-login behavior.

- [ ] **Step 3: Replace the registration validator contract**

```ts
export const registerBodySchema = z.object({
  email: emailSchema,
  password: registrationPasswordSchema
}).strict();

export const registerVerifyBodySchema = z.object({
  challengeId: z.string().uuid(),
  otp: z.string().regex(/^\d{6}$/)
}).strict();
```

The canonical login body is `{ loginIdentifier, password }`. The short `/login` compatibility route may accept legacy `email` or `username` field names as aliases, but the transformed value still resolves only as email or NeeDo ID.

- [ ] **Step 4: Implement two-step registration**

`startRegistration` normalizes email, rejects an existing account, bcrypt-hashes the password at rounds 12, creates an `email_registration` challenge with the prepared hash, and sends the OTP. It does not persist a User. `verifyRegistration` atomically consumes the correct purpose and calls the transactional customer creator, then uses the existing successful-login path to issue a token pair and return `needoId`.

- [ ] **Step 5: Harden password login for nullable hashes and non-enumeration**

Resolve by normalized email/NeeDo ID. Use a constant dummy bcrypt hash when the User or hash is absent so obvious timing differences do not reveal registration/login-method state. Preserve current failure counters, account-state checks, LoginLog, token issuance, refresh storage, and `/auth/me` behavior.

- [ ] **Step 6: Retire generic passwordless OTP login from formal auth**

Remove `/auth/otp/send` and `/auth/otp/verify` from the formal route/controller/OpenAPI/frontend contract in Task 8/9. Verification codes remain action-bound registration/provider/security challenges and cannot be used as a generic login bypass.

- [ ] **Step 7: Verify GREEN**

Run: `npm --prefix backend test -- --runTestsByPath tests/auth.test.ts tests/auth-verification-challenge.store.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 5 only**

```bash
git add backend/src/services/auth.service.ts backend/src/validators/auth.validator.ts backend/tests/auth.test.ts backend/src/constants/error-codes.ts backend/src/services/auth-otp-delivery.service.ts
git commit -m "feat: require verified email registration"
```

---

### Task 6: Google Registration, Automatic Link, and Repeat Login Service

**Files:**
- Modify: `backend/src/services/auth.service.ts`
- Create: `backend/tests/google-auth.service.test.ts`
- Modify: `backend/src/routes/auth-service.factory.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Consumes: `GoogleCredentialVerifierPort`, one-time nonce, purpose-bound challenge, AuthRepository binding methods.
- Produces: `initializeGoogleLogin()`, `submitGoogleCredential()`, and `verifyGoogleRegistrationOrLink()`.

- [ ] **Step 1: Write failing Google service tests with deterministic injected verifier**

Cover:

- linked subject returns tokens immediately and updates `lastUsedAt`;
- first subject returns `verification_required` and sends OTP to verified Google email;
- verified first use links an existing normalized-email User;
- otherwise it creates a Google-only baseline customer with `passwordHash = null`;
- Google `name` never replaces the NeeDo ID display name;
- invalid/unverified Google identity, nonce replay, wrong nonce, disabled/deleted account, conflicting subject, concurrent first use, and challenge replay fail safely;
- provider credential/subject never appears in logger or public errors.

- [ ] **Step 2: Run the Google service test and verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/google-auth.service.test.ts`

Expected: FAIL because Google service methods are absent.

- [ ] **Step 3: Wire verifier and challenge dependencies through `AppDependencies`**

Add optional injected `googleCredentialVerifier` and `verificationChallengeStore`, while the route factory creates the real Google/Redis adapters by default. Keep tests deterministic by passing stubs; never add a test-only success branch inside production code.

- [ ] **Step 4: Implement nonce initialization and credential submission**

`initializeGoogleLogin` returns `{ clientId, nonce, nonceChallengeId, expiresIn }`. `submitGoogleCredential` verifies the credential using the nonce read from the challenge, consumes that nonce once, and branches strictly on active `(google, sub)` binding. Linked accounts use the existing login/session path. First use stores only verified identity metadata inside `google_registration_or_link` and sends NeeDo OTP.

- [ ] **Step 5: Implement verified first-use completion**

Consume the correct challenge, recheck subject and email transactionally, restore/link/create as defined by the design, write audit/LoginLog evidence, and issue the regular token pair. A concurrent completion may return the same linked account only when the subject resolves to that same account; otherwise return `error.auth.google_conflict`.

- [ ] **Step 6: Verify GREEN**

Run: `npm --prefix backend test -- --runTestsByPath tests/google-auth.service.test.ts tests/auth.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 6 only**

```bash
git add backend/src/services/auth.service.ts backend/tests/google-auth.service.test.ts backend/src/routes/auth-service.factory.ts backend/src/app.ts
git commit -m "feat: add formal Google sign in service"
```

---
### Task 7: Authenticated Google Link, Password Setup, and Safe Unlink

**Files:**
- Modify: `backend/src/services/auth.service.ts`
- Modify: `backend/src/services/auth-session.store.ts`
- Modify: `backend/src/repositories/auth.repository.ts`
- Create: `backend/tests/auth-account-security.service.test.ts`

**Interfaces:**
- Consumes: authenticated access context, current User primary email, verified Google identity, purpose-bound challenges, refresh-session user index.
- Produces: binding status, authenticated Google link, password setup, Google unlink, audit evidence, and session invalidation.

- [ ] **Step 1: Write failing account-security service tests**

Cover:

- status returns linked/masked email/password/can-unlink without a provider subject;
- authenticated link nonce is tied to the current User;
- the Google email may differ, but OTP goes to the current NeeDo primary email;
- browser input cannot target another User ID;
- already-bound-elsewhere subject conflicts;
- Google-only account can set a password after OTP and then log in by email/NeeDo ID;
- unlink start is rejected when Google is the only method;
- verified unlink soft-deletes the binding, revokes every refresh token for the User, blacklists the current access token, and writes audit evidence;
- wrong-purpose/user/replayed challenges cannot mutate account security.

- [ ] **Step 2: Run the account-security test and verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/auth-account-security.service.test.ts`

Expected: FAIL because the account-security methods are absent.

- [ ] **Step 3: Implement binding status and authenticated link**

Return only:

```ts
type GoogleLinkStatus = {
  linked: boolean;
  maskedEmail: string | null;
  hasPassword: boolean;
  canUnlink: boolean;
};
```

Link initialization creates a nonce containing the authenticated User ID. Credential submission verifies the nonce and Google credential, rejects an active subject owned by another User, and sends a `google_authenticated_link` code to the NeeDo primary email. Verification creates/restores the binding and audits `auth.google.link`.

- [ ] **Step 4: Implement password setup for Google-only accounts**

Validate the same strong-password schema, create a `password_setup` challenge with a prepared bcrypt hash, send the code to the primary email, then atomically update `passwordHash` after consumption. Never return the hash or keep the raw password in Redis.

- [ ] **Step 5: Implement unlink and session invalidation**

Reject unlink start when `passwordHash` is null or there is no active Google binding. On successful `google_unlink` verification, soft-delete the binding, audit `auth.google.unlink`, revoke all refresh sessions for the User, blacklist the authenticating access-token JTI for its remaining TTL, and return `{ signedOut: true }`. The frontend must clear local tokens even if navigation fails.

- [ ] **Step 6: Verify GREEN**

Run: `npm --prefix backend test -- --runTestsByPath tests/auth-account-security.service.test.ts tests/google-auth.service.test.ts tests/auth-session.store.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 7 only**

```bash
git add backend/src/services/auth.service.ts backend/src/services/auth-session.store.ts backend/src/repositories/auth.repository.ts backend/tests/auth-account-security.service.test.ts
git commit -m "feat: manage Google account security"
```

---

### Task 8: Zod Routes, RBAC, Rate Limits, Controller, and OpenAPI

**Files:**
- Modify: `backend/src/validators/auth.validator.ts`
- Modify: `backend/src/controllers/auth.controller.ts`
- Modify: `backend/src/routes/auth.routes.ts`
- Modify: `backend/src/middlewares/security.middleware.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/tests/setup-env.ts`
- Modify: `backend/tests/production-safety.test.ts`
- Modify: `backend/.env.dev.example`
- Modify: `backend/.env.staging.example`
- Modify: `backend/.env.prod.example`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/auth.test.ts`
- Modify: `backend/tests/openapi.test.ts`
- Create: `backend/tests/auth-permissions.test.ts`

**Interfaces:**
- Consumes: AuthService methods from Tasks 5–7.
- Produces: the complete `/api/v1/auth/*` HTTP contract, four account-security permissions, focused abuse controls, and OpenAPI 3.1 coverage.

- [ ] **Step 1: Write failing Supertest/OpenAPI/permission assertions**

Assert all approved paths exist and enforce validation/auth/permissions:

```text
POST /api/v1/auth/register
POST /api/v1/auth/register/verify
POST /api/v1/auth/login
POST /api/v1/auth/google/init
POST /api/v1/auth/google
POST /api/v1/auth/google/verify
GET  /api/v1/auth/google/link
POST /api/v1/auth/google/link/init
POST /api/v1/auth/google/link
POST /api/v1/auth/google/link/verify
POST /api/v1/auth/google/unlink
POST /api/v1/auth/google/unlink/verify
POST /api/v1/auth/password/setup
POST /api/v1/auth/password/setup/verify
```

Also assert `/api/v1/auth/otp/send` and `/api/v1/auth/otp/verify` are absent, every request schema is strict, protected bodies reject `userId`, and OpenAPI never exposes provider subject/credential fields in responses.

- [ ] **Step 2: Run contract tests and verify RED**

Run: `npm --prefix backend test -- --runTestsByPath tests/auth.test.ts tests/openapi.test.ts tests/auth-permissions.test.ts`

Expected: FAIL on missing routes, permissions, and schemas.

- [ ] **Step 3: Add strict validators and controller methods**

Reuse one `challengeVerificationBodySchema` for `{ challengeId, otp }`; define separate strict credential bodies for `{ credential, nonceChallengeId }`; password setup accepts `{ password }`; link/unlink bodies contain no target account identifier. Limit credential/challenge string lengths before service calls.

- [ ] **Step 4: Add routes and granular permissions**

```ts
export const AUTH_ROUTE_PERMISSIONS = {
  logout: "auth:logout",
  me: "auth:me",
  googleRead: "auth:google:read",
  googleLink: "auth:google:link",
  googleUnlink: "auth:google:unlink",
  passwordSetup: "auth:password:setup"
} as const;
```

Add the four permissions to `SYSTEM_PERMISSIONS` and the common authenticated permission set so every active formal role can manage its own login methods. Keep `admin` on all permissions via the existing assignment builder.

- [ ] **Step 5: Add focused route limiters**

Create configurable named rate-limit middleware for registration send/verify, Google nonce initialization, Google credential submission, and account-security verification. Add validated `AUTH_ACTION_RATE_LIMIT_WINDOW_MS`, `AUTH_REGISTRATION_RATE_LIMIT_MAX`, `AUTH_GOOGLE_INIT_RATE_LIMIT_MAX`, `AUTH_GOOGLE_CREDENTIAL_RATE_LIMIT_MAX`, and `AUTH_VERIFICATION_RATE_LIMIT_MAX` values to all backend example environments and test setup. Keys use IP plus authenticated user where available. Do not include email, credential, OTP, or subject in logs or rate-limit error bodies.

- [ ] **Step 6: Document every request/response/error in OpenAPI**

Add reusable schemas for challenge metadata, Google init, verification-required union, Google link status, and token-pair-plus-NeeDo-ID. Document 400/401/403/409/429/502/503 results with stable error-key descriptions. Update `AuthMe` to require `needoId`, `emailVerifiedAt`, and `hasPassword`.

- [ ] **Step 7: Verify GREEN**

Run: `npm --prefix backend test -- --runTestsByPath tests/auth.test.ts tests/openapi.test.ts tests/auth-permissions.test.ts tests/production-safety.test.ts`

Expected: PASS.

Run: `npm --prefix backend run lint`

Expected: PASS.

- [ ] **Step 8: Commit Task 8 only**

```bash
git add backend/src/validators/auth.validator.ts backend/src/controllers/auth.controller.ts backend/src/routes/auth.routes.ts backend/src/middlewares/security.middleware.ts backend/src/constants/permissions.constants.ts backend/src/config/env.ts backend/tests/setup-env.ts backend/tests/production-safety.test.ts backend/.env.dev.example backend/.env.staging.example backend/.env.prod.example backend/src/api/openapi.ts backend/tests/auth.test.ts backend/tests/openapi.test.ts backend/tests/auth-permissions.test.ts
git commit -m "feat: expose formal Google auth APIs"
```

---

### Task 9: Frontend Formal Auth API and Google Identity Services Adapter

**Files:**
- Modify: `src/api/auth.ts`
- Modify: `src/api/auth.test.ts`
- Create: `src/auth/googleIdentity.ts`
- Create: `src/auth/googleIdentity.test.ts`
- Modify: `src/vite-env.d.ts`
- Modify: `src/lib/googleApi.staticDemo.test.ts`

**Interfaces:**
- Consumes: backend auth contracts and Google's official `https://accounts.google.com/gsi/client` browser library.
- Produces: typed auth API methods and `requestGoogleCredential({clientId,nonce,container})` without any legacy Google-account helper dependency.

- [ ] **Step 1: Write failing API and GIS adapter tests**

Assert endpoint/body/auth flags, token persistence only on authenticated success, verification-required responses remaining tokenless, script-load failure, GIS callback cancellation, nonce/client ID forwarding, and static-demo unavailability without fake success.

- [ ] **Step 2: Run the targeted frontend tests and verify RED**

Run: `npm test -- src/api/auth.test.ts src/auth/googleIdentity.test.ts src/lib/googleApi.staticDemo.test.ts`

Expected: FAIL because the new API methods and GIS adapter are absent.

- [ ] **Step 3: Replace registration/OTP types with the approved contracts**

```ts
export type VerificationChallengePayload = {
  challengeId: string;
  maskedEmail: string;
  expiresIn: number;
  cooldownSeconds: number;
};

export type GoogleCredentialResult =
  | ({ status: "authenticated" } & AuthLoginPayload)
  | ({ status: "verification_required" } & VerificationChallengePayload);
```

Add methods for register/start/verify, Google init/submit/verify, link status/init/submit/verify, unlink/start/verify, and password setup/start/verify. Remove generic formal OTP login methods and stop production/non-production branching from choosing the legacy auth server for the formal page.

- [ ] **Step 4: Implement the GIS loader/adapter**

Load the official script once, declare the narrow `google.accounts.id` types locally, call `initialize` with backend-provided `client_id`, callback, and nonce, and render the official button into the provided container. Resolve only from a callback containing a non-empty credential; reject timeout/load/cancel errors with stable local keys. Do not decode or trust the JWT in the browser.

- [ ] **Step 5: Enforce legacy isolation**

Formal auth files must not import `src/lib/googleAccountApi.ts` or reference `/api/google-account/`. The Google icon may move to a neutral asset module or the official rendered button; leave Calendar-only helper tests intact.

Run: `rg -n "googleAccountApi|/api/google-account" src/api/auth.ts src/auth src/pages/auth src/features/settings/UnifiedSettingsPages.tsx`

Expected: no formal-login/account-security references.

- [ ] **Step 6: Verify GREEN**

Run: `npm test -- src/api/auth.test.ts src/auth/googleIdentity.test.ts src/lib/googleApi.staticDemo.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 9 only**

```bash
git add src/api/auth.ts src/api/auth.test.ts src/auth/googleIdentity.ts src/auth/googleIdentity.test.ts src/vite-env.d.ts src/lib/googleApi.staticDemo.test.ts
git commit -m "feat: add frontend Google auth client"
```

---

### Task 10: AuthProvider Session Integration for Google and Verified Registration

**Files:**
- Modify: `src/auth/rbac.ts`
- Modify: `src/auth/AuthProvider.tsx`
- Modify: `src/auth/AuthProvider.test.ts`

**Interfaces:**
- Consumes: typed frontend auth API and GIS credential callback.
- Produces: `startRegistration`, `verifyRegistration`, `loginWithGoogle`, and standard `AuthSession` creation with login method `google`.

- [ ] **Step 1: Write failing AuthProvider tests**

Cover linked Google session completion, first-use verification-required result, registration verification session completion, generated NeeDo ID propagation, provider error normalization, token clearing on failure, refresh restoration, and portal switching regression.

- [ ] **Step 2: Run AuthProvider tests and verify RED**

Run: `npm test -- src/auth/AuthProvider.test.ts`

Expected: FAIL because `loginWithProvider` still returns `error.auth.provider_unavailable`.

- [ ] **Step 3: Update formal session types**

Add `needoId`, `emailVerifiedAt`, and `hasPassword` to `AuthMePayload`/`AuthSession`, bump `authVersion`, and replace the ambiguous `gmail` login method with `google`. Session normalization must preserve the existing identity/portal mappings.

- [ ] **Step 4: Implement provider and registration actions**

`loginWithGoogle` accepts the verified backend result, calls the same `completeAuthenticatedSession` used by password login when authenticated, and returns structured verification state otherwise. Registration verification always enters the customer portal because public registration creates only the baseline customer identity. Do not create a local provider session from Google browser profile data.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- src/auth/AuthProvider.test.ts src/api/auth.test.ts`

Expected: PASS, including existing refresh and portal-switch cases.

- [ ] **Step 6: Commit Task 10 only**

```bash
git add src/auth/rbac.ts src/auth/AuthProvider.tsx src/auth/AuthProvider.test.ts
git commit -m "feat: establish Google auth sessions"
```

---

### Task 11: Login Page, Shared Verification Panel, and Initial NeeDo ID UX

**Files:**
- Create: `src/pages/auth/AuthVerificationPanel.tsx`
- Create: `src/pages/auth/AuthVerificationPanel.test.tsx`
- Modify: `src/pages/auth/LoginPage.tsx`
- Modify: `src/pages/auth/LoginPage.test.ts`
- Modify: `src/i18n/translations.ts`
- Modify: `scripts/i18n-audit.mjs`

**Interfaces:**
- Consumes: AuthProvider registration/Google actions and backend challenge metadata.
- Produces: email-or-NeeDo-ID password UI, email registration UI, official Google button, shared six-digit challenge UI, and generated NeeDo ID confirmation.

- [ ] **Step 1: Write failing UI behavior tests**

Test password identifier labeling/submission, removal of nickname/city/public-technician fields, registration challenge transition, Google init with nonce, first-use challenge transition, linked direct login, masked email, expiry/cooldown, five-attempt feedback, resend/back, copyable generated NeeDo ID, and static-demo unavailable state.

- [ ] **Step 2: Run login UI tests and verify RED**

Run: `npm test -- src/pages/auth/AuthVerificationPanel.test.tsx src/pages/auth/LoginPage.test.ts`

Expected: FAIL on old direct registration/fake Google behavior.

- [ ] **Step 3: Build one reusable verification panel**

The component owns six separate digit inputs or one accessible numeric input, remaining time, resend cooldown, error region, back action, and submit state. It receives callbacks and localized labels; it does not call APIs directly. Preserve focus behavior, mobile keyboard hints, and screen-reader labels.

- [ ] **Step 4: Convert registration to email/password then verification**

Remove display-name, account-type, and technician-city inputs. After verify success, show `needoId` in a copyable confirmation before calling the customer-portal continuation. Initial nickname is not editable in this flow and is never taken from Google.

- [ ] **Step 5: Connect the official Google button**

On click/render, obtain nonce/client ID from `/auth/google/init`, initialize GIS, submit the returned credential, and either complete the session or display the same verification panel. Remove the hard-coded `portalGmailEmail` mapping and every fake provider fallback.

- [ ] **Step 6: Complete localized copy**

Provide Chinese Simplified, Chinese Traditional, Japanese, English, and Korean strings for `Email or NeeDo ID`, verification states, cooldown/expiry/attempt/conflict/provider errors, generated NeeDo ID, copy action, Google link state, password setup, and unlink consequences. No user-visible string introduced here may bypass the project's i18n audit.

- [ ] **Step 7: Verify GREEN and page accessibility**

Run: `npm test -- src/pages/auth/AuthVerificationPanel.test.tsx src/pages/auth/LoginPage.test.ts src/auth/AuthProvider.test.ts`

Expected: PASS.

Run: `npm run i18n:audit`

Expected: PASS with no new missing keys.

- [ ] **Step 8: Commit Task 11 only**

```bash
git add src/pages/auth/AuthVerificationPanel.tsx src/pages/auth/AuthVerificationPanel.test.tsx src/pages/auth/LoginPage.tsx src/pages/auth/LoginPage.test.ts src/i18n/translations.ts scripts/i18n-audit.mjs
git commit -m "feat: complete verified login experience"
```

---

### Task 12: Formal Account Security UI for Google Link, Password Setup, and Unlink

**Files:**
- Modify: `src/features/settings/UnifiedSettingsPages.tsx`
- Modify: `src/features/settings/UnifiedSettingsPages.test.ts`
- Modify: `src/api/auth.ts`
- Modify: `src/api/auth.test.ts`
- Modify: `src/auth/AuthProvider.tsx`

**Interfaces:**
- Consumes: authenticated account-security APIs, GIS adapter, shared verification panel, current AuthSession.
- Produces: real Account Security status/link/setup/unlink lifecycle and forced sign-out after unlink.

- [ ] **Step 1: Write failing Account Security tests**

Cover loading/error/retry, immutable NeeDo ID display, linked/masked/unlinked status, link with a different Google email while OTP goes to the NeeDo email, password setup for Google-only accounts, disabled unlink when Google is the only method, server-side unlink rejection, verified unlink clearing tokens/session, and no Calendar/port-4176 calls.

- [ ] **Step 2: Run settings tests and verify RED**

Run: `npm test -- src/features/settings/UnifiedSettingsPages.test.ts src/api/auth.test.ts`

Expected: FAIL because `GoogleCalendarAccountBinding` still calls `/api/google-account/*` and password setup is a placeholder.

- [ ] **Step 3: Replace `GoogleCalendarAccountBinding` with Account Security auth state**

Rename the section/component so it describes login security, not Calendar. Fetch `GET /auth/google/link`, show `Not linked`, `Linked`, or masked linked email, and drive link/verify through the formal API and GIS nonce. Keep any separate Calendar UI/helper outside this auth section.

- [ ] **Step 4: Show immutable account identifiers and real password state**

Replace `accountUsername` demo fallbacks with `session.needoId` and primary email. Show the current editable nickname separately. Replace “未接入真实改密接口” with `hasPassword` state and the OTP-backed setup action for Google-only accounts.

- [ ] **Step 5: Implement safe unlink UX**

Explain that Google-only users must set a password first. For eligible users, start the email challenge, verify it, then always clear local tokens/session and navigate to login after `{ signedOut: true }`. Keep server rejection authoritative even if stale UI said unlink was allowed.

- [ ] **Step 6: Verify GREEN**

Run: `npm test -- src/features/settings/UnifiedSettingsPages.test.ts src/api/auth.test.ts src/auth/AuthProvider.test.ts`

Expected: PASS.

Run: `rg -n "fetchGoogleAccountApi|/api/google-account/" src/features/settings/UnifiedSettingsPages.tsx src/pages/auth src/auth src/api/auth.ts`

Expected: no matches.

- [ ] **Step 7: Commit Task 12 only**

```bash
git add src/features/settings/UnifiedSettingsPages.tsx src/features/settings/UnifiedSettingsPages.test.ts src/api/auth.ts src/api/auth.test.ts src/auth/AuthProvider.tsx
git commit -m "feat: add formal account security controls"
```

---

### Task 13: Guarded Local Flow Checkers and Operator Documentation

**Files:**
- Modify: `backend/scripts/check-registration-flow.ts`
- Create: `backend/scripts/check-google-auth-flow.ts`
- Modify: `backend/package.json`
- Modify: `README.md`
- Modify: `docs/api.md`
- Modify: `docs/environment.md`
- Modify: `docs/production-release-checklist.md`
- Modify: `docs/User Management.md`
- Modify: `.env.development.example`
- Modify: `.env.staging.example`
- Modify: `.env.production.example`

**Interfaces:**
- Consumes: local guarded MySQL/Redis, formal AuthService, capture-only OTP delivery test seam, deterministic Google verifier test seam.
- Produces: repeatable local registration/Google lifecycle checks, deployment configuration guide, and release gates.

- [ ] **Step 1: Write the Google flow checker with fail-closed environment guards**

Require `NODE_ENV !== production`, `DEPLOY_ENV !== prod`, local MySQL hostname, test database naming, and local Redis. Use the real repository, Redis stores, bcrypt, token service, and audit tables. Inject a deterministic verifier and an OTP delivery client that captures the code only inside the guarded checker; do not add a test endpoint or production bypass.

- [ ] **Step 2: Exercise the complete local lifecycle**

The checker must prove:

1. email registration stores no User before OTP;
2. verification creates baseline customer and tokens;
3. email and NeeDo ID password login both work;
4. first Google use requires OTP and links the existing email account;
5. repeat Google login is direct;
6. a distinct Google email creates a Google-only customer;
7. password setup enables password login;
8. unlink revokes every refresh token and blocks the current access token;
9. all marker Users, profiles, identities, roles, external accounts, LoginLogs, and AuditLogs are removed in `finally`.

Add `check:google-auth-flow` to `backend/package.json`.

- [ ] **Step 3: Update the public and operator documentation**

Document exact API contracts, stable error keys, NeeDo ID rules, verified registration, account-security behavior, Redis keys/TTL/attempt limits, Google client-ID setup, no-secret/no-callback rationale, local/staging/production origins, email webhook dependency, migration order, rollback boundary, and troubleshooting. Explicitly separate Google login from Google Calendar scopes and provider tokens.

- [ ] **Step 4: Document Google Cloud Console prerequisites**

For the Web OAuth client, register the exact local origin used by Vite (for example `http://localhost:5173`) and each formal HTTPS origin. Do not register wildcard origins. Explain that changing ports/domains requires updating Google Cloud before browser E2E can pass.

- [ ] **Step 5: Run guarded checks**

Run: `ENV_FILE=.env.dev npm --prefix backend run check:registration-flow`

Expected: JSON `status: "ok"`, one verified customer result, valid NeeDo ID, and exact cleanup.

Run: `ENV_FILE=.env.dev npm --prefix backend run check:google-auth-flow`

Expected: JSON `status: "ok"` covering first-use verification, repeat login, password setup, unlink/session revocation, and exact cleanup.

- [ ] **Step 6: Commit Task 13 only**

```bash
git add backend/scripts/check-registration-flow.ts backend/scripts/check-google-auth-flow.ts backend/package.json README.md docs/api.md docs/environment.md docs/production-release-checklist.md docs/User\ Management.md .env.development.example .env.staging.example .env.production.example
git commit -m "docs: operationalize Google authentication"
```

---

### Task 14: Complete Verification and Real Google Browser Acceptance

**Files:**
- Verify: all files changed in Tasks 1–13
- Update only if a discovered defect requires it: the smallest owning file and its regression test

**Interfaces:**
- Consumes: configured local formal backend, MySQL, Redis, OTP delivery, Google Web client ID/origin, production frontend build.
- Produces: fresh automated evidence plus real-provider browser acceptance; no deployment or publication is authorized by this task.

- [ ] **Step 1: Invoke verification disciplines before claiming completion**

Use `superpowers:verification-before-completion`. For browser behavior, use the available `webapp-testing` skill and inspect the real rendered UI rather than relying only on DOM/unit assertions.

- [ ] **Step 2: Validate and apply the migration on the guarded local environment**

Run: `ENV_FILE=.env.dev npm --prefix backend run prisma:status`

Expected: schema/migration history is consistent.

Run: `ENV_FILE=.env.dev npm --prefix backend run prisma:migrate:deploy`

Expected: `20260826140000_formal_google_auth_identity` applies successfully or is already applied.

Run: `ENV_FILE=.env.dev npm --prefix backend run prisma:generate`

Expected: generation succeeds with `needoId`, nullable password hash, and `ExternalAuthAccount` types.

- [ ] **Step 3: Run complete backend gates**

```bash
npm --prefix backend test
npm --prefix backend run lint
npm --prefix backend run build
ENV_FILE=.env.dev npm --prefix backend run check:registration-flow
ENV_FILE=.env.dev npm --prefix backend run check:google-auth-flow
```

Expected: every command exits 0. Record actual Jest suite/test counts and checker JSON; do not reuse earlier task output.

- [ ] **Step 4: Run complete frontend gates**

```bash
npm test
npm run lint
npm run i18n:audit
npm run verify:production-build
```

Expected: every command exits 0; the production-bundle audit finds no formal mock Google login path.

- [ ] **Step 5: Re-run source and schema safety audits**

Run: `rg -n "passwordHash|providerSubject|credential|otp" backend/src/controllers backend/src/routes backend/src/api/openapi.ts`

Expected: sensitive inputs appear only in request parsing/validation and are never response properties or log metadata.

Run: `rg -n "fetchGoogleAccountApi|/api/google-account/|provider_unavailable|portalGmailEmail" src/pages/auth src/auth src/api/auth.ts src/features/settings/UnifiedSettingsPages.tsx`

Expected: no formal auth matches.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 6: Start the formal stack and perform browser acceptance without Google first**

Run the repository's formal local launcher with MySQL/Redis and configured OTP delivery. In a real browser verify responsive desktop/mobile states for email registration, masked email verification, generated NeeDo ID display/copy, sign-out, email password login, NeeDo-ID password login, bad-password non-enumerating error, refresh restoration, and Account Security loading/error states.

- [ ] **Step 7: Perform real Google provider acceptance**

This step requires a real `GOOGLE_AUTH_CLIENT_ID`, an authorized local origin matching the browser URL, HTTPS for non-local environments, and access to the NeeDo email OTP destination. Verify:

1. first Google use returns the NeeDo OTP panel and does not create an account before verification;
2. Google registration creates a customer whose NeeDo ID is the initial nickname;
3. repeat Google login enters directly without a new NeeDo OTP;
4. authenticated same/different-email Google linking works and preserves primary email;
5. Google-only account cannot unlink until password setup succeeds;
6. password setup enables email/NeeDo-ID password login;
7. verified unlink signs out and old refresh/access sessions fail;
8. disabled/deleted test account cannot bypass account state through Google.

Capture the observed origin, tested account markers, API statuses, and screenshots. If client ID/origin/email delivery is unavailable, report this gate as externally blocked and do not describe Google as browser-accepted.

- [ ] **Step 8: Inspect repository scope and commit only defect fixes**

Run: `git status --short`

Expected: only task-owned changes, with pre-existing `artifacts/` still untracked and untouched.

If Step 6/7 revealed a defect, add its regression test, rerun the owning targeted suite plus complete gates, and commit the smallest correction. Otherwise create no empty verification commit.

---

## Completion Evidence Required

The implementation is complete only when all of the following are recorded together:

- migration applied and Prisma client regenerated;
- complete backend tests/lint/build passing with fresh counts;
- complete frontend tests/typecheck/i18n/production build passing with fresh counts;
- guarded registration and Google lifecycle checkers returning `status: "ok"` with exact cleanup;
- formal source contains no legacy Google-account login calls or fake provider success;
- manual email/password/NeeDo-ID flows accepted in the rendered UI;
- real Google browser flow accepted with the exact configured client ID/origin, or clearly reported as the sole external blocker;
- no unrelated files, secrets, provider tokens, or `artifacts/` content staged.
