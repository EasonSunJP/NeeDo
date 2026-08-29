# IM Conversation Media Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace media URLs in the IM conversation list with stable media-type labels or the original uploaded filename.

**Architecture:** Keep raw message content and attachment URLs unchanged. Extend the existing `buildMessagePreview` domain formatter, then make the formal IM adapter use that formatter after restoring the rich message type and metadata. This keeps optimistic sends, summary recomputation, formal bootstrap, and formal reloads on one preview contract.

**Tech Stack:** React 19, TypeScript 5.9, Vitest 4, Vite 7, existing NeeDo IM model/formal adapter, existing DOM translation provider.

## Global Constraints

- Image preview is exactly `图片`; video preview is exactly `视频`; voice/audio preview is exactly `音频`.
- PDF, Word, Excel, ZIP, and every other ordinary file display the non-empty original `ext.fileName`.
- A file without a usable filename displays `文件`; no media fallback may expose `content`, `ext.url`, or another resource URL.
- Text, emoji, recall, system, location, contact-card, service-card, and schedule-invite semantics remain unchanged.
- Raw chat messages, download URLs, media metadata, media upload, storage, database schema, migrations, backend APIs, and OpenAPI remain unchanged.
- Add no mock, placeholder, fake API, parallel IM page, package, or broad refactor.
- Add `音频` to the existing Simplified Chinese source plus Traditional Chinese, Japanese, English, and Korean translation map; user-provided filenames are never translated.
- Preserve unrelated working-tree changes and stage only files owned by the current task.

---

### Task 1: Define the shared media-preview contract

**Files:**
- Create: `src/features/im/model.media-preview.test.ts`
- Modify: `src/features/im/model.ts:962-1004`
- Modify: `src/i18n/translations.ts:12426-12427`
- Modify: `src/i18n/translations.test.ts:315-340`

**Interfaces:**
- Consumes: `buildMessagePreview(message: ConversationMessage, currentUserId: string, users: Record<string, ImUser>): string` and `MessageExt.fileName?: string`.
- Produces: the same `buildMessagePreview` signature with the approved media-label and file-name behavior; the new translation source key `音频`.

- [ ] **Step 1: Write the failing media-preview tests**

Create `src/features/im/model.media-preview.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildMessagePreview,
  type ConversationMessage,
  type MessageExt,
} from "./model";

function message(
  type: ConversationMessage["type"],
  content: string,
  ext?: MessageExt,
): ConversationMessage {
  return {
    id: "message-1",
    localId: "message-1",
    conversationId: "conversation-1",
    senderId: "user-2",
    type,
    content,
    status: "sent",
    sentAt: "2026-08-30T00:00:00.000Z",
    clientSeq: 1,
    ext,
  };
}

describe("buildMessagePreview media summaries", () => {
  it.each([
    ["image", "图片"],
    ["video", "视频"],
    ["voice", "音频"],
  ] as const)("shows %s as its media type instead of its URL", (type, expected) => {
    const preview = buildMessagePreview(
      message(type, `https://media.example.test/${type}/opaque-resource`, {
        url: `https://media.example.test/${type}/opaque-resource`,
        caption: type === "image" ? "不会覆盖图片类型摘要" : undefined,
      }),
      "user-1",
      {},
    );

    expect(preview).toBe(expected);
    expect(preview).not.toContain("https://");
  });

  it("shows the original filename for PDF and other ordinary files", () => {
    const preview = buildMessagePreview(
      message("file", "https://media.example.test/files/opaque-resource", {
        fileName: "报价单.pdf",
        mimeType: "application/pdf",
        url: "https://media.example.test/files/opaque-resource",
      }),
      "user-1",
      {},
    );

    expect(preview).toBe("报价单.pdf");
  });

  it("uses the safe file label when the original filename is absent or blank", () => {
    expect(
      buildMessagePreview(
        message("file", "https://media.example.test/files/opaque-resource", {
          fileName: "   ",
          url: "https://media.example.test/files/opaque-resource",
        }),
        "user-1",
        {},
      ),
    ).toBe("文件");
  });

  it("keeps text previews unchanged", () => {
    expect(
      buildMessagePreview(message("text", "明天下午三点可以。"), "user-1", {}),
    ).toBe("明天下午三点可以。");
  });
});
```

Add these assertions to the existing IM translation block in `src/i18n/translations.test.ts`:

```ts
expect(translateText("音频", "zh-Hant")).toBe("音訊");
expect(translateText("音频", "ja")).toBe("オーディオ");
expect(translateText("音频", "en")).toBe("Audio");
expect(translateText("音频", "ko")).toBe("오디오");
```

- [ ] **Step 2: Run the tests and verify the intended failures**

Run:

```bash
npm test -- src/features/im/model.media-preview.test.ts src/i18n/translations.test.ts
```

Expected: FAIL because the current formatter returns bracketed media labels, returns `[文件]` instead of the filename, preserves an image caption, and `音频` has no translation row.

- [ ] **Step 3: Implement the minimal shared formatter and translation row**

Replace only the four media branches in `buildMessagePreview`:

```ts
if (message.type === "image") {
  return "图片";
}

if (message.type === "voice") {
  return "音频";
}

if (message.type === "video") {
  return "视频";
}

if (message.type === "file") {
  return message.ext?.fileName?.trim() || "文件";
}
```

Add this entry beside the existing `音乐和音频` translation row:

```ts
"音频": { "zh-Hant": "音訊", ja: "オーディオ", en: "Audio", ko: "오디오" },
```

- [ ] **Step 4: Run the focused tests and i18n audit**

Run:

```bash
npm test -- src/features/im/model.media-preview.test.ts src/i18n/translations.test.ts
npm run i18n:audit
```

Expected: both test files PASS and the i18n audit exits 0 without missing-key or malformed-row errors.

- [ ] **Step 5: Commit the shared formatter**

```bash
git add src/features/im/model.ts src/features/im/model.media-preview.test.ts src/i18n/translations.ts src/i18n/translations.test.ts
git commit -m "fix: format IM media conversation previews"
```

---

### Task 2: Route formal conversation summaries through the shared formatter

**Files:**
- Modify: `src/features/im/formal-api.test.ts:10-110`
- Modify: `src/features/im/formal-api.ts:17-31`
- Modify: `src/features/im/formal-api.ts:407-433`

**Interfaces:**
- Consumes: the Task 1 `buildMessagePreview(message, currentUserId, users)` behavior and the existing `toConversationMessage(message: RealtimeMessage): ConversationMessage` rich-message restoration.
- Produces: formal `Conversation.lastMessagePreview` values that never expose media resource URLs.

- [ ] **Step 1: Write the failing formal-adapter regression test**

Add the following focused test inside `describe("formal IM adapter", ...)` in `src/features/im/formal-api.test.ts`:

```ts
it("maps rich formal last messages to safe conversation previews", async () => {
  const participants = [
    {
      userId: 100,
      needoId: "u0000000100",
      username: "测试用户",
      avatarUrl: null,
    },
    {
      userId: 201,
      needoId: "u0000000201",
      username: "文件发送者",
      avatarUrl: null,
    },
  ];
  const richConversation = (
    id: number,
    needoMessageType: "image" | "voice" | "video" | "file",
    fileName?: string,
  ) => {
    const url = `http://localhost:3000/media/im/opaque-${id}`;
    return {
      id,
      type: "direct" as const,
      title: null,
      participants,
      lastMessage: {
        id: id * 10,
        conversationId: id,
        senderUserId: 201,
        type: "text" as const,
        content: url,
        metadata: {
          needoMessageType,
          needoMessageExt: { fileName, url },
        },
        createdAt: now,
      },
      unreadCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  };

  vi.spyOn(realtimeApi, "listConversations").mockResolvedValue({
    list: [
      richConversation(91, "image", "album.png"),
      richConversation(92, "voice", "voice.webm"),
      richConversation(93, "video", "movie.mp4"),
      richConversation(94, "file", "报价单.pdf"),
    ],
    total: 4,
    page: 1,
    page_size: 100,
  });
  vi.spyOn(realtimeApi, "listContacts").mockResolvedValue({
    list: [],
    total: 0,
    page: 1,
    page_size: 100,
  });
  vi.spyOn(realtimeApi, "listFriendRequests").mockResolvedValue({
    list: [],
    total: 0,
    page: 1,
    page_size: 100,
  });

  const api = createFormalImApi({
    currentUser: {
      id: 100,
      needoId: "u0000000100",
      username: "测试用户",
      avatarUrl: null,
    },
    scope: "user",
  });
  const bootstrap = await api.bootstrap();
  const previews = Object.fromEntries(
    bootstrap.conversations.map((conversation) => [
      conversation.id,
      conversation.lastMessagePreview,
    ]),
  );

  expect(previews).toEqual({
    "91": "图片",
    "92": "音频",
    "93": "视频",
    "94": "报价单.pdf",
  });
  expect(Object.values(previews).join(" ")).not.toContain("/media/im/");
});
```

- [ ] **Step 2: Run the formal-adapter test and verify RED**

Run:

```bash
npm test -- src/features/im/formal-api.test.ts
```

Expected: FAIL with the current `http://localhost:3000/media/im/opaque-*` values received instead of the four approved summaries.

- [ ] **Step 3: Reuse the shared formatter in the formal adapter**

Add the value import without changing the existing type-only import:

```ts
import { buildMessagePreview } from "./model";
```

Replace the formal conversation preview assignment in `toConversation`:

```ts
lastMessagePreview: lastMessage
  ? buildMessagePreview(lastMessage, String(currentUserId), {})
  : "",
```

Do not inspect the URL, MIME suffix, or raw backend metadata again at this layer; `toConversationMessage` is the only metadata-to-view-model adapter.

- [ ] **Step 4: Run the formal adapter and shared model tests**

Run:

```bash
npm test -- src/features/im/formal-api.test.ts src/features/im/model.media-preview.test.ts
```

Expected: both files PASS, including the URL non-disclosure assertions.

- [ ] **Step 5: Commit the formal adapter integration**

```bash
git add src/features/im/formal-api.ts src/features/im/formal-api.test.ts
git commit -m "fix: hide media URLs in formal IM summaries"
```

---

### Task 3: Run regression, production, and visible-browser acceptance

**Files:**
- Verify only: `src/features/im/model.media-preview.test.ts`
- Verify only: `src/features/im/formal-api.test.ts`
- Verify only: `src/i18n/translations.test.ts`
- Verify only: formal customer IM route at `http://127.0.0.1:5180/user.html#/messages`

**Interfaces:**
- Consumes: Tasks 1-2 completed commits.
- Produces: fresh automated, build, service-health, and browser evidence for the approved behavior.

- [ ] **Step 1: Run the complete relevant IM and translation regression**

Run:

```bash
npm test -- src/features/im/model.media-preview.test.ts src/features/im/formal-api.test.ts src/features/im/store.test.ts src/features/im/pages.test.tsx src/i18n/translations.test.ts
```

Expected: every selected test file PASS with 0 failed tests.

- [ ] **Step 2: Run static and production verification**

Run:

```bash
npm run lint
npm run verify:production-build
git diff --check
```

Expected: TypeScript lint exits 0, the formal Vite production build and bundle audit exit 0, and `git diff --check` prints no errors.

- [ ] **Step 3: Confirm or start the formal local runtime**

Check the existing services:

```bash
curl -s http://127.0.0.1:3000/api/v1/health
curl -s http://127.0.0.1:3000/api/v1/ready
curl -I -s http://127.0.0.1:5180/user.html
```

Expected: backend reports healthy and ready, and the frontend responds HTTP 200. If the services are absent, run `npm run dev` in a persistent terminal, wait for readiness, and repeat the checks.

- [ ] **Step 4: Verify the real image and audio list summaries in the browser**

Using an authenticated formal test account and the existing real IM conversation:

1. Open `http://127.0.0.1:5180/user.html#/messages` in the actual mobile viewport.
2. Enter a conversation and send a real image through the existing image upload flow.
3. Return to the conversation list and verify the newest summary is `图片`, not an `http://`, `https://`, `/media/im/`, `blob:`, or `data:` value.
4. Reload the page and verify the persisted formal conversation still shows `图片`.
5. If microphone access is available, send a real audio message, return to the list, and verify the newest summary is `音频` before and after reload.
6. Confirm the list remains single-line truncated, has no horizontal overflow, and produces no new console or failed-network errors.

Expected: visible list behavior matches the automated formatter and formal-adapter tests. Do not create fake video/file messages or add upload capability solely for acceptance; video and arbitrary-file variants are covered by the formal payload regression test unless equivalent persisted real messages already exist.

- [ ] **Step 5: Review the final task-only diff and status**

Run:

```bash
git status --short
git diff HEAD~2 -- src/features/im/model.ts src/features/im/model.media-preview.test.ts src/features/im/formal-api.ts src/features/im/formal-api.test.ts src/i18n/translations.ts src/i18n/translations.test.ts
git log -3 --oneline
```

Expected: only the approved formatter, adapter, translation, and regression-test changes appear in the two implementation commits; unrelated user changes remain untouched. Do not create an empty verification commit.
