// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AvailabilityCalendar } from "./AvailabilityCalendar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({ language: "ja" })
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-13T03:00:00.000Z"));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

it("enables only dates present in the authoritative availability index", async () => {
  await act(async () => {
    root.render(
      <AvailabilityCalendar
        availableDateKeys={["2026-09-14"]}
        authoritativeAvailability
        onPeopleChange={() => undefined}
        onSelectDate={() => undefined}
        onSelectDay={() => undefined}
        onTimeChange={() => undefined}
        people="1名"
        selectedDate={new Date(2026, 8, 14)}
        selectedDay={14}
        time="21:00"
        timeOptions={["21:00"]}
        title="来店日"
      />
    );
  });

  const day13 = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.querySelector(".availability-calendar-day")?.textContent === "13")!;
  const day14 = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.querySelector(".availability-calendar-day")?.textContent === "14")!;

  expect(day13.disabled).toBe(true);
  expect(day14.disabled).toBe(false);
  expect(container.textContent).not.toContain("TEL");
});

it("renders a triangle when fewer than four technicians or starts remain", async () => {
  await act(async () => {
    root.render(
      <AvailabilityCalendar
        availabilityByDate={{
          "2026-09-14": { availableStartCount: 4, availableTechnicianCount: 3 },
          "2026-09-15": { availableStartCount: 4, availableTechnicianCount: 4 }
        }}
        availableDateKeys={["2026-09-14", "2026-09-15"]}
        authoritativeAvailability
        onPeopleChange={() => undefined}
        onSelectDate={() => undefined}
        onSelectDay={() => undefined}
        onTimeChange={() => undefined}
        people="1名"
        selectedDate={new Date(2026, 8, 14)}
        selectedDay={14}
        time="21:00"
        timeOptions={["21:00"]}
        title="来店日"
      />
    );
  });

  const day14 = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.querySelector(".availability-calendar-day")?.textContent === "14")!;
  const day15 = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.querySelector(".availability-calendar-day")?.textContent === "15")!;
  const day16 = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.querySelector(".availability-calendar-day")?.textContent === "16")!;

  expect(day14.querySelector(".availability-calendar-scarce-marker")).not.toBeNull();
  expect(day14.querySelector(".availability-calendar-available-marker")).toBeNull();
  expect(day15.querySelector(".availability-calendar-available-marker")).not.toBeNull();
  expect(day16.disabled).toBe(true);
  expect(day16.querySelector(".availability-calendar-dash")).not.toBeNull();
});

it("requests only the newly visible month when the user changes months", async () => {
  const onViewMonthChange = vi.fn();
  await act(async () => {
    root.render(
      <AvailabilityCalendar
        authoritativeAvailability
        onPeopleChange={() => undefined}
        onSelectDate={() => undefined}
        onSelectDay={() => undefined}
        onTimeChange={() => undefined}
        onViewMonthChange={onViewMonthChange}
        people="1名"
        selectedDate={new Date(2026, 8, 14)}
        selectedDay={14}
        time=""
        timeOptions={[]}
        title="来店日"
      />
    );
  });

  const nextMonthButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.getAttribute("aria-label") === "下个月")!;
  await act(async () => nextMonthButton.click());

  expect(onViewMonthChange).toHaveBeenCalledTimes(1);
  expect(onViewMonthChange.mock.calls[0]?.[0]).toEqual(new Date(2026, 9, 1));
});

it("keeps merchant-priced dates bookable when their formal starts are not technician-specific", async () => {
  await act(async () => {
    root.render(
      <AvailabilityCalendar
        availabilityByDate={{
          "2026-09-14": { availableStartCount: 4, availableTechnicianCount: 0 }
        }}
        availableDateKeys={["2026-09-14"]}
        authoritativeAvailability
        onPeopleChange={() => undefined}
        onSelectDate={() => undefined}
        onSelectDay={() => undefined}
        onTimeChange={() => undefined}
        people="1名"
        selectedDate={new Date(2026, 8, 14)}
        selectedDay={14}
        technicianCountRelevant={false}
        time="21:00"
        timeOptions={["21:00"]}
        title="来店日"
      />
    );
  });

  const day14 = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.querySelector(".availability-calendar-day")?.textContent === "14")!;
  expect(day14.disabled).toBe(false);
  expect(day14.querySelector(".availability-calendar-available-marker")).not.toBeNull();
});

it("shows an explicit loading state while the authoritative date index is loading", async () => {
  await act(async () => {
    root.render(
      <AvailabilityCalendar
        availabilityLoading
        authoritativeAvailability
        onPeopleChange={() => undefined}
        onSelectDate={() => undefined}
        onSelectDay={() => undefined}
        onTimeChange={() => undefined}
        people="1名"
        selectedDate={new Date(2026, 8, 14)}
        selectedDay={14}
        time=""
        timeOptions={[]}
        title="来店日"
      />
    );
  });

  expect(container.textContent).toContain("予約可能日を読み込み中");
  expect(container.querySelectorAll(".availability-calendar-loading-marker").length).toBeGreaterThan(0);
  expect(container.querySelector(".availability-calendar-dash")).toBeNull();
  expect(container.textContent).not.toContain("予約可能な時間はありません");
  expect(container.querySelectorAll("select")[1]?.querySelector("option")?.textContent).toBe("予約可能な時間を読み込み中…");
  const day14 = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.querySelector(".availability-calendar-day")?.textContent === "14")!;
  expect(day14.disabled).toBe(true);
});

it("localizes the empty formal-time state", async () => {
  await act(async () => {
    root.render(
      <AvailabilityCalendar
        availableDateKeys={[]}
        onPeopleChange={() => undefined}
        onSelectDay={() => undefined}
        onTimeChange={() => undefined}
        people="1名"
        selectedDate={new Date(2026, 8, 14)}
        selectedDay={14}
        time=""
        timeOptions={[]}
        title="来店日"
      />
    );
  });

  expect(container.querySelectorAll("select")[1]?.querySelector("option")?.textContent).toBe("予約可能な時間はありません");
});
