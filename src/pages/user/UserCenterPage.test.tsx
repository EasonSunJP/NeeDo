import { describe, expect, it } from "vitest";
import source from "./UserCenterPage.tsx?raw";

describe("UserCenterPage", () => {
  it("links the collection entry to the formal dynamics and chat-record favorites hub", () => {
    expect(source).toContain('zh: "已收藏的动态与聊天记录"');
    expect(source).toContain('{ label: "我的收藏", info: userCenterCollectionInfo[language]');
    expect(source).toContain('to: "/me/favorites"');
    expect(source).not.toContain('to: "/categories?type=store"');
  });

  it("has no legacy mock or static-preview fallback in the formal user center", () => {
    expect(source).not.toContain('from "../../data/mock"');
    expect(source).not.toContain("legacyOrderShortcuts");
    expect(source).not.toContain("frontend-bypass");
    expect(source).not.toContain("customers[0]");
    expect(source).not.toContain("?? 18420");
    expect(source).not.toContain('|| "Mia"');
  });

  it("does not show the recent user feedback section", () => {
    expect(source).not.toContain("近期用户反馈");
    expect(source).not.toContain("userStories.map");
  });

  it("does not show the service guarantee section", () => {
    expect(source).not.toContain('title="服务保障"');
    expect(source).not.toContain("serviceGuarantees.map");
  });

  it("moves shortcut helper copy behind title info triggers", () => {
    expect(source).toContain('info: userCenterCollectionInfo[language]');
    expect(source).toContain('to: "/me/favorites"');
    expect(source).toContain('zh: "已收藏的动态与聊天记录"');
    expect(source).not.toContain('to: "/categories?type=store"');
    expect(source).toContain('info: "家庭、公司、常用地址"');
    expect(source).toContain('info: "已评价与待回复"');
    expect(source).toContain('info: "保洁、护理、家电维护"');
    expect(source).toContain('label: "会员"');
    expect(source).not.toContain('label: "家庭成员"');
    expect(source).toContain('info: "查看已加入店铺与会员卡状态"');
    expect(source).toContain('to: "/me/memberships"');
    expect(source).toContain("activeShopMembershipCount");
    expect(source).toContain("<TestFeatureBadge");
    expect(source).toContain('label: "KYC身份验证"');
    expect(source).toContain('info: "实名、证件、本人确认"');
    expect(source).toContain('to: "/me/settings/verification"');
    expect(source).not.toContain('caption: "店铺、技师、服务"');
    expect(source).not.toContain('caption: "家庭、公司、常用地址"');
    expect(source).not.toContain('caption: "已评价与待回复"');
    expect(source).not.toContain('caption: "保洁、护理、家电维护"');
    expect(source).not.toContain('caption: "查看已加入店铺与会员卡状态"');
    expect(source).toContain("min-h-[74px]");
    expect(source).toContain("<InfoTooltipTrigger");
  });

  it("removes the bottom navigation from every user-center state", () => {
    expect(source.match(/showBottomNav=\{false\}/g)).toHaveLength(2);
    expect(source).not.toContain("navItems={userNavItems}");
    expect(source).not.toContain("<MobileFullscreenPage");
  });

  it("turns the card action into edit and a red cancel X", () => {
    expect(source).not.toContain('to="/me/settings/account"');
    expect(source).toContain('icon={isEditingProfile ? "x" : "edit"}');
    expect(source).toContain('label={isEditingProfile ? "取消编辑" : "编辑资料"}');
    expect(source).toContain("isEditingProfile ? cancelProfileEdit : startProfileEdit");
    expect(source).toContain("bg-red-500");
  });

  it("shows a viewport-fixed save action only during editing", () => {
    expect(source).toContain('data-testid="user-profile-save-action"');
    expect(source).toContain("fixed inset-x-0 bottom-0");
    expect(source).toContain("env(safe-area-inset-bottom)");
    expect(source).toContain("scroll-pb-[calc(132px+env(safe-area-inset-bottom))]");
    expect(source).toContain("保存并退出编辑模式");
  });

  it("shows the personal privacy switch with floating options", () => {
    expect(source).toContain("userProfilePrivacyOptions");
    expect(source).toContain('data-testid="user-profile-privacy-control"');
    expect(source).toContain('data-testid="user-profile-privacy-options"');
    expect(source).toContain('ariaLabel="开启隐私模式"');
    expect(source).toContain("PrivacyModeConfirmDialog");
    expect(source).toContain("profilePrivacyConfirmOpen");
    expect(source).toContain("confirmProfilePrivacyEnabled");
    expect(source).toContain("absolute right-0 top-[calc(100%+8px)]");
    expect(source).toContain('className="flex min-h-36 min-w-0 flex-1 flex-col"');
    expect(source).not.toContain('isEditingProfile ? "min-h-36" : "h-36"');
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
