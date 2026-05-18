export type ScheduleEventType = "booking" | "extension" | "reschedule" | "block" | "attendance" | "break";
export type ScheduleDetailTargetType = "order_detail" | "attendance_detail" | "none";
export type ScheduleDetailTargetActor = "user" | "technician" | "merchant" | "merchant-admin" | "admin";

export type ScheduleEventDetailSource = {
  eventType?: ScheduleEventType;
  orderId?: string | null;
  parentOrderId?: string | null;
  appointmentId?: string | null;
  isClickable?: boolean;
  detailTargetType?: ScheduleDetailTargetType;
  detailTargetId?: string | null;
};

export type ResolvedScheduleDetailTarget =
  | {
      action: "open";
      targetType: Exclude<ScheduleDetailTargetType, "none">;
      targetId: string;
      route: string;
      parentOrderId?: string | null;
    }
  | {
      action: "disabled";
      reason: "NOT_CLICKABLE" | "NO_DETAIL_TARGET" | "NON_ORDER_EVENT";
    };

function isOrderScheduleEvent(eventType?: ScheduleEventType) {
  return eventType === "booking" || eventType === "extension" || eventType === "reschedule";
}

export function getScheduleOrderDetailRoute(orderId: string, actor: ScheduleDetailTargetActor) {
  const encoded = encodeURIComponent(orderId);

  if (actor === "user") {
    return `/orders/${encoded}`;
  }

  if (actor === "technician") {
    return `/technician/orders/${encoded}`;
  }

  if (actor === "merchant-admin") {
    return `/merchant-admin/orders/${encoded}`;
  }

  if (actor === "admin") {
    return `/admin/orders?orderId=${encoded}`;
  }

  return `/merchant/orders/${encoded}`;
}

export function resolveScheduleEventDetailTarget(
  event: ScheduleEventDetailSource,
  actor: ScheduleDetailTargetActor
): ResolvedScheduleDetailTarget {
  if (event.isClickable === false || event.detailTargetType === "none") {
    return { action: "disabled", reason: "NOT_CLICKABLE" };
  }

  const targetType = event.detailTargetType ?? (isOrderScheduleEvent(event.eventType) || event.orderId ? "order_detail" : "none");

  if (targetType === "none") {
    return { action: "disabled", reason: "NON_ORDER_EVENT" };
  }

  const targetId = event.detailTargetId ?? (targetType === "order_detail" ? event.orderId : event.appointmentId);

  if (!targetId) {
    return { action: "disabled", reason: "NO_DETAIL_TARGET" };
  }

  if (targetType === "order_detail") {
    return {
      action: "open",
      targetType,
      targetId,
      route: getScheduleOrderDetailRoute(targetId, actor),
      parentOrderId: event.parentOrderId
    };
  }

  return {
    action: "open",
    targetType,
    targetId,
    route: `/schedule/attendance/${encodeURIComponent(targetId)}`,
    parentOrderId: event.parentOrderId
  };
}
