import {
  AffiliateCheckoutService,
  calculateAffiliatePrice,
  selectAffiliatePromotion,
  type AffiliateCompletionRecord,
  type AffiliateCheckoutClaimRecord,
  type AffiliateCancellationRecord,
  type AffiliateCheckoutRepositoryPort
} from "../src/services/affiliate-checkout.service";
import { AffiliateLinkTokenService } from "../src/services/affiliate-link-token.service";
import type { AffiliateRewardSettlementPort } from "../src/services/ledger.service";
import type { AppError } from "../src/utils/app-error";
import { ERROR_CODES } from "../src/constants/error-codes";

const NOW = new Date("2026-08-26T04:00:00.000Z");
const TRANSACTION_CLIENT = { transaction: "checkout" };

const createClaim = (
  overrides: Partial<AffiliateCheckoutClaimRecord> = {}
): AffiliateCheckoutClaimRecord => ({
  id: 41,
  taskId: 31,
  claimantUserId: 701,
  publicCode: "NDO-VALID",
  publicTokenId: "public-token-id",
  tokenHash: "unused-for-code",
  status: "active",
  expiresAt: new Date("2026-10-01T00:00:00.000Z"),
  task: {
    id: 31,
    status: "active",
    rewardNdpPerCompletedOrder: 1_000,
    customerDiscountType: "fixed_jpy",
    fixedDiscountJpy: 1_000,
    discountRateBps: 0,
    discountCapJpy: 0,
    minimumOrderAmountJpy: 5_000,
    taskStartsAt: new Date("2026-08-01T00:00:00.000Z"),
    taskEndsAt: new Date("2026-10-01T00:00:00.000Z"),
    attributionWindowDays: 14,
    budgetReservation: {
      id: 91,
      status: "active",
      totalFrozenNdp: 10_000,
      allocatedNdp: 2_000,
      capturedNdp: 1_000,
      releasedNdp: 0
    }
  },
  ...overrides
});

const createRepository = (
  claim: AffiliateCheckoutClaimRecord | null = createClaim()
): jest.Mocked<AffiliateCheckoutRepositoryPort> => {
  const repository: jest.Mocked<AffiliateCheckoutRepositoryPort> = {
    forTransaction: jest.fn(),
    resolvePromotion: jest.fn().mockResolvedValue(claim),
    resolveAndLockPromotion: jest.fn().mockResolvedValue(claim),
    findValidationSlot: jest.fn().mockResolvedValue({
      shopId: 8,
      serviceId: 88,
      originalPriceJpy: 12_000,
      scheduledStartAt: new Date("2026-09-15T03:00:00.000Z")
    }),
    serviceIsInTaskScope: jest.fn().mockResolvedValue(true),
    createTouch: jest.fn().mockResolvedValue(111),
    createAttribution: jest.fn().mockResolvedValue(undefined),
    allocateAttribution: jest.fn().mockResolvedValue(undefined),
    createAttributionAudit: jest.fn().mockResolvedValue(undefined),
    lockActiveAttributionForCancellation: jest.fn().mockResolvedValue(null),
    lockAttributionForCompletion: jest.fn().mockResolvedValue(null),
    countSettledCustomerOrders: jest.fn().mockResolvedValue(0),
    qualifyAttributionAndCreateReward: jest.fn(),
    settleRewardAndCaptureBudget: jest.fn().mockResolvedValue(undefined),
    createRewardSettlementAudit: jest.fn().mockResolvedValue(undefined),
    invalidateAttributionAndRelease: jest.fn().mockResolvedValue(undefined),
    createInvalidationAudit: jest.fn().mockResolvedValue(undefined)
  };
  repository.forTransaction.mockReturnValue(repository);
  return repository;
};

const createLinkTokens = (): AffiliateLinkTokenService =>
  new AffiliateLinkTokenService({
    secret: "affiliate-checkout-test-secret-with-32-characters",
    publicBaseUrl: "https://app.needo.test/afirieito",
    createPublicTokenId: () => "public-token-id"
  });

const createCompletionRecord = (
  overrides: Partial<AffiliateCompletionRecord> = {}
): AffiliateCompletionRecord => ({
  attributionId: 301,
  attributionStatus: "attributed",
  taskId: 31,
  claimId: 41,
  claimantUserId: 701,
  customerUserId: 501,
  shopId: 8,
  serviceId: 88,
  rewardAllocatedNdp: 1_000,
  taskStatus: "active",
  taskStartsAt: new Date("2026-08-01T00:00:00.000Z"),
  taskEndsAt: new Date("2026-10-01T00:00:00.000Z"),
  maxCompletedOrdersPerClaim: 3,
  maxCompletedOrdersPerCustomer: 2,
  claimCompletedOrderCount: 0,
  reservationId: 91,
  publisherWalletId: 191,
  publisherOwnerType: "merchant_account",
  publisherOwnerId: 61,
  rewardId: null,
  rewardStatus: null,
  rewardNdp: null,
  rewardLedgerTransactionId: null,
  rewardPublisherWalletId: null,
  rewardClaimantWalletId: null,
  ...overrides
});

const createRewardLedger = (): jest.Mocked<AffiliateRewardSettlementPort> => ({
  settleAffiliateReward: jest.fn().mockResolvedValue({
    transaction: {
      id: 801,
      transactionNo: "AFF-REWARD-801",
      idempotencyKey: "affiliate:task:31:booking:9001:reward:settlement",
      type: "affiliate_reward_settlement",
      status: "applied",
      referenceType: "affiliate_reward",
      referenceId: 601,
      actorUserId: 7,
      amount: 1_000,
      currency: "NDP",
      metadata: null,
      createdAt: NOW,
      updatedAt: NOW,
      entries: []
    },
    publisherWalletId: 191,
    claimantWalletId: 291
  })
});

const prepareInput = {
  selector: { source: "code", value: "NDO-VALID" } as const,
  customerUserId: 501,
  shopId: 8,
  serviceId: 88,
  originalPriceJpy: 12_000,
  scheduledStartAt: new Date("2026-09-15T03:00:00.000Z"),
  transactionClient: TRANSACTION_CLIENT
};

describe("affiliate checkout pricing", () => {
  it("prefers an explicit nonblank code over a signed URL", () => {
    expect(
      selectAffiliatePromotion({
        affiliateCode: " NDO-CODE ",
        affiliatePublicToken: "token.signature"
      })
    ).toEqual({ source: "code", value: "NDO-CODE" });
  });

  it("uses a signed URL only when no nonblank code is present", () => {
    expect(
      selectAffiliatePromotion({
        affiliateCode: "   ",
        affiliatePublicToken: " token.signature "
      })
    ).toEqual({ source: "url", value: "token.signature" });
    expect(selectAffiliatePromotion({})).toBeNull();
  });

  it("keeps the original price when the task has no customer discount", () => {
    expect(
      calculateAffiliatePrice({
        originalPriceJpy: 12_000,
        discountType: "none",
        fixedDiscountJpy: 0,
        discountRateBps: 0,
        discountCapJpy: 0
      })
    ).toEqual({
      originalPriceJpy: 12_000,
      customerDiscountJpy: 0,
      finalPriceJpy: 12_000
    });
  });

  it("caps a fixed JPY discount at the original price", () => {
    expect(
      calculateAffiliatePrice({
        originalPriceJpy: 800,
        discountType: "fixed_jpy",
        fixedDiscountJpy: 1_000,
        discountRateBps: 0,
        discountCapJpy: 0
      })
    ).toEqual({
      originalPriceJpy: 800,
      customerDiscountJpy: 800,
      finalPriceJpy: 0
    });
  });

  it("floors percentage discounts and applies the per-order cap", () => {
    expect(
      calculateAffiliatePrice({
        originalPriceJpy: 12_999,
        discountType: "percent",
        fixedDiscountJpy: 0,
        discountRateBps: 1_500,
        discountCapJpy: 1_500
      })
    ).toEqual({
      originalPriceJpy: 12_999,
      customerDiscountJpy: 1_500,
      finalPriceJpy: 11_499
    });
    expect(
      calculateAffiliatePrice({
        originalPriceJpy: 9_999,
        discountType: "percent",
        fixedDiscountJpy: 0,
        discountRateBps: 1_501,
        discountCapJpy: 9_999
      }).customerDiscountJpy
    ).toBe(1_500);
  });

  it("rejects invalid non-integer or negative price contracts", () => {
    expect(() =>
      calculateAffiliatePrice({
        originalPriceJpy: 10.5,
        discountType: "none",
        fixedDiscountJpy: 0,
        discountRateBps: 0,
        discountCapJpy: 0
      })
    ).toThrow("error.affiliate.price_snapshot_invalid");
    expect(() =>
      calculateAffiliatePrice({
        originalPriceJpy: 1_000,
        discountType: "fixed_jpy",
        fixedDiscountJpy: -1,
        discountRateBps: 0,
        discountCapJpy: 0
      })
    ).toThrow("error.affiliate.price_snapshot_invalid");
    expect(() =>
      calculateAffiliatePrice({
        originalPriceJpy: 1_000,
        discountType: "percent",
        fixedDiscountJpy: 0,
        discountRateBps: 10_001,
        discountCapJpy: 1_000
      })
    ).toThrow("error.affiliate.price_snapshot_invalid");
  });
});

describe("AffiliateCheckoutService", () => {
  it("prepares a server-priced code attribution inside the caller transaction", async () => {
    const repository = createRepository();
    const service = new AffiliateCheckoutService(repository, createLinkTokens(), {
      now: () => NOW
    });

    await expect(service.prepareCheckout(prepareInput)).resolves.toEqual({
      claimId: 41,
      taskId: 31,
      claimantUserId: 701,
      publicCode: "NDO-VALID",
      source: "code",
      originalPriceJpy: 12_000,
      customerDiscountJpy: 1_000,
      finalPriceJpy: 11_000,
      rewardAllocatedNdp: 1_000,
      attributionStatus: "attributed",
      attributedAt: NOW,
      expiresAt: new Date("2026-09-09T04:00:00.000Z")
    });
    expect(repository.forTransaction).toHaveBeenCalledWith(TRANSACTION_CLIENT);
    expect(repository.resolveAndLockPromotion).toHaveBeenCalledWith({
      source: "code",
      lookupValue: "NDO-VALID"
    });
    expect(repository.serviceIsInTaskScope).toHaveBeenCalledWith(31, 8, 88);
  });

  it("verifies a signed URL against the locked claim", async () => {
    const linkTokens = createLinkTokens();
    const issued = linkTokens.rebuild({
      taskId: 31,
      userId: 701,
      expiresAt: new Date("2026-10-01T00:00:00.000Z"),
      publicTokenId: "public-token-id"
    });
    const repository = createRepository(
      createClaim({ tokenHash: issued.tokenHash })
    );
    const service = new AffiliateCheckoutService(repository, linkTokens, {
      now: () => NOW
    });

    await expect(
      service.prepareCheckout({
        ...prepareInput,
        selector: { source: "url", value: issued.publicToken }
      })
    ).resolves.toEqual(expect.objectContaining({ source: "url" }));
    expect(repository.resolveAndLockPromotion).toHaveBeenCalledWith({
      source: "url",
      lookupValue: "public-token-id"
    });
  });

  it.each([
    ["missing claim", null],
    ["revoked claim", createClaim({ status: "revoked" })],
    [
      "expired claim",
      createClaim({ expiresAt: new Date("2026-08-26T03:59:59.000Z") })
    ]
  ])("rejects %s as an invalid promotion", async (_label, claim) => {
    const service = new AffiliateCheckoutService(
      createRepository(claim),
      createLinkTokens(),
      { now: () => NOW }
    );

    await expect(service.prepareCheckout(prepareInput)).rejects.toMatchObject({
      statusCode: 404,
      message: "error.affiliate.promotion_invalid"
    });
  });

  it("does not fall back when an explicit code is invalid", async () => {
    const repository = createRepository(null);
    const service = new AffiliateCheckoutService(repository, createLinkTokens(), {
      now: () => NOW
    });

    await expect(
      service.prepareCheckout({
        ...prepareInput,
        selector: selectAffiliatePromotion({
          affiliateCode: "NDO-MISSING",
          affiliatePublicToken: "public-token-id.signature"
        })!
      })
    ).rejects.toMatchObject({ message: "error.affiliate.promotion_invalid" });
    expect(repository.resolveAndLockPromotion).toHaveBeenCalledTimes(1);
    expect(repository.resolveAndLockPromotion).toHaveBeenCalledWith({
      source: "code",
      lookupValue: "NDO-MISSING"
    });
  });

  it("rejects a tampered signed URL", async () => {
    const linkTokens = createLinkTokens();
    const issued = linkTokens.rebuild({
      taskId: 31,
      userId: 701,
      expiresAt: new Date("2026-10-01T00:00:00.000Z"),
      publicTokenId: "public-token-id"
    });
    const service = new AffiliateCheckoutService(
      createRepository(createClaim({ tokenHash: issued.tokenHash })),
      linkTokens,
      { now: () => NOW }
    );

    await expect(
      service.prepareCheckout({
        ...prepareInput,
        selector: { source: "url", value: `${issued.publicToken}x` }
      })
    ).rejects.toMatchObject({ message: "error.affiliate.promotion_invalid" });
  });

  it.each([
    [
      "task state",
      createClaim({ task: { ...createClaim().task, status: "paused" } }),
      "error.affiliate.task_not_attributable"
    ],
    [
      "self attribution",
      createClaim({ claimantUserId: 501 }),
      "error.affiliate.self_attribution_forbidden"
    ],
    [
      "minimum amount",
      createClaim({
        task: { ...createClaim().task, minimumOrderAmountJpy: 12_001 }
      }),
      "error.affiliate.minimum_order_amount_not_met"
    ],
    [
      "budget",
      createClaim({
        task: {
          ...createClaim().task,
          budgetReservation: {
            ...createClaim().task.budgetReservation!,
            totalFrozenNdp: 4_000,
            allocatedNdp: 2_000,
            capturedNdp: 1_001
          }
        }
      }),
      "error.affiliate.budget_unavailable"
    ]
  ])("rejects invalid %s eligibility", async (_label, claim, message) => {
    const service = new AffiliateCheckoutService(
      createRepository(claim),
      createLinkTokens(),
      { now: () => NOW }
    );

    await expect(service.prepareCheckout(prepareInput)).rejects.toMatchObject({
      statusCode: 409,
      message
    } satisfies Partial<AppError>);
  });

  it("rejects a service outside the snapshotted task scope", async () => {
    const repository = createRepository();
    repository.serviceIsInTaskScope.mockResolvedValue(false);
    const service = new AffiliateCheckoutService(repository, createLinkTokens(), {
      now: () => NOW
    });

    await expect(service.prepareCheckout(prepareInput)).rejects.toMatchObject({
      statusCode: 409,
      message: "error.affiliate.promotion_scope_mismatch"
    });
  });

  it("rejects a service time outside the task execution window", async () => {
    const service = new AffiliateCheckoutService(
      createRepository(),
      createLinkTokens(),
      { now: () => NOW }
    );

    await expect(
      service.prepareCheckout({
        ...prepareInput,
        scheduledStartAt: new Date("2026-10-01T00:00:00.000Z")
      })
    ).rejects.toMatchObject({
      message: "error.affiliate.task_not_attributable"
    });
  });

  it("persists touch, attribution, budget allocation, and token-free audit evidence", async () => {
    const repository = createRepository();
    const service = new AffiliateCheckoutService(repository, createLinkTokens(), {
      now: () => NOW
    });
    const prepared = await service.prepareCheckout(prepareInput);

    await service.persistAttribution({
      bookingOrderId: 9001,
      customerUserId: 501,
      shopId: 8,
      serviceId: 88,
      prepared,
      transactionClient: TRANSACTION_CLIENT
    });

    expect(repository.createTouch).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 31,
        claimId: 41,
        claimantUserId: 701,
        customerUserId: 501,
        source: "code",
        shopId: 8,
        serviceId: 88
      })
    );
    expect(repository.createAttribution).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingOrderId: 9001,
        activeKey: "booking:9001",
        touchId: 111,
        finalPriceJpy: 11_000,
        rewardAllocatedNdp: 1_000
      })
    );
    expect(repository.allocateAttribution).toHaveBeenCalledWith({
      taskId: 31,
      claimId: 41,
      rewardNdp: 1_000,
      source: "code"
    });
    const auditInput = repository.createAttributionAudit.mock.calls[0][0];
    expect(auditInput).toEqual(
      expect.objectContaining({
        actorUserId: 501,
        bookingOrderId: 9001,
        taskId: 31,
        publicCode: "NDO-VALID"
      })
    );
    expect(JSON.stringify(auditInput)).not.toContain("token");
  });

  it("translates a guarded allocation conflict into the stable budget error", async () => {
    const repository = createRepository();
    repository.allocateAttribution.mockRejectedValue(
      new Error("error.affiliate.budget_unavailable")
    );
    const service = new AffiliateCheckoutService(repository, createLinkTokens(), {
      now: () => NOW
    });
    const prepared = await service.prepareCheckout(prepareInput);

    await expect(
      service.persistAttribution({
        bookingOrderId: 9001,
        customerUserId: 501,
        shopId: 8,
        serviceId: 88,
        prepared,
        transactionClient: TRANSACTION_CLIENT
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "error.affiliate.budget_unavailable"
    });
  });

  it("invalidates an active attribution and restores exhausted budget during the task", async () => {
    const repository = createRepository();
    const cancellation: AffiliateCancellationRecord = {
      attributionId: 301,
      taskId: 31,
      claimId: 41,
      rewardAllocatedNdp: 1_000,
      taskStatus: "budget_exhausted",
      taskStartsAt: new Date("2026-08-01T00:00:00.000Z"),
      taskEndsAt: new Date("2026-10-01T00:00:00.000Z")
    };
    repository.lockActiveAttributionForCancellation.mockResolvedValue(cancellation);
    const service = new AffiliateCheckoutService(repository, createLinkTokens(), {
      now: () => NOW
    });

    await service.invalidateCancelledBooking({
      bookingOrderId: 9001,
      actorUserId: 501,
      transactionClient: TRANSACTION_CLIENT
    });

    expect(repository.invalidateAttributionAndRelease).toHaveBeenCalledWith({
      attributionId: 301,
      taskId: 31,
      rewardNdp: 1_000,
      invalidatedAt: NOW,
      reason: "booking_cancelled",
      restoreTaskStatus: "active"
    });
    expect(repository.createInvalidationAudit).toHaveBeenCalledWith({
      actorUserId: 501,
      bookingOrderId: 9001,
      attributionId: 301,
      taskId: 31,
      claimId: 41,
      rewardReleasedNdp: 1_000,
      reason: "booking_cancelled"
    });
  });

  it("restores an exhausted task to scheduled before its start", async () => {
    const repository = createRepository();
    repository.lockActiveAttributionForCancellation.mockResolvedValue({
      attributionId: 301,
      taskId: 31,
      claimId: 41,
      rewardAllocatedNdp: 1_000,
      taskStatus: "budget_exhausted",
      taskStartsAt: new Date("2026-09-01T00:00:00.000Z"),
      taskEndsAt: new Date("2026-10-01T00:00:00.000Z")
    });
    const service = new AffiliateCheckoutService(repository, createLinkTokens(), {
      now: () => NOW
    });

    await service.invalidateCancelledBooking({
      bookingOrderId: 9001,
      actorUserId: 501,
      transactionClient: TRANSACTION_CLIENT
    });

    expect(repository.invalidateAttributionAndRelease).toHaveBeenCalledWith(
      expect.objectContaining({ restoreTaskStatus: "scheduled" })
    );
  });

  it("keeps an exhausted task terminal after its execution window", async () => {
    const repository = createRepository();
    repository.lockActiveAttributionForCancellation.mockResolvedValue({
      attributionId: 301,
      taskId: 31,
      claimId: 41,
      rewardAllocatedNdp: 1_000,
      taskStatus: "budget_exhausted",
      taskStartsAt: new Date("2026-07-01T00:00:00.000Z"),
      taskEndsAt: new Date("2026-08-01T00:00:00.000Z")
    });
    const service = new AffiliateCheckoutService(repository, createLinkTokens(), {
      now: () => NOW
    });

    await service.invalidateCancelledBooking({
      bookingOrderId: 9001,
      actorUserId: 501,
      transactionClient: TRANSACTION_CLIENT
    });

    expect(repository.invalidateAttributionAndRelease).toHaveBeenCalledWith(
      expect.objectContaining({ restoreTaskStatus: null })
    );
  });

  it("is a no-op when cancellation has no active attribution", async () => {
    const repository = createRepository();
    const service = new AffiliateCheckoutService(repository, createLinkTokens(), {
      now: () => NOW
    });

    await service.invalidateCancelledBooking({
      bookingOrderId: 9001,
      actorUserId: 501,
      transactionClient: TRANSACTION_CLIENT
    });

    expect(repository.invalidateAttributionAndRelease).not.toHaveBeenCalled();
    expect(repository.createInvalidationAudit).not.toHaveBeenCalled();
  });

  it("settles an attributed reward from frozen budget after service completion", async () => {
    const repository = createRepository();
    const rewardLedger = createRewardLedger();
    repository.lockAttributionForCompletion.mockResolvedValue(
      createCompletionRecord()
    );
    repository.qualifyAttributionAndCreateReward.mockResolvedValue({
      rewardId: 601,
      publisherWalletId: 191,
      claimantWalletId: 291
    });
    const service = new AffiliateCheckoutService(repository, createLinkTokens(), {
      now: () => NOW,
      rewardLedger
    });

    await expect(
      service.settleCompletedBooking({
        bookingOrderId: 9001,
        customerUserId: 501,
        shopId: 8,
        serviceId: 88,
        actorUserId: 7,
        transactionClient: TRANSACTION_CLIENT
      })
    ).resolves.toEqual({
      status: "settled",
      attributionId: 301,
      rewardId: 601,
      ledgerTransactionId: 801,
      rewardNdp: 1_000,
      idempotent: false
    });
    expect(repository.countSettledCustomerOrders).toHaveBeenCalledWith({
      taskId: 31,
      customerUserId: 501
    });
    expect(repository.qualifyAttributionAndCreateReward).toHaveBeenCalledWith({
      attributionId: 301,
      taskId: 31,
      claimId: 41,
      bookingOrderId: 9001,
      publisherWalletId: 191,
      claimantUserId: 701,
      rewardNdp: 1_000,
      qualifiedAt: NOW
    });
    expect(rewardLedger.settleAffiliateReward).toHaveBeenCalledWith(
      {
        taskId: 31,
        attributionId: 301,
        rewardId: 601,
        bookingOrderId: 9001,
        publisherOwnerType: "merchant_account",
        publisherOwnerId: 61,
        publisherWalletId: 191,
        claimantUserId: 701,
        amountNdp: 1_000,
        idempotencyKey: "affiliate:task:31:booking:9001:reward:settlement",
        actorUserId: 7
      },
      { transactionClient: TRANSACTION_CLIENT }
    );
    expect(repository.settleRewardAndCaptureBudget).toHaveBeenCalledWith({
      attributionId: 301,
      taskId: 31,
      claimId: 41,
      reservationId: 91,
      rewardId: 601,
      rewardNdp: 1_000,
      ledgerTransactionId: 801,
      settledAt: NOW
    });
    expect(repository.createRewardSettlementAudit).toHaveBeenCalledWith({
      actorUserId: 7,
      bookingOrderId: 9001,
      attributionId: 301,
      taskId: 31,
      claimId: 41,
      rewardId: 601,
      ledgerTransactionId: 801,
      rewardSettledNdp: 1_000
    });
  });

  it("returns the existing settlement without moving money again", async () => {
    const repository = createRepository();
    const rewardLedger = createRewardLedger();
    repository.lockAttributionForCompletion.mockResolvedValue(
      createCompletionRecord({
        attributionStatus: "settled",
        rewardId: 601,
        rewardStatus: "settled",
        rewardNdp: 1_000,
        rewardLedgerTransactionId: 801,
        rewardPublisherWalletId: 191,
        rewardClaimantWalletId: 291
      })
    );
    const service = new AffiliateCheckoutService(repository, createLinkTokens(), {
      now: () => NOW,
      rewardLedger
    });

    await expect(
      service.settleCompletedBooking({
        bookingOrderId: 9001,
        customerUserId: 501,
        shopId: 8,
        serviceId: 88,
        actorUserId: 7,
        transactionClient: TRANSACTION_CLIENT
      })
    ).resolves.toEqual({
      status: "settled",
      attributionId: 301,
      rewardId: 601,
      ledgerTransactionId: 801,
      rewardNdp: 1_000,
      idempotent: true
    });
    expect(repository.qualifyAttributionAndCreateReward).not.toHaveBeenCalled();
    expect(rewardLedger.settleAffiliateReward).not.toHaveBeenCalled();
    expect(repository.settleRewardAndCaptureBudget).not.toHaveBeenCalled();
  });

  it("releases allocation without reward when the claim completion limit is reached", async () => {
    const repository = createRepository();
    const rewardLedger = createRewardLedger();
    repository.lockAttributionForCompletion.mockResolvedValue(
      createCompletionRecord({
        taskStatus: "budget_exhausted",
        claimCompletedOrderCount: 3
      })
    );
    const service = new AffiliateCheckoutService(repository, createLinkTokens(), {
      now: () => NOW,
      rewardLedger
    });

    await expect(
      service.settleCompletedBooking({
        bookingOrderId: 9001,
        customerUserId: 501,
        shopId: 8,
        serviceId: 88,
        actorUserId: 7,
        transactionClient: TRANSACTION_CLIENT
      })
    ).resolves.toEqual({
      status: "limit_released",
      attributionId: 301,
      reason: "claim_completed_order_limit_reached",
      rewardReleasedNdp: 1_000
    });
    expect(repository.invalidateAttributionAndRelease).toHaveBeenCalledWith({
      attributionId: 301,
      taskId: 31,
      rewardNdp: 1_000,
      invalidatedAt: NOW,
      reason: "claim_completed_order_limit_reached",
      restoreTaskStatus: "active"
    });
    expect(rewardLedger.settleAffiliateReward).not.toHaveBeenCalled();
  });

  it("releases allocation without reward when the customer completion limit is reached", async () => {
    const repository = createRepository();
    const rewardLedger = createRewardLedger();
    repository.lockAttributionForCompletion.mockResolvedValue(
      createCompletionRecord()
    );
    repository.countSettledCustomerOrders.mockResolvedValue(2);
    const service = new AffiliateCheckoutService(repository, createLinkTokens(), {
      now: () => NOW,
      rewardLedger
    });

    await expect(
      service.settleCompletedBooking({
        bookingOrderId: 9001,
        customerUserId: 501,
        shopId: 8,
        serviceId: 88,
        actorUserId: 7,
        transactionClient: TRANSACTION_CLIENT
      })
    ).resolves.toMatchObject({
      status: "limit_released",
      reason: "customer_completed_order_limit_reached"
    });
    expect(repository.invalidateAttributionAndRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "customer_completed_order_limit_reached"
      })
    );
    expect(rewardLedger.settleAffiliateReward).not.toHaveBeenCalled();
  });

  it("rejects a completion whose booking snapshot does not match attribution", async () => {
    const repository = createRepository();
    repository.lockAttributionForCompletion.mockResolvedValue(
      createCompletionRecord({ serviceId: 89 })
    );
    const service = new AffiliateCheckoutService(repository, createLinkTokens(), {
      now: () => NOW,
      rewardLedger: createRewardLedger()
    });

    await expect(
      service.settleCompletedBooking({
        bookingOrderId: 9001,
        customerUserId: 501,
        shopId: 8,
        serviceId: 88,
        actorUserId: 7,
        transactionClient: TRANSACTION_CLIENT
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.AFFILIATE_REWARD_SETTLEMENT_CONFLICT,
      message: "error.affiliate.reward_settlement_conflict",
      statusCode: 409
    });
  });

  it("translates a guarded reward capture conflict into the stable domain error", async () => {
    const repository = createRepository();
    repository.lockAttributionForCompletion.mockResolvedValue(
      createCompletionRecord()
    );
    repository.qualifyAttributionAndCreateReward.mockResolvedValue({
      rewardId: 601,
      publisherWalletId: 191,
      claimantWalletId: 291
    });
    repository.settleRewardAndCaptureBudget.mockRejectedValue(
      new Error("error.affiliate.reward_settlement_conflict")
    );
    const service = new AffiliateCheckoutService(repository, createLinkTokens(), {
      now: () => NOW,
      rewardLedger: createRewardLedger()
    });

    await expect(
      service.settleCompletedBooking({
        bookingOrderId: 9001,
        customerUserId: 501,
        shopId: 8,
        serviceId: 88,
        actorUserId: 7,
        transactionClient: TRANSACTION_CLIENT
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.AFFILIATE_REWARD_SETTLEMENT_CONFLICT,
      message: "error.affiliate.reward_settlement_conflict",
      statusCode: 409
    });
  });

  it("translates a locked completion snapshot conflict into the stable domain error", async () => {
    const repository = createRepository();
    repository.lockAttributionForCompletion.mockRejectedValue(
      new Error("error.affiliate.reward_settlement_conflict")
    );
    const service = new AffiliateCheckoutService(repository, createLinkTokens(), {
      now: () => NOW,
      rewardLedger: createRewardLedger()
    });

    await expect(
      service.settleCompletedBooking({
        bookingOrderId: 9001,
        customerUserId: 501,
        shopId: 8,
        serviceId: 88,
        actorUserId: 7,
        transactionClient: TRANSACTION_CLIENT
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.AFFILIATE_REWARD_SETTLEMENT_CONFLICT,
      message: "error.affiliate.reward_settlement_conflict",
      statusCode: 409
    });
  });

  it("prevalidates a code from a server-resolved schedule slot without persistence", async () => {
    const repository = createRepository();
    const service = new AffiliateCheckoutService(repository, createLinkTokens(), {
      now: () => NOW
    });

    await expect(
      service.validateCode({
        customerUserId: 501,
        publicCode: " ndo-valid ",
        scheduleSlotId: 1201
      })
    ).resolves.toEqual({
      taskId: 31,
      publicCode: "NDO-VALID",
      source: "code",
      originalPriceJpy: 12_000,
      customerDiscountJpy: 1_000,
      finalPriceJpy: 11_000,
      rewardAllocatedNdp: 1_000,
      taskStartsAt: new Date("2026-08-01T00:00:00.000Z"),
      taskEndsAt: new Date("2026-10-01T00:00:00.000Z")
    });
    expect(repository.findValidationSlot).toHaveBeenCalledWith(1201);
    expect(repository.resolvePromotion).toHaveBeenCalledWith({
      source: "code",
      lookupValue: "NDO-VALID"
    });
    expect(repository.createTouch).not.toHaveBeenCalled();
    expect(repository.createAttribution).not.toHaveBeenCalled();
    expect(repository.allocateAttribution).not.toHaveBeenCalled();
  });

  it("rejects validation when the schedule slot cannot be priced server-side", async () => {
    const repository = createRepository();
    repository.findValidationSlot.mockResolvedValue(null);
    const service = new AffiliateCheckoutService(repository, createLinkTokens(), {
      now: () => NOW
    });

    await expect(
      service.validateCode({
        customerUserId: 501,
        publicCode: "NDO-VALID",
        scheduleSlotId: 9999
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.BOOKING_SLOT_UNAVAILABLE,
      message: "error.booking.slot_unavailable",
      statusCode: 409
    });
  });
});
