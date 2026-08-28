// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clampScheduleRange,
  FormalScheduleRangeEditor,
  snapScheduleMinute
} from "./FormalScheduleRangeEditor";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const initialStart = new Date(2026, 8, 1, 9, 0);
const initialEnd = new Date(2026, 8, 1, 10, 0);

function EditorHarness({ disabled = false, onChangeSpy }: { disabled?: boolean; onChangeSpy?: (start: Date, end: Date) => void }) {
  const [range, setRange] = useState({ startsAt: initialStart, endsAt: initialEnd });
  return (
    <FormalScheduleRangeEditor
      disabled={disabled}
      durationMinutes={60}
      endsAt={range.endsAt}
      onChange={(startsAt, endsAt) => {
        setRange({ startsAt, endsAt });
        onChangeSpy?.(startsAt, endsAt);
      }}
      startsAt={range.startsAt}
    />
  );
}

function pointer(target: Element, type: string, clientY: number, pointerId = 1) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientY });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: "mouse" }
  });
  target.dispatchEvent(event);
}

function rangeText(container: HTMLElement) {
  return container.querySelector('[data-testid="formal-schedule-range-value"]')?.textContent;
}

let container: HTMLDivElement;
let root: Root;

describe("FormalScheduleRangeEditor", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("snaps and clamps schedule minutes to a 15-minute day grid", () => {
    expect(snapScheduleMinute(7)).toBe(0);
    expect(snapScheduleMinute(8)).toBe(15);
    expect(clampScheduleRange({ startMinute: -15, endMinute: 30 })).toEqual({
      startMinute: 0,
      endMinute: 30
    });
  });

  it("renders 96 quarter-hour cells and the shared accessible resize handles", async () => {
    await act(async () => root.render(<EditorHarness />));

    expect(container.querySelectorAll('[data-schedule-quarter-cell="true"]')).toHaveLength(96);
    expect(container.querySelector('[aria-label="向上拉伸开始时间"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="向下拉伸结束时间"]')).not.toBeNull();
    expect(rangeText(container)).toBe("09:00–10:00");
  });

  it("selects a snapped range on the same local date", async () => {
    const onChange = vi.fn();
    await act(async () => root.render(<EditorHarness onChangeSpy={onChange} />));
    const timeline = container.querySelector('[data-testid="formal-schedule-timeline"]') as HTMLElement;
    vi.spyOn(timeline, "getBoundingClientRect").mockReturnValue({
      bottom: 960, height: 960, left: 0, right: 300, top: 0, width: 300, x: 0, y: 0,
      toJSON: () => ({})
    });

    await act(async () => {
      pointer(timeline, "pointerdown", 304);
      pointer(timeline, "pointermove", 344);
      pointer(timeline, "pointerup", 344);
    });

    expect(rangeText(container)).toBe("07:30–08:30");
    const [startsAt, endsAt] = onChange.mock.lastCall as [Date, Date];
    expect([startsAt.getFullYear(), startsAt.getMonth(), startsAt.getDate()]).toEqual([2026, 8, 1]);
    expect([endsAt.getFullYear(), endsAt.getMonth(), endsAt.getDate()]).toEqual([2026, 8, 1]);
  });

  it("moves the draft block while preserving its duration", async () => {
    await act(async () => root.render(<EditorHarness />));
    const timeline = container.querySelector('[data-testid="formal-schedule-timeline"]') as HTMLElement;
    vi.spyOn(timeline, "getBoundingClientRect").mockReturnValue({
      bottom: 960, height: 960, left: 0, right: 300, top: 0, width: 300, x: 0, y: 0,
      toJSON: () => ({})
    });
    const block = container.querySelector('[data-schedule-draft-range-block="true"]') as HTMLElement;

    await act(async () => {
      pointer(block, "pointerdown", 360);
      pointer(block, "pointermove", 400);
      pointer(block, "pointerup", 400);
    });

    expect(rangeText(container)).toBe("10:00–11:00");
  });

  it("enforces a 15-minute minimum when either handle is resized", async () => {
    await act(async () => root.render(<EditorHarness />));
    const timeline = container.querySelector('[data-testid="formal-schedule-timeline"]') as HTMLElement;
    vi.spyOn(timeline, "getBoundingClientRect").mockReturnValue({
      bottom: 960, height: 960, left: 0, right: 300, top: 0, width: 300, x: 0, y: 0,
      toJSON: () => ({})
    });
    const startHandle = container.querySelector('[data-schedule-range-handle="start"]') as HTMLElement;

    await act(async () => {
      pointer(startHandle, "pointerdown", 360);
      pointer(startHandle, "pointermove", 430);
      pointer(startHandle, "pointerup", 430);
    });
    expect(rangeText(container)).toBe("09:45–10:00");

    const endHandle = container.querySelector('[data-schedule-range-handle="end"]') as HTMLElement;
    await act(async () => {
      pointer(endHandle, "pointerdown", 400, 2);
      pointer(endHandle, "pointermove", 350, 2);
      pointer(endHandle, "pointerup", 350, 2);
    });
    expect(rangeText(container)).toBe("09:45–10:00");
  });

  it("prevents selection, movement, and resize when disabled", async () => {
    const onChange = vi.fn();
    await act(async () => root.render(<EditorHarness disabled onChangeSpy={onChange} />));
    const timeline = container.querySelector('[data-testid="formal-schedule-timeline"]') as HTMLElement;
    vi.spyOn(timeline, "getBoundingClientRect").mockReturnValue({
      bottom: 960, height: 960, left: 0, right: 300, top: 0, width: 300, x: 0, y: 0,
      toJSON: () => ({})
    });

    await act(async () => {
      pointer(timeline, "pointerdown", 304);
      pointer(timeline, "pointermove", 344);
      pointer(timeline, "pointerup", 344);
      pointer(container.querySelector('[data-schedule-draft-range-block="true"]') as Element, "pointerdown", 360);
      pointer(container.querySelector('[data-schedule-range-handle="start"]') as Element, "pointerdown", 360);
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(rangeText(container)).toBe("09:00–10:00");
  });
});
