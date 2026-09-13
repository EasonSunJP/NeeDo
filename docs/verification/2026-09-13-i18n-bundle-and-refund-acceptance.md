# i18n bundle and refund acceptance

## Scope

This local release batch keeps the formal refund-dispute API and authorization contract unchanged while reducing the shared i18n artifact. Authentication and platform-review translations now live in feature-owned modules and retain the existing synchronous translation lookup behavior.

## Bundle result

- Baseline shared i18n artifact: `3,725,139` bytes.
- Optimized shared i18n artifact: `3,695,673` bytes.
- Extracted authentication artifact: `25,029` bytes.
- Extracted platform-review artifact: `4,680` bytes.
- The i18n release budget is restored from `3,725,800` to `3,708,400` bytes. A boundary regression test accepts exactly the budget and rejects one byte above it.
- The production bundle audit still covers all eight HTML entries, runtime-marker checks, source maps, non-runtime files, and asset references.

The two repository i18n audit scripts load the feature-owned translation modules explicitly. This keeps quality and source-coverage reporting complete after the split rather than silently omitting the extracted entries.

## Local formal-account and refund proof

The acceptance runtime was confirmed local before any write: MySQL `127.0.0.1:3307/needo_dev`, Redis `localhost:6379`, and NeeDo APIs on `127.0.0.1:3000-3002`.

- The formal login checker passed for the administrator, operator, merchant, affiliate, technician, and customer test accounts. Each account completed login, `/auth/me`, permission loading, and its expected portal check.
- The formal refund checker passed merchant approval, merchant rejection, both complaint outcomes, customer-receipt enforcement, idempotent replay, stale-version conflict, and cross-shop hiding.
- The same checker proved that settled affiliate rewards and claimant wallet balances are preserved and that no affiliate reversal or recovery ledger transaction is created.
- The checker removed all marker-owned cases, disputes, events, orders, rewards, ledger transactions, and wallets, and reported `cleanup-complete: true`.

No schema, migration, API, RBAC, audit-event, or financial-state-machine contract changed in this batch.
