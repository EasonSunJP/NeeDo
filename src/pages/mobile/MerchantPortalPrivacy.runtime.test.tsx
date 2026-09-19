// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backofficeRealDataApi } from "../../api/backofficeRealData";
import { merchantProfileApi } from "../../features/core-read/merchantProfileApi";
import { pricingModeApi, type ShopVisibilityResponse } from "../../features/pricing-mode/api";
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
    FeatureSegmentedTabs: ({ items, onChange }: { items: Array<{ label: React.ReactNode; value: string }>; onChange: (value: string) => void }) =>
      createElement("div", null, items.map((item) => createElement("button", { key: item.value, onClick: () => onChange(item.value), type: "button" }, item.label)))
  };
});

vi.mock("../../components/merchant/MerchantIdentityInfoCard", () => ({
  MerchantIdentityInfoCard: () => createElement("section", { "data-testid": "merchant-identity-card" })
}));

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

const visibilityState: ShopVisibilityResponse = {
  shopId: 71,
  visibility: "public",
  updatedAt: null,
  updatedBy: null
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

describe("MerchantPortal shop privacy authority", () => {
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
    vi.spyOn(pricingModeApi, "getShopVisibility").mockResolvedValue(visibilityState);
    vi.spyOn(pricingModeApi, "updateShopVisibility").mockResolvedValue(visibilityState);
    vi.spyOn(merchantProfileApi, "getMine").mockResolvedValue({
      identityId: 109, visibility: "public"
    } as Awaited<ReturnType<typeof merchantProfileApi.getMine>>);
    vi.spyOn(merchantProfileApi, "updateMine").mockResolvedValue({
      identityId: 109, visibility: "privateAll"
    } as Awaited<ReturnType<typeof merchantProfileApi.updateMine>>);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    expect(merchantProfileApi.updateMine).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("renders the selected shop visibility without reading merchant personal privacy", async () => {
    await act(async () => root.render(portal()));

    await waitFor(() => expect(pricingModeApi.getShopVisibility).toHaveBeenCalledTimes(1));

    const control = container.querySelector('[data-testid="merchant-store-privacy-control"]');
    const toggle = control?.querySelector<HTMLButtonElement>('button[aria-label="开启店铺隐私模式"]');
    expect(control?.textContent).toContain("公开可见");
    expect(toggle?.getAttribute("aria-checked")).toBe("false");
    expect(merchantProfileApi.getMine).not.toHaveBeenCalled();
  });

  it.each([
    ["privateAll", "对所有人不可见"],
    ["limited", "对好友可见"],
    ["network", "对好友以及关联人可见"]
  ] as const)("renders %s from the selected shop", async (visibility, label) => {
    vi.mocked(pricingModeApi.getShopVisibility).mockResolvedValue({ ...visibilityState, visibility });

    await act(async () => root.render(portal()));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain(label));

    const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="开启店铺隐私模式"]');
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
    expect(merchantProfileApi.getMine).not.toHaveBeenCalled();
  });

  it("keeps a failed shop load fail-closed and recovers through an explicit retry", async () => {
    vi.mocked(pricingModeApi.getShopVisibility)
      .mockReset()
      .mockRejectedValueOnce(new Error("error.identity.forbidden"))
      .mockResolvedValueOnce({ ...visibilityState, visibility: "limited" });

    await act(async () => root.render(portal()));
    await waitFor(() => {
      const control = container.querySelector('[data-testid="merchant-store-privacy-control"]');
      expect(control?.textContent).toContain("Couldn't load privacy mode");
      expect(control?.textContent).not.toContain("公开可见");
    });

    const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="开启店铺隐私模式"]');
    expect(toggle?.disabled).toBe(true);

    const retry = container.querySelector<HTMLButtonElement>('button[aria-label="Retry loading privacy mode"]');
    expect(retry).not.toBeNull();
    await act(async () => retry?.click());

    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对好友可见"));
    expect(pricingModeApi.getShopVisibility).toHaveBeenCalledTimes(2);
    expect(toggle?.disabled).toBe(false);
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
  });

  it("isolates slower shop loads across merchant identity and shop switches", async () => {
    let resolveFirst: ((value: ShopVisibilityResponse) => void) | undefined;
    const firstRequest = new Promise<ShopVisibilityResponse>((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(pricingModeApi.getShopVisibility)
      .mockReset()
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValueOnce({
        ...visibilityState,
        shopId: 72,
        visibility: "network"
      });

    await act(async () => root.render(portal()));
    await waitFor(() => expect(pricingModeApi.getShopVisibility).toHaveBeenCalledTimes(1));

    testState.session.activeIdentityId = 210;
    testState.session.linkedStoreId = "store-72";
    await act(async () => root.render(portal({ ...store, id: "store-72", systemId: "shop0000000072" })));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对好友以及关联人可见"));

    await act(async () => resolveFirst?.({ ...visibilityState, visibility: "privateAll" }));
    expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对好友以及关联人可见");
    expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).not.toContain("对所有人不可见");
  });

  it("reloads the shop visibility whenever the merchant returns to the service tab", async () => {
    vi.mocked(pricingModeApi.getShopVisibility)
      .mockReset()
      .mockResolvedValueOnce(visibilityState)
      .mockResolvedValueOnce({ ...visibilityState, visibility: "network" });

    await act(async () => root.render(portal()));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("公开可见"));

    const tab = (label: string) => [...container.querySelectorAll("button")].find((button) => button.textContent === label);
    await act(async () => tab("信息卡")?.click());
    expect(container.querySelector('[data-testid="merchant-identity-card"]')).not.toBeNull();
    await act(async () => tab("店铺展示")?.click());

    await waitFor(() => expect(pricingModeApi.getShopVisibility).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对好友以及关联人可见"));
  });

  it("ignores an older save failure after an A to B to A identity and shop switch", async () => {
    let rejectSave: ((reason?: unknown) => void) | undefined;
    const pendingSave = new Promise<ShopVisibilityResponse>((_resolve, reject) => {
      rejectSave = reject;
    });
    vi.mocked(pricingModeApi.getShopVisibility)
      .mockReset()
      .mockResolvedValueOnce(visibilityState)
      .mockResolvedValueOnce({ ...visibilityState, shopId: 72, visibility: "limited" })
      .mockResolvedValueOnce({ ...visibilityState, visibility: "network" });
    vi.mocked(pricingModeApi.updateShopVisibility).mockReturnValue(pendingSave);

    await act(async () => root.render(portal()));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("公开可见"));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="开启店铺隐私模式"]')?.click());
    const confirm = [...container.querySelectorAll("button")].find((button) => button.textContent === "开启");
    await act(async () => confirm?.click());
    await waitFor(() => expect(pricingModeApi.updateShopVisibility).toHaveBeenCalledWith(71, "privateAll"));

    testState.session.activeIdentityId = 210;
    testState.session.linkedStoreId = "store-72";
    await act(async () => root.render(portal({ ...store, id: "store-72", systemId: "shop0000000072" })));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对好友可见"));

    testState.session.activeIdentityId = 109;
    testState.session.linkedStoreId = "store-71";
    await act(async () => root.render(portal()));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对好友以及关联人可见"));

    await act(async () => rejectSave?.(new Error("late failure")));
    expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对好友以及关联人可见");
    expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).not.toContain("公开可见");
  });

  it("reconciles a late successful save after an A to B to A identity and shop switch", async () => {
    let resolveSave: ((value: ShopVisibilityResponse) => void) | undefined;
    const pendingSave = new Promise<ShopVisibilityResponse>((resolve) => {
      resolveSave = resolve;
    });
    vi.mocked(pricingModeApi.getShopVisibility)
      .mockReset()
      .mockResolvedValueOnce(visibilityState)
      .mockResolvedValueOnce({ ...visibilityState, shopId: 72, visibility: "limited" })
      .mockResolvedValueOnce({ ...visibilityState, visibility: "network" })
      .mockResolvedValueOnce({ ...visibilityState, visibility: "privateAll" });
    vi.mocked(pricingModeApi.updateShopVisibility).mockReturnValue(pendingSave);

    await act(async () => root.render(portal()));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("公开可见"));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="开启店铺隐私模式"]')?.click());
    const confirm = [...container.querySelectorAll("button")].find((button) => button.textContent === "开启");
    await act(async () => confirm?.click());
    await waitFor(() => expect(pricingModeApi.updateShopVisibility).toHaveBeenCalledWith(71, "privateAll"));

    testState.session.activeIdentityId = 210;
    testState.session.linkedStoreId = "store-72";
    await act(async () => root.render(portal({ ...store, id: "store-72", systemId: "shop0000000072" })));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对好友可见"));

    testState.session.activeIdentityId = 109;
    testState.session.linkedStoreId = "store-71";
    await act(async () => root.render(portal()));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对好友以及关联人可见"));
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="开启店铺隐私模式"]')?.disabled).toBe(true);

    await act(async () => resolveSave?.({ ...visibilityState, visibility: "privateAll" }));
    await waitFor(() => expect(pricingModeApi.getShopVisibility).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对所有人不可见"));
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="开启店铺隐私模式"]')?.disabled).toBe(false);
  });

  it("isolates a pending shop save from another shop under the same merchant identity", async () => {
    let resolveSave: ((value: ShopVisibilityResponse) => void) | undefined;
    const pendingSave = new Promise<ShopVisibilityResponse>((resolve) => {
      resolveSave = resolve;
    });
    vi.mocked(pricingModeApi.getShopVisibility)
      .mockReset()
      .mockResolvedValueOnce(visibilityState)
      .mockResolvedValueOnce({ ...visibilityState, shopId: 72, visibility: "network" })
      .mockResolvedValueOnce({ ...visibilityState, visibility: "privateAll" });
    vi.mocked(pricingModeApi.updateShopVisibility).mockReturnValue(pendingSave);

    await act(async () => root.render(portal()));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("公开可见"));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="开启店铺隐私模式"]')?.click());
    const confirm = [...container.querySelectorAll("button")].find((button) => button.textContent === "开启");
    await act(async () => confirm?.click());
    await waitFor(() => expect(pricingModeApi.updateShopVisibility).toHaveBeenCalledWith(71, "privateAll"));

    testState.session.linkedStoreId = "store-72";
    await act(async () => root.render(portal({ ...store, id: "store-72", systemId: "shop0000000072" })));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对好友以及关联人可见"));
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="开启店铺隐私模式"]')?.disabled).toBe(false);

    await act(async () => resolveSave?.({ ...visibilityState, visibility: "privateAll" }));
    await waitFor(() => expect(pricingModeApi.getShopVisibility).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对好友以及关联人可见"));
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="开启店铺隐私模式"]')?.disabled).toBe(false);
  });

  it("persists a visibility change through the shop endpoint and reloads it after remount", async () => {
    vi.mocked(pricingModeApi.getShopVisibility).mockResolvedValue({ ...visibilityState, visibility: "privateAll" });
    vi.mocked(pricingModeApi.updateShopVisibility).mockResolvedValue({ ...visibilityState, visibility: "limited" });

    await act(async () => root.render(portal()));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对所有人不可见"));

    const summary = container.querySelector<HTMLButtonElement>('[data-testid="merchant-store-privacy-control"] > div button');
    await act(async () => summary?.click());
    const limited = container.querySelector<HTMLButtonElement>('button[aria-label="选择对好友可见"]');
    await act(async () => limited?.click());

    await waitFor(() => expect(pricingModeApi.updateShopVisibility).toHaveBeenCalledWith(71, "limited"));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对好友可见"));

    await act(async () => root.unmount());
    root = createRoot(container);
    vi.mocked(pricingModeApi.getShopVisibility).mockResolvedValue({ ...visibilityState, visibility: "limited" });
    await act(async () => root.render(portal()));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对好友可见"));
  });

  it("keeps the last server-confirmed visibility when a shop update fails", async () => {
    vi.mocked(pricingModeApi.getShopVisibility).mockResolvedValue({ ...visibilityState, visibility: "network" });
    vi.mocked(pricingModeApi.updateShopVisibility).mockRejectedValue(new Error("network"));

    await act(async () => root.render(portal()));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对好友以及关联人可见"));

    const summary = container.querySelector<HTMLButtonElement>('[data-testid="merchant-store-privacy-control"] > div button');
    await act(async () => summary?.click());
    const limited = container.querySelector<HTMLButtonElement>('button[aria-label="选择对好友可见"]');
    await act(async () => limited?.click());

    await waitFor(() => expect(pricingModeApi.updateShopVisibility).toHaveBeenCalledWith(71, "limited"));
    await waitFor(() => expect(container.querySelector<HTMLButtonElement>('button[aria-label="开启店铺隐私模式"]')?.disabled).toBe(false));
    expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对好友以及关联人可见");
    expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).not.toContain("对好友可见");
  });

  it("turns a private shop public through the same shop endpoint", async () => {
    vi.mocked(pricingModeApi.getShopVisibility).mockResolvedValue({ ...visibilityState, visibility: "privateAll" });
    vi.mocked(pricingModeApi.updateShopVisibility).mockResolvedValue({ ...visibilityState, visibility: "public" });

    await act(async () => root.render(portal()));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("对所有人不可见"));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="开启店铺隐私模式"]')?.click());

    await waitFor(() => expect(pricingModeApi.updateShopVisibility).toHaveBeenCalledWith(71, "public"));
    await waitFor(() => expect(container.querySelector('[data-testid="merchant-store-privacy-control"]')?.textContent).toContain("公开可见"));
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="开启店铺隐私模式"]')?.getAttribute("aria-checked")).toBe("false");
  });
});
