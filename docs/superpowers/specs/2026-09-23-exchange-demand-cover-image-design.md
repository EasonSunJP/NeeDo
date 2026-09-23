# Exchange Demand Cover Image Design

**Date:** 2026-09-23  
**Status:** Approved for implementation planning

## 1. Goal

Exchange demand cards must represent the demand itself rather than the publisher's profile. A customer may optionally upload one image while composing a demand. The image is cropped to a 16:9 landscape cover, becomes immutable when the demand is published, and is rendered consistently in the feed and demand detail page. Existing demands and newly published demands without an uploaded image use one shared NeeDo demand cover.

This work also verifies that every demand card's like, comment, and share controls use the persisted Exchange interaction APIs and remain correct after a reload.

## 2. Product Rules

- A demand accepts zero or one image.
- Supported source formats follow the existing content-image pipeline: JPEG, PNG, and WebP.
- The customer uses the existing image adjustment editor with a fixed `16 / 9` frame before upload.
- During composition, the selected image may be replaced or removed.
- Review shows the exact cropped image that will be published.
- All five application languages use one shared demand-cover editor component. Locale differences are limited to the existing i18n lookup; there are no language-specific copies of the component, upload state, draft field, media asset, or publication logic.
- Publication binds the uploaded media to the demand in the same authoritative publication transaction.
- A published demand exposes no image edit, replacement, removal, or rebind operation.
- Demands without uploaded media, including historical records, use the same static 16:9 NeeDo demand cover.
- Publisher avatars remain available only where publisher identity is intentionally displayed; they are never used as the demand cover.
- Feed and detail projections return the same cover URL and the UI renders it with a 16:9 frame and `object-cover` behavior.

## 3. Rejected Alternatives

### Store an arbitrary image URL

This is smaller but cannot prove media ownership, weakens cleanup and audit guarantees, and permits an external URL to change after publication.

### Publish first and attach the image afterward

This creates a visible intermediate state and effectively provides a post-publication mutation path, which conflicts with the immutability requirement.

### Keep using the publisher avatar in a wider frame

This changes only presentation and continues to misrepresent account identity media as demand content.

## 4. Data Model

Add an optional `coverMediaAssetId` relation on `ExchangeDemand` through a new migration. The relation points to the existing `MediaAsset` source of truth and uses `onDelete: Restrict` so a published demand cannot silently lose its cover.

The selected `MediaAsset` must:

- be active and not deleted or purged;
- use the Exchange demand-cover entity/usage classification;
- be owned by the authenticated publishing user and exact active identity;
- contain an accepted image MIME type;
- have the checksum referenced by the publication payload;
- not already be bound to another demand.

The relation is nullable so existing rows require no backfill. A null relation maps to the shared default cover at the projection boundary.

## 5. Upload and Publication Flow

Add a protected Exchange demand-cover upload endpoint using the existing content image body parser, storage service, checksum addressing, size limits, and audit conventions.

The endpoint creates a pending `MediaAsset` owned by the current user and exact customer identity. Its response returns the checksum public ID and local media URL; it does not create or update a demand.

The frontend stores only the returned public ID and preview metadata in the draft. `PublishExchangePostInput` includes an optional `coverMediaAssetPublicId` for demand publication. Intelligence publication rejects this field.

The publication service resolves and locks the media row, revalidates ownership and availability, creates `ExchangePost` and `ExchangeDemand`, and binds `coverMediaAssetId` within the existing transaction. Idempotent replay must return the originally bound cover and must reject the same idempotency key with a different cover fingerprint.

Pending uploads that are abandoned remain governed by the existing content-media purge lifecycle. Published cover media is excluded from pending-media purge while referenced by `ExchangeDemand`.

No update route for `coverMediaAssetId` is added.

## 6. Frontend Design

The demand composer adds one optional image field:

- a selection button using the existing file-input treatment;
- a 16:9 adjustment dialog built on `ImageAdjustmentEditor`;
- upload progress, retry, replace, and remove states before publication;
- a 16:9 preview in both edit and review steps;
- publication disabled while the selected image is still uploading or failed.

The field is implemented once as a shared `DemandCoverField`-style component and is mounted by the existing shared request composer in `zh`, `zh-Hant`, `ja`, `en`, and `ko` modes. It receives translated labels through the existing Exchange i18n layer and owns no locale-specific business behavior. The selected cover belongs to the demand, not to a translation, so switching the editor language must preserve the same draft image and must not create another upload or media record.

`ExchangePost` gains a demand cover projection with the resolved URL and whether it is the default. `ExchangeFeedPage` stops passing `publisher.avatarUrl` to `OfferInfoCard`. The card layout places the 16:9 cover across the available card width above the price/title content. The demand detail page uses the same projection and aspect ratio.

The default is a repository-owned, cacheable NeeDo demand cover rather than an account image. It must remain readable in all five locales without embedding localized text.

## 7. Interaction Integrity

The existing action bar remains the single implementation for every demand card.

- **Like:** `PUT /exchange/posts/:id/like` persists one identity-scoped like, returns live counts, and updates the card. `DELETE` reverses it. Reload must preserve `viewer.liked` and the count.
- **Comment:** the card action opens the detail page. Creating a comment uses the authenticated active identity, an idempotency key, an audit record, and the formal comments table. Reload must preserve content, author public ID, display name, and identity-specific avatar.
- **Share:** the client records a share only after the platform share or clipboard fallback reports success. `POST /exchange/posts/:id/shares` persists an idempotent share event and returns the live count. Reload must preserve the increment.
- Withdrawn or expired demands remain read-only while historical comments stay visible.

Live acceptance uses one retained local test demand and a formal test identity. It records baseline API and database state, performs each UI action, reloads, and reconciles API and database results. Like is returned to its baseline state after verification. The uniquely marked acceptance comment and share audit remain as explicit local test evidence unless a domain-supported cleanup path exists; direct table deletion is prohibited.

## 8. Cross-Surface Impact Map

```text
Customer composes demand
-> client crop/upload and draft preview
-> authenticated Exchange media endpoint
-> MediaAsset ownership and audit
-> publish validation and transaction
-> ExchangeDemand cover relation
-> feed/detail projection
-> user/technician/merchant presentation

Demand viewer interacts
-> shared action bar
-> authenticated Exchange interaction API
-> identity-scoped comment/like/share records and audit
-> live counts and viewer state
-> reload reconciliation
```

- User, technician, and merchant Exchange surfaces: affected.
- Operations demand readers: projection-compatible; verify if they consume the shared post contract.
- Booking, matching, wallet, publication fee, and claim state machines: confirmed unchanged except that the existing publication transaction also binds the optional cover.
- Redis, realtime notifications, and unrelated Social media: no new state source; existing behavior remains unchanged.
- Installed PWA and physical device behavior: not proven by browser acceptance and must not be claimed.

## 9. Validation

### Automated

- Validator tests for optional demand media, intelligence rejection, MIME/checksum validation, and payload fingerprinting.
- Repository tests for exact owner identity, one-time binding, immutable relation, projection fallback, and idempotent replay.
- Service and route tests for authorization, upload errors, publication, and OpenAPI contracts.
- Frontend tests for selection, 16:9 adjustment, upload/retry/removal, review preview, pending-upload publication gate, default cover, feed layout, and detail layout.
- Parameterized component tests prove the same demand-cover editor implementation, draft state, and media reference are used in all five locales without duplicated uploads.
- Existing Exchange comment, like, unlike, share, identity-avatar, and action-bar suites remain green.
- Focused frontend and backend builds/typechecks run after the tests.

### Browser and database acceptance

1. Prove listener PID, cwd, branch/commit, proxy target, `/health`, and `/ready`.
2. Log in through the formal password flow and switch to the required identity through the formal identity API/UI.
3. Publish one demand with a cropped image and one without an image.
4. Confirm both feed and detail pages use 16:9 demand covers and never substitute the publisher avatar.
5. Confirm the uploaded cover survives reload and the no-image demand uses the shared default.
6. Verify no published-demand image edit control or API exists.
7. Execute the like/unlike, comment, and share checks described above and reconcile UI, API, and database state.

## 10. Rollback

Frontend rollback restores the previous card layout but must not reinterpret a demand cover as an avatar. Backend rollback stops accepting new cover uploads while retaining the nullable database column and media references until a later forward migration removes them safely. The migration is not edited after application, and published media files are not deleted during rollback.
