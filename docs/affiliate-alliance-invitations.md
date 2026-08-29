# Affiliate Alliance Invitations

This microstep extends the [Affiliate alliance foundation](./affiliate-alliance-foundation.md) with real owner-to-Affiliate invitations. It follows the accepted [design](./superpowers/specs/2026-08-28-affiliate-alliance-invitations-design.md) and [implementation plan](./superpowers/plans/2026-08-28-affiliate-alliance-invitations.md).

## Formal behavior

- Only an active NeeDo Affiliate identity can participate. eKYC is not required to join or create an alliance; the existing withdrawal boundary still requires completed eKYC and a same-name bank account.
- Only an active alliance owner can list members, find eligible contacts, and send invitations.
- A candidate must be an active Affiliate, must be a non-blocked reciprocal contact of the owner, must not already have an active alliance membership, and must not have another pending invitation from the same alliance.
- Invitations can assign `partner` or `subordinate`. A subordinate requires an active owner/partner parent from the same alliance; a partner cannot have a proposed parent.
- Each invitation expires exactly 72 hours after creation. Accept/reject checks the boundary transactionally, while the background worker expires abandoned invitations in bounded batches.
- Acceptance revalidates identity, reciprocal contact, owner/alliance state, parent, and membership. It creates one active member and one permission row with all five permissions `false` in the same transaction as the invitation transition and audit.
- The unique active membership key allows exactly one alliance membership even when invitations from two alliances are accepted concurrently.

## API and RBAC

All endpoints use the `/api/v1` prefix, JWT authentication, Zod validation, standard envelopes, and paginated `list/total/page/page_size` responses.

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/affiliate/alliances/me/members` | `affiliate-alliance:members:list` |
| GET | `/affiliate/alliances/me/eligible-contacts` | `affiliate-alliance:candidates:list` |
| GET | `/affiliate/alliances/me/invitations` | `affiliate-alliance:invitations:list` |
| POST | `/affiliate/alliances/me/invitations` | `button:affiliate-alliance-invite` |
| GET | `/affiliate/alliance-invitations/mine` | `affiliate-alliance:invitations:list` |
| POST | `/affiliate/alliance-invitations/:id/accept` | `button:affiliate-alliance-invitation-respond` |
| POST | `/affiliate/alliance-invitations/:id/reject` | `button:affiliate-alliance-invitation-respond` |

The five permissions are assigned only to the `admin` and activated `scout` roles by migration. Controller responses expose public NeeDoID, display name, and avatar only; internal user/identity IDs, email, phone, eKYC, and bank fields are excluded.

## Runtime configuration

The expiry worker starts with the formal backend and runs immediately, then at the configured interval:

```text
AFFILIATE_ALLIANCE_INVITATION_EXPIRY_INTERVAL_MS=300000
AFFILIATE_ALLIANCE_INVITATION_EXPIRY_BATCH_SIZE=100
```

The interval cannot be below 60 seconds and the batch size cannot exceed 500.

Stable domain errors are:

- `error.affiliate_alliance.identity_required`
- `error.affiliate_alliance.profile_inactive`
- `error.affiliate_alliance.owner_required`
- `error.affiliate_alliance.invitee_not_eligible`
- `error.affiliate_alliance.mutual_contact_required`
- `error.affiliate_alliance.invitation_duplicate`
- `error.affiliate_alliance.invitation_not_found`
- `error.affiliate_alliance.invitation_expired`
- `error.affiliate_alliance.invitation_state_conflict`
- `error.affiliate_alliance.parent_invalid`
- `error.affiliate_alliance.already_joined`

## Local real-database acceptance

The checker requires an explicit `ENV_FILE`, rejects remote/staging/production targets, prints a credential-free target summary, captures all marker-owned IDs before cleanup, and fails unless users, contacts, identities, profiles, alliances, members, permissions, invitations, wallets, ledgers, and audits are removed exactly.

```bash
cd backend
ENV_FILE=.env.dev npm run prisma:migrate:deploy
ENV_FILE=.env.dev npm run check:affiliate-alliance-invitation-flow
```

On 2026-08-28, the migration and all nine checker assertions passed against the local `mysql://127.0.0.1:3307/needo_dev` target. The checker proved eligibility filtering, both invitation roles, duplicate rejection, rejection without membership, the exact 72-hour boundary, least-privilege acceptance/audit, cross-alliance concurrent acceptance, fresh-process persistence, and exact cleanup. Exit status was `0` and no marker residue remained.

## Rollback and exclusions

Application rollback can stop the worker and remove the seven route registrations without deleting persisted invitation history. Database rollback must be a separately reviewed additive migration; the applied migration must not be edited in an environment where it has already succeeded.

This slice does not add member removal, ownership transfer, permission editing, commission override editing, alliance-wallet transfer/withdrawal, task allocation by hierarchy, operations-admin alliance monitoring, exports, or aggregate performance metrics. Those remain separate formal microsteps. Passing the checker is not evidence of public deployment.
