import { describe, expect, it } from "vitest";
import source from "./AdminLayout.tsx?raw";

describe("AdminLayout navigation", () => {
  it("does not render the obstructive bottom-left operations notice", () => {
    expect(source).not.toContain("东京城市组");
    expect(source).not.toContain("19 个待审核商家，36 个工单需要运营介入。");
    expect(source).not.toContain("admin-sidebar-note");
  });

  it("does not expose the removed operations design module", () => {
    expect(source).not.toContain('key: "design"');
    expect(source).not.toContain('title: "设计"');
    expect(source).not.toContain('to: "/admin/decoration"');
    expect(source).not.toContain('label: "装修中心"');
  });

  it("uses the unified user terminology for operations profile management", () => {
    expect(source).toContain('label: "用户资料"');
    expect(source).toContain('children: ["用户档案", "会员等级", "公开状态"]');
    expect(source).not.toContain('label: "客户资料"');
  });
});
