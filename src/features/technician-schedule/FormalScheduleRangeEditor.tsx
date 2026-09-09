import {
  useRef,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  ScheduleDraftRangeBlock,
  scheduleDraftRangeVisualMinHeight
} from "../../components/scheduling/ScheduleDraftRangeBlock";

export const SCHEDULE_INCREMENT_MINUTES = 15;
export const SCHEDULE_DAY_MINUTES = 24 * 60;

type ScheduleRange = {
  startMinute: number;
  endMinute: number;
};

type FormalScheduleRangeEditorProps = {
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  onChange: (startsAt: Date, endsAt: Date) => void;
  disabled?: boolean;
  mode?: "service" | "availability";
};

type PointerMode = "select" | "move" | "resize-start" | "resize-end";

type PointerSession = {
  baseRange: ScheduleRange;
  mode: PointerMode;
  pointerMinute: number;
};

const timelineHeight = 96 * 16;

export function snapScheduleMinute(value: number): number {
  return Math.max(
    0,
    Math.min(
      SCHEDULE_DAY_MINUTES,
      Math.round(value / SCHEDULE_INCREMENT_MINUTES) * SCHEDULE_INCREMENT_MINUTES
    )
  );
}

export function clampScheduleRange(range: ScheduleRange): ScheduleRange {
  const startMinute = snapScheduleMinute(range.startMinute);
  const endMinute = Math.max(
    startMinute + SCHEDULE_INCREMENT_MINUTES,
    snapScheduleMinute(range.endMinute)
  );
  return {
    startMinute: Math.min(startMinute, SCHEDULE_DAY_MINUTES - SCHEDULE_INCREMENT_MINUTES),
    endMinute: Math.min(endMinute, SCHEDULE_DAY_MINUTES)
  };
}

function dateMinute(value: Date, day: Date): number {
  const startOfDay = new Date(day);
  startOfDay.setHours(0, 0, 0, 0);
  return Math.round((value.getTime() - startOfDay.getTime()) / 60_000);
}

function minuteDate(day: Date, minute: number): Date {
  const value = new Date(day);
  value.setHours(0, minute, 0, 0);
  return value;
}

function minuteLabel(minute: number): string {
  if (minute === SCHEDULE_DAY_MINUTES) return "24:00";
  const hour = Math.floor(minute / 60);
  const remainder = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function capturePointer(element: HTMLElement, pointerId: number) {
  element.setPointerCapture?.(pointerId);
}

function releasePointer(element: HTMLElement, pointerId: number) {
  if (element.hasPointerCapture?.(pointerId)) element.releasePointerCapture?.(pointerId);
}

export function FormalScheduleRangeEditor({
  startsAt,
  endsAt,
  durationMinutes,
  onChange,
  disabled = false,
  mode = "service"
}: FormalScheduleRangeEditorProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const pointerSessionRef = useRef<PointerSession | null>(null);
  const range = clampScheduleRange({
    startMinute: dateMinute(startsAt, startsAt),
    endMinute: dateMinute(endsAt, startsAt)
  });
  const rangeDuration = range.endMinute - range.startMinute;

  const pointerMinute = (clientY: number): number => {
    const rectangle = timelineRef.current?.getBoundingClientRect();
    if (!rectangle || rectangle.height <= 0) return range.startMinute;
    return snapScheduleMinute(
      ((clientY - rectangle.top) / rectangle.height) * SCHEDULE_DAY_MINUTES
    );
  };

  const emitRange = (nextRange: ScheduleRange) => {
    const clamped = clampScheduleRange(nextRange);
    onChange(
      minuteDate(startsAt, clamped.startMinute),
      minuteDate(startsAt, clamped.endMinute)
    );
  };

  const beginPointer = (
    mode: PointerMode,
    event: ReactPointerEvent<HTMLElement>
  ) => {
    if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    const minute = pointerMinute(event.clientY);
    pointerSessionRef.current = {
      baseRange: range,
      mode,
      pointerMinute: minute
    };
    capturePointer(event.currentTarget, event.pointerId);
  };

  const updatePointer = (event: ReactPointerEvent<HTMLElement>) => {
    const session = pointerSessionRef.current;
    if (disabled || !session) return;
    event.preventDefault();
    event.stopPropagation();
    const minute = pointerMinute(event.clientY);

    if (session.mode === "select") {
      const startMinute = Math.min(session.pointerMinute, minute);
      const endMinute = Math.max(session.pointerMinute, minute);
      emitRange(
        startMinute === endMinute
          ? { startMinute, endMinute: startMinute + Math.max(SCHEDULE_INCREMENT_MINUTES, durationMinutes) }
          : { startMinute, endMinute }
      );
      return;
    }

    if (session.mode === "move") {
      const duration = session.baseRange.endMinute - session.baseRange.startMinute;
      const delta = minute - session.pointerMinute;
      const startMinute = Math.max(
        0,
        Math.min(SCHEDULE_DAY_MINUTES - duration, session.baseRange.startMinute + delta)
      );
      emitRange({ startMinute, endMinute: startMinute + duration });
      return;
    }

    if (session.mode === "resize-start") {
      emitRange({
        startMinute: Math.min(minute, session.baseRange.endMinute - SCHEDULE_INCREMENT_MINUTES),
        endMinute: session.baseRange.endMinute
      });
      return;
    }

    emitRange({
      startMinute: session.baseRange.startMinute,
      endMinute: Math.max(minute, session.baseRange.startMinute + SCHEDULE_INCREMENT_MINUTES)
    });
  };

  const endPointer = (event: ReactPointerEvent<HTMLElement>) => {
    if (!pointerSessionRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    releasePointer(event.currentTarget, event.pointerId);
    pointerSessionRef.current = null;
  };

  const cancelPointer = (event: ReactPointerEvent<HTMLElement>) => {
    releasePointer(event.currentTarget, event.pointerId);
    pointerSessionRef.current = null;
  };

  return (
    <section aria-disabled={disabled} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[color:var(--client-muted)]">
        <span data-testid="formal-schedule-range-value">
          {minuteLabel(range.startMinute)}–{minuteLabel(range.endMinute)}
        </span>
        <span>{mode === "availability" ? `可排班时长 ${rangeDuration} 分钟` : `服务时长 ${durationMinutes} 分钟`}</span>
      </div>
      {mode === "service" && rangeDuration !== durationMinutes ? (
        <p className="text-xs font-bold text-amber-500" role="status">
          当前时间范围为 {rangeDuration} 分钟，与服务时长不一致
        </p>
      ) : null}
      <div className="grid grid-cols-[54px,minmax(0,1fr)] overflow-hidden rounded-[20px] border border-[color:var(--client-line)]">
        <div aria-hidden="true" className="relative bg-[color:var(--client-elevated)]" style={{ height: timelineHeight }}>
          {Array.from({ length: 24 }, (_, hour) => (
            <span
              className="absolute inset-x-0 px-2 text-[10px] font-bold text-[color:var(--client-muted)]"
              key={hour}
              style={{ top: `${(hour / 24) * 100}%` }}
            >
              {String(hour).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        <div
          aria-label="选择排班开始和结束时间"
          className="relative touch-none select-none bg-[color:var(--client-surface)]"
          data-testid="formal-schedule-timeline"
          onPointerCancel={cancelPointer}
          onPointerDown={(event) => beginPointer("select", event)}
          onPointerMove={updatePointer}
          onPointerUp={endPointer}
          ref={timelineRef}
          style={{ height: timelineHeight }}
        >
          {Array.from({ length: 96 }, (_, index) => (
            <div
              className="border-b border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)]"
              data-schedule-quarter-cell="true"
              key={index}
              style={{ height: timelineHeight / 96 }}
            />
          ))}
          <ScheduleDraftRangeBlock
            className="left-2 right-2"
            compact
            onBlockPointerCancel={cancelPointer}
            onBlockPointerDown={(event) => beginPointer("move", event)}
            onBlockPointerMove={updatePointer}
            onBlockPointerUp={endPointer}
            onEndHandlePointerDown={(event) => beginPointer("resize-end", event)}
            onHandlePointerCancel={cancelPointer}
            onHandlePointerMove={updatePointer}
            onHandlePointerUp={endPointer}
            onStartHandlePointerDown={(event) => beginPointer("resize-start", event)}
            style={{
              top: `${(range.startMinute / SCHEDULE_DAY_MINUTES) * 100}%`,
              height: `max(${(rangeDuration / SCHEDULE_DAY_MINUTES) * 100}%, ${scheduleDraftRangeVisualMinHeight}px)`
            }}
            subtitle="拖动时间块或上下手柄调整"
            timeRange={`${minuteLabel(range.startMinute)}–${minuteLabel(range.endMinute)}`}
            title="排班时间"
          />
        </div>
      </div>
    </section>
  );
}
