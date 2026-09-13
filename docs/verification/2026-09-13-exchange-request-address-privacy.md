# Exchange Request address privacy repair

## Scope

This local-only repair closes the Request detail leak where `addressLine1` was copied into
the public `areaLabel` and returned to every authenticated merchant or technician before
matching. It does not alter Booking, payment, telephone, email, or remote data.

## Authoritative rule

- Before matching, the Exchange post API returns only a recognised Japanese administrative
  service area. All exact address lines are `null`, and historical address-public flags are
  projected as `false`.
- The publisher keeps access to every stored address line.
- After the Request and its matching aggregate are both `MATCHED`, only an exact active
  `ExchangeMatchParticipant.participantIdentityId` receives every stored address line.
- Claims, shared users, shop affiliation, broker/scout/introduction relations, or another
  identity on the same account do not grant address access.
- Phone and email remain outside the Exchange post DTO.
- New publication requests cannot set the historical `addressLine2Public` or
  `addressLine3Public` switches to `true`; the composer no longer exposes those controls.

Unrecognised legacy address formats fail closed to `—` instead of returning a potentially
precise value. No database migration is required because the repair changes validation and
read projection while preserving the stored address needed by the publisher and later
matched participants.

## Verification

Regression coverage is split across the domain projection, Repository relation/status
filter, Service defence-in-depth projection, authenticated direct API route, and frontend
detail/composer tests. The direct API test signs in as independent technician and merchant
users and asserts that the complete address does not occur anywhere in the JSON response.

Local verification commands:

```bash
npm --prefix backend test -- --runInBand exchange
npm --prefix backend run lint
npm --prefix backend run build
npm test -- --run src/features/exchange src/pages/mobile/NeedoExchangePage.test.tsx
npm run lint
npm run build
```

The branch runtime is additionally checked on isolated ports: frontend `5190`, backend
`3015`, operations API `3016`, and merchant API `3017`. The unauthenticated direct list and
detail routes must return `40105`; the rendered Request composer must expose no exact-address
public switches and must state that filled address lines become visible only after matching.
