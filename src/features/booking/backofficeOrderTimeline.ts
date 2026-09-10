import type { BackofficeOrderTimelineEvent } from "../../api/backofficeRealData";
import type { ContactEventTimelineEntry } from "../../components/mobile/ContactEventTimeline";
import { yen } from "../../lib/utils";

function formatOrderTimelineDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(new Date(value));
}

function eventLabel(event: BackofficeOrderTimelineEvent) {
  if (event.type === "ORDER_STATUS_CHANGED") return "订单状态";
  if (event.type === "TECHNICIAN_CANCEL_CLASSIFIED") return "技师原因取消";
  if (event.type === "TECHNICIAN_UNCOMPLETED_CLASSIFIED") return "技师未完单";
  if (event.type === "SPECIAL_CANCELLATION_APPLIED") return "特殊取消已生效";
  if (event.type === "SPECIAL_CANCELLATION_REVOKED") return "特殊取消已撤销";
  if (event.type === "ADD_ON_PROPOSED") return "提出加钟";
  if (event.type === "ADD_ON_ACCEPTED") return "加钟已确认";
  return "加钟已拒绝";
}

export function mapBackofficeOrderTimeline(
  events: BackofficeOrderTimelineEvent[]
): ContactEventTimelineEntry[] {
  return events.map((event) => {
    const title = eventLabel(event);
    const actor = {
      actorAvatarSrc: event.actorAvatarUrl ?? undefined,
      actorName: event.actorName,
      actorRole: title,
      atLabel: formatOrderTimelineDate(event.createdAt),
      id: event.id,
      title
    };

    if ("addOnId" in event) {
      const summary = `${event.serviceName} · +${event.durationMinutes}分钟 · ${yen(event.priceAmountJpy)}`;
      return {
        ...actor,
        message: event.publicReason ? `${summary} · ${event.publicReason}` : summary,
        tone: event.type === "ADD_ON_REJECTED" ? "red" as const : "green" as const
      };
    }

    if (event.type === "ORDER_STATUS_CHANGED") {
      return {
        ...actor,
        message: event.publicReason ?? `${event.fromStatus ?? "created"} → ${event.toStatus}`,
        tone: event.toStatus === "cancelled" ? "red" as const : "green" as const
      };
    }

    return {
      ...actor,
      message: event.publicReason ?? "无公开原因",
      reason: event.internalNote ?? undefined,
      reasonLabel: event.internalNote ? "内部备注（仅运营可见）" : undefined,
      tone: event.type === "SPECIAL_CANCELLATION_APPLIED" ? "green" as const : "red" as const
    };
  });
}
