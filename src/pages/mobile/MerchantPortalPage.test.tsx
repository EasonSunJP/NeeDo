import { describe, expect, it } from "vitest";
import merchantSource from "./MerchantPortalPage.tsx?raw";
import storeDetailSource from "../user/StoreDetailPage.tsx?raw";

describe("MerchantPortalPage store privacy control", () => {
  it("loads the active store and staff from the formal API before rendering the merchant workspace", () => {
    expect(merchantSource).toContain("function MerchantPortalDataGate");
    expect(merchantSource).toContain("coreReadApi.getShopDetail(storeApiId)");
    expect(merchantSource).toContain("mapCoreShopToStore(formalStoreQuery.data)");
    expect(merchantSource).toContain("mapCoreTechnicianToTechnician(technician)");
    expect(merchantSource).toContain("<MerchantPortalContent store={store} technicians={technicians} />");
    expect(merchantSource).not.toContain("stores.find((item) => item.id === session?.linkedStoreId) ?? stores[0]");
  });

  it("places appointment list navigation controls above the schedule tabs and hides the shared bottom nav", () => {
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

    expect(merchantSource).toContain('const isMerchantAppointmentsView = activeView === "schedule" && merchantSchedulePrimaryTab === "appointments";');
    expect(scheduleHeaderSource).toContain("showAppointmentsToolbar");
    expect(scheduleHeaderSource).toContain('className="relative z-10"');
    expect(scheduleHeaderSource).toContain('className="flex items-center gap-2"');
    expect(scheduleHeaderSource).toContain('aria-label="返回商户首页"');
    expect(scheduleHeaderSource).toContain('placeholder="搜索预约、客户、员工、状态"');
    expect(scheduleHeaderSource).toContain('name="search"');
    expect(scheduleHeaderSource).toContain("<FeatureSegmentedTabs");
    expect(shellSource).toContain("showBottomNav={!isMerchantAppointmentsView && !merchantProfileEditing}");
    expect(merchantSource).toContain('activeView === "schedule" && "relative z-30"');
    expect(schedulePanelSource).toContain("onAppointmentSearchQueryChange={setMerchantAppointmentSearchQuery}");
    expect(schedulePanelSource).toContain("appointmentSearchQuery={merchantAppointmentSearchQuery}");
    expect(schedulePanelSource).toContain("searchQuery={merchantAppointmentSearchQuery}");
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

  it("keeps the merchant staff detail header as a single shared glass layer", () => {
    const staffDetailSource = merchantSource.slice(
      merchantSource.indexOf("export function MerchantStaffDetailRoutePage"),
      merchantSource.indexOf("function MerchantOrdersHeader")
    );

    expect(staffDetailSource).toContain("<MobileFullscreenHeader");
    expect(staffDetailSource).toContain("showSpacer={false}");
    expect(staffDetailSource).not.toContain('className="fixed inset-x-0 top-0 z-[70] mx-auto w-full max-w-[480px]"');
    expect(staffDetailSource).toContain("pt-[calc(env(safe-area-inset-top)+86px)]");
    expect(staffDetailSource).toContain("pb-[calc(env(safe-area-inset-bottom)+124px)]");
    expect(staffDetailSource).toContain('<div className="space-y-3">');
  });

  it("hydrates a directly opened staff detail from the formal merchant API", () => {
    const staffDetailSource = merchantSource.slice(
      merchantSource.indexOf("export function MerchantStaffDetailRoutePage"),
      merchantSource.indexOf("function MerchantOrdersHeader")
    );

    expect(staffDetailSource).toContain('backofficeRealDataApi.technician("merchant-admin", technicianApiId)');
    expect(staffDetailSource).toContain("<FormalTechnicianDetailPanel detail={formalDetail} />");
    expect(staffDetailSource).toContain("正在读取员工资料");
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
    expect(meHeaderSource).toContain("footer={");
    expect(meHeaderSource).not.toContain("<SharedHomeHeader");
    expect(merchantSource).toContain('showBottomNav={!isMerchantAppointmentsView && !merchantProfileEditing}');
  });

  it("keeps the personal-center status panel inside the same mobile content inset", () => {
    const statusPanelSource = merchantSource.slice(
      merchantSource.indexOf('{activeView === "dashboard" ? (', merchantSource.indexOf("{selectedContact && (")),
      merchantSource.indexOf("</MobileShell>")
    );

    expect(statusPanelSource).toContain('className={activeView === "me" ? "mx-4 !w-auto" : undefined}');
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
    expect(merchantSource).toContain('technicianPricingRatePercent={storeTechnicianPricingRatePercent}');
    expect(merchantSource).toContain('data-testid="merchant-pricing-ratio-menu"');
    expect(merchantSource).toContain("店铺报价与技师定价的比例");
    expect(merchantSource).toContain("默认 100%，每次调整 10%。");
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
    expect(pricingControlSource).toContain('onRatePercentChange(technicianPricingRatioPercent);');
    expect(pricingControlSource).toContain('技师定价（{ratePercent}%）');
    expect(pricingControlSource).not.toContain("onMenuOpenChange(true);");
    expect(pricingConfirmSource).toContain("setStorePricingRatioMenuOpen(true);");
    expect(pricingUpdateSource).toContain("setStoreTechnicianPricingRatePercent(result.technicianPricingRatePercent);");
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
});
