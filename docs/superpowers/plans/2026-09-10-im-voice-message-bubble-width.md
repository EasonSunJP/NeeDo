# IM Voice Message Bubble Width Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give voice messages enough responsive horizontal space for the browser audio player's progress and volume controls without changing other message bubble widths.

**Architecture:** Keep the change inside the shared `MessageBubble`. A voice-only outer column width reserves the available row width up to 320px, while the voice shell, content, retry control, and `<audio>` element fill that width; all non-voice branches retain their existing layout rules.

**Tech Stack:** React 19, TypeScript, Tailwind utility classes, Vitest, jsdom

## Global Constraints

- Change only shared IM voice-message width styling, tests, and the Step 13 completion note.
- Do not change recording, upload, sending, playback events, API, database, message schema, or user-visible copy.
- Do not add mocks, placeholders, dependencies, or a parallel audio player.
- Voice width must shrink without horizontal page overflow at a 320px viewport.
- Text, emoji, image, video, file, card, recalled, and system message width behavior must remain unchanged.
- Local verification does not establish remote push, deployment, installed-PWA, or physical-device acceptance.

---

### Task 1: Make the shared voice bubble responsively wider

**Files:**
- Modify: `src/features/im/components.media.test.tsx`
- Modify: `src/features/im/components.tsx:4282-4313,4778-4804`
- Modify: `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`

**Interfaces:**
- Consumes: `MessageBubble({ message, isMine })` and the existing `ConversationMessage` voice projection.
- Produces: no new exported API; only a voice-specific responsive width contract expressed by DOM utility classes.

- [ ] **Step 1: Write the failing regression test**

Add this test to `src/features/im/components.media.test.tsx`:

```tsx
it("gives only voice messages the wider responsive player layout", async () => {
  await act(async () => root.render(<MessageBubble isMine={false} message={message("voice")} />));

  const voiceBubble = container.querySelector<HTMLElement>("[data-im-message-bubble='true']")!;
  const voiceColumn = voiceBubble.parentElement!;
  const audio = voiceBubble.querySelector<HTMLAudioElement>("audio")!;

  expect(voiceColumn.className).toContain("w-[calc(100%-3.25rem)]");
  expect(voiceColumn.className).toContain("max-w-[320px]");
  expect(voiceBubble.className).toContain("w-full");
  expect(audio.className).toContain("w-full");
  expect(audio.className).not.toContain("max-w-[220px]");

  await act(async () => root.render(<MessageBubble isMine={false} message={{ ...message("voice"), type: "text", content: "ordinary" }} />));

  const textBubble = container.querySelector<HTMLElement>("[data-im-message-bubble='true']")!;
  expect(textBubble.parentElement?.className).toContain("max-w-[78%]");
  expect(textBubble.parentElement?.className).not.toContain("max-w-[320px]");
  expect(textBubble.className).not.toContain("w-full");
});
```

- [ ] **Step 2: Run the test and verify the expected RED state**

Run:

```bash
npm test -- src/features/im/components.media.test.tsx
```

Expected: FAIL in `gives only voice messages the wider responsive player layout` because the voice column does not contain `w-[calc(100%-3.25rem)]` or `max-w-[320px]`, and the player still contains `max-w-[220px]`.

- [ ] **Step 3: Implement the minimal voice-only width change**

In the `message.type === "voice"` branch of `src/features/im/components.tsx`, replace the width classes as follows:

```tsx
if (message.type === "voice") {
  return (
    <div className="w-full space-y-2">
      <div className="flex items-center gap-2">
        <ImIcon className="h-4 w-4" name="mic" />
        <div className="h-0.5 flex-1 rounded-full bg-black/20" />
        <span className="text-sm">{message.ext?.duration ?? 0}"</span>
      </div>
      {mediaLoad.failed ? (
        <button
          className="block w-full rounded-2xl bg-black/10"
          onClick={(event) => {
            event.stopPropagation();
            mediaLoad.retry();
          }}
          type="button"
        >
          <MediaLoadFeedback kind="voice" />
        </button>
      ) : (
        <audio
          className="block h-10 w-full"
          controls
          key={mediaLoad.key}
          onError={mediaLoad.onError}
          onLoadedMetadata={mediaLoad.onLoad}
          preload="metadata"
          src={mediaSource}
        />
      )}
    </div>
  );
}
```

Replace the outer message-column width selection with this voice-specific branch:

```tsx
className={cn(
  "flex flex-col",
  message.type === "contact-card"
    ? "max-w-[calc(100%-3.25rem)]"
    : message.type === "voice"
      ? "w-[calc(100%-3.25rem)] max-w-[320px]"
      : "max-w-[78%]",
  isMine ? "items-end" : "items-start",
)}
```

Add `message.type === "voice" && "w-full"` to the bubble shell class list:

```tsx
className={cn(
  "inline-flex min-w-0 max-w-full overflow-hidden",
  message.type === "voice" && "w-full",
  bubbleShellClass,
)}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm test -- src/features/im/components.media.test.tsx
```

Expected: PASS with all tests in the file green, including voice failure/retry behavior and the new width contract.

- [ ] **Step 5: Run related shared-message regression tests**

Run:

```bash
npm test -- src/features/im/components.media.test.tsx src/features/im/components.action-menu.test.tsx src/features/im/pages.test.tsx
```

Expected: PASS with zero failed tests.

- [ ] **Step 6: Update the Step 13 completion note**

Add a dated local completion subsection near the top of `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`:

```markdown
### 语音消息播放器气泡宽度（2026-09-10，本地）

- 三端共享 `MessageBubble` 的语音消息改为使用头像旁可用宽度，并在宽屏封顶 320px；原生音频播放器随气泡全宽，不再受 220px 上限限制。
- 文字、图片、视频、文件和卡片消息继续使用原宽度规则；320px 窄屏保持可收缩且不应产生横向页面溢出。
- 本地自动化与浏览器验收分别记录；远程推送、部署、已安装 PWA 和实体设备验收不在本微步骤内。
```

- [ ] **Step 7: Run static and production-build verification**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands exit 0 with no TypeScript or Vite build errors.

- [ ] **Step 8: Verify the actual local serving provenance before browser acceptance**

Run:

```bash
lsof -nP -iTCP:5180 -sTCP:LISTEN
curl -s http://127.0.0.1:5180/src/features/im/components.tsx | rg 'max-w-\[320px\]|max-w-\[220px\]'
curl -s http://127.0.0.1:3000/api/v1/ready
```

Expected: the 5180 listener belongs to the intended local NeeDo checkout, the served source contains the new 320px voice rule and no voice-player 220px cap, and the formal API readiness endpoint succeeds. If the listener is absent, start the approved formal runtime with `npm run dev`; if another checkout owns it, do not use that page as acceptance evidence.

- [ ] **Step 9: Perform local browser width acceptance**

Open an authenticated formal conversation containing a voice message and verify at 390px and 320px viewport widths:

1. The voice bubble is visibly longer than before and the browser audio controls use the full bubble width.
2. The available progress and volume controls are operable at 390px; at 320px the native player may compact controls but must remain inside the message row.
3. `document.documentElement.scrollWidth <= document.documentElement.clientWidth`.
4. A text message and an image message retain their previous compact widths.
5. The console has no new error and the failed-audio retry state remains contained by the same voice bubble width.

- [ ] **Step 10: Review the final diff and commit only this microstep**

Run:

```bash
git diff --check -- src/features/im/components.tsx src/features/im/components.media.test.tsx docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md
git diff -- src/features/im/components.tsx src/features/im/components.media.test.tsx docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md
git status --short
```

Expected: no whitespace errors; the diff contains only the voice-width test, minimal voice-only styling, and Step 13 note. Preserve all unrelated dirty files.

Commit only these files:

```bash
git add -- src/features/im/components.tsx src/features/im/components.media.test.tsx docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md
git commit -m "fix(im): widen voice message player"
```
