import { describe, expect, it } from "vitest";
import source from "./TechnicianPortalPage.tsx?raw";
import controlsSource from "../../features/technician-work-status/WorkStatusControls.tsx?raw";
import timelineSource from "../../features/technician-work-status/WorkTimeline.tsx?raw";

describe("TechnicianPortalPage formal approved UI", () => {
  it("keeps the authenticated self portal available for private technicians without a shop", () => {
    expect(source).toContain("function TechnicianPortalDataGate");
    expect(source).toContain("getFormalTechnicianProfileId(session)");
    expect(source).toContain("coreReadApi.getTechnicianDetail(formalTechnicianProfileId)");
    expect(source).toContain("technicianProfileApi.getMine()");
    expect(source).toContain("() => formalTechnicianProfileId ? coreReadApi.getTechnicianDetail(formalTechnicianProfileId) : null");
    expect(source).not.toContain("formalTechnicianSelfProfileQuery.data?.shopId");
    expect(source).toContain("formalTechnicianProfileQuery.error");
    expect(source).toContain('const publicDetailHidden = formalTechnicianProfileQuery.error === "error.technician.not_found"');
    expect(source).toContain("if (!formalTechnicianProfileId || !selfProfile || !walletSummary || (!technician && !publicDetailHidden))");
    expect(source).not.toContain("if (!formalTechnicianProfileId || !technician?.shop || !selfProfile)");
    expect(source).toContain("technician: CoreTechnicianDetail | null");
    expect(source).not.toContain("当前没有可用的正式店铺，暂时无法新增服务");
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
    expect(controlsSource).toContain('to="/technician/schedule"');
    expect(tasksSource).toContain("<FormalTechnicianOrdersPanel />");
    expect(tasksSource).toContain("loadEveryTechnicianOrder");
    expect(tasksSource).toContain("loadManagedScheduleWindow");
    expect(tasksSource).toContain("getTokyoDayWindow");
    expect(tasksSource).toContain("getTokyoSlotParts");
    expect(tasksSource).toContain('dateMode: "overlaps"');
    expect(tasksSource).not.toContain("Promise.allSettled");
    expect(tasksSource).toContain("useCoreReadQuery");
    expect(tasksSource).toContain("getAuthenticatedPersistentCacheScope");
    expect(tasksSource).toContain("technician:tasks:");
    expect(tasksSource).toContain('data-testid="technician-formal-income-dashboard"');
    expect(tasksSource).toContain("<WorkStatusControls");
    expect(tasksSource).toContain("本月确认收入");
    expect(tasksSource).toContain("接单率");
    expect(tasksSource).toContain("服务评价");
    expect(tasksSource).toContain("本月订单");
    expect(controlsSource).toContain("workStatusApi.update");
    expect(tasksSource).toContain("今日仅排班展示");
    expect(tasksSource).toContain("今日订单");
    expect(tasksSource).toContain("<WorkTimeline");
    expect(tasksSource).toContain("technician.reviewSummary.ratingAverage");
    expect(tasksSource).not.toContain("formalRuntimeFallbacks");
    expect(tasksSource).not.toContain("technicianScheduleStore");
  });

  it("uses recognized compensation for monthly income and customer totals for today orders", () => {
    const tasksStart = source.indexOf("function TasksView");
    const tasksEnd = source.indexOf("type TechnicianProfileDraft", tasksStart);
    const tasksSource = source.slice(tasksStart, tasksEnd);

    expect(source).toContain("technicianDataCenterApi,");
    expect(tasksSource).toContain('technicianDataCenterApi.getMine("month")');
    expect(tasksSource).toContain("monthlyIncomeQuery.data?.summary.recognizedIncomeJpy");
    expect(tasksSource).toContain("本月确认收入");
    expect(tasksSource).toContain("顾客支付总额");
    expect(tasksSource).toContain("nextOrder.paymentAmountJpy");
    expect(tasksSource).not.toContain("预估收入");
    expect(tasksSource).not.toContain("sum + (Number(order.priceAmount)");
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

  it("keeps five compact controls and sends formal state mutations", () => {
    expect(source).toContain("<WorkStatusControls");
    expect(controlsSource).toContain("min-h-[88px]");
    expect(controlsSource).toContain("h-9 w-9");
    expect(controlsSource).toContain("aria-pressed");
    expect(controlsSource).toContain("expectedVersion");
    expect(controlsSource).toContain("workStatusApi.update");
    expect(controlsSource).toContain("snapshot.currentShop");
    expect(controlsSource).not.toContain("shopId,");
    expect(source).not.toContain("shopId={profile.shopId}");
  });

  it("uses persisted work events and comments in the shared timeline", () => {
    expect(source).toContain('<WorkTimeline target={{ scope: "technician" }}');
    expect(timelineSource).toContain("ContactEventTimelinePanel");
    expect(timelineSource).toContain("workStatusApi.events");
    expect(timelineSource).toContain("workStatusApi.comment");
    expect(source).not.toContain("const statusTimelineEntries = orders.flatMap");
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
    expect(servicesSource).toContain("pricingModeApi.createMyTechnicianService");
    expect(servicesSource).toContain("pricingModeApi.updateMyTechnicianService");
    expect(servicesSource).toContain("pricingModeApi.deleteMyTechnicianService");
    expect(servicesSource).toContain("pricingModeApi.uploadTechnicianServiceCover");
    expect(servicesSource).toContain("pricingModeApi.removeTechnicianServiceCover");
    expect(servicesSource).toContain("<TechnicianServiceCoverField");
    expect(servicesSource).toContain("persistedAfterPartialSave");
    expect(servicesSource).toContain(
      'const pendingCoverOperation: "upload" | "remove" | "none"'
    );
    expect(servicesSource.indexOf("if (persistedAfterPartialSave)")).toBeLessThan(servicesSource.indexOf("const priceAmount"));
    expect(servicesSource).toContain(
      'pendingCoverOperation === "remove" ? "重试移除封面" : pendingCoverOperation === "upload" ? "重试上传封面" : "完成并关闭"'
    );
    expect(servicesSource).toContain('setError("服务数量已达到 5 个上限")');
    expect(servicesSource).toContain("saved.shopId");
    expect(servicesSource).toContain("coreReadApi.listCategories");
    expect(servicesSource).toContain('aria-label="服务分类"');
    expect(servicesSource).toContain("当前没有已保存的正式技师服务");
    expect(servicesSource).toContain("<UnifiedServiceInfoCard");
    expect(servicesSource).not.toContain('variant="showcase"');
    expect(servicesSource).toContain('label="上移"');
    expect(servicesSource).toContain('label="下移"');
    expect(servicesSource).toContain('label="编辑"');
    expect(servicesSource).toContain('icon="up" label="上移"');
    expect(servicesSource).toContain('icon="down" label="下移"');
    expect(servicesSource).toContain("disabled={index === 0 || saving}");
    expect(servicesSource).toContain("disabled={index === services.length - 1 || saving}");
    expect(servicesSource).not.toContain('icon="back" label="上移"');
    expect(servicesSource).not.toContain('icon="back" label="下移"');
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
    expect(source).toContain('data-testid="technician-data-center-schedule-action"');
    expect(source).toContain("client-nav-aligned-panel");
    expect(source).not.toContain("<StickyBottomBar>\n               <PrimaryButton className=\"w-full\" onClick={() => navigate(`/technician/schedule?period=");
    expect(source).toContain('period=${dataCenterPeriod}');
    expect(source).toContain("onRangeLoaded={setDataCenterRange}");
    expect(source).toContain('from=${encodeURIComponent(dataCenterRange.startsAt)}');
    expect(source).toContain('to=${encodeURIComponent(dataCenterRange.endsAt)}');
  });

  it("uses the shared personal-center header while retaining all profile tabs in the same container", () => {
    const meHeaderSource = source.slice(
      source.indexOf('{activeView === "me" ? ('),
      source.indexOf('<div className="space-y-4 px-4', source.indexOf('{activeView === "me" ? ('))
    );

    expect(meHeaderSource).toContain("<MobileFullscreenHeader");
    expect(meHeaderSource).toContain('title="个人中心"');
    expect(meHeaderSource).toContain('onClose={() => navigate("/technician")}');
    expect(meHeaderSource).not.toContain('label="打开技师设置"');
    expect(meHeaderSource).toContain("footer={");
    expect(source).toContain('meTab === "info" ? "pb-[calc(132px+env(safe-area-inset-bottom))]" : "pb-32"');
    expect(source).not.toContain("<FloatingHomeHeader panelClassName=\"relative overflow-hidden\" stacked>");
    expect(source).toContain('to="/technician/shop-stays"');
    expect(source).toContain("入住店铺");
  });

  it("builds the personal-center view only from formal profile, detail, and service payloads", () => {
    expect(source).toContain("fromTechnicianSelfProfile(profile, technician, services)");
    expect(source).toContain("<TechnicianProfileInfoView");
    expect(source).toContain("walletApi.getMyWalletSummary()");
    expect(source).toContain("walletSummary={walletSummary}");
    expect(source).toContain('ariaLabel="开启隐私模式"');
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
