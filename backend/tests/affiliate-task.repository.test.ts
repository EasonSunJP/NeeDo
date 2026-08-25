import { AffiliateTaskRepository } from "../src/repositories/affiliate-task.repository";
import type {
  AffiliateTaskRepositoryPort,
  AffiliateTaskTransactionClient
} from "../src/services/affiliate-task.service";

describe("AffiliateTaskRepository transaction boundary", () => {
  it("reuses the caller transaction client instead of opening a nested transaction", async () => {
    const transactionClient = { affiliateTask: { findFirst: jest.fn() } };
    const rootClient = { $transaction: jest.fn() };
    const repository = new AffiliateTaskRepository(rootClient as never);

    const result = await repository.runInTransaction(
      async (
        scopedRepository: AffiliateTaskRepositoryPort,
        scopedClient?: AffiliateTaskTransactionClient
      ) => {
        expect(scopedRepository).toBeInstanceOf(AffiliateTaskRepository);
        expect(scopedClient).toBe(transactionClient);
        return "reused";
      },
      transactionClient as AffiliateTaskTransactionClient
    );

    expect(result).toBe("reused");
    expect(rootClient.$transaction).not.toHaveBeenCalled();
  });

  it("exposes the complete persistence contract used by the application service", () => {
    const repository = new AffiliateTaskRepository({} as never);

    expect(repository).toEqual(
      expect.objectContaining({
        getManageableMerchantAccountIds: expect.any(Function),
        findActiveShopsByIds: expect.any(Function),
        findActiveMerchantShops: expect.any(Function),
        findEligibleServices: expect.any(Function),
        createTask: expect.any(Function),
        updateDraftTask: expect.any(Function),
        replaceTaskScopeSnapshots: expect.any(Function),
        findTaskById: expect.any(Function),
        lockTask: expect.any(Function),
        listPublisherTasks: expect.any(Function),
        listBackofficeTasks: expect.any(Function),
        markTaskSubmitted: expect.any(Function),
        createBudgetReservation: expect.any(Function),
        createBudgetTransactionLink: expect.any(Function),
        lockBudgetReservation: expect.any(Function),
        markTaskApproved: expect.any(Function),
        markTaskRejected: expect.any(Function),
        releaseBudgetReservation: expect.any(Function),
        createAuditLog: expect.any(Function)
      })
    );
  });

  it("combines publisher visibility and keyword filters without widening scope", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const client = {
      affiliateTask: {
        findMany,
        count: jest.fn().mockResolvedValue(0)
      }
    };
    const repository = new AffiliateTaskRepository(client as never);

    await repository.listPublisherTasks({
      shopId: 11,
      merchantAccountIds: [31],
      keyword: "Shibuya",
      page: 1,
      pageSize: 20
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          AND: [
            {
              OR: [
                { publisherType: "SHOP", publisherShopId: 11 },
                {
                  publisherType: "MERCHANT_ACCOUNT",
                  publisherMerchantAccountId: { in: [31] }
                }
              ]
            },
            {
              OR: [
                { name: { contains: "Shibuya" } },
                { taskCode: { contains: "Shibuya" } }
              ]
            }
          ]
        })
      })
    );
  });
});
