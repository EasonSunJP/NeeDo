// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import type { MerchantGroupCard, ShopCard } from "../features/merchant-saas-billing/model";
import {
  getMerchantAdminPreview,
  merchantAdminPreviewStorageKey,
  openMerchantAdminPreviewWindow,
  startMerchantAdminPreview,
} from "./merchantAdminPreview";

const shop: ShopCard = {
  id: 21,
  type: "shop",
  name: "第一家店",
  city: "东京",
  address: "港区",
  phone: null,
  status: "published",
  ownerEmail: null,
  coverUrl: null,
  ratingAverage: 0,
  reviewCount: 0,
  technicianCount: 1,
  suspension: null,
  createdAt: "2026-09-08T00:00:00.000Z",
  billing: {
    subjectType: "shop",
    subjectId: 21,
    cadence: "monthly",
    monthlyFeeJpy: 9800,
    annualFeeJpy: 98000,
    cadenceLocked: false,
    amountLocked: false,
    state: "paid",
    trialStatus: "completed",
    trialStartedAt: null,
    trialEndsAt: null,
    paidThrough: null,
    paymentProvider: "manual",
    freeDuration: null,
    extensionCount: 0,
    version: 1,
  },
};
const group: MerchantGroupCard = {
  id: 900,
  type: "merchant_group",
  code: "group",
  name: "集团",
  status: "active",
  paymentResponsibility: "group_consolidated",
  billing: shop.billing,
  suspension: null,
  consolidatedMonthlyTotalJpy: 19600,
  shops: [shop, { ...shop, id: 22, name: "第二家店" }],
  createdAt: shop.createdAt,
};

beforeEach(() => window.sessionStorage.removeItem(merchantAdminPreviewStorageKey));

it("starts a group preview at the selected real child shop", () => {
  const preview = startMerchantAdminPreview(group, "/admin/merchants", 22);
  expect(preview?.selectedShopId).toBe(22);
  expect(getMerchantAdminPreview()?.selectedShopId).toBe(22);
});

it("falls back to the first real shop when the requested child is outside the group", () => {
  const preview = startMerchantAdminPreview(group, "/admin/merchants", 999);
  expect(preview?.selectedShopId).toBe(21);
});

it("opens the merchant portal in a new tab and severs the opener reference", () => {
  const opened = { opener: window } as unknown as Window;
  const openWindow = vi.fn(() => opened);
  expect(openMerchantAdminPreviewWindow(openWindow)).toBe(true);
  expect(openWindow).toHaveBeenCalledWith("/pf-admin.html#/merchant-admin", "_blank");
  expect(opened.opener).toBeNull();
});
