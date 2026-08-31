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
      publicReason: "技师临时无法到达",
      internalNote: null,
      createdAt: new Date("2026-05-25T02:00:00.000Z")
    },
    {
      id: 92,
      action: "APPLY_SPECIAL_EXCLUSION",
      actorUserId: 1,
      publicReason: "不可抗力",
      internalNote: "后台核验材料 A",
      createdAt: new Date("2026-05-25T03:00:00.000Z")
    },
    {
      id: 93,
      action: "REVOKE_SPECIAL_EXCLUSION",
      actorUserId: 1,
      publicReason: "用户投诉后复核",
      internalNote: "投诉工单 C-123",
      createdAt: new Date("2026-05-25T04:00:00.000Z")
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
    expect(result?.timelineEvents).toEqual([
      expect.objectContaining({ id: "performance:91", internalNote: null }),
      expect.objectContaining({ id: "status:11", type: "ORDER_STATUS_CHANGED" }),
      expect.objectContaining({ id: "performance:92", internalNote: "后台核验材料 A" }),
      expect.objectContaining({ id: "performance:93", internalNote: "投诉工单 C-123" })
    ]);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 31, deletedAt: null },
        include: expect.objectContaining({
          performanceRevisions: expect.objectContaining({
            select: expect.objectContaining({ internalNote: true })
          })
        })
      })
    );
  });
});
