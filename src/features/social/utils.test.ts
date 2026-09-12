import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./utils";

describe("formatRelativeTime", () => {
  const now = new Date("2026-09-13T12:00:00.000Z").getTime();

  it("formats minutes with the selected locale", () => {
    const value = "2026-09-13T11:58:00.000Z";
    expect(formatRelativeTime(value, "zh", now)).toBe("2分钟前");
    expect(formatRelativeTime(value, "ja", now)).toBe("2 分前");
    expect(formatRelativeTime(value, "en", now)).toBe("2 minutes ago");
    expect(formatRelativeTime(value, "ko", now)).toBe("2분 전");
  });

  it("formats hours and days without leaking Chinese or damaged translated fragments", () => {
    expect(formatRelativeTime("2026-09-13T06:00:00.000Z", "ja", now)).toBe("6 時間前");
    expect(formatRelativeTime("2026-09-10T12:00:00.000Z", "ja", now)).toBe("3 日前");
    expect(formatRelativeTime("2026-09-10T12:00:00.000Z", "zh", now)).toBe("3天前");
    expect(formatRelativeTime("2026-09-10T12:00:00.000Z", "en", now)).toBe("3 days ago");
    expect(formatRelativeTime("2026-09-10T12:00:00.000Z", "ko", now)).toBe("3일 전");
  });

  it("uses a locale-aware calendar date after the relative-time window", () => {
    const value = "2026-09-01T12:00:00.000Z";
    expect(formatRelativeTime(value, "ja", now)).toContain("9月1日");
    expect(formatRelativeTime(value, "en", now)).toContain("Sep 1");
  });
});
