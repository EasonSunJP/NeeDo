import { describe, expect, it } from "vitest";
import merchantSource from "./MerchantPortalPage.tsx?raw";
import employeeDetailWorkspaceSource from "../../components/merchant-admin/MerchantEmployeeDetailWorkspace.tsx?raw";
import storeDetailSource from "../user/StoreDetailPage.tsx?raw";

describe("MerchantPortalPage store privacy control", () => {
  it("loads the active store and staff from the formal API before rendering the merchant workspace", () => {
    expect(merchantSource).toContain("function MerchantPortalDataGate");
    expect(merchantSource).toContain("coreReadApi.getShopDetail(storeApiId)");
    expect(merchantSource).toContain("mapCoreShopToStore(formalStoreQuery.data)");
    expect(merchantSource).toContain("mapCoreTechnicianToTechnician(technician)");
    expect(merchantSource).toContain("[storeApiId, activeView]");
    expect(merchantSource).toContain("force: true");
    expect(merchantSource).toContain("storeServices={formalStoreQuery.data.services}");
    expect(merchantSource).toContain("<MerchantPortalContent");
    expect(merchantSource).toContain("technicians={technicians}");
    expect(merchantSource).not.toContain("stores.find((item) => item.id === session?.linkedStoreId) ?? stores[0]");
  });

  it("keeps merchant store preview services and technicians on the formal shop projection", () => {
    const servicePreviewSource = merchantSource.slice(
      merchantSource.indexOf('{activeMeTab === "service" ? ('),
      merchantSource.indexOf('{activeMeTab === "data" ? (')
    );

    expect(merchantSource).toContain("mapCoreServiceCardToUnifiedData");
    expect(servicePreviewSource).toContain("formalApiOnly");
    expect(servicePreviewSource).toContain("serviceCardsOverride={storeServices.map(mapCoreServiceCardToUnifiedData)}");
    expect(servicePreviewSource).toContain("techniciansOverride={storeTechnicians}");
  });

  it("uses one fullscreen toolbar and hides the shared bottom nav across all merchant schedule tabs", () => {
    const scheduleHeaderSource = merchantSource.slice(
      merchantSource.indexOf("function MerchantScheduleHeaderTabs"),
      merchantSource.indexOf("function MerchantStaffHeaderTabs")
    );
    const shellSource = merchantSource.slice(
      merchantSource.indexOf("<MobileShell"),
      merchantSource.indexOf("{activeView === \"dashboard\"")
    );
    const schedulePanelSource = merchantSource.slice(
      merchantSource.indexOf("{activeView === \"schedule\" && ("),
      merchantSource.indexOf("{activeView === \"contacts\" && (")
    );

    expect(merchantSource).toContain('const isMerchantScheduleView = activeView === "schedule";');
    expect(merchantSource).toContain('import { MobileFullscreenCloseButton, MobileFullscreenHeader }');
    expect(scheduleHeaderSource).toContain('className="relative z-10"');
    expect(scheduleHeaderSource).toContain('className="flex items-center gap-2"');
    expect(scheduleHeaderSource).toContain('aria-label="返回商户首页"');
    expect(scheduleHeaderSource).toContain('const activeTabLabel = tabs.find((tab) => tab.value === value)?.label ?? "现状确认";');
    expect(scheduleHeaderSource).toContain('placeholder="搜索预约、客户、员工、状态"');
    expect(scheduleHeaderSource).toContain('name="search"');
    expect(scheduleHeaderSource).toContain('{value === "appointments" ? (');
    expect(scheduleHeaderSource).toContain('<strong className="truncate text-sm font-black">{activeTabLabel}</strong>');
    expect(scheduleHeaderSource).toContain('<MobileFullscreenCloseButton label={`关闭${activeTabLabel}`} onClose={() => onExit?.()} />');
    expect(scheduleHeaderSource).toContain("<FeatureSegmentedTabs");
    expect(shellSource).toContain('activeView !== "staff"');
    expect(merchantSource).toContain('activeView === "schedule" && "relative z-30"');
    expect(schedulePanelSource).toContain("onAppointmentSearchQueryChange={setMerchantAppointmentSearchQuery}");
    expect(schedulePanelSource).toContain("appointmentSearchQuery={merchantAppointmentSearchQuery}");
    expect(schedulePanelSource).toContain("searchQuery={merchantAppointmentSearchQuery}");
    expect(schedulePanelSource).toContain('onExit={() => navigate("/merchant")}');
    expect(schedulePanelSource).not.toContain("showAppointmentsToolbar");
  });

  it("uses the shared employee header with search, close, and four separated tabs", () => {
    const staffHeaderSource = merchantSource.slice(
      merchantSource.indexOf("function MerchantStaffHeaderTabs"),
      merchantSource.indexOf("function buildMerchantIncomePolyline")
    );
    const staffPanelSource = merchantSource.slice(
      merchantSource.indexOf('{activeView === "staff" && ('),
      merchantSource.indexOf('{activeView === "schedule" && (')
    );

    expect(staffHeaderSource).toContain("<MobileFullscreenHeader");
    expect(staffHeaderSource).toContain('aria-label="搜索员工"');
    expect(staffHeaderSource).toContain('placeholder={t("搜索员工、NeeDoID 或状态")}');
    expect(staffHeaderSource).toContain("onBack={onExit}");
    expect(staffHeaderSource).toContain("onClose={onExit}");
    expect(staffHeaderSource).toContain('{ label: "全部", value: "all" }');
    expect(staffHeaderSource).toContain('{ label: "员工", value: "fullTime" }');
    expect(staffHeaderSource).toContain('{ label: "临时", value: "partTime" }');
    expect(staffHeaderSource).toContain('{ label: "审核", value: "review" }');
    expect(staffPanelSource).toContain('<TechnicianApplicationsReviewPage embedded searchQuery={staffSearchQuery} />');
    expect(staffPanelSource).toContain('merchantStaffTab === "review"');
    expect(staffPanelSource).toContain('merchantStaffTab !== "review"');
  });

  it("keeps the approved appointment calendar as the first booking surface", () => {
    const schedulePanelSource = merchantSource.slice(
      merchantSource.indexOf('{activeView === "schedule" && ('),
      merchantSource.indexOf('{activeView === "contacts" && (')
    );

    expect(schedulePanelSource).toContain("<UnifiedUserCalendar");
    expect(schedulePanelSource).toContain("currentStore={store}");
    expect(schedulePanelSource).toContain("technicians={storeTechnicians}");
    expect(schedulePanelSource).not.toContain("<FormalScheduleInventoryPanel");
    expect(schedulePanelSource).not.toContain('className="space-y-4"');
  });

  it("keeps the merchant staff detail header as a single shared glass layer with close", () => {
    const staffDetailSource = merchantSource.slice(
      merchantSource.indexOf("export function MerchantStaffDetailRoutePage"),
      merchantSource.indexOf("function MerchantOrdersHeader")
    );

    expect(staffDetailSource).toContain("<MobileFullscreenHeader");
    expect(staffDetailSource).toContain("onClose={closePage}");
    expect(staffDetailSource).toContain("showSpacer={false}");
    expect(staffDetailSource).not.toContain('className="fixed inset-x-0 top-0 z-[70] mx-auto w-full max-w-[480px]"');
    expect(staffDetailSource).toContain("pt-[calc(env(safe-area-inset-top)+86px)]");
    expect(staffDetailSource).toContain("pb-[calc(env(safe-area-inset-bottom)+24px)]");
    expect(staffDetailSource).toContain("px-2");
    expect(staffDetailSource).toContain("<MerchantEmployeeDetailWorkspace");
  });

  it("hydrates a directly opened staff detail from the formal merchant API", () => {
    const staffDetailSource = merchantSource.slice(
      merchantSource.indexOf("export function MerchantStaffDetailRoutePage"),
      merchantSource.indexOf("function MerchantOrdersHeader")
    );

    expect(employeeDetailWorkspaceSource).toContain("merchantEmployeeApi.detail(needoId)");
    expect(employeeDetailWorkspaceSource).toContain("<EmployeeDetailCard");
    expect(employeeDetailWorkspaceSource).toContain('scheduleSurface="mobile"');
    expect(staffDetailSource).not.toContain('backofficeRealDataApi.technician("merchant-admin"');
    expect(employeeDetailWorkspaceSource).toContain("正在读取员工详细信息卡");
  });

  it("keeps termination off technician summary cards and in the formal detail workspace", () => {
    const staffCardSource = merchantSource.slice(
      merchantSource.indexOf("group.technicianEntries.map"),
      merchantSource.indexOf("group.employees.map"),
    );
    expect(staffCardSource).toContain("getMerchantStaffDetailPath");
    expect(staffCardSource).not.toContain("MerchantRemoveStaffIconButton");
    expect(employeeDetailWorkspaceSource).toContain("<EmployeeDetailCard");
  });

  it("uses the public NeeDo technician id for every merchant staff detail action", () => {
    expect(merchantSource).toContain('import { getMerchantStaffDetailPath } from "../../lib/merchantStaffRoute";');
    expect(merchantSource).toContain("onClick: () => openStaffDetail(newestTechnician.systemId)");
    expect(merchantSource).not.toContain("onClick: () => openStaffDetail(newestTechnician.id)");
    expect(merchantSource).not.toContain("function getMerchantStaffDetailPath(id: string)");
  });

  it("adds the floating privacy menu to the merchant service card only", () => {
    expect(merchantSource).toContain('{ label: "信息卡", value: "info" }');
    expect(merchantSource).toContain('{ label: "店铺展示", value: "service" }');
    expect(merchantSource).toContain('{ label: "数据中心", value: "data" }');
    expect(merchantSource).toContain("function MerchantStorePrivacyControl");
    expect(merchantSource).toContain('data-testid="merchant-store-privacy-control"');
    expect(merchantSource).toContain('data-testid="merchant-store-privacy-options"');
    expect(merchantSource).toContain("PrivacyModeConfirmDialog");
    expect(merchantSource).toContain("storePrivacyConfirmOpen");
    expect(merchantSource).toContain("confirmStorePrivacyEnabled");
    expect(merchantSource).toContain('className="relative z-[70] w-full" data-testid="merchant-store-privacy-control"');
    expect(merchantSource).toContain("absolute right-0 top-[calc(100%+8px)]");
    expect(merchantSource).toContain("z-[90]");
    expect(merchantSource).toContain('ariaLabel="开启店铺隐私模式"');
    expect(merchantSource).toContain("InfoTooltipTrigger");
    expect(merchantSource).toContain('description: "仅本人可见"');
    expect(merchantSource).toContain('description: "仅好友可以看到该账号信息"');
    expect(merchantSource).toContain('description: "仅好友以及关联店铺和介绍关系中的关联人可见"');
    expect(merchantSource).toContain("privacyControl={storePrivacyControl}");

    expect(storeDetailSource).toContain("privacyControl?: ReactNode");
    expect(storeDetailSource).toContain("hasMerchantControls");
    expect(storeDetailSource).toContain("relative z-50 space-y-3 overflow-visible");
    expect(storeDetailSource).toContain("min-h-[112px]");
    expect(storeDetailSource).toContain('className="mt-3 grid grid-cols-2 gap-2"');
    expect(storeDetailSource).toContain('<div className="relative z-0">{content}</div>');
  });

  it("uses the shared personal-center header and keeps merchant identity data independent", () => {
    const meHeaderSource = merchantSource.slice(
      merchantSource.indexOf('{activeView === "me" ? ('),
      merchantSource.indexOf('<div\n        className={cn(', merchantSource.indexOf('{activeView === "me" ? ('))
    );
    expect(merchantSource).toContain('type MerchantMeTab = "info" | "service" | "data"');
    expect(merchantSource).toContain('import { MerchantIdentityInfoCard } from "../../components/merchant/MerchantIdentityInfoCard"');
    expect(merchantSource).toContain('<MerchantIdentityInfoCard onEditingChange={setMerchantProfileEditing} />');
    expect(meHeaderSource).toContain("<MobileFullscreenHeader");
    expect(meHeaderSource).toContain('title="个人中心"');
    expect(meHeaderSource).toContain('onClose={() => navigate("/merchant")}');
    expect(meHeaderSource).not.toContain('label="打开设置中心"');
    expect(meHeaderSource).toContain("footer={");
    expect(meHeaderSource).not.toContain("<SharedHomeHeader");
    expect(merchantSource).toContain('? "space-y-4 pt-4"');
    expect(merchantSource).toContain('showBottomNav={activeView !== "me" && activeView !== "staff" && !isMerchantScheduleView && !isMerchantAppointmentTimelineView && !isMerchantRevenueView && !merchantProfileEditing}');
  });

  it("keeps the personal-center status panel inside the same mobile content inset", () => {
    const statusPanelSource = merchantSource.slice(
      merchantSource.indexOf('{activeView === "dashboard" ? (', merchantSource.indexOf("{selectedContact && (")),
      merchantSource.indexOf("</MobileShell>")
    );

    expect(statusPanelSource).toContain('className={activeView === "me" ? "client-app-margin !w-auto" : undefined}');
  });

  it("adds the merchant pricing mode switch beside the privacy switch", () => {
    const pricingControlSource = merchantSource.slice(
      merchantSource.indexOf("function MerchantStorePricingModeControl"),
      merchantSource.indexOf("function MerchantStorePrivacyInfoButton")
    );
    const pricingConfirmSource = merchantSource.slice(
      merchantSource.indexOf("const confirmTechnicianPricingMode"),
      merchantSource.indexOf("const isMerchantDataCenterView")
    );
    const pricingUpdateSource = merchantSource.slice(
      merchantSource.indexOf("const updateStorePricingMode"),
      merchantSource.indexOf("const requestTechnicianPricingConfirm")
    );

    expect(merchantSource).toContain("function MerchantStorePricingModeControl");
    expect(merchantSource).toContain('data-testid="merchant-store-pricing-mode-control"');
    expect(merchantSource).toContain('"切换为技师定价"');
    expect(merchantSource).toContain("storePricingRatioMenuOpen");
    expect(merchantSource).toContain("updateStorePricingRatioMenuOpen");
    expect(merchantSource).toContain("updateStorePrivacyMenuOpen");
    expect(merchantSource).toContain("technicianPricingRatioPercent");
    expect(merchantSource).toContain("storeTechnicianPricingRatePercent");
    expect(merchantSource).toContain('ratePercent={storeTechnicianPricingRatePercent}');
    expect(merchantSource).not.toContain('technicianPricingRatePercent={storeTechnicianPricingRatePercent}');
    expect(merchantSource).toContain('data-testid="merchant-pricing-ratio-menu"');
    expect(merchantSource).toContain("店铺与技师结算比例");
    expect(merchantSource).toContain("每次调整 10%，店铺与技师合计不超过 100%。");
    expect(pricingControlSource).toContain("店铺 {settlementSplit.shopSharePercent}%：{settlementSplit.technicianSharePercent}% 技师");
    expect(pricingControlSource).toContain("MAX_TECHNICIAN_SETTLEMENT_SHARE_PERCENT");
    expect(pricingControlSource).toContain("MIN_TECHNICIAN_SETTLEMENT_SHARE_PERCENT");
    expect(merchantSource).toContain("updateTechnicianPricingRatio(10)");
    expect(merchantSource).toContain("updateTechnicianPricingRatio(-10)");
    expect(merchantSource).toContain('document.addEventListener("pointerdown", closeOnOutsidePointerDown)');
    expect(merchantSource).toContain("setStorePrivacyMenuOpen(false)");
    expect(merchantSource).toContain("setStorePricingRatioMenuOpen(false)");
    expect(merchantSource).toContain('aria-label="增加比例"');
    expect(merchantSource).toContain('aria-label="减少比例"');
    expect(merchantSource).toContain("确认开启");
    expect(merchantSource).toContain("storePricingModeConfirmOpen");
    expect(merchantSource).toContain("requestTechnicianPricingConfirm");
    expect(merchantSource).toContain("confirmTechnicianPricingMode");
    expect(pricingControlSource).toContain("onTechnicianPricingConfirmRequest();");
    expect(pricingControlSource).toContain('onModeChange("technician", technicianPricingRatioPercent);');
    expect(pricingControlSource).not.toContain('onRatePercentChange(technicianPricingRatioPercent);');
    expect(pricingControlSource).toContain('onModeChange("technician", technicianPricingRatioPercent);');
    expect(pricingControlSource).toContain('技师定价（店铺 {100 - ratePercent}%：{ratePercent}% 技师）');
    expect(pricingControlSource).not.toContain("onMenuOpenChange(true);");
    expect(pricingConfirmSource).toContain("setStorePricingRatioMenuOpen(true);");
    expect(pricingUpdateSource).toContain("setStoreTechnicianPricingRatePercent(normalizeTechnicianSettlementShare(result.technicianPricingRatePercent));");
    expect(pricingUpdateSource).toContain("const pricingModeChanged = nextMode !== storePricingMode;");
    expect(pricingUpdateSource).toContain("const pricingRateChanged = nextRatePercent !== storeTechnicianPricingRatePercent;");
    expect(pricingUpdateSource).toContain("(!pricingModeChanged && !pricingRateChanged) || storePricingModeSaving");
    expect(pricingUpdateSource).toContain("merchantStorePricingModeToApi(nextMode),");
    expect(pricingUpdateSource).toContain("storeTechnicianPricingRatePercent");
    expect(pricingConfirmSource).not.toContain('updateStorePricingMode("technician")');
    expect(merchantSource).toContain("开启技师定价后，店铺的服务列表将被隐藏，是否确定开启？");
    expect(merchantSource).toContain('confirmLabel="确定开启"');
    expect(merchantSource).not.toContain("window.confirm");
    expect(merchantSource).toContain("pricingControl={storePricingModeControl}");

    expect(storeDetailSource).toContain("pricingControl?: ReactNode");
    expect(storeDetailSource).toContain("hasMerchantControls");
    expect(storeDetailSource).toContain('className="mt-3 grid grid-cols-2 gap-2"');
    expect(storeDetailSource).toContain("{pricingControl ? <div>{pricingControl}</div> : <div />}");
    expect(storeDetailSource).toContain("{privacyControl ? <div>{privacyControl}</div> : <div />}");
  });

  it("uses the active UI theme colors instead of an image for the dashboard background", () => {
    const dashboardHeroSource = merchantSource.slice(
      merchantSource.indexOf('<section className="client-feature-panel overflow-hidden rounded-[28px] border text-white">'),
      merchantSource.indexOf("<MerchantPrimaryNavCarousel />")
    );

    expect(dashboardHeroSource).toContain('className="client-feature-panel overflow-hidden rounded-[28px] border text-white"');
    expect(dashboardHeroSource).toContain('className="client-feature-aura absolute inset-0"');
    expect(dashboardHeroSource).not.toContain("<img");
    expect(dashboardHeroSource).not.toContain("imageBank.salon");
  });

  it("renders merchant appointment services through the same direct user-side card", () => {
    const dashboardAppointments = merchantSource.slice(
      merchantSource.indexOf("{pendingOrders.slice(0, 4).map"),
      merchantSource.indexOf('title="员工状态"')
    );
    const orderList = merchantSource.slice(
      merchantSource.indexOf('{activeView === "orders" && ('),
      merchantSource.indexOf('{activeView === "staff" && (')
    );

    expect(merchantSource).toContain('from "../../shared/service-card"');
    expect(merchantSource).toContain("UnifiedServiceInfoCard");
    expect(dashboardAppointments).toContain("<UnifiedServiceInfoCard");
    expect(dashboardAppointments).toContain("data={buildOrderServiceMiniCardData(order)}");
    expect(dashboardAppointments).not.toContain("<OrderServiceMiniCard");
    expect(dashboardAppointments).not.toContain("预约详情");
    expect(dashboardAppointments).not.toContain("merchant-dashboard-appointment-service");
    expect(orderList).toContain("<UnifiedServiceInfoCard");
    expect(orderList).not.toContain("<OrderServiceMiniCard");
  });

  it("links dashboard metrics to formal drilldowns and renders today appointments as a searchable timeline", () => {
    const workbenchMetrics = merchantSource.slice(
      merchantSource.indexOf("export function MerchantWorkbenchMetrics"),
      merchantSource.indexOf("function getMerchantStorePrivacyLabel")
    );
    const appointmentTimeline = merchantSource.slice(
      merchantSource.indexOf("export function MerchantTodayAppointmentsTimeline"),
      merchantSource.indexOf("function getMerchantStorePrivacyLabel")
    );

    expect(merchantSource).toContain('type MerchantView = "dashboard" | "today-appointments"');
    expect(merchantSource).toContain('if (view === "today-appointments")');
    expect(merchantSource).toContain('const isMerchantAppointmentTimelineView = activeView === "today-appointments";');
    expect(merchantSource).toContain("<MerchantWorkbenchMetrics");
    expect(workbenchMetrics).toContain('to: "/merchant/today-appointments"');
    expect(workbenchMetrics).toContain('to: "/merchant/revenue"');
    expect(appointmentTimeline).toContain("<MobileFullscreenHeader");
    expect(appointmentTimeline).toContain('aria-label={t("搜索今日预约")}');
    expect(appointmentTimeline).toContain("merchantOrderMatchesSearch(order, searchQuery)");
    expect(appointmentTimeline).toContain("[...orders]");
    expect(appointmentTimeline).toContain("filteredOrders.map((order) => (");
    expect(appointmentTimeline).toContain("<UnifiedServiceInfoCard");
    expect(appointmentTimeline).toContain("data={buildOrderServiceMiniCardData(order)}");
    expect(merchantSource).toContain("!isMerchantAppointmentTimelineView");
  });

  it("renders the revenue drilldown as a fullscreen formal analytics page", () => {
    expect(merchantSource).toContain('type MerchantView = "dashboard" | "today-appointments" | "revenue"');
    expect(merchantSource).toContain('if (view === "revenue")');
    expect(merchantSource).toContain('const isMerchantRevenueView = activeView === "revenue";');
    expect(merchantSource).toContain('showBottomNav={activeView !== "me" && activeView !== "staff" && !isMerchantScheduleView && !isMerchantAppointmentTimelineView && !isMerchantRevenueView && !merchantProfileEditing}');

    const revenueView = merchantSource.slice(
      merchantSource.indexOf('{activeView === "revenue" ?'),
      merchantSource.indexOf('{activeView === "today-appointments" ? (')
    );
    expect(revenueView).toContain("<MerchantRevenueDrilldown");
    expect(revenueView).toContain('onExit={() => navigate("/merchant")}');
    expect(merchantSource).toContain("export function MerchantRevenueDrilldown");
  });

  it("removes the extra employee-list containers so shared cards use the available width", () => {
    const roleSection = merchantSource.slice(
      merchantSource.indexOf("function MerchantStaffRoleSection"),
      merchantSource.indexOf("function getMerchantOrderProvider"),
    );
    const employeeStatus = merchantSource.slice(
      merchantSource.indexOf('title="员工状态"'),
      merchantSource.indexOf('activeView === "staff"'),
    );

    expect(roleSection).toContain('<section className="space-y-3">');
    expect(roleSection).not.toContain("rounded-[28px]");
    expect(employeeStatus).not.toContain("rounded-[28px] border border-line bg-white p-4 shadow-panel");
  });
});
