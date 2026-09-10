# Operations Anytime Service Test Design

**Date:** 2026-09-11

**Stage:** Step 10 order fulfillment plus Step 12 operations settings microstep

## Goal and boundary

Add one operations-admin switch labelled `随时服务测试`. The active backend-persisted platform-settings version is authoritative. The switch is on by default during the current test stage so QA can complete an otherwise formal booking flow without waiting for scheduled time.

The switch changes only two time gates. It does not bypass order state, participant scope, technician verification code, unresolved add-ons, idempotency, payment, settlement, RBAC, or audit requirements.

## Behavior

- When disabled, a confirmed order may start at or after `startsAt - 30 minutes`.
- When disabled, an in-service order may end at or after its persisted service-session `expectedEndsAt`.
- A missing active setting uses the current test-stage default and is treated as enabled.
- When enabled, those two time comparisons are skipped. All other fulfillment checks remain active.
- Exact idempotent replays are resolved before the current time gate, so a successful prior command remains replayable.

## Persistence, API, and audit

`PlatformSettingVersion.anytimeServiceTestEnabled` is an immutable-version field mapped to `anytime_service_test_enabled`. Migration `20260911100000_anytime_service_test` originally added the field with database default `FALSE`; additive migration `20260911153000_anytime_service_test_default_on` promotes the default to `TRUE` for the current test stage without rewriting migration history. Existing active settings are changed through the protected settings API, preserving immutable versions and audit evidence.

The existing protected operations contracts are extended rather than adding a parallel settings system:

- `GET /api/v1/backoffice/system-settings` returns the field.
- `PUT /api/v1/backoffice/system-settings/basic` requires the field and retains strict Zod validation.
- Read requires `backoffice:system-settings:read`; write requires `backoffice:system-settings:write` and a global/platform operations identity.
- A successful change creates the next settings version and records `anytimeServiceTestEnabled` in the audited changed-field list.

The field is intentionally absent from the public platform-settings projection.

## Transaction and error behavior

Start and end transactions read the current active settings row after locking the order and before applying fulfillment writes. Disabled-window rejection creates no service session, status history, service event, work-status transition, or notification.

Stable conflicts are:

- `41041 error.order.service_start_too_early`
- `41042 error.order.service_end_too_early`

An in-service row without a valid `expectedEndsAt` remains an invalid transition and cannot use the switch to repair malformed persistence.

## Operations UI and localization

The switch appears in `/admin/settings/system?tab=basic`, uses the existing permission-gated settings save, optimistic version, conflict handling, and post-save reload. Its title and impact description are localized for simplified Chinese, traditional Chinese, Japanese, English, and Korean.

The switch uses the same single-layer `SettingToggle` card as site availability and new-user registration. The two brand-media cards each expose a localized `下载当前图片` action beside the upload picker. Its target is the effective active asset (`current.url`, or the system default when no published override exists); a newly uploaded but unpublished preview never changes that download target.

## Verification

Automated coverage proves the test-stage enabled database and missing-setting defaults, strict API/OpenAPI contract, audited setting persistence, permission-gated UI save, translations, the exact 30-minute start boundary, end-at-`expectedEndsAt`, enabled bypass, and stable errors. Before production release, operations must explicitly disable the switch and verify the persisted active version is off.
