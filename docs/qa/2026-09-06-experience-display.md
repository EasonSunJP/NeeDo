# Backoffice EXP display correction

Scope: Step 12, managed-user read contract and presentation. No migration or historical experience mutation.

## Cause and change

The existing user experience summary and entry endpoints return exact decimal EXP strings. The managed-user endpoints exposed only `totalExpUnits`, and both the directory and membership detail labelled that storage counter as EXP. This displayed quantities 10,000 times larger than the amounts used by the existing experience service.

The managed-user response now includes `experience.totalExp`, produced by the same BigInt-based formatting function used for `/me/experience` and experience entries. The function is shared in the domain layer and preserves four decimal places, negative reversal amounts and balances above JavaScript's safe integer range. The legacy `totalExpUnits` response field is deprecated and retained for older clients; the frontend type/decoder drops it and requires a valid decimal EXP amount. Both visible locations render `totalExp` directly, with no frontend division or rounding.

This is a display/API correction. It neither asserts that the user approved the historical storage-precision suggestion nor converts the stored balances to DECIMAL. Existing event values, membership multiplier snapshots, level thresholds and award/refund logic remain unchanged. Migrating the storage representation is a separate optional implementation change, not required to present correct EXP.

## Read-only local evidence

Prisma read the two screenshot accounts and aggregated their nondeleted experience entries:

- `u4083532147`: four `MEMBER_SIGN_IN` entries, total 4 EXP, stored/resolved Lv.1.
- `needo0000000001`: five `MEMBER_SIGN_IN` entries totaling 5 EXP and five `SERVICE_COMPLETED` entries totaling 50 EXP; total 55 EXP, stored/resolved Lv.4.

The aggregates reconcile with the account totals. No account, entry, membership or ledger row was changed.

## Verification

- Failing assertions first reproduced the missing backend `totalExp` and both frontend display failures.
- Frontend: 3 files / 40 tests passed. The decoder accepts precise EXP in both portal scopes, ignores legacy counters and rejects missing/malformed values instead of treating them as zero or raw EXP.
- Backend: repository/domain/service 35 tests passed; API/OpenAPI 6 tests passed. Boundaries include 4, 4.9999, 5 and 55 EXP, Lv.100, fractional reversals and a balance above the safe-integer range.
- Frontend formal build, backend build, targeted backend ESLint and `git diff --check` passed. Existing Vite mixed-import and large-bundle warnings remain.
- Frontend port 5180 runs from the main worktree `.worktrees/dashboard-remaining-acceptance`; Vite was restarted with its public proxy configuration preserved because the existing watcher excludes worktrees.
- Authenticated browser confirmation is pending: both available operations tabs had returned to the login page. The user was asked to log in again; no credentials or sessions were fabricated.

Local main integration only. No push or deployment.
