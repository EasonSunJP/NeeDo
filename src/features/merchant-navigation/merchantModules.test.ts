import { describe, expect, it } from "vitest";
import { merchantPrimaryModules } from "./merchantModules";

describe("merchant primary navigation modules", () => {
  it("keeps the expected merchant workbench entries and order", () => {
    expect(merchantPrimaryModules.map((module) => module.labelZh)).toEqual([
      "预约一览",
      "排班",
      "员工",
      "会员",
      "点菜",
      "菜单",
      "场控"
    ]);
  });

  it("marks only the membership module as Test", () => {
    expect(merchantPrimaryModules.find((module) => module.key === "members")?.badge).toBe("Test");
    expect(merchantPrimaryModules.filter((module) => module.badge === "Test")).toHaveLength(1);
  });
});
