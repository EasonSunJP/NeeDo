import type { PrismaClient } from "@prisma/client";
import { ERROR_CODES } from "../src/constants/error-codes";
import { ExchangeRequestFeeRepository } from "../src/repositories/exchange-request-fee.repository";
import {
  ExchangeRequestFeeService,
  type ExchangeRequestFeeRepositoryPort,
  type ExchangeRequestFeeSnapshot
} from "../src/services/exchange-request-fee.service";
import {
  createExchangeRequestFeeVersionSchema,
  exchangeRequestFeeHistoryQuerySchema
} from "../src/validators/exchange-request-fee.validator";

const fee: ExchangeRequestFeeSnapshot = {
  ruleSetId: 41,
  ruleSetVersion: 1,
  ruleId: 73,
  amountNdp: 1000,
  effectiveFrom: new Date("2026-08-30T00:00:00.000Z"),
  effectiveTo: null
};

const audit = {
  actorId: 9,
  action: "ignored.by.repository",
  targetType: "ignored",
  ip: "127.0.0.1",
  userAgent: "jest",
  metadata: { secret: "must-not-be-copied" }
};

const createRepositoryPort = (): jest.Mocked<ExchangeRequestFeeRepositoryPort> =>
  ({
    withTransactionClient: jest.fn(),
    findCurrent: jest.fn(async () => fee),
    listVersions: jest.fn(async () => ({
      list: [fee],
      total: 1,
      page: 1,
      page_size: 20
    })),
    createVersion: jest.fn(async () => ({ kind: "success", value: fee })),
    recordPublicationCalculation: jest.fn(async () => 501)
  }) as unknown as jest.Mocked<ExchangeRequestFeeRepositoryPort>;

describe("ExchangeRequestFeeService", () => {
  it("returns the one effective fixed Request fee", async () => {
    const repository = createRepositoryPort();
    const service = new ExchangeRequestFeeService(repository);
    const at = new Date("2026-08-30T01:00:00.000Z");

    await expect(service.resolveCurrent(at)).resolves.toEqual(fee);
    expect(repository.findCurrent).toHaveBeenCalledWith(at);
  });

  it("fails closed when there is no single usable fee", async () => {
    const repository = createRepositoryPort();
    repository.findCurrent.mockResolvedValue(null);
    const service = new ExchangeRequestFeeService(repository);

    await expect(service.resolveCurrent(new Date())).rejects.toMatchObject({
      code: ERROR_CODES.EXCHANGE_REQUEST_FEE_UNAVAILABLE,
      message: "error.exchange.request_fee_unavailable",
      statusCode: 503
    });
  });

  it("rejects a negative persisted amount even if a repository adapter returns it", async () => {
    const repository = createRepositoryPort();
    repository.findCurrent.mockResolvedValue({ ...fee, amountNdp: -1 });
    const service = new ExchangeRequestFeeService(repository);

    await expect(service.resolveCurrent(new Date())).rejects.toMatchObject({
      code: ERROR_CODES.EXCHANGE_REQUEST_FEE_UNAVAILABLE,
      statusCode: 503
    });
  });

  it("preserves a caller-owned transaction client", async () => {
    const repository = createRepositoryPort();
    const transactionRepository = createRepositoryPort();
    const transactionClient = { transaction: "request-publication" };
    repository.withTransactionClient.mockReturnValue(transactionRepository);

    const transactionService = new ExchangeRequestFeeService(repository).withTransactionClient(
      transactionClient
    );

    expect(repository.withTransactionClient).toHaveBeenCalledWith(transactionClient);
    expect(transactionService).toBeInstanceOf(ExchangeRequestFeeService);
    await expect(transactionService.resolveCurrent(fee.effectiveFrom as Date)).resolves.toEqual(
      fee
    );
    expect(transactionRepository.findCurrent).toHaveBeenCalledTimes(1);
    expect(repository.findCurrent).not.toHaveBeenCalled();
  });

  it("records the immutable publication calculation through the bound repository", async () => {
    const repository = createRepositoryPort();
    const service = new ExchangeRequestFeeService(repository);
    const calculatedAt = new Date("2026-08-30T01:02:03.000Z");

    await expect(
      service.recordPublicationCalculation({
        exchangePostId: 88,
        payerType: "shop",
        payerId: 19,
        fee,
        calculatedAt
      })
    ).resolves.toBe(501);
    expect(repository.recordPublicationCalculation).toHaveBeenCalledWith({
      exchangePostId: 88,
      payerType: "shop",
      payerId: 19,
      fee,
      calculatedAt
    });
  });

  it("returns paginated fee history", async () => {
    const repository = createRepositoryPort();
    const service = new ExchangeRequestFeeService(repository);

    await expect(service.listVersions({ page: 2, pageSize: 10 })).resolves.toMatchObject({
      total: 1,
      page: 1,
      page_size: 20
    });
    expect(repository.listVersions).toHaveBeenCalledWith({ page: 2, pageSize: 10 });
  });

  it("rejects a version write when the expected version is stale", async () => {
    const repository = createRepositoryPort();
    repository.createVersion.mockResolvedValue({ kind: "conflict" });
    const service = new ExchangeRequestFeeService(repository);

    await expect(
      service.createVersion({
        actorUserId: 9,
        amountNdp: 1200,
        effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
        expectedCurrentVersion: 1,
        audit
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.EXCHANGE_REQUEST_FEE_VERSION_CONFLICT,
      message: "error.exchange.request_fee_version_conflict",
      statusCode: 409
    });
  });

  it("rejects invalid internal version input before persistence", async () => {
    const repository = createRepositoryPort();
    const service = new ExchangeRequestFeeService(repository);

    await expect(
      service.createVersion({
        actorUserId: 9,
        amountNdp: -1,
        effectiveFrom: new Date("invalid"),
        expectedCurrentVersion: 0,
        audit
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION, statusCode: 400 });
    expect(repository.createVersion).not.toHaveBeenCalled();
  });
});

describe("Exchange Request fee validators", () => {
  it("normalizes the paginated history query", () => {
    expect(exchangeRequestFeeHistoryQuerySchema.parse({})).toEqual({ page: 1, page_size: 20 });
    expect(exchangeRequestFeeHistoryQuerySchema.parse({ page: "2", page_size: "50" })).toEqual({
      page: 2,
      page_size: 50
    });
  });

  it("requires an offset timestamp and a non-negative integer amount", () => {
    expect(
      createExchangeRequestFeeVersionSchema.safeParse({
        amountNdp: 1200,
        effectiveFrom: "2026-09-01T00:00:00+09:00",
        expectedCurrentVersion: 1
      }).success
    ).toBe(true);
    expect(
      createExchangeRequestFeeVersionSchema.safeParse({
        amountNdp: -1,
        effectiveFrom: "2026-09-01T00:00:00",
        expectedCurrentVersion: 1
      }).success
    ).toBe(false);
  });
});

describe("ExchangeRequestFeeRepository", () => {
  it("selects one exact effective fixed lock-at-publish rule", async () => {
    const findMany = jest.fn(async () => [
      {
        id: fee.ruleSetId,
        version: fee.ruleSetVersion,
        effectiveFrom: fee.effectiveFrom,
        effectiveTo: fee.effectiveTo,
        rules: [{ id: fee.ruleId, baseAmountNdp: fee.amountNdp }]
      }
    ]);
    const repository = new ExchangeRequestFeeRepository({
      platformFeeRuleSet: { findMany }
    } as unknown as PrismaClient);
    const at = new Date("2026-08-30T01:00:00.000Z");

    await expect(repository.findCurrent(at)).resolves.toEqual(fee);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 2,
        where: expect.objectContaining({
          familyCode: "exchange_request_publication",
          status: "active",
          deletedAt: null,
          effectiveFrom: { lte: at }
        }),
        select: expect.objectContaining({
          rules: expect.objectContaining({
            where: expect.objectContaining({
              feeType: "exchange_request_publication_fee",
              orderType: "exchange_request",
              calculationMode: "fixed",
              pricingLockMode: "lock_at_publish",
              status: "active",
              deletedAt: null
            })
          })
        })
      })
    );
  });

  it.each([
    ["no family", []],
    [
      "two families",
      [
        { id: 1, version: 1, effectiveFrom: fee.effectiveFrom, effectiveTo: null, rules: [] },
        { id: 2, version: 2, effectiveFrom: fee.effectiveFrom, effectiveTo: null, rules: [] }
      ]
    ],
    [
      "two rules",
      [
        {
          id: 1,
          version: 1,
          effectiveFrom: fee.effectiveFrom,
          effectiveTo: null,
          rules: [
            { id: 1, baseAmountNdp: 1000 },
            { id: 2, baseAmountNdp: 1000 }
          ]
        }
      ]
    ],
    [
      "negative amount",
      [
        {
          id: 1,
          version: 1,
          effectiveFrom: fee.effectiveFrom,
          effectiveTo: null,
          rules: [{ id: 1, baseAmountNdp: -1 }]
        }
      ]
    ]
  ])("fails closed for %s", async (_label, records) => {
    const repository = new ExchangeRequestFeeRepository({
      platformFeeRuleSet: { findMany: jest.fn(async () => records) }
    } as unknown as PrismaClient);

    await expect(repository.findCurrent(new Date())).resolves.toBeNull();
  });

  it("creates the next version, closes only the expected version, and writes minimal audit metadata", async () => {
    const current = {
      id: fee.ruleSetId,
      name: "Exchange Request Publication Fee",
      description: "Fixed Request publication fee",
      scopeType: "platform",
      priority: 100,
      version: 1,
      effectiveFrom: fee.effectiveFrom,
      effectiveTo: null,
      rules: [
        {
          id: fee.ruleId,
          baseAmountNdp: fee.amountNdp,
          effectiveFrom: fee.effectiveFrom,
          effectiveTo: null
        }
      ]
    };
    const tx = {
      platformFeeRuleSet: {
        findFirst: jest.fn(async () => current),
        updateMany: jest.fn(async () => ({ count: 1 })),
        create: jest.fn(async () => ({
          id: 42,
          version: 2,
          effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
          effectiveTo: null
        }))
      },
      platformFeeRule: {
        updateMany: jest.fn(async () => ({ count: 1 })),
        create: jest.fn(async () => ({ id: 74, baseAmountNdp: 1200 }))
      },
      auditLog: { create: jest.fn(async () => ({ id: 900 })) }
    };
    const client = {
      $transaction: jest.fn(async (handler: (transaction: typeof tx) => unknown) => handler(tx))
    };
    const repository = new ExchangeRequestFeeRepository(client as unknown as PrismaClient);
    const effectiveFrom = new Date("2026-09-01T00:00:00.000Z");

    await expect(
      repository.createVersion({
        actorUserId: 9,
        amountNdp: 1200,
        effectiveFrom,
        expectedCurrentVersion: 1,
        audit
      })
    ).resolves.toEqual({
      kind: "success",
      value: {
        ruleSetId: 42,
        ruleSetVersion: 2,
        ruleId: 74,
        amountNdp: 1200,
        effectiveFrom,
        effectiveTo: null
      }
    });
    expect(tx.platformFeeRuleSet.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 41, version: 1, effectiveTo: null })
      })
    );
    expect(tx.platformFeeRule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 73, effectiveTo: null }) })
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 9,
        action: "exchange.request_fee.version.create",
        targetType: "platform_fee_rule_set",
        targetId: 42,
        metadata: { amountNdp: 1200, version: 2 }
      })
    });
  });

  it("returns a conflict before writes when the expected version is stale", async () => {
    const tx = {
      platformFeeRuleSet: {
        findFirst: jest.fn(async () => ({ ...fee, id: 41, version: 2, rules: [] })),
        updateMany: jest.fn(),
        create: jest.fn()
      },
      platformFeeRule: { updateMany: jest.fn(), create: jest.fn() },
      auditLog: { create: jest.fn() }
    };
    const client = {
      $transaction: jest.fn(async (handler: (transaction: typeof tx) => unknown) => handler(tx))
    };
    const repository = new ExchangeRequestFeeRepository(client as unknown as PrismaClient);

    await expect(
      repository.createVersion({
        actorUserId: 9,
        amountNdp: 1200,
        effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
        expectedCurrentVersion: 1,
        audit
      })
    ).resolves.toEqual({ kind: "conflict" });
    expect(tx.platformFeeRuleSet.updateMany).not.toHaveBeenCalled();
    expect(tx.platformFeeRule.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("throws inside the database transaction when a conditional close loses its race", async () => {
    const current = {
      id: fee.ruleSetId,
      name: "Exchange Request Publication Fee",
      description: null,
      scopeType: "platform",
      priority: 100,
      version: 1,
      effectiveFrom: fee.effectiveFrom,
      effectiveTo: null,
      rules: [
        {
          id: fee.ruleId,
          baseAmountNdp: fee.amountNdp,
          effectiveFrom: fee.effectiveFrom,
          effectiveTo: null
        }
      ]
    };
    const tx = {
      platformFeeRuleSet: {
        findFirst: jest.fn(async () => current),
        updateMany: jest.fn(async () => ({ count: 1 })),
        create: jest.fn()
      },
      platformFeeRule: {
        updateMany: jest.fn(async () => ({ count: 0 })),
        create: jest.fn()
      },
      auditLog: { create: jest.fn() }
    };
    const transaction = jest.fn(async (handler: (transactionClient: typeof tx) => unknown) =>
      handler(tx)
    );
    const repository = new ExchangeRequestFeeRepository({
      $transaction: transaction
    } as unknown as PrismaClient);

    await expect(
      repository.createVersion({
        actorUserId: 9,
        amountNdp: 1200,
        effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
        expectedCurrentVersion: 1,
        audit
      })
    ).resolves.toEqual({ kind: "conflict" });
    await expect(transaction.mock.results[0]?.value).rejects.toThrow();
    expect(tx.platformFeeRuleSet.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("persists a Request-scoped calculation log without a Booking reference", async () => {
    const create = jest.fn(async () => ({ id: 501 }));
    const repository = new ExchangeRequestFeeRepository({
      feeCalculationLog: { create }
    } as unknown as PrismaClient);
    const calculatedAt = new Date("2026-08-30T01:02:03.000Z");

    await expect(
      repository.recordPublicationCalculation({
        exchangePostId: 88,
        payerType: "user",
        payerId: 9,
        fee,
        calculatedAt
      })
    ).resolves.toBe(501);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingOrderId: null,
        exchangePostId: 88,
        calculationStage: "request_publication",
        feeType: "exchange_request_publication_fee",
        payerType: "user",
        payerId: 9,
        baseFeeNdp: 1000,
        finalFeeNdp: 1000,
        holdAmountNdp: 1000,
        appliedRuleIdsJson: [73],
        calculatedAt
      }),
      select: { id: true }
    });
  });
});
