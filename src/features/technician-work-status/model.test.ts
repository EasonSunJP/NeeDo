import { describe, expect, it } from "vitest";
import {
  workStatusRange,
  incidentDeviation,
  mapWorkStatusToLegacy,
} from "./model";

describe("work status attendance presentation", () => {
  it("uses Japan month boundaries, not browser UTC month", () => {
    expect(workStatusRange("month", new Date("2026-08-31T15:01:00Z"))).toEqual({
      from: "2026-08-31T15:00:00.000Z",
      to: "2026-09-30T15:00:00.000Z",
    });
  });
  it("counts last seven days including today and starts a week on Monday", () => {
    expect(
      workStatusRange("last7days", new Date("2026-09-06T03:00:00Z")),
    ).toEqual({
      from: "2026-08-30T15:00:00.000Z",
      to: "2026-09-06T15:00:00.000Z",
    });
    expect(workStatusRange("week", new Date("2026-09-06T03:00:00Z"))).toEqual({
      from: "2026-08-30T15:00:00.000Z",
      to: "2026-09-06T15:00:00.000Z",
    });
  });
  it("includes custom ending date and rejects reversed/invalid dates", () => {
    expect(
      workStatusRange("custom", new Date(), "2026-09-01", "2026-09-02"),
    ).toEqual({
      from: "2026-08-31T15:00:00.000Z",
      to: "2026-09-02T15:00:00.000Z",
    });
    expect(() =>
      workStatusRange("custom", new Date(), "2026-09-03", "2026-09-01"),
    ).toThrow();
    expect(() =>
      workStatusRange("custom", new Date(), "2026-02-30", "2026-03-01"),
    ).toThrow();
  });
  it("preserves a one second deviation rather than rounding it to zero", () => {
    expect(incidentDeviation(1)).toEqual({ minutes: 0, seconds: 1 });
    expect(incidentDeviation(61)).toEqual({ minutes: 1, seconds: 1 });
  });
  it("never infers available from a published or missing work state", () => {
    expect(mapWorkStatusToLegacy(undefined)).toBe("off");
    expect(mapWorkStatusToLegacy("on_duty")).toBe("available");
    expect(mapWorkStatusToLegacy("in_service")).toBe("busy");
    expect(mapWorkStatusToLegacy("traveling")).toBe("off");
  });
});
