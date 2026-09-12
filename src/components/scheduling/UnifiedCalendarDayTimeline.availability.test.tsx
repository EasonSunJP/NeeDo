// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UnifiedCalendarDayTimeline,
  UnifiedCalendarMultiDayTimeline,
  UnifiedCalendarMonthGrid,
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

  it("renders a readable source-labelled availability strip inside each technician lane", async () => {
    const events = [
      {
        ...baseEvent,
        id: "availability-window",
        availabilityWindowId: 70,
        availabilitySourceType: "technician" as const,
        calendarId: lanes[0].id,
        calendarLabel: "自由排班",
      },
      ...Array.from({ length: 8 }, (_, index) => ({
        ...baseEvent,
        id: `availability-hour-${index}`,
        scheduleSlotId: 71 + index,
        availabilitySourceType: "shop" as const,
        badge: "可预约",
        title: "可预约",
        calendarId: lanes[1].id,
        calendarLabel: "LifeDance",
        startTime: `${String(8 + index).padStart(2, "0")}:00`,
        endTime: `${String(9 + index).padStart(2, "0")}:00`,
      })),
    ];
    await act(async () => root.render(
      <UnifiedCalendarDayTimeline calendarLanes={lanes} date="2026-09-09" events={events} onOpen={vi.fn()} />,
    ));

    const strips = Array.from(container.querySelectorAll<HTMLElement>("[data-calendar-availability-strip]"));
    expect(strips).toHaveLength(2);
    expect(strips.every((strip) => strip.style.width === "24px")).toBe(true);
    expect(strips.map((strip) => strip.textContent)).toEqual(["自由排班", "LifeDance排班"]);
    expect(container.querySelectorAll("[data-calendar-event-card]")).toHaveLength(0);
  });

  it("renders source-typed employee availability projections as strips without database ids", async () => {
    const availability: UnifiedCalendarEvent = {
      ...baseEvent,
      id: "employee-availability-projection",
      availabilitySourceType: "technician",
      calendarId: "employee:s0000000002",
      calendarLabel: "自由排班",
    };

    await act(async () => root.render(
      <UnifiedCalendarDayTimeline
        date="2026-09-09"
        events={[availability]}
        onOpen={vi.fn()}
      />,
    ));

    const strip = container.querySelector<HTMLElement>("[data-calendar-availability-strip]");
    expect(strip).not.toBeNull();
    expect(strip?.style.width).toBe("24px");
    expect(strip?.textContent).toBe("自由排班");
    expect(container.querySelector("[data-calendar-event-card]")).toBeNull();
  });

  it.each([3, 7])("keeps availability as a labelled strip on the left edge of each date in the %s-day view", async (dayCount) => {
    const dates = Array.from({ length: dayCount }, (_, index) => `2026-09-${String(9 + index).padStart(2, "0")}`);
    const targetDate = dates[Math.min(1, dates.length - 1)]!;
    const events: UnifiedCalendarEvent[] = [{
      ...baseEvent,
      id: `shop-availability-${dayCount}`,
      scheduleSlotId: 80 + dayCount,
      availabilitySourceType: "shop",
      badge: "已预约",
      calendarLabel: "LifeDance",
      date: targetDate,
      title: "LifeDance店铺排班（可排班日程）",
    }];

    await act(async () => root.render(
      <UnifiedCalendarMultiDayTimeline dates={dates} events={events} onOpen={vi.fn()} />,
    ));

    const strip = container.querySelector<HTMLElement>("[data-calendar-availability-strip]");
    expect(strip).not.toBeNull();
    expect(strip?.textContent).toBe("LifeDance排班");
    expect(strip?.style.left).toBe("4px");
    expect(strip?.style.width).toBe("24px");
    expect(strip?.closest(`[data-calendar-date-column="${targetDate}"]`)).not.toBeNull();
  });

  it.each([
    ["ja", ["日", "月", "火", "水", "木", "金", "土"]],
    ["en", ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]],
    ["ko", ["일", "월", "화", "수", "목", "금", "토"]],
  ] as const)("renders %s weekday headers in the active language", async (language, expected) => {
    const dates = Array.from({ length: 7 }, (_, index) => `2026-09-${String(13 + index).padStart(2, "0")}`);

    await act(async () => root.render(
      <UnifiedCalendarMultiDayTimeline
        dates={dates}
        events={[]}
        language={language}
        onOpen={vi.fn()}
      />,
    ));

    const labels = Array.from(container.querySelectorAll("button > span:first-child"))
      .slice(0, 7)
      .map((label) => label.textContent);
    expect(labels).toEqual(expected);
  });

  it("shows availability as an unlabelled thin strip on the left edge of a month cell", async () => {
    const date = "2026-09-09";
    const availability: UnifiedCalendarEvent = {
      ...baseEvent,
      id: "month-availability",
      scheduleSlotId: 91,
      availabilitySourceType: "shop",
      badge: "已预约",
      calendarLabel: "LifeDance",
      date,
      title: "LifeDance店铺排班（可排班日程）",
    };

    await act(async () => root.render(
      <UnifiedCalendarMonthGrid
        anchorDate={date}
        dates={[date]}
        eventsByDate={{ [date]: [availability] }}
        onOpen={vi.fn()}
      />,
    ));

    const strip = container.querySelector<HTMLElement>("[data-calendar-month-availability-strip]");
    expect(strip).not.toBeNull();
    expect(strip?.textContent).toBe("");
    expect(strip?.style.left).toBe("0px");
    expect(strip?.style.width).toBe("6px");
    expect(container.textContent).not.toContain("LifeDance店铺排班");
  });

  it("renders Japanese month-view weekday headers", async () => {
    await act(async () => root.render(
      <UnifiedCalendarMonthGrid
        anchorDate="2026-09-13"
        dates={[]}
        eventsByDate={{}}
        language="ja"
        onOpen={vi.fn()}
      />,
    ));

    expect(Array.from(container.querySelectorAll(".grid-cols-7 > span")).map((label) => label.textContent))
      .toEqual(["日", "月", "火", "水", "木", "金", "土"]);
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
