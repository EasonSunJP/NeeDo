import { describe, expect, it } from "vitest";
import source from "./UserCenterPage.tsx?raw";

describe("UserCenterPage", () => {
  it("uses the shared localized platform membership tier names", () => {
    expect(source).toContain("platformMembershipTierText(formalData.membership.tierCode, language)");
    expect(source).not.toContain("const platformMembershipTierLabels");
  });
  it("links the collection entry to the formal dynamics and chat-record favorites hub", () => {
    expect(source).toContain('zh: "已收藏的服务、店铺、技师、动态与聊天记录"');
    expect(source).toContain('ja: "お気に入りのサービス・店舗・スタッフ・投稿・チャット履歴"');
    expect(source).toMatch(
      /label: "我的收藏",[\s\S]*info: userCenterCollectionInfo\[language\],[\s\S]*to: "\/me\/favorites"/u,
    );
    expect(source).toContain('to: "/me/favorites"');
    expect(source).not.toContain('to: "/categories?type=store"');
  });

  it("routes payment-method management to its own settings page", () => {
    expect(source).toMatch(
      /label: "支付方式",[^}]*info: "现金、PayPay、PayPal、在线支付",[^}]*to: "\/me\/settings\/payment-methods"/u,
    );
    expect(source).not.toMatch(
      /label: "支付方式",[^}]*to: "\/me\/settings\/account"/u,
    );
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
    expect(source).toContain("info: userCenterCollectionInfo[language]");
    expect(source).toContain('to: "/me/favorites"');
    expect(source).toContain('zh: "已收藏的服务、店铺、技师、动态与聊天记录"');
    expect(source).not.toContain('to: "/categories?type=store"');
    expect(source).toContain('info: "家庭、公司、常用地址"');
    expect(source).toMatch(
      /label: "我的地址",[\s\S]*to: "\/me\/addresses"/u,
    );
    expect(source).not.toContain('to: "/checkout/svc-clean-1"');
    expect(source).toContain('info: "已评价与待回复"');
    expect(source).not.toContain('info: "保洁、护理、家电维护"');
    expect(source).not.toContain('label: "周期预约"');
    expect(source).not.toContain('to: "/categories?type=service"');
    expect(source).toContain('label: "eKYC本人确认"');
    expect(source).toContain('label: "店铺会员"');
    expect(source).not.toContain('label: "家庭成员"');
    expect(source).toContain('info: "查看已加入店铺与会员卡状态"');
    expect(source).toContain('to: "/me/memberships"');
    expect(source).not.toContain("activeShopMembershipCount");
    expect(source).toContain("<TestFeatureBadge");
    expect(source).not.toContain('label: "KYC身份验证"');
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

  it("marks the contact-support account entry with the shared Test badge", () => {
    expect(source).toMatch(
      /label: "联系客服", info: "退款、改期、投诉风控", to: "\/support", test: true/u,
    );
    expect(source).toMatch(
      /accountSettings\.map\([\s\S]*?entry\.test[\s\S]*?<TestFeatureBadge/u,
    );
  });

  it("moves every account explanation behind a title-side info trigger", () => {
    const accountSettingsSource = source.match(
      /const accountSettings: Array<\{[\s\S]*?> = \[([\s\S]*?)\n\];/u,
    )?.[1];

    expect(accountSettingsSource).toBeDefined();
    expect(source).toMatch(
      /const accountSettings: Array<\{[\s\S]*?info: string;[\s\S]*?> = \[[\s\S]*?label: "账号设置",[\s\S]*?info: "手机号、邮箱、登录密码"/u,
    );
    [
      ["账号设置", "手机号、邮箱、登录密码"],
      ["支付方式", "现金、PayPay、PayPal、在线支付"],
      ["发票记录", "企业抬头与历史发票"],
      ["通知设置", "订单、营销、客服提醒"],
      ["隐私与安全", "登录设备、数据授权"],
      ["联系客服", "退款、改期、投诉风控"],
    ].forEach(([label, info]) => {
      expect(accountSettingsSource).toMatch(
        new RegExp(`label: "${label}",[\\s\\S]*?info: "${info}"`, "u"),
      );
    });
    expect(source).toMatch(
      /accountSettings\.map\([\s\S]*?<strong[^>]*>\{entry\.label\}<\/strong>[\s\S]*?<InfoTooltipTrigger[\s\S]*?content=\{entry\.info\}[\s\S]*?label=\{`查看\$\{entry\.label\}说明`\}/u,
    );
    expect(source).not.toContain("entry.caption");
    expect(source).not.toMatch(/const accountSettings: Array<\{[\s\S]*?caption: string;/u);
  });

  it("moves the reservation-list helper copy behind its title info trigger", () => {
    expect(source).toMatch(
      /<strong[^>]*>预约一览<\/strong>[\s\S]*?<InfoTooltipTrigger[\s\S]*?content="查看全部预约、订单状态和详情跳转"[\s\S]*?label="查看预约一览说明"/u,
    );
    expect(source).not.toMatch(
      /<p[^>]*>[\s\S]*?查看全部预约、订单状态和详情跳转[\s\S]*?<\/p>/u,
    );
  });

  it("keeps shortcut cards title-only without trailing status or action badges", () => {
    const serviceToolsSource = source.match(
      /const serviceTools: Array<\{[\s\S]*?\n  \}> = \[([\s\S]*?)\n  \];/u,
    )?.[0];

    expect(serviceToolsSource).toBeDefined();
    expect(serviceToolsSource).not.toContain("value:");
    expect(source).not.toContain("entry.value");
    expect(source).not.toContain('value: "查看"');
    expect(source).not.toContain('value: "管理"');
    expect(source).not.toContain('value: "去认证"');
    expect(source).not.toContain("activeShopMembershipCount");
  });

  it("places eKYC, shop membership and NeeDo benefits in the requested lower-grid order", () => {
    const reviewIndex = source.indexOf('label: "我的评价"');
    const ekycIndex = source.indexOf('label: "eKYC本人确认"');
    const shopMembershipIndex = source.indexOf('label: "店铺会员"');
    const needoBenefitsIndex = source.lastIndexOf("<CurrentMembershipBenefits");

    expect(reviewIndex).toBeGreaterThan(-1);
    expect(ekycIndex).toBeGreaterThan(reviewIndex);
    expect(shopMembershipIndex).toBeGreaterThan(ekycIndex);
    expect(needoBenefitsIndex).toBeGreaterThan(shopMembershipIndex);
    expect(source.match(/<CurrentMembershipBenefits/g)).toHaveLength(1);
  });

  it("removes the bottom navigation from every user-center state", () => {
    expect(source.match(/showBottomNav=\{false\}/g)).toHaveLength(2);
    expect(source).not.toContain("navItems={userNavItems}");
    expect(source).not.toContain("<MobileFullscreenPage");
  });

  it("uses the shared close control instead of a settings action in every user-center state", () => {
    expect(
      source.match(
        /onClose=\{\(\) => navigate\("\/", \{ replace: true \}\)\}/g,
      ),
    ).toHaveLength(2);
    expect(source).not.toContain(
      'action={<IconButton icon="settings" label="打开设置中心" to="/me/settings" />}',
    );
  });

  it("turns the card action into edit and a red cancel X", () => {
    expect(source).not.toContain('to="/me/settings/account"');
    expect(source).toContain('icon={isEditingProfile ? "x" : "edit"}');
    expect(source).toContain(
      'label={isEditingProfile ? "取消编辑" : "编辑资料"}',
    );
    expect(source).toMatch(
      /isEditingProfile\s*\? cancelProfileEdit\s*: startProfileEdit/u,
    );
    expect(source).toContain("bg-red-500");
  });

  it("shows a viewport-fixed save action only during editing", () => {
    expect(source).toContain('data-testid="user-profile-save-action"');
    expect(source).toContain("fixed inset-x-0 bottom-0");
    expect(source).toContain("env(safe-area-inset-bottom)");
    expect(source).toContain(
      "scroll-pb-[calc(132px+env(safe-area-inset-bottom))]",
    );
    expect(source).toContain("保存并退出");
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
    expect(source).toContain(
      'className="flex min-h-36 min-w-0 flex-1 flex-col"',
    );
    expect(source).not.toContain('isEditingProfile ? "min-h-36" : "h-36"');
    expect(source).toContain(
      '<div className="mt-3">{profilePrivacyControl}</div>',
    );
    expect(source).toContain("z-[90]");
    expect(source).toContain("UserProfilePrivacyInfoButton");
  });

  it("passes the persisted privacy control through the post-details slot", () => {
    expect(source).not.toContain("beforeDetailsSlot={profilePrivacyControl}");
    expect(source).toContain("afterDetailsSlot={profilePrivacyControl}");
  });

  it("keeps the personal profile card colors tied to the active UI theme instead of membership kind", () => {
    expect(source).toContain("getThemeProfileSurfaceClassNames()");
    expect(source).not.toContain(
      "getMembershipSurfaceClassNames(membership.kind)",
    );
    expect(source).not.toContain('kind === "black"');
    expect(source).not.toContain('kind === "diamond"');
    expect(source).not.toContain('kind === "gold"');
  });

  it("lets the personal center content scroll underneath the glass header instead of sitting below a fixed spacer", () => {
    expect(source).toContain("showSpacer={false}");
    expect(source).toContain("pt-[calc(env(safe-area-inset-top)+86px)]");
  });
});
