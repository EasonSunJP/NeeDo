import { useMemo, useState, type ReactNode } from "react";
import { ContactEventTimelinePanel, type ContactEventTimelineEntry } from "../../../components/mobile/ContactEventTimeline";
import {
  ContactInfoActionConfirmDialog,
  getContactInfoActionClassName,
  type ContactInfoStatusAction
} from "../../../components/mobile/ContactInfoStatusPanel";
import { Badge } from "../../../components/ui/Badge";
import { cn, yen } from "../../../lib/utils";
import { useEntityStore } from "../../../state/entityStore";
import { getArrangementStatusLabel, getServiceModeLabel, type DispatchArrangement, type DispatchAuditLog } from "../domain";
import {
  annotateArrangement,
  assignArrangementTechnician,
  cancelArrangement,
  rescheduleArrangement,
  useDispatchCenterStore
} from "../store";

type ArrangementActionResult = { ok: boolean; message?: string };
type ArrangementRecommendedAction = ContactInfoStatusAction & {
  run: () => ArrangementActionResult;
};

export function getArrangementStatusTone(status: DispatchArrangement["status"]) {
  if (status === "completed") {
    return "green";
  }

  if (status === "pending") {
    return "yellow";
  }

  if (status === "cancelled") {
    return "red";
  }

  return "blue";
}

export function getArrangementStatusClassName(status: DispatchArrangement["status"]) {
  if (status === "inService") {
    return "schedule-legend-badge schedule-legend-badge--in-service";
  }

  if (status === "confirmed") {
    return "schedule-legend-badge schedule-legend-badge--booked";
  }

  if (status === "pending" || status === "cancelled") {
    return "schedule-legend-badge schedule-legend-badge--conflict-pending";
  }

  return "schedule-legend-badge schedule-legend-badge--scheduled";
}

export function ArrangementDetailContent({
  arrangement,
  operatorId,
  storeId,
  surface,
  onActionComplete
}: {
  arrangement: DispatchArrangement;
  operatorId: string;
  storeId: string;
  surface: "desktop" | "mobile";
  onActionComplete?: (result: ArrangementActionResult) => void;
}) {
  const { customers, stores, technicians } = useEntityStore();
  const dispatchSnapshot = useDispatchCenterStore();
  const [pendingConfirmAction, setPendingConfirmAction] = useState<ArrangementRecommendedAction | null>(null);
  const store = stores.find((item) => item.id === storeId) ?? null;
  const customer = customers.find((item) => item.id === arrangement.customerId) ?? null;
  const assignedTechnician = technicians.find((technician) => technician.id === arrangement.technicianId) ?? null;
  const storeTechnicians = useMemo(() => technicians.filter((technician) => technician.storeId === storeId), [storeId, technicians]);
  const arrangementAuditLogs = useMemo(
    () => dispatchSnapshot.auditLogs.filter((log) => log.targetType === "arrangement" && log.targetId === arrangement.id),
    [arrangement.id, dispatchSnapshot.auditLogs, dispatchSnapshot.revision]
  );
  const isMobileSurface = surface === "mobile";
  const cardClass = isMobileSurface
    ? "border-line bg-white/80"
    : "merchant-dispatch-card";
  const softPanelClass = isMobileSurface
    ? "bg-paper/70"
    : "merchant-dispatch-soft-panel";
  const labelTextClass = isMobileSurface ? "text-ink/45" : "text-ink/45";

  const cycleTechnician = (currentTechnicianId: string | null) => {
    if (storeTechnicians.length === 0) {
      return null;
    }

    if (!currentTechnicianId) {
      return storeTechnicians[0]?.id ?? null;
    }

    const currentIndex = storeTechnicians.findIndex((technician) => technician.id === currentTechnicianId);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % storeTechnicians.length;
    return storeTechnicians[nextIndex]?.id ?? null;
  };

  const timelineEvents = useMemo(
    () => buildArrangementTimelineEvents({
      arrangement,
      assignedTechnicianAvatarSrc: assignedTechnician?.avatar,
      auditLogs: arrangementAuditLogs,
      customerAvatarSrc: customer?.avatar,
      storeAvatarSrc: store?.cover,
      storeName: store?.name
    }),
    [arrangement, arrangementAuditLogs, assignedTechnician?.avatar, customer?.avatar, store?.cover, store?.name]
  );
  const recommendedActions: ArrangementRecommendedAction[] = [
    {
      id: "switch-technician",
      label: arrangement.technicianId ? "切换担当" : "指派担当",
      run: () => assignArrangementTechnician(arrangement.orderId, cycleTechnician(arrangement.technicianId), operatorId),
      tone: "primary"
    },
    {
      id: "reschedule",
      label: "顺延 1 小时",
      run: () => rescheduleArrangement(arrangement.orderId, 60, operatorId)
    },
    {
      id: "annotate",
      label: "写入备注",
      run: () => annotateArrangement(arrangement.orderId, operatorId)
    },
    {
      disabled: arrangement.status === "cancelled",
      id: "cancel",
      label: "取消预约",
      requiresConfirm: true,
      run: () => cancelArrangement(arrangement.orderId, operatorId),
      tone: "danger"
    }
  ];

  const runAction = (action: ArrangementRecommendedAction) => {
    const result = action.run();
    onActionComplete?.(result);
  };
  const handleRecommendedAction = (action: ArrangementRecommendedAction) => {
    if (action.disabled) {
      return;
    }

    if (action.requiresConfirm) {
      setPendingConfirmAction(action);
      return;
    }

    runAction(action);
  };
  const handleConfirmAction = () => {
    if (!pendingConfirmAction) {
      return;
    }

    runAction(pendingConfirmAction);
    setPendingConfirmAction(null);
  };

  return (
    <div className="space-y-4">
      <div className={cn("rounded-[22px] p-4", softPanelClass)}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className={cn("text-xs font-black uppercase tracking-[0.16em]", isMobileSurface ? "text-ink/45" : "text-moss/70")}>{arrangement.orderNo}</p>
            <h4 className="mt-2 text-xl font-black text-ink">{arrangement.serviceName}</h4>
          </div>
          <Badge className={getArrangementStatusClassName(arrangement.status)} tone={getArrangementStatusTone(arrangement.status)}>
            {getArrangementStatusLabel(arrangement.status)}
          </Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[
            ["客户", arrangement.customerName],
            ["时间", `${arrangement.date} ${arrangement.startTime}-${arrangement.endTime}`],
            ["服务方式", getServiceModeLabel(arrangement.serviceMode)],
            ["担当", arrangement.technicianLabel ?? "待分配"],
            ["地址", arrangement.address],
            ["金额", yen(arrangement.amount)]
          ].map(([label, value]) => (
            <div className={cn("rounded-2xl border px-4 py-3", cardClass)} key={label}>
              <p className={cn("text-xs font-bold", labelTextClass)}>{label}</p>
              <strong className="mt-1 block text-sm">{value}</strong>
            </div>
          ))}
        </div>
      </div>

      <ContactEventTimelinePanel
        className={cn(isMobileSurface ? "rounded-[22px] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)]" : undefined)}
        commentAuthorAvatarSrc={store?.cover ?? assignedTechnician?.avatar}
        events={timelineEvents}
        headerVariant="plain"
        title="处理状态"
      />

      <section className={cn("rounded-[22px] border p-4", isMobileSurface ? "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] shadow-panel" : "merchant-dispatch-card")}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-black text-ink">推荐处理</p>
          <span className="rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] px-2.5 py-1 text-[10px] font-black text-[color:var(--client-primary)]">
            {recommendedActions.length} 个动作
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {recommendedActions.map((action) => (
            <button
              aria-label={action.requiresConfirm ? `${action.label}，需要确认` : action.label}
              className={cn(
                "focus-ring min-h-10 rounded-full border px-3.5 py-2 text-[12px] font-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
                getContactInfoActionClassName(action.tone)
              )}
              disabled={action.disabled}
              key={action.id}
              onClick={() => handleRecommendedAction(action)}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>

      <ContactInfoActionConfirmDialog
        action={pendingConfirmAction}
        onCancel={() => setPendingConfirmAction(null)}
        onConfirm={handleConfirmAction}
      />
    </div>
  );
}

function buildArrangementTimelineEvents({
  arrangement,
  assignedTechnicianAvatarSrc,
  auditLogs,
  customerAvatarSrc,
  storeAvatarSrc,
  storeName
}: {
  arrangement: DispatchArrangement;
  assignedTechnicianAvatarSrc?: string;
  auditLogs: DispatchAuditLog[];
  customerAvatarSrc?: string;
  storeAvatarSrc?: string;
  storeName?: string;
}): ContactEventTimelineEntry[] {
  const bookingAtLabel = formatArrangementTimelineAtLabel(arrangement.date, arrangement.startTime);
  const orderedLogs = [...auditLogs].reverse();
  const events: ContactEventTimelineEntry[] = [
    {
      actorAvatarSrc: customerAvatarSrc,
      actorName: arrangement.customerName,
      actorRole: "预约创建",
      atLabel: bookingAtLabel,
      id: `${arrangement.id}-created`,
      message: `${arrangement.customerName} 预约 ${arrangement.serviceName}，${arrangement.startTime}-${arrangement.endTime} ${getServiceModeLabel(arrangement.serviceMode)}。`,
      title: "预约创建",
      tone: "green"
    }
  ];

  if (arrangement.technicianLabel) {
    events.push({
      actorAvatarSrc: assignedTechnicianAvatarSrc,
      actorName: arrangement.technicianLabel,
      actorRole: "担当确认",
      atLabel: bookingAtLabel,
      id: `${arrangement.id}-assignee`,
      message: `${arrangement.technicianLabel} 已负责该预约，${arrangement.roomLabel || arrangement.address}。`,
      title: "担当确认",
      tone: "green"
    });
  }

  orderedLogs.forEach((log) => {
    events.push(buildArrangementAuditTimelineEvent(log, storeAvatarSrc, storeName));
  });

  events.push({
    actorName: "系统",
    actorRole: getArrangementStatusLabel(arrangement.status),
    atLabel: orderedLogs.at(-1)?.createdAt ?? bookingAtLabel,
    id: `${arrangement.id}-current-status`,
    message: getArrangementStatusMessage(arrangement),
    title: getArrangementStatusLabel(arrangement.status),
    tone: getArrangementTimelineTone(arrangement.status)
  });

  return events;
}

function buildArrangementAuditTimelineEvent(log: DispatchAuditLog, storeAvatarSrc?: string, storeName = "门店"): ContactEventTimelineEntry {
  const after = parseArrangementAuditPayload(log.after);
  const actionLabel = getArrangementAuditActionLabel(log.action);
  const tone = log.action === "dispatch.arrangement.cancel" ? "red" : "green";

  return {
    actorAvatarSrc: storeAvatarSrc,
    actorName: storeName,
    actorRole: actionLabel,
    atLabel: log.createdAt,
    id: log.id,
    message: getArrangementAuditMessage(log, after),
    title: actionLabel,
    tone
  };
}

function getArrangementAuditActionLabel(action: string) {
  const labels: Record<string, string> = {
    "dispatch.arrangement.assign": "担当调整",
    "dispatch.arrangement.reschedule": "时间调整",
    "dispatch.arrangement.annotate": "备注更新",
    "dispatch.arrangement.cancel": "取消预约"
  };

  return labels[action] ?? "处理记录";
}

function getArrangementAuditMessage(log: DispatchAuditLog, after: DispatchArrangement | null): ReactNode {
  if (log.action === "dispatch.arrangement.assign") {
    return after?.technicianLabel ? `已切换担当为 ${after.technicianLabel}。` : "已取消当前担当，等待重新指派。";
  }

  if (log.action === "dispatch.arrangement.reschedule") {
    return after ? `已调整为 ${after.date} ${after.startTime}-${after.endTime}，并重新校验冲突。` : log.reason;
  }

  if (log.action === "dispatch.arrangement.annotate") {
    return after?.internalNote ? `已写入备注：${after.internalNote}` : log.reason;
  }

  if (log.action === "dispatch.arrangement.cancel") {
    return "已取消预约并释放担当、时间占用。";
  }

  return log.reason;
}

function parseArrangementAuditPayload(value: string) {
  try {
    return JSON.parse(value) as DispatchArrangement;
  } catch {
    return null;
  }
}

function formatArrangementTimelineAtLabel(date: string, time: string) {
  return `${date} ${time}`;
}

function getArrangementTimelineTone(status: DispatchArrangement["status"]) {
  if (status === "cancelled") {
    return "red";
  }

  if (status === "pending") {
    return "neutral";
  }

  return "green";
}

function getArrangementStatusMessage(arrangement: DispatchArrangement) {
  if (arrangement.status === "cancelled") {
    return "该预约已取消，担当和排班占用已释放。";
  }

  if (arrangement.status === "pending") {
    return "该预约仍待确认担当，建议先指派或切换担当。";
  }

  if (arrangement.status === "inService") {
    return "服务已进入执行中，请持续跟进到达与完成状态。";
  }

  if (arrangement.status === "completed") {
    return "该预约已完成，结果已同步到订单和排班记录。";
  }

  return "预约安排已确认，等待到达或服务开始。";
}
