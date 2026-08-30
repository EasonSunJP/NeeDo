import { describe, expect, it } from "vitest";
import source from "./CardPlanWorkspace.tsx?raw";

describe("CardPlanWorkspace UI contract", () => {
  it("provides the six-step NDP-only plan workflow and Test status", () => {
    for (const copy of ["基本信息", "发卡初始值", "基础返点", "加码规则与上限", "成本试算", "发布确认"]) expect(source).toContain(copy);
    for (const copy of ["客户获得", "平台费率", "平台费", "店铺总成本"]) expect(source).toContain(copy);
    expect(source).toContain("<TestFeatureBadge");
    expect(source).toContain("merchantShopMembershipApi.previewCardPlan");
    expect(source).not.toMatch(/冻结NDP|折扣|礼物|赠送服务/);
  });

  it("keeps management and publish controls behind explicit permissions", () => {
    expect(source).toContain("canManage");
    expect(source).toContain("canPublish");
    expect(source).toContain("保存草稿");
    expect(source).toContain("发布方案");
    expect(source).toContain("只读查看");
  });

  it("preserves the editor after a failed save or preview", () => {
    expect(source).toContain("setFeedback(describeCardPlanError(error))");
    expect(source).not.toContain("catch (error) { setEditor(createEmptyCardPlanEditor())");
  });
});
