import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DetailGrid } from "./DetailGrid";
import { AppIcon, IconButton, type IconName } from "../client-ui/AppScaffold";
import { ScheduleSearchField } from "../scheduling/ScheduleSearchField";
import { UnifiedUserCalendar } from "../scheduling/UnifiedUserCalendar";
import { Badge } from "../ui/Badge";
import { Tabs } from "../ui/Tabs";
import { technicianMoments } from "../../data/mock";
import { buildStaffCompensationRule, calculateStaffCompensation } from "../../lib/staffCompensation";
import { parseBrowserStorageJson, writeBrowserStorage } from "../../lib/browserStorage";
import { cn, yen } from "../../lib/utils";
import { useEntityStore } from "../../state/entityStore";
import { useScheduleStore } from "../../state/scheduleStore";
import type { Technician } from "../../types/domain";

type TechnicianProfileLike = Technician & {
  virtual?: true;
  scenario?: string;
  createdAt?: string;
  enabled?: boolean;
};

type TechnicianProfileContext = "platform" | "merchant";
type StaffDetailTab = "基础资料" | "状态与数据" | "技能与服务" | "排班偏好" | "薪酬设置" | "权限与账号" | "时间线";
type EditableStaffSectionId = "preferences" | "compensation" | "permissions";

const staffDetailTabs: StaffDetailTab[] = ["基础资料", "状态与数据", "技能与服务", "排班偏好", "薪酬设置", "权限与账号", "时间线"];
const staffDetailTabIcons: Record<StaffDetailTab, IconName> = {
  基础资料: "info",
  状态与数据: "eye",
  技能与服务: "star",
  排班偏好: "calendar",
  薪酬设置: "palette",
  权限与账号: "shield",
  时间线: "clock"
};
const staffManagementDraftStorageKey = "needo.merchant-staff-management-drafts.v1";
const compactInputClassName =
  "h-10 w-full rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_84%,transparent)] px-3 text-sm font-bold text-[color:var(--client-text)] outline-none transition focus:border-[color:var(--client-primary)]";
const compactTextareaClassName =
  "min-h-[76px] w-full rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_84%,transparent)] px-3 py-2 text-sm font-bold leading-6 text-[color:var(--client-text)] outline-none transition focus:border-[color:var(--client-primary)]";

type StaffManagementDraft = {
  preferredDays: string;
  blockedDays: string;
  expectedHoursMin: string;
  expectedHoursMax: string;
  restPreference: string;
  holidayRequests: string;
  scheduleConfirmation: string;
  salaryMonthly: string;
  commissionRate: string;
  nominationFeeRate: string;
  bonusAmount: string;
  bonusCondition: string;
  insuranceLabel: string;
  transportAllowancePerVisit: string;
  settlementBasis: string;
  dataScope: string;
  canEditSchedule: "yes" | "review";
  canHandleOrders: "yes" | "paused";
  canExportData: "no" | "limited";
  accountStatus: string;
  rbacNote: string;
};

const statusText: Record<Technician["status"], string> = {
  available: "空闲",
  busy: "服务中",
  off: "休息"
};

const roleText: Record<Technician["role"], string> = {
  storeManager: "店长",
  staff: "门店员工",
  therapist: "护理担当",
  driver: "移动担当",
  cleaner: "清洁担当"
};

const momentStatusText = {
  visible: "展示中",
  reviewing: "审核中",
  hidden: "已隐藏"
};

function getStoreName(stores: ReturnType<typeof useEntityStore>["stores"], storeId: string) {
  return stores.find((store) => store.id === storeId)?.name ?? "未绑定门店";
}

function getStableIndex(value: string) {
  return value.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function formatHours(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}h`;
}

function parseDraftNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseStoredStaffManagementDraft(value: unknown): Partial<StaffManagementDraft> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Partial<StaffManagementDraft>;
}

function readStaffManagementDraft(technicianId: string, fallback: StaffManagementDraft) {
  const saved = parseBrowserStorageJson<Record<string, unknown>>(staffManagementDraftStorageKey, {}, { silent: true });
  const stored = parseStoredStaffManagementDraft(saved[technicianId]);

  return stored ? { ...fallback, ...stored } : fallback;
}

function writeStaffManagementDraft(technicianId: string, draft: StaffManagementDraft) {
  const saved = parseBrowserStorageJson<Record<string, unknown>>(staffManagementDraftStorageKey, {}, { silent: true });
  return writeBrowserStorage(staffManagementDraftStorageKey, JSON.stringify({ ...saved, [technicianId]: draft }), { silent: true });
}

function getSeniorityLabel(technician: TechnicianProfileLike) {
  if (technician.rating >= 4.9 || technician.orderCount >= 900) {
    return "高级";
  }

  if (technician.rating >= 4.8 || technician.orderCount >= 500) {
    return "中级";
  }

  return "成长中";
}

function PanelSection({
  title,
  caption,
  action,
  compact = false,
  children
}: {
  title: string;
  caption?: string;
  action?: ReactNode;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "border shadow-panel",
        compact
          ? "rounded-[24px] border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,var(--client-bg)_16%)] p-4"
          : "rounded-lg border-line bg-white p-4"
      )}
    >
      <div className={cn("flex flex-wrap items-start justify-between gap-3", compact ? "mb-3" : "mb-4")}>
        <div>
          <h4 className={cn("font-black", compact ? "text-[17px] text-[color:var(--client-text)]" : "")}>{title}</h4>
          {caption ? <p className={cn("mt-1 leading-6", compact ? "text-[13px] font-bold text-[color:var(--client-muted)]" : "text-sm text-ink/55")}>{caption}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MetricTiles({ compact = false, items }: { compact?: boolean; items: Array<{ label: string; value: ReactNode; caption?: string; tone?: "green" | "yellow" | "red" | "blue" | "neutral" }> }) {
  return (
    <div className={cn("grid sm:grid-cols-2 xl:grid-cols-4", compact ? "gap-2" : "gap-3")}>
      {items.map((item) => (
        <div
          className={cn(
            "border",
            compact
              ? "rounded-[20px] border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_78%,transparent)] px-3 py-3"
              : "rounded-lg border-line bg-paper p-3"
          )}
          key={item.label}
        >
          <p className={cn("text-xs font-semibold", compact ? "text-[color:var(--client-muted)]" : "text-ink/50")}>{item.label}</p>
          <strong className={cn("mt-1 block font-black", compact ? "text-lg text-[color:var(--client-text)]" : "text-xl text-ink")}>{item.value}</strong>
          {item.caption ? <p className={cn("mt-1 text-xs leading-5", compact ? "text-[color:var(--client-muted)]" : "text-ink/45")}>{item.caption}</p> : null}
          {item.tone ? <span className={`mt-3 block h-1 rounded-full ${item.tone === "green" ? "bg-mint" : item.tone === "yellow" ? "bg-lemon" : item.tone === "red" ? "bg-coral" : item.tone === "blue" ? "bg-sky" : "bg-line"}`} /> : null}
        </div>
      ))}
    </div>
  );
}

function StaffDetailTabBar({
  active,
  compact = false,
  items,
  onChange
}: {
  active: StaffDetailTab;
  compact?: boolean;
  items: StaffDetailTab[];
  onChange: (item: StaffDetailTab) => void;
}) {
  if (compact) {
    return null;
  }

  return <Tabs active={active} items={items} onChange={(item) => onChange(item as StaffDetailTab)} />;
}

function StaffDetailFloatingTabs({
  active,
  compact = false,
  items,
  onChange
}: {
  active: StaffDetailTab;
  compact?: boolean;
  items: StaffDetailTab[];
  onChange: (item: StaffDetailTab) => void;
}) {
  if (!compact) {
    return null;
  }

  return (
    <div className="safe-nav-bottom client-bottom-nav pointer-events-none fixed inset-x-0 bottom-0 z-[76] mx-auto w-full max-w-[480px] px-3 pb-[calc(max(env(safe-area-inset-bottom),12px)+12px)] pt-4" data-merchant-staff-floating-tabs="true">
      <div
        className="client-liquid-glass-nav scrollbar-none pointer-events-auto overflow-x-auto rounded-[22px] border p-1.5 backdrop-blur-2xl"
        data-client-bottom-nav-panel="true"
      >
        <div className="grid min-w-[560px] gap-1" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((item) => {
            const selected = item === active;

            return (
              <button
                aria-current={selected ? "page" : undefined}
                aria-label={item}
                className={cn(
                  "focus-ring pointer-events-auto flex min-h-[50px] flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-bold transition",
                  selected
                    ? "text-[color:var(--client-primary)]"
                    : "text-[color:var(--client-muted)] hover:bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] hover:text-[color:var(--client-text)]"
                )}
                key={item}
                onClick={() => onChange(item)}
                type="button"
              >
                <span
                  className={cn(
                    "mobile-nav-icon relative grid h-6 w-6 place-items-center rounded-full transition",
                    selected ? "text-[color:var(--client-primary)]" : "text-[color:var(--client-muted)]"
                  )}
                >
                  <AppIcon className="h-5 w-5" name={staffDetailTabIcons[item]} />
                </span>
                <span className="leading-tight">{item}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StaffDetailGrid({
  compact = false,
  items
}: {
  compact?: boolean;
  items: Array<{ label: string; value: ReactNode }>;
}) {
  if (!compact) {
    return <DetailGrid items={items} />;
  }

  return (
    <dl className="grid gap-2">
      {items.map((item) => (
        <div
          className="rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_54%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_78%,transparent)] px-3 py-3"
          key={item.label}
        >
          <dt className="text-[12px] font-black text-[color:var(--client-muted)]">{item.label}</dt>
          <dd className="mt-1 text-[15px] font-black leading-6 text-[color:var(--client-text)]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EditablePanelActions({
  editing,
  label,
  onCancel,
  onEdit,
  onSave
}: {
  editing: boolean;
  label: string;
  onCancel: () => void;
  onEdit: () => void;
  onSave: () => void;
}) {
  if (editing) {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <IconButton
          className="h-10 w-10 bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)] shadow-[0_12px_28px_color-mix(in_srgb,var(--client-primary)_24%,transparent)]"
          icon="check"
          label={`保存${label}`}
          onClick={onSave}
        />
        <IconButton
          className="h-10 w-10 text-[color:var(--client-muted)]"
          icon="close"
          label={`取消编辑${label}`}
          onClick={onCancel}
        />
      </div>
    );
  }

  return (
    <IconButton
      className="h-10 w-10 shrink-0 border-[color:color-mix(in_srgb,var(--client-primary)_36%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary-soft)_58%,transparent)] text-[color:var(--client-primary)]"
      icon="edit"
      label={`编辑${label}`}
      onClick={onEdit}
    />
  );
}

function ManagementField({
  children,
  label,
  value,
  wide = false
}: {
  children?: ReactNode;
  label: string;
  value?: ReactNode;
  wide?: boolean;
}) {
  return (
    <label
      className={cn(
        "block rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_54%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_78%,transparent)] px-3 py-3",
        wide && "sm:col-span-2"
      )}
    >
      <span className="text-[12px] font-black text-[color:var(--client-muted)]">{label}</span>
      <span className="mt-1 block">{children ?? <strong className="text-[15px] font-black leading-6 text-[color:var(--client-text)]">{value}</strong>}</span>
    </label>
  );
}

function TagList({ items, emptyLabel = "未设置" }: { items: string[]; emptyLabel?: string }) {
  if (items.length === 0) {
    return <span className="text-sm font-bold text-ink/45">{emptyLabel}</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Badge key={item} tone="neutral">{item}</Badge>
      ))}
    </div>
  );
}

function Timeline({ entries }: { entries: Array<{ title: string; time: string; detail: string; tone?: "green" | "yellow" | "red" | "blue" | "neutral" }> }) {
  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <article className="rounded-lg border border-line bg-paper p-3" key={`${entry.title}-${entry.time}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge tone={entry.tone ?? "neutral"}>{entry.title}</Badge>
              <strong className="text-sm text-ink">{entry.time}</strong>
            </div>
          </div>
          <p className="mt-2 text-sm leading-6 text-ink/60">{entry.detail}</p>
        </article>
      ))}
    </div>
  );
}

function MerchantStaffPersonalCalendar({ technician }: { technician: TechnicianProfileLike }) {
  const [scheduleSearchQuery, setScheduleSearchQuery] = useState("");

  return (
    <div className="space-y-3" data-merchant-staff-personal-calendar="true">
      <div className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_78%,transparent)] p-3">
        <ScheduleSearchField
          ariaLabel="搜索个人排班"
          onChange={setScheduleSearchQuery}
          placeholder="行程搜索"
          value={scheduleSearchQuery}
        />
      </div>
      <div className="overflow-hidden rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_78%,transparent)] p-3">
        <UnifiedUserCalendar
          currentTechnician={technician}
          displayMode="parallel"
          scope="technician"
          searchQuery={scheduleSearchQuery}
        />
      </div>
    </div>
  );
}

export function TechnicianProfilePanel({
  technician,
  context = "platform",
  showSummaryCard = true
}: {
  technician: TechnicianProfileLike;
  context?: TechnicianProfileContext;
  showSummaryCard?: boolean;
}) {
  const { stores } = useEntityStore();
  const { schedules } = useScheduleStore();
  const [activeTab, setActiveTab] = useState<StaffDetailTab>("基础资料");
  const isVirtual = "virtual" in technician && Boolean(technician.virtual);
  const staffLabel = context === "merchant" ? "员工" : "技师";
  const staffIndex = getStableIndex(technician.id);
  const storeName = getStoreName(stores, technician.storeId);
  const moments = isVirtual ? [] : technicianMoments.filter((post) => post.technicianId === technician.id);
  const momentLikes = moments.reduce((sum, post) => sum + post.likes, 0);
  const momentComments = moments.reduce((sum, post) => sum + post.comments.length, 0);
  const staffSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.staffId === technician.id),
    [schedules, technician.id]
  );
  const scheduleHours = staffSchedules.reduce((sum, schedule) => {
    const start = Number(schedule.startTime.split(":")[0]);
    const end = Number(schedule.endTime.split(":")[0]);

    return sum + Math.max(0, end - start);
  }, 0);
  const completedOrders = Math.max(0, Math.round(technician.orderCount * (1 - technician.cancelRate / 100)));
  const canceledOrders = Math.max(1, Math.round(technician.orderCount * (technician.cancelRate / 100)));
  const weekHours = Math.max(18, Math.min(46, scheduleHours + 18 + (staffIndex % 8)));
  const monthHours = weekHours * 4 + (staffIndex % 12);
  const preferredDays = ["月", "火", "水", "木", "金", "土", "日"].filter((_, index) => (index + staffIndex) % 4 !== 0);
  const blockedDays = ["第 2 火曜", "第 4 木曜", "月末日"].slice(0, 1 + (staffIndex % 2));
  const workModes = [
    "可上门",
    technician.role === "cleaner" ? "现场服务" : "可到店",
    technician.status === "off" ? "需提前确认" : "当日确认"
  ];
  const contactProfile = {
    phone: `+81 90-${String(1200 + (staffIndex % 7000)).padStart(4, "0")}-${String(3000 + ((staffIndex * 7) % 6000)).padStart(4, "0")}`,
    line: `needo.${technician.id.replace(/[^a-z0-9-]/gi, "")}.${String(100 + (staffIndex % 900))}`,
    address: `${technician.serviceAreas[0] ?? "东京"} 服务圈 / ${storeName}`,
    emergency: `紧急联系人 ${String.fromCharCode(65 + (staffIndex % 26))} · +81 80-${String(2200 + (staffIndex % 7000)).padStart(4, "0")}-${String(4400 + ((staffIndex * 5) % 5000)).padStart(4, "0")}`,
    joinedAt: `202${2 + (staffIndex % 4)}-${String(1 + (staffIndex % 9)).padStart(2, "0")}-15`,
    credentialExpiresAt: `2027-${String(1 + (staffIndex % 12)).padStart(2, "0")}-28`
  };
  const timelineEntries = [
    {
      title: "资料修改",
      time: "今天 10:24",
      detail: `${staffLabel}更新了联系方式、语言或服务区域，系统已同步到派单资料。`,
      tone: "blue" as const
    },
    {
      title: "排班确认",
      time: "昨天 18:12",
      detail: `确认 ${preferredDays.slice(0, 3).join(" / ")} 可上班，影响下周期自动排班候选池。`,
      tone: "green" as const
    },
    {
      title: "请假",
      time: "4 天前",
      detail: `${blockedDays.join("、")} 已加入不可上班日，排班冲突会提前提示。`,
      tone: "yellow" as const
    },
    {
      title: "转让",
      time: "7 天前",
      detail: "一笔预约完成转让交接，原订单备注、顾客要求和移动时间已留痕。",
      tone: "neutral" as const
    },
    {
      title: "派单拒绝",
      time: "12 天前",
      detail: "拒绝原因：移动时间不足。系统已计入派单质量判断。",
      tone: "red" as const
    },
    {
      title: "奖惩",
      time: "本月",
      detail: `${technician.rating >= 4.9 ? "高评分奖励已计入阶梯奖金。" : "迟到 / 取消记录会进入本月扣罚试算。"}`,
      tone: technician.rating >= 4.9 ? "green" as const : "yellow" as const
    }
  ];
  const compensationPenaltyCount = staffIndex % 4;
  const compensationRule = buildStaffCompensationRule(technician, {
    settlementBasis: context === "merchant" ? "商户后台导出" : "平台财务导出"
  });
  const compensationEstimate = calculateStaffCompensation(compensationRule, {
    salesAmount: technician.income,
    nominatedSalesAmount: Math.round(technician.income * 0.18),
    completedOrders,
    visitCount: Math.round(completedOrders * 0.12),
    penaltyCount: compensationPenaltyCount,
    rating: technician.rating
  });
  const isMerchantMobile = context === "merchant" && !showSummaryCard;
  const canEditManagement = context === "merchant";
  const preferredDaysLabel = preferredDays.join("、");
  const blockedDaysLabel = blockedDays.join("、");
  const baseManagementDraft = useMemo<StaffManagementDraft>(() => ({
    preferredDays: preferredDaysLabel,
    blockedDays: blockedDaysLabel,
    expectedHoursMin: String(weekHours - 4),
    expectedHoursMax: String(weekHours + 6),
    restPreference: staffIndex % 2 === 0 ? "连续休息优先" : "分散休息优先",
    holidayRequests: String(1 + (staffIndex % 3)),
    scheduleConfirmation: technician.status === "off" ? "需店长复核" : "可进入自动排班",
    salaryMonthly: String(compensationRule.salaryMonthly),
    commissionRate: String(compensationRule.commissionRate),
    nominationFeeRate: String(compensationRule.nominationFeeRate),
    bonusAmount: String(compensationRule.bonusAmount),
    bonusCondition: compensationRule.bonusCondition,
    insuranceLabel: compensationRule.insuranceLabel,
    transportAllowancePerVisit: String(compensationRule.transportAllowancePerVisit),
    settlementBasis: compensationRule.settlementBasis,
    dataScope: context === "merchant" ? `${storeName} / 本人订单与排班` : "平台授权范围 / 所属门店数据",
    canEditSchedule: technician.role === "storeManager" || technician.acceptRate >= 95 ? "yes" : "review",
    canHandleOrders: technician.status === "off" ? "paused" : "yes",
    canExportData: context === "merchant" ? "no" : "limited",
    accountStatus: isVirtual ? "测试启用" : "正常",
    rbacNote: "权限变更会写入时间线并同步后台审计。"
  }), [
    blockedDaysLabel,
    compensationRule.bonusAmount,
    compensationRule.bonusCondition,
    compensationRule.commissionRate,
    compensationRule.insuranceLabel,
    compensationRule.nominationFeeRate,
    compensationRule.salaryMonthly,
    compensationRule.settlementBasis,
    compensationRule.transportAllowancePerVisit,
    context,
    isVirtual,
    preferredDaysLabel,
    staffIndex,
    storeName,
    technician.acceptRate,
    technician.role,
    technician.status,
    weekHours
  ]);
  const [savedManagementDraft, setSavedManagementDraft] = useState<StaffManagementDraft>(() => readStaffManagementDraft(technician.id, baseManagementDraft));
  const [managementDraft, setManagementDraft] = useState<StaffManagementDraft>(() => savedManagementDraft);
  const [editingSection, setEditingSection] = useState<EditableStaffSectionId | null>(null);
  const managementValues = editingSection ? managementDraft : savedManagementDraft;
  const compensationPreviewTotal =
    parseDraftNumber(managementValues.salaryMonthly) +
    Math.round(technician.income * (parseDraftNumber(managementValues.commissionRate) / 100)) +
    parseDraftNumber(managementValues.bonusAmount) +
    Math.round(completedOrders * 0.12) * parseDraftNumber(managementValues.transportAllowancePerVisit) -
    compensationEstimate.penaltyAmount;
  const updateManagementDraft = (patch: Partial<StaffManagementDraft>) => {
    setManagementDraft((current) => ({ ...current, ...patch }));
  };
  const startEditingSection = (section: EditableStaffSectionId) => {
    setManagementDraft(savedManagementDraft);
    setEditingSection(section);
  };
  const cancelEditingSection = () => {
    setManagementDraft(savedManagementDraft);
    setEditingSection(null);
  };
  const saveEditingSection = () => {
    setSavedManagementDraft(managementDraft);
    writeStaffManagementDraft(technician.id, managementDraft);
    setEditingSection(null);
  };
  const editableAction = (section: EditableStaffSectionId, label: string) => canEditManagement ? (
    <EditablePanelActions
      editing={editingSection === section}
      label={label}
      onCancel={cancelEditingSection}
      onEdit={() => startEditingSection(section)}
      onSave={saveEditingSection}
    />
  ) : undefined;

  useEffect(() => {
    const nextDraft = readStaffManagementDraft(technician.id, baseManagementDraft);
    setSavedManagementDraft(nextDraft);
    setManagementDraft(nextDraft);
    setEditingSection(null);
  }, [baseManagementDraft, technician.id]);

  return (
    <div className={cn(isMerchantMobile ? "space-y-4" : "space-y-5")}>
      {showSummaryCard ? (
        <section className="rounded-lg bg-ink p-4 text-white">
          <div className="flex gap-4">
            <img alt={technician.name} className="avatar-shape h-24 w-24 object-cover" src={technician.avatar} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={isVirtual ? "yellow" : "green"}>{isVirtual ? "虚拟技师" : `认证${staffLabel}`}</Badge>
                <Badge tone={technician.status === "available" ? "green" : technician.status === "busy" ? "yellow" : "neutral"}>
                  {statusText[technician.status]}
                </Badge>
                {technician.accountUsername ? <Badge tone="blue">测试账号 {technician.accountUsername}</Badge> : null}
              </div>
              <h3 className="mt-3 text-2xl font-black">{technician.nickname ? `${technician.nickname} / ${technician.name}` : technician.name}</h3>
              <p className="mt-2 text-sm text-white/65">
                ID {technician.systemId} · {storeName} · {technician.serviceAreas.join(" / ")}
              </p>
              <p className="mt-2 text-sm font-bold text-[#f5d26b]">★ {technician.rating.toFixed(2)} · {technician.reviewCount.toLocaleString("ja-JP")} 人评价</p>
              <p className="mt-1 text-xs text-white/60">
                接单率 {technician.acceptRate}% · 取消率 {technician.cancelRate}% · {technician.languages.join(" / ")}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <StaffDetailTabBar
        active={activeTab}
        compact={isMerchantMobile}
        items={staffDetailTabs}
        onChange={setActiveTab}
      />
      <StaffDetailFloatingTabs
        active={activeTab}
        compact={isMerchantMobile}
        items={staffDetailTabs}
        onChange={setActiveTab}
      />

      {activeTab === "基础资料" ? (
        <PanelSection compact={isMerchantMobile} title="基础资料" caption="姓名、电话、LINE、地址、eKYC、紧急联系人和入职时间集中管理。">
          <StaffDetailGrid
            compact={isMerchantMobile}
            items={[
              { label: "系统ID", value: technician.systemId },
              { label: "姓名", value: technician.name },
              ...(technician.nickname ? [{ label: "昵称", value: technician.nickname }] : []),
              { label: "所属门店", value: storeName },
              { label: "角色", value: roleText[technician.role] },
              { label: "电话", value: contactProfile.phone },
              { label: "LINE", value: contactProfile.line },
              { label: "地址", value: contactProfile.address },
              { label: "eKYC", value: <Badge tone={isVirtual ? "yellow" : "green"}>{isVirtual ? "虚拟账号免审" : "实名已通过"}</Badge> },
              { label: "证件有效期", value: contactProfile.credentialExpiresAt },
              { label: "紧急联系人", value: contactProfile.emergency },
              { label: "入职时间", value: contactProfile.joinedAt }
            ]}
          />
        </PanelSection>
      ) : null}

      {activeTab === "状态与数据" ? (
        <PanelSection compact={isMerchantMobile} title="状态与数据" caption="今日 / 本周 / 本月工时、接单、完单、取消、评分和迟到，用于运营与排班质量判断。">
          <div className="space-y-4">
            <MetricTiles
              compact={isMerchantMobile}
              items={[
                { label: "今日工时", value: formatHours(Math.max(2, staffSchedules.length + (staffIndex % 3))), caption: "当前已发布班次", tone: "blue" },
                { label: "本周工时", value: formatHours(weekHours), caption: "含已预约与空闲时段", tone: "green" },
                { label: "本月工时", value: formatHours(monthHours), caption: "用于结算和容量预估", tone: "green" },
                { label: "迟到", value: `${staffIndex % 4} 次`, caption: "近 30 天", tone: staffIndex % 4 === 0 ? "neutral" : "yellow" }
              ]}
            />
            <StaffDetailGrid
              compact={isMerchantMobile}
              items={[
                { label: "当前状态", value: <Badge tone={technician.status === "available" ? "green" : technician.status === "busy" ? "yellow" : "neutral"}>{statusText[technician.status]}</Badge> },
                { label: "接单", value: `${technician.orderCount.toLocaleString("ja-JP")} 单` },
                { label: "完单", value: `${completedOrders.toLocaleString("ja-JP")} 单` },
                { label: "取消", value: `${canceledOrders.toLocaleString("ja-JP")} 单 · ${technician.cancelRate}%` },
                { label: "评分", value: `★ ${technician.rating.toFixed(2)} · ${technician.reviewCount.toLocaleString("ja-JP")} 人评价` },
                { label: "接单率", value: `${technician.acceptRate}%` },
                { label: "收入", value: yen(technician.income) },
                { label: "排班质量", value: technician.acceptRate >= 95 && technician.cancelRate <= 2 ? "优先派单" : "需要观察" }
              ]}
            />
          </div>
        </PanelSection>
      ) : null}

      {activeTab === "技能与服务" ? (
        <PanelSection compact={isMerchantMobile} title="技能与服务" caption="可提供服务、熟练等级、可上门 / 到店、语言和可服务区域，影响派单和服务管理。">
          <div className="space-y-4">
            <StaffDetailGrid
              compact={isMerchantMobile}
              items={[
                { label: "熟练等级", value: getSeniorityLabel(technician) },
                { label: "服务方式", value: workModes.join("、") },
                { label: "外语服务", value: technician.canServeForeigners || technician.languages.length > 1 ? "可接待外国客人" : "以日本語为主" },
                { label: "指名预算", value: technician.bidBudgetMin && technician.bidBudgetMax ? `${yen(Number(technician.bidBudgetMin))} - ${yen(Number(technician.bidBudgetMax))}` : "跟随门店标准" }
              ]}
            />
            <div className={cn("grid lg:grid-cols-2", isMerchantMobile ? "gap-2" : "gap-4")}>
              <div className={cn("border", isMerchantMobile ? "rounded-[20px] border-[color:color-mix(in_srgb,var(--client-line)_54%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_78%,transparent)] px-3 py-3" : "rounded-lg border-line bg-paper p-4")}>
                <h5 className="mb-3 text-sm font-black">可提供服务</h5>
                <TagList items={technician.skills} />
              </div>
              <div className={cn("border", isMerchantMobile ? "rounded-[20px] border-[color:color-mix(in_srgb,var(--client-line)_54%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_78%,transparent)] px-3 py-3" : "rounded-lg border-line bg-paper p-4")}>
                <h5 className="mb-3 text-sm font-black">语言</h5>
                <TagList items={technician.languages} />
              </div>
              <div className={cn("border", isMerchantMobile ? "rounded-[20px] border-[color:color-mix(in_srgb,var(--client-line)_54%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_78%,transparent)] px-3 py-3" : "rounded-lg border-line bg-paper p-4")}>
                <h5 className="mb-3 text-sm font-black">可服务区域</h5>
                <TagList items={technician.serviceAreas} />
              </div>
              <div className={cn("border", isMerchantMobile ? "rounded-[20px] border-[color:color-mix(in_srgb,var(--client-line)_54%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_78%,transparent)] px-3 py-3" : "rounded-lg border-line bg-paper p-4")}>
                <h5 className="mb-3 text-sm font-black">员工标签</h5>
                <TagList items={technician.profileTags ?? technician.skills} />
              </div>
            </div>
          </div>
        </PanelSection>
      ) : null}

      {activeTab === "排班偏好" ? (
        <PanelSection
          action={editableAction("preferences", "偏好信息")}
          compact={isMerchantMobile}
          title="排班偏好"
          caption="可上班日、不可上班日、期望工时、休息偏好和提前假期，影响自动 / 智能排班。"
        >
          <div className="space-y-4">
            {editingSection === "preferences" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <ManagementField label="可上班日" wide>
                  <input className={compactInputClassName} onChange={(event) => updateManagementDraft({ preferredDays: event.target.value })} value={managementDraft.preferredDays} />
                </ManagementField>
                <ManagementField label="不可上班日" wide>
                  <input className={compactInputClassName} onChange={(event) => updateManagementDraft({ blockedDays: event.target.value })} value={managementDraft.blockedDays} />
                </ManagementField>
                <ManagementField label="期望工时下限">
                  <input className={compactInputClassName} inputMode="numeric" onChange={(event) => updateManagementDraft({ expectedHoursMin: event.target.value })} value={managementDraft.expectedHoursMin} />
                </ManagementField>
                <ManagementField label="期望工时上限">
                  <input className={compactInputClassName} inputMode="numeric" onChange={(event) => updateManagementDraft({ expectedHoursMax: event.target.value })} value={managementDraft.expectedHoursMax} />
                </ManagementField>
                <ManagementField label="休息偏好">
                  <select className={compactInputClassName} onChange={(event) => updateManagementDraft({ restPreference: event.target.value })} value={managementDraft.restPreference}>
                    <option value="连续休息优先">连续休息优先</option>
                    <option value="分散休息优先">分散休息优先</option>
                  </select>
                </ManagementField>
                <ManagementField label="提前假期">
                  <input className={compactInputClassName} inputMode="numeric" onChange={(event) => updateManagementDraft({ holidayRequests: event.target.value })} value={managementDraft.holidayRequests} />
                </ManagementField>
                <ManagementField label="排班确认" wide>
                  <select className={compactInputClassName} onChange={(event) => updateManagementDraft({ scheduleConfirmation: event.target.value })} value={managementDraft.scheduleConfirmation}>
                    <option value="可进入自动排班">可进入自动排班</option>
                    <option value="需店长复核">需店长复核</option>
                    <option value="仅手动确认">仅手动确认</option>
                  </select>
                </ManagementField>
              </div>
            ) : (
              <StaffDetailGrid
                compact={isMerchantMobile}
                items={[
                  { label: "可上班日", value: managementValues.preferredDays },
                  { label: "不可上班日", value: managementValues.blockedDays },
                  { label: "期望工时", value: `${managementValues.expectedHoursMin} - ${managementValues.expectedHoursMax}h / 周` },
                  { label: "休息偏好", value: managementValues.restPreference },
                  { label: "提前假期", value: `${managementValues.holidayRequests} 件待确认` },
                  { label: "排班确认", value: managementValues.scheduleConfirmation }
                ]}
              />
            )}
            <MerchantStaffPersonalCalendar technician={technician} />
          </div>
        </PanelSection>
      ) : null}

      {activeTab === "薪酬设置" ? (
        <PanelSection
          action={editableAction("compensation", "薪酬设置")}
          compact={isMerchantMobile}
          title="薪酬设置"
          caption="工资、分成、指名料、奖金金额、条件、扣罚和交通补贴会影响结算与导出。"
        >
          {editingSection === "compensation" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <ManagementField label="工资">
                <input className={compactInputClassName} inputMode="numeric" onChange={(event) => updateManagementDraft({ salaryMonthly: event.target.value })} value={managementDraft.salaryMonthly} />
              </ManagementField>
              <ManagementField label="分成">
                <input className={compactInputClassName} inputMode="decimal" onChange={(event) => updateManagementDraft({ commissionRate: event.target.value })} value={managementDraft.commissionRate} />
              </ManagementField>
              <ManagementField label="指名料">
                <input className={compactInputClassName} inputMode="decimal" onChange={(event) => updateManagementDraft({ nominationFeeRate: event.target.value })} value={managementDraft.nominationFeeRate} />
              </ManagementField>
              <ManagementField label="奖金金额">
                <input className={compactInputClassName} inputMode="numeric" onChange={(event) => updateManagementDraft({ bonusAmount: event.target.value })} value={managementDraft.bonusAmount} />
              </ManagementField>
              <ManagementField label="条件" wide>
                <textarea className={compactTextareaClassName} onChange={(event) => updateManagementDraft({ bonusCondition: event.target.value })} value={managementDraft.bonusCondition} />
              </ManagementField>
              <ManagementField label="保险">
                <input className={compactInputClassName} onChange={(event) => updateManagementDraft({ insuranceLabel: event.target.value })} value={managementDraft.insuranceLabel} />
              </ManagementField>
              <ManagementField label="交通补贴">
                <input className={compactInputClassName} inputMode="numeric" onChange={(event) => updateManagementDraft({ transportAllowancePerVisit: event.target.value })} value={managementDraft.transportAllowancePerVisit} />
              </ManagementField>
              <ManagementField label="结算口径" wide>
                <input className={compactInputClassName} onChange={(event) => updateManagementDraft({ settlementBasis: event.target.value })} value={managementDraft.settlementBasis} />
              </ManagementField>
            </div>
          ) : (
            <StaffDetailGrid
              compact={isMerchantMobile}
              items={[
                { label: "工资", value: `${yen(parseDraftNumber(managementValues.salaryMonthly))} / 月` },
                { label: "分成", value: `${managementValues.commissionRate}%` },
                { label: "指名料", value: `${managementValues.nominationFeeRate}%` },
                { label: "奖金金额", value: yen(parseDraftNumber(managementValues.bonusAmount)) },
                { label: "条件", value: managementValues.bonusCondition },
                { label: "保险", value: managementValues.insuranceLabel },
                { label: "扣罚", value: `${compensationPenaltyCount} 件 · ${yen(compensationEstimate.penaltyAmount)} 进入试算` },
                { label: "交通补贴", value: `${yen(parseDraftNumber(managementValues.transportAllowancePerVisit))} / 次上门` },
                { label: "结算口径", value: managementValues.settlementBasis },
                { label: "本月预估", value: yen(Math.max(0, compensationPreviewTotal)) }
              ]}
            />
          )}
        </PanelSection>
      ) : null}

      {activeTab === "权限与账号" ? (
        <PanelSection
          action={editableAction("permissions", "权限设置")}
          compact={isMerchantMobile}
          title="权限与账号"
          caption="角色、可查看数据范围、手动改排班和订单处理权限对应 RBAC 权限控制。"
        >
          {editingSection === "permissions" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <ManagementField label="可查看数据范围" wide>
                <input className={compactInputClassName} onChange={(event) => updateManagementDraft({ dataScope: event.target.value })} value={managementDraft.dataScope} />
              </ManagementField>
              <ManagementField label="是否可手动改排班">
                <select className={compactInputClassName} onChange={(event) => updateManagementDraft({ canEditSchedule: event.target.value as StaffManagementDraft["canEditSchedule"] })} value={managementDraft.canEditSchedule}>
                  <option value="yes">是</option>
                  <option value="review">需店长确认</option>
                </select>
              </ManagementField>
              <ManagementField label="是否可处理订单">
                <select className={compactInputClassName} onChange={(event) => updateManagementDraft({ canHandleOrders: event.target.value as StaffManagementDraft["canHandleOrders"] })} value={managementDraft.canHandleOrders}>
                  <option value="yes">可处理本人订单</option>
                  <option value="paused">暂停处理</option>
                </select>
              </ManagementField>
              <ManagementField label="数据导出">
                <select className={compactInputClassName} onChange={(event) => updateManagementDraft({ canExportData: event.target.value as StaffManagementDraft["canExportData"] })} value={managementDraft.canExportData}>
                  <option value="no">不可导出跨店数据</option>
                  <option value="limited">按运营角色授权</option>
                </select>
              </ManagementField>
              <ManagementField label="账号状态">
                <input className={compactInputClassName} onChange={(event) => updateManagementDraft({ accountStatus: event.target.value })} value={managementDraft.accountStatus} />
              </ManagementField>
              <ManagementField label="RBAC 备注" wide>
                <textarea className={compactTextareaClassName} onChange={(event) => updateManagementDraft({ rbacNote: event.target.value })} value={managementDraft.rbacNote} />
              </ManagementField>
            </div>
          ) : (
            <StaffDetailGrid
              compact={isMerchantMobile}
              items={[
                { label: "角色", value: roleText[technician.role] },
                { label: "联动账号", value: technician.accountUsername ?? "未绑定登录账号" },
                { label: "可查看数据范围", value: managementValues.dataScope },
                { label: "是否可手动改排班", value: managementValues.canEditSchedule === "yes" ? "是" : "需店长确认" },
                { label: "是否可处理订单", value: managementValues.canHandleOrders === "yes" ? "可处理本人订单" : "暂停处理" },
                { label: "数据导出", value: managementValues.canExportData === "no" ? "不可导出跨店数据" : "按运营角色授权" },
                { label: "账号状态", value: <Badge tone={isVirtual ? "yellow" : "green"}>{managementValues.accountStatus}</Badge> },
                { label: "RBAC 备注", value: managementValues.rbacNote }
              ]}
            />
          )}
        </PanelSection>
      ) : null}

      {activeTab === "时间线" ? (
        <div className="space-y-5">
          <PanelSection compact={isMerchantMobile} title="时间线" caption="资料修改、排班确认、请假、转让、派单拒绝和奖惩全链路留痕。">
            <Timeline entries={timelineEntries} />
          </PanelSection>

          <PanelSection compact={isMerchantMobile} title="动态投稿" caption={`查看${staffLabel}在动态里发布过的内容，以及用户点赞和留言反馈。`}>
            <div className="mb-4 grid grid-cols-3 gap-2 text-center text-xs">
              {[
                ["投稿", moments.length],
                ["点赞", momentLikes],
                ["留言", momentComments]
              ].map(([label, value]) => (
                <span className="rounded-lg bg-paper px-3 py-2" key={label}>
                  <strong className="block text-base text-ink">{value}</strong>
                  <span className="text-ink/45">{label}</span>
                </span>
              ))}
            </div>

            <div className="space-y-4">
              {moments.length > 0 ? moments.map((post) => (
                <article className="rounded-lg border border-line bg-paper p-4" key={post.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={post.status === "visible" ? "green" : post.status === "reviewing" ? "yellow" : "neutral"}>
                          {momentStatusText[post.status]}
                        </Badge>
                        <Badge tone="neutral">{post.visibility}</Badge>
                        <span className="text-xs font-bold text-ink/45">{post.postedAt} · {post.location}</span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-ink/75">{post.content}</p>
                    </div>
                    <div className="rounded-lg bg-white px-3 py-2 text-right text-xs shadow-soft">
                      <p className="font-black text-moss">{post.serviceTitle}</p>
                      <p className="mt-1 text-ink/55">{yen(post.servicePrice)} 起</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {post.images.map((image, index) => (
                      <img alt={`${post.technicianName}动态图片${index + 1}`} className="h-24 w-full rounded-lg object-cover" key={`${post.id}-${image}`} src={image} />
                    ))}
                  </div>

                  <div className="mt-3 rounded-lg bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-black text-ink">点赞 {post.likes}</p>
                      <p className="text-xs text-ink/50">{post.likedUsers.join("、")}</p>
                    </div>
                    <div className="mt-3 space-y-2 border-t border-line pt-3">
                      {post.comments.map((comment) => (
                        <div className="rounded-lg bg-paper px-3 py-2" key={comment.id}>
                          <div className="flex items-center justify-between gap-2">
                            <strong className="text-sm text-ink">{comment.userName}</strong>
                            <span className="text-xs text-ink/40">{comment.at}</span>
                          </div>
                          <p className="mt-1 text-sm leading-5 text-ink/65">{comment.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              )) : (
                <div className="rounded-lg bg-paper p-4 text-sm text-ink/55">暂无动态投稿记录。</div>
              )}
            </div>
          </PanelSection>
        </div>
      ) : null}

      {isVirtual ? (
        <section className={cn("border", isMerchantMobile ? "rounded-[24px] border-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,var(--client-bg)_16%)] p-4" : "rounded-lg border-line bg-paper p-4")}>
          <h4 className="font-black">虚拟账号说明</h4>
          <p className="mt-2 text-sm leading-6 text-ink/60">
            场景：{technician.scenario}。虚拟技师用于测试排班、订单链路、冷启动供给和活动展示，不会真实派单给用户。
          </p>
        </section>
      ) : null}
    </div>
  );
}
