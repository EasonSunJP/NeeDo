# NeeDo Production Release Checklist

This checklist separates a verified local formal release candidate from an
actual public production deployment. A checked local item is not evidence that
the public server, managed database, backup policy, or capacity tier has passed.

## 1. Release Scope

The formal release artifact is the normal `npm run build` output. It must use the
Express `/api/v1` backend, MySQL, and Redis. Never deploy the `build:static`
artifact as the formal product.

The current local acceptance routes are:

| Role | Entry | Formal data accepted locally |
|---|---|---|
| Operations | `pf-admin.html#/admin` | Dashboard, orders, schedule, finance, shops, technicians, customers, services, RBAC |
| Merchant | `store-admin.html#/merchant-admin` | Current-shop dashboard, orders, people, services, schedule, manual payment, finance, settings |
| Customer | `user.html#/` | Authenticated profile, core browse/detail, availability, booking, order history/detail/cancel, NDP wallet |
| Technician | `technician.html#/technician` | Authenticated identity and shop, scoped order state machine, status history, formal bookable schedule |

Unsupported peripheral modules must remain capability-gated instead of showing
invented operational results. The dedicated static demo remains available only
for presentation compatibility.

## 2. Local Formal Gate

Verified on 2026-08-25 against local MySQL `needo_dev` and local Redis:

- [x] `npm test` — 151 files, 723 tests
- [x] `npm run lint`
- [x] `npm run verify:production-build` — 8 HTML entries, 22 assets
- [x] `npm --prefix backend test` — 54 suites, 213 tests
- [x] `npm --prefix backend run lint`
- [x] `npm --prefix backend run build`
- [x] `ENV_FILE=.env.dev npm --prefix backend run audit:database-indexes` — 56 tables, 436 indexes, 122 foreign keys, zero findings
- [x] `ENV_FILE=.env.dev ALLOW_SIMULATION_SEED=true npm --prefix backend run check:simulation-data` — 10 shops, 100 technicians, 100 customers, 2,600 schedule slots, 1,801 bookings, status `ok`
- [x] `SMOKE_BASE_URL=<formal-api> SMOKE_EMAIL=<least-privilege-account> SMOKE_PASSWORD=<secret> npm run verify:production-smoke` — 8 checks
- [x] Browser acceptance completed for all four role entries with no new runtime errors
- [x] Account CSV/XLSX exists under ignored `outputs/` and is absent from Git; the XLSX ZIP structure and rendered first/summary pages were inspected
- [x] `git diff --check` is clean

The local Step 14 latency run is documented in
`load-tests/reports/2026-08-25-local-development-baseline.md`. It does not
qualify the 1k, 5k, 10k, 30k, or 100k tiers.

## 3. Staging Gate

Do not promote until every item in this section has external evidence:

- [ ] Real staging DNS, TLS, Nginx, API, MySQL, Redis, object storage/CDN, and secret manager provisioned
- [ ] `backend/.env.staging` populated from secrets; no placeholder values
- [ ] Pre-migration database snapshot created and restore tested
- [ ] `prisma migrate deploy` succeeds exactly once
- [ ] `/health`, `/ready`, internal `/metrics`, structured logs, trace IDs, and alerts verified
- [ ] Same-origin `/api/v1` proxy, SSE buffering/timeout, CORS allow-list, security headers, and rate limits verified
- [ ] Four-role browser flow completed against staging data
- [ ] Booking complete and cancel paths preserve slot, payment, wallet, ledger, notification, and audit consistency
- [ ] Rolling deployment and rollback drill completed
- [ ] k6 1k tier measured and recorded before attempting the next tier

### Google authentication staging gate

- [ ] Apply Prisma migrations in order with `prisma migrate deploy`:
  `20260826140000_formal_google_auth_identity`, then
  `20260827090000_google_account_security_hardening`; do not edit either after
  it has been applied.
- [ ] Regenerate Prisma Client and build the exact release image after migration.
- [ ] Configure `GOOGLE_AUTH_CLIENT_ID` from the staging secret/config store;
  confirm no Google client secret, Google provider token, or OTP appears in the
  image, environment examples, logs, traces, or API responses.
- [ ] Configure the exact staging HTTPS origin as an authorized JavaScript
  origin in the Google Cloud Web client. Do not configure a callback route for
  this ID-token flow.
- [ ] Configure the HTTPS `AUTH_OTP_EMAIL_WEBHOOK_URL` behind a private-network/
  IP allow-list or approved gateway; the current sender has no signature/header
  secret. Prove delivery, timeout/error handling, alerting, redaction,
  reject/bounce handling, and OTP retention/deletion.
- [ ] Before promotion, run `npm --prefix backend run check:registration-flow`
  and `npm --prefix backend run check:google-auth-flow` only against an isolated
  local `needo_test` clone plus local Redis. Their safety guards intentionally
  reject staging and production databases.
- [ ] In staging browser acceptance, prove: no user before email OTP; email and
  NeeDoID password login; first Google OTP link; repeated direct Google login;
  distinct Google-only registration; password setup; unlink; and rejection of
  every pre-unlink access/refresh session.
- [ ] Confirm Google Calendar remains disabled/separately consented; Google
  sign-in alone grants no Calendar scope or provider access token.

Capacity tiers must be run in order. The 30k and 100k tiers require distributed
load generators and horizontally scaled infrastructure.

## 4. Production Gate

- [ ] Production DNS/TLS and Nginx route `/api/v1/*` to the formal backend
- [ ] `/api/v1/metrics` is inaccessible from the public internet
- [ ] Production env validation passes with test login, demo seed, and simulation seed disabled
- [ ] Production backup retention and point-in-time recovery are enabled
- [ ] Release image and frontend asset revision are immutable and recorded
- [ ] Migration, canary health, readiness, logs, metrics, and rollback owner are approved
- [ ] Dedicated least-privilege smoke account exists in the secret manager
- [ ] Post-release smoke and browser acceptance pass from outside the server
- [ ] Alerts cover readiness, dependency availability, stale metrics, HTTP 5xx, latency, pool saturation, and disk capacity

Public deployment still requires server/cloud-console or SSH authority. A static
FTP upload cannot deploy the backend, migrations, MySQL, Redis, Nginx, secrets,
monitoring, or backup controls.

## 5. Deferred Paid Providers

The user explicitly deferred paid external providers. Their absence must be
visible and safe:

| Provider area | Current release behavior | Activation gate |
|---|---|---|
| Maps/navigation | Address data and external navigation links remain usable; no paid geocoding/routing claim | Provider contract, restricted key, quota/billing alerts, consent and error fallback |
| eKYC | No fake verification success; provider-dependent verification remains disabled | Operating-profit decision, compliance review, provider credentials, webhook signature validation, retention/deletion policy |
| Card/bank/payout automation | Manual onsite/bank confirmation and reviewed wallet adjustment remain the formal flow | PSP/bank contract, idempotent webhook processing, reconciliation, refund and dispute runbooks |
| Media/object storage | Text and existing versioned assets work; unsupported uploads remain gated | Private bucket/CDN, signed upload, MIME scanning, lifecycle and deletion audit |

## 6. Data And Credential Handling

- Simulation accounts are local/test credentials only.
- CSV/XLSX account exports must stay in ignored `outputs/`; never add them to Git
  or a public source archive.
- Production must not run the simulation seed or reuse simulation passwords.
- Source archives must exclude `.git`, worktrees, `node_modules`, real `.env`
  files, database dumps, Redis data, build output, and credential exports.

## 7. Rollback Decision

Rollback immediately when readiness fails, a migration makes the current image
incompatible, HTTP 5xx reaches 1%, payment/ledger consistency fails, or the
accepted latency thresholds fail. Preserve logs and metrics, shift traffic to
the previous healthy image, and restore a database only from a tested backup
when the failed release performed irreversible writes.

For Google authentication, the rollback boundary is the compatibility of the
previous application image with nullable password hashes, immutable NeeDoIDs,
external auth accounts, account-security audit records, and the authoritative
session-generation field. Schema migrations are forward-only: never edit or
reverse an applied migration in place. Roll the application image back only
when that image has been rehearsed against the migrated schema and cannot write
old semantics into new account records. Otherwise fix forward.

Once a user has registered, linked Google, set a password, or unlinked after the
new image is active, disabling `GOOGLE_AUTH_CLIENT_ID` or restoring old code is
not a data rollback. Preserve those account/security events and use an explicit,
audited operator recovery or a tested database snapshot/PITR plan. Restoring a
database also requires coordinated Redis/session invalidation so sessions from
the discarded timeline cannot survive.

## 8. Google Authentication Troubleshooting

- Google button reports `origin_mismatch` or does not render: compare scheme,
  host, and port byte-for-byte with the Web client's authorized JavaScript
  origins; paths and callback redirect URIs do not belong in that list.
- `error.auth.otp_delivery_not_configured`: configure the email webhook. Do not
  expose OTPs in a response, log, manual database update, or temporary endpoint.
- `error.dependency.google_auth_unavailable`: the release is missing the current
  Google-capable repository/account-security wiring. Verify the matching backend
  image, migrations, and generated Prisma Client; this key is not a provider
  network/key-fetch error.
- `error.auth.google_nonce_invalid` or `google_credential_invalid`: restart from
  `/api/v1/auth/google/init`; a nonce is bound, expiring, and single-use. If
  `google_credential_invalid` becomes widespread, operators should also inspect
  Google reachability, client-ID audience, and verifier timeouts; clients still
  receive the same generic `401` by design.
- `error.auth.google_conflict`: inspect the audited Google binding/credential
  state. Never merge or move a provider subject manually without an approved
  recovery procedure.
- Prisma reports an unknown account-security field: regenerate Prisma Client
  from the migrated schema and restart the exact backend process.
- A checker refuses to start: verify it targets `NODE_ENV=test`,
  `DEPLOY_ENV=test`, local MySQL/Redis, and database name `needo_test`. Do not
  weaken the guard or point it at `needo_dev` to make the check pass.
