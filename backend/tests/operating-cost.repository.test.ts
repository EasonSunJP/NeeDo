import type { Prisma } from "@prisma/client";
import { OperatingCostRepository } from "../src/repositories/operating-cost.repository";

const publicId = "11111111-1111-4111-8111-111111111111";
const shops = [
  {
    id: 3,
    name: "Shop 3",
    publicIdentifier: {
      publicId: "shop0000000003",
      kind: "SHOP",
      status: "ACTIVE",
      deletedAt: null
    }
  },
  {
    id: 1,
    name: "Shop 1",
    publicIdentifier: {
      publicId: "shop0000000001",
      kind: "SHOP",
      status: "ACTIVE",
      deletedAt: null
    }
  },
  {
    id: 2,
    name: "Shop 2",
    publicIdentifier: {
      publicId: "shop0000000002",
      kind: "SHOP",
      status: "ACTIVE",
      deletedAt: null
    }
  }
];

const createHarness = (
  allocationMode: "EQUAL_ACTIVE_SHOPS" | "PLATFORM_INCOME_PROPORTIONAL",
  options: { auditFailure?: Error } = {}
) => {
  const allocationRows: Array<{
    operatingCostItemId: number;
    shopId: number;
    amountJpy: bigint;
    allocationWeight: Prisma.Decimal | null;
    calculationSnapshotJson: Prisma.JsonValue;
  }> = [];
  const audits: Array<Record<string, unknown>> = [];
  const sqlEvidence: string[] = [];
  const item = {
    id: 31,
    publicId,
    costCode: "server-2026-09",
    version: 1,
    categoryCode: "server",
    name: "September infrastructure",
    amountJpy: 1_000n,
    currency: "JPY",
    periodStart: new Date("2026-09-01T00:00:00.000Z"),
    periodEnd: new Date("2026-09-30T00:00:00.000Z"),
    allocationMode,
    status: "DRAFT" as "DRAFT" | "PUBLISHED",
    effectiveAt: new Date("2026-09-02T00:00:00.000Z"),
    publishedAt: null as Date | null,
    configuredById: 91,
    reason: "monthly server invoice",
    configurationSnapshotJson: { schemaVersion: 1, directAssignments: null },
    createdAt: new Date("2026-09-02T00:00:00.000Z"),
    updatedAt: new Date("2026-09-02T00:00:00.000Z")
  };
  const stored = () => ({
    ...item,
    allocations: allocationRows.map((allocation) => {
      const shop = shops.find((candidate) => candidate.id === allocation.shopId);
      if (!shop) throw new Error("missing shop fixture");
      return {
        amountJpy: allocation.amountJpy,
        allocationWeight: allocation.allocationWeight,
        calculationSnapshotJson: allocation.calculationSnapshotJson,
        shop: { name: shop.name, publicIdentifier: shop.publicIdentifier }
      };
    })
  });
  const transaction = {
    $queryRaw: jest.fn(async (sql: { strings?: readonly string[] }) => {
      const text = sql.strings?.join("?") ?? String(sql);
      sqlEvidence.push(text);
      if (text.includes("operating_cost_settled_platform_income_basis")) {
        return [
          { shopId: 1, settledPlatformIncomeJpy: 300n },
          { shopId: 2, settledPlatformIncomeJpy: 100n }
        ];
      }
      return [{ id: item.id }];
    }),
    operatingCostItem: {
      findFirst: jest.fn(async () => stored()),
      update: jest.fn(async ({ data }: { data: { status: "PUBLISHED"; publishedAt: Date } }) => {
        item.status = data.status;
        item.publishedAt = data.publishedAt;
        return stored();
      })
    },
    operatingCostAllocation: {
      create: jest.fn(async ({ data }: { data: (typeof allocationRows)[number] }) => {
        allocationRows.push(data);
        return data;
      })
    },
    shop: {
      findMany: jest.fn(async (args: { where?: { id?: { in?: number[] } } }) => {
        const ids = args.where?.id?.in;
        return ids ? shops.filter((shop) => ids.includes(shop.id)) : shops;
      })
    },
    auditLog: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (options.auditFailure) throw options.auditFailure;
        audits.push(data);
        return data;
      })
    }
  };
  const client = {
    $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) => {
      const status = item.status;
      const publishedAt = item.publishedAt;
      const allocations = allocationRows.map((row) => ({ ...row }));
      const auditSnapshot = audits.map((row) => ({ ...row }));
      try {
        return await callback(transaction);
      } catch (error) {
        item.status = status;
        item.publishedAt = publishedAt;
        allocationRows.splice(0, allocationRows.length, ...allocations);
        audits.splice(0, audits.length, ...auditSnapshot);
        throw error;
      }
    })
  };
  return {
    repository: new OperatingCostRepository(client as never),
    item,
    allocationRows,
    audits,
    sqlEvidence
  };
};

const command = {
  publicId,
  actorUserId: 91,
  reason: "approved September cost",
  audit: {
    actorId: 91,
    action: "backoffice.operating_cost.published",
    targetType: "OperatingCostItem",
    targetId: null,
    ip: "127.0.0.1",
    userAgent: "operating-cost-test",
    metadata: { publicId }
  }
};

describe("OperatingCostRepository publication", () => {
  it("publishes equal allocations and audit evidence atomically", async () => {
    const harness = createHarness("EQUAL_ACTIVE_SHOPS");
    await expect(harness.repository.publish(command)).resolves.toMatchObject({
      outcome: "published",
      item: {
        status: "published",
        allocations: [
          { shopPublicId: "shop0000000001", amountJpy: 334 },
          { shopPublicId: "shop0000000002", amountJpy: 333 },
          { shopPublicId: "shop0000000003", amountJpy: 333 }
        ]
      }
    });
    expect(harness.allocationRows).toHaveLength(3);
    expect(harness.audits).toHaveLength(1);
    expect(harness.audits[0]).toMatchObject({
      actorId: 91,
      action: "backoffice.operating_cost.published",
      metadata: { allocationCount: 3, allocatedTotalJpy: 1_000 }
    });
  });

  it("uses only settled order/rate and confirmed SaaS evidence for proportional allocation", async () => {
    const harness = createHarness("PLATFORM_INCOME_PROPORTIONAL");
    await expect(harness.repository.publish(command)).resolves.toMatchObject({
      outcome: "published",
      item: {
        allocations: [
          { shopPublicId: "shop0000000001", amountJpy: 750 },
          { shopPublicId: "shop0000000002", amountJpy: 250 }
        ]
      }
    });
    const query = harness.sqlEvidence.find((text) =>
      text.includes("operating_cost_settled_platform_income_basis")
    );
    expect(query).toContain("financial.settlement_status");
    expect(query).toContain("ndp_exchange_rate_rules");
    expect(query).toContain("booking.payment_refunded_at IS NULL");
    expect(query).toContain("saas_payments");
    expect(query).toContain("payment.received_at");
  });

  it("rolls back status and allocations if the atomic audit write fails", async () => {
    const harness = createHarness("EQUAL_ACTIVE_SHOPS", {
      auditFailure: new Error("audit unavailable")
    });
    await expect(harness.repository.publish(command)).rejects.toThrow("audit unavailable");
    expect(harness.item.status).toBe("DRAFT");
    expect(harness.item.publishedAt).toBeNull();
    expect(harness.allocationRows).toHaveLength(0);
    expect(harness.audits).toHaveLength(0);
  });
});
