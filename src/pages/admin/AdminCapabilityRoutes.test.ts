import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const timelineSource = readFileSync(new URL("./OperationTimelinePage.tsx", import.meta.url), "utf8");
const exchangeSource = readFileSync(new URL("./NeedoExchangeAdminPage.tsx", import.meta.url), "utf8");
const carouselSource = readFileSync(new URL("./CarouselPage.tsx", import.meta.url), "utf8");
const affiliateCarouselSource = readFileSync(new URL("./AffiliateNoticeCarouselPage.tsx", import.meta.url), "utf8");
const affiliateFeeRulesSource = readFileSync(new URL("./AffiliateFeeRulesPage.tsx", import.meta.url), "utf8");
const membershipRewardFeeSource = readFileSync(new URL("./MembershipRewardFeePage.tsx", import.meta.url), "utf8");
const badgesSource = readFileSync(new URL("./AvatarBadgesPage.tsx", import.meta.url), "utf8");
const notificationsSource = readFileSync(new URL("./AdminNotificationsPage.tsx", import.meta.url), "utf8");
const notificationComposeSource = readFileSync(new URL("./AdminNotificationComposePage.tsx", import.meta.url), "utf8");
const notificationGateSource = readFileSync(new URL("./OfficialNotificationCapabilityGate.tsx", import.meta.url), "utf8");
const dispatchSource = readFileSync(new URL("./AdminDispatchPage.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
const translationsSource = readFileSync(
  new URL("../../i18n/translations.ts", import.meta.url),
  "utf8"
);
const affiliateSource = readFileSync(new URL("./AffiliateAdminPage.tsx", import.meta.url), "utf8");
const affiliateCopySource = readFileSync(new URL("./affiliateAdminCopy.ts", import.meta.url), "utf8");
const adminLayoutSource = readFileSync(
  new URL("../../components/admin/AdminLayout.tsx", import.meta.url),
  "utf8"
);
const travelSource = readFileSync(new URL("./TravelSettingsPage.tsx", import.meta.url), "utf8");
const supportSource = readFileSync(new URL("./AdminSupportPage.tsx", import.meta.url), "utf8");

describe("formal platform user-management routes", () => {
  it("registers five independently permissioned lazy workspaces", () => {
    for (const [path, permission, component] of [
      ["/admin/user-groups", "backoffice:user-group:read", "UserGroupsPage"],
      ["/admin/user-global-settings", "backoffice:user-policy:read", "UserGlobalSettingsPage"],
      ["/admin/membership-tiers", "backoffice:membership-tier:read", "MembershipTiersPage"],
      ["/admin/membership-benefits", "backoffice:membership-benefit:read", "MembershipBenefitsPage"]
    ]) {
      expect(appSource).toContain(
        `path="${path}" element={protectPermission("admin", "${permission}", <Suspense fallback={null}><${component} /></Suspense>)}`
      );
    }
    expect(appSource).toContain('path="/admin/users" element={protectPermission("admin", "backoffice:users:read"');
    expect(appSource).toContain('<Suspense fallback={null}><PlatformUserListPage /></Suspense>');
  });

  it("keeps the three old user-management entries as replace redirects", () => {
    expect(appSource).toContain('path="/admin/crm" element={protect("admin", <LegacyUserManagementRedirect source="crm" />)}');
    expect(appSource).toContain('path="/admin/data" element={protect("admin", <LegacyUserManagementRedirect source="data"><DataCenterPage /></LegacyUserManagementRedirect>)}');
    expect(appSource).toContain('<LegacyUserManagementRedirect source="users"><Suspense fallback={null}><PlatformUserListPage /></Suspense></LegacyUserManagementRedirect>');
  });
});

describe("removed admin design modules", () => {
  it("does not register or import either deleted design page", () => {
    expect(appSource).not.toContain('./pages/admin/DecorationPage');
    expect(appSource).not.toContain('./pages/merchant-admin/MerchantAdminDesignPage');
    expect(appSource).not.toContain('path="/admin/decoration"');
    expect(appSource).not.toContain('path="/merchant-admin/design"');
  });

  it("does not retain the deleted merchant editor styles or copy", () => {
    expect(stylesSource).not.toContain("merchant-design-preview");
    expect(stylesSource).not.toContain("merchant-phone-preview");
    expect(stylesSource).not.toContain("merchant-live-preview");
    expect(translationsSource).not.toContain("店铺展示设计");
    expect(translationsSource).not.toContain("UI 装修配置");
    expect(translationsSource).not.toContain("手机模拟器");
  });
});

describe("operations timeline production capability gate", () => {
  it("does not present sample operations history as persisted records", () => {
    expect(timelineSource).not.toContain("../../data/mock");
    expect(timelineSource).not.toContain("operationTimeline");
    expect(timelineSource).not.toContain("sortedTimeline");
  });

  it("states the persistence, workflow, permission, and export prerequisites", () => {
    expect(timelineSource).toContain("正式运营时间线尚未启用");
    expect(timelineSource).toContain("OperationEvent 与 OperationalIncident 表和 migration");
    expect(timelineSource).toContain("创建、指派、跟进、解决与归档状态机 API");
    expect(timelineSource).toContain("跨城市 RBAC 与不可变审计链路");
    expect(timelineSource).toContain("服务端筛选、分页、聚合与导出合同");
    expect(timelineSource).toContain("当前不会展示模拟运营记录、负责人、城市、优先级或处理状态");
  });
});

describe("official notification production capability gate", () => {
  it("does not treat bundled updates or browser storage as sent notices", () => {
    expect(notificationsSource).not.toContain("readStoredOfficialNotices");
    expect(notificationsSource).not.toContain("updateNotices");
    expect(notificationComposeSource).not.toContain("saveStoredOfficialNotice");
    expect(notificationComposeSource).not.toContain("useEntityStore");
  });

  it("states the formal broadcast delivery prerequisites on list and compose routes", () => {
    for (const pageSource of [notificationsSource, notificationComposeSource]) {
      expect(pageSource).toContain("OfficialNotificationCapabilityGate");
    }
    expect(notificationGateSource).toContain("OfficialNotice、NoticeAudience 与 NoticeDelivery 表和 migration");
    expect(notificationGateSource).toContain("草稿、审核、定时发送、取消与归档状态机 API");
    expect(notificationGateSource).toContain("目标快照、幂等投递、重试、失败回执与审计");
    expect(notificationGateSource).toContain("当前不会展示模拟通知、更新记录、目标账号或发送状态");
  });
});

describe("platform content and media production capability gates", () => {
  it("does not publish carousel or ornament data from browser stores", () => {
    expect(carouselSource).not.toContain("useCarouselStore");
    expect(carouselSource).not.toContain("useEntityStore");
    expect(badgesSource).not.toContain("useEntityStore");
    expect(badgesSource).not.toContain("buildOrnamentsSeed");
  });

  it("replaces the carousel capability gate with fixed-scene formal editors", () => {
    expect(carouselSource).toMatch(/<LocalizedCarouselEditor\s+scene="user-home"/);
    expect(affiliateCarouselSource).toMatch(/<LocalizedCarouselEditor\s+scene="affiliate-home-notice"/);
    expect(affiliateCarouselSource).toContain("<AnnouncementEditor");
    expect(carouselSource).not.toContain("PlatformContentCapabilityGate");
    expect(affiliateCarouselSource).not.toMatch(/useSearchParams|location\.search|scene=\{/);
  });

  it("keeps the remaining ornament route behind explicit formal publication prerequisites", () => {
    expect(badgesSource).toContain("PlatformContentCapabilityGate");
    expect(badgesSource).toContain("当前不会展示模拟");
    expect(badgesSource).toContain("OrnamentDefinition、OrnamentGrant 与 RuleEvaluation 表和 migration");
  });
});

describe("localized carousel backoffice routes", () => {
  it("registers two independently permissioned routes", () => {
    expect(appSource).toContain(
      'path="/admin/carousel" element={protectPermission("admin", "page:backoffice-user-home-carousel", <CarouselPage />)}'
    );
    expect(appSource).toContain(
      'path="/admin/afirieito/announcements/carousel" element={protectPermission("admin", "page:backoffice-affiliate-notice-carousel", <AffiliateNoticeCarouselPage />)}'
    );
  });

  it("shows separate menu labels with separate read permissions under the expected sections", () => {
    expect(adminLayoutSource).toContain('label: "用户端首页轮播图"');
    expect(adminLayoutSource).toContain('permission: "page:backoffice-user-home-carousel"');
    expect(adminLayoutSource).toContain('label: "联盟营销公告轮播"');
    expect(adminLayoutSource).toContain('permission: "page:backoffice-affiliate-notice-carousel"');
    expect(adminLayoutSource.indexOf('label: "联盟营销公告轮播"')).toBeGreaterThan(
      adminLayoutSource.indexOf('badge: "TEST"')
    );
  });
});

describe("NeeDo exchange administration production capability gate", () => {
  it("does not build demand or information records from the demo feed", () => {
    expect(exchangeSource).not.toContain("../../data/mock");
    expect(exchangeSource).not.toContain("../mobile/NeedoExchangePage");
    expect(exchangeSource).not.toContain("getNeedoFeedPosts");
    expect(exchangeSource).not.toContain("buildPhone");
  });

  it("states the persisted exchange lifecycle prerequisites", () => {
    expect(exchangeSource).toContain("正式需求与情报中心尚未启用");
    expect(exchangeSource).toContain("ExchangePost、Demand、Offer 与 ExchangeReply 表和 migration");
    expect(exchangeSource).toContain("创建、审核、发布、过期、驳回与撤回状态机 API");
    expect(exchangeSource).toContain("发布身份、联系方式脱敏与范围 RBAC");
    expect(exchangeSource).toContain("匹配、预约、支付、审计、分页与导出合同");
    expect(exchangeSource).toContain("当前不会展示模拟需求、情报、发布主体、联系方式、互动或支付履约数据");
  });
});

describe("platform dispatch production capability gate", () => {
  it("does not redirect a platform operator into a merchant-scoped workspace", () => {
    expect(appSource).toContain('path="/admin/dispatch" element={protect("admin", <AdminDispatchPage />)}');
    expect(appSource).not.toContain(
      'path="/admin/dispatch" element={protect("admin", <Navigate replace to="/merchant-admin/dispatch-center/current" />)}'
    );
  });

  it("states the cross-shop dispatch persistence and workflow prerequisites", () => {
    expect(dispatchSource).toContain("正式跨店派单中心尚未启用");
    expect(dispatchSource).toContain("DispatchJob、DispatchAssignment 与 DispatchException 表和 migration");
    expect(dispatchSource).toContain("创建、分派、接单、改派、升级与关闭状态机 API");
    expect(dispatchSource).toContain("跨店技师可用性、冲突锁、范围 RBAC 与不可变审计");
    expect(dispatchSource).toContain("服务端筛选、分页、聚合、SLA 与导出合同");
    expect(dispatchSource).toContain("当前不会跳转到任何单店商户工作区");
  });
});

describe("affiliate administration formal task review", () => {
  it("does not mount the browser-local CPS workspace on the formal admin route", () => {
    expect(appSource).toContain(
      'path="/admin/afirieito" element={protect("admin", <AffiliateAdminPage />)}'
    );
    expect(appSource).not.toContain('import { CpsPage } from "./pages/admin/CpsPage"');
    expect(appSource).not.toContain(
      'path="/admin/afirieito" element={protect("admin", <CpsPage />)}'
    );
  });

  it("uses the requested localized name and protects the operations navigation entry", () => {
    expect(adminLayoutSource).toContain('title: "联盟营销"');
    expect(adminLayoutSource).toContain('label: "联盟营销任务"');
    expect(adminLayoutSource).toContain('permission: "menu:backoffice-affiliate"');
    expect(adminLayoutSource).not.toContain('/admin/afirieito?module=plans');
    expect(adminLayoutSource).not.toContain('/admin/afirieito?module=attribution');
    expect(adminLayoutSource).not.toContain('/admin/afirieito?module=settlement');
    expect(adminLayoutSource).not.toContain('/admin/afirieito?module=promoters');
  });

  it("marks the operations affiliate section as a test surface", () => {
    expect(adminLayoutSource).toContain('badge: "TEST"');
    expect(adminLayoutSource).toContain("section.badge");
    expect(adminLayoutSource).toContain(
      'aria-label={section.badge ? `${section.title} ${section.badge}` : section.title}'
    );
    expect(adminLayoutSource).toContain("absolute -right-1 -top-2");
  });

  it("connects the page to the formal paginated task and review APIs", () => {
    expect(affiliateSource).toMatch(/backofficeRealDataApi\s*\.\s*affiliateTasks/);
    expect(affiliateSource).toContain("backofficeRealDataApi.affiliateTask");
    expect(affiliateSource).toContain("backofficeRealDataApi.approveAffiliateTask");
    expect(affiliateSource).toContain("backofficeRealDataApi.rejectAffiliateTask");
    expect(affiliateSource).toContain('permission="button:backoffice-affiliate-review"');
    expect(affiliateCopySource).toContain('formalData: "正式数据库"');
    expect(affiliateCopySource).toContain('rbac: "范围 RBAC"');
    expect(affiliateCopySource).toContain('audit: "不可变审计"');
    expect(affiliateCopySource).toContain('title: "Affiliate"');
    expect(affiliateCopySource).toContain('title: "アフィリエイト"');
    expect(affiliateSource).not.toContain("正式 Afirieito 管理尚未启用");
    expect(affiliateSource).not.toMatch(/localStorage|data\/mock|CpsPage/);
  });
});

describe("affiliate platform fee operations", () => {
  it("registers the dedicated read-permission route", () => {
    expect(appSource).toContain('import { AffiliateFeeRulesPage } from "./pages/admin/AffiliateFeeRulesPage"');
    expect(appSource).toContain(
      'path="/admin/afirieito/fee-rules" element={protectPermission("admin", "page:backoffice-affiliate-fee-rule", <AffiliateFeeRulesPage />)}'
    );
  });

  it("shows a dedicated item below Affiliate tasks in the TEST section", () => {
    expect(adminLayoutSource).toContain('label: "平台抽成规则"');
    expect(adminLayoutSource).toContain('to: "/admin/afirieito/fee-rules"');
    expect(adminLayoutSource).toContain('permission: "page:backoffice-affiliate-fee-rule"');
    expect(adminLayoutSource.indexOf('label: "平台抽成规则"')).toBeGreaterThan(
      adminLayoutSource.indexOf('label: "联盟营销任务"')
    );
  });

  it("keeps the page on formal fee-rule APIs and immutable version creation", () => {
    expect(affiliateFeeRulesSource).toContain("affiliatePlatformFeeApi.getGlobalSummary()");
    expect(affiliateFeeRulesSource).toContain("affiliatePlatformFeeApi.createRule");
    expect(affiliateFeeRulesSource).not.toMatch(/localStorage|data\/mock|backofficeRealDataApi\.shops/);
  });
});

describe("membership reward fee operations", () => {
  it("registers the exact read-permission route and finance navigation item", () => {
    expect(appSource).toContain('import { MembershipRewardFeePage } from "./pages/admin/MembershipRewardFeePage"');
    expect(appSource).toContain('path="/admin/finance/membership-reward-fee" element={protectPermission("admin", "page:backoffice-membership-reward-fee", <MembershipRewardFeePage />)}');
    expect(adminLayoutSource).toContain('label: "会员返点平台费"');
    expect(adminLayoutSource).toContain('to: "/admin/finance/membership-reward-fee"');
    expect(adminLayoutSource).toContain('permission: "page:backoffice-membership-reward-fee"');
    expect(adminLayoutSource).toContain('children: ["TEST", "费率快照", "版本历史"]');
  });

  it("keeps the page on the dedicated formal fee API", () => {
    expect(membershipRewardFeeSource).toContain("membershipRewardFeeApi.getOverview");
    expect(membershipRewardFeeSource).not.toMatch(/affiliatePlatformFeeApi|backofficeRealDataApi|localStorage/);
  });
});

describe("travel and map provider production capability gate", () => {
  it("does not present static fare tables or inert save/import actions as enabled settings", () => {
    expect(travelSource).not.toContain("areaTravelFareRules");
    expect(travelSource).not.toContain("buildDistanceFarePreview");
    expect(travelSource).not.toContain("DataTable");
    expect(travelSource).not.toContain("导入城市车费");
    expect(travelSource).not.toContain("保存出行规则");
  });

  it("states the deferred provider and formal policy prerequisites", () => {
    expect(travelSource).toContain("地图、导航与出行计费尚未启用");
    expect(travelSource).toContain("ExternalProviderConfig、TravelPolicy 与 RouteEstimate 表和 migration");
    expect(travelSource).toContain("地址、经纬度、出行方式与人工交通费上限的正式配置 API");
    expect(travelSource).toContain(
      "地图/路线供应商适配器、限流、超时、缓存与 provider_unavailable 合同"
    );
    expect(travelSource).toContain("计费版本、审批、范围 RBAC、审计、分页与导出");
    expect(travelSource).toContain("当前不会展示静态城市车费、试算结果或“已启用”交通方式");
    expect(travelSource).toContain("地址和经纬度基础数据仍可由正式店铺/订单接口保存");
  });
});

describe("support case management production capability gate", () => {
  it("does not expose unverified contact details or inert contact actions", () => {
    expect(supportSource).not.toContain("support@needo.jp");
    expect(supportSource).not.toContain("@needo_support");
    expect(supportSource).not.toContain("+81 3-6824-7788");
    expect(supportSource).not.toContain("复制联系信息");
    expect(supportSource).not.toContain("打开值班说明");
  });

  it("states the support ticket, SLA, privacy and delivery prerequisites", () => {
    expect(supportSource).toContain("正式客服工单与值班联系尚未启用");
    expect(supportSource).toContain(
      "SupportTicket、SupportMessage、SupportAttachment 与 OnCallPolicy 表和 migration"
    );
    expect(supportSource).toContain("创建、分派、优先级、SLA、升级、解决、关闭与重开状态机 API");
    expect(supportSource).toContain("租户范围 RBAC、敏感信息脱敏、附件权限与不可变审计");
    expect(supportSource).toContain("通知投递、值班配置、服务端搜索、分页、SLA 聚合与导出");
    expect(supportSource).toContain("官方邮箱、LINE、电话和工作时间必须来自版本化配置");
    expect(supportSource).toContain("当前不会展示未经验证的联系方式、模拟工单、SLA 或值班状态");
  });
});
