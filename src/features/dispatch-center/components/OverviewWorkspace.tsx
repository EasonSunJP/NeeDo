import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MobileFullscreenHeader } from "../../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../../components/mobile/MobileFullscreenPage";
import {
  ContactInfoStatusPanel,
  type ContactInfoStatusFilter,
  type ContactInfoStatusResolution
} from "../../../components/mobile/ContactInfoStatusPanel";
import { AppIcon, ScheduleViewSegmentedTabs, type ScheduleViewSegmentedValue } from "../../../components/client-ui/AppScaffold";
import { Badge, type BadgeTone } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Drawer } from "../../../components/ui/Drawer";
import { TitleWithInfo } from "../../../components/ui/TitleWithInfo";
import { ImChatComposer, type ImChatComposerPanel } from "../../im/components";
import { cn } from "../../../lib/utils";
import { useClientTheme } from "../../../theme/ClientThemeProvider";
import { useEntityStore } from "../../../state/entityStore";
import { ScheduleGrid, scheduleLegendItems, type ScheduleLegendFilter } from "./ScheduleGrid";
import { FloatingActionWindow } from "./FloatingActionWindow";
import { ScheduleCellDetailContent } from "./ScheduleCellDetailContent";
import { SpecialTaskPool } from "./SpecialTaskPool";
import { TodayArrangementTable } from "./TodayArrangementTable";
import { useI18n } from "../../../i18n/I18nProvider";
import { translateText } from "../../../i18n/translations";
import { resolveScheduleEventDetailTarget } from "../../../lib/scheduleDetailTarget";
import { buildCurrentRoute, withReturnTo } from "../../../lib/navigationReturn";
import { addDays, type DispatchFloatingTask } from "../domain";
import { getMerchantScheduleCellPath } from "../paths";
import {
  getDispatchOverviewSummary,
  getDispatchOverviewRangeSummary,
  getDispatchScheduleGrid,
  getFloatingTasks,
  minimizeFloatingTask,
  useDispatchCenterStore,
  type DispatchScheduleCell,
  type DispatchScheduleCellStatus,
  type DispatchScheduleGridData
} from "../store";

function formatCompactPeriodLabel(periodLabel: string) {
  if (periodLabel === "-") {
    return periodLabel;
  }

  const [start = "", end = ""] = periodLabel.split(" - ");
  const [startYear = "", startMonth = "", startDay = ""] = start.split("-");
  const [endYear = "", endMonth = "", endDay = ""] = end.split("-");

  if (!(startMonth && startDay && endMonth && endDay)) {
    return periodLabel;
  }

  if (startYear === endYear) {
    return `${startMonth}.${startDay} - ${endMonth}.${endDay}`;
  }

  return `${startYear.slice(2)}.${startMonth}.${startDay} - ${endYear.slice(2)}.${endMonth}.${endDay}`;
}

function ComputerAvatarIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <rect height="11" rx="2.4" stroke="currentColor" strokeWidth="1.9" width="16" x="4" y="5" />
      <path d="M9 19h6M12 16v3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
    </svg>
  );
}

function RedAlertIcon() {
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#ef4444] text-[13px] font-black leading-none text-white">
      !
    </span>
  );
}

function TechnicianAvatarIcon({ alt, src }: { alt: string; src?: string }) {
  return src ? (
    <img alt={alt} className="h-full w-full rounded-[14px] object-cover" src={src} />
  ) : (
    <span>{alt.slice(0, 1) || "申"}</span>
  );
}

function formatDateDotLabel(dateKey: string) {
  return dateKey.split("-").join(".");
}

function formatDateShortLabel(dateKey: string) {
  const [, month = "", day = ""] = dateKey.split("-");

  return month && day ? `${Number(month)}/${Number(day)}` : dateKey;
}

function formatDateTimeLabel(dateKey: string, hour = 10) {
  const [, month = "", day = ""] = dateKey.split("-");
  const time = `${String(hour).padStart(2, "0")}:00`;

  return month && day ? `${Number(month)}月${Number(day)}日 ${time}` : `${dateKey} ${time}`;
}

function formatCompactDateTimeLabel(dateKey: string, hour = 10, minute = 0, second = 0) {
  const [year = "", month = "", day = ""] = dateKey.split("-");
  const date = year && month && day
    ? `${year.slice(-2)}.${month}.${day}`
    : dateKey;
  const time = [
    String(hour).padStart(2, "0"),
    String(minute).padStart(2, "0"),
    String(second).padStart(2, "0")
  ].join(":");

  return `${date} ${time}`;
}

function isDateWithinRange(dateKey: string, startDate: string, endDate: string) {
  return dateKey >= startDate && dateKey <= endDate;
}

function getDateInRange(startDate: string, endDate: string, offset: number) {
  const dateKey = addDays(startDate, offset);

  return isDateWithinRange(dateKey, startDate, endDate) ? dateKey : startDate;
}

function getTaskTechnicianId(task: DispatchFloatingTask) {
  if (task.type === "feedback") {
    return task.relatedId.split(":")[1] ?? null;
  }

  return null;
}

type ScheduleDetailStatusFilter = "all" | DispatchScheduleCellStatus;

const scheduleDetailStatusFilters: Array<{ label: string; value: ScheduleDetailStatusFilter }> = [
  { label: "全部", value: "all" },
  { label: "可排班", value: "open" },
  { label: "确认班次", value: "confirmed" },
  { label: "已定预约", value: "booked" },
  { label: "冲突 / 待定", value: "conflict" },
  { label: "其他行程", value: "other" }
];

function getCellSearchText(cell: DispatchScheduleCell) {
  return [
    cell.date,
    cell.title,
    cell.detail,
    cell.status,
    ...(cell.dayTimeline?.flatMap((slot) => [slot.title, slot.detail, slot.status]) ?? [])
  ].join(" ");
}

function matchesScheduleStatusFilter(cell: DispatchScheduleCell, filter: ScheduleDetailStatusFilter) {
  if (filter === "all") {
    return true;
  }

  const statuses = [cell.status, ...(cell.dayTimeline?.map((slot) => slot.status) ?? [])];

  if (filter === "conflict") {
    return statuses.some((status) => status === "conflict" || status === "pending");
  }

  return statuses.includes(filter);
}

function filterScheduleGridData(
  data: DispatchScheduleGridData,
  query: string,
  statusFilter: ScheduleDetailStatusFilter
): DispatchScheduleGridData {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery && statusFilter === "all") {
    return data;
  }

  const rows = data.rows.filter((row) => {
    const rowText = [
      row.technicianName,
      row.technicianSubtitle,
      row.technicianId,
      ...row.cells.map(getCellSearchText)
    ].join(" ").toLowerCase();
    const matchesQuery = !normalizedQuery || rowText.includes(normalizedQuery);
    const matchesStatus = statusFilter === "all" || row.cells.some((cell) => matchesScheduleStatusFilter(cell, statusFilter));

    return matchesQuery && matchesStatus;
  });

  return rows.length === data.rows.length ? data : { ...data, rows };
}

type MobileContactStatusItem = {
  id: string;
  actorAvatarSrc?: string;
  actorName: string;
  actorRole: string;
  conflicts?: string[];
  dateKey: string;
  dateLabel: string;
  detail: string;
  detailContent: string;
  icon: ReactNode;
  markerLabel: string;
  occurredAtLabel: string;
  order: number;
  requiresDecision?: boolean;
  status: MobileContactStatusResolution;
  statusLabel: string;
  statusTimeline: MobileContactStatusTimelineEvent[];
  timestampLabel: string;
  template?: {
    calendarRows: MobileContactTemplateCalendarRow[];
    calendarTitle: string;
    conflicts?: string[];
    rows: Array<{ label: string; value: string }>;
    title: string;
  };
  title: string;
  tone?: "neutral" | "red";
};

type MobileContactStatusTimelineEvent = {
  actorAvatarSrc?: string;
  actorName: string;
  actorRole: string;
  atLabel: string;
  conflicts?: string[];
  icon?: ReactNode;
  id: string;
  message: string;
  reason?: string;
  reasonLabel?: string;
  tone?: "neutral" | "red" | "green";
};

type MobileContactTemplateCalendarRow = {
  avatarSrc?: string;
  canFillIn?: boolean;
  fillInLabel?: string;
  id: string;
  mentionName?: string;
  name: string;
  slots: string[];
};

type ContactReplacementFlow = {
  candidateAvatarSrc?: string;
  candidateId: string;
  candidateName: string;
  decision?: "approved" | "rejected";
  requestedMessage?: string;
  response?: "available" | "unavailable";
};

type ContactDecision = "approved" | "rejected";
type MobileContactStatusResolution = ContactInfoStatusResolution;
type MobileContactStatusFilter = ContactInfoStatusFilter;

function getContactRuntimeTimeLabel() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");

  return `${month}月${day}日 ${hour}:${minute}`;
}

function ContactStatusAvatar({
  children,
  name,
  src,
  tone = "neutral"
}: {
  children?: ReactNode;
  name: string;
  src?: string;
  tone?: "neutral" | "red";
}) {
  return (
    <span
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[14px] border text-sm font-black",
        tone === "red"
          ? "border-[#ef5b55]/30 bg-[#ef5b55]/12 text-[#ef5b55]"
          : "border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] text-ink/70"
      )}
    >
      {src ? <img alt={name} className="h-full w-full rounded-[14px] object-cover" src={src} /> : children ?? name.slice(0, 1)}
    </span>
  );
}

function ContactStatusDetailContent({
  extraTimeline,
  item,
  onCandidateResponse,
  onSelectReplacementCandidate,
  replacementFlow
}: {
  extraTimeline: MobileContactStatusTimelineEvent[];
  item: MobileContactStatusItem;
  onCandidateResponse?: (response: "available" | "unavailable") => void;
  onSelectReplacementCandidate?: (row: MobileContactTemplateCalendarRow) => void;
  replacementFlow?: ContactReplacementFlow;
}) {
  const timeline = [...item.statusTimeline, ...extraTimeline];
  const conflicts = item.template?.conflicts ?? item.conflicts ?? [];

  return (
    <div className="grid gap-4">
      <section className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] p-4">
        <div className="grid grid-cols-[auto,minmax(0,1fr)] items-start gap-3">
          <ContactStatusAvatar name={item.actorName} src={item.actorAvatarSrc} tone={item.tone}>
            {item.icon}
          </ContactStatusAvatar>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <h3 className="min-w-0 truncate text-base font-black text-ink">{item.title}</h3>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge tone={item.markerLabel === "请假" || item.markerLabel === "调班" || item.markerLabel === "反馈" ? "blue" : item.tone === "red" ? "red" : "neutral"}>{item.markerLabel}</Badge>
                <Badge tone={item.status === "expired" ? "red" : item.status === "resolved" ? "green" : "yellow"}>{item.statusLabel}</Badge>
              </div>
            </div>
            <p className="mt-1 text-xs font-bold text-ink/45">{item.actorName}（{item.actorRole}）</p>
          </div>
        </div>
        <div className="mt-4 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] px-3 py-3">
          <p className="text-[11px] font-black text-ink/45">发起时间</p>
          <strong className="mt-1 block text-sm font-black text-ink">{item.occurredAtLabel}</strong>
        </div>
      </section>

      <section className="rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)] p-4">
        <p className="text-sm font-black text-ink">详细内容</p>
        {item.template ? (
          <div className="mt-3 grid gap-3">
            <div className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] px-3 py-3">
              <div className="grid gap-2">
                {item.template.rows.map((row) => (
                  <div className="grid grid-cols-[76px,minmax(0,1fr)] gap-2 text-[12px] leading-5" key={row.label}>
                    <span className="font-black text-ink/42">{row.label}</span>
                    <span className="font-bold text-ink/68">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
            {conflicts.length > 0 ? (
              <div className="grid gap-2 rounded-[18px] border border-[#ef4444]/45 bg-[#ef4444]/10 px-3 py-3">
                {conflicts.map((conflict) => (
                  <div className="grid grid-cols-[auto,minmax(0,1fr)] items-start gap-2" key={conflict}>
                    <RedAlertIcon />
                    <p className="text-[12px] font-black leading-5 text-[#ef4444]">{conflict}</p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] px-3 py-3">
              <p className="text-[12px] font-black text-ink">{item.template.calendarTitle}</p>
              <div className="mt-3 grid gap-2">
                {item.template.calendarRows.map((row) => (
                  <div className="grid grid-cols-[38px,minmax(0,1fr)] items-start gap-2.5 rounded-[14px] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-2.5 py-2.5" key={row.id}>
                    <ContactStatusAvatar name={row.name} src={row.avatarSrc}>
                      <span>{row.name.slice(0, 1)}</span>
                    </ContactStatusAvatar>
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-black text-ink">{row.name}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {row.slots.map((slot) => (
                          <span
                            className={cn(
                              "rounded-full px-2 py-1 text-[10px] font-black leading-none",
                              slot.includes("冲突") || slot.includes("超过") || slot.includes("上限")
                                ? "bg-[#ef4444]/12 text-[#ef4444] ring-1 ring-[#ef4444]/35"
                                : slot.includes("请假申请")
                                ? "bg-[color:color-mix(in_srgb,var(--client-primary)_18%,transparent)] text-[color:var(--client-primary)]"
                                : "bg-[color:color-mix(in_srgb,var(--client-line)_42%,transparent)] text-ink/55"
                            )}
                            key={slot}
                          >
                            {slot}
                          </span>
                        ))}
                      </div>
                      {row.canFillIn ? (
                        <button
                          className={cn(
                            "focus-ring mt-2 h-8 rounded-full px-3 text-[11px] font-black transition",
                            replacementFlow?.candidateId === row.id
                              ? "bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)]"
                              : "border border-[color:color-mix(in_srgb,var(--client-primary)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)] text-[color:var(--client-primary)]"
                          )}
                          onClick={() => onSelectReplacementCandidate?.(row)}
                          type="button"
                        >
                          {replacementFlow?.candidateId === row.id ? "已选择补位" : row.fillInLabel ?? "选择补位"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              {replacementFlow ? (
                <div className="mt-3 rounded-[16px] border border-[color:color-mix(in_srgb,var(--client-primary)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_9%,var(--client-elevated)_91%)] px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid min-w-0 grid-cols-[38px,minmax(0,1fr)] items-start gap-2.5">
                      <ContactStatusAvatar name={replacementFlow.candidateName} src={replacementFlow.candidateAvatarSrc}>
                        <span>{replacementFlow.candidateName.slice(0, 1)}</span>
                      </ContactStatusAvatar>
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-black text-ink">补位确认：{replacementFlow.candidateName}</p>
                        <p className="mt-1 text-[11px] font-bold leading-5 text-ink/52">
                          {replacementFlow.requestedMessage ? `已发送：${replacementFlow.requestedMessage}` : "已选择候选人，可在下方输入框继续编辑确认消息。"}
                        </p>
                      </div>
                    </div>
                    <Badge tone={replacementFlow.decision ? (replacementFlow.decision === "approved" ? "green" : "red") : replacementFlow.response ? (replacementFlow.response === "available" ? "green" : "red") : "yellow"}>
                      {replacementFlow.decision
                        ? replacementFlow.decision === "approved" ? "已批准" : "已否决"
                        : replacementFlow.response
                          ? replacementFlow.response === "available" ? "可补位" : "无法补位"
                          : replacementFlow.requestedMessage ? "等待回复" : "待发送"}
                    </Badge>
                  </div>
                  {replacementFlow.requestedMessage && !replacementFlow.response ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        className="focus-ring h-9 rounded-full bg-[color:var(--client-primary)] px-3 text-[12px] font-black text-white"
                        onClick={() => onCandidateResponse?.("available")}
                        type="button"
                      >
                        候选人可补位
                      </button>
                      <button
                        className="focus-ring h-9 rounded-full border border-[#ef5b55]/35 bg-[#ef5b55]/10 px-3 text-[12px] font-black text-[#ef5b55]"
                        onClick={() => onCandidateResponse?.("unavailable")}
                        type="button"
                      >
                        候选人无法补位
                      </button>
                    </div>
                  ) : null}
                  {replacementFlow.response && !replacementFlow.decision ? (
                    <p className="mt-3 rounded-[14px] border border-[color:color-mix(in_srgb,var(--client-primary)_24%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_8%,transparent)] px-3 py-2 text-[11px] font-bold leading-5 text-ink/56">
                      候选人回复后，可使用输入框上方固定处理按钮进行批准或否决。
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm font-bold leading-6 text-ink/60">{item.detailContent}</p>
        )}
      </section>

      <section className="rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)] p-4">
        <p className="text-sm font-black text-ink">处理状态</p>
        <div className="mt-4 grid gap-0">
          {timeline.map((event, index) => (
            <div className="grid grid-cols-[78px,22px,minmax(0,1fr)] gap-3" key={event.id}>
              <div className="pt-1 text-right text-[12px] font-black leading-5 text-ink/45">
                {event.atLabel}
              </div>
              <div className="relative flex justify-center pb-7 pt-1">
                {index > 0 ? (
                  <span className="absolute left-1/2 top-0 h-2 w-px -translate-x-1/2 bg-[color:color-mix(in_srgb,var(--client-primary)_56%,var(--client-line)_44%)]" />
                ) : null}
                {index < timeline.length - 1 ? (
                  <span className="absolute bottom-0 left-1/2 top-[18px] w-px -translate-x-1/2 bg-[color:color-mix(in_srgb,var(--client-primary)_56%,var(--client-line)_44%)]" />
                ) : null}
                <span
                  className={cn(
                    "relative z-[1] h-[14px] w-[14px] rounded-full shadow-[0_0_0_4px_color-mix(in_srgb,var(--client-bg)_86%,transparent)]",
                    event.tone === "red"
                      ? "bg-[#ef4444]"
                      : event.tone === "green"
                        ? "bg-[color:var(--client-primary)]"
                        : "bg-[color:color-mix(in_srgb,var(--client-primary)_78%,var(--client-line)_22%)]"
                  )}
                />
              </div>
              <div className={cn("pb-5", index === timeline.length - 1 && "pb-0")}>
                <div className="grid grid-cols-[40px,minmax(0,1fr)] items-start gap-2.5">
                  <ContactStatusAvatar name={event.actorName} src={event.actorAvatarSrc} tone={event.tone === "red" ? "red" : "neutral"}>
                    {event.icon ?? <span>{event.actorName.slice(0, 1) || "管"}</span>}
                  </ContactStatusAvatar>
                  <div className="min-w-0">
                    <div
                      className={cn(
                        "max-w-full rounded-[18px] rounded-tl-[8px] px-3.5 py-2.5 shadow-[0_10px_24px_rgba(0,0,0,0.08)]",
                        event.tone === "red"
                          ? "border border-[#ef4444]/35 bg-[#ef4444]/10"
                          : "bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,var(--client-primary)_8%)]"
                      )}
                    >
                      <p className={cn("text-[13px] font-black leading-5", event.tone === "red" ? "text-[#ef4444]" : "text-ink")}>
                        <span>{event.actorName}（{event.actorRole}）：</span>
                        <span>{event.message}</span>
                      </p>
                    </div>
                  </div>
                </div>
                {event.conflicts && event.conflicts.length > 0 ? (
                  <div className="mt-2 grid gap-2 pl-[50px]">
                    {event.conflicts.map((conflict) => (
                      <div className="grid grid-cols-[auto,minmax(0,1fr)] items-start gap-2 rounded-[14px] border border-[#ef4444]/45 bg-[#ef4444]/10 px-3 py-2" key={conflict}>
                        <RedAlertIcon />
                        <p className="text-[12px] font-black leading-5 text-[#ef4444]">{conflict}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
                {event.reason ? (
                  <div className="mt-2 grid grid-cols-[34px,minmax(0,1fr)] gap-2 pl-[50px]">
                    <span className={cn("pt-2 text-[11px] font-black", event.tone === "red" ? "text-[#ef4444]" : "text-ink/45")}>
                      {event.reasonLabel ?? "理由"}
                    </span>
                    <p
                      className={cn(
                        "rounded-[14px] border px-3 py-2 text-[12px] font-bold leading-5",
                        event.tone === "red"
                          ? "border-[#ef4444]/45 bg-[#ef4444]/10 text-[#ef4444]"
                          : "border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] text-ink/58"
                      )}
                    >
                      {event.reason}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ContactStatusDecisionBar({
  decision,
  onDecision
}: {
  decision?: ContactDecision;
  onDecision: (decision: ContactDecision) => void;
}) {
  const decisionButtons: Array<{ label: string; value: ContactDecision }> = [
    { label: "批准", value: "approved" },
    { label: "否决", value: "rejected" }
  ];

  return (
    <div className="shrink-0 border-t border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_86%,transparent)] px-4 py-2.5 shadow-[0_-12px_30px_rgba(0,0,0,0.1)] backdrop-blur-xl">
      <div className="mx-auto grid w-full max-w-[360px] grid-cols-2 gap-3">
        {decisionButtons.map((button) => {
          const active = decision === button.value;
          const isReject = button.value === "rejected";

          return (
            <button
              aria-pressed={active}
              className={cn(
                "focus-ring h-10 rounded-full border px-3 text-[13px] font-black transition",
                isReject
                  ? active
                    ? "border-[#ef4444] bg-[#ef4444] text-white shadow-[0_10px_22px_rgba(239,68,68,0.22)]"
                    : "border-[#ef4444]/35 bg-[#ef4444]/10 text-[#ef4444]"
                  : active
                    ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)] shadow-[0_10px_22px_color-mix(in_srgb,var(--client-primary)_28%,transparent)]"
                    : "border-[color:color-mix(in_srgb,var(--client-primary)_36%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_10%,transparent)] text-[color:var(--client-primary)]"
              )}
              key={button.value}
              onClick={() => onDecision(button.value)}
              type="button"
            >
              {button.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DispatchOverviewWorkspace({
  operatorId,
  scheduleStickyTop,
  staffLabel = "技师",
  storeId,
  surface
}: {
  operatorId: string;
  scheduleStickyTop?: string;
  staffLabel?: "技师" | "员工";
  storeId: string;
  surface: "desktop" | "mobile";
}) {
  const { isNight } = useClientTheme();
  const { language } = useI18n();
  const [view, setView] = useState<ScheduleViewSegmentedValue>("day");
  const [dateKey, setDateKey] = useState("2026-04-20");
  const [collapsedTechnicians, setCollapsedTechnicians] = useState(false);
  const [scheduleDetailOpen, setScheduleDetailOpen] = useState(false);
  const [scheduleLegendFilter, setScheduleLegendFilter] = useState<ScheduleLegendFilter | null>(null);
  const [scheduleSearchQuery, setScheduleSearchQuery] = useState("");
  const [scheduleStatusFilter, setScheduleStatusFilter] = useState<ScheduleDetailStatusFilter>("all");
  const [contactReplyDraft, setContactReplyDraft] = useState("");
  const [contactComposerPanel, setContactComposerPanel] = useState<ImChatComposerPanel>(null);
  const [contactReplacementFlows, setContactReplacementFlows] = useState<Record<string, ContactReplacementFlow>>({});
  const [contactStatusExtraTimeline, setContactStatusExtraTimeline] = useState<Record<string, MobileContactStatusTimelineEvent[]>>({});
  const [contactStatusFilter, setContactStatusFilter] = useState<MobileContactStatusFilter>("active");
  const [contactStatusDecisions, setContactStatusDecisions] = useState<Record<string, ContactDecision>>({});
  const [selectedCell, setSelectedCell] = useState<DispatchScheduleCell | null>(null);
  const [selectedContactStatusItem, setSelectedContactStatusItem] = useState<MobileContactStatusItem | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const dispatchSnapshot = useDispatchCenterStore();
  const entitySnapshot = useEntityStore();
  const summary = useMemo(() => getDispatchOverviewSummary(storeId), [dispatchSnapshot.revision, storeId]);
  const isMobileSurface = surface === "mobile";
  const rangeSummary = useMemo(
    () => getDispatchOverviewRangeSummary(storeId, view, dateKey, summary.activeCycle?.id ?? null),
    [dateKey, dispatchSnapshot.revision, storeId, summary.activeCycle?.id, view]
  );
  const shouldRenderScheduleGrid = !isMobileSurface || scheduleDetailOpen;
  const scheduleGrid = useMemo(
    () => shouldRenderScheduleGrid ? getDispatchScheduleGrid(storeId, view, dateKey, summary.activeCycle?.id ?? null) : null,
    [dateKey, dispatchSnapshot.revision, shouldRenderScheduleGrid, storeId, summary.activeCycle?.id, view]
  );
  const detailScheduleGrid = useMemo(
    () => scheduleGrid ? filterScheduleGridData(scheduleGrid, scheduleSearchQuery, scheduleStatusFilter) : null,
    [scheduleGrid, scheduleSearchQuery, scheduleStatusFilter]
  );
  const floatingTasks = useMemo(() => getFloatingTasks(storeId), [dispatchSnapshot.revision, storeId]);
  const activeTechnicians = useMemo(() => {
    const scoped = entitySnapshot.technicians.filter((technician) => technician.storeId === storeId);

    return scoped.length > 0 ? scoped : entitySnapshot.technicians;
  }, [entitySnapshot.technicians, storeId]);
  const technicianById = useMemo(
    () => new Map(entitySnapshot.technicians.map((technician) => [technician.id, technician])),
    [entitySnapshot.technicians]
  );
  const currentStore = useMemo(
    () => entitySnapshot.stores.find((store) => store.id === storeId) ?? entitySnapshot.stores[0],
    [entitySnapshot.stores, storeId]
  );
  const sectionClass = isMobileSurface
    ? "border-line bg-white/90 shadow-panel backdrop-blur-xl"
    : "merchant-dispatch-surface";
  const cardClass = isMobileSurface ? "border-line bg-white/80" : "merchant-dispatch-card";
  const labelTextClass = isMobileSurface ? "text-ink/45" : "text-ink/45";
  const fieldClass = isMobileSurface ? "border-line bg-white/80 text-ink" : "merchant-dispatch-field";
  const staffScheduleLabel = staffLabel === "员工" ? "排班员工" : "排班技师";
  const scheduleOverviewInfo = isMobileSurface
    ? "概要页只保留关键状态，完整周期排班表进入详细页查看。"
    : "先看状态摘要，再处理 24 小时排班表、今日预约安排和特派任务池。后台与商户端都走同一套排班数据。";

  const openDateSchedule = (nextDateKey: string) => {
    setDateKey(nextDateKey);
    setView("day");
    setSelectedCell(null);
  };

  useEffect(() => {
    const state = location.state && typeof location.state === "object"
      ? location.state as { reopenScheduleDetail?: boolean }
      : null;

    if (!isMobileSurface || !state?.reopenScheduleDetail) {
      return;
    }

    setScheduleDetailOpen(true);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [isMobileSurface, location.pathname, location.search, location.state, navigate]);

  const openCellDetail = (cell: DispatchScheduleCell) => {
    if (cell.hour == null && view !== "day") {
      openDateSchedule(cell.date);
      return;
    }

    const target = resolveScheduleEventDetailTarget(cell, surface === "desktop" ? "merchant-admin" : "merchant");
    if (target.action === "open" && target.targetType === "order_detail") {
      const returnTo = buildCurrentRoute(location);
      navigate(withReturnTo(target.route, returnTo), {
        state: {
          returnState: isMobileSurface && scheduleDetailOpen ? { reopenScheduleDetail: true } : undefined,
          returnTo
        }
      });
      return;
    }

    if (isMobileSurface) {
      navigate(getMerchantScheduleCellPath(cell));
      return;
    }

    setSelectedCell(cell);
  };

  const overviewCards: Array<{
    label: string;
    value: string;
    tone: BadgeTone;
  }> = [
    { label: "排班人员", value: rangeSummary.technicianCountLabel, tone: "neutral" },
    { label: "确定天数", value: rangeSummary.confirmedDayLabel, tone: "blue" },
    { label: "确定订单", value: rangeSummary.confirmedOrderLabel, tone: "green" }
  ];
  const mobileContactStatusItems = useMemo<MobileContactStatusItem[]>(() => {
    if (!isMobileSurface || !rangeSummary.effectiveStartDate || !rangeSummary.effectiveEndDate) {
      return [];
    }

    const startDate = rangeSummary.effectiveStartDate;
    const endDate = rangeSummary.effectiveEndDate;
    const isInRange = (date?: string | null) => !date || isDateWithinRange(date, startDate, endDate);
    const adminActorName = "管理员";
    const adminAvatarSrc = currentStore?.cover;
    const shortageDate = getDateInRange(startDate, endDate, 0);
    const weatherDate = getDateInRange(startDate, endDate, 1);
    const cancelledDate = getDateInRange(startDate, endDate, 2);
    const getApplicationResolution = (id: string): { status: MobileContactStatusResolution; statusLabel: string } =>
      contactStatusDecisions[id] ? { status: "resolved", statusLabel: "已处理" } : { status: "active", statusLabel: "处理中" };
    const statusItems: MobileContactStatusItem[] = [
      {
        actorName: "系统",
        actorRole: "系统信息",
        dateKey: shortageDate,
        dateLabel: formatDateShortLabel(shortageDate),
        detail: "晚间高峰技师少 3 人，已补位解决。",
        detailContent: `${formatDateDotLabel(shortageDate)} 晚间高峰技师少 3 人，已从兼职池补位并同步到排班表。`,
        icon: <ComputerAvatarIcon />,
        id: "system-shortage",
        markerLabel: "系统信息",
        occurredAtLabel: formatDateTimeLabel(shortageDate, 9),
        order: 10,
        status: "resolved",
        statusLabel: "已解决",
        statusTimeline: [
          {
            actorAvatarSrc: adminAvatarSrc,
            actorName: adminActorName,
            actorRole: "管理员",
            atLabel: formatDateTimeLabel(shortageDate, 9),
            id: "system-shortage-confirming",
            message: "确认信息中"
          },
          {
            actorAvatarSrc: adminAvatarSrc,
            actorName: adminActorName,
            actorRole: "管理员",
            atLabel: formatDateTimeLabel(shortageDate, 10),
            id: "system-shortage-followup",
            message: "已标记为需要补位",
            reason: "晚间预约密度高于当前排班承载。"
          }
        ],
        timestampLabel: formatCompactDateTimeLabel(shortageDate, 9),
        title: "系统信息",
        tone: "neutral"
      },
      {
        actorName: "系统",
        actorRole: "系统信息",
        dateKey: weatherDate,
        dateLabel: formatDateShortLabel(weatherDate),
        detail: "天气情况有变，外勤调整建议已过期。",
        detailContent: `${formatDateDotLabel(weatherDate)} 天气情况有变，系统曾建议减少 2 名外勤技师；该建议已过处理窗口。`,
        icon: <ComputerAvatarIcon />,
        id: "system-weather",
        markerLabel: "系统信息",
        occurredAtLabel: formatDateTimeLabel(weatherDate, 11),
        order: 20,
        status: "expired",
        statusLabel: "已过期",
        statusTimeline: [
          {
            actorAvatarSrc: adminAvatarSrc,
            actorName: adminActorName,
            actorRole: "管理员",
            atLabel: formatDateTimeLabel(weatherDate, 11),
            id: "system-weather-confirming",
            message: "确认信息中"
          },
          {
            actorAvatarSrc: adminAvatarSrc,
            actorName: adminActorName,
            actorRole: "管理员",
            atLabel: formatDateTimeLabel(weatherDate, 12),
            id: "system-weather-adjusted",
            message: "已调整外勤预留人数",
            reason: "天气影响移动效率，保留弹性缓冲。"
          }
        ],
        timestampLabel: formatCompactDateTimeLabel(weatherDate, 11),
        title: "系统信息",
        tone: "red"
      },
      {
        actorName: "系统",
        actorRole: "系统信息",
        dateKey: cancelledDate,
        dateLabel: formatDateShortLabel(cancelledDate),
        detail: "有客人取消订单，已释放对应预约时段。",
        detailContent: `${formatDateDotLabel(cancelledDate)} 有客人取消订单，对应预约时段已释放，可重新分配给待确认订单。`,
        icon: <ComputerAvatarIcon />,
        id: "system-cancelled-order",
        markerLabel: "系统信息",
        occurredAtLabel: formatDateTimeLabel(cancelledDate, 13),
        order: 30,
        status: "resolved",
        statusLabel: "已解决",
        statusTimeline: [
          {
            actorAvatarSrc: adminAvatarSrc,
            actorName: adminActorName,
            actorRole: "管理员",
            atLabel: formatDateTimeLabel(cancelledDate, 13),
            id: "system-cancel-confirming",
            message: "确认信息中"
          },
          {
            actorAvatarSrc: adminAvatarSrc,
            actorName: adminActorName,
            actorRole: "管理员",
            atLabel: formatDateTimeLabel(cancelledDate, 14),
            id: "system-cancel-released",
            message: "已释放预约时段",
            reason: "订单取消后不再占用该技师时间。"
          }
        ],
        timestampLabel: formatCompactDateTimeLabel(cancelledDate, 13),
        title: "系统信息",
        tone: "neutral"
      }
    ];

    const shiftSwapTechnician = activeTechnicians[1] ?? activeTechnicians[0];
    const shiftSwapTarget = activeTechnicians.find((technician) =>
      technician.id !== shiftSwapTechnician?.id && technician.id !== activeTechnicians[0]?.id
    ) ?? activeTechnicians.find((technician) => technician.id !== shiftSwapTechnician?.id);
    const applicationExamples = [
      {
        dateKey: getDateInRange(startDate, endDate, 0),
        description: "申请 15:00-17:00 临时请假，等待确认。",
        id: "leave",
        markerLabel: "请假",
        targetTechnician: undefined,
        technician: activeTechnicians[0],
        title: "请假申请"
      },
      {
        dateKey: getDateInRange(startDate, endDate, 1),
        description: `已与 ${shiftSwapTarget?.name ?? "调班对象"} 确认调班，申请转让 18:00-20:00 班次。`,
        id: "shift-swap",
        markerLabel: "调班",
        targetTechnician: shiftSwapTarget,
        technician: shiftSwapTechnician,
        title: "调班申请"
      }
    ];

    applicationExamples.forEach((item, index) => {
      if (!item.technician || !isInRange(item.dateKey)) {
        return;
      }

      const itemId = `application-${item.id}-${item.technician.id}`;
      const applicationResolution = getApplicationResolution(itemId);
      const isShiftSwap = item.id === "shift-swap";
      const shiftWindow = isShiftSwap ? "18:00-20:00" : "15:00-17:00";
      const shiftDateLabel = formatDateDotLabel(item.dateKey);
      const targetTechnician = isShiftSwap ? item.targetTechnician : undefined;
      const conflicts = isShiftSwap
        ? [
            `${targetTechnician?.name ?? "调班对象"} ${shiftWindow} 已有预约，不能直接承接。`,
            `${targetTechnician?.name ?? "调班对象"} 调班后当日连续上班 10 小时，超过 8 小时上限。`
          ]
        : ["该时段已有已确认订单，暂时无法减少出勤人数。"];
      const statusTimeline: MobileContactStatusTimelineEvent[] = isShiftSwap
        ? [
            {
              actorAvatarSrc: item.technician.avatar,
              actorName: item.technician.name,
              actorRole: "发起技师",
              atLabel: formatDateTimeLabel(item.dateKey, 10 + index),
              id: `${itemId}-transferred`,
              message: `${item.technician.name} 转让了 ${shiftDateLabel} ${shiftWindow} 的排班给 ${targetTechnician?.name ?? "调班对象"}`
            },
            {
              actorName: "系统",
              actorRole: "系统校验",
              atLabel: formatDateTimeLabel(item.dateKey, 11 + index),
              conflicts,
              icon: <ComputerAvatarIcon />,
              id: `${itemId}-system-check`,
              message: conflicts.length > 0 ? "有冲突：调班对象暂时无法直接承接" : "无冲突，可进入处理",
              tone: conflicts.length > 0 ? "red" : "green"
            }
          ]
        : [
            {
              actorAvatarSrc: item.technician.avatar,
              actorName: item.technician.name,
              actorRole: "发起技师",
              atLabel: formatDateTimeLabel(item.dateKey, 10 + index),
              id: `${itemId}-submitted`,
              message: `${item.technician.name} 提交了 ${shiftDateLabel} ${shiftWindow} 的请假申请`
            },
            {
              actorName: "系统",
              actorRole: "系统校验",
              atLabel: formatDateTimeLabel(item.dateKey, 11 + index),
              conflicts,
              icon: <ComputerAvatarIcon />,
              id: `${itemId}-system-check`,
              message: conflicts.length > 0 ? "有冲突：请假时段影响已确认预约" : "无冲突，可进入处理",
              tone: conflicts.length > 0 ? "red" : "green"
            }
          ];

      statusItems.push({
        actorAvatarSrc: item.technician.avatar,
        actorName: item.technician.name,
        actorRole: "技师",
        conflicts,
        dateKey: item.dateKey,
        dateLabel: formatDateShortLabel(item.dateKey),
        detail: `${item.technician.name} ${item.description}`,
        detailContent: `${item.technician.name} 发起${item.title}：${item.description}`,
        icon: <TechnicianAvatarIcon alt={item.technician.name} src={item.technician.avatar} />,
        id: itemId,
        markerLabel: item.markerLabel,
        occurredAtLabel: formatDateTimeLabel(item.dateKey, 9 + index),
        order: 100 + index,
        requiresDecision: true,
        status: applicationResolution.status,
        statusLabel: applicationResolution.statusLabel,
        statusTimeline,
        timestampLabel: formatCompactDateTimeLabel(item.dateKey, 9 + index),
        template: item.id === "leave"
          ? {
              calendarRows: activeTechnicians.slice(0, 5).map((technician, technicianIndex) => {
                const slots = technician.id === item.technician.id
                  ? ["10:00-14:00 已排班", "15:00-17:00 请假申请", "18:00-20:00 待确认"]
                  : technicianIndex % 3 === 0
                    ? ["10:00-16:00 已排班", "17:00-20:00 可补位"]
                    : technicianIndex % 3 === 1
                      ? ["12:00-18:00 已定预约", "19:00-21:00 已排班"]
                      : ["休息", "18:00-22:00 可支援"];
                const canFillIn = technician.id !== item.technician.id && slots.some((slot) => slot.includes("可补位") || slot.includes("可支援"));

                return {
                  avatarSrc: technician.avatar,
                  canFillIn,
                  fillInLabel: canFillIn ? "选择补位" : undefined,
                  id: technician.id,
                  mentionName: technician.name,
                  name: technician.nickname ? `${technician.nickname} / ${technician.name}` : technician.name,
                  slots
                };
              }),
              calendarTitle: "引用日历：店铺端查看当天所有技师安排",
              conflicts,
              rows: [
                { label: "申请时段", value: `${formatDateDotLabel(item.dateKey)} 15:00-17:00` },
                { label: "申请理由", value: "临时私事，需要离开店铺 2 小时。" }
              ],
              title: "请假内容"
            }
          : {
              calendarRows: activeTechnicians.slice(0, 5).map((technician, technicianIndex) => {
                const isApplicant = technician.id === item.technician.id;
                const isTarget = technician.id === targetTechnician?.id;
                const slots = isApplicant
                  ? ["14:00-18:00 已排班", `${shiftWindow} 调班转出`]
                  : isTarget
                    ? ["16:00-18:00 已排班", `${shiftWindow} 已定预约（冲突）`, "20:00-22:00 超过上限（冲突）"]
                    : technicianIndex % 2 === 0
                      ? ["10:00-16:00 已排班", "18:00-20:00 可支援"]
                      : ["休息", "18:00-22:00 可排班"];

                return {
                  avatarSrc: technician.avatar,
                  canFillIn: false,
                  id: technician.id,
                  mentionName: technician.name,
                  name: technician.nickname ? `${technician.nickname} / ${technician.name}` : technician.name,
                  slots
                };
              }),
              calendarTitle: "引用日历：店铺端查看当天所有技师安排",
              conflicts,
              rows: [
                { label: "原班次", value: `${shiftDateLabel} ${shiftWindow}` },
                { label: "发起技师", value: item.technician.name },
                { label: "调班对象", value: targetTechnician?.name ?? "未指定" },
                { label: "申请理由", value: "发起技师已先找到调班对象，双方同意由对方承接该班次。" }
              ],
              title: "调班内容"
            },
          title: item.title,
        });
      });

    floatingTasks.forEach((task) => {
      const taskDate = task.anchorDate ?? startDate;

      if (!isInRange(taskDate)) {
        return;
      }

      const technicianId = getTaskTechnicianId(task);
      const technician = technicianId ? technicianById.get(technicianId) : undefined;
        const isApplicationTask = task.type === "feedback" || task.type === "application";
        const dateLabel = formatDateDotLabel(taskDate);
        const taskHour = task.anchorHour ?? (isApplicationTask ? 10 : 9);
        const actorName = isApplicationTask ? technician?.name ?? task.title : "系统";
        const taskDecision = contactStatusDecisions[task.id];
        const taskStatus: MobileContactStatusResolution = taskDecision ? "resolved" : "active";

        statusItems.push({
          actorAvatarSrc: isApplicationTask ? technician?.avatar : undefined,
          actorName,
          actorRole: isApplicationTask ? "技师" : "系统信息",
        dateKey: taskDate,
        dateLabel: formatDateShortLabel(taskDate),
        detail: `${task.title}：${task.description}`,
        detailContent: `${dateLabel} ${task.title}：${task.description}`,
        icon: isApplicationTask
          ? <TechnicianAvatarIcon alt={technician?.name ?? task.title} src={technician?.avatar} />
          : <ComputerAvatarIcon />,
        id: task.id,
          markerLabel: task.type === "feedback" ? "反馈" : task.type === "application" ? "申请" : "系统信息",
          occurredAtLabel: formatDateTimeLabel(taskDate, taskHour),
          order: isApplicationTask ? 140 : task.type === "conflict" ? 40 : 60,
          requiresDecision: isApplicationTask,
          status: task.type === "conflict" ? "active" : taskStatus,
        statusLabel: task.type === "conflict" ? "待处理" : taskDecision ? "已处理" : "处理中",
        statusTimeline: isApplicationTask
          ? [
              {
                actorAvatarSrc: adminAvatarSrc,
                actorName: adminActorName,
                actorRole: "管理员",
                atLabel: formatDateTimeLabel(taskDate, Math.min(taskHour + 1, 23)),
                id: `${task.id}-confirming`,
                message: "确认信息中"
              },
              {
                actorAvatarSrc: adminAvatarSrc,
                actorName: adminActorName,
                actorRole: "管理员",
                atLabel: formatDateTimeLabel(taskDate, Math.min(taskHour + 2, 23)),
                id: `${task.id}-rejected`,
                message: "否决了该申请",
                reason: "当前周期排班已进入确认阶段，需要技师重新提交可替代时段。"
              }
            ]
          : [
              {
                actorAvatarSrc: adminAvatarSrc,
                actorName: adminActorName,
                actorRole: "管理员",
                atLabel: formatDateTimeLabel(taskDate, Math.min(taskHour + 1, 23)),
                id: `${task.id}-confirming`,
                message: "确认信息中"
              },
              {
                actorAvatarSrc: adminAvatarSrc,
                actorName: adminActorName,
                actorRole: "管理员",
                atLabel: formatDateTimeLabel(taskDate, Math.min(taskHour + 2, 23)),
                id: `${task.id}-handled`,
                message: task.type === "conflict" ? "已转入冲突处理" : "已转入待处理",
                reason: task.description
              }
            ],
        timestampLabel: formatCompactDateTimeLabel(taskDate, taskHour),
        title: isApplicationTask ? task.title : "系统信息",
        tone: task.type === "conflict" ? "red" : "neutral",
      });
    });

    return statusItems.sort((left, right) => {
      const dateDelta = left.dateKey.localeCompare(right.dateKey);

      return dateDelta !== 0 ? dateDelta : left.order - right.order;
    });
  }, [
    activeTechnicians,
    contactStatusDecisions,
    currentStore?.cover,
    floatingTasks,
    isMobileSurface,
    rangeSummary.effectiveEndDate,
    rangeSummary.effectiveStartDate,
    technicianById
  ]);
  const currentSelectedContactStatusItem = selectedContactStatusItem
    ? mobileContactStatusItems.find((item) => item.id === selectedContactStatusItem.id) ?? selectedContactStatusItem
    : null;
  const cards: Array<{
    label: string;
    value: string;
    tone: BadgeTone;
    mobileTag: string;
    mobileValue?: string;
    mobileValueClassName?: string;
  }> = [
    ...(isMobileSurface
      ? [
          {
            label: "生效时间",
            value: summary.effectiveTimeLabel,
            tone: "blue" as const,
            mobileTag: "生效",
            mobileValueClassName: "text-[18px] leading-[1.15]"
          },
          {
            label: "排班员工人数",
            value: `${summary.technicianCount} 人`,
            tone: "neutral" as const,
            mobileTag: staffLabel
          },
          {
            label: "已确定天数",
            value: summary.confirmedDayLabel,
            tone: "blue" as const,
            mobileTag: "天数"
          },
          {
            label: "确定订单数",
            value: summary.confirmedArrangementLabel,
            tone: "green" as const,
            mobileTag: "订单"
          },
          {
            label: "申请件数",
            value: summary.applicationCountLabel,
            tone: "red" as const,
            mobileTag: "申请"
          }
        ]
      : [
          {
            label: "当前排班模式",
            value: summary.currentModeLabel,
            tone: "neutral" as const,
            mobileTag: "模式",
            mobileValueClassName: "text-[20px]"
          },
          {
            label: "生效期间",
            value: summary.activePeriodLabel,
            tone: "blue" as const,
            mobileTag: "周期",
            mobileValue: formatCompactPeriodLabel(summary.activePeriodLabel),
            mobileValueClassName: "text-[18px] leading-[1.15]"
          },
          {
            label: staffScheduleLabel,
            value: `${summary.technicianCount} 人`,
            tone: "neutral" as const,
            mobileTag: staffLabel
          },
          {
            label: "已确定天数",
            value: summary.confirmedDayLabel,
            tone: "blue" as const,
            mobileTag: "排班"
          },
          {
            label: "确定预约订单",
            value: summary.confirmedArrangementLabel,
            tone: "green" as const,
            mobileTag: "预约"
          },
          {
            label: "申请件数",
            value: summary.applicationCountLabel,
            tone: "red" as const,
            mobileTag: "申请"
          }
        ])
  ];
  const focusTask = (task: DispatchFloatingTask) => {
    if (task.anchorDate) {
      setDateKey(task.anchorDate);
      setView("day");
    }

    if (task.anchorHour != null && task.anchorDate) {
      const targetGrid = getDispatchScheduleGrid(storeId, "day", task.anchorDate, summary.activeCycle?.id ?? null);
      const relatedRow = targetGrid.rows.find((row) =>
        row.cells.some((cell) => cell.date === task.anchorDate && cell.hour === task.anchorHour)
      );
      const relatedCell = relatedRow?.cells.find((cell) => cell.date === task.anchorDate && cell.hour === task.anchorHour) ?? null;

      if (relatedCell) {
        openCellDetail(relatedCell);
      }
    }
  };
  const addContactStatusTimelineEvent = (itemId: string, event: Omit<MobileContactStatusTimelineEvent, "id" | "atLabel"> & { atLabel?: string }) => {
    setContactStatusExtraTimeline((current) => ({
      ...current,
      [itemId]: [
        ...(current[itemId] ?? []),
        {
          ...event,
          atLabel: event.atLabel ?? getContactRuntimeTimeLabel(),
          id: `${itemId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        }
      ]
    }));
  };
  const selectReplacementCandidate = (row: MobileContactTemplateCalendarRow) => {
    if (!selectedContactStatusItem || !row.canFillIn) {
      return;
    }

    const candidateName = row.mentionName ?? row.name.split(" / ").pop() ?? row.name;
    const mention = `@${candidateName}`;

    setContactReplacementFlows((current) => ({
      ...current,
      [selectedContactStatusItem.id]: {
        candidateAvatarSrc: row.avatarSrc,
        candidateId: row.id,
        candidateName
      }
    }));
    setContactReplyDraft((current) => {
      if (current.includes(mention)) {
        return current;
      }

      return current.trim() ? `${current.trimEnd()} ${mention} ` : `${mention} 请确认是否可以补位`;
    });
  };
  const sendContactReply = () => {
    if (!selectedContactStatusItem || !contactReplyDraft.trim()) {
      return;
    }

    const message = contactReplyDraft.trim();
    const flow = contactReplacementFlows[selectedContactStatusItem.id];

    addContactStatusTimelineEvent(selectedContactStatusItem.id, {
      actorAvatarSrc: currentStore?.cover,
      actorName: "管理员",
      actorRole: "管理员",
      message
    });

    if (flow) {
      setContactReplacementFlows((current) => ({
        ...current,
        [selectedContactStatusItem.id]: {
          ...flow,
          requestedMessage: message
        }
      }));
    }

    setContactReplyDraft("");
    setContactComposerPanel(null);
  };
  const recordCandidateResponse = (response: "available" | "unavailable") => {
    if (!selectedContactStatusItem) {
      return;
    }

    const flow = contactReplacementFlows[selectedContactStatusItem.id];

    if (!flow) {
      return;
    }

    setContactReplacementFlows((current) => ({
      ...current,
      [selectedContactStatusItem.id]: {
        ...flow,
        response,
        decision: undefined
      }
    }));
    addContactStatusTimelineEvent(selectedContactStatusItem.id, {
      actorAvatarSrc: flow.candidateAvatarSrc,
      actorName: flow.candidateName,
      actorRole: "候选补位",
      message: response === "available" ? "确认可以补位" : "回复无法补位",
      reason: response === "available" ? undefined : "该时段已有个人安排，无法覆盖。"
    });
  };
    const recordAdminDecision = (decision: ContactDecision) => {
      const selectedItem = currentSelectedContactStatusItem ?? selectedContactStatusItem;

      if (!selectedItem) {
        return;
      }

      const flow = contactReplacementFlows[selectedItem.id];

      setContactStatusDecisions((current) => ({
        ...current,
        [selectedItem.id]: decision
      }));

      if (flow) {
        setContactReplacementFlows((current) => ({
          ...current,
          [selectedItem.id]: {
            ...flow,
            decision
          }
        }));
      }

      addContactStatusTimelineEvent(selectedItem.id, {
        actorAvatarSrc: currentStore?.cover,
        actorName: "管理员",
        actorRole: "管理员",
        conflicts: decision === "rejected" ? selectedItem.conflicts : undefined,
        message: decision === "approved" ? `批准了该${selectedItem.title}` : `否决了该${selectedItem.title}`,
        reason: decision === "approved"
          ? flow
            ? `${flow.candidateName} 已确认可补位，原预约承接不受影响。`
            : "管理员确认后通过，排班会进入下一步同步。"
          : flow?.response === "available"
            ? "管理员仍需重新评估当日排班风险。"
            : selectedItem.conflicts?.[0] ?? "当前申请暂不通过，需要重新调整后再提交。",
        reasonLabel: decision === "rejected" ? "冲突" : "理由",
        tone: decision === "rejected" ? "red" : "green"
      });
    };

  return (
    <>
      {!isMobileSurface ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <article className={cn("rounded-[24px] border p-4 shadow-panel", cardClass)} key={card.label}>
              <p className={cn("text-[11px] font-black uppercase tracking-[0.16em]", labelTextClass)}>{card.label}</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <strong className="text-2xl font-black text-ink">{card.value}</strong>
                <Badge tone={card.tone}>{card.label}</Badge>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <section className={cn(isMobileSurface ? "relative rounded-[26px] border p-4 shadow-panel" : "mt-5 rounded-[28px] border p-4 shadow-panel", sectionClass)}>
        <div className={cn("flex gap-3", isMobileSurface ? "items-start justify-between" : "flex-col md:flex-row md:items-start md:justify-between")}>
          <div className="min-w-0">
            <TitleWithInfo
              as="h2"
              info={scheduleOverviewInfo}
              infoClassName="h-6 w-6 text-[12px]"
              label="当前周期班表说明"
              title="当前周期班表"
              titleClassName={cn("font-black", isMobileSurface ? "text-[18px]" : "text-xl")}
              variant={isMobileSurface ? "paper" : "client"}
            />
          </div>
          {isMobileSurface ? (
            <ScheduleViewSegmentedTabs className="shrink-0" onChange={setView} value={view} />
          ) : (
            <div className="flex flex-wrap gap-2">
              <input
                className={cn("rounded-full border px-4 py-2 text-sm font-semibold text-ink outline-none", fieldClass)}
                onChange={(event) => setDateKey(event.target.value)}
                type="date"
                value={dateKey}
              />
              <ScheduleViewSegmentedTabs onChange={setView} value={view} />
            </div>
          )}
        </div>

        {isMobileSurface ? (
          <div className="mt-4 grid gap-3">
            <div className="grid grid-cols-2 gap-2 text-sm font-black text-ink">
              <div className={cn("rounded-[18px] border px-3 py-2.5", cardClass)}>
                <p className={cn("text-[10px] uppercase tracking-[0.14em]", labelTextClass)}>周期</p>
                <p className="mt-1 text-[15px]">{formatCompactPeriodLabel(summary.activePeriodLabel)}</p>
              </div>
              <div className={cn("rounded-[18px] border px-3 py-2.5", cardClass)}>
                <p className={cn("text-[10px] uppercase tracking-[0.14em]", labelTextClass)}>模式</p>
                <p className="mt-1 truncate text-[15px]">{summary.currentModeLabel}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {overviewCards.map((card) => (
                <article className="min-w-0 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-3 py-2.5" key={card.label}>
                  <p className={cn("truncate text-[10px] font-black leading-none", labelTextClass)}>{card.label}</p>
                  <strong className="mt-2 block truncate text-[14px] font-black leading-none text-ink">{card.value}</strong>
                </article>
              ))}
            </div>

            <Button className="h-12 w-full text-[15px] font-black" onClick={() => setScheduleDetailOpen(true)}>
              查看详细排班表
            </Button>
          </div>
        ) : scheduleGrid ? (
          <div className="mt-4">
	            <ScheduleGrid
	              collapsedTechnicians={collapsedTechnicians}
	              data={scheduleGrid}
	              legendFilter={scheduleLegendFilter}
	              onLegendFilterChange={setScheduleLegendFilter}
	              onSelectDate={openDateSchedule}
	              onSelectCell={openCellDetail}
	              onToggleCollapsed={() => setCollapsedTechnicians((current) => !current)}
	              stickyTop={scheduleStickyTop}
              surface={surface}
            />
          </div>
        ) : null}
      </section>

      {isMobileSurface ? (
        <ContactInfoStatusPanel
          className={cn("mt-4", cardClass)}
          emptyDetail="当前筛选条件下没有联系信息。"
          emptyIcon={<ComputerAvatarIcon />}
          emptyId="dispatch-contact-empty"
          filter={contactStatusFilter}
          items={mobileContactStatusItems}
          onFilterChange={setContactStatusFilter}
          onSelect={setSelectedContactStatusItem}
        />
      ) : null}

      {!isMobileSurface ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr,0.85fr]">
          <TodayArrangementTable operatorId={operatorId} storeId={storeId} surface={surface} />
          <SpecialTaskPool operatorId={operatorId} storeId={storeId} surface={surface} />
        </div>
      ) : null}

      {!isMobileSurface ? (
        <FloatingActionWindow
          onMinimize={minimizeFloatingTask}
          onRestoreAll={() => floatingTasks.forEach((task) => minimizeFloatingTask(task.id, false))}
          onSelect={focusTask}
          surface={surface}
          tasks={floatingTasks}
        />
      ) : null}

      {isMobileSurface && scheduleDetailOpen ? (
        <MobileFullscreenPage className="z-[90]" innerClassName="client-mobile-schedule-detail__inner">
          <div className="client-mobile-schedule-detail__header shrink-0 border-b border-line bg-[color:color-mix(in_srgb,var(--client-bg)_96%,transparent)] shadow-[0_16px_34px_rgba(0,0,0,0.16)] backdrop-blur-xl">
            <MobileFullscreenHeader
              className="border-b-0 bg-transparent text-ink backdrop-blur-none"
              closeLabel="关闭排班表"
              onClose={() => setScheduleDetailOpen(false)}
              subtitle={summary.activePeriodLabel}
              title="周期排班表"
            />
            <div className="client-mobile-schedule-detail__toolbar grid gap-2 px-4 pb-3 pt-2">
              <div className="client-mobile-schedule-detail__date-row grid grid-cols-[minmax(132px,0.58fr)_minmax(0,1fr)] gap-2">
                <input
                  className={cn("min-w-0 rounded-full border px-3 text-[13px] font-black text-ink outline-none", fieldClass)}
                  onChange={(event) => setDateKey(event.target.value)}
                  type="date"
                  value={dateKey}
                />
                <ScheduleViewSegmentedTabs className="w-full [&_.client-segmented-tab]:flex-1" onChange={setView} value={view} />
              </div>
              <div className="client-mobile-schedule-detail__search-row grid grid-cols-[minmax(0,1fr)_112px] gap-2">
                <label className={cn("grid h-11 grid-cols-[auto,minmax(0,1fr)] items-center gap-2 rounded-full border px-3", fieldClass)}>
                  <AppIcon className="h-4 w-4 text-ink/45" name="search" />
                  <input
                    aria-label="搜索排班"
                    className="min-w-0 bg-transparent text-[13px] font-bold text-ink outline-none placeholder:text-ink/35"
                    onChange={(event) => setScheduleSearchQuery(event.target.value)}
                    placeholder="搜索技师 / 预约"
                    type="search"
                    value={scheduleSearchQuery}
                  />
                </label>
                <select
                  aria-label="筛选排班状态"
                  className={cn("h-11 rounded-full border px-3 text-[13px] font-black text-ink outline-none", fieldClass)}
                  onChange={(event) => setScheduleStatusFilter(event.target.value as ScheduleDetailStatusFilter)}
                  value={scheduleStatusFilter}
                >
                  {scheduleDetailStatusFilters.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="client-mobile-schedule-detail__legend-row flex flex-wrap gap-1.5">
                {scheduleLegendItems.map((item) => {
                  const active = scheduleLegendFilter === item.value;

                  return (
                    <button
                      aria-label={active ? translateText(`取消${item.label}筛选`, language) : translateText(`仅显示${item.label}`, language)}
                      aria-pressed={active}
                      className={cn(
                        "focus-ring rounded-md transition",
                        active && "ring-2 ring-[color:color-mix(in_srgb,var(--client-primary)_70%,transparent)] ring-offset-2 ring-offset-transparent",
                        scheduleLegendFilter && !active && "opacity-45"
                      )}
                      key={item.value}
                      onClick={() => setScheduleLegendFilter((current) => current === item.value ? null : item.value)}
                      type="button"
                    >
                      <Badge className={item.className} tone={item.tone}>{translateText(item.label, language)}</Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="client-mobile-schedule-detail__body scrollbar-none min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-0">
            {detailScheduleGrid ? (
              <>
                <div className="client-mobile-schedule-detail__grid-legend">
                  {scheduleLegendItems.map((item) => {
                    const active = scheduleLegendFilter === item.value;

                    return (
                      <button
                        aria-label={active ? translateText(`取消${item.label}筛选`, language) : translateText(`仅显示${item.label}`, language)}
                        aria-pressed={active}
                        className={cn(
                          "focus-ring shrink-0 rounded-md transition",
                          active && "ring-2 ring-[color:color-mix(in_srgb,var(--client-primary)_70%,transparent)] ring-offset-2 ring-offset-transparent",
                          scheduleLegendFilter && !active && "opacity-45"
                        )}
                        key={item.value}
                        onClick={() => setScheduleLegendFilter((current) => current === item.value ? null : item.value)}
                        type="button"
                      >
                        <Badge className={item.className} tone={item.tone}>{translateText(item.label, language)}</Badge>
                      </button>
                    );
                  })}
                </div>
		                <ScheduleGrid
		                  collapsedTechnicians={collapsedTechnicians}
		                  compactHeader
		                  data={detailScheduleGrid}
		                  legendFilter={scheduleLegendFilter}
		                  onLegendFilterChange={setScheduleLegendFilter}
		                  onSelectDate={openDateSchedule}
		                  onSelectCell={openCellDetail}
	                  onToggleCollapsed={() => setCollapsedTechnicians((current) => !current)}
	                  stickyTop="var(--client-mobile-schedule-detail-grid-header-top, 0px)"
                  surface={surface}
                />
                {detailScheduleGrid.rows.length === 0 ? (
                  <div className={cn("mt-3 rounded-[18px] border px-4 py-6 text-center text-sm font-bold text-ink/45", cardClass)}>
                    没有符合搜索或筛选条件的排班记录。
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </MobileFullscreenPage>
      ) : null}

      {isMobileSurface && currentSelectedContactStatusItem ? (
        <MobileFullscreenPage className="z-[95]">
          <MobileFullscreenHeader
            closeLabel="关闭联系信息详情"
            onClose={() => setSelectedContactStatusItem(null)}
            subtitle={`${currentSelectedContactStatusItem.dateLabel} · ${currentSelectedContactStatusItem.markerLabel}`}
            title="联系信息详情"
          />
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-4">
            <ContactStatusDetailContent
              extraTimeline={contactStatusExtraTimeline[currentSelectedContactStatusItem.id] ?? []}
              item={currentSelectedContactStatusItem}
              onCandidateResponse={recordCandidateResponse}
              onSelectReplacementCandidate={selectReplacementCandidate}
              replacementFlow={contactReplacementFlows[currentSelectedContactStatusItem.id]}
            />
          </div>
          {currentSelectedContactStatusItem.requiresDecision ? (
            <ContactStatusDecisionBar
              decision={contactStatusDecisions[currentSelectedContactStatusItem.id]}
              onDecision={recordAdminDecision}
            />
          ) : null}
          <ImChatComposer
            draft={contactReplyDraft}
            isNight={isNight}
            onDraftChange={setContactReplyDraft}
            onPanelChange={setContactComposerPanel}
            onSend={sendContactReply}
            panel={contactComposerPanel}
          />
        </MobileFullscreenPage>
      ) : null}

      <Drawer onClose={() => setSelectedCell(null)} open={Boolean(selectedCell)} title="排班格详情">
        {selectedCell ? <ScheduleCellDetailContent cell={selectedCell} surface={surface} /> : null}
      </Drawer>
    </>
  );
}
