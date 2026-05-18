import { describe, expect, it } from "vitest";
import { resolveSelectedScheduleDate, shiftScheduleSelection } from "./model";

describe("technician schedule date selection", () => {
  it("keeps the day view title and selected date in lockstep", () => {
    expect(resolveSelectedScheduleDate("day", "2026-05-06", "2026-05-09")).toBe("2026-05-06");

    expect(shiftScheduleSelection("day", "2026-05-06", "2026-05-06", 1)).toEqual({
      anchorDate: "2026-05-07",
      selectedDate: "2026-05-07"
    });
  });

  it("resolves week selections against the new target period", () => {
    expect(resolveSelectedScheduleDate("week", "2026-05-06", "2026-05-09")).toBe("2026-05-09");
    expect(resolveSelectedScheduleDate("week", "2026-05-06", "2026-05-31")).toBe("2026-05-04");

    expect(shiftScheduleSelection("week", "2026-05-06", "2026-05-09", 1)).toEqual({
      anchorDate: "2026-05-13",
      selectedDate: "2026-05-11"
    });
  });

  it("moves month selections to the first date of the shifted month", () => {
    expect(shiftScheduleSelection("month", "2026-05-06", "2026-05-09", 1)).toEqual({
      anchorDate: "2026-06-06",
      selectedDate: "2026-06-01"
    });
  });
});
