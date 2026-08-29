import { AffiliateCheckoutRepository } from "../src/repositories/affiliate-checkout.repository";
import type { AffiliateCheckoutRepositoryPort } from "../src/services/affiliate-checkout.service";

describe("AffiliateCheckoutRepository contract", () => {
  const createSettlementClient = (closureCount: number) => ({
    $executeRaw: jest.fn().mockResolvedValue(closureCount),
    affiliateAttribution: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    affiliateReward: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    affiliateBudgetReservation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    affiliateTask: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    affiliateClaim: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    affiliateBudgetTransaction: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    affiliateRewardTransaction: { create: jest.fn().mockResolvedValue({ id: 2 }) }
  });

  const settlementInput = {
    attributionId: 71,
    taskId: 31,
    claimId: 41,
    reservationId: 81,
    rewardId: 61,
    rewardNdp: 1_000,
    platformFeeNdp: 100,
    platformWalletId: 99,
    ledgerTransactionId: 91,
    settledAt: new Date("2026-08-26T00:00:00.000Z")
  };

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

  it("uses an atomic idempotent insert for the first claimant wallet", async () => {
    const transactionClient = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      wallet: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 91 })
      },
      affiliateAttribution: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      affiliateReward: {
        create: jest.fn().mockResolvedValue({ id: 81 })
      }
    };
    const repository = new AffiliateCheckoutRepository(transactionClient as never);

    await expect(
      repository.qualifyAttributionAndCreateReward({
        attributionId: 71,
        taskId: 31,
        claimId: 41,
        bookingOrderId: 401,
        claimantUserId: 601,
        publisherWalletId: 92,
        rewardNdp: 1_000,
        platformFeeNdp: 100,
        qualifiedAt: new Date("2026-08-26T00:00:00.000Z")
      })
    ).resolves.toEqual({
      rewardId: 81,
      publisherWalletId: 92,
      claimantWalletId: 91
    });
    expect(transactionClient.$executeRaw).toHaveBeenCalledTimes(1);
    expect(transactionClient.wallet.findUniqueOrThrow).toHaveBeenCalledWith({
      where: {
        ownerType_ownerId_currency: {
          ownerType: "USER",
          ownerId: 601,
          currency: "NDP"
        }
      }
    });
    expect(transactionClient.affiliateReward.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rewardNdp: 1_000,
          platformFeeNdp: 100,
          publisherWalletId: 92,
          claimantWalletId: 91
        })
      })
    );
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
          platformFeeBps: 1_000,
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
          rewardPlatformFeeNdp: null,
          rewardLedgerTransactionId: null,
          rewardPublisherWalletId: null,
          rewardClaimantWalletId: null,
          rewardPlatformWalletId: null,
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
    expect(sql).toContain("task.platform_fee_bps AS platformFeeBps");
    expect(sql).toContain("reward.platform_fee_ndp AS rewardPlatformFeeNdp");
    expect(sql).toContain("reward.platform_wallet_id AS rewardPlatformWalletId");
    expect(sql).not.toContain("booked_technician_service.deleted_at");
  });

  it("closes an ended reservation only when capture leaves no allocation or unallocated budget", async () => {
    const transactionClient = createSettlementClient(1);
    const repository = new AffiliateCheckoutRepository(transactionClient as never);

    await expect(repository.settleRewardAndCaptureBudget(settlementInput)).resolves.toBeUndefined();

    expect(transactionClient.$executeRaw).toHaveBeenCalledTimes(1);
    const query = transactionClient.$executeRaw.mock.calls[0]?.[0] as {
      strings?: readonly string[];
    };
    const sql = query.strings?.join(" ") ?? "";
    expect(sql).toContain("task.status = 'ended'");
    expect(sql).toContain("INNER JOIN affiliate_tasks AS task ON task.id = reservation.task_id");
    expect(sql).toContain("WHERE reservation.id =");
    expect(sql).toContain("AND reservation.task_id =");
    expect(sql).toContain("reservation.deleted_at IS NULL");
    expect(sql).toContain("task.deleted_at IS NULL");
    expect(sql).toContain("reservation.allocated_ndp = 0");
    expect(sql).toContain(
      "reservation.commission_frozen_ndp = reservation.captured_ndp + reservation.released_ndp"
    );
    expect(sql).toContain(
      "reservation.platform_fee_frozen_ndp = reservation.platform_fee_captured_ndp + reservation.platform_fee_released_ndp"
    );
    expect(sql).toContain("reservation.status = 'released'");
    expect(sql).toContain("COALESCE(reservation.released_at");
    expect(query).toMatchObject({ values: [settlementInput.settledAt, 81, 31] });
    expect(transactionClient.affiliateReward.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ rewardNdp: 1_000, platformFeeNdp: 100 }),
        data: expect.objectContaining({ platformWalletId: 99, status: "SETTLED" })
      })
    );
    expect(transactionClient.affiliateBudgetReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          capturedNdp: { increment: 1_000 },
          platformFeeCapturedNdp: { increment: 100 }
        })
      })
    );
  });

  it.each([
    "ended reservation with allocation or unallocated budget",
    "fully cleared reservation for a non-ended task"
  ])("does not treat zero-row expiry closure as a settlement conflict: %s", async () => {
    const transactionClient = createSettlementClient(0);
    const repository = new AffiliateCheckoutRepository(transactionClient as never);

    await expect(repository.settleRewardAndCaptureBudget(settlementInput)).resolves.toBeUndefined();
    expect(transactionClient.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
