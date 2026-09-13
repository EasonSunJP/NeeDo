# Realtime Notification Sound Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play the supplied `NewMessageSE.mp3` once for each coalesced batch of incoming messages, social updates, friend requests, booking/order lifecycle notifications, review notices, Exchange Requests, and claim results.

**Architecture:** Reuse the existing shared SSE multiplexer and add one global sound subscriber beneath `AuthProvider`; do not create another connection or derive alerts from unread-count polling. A pure event policy filters self-originated and unrelated events, a bounded scheduler deduplicates and coalesces eligible events, and one browser-audio adapter handles gesture unlocking and playback failures. Existing per-portal settings remain authoritative and publish a lightweight same-tab change signal.

**Tech Stack:** React 19, TypeScript strict mode, Vite public assets, Vitest 4, jsdom, formal SSE events from `src/features/realtime/api.ts`.

## Global Constraints

- Reuse the formal SSE connection in `subscribeRealtimeEvents`; add no WebSocket, SSE connection, polling loop, API, database field, or mock data.
- Use `/audio/new-message.mp3`, copied byte-for-byte from `/Users/eason/Downloads/NewMessageSE.mp3`.
- Play only while authenticated, auth restoration is complete, the active document is visible, and the current portal sound preference is enabled.
- Cover incoming `message.created`, `friend_request.created`, `notification.created`, `notification.order_status`, and `social.post.created` events.
- Treat new bookings and booking confirmation, failure or rejection, and cancellation as `notification.order_status`; never play separately for `booking.order_changed`.
- Suppress self-originated messages, posts, and notifications.
- Deduplicate by SSE event ID, retain at most 128 IDs, and coalesce eligible arrivals within 200 milliseconds into one playback.
- Playback or unlock rejection must not affect SSE delivery, unread counts, rendering, or business requests.
- Respect the existing user, technician, merchant, and business `sound` settings; admin remains enabled because it has no matching setting.
- Entity-device, installed-PWA, background, lock-screen, and operating-system Push sound acceptance remain outside this local web slice.

---

### Task 1: Incoming-event policy and bounded sound scheduler

**Files:**
- Create: `src/features/realtime/realtimeNotificationSound.ts`
- Test: `src/features/realtime/realtimeNotificationSound.test.ts`

**Interfaces:**
- Consumes: `FormalRealtimeEvent` from `src/features/realtime/api.ts`.
- Produces: `RealtimeSoundContext`, `shouldPlayRealtimeNotificationSound(event, context)`, and `createRealtimeSoundScheduler(options)` with `handle(event, context)`, `reset()`, and `dispose()`.

- [ ] **Step 1: Write the failing policy tests**

Create `src/features/realtime/realtimeNotificationSound.test.ts` with table-driven cases for the complete allowed and rejected event set:

```ts
import { describe, expect, it, vi } from "vitest";
import type { FormalRealtimeEvent } from "./api";
import {
  createRealtimeSoundScheduler,
  shouldPlayRealtimeNotificationSound
} from "./realtimeNotificationSound";

const context = { currentUserId: 7, enabled: true, visible: true };
const event = (type: string, payload: unknown, id = `evt-${type}`): FormalRealtimeEvent => ({
  id,
  payload,
  recipientUserId: 7,
  type
});

describe("realtime notification sound policy", () => {
  it.each([
    ["incoming message", event("message.created", { senderUserId: 8 })],
    ["friend request", event("friend_request.created", { targetUserId: 7 })],
    ["generic notification", event("notification.created", { actorUserId: 8, recipientUserId: 7 })],
    ["system notification", event("notification.created", { actorUserId: null, recipientUserId: 7 })],
    ["new booking", event("notification.order_status", { actorUserId: 8, recipientUserId: 7, payload: { toStatus: "pending" } })],
    ["booking confirmed", event("notification.order_status", { actorUserId: 8, recipientUserId: 7, payload: { toStatus: "confirmed" } })],
    ["booking rejected", event("notification.order_status", { actorUserId: 8, recipientUserId: 7, payload: { toStatus: "rejected" } })],
    ["booking cancelled", event("notification.order_status", { actorUserId: 8, recipientUserId: 7, payload: { toStatus: "cancelled" } })],
    ["new social post or Request", event("social.post.created", { authorUserId: 8 })]
  ])("allows %s", (_label, candidate) => {
    expect(shouldPlayRealtimeNotificationSound(candidate, context)).toBe(true);
  });

  it.each([
    ["own message", event("message.created", { senderUserId: 7 })],
    ["own notification", event("notification.created", { actorUserId: 7, recipientUserId: 7 })],
    ["wrong notification recipient", event("notification.order_status", { actorUserId: 8, recipientUserId: 9 })],
    ["own social post", event("social.post.created", { authorUserId: 7 })],
    ["booking invalidation duplicate", event("booking.order_changed", { orderId: 22 })],
    ["read state", event("notification.read", { recipientUserId: 7 })],
    ["connection marker", event("connected", {})],
    ["missing event id", event("message.created", { senderUserId: 8 }, "")]
  ])("rejects %s", (_label, candidate) => {
    expect(shouldPlayRealtimeNotificationSound(candidate, context)).toBe(false);
  });

  it("requires enabled visible authenticated context", () => {
    const incoming = event("message.created", { senderUserId: 8 });
    expect(shouldPlayRealtimeNotificationSound(incoming, { ...context, enabled: false })).toBe(false);
    expect(shouldPlayRealtimeNotificationSound(incoming, { ...context, visible: false })).toBe(false);
    expect(shouldPlayRealtimeNotificationSound(incoming, { ...context, currentUserId: null })).toBe(false);
  });
});

describe("realtime notification sound scheduler", () => {
  it("deduplicates event ids and coalesces a 200 ms burst", async () => {
    vi.useFakeTimers();
    const play = vi.fn(async () => undefined);
    const scheduler = createRealtimeSoundScheduler({ play });

    scheduler.handle(event("message.created", { senderUserId: 8 }, "evt-1"), context);
    scheduler.handle(event("message.created", { senderUserId: 8 }, "evt-1"), context);
    scheduler.handle(event("notification.created", { actorUserId: 8, recipientUserId: 7 }, "evt-2"), context);
    expect(play).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(play).toHaveBeenCalledTimes(1);

    scheduler.handle(event("message.created", { senderUserId: 8 }, "evt-3"), context);
    await vi.advanceTimersByTimeAsync(200);
    expect(play).toHaveBeenCalledTimes(2);
    scheduler.dispose();
    vi.useRealTimers();
  });

  it("clears pending playback and dedupe state on reset", async () => {
    vi.useFakeTimers();
    const play = vi.fn(async () => undefined);
    const scheduler = createRealtimeSoundScheduler({ play });
    const incoming = event("message.created", { senderUserId: 8 }, "evt-reset");

    scheduler.handle(incoming, context);
    scheduler.reset();
    await vi.advanceTimersByTimeAsync(200);
    expect(play).not.toHaveBeenCalled();

    scheduler.handle(incoming, context);
    await vi.advanceTimersByTimeAsync(200);
    expect(play).toHaveBeenCalledTimes(1);
    scheduler.dispose();
    vi.useRealTimers();
  });

  it("swallows playback rejection", async () => {
    vi.useFakeTimers();
    const scheduler = createRealtimeSoundScheduler({ play: vi.fn(async () => { throw new Error("blocked"); }) });
    scheduler.handle(event("message.created", { senderUserId: 8 }), context);
    await expect(vi.advanceTimersByTimeAsync(200)).resolves.toBeUndefined();
    scheduler.dispose();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run the policy test and verify the expected RED state**

Run:

```bash
npm test -- --run src/features/realtime/realtimeNotificationSound.test.ts
```

Expected: FAIL because `./realtimeNotificationSound` does not exist.

- [ ] **Step 3: Implement the minimal pure policy and scheduler**

Create `src/features/realtime/realtimeNotificationSound.ts`:

```ts
import type { FormalRealtimeEvent } from "./api";

export type RealtimeSoundContext = {
  currentUserId: number | null;
  enabled: boolean;
  visible: boolean;
};

type SchedulerOptions = {
  coalesceWindowMs?: number;
  maxSeenEventIds?: number;
  play: () => Promise<void> | void;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function numberField(value: Record<string, unknown> | null, key: string): number | null {
  const candidate = value?.[key];
  return typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate > 0
    ? candidate
    : null;
}

export function shouldPlayRealtimeNotificationSound(
  event: FormalRealtimeEvent,
  context: RealtimeSoundContext
): boolean {
  if (!context.enabled || !context.visible || !context.currentUserId || !event.id.trim()) return false;
  if (event.recipientUserId !== undefined && event.recipientUserId !== context.currentUserId) return false;

  const payload = record(event.payload);
  if (event.type === "message.created") {
    const senderUserId = numberField(payload, "senderUserId");
    return senderUserId !== null && senderUserId !== context.currentUserId;
  }
  if (event.type === "friend_request.created") {
    return numberField(payload, "targetUserId") === context.currentUserId;
  }
  if (event.type === "notification.created" || event.type === "notification.order_status") {
    if (numberField(payload, "recipientUserId") !== context.currentUserId) return false;
    const actorUserId = numberField(payload, "actorUserId");
    return actorUserId === null || actorUserId !== context.currentUserId;
  }
  if (event.type === "social.post.created") {
    const authorUserId = numberField(payload, "authorUserId");
    return authorUserId !== null && authorUserId !== context.currentUserId;
  }
  return false;
}

export function createRealtimeSoundScheduler({
  coalesceWindowMs = 200,
  maxSeenEventIds = 128,
  play
}: SchedulerOptions) {
  const seen = new Set<string>();
  const order: string[] = [];
  let timer: ReturnType<typeof globalThis.setTimeout> | null = null;

  const reset = () => {
    if (timer !== null) globalThis.clearTimeout(timer);
    timer = null;
    seen.clear();
    order.length = 0;
  };

  return {
    handle(event: FormalRealtimeEvent, context: RealtimeSoundContext) {
      if (!shouldPlayRealtimeNotificationSound(event, context) || seen.has(event.id)) return;
      seen.add(event.id);
      order.push(event.id);
      if (order.length > maxSeenEventIds) seen.delete(order.shift()!);
      if (timer !== null) return;
      timer = globalThis.setTimeout(() => {
        timer = null;
        void Promise.resolve(play()).catch(() => undefined);
      }, coalesceWindowMs);
    },
    reset,
    dispose: reset
  };
}
```

- [ ] **Step 4: Run the policy test and verify GREEN**

Run:

```bash
npm test -- --run src/features/realtime/realtimeNotificationSound.test.ts
```

Expected: 1 file passes with all policy and scheduler cases green.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/features/realtime/realtimeNotificationSound.ts src/features/realtime/realtimeNotificationSound.test.ts
git commit -m "feat(realtime): classify and coalesce alert sounds"
```

---

### Task 2: Same-tab portal sound preference propagation

**Files:**
- Modify: `src/features/settings/portalSettingsState.ts`
- Modify: `src/features/settings/portalSettingsState.test.ts`

**Interfaces:**
- Consumes: existing `getStoredPortalSettingsState()` and `persistPortalSettingsState()`.
- Produces: `subscribePortalSettingsState(portal, listener): () => void`; listeners receive the normalized authoritative settings after persistence.

- [ ] **Step 1: Add the failing same-tab preference test**

Add `// @vitest-environment jsdom` as the first line, and replace the existing module import with:

```ts
import {
  clearPortalSettingsState,
  getStoredPortalSettingsState,
  persistPortalSettingsState,
  subscribePortalSettingsState,
  type TechnicianPortalSettingsState
} from "./portalSettingsState";
```

Then append:

```ts
it("notifies same-tab subscribers after the portal sound preference is persisted", () => {
  const listener = vi.fn();
  const unsubscribe = subscribePortalSettingsState("technician", listener);
  const next = { ...getStoredPortalSettingsState("technician"), sound: false };

  persistPortalSettingsState("technician", next);

  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith(expect.objectContaining({ sound: false }));
  unsubscribe();
  persistPortalSettingsState("technician", { ...next, sound: true });
  expect(listener).toHaveBeenCalledTimes(1);
});
```

The file already imports `vi` from Vitest.

- [ ] **Step 2: Run the settings test and verify RED**

Run:

```bash
npm test -- --run src/features/settings/portalSettingsState.test.ts
```

Expected: FAIL because `subscribePortalSettingsState` is not exported.

- [ ] **Step 3: Implement the lightweight change signal**

Add the following beside the storage prefix and persistence helpers in `portalSettingsState.ts`:

```ts
const portalSettingsChangedEvent = "needo:portal-settings-changed";

type PortalSettingsChangedDetail = {
  portal: UnifiedSettingsPortal;
};

export function subscribePortalSettingsState<T extends UnifiedSettingsPortal>(
  portal: T,
  listener: (value: PortalSettingsStateMap[T]) => void
) {
  if (typeof window === "undefined") return () => undefined;
  const handleChange = (event: Event) => {
    const detail = (event as CustomEvent<PortalSettingsChangedDetail>).detail;
    if (detail?.portal === portal) listener(getStoredPortalSettingsState(portal));
  };
  window.addEventListener(portalSettingsChangedEvent, handleChange);
  return () => window.removeEventListener(portalSettingsChangedEvent, handleChange);
}
```

After a successful `localStorage.setItem()` inside `persistPortalSettingsState`, dispatch when `window.dispatchEvent` is available:

```ts
if (typeof window.dispatchEvent === "function") {
  window.dispatchEvent(new CustomEvent<PortalSettingsChangedDetail>(portalSettingsChangedEvent, {
    detail: { portal }
  }));
}
```

Do not dispatch when persistence throws, because the stored setting remains unchanged.

- [ ] **Step 4: Run settings and notification policy tests**

Run:

```bash
npm test -- --run src/features/settings/portalSettingsState.test.ts src/features/realtime/realtimeNotificationSound.test.ts
```

Expected: both files pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/features/settings/portalSettingsState.ts src/features/settings/portalSettingsState.test.ts
git commit -m "feat(settings): publish portal sound preference changes"
```

---

### Task 3: Browser audio adapter and global SSE subscriber

**Files:**
- Create: `src/features/realtime/RealtimeNotificationSound.tsx`
- Test: `src/features/realtime/RealtimeNotificationSound.test.tsx`
- Modify: `src/App.tsx`
- Create: `public/audio/new-message.mp3`

**Interfaces:**
- Consumes: `useAuth()`, `subscribeRealtimeEvents()`, `getStoredPortalSettingsState()`, `subscribePortalSettingsState()`, and `createRealtimeSoundScheduler()`.
- Produces: `RealtimeNotificationSound`, mounted once beneath `AuthProvider`, plus `createBrowserNotificationSound(audio)` for deterministic browser-adapter tests.

- [ ] **Step 1: Write the failing browser adapter and component tests**

Create `src/features/realtime/RealtimeNotificationSound.test.tsx` using the repository's jsdom `createRoot` pattern. The complete behavior assertions are:

```tsx
// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isRestoring: false, session: { id: 7, portal: "user" } },
  onEvent: undefined as ((event: { id: string; payload: unknown; recipientUserId?: number; type: string }) => void) | undefined,
  preferenceListener: undefined as ((value: { sound: boolean }) => void) | undefined,
  subscribeRealtimeEvents: vi.fn(),
  subscribePortalSettingsState: vi.fn()
}));

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => mocks.auth }));
vi.mock("./api", () => ({
  subscribeRealtimeEvents: mocks.subscribeRealtimeEvents
}));
vi.mock("../settings/portalSettingsState", () => ({
  getStoredPortalSettingsState: () => ({ sound: true }),
  subscribePortalSettingsState: mocks.subscribePortalSettingsState
}));

import {
  RealtimeNotificationSound,
  createBrowserNotificationSound
} from "./RealtimeNotificationSound";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  mocks.subscribeRealtimeEvents.mockImplementation((options: { onEvent: typeof mocks.onEvent }) => {
    mocks.onEvent = options.onEvent;
    return vi.fn();
  });
  mocks.subscribePortalSettingsState.mockImplementation((_portal: string, listener: typeof mocks.preferenceListener) => {
    mocks.preferenceListener = listener;
    return vi.fn();
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("browser notification sound", () => {
  it("silently unlocks, resets and plays the same audio element", async () => {
    const audio = {
      currentTime: 4,
      muted: false,
      pause: vi.fn(),
      play: vi.fn(async () => undefined),
      preload: ""
    };
    const sound = createBrowserNotificationSound(audio);

    await sound.unlock();
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(audio.muted).toBe(false);
    expect(audio.currentTime).toBe(0);
    await sound.play();
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.currentTime).toBe(0);
  });

  it("swallows browser playback rejection", async () => {
    const audio = { currentTime: 0, muted: false, pause: vi.fn(), play: vi.fn(async () => { throw new Error("blocked"); }), preload: "" };
    const sound = createBrowserNotificationSound(audio);
    await expect(sound.unlock()).resolves.toBeUndefined();
    await expect(sound.play()).resolves.toBeUndefined();
  });
});

describe("RealtimeNotificationSound", () => {
  it("reuses the shared subscription and plays one coalesced incoming sound", async () => {
    const play = vi.fn(async () => undefined);
    vi.stubGlobal("Audio", vi.fn(() => ({ currentTime: 0, muted: false, pause: vi.fn(), play, preload: "" })));
    await act(async () => root.render(<RealtimeNotificationSound />));

    await act(async () => {
      mocks.onEvent?.({ id: "evt-message", type: "message.created", recipientUserId: 7, payload: { senderUserId: 8 } });
      mocks.onEvent?.({ id: "evt-order", type: "notification.order_status", recipientUserId: 7, payload: { actorUserId: 8, recipientUserId: 7, payload: { toStatus: "cancelled" } } });
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(mocks.subscribeRealtimeEvents).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("reacts to the existing portal sound preference without reconnecting SSE", async () => {
    const play = vi.fn(async () => undefined);
    vi.stubGlobal("Audio", vi.fn(() => ({ currentTime: 0, muted: false, pause: vi.fn(), play, preload: "" })));
    await act(async () => root.render(<RealtimeNotificationSound />));
    await act(async () => mocks.preferenceListener?.({ sound: false }));
    await act(async () => {
      mocks.onEvent?.({ id: "evt-muted", type: "message.created", recipientUserId: 7, payload: { senderUserId: 8 } });
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(play).not.toHaveBeenCalled();
    expect(mocks.subscribeRealtimeEvents).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the component test and verify RED**

Run:

```bash
npm test -- --run src/features/realtime/RealtimeNotificationSound.test.tsx
```

Expected: FAIL because `RealtimeNotificationSound.tsx` does not exist.

- [ ] **Step 3: Implement the browser adapter and component**

Create `src/features/realtime/RealtimeNotificationSound.tsx`. Use this public surface and lifecycle:

```tsx
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import type { PortalScope } from "../../auth/portal";
import {
  getStoredPortalSettingsState,
  subscribePortalSettingsState,
  type UnifiedSettingsPortal
} from "../settings/portalSettingsState";
import { subscribeRealtimeEvents } from "./api";
import { createRealtimeSoundScheduler, type RealtimeSoundContext } from "./realtimeNotificationSound";

const soundPath = "/audio/new-message.mp3";
const settingsPortals = new Set<PortalScope>(["user", "technician", "merchant", "business"]);

type BrowserAudio = Pick<HTMLAudioElement, "currentTime" | "muted" | "pause" | "play" | "preload">;

export function createBrowserNotificationSound(audio: BrowserAudio) {
  audio.preload = "auto";
  return {
    async unlock() {
      const muted = audio.muted;
      try {
        audio.muted = true;
        audio.currentTime = 0;
        await audio.play();
        audio.pause();
      } catch {
        // Browser policy may still reject muted priming.
      } finally {
        audio.currentTime = 0;
        audio.muted = muted;
      }
    },
    async play() {
      try {
        audio.currentTime = 0;
        await audio.play();
      } catch {
        // Sound is best effort and never blocks realtime state.
      }
    },
    dispose() {
      audio.pause();
      audio.currentTime = 0;
    }
  };
}

function hasPortalSoundSetting(portal: PortalScope): portal is UnifiedSettingsPortal {
  return settingsPortals.has(portal);
}

function readSoundEnabled(portal: PortalScope | undefined) {
  return portal && hasPortalSoundSetting(portal)
    ? getStoredPortalSettingsState(portal).sound
    : true;
}

export function RealtimeNotificationSound() {
  const { isAuthenticated, isRestoring, session } = useAuth();
  const [soundEnabled, setSoundEnabled] = useState(() => readSoundEnabled(session?.portal));
  const context = useRef<RealtimeSoundContext>({ currentUserId: null, enabled: false, visible: true });
  const scheduler = useRef<ReturnType<typeof createRealtimeSoundScheduler> | null>(null);

  context.current = {
    currentUserId: session?.id ?? null,
    enabled: isAuthenticated && !isRestoring && Boolean(session) && soundEnabled,
    visible: typeof document === "undefined" || document.visibilityState !== "hidden"
  };

  useEffect(() => {
    const audio = createBrowserNotificationSound(new Audio(soundPath));
    scheduler.current = createRealtimeSoundScheduler({ play: audio.play });
    let unlocked = false;
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      void audio.unlock();
    };
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      scheduler.current?.dispose();
      scheduler.current = null;
      audio.dispose();
    };
  }, []);

  useEffect(() => {
    const portal = session?.portal;
    setSoundEnabled(readSoundEnabled(portal));
    if (!portal || !hasPortalSoundSetting(portal)) return undefined;
    return subscribePortalSettingsState(portal, (value) => setSoundEnabled(value.sound));
  }, [session?.portal]);

  useEffect(() => {
    scheduler.current?.reset();
    if (!isAuthenticated || isRestoring || !session) return undefined;
    return subscribeRealtimeEvents({
      onEvent(event) {
        scheduler.current?.handle(event, {
          ...context.current,
          visible: document.visibilityState !== "hidden"
        });
      }
    });
  }, [isAuthenticated, isRestoring, session?.activeIdentityId, session?.id, session?.portal]);

  return null;
}
```

- [ ] **Step 4: Copy and verify the supplied binary asset**

Run:

```bash
mkdir -p public/audio
cp /Users/eason/Downloads/NewMessageSE.mp3 public/audio/new-message.mp3
cmp /Users/eason/Downloads/NewMessageSE.mp3 public/audio/new-message.mp3
file public/audio/new-message.mp3
```

Expected: `cmp` exits 0 and `file` reports an MPEG Layer III audio file.

- [ ] **Step 5: Mount the global component beneath AuthProvider**

Add the import next to `RealtimeUnreadCountsProvider` in `src/App.tsx`:

```tsx
import { RealtimeNotificationSound } from "./features/realtime/RealtimeNotificationSound";
```

Mount it immediately inside `AuthProvider`, before `RealtimeUnreadCountsProvider`, so it exists during login gestures but still reads authenticated state from the provider:

```tsx
<AuthProvider>
  <RealtimeNotificationSound />
  <RealtimeUnreadCountsProvider>
```

- [ ] **Step 6: Run all sound-slice tests and verify GREEN**

Run:

```bash
npm test -- --run src/features/realtime/realtimeNotificationSound.test.ts src/features/realtime/RealtimeNotificationSound.test.tsx src/features/settings/portalSettingsState.test.ts src/features/realtime/api.test.ts
```

Expected: all four files pass, the shared SSE API test still proves one browser connection, and the component test proves one coalesced playback.

- [ ] **Step 7: Commit Task 3**

```bash
git add public/audio/new-message.mp3 src/App.tsx src/features/realtime/RealtimeNotificationSound.tsx src/features/realtime/RealtimeNotificationSound.test.tsx
git commit -m "feat(realtime): play sound for incoming alerts"
```

---

### Task 4: Integrated verification and Step 13 record

**Files:**
- Modify: `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`

**Interfaces:**
- Consumes: the completed sound policy, component, portal setting signal, public audio asset, and fresh command output.
- Produces: a dated local-only completion record with exact test/build evidence and explicit device acceptance gaps.

- [ ] **Step 1: Run focused regression tests**

Run:

```bash
npm test -- --run src/features/realtime/realtimeNotificationSound.test.ts src/features/realtime/RealtimeNotificationSound.test.tsx src/features/settings/portalSettingsState.test.ts src/features/realtime/api.test.ts src/features/realtime/useRealtimeUnreadCounts.test.ts
```

Expected: all five files pass with zero failures.

- [ ] **Step 2: Run the complete front-end test suite**

Run:

```bash
npm test
```

Expected: exit 0 with zero failed files and zero failed tests. If an unrelated pre-existing failure appears, preserve its exact output and distinguish it from the focused sound-slice result.

- [ ] **Step 3: Run TypeScript and production build gates**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands exit 0.

- [ ] **Step 4: Verify the production artifact contains the exact supplied sound**

Run:

```bash
test -f dist/audio/new-message.mp3
cmp public/audio/new-message.mp3 dist/audio/new-message.mp3
shasum -a 256 /Users/eason/Downloads/NewMessageSE.mp3 public/audio/new-message.mp3 dist/audio/new-message.mp3
```

Expected: all three hashes are identical and both file checks exit 0.

- [ ] **Step 5: Add the evidence-bounded completion record**

Append a dated section to `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md` stating:

```markdown
## 实时新事件提示音（2026-09-13，本地）

- 用户提供的 `NewMessageSE.mp3` 已作为 `/audio/new-message.mp3` 进入正式前端产物；附件只作为媒体资产处理。
- 全局提示音复用每个可见标签页已有的一条正式 SSE 连接，不新增轮询、API、数据库字段或浏览器 mock。
- 新聊天信息、新动态、好友申请、系统/审核通知、新订单、新预约、新 Request、抢单成功/失败，以及预约确认、失败/拒绝、取消会触发提示音；本人事件、已读/编辑/撤回事件和 `booking.order_changed` 刷新提示不发声。
- 各端既有“声音与提醒方式”开关即时生效；200ms 内关联事件合并为一次提示音，SSE event id 有界去重。
- 浏览器音频拒绝不会影响实时状态和业务请求。本地自动化覆盖网页可见态；实体设备、已安装 PWA、后台、锁屏和操作系统 Push 声音仍需独立验收。
```

Add the exact focused test, full test, lint, build, and SHA-256 results from Steps 1–4 immediately below those bullets.

- [ ] **Step 6: Inspect the final diff and run the completion gate again**

Run:

```bash
git diff --check
git status --short
npm test -- --run src/features/realtime/realtimeNotificationSound.test.ts src/features/realtime/RealtimeNotificationSound.test.tsx src/features/settings/portalSettingsState.test.ts
npm run lint
npm run build
```

Expected: `git diff --check`, focused tests, lint, and build exit 0. `git status --short` may still show the user's pre-existing asset-cleanup changes, which must remain untouched and be reported separately.

- [ ] **Step 7: Commit documentation and any verification-only correction**

```bash
git add docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md
git commit -m "docs: record realtime alert sound verification"
```

Do not add the pre-existing deleted PDF previews, deleted PSD files, asset-cleanup manifest, asset-cleanup report, or unrelated mobile execution plan to any commit.
