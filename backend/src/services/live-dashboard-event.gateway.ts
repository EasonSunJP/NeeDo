import type { Response } from "express";
import type {
  LiveDashboardEvent,
  LiveDashboardEventDraft,
  LiveDashboardInvalidationSection,
  LiveDashboardScope
} from "../domain/live-dashboard";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export const LIVE_DASHBOARD_EVENT_CHANNEL = "needo:dashboard:live:v1";
export const LIVE_DASHBOARD_EVENT_STREAM_KEY = "needo:dashboard:live:stream:v1";
export const LIVE_DASHBOARD_EVENT_MAX_BYTES = 32 * 1024;
export const LIVE_DASHBOARD_REPLAY_LIMIT = 100;
export const LIVE_DASHBOARD_REPLAY_WINDOW_MS = 5 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const STREAM_RETRY_DELAY_MS = 5_000;
const STREAM_ID_PATTERN = /^\d+-\d+$/;
const INVALIDATION_SECTIONS = new Set<LiveDashboardInvalidationSection>([
  "headline",
  "orders",
  "trend",
  "rankings"
]);

export interface LiveDashboardEventStreamEntry {
  id: string;
  event: string;
}

export type LiveDashboardReplayRead =
  | { status: "ready"; entries: LiveDashboardEventStreamEntry[] }
  | { status: "reset_required"; entries: [] };

export interface LiveDashboardPreparedSubscription {
  lastEventId: string | null;
  entries: LiveDashboardEventStreamEntry[];
}

export interface LiveDashboardEventStreamPort {
  append(event: string): Promise<LiveDashboardEventStreamEntry>;
  broadcast(entry: LiveDashboardEventStreamEntry): Promise<void>;
  readAfter(lastEventId: string | null): Promise<LiveDashboardEventStreamEntry[]>;
  readRetained(lastEventId: string | null): Promise<LiveDashboardReplayRead>;
  subscribe(listener: () => void): Promise<() => Promise<void> | void>;
  close(): Promise<void>;
}

export interface LiveDashboardEventPublisher {
  publish(event: LiveDashboardEventDraft | LiveDashboardEvent): Promise<LiveDashboardEvent | null>;
}

export interface LiveDashboardEventGatewayPort extends LiveDashboardEventPublisher {
  prepareSubscription(lastEventId: string | null): Promise<LiveDashboardPreparedSubscription>;
  subscribe(
    scope: LiveDashboardScope,
    lastEventId: string | null,
    response: Response,
    prepared?: LiveDashboardPreparedSubscription
  ): Promise<() => void>;
  close(): Promise<void>;
}

export interface LiveDashboardCacheInvalidator {
  invalidateScope?(scope: LiveDashboardScope): Promise<void>;
}

type StoredLiveDashboardEvent = Omit<LiveDashboardEvent, "id">;

interface Subscriber {
  scope: LiveDashboardScope;
  response: Response;
  lastSentId: string | null;
  pending: Map<string, LiveDashboardEventStreamEntry> | null;
  heartbeat?: ReturnType<typeof setInterval>;
  unsubscribe: () => void;
}

interface LiveDashboardEventGatewayOptions {
  eventStream: LiveDashboardEventStreamPort;
  cache?: LiveDashboardCacheInvalidator;
  now?: () => Date;
  onError?: (error: unknown, operation: "publish" | "subscribe" | "replay" | "invalidate") => void;
}

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

export class LiveDashboardEventGateway implements LiveDashboardEventGatewayPort {
  private readonly subscribers = new Set<Subscriber>();
  private readonly eventStream: LiveDashboardEventStreamPort;
  private readonly cache?: LiveDashboardCacheInvalidator;
  private readonly now: () => Date;
  private readonly onError: NonNullable<LiveDashboardEventGatewayOptions["onError"]>;
  private streamUnsubscribe?: () => Promise<void> | void;
  private streamSubscriptionPromise?: Promise<void>;
  private streamRetryTimer?: ReturnType<typeof setTimeout>;
  private lastDrainedId: string | null = null;
  private drainPromise?: Promise<void>;
  private drainRequested = false;
  private recoveryTimer?: ReturnType<typeof setInterval>;
  private readonly pendingClientSetups = new Set<Promise<() => void>>();
  private closed = false;
  private closePromise?: Promise<void>;

  public constructor(options: LiveDashboardEventGatewayOptions) {
    this.eventStream = options.eventStream;
    this.cache = options.cache;
    this.now = options.now ?? (() => new Date());
    this.onError = options.onError ?? (() => undefined);
  }

  public async publish(
    input: LiveDashboardEventDraft | LiveDashboardEvent
  ): Promise<LiveDashboardEvent | null> {
    let storedEvent: StoredLiveDashboardEvent;
    try {
      storedEvent = this.canonicalizeStoredEvent(input);
      this.assertEventSize({ id: "0000000000000-0", ...storedEvent });
    } catch (error) {
      this.onError(error, "publish");
      return null;
    }

    if (storedEvent.type === "metrics.invalidate") {
      if (!this.cache?.invalidateScope) {
        this.onError(new Error("Live dashboard cache invalidation is unavailable"), "invalidate");
        return null;
      }
      try {
        await this.cache.invalidateScope(storedEvent.scope);
      } catch (error) {
        this.onError(error, "invalidate");
        return null;
      }
    }

    try {
      const entry = await this.eventStream.append(JSON.stringify(storedEvent));
      const event = this.parseStreamEntry(entry);
      if (!event) throw new Error("Shared live dashboard stream returned an invalid entry");
      this.assertEventSize(event);
      try {
        await this.eventStream.broadcast(entry);
      } catch (error) {
        this.onError(error, "publish");
      }
      try {
        await this.requestDrain();
      } catch (error) {
        this.onError(error, "replay");
      }
      return event;
    } catch (error) {
      this.onError(error, "publish");
      return null;
    }
  }

  public async prepareSubscription(
    lastEventId: string | null
  ): Promise<LiveDashboardPreparedSubscription> {
    let replay: LiveDashboardReplayRead;
    try {
      replay = await this.eventStream.readRetained(lastEventId);
    } catch (cause) {
      throw new AppError({
        code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
        message: "error.dependency_unavailable",
        statusCode: 503,
        cause
      });
    }
    if (replay.status === "reset_required") {
      throw new AppError({
        code: ERROR_CODES.LIVE_DASHBOARD_CURSOR_RESET_REQUIRED,
        message: "error.live_dashboard.cursor_reset_required",
        statusCode: 409
      });
    }
    return { lastEventId, entries: replay.entries };
  }

  public subscribe(
    scope: LiveDashboardScope,
    lastEventId: string | null,
    response: Response,
    prepared?: LiveDashboardPreparedSubscription
  ): Promise<() => void> {
    const setup = this.subscribeInternal(scope, lastEventId, response, prepared);
    this.pendingClientSetups.add(setup);
    void setup.then(
      () => this.pendingClientSetups.delete(setup),
      () => this.pendingClientSetups.delete(setup)
    );
    return setup;
  }

  private async subscribeInternal(
    scope: LiveDashboardScope,
    lastEventId: string | null,
    response: Response,
    prepared?: LiveDashboardPreparedSubscription
  ): Promise<() => void> {
    const stopUnestablished = (): void => {
      if (this.isResponseActive(response)) response.end();
    };
    if (this.closed) {
      stopUnestablished();
      return () => undefined;
    }
    await this.ensureStreamSubscription();
    if (this.closed || !this.isResponseActive(response)) {
      stopUnestablished();
      return () => undefined;
    }

    let replay: LiveDashboardPreparedSubscription;
    try {
      replay = prepared ?? (await this.prepareSubscription(lastEventId));
      if (replay.lastEventId !== lastEventId) {
        throw new Error("Live dashboard prepared cursor does not match the request cursor");
      }
    } catch (error) {
      if (
        error instanceof AppError &&
        error.code === ERROR_CODES.LIVE_DASHBOARD_CURSOR_RESET_REQUIRED
      ) {
        throw error;
      }
      this.onError(error, "replay");
      stopUnestablished();
      return () => undefined;
    }
    if (this.closed || !this.isResponseActive(response)) {
      stopUnestablished();
      return () => undefined;
    }

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
      if (subscriber.heartbeat) clearInterval(subscriber.heartbeat);
      this.subscribers.delete(subscriber);
      response.off("close", unsubscribe);
      response.off("error", unsubscribe);
      if (this.subscribers.size === 0) this.stopRecoveryTimer();
    };
    subscriber.scope = { ...scope };
    subscriber.response = response;
    subscriber.lastSentId = lastEventId;
    subscriber.pending = new Map();
    subscriber.unsubscribe = unsubscribe;
    this.subscribers.add(subscriber);
    response.on("close", unsubscribe);
    response.on("error", unsubscribe);

    if (!this.write(response, "retry: 5000\n\n", unsubscribe)) return unsubscribe;

    try {
      await this.requestDrain();
    } catch (error) {
      this.onError(error, "replay");
      unsubscribe();
      response.end();
      return unsubscribe;
    }
    if (!active || this.closed || !this.isResponseActive(response)) {
      unsubscribe();
      if (this.isResponseActive(response)) response.end();
      return unsubscribe;
    }
    const combined = new Map<string, LiveDashboardEventStreamEntry>();
    for (const entry of replay.entries) combined.set(entry.id, entry);
    for (const entry of subscriber.pending.values()) combined.set(entry.id, entry);
    const ordered = [...combined.values()].sort((left, right) =>
      this.compareEventIds(left.id, right.id)
    );
    for (const entry of ordered) {
      const event = this.parseStreamEntry(entry);
      if (event && !this.sendEvent(subscriber, event)) return unsubscribe;
    }
    subscriber.pending = null;

    if (!active || this.closed || !this.isResponseActive(response)) {
      unsubscribe();
      if (this.isResponseActive(response)) response.end();
      return unsubscribe;
    }

    if (
      !this.write(
        response,
        this.formatEvent("connected", {
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
    this.startRecoveryTimer();
    subscriber.heartbeat = setInterval(() => {
      if (active && !this.closed) this.write(response, ": heartbeat\n\n", unsubscribe);
    }, HEARTBEAT_INTERVAL_MS);
    return unsubscribe;
  }

  public async close(): Promise<void> {
    if (!this.closePromise) {
      this.closed = true;
      this.closePromise = this.closeInternal();
    }
    return this.closePromise;
  }

  private fanOutEntry(entry: LiveDashboardEventStreamEntry, event: LiveDashboardEvent): void {
    for (const subscriber of [...this.subscribers]) {
      if (subscriber.pending) subscriber.pending.set(entry.id, entry);
      else this.sendEvent(subscriber, event);
    }
  }

  private sendEvent(subscriber: Subscriber, event: LiveDashboardEvent): boolean {
    if (!this.matchesScope(subscriber.scope, event.scope)) return true;
    if (subscriber.lastSentId && this.compareEventIds(event.id, subscriber.lastSentId) <= 0) {
      return true;
    }
    const written = this.write(
      subscriber.response,
      this.formatEvent(event.type, event),
      subscriber.unsubscribe
    );
    if (written) subscriber.lastSentId = event.id;
    return written;
  }

  private matchesScope(subscriber: LiveDashboardScope, event: LiveDashboardScope): boolean {
    return (
      subscriber.countryCode === event.countryCode &&
      (!subscriber.admin1Code || subscriber.admin1Code === event.admin1Code) &&
      (!subscriber.admin2Code || subscriber.admin2Code === event.admin2Code)
    );
  }

  private async ensureStreamSubscription(): Promise<void> {
    if (this.streamUnsubscribe || this.closed) return;
    if (!this.streamSubscriptionPromise) {
      this.streamSubscriptionPromise = this.eventStream
        .subscribe(() => {
          void this.requestDrain().catch((error) => this.onError(error, "replay"));
        })
        .then(async (unsubscribe) => {
          const safeUnsubscribe = this.onceAsync(unsubscribe);
          if (this.closed) {
            await safeUnsubscribe();
            return;
          }
          this.streamUnsubscribe = safeUnsubscribe;
        })
        .catch((error) => {
          this.streamSubscriptionPromise = undefined;
          if (this.closed) return;
          this.onError(error, "subscribe");
          this.scheduleStreamRetry();
        });
    }
    await this.streamSubscriptionPromise;
  }

  private scheduleStreamRetry(): void {
    if (this.streamRetryTimer || this.closed) return;
    this.streamRetryTimer = setTimeout(() => {
      this.streamRetryTimer = undefined;
      if (this.closed) return;
      void this.ensureStreamSubscription().then(() => {
        if (this.streamUnsubscribe && !this.closed) {
          void this.requestDrain().catch((error) => this.onError(error, "replay"));
        }
      });
    }, STREAM_RETRY_DELAY_MS);
  }

  private requestDrain(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.drainRequested = true;
    if (!this.drainPromise) {
      this.drainPromise = this.runDrainLoop().finally(() => {
        this.drainPromise = undefined;
      });
    }
    return this.drainPromise;
  }

  private async runDrainLoop(): Promise<void> {
    while (this.drainRequested && !this.closed) {
      this.drainRequested = false;
      for (;;) {
        const entries = (await this.eventStream.readAfter(this.lastDrainedId)).sort((left, right) =>
          this.compareEventIds(left.id, right.id)
        );
        if (this.closed) return;
        if (entries.length === 0) break;
        for (const entry of entries) {
          if (this.lastDrainedId && this.compareEventIds(entry.id, this.lastDrainedId) <= 0)
            continue;
          const event = this.parseStreamEntry(entry);
          this.lastDrainedId = entry.id;
          if (event) this.fanOutEntry(entry, event);
        }
      }
    }
  }

  private canonicalizeStoredEvent(
    input: LiveDashboardEventDraft | LiveDashboardEvent
  ): StoredLiveDashboardEvent {
    const candidate = {
      id: "0000000000000-0",
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
      createdAt: input.createdAt ?? this.now().toISOString()
    };
    const parsed = this.parseExactEvent(candidate);
    if (!parsed) throw new Error("Invalid live dashboard event");
    return parsed.type === "order.changed"
      ? {
          type: parsed.type,
          scope: parsed.scope,
          payload: parsed.payload,
          createdAt: parsed.createdAt
        }
      : {
          type: parsed.type,
          scope: parsed.scope,
          payload: parsed.payload,
          createdAt: parsed.createdAt
        };
  }

  private parseStreamEntry(entry: LiveDashboardEventStreamEntry): LiveDashboardEvent | null {
    if (!STREAM_ID_PATTERN.test(entry.id)) return null;
    if (Buffer.byteLength(entry.event, "utf8") > LIVE_DASHBOARD_EVENT_MAX_BYTES) return null;
    try {
      const stored = JSON.parse(entry.event) as unknown;
      if (!stored || typeof stored !== "object" || Array.isArray(stored)) return null;
      return this.parseExactEvent({ id: entry.id, ...(stored as Record<string, unknown>) });
    } catch {
      return null;
    }
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
    )
      return null;
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

  private assertEventSize(event: unknown): void {
    if (Buffer.byteLength(JSON.stringify(event), "utf8") > LIVE_DASHBOARD_EVENT_MAX_BYTES) {
      throw new Error("Live dashboard event exceeds 32 KiB");
    }
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

  private compareEventIds(left: string, right: string): number {
    const [leftTimestamp = "0", leftSequence = "0"] = left.split("-");
    const [rightTimestamp = "0", rightSequence = "0"] = right.split("-");
    const timestampDifference = BigInt(leftTimestamp) - BigInt(rightTimestamp);
    if (timestampDifference !== 0n) return timestampDifference > 0n ? 1 : -1;
    const sequenceDifference = BigInt(leftSequence) - BigInt(rightSequence);
    return sequenceDifference === 0n ? 0 : sequenceDifference > 0n ? 1 : -1;
  }

  private startRecoveryTimer(): void {
    if (this.recoveryTimer || this.closed || this.subscribers.size === 0) return;
    this.recoveryTimer = setInterval(() => {
      void this.requestDrain().catch((error) => this.onError(error, "replay"));
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopRecoveryTimer(): void {
    if (!this.recoveryTimer) return;
    clearInterval(this.recoveryTimer);
    this.recoveryTimer = undefined;
  }

  private isResponseActive(response: Response): boolean {
    const state = response as Response & {
      destroyed?: boolean;
      ended?: boolean;
      writableEnded?: boolean;
    };
    return !state.destroyed && !state.ended && !state.writableEnded;
  }

  private onceAsync(unsubscribe: () => Promise<void> | void): () => Promise<void> {
    let promise: Promise<void> | undefined;
    return () => {
      if (!promise) promise = Promise.resolve(unsubscribe()).then(() => undefined);
      return promise;
    };
  }

  private async closeInternal(): Promise<void> {
    if (this.streamRetryTimer) clearTimeout(this.streamRetryTimer);
    this.streamRetryTimer = undefined;
    this.stopRecoveryTimer();
    for (const subscriber of [...this.subscribers]) {
      subscriber.unsubscribe();
      if (this.isResponseActive(subscriber.response)) subscriber.response.end();
    }
    await Promise.allSettled([...this.pendingClientSetups]);
    if (this.streamSubscriptionPromise) await this.streamSubscriptionPromise.catch(() => undefined);
    if (this.streamUnsubscribe) await this.streamUnsubscribe();
    if (this.drainPromise) await this.drainPromise.catch(() => undefined);
    await this.eventStream.close();
  }
}
