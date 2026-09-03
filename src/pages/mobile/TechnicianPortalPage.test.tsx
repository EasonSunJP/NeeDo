import { describe, expect, it } from "vitest";
import source from "./TechnicianPortalPage.tsx?raw";

describe("TechnicianPortalPage formal approved UI", () => {
  it("keeps the authenticated self portal available for private technicians without a shop", () => {
    expect(source).toContain("function TechnicianPortalDataGate");
    expect(source).toContain("getFormalTechnicianProfileId(session)");
    expect(source).toContain("coreReadApi.getTechnicianDetail(formalTechnicianProfileId)");
    expect(source).toContain("technicianProfileApi.getMine()");
    expect(source).toContain("() => formalTechnicianProfileId ? coreReadApi.getTechnicianDetail(formalTechnicianProfileId) : null");
    expect(source).not.toContain("formalTechnicianSelfProfileQuery.data?.shopId");
    expect(source).toContain("formalTechnicianProfileQuery.error");
    expect(source).toContain("if (!formalTechnicianProfileId || !selfProfile || !technician)");
    expect(source).not.toContain("if (!formalTechnicianProfileId || !technician?.shop || !selfProfile)");
    expect(source).toContain("technician: CoreTechnicianDetail | null");
    expect(source).toContain("当前没有可用的正式店铺，暂时无法新增服务");
    expect(source).toContain("技师资料加载失败");
    expect(source).toContain("正在加载技师资料");
    expect(source).toContain("<TechnicianPortalContent");
  });

  it("keeps the approved high-fidelity task dashboard while loading only formal data", () => {
    const tasksStart = source.indexOf("function TasksView");
    const tasksEnd = source.indexOf("type TechnicianProfileDraft", tasksStart);
    const tasksSource = source.slice(tasksStart, tasksEnd);

    expect(tasksSource).toContain("<SharedHomeHeader");
    expect(tasksSource).toContain('locationCaption="当前服务区域"');
    expect(tasksSource).toContain('locationLabel={profile.serviceAreas[0] ?? profile.city ?? "服务区域未设置"}');
    expect(tasksSource).toContain('to="/technician/schedule"');
    expect(tasksSource).toContain("<FormalTechnicianOrdersPanel />");
    expect(tasksSource).toContain("loadEveryTechnicianOrder");
    expect(tasksSource).toContain("loadManagedScheduleWindow");
    expect(tasksSource).toContain('data-testid="technician-formal-income-dashboard"');
    expect(tasksSource).toContain('data-testid="technician-formal-status-sync"');
    expect(tasksSource).toContain("本月收入");
    expect(tasksSource).toContain("接单率");
    expect(tasksSource).toContain("服务评价");
    expect(tasksSource).toContain("本月订单");
    expect(tasksSource).toContain("状态同步");
    expect(tasksSource).toContain("今日仅排班展示");
    expect(tasksSource).toContain("今日订单");
    expect(tasksSource).toContain("状态记录");
    expect(tasksSource).toContain("technician.reviewSummary.ratingAverage");
    expect(tasksSource).not.toContain("formalRuntimeFallbacks");
    expect(tasksSource).not.toContain("technicianScheduleStore");
  });

  it("matches the deployed formal today heading contract", () => {
    const tasksStart = source.indexOf("function TasksView");
    const tasksEnd = source.indexOf("type TechnicianProfileDraft", tasksStart);
    const tasksSource = source.slice(tasksStart, tasksEnd);

    expect(source).toContain('import { TitleWithInfo } from "../../components/ui/TitleWithInfo"');
    expect(tasksSource).toContain("<TitleWithInfo");
    expect(tasksSource).toContain('info="默认先看今天的仅排班展示');
    expect(tasksSource).toContain('label="今日安排 简介"');
    expect(tasksSource).toContain('title="今日安排"');
    expect(tasksSource).toContain('titleClassName="text-lg font-bold text-[color:var(--client-text)]"');
    expect(tasksSource).toContain('variant="paper"');
    expect(tasksSource).not.toContain('<h2 className="text-xl font-black">今日安排</h2>');
  });

  it("matches the deployed formal status-sync heading and compact five-state controls", () => {
    const tasksStart = source.indexOf("function TasksView");
    const tasksEnd = source.indexOf("type TechnicianProfileDraft", tasksStart);
    const tasksSource = source.slice(tasksStart, tasksEnd);

    expect(tasksSource).toContain('label="状态同步 简介"');
    expect(tasksSource).toContain('title="状态同步"');
    expect(tasksSource).toContain('titleClassName="text-lg font-bold text-[color:var(--client-text)]"');
    expect(tasksSource).toContain('variant="paper"');
    expect(tasksSource).toContain('"☾", tone: "rest"');
    expect(tasksSource).toContain('min-h-[88px]');
    expect(tasksSource).toContain('h-9 w-9');
    expect(tasksSource).not.toContain('min-h-[104px]');
    expect(tasksSource).not.toContain('"休息中", icon: "◕"');
  });

  it("restores the deployed formal status timeline instead of a simple list", () => {
    const tasksStart = source.indexOf("function TasksView");
    const tasksEnd = source.indexOf("type TechnicianProfileDraft", tasksStart);
    const tasksSource = source.slice(tasksStart, tasksEnd);

    expect(source).toContain('import { ContactEventTimelinePanel } from "../../components/mobile/ContactEventTimeline"');
    expect(tasksSource).toContain("orders.flatMap");
    expect(tasksSource).toContain("statusHistory");
    expect(tasksSource).toContain("<ContactEventTimelinePanel");
    expect(tasksSource).toContain('commentButtonLabel="补充记录"');
    expect(tasksSource).toContain('commentPlaceholder="记录执行经过、异常原因或后续处理..."');
    expect(tasksSource).toContain('emptyLabel="暂无执行 / 异常记录"');
    expect(tasksSource).toContain("onCommentButtonClick={statusRecordTarget");
    expect(tasksSource).toContain('showCommentComposer={Boolean(statusRecordTarget)}');
    expect(tasksSource).toContain('title="状态记录"');
    expect(tasksSource).not.toContain('<ol className="space-y-3">');
    expect(tasksSource).not.toContain("nextOrder?.statusHistory.slice(-3)");
  });

  it("keeps profile and data-center tabs while normalizing the legacy services entry", () => {
    expect(source).toContain('{ label: "信息卡", value: "info" }');
    expect(source).toContain('{ label: "数据中心", value: "data" }');
    expect(source).not.toContain('{ label: "服务信息", value: "services" }');
    expect(source).toContain('searchParams.get("meTab") === "services"');
    expect(source).toContain('document.getElementById("technician-service-information")');
    expect(source).toContain('data-testid="technician-info-card"');
    expect(source).toContain('data-testid="technician-profile-privacy-control"');
    expect(source).toContain('data-testid="technician-privacy-options"');
    expect(source).toContain("<TechnicianReviewTagSummaryView");
    expect(source).toContain("<PrivacyModeConfirmDialog");
    expect(source).toContain("性别");
    expect(source).toContain("年龄");
    expect(source).toContain("身高");
    expect(source).toContain("语言能力");
    expect(source).toContain("自我介绍");
    expect(source).not.toContain("接单预算下限");
    expect(source).not.toContain("支持支付方式");
    expect(source).not.toContain("服务外国人");
  });

  it("persists only the approved personal-center fields through the technician self API", () => {
    expect(source).toContain("technicianProfileApi.updateMine(input)");
    expect(source).toContain("gender: draft.gender");
    expect(source).toContain("age: draft.age");
    expect(source).toContain("heightCm: draft.heightCm");
    expect(source).toContain("languages: splitList(draft.languagesText)");
    expect(source).toContain("bio: draft.bio || null");
    expect(source).toContain("visibility: draft.visibility");
    expect(source).not.toContain("profileTags: splitList");
    expect(source).not.toContain("serviceAreas: splitList");
    expect(source).not.toContain("paymentMethods: draft.paymentMethods");
    expect(source).toContain('role="alert">技师资料保存失败：{error}');
  });

  it("matches the customer edit controls and keeps failed drafts in edit mode", () => {
    expect(source).toContain('data-testid="technician-profile-save-action"');
    expect(source).toContain("保存并退出编辑模式");
    expect(source).toContain("setDraft(profileDraft(profile))");
    expect(source).toContain("if (saved) setEditing(false)");
    expect(source).toContain("onSaved(saved)");
    expect(source).toContain('icon={editing ? "close" : "edit"}');
  });

  it("shows actionable profile mutation errors instead of backend error keys", () => {
    expect(source).toContain("function describeProfileMutationError");
    expect(source).toContain("setError(describeProfileMutationError(mutationError))");
    expect(source).toContain('return "请检查资料内容后重试"');
    expect(source).not.toContain('setError(mutationError instanceof Error ? mutationError.message : "error.technician_profile.update_failed")');
  });

  it("loads and mutates only persisted technician services", () => {
    const servicesStart = source.indexOf("function FormalTechnicianServicesPanel");
    const servicesEnd = source.indexOf("function DataCenter", servicesStart);
    const servicesSource = source.slice(servicesStart, servicesEnd);

    expect(servicesSource).toContain("pricingModeApi.listMyTechnicianServices");
    expect(servicesSource).toContain("pricingModeApi.reorderMyTechnicianServices");
    expect(servicesSource).toContain("pricingModeApi.createTechnicianService");
    expect(servicesSource).toContain("pricingModeApi.updateTechnicianService");
    expect(servicesSource).toContain("pricingModeApi.deleteTechnicianService");
    expect(servicesSource).toContain('setError("服务数量已达到 5 个上限")');
    expect(servicesSource).toContain("service.shopId");
    expect(servicesSource).toContain("当前没有已保存的正式技师服务");
    expect(servicesSource).toContain("<UnifiedServiceInfoCard");
    expect(servicesSource).toContain('label="上移"');
    expect(servicesSource).toContain('label="下移"');
    expect(servicesSource).toContain('label="编辑"');
    expect(servicesSource).not.toContain('"default"');
    expect(servicesSource).not.toContain("fake");
  });

  it("mounts the single service editor below read-only review tags and privacy", () => {
    const infoStart = source.indexOf("function TechnicianInfoCard");
    const infoEnd = source.indexOf("function describeServiceError", infoStart);
    const infoSource = source.slice(infoStart, infoEnd);
    const reviewTags = infoSource.indexOf("<TechnicianReviewTagSummaryView");
    const privacy = infoSource.indexOf('data-testid="technician-profile-privacy-control"', reviewTags);
    const services = infoSource.indexOf('id="technician-service-information"');

    expect(reviewTags).toBeGreaterThan(-1);
    expect(privacy).toBeGreaterThan(reviewTags);
    expect(services).toBeGreaterThan(privacy);
    expect(infoSource.match(/<FormalTechnicianServicesPanel/g)).toHaveLength(1);
    expect(source.match(/<FormalTechnicianServicesPanel/g)).toHaveLength(1);
  });

  it("renders the formal dual-series data center and preserves its selected period", () => {
    const dataStart = source.indexOf("function DataCenter");
    const dataEnd = source.indexOf("function TechnicianPortalContent", dataStart);
    const dataSource = source.slice(dataStart, dataEnd);

    expect(source).toContain('import { TechnicianDataCenterPanel } from "../../components/technician/TechnicianDataCenterPanel"');
    expect(dataSource).toContain("<TechnicianDataCenterPanel");
    expect(dataSource).toContain("period={period}");
    expect(dataSource).toContain("onPeriodChange={onPeriodChange}");
    expect(source).toContain('const dataCenterPeriod = getDataCenterPeriod(searchParams.get("period"))');
    expect(source).toContain('next.set("period", period)');
    expect(source).toContain('showBottomNav={activeView !== "me"}');
    expect(source).toContain("确认详细排班记录");
    expect(source).toContain('period=${dataCenterPeriod}');
    expect(source).toContain("onRangeLoaded={setDataCenterRange}");
    expect(source).toContain('from=${encodeURIComponent(dataCenterRange.startsAt)}');
    expect(source).toContain('to=${encodeURIComponent(dataCenterRange.endsAt)}');
  });

  it("uses the shared personal-center header while retaining all profile tabs in the same container", () => {
    expect(source).toContain("<MobileFullscreenHeader");
    expect(source).toContain('title="个人中心"');
    expect(source).toContain('label="打开技师设置"');
    expect(source).toContain("footer={");
    expect(source).not.toContain("<FloatingHomeHeader panelClassName=\"relative overflow-hidden\" stacked>");
  });

  it("builds the personal-center view only from formal profile, detail, and service payloads", () => {
    expect(source).toContain("fromTechnicianSelfProfile(profile, technician, services)");
    expect(source).toContain("<TechnicianProfileInfoView");
    expect(source).not.toContain('data-testid="technician-profile-ndp-card"');
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
