import type { BackofficeOrderTimelineEvent } from "../../api/backofficeRealData";
import type { ContactEventTimelineEntry } from "../../components/mobile/ContactEventTimeline";
import type { Language } from "../../i18n/translations";
import { yen } from "../../lib/utils";
import {
  displayablePublicBusinessReason,
  formatOrderTimelineDate,
  formatOrderTimelineDuration,
  orderStatusTimelineMessage,
  orderTimelineActorName,
  orderTimelineText,
  performanceTimelineDisplay
} from "../order-performance/timelineDisplay";

function eventLabel(event: BackofficeOrderTimelineEvent, language: Language) {
  if (event.type === "ORDER_STATUS_CHANGED") return orderTimelineText("订单状态", language);
  if (event.type === "TECHNICIAN_CANCEL_CLASSIFIED") return orderTimelineText("技师原因取消", language);
  if (event.type === "TECHNICIAN_UNCOMPLETED_CLASSIFIED") return orderTimelineText("技师未完单", language);
  if (event.type === "SPECIAL_CANCELLATION_APPLIED") return orderTimelineText("特殊取消已生效", language);
  if (event.type === "SPECIAL_CANCELLATION_REVOKED") return orderTimelineText("特殊取消已撤销", language);
  if (event.type === "ADD_ON_PROPOSED") return orderTimelineText("提出加钟", language);
  if (event.type === "ADD_ON_ACCEPTED") return orderTimelineText("加钟已确认", language);
  return orderTimelineText("加钟已拒绝", language);
}

export function mapBackofficeOrderTimeline(
  events: BackofficeOrderTimelineEvent[],
  language: Language = "zh"
): ContactEventTimelineEntry[] {
  return events.map((event) => {
    const title = eventLabel(event, language);
    const actor = {
      actorAvatarSrc: event.actorAvatarUrl ?? undefined,
      actorName: orderTimelineActorName(event.actorName, language),
      actorRole: title,
      atLabel: formatOrderTimelineDate(event.createdAt, language),
      id: event.id,
      title
    };

    if ("addOnId" in event) {
      const summary = `${event.serviceName} · ${formatOrderTimelineDuration(event.durationMinutes, language)} · ${yen(event.priceAmountJpy)}`;
      return {
        ...actor,
        message: summary,
        tone: event.type === "ADD_ON_REJECTED" ? "red" as const : "green" as const
      };
    }

    if (event.type === "ORDER_STATUS_CHANGED") {
      return {
        ...actor,
        message: orderStatusTimelineMessage(event.toStatus, language),
        tone: event.toStatus === "cancelled" ? "red" as const : "green" as const
      };
    }

    const performance = performanceTimelineDisplay(event.type, language);
    return {
      ...actor,
      message: displayablePublicBusinessReason(event.publicReason) ?? performance.message,
      tone: performance.tone
    };
  });
}
