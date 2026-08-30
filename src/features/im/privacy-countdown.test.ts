import { describe, expect, it } from "vitest";
import {
  GROUP_PRIVACY_COUNTDOWN_LIMIT_MESSAGE,
  createCountdownInput,
  defaultGroupPrivacyCountdownInput,
  formatConversationDisappearingCountdown,
  groupPrivacyCountdownLabels,
  hasCountdownInputOverflow,
  parseCountdownInput,
  sanitizeCountdownInputValue,
} from "./privacy-countdown";

describe("group privacy countdown", () => {
  it("exposes only hour and minute inputs", () => {
    expect(groupPrivacyCountdownLabels).toEqual([
      { field: "hours", label: "小时", suffix: "小时" },
      { field: "minutes", label: "分钟", suffix: "分钟" },
    ]);
    expect(defaultGroupPrivacyCountdownInput).toEqual({ hours: "", minutes: "" });
  });

  it("keeps overflow digits visible instead of clamping them", () => {
    expect(sanitizeCountdownInputValue("hours", "1a00")).toBe("100");
    expect(sanitizeCountdownInputValue("minutes", "060")).toBe("60");
  });

  it.each([
    [{ hours: "99", minutes: "59" }, false],
    [{ hours: "100", minutes: "0" }, true],
    [{ hours: "0", minutes: "60" }, true],
  ] as const)("validates %o overflow as %s", (input, expected) => {
    expect(hasCountdownInputOverflow(input)).toBe(expected);
  });

  it("converts valid editor input without months or days", () => {
    expect(parseCountdownInput({ hours: "99", minutes: "59" })).toEqual({
      months: 0,
      days: 0,
      hours: 99,
      minutes: 59,
    });
  });

  it("flattens legacy month/day values into total hours", () => {
    expect(createCountdownInput({ months: 0, days: 2, hours: 3, minutes: 4 })).toEqual({
      hours: "51",
      minutes: "4",
    });
    expect(
      formatConversationDisappearingCountdown({ months: 0, days: 2, hours: 3, minutes: 4 }),
    ).toBe("51小时 4分钟");
  });

  it("exports the approved overflow copy", () => {
    expect(GROUP_PRIVACY_COUNTDOWN_LIMIT_MESSAGE).toBe("时间上限最大为99小时59分钟");
  });
});
