import { describe, expect, it } from "vitest";
import { translateText } from "../../i18n/translations";
import { platformUserManagementCopy } from "./i18n";
import "./registerI18n";

describe("platform user management copy", () => {
  it("keeps every operations key complete in all five languages", () => {
    const baseKeys = Object.keys(platformUserManagementCopy.zh).sort();
    for (const locale of ["zh", "zh-Hant", "ja", "en", "ko"] as const) {
      expect(Object.keys(platformUserManagementCopy[locale]).sort()).toEqual(baseKeys);
      expect(Object.values(platformUserManagementCopy[locale]).every((value) => value.trim().length > 0)).toBe(true);
    }
  });

  it("includes the five routes and unavailable-capability wording", () => {
    expect(platformUserManagementCopy.zh).toMatchObject({
      userList: "用户列表",
      userGroups: "用户分组",
      globalSettings: "用户全局设置",
      membershipTiers: "会员等级设置",
      membershipBenefits: "会员权益说明",
      capabilityUnavailable: "能力未接通"
    });
  });

  it("registers feature copy when the lazy user-management feature loads", () => {
    expect(translateText("用户列表", "ja")).toBe("ユーザーリスト");
    expect(translateText("NDP 基础经验比例", "en")).toBe("Base NDP experience ratio");
  });
});
