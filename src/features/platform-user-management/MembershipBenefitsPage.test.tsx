import { describe, expect, it } from "vitest";
import pageSource from "./MembershipBenefitsPage.tsx?raw";
import editorSource from "./MembershipBenefitEditor.tsx?raw";

describe("fixed platform membership benefit catalog", () => {
  it("renders exactly eight immutable system benefit codes", () => {
    for (const code of ["ndp_experience", "member_sign_in", "priority_request", "support_service", "exclusive_discount", "member_day", "birthday_gift", "traceless_recall"]) expect(pageSource).toContain(code);
    expect(pageSource).not.toMatch(/添加权益|删除权益|editCode/);
    expect(pageSource).toContain("全局停用优先于各会员等级中的点亮状态");
  });

  it("edits five-language copy, order and status through the formal API", () => {
    for (const locale of ["zh", "zh-Hant", "ja", "en", "ko"]) expect(editorSource).toContain(`"${locale}"`);
    expect(editorSource).toContain("platformUserManagementApi.updateBenefit");
    expect(editorSource).toContain("sortOrder");
    expect(editorSource).toContain("nameTranslations");
    expect(editorSource).toContain("descriptionTranslations");
  });

  it("separates configured status from unconnected delivery capability", () => {
    for (const code of ["support_service", "exclusive_discount", "member_day", "birthday_gift", "traceless_recall"]) expect(pageSource).toContain(code);
    expect(pageSource).toContain("能力未接通");
    expect(pageSource).not.toMatch(/已发放|模拟发放|synthetic/i);
  });

  it("uses current-language formal copy instead of showing storage fields", () => {
    expect(pageSource).toContain("useI18n");
    expect(pageSource).toContain("resolvePlatformBenefitLocalizedText");
    expect(pageSource).not.toContain("{benefit.code}</p>");
    expect(editorSource).toContain("resolvePlatformBenefitLocalizedText");
  });
});
