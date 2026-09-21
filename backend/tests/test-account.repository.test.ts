import { TestAccountRepository } from "../src/repositories/test-account.repository";

const createClient = () => ({
  shop: { findMany: jest.fn(async () => [] as Array<{ id: number }>) },
  wallet: { findFirst: jest.fn(async () => null as { id: number } | null) },
  walletHold: { findFirst: jest.fn(async () => null) },
  walletAdjustmentRequest: { findFirst: jest.fn(async () => null) },
  orderFinancial: { findFirst: jest.fn(async () => null as { id: number } | null) },
  user: { updateMany: jest.fn(async () => ({ count: 1 })) },
  auditLog: { create: jest.fn(async () => ({ id: 1 })) },
  $executeRaw: jest.fn(async () => 1)
});

describe("TestAccountRepository", () => {
  it("checks every in-flight source-currency state before reclassification", async () => {
    const client = createClient();
    const repository = new TestAccountRepository(client as never);

    await expect(repository.hasActiveFinancialState(41, "TEST_NDP")).resolves.toBe(false);
    expect(client.wallet.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ ownerType: "USER", ownerId: 41 }],
        currency: "TEST_NDP",
        frozenBalance: { gt: 0 },
        deletedAt: null
      },
      select: { id: true }
    });
    expect(client.walletHold.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: [{ ownerType: "USER", ownerId: 41 }],
        currency: "TEST_NDP",
        status: { in: ["active", "partially_captured"] }
      }),
      select: { id: true }
    });
    expect(client.walletAdjustmentRequest.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: [{ ownerType: "USER", ownerId: 41 }],
        status: "PENDING",
        wallet: { currency: "TEST_NDP", deletedAt: null }
      }),
      select: { id: true }
    });
    expect(client.orderFinancial.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: [{ customerUserId: 41 }],
        ndpCurrency: "TEST_NDP",
        settlementStatus: {
          notIn: ["settled", "cancelled", "compensated", "refunded"]
        }
      }),
      select: { id: true }
    });

    client.wallet.findFirst.mockResolvedValueOnce({ id: 91 });
    await expect(repository.hasActiveFinancialState(41, "TEST_NDP")).resolves.toBe(true);
  });

  it("treats unsettled Test NDP activity in an authoritatively owned shop as account activity", async () => {
    const client = createClient();
    client.shop.findMany.mockResolvedValueOnce([{ id: 91 }]);
    client.orderFinancial.findFirst.mockResolvedValueOnce({ id: 701 });

    await expect(
      new TestAccountRepository(client as never).hasActiveFinancialState(41, "TEST_NDP")
    ).resolves.toBe(true);

    expect(client.shop.findMany).toHaveBeenCalledWith({
      where: { ownerUserId: 41, deletedAt: null },
      select: { id: true }
    });
    expect(client.orderFinancial.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: [{ customerUserId: 41 }, { shopId: { in: [91] } }],
        ndpCurrency: "TEST_NDP"
      }),
      select: { id: true }
    });
  });

  it("uses optimistic state and timestamp conditions for the classification update", async () => {
    const client = createClient();
    const repository = new TestAccountRepository(client as never);
    const expectedUpdatedAt = new Date("2026-08-30T01:02:03.000Z");

    await expect(
      repository.updateClassification({
        userId: 41,
        fromTestAccount: false,
        toTestAccount: true,
        expectedUpdatedAt
      })
    ).resolves.toBe(true);
    expect(client.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 41,
        isTestAccount: false,
        updatedAt: expectedUpdatedAt,
        deletedAt: null
      },
      data: { isTestAccount: true }
    });
  });
});
