import type { ContactEventTimelineEntry } from "../../components/mobile/ContactEventTimeline";
import {
  type BookingOrder
} from "../booking/api";
import type { Language } from "../../i18n/translations";
import {
  displayablePublicBusinessReason,
  formatOrderTimelineDate,
  orderStatusTimelineMessage,
  orderTimelineActorName,
  orderTimelineText,
  performanceTimelineDisplay,
  type OrderTimelineAudience
} from "./timelineDisplay";

export function buildFormalOrderTimelineEvents(
  order: BookingOrder,
  options: { audience: OrderTimelineAudience; language: Language } = {
    audience: "customer",
    language: "zh"
  }
): ContactEventTimelineEntry[] {
  const timelineEvents =
    order.timelineEvents && order.timelineEvents.length > 0
      ? order.timelineEvents
      : order.statusHistory.map((history) => ({
          type: "ORDER_STATUS_CHANGED" as const,
          id: `status:${history.id}`,
          createdAt: history.createdAt,
          actorUserId: history.actorUserId,
          fromStatus: history.fromStatus,
          toStatus: history.toStatus,
          publicReason: history.reason
        }));

  return [...timelineEvents]
    .filter((event) => event.type === "ORDER_COMMENT_ADDED" || event.type === "ORDER_STATUS_CHANGED" || options.audience !== "customer")
    .sort(
      (left, right) =>
        Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
        left.id.localeCompare(right.id)
    )
    .map((event) => {
      const actorName = orderTimelineActorName(null, options.language);

      if (event.type === "ORDER_COMMENT_ADDED") {
        return {
          actorAvatarSrc: event.actorAvatarUrl ?? undefined,
          actorName: orderTimelineActorName(event.actorDisplayName, options.language),
          actorRole: orderTimelineText("评论", options.language),
          atLabel: formatOrderTimelineDate(event.createdAt, options.language),
          id: event.id,
          message: event.body,
          title: orderTimelineText("评论", options.language),
          tone: "green" as const
        };
      }

      if (event.type === "ORDER_STATUS_CHANGED") {
        const message = orderStatusTimelineMessage(event.toStatus, options.language);
        return {
          actorName,
          actorRole: orderTimelineText("订单状态", options.language),
          atLabel: formatOrderTimelineDate(event.createdAt, options.language),
          id: event.id,
          message,
          title: message,
          tone: event.toStatus === "cancelled" ? "red" : "green"
        };
      }

      const performanceCopy = performanceTimelineDisplay(event.type, options.language);
      const publicReason = displayablePublicBusinessReason(event.publicReason);

      return {
        actorName,
        actorRole: performanceCopy.label,
        atLabel: formatOrderTimelineDate(event.createdAt, options.language),
        id: event.id,
        message: publicReason ?? performanceCopy.message,
        title: performanceCopy.label,
        tone: performanceCopy.tone
      };
    });
}
