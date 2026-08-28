# Affiliate Alliance Foundation Acceptance

## Status and boundary

This micro-step delivers the first formal Affiliate alliance vertical slice. An activated Affiliate can create one alliance, becomes its owner, receives the complete owner permission set and a separate zero-balance alliance NDP wallet, and can reload the same aggregate through the formal API and `/afirieito/organization`.

This is not the completion claim for the whole Affiliate product. Invitations, partner relationships, member hierarchy mutations, owner transfer, wallet transfer, merchant task audiences, fee/settlement allocation, rankings, merchant monitoring, and operations-admin controls are intentionally outside this slice. The existing `/afirieito`, plan, and data capability-gate pages also remain for later formal API slices.

## Formal contract

- Identity: the current active Affiliate identity uses the same canonical User and immutable `needoId`; no second user/public account is created.
- Creation eligibility: an active Affiliate profile is required. eKYC and a bank account are not required to create an alliance.
- Withdrawal boundary: eKYC and a verified same-name bank account remain withdrawal requirements and are not weakened here.
- Membership: one active alliance membership per user globally, enforced with the nullable unique key `user:<userId>`.
- Owner: role `OWNER`, no parent, all five permissions enabled.
- Wallet: `ownerType=ALLIANCE`, `ownerId=AffiliateAlliance.id`, `currency=NDP`, available/frozen balances both exactly zero on creation.
- Audit: one `affiliate_alliance.created` record per successful creation.
- Public data: the API returns `needoId`, display name, and avatar only; internal `userId`, `identityId`, and `scout` names are not exposed.

## Database and API

Local development database `needo_dev` has these deployed migrations:

- `20260828203000_affiliate_alliance_foundation`
- `20260828204500_affiliate_alliance_permissions`

Formal endpoints:

- `GET /api/v1/affiliate/alliances/me`
- `POST /api/v1/affiliate/alliances`

Permission matrix:

| Operation | Permission | Active Affiliate identity | Any other current identity |
| --- | --- | ---: | ---: |
| Read current alliance | `page:affiliate-alliance` | Allowed | Forbidden |
| Create alliance | `button:affiliate-alliance-create` | Allowed | Forbidden |

These are current-user (`/me`) endpoints, so permission grants never bypass the active Affiliate-identity requirement. An administrator can use them only after switching the same account into its active Affiliate identity; platform-wide administration requires a separate target-user operations endpoint in a later slice.

Both endpoints require JWT authentication. The POST body is strict Zod data: name, optional description, and integer `defaultPromoterShareBps` from 0 through 10000. Repeated or concurrent membership creation returns stable 409 `error.affiliate_alliance.already_joined`.

## Automated evidence

Backend safety and build gates:

```text
npm run prisma:generate                         PASS
npx prisma validate                             PASS
npm run lint                                    PASS
npm run build                                   PASS
11 focused Jest suites / 76 tests               PASS
```

Frontend gates:

```text
4 focused Vitest files / 48 tests               PASS
npm run build                                   PASS
```

The page tests explicitly assert API-only persistence, percent-to-BPS conversion, 409 reload recovery, permission failures, the five owner permissions, separate 0/0 wallet data, absence of invitation/transfer/fabricated metrics, and no alliance `Storage.setItem` fallback.

Real MySQL checker:

```text
ENV_FILE=/absolute/local/path/.env.dev npm run check:affiliate-alliance-foundation-flow

PASS non-activated account was rejected before alliance repository access
PASS one concurrent create persisted one complete alliance foundation
PASS same needoId, no eKYC, no bank, zero alliance wallet, and audit verified
PASS fresh service reloaded the MySQL-backed alliance
PASS marker-owned alliance foundation rows were removed exactly
```

The checker requires an explicit environment file and rejects production/staging flags, remote MySQL hosts, and production-looking database names. It races two real service/repository transactions: exactly one succeeds and one returns 409. It then verifies one alliance, one owner membership, one all-true permission row, one `ALLIANCE` wallet at 0/0, one audit, zero eKYC rows, and zero bank rows. Cleanup operates on captured marker IDs in dependency order and verifies zero marker residue.

## Browser acceptance

Formal local runtime was accepted with:

- MySQL `127.0.0.1:3307` listening.
- Redis `127.0.0.1:6379` listening.
- Backend `127.0.0.1:3000` health `ok` and readiness `ready`, with database and Redis both `ok`.
- Frontend `127.0.0.1:5180` and `/api/v1/health` proxy both HTTP 200.

Using a controlled, activated Affiliate browser-QA account with no eKYC and no bank account:

1. The empty alliance page loaded from `GET /affiliate/alliances/me`.
2. The page created `NeeDo 东京创作者联盟` with promoter share 82.5% / alliance share 17.5%.
3. Direct MySQL inspection confirmed 8250 BPS, one owner membership, all five permissions, one audit, and a separate wallet at 0/0; eKYC and bank counts stayed zero.
4. Page refresh and a full backend/frontend restart reloaded the same alliance from MySQL with the same canonical `needoId`.
5. Chinese, English, and Japanese rendering was accepted: `联盟营销` / `Affiliate` / `アフィリエイト` and `联盟` / `Alliance` / `アライアンス`.
6. The 390×844 viewport had no horizontal overflow. The owner permission card and alliance wallet were visually inspected through the complete scroll range.
7. Browser console error count was zero.

The browser-QA alliance is intentionally retained on the dedicated local formal test account as reload/restart evidence. The guarded checker uses separate marker users and always removes them.

## Next micro-step

The next safe alliance slice is candidate discovery from bidirectional NeeDo friends plus invitation create/accept/reject. It must preserve the current aggregate and active-membership constraint; it must not introduce transfer, settlement, merchant fee, or ranking behavior early.
