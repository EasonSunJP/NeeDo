# NeeDo Google Third-Party Login Design

**Date:** 2026-08-26

**Status:** Approved design pending written-spec review

**Scope:** Formal account registration, email verification, NeeDo ID login, Google registration/login, and Google account binding lifecycle

## 1. Summary

NeeDo will keep one authoritative account, identity, RBAC, and session system. Email/password, NeeDo ID/password, and Google are authentication methods for the same `User`; Google does not create a parallel user or permission model.

Every newly registered account must complete a NeeDo email verification challenge before it becomes usable. This applies both to email/password registration and to the first Google registration or binding. After verification:

- users can sign in with email plus password;
- users can sign in with immutable NeeDo ID plus password;
- users with a linked Google account can sign in through Google without another NeeDo email code;
- Google-only users can sign in immediately through Google and can later set a NeeDo password through a verified account-security flow.

New accounts receive an immutable, unique NeeDo ID. Their initial nickname and customer display name both equal that NeeDo ID. The nickname and display name may later change; the NeeDo ID never changes.

## 2. Confirmed Product Rules

1. Email or NeeDo ID plus password is a formal login method.
2. A linked Google account is a second formal login method for the same NeeDo account.
3. Google can also be used independently to register and sign in.
4. First email registration requires a NeeDo email code.
5. First Google registration or first Google binding requires a NeeDo email code.
6. After the first verification, ordinary password login and linked Google login do not require another code.
7. A new user's initial nickname and customer display name equal the generated NeeDo ID.
8. The user may later edit the nickname and display name without changing the NeeDo ID.
9. Google registration creates only the baseline `customer` identity. Technician, merchant, and affiliate availability continues to follow `docs/IDENTITY_APPLICATION_WORKFLOWS.md`.
10. Google sign-in requests only `openid email profile`. Google Calendar authorization is a separate capability and is not part of this design.

## 3. Current Baseline

The repository already has a formal Express/Prisma/MySQL/Redis authentication chain:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/otp/send`
- `POST /api/v1/auth/otp/verify`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- short-lived NeeDo access tokens;
- revocable refresh tokens in Redis;
- access-token blacklist support;
- User, UserIdentity, Role, Permission, LoginLog, and AuditLog records;
- frontend session restoration and identity/RBAC routing.

The visible Google login button is not connected to this formal chain. `AuthProvider.loginWithProvider` currently returns `error.auth.provider_unavailable`. The `/api/google-account/*` routes in `scripts/mock-backend.mjs` belong to the legacy port-4176 helper service, store provider tokens in a temporary JSON file, and redirect Google email data back to the browser. They are not acceptable as formal authentication and must not be promoted into production.

The current `User.username` is a mutable display name and is not unique. Although the login repository currently searches it, it cannot safely serve as a formal NeeDo ID.

## 4. Scope

### 4.1 In Scope

- persistent, unique, immutable account-level NeeDo IDs;
- verified email/password registration;
- email or NeeDo ID plus password login;
- formal Google Identity Services integration;
- backend verification of Google ID tokens;
- Google-only customer registration;
- automatic first-time linking to an existing account with the same normalized email after NeeDo email verification;
- authenticated Google binding status, link, and unlink lifecycle;
- verified password setup for Google-only accounts;
- rate limiting, audit logs, login logs, OpenAPI contracts, i18n, tests, and browser acceptance;
- removal of the formal login page's dependency on the legacy Google mock helper.

### 4.2 Out of Scope

- Google Calendar scopes, event import/export, or long-lived Google API tokens;
- Apple, LINE, Facebook, or other identity providers;
- technician or merchant auto-activation;
- account merging based on nickname, avatar, phone, or similar profile data;
- automatic replacement of a NeeDo primary email with the Google email;
- password reset beyond the verified password-setup path needed by Google-only accounts;
- changes to Booking, wallet, IM, Social, or identity-application business rules.

## 5. Architecture

```text
Google Identity Services or email registration form
                    |
                    v
        /api/v1/auth/* controllers
                    |
                    v
       Auth / GoogleAuth services
          |                  |
          v                  v
Google ID-token verifier   Redis verification challenges
          |                  |
          +--------+---------+
                   v
        Auth repository transaction
                   |
                   v
 User + CustomerProfile + UserIdentity + UserRole
       + ExternalAuthAccount + audit evidence
                   |
                   v
       Existing NeeDo Access/Refresh Tokens
```

Google proves control of a Google identity. NeeDo proves the first-use email challenge, owns account creation and linking decisions, and remains the only issuer of application sessions.

## 6. Data Model

### 6.1 User Changes

`User` gains:

- `needoId String @unique @map("needo_id") @db.VarChar(32)`
- `emailVerifiedAt DateTime? @map("email_verified_at")`
- nullable `passwordHash`
- a relation to `ExternalAuthAccount[]`

Rules:

- NeeDo ID uses `n` followed by 10 decimal digits, for example `n0000000123`.
- Existing users are backfilled deterministically from their existing user ID so every current account receives a stable unique value.
- New account creation generates a cryptographically random 10-digit value and retries on the database unique constraint.
- NeeDo ID is normalized to lowercase and is not editable through User Management or profile APIs.
- Email remains normalized to lowercase.
- Existing non-deleted accounts are marked as verified during the compatibility migration because they predate the new verification gate and are already established accounts. New public accounts cannot set `emailVerifiedAt` without consuming a valid challenge.
- A nullable password hash represents a Google-only account. Password login must fail with the normal non-enumerating invalid-credentials response when no password exists.
- Every repository, protected management flow, guarded seed, and simulation path that creates a User must use the same NeeDo ID allocator. Protected management and guarded seed creation may set `emailVerifiedAt` as trusted provisioning; public registration may set it only after challenge consumption.
- The NeeDo ID initial-display rule applies to new public email and Google registration. Protected administrator-created operational accounts may retain an explicitly supplied display name while still receiving their own immutable NeeDo ID.

### 6.2 Initial Display Values

For every newly created account:

- `User.username = User.needoId`
- `CustomerProfile.displayName = User.needoId`
- the baseline `UserIdentity.displayName = User.needoId`

Google's `name` claim does not overwrite these fields. Google profile values may be used only as non-authoritative provider metadata where needed; they are not the initial NeeDo nickname.

Later profile editing may update `User.username`, `CustomerProfile.displayName`, and the active identity display name according to the existing profile contract. It must never mutate `User.needoId`.

### 6.3 ExternalAuthAccount

Add a formal business table with the standard timestamps and soft-delete field:

```text
ExternalAuthAccount
- id
- userId
- provider                 // google
- providerSubject          // verified Google sub
- providerEmail            // normalized email from the verified token
- providerEmailVerifiedAt
- lastUsedAt
- createdAt
- updatedAt
- deletedAt
```

Constraints and indexes:

- unique `(provider, providerSubject)`;
- index `(userId, provider, deletedAt)`;
- index `(providerEmail, provider, deletedAt)`;
- foreign key to `User` with restrictive deletion behavior.

The provider subject is the stable lookup key. Provider email is metadata and a first-link matching input, not the ongoing identity key. Unlinking soft-deletes the row. A later correctly verified rebind restores and updates the same unique provider-subject row instead of creating a duplicate.

No Google ID token, access token, refresh token, authorization code, or client secret is persisted in this table.

## 7. Redis Challenge Model

Use random, non-guessable challenge IDs with purpose-specific Redis keys. Supported purposes are:

- `email_registration`
- `google_registration_or_link`
- `google_authenticated_link`
- `google_unlink`
- `password_setup`
- `google_nonce`

Each email challenge stores only the data needed to finish that exact action:

- normalized destination email;
- HMAC or password-hash digest of the six-digit code;
- challenge purpose;
- attempt count;
- expiry time;
- prepared password hash for email registration or password setup, never the raw password;
- verified Google subject and normalized verified Google email for Google flows;
- authenticated NeeDo user ID for account-security flows;
- required registration metadata.

Challenge lifetime is 10 minutes. Resend cooldown is 60 seconds. A challenge allows at most five failed attempts. Successful consumption, expiry, or attempt exhaustion deletes the challenge. A challenge cannot be reused for a different purpose or user.

The provider nonce is created before rendering Google Identity Services. The frontend passes it to Google, and the backend requires the verified ID token's `nonce` claim to match the stored one-time nonce before processing the credential.

## 8. Authentication Flows

### 8.1 Email Registration

1. The user submits email and password.
2. The backend normalizes the email, validates password strength, rejects an existing email, hashes the password, creates an `email_registration` challenge, and sends the code.
3. No User, CustomerProfile, identity, role assignment, or NeeDo session is created yet.
4. The user submits challenge ID and code.
5. The service atomically consumes the challenge and creates:
   - User with generated NeeDo ID;
   - initial username equal to NeeDo ID;
   - verified-at timestamp;
   - CustomerProfile with display name equal to NeeDo ID;
   - active default customer identity with the same display name;
   - customer role assignment;
   - registration audit evidence.
6. The service issues the existing NeeDo access and refresh tokens.
7. The frontend loads `/auth/me`, displays the generated NeeDo ID, and enters the customer portal.

Public account registration always establishes the baseline customer identity. A user who selected a technician-oriented entry continues from the authenticated customer account into the existing technician application workflow instead of receiving an unreviewed technician identity.

### 8.2 Email or NeeDo ID Password Login

The formal login input accepts one identifier field:

- if it contains `@`, query normalized `User.email`;
- otherwise, query normalized `User.needoId`.

`User.username` is no longer a formal login key. This removes ambiguous lookup when multiple users have the same nickname.

The remaining password, lockout, LoginLog, access-token, refresh-token, identity, and RBAC behavior stays on the existing AuthService path. Invalid email, invalid NeeDo ID, missing password hash, and incorrect password return the same public invalid-credentials response.

### 8.3 First Google Registration or Automatic Link

1. The frontend requests a one-time Google nonce and public client configuration.
2. Google Identity Services returns an ID token credential containing that nonce.
3. The frontend posts the credential and nonce challenge ID to the formal backend over HTTPS.
4. The backend uses Google's official Node authentication library to verify signature, audience, issuer, expiry, nonce, and `email_verified`.
5. The backend looks up active `ExternalAuthAccount(provider=google, providerSubject=sub)`.
6. If found, the active NeeDo account is checked and a NeeDo session is issued immediately.
7. If not found, the backend creates `google_registration_or_link`, sends a NeeDo email code to the verified Google email, and returns a masked email and challenge ID.
8. After the code is verified, a transaction rechecks provider-subject and email uniqueness:
   - when a User with the same normalized email exists, link Google to that account;
   - when no User has the email, create a Google-only User, NeeDo ID, customer profile, customer identity, and customer role, then link Google;
   - when the provider subject became linked concurrently, return the already-linked result only when it targets the same account; otherwise return a conflict.
9. The service issues NeeDo access and refresh tokens.

A Google-only account has `passwordHash = null`. It can always use its linked Google identity and can later set a password through the account-security flow.

### 8.4 Subsequent Google Login

1. Verify the Google credential and nonce again; never trust cached browser profile data.
2. Resolve the active binding by `(google, sub)`.
3. Reject a missing, disabled, soft-deleted, or restricted NeeDo account.
4. Update `lastUsedAt`, write a Google LoginLog result, and issue the normal NeeDo token pair.
5. Do not send another NeeDo email code.

### 8.5 Authenticated Google Binding

1. The user opens Account Security and starts Google binding while holding a valid NeeDo session.
2. The backend creates a new provider nonce tied to that authenticated user.
3. The frontend obtains a Google credential with the nonce.
4. The backend verifies the credential and checks that its provider subject is not actively bound elsewhere.
5. NeeDo sends a code to the user's current primary NeeDo email.
6. Code verification transactionally creates or restores the binding and writes audit evidence.

The Google email may differ from the NeeDo primary email during an authenticated link. Linking does not change the primary email. Both control of the signed-in NeeDo account and control of the selected Google identity are proven, and the code confirms the NeeDo primary email before the new login method is added.

### 8.6 Google Unlink

1. The account-security page starts an unlink challenge.
2. The backend refuses to start when Google is the user's only login method and no password hash exists.
3. NeeDo sends a code to the primary email.
4. Successful verification soft-deletes the binding, writes audit evidence, and revokes all NeeDo refresh sessions for that user so remembered portals cannot continue using stale authentication context.
5. The current access token is blacklisted after the response is prepared, and the frontend returns to login.

### 8.7 Password Setup for Google-Only Users

1. An authenticated Google-only user enters and confirms a password in Account Security.
2. The backend validates strength, stores only the prepared password hash in a `password_setup` challenge, and sends a code to the primary email.
3. Verification atomically writes the password hash and consumes the challenge.
4. The user can then sign in with email or NeeDo ID plus password.

## 9. API Contracts

All endpoints use `/api/v1`, Zod validation, the standard NeeDo response envelope, stable error keys, and OpenAPI documentation.

### 9.1 Registration

- `POST /api/v1/auth/register`
  - input: `email`, `password`
  - output: `challengeId`, `maskedEmail`, `expiresIn`, `cooldownSeconds`
  - no account is created by this request
- `POST /api/v1/auth/register/verify`
  - input: `challengeId`, `otp`
  - output: NeeDo token pair plus generated `needoId`

The old direct-account-creation behavior of `/auth/register` is removed so there is no public bypass around email verification. The frontend and guarded local registration checker must move to the two-step contract in the same microstep.

### 9.2 Password Login

- `POST /api/v1/auth/login`
  - input: `loginIdentifier`, `password`
  - accepted identifier: normalized email or immutable NeeDo ID
  - output: existing NeeDo token pair

The short compatibility URI `/api/v1/login` may call the same validated service but must not retain username/nickname lookup.

### 9.3 Google Login and Registration

- `POST /api/v1/auth/google/init`
  - output: public client ID, nonce, nonce challenge ID, expiry
- `POST /api/v1/auth/google`
  - input: `credential`, `nonceChallengeId`
  - output when linked: authenticated NeeDo token pair
  - output when first use: `verification_required`, email challenge ID, masked email, expiry
- `POST /api/v1/auth/google/verify`
  - input: `challengeId`, `otp`
  - output: authenticated NeeDo token pair plus `needoId` when newly created

### 9.4 Authenticated Account Security

- `GET /api/v1/auth/google/link`
- `POST /api/v1/auth/google/link/init`
- `POST /api/v1/auth/google/link`
- `POST /api/v1/auth/google/link/verify`
- `POST /api/v1/auth/google/unlink`
- `POST /api/v1/auth/google/unlink/verify`
- `POST /api/v1/auth/password/setup`
- `POST /api/v1/auth/password/setup/verify`

Every account-security mutation requires authentication, the correct RBAC permission, a purpose-bound challenge, and an AuditLog entry. Binding endpoints never accept a target User ID from the browser.

## 10. Frontend Design

### 10.1 Login and Registration Page

- Keep the existing responsive login page and portals.
- Rename the identifier field to the localized equivalent of `Email or NeeDo ID`.
- Password login continues through the formal AuthProvider method.
- Replace the fake `loginWithProvider` response with a formal Google Identity Services adapter.
- Render Google's official button or a compliant trigger backed by Google Identity Services; do not reproduce a deceptive Google credential prompt.
- When Google or registration returns `verification_required`, replace the form body with the shared six-digit verification panel.
- Display masked destination email, expiry, resend cooldown, remaining-attempt errors, back action, and retryable provider errors.
- On successful new registration, show the generated NeeDo ID before entering the customer portal and make it copyable.
- Do not prefill the nickname from the Google profile.

### 10.2 Account Security Page

- Read binding status from the authenticated formal API.
- Show `Not linked`, masked linked email, or `Linked` state.
- Link, unlink, and password-setup actions use the same verification panel pattern as registration.
- Prevent unlink in the UI when the server reports that Google is the only login method, while preserving the server-side rejection as the authority.

### 10.3 Static Demo and Legacy Helper

- Static demo may display a clear unavailable state, but it must not create a fake Google session.
- Formal login code must not call port 4176 or `/api/google-account/*`.
- The legacy helper may remain for isolated Google Calendar compatibility until that separate capability is formally migrated, but its Google-account-login path is no longer referenced by formal UI.

## 11. Security and Privacy

- Use `google-auth-library` on the backend; do not hand-roll Google signature verification.
- Verify ID-token signature, configured audience, issuer, expiry, nonce, and verified email.
- Use the Google `sub` claim as provider identity. Never authenticate from a plain Google user ID or browser-supplied email.
- Google login uses only `openid email profile` and does not request offline access.
- Store no Google credential or token after verification.
- Client ID is public configuration. No Google client secret is required for the Google Identity Services ID-token login flow.
- Production requires HTTPS and exact authorized JavaScript origins in Google Cloud Console.
- Apply separate rate limits to nonce initialization, Google credential submission, verification sends, and verification attempts.
- Normalize email and NeeDo ID consistently before querying.
- Preserve login anti-enumeration: unknown identifier, incorrect password, and absent password hash share one public failure.
- Exclude raw OTP, raw credential, provider token, and provider subject from ordinary logs. Audit metadata may include provider name, masked email, and a non-reversible subject fingerprint.
- Enforce database uniqueness inside the same transaction that creates or links the account.
- A disabled, deleted, or restricted User cannot use Google to bypass account state.
- Revoke active refresh sessions after unlink and after security-sensitive provider conflicts.

## 12. Error Handling

Stable product errors cover:

- Google authentication is not configured;
- Google is temporarily unavailable;
- invalid or expired Google credential;
- invalid Google audience, issuer, or nonce;
- Google email is not verified;
- verification challenge expired;
- verification code incorrect;
- verification attempt limit reached;
- resend cooldown active;
- email already registered during email-registration start;
- Google identity already linked to another NeeDo account;
- account disabled, deleted, or restricted;
- password is not set when an authenticated account-security action requires one; password login itself still returns the generic invalid-credentials error;
- Google cannot be unlinked because it is the only login method;
- transaction conflict caused by concurrent registration or binding.

Provider/network failures return a stable `provider_unavailable` product error. Node exceptions and Google response bodies are never returned directly to the frontend.

## 13. Audit and Login Evidence

Required AuditLog actions include:

- `auth.registration.email_verified`
- `auth.registration.google_verified`
- `auth.google.link`
- `auth.google.unlink`
- `auth.password.setup`

LoginLog records distinguish password, OTP registration completion, and Google login internally without exposing provider tokens. Successful Google first-use registration writes both the registration audit and a successful login log in the same business outcome.

## 14. Testing and Acceptance

### 14.1 Migration and Repository Tests

- every existing User receives a valid unique NeeDo ID;
- duplicate NeeDo ID and duplicate provider subject are rejected;
- new ID collision retry is deterministic under tests;
- nullable password hashes do not break password lookup;
- soft-deleted provider binding can be correctly restored after full verification;
- no provider token column exists.

### 14.2 Service and API Tests

- email registration creates no database User before verification;
- correct email code creates exactly one User/customer identity/role under concurrent verification;
- expired, replayed, wrong-purpose, and exhausted codes fail;
- email and NeeDo ID both authenticate the same password account;
- nickname is not accepted as a login ID;
- Google new-user registration creates a Google-only customer account;
- Google profile name does not replace the initial NeeDo ID nickname;
- existing normalized email links only after code verification;
- subsequent Google login skips NeeDo email verification;
- invalid signature, audience, issuer, expiry, nonce, or unverified email fails;
- disabled and soft-deleted accounts fail;
- concurrent Google first use cannot create duplicate Users or bindings;
- provider-subject conflict cannot move an active binding;
- authenticated bind cannot target another User ID;
- Google-only user must set a password before unlinking;
- password setup enables email and NeeDo ID login;
- unlink revokes sessions and preserves audit evidence;
- OpenAPI contains every new contract and stable error.

Google verification is injected behind a small interface so automated tests use a deterministic verifier stub and never depend on live Google network calls.

### 14.3 Frontend Tests

- password login submits email or NeeDo ID to the formal endpoint;
- Google button initializes Google Identity Services with the backend nonce;
- linked Google response establishes the existing AuthProvider session;
- first-use response renders verification UI;
- registration and Google verification success render the generated NeeDo ID;
- refresh restoration, portal switching, and `/auth/me` remain unchanged;
- provider unavailable, expiry, cooldown, conflict, and disabled-account states render localized messages;
- formal production source no longer references the Google login mock helper.

### 14.4 Verification Gates

- Prisma migration status and generation;
- backend targeted tests, complete tests, lint, and build;
- frontend targeted tests, complete tests, lint, i18n audit, and production build;
- guarded local MySQL registration/Google-flow checker with exact marker cleanup;
- manual browser acceptance for email registration, password login, Google registration, Google link, repeat Google login, password setup, and unlink;
- real Google end-to-end acceptance using a configured Web OAuth client and registered local/production origins.

Automated tests and a build do not substitute for the final real-provider browser check.

## 15. Runtime Configuration

Add documented environment configuration without committing credentials:

- `GOOGLE_AUTH_CLIENT_ID`
- optional comma-separated allowed client IDs if future native clients are introduced;
- provider verification timeout;
- nonce TTL;
- verification challenge TTL, cooldown, and maximum attempts.

Google Cloud Console must register the exact formal HTTPS origin and the approved local development origin. Since this flow verifies Google Identity Services ID tokens rather than calling Google APIs with offline access, it does not require a Google client secret or callback redirect URI.

## 16. Incremental Delivery Boundaries

The implementation plan must preserve the repository's micro-step rule. The design should be delivered through sequential, independently testable slices:

1. account schema, NeeDo ID backfill, nullable password support, and verified two-step email registration;
2. formal Google verifier, nonce/challenge infrastructure, Google registration/login APIs, and backend tests;
3. login-page Google Identity Services integration and shared verification UI;
4. Account Security status, bind, password setup, and unlink lifecycle;
5. complete local verification, real Google browser acceptance, and documentation finalization.

No slice may introduce a fake provider success path or skip its migration, Zod, OpenAPI, audit, and tests.

## 17. Alternatives Considered

### 17.1 Email-Only Google Lookup

Rejected because email is not Google's stable identity key, may change, and is not sufficient for safe long-term binding. It also makes unlinking and provider conflict handling unreliable.

### 17.2 Firebase, Auth0, or Another Hosted Auth System

Rejected for this step because NeeDo already has formal User, identity, RBAC, access-token, refresh-token, audit, and portal-session infrastructure. Adding another session authority would duplicate the most security-sensitive layer and require a larger migration.

### 17.3 Legacy Port-4176 OAuth Helper

Rejected because it is explicitly a mock compatibility service, stores tokens in temporary JSON, is not connected to formal User/RBAC sessions, and sends profile data through browser redirects.

## 18. Primary Provider References

- Google, *Authenticate with a backend server*: https://developers.google.com/identity/sign-in/web/backend-auth
- Google, *OpenID Connect*: https://developers.google.com/identity/openid-connect/openid-connect
- Google, *Google OpenID Connect API Reference*: https://developers.google.com/identity/openid-connect/reference
