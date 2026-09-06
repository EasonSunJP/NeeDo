import { EventEmitter } from "node:events";
import type { Express, Response } from "express";
import type { Server } from "node:http";
import type { AppDependencies } from "../src/app";
import { startApiServer } from "../src/api-server";
import { env } from "../src/config/env";
import { createRedisClient } from "../src/config/redis";
import { liveDashboardCacheKey } from "../src/services/live-dashboard-cache.service";
import { createLiveDashboardRuntime } from "../src/services/live-dashboard-runtime";

jest.mock("../src/config/redis", () => ({
  checkRedisHealth: jest.fn(), createRedisClient: jest.fn(),
  disconnectRedis: jest.fn(async () => undefined)
}));
jest.mock("../src/prisma/client", () => ({ disconnectPrisma: jest.fn(async () => undefined) }));
jest.mock("../src/config/logger", () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
jest.mock("../src/workers/official-notice.worker");

class TestResponse extends EventEmitter {
  chunks: string[] = [];
  writableEnded = false;
  destroyed = false;
  status() { return this; }
  setHeader() { return this; }
  flushHeaders() {}
  write(chunk: string) { this.chunks.push(chunk); return true; }
  end() { this.writableEnded = true; return this; }
}

describe("actual split API live dashboard startup", () => {
  afterEach(() => jest.restoreAllMocks());

  it("rejects split-runtime startup without an explicit shared target", () => {
    jest.mocked(createRedisClient).mockReturnValue({ on: () => undefined } as never);
    expect(() => createLiveDashboardRuntime({ ...env, SERVICE_NAME: "needo-ops-api", LIVE_DASHBOARD_REDIS_URL: undefined })).toThrow("LIVE_DASHBOARD_REDIS_URL");
  });

  it("shares stream, snapshots and generations without sharing portal session databases, and closes clients", async () => {
    const databases = new Map<string, { values: Map<string, string>; entries: Array<[string, string[]]> }>();
    const listeners = new Map<string, Set<(message: string) => void>>();
    const clients: Array<{ isOpen: boolean; url: string; errorHandlers: unknown[] }> = [];
    jest.mocked(createRedisClient).mockImplementation((config = env) => {
      const url = config.REDIS_URL;
      if (!databases.has(url)) databases.set(url, { values: new Map(), entries: [] });
      const state = databases.get(url)!;
      const client = {
        url, isOpen: false, errorHandlers: [] as unknown[],
        on: (_event: string, handler: unknown) => { client.errorHandlers.push(handler); return client; },
        connect: async () => { client.isOpen = true; },
        quit: async () => { client.isOpen = false; },
        get: async (key: string) => state.values.get(key) ?? null,
        publish: async (channel: string, value: string) => { for (const fn of listeners.get(channel) ?? []) fn(value); return 1; },
        subscribe: async (channel: string, fn: (message: string) => void) => { if (!listeners.has(channel)) listeners.set(channel, new Set()); listeners.get(channel)!.add(fn); },
        unsubscribe: async () => undefined,
        sendCommand: async (command: string[]): Promise<unknown> => {
          if (command[0] === "XADD") { const id = `${Date.now()}-${state.entries.length}`; state.entries.push([id, ["event", command[7]!]]); return id; }
          if (command[0] === "XTRIM") return 0;
          if (command[0] === "TIME") return [String(Math.floor(Date.now() / 1000)), "0"];
          if (command[0] === "XRANGE") return state.entries.filter(([id]) => !command[2]!.startsWith("(") || id > command[2]!.slice(1));
          if (command[0] !== "EVAL") throw new Error("Unexpected test Redis command");
          const count = Number(command[2]); const keys = command.slice(3, 3 + count); const args = command.slice(3 + count);
          if (count === 1) return ["ready", state.entries.filter(([id]) => !args[0] || id > args[0])];
          if (count === 2) {
            if ((state.values.get(keys[1]!) ?? "0") !== args[0]) return 0;
            state.values.set(keys[0]!, args[1]!); return 1;
          }
          for (const key of keys.slice(count / 2)) state.values.set(key, String(Number(state.values.get(key) ?? 0) + 1));
          for (const key of keys.slice(0, count / 2)) state.values.delete(key);
          return count / 2;
        }
      };
      clients.push(client);
      return client as never;
    });
    const on = jest.spyOn(process, "on").mockReturnValue(process);
    jest.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const captured: AppDependencies[] = [];
    for (const [name, database] of [["needo-ops-api", "1"], ["needo-merchant-api", "2"]]) {
      const config = { ...env, SERVICE_NAME: name!, REDIS_URL: `redis://test/${database}`, LIVE_DASHBOARD_REDIS_URL: "redis://test/9" };
      const factory = (_config: typeof env, deps?: AppDependencies) => {
        captured.push(deps!);
        return { listen: () => ({ close: (callback: () => void) => callback() } as unknown as Server) } as Express;
      };
      startApiServer(factory, config);
    }
    const [ops, merchant] = captured;
    expect(ops!.liveDashboardEventGateway).toBeDefined();
    expect(merchant!.liveDashboardEventGateway).toBeDefined();
    expect(ops!.liveDashboardCache).toBeDefined();
    expect(clients.filter((client) => client.url === "redis://test/9").every((client) => client.errorHandlers.length > 0)).toBe(true);
    const scope = { countryCode: "JP" as const, admin1Code: "13", admin2Code: "13104" };
    const key = liveDashboardCacheKey({ country: "JP", period: "today" });
    await ops!.liveDashboardCache!.getOrCreate(key, async () => ({ count: 1 }));
    await merchant!.liveDashboardEventGateway!.publish({ type: "metrics.invalidate", scope, createdAt: new Date().toISOString(), payload: { sections: ["orders"] } });
    expect((await ops!.liveDashboardCache!.getOrCreate(key, async () => ({ count: 2 }))).value).toEqual({ count: 2 });
    const response = new TestResponse();
    const unsubscribe = await ops!.liveDashboardEventGateway!.subscribe(scope, null, response as unknown as Response);
    expect(response.chunks.join("")).toContain("metrics.invalidate");
    expect(clients.some((client) => client.url === "redis://test/1")).toBe(true);
    expect(clients.some((client) => client.url === "redis://test/2")).toBe(true);
    expect(databases.get("redis://test/1")!.values.size).toBe(0);
    expect(databases.get("redis://test/2")!.values.size).toBe(0);
    unsubscribe();
    for (const [, shutdown] of on.mock.calls.filter(([signal]) => signal === "SIGTERM")) shutdown("SIGTERM");
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(clients.filter((client) => client.isOpen)).toEqual([]);
  });
});
