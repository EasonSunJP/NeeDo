import { useMemo, useState } from "react";
import { AppIcon } from "../client-ui/AppScaffold";
import {
  ContactInfoStatusPanel,
  type ContactInfoStatusFilter,
  type ContactInfoStatusItem,
  type ContactInfoStatusResolution
} from "../mobile/ContactInfoStatusPanel";
import { useEntityStore } from "../../state/entityStore";
import {
  addDays,
  dispatchReferenceNow,
  type DispatchCycle,
  type DispatchFloatingTask
} from "../../features/dispatch-center/domain";
import {
  getFloatingTasks,
  useDispatchCenterStore
} from "../../features/dispatch-center/store";

type ScheduleContactStatusResolution = ContactInfoStatusResolution;
type ScheduleContactStatusFilter = ContactInfoStatusFilter;
type ScheduleContactScope = "current" | "next" | "builder";

type ScheduleContactStatusItem = ContactInfoStatusItem & {
  dateKey: string;
  timestampLabel: string;
};

type DateRange = {
  end: string;
  start: string;
};

function ComputerContactIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <rect height="11" rx="2.4" stroke="currentColor" strokeWidth="1.9" width="16" x="4" y="5" />
      <path d="M9 19h6M12 16v3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
    </svg>
  );
}

function formatCompactTimestamp(dateKey: string, hour = 10, minute = 0, second = 0) {
  const [year = "", month = "", day = ""] = dateKey.split("-");
  const date = year && month && day ? `${year.slice(-2)}.${month}.${day}` : dateKey;
  const time = [
    String(hour).padStart(2, "0"),
    String(minute).padStart(2, "0"),
    String(second).padStart(2, "0")
  ].join(":");

  return `${date} ${time}`;
}

function formatScheduleContactDateLabel(dateKey: string) {
  const today = dispatchReferenceNow.slice(0, 10);

  if (dateKey === today) {
    return "今日";
  }

  if (dateKey === addDays(today, 1)) {
    return "明日";
  }

  const [, month = "", day = ""] = dateKey.split("-");

  return month && day ? `${Number(month)}/${Number(day)}` : dateKey;
}

function isDateWithinRange(dateKey: string, startDate: string, endDate: string) {
  return dateKey >= startDate && dateKey <= endDate;
}

function isDateInAnyRange(dateKey: string, ranges: DateRange[]) {
  return ranges.some((range) => isDateWithinRange(dateKey, range.start, range.end));
}

function getDateInRange(startDate: string, endDate: string, offset: number) {
  const dateKey = addDays(startDate, offset);

  return isDateWithinRange(dateKey, startDate, endDate) ? dateKey : startDate;
}

function resolveTaskHour(task: DispatchFloatingTask, fallbackHour: number) {
  if (typeof task.anchorHour === "number") {
    return task.anchorHour;
  }

  if (task.dueAt) {
    return Number(task.dueAt.slice(11, 13)) || fallbackHour;
  }

  return fallbackHour;
}

function resolveTaskStatus(task: DispatchFloatingTask): { status: ScheduleContactStatusResolution; statusLabel: string; tone?: "neutral" | "red" } {
  if (task.dueAt && task.dueAt < dispatchReferenceNow) {
    return { status: "expired", statusLabel: "已过期", tone: "red" };
  }

  return {
    status: "active",
    statusLabel: task.type === "conflict" ? "待处理" : "处理中",
    tone: task.severity === "high" || task.type === "conflict" ? "red" : "neutral"
  };
}

function mapFloatingTaskToContactItem(task: DispatchFloatingTask, index: number): ScheduleContactStatusItem | null {
  const dateKey = task.anchorDate ?? task.dueAt?.slice(0, 10);

  if (!dateKey) {
    return null;
  }

  const taskStatus = resolveTaskStatus(task);
  const hour = resolveTaskHour(task, 12 + index);
  const isApplicationTask = task.type === "feedback" || task.type === "application";

  return {
    dateKey,
    dateLabel: formatScheduleContactDateLabel(dateKey),
    detail: `${task.title}：${task.description}`,
    icon: isApplicationTask ? <AppIcon className="h-5 w-5" name="bell" /> : <ComputerContactIcon />,
    id: task.id,
    status: taskStatus.status,
    statusLabel: taskStatus.statusLabel,
    timestampLabel: formatCompactTimestamp(dateKey, hour),
    title: isApplicationTask ? task.title : "系统信息",
    tone: taskStatus.tone
  };
}

function buildCycleBaseContactItems(cycle: DispatchCycle, storeTechnicians: ReturnType<typeof useEntityStore>["technicians"]) {
  const startDate = cycle.periodStart;
  const endDate = cycle.periodEnd;
  const firstDate = getDateInRange(startDate, endDate, 0);
  const secondDate = getDateInRange(startDate, endDate, 1);
  const primaryTechnician = storeTechnicians[0];
  const secondaryTechnician = storeTechnicians[1] ?? primaryTechnician;

  return [
    {
      dateKey: firstDate,
      dateLabel: formatScheduleContactDateLabel(firstDate),
      detail: "特派任务未分配：自动派单暂无可用技师。 · 12:00-13:30 仍未安排技师。",
      icon: <ComputerContactIcon />,
      id: `${cycle.id}-system-auto-dispatch`,
      status: "active" as const,
      statusLabel: "处理中",
      timestampLabel: formatCompactTimestamp(firstDate, 12),
      title: "系统信息"
    },
    {
      dateKey: firstDate,
      dateLabel: formatScheduleContactDateLabel(firstDate),
      detail: "特派任务未分配：VIP 熟客电话加钟。 · 19:00-20:30 仍未安排技师。",
      icon: <ComputerContactIcon />,
      id: `${cycle.id}-system-vip-extra`,
      status: "active" as const,
      statusLabel: "处理中",
      timestampLabel: formatCompactTimestamp(firstDate, 19),
      title: "系统信息"
    },
    {
      dateKey: firstDate,
      dateLabel: formatScheduleContactDateLabel(firstDate),
      detail: "特派任务未分配：线下 walk-in，需要前台确认床位。 · 20:00-21:30 仍未安排技师。",
      icon: <ComputerContactIcon />,
      id: `${cycle.id}-system-walk-in`,
      status: "active" as const,
      statusLabel: "处理中",
      timestampLabel: formatCompactTimestamp(firstDate, 20),
      title: "系统信息"
    },
	    ...(primaryTechnician
	      ? [
	          {
	            dateKey: firstDate,
	            dateLabel: formatScheduleContactDateLabel(firstDate),
	            detail: `${primaryTechnician.name} 申请 15:00-17:00 临时请假，等待确认。`,
	            icon: primaryTechnician.avatar ? <img alt={primaryTechnician.name} className="h-full w-full rounded-[14px] object-cover" src={primaryTechnician.avatar} /> : <AppIcon className="h-5 w-5" name="calendar" />,
	            id: `${cycle.id}-application-leave-${primaryTechnician.id}`,
            status: "active" as const,
            statusLabel: "处理中",
            timestampLabel: formatCompactTimestamp(firstDate, 9),
            title: "请假申请"
          }
        ]
      : []),
	    ...(secondaryTechnician
	      ? [
	          {
	            dateKey: secondDate,
	            dateLabel: formatScheduleContactDateLabel(secondDate),
	            detail: `${secondaryTechnician.name} 已与 ${primaryTechnician?.name ?? "调班对象"} 确认调班，申请转让 18:00-20:00 班次。`,
	            icon: secondaryTechnician.avatar ? <img alt={secondaryTechnician.name} className="h-full w-full rounded-[14px] object-cover" src={secondaryTechnician.avatar} /> : <AppIcon className="h-5 w-5" name="bell" />,
            id: `${cycle.id}-application-shift-swap-${secondaryTechnician.id}`,
            status: "active" as const,
            statusLabel: "处理中",
            timestampLabel: formatCompactTimestamp(secondDate, 10),
            title: "调班申请"
          }
        ]
      : [])
  ];
}

export function ScheduleContactInfoPanel({
  className,
  cycle,
  excludedRanges = [],
  scope,
  storeId
}: {
  className?: string;
  cycle: DispatchCycle;
  excludedRanges?: DateRange[];
  scope: ScheduleContactScope;
  storeId: string;
}) {
  const [filter, setFilter] = useState<ScheduleContactStatusFilter>("active");
  const dispatchSnapshot = useDispatchCenterStore();
  const { technicians } = useEntityStore();
  const storeTechnicians = useMemo(() => {
    const scoped = technicians.filter((technician) => technician.storeId === storeId);

    return scoped.length > 0 ? scoped : technicians;
  }, [storeId, technicians]);
  const items = useMemo(() => {
    const inCycleRange = (dateKey: string) => isDateWithinRange(dateKey, cycle.periodStart, cycle.periodEnd);
    const matchesScope = (dateKey: string) => {
      if (!inCycleRange(dateKey)) {
        return false;
      }

      return scope === "builder" ? !isDateInAnyRange(dateKey, excludedRanges) : true;
    };
    const baseItems = buildCycleBaseContactItems(cycle, storeTechnicians).filter((item) => matchesScope(item.dateKey));
    const floatingItems = getFloatingTasks(storeId)
      .map(mapFloatingTaskToContactItem)
      .filter((item): item is ScheduleContactStatusItem => Boolean(item))
      .filter((item) => matchesScope(item.dateKey));

    return [...baseItems, ...floatingItems]
      .sort((left, right) => left.timestampLabel.localeCompare(right.timestampLabel))
      .filter((item, index, source) => source.findIndex((candidate) => candidate.id === item.id) === index);
  }, [cycle, dispatchSnapshot.revision, excludedRanges, scope, storeId, storeTechnicians]);
  const emptyDetail =
    scope === "current"
      ? "当前周期内没有符合筛选条件的联系信息。"
      : scope === "next"
        ? "下一周期内没有符合筛选条件的联系信息。"
        : "当前与下一周期以外，暂无未来排班关联联系信息。";

  return (
    <ContactInfoStatusPanel
      className={className}
      emptyDetail={emptyDetail}
      emptyIcon={<ComputerContactIcon />}
      emptyId={`${cycle.id}-contact-empty`}
      filter={filter}
      items={items}
      onFilterChange={setFilter}
    />
  );
}
