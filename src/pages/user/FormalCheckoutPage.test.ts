import { describe, expect, it } from "vitest";
import formalSource from "./FormalCheckoutPage.tsx?raw";
import checkoutSource from "./CheckoutPage.tsx?raw";
import progressSource from "./formal-checkout/CheckoutProgressNav.tsx?raw";
import { translations } from "../../i18n/translations";

describe("formal customer checkout", () => {
  it("routes typed numeric service references into an isolated API-only checkout", () => {
    expect(checkoutSource).toContain("isBookingApiId(serviceId)");
    expect(checkoutSource).toContain("isBookingApiId(technicianServiceId)");
    expect(checkoutSource).toContain('type: "shop_service"');
    expect(checkoutSource).toContain('type: "technician_service"');
    expect(formalSource).toContain("coreReadApi.getServiceDetail(serviceId)");
    expect(formalSource).toContain("bookingApi.getTechnicianServiceBookingContext");
    expect(formalSource).toContain("getExchangePost");
    expect(formalSource).toContain("loadAvailabilityWindow");
    expect(formalSource).toContain("bookingApi.createBooking");
    expect(formalSource).toContain("isCheckoutSlotBookable(slot, Date.now())");
    expect(formalSource).toContain("scheduleSlotId: freshSelectedSlot.id");
    expect(formalSource).toContain("navigate(`/orders/${order.id}`");
  });

  it("validates Intelligence source target and window before submitting the source id", () => {
    expect(formalSource).toContain('searchParams.get("exchangePost")');
    expect(formalSource).toContain("slotInsideIntelligenceWindow");
    expect(formalSource).toContain("exchangeIntelligencePostId");
    expect(formalSource).toContain("resolveBookingIdempotencyKey");
    expect(formalSource).not.toContain("campaignPriceJpy:");
  });

  it("loads all formal rows for the exact Tokyo date into the checkout-time dropdown", () => {
    expect(formalSource).toContain("includeUnavailable: true");
    expect(formalSource).toContain("getTokyoDayWindow");
    expect(formalSource).toContain("resolveInitialCheckoutSlotId");
    expect(formalSource).toContain("<CheckoutTimeRow");
    expect(formalSource).not.toContain("formatSlotDateTime(slot.startsAt)");
  });

  it("keeps mock checkout data exclusive to explicit static-demo mode", () => {
    expect(checkoutSource).toContain('<Navigate replace to="/categories" />');
    expect(checkoutSource).toContain('<Navigate replace to="/categories" />');
  });

  it("does not copy formal reservations into local stores or mock entities", () => {
    expect(formalSource).not.toContain("../../data/mock");
    expect(formalSource).not.toContain("entityStore");
    expect(formalSource).not.toContain("shiftPlanningStore");
    expect(formalSource).not.toContain("userOrderStore");
    expect(formalSource).not.toContain("addUserOrder");
  });

  it("has explicit loading, error, retry, empty-slot, and submission states", () => {
    expect(formalSource).toContain('type LoadStatus = "loading" | "success" | "error"');
    expect(formalSource).toContain('useState<LoadStatus>("loading")');
    expect(formalSource).toContain("重新加载预约页");
    expect(formalSource).toContain("暂时没有可预约时段");
    expect(formalSource).toContain("创建预约中");
    expect(formalSource).toContain("预约状态已变化，请重新选择时段");
  });

  it("keeps the production confirmation structure while using formal data", () => {
    for (const label of ["套餐", "到店服务", "时间", "地址", "技师", "备注"]) {
      expect(progressSource).toContain(`label: "${label}"`);
    }
    expect(formalSource).toContain("注意事项");
    expect(formalSource).toContain("取消政策");
    expect(formalSource).toContain("NDP（NeeDoPoint）");
    expect(formalSource).toContain("确定预约");
    expect(formalSource).toContain("Google Maps");
    expect(formalSource).toContain("门店位置预览");
    expect(formalSource).toContain("复制地址");
    expect(formalSource).toContain("预约时间");
    expect(formalSource).toContain("technician.reviewSummary.ratingAverage");
    expect(formalSource).not.toContain("acceptRate: 98");
    expect(formalSource).not.toContain("选择可预约时段");
    expect(formalSource).not.toContain("提交正式预约");
  });

  it("reuses a stripped shared technician card with the formal profile-card route", () => {
    expect(formalSource).toContain("<SocialProfileMiniCard");
    expect(formalSource).toContain("showSocialStats={false}");
    expect(formalSource).toContain("showLevel={false}");
    expect(formalSource).toContain("?view=card");
    expect(formalSource).toContain("id: technician.publicId");
    expect(formalSource).not.toContain("id: String(technician.id)");
    expect(formalSource).not.toContain("navigate(`/technicians/");
    expect(formalSource).not.toContain("acceptanceRatePercent}% 接单率");
  });

  it("renders the formal package through the unified service information card", () => {
    expect(formalSource).toContain("UnifiedServiceInfoCard");
    expect(formalSource).toContain("serviceInfo: mapCoreServiceCardToUnifiedData(serviceDetail)");
    expect(formalSource).toContain("<UnifiedServiceInfoCard data={displayServiceInfo}");
    expect(formalSource).toContain("mapExchangeIntelligenceServiceToUnifiedData");
    expect(formalSource).toContain("mapTechnicianBookingContextServiceToUnifiedData");
    expect(formalSource).not.toContain("mapCoreServiceToServiceItem");
  });

  it("renders the approved detailed body without reviving unsupported stores", () => {
    for (const copy of ["套餐", "服务方式", "预约时间", "地址", "技师", "特殊需求", "注意事项", "取消政策", "NDP（NeeDoPoint）"]) {
      expect(formalSource).toContain(copy);
    }
    expect(formalSource).not.toContain("entityStore");
    expect(formalSource).not.toContain("shiftPlanningStore");
    expect(formalSource).not.toContain("userOrderStore");
    expect(formalSource).not.toContain("../../data/mock");
  });

  it("tracks six approved sections through the viewport center", () => {
    expect(formalSource).toContain("progressBarRef");
    expect(formalSource).toContain("sectionRefs");
    expect(formalSource).toContain("resolveActiveCheckoutStep");
    expect(formalSource).toContain('window.addEventListener("scroll"');
    expect(formalSource).toContain('window.addEventListener("resize"');
    expect(formalSource).toContain('section.scrollIntoView({ behavior, block: "start" })');
    expect(formalSource.match(/sectionRefs\.current\[[0-5]\]/g)).toHaveLength(6);
    expect(formalSource).toContain("<CheckoutProgressNav");
    expect(formalSource).toContain("activeIndex={activeProgressStep}");
  });

  it("keeps the approved action footer attached to the formal booking submission", () => {
    expect(formalSource).toContain("应付金额");
    expect(formalSource).toContain("联系");
    expect(formalSource).toContain("确定预约");
    expect(formalSource).toContain("safe-nav-bottom");
    expect(formalSource).toContain("pointer-events-none fixed inset-x-0 bottom-0");
    expect(formalSource).toContain("paymentMethod");
    expect(formalSource).toContain("void submitBooking()");
    expect(formalSource).toContain('estimateStatus === "success"');
    expect(formalSource).toContain('(!estimate || estimateStatus !== "success" || Date.parse(estimate.expiresAt) <= Date.now())');
  });

  it("requires a structured Japanese address and valid server estimate for home checkout", () => {
    for (const field of ["postalCode", "prefecture", "city", "addressLine1", "addressLine2", "building"]) {
      expect(formalSource).toContain(`updateHomeAddress("${field}"`);
    }
    expect(formalSource).toContain("travelFareApi.createEstimate");
    expect(formalSource).toContain("servicePublicId: service.publicId");
    expect(formalSource).toContain("scheduleSlotId: selectedSlotId");
    expect(formalSource).toContain("estimateRequestVersionRef");
    expect(formalSource).toContain("不加载第三方地图预览");
    expect(formalSource).toContain("travelEstimatePublicId: estimate!.publicId");
    expect(formalSource).toContain("fulfillmentAddress:");
    expect(formalSource).toContain("正式交通费");
    expect(formalSource).toContain("驾驶距离");
    expect(formalSource).toContain("适用上限");
    expect(formalSource).toContain("交通费估价已过期");
    expect(formalSource).toContain("超出店铺的上门服务范围");
    expect(formalSource).toContain("路线供应商尚未配置");
    expect(formalSource).toContain("重新估算交通费");
  });

  it("requires all checkout submission gates", () => {
    expect(formalSource).toContain("disabled={!canSubmitBooking || submitting}");
  });

  it("uses formal JP prefecture and municipality selectors for home service", () => {
    expect(formalSource).toMatch(/bookingApi\s*\.\s*listAdministrativeRegions/);
    expect(formalSource).toContain('country: "JP"');
    expect(formalSource).toContain("parent: selectedAdmin1Code");
    expect(formalSource).toContain('aria-label="都道府县"');
    expect(formalSource).toContain('aria-label="市区町村"');
    expect(formalSource).toContain('? { fulfillmentMode: "home" as const, serviceLocation:');
    expect(formalSource).toContain('countryCode: "JP"');
    expect(formalSource).toContain("admin1Code: selectedAdmin1Code");
    expect(formalSource).toContain("admin2Code: selectedAdmin2Code");
    expect(formalSource).toContain('Boolean(homeAddress.addressLine1.trim() && selectedAdmin1Code && selectedAdmin2Code && estimateStatus === "success")');
  });

  it("keeps the typed home address while excluding structured home codes in store mode", () => {
    expect(formalSource).toContain("onClick={() => setFulfillmentMode(mode)}");
    expect(formalSource).not.toContain('setAddress("")');
    expect(formalSource).toContain(': { fulfillmentMode: "store" as const }');
  });

  it("provides every Task 3 selector message in each supported target locale", () => {
    const taskThreeKeys = [
      "请选择都道府县",
      "请选择市区町村",
      "正在加载市区町村",
      "行政区域加载失败，请重试",
      "请先选择都道府县和市区町村，再提交预约",
    ];

    for (const key of taskThreeKeys) {
      expect(translations[key]).toBeDefined();
      for (const locale of ["zh-Hant", "ja", "en", "ko"] as const) {
        expect(translations[key]?.[locale]?.trim()).toBeTruthy();
      }
    }
  });
});
