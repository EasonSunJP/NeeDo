# NeeDo Identity Application Workflows Design

**Date:** 2026-08-26  
**Status:** Approved for implementation  
**Scope:** Customer, technician, merchant, and affiliate-marketing identity availability, application, review, activation, contract, retention, and export flows.

## 1. Product outcome

NeeDo accounts always have the customer identity. Other identities are formal entitlements, not client-side portal shortcuts.

- Simulation technicians can switch among customer, technician, and affiliate-marketing identities.
- Simulation merchant accounts can switch among customer, technician, merchant, and affiliate-marketing identities.
- Ordinary customers see an application action for technician and merchant identities.
- Ordinary customers see a contract-confirmation action for affiliate marketing. Acceptance activates the identity immediately without manual review.
- Identity switching continues to use the formal authenticated identity-switch API and only accepts active `UserIdentity` records.

The feature must use real APIs, real database records, RBAC, audit logs, OpenAPI, Zod validation, transactions, and three-language i18n. It must not add mock, demo, placeholder, or local-only business state.

## 2. Delivery decomposition

This design is implemented as independently testable microsteps. A microstep must pass its focused tests, lint, build, migration checks, and relevant live acceptance before the next microstep starts.

1. Identity entitlement states and simulation-account identity matrix.
2. Shared identity-application, contract-acceptance, bank-account, and sensitive-media foundation.
3. Technician application, merchant review, contact, notification, and single-resume export.
4. Merchant application, bank verification, contract submission, operations review, activation, and billing-trial calculation.
5. Affiliate contract activation and eKYC/bank-name withdrawal guard.
6. Mobile-first frontend flows and end-to-end acceptance across customer, merchant, and operations portals.

Each microstep is additive and reversible. Existing legacy UI remains available until the corresponding formal path passes acceptance; no new fallback is introduced.

## 3. Architecture

Use a shared application aggregate with typed detail records.

### 3.1 Shared aggregate

`IdentityApplication` represents reviewable technician and merchant applications.

Required fields:

- `id`, `createdAt`, `updatedAt`, `deletedAt`
- applicant `userId`
- `type`: `technician` or `merchant`
- `status`: `draft`, `submitted`, `under_review`, `approved`, `rejected`, or `withdrawn`
- `version` for optimistic concurrency
- `submittedAt`, `reviewedAt`, `reviewerUserId`
- `rejectionReason`
- `closedAt`, `purgeAt`, `purgedAt`
- immutable submitted-snapshot hash

Rules:

- A user may have only one active application per identity type.
- `draft`, `submitted`, and `under_review` are active.
- An already active identity prevents a new application.
- A rejected application is reopened as a new draft version and may be resubmitted.
- A pending technician application must be withdrawn before selecting another shop.
- Submitted data is immutable until approval, rejection, or withdrawal.
- Rejection requires a non-empty reason.
- Approval creates the identity and closes the application in one database transaction.

### 3.2 Technician detail

`TechnicianApplicationDetail` contains:

- target `shopId`
- required name
- read-only login account and NeeDo ID projection from `User`
- optional applicant photo
- optional phone, city, service areas, skills, experience years, and biography
- optional gender and birth date
- optional document images
- submitted snapshot

Only the target shop's authorized reviewer, the applicant, and authorized operations staff may read the detail or attached media. The detail never becomes a public technician profile automatically; approval copies only the defined profile fields into `TechnicianProfile`.

### 3.3 Merchant detail

`MerchantApplicationDetail` contains:

- applicant kind: `corporate` or `individual`
- corporate legal name and full-width-katakana reading for corporate applications
- representative name and full-width-katakana reading
- shop name, business address, contact phone, and responsible-person name
- service-display draft and immutable submitted snapshot
- corporate registration documents for corporate applications
- representative identity documents
- verified bank-account reference
- merchant contract-acceptance reference

Corporate applications require corporate-registration documents and representative identity documents. Individual applications require representative identity documents and a completed eKYC result.

### 3.4 Protected bank account

`ProtectedBankAccount` stores encrypted settlement details separately from general application JSON:

- owner user and purpose
- bank code/name
- branch code/name
- account type
- encrypted account number
- encrypted raw account-holder name
- normalized full-width-katakana account-holder name
- verification source, result, and verified time
- `id`, `createdAt`, `updatedAt`, `deletedAt`

API responses expose only masked account data. Full account numbers and raw names must never appear in logs, audit metadata, notification payloads, analytics, or spreadsheet exports.

Matching rules:

- A corporate merchant application accepts only a corporate bank account whose normalized holder name matches the verified corporate legal name. A representative's personal account is not accepted.
- An individual merchant application accepts only an account whose normalized holder name matches the verified eKYC name.
- Affiliate withdrawal accepts only an account whose normalized holder name matches the verified eKYC name.
- Matching uses normalized full-width katakana. Failure blocks submission or withdrawal. There is no manual bypass.

### 3.5 Contract acceptance

`ContractAcceptance` stores merchant and affiliate click-through agreements:

- contract type and version
- effective date
- exact accepted text snapshot
- snapshot hash
- accepting user and resulting identity type
- accepted time, UI language, and authenticated session identifier
- generated receipt identifier
- `id`, `createdAt`, `updatedAt`, `deletedAt`

Do not store IP addresses. A later contract version must not overwrite an earlier acceptance. The user receives a downloadable immutable receipt.

The click-through screen contains the complete rules and NeeDo agreement, separate acknowledgements that the user read and agrees, a final review screen, and a final action labelled equivalently to “Agree to the contract and enable affiliate marketing” or “Agree to the merchant contract and submit.”

The implementation provides an auditable evidence record; it does not itself guarantee legal enforceability. Production contract text and the click-through presentation require review by qualified Japanese counsel. Reference materials: [Japan METI's current Electronic Commerce Guidelines](https://www.meti.go.jp/press/2024/02/20250212003/20250212003.html) and the [Digital Agency's electronic-signature policy](https://www.digital.go.jp/policies/digitalsign).

### 3.6 Sensitive media and retention

Application media uses formal `MediaAsset` records with purpose, owner, access scope, integrity metadata, and purge time.

- Pending application data is retained until review completes or the applicant withdraws.
- Approval, rejection, or withdrawal starts a 30-day retention period.
- At expiry, a scheduled purge physically removes detailed application payloads, original media, document media, and unnecessary bank-application snapshots.
- The application ID, type, outcome, timestamps, reviewer, snapshot hash, and audit events remain as minimal records.
- The purge is idempotent and audited without copying the deleted sensitive values into the audit entry.
- Browsers and apps do not intentionally maintain long-lived caches of identity documents.
- A merchant may explicitly download a technician resume. Server retention does not revoke a file already downloaded to the merchant's device.

## 4. Identity availability and activation

`GET /api/v1/auth/me` returns active identities and a server-computed availability entry for each supported portal identity.

Availability states:

- `active`: show switch action
- `available_to_apply`: show application action
- `draft`: show continue action
- `pending`: show review status and withdrawal action where allowed
- `rejected`: show rejection reason and edit/resubmit action

`POST /api/v1/auth/switch-identity` remains authoritative and rejects inactive, deleted, absent, or out-of-scope identities.

Simulation seed matrix:

| Simulation account | Customer | Technician | Merchant | Affiliate marketing |
| --- | --- | --- | --- | --- |
| Technician | Active | Active | Application | Active |
| Merchant/shop | Active | Active | Active | Active |
| Ordinary customer | Active | Application | Application | Contract activation |

Simulation merchant accounts receive a customer profile, a technician profile linked to their shop, and an affiliate-marketing identity and role. Simulation technicians receive a customer profile and an affiliate-marketing identity and role. Seed operations are deterministic and idempotent.

`IdentityActivationService` is the only service allowed to create an activated identity for these flows. It also assigns the corresponding role, prevents duplicates, emits the system notification event, and records the audit event within the same transactional boundary.

## 5. Technician application and merchant review

### 5.1 Applicant flow

1. Select technician application from identity settings.
2. Search shops by merchant ID, merchant name, or address. Results are paginated and exclude deleted or unavailable shops.
3. Select one shop and continue.
4. Enter required name and optional profile data and media.
5. Submit. The server validates ownership, target-shop eligibility, one-active-application rule, and required name.
6. View pending status or withdraw before review.

Draft edits are auto-saved through the formal API. The client does not store the authoritative draft in local storage.

### 5.2 Merchant review flow

Authorized target-shop reviewers see a paginated application list and a consolidated detail surface containing all submitted fields and media.

- `OK` approves the application, creates or activates the technician profile linked to the target shop, activates the technician identity, closes the application, audits the action, and sends a system notification.
- `Reject` requires a reason, closes the submitted version, unlocks a new editable draft version, audits the action, and sends a system notification containing the reason.
- `Contact` does not approve or reject. It idempotently establishes the friendship/contact relation between the shop's official service account and applicant, reuses or creates one direct conversation, and returns the conversation ID for immediate navigation.

Only the target shop may review or export the application. Operations staff may inspect under an explicit permission. Other merchants receive a not-found response to avoid resource enumeration.

### 5.3 Resume export

The merchant can download one applicant at a time as `.xlsx`.

- Filename: `技师入住申请_姓名_NeeDoID_申请日期.xlsx`
- One professional, printable resume layout
- Includes every submitted applicant field and embeds applicant/document images rather than external links
- Excludes raw bank data because technician applications do not collect bank details
- Generated just in time and not persisted on the server
- Emits a sensitive-data download audit event
- UI shows a warning that the merchant is responsible for locally stored personal information

The workbook must be opened and visually inspected during acceptance. It must pass ZIP integrity checks and contain no spreadsheet formula errors.

## 6. Merchant application and operations review

### 6.1 Application wizard

The merchant application is a three-stage, mobile-first wizard:

1. Service display
2. Bank and applicant verification
3. Fee rules, NeeDo merchant agreement, final review, and submission

The service-display stage reuses the current merchant public service-display UI and data shape. In application mode:

- Hide the service-display/data-center switch.
- Hide bottom portal navigation.
- Replace the settings control with a close control.
- Hide operational controls unrelated to the application.
- Show a persistent next/submit action at the bottom.

The bank stage requires all bank fields, applicant-kind-specific evidence, and successful holder-name verification.

The contract stage shows current pricing, trial rules, agreement text, acknowledgements, and a review screen. Submission records the exact contract acceptance and locks the submitted snapshot.

### 6.2 Billing trial rule

The activation date is the day operations approval creates the merchant identity.

- If fewer than 15 calendar days remain in the activation month, the partial activation month is an extra free period and the following three full calendar months are the trial.
- If exactly 15 days or more remain, the activation month is trial month one and the trial lasts through the end of the third counted calendar month.
- The rule is calendar-month based in the configured Japanese business timezone; persisted API timestamps remain UTC.

Examples included in the fee rules and contract:

- Activated August 20: the remaining August days are extra; September, October, and November are the three full trial months; billing starts December 1.
- Activated August 10: August, September, and October are the trial months; billing starts November 1.
- An activation date with exactly 15 remaining days counts the activation month as trial month one.

The calculation reuses the formal SaaS billing profile/free-period model and is covered with boundary tests for 14, 15, and 16 remaining days, month ends, leap years, and Japan-time/UTC conversion.

### 6.3 Operations review

Authorized operations reviewers receive paginated merchant applications. The detail view consolidates applicant, shop, service-display, bank verification, documents, and contract evidence.

Approval transaction:

- creates the merchant account and shop
- links the responsible user
- creates the merchant identity and role
- creates the SaaS billing profile and calculated trial/free-period records
- closes the application
- records audit events
- emits the approval system notification

Rejection requires a reason, unlocks a new editable draft version, audits the action, and emits a system notification.

## 7. Affiliate-marketing activation and withdrawal

An ordinary customer selecting affiliate marketing opens the current rules and NeeDo affiliate agreement.

1. Read the complete rules and agreement.
2. Confirm both read and agree acknowledgements.
3. Review the final confirmation screen.
4. Submit acceptance.
5. In one transaction, persist `ContractAcceptance`, activate the affiliate identity and role, record the audit event, and send a system notification.

Affiliate earnings may accrue without eKYC. Withdrawal creation is blocked unless:

- eKYC is verified and usable
- a protected bank account is bound
- the normalized full-width-katakana bank holder matches the eKYC name

There is no manual mismatch override.

## 8. Formal API surface

All endpoints use `/api/v1`, JWT authentication, permission middleware, Zod validation, service/repository separation, stable i18n error keys, and OpenAPI documentation.

### Applicant and identity

- `GET /api/v1/auth/me`
- `POST /api/v1/auth/switch-identity`
- `GET /api/v1/identity-applications/mine?page=&page_size=&type=&status=`
- `POST /api/v1/identity-applications/technician`
- `PATCH /api/v1/identity-applications/{id}/technician-profile`
- `POST /api/v1/identity-applications/merchant`
- `PATCH /api/v1/identity-applications/{id}/merchant-showcase`
- `PATCH /api/v1/identity-applications/{id}/merchant-bank-account`
- `POST /api/v1/identity-applications/{id}/submit`
- `POST /api/v1/identity-applications/{id}/withdraw`
- `GET /api/v1/merchants/search?page=&page_size=&query=`

### Merchant review

- `GET /api/v1/merchant/technician-applications?page=&page_size=&status=`
- `GET /api/v1/merchant/technician-applications/{id}`
- `POST /api/v1/merchant/technician-applications/{id}/approve`
- `POST /api/v1/merchant/technician-applications/{id}/reject`
- `POST /api/v1/merchant/technician-applications/{id}/contact`
- `GET /api/v1/merchant/technician-applications/{id}/resume.xlsx`

### Operations review

- `GET /api/v1/ops/merchant-applications?page=&page_size=&status=`
- `GET /api/v1/ops/merchant-applications/{id}`
- `POST /api/v1/ops/merchant-applications/{id}/approve`
- `POST /api/v1/ops/merchant-applications/{id}/reject`

### Contracts and affiliate identity

- `GET /api/v1/contracts/merchant/current`
- `GET /api/v1/contracts/affiliate/current`
- `GET /api/v1/contracts/acceptances/{id}/receipt`
- `POST /api/v1/identity-activations/affiliate`

### Retention

The purge worker invokes an internal service, not a public unauthenticated endpoint. Operations may inspect purge status through an explicitly permissioned audit surface without viewing purged content.

File downloads are successful binary responses with safe `Content-Disposition`; JSON errors retain the standard error envelope.

## 9. Permissions and audit

Add narrowly scoped permissions rather than broad portal-role checks:

- own application read/write/submit/withdraw
- target-shop technician application read/review/contact/export
- operations merchant application read/review
- contract read/acceptance read
- protected bank account own write/read-masked
- sensitive application media read
- retention job execute/inspect

Every state transition, review, identity activation, contract acceptance, contact creation, bank verification result, resume download, and purge writes an audit log. Audit metadata contains IDs, states, versions, and result codes only; it excludes account numbers, identity-document contents, raw names, and images.

## 10. UI states and accessibility

The identity settings card preserves the supplied dark rounded visual direction and existing NeeDo theme tokens.

- Active identity: selected indicator and switchable row.
- Available identity: clear `申请` action on the right.
- Draft: `继续填写`.
- Pending: disabled switch, `审核中`, and access to status detail.
- Rejected: `重新申请` plus rejection reason in the detail surface.
- Network or permission errors: inline retry state; never silently activate or fall back to demo state.

All flows are mobile-first, usable with one hand, keyboard accessible on desktop, and compatible with light/dark theme behavior already present in the repository. Inputs use explicit labels, field-level validation, progress preservation through server drafts, upload progress, safe close confirmation, and loading/idempotency guards on final actions.

User-visible copy is provided in Chinese, Japanese, and English through the existing i18n mechanism.

## 11. Error handling and concurrency

- Duplicate active applications return a stable conflict error containing the existing application ID.
- Version mismatch returns a conflict and requires the client to reload the server draft.
- Repeated submit, approve, contact, identity activation, and purge calls are idempotent.
- Review of an already closed application returns the current state without duplicating identity, profile, role, friendship, conversation, notification, billing, or audit records.
- Upload failure leaves the draft usable and does not submit partially uploaded media.
- Contract hash/version mismatch forces the current contract to reload and be accepted again.
- Bank verification failure exposes a safe reason category, not sensitive normalized values.
- Unauthorized cross-shop access returns not found when resource existence would leak private application data.

## 12. Testing and acceptance

Development follows red-green-refactor. Each new service method and endpoint has focused unit and integration coverage.

Required automated coverage:

- identity availability and switch authorization
- simulation seed matrix and idempotency
- application state transitions, one-active rule, withdraw/resubmit, snapshot locking, and optimistic versioning
- technician required/optional fields and target-shop isolation
- approve/reject transaction rollback and notification creation
- contact idempotency and direct-conversation reuse
- merchant applicant-kind validation, document requirements, eKYC gate, encryption boundary, masking, and name normalization
- corporate legal-name match and representative-personal-account rejection
- merchant contract and affiliate contract version/hash evidence
- affiliate immediate activation and duplicate-submit idempotency
- affiliate withdrawal eKYC/bank-name guard
- 30-day retention boundary and idempotent purge
- trial calculation at fewer than 15, exactly 15, and more than 15 remaining days
- OpenAPI paths, schemas, permissions, error envelopes, and pagination
- frontend component states, wizard validation, retry, and final-action guards
- three-language i18n key coverage

Acceptance includes:

- lint, backend tests, frontend tests, type/build checks, Prisma validation, and migration tests
- live mobile-width walkthrough for ordinary customer, technician test account, merchant test account, target-shop reviewer, and operations reviewer
- refresh/relogin checks proving server persistence
- cross-account/cross-shop denial checks
- real chat opening after `Contact`
- real system notification display after approval and rejection
- generated Excel opened and visually inspected, with embedded images, printable layout, ZIP integrity, and no formula errors
- explicit comparison of every requested field and action against the live UI; passing tests alone are not acceptance

## 13. Out of scope

- Third-party electronic-signature provider integration
- IP-address storage for contract evidence
- Manual bypass of bank/eKYC holder mismatch
- Bulk technician-resume export
- Server revocation of files a merchant already downloaded
- New mock APIs or browser-only application state
- Unrelated redesign of merchant, technician, customer, IM, wallet, or operations modules
