import { describe, expect, it } from "vitest";
import merchantSource from "./MerchantPortalPage.tsx?raw";
import storeDetailSource from "../user/StoreDetailPage.tsx?raw";

describe("MerchantPortalPage store privacy control", () => {
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
    expect(shellSource).toContain("showBottomNav={!isMerchantAppointmentsView}");
    expect(schedulePanelSource).toContain("onAppointmentSearchQueryChange={setMerchantAppointmentSearchQuery}");
    expect(schedulePanelSource).toContain("appointmentSearchQuery={merchantAppointmentSearchQuery}");
    expect(schedulePanelSource).toContain("searchQuery={merchantAppointmentSearchQuery}");
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

  it("adds the floating privacy menu to the merchant service card only", () => {
    expect(merchantSource).toContain('{ label: "服务展示", value: "service" }');
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
