import { BookingOrderStatus, OrderReviewTargetType } from "@prisma/client";
import { BackofficeUserReviewRepository } from "../src/repositories/backoffice-user-review.repository";

const createdAt = new Date("2026-09-05T10:00:00.000Z");
const review = {
  id: 77,
  targetType: OrderReviewTargetType.CUSTOMER,
  rating: 5,
  comment: "Original",
  createdAt,
  tags: [{ label: "polite" }],
  amendments: [
    {
      version: 1,
      rating: 4,
      comment: "Corrected",
      reason: "Complaint evidence confirmed",
      createdAt: new Date("2026-09-06T10:00:00.000Z"),
      revisedBy: { username: "Operator" },
      tags: [{ label: "punctual" }, { label: "polite" }]
    }
  ],
  bookingOrder: {
    id: 88,
    orderNo: "B-88",
    serviceNameSnapshot: "Home care",
    startsAt: createdAt,
    service: null
  },
  reviewer: {
    needoId: "s0000000042",
    username: "mika",
    avatarUrl: null,
    avatarBootstrapUrl: null,
    customerProfile: null,
    technicianProfile: { displayName: "Mika" }
  }
};

describe("BackofficeUserReviewRepository", () => {
  it("lists effective received customer reviews within the merchant shop scope", async () => {
    const findMany = jest.fn(async () => [review]);
    const count = jest.fn(async () => 1);
    const repository = new BackofficeUserReviewRepository({
      orderReview: { findMany, count }
    } as never);

    await expect(
      repository.listReceivedReviews({
        scope: "merchant",
        shopId: 11,
        userId: 41,
        page: 1,
        pageSize: 10
      })
    ).resolves.toEqual({
      list: [
        {
          reviewId: 77,
          targetType: "customer",
          rating: 4,
          comment: "Corrected",
          tags: ["punctual", "polite"],
          createdAt: createdAt.toISOString(),
          amendmentVersion: 1,
          amendmentHistory: [
            {
              version: 1,
              rating: 4,
              comment: "Corrected",
              tags: ["punctual", "polite"],
              reason: "Complaint evidence confirmed",
              revisedAt: "2026-09-06T10:00:00.000Z",
              revisedBy: "Operator"
            }
          ],
          order: {
            id: 88,
            orderNo: "B-88",
            serviceName: "Home care",
            startsAt: createdAt.toISOString()
          },
          reviewer: {
            needoId: "s0000000042",
            displayName: "Mika",
            avatarUrl: null
          }
        }
      ],
      total: 1,
      page: 1,
      page_size: 10
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          targetType: OrderReviewTargetType.CUSTOMER,
          deletedAt: null,
          customerProfile: { userId: 41, deletedAt: null },
          bookingOrder: {
            shopId: 11,
            status: BookingOrderStatus.COMPLETED,
            deletedAt: null
          }
        }),
        take: 10
      })
    );
  });

  it("checks shop visibility without exposing cross-shop users", async () => {
    const findFirst = jest.fn(async () => ({ id: 41 }));
    const repository = new BackofficeUserReviewRepository({ user: { findFirst } } as never);

    await expect(repository.isUserVisibleInMerchantScope(41, 11)).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 41,
        deletedAt: null,
        bookingOrders: { some: { shopId: 11, deletedAt: null } }
      },
      select: { id: true }
    });
  });

  it("creates an amendment and audit without updating the original review", async () => {
    const amendmentCreate = jest.fn(async () => ({ id: 101, version: 1 }));
    const auditCreate = jest.fn(async () => ({}));
    const transaction = {
      $queryRaw: jest.fn(async () => [{ id: 77 }]),
      orderReview: {
        findFirst: jest.fn(async () => ({
          id: 77,
          customerProfile: { userId: 41 },
          bookingOrder: { shopId: 11 },
          rating: 5,
          comment: "Original",
          tags: [{ label: "polite" }],
          amendments: []
        }))
      },
      orderReviewAmendment: { create: amendmentCreate },
      auditLog: { create: auditCreate }
    };
    const repository = new BackofficeUserReviewRepository({
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction)
      )
    } as never);

    await expect(
      repository.createAmendmentWithAudit({
        actorId: 9,
        reviewId: 77,
        rating: 4,
        reason: "Complaint evidence confirmed",
        expectedVersion: 0,
        audit: { actorId: 9, action: "review.amend", targetType: "OrderReview" }
      })
    ).resolves.toMatchObject({ kind: "created", value: { version: 1 } });
    expect(amendmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderReviewId: 77,
          version: 1,
          rating: 4,
          comment: "Original",
          reason: "Complaint evidence confirmed",
          revisedById: 9
        })
      })
    );
    expect(transaction.orderReview).not.toHaveProperty("update");
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ userId: 41, shopId: 11, reviewId: 77 })
      })
    });
  });
});
