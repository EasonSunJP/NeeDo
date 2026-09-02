// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingScheduleSlot } from "../../../features/booking/api";
import { CheckoutTimeRow } from "./CheckoutTimeRow";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const slot = (id: number, startsAt: string, status: BookingScheduleSlot["status"], bookedCount = 0): BookingScheduleSlot => ({
  id,
  serviceId: 12,
  technicianServiceId: null,
  shopId: 7,
  technicianProfileId: 9,
  startsAt,
  endsAt: new Date(new Date(startsAt).getTime() + 3_600_000).toISOString(),
  capacity: 1,
  bookedCount,
  status,
  serviceName: "肩颈调理",
  shopName: "GINZA Calm Body Lab",
  technicianName: "Misaki",
  priceAmount: "8800.00",
  currency: "JPY",
  durationMinutes: 60
});

const slots = [
  slot(1, "2026-09-02T23:00:00.000Z", "available"),
  slot(2, "2026-09-03T01:00:00.000Z", "booked", 1),
  slot(3, "2026-09-03T23:00:00.000Z", "available")
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function click(element: Element) {
  await act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function renderRow(onSelect = vi.fn()) {
  act(() => {
    root.render(
      <CheckoutTimeRow
        date="2026-09-03"
        onSelect={onSelect}
        people="1名"
        selectedSlotId={1}
        slots={slots}
      />
    );
  });
  return onSelect;
}

describe("CheckoutTimeRow", () => {
  it("shows only same-day formal times and disables unavailable rows", async () => {
    const onSelect = renderRow();
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="选择预约时间"]')!;
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    await click(trigger);
    const listbox = container.querySelector('[role="listbox"]')!;
    const options = Array.from(listbox.querySelectorAll<HTMLButtonElement>('[role="option"]'));
    expect(listbox.getAttribute("aria-label")).toBe("2026-09-03 可预约时间");
    expect(options.map((option) => option.textContent?.trim())).toEqual(["08:00", "10:00"]);
    expect(options[0]?.disabled).toBe(false);
    expect(options[1]?.disabled).toBe(true);

    await click(options[1]!);
    expect(onSelect).not.toHaveBeenCalled();
    await click(options[0]!);
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it("closes on Escape and outside pointer interaction", async () => {
    renderRow();
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="选择预约时间"]')!;
    await click(trigger);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector('[role="listbox"]')).toBeNull();

    await click(trigger);
    await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });
});
