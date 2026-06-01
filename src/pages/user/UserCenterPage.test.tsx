import { describe, expect, it } from "vitest";
import source from "./UserCenterPage.tsx?raw";

describe("UserCenterPage", () => {
  it("does not show the recent user feedback section", () => {
    expect(source).not.toContain("近期用户反馈");
    expect(source).not.toContain("userStories.map");
  });

  it("does not show the service guarantee section", () => {
    expect(source).not.toContain('title="服务保障"');
    expect(source).not.toContain("serviceGuarantees.map");
  });

  it("moves shortcut helper copy behind title info triggers", () => {
    expect(source).toContain('info: "店铺、技师、服务"');
    expect(source).toContain('info: "家庭、公司、常用地址"');
    expect(source).toContain('info: "已评价与待回复"');
    expect(source).toContain('info: "保洁、护理、家电维护"');
    expect(source).toContain('label: "会员"');
    expect(source).not.toContain('label: "家庭成员"');
    expect(source).toContain('info: "老人、儿童、共同居住人"');
    expect(source).toContain('label: "KYC身份验证"');
    expect(source).toContain('info: "实名、证件、本人确认"');
    expect(source).toContain('to: "/me/settings/verification"');
    expect(source).not.toContain('caption: "店铺、技师、服务"');
    expect(source).not.toContain('caption: "家庭、公司、常用地址"');
    expect(source).not.toContain('caption: "已评价与待回复"');
    expect(source).not.toContain('caption: "保洁、护理、家电维护"');
    expect(source).not.toContain('caption: "老人、儿童、共同居住人"');
    expect(source).toContain("min-h-[74px]");
    expect(source).toContain("<InfoTooltipTrigger");
  });

  it("keeps the user center on the main bottom navigation", () => {
    expect(source).toContain("navItems={userNavItems}");
    expect(source).not.toContain("<MobileFullscreenPage");
    expect(source).toContain("pb-[calc(132px+env(safe-area-inset-bottom))]");
  });

  it("shows the personal privacy switch with floating options", () => {
    expect(source).toContain("userProfilePrivacyOptions");
    expect(source).toContain('data-testid="user-profile-privacy-control"');
    expect(source).toContain('data-testid="user-profile-privacy-options"');
    expect(source).toContain('ariaLabel="开启隐私模式"');
    expect(source).toContain("absolute right-0 top-[calc(100%+8px)]");
    expect(source).toContain('isEditingProfile ? "min-h-36" : "h-36"');
    expect(source).toContain("mt-auto rounded-[18px]");
    expect(source).toContain("z-[90]");
    expect(source).toContain("UserProfilePrivacyInfoButton");
  });

  it("keeps the personal profile card colors tied to the active UI theme instead of membership kind", () => {
    expect(source).toContain("getThemeProfileSurfaceClassNames()");
    expect(source).not.toContain("getMembershipSurfaceClassNames(membership.kind)");
    expect(source).not.toContain('kind === "black"');
    expect(source).not.toContain('kind === "diamond"');
    expect(source).not.toContain('kind === "gold"');
  });

  it("lets the personal center content scroll underneath the glass header instead of sitting below a fixed spacer", () => {
    expect(source).toContain("showSpacer={false}");
    expect(source).toContain("pt-[calc(env(safe-area-inset-top)+86px)]");
  });
});
