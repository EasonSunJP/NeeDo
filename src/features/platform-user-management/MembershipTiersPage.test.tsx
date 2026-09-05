import { describe, expect, it } from "vitest";
import pageSource from "./MembershipTiersPage.tsx?raw";
import editorSource from "./MembershipTierEditor.tsx?raw";

describe("fixed platform membership tier editor", () => {
  it("shows exactly four immutable tiers and shared dual previews", () => {
    for (const code of ["free", "silver", "gold", "black_diamond"]) expect(pageSource).toContain(code);
    expect(pageSource).not.toMatch(/添加等级|删除等级|renameTier/);
    expect(editorSource).toContain("PlatformMembershipDetailCard");
    expect(editorSource).toContain("PlatformMembershipSimpleCard");
  });

  it("keeps edits in a draft until explicit save and publish", () => {
    expect(editorSource).toContain("platformUserManagementApi.saveTierDraft");
    expect(editorSource).toContain("platformUserManagementApi.publishTier");
    expect(editorSource).toContain("保存草稿");
    expect(editorSource).toContain("发布");
    expect(editorSource).toContain("isAccessibleMembershipTheme");
    expect(editorSource).toContain("月费价值（NDP）");
    expect(editorSource).toContain("会员经验倍率");
    expect(editorSource).toContain("有效期");
  });

  it("loads formal benefit copy and does not render raw benefit fields", () => {
    expect(pageSource).toContain("platformUserManagementApi.listBenefits");
    expect(pageSource).toContain("benefits={benefits}");
    expect(editorSource).toContain("resolvePlatformBenefitLocalizedText");
    expect(editorSource).not.toContain("{benefit.code}</span>");
  });
});
