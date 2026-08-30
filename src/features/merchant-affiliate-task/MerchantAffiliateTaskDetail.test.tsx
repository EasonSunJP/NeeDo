// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantAffiliateTask } from "../../api/merchantAffiliateTasks";
import { MerchantAffiliateTaskDetail } from "./MerchantAffiliateTaskDetail";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({ language: "zh" })
}));

const detailTask = {
  id: 765432,
  taskCode: "AFF-2026-PUBLIC-42",
  lineageKey: "internal-lineage",
  version: 1,
  lockVersion: 7,
  publisherType: "merchant_account",
  publisherMerchantAccountId: 987654,
  publisherShopId: null,
  publisherDisplayName: "NeeDo Group",
  translations: {
    ja: { name: "紹介タスク", description: "紹介説明", sourceLocale: "ja", isInitialCopy: false }
  },
  name: "紹介タスク",
  description: "紹介説明",
  coverMediaAssetId: 665544,
  rewardNdpPerCompletedOrder: 1_000,
  totalBudgetNdp: 2_000_000,
  platformFeeRuleId: 554433,
  platformFeeBps: 1_000,
  platformFeeReserveNdp: 200_000,
  reservedBudgetNdp: 2_200_000,
  allocatedBudgetNdp: 0,
  settledBudgetNdp: 0,
  settledPlatformFeeNdp: 0,
  releasedBudgetNdp: 0,
  releasedPlatformFeeNdp: 0,
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
  status: "rejected",
  reviewedById: 443322,
  reviewedAt: "2026-08-30T04:00:00.000Z",
  rejectionReason: "补充活动说明",
  submittedAt: "2026-08-30T03:00:00.000Z",
  activatedAt: null,
  createdAt: "2026-08-30T02:00:00.000Z",
  updatedAt: "2026-08-30T05:00:00.000Z",
  shops: [{ id: 332211, shopId: 221100, shopNameSnapshot: "Shibuya Shop", publicId: "shop0000000011" }],
  services: [{ id: 998877, shopId: 221100, serviceId: 876543, serviceNameSnapshot: "Cut", servicePriceJpySnapshot: 5_000 }],
  budgetReservation: {
    id: 778899,
    taskId: 765432,
    walletId: 889900,
    totalFrozenNdp: 2_200_000,
    commissionFrozenNdp: 2_000_000,
    platformFeeFrozenNdp: 200_000,
    allocatedNdp: 0,
    capturedNdp: 0,
    platformFeeCapturedNdp: 0,
    releasedNdp: 0,
    platformFeeReleasedNdp: 0,
    status: "active",
    idempotencyKey: "internal-key",
    frozenAt: "2026-08-30T03:00:00.000Z",
    releasedAt: null
  }
} satisfies MerchantAffiliateTask;

describe("MerchantAffiliateTaskDetail", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("shows public business detail and omits all technical identifiers", async () => {
    await act(async () => root.render(<MerchantAffiliateTaskDetail task={detailTask} />));
    const visible = container.textContent ?? "";

    expect(visible).toContain("AFF-2026-PUBLIC-42");
    expect(visible).toContain("shop0000000011");
    expect(visible).toContain("NeeDo Group");
    expect(visible).toContain("Shibuya Shop");
    expect(visible).toContain("Cut");
    expect(visible).toContain("5,000 JPY");
    expect(visible).toContain("补充活动说明");
    expect(visible).toContain("2,200,000 NDP");
    for (const internalId of ["765432", "987654", "876543", "889900", "443322", "665544", "554433"]) {
      expect(visible).not.toContain(internalId);
    }
    expect(visible).not.toContain("internal-lineage");
    expect(visible).not.toContain("internal-key");
  });
});
