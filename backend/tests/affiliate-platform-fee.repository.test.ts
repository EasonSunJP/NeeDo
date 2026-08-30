import type { PrismaClient } from "@prisma/client";
import { AffiliatePlatformFeeRepository } from "../src/repositories/affiliate-platform-fee.repository";

const now = new Date("2026-08-30T02:00:00.000Z");
const rule = {
  id: 41,
  scopeType: "GLOBAL",
  scopeKey: "global",
  shopId: null,
  feeBps: 1000,
  version: 1,
  effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
  effectiveTo: null,
  activeKey: "global",
  reason: "initial",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  createdBy: null,
  updatedBy: null
};

describe("AffiliatePlatformFeeRepository", () => {
  it("loads effective global and shop rules without deleted or future rows", async () => {
    const findMany = jest.fn().mockResolvedValue([rule]);
    const client = { affiliatePlatformFeeRule: { findMany } } as unknown as PrismaClient;
    const repository = new AffiliatePlatformFeeRepository(client);

    await expect(repository.findEffectiveRules([11, 12], now)).resolves.toEqual([
      expect.objectContaining({ id: 41, scopeType: "global", feeBps: 1000 })
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        AND: [{ OR: [{ scopeType: "GLOBAL" }, { scopeType: "SHOP", shopId: { in: [11, 12] } }] }]
      },
      orderBy: [{ scopeType: "asc" }, { shopId: "asc" }, { version: "desc" }],
      select: expect.objectContaining({
        createdBy: { select: { needoId: true } },
        updatedBy: { select: { needoId: true } }
      })
    });
    expect(JSON.stringify(findMany.mock.calls[0]?.[0]?.select)).not.toContain("createdById");
  });

  it("closes the prior version and creates the next version with one audit record", async () => {
    const current = { ...rule, createdBy: null, updatedBy: null };
    const created = {
      ...rule,
      id: 42,
      feeBps: 1100,
      version: 2,
      effectiveFrom: now,
      reason: "adjust",
      createdBy: { needoId: "u0000000003" },
      updatedBy: { needoId: "u0000000003" }
    };
    const transaction = {
      affiliatePlatformFeeRule: {
        findFirst: jest.fn().mockResolvedValue(current),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue(created)
      },
      shop: { findFirst: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 91 }) }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new AffiliatePlatformFeeRepository(client);

    await expect(
      repository.createRuleVersion({
        actorUserId: 3,
        scopeType: "global",
        scopeKey: "global",
        shopId: null,
        feeBps: 1100,
        expectedVersion: 1,
        effectiveFrom: now,
        reason: "adjust",
        audit: {
          actorId: 3,
          action: "backoffice.affiliate_platform_fee_rule.version_created",
          targetType: "AffiliatePlatformFeeRule"
        }
      })
    ).resolves.toMatchObject({ kind: "created", value: { version: 2, feeBps: 1100 } });

    expect(transaction.affiliatePlatformFeeRule.updateMany).toHaveBeenCalledWith({
      where: { id: 41, version: 1, effectiveTo: null, deletedAt: null },
      data: { activeKey: null, effectiveTo: now, updatedById: 3 }
    });
    expect(transaction.affiliatePlatformFeeRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scopeType: "GLOBAL",
        scopeKey: "global",
        shopId: null,
        feeBps: 1100,
        version: 2,
        activeKey: "global",
        createdById: 3,
        updatedById: 3
      }),
      select: expect.any(Object)
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 3,
        action: "backoffice.affiliate_platform_fee_rule.version_created",
        targetId: 42,
        metadata: expect.objectContaining({
          previous: { feeBps: 1000, version: 1 },
          next: { feeBps: 1100, version: 2 }
        })
      })
    });
  });

  it("returns a version conflict before writes when expectedVersion is stale", async () => {
    const transaction = {
      affiliatePlatformFeeRule: {
        findFirst: jest.fn().mockResolvedValue({ ...rule, version: 2 }),
        updateMany: jest.fn(),
        create: jest.fn()
      },
      shop: { findFirst: jest.fn() },
      auditLog: { create: jest.fn() }
    };
    const client = {
      $transaction: jest.fn(async (callback) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new AffiliatePlatformFeeRepository(client);

    await expect(
      repository.createRuleVersion({
        actorUserId: 3,
        scopeType: "global",
        scopeKey: "global",
        shopId: null,
        feeBps: 1100,
        expectedVersion: 1,
        effectiveFrom: now,
        reason: "stale",
        audit: { action: "affiliate", targetType: "AffiliatePlatformFeeRule" }
      })
    ).resolves.toEqual({ kind: "version_conflict" });
    expect(transaction.affiliatePlatformFeeRule.updateMany).not.toHaveBeenCalled();
    expect(transaction.affiliatePlatformFeeRule.create).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it("projects shop labels with each fee rule in the same paginated query", async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        ...rule,
        scopeType: "SHOP",
        scopeKey: "shop:11",
        shopId: 11,
        shop: { name: "GINZA Calm Body", city: "Tokyo" }
      }
    ]);
    const count = jest.fn().mockResolvedValue(1);
    const client = {
      affiliatePlatformFeeRule: { count, findMany }
    } as unknown as PrismaClient;
    const repository = new AffiliatePlatformFeeRepository(client);

    await expect(
      repository.listRules({ page: 1, pageSize: 20, scopeType: "shop" })
    ).resolves.toMatchObject({
      list: [
        {
          shopId: 11,
          shopName: "GINZA Calm Body",
          shopCity: "Tokyo"
        }
      ],
      page: 1,
      page_size: 20,
      total: 1
    });
    expect(findMany.mock.calls[0]?.[0]?.select).toMatchObject({
      shop: { select: { city: true, name: true } }
    });
  });

  it("finds the current, earliest future, and latest global versions at one instant", async () => {
    const current = {
      ...rule,
      effectiveTo: new Date("2026-09-01T00:00:00.000Z"),
      shop: null
    };
    const future = {
      ...rule,
      id: 42,
      version: 2,
      effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
      shop: null
    };
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(future)
      .mockResolvedValueOnce(future);
    const client = {
      affiliatePlatformFeeRule: { findFirst }
    } as unknown as PrismaClient;
    const repository = new AffiliatePlatformFeeRepository(client);

    await expect(repository.getGlobalSummary(now)).resolves.toMatchObject({
      evaluatedAt: now,
      current: { version: 1 },
      nextScheduled: { version: 2 },
      latestVersion: 2
    });
    expect(findFirst).toHaveBeenCalledTimes(3);
    expect(findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          scopeKey: "global",
          deletedAt: null,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }]
        }
      })
    );
    expect(findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          scopeKey: "global",
          deletedAt: null,
          effectiveFrom: { gt: now }
        },
        orderBy: [{ effectiveFrom: "asc" }, { version: "asc" }]
      })
    );
  });

  it("searches only published non-deleted shops and returns minimal fields", async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([{ id: 11, name: "GINZA Calm Body", city: "Tokyo" }]);
    const count = jest.fn().mockResolvedValue(1);
    const client = { shop: { count, findMany } } as unknown as PrismaClient;
    const repository = new AffiliatePlatformFeeRepository(client);

    await expect(
      repository.listEligibleShops({ keyword: "11", page: 1, pageSize: 10 })
    ).resolves.toEqual({
      list: [{ id: 11, name: "GINZA Calm Body", city: "Tokyo" }],
      total: 1,
      page: 1,
      page_size: 10
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        status: "published",
        OR: [{ name: { contains: "11" } }, { id: 11 }]
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: 0,
      take: 10,
      select: { id: true, name: true, city: true }
    });
  });
});
