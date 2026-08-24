import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const timelineSource = readFileSync(new URL("./OperationTimelinePage.tsx", import.meta.url), "utf8");
const exchangeSource = readFileSync(new URL("./NeedoExchangeAdminPage.tsx", import.meta.url), "utf8");
const carouselSource = readFileSync(new URL("./CarouselPage.tsx", import.meta.url), "utf8");
const decorationSource = readFileSync(new URL("./DecorationPage.tsx", import.meta.url), "utf8");
const badgesSource = readFileSync(new URL("./AvatarBadgesPage.tsx", import.meta.url), "utf8");
const notificationsSource = readFileSync(new URL("./AdminNotificationsPage.tsx", import.meta.url), "utf8");
const notificationComposeSource = readFileSync(new URL("./AdminNotificationComposePage.tsx", import.meta.url), "utf8");
const notificationGateSource = readFileSync(new URL("./OfficialNotificationCapabilityGate.tsx", import.meta.url), "utf8");
const dispatchSource = readFileSync(new URL("./AdminDispatchPage.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");
const affiliateSource = readFileSync(new URL("./AffiliateAdminPage.tsx", import.meta.url), "utf8");
const adminLayoutSource = readFileSync(
  new URL("../../components/admin/AdminLayout.tsx", import.meta.url),
  "utf8"
);
const travelSource = readFileSync(new URL("./TravelSettingsPage.tsx", import.meta.url), "utf8");

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
  it("does not publish carousel, decoration, or ornament data from browser stores", () => {
    expect(carouselSource).not.toContain("useCarouselStore");
    expect(carouselSource).not.toContain("useEntityStore");
    expect(decorationSource).not.toContain("../../data/mock");
    expect(decorationSource).not.toContain("profileCardBackgroundStore");
    expect(badgesSource).not.toContain("useEntityStore");
    expect(badgesSource).not.toContain("buildOrnamentsSeed");
  });

  it("keeps all three routes behind explicit formal publication prerequisites", () => {
    for (const pageSource of [carouselSource, decorationSource, badgesSource]) {
      expect(pageSource).toContain("PlatformContentCapabilityGate");
      expect(pageSource).toContain("当前不会展示模拟");
    }
    expect(carouselSource).toContain("CarouselScene、CarouselSlide 与 ContentVersion 表和 migration");
    expect(decorationSource).toContain("PageLayout、PageComponent 与 ContentVersion 表和 migration");
    expect(badgesSource).toContain("OrnamentDefinition、OrnamentGrant 与 RuleEvaluation 表和 migration");
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

describe("affiliate administration production capability gate", () => {
  it("does not mount the browser-local CPS workspace on the formal admin route", () => {
    expect(appSource).toContain(
      'path="/admin/afirieito" element={protect("admin", <AffiliateAdminPage />)}'
    );
    expect(appSource).not.toContain('import { CpsPage } from "./pages/admin/CpsPage"');
    expect(appSource).not.toContain(
      'path="/admin/afirieito" element={protect("admin", <CpsPage />)}'
    );
  });

  it("collapses unsupported affiliate modules into one capability-status entry", () => {
    expect(adminLayoutSource).toContain('label: "Afirieito 能力状态"');
    expect(adminLayoutSource).not.toContain('/admin/afirieito?module=plans');
    expect(adminLayoutSource).not.toContain('/admin/afirieito?module=attribution');
    expect(adminLayoutSource).not.toContain('/admin/afirieito?module=settlement');
    expect(adminLayoutSource).not.toContain('/admin/afirieito?module=promoters');
  });

  it("states the attribution, commission, settlement, wallet and audit prerequisites", () => {
    expect(affiliateSource).toContain("正式 Afirieito 管理尚未启用");
    expect(affiliateSource).toContain(
      "AffiliateProgram、Promoter、AffiliateLink、AttributionTouch 与 CommissionClaim 表和 migration"
    );
    expect(affiliateSource).toContain("申请、审核、链接签发、归因、佣金锁定、冲正与结算状态机 API");
    expect(affiliateSource).toContain("防重复归因、幂等事件、范围 RBAC、风控与不可变审计");
    expect(affiliateSource).toContain("钱包账本、结算批次、支付凭证、对账、分页、聚合与导出合同");
    expect(affiliateSource).toContain("当前不会展示浏览器保存的 GMV、ROI、预算、链接、佣金或结算数据");
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
