import { AffiliateMarketplaceRepository } from "../src/repositories/affiliate-marketplace.repository";
import type {
  AffiliateMarketplaceRepositoryPort,
  AffiliateMarketplaceTransactionClient
} from "../src/services/affiliate-marketplace.service";

describe("AffiliateMarketplaceRepository contract", () => {
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
