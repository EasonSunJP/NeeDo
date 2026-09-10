# Identity Application Pending Details Design

**Date:** 2026-09-06
**Status:** Approved for implementation
**Scope:** Technician and merchant identity-application entry and submitted-state presentation.

## Outcome

- Merely opening and leaving either application page creates no application and leaves the identity state `available_to_apply`.
- Existing server drafts remain resumable and are not presented as under review.
- A `submitted` or `under_review` application appears as `pending` in identity settings.
- The pending identity row displays a grey `审核中` pill while the row remains available to open.
- Opening a pending technician or merchant application shows the submitted information in read-only form.
- The final application action is replaced by a grey disabled `审核中` button; the user cannot resubmit or edit the locked snapshot.

## Architecture and data flow

The backend remains authoritative: `/api/v1/auth/me` maps only `submitted` and `under_review` applications to `pending`; page entry performs only the existing `GET /identity-applications/mine` read. No API, schema, migration, permission, or status transition changes are required.

The shared identity-settings row keeps its pending visual treatment but stops disabling the row itself. Navigation continues through the existing technician and merchant application routes. Each application page derives a pending/read-only flag from the returned application status and renders the already loaded server fields without enabling form controls or mutation actions.

## UI behavior

### Identity settings

- `available_to_apply`: active-colored `申请`, opens the application page.
- `draft`: active-colored `继续申请`, opens the editable draft.
- `pending`: grey `审核中`, opens the submitted application detail.
- `rejected`: active-colored `重新申请`, opens the editable rejected application.
- `active`: unchanged current/switch behavior.

### Pending technician application

Show target shop and all returned profile fields in read-only controls. Optional empty fields remain visible as empty or unfilled values. Replace `提交申请` with a disabled grey `审核中` button and retain the return-to-identity-settings action.

### Pending merchant application

Show the returned service-display and applicant fields read-only. Sensitive bank values are not reconstructed because the applicant API exposes only its existing safe projection. Show the completed application notice, a disabled grey `审核中` button, and the return-to-identity-settings action.

## Error and security boundaries

- If the application read fails, keep the existing inline error behavior.
- Never infer pending state from local navigation or browser storage.
- Never unlock submitted fields or issue update, upload, contract-acceptance, or submit requests from the pending view.
- Continue to rely on the existing ownership, RBAC, snapshot-locking, and masked-data API contracts.

## Verification

- Model/UI tests prove a pending row is grey but navigable.
- Page tests prove technician and merchant pending views contain a disabled `审核中` action and no editable pending controls.
- Existing tests continue to prove page entry is read-only and backend draft/pending availability mapping is authoritative.
- Focused frontend tests, frontend type/build checks, and relevant backend auth/application tests must pass before merge.

## Out of scope

- New application states, withdrawal UI, review decisions, database changes, or API changes.
- Changes to affiliate activation or active identity switching.
- Cleanup of unrelated worktrees or user changes.
