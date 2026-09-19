// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backofficeRealDataApi } from "../../api/backofficeRealData";
import { merchantProfileApi, type MerchantIdentityProfile } from "../../features/core-read/merchantProfileApi";
import { pricingModeApi } from "../../features/pricing-mode/api";
import type { Store } from "../../types/domain";
import { MerchantPortalContent } from "./MerchantPortalPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const testState = vi.hoisted(() => ({
  session: {
    id: 9,
    portal: "merchant",
    linkedStoreId: "store-71",
    activeIdentityId: 109,
    activePublicId: "b0000000109",
    primaryPublicId: "u0000000009",
    username: "merchant@example.com",
    avatarUrl: null
  },
  imStore: {
    contacts: [],
    usersById: {},
    updateContactTags: vi.fn()
  }
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ canAccessFeature: () => true, session: testState.session })
}));

vi.mock("../../state/entityStore", () => ({
  updateTechnicianEntity: vi.fn(),
  useEntityStore: () => ({ customers: [], stores: [], technicians: [] })
}));

vi.mock("../../features/im/store", () => ({
  useImStore: () => testState.imStore
}));

vi.mock("../../components/mobile/MobileShell", () => ({
  MobileShell: ({ children }: { children: React.ReactNode }) => createElement("main", null, children)
}));

vi.mock("../../components/client-ui/AppScaffold", async () => {
  const actual = await vi.importActual<typeof import("../../components/client-ui/AppScaffold")>("../../components/client-ui/AppScaffold");
  return {
    ...actual,
    FeatureSegmentedTabs: ({ items }: { items: Array<{ label: React.ReactNode; value: string }> }) =>
      createElement("div", null, items.map((item) => createElement("span", { key: item.value }, item.label)))
  };
});

vi.mock("../../theme/ClientThemeProvider", () => ({
  getClientThemeClassName: () => "",
  useClientTheme: () => ({ isNight: false, theme: "jade-light" })
}));

vi.mock("../user/StoreDetailPage", () => ({
  StoreDetailExperience: ({ privacyControl }: { privacyControl?: React.ReactNode }) =>
    createElement("section", { "data-testid": "store-detail" }, privacyControl)
}));

const store: Store = {
  id: "store-71",
  systemId: "shop0000000071",
  merchantId: "merchant-9",
  name: "StagingTest",
  area: "渋谷区",
  address: "東京都渋谷区",
  rating: 4.8,
  reviewCount: 20,
  priceLabel: "￥8,800起",
  tags: ["テスト"],
  openStatus: "open",
  nextSlot: "今日 10:00",
  cover: "/store.jpg",
  gallery: [],
  description: "StagingTest merchant",
  rankLabel: "おすすめ",
  businessHours: "10:00-22:00",
  mode: "store",
  paymentMethods: ["platform"]
};

const profile: MerchantIdentityProfile = {
  id: 61,
  publicId: "b0000000109",
  userId: 9,
  identityId: 109,
  displayName: "StagingTest",
  avatarUrl: null,
  gender: "private",
  age: null,
  heightCm: null,
  languages: ["日本語"],
  bio: null,
  visibility: "public",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => Promise.resolve());
    }
  }
  throw lastError;
}

function portal(storeValue: Store = store) {
  return (
    <MemoryRouter initialEntries={["/merchant/me?meTab=service"]}>
      <Routes>
        <Route path="/merchant/:view" element={<MerchantPortalContent store={storeValue} technicians={[]} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("MerchantPortal merchant-profile privacy authority", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    testState.session.activeIdentityId = 109;
    testState.session.linkedStoreId = "store-71";
    vi.spyOn(backofficeRealDataApi, "technicians").mockResolvedValue({ list: [], total: 0, page: 1, page_size: 100 });
    vi.spyOn(pricingModeApi, "getShopPricingMode").mockResolvedValue({
      shopId: 71,
      pricingMode: "merchant",
      technicianPricingRatePercent: 100,
      updatedAt: null,
      updatedBy: null
    });
    vi.spyOn(pricingModeApi, "getShopVisibility").mockResolvedValue({
      shopId: 71,
      visibility: "privateAll",
      updatedAt: null,
      updatedBy: null
    });
    vi.spyOn(merchantProfileApi, "getMine").mockResolvedValue(profile);
    vi.spyOn(merchantProfileApi, "updateMine").mockResolvedValue(profile);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("renders public from the current merchant profile even when the legacy shop value is private", async () => {
    await act(async () => root.render(portal()));

    await waitFor(() => expect(merchantProfileApi.getMine).toHaveBeenCalledTimes(1));

    const control = container.querySelector('[data-testid="merchant-store-privacy-control"]');
    const toggle = control?.querySelector<HTMLButtonElement>('button[aria-label="开启店铺隐私模式"]');
    expect(control?.textContent).toContain("公开可见");
    expect(toggle?.getAttribute("aria-checked")).toBe("false");
    expect(pricingModeApi.getShopVisibility).not.toHaveBeenCalled();
  });

  it.each([
    ["privateAll", "对所有人不可见"],
    ["limited", "对好友可见"],
    ["network", "对好友以及关联人可见"]
  ] as const)("renders %s from the current merchant profile", async (visibility, label) => {
    vi.mocked(merchantProfileApi.getMine).mockResolvedValue({ ...profile, visibility });

    await act(async () => root.render(portal()));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain(label));

    const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="开启店铺隐私模式"]');
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
    expect(pricingModeApi.getShopVisibility).not.toHaveBeenCalled();
  });

  it("isolates slower profile loads across merchant identity and shop switches", async () => {
    let resolveFirst: ((value: MerchantIdentityProfile) => void) | undefined;
    const firstRequest = new Promise<MerchantIdentityProfile>((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(merchantProfileApi.getMine)
      .mockReset()
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValueOnce({
        ...profile,
        id: 62,
        publicId: "b0000000210",
        identityId: 210,
        visibility: "network"
      });

    await act(async () => root.render(portal()));
    await waitFor(() => expect(merchantProfileApi.getMine).toHaveBeenCalledTimes(1));

    testState.session.activeIdentityId = 210;
    testState.session.linkedStoreId = "store-72";
    await act(async () => root.render(portal({ ...store, id: "store-72", systemId: "shop0000000072" })));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对好友以及关联人可见"));

    await act(async () => resolveFirst?.({ ...profile, visibility: "privateAll" }));
    expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对好友以及关联人可见");
    expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).not.toContain("对所有人不可见");
  });

  it("persists a visibility change through the merchant profile and reloads it after remount", async () => {
    vi.mocked(merchantProfileApi.getMine).mockResolvedValue({ ...profile, visibility: "privateAll" });
    vi.mocked(merchantProfileApi.updateMine).mockResolvedValue({ ...profile, visibility: "limited" });

    await act(async () => root.render(portal()));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对所有人不可见"));

    const summary = container.querySelector<HTMLButtonElement>('[data-testid="merchant-store-privacy-control"] > div button');
    await act(async () => summary?.click());
    const limited = container.querySelector<HTMLButtonElement>('button[aria-label="选择对好友可见"]');
    await act(async () => limited?.click());

    await waitFor(() => expect(merchantProfileApi.updateMine).toHaveBeenCalledWith({ visibility: "limited" }));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对好友可见"));

    await act(async () => root.unmount());
    root = createRoot(container);
    vi.mocked(merchantProfileApi.getMine).mockResolvedValue({ ...profile, visibility: "limited" });
    await act(async () => root.render(portal()));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对好友可见"));
  });

  it("keeps the last server-confirmed visibility when a profile update fails", async () => {
    vi.mocked(merchantProfileApi.getMine).mockResolvedValue({ ...profile, visibility: "network" });
    vi.mocked(merchantProfileApi.updateMine).mockRejectedValue(new Error("network"));

    await act(async () => root.render(portal()));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对好友以及关联人可见"));

    const summary = container.querySelector<HTMLButtonElement>('[data-testid="merchant-store-privacy-control"] > div button');
    await act(async () => summary?.click());
    const limited = container.querySelector<HTMLButtonElement>('button[aria-label="选择对好友可见"]');
    await act(async () => limited?.click());

    await waitFor(() => expect(merchantProfileApi.updateMine).toHaveBeenCalledWith({ visibility: "limited" }));
    await waitFor(() => expect(container.querySelector<HTMLButtonElement>('button[aria-label="开启店铺隐私模式"]')?.disabled).toBe(false));
    expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对好友以及关联人可见");
    expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).not.toContain("对好友可见");
  });

  it("turns a private profile public through the same profile endpoint", async () => {
    vi.mocked(merchantProfileApi.getMine).mockResolvedValue({ ...profile, visibility: "privateAll" });
    vi.mocked(merchantProfileApi.updateMine).mockResolvedValue({ ...profile, visibility: "public" });

    await act(async () => root.render(portal()));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对所有人不可见"));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="开启店铺隐私模式"]')?.click());

    await waitFor(() => expect(merchantProfileApi.updateMine).toHaveBeenCalledWith({ visibility: "public" }));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("公开可见"));
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="开启店铺隐私模式"]')?.getAttribute("aria-checked")).toBe("false");
  });
});
