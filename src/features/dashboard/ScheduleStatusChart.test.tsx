// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { ScheduleStatusChart } from "./ScheduleStatusChart";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const buckets = [
  { key: "2026-08-24", label: "8/24", scheduleAvailableHours: 6, scheduleBookedHours: 2, scheduleAttendanceCount: 3 },
  { key: "2026-08-25", label: "8/25", scheduleAvailableHours: 4, scheduleBookedHours: 6, scheduleAttendanceCount: 5 }
];

describe("ScheduleStatusChart", () => {
  it("renders booked and available bars with an attendance line", () => {
    const markup = renderToStaticMarkup(<I18nProvider><ScheduleStatusChart
      buckets={buckets}
      description="空闲、已预约和出勤趋势"
      title="排班状态"
    /></I18nProvider>);

    expect(markup.match(/data-schedule-status-bar="booked"/g)).toHaveLength(2);
    expect(markup.match(/data-schedule-status-bar="available"/g)).toHaveLength(2);
    expect(markup).toContain('data-schedule-attendance-line="true"');
    expect(markup.match(/data-schedule-attendance-point="true"/g)).toHaveLength(2);
    expect(markup).toMatch(/出勤人数|Staff on duty/);
  });

  it("stacks booked and idle shares into one full-height bar only for scheduled periods", () => {
    const markup = renderToStaticMarkup(<I18nProvider><ScheduleStatusChart
      buckets={[
        { key: "booked", label: "预约 10%", scheduleAvailableHours: 9, scheduleBookedHours: 1, scheduleAttendanceCount: 2 },
        { key: "idle", label: "全部空闲", scheduleAvailableHours: 8, scheduleBookedHours: 0, scheduleAttendanceCount: 1 },
        { key: "empty", label: "没有排班", scheduleAvailableHours: 0, scheduleBookedHours: 0, scheduleAttendanceCount: 0 }
      ]}
      description="排班时长占比与出勤人数"
      title="排班状态"
    /></I18nProvider>);
    const document = new DOMParser().parseFromString(markup, "text/html");
    const segment = (bucket: string, type: string) => document.querySelector<SVGRectElement>(
      `[data-schedule-bucket="${bucket}"][data-schedule-status-bar="${type}"]`
    );
    const booked = segment("booked", "booked");
    const available = segment("booked", "available");
    const idleOnly = segment("idle", "available");

    expect(booked).not.toBeNull();
    expect(available).not.toBeNull();
    expect(booked?.getAttribute("x")).toBe(available?.getAttribute("x"));
    expect(Number(booked?.getAttribute("height"))).toBeCloseTo(20.2, 1);
    expect(Number(available?.getAttribute("height"))).toBeCloseTo(181.8, 1);
    expect(Number(available?.getAttribute("height")) + Number(booked?.getAttribute("height"))).toBeCloseTo(202, 1);
    expect(Number(idleOnly?.getAttribute("height"))).toBeCloseTo(202, 1);
    expect(segment("idle", "booked")).toBeNull();
    expect(segment("empty", "available")).toBeNull();
    expect(segment("empty", "booked")).toBeNull();
    expect([...document.querySelectorAll('[data-axis-side="left"]')].some((label) => label.textContent === "100%" )).toBe(true);
  });

  it("shows unclipped data details when bars or attendance nodes are hovered and clicked", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(
      <I18nProvider>
        <ScheduleStatusChart
          buckets={buckets}
          description="空闲、已预约和出勤趋势"
          title="排班状态"
        />
      </I18nProvider>
    ));

    const bookedBar = container.querySelector<SVGElement>('[data-schedule-status-bar="booked"]')!;
    await act(async () => bookedBar.dispatchEvent(new MouseEvent("mouseover", {
      bubbles: true,
      clientX: 160,
      clientY: 190
    })));
    const hoveredDetail = document.body.querySelector('[data-dashboard-point-detail="true"]');
    expect(hoveredDetail?.textContent).toContain("8/24");
    expect(hoveredDetail?.textContent).toMatch(/(?:已预约时长|Booked hours).*2 (?:小时|hours)/s);
    expect(hoveredDetail?.textContent).toMatch(/(?:空闲时长|Available hours).*6 (?:小时|hours)/s);
    expect(hoveredDetail?.textContent).toMatch(/(?:出勤人数|Staff on duty).*3 (?:人|people)/s);
    expect(container.querySelector('[data-dashboard-chart-frame="true"]')?.contains(hoveredDetail)).toBe(false);

    await act(async () => bookedBar.dispatchEvent(new MouseEvent("mouseout", { bubbles: true })));
    expect(document.body.querySelector('[data-dashboard-point-detail="true"]')).toBeNull();

    const attendanceControl = container.querySelector<SVGElement>('[data-schedule-attendance-control="true"]')!;
    await act(async () => attendanceControl.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      clientX: 160,
      clientY: 190
    })));
    expect(document.body.querySelector('[data-dashboard-point-detail="true"]')?.textContent).toContain("8/24");
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-dashboard-point-detail="true"] button')?.click());
    expect(document.body.querySelector('[data-dashboard-point-detail="true"]')).toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });
});
