# IM Group Privacy Countdown Hours and Minutes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the group-privacy month/day/hour/minute editor with a server-enforced hour/minute editor whose maximum value is exactly 99 hours 59 minutes.

**Architecture:** A focused frontend domain helper will own the two-field input shape, normalization, legacy countdown flattening, and limit detection for both group creation and group settings. A focused backend constant will be consumed by both Zod validation and OpenAPI so direct API calls cannot exceed the same 359940-second limit. Existing message-expiry persistence, worker behavior, conversation models, and database schema remain unchanged.

**Tech Stack:** React 19, TypeScript 5.9, Vitest 4, Express, Zod 3, Jest 29, Supertest, OpenAPI 3.1, Tailwind CSS.

## Global Constraints

- The only visible countdown fields are `小时` and `分钟`, in that order.
- Hours accept `0–99`; minutes accept `0–59`; `99:59` equals `359940` seconds and is the maximum valid value.
- The exact Simplified Chinese overflow copy is `时间上限最大为99小时59分钟`.
- Overflow input remains visible and is never silently clamped or auto-carried into another field.
- Overflow blocks both group creation and group-privacy saving; `00:00` remains the separate required-value case.
- Existing countdown objects remain `{ months, days, hours, minutes }`, with new submissions setting `months` and `days` to zero.
- Existing stored values above the new maximum remain readable but must be corrected before privacy settings can be saved again.
- Formal API validation accepts only `60–359940` seconds when privacy mode is enabled.
- No Prisma schema change or migration is allowed in this microstep.
- Preserve all unrelated worktree changes, including `docs/superpowers/plans/2026-08-30-im-judgement-reaction-readability.md`.

---

### Task 1: Add the shared frontend countdown rule

**Files:**
- Create: `src/features/im/privacy-countdown.ts`
- Create: `src/features/im/privacy-countdown.test.ts`

**Interfaces:**
- Consumes: `ConversationDisappearingCountdown` from `src/features/im/model.ts`.
- Produces: `GroupPrivacyCountdownField`, `GroupPrivacyCountdownInput`, `GROUP_PRIVACY_COUNTDOWN_LIMIT_MESSAGE`, `defaultGroupPrivacyCountdownInput`, `groupPrivacyCountdownLabels`, `groupPrivacyCountdownLimits`, `sanitizeCountdownInputValue`, `hasCountdownInputOverflow`, `parseCountdownInput`, `createCountdownInput`, `hasCountdownValue`, and `formatConversationDisappearingCountdown`.

- [ ] **Step 1: Write the failing domain tests**

Create `src/features/im/privacy-countdown.test.ts` with these exact boundary cases:

```ts
import { describe, expect, it } from "vitest";
import {
  GROUP_PRIVACY_COUNTDOWN_LIMIT_MESSAGE,
  createCountdownInput,
  defaultGroupPrivacyCountdownInput,
  formatConversationDisappearingCountdown,
  groupPrivacyCountdownLabels,
  hasCountdownInputOverflow,
  parseCountdownInput,
  sanitizeCountdownInputValue,
} from "./privacy-countdown";

describe("group privacy countdown", () => {
  it("exposes only hour and minute inputs", () => {
    expect(groupPrivacyCountdownLabels).toEqual([
      { field: "hours", label: "小时", suffix: "小时" },
      { field: "minutes", label: "分钟", suffix: "分钟" },
    ]);
    expect(defaultGroupPrivacyCountdownInput).toEqual({ hours: "", minutes: "" });
  });

  it("keeps overflow digits visible instead of clamping them", () => {
    expect(sanitizeCountdownInputValue("hours", "1a00")).toBe("100");
    expect(sanitizeCountdownInputValue("minutes", "060")).toBe("60");
  });

  it.each([
    [{ hours: "99", minutes: "59" }, false],
    [{ hours: "100", minutes: "0" }, true],
    [{ hours: "0", minutes: "60" }, true],
  ] as const)("validates %o overflow as %s", (input, expected) => {
    expect(hasCountdownInputOverflow(input)).toBe(expected);
  });

  it("converts valid editor input without months or days", () => {
    expect(parseCountdownInput({ hours: "99", minutes: "59" })).toEqual({
      months: 0,
      days: 0,
      hours: 99,
      minutes: 59,
    });
  });

  it("flattens legacy month/day values into total hours", () => {
    expect(createCountdownInput({ months: 0, days: 2, hours: 3, minutes: 4 })).toEqual({
      hours: "51",
      minutes: "4",
    });
    expect(formatConversationDisappearingCountdown({ months: 0, days: 2, hours: 3, minutes: 4 })).toBe("51小时 4分钟");
  });

  it("exports the approved overflow copy", () => {
    expect(GROUP_PRIVACY_COUNTDOWN_LIMIT_MESSAGE).toBe("时间上限最大为99小时59分钟");
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
npm test -- src/features/im/privacy-countdown.test.ts
```

Expected: FAIL because `./privacy-countdown` does not exist.

- [ ] **Step 3: Implement the focused helper**

Create `src/features/im/privacy-countdown.ts` with this behavior:

```ts
import type { ConversationDisappearingCountdown } from "./model";

export type GroupPrivacyCountdownField = "hours" | "minutes";
export type GroupPrivacyCountdownInput = Record<GroupPrivacyCountdownField, string>;

export const GROUP_PRIVACY_COUNTDOWN_LIMIT_MESSAGE = "时间上限最大为99小时59分钟";
export const defaultGroupPrivacyCountdownInput: GroupPrivacyCountdownInput = { hours: "", minutes: "" };
export const groupPrivacyCountdownLimits = { hours: 99, minutes: 59 } as const;
export const groupPrivacyCountdownLabels = [
  { field: "hours", label: "小时", suffix: "小时" },
  { field: "minutes", label: "分钟", suffix: "分钟" },
] as const;

export function sanitizeCountdownInputValue(_field: GroupPrivacyCountdownField, value: string) {
  return value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
}

export function hasCountdownInputOverflow(input: GroupPrivacyCountdownInput) {
  return Object.entries(groupPrivacyCountdownLimits).some(
    ([field, limit]) => Number(input[field as GroupPrivacyCountdownField] || 0) > limit,
  );
}

export function parseCountdownInput(input: GroupPrivacyCountdownInput): ConversationDisappearingCountdown {
  return { months: 0, days: 0, hours: Number(input.hours) || 0, minutes: Number(input.minutes) || 0 };
}

export function createCountdownInput(
  countdown?: Partial<ConversationDisappearingCountdown>,
): GroupPrivacyCountdownInput {
  const totalMinutes =
    Math.max(0, Math.floor(countdown?.months ?? 0)) * 30 * 24 * 60 +
    Math.max(0, Math.floor(countdown?.days ?? 0)) * 24 * 60 +
    Math.max(0, Math.floor(countdown?.hours ?? 0)) * 60 +
    Math.max(0, Math.floor(countdown?.minutes ?? 0));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return { hours: hours ? String(hours) : "", minutes: minutes ? String(minutes) : "" };
}

export function hasCountdownValue(countdown: ConversationDisappearingCountdown) {
  return countdown.hours + countdown.minutes > 0;
}

export function formatConversationDisappearingCountdown(
  countdown?: Partial<ConversationDisappearingCountdown>,
) {
  if (!countdown) return "";
  const input = createCountdownInput(countdown);
  return [
    input.hours ? `${input.hours}小时` : "",
    input.minutes ? `${input.minutes}分钟` : "",
  ].filter(Boolean).join(" ");
}
```

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run:

```bash
npm test -- src/features/im/privacy-countdown.test.ts
```

Expected: 1 suite passes with all six cases green.

- [ ] **Step 5: Commit the domain rule**

```bash
git add src/features/im/privacy-countdown.ts src/features/im/privacy-countdown.test.ts
git commit -m "feat(im): define group privacy countdown limits"
```

---

### Task 2: Wire both group privacy editors and localize the error

**Files:**
- Modify: `src/features/im/pages.tsx:120-345,6518-6690,7105-7170,7490-7605,7727-7810,8145-8210`
- Modify: `src/features/im/pages.test.ts:523-539`
- Modify: `src/i18n/translations.ts:739-760`
- Modify: `src/i18n/translations.test.ts:75-90`

**Interfaces:**
- Consumes: every export created by Task 1.
- Produces: identical two-field overflow behavior in `ImConversationInfoPage` and `ImNewConversationPage`, plus translations for the exact source copy.

- [ ] **Step 1: Write failing UI-source and translation tests**

Extend `src/features/im/pages.test.ts` with a source-level regression test that scopes both components and asserts:

```ts
it("uses the shared two-field privacy countdown and blocks overflow in both group editors", () => {
  const infoStart = pagesSource.indexOf("export function ImConversationInfoPage");
  const newStart = pagesSource.indexOf("export function ImNewConversationPage");
  const infoSource = pagesSource.slice(infoStart, newStart);
  const newSource = pagesSource.slice(newStart);

  for (const componentSource of [infoSource, newSource]) {
    expect(componentSource).toContain("hasCountdownInputOverflow(privacyCountdownInput)");
    expect(componentSource).toContain("GROUP_PRIVACY_COUNTDOWN_LIMIT_MESSAGE");
    expect(componentSource).toContain("role=\"alert\"");
    expect(componentSource).toContain("grid-cols-2");
  }
  expect(pagesSource).not.toContain("grid grid-cols-4 gap-2");
});
```

Extend `src/i18n/translations.test.ts`:

```ts
it("localizes the group privacy countdown maximum", () => {
  expect(translateText("时间上限最大为99小时59分钟", "zh-Hant")).toBe("時間上限最大為99小時59分鐘");
  expect(translateText("时间上限最大为99小时59分钟", "ja")).toBe("時間の上限は99時間59分です");
  expect(translateText("时间上限最大为99小时59分钟", "en")).toBe("The maximum time is 99 hours 59 minutes");
  expect(translateText("时间上限最大为99小时59分钟", "ko")).toBe("최대 시간은 99시간 59분입니다");
});
```

- [ ] **Step 2: Run the two focused tests and confirm RED**

Run:

```bash
npm test -- src/features/im/pages.test.ts src/i18n/translations.test.ts
```

Expected: FAIL because the pages still define four local fields and the translation entry is absent.

- [ ] **Step 3: Replace the local helpers with the shared rule**

In `src/features/im/pages.tsx`, remove the local four-field types, constants, parser, sanitizer, value check, and formatter. Remove the now-unused `ConversationDisappearingCountdown` type import and import Task 1 exports from `./privacy-countdown`.

In both page components derive:

```ts
const privacyCountdownOverflow = hasCountdownInputOverflow(privacyCountdownInput);
```

For group creation, change the submit gate to:

```ts
const canCreateGroup =
  hasEnoughGroupMembers &&
  (!privacyModeEnabled || (hasPrivacyCountdown && !privacyCountdownOverflow));
```

Keep `createGroup()` defensive:

```ts
if (privacyModeEnabled && privacyCountdownOverflow) return;
```

For existing group settings, add the overflow guard before the API call:

```ts
if (privacyModeEnabled && privacyCountdownOverflow) {
  showInfoToast(GROUP_PRIVACY_COUNTDOWN_LIMIT_MESSAGE);
  return;
}
```

Change both input grids to `grid-cols-2`. Set `aria-invalid={privacyCountdownOverflow}` on both inputs and render this immediately after each grid:

```tsx
{privacyCountdownOverflow ? (
  <p className="mt-2 text-xs font-bold text-red-500" role="alert">
    {GROUP_PRIVACY_COUNTDOWN_LIMIT_MESSAGE}
  </p>
) : null}
```

For the existing-group save button, include overflow in `disabled` and use this label precedence:

```tsx
disabled={!canManageGroupPrivacy || (privacyModeEnabled && (!hasPrivacyCountdown || privacyCountdownOverflow))}
```

Do not remove the existing start-mode selector or independent “隐藏名称和资料” toggle. Reduce the new-group privacy-mode bottom padding/backdrop constants only as needed to fit the shorter two-field layout without covering contacts; the browser acceptance step is the authority for those CSS values.

- [ ] **Step 4: Add all target-language translations**

Add this exact entry to the exported `translations` map:

```ts
"时间上限最大为99小时59分钟": {
  "zh-Hant": "時間上限最大為99小時59分鐘",
  ja: "時間の上限は99時間59分です",
  en: "The maximum time is 99 hours 59 minutes",
  ko: "최대 시간은 99시간 59분입니다",
},
```

- [ ] **Step 5: Run frontend focused tests and type checking**

Run:

```bash
npm test -- src/features/im/privacy-countdown.test.ts src/features/im/pages.test.ts src/i18n/translations.test.ts src/features/im/formal-api.test.ts
npm run lint
```

Expected: all selected suites pass and TypeScript exits 0.

- [ ] **Step 6: Commit the shared UI integration**

```bash
git add src/features/im/privacy-countdown.ts src/features/im/privacy-countdown.test.ts src/features/im/pages.tsx src/features/im/pages.test.ts src/i18n/translations.ts src/i18n/translations.test.ts
git commit -m "fix(im): limit group privacy countdown editor"
```

---

### Task 3: Enforce the same formal API maximum

**Files:**
- Create: `backend/src/constants/im-privacy.ts`
- Modify: `backend/src/validators/realtime.validator.ts:60-75`
- Modify: `backend/src/api/openapi.ts:1-5,1478,12703-12712,12799-12808`
- Modify: `backend/tests/realtime-api.test.ts:1570-1620`
- Modify: `backend/tests/openapi.test.ts:830-845`
- Modify: `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md:213-222`

**Interfaces:**
- Produces: `IM_PRIVACY_TTL_MIN_SECONDS = 60` and `IM_PRIVACY_TTL_MAX_SECONDS = 359940` for validator and OpenAPI consumers.
- Preserves: existing `conversationCreateBodySchema` and `conversationPrivacyBodySchema` public interfaces.

- [ ] **Step 1: Add failing API and OpenAPI boundary assertions**

In `backend/tests/realtime-api.test.ts`, add an integration case that posts and patches privacy mode with `359941`, expects HTTP 400 and `error.validation`, then proves `359940` is accepted.

In `backend/tests/openapi.test.ts`, resolve the three schemas and assert:

```ts
expect(response.body.components.schemas.RealtimeConversation.properties.disappearingTtlSeconds.maximum).toBe(359_940);
expect(response.body.paths["/api/v1/im/conversations"].post.requestBody.content["application/json"].schema.properties.disappearingTtlSeconds.maximum).toBe(359_940);
expect(response.body.paths["/api/v1/im/conversations/{conversationId}/privacy"].patch.requestBody.content["application/json"].schema.properties.disappearingTtlSeconds.maximum).toBe(359_940);
```

- [ ] **Step 2: Run backend focused tests and confirm RED**

Run from `backend/`:

```bash
npm test -- --runTestsByPath tests/realtime-api.test.ts tests/openapi.test.ts
```

Expected: FAIL because runtime validation and OpenAPI currently use `34560000` seconds or omit the response maximum.

- [ ] **Step 3: Add one backend source of truth and wire it everywhere**

Create `backend/src/constants/im-privacy.ts`:

```ts
export const IM_PRIVACY_TTL_MIN_SECONDS = 60;
export const IM_PRIVACY_TTL_MAX_SECONDS = 99 * 60 * 60 + 59 * 60;
```

Import both constants into `backend/src/validators/realtime.validator.ts` and replace the literal chain with:

```ts
disappearingTtlSeconds: z.coerce.number().int()
  .min(IM_PRIVACY_TTL_MIN_SECONDS)
  .max(IM_PRIVACY_TTL_MAX_SECONDS)
  .nullable()
  .optional(),
```

Import the same constants into `backend/src/api/openapi.ts`. Use `minimum: IM_PRIVACY_TTL_MIN_SECONDS` and `maximum: IM_PRIVACY_TTL_MAX_SECONDS` for the conversation response schema and both request schemas.

- [ ] **Step 4: Document the editor and API boundary**

Append to section 6.16 of `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`:

```md
- 群聊隐私倒计时编辑器只显示小时和分钟；小时范围为 `0–99`，分钟范围为 `0–59`。超限时显示“时间上限最大为99小时59分钟”并阻止创建或保存。
- 正式创建与隐私更新 API 将 `disappearingTtlSeconds` 统一限制为 `60–359940` 秒；不新增 schema 或 migration。
```

- [ ] **Step 5: Run focused backend tests, lint, and build**

Run from `backend/`:

```bash
npm test -- --runTestsByPath tests/realtime-api.test.ts tests/openapi.test.ts tests/im-privacy-message-countdown.repository.test.ts tests/im-privacy-expiry.service.test.ts
npm run lint
npm run build
```

Expected: all selected suites pass; ESLint and TypeScript exit 0.

- [ ] **Step 6: Commit the formal contract**

Stage only the Step 13 privacy files, preserving unrelated changes:

```bash
git add backend/src/constants/im-privacy.ts backend/src/validators/realtime.validator.ts backend/src/api/openapi.ts backend/tests/realtime-api.test.ts backend/tests/openapi.test.ts docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md
git commit -m "fix(im): enforce privacy countdown maximum"
```

---

### Task 4: Full regression and formal mobile acceptance

**Files:**
- Verify only; change production code only if a failing acceptance criterion identifies a defect inside this plan's scope.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: evidence that UI, adapter, formal API, expiry lifecycle, i18n, and mobile layout agree.

- [ ] **Step 1: Run the complete frontend suite and production build**

From the repository root:

```bash
npm test
npm run lint
npm run verify:production-build
npm run i18n:audit
```

Expected: all frontend tests pass, type checking exits 0, the formal production bundle audit reports PASS, and the new source copy has translations for every supported target language.

- [ ] **Step 2: Run the complete backend suite**

From `backend/`:

```bash
npm test
npm run lint
npm run build
```

Expected: all non-skipped backend suites pass. If a known full-suite timeout occurs, rerun that exact suite in isolation and report both results rather than hiding the full-run failure.

- [ ] **Step 3: Confirm formal service health before browser QA**

Check the formal frontend, backend, MySQL, and Redis processes, then verify:

```bash
curl -s http://127.0.0.1:3000/api/v1/health
curl -s http://127.0.0.1:3000/api/v1/ready
curl -I -s http://127.0.0.1:5180/user.html
```

Expected: health and readiness are successful and the frontend returns HTTP 200. Restart only the failing local service, and do not run the legacy mock backend.

- [ ] **Step 4: Accept the new-group editor in mobile Chrome**

Open the formal user route ending in `/messages/new?mode=group`, select two real test contacts, enable privacy mode, and verify:

1. Only `小时` and `分钟` are visible.
2. `99` / `59` produces no overflow alert and the create control is ready.
3. `100` / `0` displays exactly `时间上限最大为99小时59分钟` and blocks creation.
4. `0` / `60` displays the same alert and blocks creation.
5. Returning to `0` / `1` clears the alert.
6. No horizontal overflow, covered contacts, clipped controls, stale month/day field, or console error exists at the screenshot viewport.

Do not create a group during boundary-only inspection unless needed for the following persisted-settings acceptance; if one is created, use a unique QA title and clean it up afterward.

- [ ] **Step 5: Accept the existing-group settings against the formal API**

Using an owned formal test group:

1. Open the group information page and enable privacy mode.
2. Repeat `99:59`, `100:00`, and `00:60` checks.
3. Save a short legal value such as `00:01`, reload the page, and confirm it remains `0` hours and `1` minute.
4. Restore the group's exact pre-test privacy values after acceptance.
5. Confirm the formal API persisted seconds, start mode, and privacy version correctly and no test message or test group remains.

- [ ] **Step 6: Final cleanliness checks**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. The status contains only intentional Step 13 changes plus pre-existing unrelated files; no temporary QA data, generated screenshots, credentials, or local environment values are committed.

- [ ] **Step 7: Record the implementation checkpoint**

If Tasks 1–3 were not committed separately because of overlapping pre-existing Step 13 changes, stage the exact reviewed privacy paths and create one recoverable checkpoint:

```bash
git add src/features/im/privacy-countdown.ts src/features/im/privacy-countdown.test.ts src/features/im/pages.tsx src/features/im/pages.test.ts src/i18n/translations.ts src/i18n/translations.test.ts backend/src/constants/im-privacy.ts backend/src/validators/realtime.validator.ts backend/src/api/openapi.ts backend/tests/realtime-api.test.ts backend/tests/openapi.test.ts docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md
git commit -m "fix(im): cap group privacy countdown at 99 hours 59 minutes"
```

Do not push, deploy, or merge without explicit user authorization.
