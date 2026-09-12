import { describe, expect, it } from "vitest";
import {
  getWeekdayHeaderLabel,
  getWeekdayLabel,
  resolveSelectedScheduleDate,
  shiftScheduleSelection,
} from "./model";

describe("technician schedule date selection", () => {
  it("localizes weekday labels without leaking the Chinese weekday array", () => {
    expect(getWeekdayHeaderLabel("zh")).toEqual(["日", "一", "二", "三", "四", "五", "六"]);
    expect(getWeekdayHeaderLabel("ja")).toEqual(["日", "月", "火", "水", "木", "金", "土"]);
    expect(getWeekdayHeaderLabel("en")).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    expect(getWeekdayHeaderLabel("ko")).toEqual(["일", "월", "화", "수", "목", "금", "토"]);

    expect(getWeekdayLabel("2026-09-14", "ja")).toBe("月曜");
    expect(getWeekdayLabel("2026-09-14", "en")).toBe("Mon");
    expect(getWeekdayLabel("2026-09-14", "ko")).toBe("월요일");
  });

  it("keeps the day view title and selected date in lockstep", () => {
    expect(resolveSelectedScheduleDate("day", "2026-05-06", "2026-05-09")).toBe("2026-05-06");

    expect(shiftScheduleSelection("day", "2026-05-06", "2026-05-06", 1)).toEqual({
      anchorDate: "2026-05-07",
      selectedDate: "2026-05-07"
    });
  });

  it("resolves week selections against the new target period", () => {
    expect(resolveSelectedScheduleDate("week", "2026-05-06", "2026-05-09")).toBe("2026-05-09");
    expect(resolveSelectedScheduleDate("week", "2026-05-06", "2026-05-31")).toBe("2026-05-03");

    expect(shiftScheduleSelection("week", "2026-05-06", "2026-05-09", 1)).toEqual({
      anchorDate: "2026-05-13",
      selectedDate: "2026-05-10"
    });
  });

  it("moves month selections to the first date of the shifted month", () => {
    expect(shiftScheduleSelection("month", "2026-05-06", "2026-05-09", 1)).toEqual({
      anchorDate: "2026-06-06",
      selectedDate: "2026-06-01"
    });
  });
});
