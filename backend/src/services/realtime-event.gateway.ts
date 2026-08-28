import { randomUUID } from "node:crypto";
import type { Response } from "express";

export interface RealtimeEvent {
  id: string;
  type: string;
  recipientUserId: number;
  payload: unknown;
  createdAt: string;
}

export interface RealtimeEventGatewayPort {
  publish: (event: RealtimeEvent) => void;
  subscribe: (userId: number, response: Response) => Promise<() => void> | (() => void);
  close?: () => Promise<void>;
}

export interface RealtimeEventBusPort {
  publish: (message: string) => Promise<void>;
  subscribe: (listener: (message: string) => void) => Promise<() => Promise<void> | void>;
  close: () => Promise<void>;
}

interface RealtimeEventEnvelope {
  sourceInstanceId: string;
  event: RealtimeEvent;
}

interface SseRealtimeEventGatewayOptions {
  eventBus?: RealtimeEventBusPort;
  instanceId?: string;
  onError?: (error: unknown, operation: "publish" | "subscribe") => void;
}

const MAX_REALTIME_EVENT_BYTES = 256 * 1024;
const MAX_EVENT_IDENTIFIER_LENGTH = 200;
const MAX_EVENT_TYPE_LENGTH = 100;
const MAX_INSTANCE_IDENTIFIER_LENGTH = 128;
const EVENT_BUS_RETRY_BASE_DELAY_MS = 5_000;
const EVENT_BUS_RETRY_MAX_DELAY_MS = 30_000;

export class SseRealtimeEventGateway implements RealtimeEventGatewayPort {
  private readonly subscribers = new Map<number, Set<Response>>();
  private readonly eventBus?: RealtimeEventBusPort;
  private readonly instanceId: string;
  private readonly onError: NonNullable<SseRealtimeEventGatewayOptions["onError"]>;
  private eventBusSubscription?: () => Promise<void> | void;
  private eventBusSubscriptionPromise?: Promise<void>;
  private eventBusRetryTimer?: ReturnType<typeof setTimeout>;
  private eventBusRetryAttempt = 0;
  private closePromise?: Promise<void>;

  public constructor(options: SseRealtimeEventGatewayOptions = {}) {
    this.eventBus = options.eventBus;
    this.instanceId = options.instanceId ?? randomUUID();
    this.onError = options.onError ?? (() => undefined);
  }

  public publish(event: RealtimeEvent): void {
    this.fanOut(event);

    if (!this.eventBus) {
      return;
    }

    try {
      const envelope = JSON.stringify({
        sourceInstanceId: this.instanceId,
        event
      } satisfies RealtimeEventEnvelope);

      if (Buffer.byteLength(envelope, "utf8") > MAX_REALTIME_EVENT_BYTES) {
        this.onError(new Error("Realtime event exceeds the transport size limit"), "publish");
        return;
      }

      void this.eventBus.publish(envelope).catch((error) => {
        this.onError(error, "publish");
      });
    } catch (error) {
      this.onError(error, "publish");
    }
  }

  public async subscribe(userId: number, response: Response): Promise<() => void> {
    await this.ensureEventBusSubscription();

    response.status(200);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders?.();

    const userSubscribers = this.subscribers.get(userId) ?? new Set<Response>();
    userSubscribers.add(response);
    this.subscribers.set(userId, userSubscribers);

    const heartbeat: { timer?: ReturnType<typeof setInterval> } = {};
    let active = true;
    const unsubscribe = (): void => {
      if (!active) {
        return;
      }
      active = false;
      if (heartbeat.timer) {
        clearInterval(heartbeat.timer);
      }
      userSubscribers.delete(response);
      if (userSubscribers.size === 0) {
        this.subscribers.delete(userId);
      }
    };

    response.on("close", unsubscribe);
    response.on("error", unsubscribe);

    if (!this.write(response, "retry: 5000\n\n", unsubscribe)) {
      return unsubscribe;
    }
    if (
      !this.write(
        response,
        this.formatEvent("connected", {
          id: this.createEventId(),
          type: "connected",
          recipientUserId: userId,
          payload: { userId },
          createdAt: new Date().toISOString()
        }),
        unsubscribe
      )
    ) {
      return unsubscribe;
    }

    heartbeat.timer = setInterval(() => {
      this.write(response, ": heartbeat\n\n", unsubscribe);
    }, 25_000);

    return unsubscribe;
  }

  public async close(): Promise<void> {
    if (this.closePromise) {
      return this.closePromise;
    }

    this.closePromise = this.closeInternal();
    return this.closePromise;
  }

  private fanOut(event: RealtimeEvent): void {
    const userSubscribers = this.subscribers.get(event.recipientUserId);

    if (!userSubscribers || userSubscribers.size === 0) {
      return;
    }

    for (const response of [...userSubscribers]) {
      this.write(response, this.formatEvent(event.type, event), () => {
        userSubscribers.delete(response);
        if (userSubscribers.size === 0) {
          this.subscribers.delete(event.recipientUserId);
        }
      });
    }
  }

  private async ensureEventBusSubscription(): Promise<void> {
    if (!this.eventBus || this.eventBusSubscription || this.closePromise) {
      return;
    }

    if (!this.eventBusSubscriptionPromise) {
      this.eventBusSubscriptionPromise = this.eventBus
        .subscribe((message) => this.handleBusMessage(message))
        .then((unsubscribe) => {
          this.eventBusSubscription = unsubscribe;
          this.eventBusRetryAttempt = 0;
        })
        .catch((error) => {
          this.eventBusSubscriptionPromise = undefined;
          this.onError(error, "subscribe");
          this.scheduleEventBusRetry();
        });
    }

    await this.eventBusSubscriptionPromise;
  }

  private scheduleEventBusRetry(): void {
    if (!this.eventBus || this.eventBusRetryTimer || this.closePromise) {
      return;
    }

    const delayMs = Math.min(
      EVENT_BUS_RETRY_BASE_DELAY_MS * 2 ** this.eventBusRetryAttempt,
      EVENT_BUS_RETRY_MAX_DELAY_MS
    );
    this.eventBusRetryAttempt += 1;
    this.eventBusRetryTimer = setTimeout(() => {
      this.eventBusRetryTimer = undefined;
      void this.ensureEventBusSubscription();
    }, delayMs);
  }

  private handleBusMessage(message: string): void {
    const envelope = this.parseEnvelope(message);
    if (!envelope || envelope.sourceInstanceId === this.instanceId) {
      return;
    }

    this.fanOut(envelope.event);
  }

  private parseEnvelope(message: string): RealtimeEventEnvelope | null {
    if (Buffer.byteLength(message, "utf8") > MAX_REALTIME_EVENT_BYTES) {
      return null;
    }

    try {
      const envelope = JSON.parse(message) as unknown;
      if (!this.isEnvelope(envelope)) {
        return null;
      }

      return envelope;
    } catch {
      return null;
    }
  }

  private isEnvelope(value: unknown): value is RealtimeEventEnvelope {
    if (!value || typeof value !== "object") {
      return false;
    }

    const envelope = value as Partial<RealtimeEventEnvelope>;
    if (
      typeof envelope.sourceInstanceId !== "string" ||
      envelope.sourceInstanceId.length === 0 ||
      envelope.sourceInstanceId.length > MAX_INSTANCE_IDENTIFIER_LENGTH ||
      !envelope.event ||
      typeof envelope.event !== "object"
    ) {
      return false;
    }

    const event = envelope.event as Partial<RealtimeEvent>;
    return (
      typeof event.id === "string" &&
      event.id.length > 0 &&
      event.id.length <= MAX_EVENT_IDENTIFIER_LENGTH &&
      typeof event.type === "string" &&
      event.type.length > 0 &&
      event.type.length <= MAX_EVENT_TYPE_LENGTH &&
      Number.isInteger(event.recipientUserId) &&
      Number(event.recipientUserId) > 0 &&
      typeof event.createdAt === "string" &&
      Number.isFinite(Date.parse(event.createdAt)) &&
      Object.prototype.hasOwnProperty.call(event, "payload")
    );
  }

  private write(response: Response, chunk: string, unsubscribe: () => void): boolean {
    try {
      if (response.write(chunk)) {
        return true;
      }
    } catch {
      // The response is closed below and removed from the subscriber set.
    }

    unsubscribe();
    response.end();
    return false;
  }

  private async closeInternal(): Promise<void> {
    if (this.eventBusRetryTimer) {
      clearTimeout(this.eventBusRetryTimer);
      this.eventBusRetryTimer = undefined;
    }
    for (const userSubscribers of this.subscribers.values()) {
      for (const response of userSubscribers) {
        response.end();
      }
    }
    this.subscribers.clear();

    if (this.eventBusSubscription) {
      await this.eventBusSubscription();
      this.eventBusSubscription = undefined;
    }
    if (this.eventBus) {
      await this.eventBus.close();
    }
  }

  private formatEvent(eventName: string, payload: unknown): string {
    const rawEventId =
      payload && typeof payload === "object" && "id" in payload
        ? (payload as { id?: unknown }).id
        : undefined;
    const eventId = typeof rawEventId === "string" ? rawEventId.replace(/[\r\n]/g, "") : "";

    return `${eventId ? `id: ${eventId}\n` : ""}event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  }

  private createEventId(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }
}
