import type { ContactEventTimelineEntry } from "../../components/mobile/ContactEventTimeline";
import {
  formatApiOrderDateTime,
  type BookingOrder
} from "../booking/api";
import { statusLabel } from "../../lib/utils";

export function buildFormalOrderTimelineEvents(
  order: BookingOrder
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
    .sort(
      (left, right) =>
        Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
        left.id.localeCompare(right.id)
    )
    .map((event) => {
      const actorName = event.actorUserId ? `#${event.actorUserId}` : "系统";

      if (event.type === "ORDER_COMMENT_ADDED") {
        return {
          actorAvatarSrc: event.actorAvatarUrl ?? undefined,
          actorName: event.actorDisplayName,
          actorRole: "评论",
          atLabel: formatApiOrderDateTime(event.createdAt),
          id: event.id,
          message: event.body,
          title: "评论",
          tone: "green" as const
        };
      }

      if (event.type === "ORDER_STATUS_CHANGED") {
        return {
          actorName,
          actorRole: "预约状态",
          atLabel: formatApiOrderDateTime(event.createdAt),
          id: event.id,
          message:
            event.publicReason ?? `${event.fromStatus ?? "created"} → ${event.toStatus}`,
          title: statusLabel(event.toStatus),
          tone: event.toStatus === "cancelled" ? "red" : "green"
        };
      }

      const performanceCopy = {
        TECHNICIAN_CANCEL_CLASSIFIED: {
          role: "技师原因取消",
          fallback: "已计入技师原因取消记录",
          tone: "red" as const
        },
        TECHNICIAN_UNCOMPLETED_CLASSIFIED: {
          role: "技师未完单",
          fallback: "已计入技师未完单记录",
          tone: "red" as const
        },
        SPECIAL_CANCELLATION_APPLIED: {
          role: "特殊取消已生效",
          fallback: "本单已从接单率计算中排除",
          tone: "green" as const
        },
        SPECIAL_CANCELLATION_REVOKED: {
          role: "特殊取消已撤销",
          fallback: "本单已恢复计入接单率计算",
          tone: "red" as const
        }
      }[event.type];

      return {
        actorName,
        actorRole: performanceCopy.role,
        atLabel: formatApiOrderDateTime(event.createdAt),
        id: event.id,
        message: event.publicReason ?? performanceCopy.fallback,
        title: performanceCopy.role,
        tone: performanceCopy.tone
      };
    });
}
