// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CoreShopDetail, CoreTechnicianCard } from "../../features/core-read/api";
import type { Technician } from "../../types/domain";
import { MerchantAdminSettingsPage } from "./MerchantAdminSettingsPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const previewContext = vi.hoisted(() => ({
  props: null as null | { store: { id: string }; techniciansOverride?: Technician[] }
}));
const backofficeMock = vi.hoisted(() => ({
  merchantShop: vi.fn(),
  updateMerchantShop: vi.fn()
}));
const coreReadMock = vi.hoisted(() => ({ getShopDetail: vi.fn() }));
const payrollMock = vi.hoisted(() => ({ getShop: vi.fn(), updateShop: vi.fn() }));

vi.mock("../../api/backofficeRealData", () => ({ backofficeRealDataApi: backofficeMock }));
vi.mock("../../api/payrollSchedulePolicy", () => ({ payrollSchedulePolicyApi: payrollMock }));
vi.mock("../../features/core-read/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../features/core-read/api")>();
  return { ...actual, coreReadApi: { ...actual.coreReadApi, getShopDetail: coreReadMock.getShopDetail } };
});
vi.mock("../../components/merchant-admin/MerchantAdminLayout", () => ({
  MerchantAdminLayout: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock("../../components/merchant-admin/PayrollSchedulePolicyEditor", () => ({ PayrollSchedulePolicyEditor: () => null }));
vi.mock("../../i18n/I18nProvider", () => ({ useOptionalI18n: () => ({ language: "zh" }) }));
vi.mock("../user/StoreDetailPage", () => ({
  StoreDetailExperience: (props: { store: { id: string }; techniciansOverride?: Technician[] }) => {
    previewContext.props = props;
    return null;
  }
}));

const reviewSummary = {
  ratingAverage: "4.80",
  reviewCount: 12,
  latestReviewAt: "2026-09-20T00:00:00.000Z",
  highlights: ["丁寧"]
};

function technician(id: number): CoreTechnicianCard {
  return {
    id,
    publicId: `s${String(id).padStart(10, "0")}`,
    displayName: `StagingTest 技师 ${id}`,
    city: "Tokyo",
    avatarUrl: null,
    reviewSummary,
    age: null,
    favoriteCount: 0,
    shareCount: 0,
    completedOrderCount: 0,
    acceptanceRatePercent: 100,
    primaryService: null
  };
}

const formalShopDetail = {
  id: 11,
  publicId: "shop0000000011",
  name: "StagingTest",
  city: "Tokyo",
  address: "Shibuya",
  coverUrl: null,
  reviewSummary,
  completedOrderCount: 0,
  favoriteCount: 0,
  shareCount: 0,
  serviceCategories: [],
  businessKeywords: [],
  description: "Formal store detail",
  phone: null,
  latitude: null,
  longitude: null,
  mediaAssets: [],
  services: [],
  technicians: Array.from({ length: 26 }, (_, index) => technician(101 + index)),
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z"
} satisfies CoreShopDetail;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  previewContext.props = null;
  backofficeMock.merchantShop.mockReset().mockResolvedValue({
    list: [{
      id: 11,
      ownerUserId: 7,
      avatarUrl: null,
      ownerEmail: "merchant@example.test",
      name: "StagingTest",
      description: "Formal store detail",
      city: "Tokyo",
      address: "Shibuya",
      phone: null,
      status: "published",
      isRecommended: true,
      createdAt: "2026-09-01T00:00:00.000Z"
    }],
    total: 1,
    page: 1,
    page_size: 20
  });
  coreReadMock.getShopDetail.mockReset().mockResolvedValue(formalShopDetail);
  payrollMock.getShop.mockReset().mockResolvedValue({
    configured: false,
    source: "shop_unconfigured",
    shopPolicy: null,
    effectivePolicy: null,
    preview: null
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("passes the same authoritative shop-detail technician projection to the merchant preview", async () => {
  await act(async () => {
    root.render(createElement(MemoryRouter, null, createElement(MerchantAdminSettingsPage)));
  });

  await vi.waitFor(() => expect(previewContext.props).not.toBeNull());

  expect(coreReadMock.getShopDetail).toHaveBeenCalledWith(11);
  expect(previewContext.props?.store.id).toBe("11");
  expect(previewContext.props?.techniciansOverride).toHaveLength(26);
  expect(previewContext.props?.techniciansOverride?.[0]).toMatchObject({
    id: "101",
    name: "StagingTest 技师 101",
    storeId: "11"
  });
});
