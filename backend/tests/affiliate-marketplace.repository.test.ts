import { AffiliateMarketplaceRepository } from "../src/repositories/affiliate-marketplace.repository";
import type {
  AffiliateMarketplaceRepositoryPort,
  AffiliateMarketplaceTransactionClient
} from "../src/services/affiliate-marketplace.service";

const sqlText = (query: { strings?: readonly string[] }): string => query.strings?.join(" ") ?? "";

const marketplaceTaskRow = (id: number) => ({
  id,
  taskCode: `AFF-PUBLIC-${id}`,
  lineageKey: `lineage-${id}`,
  version: 1,
  lockVersion: 1,
  publisherType: "PLATFORM",
  publisherMerchantAccountId: null,
  publisherShopId: null,
  name: `Visible task ${id}`,
  description: null,
  coverMediaAssetId: id,
  coverMediaAsset: {
    id,
    url: `https://cdn.needo.test/task-${id}.jpg`,
    mimeType: "image/jpeg",
    usageType: "cover",
    altText: `Task ${id}`,
    sortOrder: 0,
    isActive: true,
    purgedAt: null,
    deletedAt: null
  },
  rewardNdpPerCompletedOrder: 100,
  totalBudgetNdp: 10000,
  reservedBudgetNdp: 10000,
  allocatedBudgetNdp: 0,
  settledBudgetNdp: 0,
  releasedBudgetNdp: 0,
  customerDiscountType: "NONE",
  fixedDiscountJpy: 0,
  discountRateBps: 0,
  discountCapJpy: 0,
  minimumOrderAmountJpy: 0,
  claimStartsAt: new Date("2026-08-01T00:00:00.000Z"),
  claimEndsAt: new Date("2026-09-30T00:00:00.000Z"),
  taskStartsAt: new Date("2026-08-01T00:00:00.000Z"),
  taskEndsAt: new Date("2026-10-31T00:00:00.000Z"),
  attributionWindowDays: 30,
  maxCompletedOrdersPerClaim: null,
  maxCompletedOrdersPerCustomer: null,
  serviceScopeMode: "SELECTED",
  status: "ACTIVE",
  reviewedById: 1,
  reviewedAt: new Date("2026-07-31T00:00:00.000Z"),
  rejectionReason: null,
  submittedAt: new Date("2026-07-30T00:00:00.000Z"),
  activatedAt: new Date("2026-08-01T00:00:00.000Z"),
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  shops: [
    {
      id,
      shopId: id,
      shopNameSnapshot: `Shop ${id}`,
      deletedAt: null,
      shop: {
        city: "Tokyo",
        address: `Shibuya ${id}`,
        publicIdentifier: {
          publicId: `shop${String(id).padStart(10, "0")}`,
          status: "ACTIVE",
          deletedAt: null
        },
        mediaAssets: [
          {
            id,
            url: `https://cdn.needo.test/shop-${id}.jpg`,
            mimeType: "image/jpeg",
            usageType: "cover",
            altText: `Shop ${id}`,
            sortOrder: 0,
            isActive: true,
            purgedAt: null,
            deletedAt: null
          }
        ]
      }
    }
  ],
  services: [
    {
      id,
      shopId: id,
      serviceId: id,
      serviceNameSnapshot: `Service ${id}`,
      servicePriceJpySnapshot: 1000,
      deletedAt: null
    }
  ],
  budgetReservation: {
    id,
    taskId: id,
    walletId: id,
    totalFrozenNdp: 10000,
    allocatedNdp: 0,
    capturedNdp: 0,
    releasedNdp: 0,
    status: "ACTIVE",
    idempotencyKey: `reservation-${id}`,
    frozenAt: new Date("2026-07-31T00:00:00.000Z"),
    releasedAt: null,
    deletedAt: null
  }
});

describe("AffiliateMarketplaceRepository contract", () => {
  it("paginates beyond 100 eligible tasks with one eligibility query, one count, and one batched load", async () => {
    const ids = [101, 102, 103, 104, 105];
    const queryRaw = jest.fn(async (query: { strings?: readonly string[] }) =>
      sqlText(query).includes("COUNT(DISTINCT task.id)")
        ? [{ total: 105n }]
        : ids.map((id) => ({ id }))
    );
    const findMany = jest.fn(async () => ids.map(marketplaceTaskRow));
    const repository = new AffiliateMarketplaceRepository({
      $queryRaw: queryRaw,
      affiliateTask: { findMany }
    } as never);

    const result = await repository.listClaimableTasks({
      page: 11,
      pageSize: 10,
      keyword: "Visible",
      now: new Date("2026-08-29T03:00:00.000Z")
    });

    expect(result).toMatchObject({
      total: 105,
      page: 11,
      page_size: 10,
      list: ids.map((id) => ({
        id,
        taskCode: `AFF-PUBLIC-${id}`,
        status: "active",
        coverImageUrl: `https://cdn.needo.test/task-${id}.jpg`,
        shops: [
          expect.objectContaining({
            publicId: `shop${String(id).padStart(10, "0")}`,
            city: "Tokyo",
            address: `Shibuya ${id}`,
            mediaAssets: [
              {
                url: `https://cdn.needo.test/shop-${id}.jpg`,
                altText: `Shop ${id}`,
                sortOrder: 0
              }
            ]
          })
        ]
      }))
    });
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ids }, deletedAt: null },
        include: expect.objectContaining({
          coverMediaAsset: true,
          shops: expect.objectContaining({
            include: expect.objectContaining({ shop: expect.any(Object) })
          })
        })
      })
    );
    const idQuery = queryRaw.mock.calls
      .map(([query]) => query)
      .find((query) => !sqlText(query).includes("COUNT(DISTINCT task.id)"));
    const eligibilitySql = sqlText(idQuery ?? {});
    expect(eligibilitySql).toContain("LIMIT");
    expect(eligibilitySql).toContain("OFFSET");
    expect(eligibilitySql).toContain("task.status IN ('scheduled', 'active')");
    expect(eligibilitySql).toContain("task.claim_starts_at <=");
    expect(eligibilitySql).toContain("task.claim_ends_at >");
    expect(eligibilitySql).toContain("task.task_ends_at >");
    expect(eligibilitySql).toContain("reservation.status = 'active'");
    expect(eligibilitySql).toContain("reservation.total_frozen_ndp");
    expect(eligibilitySql).toContain("EXISTS");
    expect(eligibilitySql).toContain("task.name LIKE");
    expect((idQuery as { values?: unknown[] }).values).toEqual(
      expect.arrayContaining([10, 100, "%Visible%"])
    );
  });

  it("propagates eligibility query failures and never falls back to per-task reads", async () => {
    const infrastructureFailure = new Error("database connection lost");
    const queryRaw = jest.fn(async () => {
      throw infrastructureFailure;
    });
    const findMany = jest.fn();
    const findFirst = jest.fn();
    const repository = new AffiliateMarketplaceRepository({
      $queryRaw: queryRaw,
      affiliateTask: { findMany, findFirst }
    } as never);

    await expect(
      repository.listClaimableTasks({
        page: 1,
        pageSize: 10,
        now: new Date("2026-08-29T03:00:00.000Z")
      })
    ).rejects.toBe(infrastructureFailure);
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(findMany).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("reuses a caller transaction without opening a nested transaction", async () => {
    const transactionClient = { affiliateClaim: { findFirst: jest.fn() } };
    const rootClient = { $transaction: jest.fn() };
    const repository = new AffiliateMarketplaceRepository(rootClient as never);

    const result = await repository.runInTransaction(
      async (
        scopedRepository: AffiliateMarketplaceRepositoryPort,
        scopedClient?: AffiliateMarketplaceTransactionClient
      ) => {
        expect(scopedRepository).toBeInstanceOf(AffiliateMarketplaceRepository);
        expect(scopedClient).toBe(transactionClient);
        return "reused";
      },
      transactionClient as AffiliateMarketplaceTransactionClient
    );

    expect(result).toBe("reused");
    expect(rootClient.$transaction).not.toHaveBeenCalled();
  });

  it("exposes the complete marketplace persistence boundary", () => {
    const repository = new AffiliateMarketplaceRepository({} as never);

    expect(repository).toEqual(
      expect.objectContaining({
        runInTransaction: expect.any(Function),
        listClaimableTasks: expect.any(Function),
        findClaimableTaskById: expect.any(Function),
        findTaskById: expect.any(Function),
        lockClaimableTaskForShare: expect.any(Function),
        findClaimByTaskAndUser: expect.any(Function),
        createClaim: expect.any(Function),
        classifyClaimUniqueConflict: expect.any(Function),
        listClaimsByUser: expect.any(Function),
        findClaimByIdAndUser: expect.any(Function),
        findClaimByPublicTokenId: expect.any(Function),
        createClaimAuditLog: expect.any(Function)
      })
    );
  });

  it("classifies Prisma claim uniqueness targets without leaking native errors", () => {
    const repository = new AffiliateMarketplaceRepository({} as never);

    expect(
      repository.classifyClaimUniqueConflict({
        code: "P2002",
        meta: { target: ["active_key"] }
      })
    ).toMatchObject({ field: "active_key" });
    expect(
      repository.classifyClaimUniqueConflict({
        code: "P2002",
        meta: { target: ["public_code"] }
      })
    ).toMatchObject({ field: "public_code" });
    expect(
      repository.classifyClaimUniqueConflict({
        code: "P2002",
        meta: {
          modelName: "AffiliateClaim",
          driverAdapterError: {
            cause: {
              kind: "UniqueConstraintViolation",
              constraint: { index: "affiliate_claims_active_key_key" }
            }
          }
        }
      })
    ).toMatchObject({ field: "active_key" });
    expect(repository.classifyClaimUniqueConflict(new Error("other"))).toBeNull();
  });
});
