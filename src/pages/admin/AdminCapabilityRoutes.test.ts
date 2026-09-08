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
const notificationWorkspaceSource = readFileSync(
  new URL("../../features/official-notices/OfficialNoticeWorkspace.tsx", import.meta.url),
  "utf8"
);
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
const merchantAdminLayoutSource = readFileSync(
  new URL("../../components/merchant-admin/MerchantAdminLayout.tsx", import.meta.url),
  "utf8"
);
const travelSource = readFileSync(new URL("./TravelSettingsPage.tsx", import.meta.url), "utf8");
const supportSource = readFileSync(new URL("./AdminSupportPage.tsx", import.meta.url), "utf8");

describe("operations system settings route", () => {
  it("separates system settings from role management", () => {
    expect(adminLayoutSource).toContain('to: "/admin/settings/system"');
    expect(adminLayoutSource).not.toContain('to: "/admin/roles?module=system"');
    expect(appSource).toContain('path="/admin/settings/system" element={protectPermission("admin", "backoffice:system-settings:read"');
    expect(appSource).toContain('path="/admin/roles" element={protectPermission("admin", "page:role-management"');
  });
});

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
    expect(appSource).toContain('path="/admin/data" element={protect("admin", <LegacyUserManagementRedirect source="data"><Suspense fallback={null}><DataCenterPage /></Suspense></LegacyUserManagementRedirect>)}');
    expect(appSource).toContain('<LegacyUserManagementRedirect source="users"><Suspense fallback={null}><PlatformUserListPage /></Suspense></LegacyUserManagementRedirect>');
  });
});

describe("formal partner finance administration routes", () => {
  it("loads management workspaces on demand behind their permissions", () => {
    for (const component of ["AgentsPage", "OperatingCostsPage", "ServiceSearchAnalyticsPage"]) {
      expect(appSource).toContain(`const ${component} = lazy(() => import("./pages/admin/${component}")`);
      expect(appSource).not.toContain(`import { ${component} } from`);
    }
    expect(appSource).toContain(
      'path="/admin/settings/service-search" element={protectPermission("admin", "backoffice:service-taxonomy:read", <Suspense fallback={null}><ServiceSearchAnalyticsPage /></Suspense>)}'
    );
  });

  it("registers read-permissioned agent detail and operating-cost pages", () => {
    expect(appSource).toContain(
      'path="/admin/agents" element={protectPermission("admin", "backoffice:agent:read", <Suspense fallback={null}><AgentsPage /></Suspense>)}'
    );
    expect(appSource).toContain(
      'path="/admin/agents/:agentPublicId" element={protectPermission("admin", "backoffice:agent:read", <Suspense fallback={null}><AgentsPage /></Suspense>)}'
    );
    expect(appSource).toContain(
      'path="/admin/finance/operating-costs" element={protectPermission("admin", "backoffice:operating-cost:read", <Suspense fallback={null}><OperatingCostsPage /></Suspense>)}'
    );
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

  it("reads formal version publications without enabling incident management", () => {
    expect(timelineSource).toContain("releasePublicationsApi");
    expect(timelineSource).toContain("AdminEventTimeline");
    expect(timelineSource).toContain("FormalTimelinePagination");
    expect(timelineSource).not.toContain("正式运营时间线尚未启用");
    expect(timelineSource).toContain("showCommentComposer={false}");
  });
});

describe("formal official notification workspaces", () => {
  it("does not treat bundled updates or browser storage as sent notices", () => {
    expect(notificationsSource).not.toContain("readStoredOfficialNotices");
    expect(notificationsSource).not.toContain("updateNotices");
    expect(notificationComposeSource).not.toContain("saveStoredOfficialNotice");
    expect(notificationComposeSource).not.toContain("useEntityStore");
  });

  it("uses the formal paginated management, lifecycle, and inbox APIs", () => {
    expect(notificationsSource).toContain("OfficialNoticeManagement");
    expect(notificationComposeSource).toContain("OfficialNoticeComposer");
    for (const method of ["listManaged", "createDraft", "updateDraft", "planDraft", "cancelManaged", "archiveManaged", "retryManaged", "listInbox", "markRead"]) {
      expect(notificationWorkspaceSource).toContain(`officialNoticesApi.${method}`);
    }
    expect(notificationWorkspaceSource).toContain("受众由服务端按当前权限与店铺范围生成快照");
    expect(notificationWorkspaceSource).not.toMatch(/localStorage|sessionStorage|data\/mock|userIds|shopId/);
    expect(appSource).not.toContain("OfficialNoticeAutoPopup");
  });

  it("registers separately permissioned platform and merchant management routes", () => {
    expect(appSource).toContain('path="/admin/notifications" element={protectPermission("admin", "page:backoffice-official-notice"');
    expect(appSource).toContain('path="/admin/notifications/inbox" element={protect("admin"');
    expect(appSource).toContain('path="/admin/notifications/compose" element={protectPermission("admin", "button:backoffice-official-notice-create"');
    expect(notificationWorkspaceSource).toContain('"button:backoffice-official-notice-send"');
    expect(appSource).toContain('path="/merchant-admin/notifications" element={protectPermission("merchant", "merchant-admin:notice:read"');
    expect(appSource).toContain('path="/merchant-admin/notifications/compose" element={protectPermission("merchant", "merchant-admin:notice:create"');
    expect(notificationWorkspaceSource).toContain('"merchant-admin:notice:send"');
    expect(appSource).toContain('path="/merchant-admin/notifications/inbox" element={protect("merchant"');
    expect(adminLayoutSource).toContain('permission: "page:backoffice-official-notice"');
    expect(merchantAdminLayoutSource).toContain('rbacPermission: "merchant-admin:notice:read"');
    expect(merchantAdminLayoutSource).toContain('to="/merchant-admin/notifications/inbox"');
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

describe("formal travel provider and fare policy operations workspace", () => {
  it("gates both the route and navigation item with the formal read permission", () => {
    expect(appSource).toContain(
      'path="/admin/travel-settings" element={protectPermission("admin", "backoffice:travel-fare:read", <TravelSettingsPage />)}'
    );
    expect(adminLayoutSource).toContain(
      '{ label: "出行能力状态", to: "/admin/travel-settings", icon: "行", permission: "backoffice:travel-fare:read"'
    );
  });

  it("does not present static fare tables or fake fallback results", () => {
    expect(travelSource).not.toContain("areaTravelFareRules");
    expect(travelSource).not.toContain("buildDistanceFarePreview");
    expect(travelSource).not.toContain("导入城市车费");
    expect(travelSource).not.toContain("保存出行规则");
    expect(travelSource).toContain("不会使用静态距离、模拟路线或伪造价格兜底");
  });

  it("loads redacted provider status and paginated persisted policies", () => {
    expect(travelSource).toContain("travelFareApi.getProviderStatus()");
    expect(travelSource).toContain("travelFareApi.listPolicies");
    expect(travelSource).toContain("正在加载路线供应商与费率策略");
    expect(travelSource).toContain("供应商或策略读取失败");
    expect(travelSource).toContain("Geoapify 尚未配置");
    expect(travelSource).toContain("没有符合条件的店铺费率策略");
    expect(travelSource).toContain("上一页");
    expect(travelSource).toContain("下一页");
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
