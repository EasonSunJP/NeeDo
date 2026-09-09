// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UnifiedCalendarDayTimeline,
  type UnifiedCalendarEvent,
  type UnifiedCalendarLane,
} from "./UnifiedUserCalendar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const lanes: UnifiedCalendarLane[] = [
  { id: "technician:21", label: "佐藤", accent: "#36d67b" },
  { id: "technician:22", label: "田中", accent: "#36d67b" },
];

const baseEvent: UnifiedCalendarEvent = {
  id: "event",
  sourceId: "technician",
  date: "2026-09-09",
  startTime: "08:00",
  endTime: "16:00",
  title: "可排班",
  subtitle: "",
  badge: "可排班",
  readOnly: true,
};

describe("UnifiedCalendarDayTimeline availability and participant draft rendering", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("renders one continuous narrow availability strip inside each technician lane", async () => {
    const events = [
      {
      ...baseEvent,
      id: "availability-window",
      availabilityWindowId: 70,
      calendarId: lanes[0].id,
      },
      ...Array.from({ length: 8 }, (_, index) => ({
        ...baseEvent,
        id: `availability-hour-${index}`,
        scheduleSlotId: 71 + index,
        badge: "可预约",
        title: "可预约",
        calendarId: lanes[1].id,
        startTime: `${String(8 + index).padStart(2, "0")}:00`,
        endTime: `${String(9 + index).padStart(2, "0")}:00`,
      })),
    ];
    await act(async () => root.render(
      <UnifiedCalendarDayTimeline calendarLanes={lanes} date="2026-09-09" events={events} onOpen={vi.fn()} />,
    ));

    const strips = Array.from(container.querySelectorAll<HTMLElement>("[data-calendar-availability-strip]"));
    expect(strips).toHaveLength(2);
    expect(strips.every((strip) => strip.style.width === "8px")).toBe(true);
    expect(container.querySelectorAll("[data-calendar-event-card]")).toHaveLength(0);
  });

  it("spans one controlled draft block across all participant lanes and marks only conflicting lanes", async () => {
    await act(async () => root.render(
      <UnifiedCalendarDayTimeline
        calendarLanes={lanes}
        date="2026-09-09"
        draftConflictCalendarIds={new Set(["technician:22"])}
        draftRangeValue={{ start: 600, end: 660 }}
        events={[]}
        onDraftRangeChange={vi.fn()}
        onOpen={vi.fn()}
        spanDraftAcrossLanes
      />,
    ));

    const draft = container.querySelector<HTMLElement>('[data-schedule-draft-range-block="true"]');
    expect(draft).not.toBeNull();
    expect(draft?.getAttribute("data-schedule-draft-conflict")).toBe("true");
    expect(draft?.style.left).toBe("8px");
    expect(draft?.style.width).toBe("calc(100% - 16px)");
    expect(container.querySelectorAll("[data-schedule-range-handle]")).toHaveLength(2);
    expect(container.querySelectorAll('[data-calendar-conflict-lane="true"]')).toHaveLength(1);
  });
});
