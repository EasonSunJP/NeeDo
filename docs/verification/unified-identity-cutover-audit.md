# Unified Identity Cutover Read-only Audit

This verification step inventories the legacy identifier and account-owned data that must be mapped before the approved U/NEEDO/S/B/O cutover. It does not allocate identifiers, migrate relations, or modify database rows.

## Safety contract

- The database client surface exposed to the audit contains only `count`, `findMany`, and `groupBy` reads.
- The command refuses to run unless `--dry-run` is present.
- Message metadata is read in batches of 500 to avoid an unbounded in-memory load.
- The report contains aggregate counts only; it does not print email, phone, password, token, message content, or user identifiers.
- A successful report always contains `"mode": "read_only"` and `"mutatedRows": 0`.

## Commands

From `backend/`:

```bash
npm test -- tests/unified-identity-cutover-audit.test.ts
npm run audit:unified-identity -- --dry-run
```

The audit uses `backend/.env.dev`, matching the formal local backend. The JSON report is printed first, followed by a Markdown summary. Redirect output only when a retained local report is explicitly required; reports may reveal aggregate production volumes.

## Required coverage

The report must include these current ownership surfaces:

- `User`, `UserIdentity`, `CustomerProfile`, and `TechnicianProfile`;
- `Shop` and `MerchantAccount`;
- `Contact`, `FriendRequest`, `ConversationParticipant`, and `Message`;
- `SocialPost`, `Follow`, and `Notification`;
- `BookingOrder`, `Wallet`, and `LedgerTransaction`.

`unresolvedOwnership` is intentionally conservative. A relation remains unresolved when the old row records only a `userId` and therefore cannot prove which public identity was active when the row was created. A target hint is not permission to migrate that row automatically.

## Acceptance evidence

Verified against the formal local database configured by `backend/.env.dev` on 2026-08-28 03:36 JST:

```text
command: npm run audit:unified-identity -- --dry-run
exit code: 0
mode: read_only
mutatedRows: 0
legacy User.needoId rows: 247
frontend systemId references: 123
persisted message identifier snapshots: 0
```

Key real-data ownership counts from the same run:

| Surface                             |           Rows |
| ----------------------------------- | -------------: |
| User / UserIdentity                 |      247 / 488 |
| CustomerProfile / TechnicianProfile |      217 / 133 |
| Shop / MerchantAccount              |         20 / 2 |
| Contact / FriendRequest             |        466 / 0 |
| ConversationParticipant / Message   |    466 / 1,069 |
| SocialPost / Follow                 | 51,812 / 7,910 |
| Notification / BookingOrder         |  1,957 / 1,959 |
| Wallet / LedgerTransaction          |      106 / 103 |

The audit classified 105 `USER` wallets as identity-context-required. No migration was run and no identifier, relation, profile, message, order, wallet, or ledger row was changed.
