# Formal Runtime Data Boundary

> Refreshed 2026-08-28. The normal NeeDo runtime is formal-only. It must not read browser demo datasets, use shared demo credentials, approve QR login in the client, or present local mutations as persisted business results.

## Active rule

- Production UI reads `/api/v1/*` with an authenticated session and RBAC scope.
- Persisted test scenarios use explicit non-production test accounts and the real Prisma/MySQL path.
- Test-account and formal-test-data seeds require explicit local/test flags and are rejected in production.
- When a server contract is missing, the route keeps its stable entry and renders an unavailable/empty state. It does not generate substitute customers, orders, schedules, messages, metrics, or settlements.
- Browser storage is limited to UI preferences and non-authoritative drafts. It is not a business database.

## Retired sources

The following legacy runtime sources have been deleted:

- `src/data/mock.ts`
- `src/auth/demoAccount.ts`
- `src/data/demoAppointmentSeeds.ts`
- `src/features/im/api.ts`, `seed.ts`, and `account-sync.ts`
- `src/features/business-cps/model.ts` and its local calculation runtime
- `src/features/shop-member/*` local member/ledger runtime
- `src/lib/detailProfiles.ts`
- `src/lib/needoExchangeBridge.ts`
- `src/components/mobile/MobileMessageCenter.tsx`

Large local-only member, analytics, social, scheduling, checkout, CPS, IM, and profile datasets were removed or replaced by formal API capability gates. Legacy storage keys are no longer used for business truth; stores that remain for UI compatibility start empty and cannot create a successful local business mutation.

## Formal seed boundary

- `ALLOW_TEST_LOGIN=true` permits required test-account provisioning only in `local` or `test` deployments.
- `ALLOW_FORMAL_TEST_SEED=true` permits persisted category, shop, technician, service, and related read data only in `local` or `test` deployments.
- Both paths use the formal schema, transactions, uniqueness constraints, password hashing, public-ID allocator, and rollback behavior.
- Production rejects these flags. There is no production fallback account.

## Identity acceptance

- A normal account owns one ten-digit `accountNo`; enabled login identities use `u/s/b/o` plus those digits.
- Company-assigned accounts use `needo` plus ten digits and do not receive an additional `u` public ID.
- Login by email, phone, digits-only account number, `u...`, or `needo...` enters the customer portal; `s...`, `b...`, and `o...` select those active identities.
- Shop and owner entities retain their own persisted `shopNo` and `ownerNo`; customer-visible IDs are never derived from an internal numeric row ID.
- ID allocation is server-side, collision-bounded, transactional, and rolls back the entire account/entity creation when exhausted.

## Guardrails

`src/data/mockRetirement.test.ts` fails if deleted sources return, production code imports the old central dataset, or known legacy IDs/credentials/client-approved QR tokens are reintroduced. Formal production build auditing remains required before release.

Generated images are presentation assets, not records. Unit-test fixtures may remain inside test files but cannot be imported by production code or used as an API fallback.
