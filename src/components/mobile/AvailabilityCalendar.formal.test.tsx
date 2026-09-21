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
