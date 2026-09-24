import type { FormalRealtimeEvent } from "./api";

export type RealtimeSoundContext = {
  currentUserId: number | null;
  enabled: boolean;
  visible: boolean;
};

type RealtimeSoundSchedulerOptions = {
  coalesceWindowMs?: number;
  maxSeenEventIds?: number;
  play: () => Promise<void> | void;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function positiveIntegerField(value: Record<string, unknown> | null, key: string): number | null {
  const candidate = value?.[key];

  return typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate > 0
    ? candidate
    : null;
}

export function shouldPlayRealtimeNotificationSound(
  event: FormalRealtimeEvent,
  context: RealtimeSoundContext
): boolean {
  if (!context.enabled || !context.visible || !context.currentUserId || !event.id.trim()) {
    return false;
  }

  if (event.recipientUserId !== undefined && event.recipientUserId !== context.currentUserId) {
    return false;
  }

  const payload = record(event.payload);

  if (event.type === "message.created") {
    const senderUserId = positiveIntegerField(payload, "senderUserId");
    return senderUserId !== null && senderUserId !== context.currentUserId;
  }

  if (event.type === "friend_request.created") {
    return positiveIntegerField(payload, "targetUserId") === context.currentUserId;
  }

  if (event.type === "notification.created" || event.type === "notification.order_status") {
    if ((positiveIntegerField(payload, "recipientUserId") ?? event.recipientUserId) !== context.currentUserId) {
      return false;
    }

    const actorUserId = positiveIntegerField(payload, "actorUserId");
    return actorUserId === null || actorUserId !== context.currentUserId;
  }

  if (event.type === "social.post.created") {
    const authorUserId = positiveIntegerField(payload, "authorUserId");
    return authorUserId !== null && authorUserId !== context.currentUserId;
  }

  return false;
}

export function createRealtimeSoundScheduler({
  coalesceWindowMs = 200,
  maxSeenEventIds = 128,
  play
}: RealtimeSoundSchedulerOptions) {
  const seenEventIds = new Set<string>();
  const eventIdOrder: string[] = [];
  let pendingTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  const reset = () => {
    if (pendingTimer !== null) {
      globalThis.clearTimeout(pendingTimer);
    }

    pendingTimer = null;
    seenEventIds.clear();
    eventIdOrder.length = 0;
  };

  return {
    handle(event: FormalRealtimeEvent, context: RealtimeSoundContext) {
      if (!shouldPlayRealtimeNotificationSound(event, context) || seenEventIds.has(event.id)) {
        return;
      }

      seenEventIds.add(event.id);
      eventIdOrder.push(event.id);

      if (eventIdOrder.length > maxSeenEventIds) {
        const oldestEventId = eventIdOrder.shift();
        if (oldestEventId) {
          seenEventIds.delete(oldestEventId);
        }
      }

      if (pendingTimer !== null) {
        return;
      }

      pendingTimer = globalThis.setTimeout(() => {
        pendingTimer = null;
        void Promise.resolve(play()).catch(() => undefined);
      }, coalesceWindowMs);
    },
    reset,
    dispose: reset
  };
}
