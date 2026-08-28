import { describe, expect, it } from "vitest";
import source from "./BusinessCpsPage.tsx?raw";

describe("BusinessCpsPage affiliate name", () => {
  it("uses the translated Affiliate product name instead of the legacy spelling", () => {
    expect(source).toContain('locationLabel={t("联盟营销")}');
    expect(source).not.toContain('title="NeeDoAfirieito"');
  });

  it("uses the shared home header and exposes identity switching from the affiliate home page", () => {
    expect(source).toContain("<SharedHomeHeader");
    expect(source).toContain('avatarTo="/afirieito/me"');
    expect(source).toContain('locationTo="/afirieito/settings/portal"');
    expect(source).toContain('settingsTo="/afirieito/settings/portal"');
    expect(source).toContain('settingsLabel={t("切换其他身份")}');
    expect(source).toContain('to="/afirieito/plan"');
    expect(source).toContain("搜索推荐任务");
    expect(source).not.toContain("<MobileFullscreenHeader");
  });
});
