import { describe, expect, it } from "vitest";
import formalSource from "./FormalCheckoutPage.tsx?raw";
import checkoutSource from "./CheckoutPage.tsx?raw";
import progressSource from "./formal-checkout/CheckoutProgressNav.tsx?raw";
import timeRowSource from "./formal-checkout/CheckoutTimeRow.tsx?raw";
import { checkoutText, type CheckoutTextKey } from "./formal-checkout/i18n";
import type { Language } from "../../i18n/translations";

describe("formal customer checkout", () => {
  it("routes shop, scoped technician, and Intelligence technician services into API-only checkout", () => {
    expect(checkoutSource).toContain("isBookingApiId(technicianServiceId)");
    expect(checkoutSource).toContain("parseCheckoutServiceRoute(serviceId, searchParams)");
    expect(checkoutSource).toContain('type: "shop_service"');
    expect(checkoutSource).toContain('type: "technician_service"');
    expect(formalSource).toContain("coreReadApi.getServiceDetail(serviceId)");
    expect(formalSource).toContain("pricingModeApi.listPublicTechnicianServices");
    expect(formalSource).toContain("bookingApi.getTechnicianServiceBookingContext");
    expect(formalSource).toContain("getExchangePost");
    expect(formalSource).toContain("loadAvailabilityWindow");
    expect(formalSource).toContain("bookingApi.createBooking");
    expect(formalSource).toContain("technicianServiceId: catalogRef.id");
    expect(formalSource).toContain("isCheckoutSlotBookable(slot, Date.now())");
    expect(formalSource).toContain("scheduleSlotId: freshSelectedSlot.id");
    expect(formalSource).toContain("nominatedTechnicianProfileId");
    expect(formalSource).toContain("freshSelectedSlot.nominationFeeJpy ?? 0");
    expect(formalSource).toContain('return "priceUpdated"');
    expect(formalSource).toContain("error.code === 41038");
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
    expect(formalSource).toContain('t("reloadCheckout")');
    expect(formalSource).toContain('t("noSlots")');
    expect(formalSource).toContain('t("creatingBooking")');
    expect(formalSource).toContain('"bookingStateChanged"');
  });

  it("keeps location, unavailable-slot, and concurrent-occupancy failures distinct in every locale", () => {
    expect(formalSource).toContain('error.message === "error.booking.service_location_unresolved"');
    expect(formalSource).toContain('error.message === "error.booking.slot_unavailable"');
    expect(formalSource).toContain('error.message === "error.booking.slot_concurrent_occupancy"');

    for (const key of [
      "storeLocationUnavailable",
      "invalidCheckoutSlot",
      "slotConcurrentOccupancy"
    ] as const) {
      for (const locale of ["zh", "zh-Hant", "ja", "en", "ko"] satisfies readonly Language[]) {
        expect(checkoutText(key as CheckoutTextKey, locale).trim()).toBeTruthy();
      }
    }
  });

  it("keeps the production confirmation structure while using formal data", () => {
    for (const label of ["套餐", "到店服务", "时间", "地址", "技师", "备注"]) {
      expect(progressSource).toContain(`label: "${label}"`);
    }
    expect(formalSource).toContain('t("notices")');
    expect(formalSource).toContain('t("cancellationPolicy")');
    expect(formalSource).toContain("NDP（NeeDoPoint）");
    expect(formalSource).toContain('t("confirmBooking")');
    expect(formalSource).toContain("Google Maps");
    expect(formalSource).toContain('t("storeMapPreview")');
    expect(formalSource).toContain('t(addressCopyLabel)');
    expect(formalSource).toContain('t("bookingTime")');
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
    expect(formalSource).toContain("const serviceInfo = mapCoreServiceCardToUnifiedData(serviceDetail)");
    expect(formalSource).toContain("displayServiceInfos.map((serviceInfo, index) => (");
    expect(formalSource).toMatch(/<UnifiedServiceInfoCard[\s\S]*data=\{serviceInfo\}/u);
    expect(formalSource).toContain("mapExchangeIntelligenceServiceToUnifiedData");
    expect(formalSource).toContain("mapTechnicianBookingContextServiceToUnifiedData");
    expect(formalSource).not.toContain("mapCoreServiceToServiceItem");
  });

  it("renders the approved detailed body without reviving unsupported stores", () => {
    for (const key of ["package", "serviceMethod", "bookingTime", "address", "technician", "specialRequests", "notices", "cancellationPolicy"] as const) {
      expect(formalSource).toContain(`t("${key}")`);
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
    expect(formalSource).toContain('t("amountDue")');
    expect(formalSource).toContain('t("contact")');
    expect(formalSource).toContain('t("confirmBooking")');
    expect(formalSource).toContain("safe-nav-bottom");
    expect(formalSource).toContain("pointer-events-none fixed inset-x-0 bottom-0");
    expect(formalSource).toContain("paymentMethod");
    expect(formalSource).toContain("void submitBooking()");
    expect(formalSource).toContain('estimateStatus === "success"');
    expect(formalSource).toContain('(!estimate || estimateStatus !== "success" || Date.parse(estimate.expiresAt) <= Date.now())');
  });

  it("requires a structured Japanese address and valid server estimate for home checkout", () => {
    for (const field of ["postalCode", "prefecture", "city", "addressLine1", "building"]) {
      expect(formalSource).toContain(`updateHomeAddress("${field}"`);
    }
    expect(formalSource).not.toContain('aria-label={t("addressExtra")}');
    expect(formalSource).toContain('aria-label={t("buildingRoom")} className="focus-ring col-span-2');
    expect(formalSource).toContain("isTravelEstimateAddressComplete(");
    expect(formalSource).toContain('disabled={estimateStatus === "loading" || !selectedSlotId || !travelEstimateAddressComplete}');
    expect(formalSource).toContain("travelFareApi.createEstimate");
    expect(formalSource).toContain("servicePublicId: service.publicId");
    expect(formalSource).toContain("scheduleSlotId: selectedSlotId");
    expect(formalSource).toContain("estimateRequestVersionRef");
    expect(formalSource).toContain('t("homeAddressPrivacy")');
    expect(formalSource).toContain("travelEstimatePublicId: estimate!.publicId");
    expect(formalSource).toContain("fulfillmentAddress:");
    expect(formalSource).toContain('t("formalTravelFee"');
    expect(formalSource).toContain('t("routeDetails"');
    expect(formalSource).toContain('t("estimateExpired")');
    expect(formalSource).toContain('return "travelOutsideArea"');
    expect(formalSource).toContain('return "travelProviderUnconfigured"');
    expect(formalSource).toContain('t("recalculateTravelFee")');
    for (const key of ["streetAddressPlaceholder", "buildingRoom", "buildingRoomPlaceholder"] as const) {
      for (const locale of ["zh", "zh-Hant", "ja", "en", "ko"] satisfies readonly Language[]) {
        expect(checkoutText(key, locale).trim()).toBeTruthy();
      }
    }
  });

  it("requires all checkout submission gates", () => {
    expect(formalSource).toContain("disabled={(isAuthenticated ? !canSubmitBooking : !selectedSlot) || submitting}");
  });

  it("uses formal JP prefecture and municipality selectors for home service", () => {
    expect(formalSource).toMatch(/bookingApi\s*\.\s*listAdministrativeRegions/);
    expect(formalSource).toContain('country: "JP"');
    expect(formalSource).toContain("parent: selectedAdmin1Code");
    expect(formalSource).toContain('aria-label={t("prefecture")}');
    expect(formalSource).toContain('aria-label={t("municipality")}');
    expect(formalSource).toContain('? { fulfillmentMode: "home" as const, serviceLocation:');
    expect(formalSource).toContain('countryCode: "JP"');
    expect(formalSource).toContain("admin1Code: selectedAdmin1Code");
    expect(formalSource).toContain("admin2Code: selectedAdmin2Code");
    expect(formalSource).toContain('Boolean(homeAddress.addressLine1.trim() && selectedAdmin1Code && selectedAdmin2Code && estimateStatus === "success")');
  });

  it("reuses the authenticated customer's persistent addresses for home checkout", () => {
    expect(formalSource).toContain("customerAddressApi.list");
    expect(formalSource).toContain("applySavedAddress");
    expect(formalSource).toContain('aria-label={t("savedAddress")}');
    expect(formalSource).toContain('navigate("/me/addresses")');
    expect(formalSource).not.toContain("localStorage");
    for (const key of ["savedAddress", "selectSavedAddress", "savedAddressLoadFailed"] as const) {
      for (const locale of ["zh-Hant", "ja", "en", "ko"] as const) {
        expect(checkoutText(key, locale).trim()).toBeTruthy();
      }
    }
  });

  it("keeps the typed home address while excluding structured home codes in store mode", () => {
    expect(formalSource).toContain("onClick={() => setFulfillmentMode(mode)}");
    expect(formalSource).not.toContain('setAddress("")');
    expect(formalSource).toContain(': { fulfillmentMode: "store" as const }');
  });

  it("provides every Task 3 selector message in each supported target locale", () => {
    const taskThreeKeys = [
      "choosePrefecture",
      "chooseMunicipality",
      "loadingMunicipalities",
      "regionLoadFailed",
      "chooseRegionsBeforeSubmit",
    ] as const satisfies readonly CheckoutTextKey[];

    for (const key of taskThreeKeys) {
      for (const locale of ["zh-Hant", "ja", "en", "ko"] as const) {
        expect(checkoutText(key, locale).trim()).toBeTruthy();
      }
    }
  });

  it("localizes complete checkout messages instead of translating concatenated fragments", () => {
    expect(formalSource).toContain("useCheckoutText");
    expect(progressSource).toContain("useCheckoutText");
    expect(timeRowSource).toContain("useCheckoutText");

    for (const mixedSource of [
      "由店铺安排技师",
      "确认接单后将在预约详情中显示正式担当信息。",
      "女性技师优先",
      "请提前联系",
      "预约前请确认服务时间、地址与付款方式；服务内容以本页正式数据及店铺最终确认结果为准。",
      "提交后可在预约详情查看当前状态；取消条件以正式订单状态与店铺规则为准。",
      "本次订单的 NDP 使用与结算结果，以服务完成后的正式结算记录为准。",
      "到店后支付",
    ]) {
      expect(formalSource).not.toContain(`>${mixedSource}<`);
    }

    expect(formalSource).not.toContain("`已填写 ${note.trim().length} 字`");
    expect(formalSource).not.toContain("驾驶距离 {(estimate.distanceMeters / 1000).toFixed(1)} km");
    expect(progressSource).not.toContain("`查看${step.label}`");
    expect(timeRowSource).not.toContain("`剩余 ${selectedSlot ? remainingCheckoutCapacity(selectedSlot) : 0} 名`");
    expect(timeRowSource).not.toContain("`${date} 可预约时间`");
  });

  it("provides natural Japanese checkout copy and parameterized interpolation in every locale", () => {
    expect(checkoutText("assignedByShop", "ja")).toBe("担当スタッフは店舗が手配します");
    expect(checkoutText("assignedAfterConfirmation", "ja")).toBe("店舗が予約を確定すると、予約詳細に担当スタッフが表示されます。");
    expect(checkoutText("preferFemaleTechnician", "ja")).toBe("女性スタッフを希望");
    expect(checkoutText("contactInAdvance", "ja")).toBe("事前連絡を希望");
    expect(checkoutText("bookingNotice", "ja")).toContain("予約前に日時、住所、支払い方法をご確認ください");
    expect(checkoutText("cancellationNotice", "ja")).toContain("予約後の状況は予約詳細で確認できます");
    expect(checkoutText("ndpNotice", "ja")).toContain("正式な精算記録で確定します");
    expect(checkoutText("payOnArrival", "ja")).toBe("現地で支払う");
    expect(checkoutText("noteCount", "ja", { count: 12 })).toBe("12文字入力済み");
    expect(checkoutText("routeDetails", "ja", { distance: "2.5", maximum: "5.0", version: 3 })).toBe("車での距離 2.5 km・適用上限 5.0 km・料金規則 v3");
    expect(checkoutText("availableTimesAria", "ja", { date: "2026-09-13" })).toBe("2026-09-13の予約可能時間");

    for (const locale of ["zh", "zh-Hant", "ja", "en", "ko"] satisfies readonly Language[]) {
      expect(checkoutText("remainingCapacity", locale, { count: 2 })).not.toContain("{count}");
      expect(checkoutText("viewStep", locale, { label: checkoutText("time", locale) })).not.toContain("{label}");
    }
  });
});
