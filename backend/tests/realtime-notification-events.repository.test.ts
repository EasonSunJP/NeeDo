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
});
