import { BackofficeUserReviewService } from "../src/services/backoffice-user-review.service";

const operationsActor = {
  userId: 9,
  email: "ops@example.test",
  accessTokenJti: "jti",
  accessTokenExpiresAt: 1,
  currentIdentityScopeType: "platform",
  roles: ["operations"],
  permissions: []
};

describe("BackofficeUserReviewService", () => {
  it("uses the selected merchant shop before repository pagination", async () => {
    const listReceivedReviews = jest.fn(async () => ({
      list: [],
      total: 0,
      page: 2,
      page_size: 10 as const
    }));
    const service = new BackofficeUserReviewService(
      {
        isUserVisibleInMerchantScope: jest.fn(async () => true),
        listReceivedReviews,
        createAmendmentWithAudit: jest.fn()
      },
      { createInput: jest.fn() } as never
    );

    await service.listForMerchant(
      {
        ...operationsActor,
        currentIdentityScopeType: "shop",
        currentIdentityScopeId: 11,
        currentIdentityType: "merchant"
      },
      41,
      { page: 2, page_size: 10 }
    );

    expect(listReceivedReviews).toHaveBeenCalledWith({
      scope: "merchant",
      shopId: 11,
      userId: 41,
      page: 2,
      pageSize: 10
    });
  });

  it("returns not found before a merchant can infer a cross-shop user", async () => {
    const listReceivedReviews = jest.fn();
    const service = new BackofficeUserReviewService(
      {
        isUserVisibleInMerchantScope: jest.fn(async () => false),
        listReceivedReviews,
        createAmendmentWithAudit: jest.fn()
      },
      { createInput: jest.fn() } as never
    );

    await expect(
      service.listForMerchant(
        {
          ...operationsActor,
          currentIdentityScopeType: "shop",
          currentIdentityScopeId: 11,
          currentIdentityType: "merchant"
        },
        99,
        { page: 1, page_size: 10 }
      )
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(listReceivedReviews).not.toHaveBeenCalled();
  });

  it("requires a reason and creates an audited immutable amendment", async () => {
    const createAmendmentWithAudit = jest.fn(async () => ({
      kind: "created" as const,
      value: { reviewId: 77, version: 2 }
    }));
    const createInput = jest.fn((value) => ({
      actorId: value.actor.userId,
      action: value.action,
      targetType: value.targetType,
      metadata: value.metadata
    }));
    const service = new BackofficeUserReviewService(
      {
        isUserVisibleInMerchantScope: jest.fn(),
        listReceivedReviews: jest.fn(),
        createAmendmentWithAudit
      },
      { createInput } as never
    );

    await expect(
      service.amend(operationsActor, { ip: "127.0.0.1" }, 77, {
        rating: 3,
        reason: "Refund evidence confirmed",
        expectedVersion: 1
      })
    ).resolves.toEqual({ reviewId: 77, version: 2 });
    expect(createAmendmentWithAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 9,
        reviewId: 77,
        rating: 3,
        reason: "Refund evidence confirmed",
        expectedVersion: 1,
        audit: expect.objectContaining({ action: "backoffice.order_review.amend" })
      })
    );

    await expect(
      service.amend(operationsActor, { ip: "127.0.0.1" }, 77, {
        comment: "Changed",
        reason: " ",
        expectedVersion: 2
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("maps stale immutable versions to a conflict", async () => {
    const service = new BackofficeUserReviewService(
      {
        isUserVisibleInMerchantScope: jest.fn(),
        listReceivedReviews: jest.fn(),
        createAmendmentWithAudit: jest.fn(async () => ({ kind: "version_conflict" as const }))
      },
      { createInput: jest.fn(() => ({ actorId: 9, action: "review.amend", targetType: "OrderReviewAmendment" })) } as never
    );

    await expect(
      service.amend(operationsActor, { ip: "127.0.0.1" }, 77, {
        rating: 2,
        reason: "Evidence confirmed",
        expectedVersion: 1
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
