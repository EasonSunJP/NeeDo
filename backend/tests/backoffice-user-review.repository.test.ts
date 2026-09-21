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
    service: null,
    shop: { name: "Tokyo care" },
    serviceDurationSnapshot: 60,
    note: "Doorbell is broken",
    paymentMethod: "NDP",
    paymentStatus: "REFUNDED",
    checkout: {
      deletedAt: null,
      otherMethodLabel: null,
      ledgerTransaction: { currency: "TEST_NDP", deletedAt: null }
    },
    addOns: [{ durationMinutes: 30 }, { durationMinutes: 15 }]
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

const operationsReview = {
  ...review,
  targetType: OrderReviewTargetType.TECHNICIAN,
  authorType: "USER",
  amendments: review.amendments,
  customerProfile: null,
  technicianProfile: {
    id: 186,
    displayName: "LifeDance 管理员 2",
    user: { needoId: "s0000000002" }
  },
  bookingOrder: {
    ...review.bookingOrder,
    customer: {
      needoId: "u0000000001",
      username: "Eason",
      customerProfile: { displayName: "Eason" }
    },
    shop: { id: 79, shopNo: "b000000079", name: "LifeDance" },
    technicianProfile: {
      id: 186,
      displayName: "LifeDance 管理员 2",
      user: { needoId: "s0000000002" }
    }
  }
};

describe("BackofficeUserReviewRepository", () => {
  it("paginates the global review center by effective rating and persisted review facts", async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ total: 41n }])
      .mockResolvedValueOnce([{ id: 77 }]);
    const findMany = jest.fn(async () => [operationsReview]);
    const repository = new BackofficeUserReviewRepository({
      $queryRaw: queryRaw,
      orderReview: { findMany }
    } as never);

    await expect(
      repository.listOperationsReviews({
        page: 2,
        pageSize: 20,
        keyword: "QA-20260910-RQ-001",
        rating: 4,
        status: "amended",
        targetType: "technician",
        from: new Date("2026-09-09T15:00:00.000Z"),
        to: new Date("2026-09-10T15:00:00.000Z")
      })
    ).resolves.toMatchObject({
      total: 41,
      page: 2,
      page_size: 20,
      list: [
        {
          reviewId: 77,
          status: "amended",
          targetType: "technician",
          rating: 4,
          reviewer: { needoId: "s0000000042", displayName: "Mika" },
          customer: { needoId: "u0000000001", displayName: "Eason" },
          shop: { id: 79, publicId: "b000000079", name: "LifeDance" },
          technician: {
            id: 186,
            publicId: "s0000000002",
            displayName: "LifeDance 管理员 2"
          },
          order: { id: 88, orderNo: "B-88", serviceName: "Home care" }
        }
      ]
    });

    const sql = queryRaw.mock.calls
      .map(([query]) => String(query.sql ?? query.text ?? query))
      .join("\n");
    expect(sql).toContain("COALESCE(review.amendment_rating, review.rating)");
    expect(sql).toContain("review.amendment_version IS NOT NULL");
    expect(sql).toContain("review.target_type");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [77] } }, take: 20 })
    );
  });

  it("returns one global review detail with immutable amendment history", async () => {
    const findFirst = jest.fn(async () => operationsReview);
    const repository = new BackofficeUserReviewRepository({
      orderReview: { findFirst }
    } as never);

    await expect(repository.getOperationsReview(77)).resolves.toMatchObject({
      reviewId: 77,
      status: "amended",
      amendmentVersion: 1,
      amendmentHistory: [
        {
          version: 1,
          reason: "Complaint evidence confirmed",
          revisedBy: "Operator"
        }
      ]
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 77, deletedAt: null })
      })
    );
  });

  it("excludes TestNDP-backed reviews when an operations admin hides test data", async () => {
    const queryRaw = jest.fn().mockResolvedValueOnce([{ total: 0n }]).mockResolvedValueOnce([]);
    const findFirst = jest.fn(async () => null);
    const repository = new BackofficeUserReviewRepository({
      $queryRaw: queryRaw,
      orderReview: { findFirst }
    } as never);

    await repository.listOperationsReviews({
      page: 1,
      pageSize: 20,
      showTestNdpData: false
    });
    await repository.getOperationsReview(77, false);

    const sql = queryRaw.mock.calls
      .map(([query]) => String(query.sql ?? query.text ?? query))
      .join("\n");
    expect(sql).toContain("review.is_test_ndp_order = 0");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bookingOrder: expect.objectContaining({ NOT: expect.any(Array) })
        })
      })
    );
  });

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
            startsAt: createdAt.toISOString(),
            shopName: "Tokyo care",
            durationMinutes: 60,
            note: "Doorbell is broken",
            paymentMethod: "ndp",
            paymentStatus: "refunded",
            paymentCurrency: "TEST_NDP",
            otherPaymentMethod: null,
            addOnCount: 2,
            addOnMinutes: 45
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

  it("reads accepted add-ons only and preserves pending offline payment without a checkout", async () => {
    const findMany = jest.fn(async () => [
      {
        ...review,
        bookingOrder: {
          ...review.bookingOrder,
          paymentMethod: "ONSITE",
          paymentStatus: "PENDING",
          checkout: null,
          addOns: []
        }
      }
    ]);
    const repository = new BackofficeUserReviewRepository({
      orderReview: { findMany, count: jest.fn(async () => 1) }
    } as never);
    const result = await repository.listReceivedReviews({
      scope: "platform",
      userId: 41,
      page: 1,
      pageSize: 10
    });
    expect(result.list[0].order).toMatchObject({
      paymentMethod: "onsite",
      paymentStatus: "pending",
      paymentCurrency: null,
      addOnCount: 0,
      addOnMinutes: 0
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          bookingOrder: expect.objectContaining({
            select: expect.objectContaining({
              addOns: {
                where: { deletedAt: null, status: "ACCEPTED" },
                select: { durationMinutes: true }
              }
            })
          })
        })
      })
    );
  });

  it("keeps an explicitly named other payment method and ignores a deleted checkout", async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          ...review,
          bookingOrder: {
            ...review.bookingOrder,
            paymentMethod: "OTHER",
            paymentStatus: "CONFIRMED",
            checkout: { deletedAt: null, otherMethodLabel: "PayPay", ledgerTransaction: null }
          }
        }
      ])
      .mockResolvedValueOnce([
        {
          ...review,
          bookingOrder: {
            ...review.bookingOrder,
            checkout: { ...review.bookingOrder.checkout, deletedAt: createdAt }
          }
        }
      ]);
    const repository = new BackofficeUserReviewRepository({
      orderReview: { findMany, count: jest.fn(async () => 1) }
    } as never);
    const input = { scope: "platform" as const, userId: 41, page: 1, pageSize: 10 as const };
    expect((await repository.listReceivedReviews(input)).list[0].order).toMatchObject({
      paymentMethod: "other",
      otherPaymentMethod: "PayPay",
      paymentCurrency: null
    });
    expect((await repository.listReceivedReviews(input)).list[0].order.paymentCurrency).toBeNull();
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
          targetType: OrderReviewTargetType.CUSTOMER,
          customerProfile: { userId: 41 },
          technicianProfile: null,
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

  it("creates an audited amendment for a user-authored technician review", async () => {
    const amendmentCreate = jest.fn(async () => ({ id: 102, version: 2 }));
    const auditCreate = jest.fn(async () => ({}));
    const findFirst = jest.fn(async () => ({
      id: 78,
      targetType: OrderReviewTargetType.TECHNICIAN,
      customerProfile: null,
      technicianProfile: { userId: 52 },
      bookingOrder: { shopId: 11 },
      rating: 5,
      comment: "Original technician review",
      tags: [{ label: "professional" }],
      amendments: [
        {
          version: 1,
          rating: 4,
          comment: "First correction",
          tags: [{ label: "professional" }]
        }
      ]
    }));
    const transaction = {
      $queryRaw: jest.fn(async () => [{ id: 78 }]),
      orderReview: { findFirst },
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
        reviewId: 78,
        rating: 3,
        reason: "Technician service evidence confirmed",
        expectedVersion: 1,
        audit: { actorId: 9, action: "review.amend", targetType: "OrderReview" }
      })
    ).resolves.toMatchObject({ kind: "created", value: { reviewId: 78, version: 2 } });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ targetType: OrderReviewTargetType.CUSTOMER })
      })
    );
    expect(amendmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderReviewId: 78,
          version: 2,
          rating: 3,
          comment: "First correction"
        })
      })
    );
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          userId: 52,
          shopId: 11,
          reviewId: 78,
          targetType: "technician"
        })
      })
    });
  });

  it("does not expose a system-authored zero rating to the amendment path", async () => {
    const findFirst = jest.fn(async () => null);
    const amendmentCreate = jest.fn();
    const auditCreate = jest.fn();
    const transaction = {
      $queryRaw: jest.fn(async () => [{ id: 77 }]),
      orderReview: { findFirst },
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
        rating: 1,
        reason: "Attempted system-rating amendment",
        expectedVersion: 0,
        audit: { actorId: 9, action: "review.amend", targetType: "OrderReview" }
      })
    ).resolves.toEqual({ kind: "not_found" });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ authorType: "USER" })
      })
    );
    expect(amendmentCreate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
