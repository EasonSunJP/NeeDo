import { describe, expect, it } from "vitest";
import type {
  MerchantAffiliatePublisherOption,
  MerchantAffiliateServiceOption,
  MerchantAffiliateTask
} from "../../api/merchantAffiliateTasks";
import {
  buildCreatePayload,
  buildFeePreviewKey,
  buildFeePreviewPayload,
  buildScopePayload,
  buildUpdatePayload,
  changePublisher,
  removeShop,
  affiliateLocaleOrder,
  taskToLocaleEditorState,
  taskDisplayRows,
  type MerchantAffiliateTaskForm
} from "./model";

const form: MerchantAffiliateTaskForm = {
  taskId: 81,
  taskCode: "AFF-TEST-81",
  lockVersion: 2,
  publisherType: "merchant_account",
  merchantAccountId: 31,
  shopIds: [11, 12],
  selectedServiceIds: [101, 102],
  sourceLocale: "ja",
  name: "紹介キャンペーン",
  description: "完了注文のみ",
  coverMediaAssetId: null,
  rewardNdpPerCompletedOrder: 1_000,
  totalBudgetNdp: 2_000_000,
  customerDiscountType: "none",
  fixedDiscountJpy: 0,
  discountRateBps: 0,
  discountCapJpy: 0,
  minimumOrderAmountJpy: 0,
  claimStartsAt: "2026-09-01T00:00:00.000Z",
  claimEndsAt: "2026-09-20T00:00:00.000Z",
  taskStartsAt: "2026-09-01T00:00:00.000Z",
  taskEndsAt: "2026-09-30T00:00:00.000Z",
  attributionWindowDays: 30,
  maxCompletedOrdersPerClaim: null,
  maxCompletedOrdersPerCustomer: 1,
  serviceScopeMode: "selected_services",
  translations: {},
  feePreview: {
    evaluatedAt: "2026-08-30T02:00:00.000Z",
    effectiveAt: "2026-08-30T02:00:00.000Z",
    platformFeeBps: 1_000,
    commissionBudgetNdp: 2_000_000,
    platformFeeReserveNdp: 200_000,
    grossFreezeNdp: 2_200_000,
    shopRateStatus: "consistent"
  }
};

const shopPublisher: MerchantAffiliatePublisherOption = {
  publisherType: "shop",
  merchantAccountId: null,
  shopId: 11,
  publicId: "shop0000000011",
  displayName: "Shibuya Shop",
  current: true,
  manageableShopCount: 1
};

const serviceOptions: MerchantAffiliateServiceOption[] = [
  {
    serviceId: 101,
    shopId: 11,
    serviceName: "Cut",
    priceJpy: 5_000,
    shopName: "Shibuya Shop",
    shopPublicId: "shop0000000011"
  },
  {
    serviceId: 102,
    shopId: 12,
    serviceName: "Color",
    priceJpy: 8_000,
    shopName: "Shinjuku Shop",
    shopPublicId: "shop0000000012"
  }
];

describe("merchant Affiliate task editor model", () => {
  it("clears dependent scope and fee state when the publisher changes", () => {
    expect(changePublisher(form, shopPublisher)).toMatchObject({
      publisherType: "shop",
      merchantAccountId: null,
      shopIds: [],
      selectedServiceIds: [],
      feePreview: null
    });
  });

  it("removes services belonging to a removed shop", () => {
    expect(removeShop(form, 12, serviceOptions)).toMatchObject({
      shopIds: [11],
      selectedServiceIds: [101],
      feePreview: null
    });
  });

  it("emits no selected service IDs for all-current-services scope", () => {
    expect(
      buildScopePayload({ ...form, serviceScopeMode: "all_current_services" })
    ).toMatchObject({ selectedServiceIds: [] });
  });

  it("builds publisher-specific create and optimistic update payloads", () => {
    expect(buildCreatePayload(changePublisher(form, shopPublisher))).not.toHaveProperty(
      "merchantAccountId"
    );
    expect(buildCreatePayload(changePublisher(form, shopPublisher))).not.toHaveProperty("shopIds");
    expect(buildCreatePayload(form)).toMatchObject({ merchantAccountId: 31, shopIds: [11, 12] });
    expect(buildUpdatePayload(form)).toMatchObject({ lockVersion: 2, shopIds: [11, 12] });
  });

  it("builds a stable fee key and publisher-specific preview payload", () => {
    expect(buildFeePreviewKey({ ...form, shopIds: [12, 11] })).toBe(
      "merchant_account:31:11,12:2000000"
    );
    expect(buildFeePreviewPayload(form)).toEqual({
      publisherType: "merchant_account",
      merchantAccountId: 31,
      shopIds: [11, 12],
      totalBudgetNdp: 2_000_000
    });
    expect(buildFeePreviewPayload({ ...form, publisherType: "shop", merchantAccountId: null })).toEqual({
      publisherType: "shop",
      shopIds: [11, 12],
      totalBudgetNdp: 2_000_000
    });
  });

  it("creates display rows without internal merchant, service, user, or identity IDs", () => {
    const task = {
      ...buildCreatePayload(form),
      id: 81,
      taskCode: "AFF-TEST-81",
      lineageKey: "lineage-81",
      version: 1,
      lockVersion: 2,
      publisherMerchantAccountId: 31,
      publisherShopId: null,
      publisherDisplayName: "NeeDo Group",
      translations: {},
      platformFeeRuleId: null,
      platformFeeBps: 1_000,
      platformFeeReserveNdp: 200_000,
      reservedBudgetNdp: 2_200_000,
      allocatedBudgetNdp: 0,
      settledBudgetNdp: 0,
      releasedBudgetNdp: 0,
      settledPlatformFeeNdp: 0,
      releasedPlatformFeeNdp: 0,
      status: "draft",
      reviewedById: null,
      reviewedAt: null,
      rejectionReason: null,
      submittedAt: null,
      activatedAt: null,
      createdAt: "2026-08-30T02:00:00.000Z",
      updatedAt: "2026-08-30T02:00:00.000Z",
      shops: [
        {
          id: 1,
          shopId: 11,
          shopNameSnapshot: "Shibuya Shop",
          publicId: "shop0000000011"
        }
      ],
      services: [
        {
          id: 1,
          shopId: 11,
          serviceId: 101,
          serviceNameSnapshot: "Cut",
          servicePriceJpySnapshot: 5_000
        }
      ],
      budgetReservation: null
    } as MerchantAffiliateTask;

    expect(taskDisplayRows(task).join(" ")).toContain("AFF-TEST-81");
    expect(taskDisplayRows(task).join(" ")).toContain("shop0000000011");
    expect(taskDisplayRows(task).join(" ")).not.toMatch(
      /merchantAccountId|serviceId|userId|identityId/
    );
    expect(taskDisplayRows(task).join(" ")).not.toContain(" 31 ");
    expect(taskDisplayRows(task).join(" ")).not.toContain(" 101 ");
  });

  it("builds locale editor state in the fixed API-locale order", () => {
    const localizedTask = {
      translations: {
        ja: { name: "日本語", description: null, sourceLocale: "ja", isInitialCopy: false },
        en: { name: "English", description: "Copy", sourceLocale: "ja", isInitialCopy: false }
      }
    } as MerchantAffiliateTask;
    const state = taskToLocaleEditorState(localizedTask);

    expect(affiliateLocaleOrder).toEqual(["ja", "en", "ko", "zh-TW", "zh-CN"]);
    expect(state.en).toEqual({ name: "English", description: "Copy", dirty: false });
    expect(state.ko).toEqual({ name: "", description: "", dirty: false });
  });
});
