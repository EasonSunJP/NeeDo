# IM Voice Audible Preview and Centered Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a stopped IM voice recording replay through an explicitly unmuted audio element, reject recordings whose microphone track stayed muted throughout capture, and place 1.5x controls in the middle of the recording overlay.

**Architecture:** Keep the existing `useImVoiceRecording` state machine and formal voice-send path. Harden only the browser media lifecycle in the hook, adjust only the shared overlay presentation, add one localized input-device error, and document the verified Step 13 behavior.

**Tech Stack:** React 19, TypeScript 5.9, MediaRecorder/MediaStreamTrack/HTMLAudioElement, Tailwind utility classes, Vitest 4 + jsdom, existing five-language i18n.

## Global Constraints

- This is one Step 13 frontend hardening microstep; do not change the backend, API, Prisma schema, migration history, or message-send contract.
- Do not add waveform analysis, RMS thresholds, AudioWorklet processing, mock product behavior, transcription, or another recording state machine.
- Recording/acquiring shows X + stop. Preview/playing/send-error shows X + replay + send. Sending keeps those controls disabled. Never display all four controls at once.
- Preserve the 59-second limit, automatic preview attempt, local Blob retry behavior, focus trap, background blur, object-URL cleanup, and route/unmount cleanup.
- Stage only the files named in each task. Preserve unrelated dirty and untracked files.
- Browser QA must not click send, because that would create a formal chat message.

## File and Responsibility Map

- Modify `src/features/im/useImVoiceRecording.ts`: microphone constraints, track mute lifecycle, audible playback preparation, readiness wait, and cancellation.
- Modify `src/features/im/useImVoiceRecording.test.tsx`: media-track and audio-readiness regression coverage.
- Modify `src/features/im/ImVoiceRecordingOverlay.tsx`: centered action group and 72px controls.
- Modify `src/features/im/ImVoiceRecordingOverlay.test.tsx`: control-set and layout assertions.
- Modify `src/features/im/pages.tsx`: map the new hook error key to source copy.
- Modify `src/features/im/pages.test.ts`: protect the error mapping integration.
- Modify `src/i18n/translations.ts` and `src/i18n/translations.test.ts`: localize the microphone-silence guidance in all five languages.
- Modify `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`: record only the behavior actually verified.

---

### Task 1: Harden capture and preview playback

**Files:**
- Modify: `src/features/im/useImVoiceRecording.test.tsx`
- Modify: `src/features/im/useImVoiceRecording.ts`

- [ ] **Step 1: Add failing capture and playback tests**

Replace the minimal track stub in the test setup with an event-capable audio track whose `muted` state can be changed:

```ts
class FakeAudioTrack extends EventTarget {
  readonly kind = "audio";
  readonly readyState = "live";
  muted = false;
  readonly stop = vi.fn();

  setMuted(value: boolean) {
    this.muted = value;
    this.dispatchEvent(new Event(value ? "mute" : "unmute"));
  }
}
```

Add tests proving:

```ts
expect(getUserMedia).toHaveBeenCalledWith({
  audio: {
    channelCount: { ideal: 1 },
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl: { ideal: true },
  },
});
```

Before each `play()` call, assert the element is prepared for audible output:

```ts
expect(audio.defaultMuted).toBe(false);
expect(audio.muted).toBe(false);
expect(audio.volume).toBe(1);
expect(audio.hasAttribute("playsinline")).toBe(true);
```

Cover these two track outcomes:

- A track that begins and remains `muted=true` produces no Blob URL, is not playable/sendable, returns to `idle`, and exposes `error.im.voice_input_muted`.
- A track that begins muted but emits `unmute` before stop produces the existing preview and auto-play attempt.

Add one readiness test that sets the preview audio to `HAVE_NOTHING`, verifies `play()` has not run, emits `canplay`, then verifies one play. Cancel before `canplay` in a second assertion and verify no stale play occurs.

- [ ] **Step 2: Run the hook test and verify RED**

Run:

```bash
npm test -- src/features/im/useImVoiceRecording.test.tsx
```

Expected: FAIL because capture still requests `{ audio: true }`, muted-track state is not monitored, and playback does not prepare/wait for the media element.

- [ ] **Step 3: Implement the smallest hook changes**

Add the exact ideal constraints without making unsupported ideals mandatory:

```ts
const VOICE_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: { ideal: 1 },
  echoCancellation: { ideal: true },
  noiseSuppression: { ideal: true },
  autoGainControl: { ideal: true },
};
```

After `getUserMedia`, find the first live audio track. Store whether it has ever been unmuted, listen for `mute`/`unmute`, and remove both listeners from every stop/cancel/error/unmount path. If the owned track stayed muted for the entire recording, stop and clean the stream, clear chunks/preview state, set `error.im.voice_input_muted`, and do not call `URL.createObjectURL`.

Before autoplay and replay, apply audible output state:

```ts
audio.defaultMuted = false;
audio.muted = false;
audio.volume = 1;
audio.setAttribute("playsinline", "");
```

If `audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA`, wait for the first `loadeddata` or `canplay`; reject the attempt on `error`. Store a cleanup callback so cancel, send, URL replacement, generation change, and unmount remove listeners and invalidate the pending attempt before it can call `play()`.

Keep the existing generation/URL/phase checks immediately before and after `play()` so late readiness and autoplay promises cannot overwrite `sending` or `idle`.

- [ ] **Step 4: Run the hook test and verify GREEN**

Run:

```bash
npm test -- src/features/im/useImVoiceRecording.test.tsx
```

Expected: PASS, including existing 59-second, replay, sending-race, URL-revocation, permission, and unmount cases.

- [ ] **Step 5: Commit the hook hardening**

```bash
git add src/features/im/useImVoiceRecording.ts src/features/im/useImVoiceRecording.test.tsx
git commit -m "fix(im): restore audible voice preview"
```

---

### Task 2: Center and enlarge controls, then localize the new error

**Files:**
- Modify: `src/features/im/ImVoiceRecordingOverlay.test.tsx`
- Modify: `src/features/im/ImVoiceRecordingOverlay.tsx`
- Modify: `src/features/im/pages.test.ts`
- Modify: `src/features/im/pages.tsx`
- Modify: `src/i18n/translations.test.ts`
- Modify: `src/i18n/translations.ts`

- [ ] **Step 1: Add failing overlay and i18n assertions**

In the overlay test, require the action group to use absolute midpoint positioning and no bottom-push layout:

```ts
const actions = container.querySelector<HTMLElement>(
  "[data-im-voice-recording-actions='true']",
)!;
expect(actions.className).toContain("top-[57%]");
expect(actions.className).toContain("left-1/2");
expect(actions.className).toContain("-translate-x-1/2");
expect(actions.className).toContain("-translate-y-1/2");
expect(actions.className).toContain("gap-7");
expect(actions.className).not.toContain("mt-auto");
for (const button of actions.querySelectorAll("button")) {
  expect(button.className).toContain("h-[72px]");
  expect(button.className).toContain("w-[72px]");
}
```

Keep the current state-set assertions: recording has two buttons; preview has three; preview-playing has no recording stop button; sending disables the three preview controls.

Add `没有检测到麦克风声音，请检查输入设备后重试` to the complete voice-copy list and exact five-language error table. Add a source-integration assertion proving `error.im.voice_input_muted` maps to that copy.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm test -- src/features/im/ImVoiceRecordingOverlay.test.tsx src/features/im/pages.test.ts src/i18n/translations.test.ts
```

Expected: FAIL because the actions still use `mt-auto`, controls are 48px, and the new error copy is absent.

- [ ] **Step 3: Implement the layout and copy changes**

Change only the action container and control dimensions:

```tsx
<div
  className="absolute left-1/2 top-[57%] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-7"
  data-im-voice-recording-actions="true"
>
```

Use `h-[72px] w-[72px]` for every action button, `h-7 w-7` for replay/send/spinner icons, and `h-6 w-6` for the stop square. Preserve current colors, shadows, focus ring, disabled state, and reduced-motion behavior.

Map the hook error explicitly:

```ts
if (errorKey === "error.im.voice_input_muted") {
  return "没有检测到麦克风声音，请检查输入设备后重试";
}
```

Add complete Simplified Chinese, Traditional Chinese, Japanese, English, and Korean translations; do not rely on source fallback.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
npm test -- src/features/im/ImVoiceRecordingOverlay.test.tsx src/features/im/pages.test.ts src/i18n/translations.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the UI and copy change**

```bash
git add src/features/im/ImVoiceRecordingOverlay.tsx src/features/im/ImVoiceRecordingOverlay.test.tsx src/features/im/pages.tsx src/features/im/pages.test.ts src/i18n/translations.ts src/i18n/translations.test.ts
git commit -m "fix(im): center enlarged voice controls"
```

---

### Task 3: Verify the shared page and document the result

**Files:**
- Modify after verification: `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`

- [ ] **Step 1: Run all focused IM voice tests**

```bash
npm test -- src/features/im/useImVoiceRecording.test.tsx src/features/im/ImVoiceRecordingOverlay.test.tsx src/features/im/pages.test.ts src/features/im/pages.test.tsx src/features/im/components.composer.test.tsx src/i18n/translations.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run project safety gates**

```bash
npm test
npm run lint
npm run i18n:audit
npm run verify:production-build
git diff --check
```

Expected: all commands exit 0. If an unrelated concurrent change fails a gate, record the exact failing file/test instead of weakening the gate.

- [ ] **Step 3: Perform browser acceptance on the formal runtime**

First prove the listeners belong to this checkout. At `http://127.0.0.1:5180/user.html#/messages/2546`:

- Click the voice button once and confirm the blurred overlay appears.
- At 440x956 and 320x956, confirm the action row is near the visual middle, never clipped, and buttons measure 72x72 CSS pixels.
- Confirm recording shows only X + stop; stop the recording and confirm automatic preview shows only X + replay + send.
- Inspect the preview audio element: `muted === false`, `defaultMuted === false`, `volume === 1`, and playback time advances.
- Listen for the recorded voice, then click replay and listen again. Tool inspection alone cannot substitute for this audible check.
- Do not click send. Cancel the preview and confirm the conversation returns with no new message.
- If the browser reports a continuously muted input track, confirm the localized input-device guidance appears and no preview/send controls are available.

- [ ] **Step 4: Update Step 13 documentation with only verified evidence**

Add section `6.25 可听语音预览与居中放大控制（2026-08-31）` to `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`. Record the exact automated commands that passed and the browser checks actually completed. If human audible confirmation is pending, state that explicitly.

- [ ] **Step 5: Commit the verified documentation**

```bash
git add docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md
git commit -m "docs(im): record audible voice preview verification"
```

- [ ] **Step 6: Recheck integration state**

```bash
git status -sb
git log -5 --oneline
```

Expected: only unrelated pre-existing changes remain; the voice hardening commits are on `main`. Do not push unless separately requested.
