# Operations System Settings Design

**Date:** 2026-09-06

**Stage:** Step 12 backoffice formal-data microstep

**Scope:** Operations system settings only. Role-member lists and permission-tree reconciliation remain separate follow-up microsteps.

## 1. Goal

Replace the incorrect operations navigation that sends “系统设置” to the role-management page with a dedicated, production-grade system-settings workspace. The workspace must persist and enforce platform configuration through formal APIs, Prisma/MySQL, RBAC, optimistic concurrency, audit logs, and public projections. It must not add browser mocks, fake provider integrations, plaintext secrets, or editable controls for unavailable capabilities.

The same microstep also restyles the existing NDP exchange-rate page so it follows the operations UI system without changing its versioned financial contract.

## 2. Confirmed product rules

### 2.1 Site and registration

- The site switch controls the customer, technician, merchant, and Affiliate portals and their ordinary business APIs.
- When the site is closed, operations login, operations system settings, readiness/health endpoints, and the minimum endpoints required to restore service remain available.
- Existing non-operations sessions receive a stable maintenance response while the site is closed.
- The registration switch controls public self-registration only.
- Closing self-registration rejects new email registrations and first-time Google registrations at the backend as well as hiding their frontend entry points.
- Existing-account password login, existing-account Google login, Google account linking, and RBAC-protected operations account creation remain available while public registration is closed.

### 2.2 Login methods and email verification

- Google is the only additional login method in this microstep with an existing formal flow.
- Apple, LINE, and other future providers appear only as disabled project entries. They have no API calls and cannot be enabled.
- Password-login email verification has a master switch.
- When the master switch is off, a valid password can proceed directly to normal session issuance.
- When the master switch is on, one time-based rule is selected: first login, first login of each calendar month, or every login.
- “New IP address” is an independent condition that can be combined with any time-based rule.
- When either the selected time rule or the enabled new-IP rule requires verification, the backend sends a code to the account login email and the login page enters a code-input step. Access and refresh tokens are issued only after successful verification.
- Google’s existing first-use/linking verification cannot be bypassed by disabling password-login verification.
- Challenges are expiring, single-use, rate-limited, and do not expose whether an account exists.
- Calendar-month evaluation uses Asia/Tokyo. IP comparison uses the server-resolved request IP and stores only the minimum auditable representation required by the existing login-security model.

### 2.3 Media-controlled branding

- The operations user can upload and select the image displayed as the login-page LOGO and the image displayed by the central Request button in the customer primary navigation.
- Uploads reuse the formal content-media endpoint and `MediaAsset` storage. Platform configuration stores media relations rather than temporary file paths or base64 content.
- A newly uploaded asset does not replace the active asset until the platform-setting version is saved successfully.
- Public projections expose only the active media URL and safe display metadata.

### 2.4 Legal documents

- The initial catalog contains NeeDo terms of use, privacy policy, merchant onboarding agreement, and Affiliate activation agreement.
- Cancellation rules, NDP rules, posting guidelines, provider guidelines, store-onboarding rules, advertising/Boost rules, and other future documents may have catalog entries but remain disabled until an operations user supplies and publishes formal text.
- Operations can create a document, set its display title, internal link path, display locations, and enabled state.
- Display links must be normalized same-origin application paths. Arbitrary external URLs are rejected.
- Every document provides quick language switches for simplified Chinese, traditional Chinese, Japanese, English, and Korean.
- Each document-language pair has an independently editable draft and independently published version.
- Publishing records a monotonically increasing version, publication date, content hash, actor, and immutable published text.
- Saving a draft never changes the public document.
- Public legal pages read the current published version in the requested language. A missing language is reported as unavailable and is not silently replaced with another language.
- Merchant and Affiliate agreement acceptance continues to persist the accepted version, text snapshot, content hash, language, session evidence, and receipt.

### 2.5 IM server retention

- Operations can enter the server retention period in whole days for IM messages and IM media.
- Defaults are 30 days for messages and 3 days for media.
- Saving creates a new `ImPolicy` version. It does not rewrite expiry times for existing content.
- New messages and media snapshot the active policy at send time and receive their server expiry from that snapshot.
- Server expiry does not delete chat records or cached media already stored on a user’s device.
- After server expiry, a different device cannot refetch removed server content. The client must render the existing unavailable/expired state rather than inventing content.

### 2.6 Payment methods

- Offline payment means payment received outside NeeDo and confirmed by onsite personnel, a technician, or the shop through the existing authorized confirmation flow.
- NDP payment uses the formal wallet and ledger flow.
- Offline and NDP availability are server-authoritative platform switches. A disabled method is removed from frontend choices and rejected by the backend.
- PayPay and PayPal are external-payment projects that must eventually launch provider checkout and complete verified callbacks. They are not manual “other payment” methods.
- PayPay, PayPal, and Stripe are shown as unconfigured project entries in this microstep. They are disabled, cannot be enabled, and make no provider API calls.
- No provider credentials are persisted in platform settings. Future secrets must come from deployment configuration or a secret manager; an operations page may expose only configured/unconfigured state and redacted identifiers.

## 3. Architecture

Use typed domain persistence rather than a generic key-value table.

### 3.1 Versioned platform settings

A versioned platform-settings aggregate owns:

- site availability;
- public self-registration availability;
- active login LOGO media reference;
- active Request-button media reference;
- Google login availability;
- password-login email-verification master switch;
- password-login time rule;
- password-login new-IP condition;
- offline-payment availability; and
- NDP-payment availability.

Each successful update creates and activates one complete immutable version in a transaction. It validates referenced media, advances the version monotonically, records the actor, and writes an audit entry. Reads return one coherent snapshot so login and checkout decisions never mix fields from different saves.

The backend exposes a safe public projection for login and portal bootstrapping and a full operations projection for authorized editing. The public projection contains no actor IDs, internal database IDs, audit metadata, provider secrets, or unpublished legal content.

### 3.2 Legal catalog and releases

Use a document catalog aggregate plus language-specific draft/release records. Catalog metadata and published content have separate optimistic-lock versions. Published releases are immutable. A document can be publicly displayed only when it is enabled and the requested language has a current release.

The existing static terms/privacy content and in-code merchant/Affiliate contract definitions are migration inputs. They become initial published releases with stable slugs and hashes. Acceptance services resolve current merchant/Affiliate contracts from the persisted catalog while retaining their existing acceptance snapshot contract.

### 3.3 IM policy reuse

Extend the existing `ImPolicy` repository/service boundary instead of introducing a second retention system. The operations API accepts days and converts them to validated seconds at the service boundary. The active policy continues to be the source used by message-send persistence and server-expiry workers.

The UI presents one “IM媒体” setting while persistence applies the value consistently to supported image/video/media retention fields.

### 3.4 Media reuse

Reuse `POST /api/v1/backoffice/content/media` for JPEG, PNG, and WebP uploads. Settings write authorization and media-upload authorization remain separate permissions. A user may upload an asset without being able to activate it, or update non-media settings without receiving media-upload permission.

## 4. API design

All success and failure envelopes follow the existing `/api/v1` contract. All write bodies are strict Zod schemas. Operations list endpoints are paginated.

### 4.1 Public reads

- `GET /api/v1/platform/settings/public` returns maintenance state, self-registration state, enabled login methods, active LOGO/Request media projections, and enabled payment methods.
- `GET /api/v1/legal-documents/:slug/current?locale=...` returns one enabled, currently published language release or a stable unavailable/not-found error.

### 4.2 Operations settings

- `GET /api/v1/backoffice/system-settings` returns the current typed settings projection, configured capability states, and current version.
- `PUT /api/v1/backoffice/system-settings/basic` creates a new complete settings version from validated basic-setting changes and `expectedVersion`.
- `PUT /api/v1/backoffice/system-settings/payment` creates a new complete settings version from supported payment-setting changes and `expectedVersion`.
- `GET /api/v1/backoffice/system-settings/im-retention` returns the current IM retention policy expressed in days and its version.
- `PUT /api/v1/backoffice/system-settings/im-retention` creates a new IM policy version from whole-day values and `expectedVersion`.

Basic and payment updates preserve fields owned by the other section from the exact expected version. A stale expected version fails with HTTP 409 and creates no partial version.

### 4.3 Operations legal documents

- `GET /api/v1/backoffice/legal-documents` lists document catalog entries with pagination and filters.
- `POST /api/v1/backoffice/legal-documents` creates catalog metadata without publishing text.
- `PATCH /api/v1/backoffice/legal-documents/:publicId` updates title, internal path, display locations, enabled state, and metadata lock version.
- `GET /api/v1/backoffice/legal-documents/:publicId/locales/:locale` returns the language draft, current release, version history summary, and lock versions.
- `PUT /api/v1/backoffice/legal-documents/:publicId/locales/:locale/draft` saves language text and metadata without changing the public release.
- `POST /api/v1/backoffice/legal-documents/:publicId/locales/:locale/publish` publishes the exact expected draft as a new immutable version with publication date.
- `GET /api/v1/backoffice/legal-documents/:publicId/locales/:locale/releases` returns paginated immutable release history.

### 4.4 Permissions and audit

Introduce narrowly scoped permissions for:

- system-settings read;
- system-settings write;
- system-brand-media activation;
- IM-retention read/write;
- legal-document read/write/publish; and
- payment-settings read/write.

Media upload retains its existing separate permission. Every successful write and publication records the action, target, version transition, request context, and changed field names without logging legal drafts, OTPs, tokens, credentials, or full media bytes.

## 5. Enforcement and data flow

### 5.1 Site maintenance

The backend resolves the active settings snapshot through a bounded cache with explicit invalidation after a successful settings update. Maintenance enforcement is server-side. It allows operations recovery, health/readiness, and required static/public maintenance projections while returning a stable 503 application error for ordinary portal and business operations.

The frontend reads the same public projection during portal bootstrap and renders the formal maintenance screen. Frontend rendering is explanatory; backend enforcement is authoritative.

### 5.2 Registration

Email registration and first-time Google registration check the active self-registration setting immediately before any new user transaction. Existing-user login/link paths are distinguished from account creation. Operations user creation does not use the public-registration gate.

### 5.3 Password login verification

After password verification and before session issuance, the auth service resolves the active login-verification policy and the account’s successful-login evidence. If verification is required it returns a non-session challenge response, sends the code to the verified login email, and accepts the code through a dedicated completion endpoint. Only completion can issue the access/refresh-token pair.

Successful verification writes login evidence for time-rule and IP evaluation. Failed, expired, reused, or rate-limited challenges issue no tokens. Existing login failure throttling remains in force.

### 5.4 Branding

Login and customer navigation surfaces consume active media URLs from the public settings projection. They retain bundled fallback assets only when no active media has ever been configured or the public projection is unavailable before first bootstrap; they never infer an uploaded file path.

### 5.5 Payments

Checkout projections return only enabled, formally supported payment methods. Selection and payment commands resolve the same settings snapshot before writing. Offline confirmation is accepted only for the offline method; NDP payment is accepted only for NDP. Provider-project entries never appear in the selectable checkout contract.

## 6. Operations UI

Create `/admin/settings/system` and point the “系统设置” navigation item to it. Do not reuse `RolesPage` and do not interpret a query parameter as a settings mode.

The page uses the current operations shell, spacing, border, typography, form, focus, badge, and responsive conventions. It does not introduce a separate visual theme.

### 6.1 Tabs

The top-level tabs are:

1. 基础设置
2. 政策和协议
3. 储存设置
4. 支付设置

The selected tab is represented in the URL query so refresh and shared links retain context. Tabs are keyboard accessible and collapse to a horizontal scroll region on narrow screens.

### 6.2 Basic settings

Group controls into site access, registration/login, login verification, and brand assets. Show compact current-state badges and explicit impact descriptions. The verification time rule is a radio group; new-IP verification is a separate checkbox disabled when the master switch is off.

LOGO and Request media controls show the active image, pending selection, required format/size guidance, replace action, and unsaved state. A restrained preview rail displays a login-logo preview and customer-navigation Request-button preview using the same aspect-ratio rules as their real consumers.

### 6.3 Policies and agreements

Use a document list alongside a focused editor on desktop and a document selector above the editor on narrow screens. The editor provides five language buttons, catalog metadata, draft/published status, current version, publication date, internal link, display locations, open-related-page action, save-draft action, and separately permission-gated publish action.

An entry without published content shows “未发布” and cannot be enabled for public display. The new-document flow creates only catalog metadata; publication remains a separate deliberate action.

### 6.4 Storage settings

Show two numeric setting cards: IM messages and IM media. Each accepts a positive whole number of days and displays the corresponding server-expiry behavior, default, current policy version, and a notice that existing content and device-local records/cache are unaffected.

### 6.5 Payment settings

Show a capability list with provider type and operational state. Offline and NDP rows have permission-gated switches. PayPay, PayPal, and Stripe show “项目未配置” with disabled controls and concise formal integration requirements. No click target suggests that an unavailable provider can process payment.

### 6.6 NDP exchange-rate visual alignment

Keep `/admin/settings/ndp-exchange-rate`, its data adapter, optimistic locking, idempotency, and history contract. Restyle its module header, current/scheduled summaries, editor, version history, error states, empty states, spacing, and narrow-screen behavior using the same operations design primitives as the new settings page.

## 7. Error handling

- A stale settings, document, draft, or IM-policy version returns HTTP 409, writes nothing, and leaves the frontend draft intact while offering a refresh.
- Invalid or inactive media references are rejected before a settings version is created.
- A media upload followed by settings-save failure does not change the active image and does not delete shared or previously referenced media.
- A missing legal language release returns a stable unavailable state and never falls back silently.
- Maintenance and feature-disabled responses use stable application error keys and do not leak internal configuration.
- Public projection failure retains only safe bundled branding fallbacks; it does not assume that registration, login providers, or payments are enabled.
- Unconfigured PayPay, PayPal, and Stripe commands do not exist in this microstep.

## 8. Migration and compatibility

- Add additive migrations for versioned platform settings and the legal document catalog/drafts/releases.
- Extend `ImPolicy` only where required to preserve per-send policy evidence and global media retention semantics. Do not create a parallel IM policy table.
- Seed the first active platform-settings version from the current production-safe behavior so deployment does not unexpectedly close the site or remove an already-supported formal method.
- Import existing static legal and contract text as initial immutable published releases with reproducible hashes.
- Do not edit previously applied migrations.
- Generate Prisma Client after schema changes and verify physical tables, constraints, indexes, foreign keys, seeded permissions, role assignments, and migration history against the configured non-production database before claiming real-flow acceptance.

## 9. Testing and acceptance

### 9.1 Automated tests

Cover:

- schema constraints, indexes, relations, defaults, and additive migration SQL;
- platform-settings service serialization, optimistic concurrency, media validation, cache invalidation, and audit metadata;
- public projection privacy;
- maintenance enforcement and recovery allowlist;
- public-registration enforcement while operations creation remains available;
- password login verification master switch, three time rules, combinable new-IP rule, Tokyo month boundary, no-token challenge response, expiry, one-time use, rate limiting, and account-enumeration resistance;
- Google login/link behavior that cannot be weakened by the password-login switch;
- supported-payment filtering and backend rejection of disabled methods;
- absence of selectable/provider API behavior for PayPay, PayPal, and Stripe;
- IM days validation, version creation, send-time snapshot, prospective-only expiry, and unchanged existing expiries;
- legal catalog creation, same-origin path validation, language isolation, draft/publish separation, publication date/version/hash, immutable release history, missing-locale behavior, and acceptance snapshots;
- RBAC separation for every read/write/publish operation;
- OpenAPI definitions for every new endpoint;
- frontend adapters, independent tab loading/error states, keyboard tab behavior, media previews, unsaved drafts, conflict retention, legal language switching, and disabled provider entries;
- existing NDP exchange-rate behavior after visual changes; and
- navigation and route isolation proving system settings no longer renders role management.

### 9.2 Verification commands

Run focused red/green tests throughout implementation, then run:

- frontend full test suite;
- frontend TypeScript lint;
- formal production build and production-bundle audit;
- backend full test suite;
- backend lint and TypeScript build;
- Prisma format/generate and the focused non-production schema/flow checker; and
- `git diff --check`.

### 9.3 Browser and real-data acceptance

Against the formal local runtime, prove listener PID, working directory, branch, frontend proxy target, `/api/v1/health`, and `/api/v1/ready` before acceptance. Then verify:

- the system-settings route is distinct from role management;
- all four tabs render and retain deep links;
- settings persist across reload from MySQL;
- uploaded LOGO and Request images appear on the actual login and customer-navigation surfaces;
- self-registration closes while operations user creation remains possible;
- password login follows the selected email-code rule;
- ordinary portals enter and exit maintenance while operations can restore the site;
- IM retention changes affect new content without changing existing expiries;
- legal language drafts remain private until publication and related links open the correct pages;
- disabled payment methods cannot be selected or submitted; and
- NDP exchange-rate behavior remains intact with the aligned UI.

Tests and builds do not substitute for browser, API, database, migration, and cross-surface evidence. Destructive policy toggles used for acceptance must be restored to their initial values before handoff.

## 10. Deferred work

- Role-management member lists.
- Permission-tree and route/API permission reconciliation.
- PayPay provider integration.
- PayPal provider integration.
- Stripe aggregation integration.
- Apple, LINE, and other login-provider integration.
- Authoring the substantive text of currently missing rules and guidelines.
- Remote deployment, production migration, provider credential provisioning, and staging acceptance unless separately authorized.
