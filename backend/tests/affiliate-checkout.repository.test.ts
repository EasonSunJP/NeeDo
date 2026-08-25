import { AffiliateCheckoutRepository } from "../src/repositories/affiliate-checkout.repository";
import type { AffiliateCheckoutRepositoryPort } from "../src/services/affiliate-checkout.service";

describe("AffiliateCheckoutRepository contract", () => {
  it("scopes every operation to the caller transaction", () => {
    const transactionClient = {
      $queryRaw: jest.fn(),
      affiliateClaim: { findFirst: jest.fn() }
    };
    const repository = new AffiliateCheckoutRepository({} as never);

    const scoped = repository.forTransaction(transactionClient);

    expect(scoped).toBeInstanceOf(AffiliateCheckoutRepository);
    expect(scoped).not.toBe(repository);
  });

  it("exposes the complete checkout persistence boundary", () => {
    const repository: AffiliateCheckoutRepositoryPort =
      new AffiliateCheckoutRepository({} as never);

    expect(repository).toEqual(
      expect.objectContaining({
        forTransaction: expect.any(Function),
        resolveAndLockPromotion: expect.any(Function),
        serviceIsInTaskScope: expect.any(Function),
        createTouch: expect.any(Function),
        createAttribution: expect.any(Function),
        allocateAttribution: expect.any(Function),
        createAttributionAudit: expect.any(Function),
        lockActiveAttributionForCancellation: expect.any(Function),
        invalidateAttributionAndRelease: expect.any(Function),
        createInvalidationAudit: expect.any(Function)
      })
    );
  });
});
