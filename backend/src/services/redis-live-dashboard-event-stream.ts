import type { RealtimeEventBusPort } from "./realtime-event.gateway";
import {
  LIVE_DASHBOARD_EVENT_MAX_BYTES,
  LIVE_DASHBOARD_REPLAY_LIMIT,
  LIVE_DASHBOARD_REPLAY_WINDOW_MS,
  type LiveDashboardEventStreamEntry,
  type LiveDashboardEventStreamPort,
  type LiveDashboardReplayRead
} from "./live-dashboard-event.gateway";

const STREAM_ID_PATTERN = /^\d+-\d+$/;

export interface RedisLiveDashboardStreamClient {
  isOpen: boolean;
  connect(): Promise<unknown>;
  sendCommand(command: string[]): Promise<unknown>;
  quit(): Promise<unknown>;
}

interface RedisLiveDashboardEventStreamOptions {
  key: string;
  client: RedisLiveDashboardStreamClient;
  eventBus: RealtimeEventBusPort;
}

const compareIds = (left: string, right: string): number => {
  const [leftMs = "0", leftSequence = "0"] = left.split("-");
  const [rightMs = "0", rightSequence = "0"] = right.split("-");
  const ms = BigInt(leftMs) - BigInt(rightMs);
  if (ms !== 0n) return ms > 0n ? 1 : -1;
  const sequence = BigInt(leftSequence) - BigInt(rightSequence);
  return sequence === 0n ? 0 : sequence > 0n ? 1 : -1;
};

const hasExactEntryKeys = (value: Record<string, unknown>): boolean => {
  const keys = Object.keys(value).sort();
  return keys.length === 2 && keys[0] === "event" && keys[1] === "id";
};

// Validation and replay must be one Redis operation: a separate XRANGE existence
// check could race the stream's exact MAXLEN trim and silently skip retained events.
const READ_RETAINED_LUA = `
local cursor = ARGV[1]
local window_ms = tonumber(ARGV[2])
local limit = ARGV[3]
local now = redis.call('TIME')
local server_ms = tonumber(now[1]) * 1000 + math.floor(tonumber(now[2]) / 1000)
local cutoff_ms = math.max(0, server_ms - window_ms)
local cutoff = tostring(cutoff_ms) .. '-0'
if cursor == '' then
  return {'ready', redis.call('XRANGE', KEYS[1], cutoff, '+', 'COUNT', limit)}
end
local cursor_ms = tonumber(string.match(cursor, '^(%d+)%-'))
if not cursor_ms or cursor_ms < cutoff_ms then
  return {'reset_required'}
end
local exact = redis.call('XRANGE', KEYS[1], cursor, cursor, 'COUNT', 1)
if #exact == 0 then
  return {'reset_required'}
end
return {'ready', redis.call('XRANGE', KEYS[1], '(' .. cursor, '+', 'COUNT', limit)}
`;

export class RedisLiveDashboardEventStream implements LiveDashboardEventStreamPort {
  private readonly key: string;
  private readonly client: RedisLiveDashboardStreamClient;
  private readonly eventBus: RealtimeEventBusPort;
  private connectPromise?: Promise<void>;
  private closePromise?: Promise<void>;

  public constructor(options: RedisLiveDashboardEventStreamOptions) {
    this.key = options.key;
    this.client = options.client;
    this.eventBus = options.eventBus;
  }

  public async append(event: string): Promise<LiveDashboardEventStreamEntry> {
    if (Buffer.byteLength(event, "utf8") > LIVE_DASHBOARD_EVENT_MAX_BYTES) {
      throw new Error("Live dashboard event exceeds 32 KiB");
    }
    await this.ensureConnected();
    const id = await this.client.sendCommand([
      "XADD",
      this.key,
      "MAXLEN",
      "=",
      String(LIVE_DASHBOARD_REPLAY_LIMIT),
      "*",
      "event",
      event
    ]);
    if (typeof id !== "string" || !STREAM_ID_PATTERN.test(id)) {
      throw new Error("Redis returned an invalid live dashboard stream ID");
    }
    const timestamp = Number(id.split("-")[0]);
    await this.client.sendCommand([
      "XTRIM",
      this.key,
      "MINID",
      "=",
      `${Math.max(0, timestamp - LIVE_DASHBOARD_REPLAY_WINDOW_MS)}-0`
    ]);
    return { id, event };
  }

  public broadcast(entry: LiveDashboardEventStreamEntry): Promise<void> {
    return this.eventBus.publish(JSON.stringify(entry));
  }

  public async readAfter(lastEventId: string | null): Promise<LiveDashboardEventStreamEntry[]> {
    await this.ensureConnected();
    const time = await this.client.sendCommand(["TIME"]);
    if (!Array.isArray(time) || typeof time[0] !== "string" || typeof time[1] !== "string") {
      throw new Error("Redis returned an invalid server time");
    }
    const serverMs = Number(time[0]) * 1000 + Math.floor(Number(time[1]) / 1000);
    if (!Number.isSafeInteger(serverMs)) throw new Error("Redis returned an invalid server time");
    const cutoffId = `${Math.max(0, serverMs - LIVE_DASHBOARD_REPLAY_WINDOW_MS)}-0`;
    const start =
      lastEventId && compareIds(lastEventId, cutoffId) >= 0 ? `(${lastEventId}` : cutoffId;
    const raw = await this.client.sendCommand([
      "XRANGE",
      this.key,
      start,
      "+",
      "COUNT",
      String(LIVE_DASHBOARD_REPLAY_LIMIT)
    ]);
    return this.parseRange(raw);
  }

  public async readRetained(lastEventId: string | null): Promise<LiveDashboardReplayRead> {
    await this.ensureConnected();
    const raw = await this.client.sendCommand([
      "EVAL",
      READ_RETAINED_LUA,
      "1",
      this.key,
      lastEventId ?? "",
      String(LIVE_DASHBOARD_REPLAY_WINDOW_MS),
      String(LIVE_DASHBOARD_REPLAY_LIMIT)
    ]);
    if (!Array.isArray(raw) || raw[0] !== "ready") {
      if (Array.isArray(raw) && raw.length === 1 && raw[0] === "reset_required") {
        return { status: "reset_required", entries: [] };
      }
      throw new Error("Redis returned an invalid retained live dashboard range");
    }
    if (raw.length !== 2)
      throw new Error("Redis returned an invalid retained live dashboard range");
    return { status: "ready", entries: this.parseRange(raw[1]) };
  }

  public subscribe(listener: () => void): Promise<() => Promise<void> | void> {
    return this.eventBus.subscribe((message) => {
      if (Buffer.byteLength(message, "utf8") > LIVE_DASHBOARD_EVENT_MAX_BYTES + 128) return;
      try {
        const parsed = JSON.parse(message) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
        const entry = parsed as Record<string, unknown>;
        if (
          !hasExactEntryKeys(entry) ||
          typeof entry.id !== "string" ||
          !STREAM_ID_PATTERN.test(entry.id) ||
          typeof entry.event !== "string"
        ) {
          return;
        }
        listener();
      } catch {
        return;
      }
    });
  }

  public async close(): Promise<void> {
    if (!this.closePromise) {
      this.closePromise = Promise.all([
        this.client.isOpen ? this.client.quit() : Promise.resolve(),
        this.eventBus.close()
      ]).then(() => undefined);
    }
    return this.closePromise;
  }

  private async ensureConnected(): Promise<void> {
    if (this.closePromise) throw new Error("Live dashboard event stream is closed");
    if (this.client.isOpen) return;
    if (!this.connectPromise) {
      this.connectPromise = Promise.resolve(this.client.connect())
        .then(() => undefined)
        .catch((error) => {
          this.connectPromise = undefined;
          throw error;
        });
    }
    await this.connectPromise;
  }

  private parseRange(value: unknown): LiveDashboardEventStreamEntry[] {
    if (!Array.isArray(value)) throw new Error("Redis returned an invalid live dashboard range");
    return value.map((item) => {
      if (!Array.isArray(item) || item.length !== 2 || !Array.isArray(item[1])) {
        throw new Error("Redis returned an invalid live dashboard range entry");
      }
      const [id, fields] = item;
      if (
        typeof id !== "string" ||
        !STREAM_ID_PATTERN.test(id) ||
        fields.length !== 2 ||
        fields[0] !== "event" ||
        typeof fields[1] !== "string"
      ) {
        throw new Error("Redis returned an invalid live dashboard range entry");
      }
      return { id, event: fields[1] };
    });
  }
}
