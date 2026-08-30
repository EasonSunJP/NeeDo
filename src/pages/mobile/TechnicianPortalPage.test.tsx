import { describe, expect, it } from "vitest";
import source from "./TechnicianPortalPage.tsx?raw";

describe("TechnicianPortalPage formal approved UI", () => {
  it("keeps the authenticated self portal available for private technicians without a shop", () => {
    expect(source).toContain("function TechnicianPortalDataGate");
    expect(source).toContain("getFormalTechnicianProfileId(session)");
    expect(source).toContain("coreReadApi.getTechnicianDetail(formalTechnicianProfileId)");
    expect(source).toContain("technicianProfileApi.getMine()");
    expect(source).toContain("formalTechnicianSelfProfileQuery.data?.shopId");
    expect(source).toContain("if (!formalTechnicianProfileId || !selfProfile)");
    expect(source).not.toContain("if (!formalTechnicianProfileId || !technician?.shop || !selfProfile)");
    expect(source).toContain("technician: CoreTechnicianDetail | null");
    expect(source).toContain("关联店铺后即可管理正式服务");
    expect(source).toContain("技师资料加载失败");
    expect(source).toContain("正在加载技师资料");
    expect(source).toContain("<TechnicianPortalContent");
  });

  it("keeps the restored task dashboard and only links to identity-scoped feature routes", () => {
    const tasksStart = source.indexOf("function TasksView");
    const tasksEnd = source.indexOf("type TechnicianProfileDraft", tasksStart);
    const tasksSource = source.slice(tasksStart, tasksEnd);

    expect(tasksSource).toContain("<SharedHomeHeader");
    expect(tasksSource).toContain('locationCaption="当前服务区域"');
    expect(tasksSource).toContain('locationLabel={profile.serviceAreas[0] ?? profile.city ?? "服务区域未设置"}');
    expect(tasksSource).toContain('to: "/technician/schedule"');
    expect(tasksSource).toContain('to: "/technician/contacts"');
    expect(tasksSource).toContain('to: "/technician/needo"');
    expect(tasksSource).toContain("<FormalTechnicianOrdersPanel />");
    expect(tasksSource).toContain("technician.reviewSummary.reviewCount");
    expect(tasksSource).toContain("profile.yearsExperience");
  });

  it("restores the approved information, services, and data-center tabs", () => {
    expect(source).toContain('{ label: "信息卡", value: "info" }');
    expect(source).toContain('{ label: "服务信息", value: "services" }');
    expect(source).toContain('{ label: "数据中心", value: "data" }');
    expect(source).toContain('data-testid="technician-info-card"');
    expect(source).toContain('data-testid="technician-profile-privacy-control"');
    expect(source).toContain('data-testid="technician-privacy-options"');
    expect(source).toContain('data-testid="technician-info-tags"');
    expect(source).toContain("<PrivacyModeConfirmDialog");
    expect(source).toContain("年龄 / 身高");
    expect(source).toContain("语言能力");
    expect(source).toContain("接单预算");
    expect(source).toContain("支持支付方式");
    expect(source).toContain("自我介绍");
    expect(source).toContain("服务外国人");
  });

  it("persists every profile and privacy edit through the technician self API", () => {
    expect(source).toContain("technicianProfileApi.updateMine(input)");
    expect(source).toContain("serviceAreas: splitList(draft.serviceAreasText)");
    expect(source).toContain("profileTags: splitList(draft.profileTagsText)");
    expect(source).toContain("paymentMethods: draft.paymentMethods");
    expect(source).toContain('persistVisibility("public")');
    expect(source).toContain('persistVisibility("privateAll", true)');
    expect(source).toContain('role="alert">技师资料保存失败：{error}');
  });

  it("loads and mutates only persisted technician services", () => {
    const servicesStart = source.indexOf("function FormalTechnicianServicesPanel");
    const servicesEnd = source.indexOf("function DataCenter", servicesStart);
    const servicesSource = source.slice(servicesStart, servicesEnd);

    expect(servicesSource).toContain("pricingModeApi.listTechnicianServices(shopId, { page: 1, pageSize: 100 })");
    expect(servicesSource).toContain("pricingModeApi.getShopPricingMode(shopId)");
    expect(servicesSource).toContain("pricingModeApi.createTechnicianService");
    expect(servicesSource).toContain("pricingModeApi.updateTechnicianService");
    expect(servicesSource).toContain("pricingModeApi.deleteTechnicianService");
    expect(servicesSource).toContain("当前没有已保存的正式技师服务");
    expect(servicesSource).not.toContain('"default"');
    expect(servicesSource).not.toContain("fake");
  });

  it("does not fabricate income or trend metrics before a formal statistics API exists", () => {
    const dataStart = source.indexOf("function DataCenter");
    const dataEnd = source.indexOf("function TechnicianPortalContent", dataStart);
    const dataSource = source.slice(dataStart, dataEnd);

    expect(dataSource).toContain("technician.reviewSummary.ratingAverage");
    expect(dataSource).toContain("technician.reviewSummary.reviewCount");
    expect(dataSource).toContain("profile.yearsExperience");
    expect(dataSource).toContain("当前页面不会生成演示统计");
    expect(dataSource).not.toContain("本月收入");
    expect(dataSource).not.toContain("收入趋势");
  });

  it("permanently excludes the simplified and mock production implementations", () => {
    for (const forbidden of [
      "formalRuntimeFallbacks",
      "entityStore",
      "scheduleStore",
      "shiftPlanningStore",
      "technicianScheduleStore",
      "UnifiedUserCalendar",
      "renderTechnicianStatusTimeline",
      "updateTechnicianEntity",
      "updateCustomerEntity",
      "localStorage",
      "false &&",
      "isStaticDemoMode"
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
