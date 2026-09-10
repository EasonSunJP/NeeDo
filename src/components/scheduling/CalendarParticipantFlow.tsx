import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  calendarEventApi,
  type CalendarParticipantBusyRange,
} from "../../features/scheduling/calendar-event-api";
import { cn } from "../../lib/utils";
import { MobileFullscreenHeader } from "../mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../mobile/MobileFullscreenPage";
import "../../features/scheduling/registerCalendarParticipantI18n";

export type CalendarParticipantDraft = {
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  syncContactIds: string[];
};

export type CalendarParticipantOption = {
  id: string;
  identityId: number;
  label: string;
  description: string;
  avatar?: string;
  tags: string[];
  groupIds: string[];
  isCommon: boolean;
};

export type CalendarParticipantTimelineRenderInput = {
  busyRanges: CalendarParticipantBusyRange[];
  conflictIdentityIds: Set<number>;
  draft: CalendarParticipantDraft;
  onParticipantRemove: (participantId: string) => void;
  onTimeChange: (startTime: string, endTime: string) => void;
  participants: CalendarParticipantOption[];
};

type CalendarParticipantFlowProps = {
  currentParticipant?: CalendarParticipantOption;
  draft: CalendarParticipantDraft;
  onClose: () => void;
  onComplete: (draft: CalendarParticipantDraft) => void;
  onDraftChange: (draft: CalendarParticipantDraft) => void;
  options: CalendarParticipantOption[];
  renderTimeline: (input: CalendarParticipantTimelineRenderInput) => ReactNode;
};

type ParticipantFilter = "common" | "tags" | "groups";
type ParticipantStep = "contacts" | "calendar";

const filters: Array<{ value: ParticipantFilter; label: string }> = [
  { value: "common", label: "常用" },
  { value: "tags", label: "标签" },
  { value: "groups", label: "群组" },
];

const toDraftRange = (draft: CalendarParticipantDraft) => ({
  startsAt: new Date(`${draft.date}T${draft.startTime}:00`).toISOString(),
  endsAt: new Date(`${draft.endDate}T${draft.endTime}:00`).toISOString(),
});

export function getParticipantConflictIdentityIds(
  candidate: { startsAt: string; endsAt: string },
  busyRanges: CalendarParticipantBusyRange[],
) {
  const conflicts = new Set<number>();
  const candidateStart = Date.parse(candidate.startsAt);
  const candidateEnd = Date.parse(candidate.endsAt);
  busyRanges.forEach((busy) => {
    if (candidateStart < Date.parse(busy.endsAt) && candidateEnd > Date.parse(busy.startsAt)) {
      conflicts.add(busy.participantIdentityId);
    }
  });
  return conflicts;
}

function ParticipantAvatar({ option }: { option: CalendarParticipantOption }) {
  const fallback = option.label.trim().slice(0, 1) || "人";
  return option.avatar ? (
    <img alt={option.label} className="h-10 w-10 shrink-0 rounded-full object-cover" src={option.avatar} />
  ) : (
    <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color:var(--client-primary-soft)] text-sm font-black text-[color:var(--client-primary-strong)]">
      {fallback}
    </span>
  );
}

export function CalendarParticipantFlow({
  currentParticipant,
  draft,
  onClose,
  onComplete,
  onDraftChange,
  options,
  renderTimeline,
}: CalendarParticipantFlowProps) {
  const initialDraftRef = useRef(draft);
  const [step, setStep] = useState<ParticipantStep>("contacts");
  const [filter, setFilter] = useState<ParticipantFilter>("common");
  const [query, setQuery] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const [busyRanges, setBusyRanges] = useState<CalendarParticipantBusyRange[]>([]);
  const [busyError, setBusyError] = useState("");
  const [busyLoading, setBusyLoading] = useState(false);
  const hadInitialParticipants = initialDraftRef.current.syncContactIds.length > 0;

  const selectedOptions = useMemo(() => {
    const selected = new Set(draft.syncContactIds);
    return options.filter((option) => selected.has(option.id));
  }, [draft.syncContactIds, options]);

  const visibleOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return options.filter((option) => {
      const categoryMatches = filter === "common"
        ? option.isCommon
        : filter === "tags"
          ? option.tags.length > 0
          : option.groupIds.length > 0;
      const queryMatches = !normalizedQuery || `${option.label} ${option.description} ${option.tags.join(" ")}`.toLocaleLowerCase().includes(normalizedQuery);
      return categoryMatches && queryMatches;
    });
  }, [filter, options, query]);

  useEffect(() => {
    if (step !== "calendar" || selectedOptions.length === 0) return undefined;
    let active = true;
    const from = new Date(`${draft.date}T00:00:00`);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    setBusyError("");
    setBusyLoading(true);
    void calendarEventApi.listAllParticipantBusy({
      from,
      to,
      participantIdentityIds: selectedOptions.map((option) => option.identityId),
    }).then((response) => {
      if (active) setBusyRanges(response);
    }).catch((error) => {
      if (!active) return;
      setBusyRanges([]);
      setBusyError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (active) setBusyLoading(false);
    });
    return () => { active = false; };
  }, [draft.date, selectedOptions, step]);

  const conflictIdentityIds = useMemo(
    () => getParticipantConflictIdentityIds(toDraftRange(draft), busyRanges),
    [busyRanges, draft],
  );

  const restoreAndClose = () => {
    onDraftChange(initialDraftRef.current);
    onClose();
  };

  const clearAndClose = () => {
    onDraftChange({
      ...initialDraftRef.current,
      syncContactIds: [],
    });
    onClose();
  };

  const toggleParticipant = (id: string) => {
    const selected = draft.syncContactIds.includes(id);
    onDraftChange({
      ...draft,
      syncContactIds: selected
        ? draft.syncContactIds.filter((item) => item !== id)
        : [...draft.syncContactIds, id],
    });
    setValidationMessage("");
  };

  const removeParticipant = (id: string) => {
    onDraftChange({
      ...draft,
      syncContactIds: draft.syncContactIds.filter((item) => item !== id),
    });
    setValidationMessage("");
  };

  const moveNext = () => {
    if (selectedOptions.length === 0) {
      if (hadInitialParticipants) {
        setValidationMessage("");
        onComplete(draft);
        return;
      }
      setValidationMessage("请至少选择一位联系人后再进入下一步。");
      return;
    }
    const range = toDraftRange(draft);
    if (draft.endDate !== draft.date || Date.parse(range.endsAt) <= Date.parse(range.startsAt)) {
      setValidationMessage("多人日程确认仅支持同日时间，请先返回新增日程调整结束日期。");
      return;
    }
    setValidationMessage("");
    setStep("calendar");
  };

  const currentLane = currentParticipant ?? {
    id: "self",
    identityId: 0,
    label: "我",
    description: "当前用户",
    tags: [],
    groupIds: [],
    isCommon: true,
  };

  return (
    <MobileFullscreenPage className="z-[138]" innerClassName="client-glass-page-surface">
      <MobileFullscreenHeader
        className="client-mobile-schedule-detail__floating-header"
        closeLabel="关闭参加者选择"
        onBack={step === "calendar" ? () => setStep("contacts") : restoreAndClose}
        onClose={restoreAndClose}
        showSpacer={false}
        title={step === "contacts" ? "选择参加者" : "多人日程"}
        center={step === "contacts" ? (
          <input
            aria-label="搜索参加者"
            className="h-9 min-w-0 flex-1 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_65%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_72%,transparent)] px-3 text-sm font-bold text-[color:var(--client-text)] outline-none"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索"
            type="search"
            value={query}
          />
        ) : undefined}
        footer={step === "contacts" ? (
          <div className="grid grid-cols-3 gap-1 px-2 pb-2">
            {filters.map((item) => (
              <button
                aria-pressed={filter === item.value}
                className={cn(
                  "focus-ring h-9 rounded-full text-xs font-black transition",
                  filter === item.value
                    ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]"
                    : "text-[color:var(--client-muted)]",
                )}
                key={item.value}
                onClick={() => setFilter(item.value)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : undefined}
      />

      <main className={cn(
        "scrollbar-none min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+104px)] [-webkit-overflow-scrolling:touch]",
        step === "contacts" ? "pt-[calc(env(safe-area-inset-top)+154px)]" : "pt-[calc(env(safe-area-inset-top)+94px)]",
      )}>
        {step === "contacts" ? (
          <div className="mx-auto max-w-[560px] space-y-3">
            <section className="max-h-[52vh] overflow-y-auto rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_80%,transparent)] p-2 shadow-[0_18px_44px_rgba(0,0,0,0.14)] backdrop-blur-xl">
              {visibleOptions.length > 0 ? (
                <div className="space-y-2">
                  {visibleOptions.map((option) => {
                    const selected = draft.syncContactIds.includes(option.id);
                    return (
                      <button
                        aria-pressed={selected}
                        className={cn(
                          "focus-ring flex min-h-[62px] w-full items-center gap-3 rounded-[18px] border px-3 py-2 text-left transition",
                          selected
                            ? "border-[color:color-mix(in_srgb,var(--client-primary)_48%,transparent)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)]"
                            : "border-transparent bg-[color:color-mix(in_srgb,var(--client-surface)_66%,transparent)] text-[color:var(--client-text)]",
                        )}
                        key={option.id}
                        onClick={() => toggleParticipant(option.id)}
                        type="button"
                      >
                        <span className={cn(
                          "grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border text-[11px] font-black",
                          selected
                            ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]"
                            : "border-[color:var(--client-line)]",
                        )}>
                          {selected ? "✓" : ""}
                        </span>
                        <ParticipantAvatar option={option} />
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-sm font-black">{option.label}</strong>
                          <span className="mt-0.5 block truncate text-[11px] font-bold text-[color:var(--client-muted)]">{option.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="px-4 py-10 text-center text-sm font-bold text-[color:var(--client-muted)]">没有符合条件的联系人</p>
              )}
            </section>
            {validationMessage ? (
              <p className="rounded-[16px] border border-red-300 bg-red-50 px-3 py-2 text-center text-xs font-black text-red-700" role="alert">
                {validationMessage}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mx-auto max-w-[720px] space-y-3">
            {busyError ? (
              <p className="rounded-[16px] border border-red-300 bg-red-50 px-3 py-2 text-xs font-black text-red-700" role="alert">
                <span>参加者占用时间读取失败：</span><span data-no-i18n>{busyError}</span>
              </p>
            ) : null}
            {busyLoading ? (
              <p className="rounded-[16px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-3 py-2 text-xs font-black text-[color:var(--client-muted)]" role="status">
                正在确认参加者日程…
              </p>
            ) : null}
            {conflictIdentityIds.size > 0 ? (
              <p className="rounded-[16px] border border-red-300 bg-red-50 px-3 py-2 text-xs font-black text-red-700" role="status">
                <span data-no-i18n>{conflictIdentityIds.size}</span>{" "}<span>位参加者在当前时间已有安排。仍可完成选择并继续创建。</span>
              </p>
            ) : null}
            {renderTimeline({
              busyRanges,
              conflictIdentityIds,
              draft,
              onParticipantRemove: removeParticipant,
              onTimeChange: (startTime, endTime) => onDraftChange({ ...draft, startTime, endTime }),
              participants: [currentLane, ...selectedOptions],
            })}
          </div>
        )}
      </main>

      <footer className="safe-bottom pointer-events-none fixed bottom-0 left-1/2 z-[140] w-full max-w-[720px] -translate-x-1/2 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-12">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[140px] bg-[linear-gradient(180deg,transparent_0%,color-mix(in_srgb,var(--client-bg)_76%,transparent)_42%,var(--client-bg)_100%)]" />
        <div className="pointer-events-auto relative z-10 grid grid-cols-2 gap-2">
          <button
            className="focus-ring h-12 rounded-full border border-[color:var(--client-line)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] text-sm font-black text-[color:var(--client-text)] shadow-[0_14px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl"
            onClick={step === "contacts" ? restoreAndClose : clearAndClose}
            type="button"
          >
            取消
          </button>
          <button
            aria-disabled={(step === "contacts" && selectedOptions.length === 0 && !hadInitialParticipants) || (step === "calendar" && (busyLoading || Boolean(busyError)))}
            className={cn(
              "focus-ring h-12 rounded-full text-sm font-black shadow-[0_16px_36px_color-mix(in_srgb,var(--client-primary)_22%,transparent)] transition",
              (step === "contacts" && selectedOptions.length === 0 && !hadInitialParticipants) || (step === "calendar" && (busyLoading || Boolean(busyError)))
                ? "bg-[color:var(--client-line)] text-[color:var(--client-muted)]"
                : "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]",
            )}
            disabled={step === "calendar" && (busyLoading || Boolean(busyError))}
            onClick={step === "contacts" ? moveNext : () => onComplete(draft)}
            type="button"
          >
            {step === "contacts" ? "下一步" : "完成选择"}
          </button>
        </div>
      </footer>
    </MobileFullscreenPage>
  );
}
