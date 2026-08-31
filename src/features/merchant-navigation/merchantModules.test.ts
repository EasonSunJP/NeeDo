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

  it("marks the membership and dine-in modules as Test", () => {
    expect(
      merchantPrimaryModules
        .filter((module) => module.badge === "Test")
        .map((module) => module.key),
    ).toEqual(["members", "dine_order", "menu", "floor_control"]);
  });
});
