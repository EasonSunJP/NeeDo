# IM Quick Response Slots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce one judgement reply (`OK`, `NO`, or `Pending`) and one emoji reply per user per message, with disabled alternatives, click-again cancellation, server-authoritative persistence, and explicit failure feedback.

**Architecture:** Keep `MessageReaction.emoji` as the persisted value and classify it into one of two slots. The repository serializes mutations with the existing message-row lock and returns explicit mutation outcomes; the service converts an occupied slot into a 409 business error and only publishes changed authoritative messages. The React action sheet derives selected slots from server-backed reaction summaries, disables every unselected option in an occupied category, and updates only from successful REST/SSE payloads.

**Tech Stack:** React 19, TypeScript, Vite, Vitest/JSDOM, Node.js 22, Express, Prisma, MySQL 8, Jest/Supertest, OpenAPI.

## Global Constraints

- Implement only the approved design in `docs/superpowers/specs/2026-08-30-im-quick-response-slots-design.md`; do not add a third slot or direct replacement behavior.
- Preserve the current React/Vite frontend, formal REST API, Prisma repository layering, SSE transport, and `reactionVersion` conflict protection.
- Do not add mock data, local-only reaction state, placeholder code, `TODO`, or `FIXME`.
- Preserve other users' reactions and all unrelated worktree changes. Before every commit run `git status --short`, then stage only the files named in that task.
- Re-read the tail of `backend/src/constants/error-codes.ts` before implementation; use `40946` only if it is still the next free conflict code, and keep tests/OpenAPI synchronized if a concurrent change has claimed it.
- The selected reply remains active and clickable; only the other replies in the same category become gray and natively disabled.
- Disabled buttons must not invoke `onReact`, the store, or the API.
- Do not optimistically insert or remove reaction summaries. REST/SSE responses are authoritative; failures keep the last confirmed state.
- Do not push, deploy, modify production data, or apply migrations to a database whose migration history has not been reconciled.
- Use test-driven development: add the failing assertion, run it and observe the expected failure, implement the smallest change, then rerun it.

---

## Task 1: Define and lock the two-category reaction contract

**Files:**

- Create: `backend/src/constants/message-reaction.constants.ts`
- Create: `backend/tests/message-reaction-policy.test.ts`
- Create: `src/features/im/reaction-policy.ts`
- Create: `src/features/im/reaction-policy.test.ts`

- [ ] **Step 1: Add failing backend policy tests**

Create `backend/tests/message-reaction-policy.test.ts` with assertions for all three judgement values, representative emoji values, and category ordering:

```ts
import {
  compareMessageReactionCategories,
  getMessageReactionCategory,
  MESSAGE_JUDGEMENT_REACTIONS
} from "../src/constants/message-reaction.constants";

describe("message reaction policy", () => {
  it.each(["OK", "NO", "Pending"])("classifies %s as judgement", (value) => {
    expect(getMessageReactionCategory(value)).toBe("judgement");
  });

  it.each(["😂", "👍", "+1"])("classifies %s as emoji", (value) => {
    expect(getMessageReactionCategory(value)).toBe("emoji");
  });

  it("keeps the contract values and judgement-first order stable", () => {
    expect(MESSAGE_JUDGEMENT_REACTIONS).toEqual(["OK", "NO", "Pending"]);
    expect(["😂", "Pending", "OK"].sort(compareMessageReactionCategories))
      .toEqual(["Pending", "OK", "😂"]);
  });
});
```

- [ ] **Step 2: Run the backend test and confirm the missing-module failure**

Run:

```bash
npm test -- --runInBand tests/message-reaction-policy.test.ts
```

Working directory: `backend`

Expected: FAIL because `message-reaction.constants.ts` does not exist.

- [ ] **Step 3: Implement the backend policy**

Create `backend/src/constants/message-reaction.constants.ts`:

```ts
export const MESSAGE_JUDGEMENT_REACTIONS = ["OK", "NO", "Pending"] as const;

export type MessageReactionCategory = "judgement" | "emoji";

const judgementReactionSet = new Set<string>(MESSAGE_JUDGEMENT_REACTIONS);

export function getMessageReactionCategory(value: string): MessageReactionCategory {
  return judgementReactionSet.has(value) ? "judgement" : "emoji";
}

export function compareMessageReactionCategories(left: string, right: string): number {
  return Number(getMessageReactionCategory(left) === "emoji")
    - Number(getMessageReactionCategory(right) === "emoji");
}
```

- [ ] **Step 4: Add failing frontend policy tests**

Create `src/features/im/reaction-policy.test.ts` covering classification, current-user slot derivation, disabling, and stable judgement-first ordering:

```ts
import { describe, expect, it } from "vitest";
import {
  deriveCurrentUserReactionSlots,
  getImReactionCategory,
  isImReactionChoiceDisabled,
  sortImReactionSummaries
} from "./reaction-policy";

describe("IM reaction policy", () => {
  it("derives one independent judgement and emoji slot", () => {
    expect(deriveCurrentUserReactionSlots({
      OK: [{ id: "7" }],
      "😂": [{ id: "7" }],
      "👍": [{ id: "8" }]
    }, "7")).toEqual({ judgement: "OK", emoji: "😂" });
  });

  it("disables only unselected values in an occupied category", () => {
    expect(isImReactionChoiceDisabled("NO", "OK", false)).toBe(true);
    expect(isImReactionChoiceDisabled("OK", "OK", false)).toBe(false);
    expect(isImReactionChoiceDisabled("😂", undefined, false)).toBe(false);
    expect(isImReactionChoiceDisabled("OK", "OK", true)).toBe(true);
  });

  it("orders judgement summaries before emoji summaries", () => {
    expect(sortImReactionSummaries([{ emoji: "😂" }, { emoji: "NO" }]))
      .toEqual([{ emoji: "NO" }, { emoji: "😂" }]);
    expect(getImReactionCategory("Pending")).toBe("judgement");
  });
});
```

- [ ] **Step 5: Run the frontend test and confirm the missing-module failure**

Run:

```bash
npm test -- src/features/im/reaction-policy.test.ts
```

Expected: FAIL because `reaction-policy.ts` does not exist.

- [ ] **Step 6: Implement the frontend policy and drift guard**

Create `src/features/im/reaction-policy.ts` with the same three judgement values plus the approved quick emoji list. Keep helpers pure so both the action sheet and room page use one rule:

```ts
export const IM_JUDGEMENT_REPLIES = ["OK", "NO", "Pending"] as const;
export const IM_QUICK_EMOJI_REPLIES = ["😂", "🤣", "👍", "🥹", "😭"] as const;
export type ImReactionCategory = "judgement" | "emoji";

export const getImReactionCategory = (value: string): ImReactionCategory =>
  (IM_JUDGEMENT_REPLIES as readonly string[]).includes(value) ? "judgement" : "emoji";
```

Implement `deriveCurrentUserReactionSlots`, `isImReactionChoiceDisabled`, and a stable `sortImReactionSummaries`. Add a backend test that reads `src/features/im/reaction-policy.ts` and asserts the frontend contract still contains exactly `OK`, `NO`, and `Pending`; this is a compile-independent drift guard because backend and frontend have separate TypeScript roots.

- [ ] **Step 7: Run the focused policy tests**

Run:

```bash
npm test -- --runInBand tests/message-reaction-policy.test.ts
npm test -- src/features/im/reaction-policy.test.ts
```

Expected: both PASS.

- [ ] **Step 8: Commit the contract**

```bash
git add backend/src/constants/message-reaction.constants.ts backend/tests/message-reaction-policy.test.ts src/features/im/reaction-policy.ts src/features/im/reaction-policy.test.ts
git commit -m "feat: define IM reaction slot policy"
```

---

## Task 2: Enforce slots atomically in the repository

**Files:**

- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/tests/im-message-reaction.repository.test.ts`

- [ ] **Step 1: Rewrite the repository test fixture for active, soft-deleted, and concurrent reactions**

Extend the fixture's `messageReaction` mock with `findMany`, make `updateMany` actually remove the exact active value from the committed snapshot, and model `message.findUnique` after the row lock. Replace the old expectation that two same-user emojis both survive.

Add failing tests for:

```ts
it("allows one judgement and one emoji for the same user");
it("returns slot_occupied for a second different emoji and preserves the first");
it("returns unchanged for the same-value PUT without incrementing reactionVersion");
it("allows a new same-category value after the selected value is removed");
it("lets only one of two concurrent same-category values occupy the slot");
it("keeps another user's reaction untouched");
```

The concurrency assertion must accept either contender as the winner but require exactly one `updated` and one `slot_occupied` outcome.

- [ ] **Step 2: Run the repository test and observe the old multiple-emoji behavior fail**

Run:

```bash
npm test -- --runInBand tests/im-message-reaction.repository.test.ts
```

Working directory: `backend`

Expected: FAIL because `setMessageReaction` still always upserts and returns `MessagePayload | null`.

- [ ] **Step 3: Add explicit repository mutation outcomes**

In `backend/src/repositories/realtime.repository.ts`, define and use:

```ts
export type MessageReactionMutationOutcome =
  | { status: "updated"; message: MessagePayload }
  | { status: "unchanged"; message: MessagePayload }
  | { status: "slot_occupied"; message: MessagePayload; activeEmoji: string }
  | { status: "not_found" };
```

Update both reaction methods in `RealtimeRepositoryPort` to return this outcome. Do not move business HTTP errors into the repository.

- [ ] **Step 4: Implement the locked slot check**

Inside the existing transaction and after `lockMessageForParticipant`:

```ts
const activeReactions = await tx.messageReaction.findMany({
  where: {
    messageId: input.messageId,
    userId: input.userId,
    deletedAt: null
  },
  select: { emoji: true },
  orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
});
const category = getMessageReactionCategory(input.emoji);
const activeInSlot = activeReactions.find(
  (reaction) => getMessageReactionCategory(reaction.emoji) === category
);
```

Then apply these exact branches:

- same value: load/map the current message and return `unchanged`; do not increment `reactionVersion`;
- different value in the same category: load/map the current message and return `slot_occupied`; do not write;
- empty category: revive/upsert the requested value, increment `reactionVersion`, return `updated`;
- exact DELETE with `updateMany.count === 0`: return `unchanged` without a version increment;
- exact DELETE with `count > 0`: increment `reactionVersion` and return `updated`.

Use the already locked transaction for every read and write. Never remove a different value just because it belongs to the same category.

- [ ] **Step 5: Make authoritative summaries judgement-first**

In `mapMessage`, sort the aggregated reaction entries with `compareMessageReactionCategories`. The comparator returns zero within a category, so the existing `id ASC` source order remains stable.

- [ ] **Step 6: Run the focused repository tests**

Run:

```bash
npm test -- --runInBand tests/im-message-reaction.repository.test.ts
```

Expected: PASS, including only one winner for concurrent same-category requests and two successes for different categories.

- [ ] **Step 7: Commit atomic repository enforcement**

```bash
git add backend/src/repositories/realtime.repository.ts backend/tests/im-message-reaction.repository.test.ts
git commit -m "feat: enforce per-message reaction slots"
```

---

## Task 3: Expose idempotence and occupied-slot errors through the formal API

**Files:**

- Modify: `backend/src/constants/error-codes.ts`
- Modify: `backend/src/services/realtime.service.ts`
- Modify: `backend/tests/realtime-service.test.ts`
- Modify: `backend/tests/realtime-api.test.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/openapi.test.ts`

- [ ] **Step 1: Add failing service tests for all repository outcomes**

Update the reaction repository mock to return `MessageReactionMutationOutcome`. Assert:

- `updated` returns the message and publishes one `message.reaction.updated` event;
- `unchanged` returns the message and publishes no event;
- `slot_occupied` throws `AppError` with status 409, code `MESSAGE_REACTION_SLOT_OCCUPIED`, and message `error.im.reaction_slot_occupied`;
- `not_found` retains the existing 404 behavior.

- [ ] **Step 2: Add failing Supertest API cases**

Extend `backend/tests/realtime-api.test.ts` so a single real test user:

1. PUTs `OK` and `😂`, both 200;
2. PUTs `NO`, receives 409 with `{ code: 40946, message: "error.im.reaction_slot_occupied", data: null }`;
3. reloads messages and still has only `OK` plus `😂` for that user;
4. PUTs `OK` again, receives 200 without a version change;
5. DELETEs `OK`, PUTs `NO`, and receives the authoritative `NO` plus `😂` aggregate.

Keep the existing test proving that different users can use the same emoji.

- [ ] **Step 3: Run service/API tests and observe failures**

Run:

```bash
npm test -- --runInBand tests/realtime-service.test.ts tests/realtime-api.test.ts
```

Working directory: `backend`

Expected: FAIL because the service does not yet interpret repository outcomes.

- [ ] **Step 4: Add and map the 409 business error**

Add the next non-conflicting code to `backend/src/constants/error-codes.ts`:

```ts
MESSAGE_REACTION_SLOT_OCCUPIED: 40946,
```

Handle the repository result in `RealtimeService.setMessageReaction`:

```ts
if (outcome.status === "not_found") {
  throw this.notFoundError("error.realtime.message_not_found");
}
if (outcome.status === "slot_occupied") {
  throw new AppError({
    code: ERROR_CODES.MESSAGE_REACTION_SLOT_OCCUPIED,
    message: "error.im.reaction_slot_occupied",
    statusCode: 409
  });
}
if (outcome.status === "updated") {
  await this.publishToConversation(
    input.conversationId,
    "message.reaction.updated",
    outcome.message,
    auth.userId
  );
}
return outcome.message;
```

Use the same `updated`/`unchanged`/`not_found` handling for DELETE, without a slot-conflict branch.

- [ ] **Step 5: Document the two-slot contract and 409 response**

Change the PUT summary to “Set the current user's reaction in its IM reply category”. Document the judgement enum in the description, the one-judgement/one-emoji rule, idempotent same-value PUT, and a 409 response. Keep request validation at 1–32 characters and do not reject valid non-judgement emoji.

Update `backend/tests/openapi.test.ts` to assert the PUT responses include `200`, `400`, `401`, `403`, `404`, and `409`.

- [ ] **Step 6: Run focused service, API, and OpenAPI tests**

Run:

```bash
npm test -- --runInBand tests/realtime-service.test.ts tests/realtime-api.test.ts tests/openapi.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the API behavior**

```bash
git add backend/src/constants/error-codes.ts backend/src/services/realtime.service.ts backend/tests/realtime-service.test.ts backend/tests/realtime-api.test.ts backend/src/api/openapi.ts backend/tests/openapi.test.ts
git commit -m "feat: expose IM reaction slot conflicts"
```

---

## Task 4: Soft-clean historical duplicate slots and add a read-only checker

**Files:**

- Create: `backend/prisma/migrations/20260830090000_message_reaction_slots/migration.sql`
- Create: `backend/prisma/migrations/20260830090000_message_reaction_slots/rollback.sql`
- Create: `backend/tests/message-reaction-slots-migration.test.ts`
- Create: `backend/scripts/check-message-reaction-slots.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Add a failing migration contract test**

The test must assert that the migration:

- partitions by `message_id`, `user_id`, and the category `CASE` expression;
- ranks by `updated_at DESC, id DESC`;
- targets only `deleted_at IS NULL` rows;
- sets `deleted_at` and `updated_at` rather than deleting rows;
- writes an `audit_logs` snapshot for every affected reaction ID before mutation;
- contains no `DELETE FROM message_reactions`.

- [ ] **Step 2: Run the migration test and confirm the missing-file failure**

Run:

```bash
npm test -- --runInBand tests/message-reaction-slots-migration.test.ts
```

Working directory: `backend`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Write the data-only migration**

Create the migration with a MySQL 8 window query. First insert one recoverable audit snapshot per stale row:

```sql
SET @message_reaction_slot_cleanup_at = CURRENT_TIMESTAMP(3);

INSERT INTO `audit_logs` (
  `actor_id`, `action`, `target_type`, `target_id`,
  `ip`, `user_agent`, `metadata`, `created_at`, `updated_at`, `deleted_at`
)
SELECT
  NULL,
  'migration.im.reaction_slot_cleanup',
  'MessageReaction',
  stale.`id`,
  NULL,
  NULL,
  JSON_OBJECT(
    'migration', '20260830090000_message_reaction_slots',
    'previousUpdatedAt', DATE_FORMAT(stale.`updated_at`, '%Y-%m-%dT%H:%i:%s.%fZ')
  ),
  @message_reaction_slot_cleanup_at,
  @message_reaction_slot_cleanup_at,
  NULL
FROM (
  SELECT `id`, `updated_at`
  FROM (
    SELECT
      `id`,
      `updated_at`,
      ROW_NUMBER() OVER (
        PARTITION BY
          `message_id`,
          `user_id`,
          CASE
            WHEN `emoji` IN ('OK', 'NO', 'Pending') THEN 'judgement'
            ELSE 'emoji'
          END
        ORDER BY `updated_at` DESC, `id` DESC
      ) AS `reaction_rank`
    FROM `message_reactions`
    WHERE `deleted_at` IS NULL
  ) AS ranked_reactions
  WHERE `reaction_rank` > 1
) AS stale;
```

Then soft-delete exactly the IDs recorded by this migration:

```sql
UPDATE `message_reactions` AS duplicate
JOIN `audit_logs` AS cleanup
  ON cleanup.`target_type` = 'MessageReaction'
  AND cleanup.`target_id` = duplicate.`id`
  AND cleanup.`action` = 'migration.im.reaction_slot_cleanup'
  AND JSON_UNQUOTE(JSON_EXTRACT(cleanup.`metadata`, '$.migration'))
    = '20260830090000_message_reaction_slots'
  AND cleanup.`deleted_at` IS NULL
SET
  duplicate.`deleted_at` = @message_reaction_slot_cleanup_at,
  duplicate.`updated_at` = @message_reaction_slot_cleanup_at;
```

This is intentionally a soft cleanup. Join the UPDATE back to the active audit rows with the exact migration name, so the audit snapshot is the rollback authority. Do not add a misleading exact-emoji unique constraint as a substitute for category enforcement; the existing exact-value uniqueness and application row lock serve different purposes.

- [ ] **Step 4: Add an exact rollback artifact**

Create `rollback.sql` in the same migration directory. It must use the audit timestamp guard so a reaction changed again after migration is not overwritten:

```sql
-- WARNING: run only while rolling back the matching application enforcement.
UPDATE `message_reactions` AS reaction
JOIN `audit_logs` AS cleanup
  ON cleanup.`target_type` = 'MessageReaction'
  AND cleanup.`target_id` = reaction.`id`
  AND cleanup.`action` = 'migration.im.reaction_slot_cleanup'
  AND JSON_UNQUOTE(JSON_EXTRACT(cleanup.`metadata`, '$.migration'))
    = '20260830090000_message_reaction_slots'
  AND cleanup.`deleted_at` IS NULL
  AND reaction.`deleted_at` = cleanup.`created_at`
  AND reaction.`updated_at` = cleanup.`created_at`
SET
  reaction.`deleted_at` = NULL,
  reaction.`updated_at` = STR_TO_DATE(
    JSON_UNQUOTE(JSON_EXTRACT(cleanup.`metadata`, '$.previousUpdatedAt')),
    '%Y-%m-%dT%H:%i:%s.%fZ'
  );

UPDATE `audit_logs` AS cleanup
JOIN `message_reactions` AS reaction
  ON reaction.`id` = cleanup.`target_id`
  AND reaction.`deleted_at` IS NULL
  AND reaction.`updated_at` = STR_TO_DATE(
    JSON_UNQUOTE(JSON_EXTRACT(cleanup.`metadata`, '$.previousUpdatedAt')),
    '%Y-%m-%dT%H:%i:%s.%fZ'
  )
SET cleanup.`deleted_at` = CURRENT_TIMESTAMP(3),
    cleanup.`updated_at` = CURRENT_TIMESTAMP(3)
WHERE cleanup.`action` = 'migration.im.reaction_slot_cleanup'
  AND JSON_UNQUOTE(JSON_EXTRACT(cleanup.`metadata`, '$.migration'))
    = '20260830090000_message_reaction_slots'
  AND cleanup.`deleted_at` IS NULL;
```

It must:

1. restore only `message_reactions.id` values recorded under `migration.im.reaction_slot_cleanup` and migration name `20260830090000_message_reaction_slots`;
2. set `deleted_at = NULL` and restore the recorded `previousUpdatedAt` value;
3. soft-delete the consumed cleanup audit rows rather than deleting them;
4. include a warning that it reintroduces the pre-migration multi-reaction state and must be run only when the application enforcement is also rolled back.

The migration contract test must inspect both files and prove that the rollback scopes by action, migration name, and target ID. Prisma must not execute `rollback.sql` during deploy; it is an explicit operator recovery artifact.

- [ ] **Step 5: Add a read-only database checker**

Create `backend/scripts/check-message-reaction-slots.ts`. It must query active rows grouped by the same category expression and return non-zero if any `messageId + userId + category` count exceeds one:

```ts
const duplicates = await prisma.$queryRaw<Array<{
  messageId: number;
  userId: number;
  category: "judgement" | "emoji";
  activeCount: bigint;
}>>`
  SELECT
    message_id AS messageId,
    user_id AS userId,
    CASE WHEN emoji IN ('OK', 'NO', 'Pending') THEN 'judgement' ELSE 'emoji' END AS category,
    COUNT(*) AS activeCount
  FROM message_reactions
  WHERE deleted_at IS NULL
  GROUP BY message_id, user_id, category
  HAVING COUNT(*) > 1
`;
```

Print a compact JSON result and always disconnect Prisma. Add:

```json
"check:message-reaction-slots": "ENV_FILE=.env.dev tsx scripts/check-message-reaction-slots.ts"
```

- [ ] **Step 6: Run static tests, then audit migration safety before any local apply**

Run:

```bash
npm test -- --runInBand tests/message-reaction-slots-migration.test.ts
npm run prisma:status
npm run check:message-reaction-slots
```

Working directory: `backend`. The checker may intentionally return non-zero before cleanup if historical duplicate slots exist; record that baseline instead of masking it.

If and only if migration status, `_prisma_migrations`, actual tables, and the list of pending repository migrations are reconciled, apply through Prisma and rerun the read-only checker:

```bash
npm run prisma:migrate:deploy
npm run check:message-reaction-slots
```

Expected: the static test passes and, after a safe apply, the checker reports no duplicate active slots. Do **not** run `prisma migrate deploy` if repository migrations, `_prisma_migrations`, or actual schema are inconsistent, or if unrelated pending migrations would be applied. Stop and report that dependency instead of forcing this migration.

- [ ] **Step 7: Commit migration and checker**

```bash
git add backend/prisma/migrations/20260830090000_message_reaction_slots/migration.sql backend/prisma/migrations/20260830090000_message_reaction_slots/rollback.sql backend/tests/message-reaction-slots-migration.test.ts backend/scripts/check-message-reaction-slots.ts backend/package.json
git commit -m "feat: reconcile historical IM reaction slots"
```

---

## Task 5: Render judgement and emoji as independently disabled UI groups

**Files:**

- Modify: `src/features/im/components.tsx`
- Modify: `src/features/im/components.action-menu.test.tsx`
- Modify: `src/features/im/pages.test.ts`

- [ ] **Step 1: Add failing DOM tests for action-sheet state**

Render `ImMessageActionSheet` with these new props:

```tsx
selectedJudgement="OK"
selectedEmoji="😂"
pendingCategory={undefined}
```

Assert:

- separate `data-im-message-reaction-group="judgement"` and `"emoji"` sections;
- `OK`, `NO`, and `Pending` are all present only in the judgement group;
- `OK` and `😂` have `aria-pressed="true"` and are not disabled;
- `NO`, `Pending`, and every emoji other than `😂` are natively disabled;
- clicking a disabled button never calls `onReact`;
- clicking selected `OK` and `😂` calls `onReact` once with the selected value;
- `pendingCategory="judgement"` disables all three judgement buttons without disabling emoji controls.

Update compact/full-width assertions to count each group separately rather than treating reactions as one row.

- [ ] **Step 2: Run the action-menu test and observe missing props/groups**

Run:

```bash
npm test -- src/features/im/components.action-menu.test.tsx
```

Expected: FAIL because the action sheet still renders one mixed quick-reaction row.

- [ ] **Step 3: Extend `ImReactionButton` without blackening the selected reply**

Add `selected` and `disabled` props, native semantics, and a component-boundary click guard:

```tsx
<button
  aria-pressed={selected}
  data-im-reaction-selected={selected ? "true" : "false"}
  disabled={disabled}
  onClick={disabled ? undefined : onClick}
  type="button"
>
```

Use a light primary tint/ring for selected state. Use muted gray plus `cursor-not-allowed` for disabled state. Do not use a black selected background, and do not let the disabled class override the selected class because selected buttons remain enabled except while their category request is pending.

- [ ] **Step 4: Split the action sheet into two groups**

Change `ImMessageActionSheet` props to include:

```ts
selectedJudgement?: string;
selectedEmoji?: string;
pendingCategory?: ImReactionCategory;
```

Render:

- “判断回复”: `IM_JUDGEMENT_REPLIES` (`OK`, `NO`, `Pending`);
- “表情回复”: `IM_QUICK_EMOJI_REPLIES` plus the expandable default emoji catalog.

Filter `OK`, `NO`, and `Pending` out of the default catalog defensively with `getImReactionCategory(value) === "emoji"`. Derive every button's disabled state through `isImReactionChoiceDisabled`, so an occupied emoji slot also disables emojis in the expanded catalog.

- [ ] **Step 5: Add source-contract assertions**

Update `src/features/im/pages.test.ts` so it no longer expects the old mixed `imQuickReactions` constant. Assert the page passes selected slots and category pending state to `ImMessageActionSheet`.

- [ ] **Step 6: Run component and source-contract tests**

Run:

```bash
npm test -- src/features/im/components.action-menu.test.tsx src/features/im/pages.test.ts
```

Expected: PASS with no mobile-width count regression.

- [ ] **Step 7: Commit the action-sheet UI**

```bash
git add src/features/im/components.tsx src/features/im/components.action-menu.test.tsx src/features/im/pages.test.ts
git commit -m "feat: split IM judgement and emoji controls"
```

---

## Task 6: Replace optimistic reaction flashes with authoritative request handling

**Files:**

- Modify: `src/features/im/reaction-policy.ts`
- Modify: `src/features/im/reaction-policy.test.ts`
- Modify: `src/features/im/pages.tsx`
- Modify: `src/features/im/pages.test.ts`
- Modify: `src/i18n/translations.ts`

- [ ] **Step 1: Add failing error-copy and authoritative-flow tests**

In `reaction-policy.test.ts`, construct `ApiClientError` values and assert:

```ts
expect(getImReactionFailureMessage(new ApiClientError(
  "error.im.reaction_slot_occupied", 40946, 409
))).toBe("请先取消已发送的同类回复");

expect(getImReactionFailureMessage(new ApiClientError(
  "error.rate_limit", 42903, 429
))).toBe("操作过于频繁，请稍后重试");

expect(getImReactionFailureMessage(new Error("network")))
  .toBe("回复操作失败，请稍后重试");
```

Update the page contract test to require a category key such as `${message.id}:${getImReactionCategory(reaction)}`, require `.catch((error) => setActionNotice(...))`, and forbid the old optimistic `setMessageReactions` block before the API call.

- [ ] **Step 2: Run the focused tests and observe failures**

Run:

```bash
npm test -- src/features/im/reaction-policy.test.ts src/features/im/pages.test.ts
```

Expected: FAIL because errors are silently rolled back and pending is keyed by individual reaction value.

- [ ] **Step 3: Add category-pending state that rerenders the menu**

Retain a ref to suppress same-tick duplicate clicks, but also add render state so disabled props update:

```ts
const reactionPendingKeysRef = useRef(new Set<string>());
const [reactionPendingKeys, setReactionPendingKeys] = useState<Set<string>>(() => new Set());
```

Key by `message.id + category`, not by reaction value. A judgement and emoji request can proceed independently; two requests in the same category cannot.

- [ ] **Step 4: Derive selected values from the current user's authoritative summaries**

For `menuState.message.id`, pass the result of:

```ts
deriveCurrentUserReactionSlots(
  messageReactions[menuState.message.id] ?? {},
  currentReactionPerson.id
)
```

to the action sheet. This must use the current user only; another participant's reply never disables the current user's choices.

- [ ] **Step 5: Rewrite `toggleMessageReaction` without optimistic mutation**

The function must:

1. derive the category and category pending key;
2. return before store access when that category is pending;
3. determine whether the clicked value is the currently selected value;
4. mark only that category pending;
5. call `store.setMessageReaction(..., !reactedByMe)`;
6. replace local groups only from `savedMessage.reactions` on success;
7. close the action sheet after success when `closeAfter` is true;
8. preserve the existing groups and show mapped failure copy on rejection;
9. clear both the ref and render pending state in `finally`.

There must be no pre-request `setMessageReactions` call and no captured `previousState` rollback. The old confirmed summary remains visible throughout a cancellation request; a new summary appears only after a successful server response.

- [ ] **Step 6: Keep message-summary cancellation category-safe**

Sort `getMessageReactionSummaries` with `sortImReactionSummaries`. The existing selected summary click continues to call DELETE; pending prevents duplicate clicks. A judgement cancellation must not disable or remove the emoji summary, and vice versa.

- [ ] **Step 7: Add localized source strings**

Add translation entries for:

- `判断回复`
- `表情回复`
- `请先取消已发送的同类回复`
- `操作过于频繁，请稍后重试`
- `回复操作失败，请稍后重试`

Provide `zh-Hant`, `ja`, `en`, and `ko` values in `src/i18n/translations.ts`; keep `OK`, `NO`, and `Pending` unchanged.

- [ ] **Step 8: Run focused frontend tests**

Run:

```bash
npm test -- src/features/im/reaction-policy.test.ts src/features/im/components.action-menu.test.tsx src/features/im/pages.test.ts src/features/im/store.test.ts src/features/im/formal-api.test.ts
```

Expected: PASS. Existing `reactionVersion` stale-snapshot tests must remain green.

- [ ] **Step 9: Commit authoritative frontend behavior**

```bash
git add src/features/im/reaction-policy.ts src/features/im/reaction-policy.test.ts src/features/im/pages.tsx src/features/im/pages.test.ts src/i18n/translations.ts
git commit -m "fix: keep IM reaction state server authoritative"
```

---

## Task 7: Update formal documentation and complete end-to-end verification

**Files:**

- Modify: `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`
- Modify only if current behavior is documented there: `README.md`
- Create: `docs/verification/2026-08-30-im-quick-response-slots.md`

- [ ] **Step 1: Update the formal IM contract documentation**

Document:

- judgement values `OK`, `NO`, `Pending`;
- one judgement plus one emoji per user/message;
- same-value PUT idempotence and different-value same-category 409;
- exact-value DELETE and `reactionVersion` SSE/REST ordering;
- historical soft-cleanup migration and read-only duplicate checker.

Do not describe the old unlimited same-user emoji behavior as supported.

- [ ] **Step 2: Run the complete backend verification**

Run from `backend`:

```bash
npm test -- --runInBand tests/message-reaction-policy.test.ts tests/im-message-reaction.repository.test.ts tests/message-reaction-slots-migration.test.ts tests/realtime-service.test.ts tests/realtime-api.test.ts tests/openapi.test.ts
npm run lint
npm run build
npm run check:message-reaction-slots
```

Expected: all focused tests, lint, and build pass; the read-only checker returns `ready: true` after the migration is safely applied, or the verification note explicitly records why local migration application remains blocked.

- [ ] **Step 3: Run the complete frontend verification**

Run from the repository root:

```bash
npm test -- src/features/im/reaction-policy.test.ts src/features/im/components.action-menu.test.tsx src/features/im/pages.test.ts src/features/im/store.test.ts src/features/im/formal-api.test.ts
npm run lint
npm run i18n:audit
npm run verify:production-build
```

Expected: tests, typecheck, i18n audit, formal build, and production-bundle audit pass.

- [ ] **Step 4: Verify the local formal runtime before UI acceptance**

Check listeners and health without changing data:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:5180 -sTCP:LISTEN
lsof -nP -iTCP:3307 -sTCP:LISTEN
lsof -nP -iTCP:6379 -sTCP:LISTEN
curl -s http://127.0.0.1:3000/api/v1/health
curl -s http://127.0.0.1:3000/api/v1/ready
curl -I -s http://127.0.0.1:5180/user.html
```

Expected: backend health and readiness succeed and the formal frontend returns HTTP 200. Restart only the affected local service if necessary; do not switch to the legacy mock backend.

- [ ] **Step 5: Perform 5180 browser acceptance with two real test accounts**

Use the browser-control skill and a message whose original reaction state is recorded first. Prefer an existing message with no current-user reactions; after the test, remove only reactions created by this acceptance run and verify restoration.

For account A:

1. Open the message action sheet at mobile width and select `OK`.
2. Reopen the sheet and verify `OK` is selected/enabled while `NO` and `Pending` are gray, have `disabled === true`, and clicking them creates no network request.
3. Select one emoji and verify a judgement plus an emoji are both visible below the message.
4. Reopen the sheet and verify the selected emoji is enabled while every other quick and expanded emoji is disabled.
5. Wait at least 1.2 seconds, reload, and verify both values persist.
6. Click the selected judgement summary to cancel; verify all judgement options re-enable and the emoji remains.
7. Click the selected emoji summary to cancel; verify all emoji options re-enable.
8. Trigger or simulate a controlled 409/429 only through safe local test setup; verify the confirmed UI remains unchanged and the explicit notice is shown. Do not spam the shared rate limiter.

For account B:

1. Observe account A's add/remove changes through SSE without reload.
2. Confirm account A's choices do not disable account B's controls.
3. Add its own judgement and emoji, reload, and confirm independent persistence.

At both desktop and mobile widths, inspect console errors, horizontal overflow, selected styling, and the expanded catalog.

- [ ] **Step 6: Record evidence and cleanup**

Create `docs/verification/2026-08-30-im-quick-response-slots.md` containing:

- commit(s) tested;
- test/build command results;
- local service/health results;
- conversation/message IDs used;
- before/after reaction snapshot and cleanup result;
- account A/account B outcomes;
- reload and SSE evidence;
- mobile viewport and console/overflow results;
- any migration application blocker, clearly separated from code verification.

- [ ] **Step 7: Commit documentation and verification evidence**

```bash
git add docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md docs/verification/2026-08-30-im-quick-response-slots.md
git add README.md  # only when Task 7 Step 1 actually changed it
git commit -m "docs: verify IM quick response slots"
```

---

## Final Acceptance Checklist

- [ ] One user can persist exactly one judgement and one emoji on one message.
- [ ] A second different value in an occupied category never writes and returns 409.
- [ ] Same-value PUT is idempotent and click-again DELETE cancels the selected value.
- [ ] Unselected same-category controls are gray, natively disabled, and send no request.
- [ ] The selected control is highlighted, not black/gray, and remains clickable.
- [ ] Other users' controls and reactions remain independent.
- [ ] 409, 429, network, and 5xx failures do not create a transient reaction summary.
- [ ] Older REST/SSE `reactionVersion` snapshots cannot overwrite newer state.
- [ ] Historical duplicates are soft-deleted deterministically or migration application is explicitly blocked with evidence.
- [ ] Focused tests, lint, i18n audit, backend build, and formal production build pass.
- [ ] 5180 browser acceptance passes after delay, reload, two-account SSE observation, and cleanup.
- [ ] No unrelated files, production data, push, or deployment are included.
