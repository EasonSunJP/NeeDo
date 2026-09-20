import { NotificationType } from "@prisma/client";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

describe("RealtimeRepository structured notification events", () => {
  it("persists a stable order-status event code and structured localization parameters", async () => {
    const createdAt = new Date("2026-09-13T03:05:00.000Z");
    const create = jest.fn(async ({ data }) => ({
      id: 901,
      ...data,
      readAt: null,
      createdAt
    }));
    const client = {
      notification: { create },
      $transaction: jest.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations))
    };

    const result = await new RealtimeRepository(client as never).createOrderStatusNotifications({
      actorUserId: 51,
      actorIdentityId: 510,
      recipientUserIds: [41],
      recipientIdentities: [{ userId: 41, identityId: 410 }],
      orderId: 501,
      orderNo: "ND501",
      serviceName: "ボディケア 60分",
      fromStatus: "inService",
      toStatus: "awaitingCheckout"
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        recipientUserId: 41,
        recipientIdentityId: 410,
        actorUserId: 51,
        actorIdentityId: 510,
        type: NotificationType.ORDER_STATUS,
        title: "notification.order_status_changed.title",
        body: "notification.order_status_changed.body",
        payload: {
          eventCode: "booking.order_status_changed",
          orderId: 501,
          orderNo: "ND501",
          serviceName: "ボディケア 60分",
          fromStatus: "inService",
          toStatus: "awaitingCheckout"
        }
      }
    });
    expect(result[0]).toMatchObject({
      type: "orderStatus",
      payload: expect.objectContaining({ eventCode: "booking.order_status_changed" })
    });
  });

  it("persists merchant cancellation attribution and appointment context for every recipient", async () => {
    const createdAt = new Date("2026-09-20T13:24:00.000Z");
    const startsAt = new Date("2026-09-21T05:00:00.000Z");
    const create = jest.fn(async ({ data }) => ({ id: 902, ...data, readAt: null, createdAt }));
    const client = {
      notification: { create },
      $transaction: jest.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations))
    };

    await new RealtimeRepository(client as never).createOrderStatusNotifications({
      actorUserId: 51,
      actorIdentityId: 510,
      actorSource: "merchant",
      actorDisplayName: "Eason",
      recipientUserIds: [41, 61],
      recipientIdentities: [
        { userId: 41, identityId: 410 },
        { userId: 61, identityId: 610 }
      ],
      orderId: 24418,
      orderNo: "ND202609200104226905",
      serviceName: "ボディケア 60分",
      shopName: "Eason 店铺",
      startsAt,
      reason: "店铺当天无法履约",
      fromStatus: "confirmed",
      toStatus: "cancelled"
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorIdentityId: 510,
        payload: expect.objectContaining({
          actorSource: "merchant",
          actorDisplayName: "Eason",
          shopName: "Eason 店铺",
          startsAt: startsAt.toISOString(),
          reason: "店铺当天无法履约"
        })
      })
    });
  });
});
