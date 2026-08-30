import { MerchantShopAuditOutboxService } from "../src/services/merchant-shop-audit-outbox.service";
import { MerchantShopAuditOutboxWorker } from "../src/workers/merchant-shop-audit-outbox.worker";

describe("MerchantShopAuditOutboxService", () => {
  it("keeps a completion pending after a database failure and acknowledges it after retry", async () => {
    const completion = {
      kind: "completion" as const,
      streamId: "1-0",
      auditId: 91,
      operationId: "operation-91",
      status: "completed" as const
    };
    const acknowledge = jest.fn(async () => undefined);
    const complete = jest
      .fn<Promise<boolean>, []>()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce(true);
    const store = {
      readMerchantShopSwitchAuditOutbox: jest.fn(async () => [completion]),
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
      store
    );

    await expect(service.drain()).resolves.toMatchObject({ failed: 1, completed: 0 });
    expect(acknowledge).not.toHaveBeenCalled();
    await expect(service.drain()).resolves.toMatchObject({ failed: 0, completed: 1 });
    expect(acknowledge).toHaveBeenCalledWith(completion);
  });

  it("moves poison events to the bounded DLQ without blocking valid completions", async () => {
    const poison = {
      kind: "poison" as const,
      streamId: "1-0",
      reason: "invalid_completion_event"
    };
    const completion = {
      kind: "completion" as const,
      streamId: "2-0",
      auditId: 92,
      operationId: "operation-92",
      status: "completed" as const
    };
    const acknowledge = jest.fn(async () => undefined);
    const deadLetter = jest.fn(async () => undefined);
    const service = new MerchantShopAuditOutboxService(
      { completeMerchantShopSwitchAudit: jest.fn(async () => true) },
      {
        readMerchantShopSwitchAuditOutbox: jest.fn(async () => [poison, completion]),
        acknowledgeMerchantShopSwitchAuditOutbox: acknowledge,
        deadLetterMerchantShopSwitchAuditOutbox: deadLetter,
        getMerchantShopSwitchAuditOutboxStats: jest.fn(async () => ({
          streamLength: 0,
          pendingCount: 0,
          deadLetterLength: 1
        }))
      }
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
    expect(deadLetter).toHaveBeenCalledWith(poison);
    expect(acknowledge).toHaveBeenCalledWith(completion);
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
    const worker = new MerchantShopAuditOutboxWorker({ drain } as never, logger, 5_000, 1_000);

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

    worker.stop();
    expect(jest.getTimerCount()).toBe(0);
  });
});
