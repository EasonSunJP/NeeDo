import { afterEach, describe, expect, it, vi } from "vitest";
import type { FormalRealtimeEvent } from "./api";
import {
  createRealtimeSoundScheduler,
  shouldPlayRealtimeNotificationSound
} from "./realtimeNotificationSound";

const context = { currentUserId: 7, enabled: true, visible: true };

function event(type: string, payload: unknown, id = `evt-${type}`): FormalRealtimeEvent {
  return {
    id,
    payload,
    recipientUserId: 7,
    type
  };
}

afterEach(() => {
  vi.useRealTimers();
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
  });

  it("swallows playback rejection", async () => {
    vi.useFakeTimers();
    const play = vi.fn(async () => {
      throw new Error("blocked");
    });
    const scheduler = createRealtimeSoundScheduler({
      play
    });

    scheduler.handle(event("message.created", { senderUserId: 8 }), context);
    await vi.advanceTimersByTimeAsync(200);
    expect(play).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });
});
