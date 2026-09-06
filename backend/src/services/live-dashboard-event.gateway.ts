import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type {
  LiveDashboardEvent,
  LiveDashboardEventDraft,
  LiveDashboardInvalidationSection,
  LiveDashboardScope
} from "../domain/live-dashboard";

export const LIVE_DASHBOARD_EVENT_CHANNEL = "needo:dashboard:live:v1";
export const LIVE_DASHBOARD_EVENT_MAX_BYTES = 32 * 1024;
const LIVE_DASHBOARD_REPLAY_LIMIT = 100;
const LIVE_DASHBOARD_REPLAY_WINDOW_MS = 5 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const BUS_RETRY_BASE_DELAY_MS = 5_000;
const BUS_RETRY_MAX_DELAY_MS = 30_000;
const STREAM_ID_PATTERN = /^\d{13}-\d+$/;
const INVALIDATION_SECTIONS = new Set<LiveDashboardInvalidationSection>([
  "headline",
  "orders",
  "trend",
  "rankings"
]);

export interface LiveDashboardEventBusPort {
  publish(message: string): Promise<void>;
  subscribe(listener: (message: string) => void): Promise<() => Promise<void> | void>;
  close(): Promise<void>;
}

export interface LiveDashboardEventPublisher {
  publish(event: LiveDashboardEventDraft | LiveDashboardEvent): Promise<LiveDashboardEvent | null>;
}

export interface LiveDashboardEventGatewayPort extends LiveDashboardEventPublisher {
  subscribe(
    scope: LiveDashboardScope,
    lastEventId: string | null,
    response: Response
  ): Promise<() => void>;
  close(): Promise<void>;
}

export interface LiveDashboardCacheInvalidator {
  invalidateScope?(scope: LiveDashboardScope): Promise<void>;
}

interface LiveDashboardEventEnvelope {
  sourceInstanceId: string;
  event: LiveDashboardEvent;
}

interface Subscriber {
  scope: LiveDashboardScope;
  response: Response;
  unsubscribe: () => void;
}

interface ReplayEntry {
  event: LiveDashboardEvent;
  receivedAtMs: number;
}

interface LiveDashboardEventGatewayOptions {
  eventBus?: LiveDashboardEventBusPort;
  cache?: LiveDashboardCacheInvalidator;
  instanceId?: string;
  now?: () => Date;
  onError?: (error: unknown, operation: "publish" | "subscribe" | "invalidate") => void;
}

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

export class LiveDashboardEventGateway implements LiveDashboardEventGatewayPort {
  private readonly subscribers = new Set<Subscriber>();
  private readonly history: ReplayEntry[] = [];
  private readonly eventBus?: LiveDashboardEventBusPort;
  private readonly cache?: LiveDashboardCacheInvalidator;
  private readonly instanceId: string;
  private readonly now: () => Date;
  private readonly onError: NonNullable<LiveDashboardEventGatewayOptions["onError"]>;
  private busUnsubscribe?: () => Promise<void> | void;
  private busSubscriptionPromise?: Promise<void>;
  private busRetryTimer?: ReturnType<typeof setTimeout>;
  private busRetryAttempt = 0;
  private closePromise?: Promise<void>;
  private lastEventTimestamp = -1;
  private lastEventSequence = -1;

  public constructor(options: LiveDashboardEventGatewayOptions = {}) {
    this.eventBus = options.eventBus;
    this.cache = options.cache;
    this.instanceId = options.instanceId ?? randomUUID();
    this.now = options.now ?? (() => new Date());
    this.onError = options.onError ?? (() => undefined);
  }

  public async publish(
    input: LiveDashboardEventDraft | LiveDashboardEvent
  ): Promise<LiveDashboardEvent | null> {
    let event: LiveDashboardEvent;
    try {
      event = this.canonicalizeEvent(input);
      if (Buffer.byteLength(JSON.stringify(event), "utf8") > LIVE_DASHBOARD_EVENT_MAX_BYTES) {
        throw new Error("Live dashboard event exceeds 32 KiB");
      }
    } catch (error) {
      this.onError(error, "publish");
      return null;
    }

    this.deliver(event);
    void this.invalidate(event);

    if (this.eventBus) {
      try {
        await this.eventBus.publish(
          JSON.stringify({
            sourceInstanceId: this.instanceId,
            event
          } satisfies LiveDashboardEventEnvelope)
        );
      } catch (error) {
        this.onError(error, "publish");
      }
    }
    return event;
  }

  public async subscribe(
    scope: LiveDashboardScope,
    lastEventId: string | null,
    response: Response
  ): Promise<() => void> {
    await this.ensureBusSubscription();
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders?.();

    let active = true;
    const subscriber = {} as Subscriber;
    const unsubscribe = (): void => {
      if (!active) return;
      active = false;
      clearInterval(heartbeat);
      this.subscribers.delete(subscriber);
    };
    subscriber.scope = { ...scope };
    subscriber.response = response;
    subscriber.unsubscribe = unsubscribe;
    this.subscribers.add(subscriber);
    response.on("close", unsubscribe);
    response.on("error", unsubscribe);
    const heartbeat = setInterval(() => {
      this.write(response, ": heartbeat\n\n", unsubscribe);
    }, HEARTBEAT_INTERVAL_MS);

    if (!this.write(response, "retry: 5000\n\n", unsubscribe)) return unsubscribe;
    this.pruneHistory();
    if (lastEventId) {
      for (const entry of this.history) {
        if (
          this.compareEventIds(entry.event.id, lastEventId) > 0 &&
          this.matchesScope(scope, entry.event.scope) &&
          !this.write(response, this.formatEvent(entry.event.type, entry.event), unsubscribe)
        ) {
          return unsubscribe;
        }
      }
    }
    if (
      !this.write(
        response,
        this.formatEvent("connected", {
          id: this.createEventId(),
          type: "connected",
          scope: { ...scope },
          payload: {},
          createdAt: this.now().toISOString()
        }),
        unsubscribe
      )
    ) {
      return unsubscribe;
    }

    return unsubscribe;
  }

  public async close(): Promise<void> {
    if (!this.closePromise) this.closePromise = this.closeInternal();
    return this.closePromise;
  }

  private deliver(event: LiveDashboardEvent): void {
    this.history.push({ event, receivedAtMs: this.now().getTime() });
    this.pruneHistory();
    for (const subscriber of [...this.subscribers]) {
      if (this.matchesScope(subscriber.scope, event.scope)) {
        this.write(
          subscriber.response,
          this.formatEvent(event.type, event),
          subscriber.unsubscribe
        );
      }
    }
  }

  private async invalidate(event: LiveDashboardEvent): Promise<void> {
    if (event.type !== "metrics.invalidate" || !this.cache?.invalidateScope) return;
    try {
      await this.cache.invalidateScope(event.scope);
    } catch (error) {
      this.onError(error, "invalidate");
    }
  }

  private matchesScope(subscriber: LiveDashboardScope, event: LiveDashboardScope): boolean {
    return (
      subscriber.countryCode === event.countryCode &&
      (!subscriber.admin1Code || subscriber.admin1Code === event.admin1Code) &&
      (!subscriber.admin2Code || subscriber.admin2Code === event.admin2Code)
    );
  }

  private pruneHistory(): void {
    const cutoff = this.now().getTime() - LIVE_DASHBOARD_REPLAY_WINDOW_MS;
    while (this.history[0] && this.history[0].receivedAtMs < cutoff) this.history.shift();
    if (this.history.length > LIVE_DASHBOARD_REPLAY_LIMIT) {
      this.history.splice(0, this.history.length - LIVE_DASHBOARD_REPLAY_LIMIT);
    }
  }

  private async ensureBusSubscription(): Promise<void> {
    if (!this.eventBus || this.busUnsubscribe || this.closePromise) return;
    if (!this.busSubscriptionPromise) {
      this.busSubscriptionPromise = this.eventBus
        .subscribe((message) => this.handleBusMessage(message))
        .then((unsubscribe) => {
          this.busUnsubscribe = unsubscribe;
          this.busRetryAttempt = 0;
        })
        .catch((error) => {
          this.busSubscriptionPromise = undefined;
          this.onError(error, "subscribe");
          this.scheduleBusRetry();
        });
    }
    await this.busSubscriptionPromise;
  }

  private scheduleBusRetry(): void {
    if (!this.eventBus || this.busRetryTimer || this.closePromise) return;
    const delay = Math.min(
      BUS_RETRY_BASE_DELAY_MS * 2 ** this.busRetryAttempt,
      BUS_RETRY_MAX_DELAY_MS
    );
    this.busRetryAttempt += 1;
    this.busRetryTimer = setTimeout(() => {
      this.busRetryTimer = undefined;
      void this.ensureBusSubscription();
    }, delay);
  }

  private handleBusMessage(message: string): void {
    if (Buffer.byteLength(message, "utf8") > LIVE_DASHBOARD_EVENT_MAX_BYTES + 512) return;
    try {
      const parsed = JSON.parse(message) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
      const envelope = parsed as Record<string, unknown>;
      if (!hasExactKeys(envelope, ["sourceInstanceId", "event"])) return;
      if (
        typeof envelope.sourceInstanceId !== "string" ||
        envelope.sourceInstanceId === this.instanceId
      ) {
        return;
      }
      const event = this.parseExactEvent(envelope.event);
      if (!event) return;
      this.deliver(event);
      void this.invalidate(event);
    } catch {
      return;
    }
  }

  private canonicalizeEvent(
    input: LiveDashboardEventDraft | LiveDashboardEvent
  ): LiveDashboardEvent {
    const id = input.id ?? this.createEventId();
    const createdAt = input.createdAt ?? this.now().toISOString();
    const candidate = {
      id,
      type: input.type,
      scope: {
        countryCode: input.scope.countryCode,
        admin1Code: input.scope.admin1Code,
        admin2Code: input.scope.admin2Code
      },
      payload:
        input.type === "order.changed"
          ? {
              orderNo: input.payload.orderNo,
              status: input.payload.status,
              serviceName: input.payload.serviceName,
              amountJpy: input.payload.amountJpy
            }
          : { sections: [...input.payload.sections] },
      createdAt
    };
    const parsed = this.parseExactEvent(candidate);
    if (!parsed) throw new Error("Invalid live dashboard event");
    return parsed;
  }

  private parseExactEvent(value: unknown): LiveDashboardEvent | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const event = value as Record<string, unknown>;
    if (!hasExactKeys(event, ["id", "type", "scope", "payload", "createdAt"])) return null;
    if (typeof event.id !== "string" || !STREAM_ID_PATTERN.test(event.id)) return null;
    if (
      typeof event.createdAt !== "string" ||
      !Number.isFinite(Date.parse(event.createdAt)) ||
      new Date(event.createdAt).toISOString() !== event.createdAt
    ) {
      return null;
    }
    const scope = this.parseScope(event.scope);
    if (
      !scope ||
      !event.payload ||
      typeof event.payload !== "object" ||
      Array.isArray(event.payload)
    ) {
      return null;
    }
    const payload = event.payload as Record<string, unknown>;
    if (event.type === "order.changed") {
      if (!hasExactKeys(payload, ["orderNo", "status", "serviceName", "amountJpy"])) return null;
      if (
        typeof payload.orderNo !== "string" ||
        payload.orderNo.length < 1 ||
        payload.orderNo.length > 64 ||
        typeof payload.status !== "string" ||
        payload.status.length < 1 ||
        payload.status.length > 64 ||
        typeof payload.serviceName !== "string" ||
        payload.serviceName.length < 1 ||
        payload.serviceName.length > 200 ||
        !Number.isSafeInteger(payload.amountJpy) ||
        Number(payload.amountJpy) < 0
      )
        return null;
      return {
        id: event.id,
        type: "order.changed",
        scope,
        payload: {
          orderNo: payload.orderNo,
          status: payload.status,
          serviceName: payload.serviceName,
          amountJpy: Number(payload.amountJpy)
        },
        createdAt: event.createdAt
      };
    }
    if (event.type !== "metrics.invalidate" || !hasExactKeys(payload, ["sections"])) return null;
    if (
      !Array.isArray(payload.sections) ||
      payload.sections.length < 1 ||
      payload.sections.length > INVALIDATION_SECTIONS.size ||
      payload.sections.some(
        (section) => !INVALIDATION_SECTIONS.has(section as LiveDashboardInvalidationSection)
      ) ||
      new Set(payload.sections).size !== payload.sections.length
    )
      return null;
    return {
      id: event.id,
      type: "metrics.invalidate",
      scope,
      payload: { sections: payload.sections as LiveDashboardInvalidationSection[] },
      createdAt: event.createdAt
    };
  }

  private parseScope(value: unknown): LiveDashboardScope | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const scope = value as Record<string, unknown>;
    if (!hasExactKeys(scope, ["countryCode", "admin1Code", "admin2Code"])) return null;
    if (scope.countryCode !== "JP") return null;
    if (
      scope.admin1Code !== null &&
      (typeof scope.admin1Code !== "string" || !/^\d{2}$/.test(scope.admin1Code))
    )
      return null;
    if (
      scope.admin2Code !== null &&
      (typeof scope.admin2Code !== "string" || !/^\d{5}$/.test(scope.admin2Code))
    )
      return null;
    if (scope.admin2Code && !scope.admin1Code) return null;
    return {
      countryCode: "JP",
      admin1Code: scope.admin1Code as string | null,
      admin2Code: scope.admin2Code as string | null
    };
  }

  private write(response: Response, chunk: string, unsubscribe: () => void): boolean {
    try {
      if (response.write(chunk)) return true;
    } catch {
      // Closed below and removed from the bounded subscriber set.
    }
    unsubscribe();
    response.end();
    return false;
  }

  private formatEvent(name: string, payload: unknown): string {
    const id =
      payload && typeof payload === "object" && "id" in payload
        ? String((payload as { id: unknown }).id).replace(/[\r\n]/g, "")
        : "";
    return `${id ? `id: ${id}\n` : ""}event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
  }

  private createEventId(): string {
    const timestamp = Math.max(this.now().getTime(), this.lastEventTimestamp);
    const sequence = timestamp === this.lastEventTimestamp ? this.lastEventSequence + 1 : 0;
    this.lastEventTimestamp = timestamp;
    this.lastEventSequence = sequence;
    return `${timestamp}-${sequence}`;
  }

  private compareEventIds(left: string, right: string): number {
    const [leftTimestamp = "0", leftSequence = "0"] = left.split("-");
    const [rightTimestamp = "0", rightSequence = "0"] = right.split("-");
    const timestampDifference = BigInt(leftTimestamp) - BigInt(rightTimestamp);
    if (timestampDifference !== 0n) return timestampDifference > 0n ? 1 : -1;
    const sequenceDifference = BigInt(leftSequence) - BigInt(rightSequence);
    return sequenceDifference === 0n ? 0 : sequenceDifference > 0n ? 1 : -1;
  }

  private async closeInternal(): Promise<void> {
    if (this.busRetryTimer) {
      clearTimeout(this.busRetryTimer);
      this.busRetryTimer = undefined;
    }
    for (const subscriber of [...this.subscribers]) {
      subscriber.unsubscribe();
      subscriber.response.end();
    }
    this.history.length = 0;
    if (this.busUnsubscribe) await this.busUnsubscribe();
    if (this.eventBus) await this.eventBus.close();
  }
}
