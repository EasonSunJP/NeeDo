import { describe, expect, it } from "vitest";
import { translations } from "../../i18n/translations";
import { getUnifiedCardCopy } from "./copy";

describe("unified card copy", () => {
  it("keeps card-only copy out of the base i18n bundle", () => {
    expect(getUnifiedCardCopy("ja").distanceToYou).toBe("現在地から");
    expect(getUnifiedCardCopy("ja").bookable).toBe("予約可");
    for (const key of ["状态未读取", "距离未读取", "距离你", "评价次数", "完单次数", "查看用户", "时长未读取"]) {
      expect(translations).not.toHaveProperty(key);
    }
  });
});
