// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishedCarouselPayload } from "../../api/contentPublication";
import { translateText, type Language } from "../../i18n/translations";
import { HomePage } from "./HomePage";
import homePageSource from "./HomePage.tsx?raw";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  getAffiliateCarousel: vi.fn(),
  getUserHomeCarousel: vi.fn()
}));

const homeMocks = vi.hoisted(() => ({
  language: "zh" as Language,
  config: {
    selectedLocationId: "tokyo",
    locations: [{ id: "tokyo", label: "东京", city: "东京", area: "港区" }],
    nearbyTechnician: { title: "附近的技师", limit: 4, sortBy: "reviewCount" as const },
    serviceModules: [],
    recommendation: {
      defaultTab: "stores" as const,
      maxItems: 10,
      tabs: {
        stores: { label: "店铺", sortBy: "rating" as const },
        technicians: { label: "技师", sortBy: "reviewCount" as const },
        services: { label: "服务", sortBy: "sales" as const }
      },
      moreLinks: {
        stores: { label: "查看更多", to: "/categories?type=store" },
        technicians: { label: "查看更多", to: "/categories?type=technician" },
        services: { label: "查看更多", to: "/categories?type=service" }
      }
    },
    platformMetricsVisible: false,
    platformMetrics: [],
    reminder: {
      enabled: false,
      triggerWindowMinutes: 60,
      dismissCooldownMinutes: 120,
      jumpTarget: "orderDetail" as const
    }
  }
}));

vi.mock("../../api/contentPublication", async () => {
  const actual = await vi.importActual<typeof import("../../api/contentPublication")>(
    "../../api/contentPublication"
  );
  return { ...actual, contentPublicationApi: apiMocks };
});

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ session: null }) }));
vi.mock("../../features/core-read/hooks", () => ({
  useCoreReadQuery: () => ({ data: null, error: null, loading: false })
}));
vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({ language: homeMocks.language }),
  useOptionalI18n: () => ({ language: homeMocks.language })
}));
vi.mock("../../state/homeLayoutStore", () => ({
  useHomeLayoutStore: () => ({ config: homeMocks.config })
}));
vi.mock("../../state/homeLocationStore", () => ({
  syncHomeDeviceLocationForAppOpen: () => Promise.resolve()
}));
vi.mock("../../state/needoPetSettings", () => ({
  useNeedoPetSettings: () => ({ enabled: false })
}));
vi.mock("../../state/userOrderStore", () => ({ useUserOrders: () => [] }));
vi.mock("../../theme/ClientThemeProvider", () => ({
  useClientTheme: () => ({ isNight: false, theme: "light-green" })
}));
vi.mock("../../components/mobile/MobileShell", () => ({
  MobileShell: ({ children }: { children: ReactNode }) => children
}));

describe("HomePage appointment reminder", () => {
  it("uses a centered blurred modal with the shared close button", () => {
    expect(homePageSource).toContain("CloseIconButton");
    expect(homePageSource).toContain('role="dialog"');
    expect(homePageSource).toContain('aria-modal="true"');
    expect(homePageSource).toContain("items-center justify-center");
    expect(homePageSource).toContain("backdrop-blur");
    expect(homePageSource).not.toContain("top-[calc(env(safe-area-inset-top)+152px)]");
  });
});

describe("HomePage technician recommendations", () => {
  it("uses technician showcase cards with 20 recommendation records", () => {
    expect(homePageSource).toContain("coreReadApi.getHomeRecommendations({ limit: 20 })");
    expect(homePageSource).toContain('recommendationTab === "technicians" ? 20');
    expect(homePageSource).toContain("TechnicianShowcaseCard");
    expect(homePageSource).toContain("getTechnicianDynamicPath(technician)");
  });

  it("disables legacy recommendations", () => {
    expect(homePageSource).toContain("homeRecommendationsQuery.data?.services.map(mapCoreServiceToServiceItem) ?? []");
    expect(homePageSource).toContain("homeRecommendationsQuery.data?.shops.map(mapCoreShopToStore) ?? []");
    expect(homePageSource).toContain("homeRecommendationsQuery.data?.technicians.map(mapCoreTechnicianToTechnician) ?? []");
    expect(homePageSource).not.toContain("legacyServices");
    expect(homePageSource).not.toContain("legacyStores");
    expect(homePageSource).not.toContain("legacyTechnicians");
  });

  it("recovers a transient formal read failure and exposes a manual reload action", () => {
    expect(homePageSource).toContain("loadCoreReadWithTransientRetry");
    expect(homePageSource).toContain("homeRecommendationsRevision");
    expect(homePageSource).toContain("[homeRecommendationsRevision]");
    expect(homePageSource).toContain("onRetry={() => setHomeRecommendationsRevision");
    expect(homePageSource).toContain("重新加载");
  });

  it.each([
    ["zh", "重新加载"],
    ["zh-Hant", "重新載入"],
    ["ja", "再読み込み"],
    ["en", "Reload"],
    ["ko", "다시 불러오기"]
  ] as Array<[Language, string]>)('translates the reload action for %s', (language, expected) => {
    expect(translateText("重新加载", language)).toBe(expected);
  });
});

describe("HomePage authenticated customer identity", () => {
  it("loads the formal customer profile instead of falling back to the first demo customer", () => {
    expect(homePageSource).toContain("getFormalCustomerProfileId(session)");
    expect(homePageSource).toContain("coreReadApi.getCustomerProfile(formalCustomerProfileId)");
    expect(homePageSource).toContain("mapCoreCustomerToCustomer(formalCustomerProfileQuery.data)");
    expect(homePageSource).not.toContain("isStaticDemoMode()");
    expect(homePageSource).toContain("const currentCustomer = formalCustomerProfileQuery.data");
    expect(homePageSource).toContain(": null;");
    expect(homePageSource).not.toContain("legacyCurrentCustomer");
  });
});

describe("HomePage quick action icon theme colors", () => {
  it("uses client theme tokens instead of a hard-coded green", () => {
    expect(homePageSource).toContain("function getQuickActionIconClassName");
    expect(homePageSource).toContain("Record<ClientTheme, string>");
    expect(homePageSource).toContain("text-[color:var(--client-accent-text)]");
    expect(homePageSource).toContain("getQuickActionIconClassName(theme)");
    expect(homePageSource).not.toContain("text-[#3c887e]");
  });
});

describe("HomePage shared theme layout", () => {
  it("uses the common floating header and recommendation cards", () => {
    expect(homePageSource).toContain("<FloatingHomeHeader");
    expect(homePageSource).toContain("floatingHeaderGlassPanelClassName");
    expect(homePageSource).toContain("<RecommendationCard");
  });
});

describe("HomePage formal user-home carousel contract", () => {
  it("renders the fixed formal scene between the reminder and quick actions", () => {
    const reminderIndex = homePageSource.indexOf("{activeReminder ? (");
    const carouselIndex = homePageSource.indexOf('<PublishedCarousel scene="user-home"');
    const quickActionsIndex = homePageSource.indexOf('{quickActionItems.map((item) => {');

    expect(reminderIndex).toBeGreaterThan(-1);
    expect(carouselIndex).toBeGreaterThan(reminderIndex);
    expect(quickActionsIndex).toBeGreaterThan(carouselIndex);
  });

  it("does not read browser-persisted user-home carousel state", () => {
    expect(homePageSource).not.toContain("useCarouselStore");
    expect(homePageSource).not.toContain('getResolvedCarouselSlides("home"');
    expect(homePageSource).not.toContain("resolveCarouselTargetPath");
    expect(homePageSource).not.toContain("carouselRevision");
    expect(homePageSource).not.toContain("carouselScenes.home");
  });
});

const publishedPayload = (title: string, locale: PublishedCarouselPayload["locale"]): PublishedCarouselPayload => ({
  scene: "USER_HOME",
  locale,
  releaseVersion: 7,
  generatedAt: "2026-08-29T01:00:00.000Z",
  slides: [
    {
      id: "slide-1",
      badge: "正式",
      title,
      caption: "正式 API 内容",
      ctaLabel: "查看服务",
      imageAltText: "正式轮播图",
      imageUrl: "/media/content/home.webp",
      target: { type: "service", publicId: "46969a0f-2c2c-4b7b-b986-88e406393255" }
    }
  ]
});

function LocationProbe() {
  const location = useLocation();
  return createElement("output", { "data-testid": "location" }, location.pathname);
}

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });
    }
  }
  throw lastError;
}

describe("HomePage formal carousel integration", () => {
  let container: HTMLDivElement;
  let root: Root;

  const renderHome = async () => {
    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          { initialEntries: ["/"] },
          createElement(HomePage),
          createElement(LocationProbe)
        )
      );
    });
  };

  beforeEach(() => {
    vi.resetAllMocks();
    homeMocks.language = "zh";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn()
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("isolates formal API failure between the reminder slot and quick actions", async () => {
    apiMocks.getUserHomeCarousel.mockRejectedValue(new Error("offline"));

    await renderHome();
    await waitFor(() => expect(container.querySelector('[data-testid="published-carousel-error"]')).not.toBeNull());

    const errorRegion = container.querySelector('[data-testid="published-carousel-error"]');
    const quickAction = Array.from(container.querySelectorAll("a")).find((link) =>
      link.textContent?.includes("店铺预约")
    );
    expect(errorRegion).not.toBeNull();
    expect(quickAction).not.toBeUndefined();
    if (!errorRegion || !quickAction) {
      throw new Error("expected the carousel error and quick action regions");
    }
    expect(errorRegion.compareDocumentPosition(quickAction) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.textContent).toContain("精选推荐");
    expect(container.textContent).not.toContain("页面发生运行错误");
  });

  it("reloads the formal scene when the content locale changes", async () => {
    apiMocks.getUserHomeCarousel
      .mockResolvedValueOnce(publishedPayload("中文公告", "zh-CN"))
      .mockResolvedValueOnce(publishedPayload("日本語のお知らせ", "ja"));

    await renderHome();
    await waitFor(() => expect(container.textContent).toContain("中文公告"));
    homeMocks.language = "ja";
    await renderHome();
    await waitFor(() => expect(container.textContent).toContain("日本語のお知らせ"));

    expect(apiMocks.getUserHomeCarousel).toHaveBeenNthCalledWith(1, "zh-CN");
    expect(apiMocks.getUserHomeCarousel).toHaveBeenNthCalledWith(2, "ja");
  });

  it("navigates through the formal target path", async () => {
    apiMocks.getUserHomeCarousel.mockResolvedValue(publishedPayload("正式服务", "zh-CN"));

    await renderHome();
    await waitFor(() => expect(container.textContent).toContain("正式服务"));

    const target = container.querySelector<HTMLAnchorElement>('a[href="/services/46969a0f-2c2c-4b7b-b986-88e406393255"]');
    expect(target).not.toBeNull();
    await act(async () => target?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe(
      "/services/46969a0f-2c2c-4b7b-b986-88e406393255"
    );
  });

  it("ignores legacy carousel storage revisions", async () => {
    apiMocks.getUserHomeCarousel.mockResolvedValue(publishedPayload("正式轮播", "zh-CN"));

    await renderHome();
    await waitFor(() => expect(container.textContent).toContain("正式轮播"));
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "needo.carousel-scenes.formal-state.v1",
        newValue: JSON.stringify({ scenes: { home: [] } }),
        storageArea: window.localStorage
      })
    );
    await act(async () => Promise.resolve());

    expect(apiMocks.getUserHomeCarousel).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("正式轮播");
  });
});
