import { useState, type ReactNode } from "react";
import { ContactEventTimelinePanel } from "./ContactEventTimeline";
import { MobileFullscreenHeader } from "./MobileFullscreenHeader";
import { MobileFullscreenPage } from "./MobileFullscreenPage";
import { FeatureSegmentedTabs } from "../client-ui/AppScaffold";
import { ClientActionDialog } from "../ui/ClientActionDialog";
import { cn } from "../../lib/utils";

export type ContactInfoStatusResolution = "active" | "expired" | "resolved";
export type ContactInfoStatusFilter = ContactInfoStatusResolution | "all";

export type ContactInfoStatusTimelineEvent = {
  actorAvatarSrc?: string;
  actorName?: ReactNode;
  actorRole?: ReactNode;
  atLabel: string;
  conflicts?: ReactNode[];
  detail: string;
  icon?: ReactNode;
  id: string;
  message?: ReactNode;
  operator?: string;
  reason?: ReactNode;
  reasonLabel?: ReactNode;
  title: string;
  tone?: "neutral" | "red" | "green";
};

export type ContactInfoStatusTagTone = "neutral" | "blue" | "yellow" | "red" | "green" | "dark";

export type ContactInfoStatusTag = {
  label: string;
  tone?: ContactInfoStatusTagTone;
};

export type ContactInfoStatusActionTone = "primary" | "secondary" | "danger";

export type ContactInfoStatusAction = {
  disabled?: boolean;
  id: string;
  label: string;
  requiresConfirm?: boolean;
  tone?: ContactInfoStatusActionTone;
};

export type ContactInfoStatusItem = {
  actions?: ContactInfoStatusAction[];
  dateLabel?: string;
  detail: string;
  eventTags?: ContactInfoStatusTag[];
  icon: ReactNode;
  id: string;
  relatedTags?: ContactInfoStatusTag[];
  status: ContactInfoStatusResolution;
  statusLabel: string;
  timestampLabel?: string;
  timeline?: ContactInfoStatusTimelineEvent[];
  title: string;
  tone?: "neutral" | "red";
};

const contactInfoStatusFilterOptions: Array<{ label: string; value: ContactInfoStatusFilter }> = [
  { label: "未解决", value: "active" },
  { label: "已过期", value: "expired" },
  { label: "已解决", value: "resolved" },
  { label: "全部", value: "all" }
];

function ContactInfoComputerIcon({ className, warning = false }: { className?: string; warning?: boolean }) {
  return (
    <span className={cn("relative grid h-5 w-5 place-items-center", className)}>
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <rect height="11" rx="2.4" stroke="currentColor" strokeWidth="1.9" width="16" x="4" y="5" />
        <path d="M9 19h6M12 16v3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
      </svg>
      {warning ? (
        <span className="absolute -right-1 -top-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[#ef4444] px-0.5 text-[9px] font-black leading-none text-white">
          !
        </span>
      ) : null}
    </span>
  );
}

function isContactInfoBlockingItem(item: Pick<ContactInfoStatusItem, "detail" | "status" | "statusLabel" | "title" | "tone">) {
  const text = `${item.title} ${item.statusLabel} ${item.detail}`;

  return item.tone === "red" || item.status === "expired" || /异常|異常|阻断|阻斷|冲突|衝突|失败|失敗|过期|過期|取消|未到|迟到|遅刻|风险|風險/i.test(text);
}

function getContactInfoStatusIcon(item: Pick<ContactInfoStatusItem, "detail" | "icon" | "status" | "statusLabel" | "title" | "tone">) {
  return item.title === "系统信息" ? <ContactInfoComputerIcon warning={isContactInfoBlockingItem(item)} /> : item.icon;
}

function padTimeSegment(value: number) {
  return String(value).padStart(2, "0");
}

function getContactInfoTodayParts() {
  const now = new Date();

  return {
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
    month: now.getMonth() + 1,
    second: now.getSeconds(),
    year: now.getFullYear()
  };
}

function getContactInfoTodayKey() {
  const today = getContactInfoTodayParts();

  return `${today.year}-${padTimeSegment(today.month)}-${padTimeSegment(today.day)}`;
}

function getTimePartsFromText(value: string) {
  const match = value.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);

  if (!match) {
    return null;
  }

  return {
    hour: Math.max(0, Math.min(23, Number(match[1]))),
    minute: Math.max(0, Math.min(59, Number(match[2]))),
    second: Math.max(0, Math.min(59, Number(match[3] ?? 0)))
  };
}

function formatContactInfoTimestamp(value?: string, detail?: string) {
  const raw = value?.trim();

  if (!raw || raw === "-") {
    return "-";
  }

  const today = getContactInfoTodayParts();
  const fallbackTime = getTimePartsFromText(`${raw} ${detail ?? ""}`) ?? {
    hour: today.hour,
    minute: today.minute,
    second: today.second
  };
  let year = today.year;
  let month = today.month;
  let day = today.day;
  let time = fallbackTime;

  if (/^(现在|刚刚)$/.test(raw)) {
    time = { hour: today.hour, minute: today.minute, second: today.second };
  } else if (/^(今日|今天)/.test(raw)) {
    time = getTimePartsFromText(raw) ?? fallbackTime;
  } else {
    const isoMatch = raw.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    const compactMatch = raw.match(/\b(\d{2})[.\/-](\d{1,2})[.\/-](\d{1,2})\b/);
    const chineseMatch = raw.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/);
    const slashMatch = raw.match(/\b(\d{1,2})\/(\d{1,2})\b/);
    const match = isoMatch ?? compactMatch ?? chineseMatch ?? slashMatch;

    if (match) {
      if (match === isoMatch) {
        year = Number(match[1]);
        month = Number(match[2]);
        day = Number(match[3]);
      } else if (match === compactMatch) {
        year = 2000 + Number(match[1]);
        month = Number(match[2]);
        day = Number(match[3]);
      } else if (match === chineseMatch) {
        year = match[1] ? Number(match[1]) : today.year;
        month = Number(match[2]);
        day = Number(match[3]);
      } else {
        month = Number(match[1]);
        day = Number(match[2]);
      }
    } else if (!getTimePartsFromText(raw)) {
      return raw;
    }
  }

  const dateKey = `${year}-${padTimeSegment(month)}-${padTimeSegment(day)}`;
  const timeLabel = `${padTimeSegment(time.hour)}:${padTimeSegment(time.minute)}:${padTimeSegment(time.second)}`;

  if (dateKey === getContactInfoTodayKey()) {
    return `今天 ${timeLabel}`;
  }

  return `${year}年${month}月${day}日 ${timeLabel}`;
}

type ContactInfoEventPresentation = {
  actions: ContactInfoStatusAction[];
  eventTags: ContactInfoStatusTag[];
  relatedTags: ContactInfoStatusTag[];
};

const resolvedStatusActions: ContactInfoStatusAction[] = [
  { id: "close_event", label: "关闭归档", tone: "primary" },
  { id: "reopen_event", label: "重新打开", tone: "secondary" },
  { id: "view_audit_log", label: "查看日志", tone: "secondary" }
];

const defaultStatusActions: ContactInfoStatusAction[] = [
  { id: "manual_handle", label: "人工处理", tone: "primary" },
  { id: "add_rule", label: "添加规则", tone: "secondary" },
  { id: "ignore_once", label: "忽略本次", tone: "secondary" }
];

function hasContactInfoKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function contactInfoAction(id: string, label: string, tone: ContactInfoStatusActionTone = "secondary", requiresConfirm = false): ContactInfoStatusAction {
  return { id, label, requiresConfirm, tone };
}

export function resolveContactInfoEventPresentation(item: Pick<ContactInfoStatusItem, "actions" | "detail" | "eventTags" | "id" | "relatedTags" | "status" | "title" | "tone">): ContactInfoEventPresentation {
  const text = `${item.id} ${item.title} ${item.detail}`.toLowerCase();
  let eventTags: ContactInfoStatusTag[] = [
    { label: "系统事件", tone: "blue" },
    { label: item.tone === "red" ? "需优先处理" : "待负责人确认", tone: item.tone === "red" ? "red" : "yellow" }
  ];
  let relatedTags: ContactInfoStatusTag[] = [
    { label: "关联业务记录", tone: "neutral" },
    { label: "操作日志", tone: "dark" }
  ];
  let actions = defaultStatusActions;

  if (hasContactInfoKeyword(text, ["customer-no-show", "客人未到", "还没到", "未到店", "座位"])) {
    eventTags = [
      { label: "客人未到", tone: "red" },
      { label: "预约履约", tone: "blue" },
      { label: "紧急", tone: "yellow" }
    ];
    relatedTags = [
      { label: "关联预约", tone: "blue" },
      { label: "影响：座位 / 时段", tone: "neutral" },
      { label: "需要前台确认", tone: "yellow" }
    ];
    actions = [
      contactInfoAction("mark_customer_no_show", "标记未到", "primary"),
      contactInfoAction("contact_customer", "联系客人"),
      contactInfoAction("mark_customer_arrived", "标记已到"),
      contactInfoAction("allow_waiting", "允许等待"),
      contactInfoAction("reschedule_booking", "改期"),
      contactInfoAction("cancel_booking", "取消预约", "danger", true)
    ];
  } else if (hasContactInfoKeyword(text, ["technician-late", "技师还没到", "技师迟到", "到达确认", "eta"])) {
    eventTags = [
      { label: "技师迟到", tone: "red" },
      { label: "预约履约", tone: "blue" },
      { label: "紧急", tone: "yellow" }
    ];
    relatedTags = [
      { label: "关联技师", tone: "blue" },
      { label: "关联客人", tone: "neutral" },
      { label: "影响：后续预约", tone: "yellow" }
    ];
    actions = [
      contactInfoAction("fill_eta", "填写 ETA 并通知客人", "primary"),
      contactInfoAction("contact_technician", "联系技师"),
      contactInfoAction("replace_technician", "换技师"),
      contactInfoAction("reschedule_booking", "改期"),
      contactInfoAction("cancel_booking", "取消预约", "danger", true)
    ];
  } else if (hasContactInfoKeyword(text, ["请假", "leave"])) {
    eventTags = [
      { label: "请假冲突", tone: "red" },
      { label: "技师 / 员工", tone: "blue" },
      { label: "排班影响", tone: "yellow" }
    ];
    relatedTags = [
      { label: "关联排班", tone: "blue" },
      { label: "关联预约", tone: "neutral" },
      { label: "需要替补确认", tone: "yellow" }
    ];
    actions = [
      contactInfoAction("review_affected_bookings", "查看影响预约", "primary"),
      contactInfoAction("find_replacement", "找替补"),
      contactInfoAction("approve_leave", "批准请假"),
      contactInfoAction("reject_leave", "拒绝请假", "danger", true),
      contactInfoAction("bulk_reschedule", "批量改期"),
      contactInfoAction("bulk_cancel_booking", "批量取消预约", "danger", true)
    ];
  } else if (hasContactInfoKeyword(text, ["调班", "换班", "shift-swap", "swap"])) {
    eventTags = [
      { label: "调班申请", tone: "blue" },
      { label: "订单冲突", tone: item.tone === "red" ? "red" : "yellow" },
      { label: "排班影响", tone: "yellow" }
    ];
    relatedTags = [
      { label: "关联技师", tone: "blue" },
      { label: "关联班次", tone: "neutral" },
      { label: "需要双方确认", tone: "yellow" }
    ];
    actions = [
      contactInfoAction("approve_shift_swap", "批准换班", "primary"),
      contactInfoAction("run_conflict_detection", "检查订单冲突"),
      contactInfoAction("notify_both_technicians", "通知双方"),
      contactInfoAction("reject_shift_swap", "拒绝换班", "danger", true)
    ];
  } else if (hasContactInfoKeyword(text, ["shortage", "人数不足", "少 3 人", "补位", "补排", "缺口"])) {
    eventTags = [
      { label: "人数不足", tone: "red" },
      { label: "排班系统", tone: "blue" },
      { label: "阻断", tone: "red" }
    ];
    relatedTags = [
      { label: "关联排班周期", tone: "blue" },
      { label: "影响：可预约容量", tone: "yellow" },
      { label: "候补员工", tone: "neutral" }
    ];
    actions = [
      contactInfoAction("find_replacement", "一键补人", "primary"),
      contactInfoAction("notify_waitlist", "通知候补"),
      contactInfoAction("reduce_staff_target", "降低目标人数"),
      contactInfoAction("close_time_slot", "关闭时段"),
      contactInfoAction("force_confirm_shortage", "强制确认不足排班", "danger", true)
    ];
  } else if (hasContactInfoKeyword(text, ["未分配", "未安排", "unassigned", "派单", "dispatch"])) {
    eventTags = [
      { label: "未派单", tone: "yellow" },
      { label: "调度", tone: "blue" },
      { label: "待店铺处理", tone: "yellow" }
    ];
    relatedTags = [
      { label: "关联预约", tone: "blue" },
      { label: "关联技师池", tone: "neutral" },
      { label: "影响：履约开始", tone: "yellow" }
    ];
    actions = [
      contactInfoAction("redispatch_booking", "重新派单", "primary"),
      contactInfoAction("contact_technician", "联系技师"),
      contactInfoAction("find_available_staff", "查找可用技师"),
      contactInfoAction("sync_available_slots", "同步可约时段"),
      contactInfoAction("cancel_booking", "取消预约", "danger", true)
    ];
  } else if (hasContactInfoKeyword(text, ["取消", "退款", "refund", "cancel"])) {
    eventTags = [
      { label: "取消 / 退款", tone: "red" },
      { label: "预约履约", tone: "blue" },
      { label: "需要确认", tone: "yellow" }
    ];
    relatedTags = [
      { label: "关联预约", tone: "blue" },
      { label: "关联财务", tone: "neutral" },
      { label: "影响：可预约容量", tone: "yellow" }
    ];
    actions = [
      contactInfoAction("approve_cancel", "同意取消", "primary"),
      contactInfoAction("reopen_time_slot", "释放时段"),
      contactInfoAction("notify_technician", "通知技师"),
      contactInfoAction("approve_refund", "确认退款", "danger", true)
    ];
  } else if (hasContactInfoKeyword(text, ["通知", "未读", "发送失败", "notification", "外呼"])) {
    eventTags = [
      { label: "通知异常", tone: "yellow" },
      { label: "系统运行", tone: "blue" },
      { label: "需人工跟进", tone: "yellow" }
    ];
    relatedTags = [
      { label: "关联通知任务", tone: "blue" },
      { label: "关联人员", tone: "neutral" },
      { label: "渠道：App / 电话", tone: "yellow" }
    ];
    actions = [
      contactInfoAction("resend_notification", "重新发送", "primary"),
      contactInfoAction("switch_notification_channel", "切换渠道"),
      contactInfoAction("mark_phone_notified", "标记已电话通知"),
      contactInfoAction("view_failure_reason", "查看失败原因")
    ];
  }

  if (item.status === "resolved" && !item.actions?.length) {
    actions = resolvedStatusActions;
  }

  return {
    actions: item.actions?.length ? item.actions : actions,
    eventTags: item.eventTags?.length ? item.eventTags : eventTags,
    relatedTags: item.relatedTags?.length ? item.relatedTags : relatedTags
  };
}

function getStatusPillClassName(status: ContactInfoStatusResolution) {
  if (status === "expired") {
    return "border-[#ef5b55]/28 bg-[#ef5b55]/10 text-[#ef5b55]";
  }

  if (status === "resolved") {
    return "border-[color:color-mix(in_srgb,var(--client-primary)_26%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] text-[color:var(--client-primary)]";
  }

  return "border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] text-[color:var(--client-muted)]";
}

export function getContactInfoTagClassName(tone: ContactInfoStatusTagTone = "neutral") {
  if (tone === "red") {
    return "border-[#ef5b55]/30 bg-[#ef5b55]/10 text-[#ef5b55]";
  }

  if (tone === "yellow") {
    return "border-[#f59e0b]/30 bg-[#f59e0b]/12 text-[#d97706]";
  }

  if (tone === "green") {
    return "border-[color:color-mix(in_srgb,var(--client-primary)_36%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] text-[color:var(--client-primary)]";
  }

  if (tone === "blue") {
    return "border-[#3A8DFF]/28 bg-[#3A8DFF]/10 text-[#3A8DFF]";
  }

  if (tone === "dark") {
    return "border-[color:color-mix(in_srgb,var(--client-text)_18%,transparent)] bg-[color:color-mix(in_srgb,var(--client-text)_10%,transparent)] text-[color:var(--client-text)]";
  }

  return "border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_72%,transparent)] text-[color:var(--client-muted)]";
}

export function getContactInfoActionClassName(tone: ContactInfoStatusActionTone = "secondary") {
  if (tone === "primary") {
    return "border-[color:color-mix(in_srgb,var(--client-primary)_48%,transparent)] bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)] shadow-[0_10px_22px_color-mix(in_srgb,var(--client-primary)_24%,transparent)]";
  }

  if (tone === "danger") {
    return "border-[#ef5b55]/38 bg-[#ef5b55]/12 text-[#ef5b55]";
  }

  return "border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] text-[color:var(--client-text)]";
}

export function ContactInfoActionConfirmDialog({
  action,
  onCancel,
  onConfirm
}: {
  action?: ContactInfoStatusAction | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isDanger = action?.tone === "danger";

  return (
    <ClientActionDialog
      closeOnBackdrop={false}
      description="执行后会写入处理状态，并同步关联预约、排班或通知记录。"
      onClose={onCancel}
      open={Boolean(action)}
      title={action ? `确认执行“${action.label}”？` : "确认执行操作？"}
      actions={
        <div className="grid grid-cols-[0.85fr_1fr] gap-3">
          <button
            className="focus-ring h-11 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] text-sm font-black text-[color:var(--client-text)]"
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          <button
            className={cn(
              "focus-ring h-11 rounded-full text-sm font-black shadow-[0_14px_30px_color-mix(in_srgb,var(--client-shadow)_18%,transparent)]",
              isDanger
                ? "bg-[linear-gradient(180deg,#ff7d72_0%,#f04f47_58%,#df332f_100%)] text-white"
                : "bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)]"
            )}
            onClick={onConfirm}
            type="button"
          >
            确认执行
          </button>
        </div>
      }
      panelClassName="max-w-[360px]"
      placement="center"
    />
  );
}

function getContactInfoDisplayTime(item: ContactInfoStatusItem) {
  return formatContactInfoTimestamp(item.timestampLabel ?? item.dateLabel ?? "-", item.detail);
}

function getContactInfoStatusDetail(item: ContactInfoStatusItem) {
  if (item.status === "resolved") {
    return "该异常信息已完成处理，处理结果已同步到当前业务记录。";
  }

  if (item.status === "expired") {
    return "该异常信息已超过处理窗口，请复核后关闭或重新发起处理。";
  }

  return "该异常信息仍在处理中，等待负责人确认下一步处理结果。";
}

function buildDefaultTimeline(item: ContactInfoStatusItem): ContactInfoStatusTimelineEvent[] {
  if (item.timeline?.length) {
    return item.timeline;
  }

  const atLabel = getContactInfoDisplayTime(item);

  return [
    {
      actorName: item.title,
      actorRole: "异常信息生成",
      atLabel,
      detail: item.detail,
      icon: getContactInfoStatusIcon(item),
      id: `${item.id}-created`,
      message: item.detail,
      operator: item.title,
      title: "异常信息生成",
      tone: isContactInfoBlockingItem(item) ? "red" : "green"
    },
    {
      actorName: "系统",
      actorRole: item.statusLabel,
      atLabel,
      detail: getContactInfoStatusDetail(item),
      id: `${item.id}-status`,
      message: getContactInfoStatusDetail(item),
      operator: "系统",
      title: item.statusLabel,
      tone: item.status === "expired" ? "red" : item.status === "resolved" ? "green" : "neutral"
    }
  ];
}

function ContactInfoStatusDefaultDetail<TItem extends ContactInfoStatusItem>({
  item,
  onAction,
  onClose
}: {
  item: TItem;
  onAction?: (item: TItem, action: ContactInfoStatusAction) => void;
  onClose: () => void;
}) {
  const presentation = resolveContactInfoEventPresentation(item);
  const [executedEvents, setExecutedEvents] = useState<ContactInfoStatusTimelineEvent[]>([]);
  const [pendingConfirmAction, setPendingConfirmAction] = useState<ContactInfoStatusAction | null>(null);
  const timeline = [...buildDefaultTimeline(item), ...executedEvents];
  const executeAction = (action: ContactInfoStatusAction) => {
    onAction?.(item, action);
    setExecutedEvents((current) => [
      ...current,
      {
        actorName: "当前负责人",
        actorRole: action.label,
        atLabel: formatContactInfoTimestamp("刚刚"),
        detail: `已执行推荐动作：${action.label}。系统会把本次处理写入操作日志，并同步关联业务记录。`,
        id: `${item.id}-${action.id}-${current.length}`,
        message: `已执行推荐动作：${action.label}。系统会把本次处理写入操作日志，并同步关联业务记录。`,
        operator: "当前负责人",
        title: action.label,
        tone: action.tone === "danger" ? "red" : "green"
      }
    ]);
  };
  const handleAction = (action: ContactInfoStatusAction) => {
    if (action.disabled) {
      return;
    }

    if (action.requiresConfirm) {
      setPendingConfirmAction(action);
      return;
    }

    executeAction(action);
  };
  const handleConfirmAction = () => {
    if (!pendingConfirmAction) {
      return;
    }

    executeAction(pendingConfirmAction);
    setPendingConfirmAction(null);
  };

  return (
    <MobileFullscreenPage className="z-[95]">
      <MobileFullscreenHeader
        closeLabel="关闭异常信息详情"
        onClose={onClose}
        subtitle={`${getContactInfoDisplayTime(item)} · ${item.statusLabel}`}
        title="异常信息详情"
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-4">
        <section className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,transparent)] p-4 shadow-panel">
          <div className="grid grid-cols-[auto,minmax(0,1fr)] items-start gap-3">
            <span
              className={cn(
                "grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[16px] border text-base font-black",
                item.tone === "red"
                  ? "border-[#ef5b55]/30 bg-[#ef5b55]/12 text-[#ef5b55]"
                  : "border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] text-[color:var(--client-muted)]"
              )}
            >
              {getContactInfoStatusIcon(item)}
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 className="min-w-0 text-base font-black leading-6 text-[color:var(--client-text)]">{item.title}</h3>
                <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black leading-none", getStatusPillClassName(item.status))}>
                  {item.statusLabel}
                </span>
              </div>
              <p className="mt-1 text-[11px] font-medium leading-5 text-[color:var(--client-soft-muted)] tabular-nums">
                {getContactInfoDisplayTime(item)}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm font-bold leading-6 text-[color:var(--client-muted)]">{item.detail}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[...presentation.eventTags, ...presentation.relatedTags].map((tag) => (
              <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black leading-none", getContactInfoTagClassName(tag.tone))} key={`${tag.label}-${tag.tone ?? "neutral"}`}>
                {tag.label}
              </span>
            ))}
          </div>
        </section>

        <ContactEventTimelinePanel
          className="mt-4"
          commentAuthorAvatarSrc={timeline.find((event) => event.actorAvatarSrc)?.actorAvatarSrc}
          events={timeline}
          headerVariant="plain"
          title="处理状态"
        />

        <section className="mt-4 rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-[color:var(--client-text)]">推荐处理</p>
            <span className="rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] px-2.5 py-1 text-[10px] font-black text-[color:var(--client-primary)]">
              {presentation.actions.length} 个动作
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {presentation.actions.map((action) => (
              <button
                aria-label={action.requiresConfirm ? `${action.label}，需要确认` : action.label}
                className={cn(
                  "focus-ring min-h-10 rounded-full border px-3.5 py-2 text-[12px] font-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
                  getContactInfoActionClassName(action.tone)
                )}
                disabled={action.disabled}
                key={action.id}
                onClick={() => handleAction(action)}
                type="button"
              >
                {action.label}
              </button>
            ))}
          </div>
        </section>
      </div>
      <ContactInfoActionConfirmDialog
        action={pendingConfirmAction}
        onCancel={() => setPendingConfirmAction(null)}
        onConfirm={handleConfirmAction}
      />
    </MobileFullscreenPage>
  );
}

function ContactInfoStatusRow<TItem extends ContactInfoStatusItem>({
  item,
  onSelect
}: {
  item: TItem;
  onSelect?: (item: TItem) => void;
}) {
  const content = (
    <>
      <span
        className={cn(
          "grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[18px] border text-base font-black",
          item.tone === "red"
            ? "border-[#ef5b55]/30 bg-[#ef5b55]/12 text-[#ef5b55]"
          : "border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] text-[color:var(--client-muted)]"
        )}
      >
        {getContactInfoStatusIcon(item)}
      </span>
      <span className="min-w-0 self-center">
        <span className="grid min-w-0 grid-cols-[minmax(0,1fr),auto] items-start gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-[17px] font-black leading-tight text-[color:var(--client-text)]">
              {item.title}
            </span>
            <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black leading-none", getStatusPillClassName(item.status))}>
              {item.statusLabel}
            </span>
          </span>
          <span className="max-w-[112px] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap text-right text-[10px] font-medium leading-4 text-[color:var(--client-soft-muted)] tabular-nums">
            {getContactInfoDisplayTime(item)}
          </span>
        </span>
        <span className="mt-1 block text-left text-[13px] font-bold leading-5 text-[color:var(--client-muted)]">
          {item.detail}
        </span>
      </span>
    </>
  );
  const className = "grid w-full grid-cols-[auto,minmax(0,1fr)] items-start gap-4 rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-4 py-4 text-left";

  if (onSelect) {
    return (
      <button className={cn("focus-ring transition active:scale-[0.99]", className)} onClick={() => onSelect(item)} type="button">
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

export function ContactInfoStatusPanel<TItem extends ContactInfoStatusItem>({
  className,
  emptyDateLabel = "-",
  emptyDetail = "当前筛选条件下没有异常信息。",
  emptyIcon = <ContactInfoComputerIcon className="h-6 w-6" />,
  emptyId = "contact-info-empty",
  emptyStatusLabel = "空",
  emptyTitle = "系统信息",
  filter,
  items,
  onAction,
  onFilterChange,
  onSelect,
  title = "异常信息"
}: {
  className?: string;
  emptyDateLabel?: string;
  emptyDetail?: string;
  emptyIcon?: ReactNode;
  emptyId?: string;
  emptyStatusLabel?: string;
  emptyTitle?: string;
  filter: ContactInfoStatusFilter;
  items: TItem[];
  onAction?: (item: TItem, action: ContactInfoStatusAction) => void;
  onFilterChange: (filter: ContactInfoStatusFilter) => void;
  onSelect?: (item: TItem) => void;
  title?: string;
}) {
  const [selectedItem, setSelectedItem] = useState<TItem | null>(null);
  const visibleItems = filter === "all" ? items : items.filter((item) => item.status === filter);
  const handleSelect = (item: TItem) => {
    if (onSelect) {
      onSelect(item);
      return;
    }

    setSelectedItem(item);
  };
  const emptyItem: ContactInfoStatusItem = {
    dateLabel: emptyDateLabel,
    detail: emptyDetail,
    icon: emptyIcon,
    id: emptyId,
    status: "active",
    statusLabel: emptyStatusLabel,
    title: emptyTitle
  };

  return (
    <>
      <section
        className={cn(
          "w-full rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,transparent)] p-4 shadow-panel",
          className
        )}
      >
        <div className="flex items-center gap-3 text-sm">
          <span className="shrink-0 text-[17px] font-black leading-none text-[color:var(--client-text)]">{title}</span>
          <FeatureSegmentedTabs
            className="min-w-0 flex-1"
            items={contactInfoStatusFilterOptions.map((option) => ({
              label: option.label,
              value: option.value
            }))}
            onChange={onFilterChange}
            value={filter}
          />
        </div>
        <div className="mt-4 grid gap-3">
          {visibleItems.length > 0 ? (
            visibleItems.map((item) => <ContactInfoStatusRow item={item} key={item.id} onSelect={handleSelect} />)
          ) : (
            <ContactInfoStatusRow item={emptyItem} />
          )}
        </div>
      </section>
      {selectedItem ? <ContactInfoStatusDefaultDetail item={selectedItem} onAction={onAction} onClose={() => setSelectedItem(null)} /> : null}
    </>
  );
}
