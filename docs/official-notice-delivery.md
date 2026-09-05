# Official notice delivery — backend recovery

This Step 13 slice restores the existing platform notice API on top of the applied
`20260902143000_official_notice_delivery` tables and the recovered Prisma models.
It does not apply a migration or restore the announcement pages.

## Ownership and API

The operations route manifest owns the following `/api/v1` management routes;
the merchant API rejects this namespace with 404. The compatibility backend
retains its existing combined manifest.

- `GET /backoffice/official-notices`: paginated list, read permission.
- `POST /backoffice/official-notices`: immediate or scheduled publication,
  both create and send permissions.
- `POST /backoffice/official-notices/{publicId}/cancel`: pre-dispatch cancellation,
  review permission, expected version and idempotency key.
- `POST /backoffice/official-notices/{publicId}/archive`: terminal archival,
  review permission, expected version and idempotency key.
- `POST /backoffice/official-notices/{publicId}/retry-failures`: retry failed
  recipients only, send permission, expected version and idempotency key.

Authenticated shared routes `GET /official-notices` and
`POST /official-notices/{publicId}/read` resolve the current identity from the
verified session, never from caller-supplied recipient IDs. They require no
platform publishing permission. All route contracts are registered in OpenAPI.

## Persistence and delivery

Publication creates the notice, five locale records, immutable audience snapshots,
queued delivery rows and an audit record in one transaction. Locale records are
source copies marked `isInitialCopy`; this is **not automatic translation**.
Audience reads/inserts use 500-row chunks; each delivery pass handles at most
250 recipients. No browser business state is a source of truth.

Delivery locks the notice before the receipt and before any consistent read,
then inserts Notification and updates NoticeDelivery atomically. Finalization
uses the same notice lock as manual retries. Duplicate workers cannot create
duplicate notifications, and committed receipts remain visible during retries.
Recoverable failures wait 60 seconds, up to the configured attempt limit.
The worker revisits both due deliveries and interrupted finalization; future
retries do not occupy the due batch. Logged delivery/failure totals summarize
the selected notices, not exclusively new deliveries in that pass.

Read commands through either the dedicated notice inbox or the existing
notification center synchronize both tables transactionally. A bulk inbox read
has an aggregate audit entry; single reads have a per-notice entry. Ordinary
login/session rules are unchanged by this slice.

Client, ops and merchant runtimes use the existing Redis realtime bus; events
are emitted only after delivery commits. Pub/Sub is a best-effort refresh hint,
not a durable event replay system: REST inbox reload/reconnection remains the
recovery mechanism. Deployments must use the same realtime channel and Redis
server; different logical Redis DBs do not isolate Pub/Sub channels.

## Local acceptance

From `backend/`, supply a complete local non-production environment:

```bash
AUTH_TOKEN_AUDIENCE=needo-backend ENV_FILE=/absolute/path/to/backend/.env.dev npm run check:official-notice-flow
```

The checker rejects remote/production-looking databases. Its main fixture adds
502 temporary identities to an existing test user inside one rollback transaction,
exercises real snapshot/delivery/read/cancel operations and independently verifies
cleanup. A second fixture schedules one uniquely marked notice to an existing
test account, uses two independent MySQL transactions synchronized at their first
lock to exercise concurrent dispatch, then deletes only that notice's captured
records and verifies zero residue. It does not send external messages or publish
events to the running realtime bus. SQL auto-increment gaps are normal after tests.

This proves repository/database behavior, not logged-in browser acceptance,
cross-process SSE reception, real-user publication or online deployment.

## Still pending in the overall task

- Immutable platform/shop issuer scope and merchant-only membership-card,
  employee and technician audiences; merchant publication API/RBAC.
- Restore the approved operations UI and shared merchant notification surfaces.
- Real browser multi-portal login/logout acceptance.
- Operations-to-user/technician/merchant delivery and read reception acceptance.
- Same-shop database/API/page parity and update propagation acceptance.

Draft editing and a separate approval workflow are not enabled by the immediate/
scheduled publication endpoint; schema statuses alone must not be presented as
completed product capabilities. GitHub upload and deployment are outside this run.
