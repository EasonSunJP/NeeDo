import type { Express } from "express";
import type { Server } from "node:http";
import { startApiServer } from "../src/api-server";
import { env } from "../src/config/env";
import { checkRedisHealth, createRedisClient } from "../src/config/redis";
import { SseRealtimeEventGateway } from "../src/services/realtime-event.gateway";
import { OfficialNoticeRepository } from "../src/repositories/official-notice.repository";
import { OfficialNoticeWorker } from "../src/workers/official-notice.worker";

jest.mock("../src/config/redis", () => ({
  checkRedisHealth: jest.fn(),
  createRedisClient: jest.fn(() => ({})),
  disconnectRedis: jest.fn(async () => undefined)
}));
jest.mock("../src/prisma/client", () => ({ disconnectPrisma: jest.fn(async () => undefined) }));
jest.mock("../src/config/logger", () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
jest.mock("../src/services/redis-realtime-event.bus");
jest.mock("../src/services/realtime-event.gateway");
jest.mock("../src/repositories/official-notice.repository");
jest.mock("../src/workers/official-notice.worker");

afterEach(() => jest.restoreAllMocks());

function startFixture() {
  const events: string[] = [];
  const on = jest.spyOn(process, "on").mockReturnValue(process);
  jest.spyOn(process, "exit").mockImplementation(() => undefined as never);
  const server = {
    close: jest.fn((callback: () => void) => {
      events.push("http-close");
      callback();
    })
  } as unknown as Server;
  const app = {
    listen: jest.fn((_port: number, ready: () => void) => {
      ready();
      return server;
    })
  } as unknown as Express;
  const factory = jest.fn(() => app);
  startApiServer(factory, env);
  const gateway = jest.mocked(SseRealtimeEventGateway).mock.instances[0];
  const worker = jest.mocked(OfficialNoticeWorker).mock.instances[0];
  jest.mocked(gateway.close).mockImplementation(async () => {
    events.push("sse-close");
  });
  jest.mocked(worker.stopAndDrain).mockImplementation(async () => {
    events.push("worker-drained");
  });
  const shutdown = on.mock.calls.find(([signal]) => signal === "SIGTERM")?.[1];
  return { events, factory, gateway, worker, shutdown };
}

describe("independent API notice runtime", () => {
  it("shares one persisted delivery repository and event gateway between routes and worker", () => {
    const { factory, gateway, worker } = startFixture();
    expect(factory).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        redisHealthCheck: checkRedisHealth,
        officialNoticeRepository: jest.mocked(OfficialNoticeRepository).mock.instances[0],
        realtimeEventGateway: gateway
      })
    );
    expect(OfficialNoticeRepository).toHaveBeenCalledWith(
      undefined,
      env.OFFICIAL_NOTICE_MAX_DELIVERY_ATTEMPTS,
      gateway
    );
    expect(createRedisClient).toHaveBeenCalledWith(env);
    expect(worker.start).toHaveBeenCalledTimes(1);
  });

  it("drains delivery and closes SSE before waiting for HTTP connections to close", async () => {
    const { events, shutdown } = startFixture();
    expect(shutdown).toBeDefined();
    shutdown?.("SIGTERM");
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(events.indexOf("worker-drained")).toBeLessThan(events.indexOf("sse-close"));
    expect(events.indexOf("sse-close")).toBeLessThan(events.indexOf("http-close"));
  });
});
