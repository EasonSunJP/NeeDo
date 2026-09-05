import { BackofficeUserUsageRepository } from "../src/repositories/backoffice-user-usage.repository";

describe("BackofficeUserUsageRepository", () => {
  it("lists ten usage rows inside the authenticated merchant shop and half-open range", async () => {
    const findMany = jest.fn(async () => []);
    const count = jest.fn(async () => 0);
    const repository = new BackofficeUserUsageRepository({
      bookingOrder: { findMany, count }
    } as never);
    const from = new Date("2026-08-31T15:00:00.000Z");
    const to = new Date("2026-09-07T15:00:00.000Z");

    await expect(
      repository.listUsage({
        scope: "merchant",
        shopId: 11,
        userId: 41,
        page: 1,
        pageSize: 10,
        from,
        to
      })
    ).resolves.toMatchObject({ list: [], total: 0, page_size: 10 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        where: expect.objectContaining({
          customerUserId: 41,
          shopId: 11,
          startsAt: { gte: from, lt: to },
          deletedAt: null
        })
      })
    );
  });

  it("appends comments and refund corrections without updating or deleting source facts", async () => {
    const transaction = {
      $queryRaw: jest.fn(async () => [{ id: 88 }]),
      bookingOrder: {
        findFirst: jest.fn(async () => ({
          id: 88,
          paymentStatus: "REFUNDED",
          paymentRefundReference: "RF-1",
          paymentRefundReason: "Original",
          refundAmendments: []
        }))
      },
      orderTimelineComment: { create: jest.fn(async () => ({ id: 201 })) },
      orderRefundAmendment: { create: jest.fn(async () => ({ id: 202, version: 1 })) },
      auditLog: { create: jest.fn(async () => ({})) }
    };
    const repository = new BackofficeUserUsageRepository({
      $transaction: jest.fn(async (callback: (client: typeof transaction) => unknown) =>
        callback(transaction)
      )
    } as never);

    await repository.createCommentWithAudit({
      actorId: 9,
      orderId: 88,
      body: "Customer contacted",
      audit: { actorId: 9, action: "usage.comment", targetType: "OrderTimelineComment" }
    });
    await repository.createRefundAmendmentWithAudit({
      actorId: 9,
      orderId: 88,
      displayReference: "RF-2",
      reason: "Provider confirmation",
      expectedVersion: 0,
      audit: { actorId: 9, action: "refund.amend", targetType: "OrderRefundAmendment" }
    });

    expect(transaction.orderTimelineComment.create).toHaveBeenCalledTimes(1);
    expect(transaction.orderRefundAmendment.create).toHaveBeenCalledTimes(1);
    expect(transaction.bookingOrder).not.toHaveProperty("update");
    expect(transaction.orderTimelineComment).not.toHaveProperty("delete");
    expect(transaction.orderRefundAmendment).not.toHaveProperty("delete");
  });

  it("keeps explicitly cleared refund fields null in later reads", async () => {
    const repository = new BackofficeUserUsageRepository({
      bookingOrder: {
        findMany: jest.fn(async () => [
          {
            id: 88,
            orderNo: "ORDER-88",
            status: "COMPLETED",
            paymentStatus: "REFUNDED",
            paymentRefundedAt: new Date("2026-09-01T00:00:00.000Z"),
            paymentRefundReference: "RF-ORIGINAL",
            paymentRefundReason: "Original reason",
            priceAmount: 5000,
            currency: "JPY",
            startsAt: new Date("2026-09-01T01:00:00.000Z"),
            endsAt: new Date("2026-09-01T02:00:00.000Z"),
            createdAt: new Date("2026-08-31T00:00:00.000Z"),
            serviceNameSnapshot: "Service",
            service: null,
            shop: { name: "Shop" },
            technicianProfile: null,
            refundAmendments: [
              {
                version: 1,
                displayReference: null,
                note: null,
                createdAt: new Date("2026-09-02T00:00:00.000Z")
              }
            ]
          }
        ]),
        count: jest.fn(async () => 1)
      }
    } as never);

    const page = await repository.listUsage({
      scope: "platform",
      userId: 41,
      page: 1,
      pageSize: 10,
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-10-01T00:00:00.000Z")
    });

    expect(page.list[0]?.refund).toEqual({
      exists: true,
      displayReference: null,
      note: null,
      amendmentVersion: 1
    });
  });
});
