import { describe, expect, it } from "vitest";
import type { BackofficeOrderTimelineEvent } from "../../api/backofficeRealData";
import type { BookingOrder, BookingOrderTimelineEvent } from "../booking/api";
import { mapBackofficeOrderTimeline } from "../booking/backofficeOrderTimeline";
import { buildFormalOrderTimelineEvents } from "./timeline";

function makeOrder(timelineEvents: BookingOrderTimelineEvent[]): BookingOrder {
  return {
    id: 24409,
    orderNo: "ND-24409",
    orderType: "booking",
    status: "completed",
    paymentMethod: "ndp",
    paymentStatus: "confirmed",
    paymentAmountJpy: 8800,
    paymentConfirmedById: null,
    paymentConfirmedAt: null,
    paymentReference: null,
    paymentNote: null,
    paymentRefundedById: null,
    paymentRefundedAt: null,
    paymentRefundReference: null,
    paymentRefundReason: null,
    customerUserId: 12345,
    serviceId: 1,
    technicianServiceId: null,
    shopId: 1,
    technicianProfileId: 2,
    scheduleSlotId: 3,
    fulfillmentMode: "store",
    serviceName: "护理服务",
    pricingModeSnapshot: "merchant",
    serviceOwnerType: "shop",
    serviceOwnerId: 1,
    serviceNameSnapshot: "护理服务",
    servicePriceSnapshot: "8800.00",
    serviceDurationSnapshot: 60,
    serviceSnapshot: {},
    rebook: { action: "unavailable", reason: "shop_unavailable" },
    shopName: "NeeDo 店铺",
    technicianName: "技师 A",
    priceAmount: "8800.00",
    currency: "JPY",
    startsAt: "2026-09-10T01:00:00.000Z",
    endsAt: "2026-09-10T02:00:00.000Z",
    note: null,
    cancelReason: null,
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T03:00:00.000Z",
    statusHistory: [],
    performanceAssessment: null,
    timelineEvents
  };
}

describe("order timeline display privacy", () => {
  it("shows customer business semantics and approved comments without raw audit reasons or actor ids", () => {
    const events = buildFormalOrderTimelineEvents(makeOrder([
      {
        type: "ORDER_STATUS_CHANGED",
        id: "status:1",
        createdAt: "2026-09-10T00:00:00.000Z",
        actorUserId: 12345,
        fromStatus: null,
        toStatus: "pending",
        publicReason: "created"
      },
      {
        type: "ORDER_STATUS_CHANGED",
        id: "status:2",
        createdAt: "2026-09-10T01:00:00.000Z",
        actorUserId: 12345,
        fromStatus: "confirmed",
        toStatus: "inService",
        publicReason: "service_started"
      },
      {
        type: "SPECIAL_CANCELLATION_APPLIED",
        id: "performance:3",
        createdAt: "2026-09-10T02:00:00.000Z",
        actorUserId: 99,
        publicReason: "QA-20260910-RQ-003 add-on completed"
      },
      {
        type: "ORDER_COMMENT_ADDED",
        id: "comment:4",
        createdAt: "2026-09-10T03:00:00.000Z",
        actorUserId: 12345,
        actorDisplayName: "山田",
        actorAvatarUrl: null,
        body: "请提前十分钟到达"
      }
    ]), { audience: "customer", language: "zh" });

    const rendered = JSON.stringify(events);
    expect(rendered).toContain("预约待确认");
    expect(rendered).toContain("服务已开始");
    expect(rendered).toContain("请提前十分钟到达");
    expect(rendered).not.toContain("本单已从接单率计算中排除");
    expect(rendered).not.toContain("特殊取消");
    expect(rendered).not.toContain("created");
    expect(rendered).not.toContain("service_started");
    expect(rendered).not.toContain("QA-20260910-RQ-003");
    expect(rendered).not.toContain("12345");
  });

  it.each([
    ["zh-Hant", "服務已開始"],
    ["ja", "サービスを開始しました"],
    ["en", "Service started"],
    ["ko", "서비스 시작됨"]
  ] as const)("localizes technician status semantics in %s", (language, expected) => {
    const events = buildFormalOrderTimelineEvents(makeOrder([
      {
        type: "ORDER_STATUS_CHANGED",
        id: "status:1",
        createdAt: "2026-09-10T01:00:00.000Z",
        actorUserId: 12345,
        fromStatus: "confirmed",
        toStatus: "inService",
        publicReason: "service_started"
      }
    ]), { audience: "technician", language });

    expect(JSON.stringify(events)).toContain(expected);
  });

  it.each([
    ["pending", "Reservation pending confirmation"],
    ["confirmed", "Reservation confirmed"],
    ["inService", "Service started"],
    ["awaitingCheckout", "Awaiting checkout"],
    ["awaitingPaymentConfirmation", "Awaiting payment confirmation"],
    ["completed", "Service completed"],
    ["cancelled", "Reservation cancelled"]
  ] as const)("maps the %s audit status to an English business label", (toStatus, expected) => {
    const events = buildFormalOrderTimelineEvents(makeOrder([
      {
        type: "ORDER_STATUS_CHANGED",
        id: `status:${toStatus}`,
        createdAt: "2026-09-10T01:00:00.000Z",
        actorUserId: null,
        fromStatus: null,
        toStatus,
        publicReason: `internal_${toStatus}`
      }
    ]), { audience: "customer", language: "en" });

    const rendered = JSON.stringify(events);
    expect(rendered).toContain(expected);
    expect(rendered).not.toContain(`internal_${toStatus}`);
  });

  it("fails closed for an unknown future status instead of displaying its raw value", () => {
    const events = mapBackofficeOrderTimeline([{
      type: "ORDER_STATUS_CHANGED",
      id: "status:future",
      createdAt: "2026-09-10T01:00:00.000Z",
      actorUserId: null,
      actorName: "NeeDo系统",
      actorAvatarUrl: null,
      fromStatus: "completed",
      toStatus: "debug_future_status",
      publicReason: "payload"
    }], "en");

    const rendered = JSON.stringify(events);
    expect(rendered).toContain("Order status updated");
    expect(rendered).not.toContain("debug_future_status");
    expect(rendered).not.toContain("payload");
  });

  it.each([
    ["TECHNICIAN_CANCEL_CLASSIFIED", "已计入技师原因取消记录"],
    ["TECHNICIAN_UNCOMPLETED_CLASSIFIED", "已计入技师未完单记录"],
    ["SPECIAL_CANCELLATION_APPLIED", "本单已从接单率计算中排除"],
    ["SPECIAL_CANCELLATION_REVOKED", "本单已恢复计入接单率计算"]
  ] as const)("maps %s to technician-safe semantics", (type, expected) => {
    const events = buildFormalOrderTimelineEvents(makeOrder([
      {
        type,
        id: `performance:${type}`,
        createdAt: "2026-09-10T01:00:00.000Z",
        actorUserId: 12345,
        publicReason: `QA-20260910-${type}`
      }
    ]), { audience: "technician", language: "zh" });

    const rendered = JSON.stringify(events);
    expect(rendered).toContain(expected);
    expect(rendered).not.toContain(`QA-20260910-${type}`);
    expect(rendered).not.toContain("12345");
  });

  it.each([
    ["ADD_ON_PROPOSED", "提出加钟"],
    ["ADD_ON_ACCEPTED", "加钟已确认"],
    ["ADD_ON_REJECTED", "加钟已拒绝"]
  ] as const)("maps %s to operations-safe add-on semantics", (type, expected) => {
    const mapped = mapBackofficeOrderTimeline([{
      type,
      id: `service:${type}`,
      createdAt: "2026-09-10T01:00:00.000Z",
      actorUserId: 1,
      actorName: "运营管理员",
      actorAvatarUrl: null,
      publicReason: `debug_${type}`,
      addOnId: 7,
      serviceId: 8,
      serviceName: "延长护理",
      priceAmountJpy: 1200,
      currency: "JPY",
      durationMinutes: 15
    }], "zh");

    const rendered = JSON.stringify(mapped);
    expect(rendered).toContain(expected);
    expect(rendered).not.toContain(`debug_${type}`);
  });

  it("keeps operations audit data intact but exposes only localized display-safe event fields", () => {
    const events: BackofficeOrderTimelineEvent[] = [
      {
        type: "ORDER_STATUS_CHANGED",
        id: "status:1",
        createdAt: "2026-09-10T00:00:00.000Z",
        actorUserId: 12345,
        actorName: "12345",
        actorAvatarUrl: null,
        fromStatus: null,
        toStatus: "pending",
        publicReason: "checkout_payment_method_selected"
      },
      {
        type: "ADD_ON_ACCEPTED",
        id: "service:2",
        createdAt: "2026-09-10T01:00:00.000Z",
        actorUserId: 12345,
        actorName: "12345",
        actorAvatarUrl: null,
        publicReason: "QA-20260910-RQ-003 add-on completed",
        addOnId: 7,
        serviceId: 8,
        serviceName: "延长护理",
        priceAmountJpy: 1200,
        currency: "JPY",
        durationMinutes: 15
      },
      {
        type: "SPECIAL_CANCELLATION_REVOKED",
        id: "performance:3",
        createdAt: "2026-09-10T02:00:00.000Z",
        actorUserId: 1,
        actorName: "运营管理员",
        actorAvatarUrl: null,
        publicReason: "checkout_ndp_payment_applied",
        internalNote: "debug payload 12345"
      }
    ];

    const before = structuredClone(events);
    const mapped = mapBackofficeOrderTimeline(events, "ja");
    const rendered = JSON.stringify(mapped);

    expect(rendered).toContain("予約は確認待ちです");
    expect(rendered).toContain("延長確定");
    expect(rendered).toContain("延长护理");
    expect(rendered).toContain("+15分");
    expect(rendered).not.toContain("分钟");
    expect(rendered).toContain("特別取消を解除");
    expect(rendered).not.toContain("checkout_payment_method_selected");
    expect(rendered).not.toContain("checkout_ndp_payment_applied");
    expect(rendered).not.toContain("QA-20260910-RQ-003");
    expect(rendered).not.toContain("debug payload");
    expect(rendered).not.toContain('"actorName":"12345"');
    expect(events).toEqual(before);
  });
});
