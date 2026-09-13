import type { ContactEventTimelineEntry } from "../../components/mobile/ContactEventTimeline";
import {
  type BookingOrder
} from "../booking/api";
import type { Language } from "../../i18n/translations";
import {
  displayablePublicBusinessReason,
  formatOrderTimelineDate,
  formatOrderTimelineDuration,
  orderStatusTimelineMessage,
  orderTimelineActorName,
  orderTimelineText,
  performanceTimelineDisplay,
  type OrderTimelineAudience
} from "./timelineDisplay";
import { yen } from "../../lib/utils";

type TechnicianAddOnTimelineEvent = {
  type: "ADD_ON_PROPOSED" | "ADD_ON_ACCEPTED" | "ADD_ON_REJECTED";
  id: string;
  createdAt: string;
  actor: "customer" | "technician" | null;
  serviceName: string;
  priceAmountJpy: number;
  durationMinutes: number;
};

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

  const technicianAddOnEvents: TechnicianAddOnTimelineEvent[] =
    options.audience === "technician"
      ? (order.serviceSession?.addOns ?? []).flatMap((addOn) => {
          const proposed: TechnicianAddOnTimelineEvent = {
            type: "ADD_ON_PROPOSED",
            id: `add-on:${addOn.id}:proposed`,
            createdAt: addOn.proposedAt,
            actor: addOn.proposedBy,
            serviceName: addOn.serviceNameSnapshot,
            priceAmountJpy: addOn.priceAmountJpy,
            durationMinutes: addOn.durationMinutes
          };
          if (!addOn.resolvedAt || addOn.status === "proposed") return [proposed];
          return [
            proposed,
            {
              type: addOn.status === "accepted" ? "ADD_ON_ACCEPTED" : "ADD_ON_REJECTED",
              id: `add-on:${addOn.id}:resolved`,
              createdAt: addOn.resolvedAt,
              actor: addOn.resolvedBy,
              serviceName: addOn.serviceNameSnapshot,
              priceAmountJpy: addOn.priceAmountJpy,
              durationMinutes: addOn.durationMinutes
            }
          ];
        })
      : [];

  return [...timelineEvents, ...technicianAddOnEvents]
    .filter((event) => event.type === "ORDER_COMMENT_ADDED" || event.type === "ORDER_STATUS_CHANGED" || options.audience !== "customer")
    .sort(
      (left, right) =>
        Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
        left.id.localeCompare(right.id)
    )
    .map((event) => {
      const actorName = orderTimelineActorName(null, options.language);

      if (
        event.type === "ADD_ON_PROPOSED" ||
        event.type === "ADD_ON_ACCEPTED" ||
        event.type === "ADD_ON_REJECTED"
      ) {
        const title = orderTimelineText(
          event.type === "ADD_ON_PROPOSED"
            ? "提出加钟"
            : event.type === "ADD_ON_ACCEPTED"
              ? "加钟已确认"
              : "加钟已拒绝",
          options.language
        );
        return {
          actorName: event.actor
            ? orderTimelineText(event.actor === "technician" ? "技师" : "用户", options.language)
            : actorName,
          actorRole: title,
          atLabel: formatOrderTimelineDate(event.createdAt, options.language),
          id: event.id,
          message: `${event.serviceName} · ${formatOrderTimelineDuration(event.durationMinutes, options.language)} · ${yen(event.priceAmountJpy)}`,
          title,
          tone: event.type === "ADD_ON_REJECTED" ? "red" as const : "green" as const
        };
      }

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
      const publicReason = displayablePublicBusinessReason(
        "publicReason" in event ? event.publicReason : null
      );

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
