import { BackofficeRepository } from "../src/repositories/backoffice.repository";

const makeOrderRecord = () => ({
  id: 31,
  orderNo: "ND202605250001",
  orderType: "BOOKING",
  status: "CANCELLED",
  paymentStatus: "PENDING",
  customerUserId: 101,
  serviceId: 1,
  shopId: 11,
  technicianProfileId: 301,
  fulfillmentMode: "store",
  priceAmount: 8800,
  paymentAmountJpy: 8800,
  paymentMethod: "ONSITE",
  addOns: [
    {
      status: "ACCEPTED",
      priceAmountJpy: 8800,
      currency: "JPY",
      deletedAt: null
    }
  ],
  checkout: null,
  financial: null,
  currency: "JPY",
  startsAt: new Date("2026-05-25T01:00:00.000Z"),
  endsAt: new Date("2026-05-25T02:00:00.000Z"),
  note: null,
  cancelReason: "技师临时无法到达",
  serviceNameSnapshot: "Shiatsu Recovery",
  createdAt: new Date("2026-05-24T23:00:00.000Z"),
  updatedAt: new Date("2026-05-25T04:00:00.000Z"),
  deletedAt: null,
  customer: {
    username: "Aya Customer",
    email: "aya@example.com",
    customerProfile: { id: 201 }
  },
  service: { name: "Shiatsu Recovery" },
  shop: { name: "Aoyama Care Studio" },
  technicianProfile: {
    displayName: "Mika Tanaka",
    user: {
      id: 301,
      identities: [{ publicIdentifier: { publicId: "s0000000301" } }]
    }
  },
  statusHistory: [
    {
      id: 11,
      bookingOrderId: 31,
      fromStatus: "PENDING",
      toStatus: "CANCELLED",
      actorUserId: 301,
      actor: { username: "Mika Tanaka", avatarUrl: "/avatars/mika.png", avatarBootstrapUrl: null },
      reason: "技师临时无法到达",
      createdAt: new Date("2026-05-25T02:00:00.000Z")
    }
  ],
  performanceAssessment: {
    id: 81,
    bookingOrderId: 31,
    technicianProfileId: 301,
    outcome: "TECHNICIAN_CANCELLED",
    treatment: "COUNTED",
    version: 3,
    currentRevisionId: 93,
    createdAt: new Date("2026-05-25T02:00:00.000Z"),
    updatedAt: new Date("2026-05-25T04:00:00.000Z")
  },
  performanceRevisions: [
    {
      id: 91,
      action: "CLASSIFY_TECHNICIAN_CANCELLED",
      actorUserId: 301,
      actor: { username: "Mika Tanaka", avatarUrl: "/avatars/mika.png", avatarBootstrapUrl: null },
      publicReason: "技师临时无法到达",
      internalNote: null,
      createdAt: new Date("2026-05-25T02:00:00.000Z")
    },
    {
      id: 92,
      action: "APPLY_SPECIAL_EXCLUSION",
      actorUserId: 1,
      actor: { username: "Operations Admin", avatarUrl: null, avatarBootstrapUrl: "/avatars/admin.png" },
      publicReason: "不可抗力",
      internalNote: "后台核验材料 A",
      createdAt: new Date("2026-05-25T03:00:00.000Z")
    },
    {
      id: 93,
      action: "REVOKE_SPECIAL_EXCLUSION",
      actorUserId: 1,
      actor: { username: "Operations Admin", avatarUrl: null, avatarBootstrapUrl: "/avatars/admin.png" },
      publicReason: "用户投诉后复核",
      internalNote: "投诉工单 C-123",
      createdAt: new Date("2026-05-25T04:00:00.000Z")
    }
  ],
  serviceEvents: [
    {
      id: 501,
      eventType: "ADD_ON_PROPOSED",
      actorUserId: 101,
      actor: { username: "Aya Customer", avatarUrl: "/avatars/aya.png", avatarBootstrapUrl: null },
      reason: null,
      occurredAt: new Date("2026-05-25T02:15:00.000Z"),
      orderAddOn: {
        id: 44,
        serviceId: 7 as number | null,
        technicianServiceId: null as number | null,
        status: "ACCEPTED",
        serviceNameSnapshot: "Extended care 60 minutes",
        priceAmountJpy: 8800,
        currency: "JPY",
        durationMinutes: 60
      }
    },
    {
      id: 502,
      eventType: "ADD_ON_ACCEPTED",
      actorUserId: 301,
      actor: { username: "Mika Tanaka", avatarUrl: "/avatars/mika.png", avatarBootstrapUrl: null },
      reason: null,
      occurredAt: new Date("2026-05-25T02:20:00.000Z"),
      orderAddOn: {
        id: 44,
        serviceId: 7 as number | null,
        technicianServiceId: null as number | null,
        status: "ACCEPTED",
        serviceNameSnapshot: "Extended care 60 minutes",
        priceAmountJpy: 8800,
        currency: "JPY",
        durationMinutes: 60
      }
    }
  ]
});

describe("BackofficeRepository order performance detail", () => {
  it("loads one scoped order and returns internal notes only in the operations detail", async () => {
    const findFirst = jest.fn().mockResolvedValue(makeOrderRecord());
    const repository = new BackofficeRepository({ bookingOrder: { findFirst } } as never);

    const result = await repository.findOrderById({ scope: "platform", id: 31 });

    expect(result?.performanceAssessment).toMatchObject({
      outcome: "technician_cancelled",
      treatment: "counted",
      version: 3
    });
    expect(result).toMatchObject({
      totalAmountJpy: 17_600,
      amountSource: "accepted_add_ons"
    });
    expect(result?.timelineEvents).toEqual([
      expect.objectContaining({ id: "performance:91", internalNote: null, actorName: "Mika Tanaka", actorAvatarUrl: "/avatars/mika.png" }),
      expect.objectContaining({ id: "status:11", type: "ORDER_STATUS_CHANGED", actorName: "Mika Tanaka" }),
      expect.objectContaining({
        id: "service:501",
        type: "ADD_ON_PROPOSED",
        addOnId: 44,
        serviceId: 7,
        serviceType: "shop_service",
        serviceName: "Extended care 60 minutes",
        priceAmountJpy: 8800,
        durationMinutes: 60
      }),
      expect.objectContaining({
        id: "service:502",
        type: "ADD_ON_ACCEPTED",
        addOnId: 44,
        serviceId: 7,
        serviceType: "shop_service",
        serviceName: "Extended care 60 minutes",
        priceAmountJpy: 8800,
        durationMinutes: 60
      }),
      expect.objectContaining({ id: "performance:92", internalNote: "后台核验材料 A" }),
      expect.objectContaining({ id: "performance:93", internalNote: "投诉工单 C-123" })
    ]);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 31, deletedAt: null },
        include: expect.objectContaining({
          performanceRevisions: expect.objectContaining({
            select: expect.objectContaining({ internalNote: true })
          }),
          serviceEvents: expect.objectContaining({
            where: {
              deletedAt: null,
              eventType: { in: ["ADD_ON_PROPOSED", "ADD_ON_ACCEPTED", "ADD_ON_REJECTED"] }
            },
            select: expect.objectContaining({
              eventType: true,
              orderAddOn: expect.objectContaining({
                select: expect.objectContaining({
                  serviceNameSnapshot: true,
                  serviceId: true,
                  technicianServiceId: true
                })
              })
            })
          })
        })
      })
    );
  });

  it("projects technician-service add-ons with their source and identifier", async () => {
    const record = makeOrderRecord();
    for (const event of record.serviceEvents) {
      if (!event.orderAddOn) continue;
      event.orderAddOn.serviceId = null;
      event.orderAddOn.technicianServiceId = 81;
    }
    const repository = new BackofficeRepository({
      bookingOrder: { findFirst: jest.fn().mockResolvedValue(record) }
    } as never);

    const result = await repository.findOrderById({ scope: "platform", id: 31 });

    expect(result?.timelineEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "service:501",
        serviceId: 81,
        serviceType: "technician_service",
        priceAmountJpy: 8800
      })
    ]));
  });

  it("keeps merchant order detail shop-scoped and removes operations-only internal notes", async () => {
    const findFirst = jest.fn().mockResolvedValue(makeOrderRecord());
    const repository = new BackofficeRepository({ bookingOrder: { findFirst } } as never);

    const result = await repository.findOrderById({ scope: "merchant", shopId: 11, id: 31 });

    expect(result).toMatchObject({
      totalAmountJpy: 17_600,
      amountSource: "accepted_add_ons"
    });
    expect(result?.timelineEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "performance:92", internalNote: null, actorName: "Operations Admin" }),
      expect.objectContaining({ id: "service:501", actorName: "Aya Customer" })
    ]));
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 31, deletedAt: null, shopId: 11 }
    }));
  });
});
