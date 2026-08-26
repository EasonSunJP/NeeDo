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
    const repository: AffiliateCheckoutRepositoryPort = new AffiliateCheckoutRepository(
      {} as never
    );

    expect(repository).toEqual(
      expect.objectContaining({
        forTransaction: expect.any(Function),
        resolvePromotion: expect.any(Function),
        resolveAndLockPromotion: expect.any(Function),
        findValidationSlot: expect.any(Function),
        serviceIsInTaskScope: expect.any(Function),
        createTouch: expect.any(Function),
        createAttribution: expect.any(Function),
        allocateAttribution: expect.any(Function),
        createAttributionAudit: expect.any(Function),
        lockActiveAttributionForCancellation: expect.any(Function),
        lockAttributionForCompletion: expect.any(Function),
        countSettledCustomerOrders: expect.any(Function),
        qualifyAttributionAndCreateReward: expect.any(Function),
        settleRewardAndCaptureBudget: expect.any(Function),
        createRewardSettlementAudit: expect.any(Function),
        invalidateAttributionAndRelease: expect.any(Function),
        createInvalidationAudit: expect.any(Function)
      })
    );
  });

  it("uses a current locking read for the settled-customer limit", async () => {
    const transactionClient = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 11 }, { id: 12 }])
    };
    const repository = new AffiliateCheckoutRepository(transactionClient as never);

    await expect(
      repository.countSettledCustomerOrders({ taskId: 31, customerUserId: 501 })
    ).resolves.toBe(2);
    expect(transactionClient.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("keeps a technician-priced booking settleable from its attribution snapshot", async () => {
    const transactionClient = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          attributionId: 71,
          attributionStatus: "attributed",
          taskId: 31,
          claimId: 41,
          claimantUserId: 601,
          customerUserId: 501,
          shopId: 21,
          serviceId: 11,
          rewardAllocatedNdp: 1_000,
          taskStatus: "active",
          taskStartsAt: new Date("2026-08-25T00:00:00.000Z"),
          taskEndsAt: new Date("2026-09-25T00:00:00.000Z"),
          maxCompletedOrdersPerClaim: null,
          maxCompletedOrdersPerCustomer: null,
          claimCompletedOrderCount: 0,
          reservationId: 81,
          publisherWalletId: 91,
          publisherOwnerType: "shop",
          publisherMerchantAccountId: null,
          publisherShopId: 21,
          rewardId: null,
          rewardStatus: null,
          rewardNdp: null,
          rewardLedgerTransactionId: null,
          rewardPublisherWalletId: null,
          rewardClaimantWalletId: null,
          bookingCustomerUserId: 501,
          bookingShopId: 21,
          bookingServiceId: 11
        }
      ])
    };
    const repository = new AffiliateCheckoutRepository(transactionClient as never);

    await expect(repository.lockAttributionForCompletion(401)).resolves.toMatchObject({
      attributionId: 71,
      serviceId: 11,
      customerUserId: 501,
      shopId: 21
    });
    const query = transactionClient.$queryRaw.mock.calls[0]?.[0] as {
      strings?: readonly string[];
    };
    const sql = query.strings?.join(" ") ?? "";
    expect(sql).toContain("LEFT JOIN technician_services");
    expect(sql).not.toContain("booked_technician_service.deleted_at");
  });
});
