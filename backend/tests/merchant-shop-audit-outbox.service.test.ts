import { createServer, type Socket } from "node:net";
import type { AddressInfo } from "node:net";
import { createRedisClient } from "../src/config/redis";
import { env } from "../src/config/env";
import { RedisAuthSessionStore } from "../src/services/auth-session.store";
import { MerchantShopAuditOutboxService } from "../src/services/merchant-shop-audit-outbox.service";
import { MerchantShopAuditOutboxWorker } from "../src/workers/merchant-shop-audit-outbox.worker";

describe("MerchantShopAuditOutboxService", () => {
  it("keeps a completion pending after a database failure and acknowledges it after retry", async () => {
    const completion = {
      kind: "completion" as const,
      streamId: "1-0",
      auditId: 91,
      operationId: "operation-91",
      status: "completed" as const,
      deliveryCount: 1
    };
    const acknowledge = jest.fn(async () => undefined);
    const complete = jest
      .fn<Promise<boolean>, []>()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce(true);
    const store = {
      readMerchantShopSwitchAuditOutbox: jest.fn(async () => ({
        items: [completion],
        nextPendingCursor: "0-0"
      })),
      acknowledgeMerchantShopSwitchAuditOutbox: acknowledge,
      deadLetterMerchantShopSwitchAuditOutbox: jest.fn(async () => undefined),
      getMerchantShopSwitchAuditOutboxStats: jest.fn(async () => ({
        streamLength: acknowledge.mock.calls.length === 0 ? 1 : 0,
        pendingCount: acknowledge.mock.calls.length === 0 ? 1 : 0,
        deadLetterLength: 0
      }))
    };
    const service = new MerchantShopAuditOutboxService(
      { completeMerchantShopSwitchAudit: complete },
      store as never
    );

    await expect(service.drain()).resolves.toMatchObject({ failed: 1, completed: 0 });
    expect(acknowledge).not.toHaveBeenCalled();
    await expect(service.drain()).resolves.toMatchObject({ failed: 0, completed: 1 });
    expect(acknowledge).toHaveBeenCalledWith(completion, { abortSignal: undefined });
  });

  it("moves poison events to the bounded DLQ without blocking valid completions", async () => {
    const poison = {
      kind: "poison" as const,
      streamId: "1-0",
      reason: "invalid_completion_event",
      deliveryCount: 1
    };
    const completion = {
      kind: "completion" as const,
      streamId: "2-0",
      auditId: 92,
      operationId: "operation-92",
      status: "completed" as const,
      deliveryCount: 1
    };
    const acknowledge = jest.fn(async () => undefined);
    const deadLetter = jest.fn(async () => undefined);
    const service = new MerchantShopAuditOutboxService(
      { completeMerchantShopSwitchAudit: jest.fn(async () => true) },
      {
        readMerchantShopSwitchAuditOutbox: jest.fn(async () => ({
          items: [poison, completion],
          nextPendingCursor: "0-0"
        })),
        acknowledgeMerchantShopSwitchAuditOutbox: acknowledge,
        deadLetterMerchantShopSwitchAuditOutbox: deadLetter,
        getMerchantShopSwitchAuditOutboxStats: jest.fn(async () => ({
          streamLength: 0,
          pendingCount: 0,
          deadLetterLength: 1
        }))
      } as never
    );

    await expect(service.drain()).resolves.toEqual({
      read: 2,
      completed: 1,
      failed: 0,
      deadLettered: 1,
      streamLength: 0,
      pendingCount: 0,
      deadLetterLength: 1
    });
    expect(deadLetter).toHaveBeenCalledWith(poison, { abortSignal: undefined });
    expect(acknowledge).toHaveBeenCalledWith(completion, { abortSignal: undefined });
  });

  it("counts rejected ACK and DLQ operations as failures without reporting completion", async () => {
    const completion = {
      kind: "completion" as const,
      streamId: "1-0",
      auditId: 91,
      operationId: "operation-91",
      status: "completed" as const,
      deliveryCount: 1
    };
    const poison = {
      kind: "poison" as const,
      streamId: "2-0",
      reason: "invalid_completion_event",
      deliveryCount: 1
    };
    const service = new MerchantShopAuditOutboxService(
      { completeMerchantShopSwitchAudit: jest.fn(async () => true) },
      {
        readMerchantShopSwitchAuditOutbox: jest.fn(async () => ({
          items: [completion, poison],
          nextPendingCursor: "0-0"
        })),
        acknowledgeMerchantShopSwitchAuditOutbox: jest.fn(async () => {
          throw new Error("ACK rejected");
        }),
        deadLetterMerchantShopSwitchAuditOutbox: jest.fn(async () => {
          throw new Error("DLQ rejected");
        }),
        getMerchantShopSwitchAuditOutboxStats: jest.fn(async () => ({
          streamLength: 2,
          pendingCount: 2,
          deadLetterLength: 0
        }))
      }
    );

    await expect(service.drain()).resolves.toEqual({
      read: 2,
      completed: 0,
      failed: 2,
      deadLettered: 0,
      streamLength: 2,
      pendingCount: 2,
      deadLetterLength: 0
    });
  });

  it("persists the pending cursor across a finite page budget and wraps fairly to 0-0", async () => {
    const failed = {
      kind: "completion" as const,
      streamId: "1-0",
      auditId: 91,
      operationId: "operation-failed",
      status: "completed" as const,
      deliveryCount: 1
    };
    const after = {
      kind: "completion" as const,
      streamId: "2-0",
      auditId: 92,
      operationId: "operation-after",
      status: "completed" as const,
      deliveryCount: 1
    };
    const tail = {
      kind: "completion" as const,
      streamId: "3-0",
      auditId: 93,
      operationId: "operation-tail",
      status: "completed" as const,
      deliveryCount: 1
    };
    const read = jest.fn(async ({ pendingCursor }: { pendingCursor: string }) => {
      if (pendingCursor === "0-0") return { items: [failed, after], nextPendingCursor: "3-0" };
      return { items: [tail], nextPendingCursor: "0-0" };
    });
    const complete = jest.fn(async ({ operationId }: { operationId: string }) => {
      return operationId !== "operation-failed";
    });
    const Service = MerchantShopAuditOutboxService as unknown as new (
      repository: { completeMerchantShopSwitchAudit: typeof complete },
      sessionStore: Record<string, unknown>,
      options: { maxPagesPerDrain: number; maxDeterministicConflicts: number }
    ) => MerchantShopAuditOutboxService;
    const service = new Service(
      { completeMerchantShopSwitchAudit: complete },
      {
        readMerchantShopSwitchAuditOutbox: read,
        acknowledgeMerchantShopSwitchAuditOutbox: jest.fn(async () => undefined),
        deadLetterMerchantShopSwitchAuditOutbox: jest.fn(async () => undefined),
        getMerchantShopSwitchAuditOutboxStats: jest.fn(async () => ({
          streamLength: 1,
          pendingCount: 1,
          deadLetterLength: 0
        }))
      },
      { maxPagesPerDrain: 2, maxDeterministicConflicts: 5 }
    );

    await expect(service.drain()).resolves.toMatchObject({ read: 3, completed: 2, failed: 1 });
    expect(read.mock.calls.map(([input]) => input.pendingCursor)).toEqual(["0-0", "3-0"]);
    await service.drain();
    expect(read.mock.calls[2]?.[0]).toEqual({ pendingCursor: "0-0", abortSignal: undefined });
  });

  it("dead-letters a persistently failing completion after its bounded delivery threshold", async () => {
    const exhausted = {
      kind: "completion" as const,
      streamId: "9-0",
      auditId: 99,
      operationId: "operation-exhausted",
      status: "completed" as const,
      deliveryCount: 3
    };
    const deadLetter = jest.fn(async () => undefined);
    const Service = MerchantShopAuditOutboxService as unknown as new (
      repository: { completeMerchantShopSwitchAudit: jest.Mock },
      sessionStore: Record<string, unknown>,
      options: { maxPagesPerDrain: number; maxDeterministicConflicts: number }
    ) => MerchantShopAuditOutboxService;
    const service = new Service(
      { completeMerchantShopSwitchAudit: jest.fn(async () => false) },
      {
        readMerchantShopSwitchAuditOutbox: jest.fn(async () => ({
          items: [exhausted],
          nextPendingCursor: "0-0"
        })),
        acknowledgeMerchantShopSwitchAuditOutbox: jest.fn(async () => undefined),
        recordMerchantShopSwitchAuditConflict: jest.fn(async () => 3),
        deadLetterMerchantShopSwitchAuditOutbox: deadLetter,
        getMerchantShopSwitchAuditOutboxStats: jest.fn(async () => ({
          streamLength: 0,
          pendingCount: 0,
          deadLetterLength: 1
        }))
      },
      { maxPagesPerDrain: 1, maxDeterministicConflicts: 3 }
    );

    await expect(service.drain()).resolves.toMatchObject({
      completed: 0,
      failed: 0,
      deadLettered: 1
    });
    expect(deadLetter).toHaveBeenCalledWith(
      {
        kind: "poison",
        streamId: "9-0",
        reason: "completion_retry_exhausted",
        deliveryCount: 3
      },
      { abortSignal: undefined }
    );
  });

  it("does not count transient database failures toward deterministic conflict exhaustion", async () => {
    const event = {
      kind: "completion" as const,
      streamId: "10-0",
      auditId: 100,
      operationId: "operation-conflict",
      status: "completed" as const,
      deliveryCount: 99
    };
    const complete = jest
      .fn<Promise<boolean>, []>()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValue(false);
    let deterministicConflictCount = 0;
    const recordConflict = jest.fn(async () => {
      deterministicConflictCount += 1;
      return deterministicConflictCount;
    });
    const deadLetter = jest.fn(async () => undefined);
    const Service = MerchantShopAuditOutboxService as unknown as new (
      repository: { completeMerchantShopSwitchAudit: typeof complete },
      sessionStore: Record<string, unknown>,
      options: { maxPagesPerDrain: number; maxDeterministicConflicts: number }
    ) => MerchantShopAuditOutboxService;
    const service = new Service(
      { completeMerchantShopSwitchAudit: complete },
      {
        readMerchantShopSwitchAuditOutbox: jest.fn(async () => ({
          items: [event],
          nextPendingCursor: "0-0"
        })),
        acknowledgeMerchantShopSwitchAuditOutbox: jest.fn(async () => undefined),
        recordMerchantShopSwitchAuditConflict: recordConflict,
        deadLetterMerchantShopSwitchAuditOutbox: deadLetter,
        getMerchantShopSwitchAuditOutboxStats: jest.fn(async () => ({
          streamLength: 1,
          pendingCount: 1,
          deadLetterLength: 0
        }))
      },
      { maxPagesPerDrain: 1, maxDeterministicConflicts: 3 }
    );

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(service.drain()).resolves.toMatchObject({ failed: 1, deadLettered: 0 });
    }
    expect(recordConflict).not.toHaveBeenCalled();
    await expect(service.drain()).resolves.toMatchObject({ failed: 1, deadLettered: 0 });
    expect(recordConflict).toHaveBeenLastCalledWith(event, { abortSignal: undefined });
    await expect(service.drain()).resolves.toMatchObject({ failed: 1, deadLettered: 0 });
    await expect(service.drain()).resolves.toMatchObject({ failed: 0, deadLettered: 1 });
    expect(deadLetter).toHaveBeenCalledTimes(1);
  });

  it("stops after an abort that happens while database completion is in flight", async () => {
    const abortController = new AbortController();
    const acknowledge = jest.fn(async () => undefined);
    const stats = jest.fn(async () => ({
      streamLength: 1,
      pendingCount: 1,
      deadLetterLength: 0
    }));
    const complete = jest.fn(async () => {
      abortController.abort(new Error("deadline"));
      return true;
    });
    const service = new MerchantShopAuditOutboxService(
      { completeMerchantShopSwitchAudit: complete },
      {
        readMerchantShopSwitchAuditOutbox: jest.fn(async () => ({
          items: [
            {
              kind: "completion" as const,
              streamId: "11-0",
              auditId: 101,
              operationId: "operation-aborted",
              status: "completed" as const,
              deliveryCount: 1
            }
          ],
          nextPendingCursor: "0-0"
        })),
        acknowledgeMerchantShopSwitchAuditOutbox: acknowledge,
        deadLetterMerchantShopSwitchAuditOutbox: jest.fn(async () => undefined),
        getMerchantShopSwitchAuditOutboxStats: stats
      }
    );

    await expect(service.drain({ abortSignal: abortController.signal })).rejects.toThrow(
      "deadline"
    );
    expect(acknowledge).not.toHaveBeenCalled();
    expect(stats).not.toHaveBeenCalled();
  });
});

describe("MerchantShopAuditOutboxWorker", () => {
  afterEach(() => jest.useRealTimers());

  it("runs one drain at a time, throttles request triggers, and releases its timer on stop", async () => {
    jest.useFakeTimers();
    let releaseFirst: (() => void) | undefined;
    const drain = jest
      .fn<Promise<Record<string, number>>, []>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirst = () => resolve({ streamLength: 1, pendingCount: 1 });
          })
      )
      .mockResolvedValue({ streamLength: 0, pendingCount: 0 });
    const logger = { info: jest.fn(), error: jest.fn() };
    const destroy = jest.fn();
    const worker = new MerchantShopAuditOutboxWorker(
      () => ({ service: { drain } as never, destroy }),
      logger,
      5_000,
      1_000,
      { drainTimeoutMs: 30_000, shutdownTimeoutMs: 10 }
    );

    worker.start();
    worker.trigger();
    worker.trigger();
    await jest.advanceTimersByTimeAsync(5_000);
    expect(drain).toHaveBeenCalledTimes(1);

    releaseFirst?.();
    await Promise.resolve();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(5_000);
    expect(drain).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ streamLength: 0, pendingCount: 0 }),
      expect.any(String)
    );

    await worker.stop();
    expect(jest.getTimerCount()).toBe(0);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("aborts and destroys a dedicated runtime on timeout, then recreates it without accumulating runs", async () => {
    jest.useFakeTimers();
    const drains: jest.Mock[] = [];
    const destroys: jest.Mock[] = [];
    const runtimeFactory = jest.fn(() => {
      const destroy = jest.fn();
      const drain = jest.fn(
        ({ abortSignal }: { abortSignal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            abortSignal.addEventListener("abort", () => reject(new Error("aborted")), {
              once: true
            });
          })
      );
      drains.push(drain);
      destroys.push(destroy);
      return { service: { drain }, destroy };
    });
    const Worker = MerchantShopAuditOutboxWorker as unknown as new (
      factory: typeof runtimeFactory,
      logger: { info: jest.Mock; error: jest.Mock },
      intervalMs: number,
      triggerThrottleMs: number,
      options: { drainTimeoutMs: number; shutdownTimeoutMs: number }
    ) => MerchantShopAuditOutboxWorker;
    const logger = { info: jest.fn(), error: jest.fn() };
    const worker = new Worker(runtimeFactory, logger, 5_000, 1_000, {
      drainTimeoutMs: 20,
      shutdownTimeoutMs: 10
    });

    worker.start();
    worker.start();
    expect(jest.getTimerCount()).toBe(2);
    expect(drains[0]).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(20);
    expect(destroys[0]).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(5_000);
    expect(runtimeFactory).toHaveBeenCalledTimes(2);
    expect(drains[1]).toHaveBeenCalledTimes(1);

    await worker.stop();
    await worker.stop();
    expect(jest.getTimerCount()).toBe(0);
    worker.trigger();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(runtimeFactory).toHaveBeenCalledTimes(2);
  });

  it("destroys a dedicated Redis socket so shutdown is bounded while the server is silent", async () => {
    const sockets = new Set<Socket>();
    const silentServer = createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });
    await new Promise<void>((resolve) => silentServer.listen(0, "127.0.0.1", resolve));
    const address = silentServer.address() as AddressInfo;
    const redisClient = createRedisClient(
      {
        ...env,
        REDIS_URL: `redis://127.0.0.1:${address.port}`,
        REDIS_CONNECT_TIMEOUT_MS: 1_000,
        REDIS_RECONNECT_MAX_RETRIES: 0
      },
      { disableOfflineQueue: true, commandsQueueMaxLength: 10 }
    );
    redisClient.on("error", () => undefined);
    const destroy = jest.fn(() => {
      if (redisClient.isOpen) redisClient.destroy();
    });
    const store = new RedisAuthSessionStore(() => redisClient, { operationTimeoutMs: 10_000 });
    const service = new MerchantShopAuditOutboxService(
      { completeMerchantShopSwitchAudit: jest.fn(async () => true) },
      store
    );
    const worker = new MerchantShopAuditOutboxWorker(
      () => ({ service, destroy }),
      { info: jest.fn(), error: jest.fn() },
      10_000,
      1_000,
      { drainTimeoutMs: 10_000, shutdownTimeoutMs: 100 }
    );

    try {
      worker.start();
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      const startedAt = Date.now();
      await worker.stop();
      expect(Date.now() - startedAt).toBeLessThan(500);
      expect(destroy).toHaveBeenCalledTimes(1);
      expect(redisClient.isOpen).toBe(false);
      worker.trigger();
      expect(destroy).toHaveBeenCalledTimes(1);
    } finally {
      if (redisClient.isOpen) redisClient.destroy();
      sockets.forEach((socket) => socket.destroy());
      await new Promise<void>((resolve, reject) =>
        silentServer.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

  it("retains and retries a runtime whose first destroy attempt fails", async () => {
    jest.useFakeTimers();
    const destroy = jest
      .fn<void, []>()
      .mockImplementationOnce(() => {
        throw new Error("destroy failed");
      })
      .mockImplementation(() => undefined);
    const drain = jest.fn(
      ({ abortSignal }: { abortSignal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          abortSignal.addEventListener("abort", () => reject(abortSignal.reason), { once: true });
        })
    );
    const worker = new MerchantShopAuditOutboxWorker(
      () => ({ service: { drain } as never, destroy }),
      { info: jest.fn(), error: jest.fn() },
      5_000,
      1_000,
      { drainTimeoutMs: 20, shutdownTimeoutMs: 10 }
    );

    worker.start();
    await jest.advanceTimersByTimeAsync(20);
    expect(destroy).toHaveBeenCalledTimes(1);
    await worker.stop();
    expect(destroy).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  });
});
