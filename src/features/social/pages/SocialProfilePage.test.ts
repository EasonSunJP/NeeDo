import { describe, expect, it } from "vitest";
import unifiedSocialUiSource from "../components/UnifiedSocialUi.tsx?raw";
import socialProfilePageSource from "./SocialProfilePage.tsx?raw";

describe("SocialProfilePage core-read technician fallback", () => {
  it("renders numeric API technicians with the social profile shell", () => {
    expect(socialProfilePageSource).toContain("CoreReadTechnicianSocialProfilePage");
    expect(socialProfilePageSource).toContain("coreReadApi.getTechnicianDetail(id)");
    expect(socialProfilePageSource).toContain("SocialProfileHeader");
    expect(socialProfilePageSource).toContain("buildCoreTechnicianSocialPosts");
    expect(socialProfilePageSource).toContain("relatedShopEntries");
    expect(socialProfilePageSource).toContain("scheduleTechnicianId");
    expect(socialProfilePageSource).toContain("profileOverrides");
    expect(socialProfilePageSource).toContain("SocialPostItem");
    expect(socialProfilePageSource).toContain("SocialProfileTabs");
    expect(socialProfilePageSource).toContain("SocialProfileTopBar");
    expect(socialProfilePageSource).not.toContain("CoreTechnicianActivityCard");
    expect(socialProfilePageSource).not.toContain('title="技师动态"');
    expect(socialProfilePageSource).not.toContain("真实 API 数据源");
  });
});

describe("SocialProfileTopBar shared controls", () => {
  it("uses the shared back and metric action controls without a close action", () => {
    expect(unifiedSocialUiSource).toContain('label="返回资料页"');
    expect(unifiedSocialUiSource).toContain("<IconMetricAction");
    expect(unifiedSocialUiSource).toContain('icon="heart"');
    expect(unifiedSocialUiSource).toContain('icon="share"');
    expect(unifiedSocialUiSource).toContain("shareContent({");
    expect(unifiedSocialUiSource).not.toContain('label="关闭资料页"');
  });
});
