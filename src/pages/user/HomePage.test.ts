// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishedCarouselPayload } from "../../api/contentPublication";
import type { BookingOrder } from "../../features/booking/api";
import type {
  CoreHomeRecommendations,
  CoreServiceCard,
} from "../../features/core-read/api";
import { translateText, type Language } from "../../i18n/translations";
import { persistentResourceCache } from "../../lib/persistentResourceCache";
import type {
  HomeLayoutConfig,
  HomeServiceModuleConfig,
} from "../../state/homeLayoutStore";
import { HomePage } from "./HomePage";
import * as homePageModule from "./HomePage";
import homePageSource from "./HomePage.tsx?raw";

const stylesSource = readFileSync("src/styles.css", "utf8");

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  getAffiliateCarousel: vi.fn(),
  listOrders: vi.fn(),
  getUserHomeCarousel: vi.fn(),
}));

const homeMocks = vi.hoisted(() => ({
  language: "zh" as Language,
  petEnabled: false,
  recommendations: null as CoreHomeRecommendations | null,
  config: {
    selectedLocationId: "tokyo",
    locations: [{ id: "tokyo", label: "东京", city: "东京", area: "港区" }],
    nearbyTechnician: {
      title: "附近的技师",
      limit: 4,
      sortBy: "reviewCount" as const,
    },
    serviceModules: [],
    recommendation: {
      defaultTab: "stores" as const,
      maxItems: 10,
      tabs: {
        stores: { label: "店铺", sortBy: "rating" as const },
        technicians: { label: "技师", sortBy: "reviewCount" as const },
        services: { label: "服务", sortBy: "sales" as const },
      },
      moreLinks: {
        stores: { label: "查看更多", to: "/categories?type=store" },
        technicians: { label: "查看更多", to: "/categories?type=technician" },
        services: { label: "查看更多", to: "/categories?type=service" },
      },
    },
    platformMetricsVisible: false,
    platformMetrics: [],
    reminder: {
      enabled: false,
      triggerWindowMinutes: 60,
      dismissCooldownMinutes: 120,
      jumpTarget: "orderDetail" as const,
    },
  },
}));

vi.mock("../../api/contentPublication", async () => {
  const actual = await vi.importActual<
    typeof import("../../api/contentPublication")
  >("../../api/contentPublication");
  return { ...actual, contentPublicationApi: apiMocks };
});

vi.mock("../../features/booking/api", async () => {
  const actual = await vi.importActual<
    typeof import("../../features/booking/api")
  >("../../features/booking/api");

  return {
    ...actual,
    bookingApi: {
      ...actual.bookingApi,
      listOrders: apiMocks.listOrders,
    },
  };
});

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    session: { avatarUrl: "/images/generated/profiles/ai-profile-30.jpg" },
  }),
}));
vi.mock("../../features/core-read/hooks", () => ({
  useCoreReadQuery: () => ({
    data: homeMocks.recommendations,
    error: null,
    loading: false,
  }),
}));
vi.mock("../../features/core-read/useCustomerSelfProfile", () => ({
  useCustomerSelfProfile: () => ({
    customer: null,
    error: null,
    loading: false,
    profile: null,
    reload: vi.fn(),
  }),
}));
vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({ language: homeMocks.language }),
  useOptionalI18n: () => ({ language: homeMocks.language }),
}));
vi.mock("../../state/homeLayoutStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../state/homeLayoutStore")>()),
  useHomeLayoutStore: () => ({ config: homeMocks.config }),
}));
vi.mock("../../state/homeLocationStore", () => ({
  syncHomeDeviceLocationForAppOpen: () => Promise.resolve(),
}));
vi.mock("../../state/needoPetSettings", () => ({
  useNeedoPetSettings: () => ({ enabled: homeMocks.petEnabled }),
}));
vi.mock("../../state/userOrderStore", () => ({ useUserOrders: () => [] }));
vi.mock("../../theme/ClientThemeProvider", () => ({
  useClientTheme: () => ({ isNight: false, theme: "light-green" }),
}));
vi.mock("../../components/mobile/MobileShell", () => ({
  MobileShell: ({ children }: { children: ReactNode }) => children,
}));

describe("HomePage appointment reminder", () => {
  it("uses a centered blurred modal with the shared close button", () => {
    expect(homePageSource).toContain("CloseIconButton");
    expect(homePageSource).toContain('role="dialog"');
    expect(homePageSource).toContain('aria-modal="true"');
    expect(homePageSource).toContain("items-center justify-center");
    expect(homePageSource).toContain("backdrop-blur");
    expect(homePageSource).not.toContain(
      "top-[calc(env(safe-area-inset-top)+152px)]",
    );
  });
});

describe("HomePage technician recommendations", () => {
  it("uses technician showcase cards with 20 recommendation records", () => {
    expect(homePageSource).toContain(
      "latitude: selectedLocation.coordinates.lat",
    );
    expect(homePageSource).toContain(
      "longitude: selectedLocation.coordinates.lng",
    );
    expect(homePageSource).toContain(
      'recommendationTab === "technicians" ? 20',
    );
    expect(homePageSource).toContain("TechnicianShowcaseCard");
    expect(homePageSource).toContain("getTechnicianDynamicPath(technician)");
  });

  it("disables legacy recommendations", () => {
    expect(homePageSource).toMatch(
      /homeRecommendationsQuery\.data\?\.services\.map\([\s\S]*?mapCoreServiceToServiceItem[\s\S]*?\) \?\? \[\]/u,
    );
    expect(homePageSource).toMatch(
      /homeRecommendationsQuery\.data\?\.shops\.map\(mapCoreShopToStore\)\s*\?\? \[\]/u,
    );
    expect(homePageSource).toMatch(
      /homeRecommendationsQuery\.data\?\.technicians\.map\([\s\S]*?mapCoreTechnicianToTechnician[\s\S]*?\) \?\? \[\]/u,
    );
    expect(homePageSource).not.toContain("legacyServices");
    expect(homePageSource).not.toContain("legacyStores");
    expect(homePageSource).not.toContain("legacyTechnicians");
  });

  it("recovers a transient formal read failure and exposes a manual reload action", () => {
    expect(homePageSource).toContain("loadCoreReadWithTransientRetry");
    expect(homePageSource).toContain("homeRecommendationsRevision");
    expect(homePageSource).toContain("homeRecommendationsRevision,");
    expect(homePageSource).toContain("selectedLocation?.coordinates?.lat");
    expect(homePageSource).toMatch(
      /onRetry=\{\(\) =>\s*setHomeRecommendationsRevision/u,
    );
    expect(homePageSource).toContain("重新加载");
  });

  it.each([
    ["zh", "重新加载"],
    ["zh-Hant", "重新載入"],
    ["ja", "再読み込み"],
    ["en", "Reload"],
    ["ko", "다시 불러오기"],
  ] as Array<[Language, string]>)(
    "translates the reload action for %s",
    (language, expected) => {
      expect(translateText("重新加载", language)).toBe(expected);
    },
  );
});

describe("HomePage authenticated customer identity", () => {
  it("loads the formal customer profile instead of falling back to the first demo customer", () => {
    expect(homePageSource).toContain("useCustomerSelfProfile()");
    expect(homePageSource).not.toContain("isStaticDemoMode()");
    expect(homePageSource).toContain(
      "const { customer: currentCustomer } = useCustomerSelfProfile()",
    );
    expect(homePageSource).not.toContain("legacyCurrentCustomer");
  });

  it("keeps the authoritative account avatar while the customer profile loads", () => {
    expect(homePageSource).toContain(
      'avatarSrc={session?.avatarUrl ?? currentCustomer?.avatar ?? ""}',
    );
  });

  it("shows the persisted experience level below the home avatar instead of deriving it from review score", () => {
    expect(homePageSource).toContain("currentCustomer.experienceLevel");
    expect(homePageSource).toContain("`Lv.${currentCustomer.experienceLevel}`");
    expect(homePageSource).not.toContain(
      "getCustomerLevelLabel(currentCustomer.activeScore)",
    );
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

describe("HomePage quick action responsive pagination", () => {
  it("groups entries into complete four-column pages", () => {
    expect(homePageModule).toHaveProperty("paginateQuickActions");
    const paginateQuickActions = (
      homePageModule as typeof homePageModule & {
        paginateQuickActions: <T>(items: T[]) => T[][];
      }
    ).paginateQuickActions;

    expect(paginateQuickActions([1, 2, 3, 4])).toEqual([[1, 2, 3, 4]]);
    expect(paginateQuickActions([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9],
    ]);
  });

  it("renders one snap page per group without square card sizing", () => {
    expect(homePageSource).toContain("home-quick-actions__viewport");
    expect(homePageSource).toContain("home-quick-actions__page");
    expect(homePageSource).toContain("home-quick-action-card");
    expect(homePageSource).not.toContain("aspect-square");
    expect(stylesSource).toMatch(
      /\.home-quick-actions__page\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/u,
    );
    expect(stylesSource).toMatch(
      /\.home-quick-action-card\s*\{[\s\S]*?height:\s*clamp\(/u,
    );
    expect(stylesSource).toContain("height: clamp(86px, 22cqw, 104px);");
    expect(stylesSource).toMatch(
      /@container \(max-width: 340px\)\s*\{[\s\S]*?\.home-quick-action-card\s*\{[\s\S]*?height:\s*76px;/u,
    );
  });

  it("centers each icon and label as one stable column inside its card", () => {
    const rendererStart = homePageSource.indexOf(
      "{quickActionPages.map((page, pageIndex) => (",
    );
    const rendererEnd = homePageSource.indexOf("</section>", rendererStart);
    const quickActionRenderer = homePageSource.slice(
      rendererStart,
      rendererEnd,
    );

    expect(rendererStart).toBeGreaterThan(-1);
    expect(rendererEnd).toBeGreaterThan(rendererStart);
    expect(quickActionRenderer).toContain(
      "home-quick-action-card flex min-w-0 flex-col items-center justify-center",
    );
    expect(quickActionRenderer).toContain("before:hidden");
    expect(quickActionRenderer).not.toContain("grid-rows-[34px_28px]");
    expect(quickActionRenderer).toContain(
      "home-quick-action-card__icon inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center",
    );
    expect(quickActionRenderer).toContain(
      "home-quick-action-card__label flex h-[28px] w-full shrink-0 items-center justify-center",
    );
    expect(quickActionRenderer).toContain(
      "home-quick-action-card__title w-full text-center",
    );
  });
});

describe("HomePage shared theme layout", () => {
  it("uses the common floating header and recommendation cards", () => {
    expect(homePageSource).toContain("<FloatingHomeHeader");
    expect(homePageSource).toContain("floatingHeaderGlassPanelClassName");
    expect(homePageSource).toContain("<RecommendationCard");
  });

  it("delegates service recommendations while keeping only image navigation tiles exempt", () => {
    expect(homePageSource).toMatch(
      /<SocialProfileMiniCard[\s\S]*data=\{buildServiceMiniCardData\(data\.service\)\}/u,
    );
    expect(homePageSource).toContain("function ServiceModule(");
    expect(homePageSource).toContain("图像化入口，点击进入对应服务列表");
    expect(homePageSource).not.toContain("ServicePreviewCard");
    expect(homePageSource).not.toContain("resolveServiceProvider");
  });
});

describe("HomePage formal user-home carousel contract", () => {
  it("renders the fixed formal scene between the reminder and quick actions", () => {
    const reminderIndex = homePageSource.indexOf("{activeReminder ? (");
    const carouselIndex = homePageSource.indexOf(
      '<PublishedCarousel scene="user-home"',
    );
    const quickActionsIndex = homePageSource.indexOf(
      "{quickActionPages.map((page, pageIndex) => (",
    );

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

const publishedPayload = (
  title: string,
  locale: PublishedCarouselPayload["locale"],
): PublishedCarouselPayload => ({
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
      target: {
        type: "service",
        publicId: "46969a0f-2c2c-4b7b-b986-88e406393255",
      },
    },
  ],
});

function LocationProbe() {
  const location = useLocation();
  return createElement(
    "output",
    { "data-testid": "location" },
    location.pathname,
  );
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

const serviceReviewSummary = {
  ratingAverage: "4.80",
  reviewCount: 10,
  latestReviewAt: "2026-09-13T00:00:00.000Z",
  highlights: [],
};

function formalService(input: {
  id: number;
  name: string;
  categoryCode: string;
  city?: string;
  serviceMode?: string;
}): CoreServiceCard & { serviceMode: string } {
  const city = input.city ?? "横滨";
  const categoryId = input.categoryCode === "massage" ? 3 : input.categoryCode === "cleaning" ? 4 : 5;

  return {
    id: input.id,
    publicId: `00000000-0000-4000-8000-${String(input.id).padStart(12, "0")}`,
    name: input.name,
    description: `${input.name} 正式服务`,
    category: {
      id: categoryId,
      code: input.categoryCode,
      name: input.categoryCode,
      nameJa: input.categoryCode,
      nameEn: input.categoryCode,
      parentId: null,
      iconUrl: null,
      sortOrder: categoryId,
      isActive: true,
      createdAt: "2026-09-13T00:00:00.000Z",
      updatedAt: "2026-09-13T00:00:00.000Z",
    },
    shop: {
      id: input.id,
      publicId: `shop${String(input.id).padStart(10, "0")}`,
      name: `${input.name} 店铺`,
      city,
      address: `${city} 正式地址`,
      coverUrl: null,
      reviewSummary: serviceReviewSummary,
      completedOrderCount: 10,
      favoriteCount: 0,
      shareCount: 0,
      serviceCategories: [],
      businessKeywords: [],
    },
    technician: null,
    city,
    priceAmount: "8800.00",
    currency: "JPY",
    durationMinutes: 60,
    usageCount: input.id,
    favoriteCount: 0,
    shareCount: 0,
    isBookable: true,
    coverUrl: null,
    reviewSummary: serviceReviewSummary,
    serviceMode: input.serviceMode ?? "home_visit",
  };
}

describe("HomePage formal service modules", () => {
  let container: HTMLDivElement;
  let root: Root;

  const renderModules = async (
    serviceModules: HomeServiceModuleConfig[],
    services: Array<CoreServiceCard & { serviceMode: string }>,
  ) => {
    (homeMocks.config as HomeLayoutConfig).serviceModules = serviceModules;
    homeMocks.recommendations = {
      categories: [],
      services,
      shops: [],
      technicians: [],
    };

    await act(async () => {
      root.render(
        createElement(MemoryRouter, null, createElement(HomePage)),
      );
    });
  };

  const moduleConfig = (
    overrides: Partial<HomeServiceModuleConfig> = {},
  ): HomeServiceModuleConfig => ({
    id: "home-module-cleaning",
    title: "家事代行",
    categoryIds: ["cleaning", "deep", "appliance"],
    targetTo: "/categories?type=service&category=cleaning&mode=home",
    maxItems: 4,
    enabled: true,
    ...overrides,
  });

  beforeEach(() => {
    vi.resetAllMocks();
    apiMocks.listOrders.mockResolvedValue({
      list: [],
      page: 1,
      page_size: 100,
      total: 0,
    });
    apiMocks.getUserHomeCarousel.mockResolvedValue(
      publishedPayload("正式轮播", "zh-CN"),
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    homeMocks.recommendations = null;
    (homeMocks.config as HomeLayoutConfig).serviceModules = [];
  });

  it("hides a zero-result module instead of filling it with unrelated recommendations", async () => {
    await renderModules(
      [moduleConfig()],
      [
        formalService({ id: 1, name: "ボディケア A", categoryCode: "massage" }),
        formalService({ id: 2, name: "ボディケア B", categoryCode: "massage" }),
        formalService({ id: 3, name: "ボディケア C", categoryCode: "massage" }),
        formalService({ id: 4, name: "ボディケア D", categoryCode: "massage" }),
      ],
    );

    expect(container.textContent).not.toContain("家事代行");
    expect(container.querySelector('img[alt^="ボディケア"]')).toBeNull();
  });

  it("renders exactly one category-and-mode match", async () => {
    await renderModules(
      [moduleConfig()],
      [
        formalService({ id: 10, name: "訪問クリーニング", categoryCode: "cleaning" }),
        formalService({ id: 11, name: "店内クリーニング", categoryCode: "cleaning", serviceMode: "store" }),
      ],
    );

    expect(container.querySelectorAll('img[alt="訪問クリーニング"]')).toHaveLength(1);
    expect(container.querySelector('img[alt="店内クリーニング"]')).toBeNull();
  });

  it.each([4, 5])("renders at most four matching services when %i are available", async (count) => {
    const services = Array.from({ length: count }, (_, index) =>
      formalService({
        id: 20 + index,
        name: `清掃 ${index + 1}`,
        categoryCode: "cleaning",
      }),
    );

    await renderModules([moduleConfig()], services);

    expect(container.querySelectorAll('img[alt^="清掃 "]')).toHaveLength(4);
  });

  it("keeps massage and cleaning modules isolated by category and home-visit mode", async () => {
    await renderModules(
      [
        moduleConfig({
          id: "home-module-massage",
          title: "出張マッサージ",
          categoryIds: ["massage"],
          targetTo: "/categories?type=service&category=massage&tag=tag-massage-door&mode=home",
        }),
        moduleConfig(),
      ],
      [
        formalService({ id: 31, name: "出張ボディケア", categoryCode: "massage" }),
        formalService({ id: 32, name: "店内ボディケア", categoryCode: "massage", serviceMode: "store" }),
        formalService({ id: 33, name: "家事サポート", categoryCode: "cleaning" }),
      ],
    );

    const massageSection = container.querySelector('section[data-service-module-id="home-module-massage"]');
    const cleaningSection = container.querySelector('section[data-service-module-id="home-module-cleaning"]');
    expect(massageSection?.querySelectorAll("img")).toHaveLength(1);
    expect(massageSection?.textContent).toContain("出張ボディケア");
    expect(cleaningSection?.querySelectorAll("img")).toHaveLength(1);
    expect(cleaningSection?.textContent).toContain("家事サポート");
  });

  it("honors a custom module target category and service mode", async () => {
    const targetTo = "/categories?type=service&category=beauty&mode=store";
    await renderModules(
      [
        moduleConfig({
          id: "custom-beauty",
          title: "ビューティー",
          categoryIds: ["beauty", "massage"],
          targetTo,
        }),
      ],
      [
        formalService({ id: 41, name: "店内ネイル", categoryCode: "beauty", serviceMode: "store" }),
        formalService({ id: 42, name: "訪問ネイル", categoryCode: "beauty" }),
        formalService({ id: 43, name: "店内マッサージ", categoryCode: "massage", serviceMode: "store" }),
      ],
    );

    const customSection = container.querySelector('section[data-service-module-id="custom-beauty"]');
    expect(customSection?.querySelectorAll("img")).toHaveLength(1);
    expect(customSection?.textContent).toContain("店内ネイル");
    expect(
      Array.from(customSection?.querySelectorAll("a") ?? []).filter(
        (link) => link.getAttribute("href") === targetTo,
      ),
    ).toHaveLength(2);
  });

  it("uses the module fulfillment mode when a legacy target omits it", async () => {
    const legacyTarget = "/categories?type=service&category=cleaning";
    await renderModules(
      [
        moduleConfig({
          targetTo: legacyTarget,
          serviceMode: "home",
        }),
      ],
      [
        formalService({ id: 44, name: "訪問家事", categoryCode: "cleaning" }),
        formalService({ id: 45, name: "店内家事", categoryCode: "cleaning", serviceMode: "store" }),
      ],
    );

    const section = container.querySelector('section[data-service-module-id="home-module-cleaning"]');
    expect(section?.textContent).toContain("訪問家事");
    expect(section?.textContent).not.toContain("店内家事");
    expect(
      Array.from(section?.querySelectorAll("a") ?? []).filter(
        (link) => link.getAttribute("href")?.includes("mode=home"),
      ),
    ).toHaveLength(2);
  });

  it("sorts scoped matches by the selected area before applying the limit", async () => {
    await renderModules(
      [moduleConfig({ maxItems: 1 })],
      [
        formalService({ id: 51, name: "横滨家事", categoryCode: "cleaning", city: "横滨" }),
        formalService({ id: 52, name: "东京家事", categoryCode: "cleaning", city: "东京" }),
      ],
    );

    expect(container.querySelector('img[alt="东京家事"]')).not.toBeNull();
    expect(container.querySelector('img[alt="横滨家事"]')).toBeNull();
  });
});

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
          createElement(LocationProbe),
        ),
      );
    });
  };

  beforeEach(async () => {
    await persistentResourceCache.clearScope("public");
    vi.resetAllMocks();
    apiMocks.listOrders.mockResolvedValue({
      list: [],
      page: 1,
      page_size: 100,
      total: 0,
    });
    homeMocks.language = "zh";
    homeMocks.petEnabled = false;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("isolates formal API failure between the reminder slot and quick actions", async () => {
    apiMocks.getUserHomeCarousel.mockRejectedValue(new Error("offline"));

    await renderHome();
    await waitFor(() =>
      expect(
        container.querySelector('[data-testid="published-carousel-error"]'),
      ).not.toBeNull(),
    );

    const errorRegion = container.querySelector(
      '[data-testid="published-carousel-error"]',
    );
    const quickAction = Array.from(container.querySelectorAll("a")).find(
      (link) => link.textContent?.includes("店铺预约"),
    );
    expect(errorRegion).not.toBeNull();
    expect(quickAction).not.toBeUndefined();
    if (!errorRegion || !quickAction) {
      throw new Error("expected the carousel error and quick action regions");
    }
    expect(
      errorRegion.compareDocumentPosition(quickAction) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.textContent).toContain("精选推荐");
    expect(container.textContent).not.toContain("页面发生运行错误");
  });

  it("loads the formal current booking and restores the appointment overview button", async () => {
    const currentBooking = {
      id: 88,
      orderNo: "ND202609030001",
      orderType: "booking",
      status: "pending",
      paymentMethod: "onsite",
      paymentStatus: "pending",
      paymentAmountJpy: 8800,
      paymentConfirmedById: null,
      paymentConfirmedAt: null,
      paymentReference: null,
      paymentNote: null,
      paymentRefundedById: null,
      paymentRefundedAt: null,
      paymentRefundReference: null,
      paymentRefundReason: null,
      customerUserId: 5,
      serviceId: 12,
      technicianServiceId: null,
      shopId: 217,
      technicianProfileId: 186,
      scheduleSlotId: 80839,
      fulfillmentMode: "store",
      serviceName: "麻布十番ボディケア 60分",
      shopName: "麻布十番超级按摩",
      technicianName: "LifeDance 管理员 2",
      priceAmount: "8800.00",
      currency: "JPY",
      startsAt: "2026-09-04T01:00:00.000Z",
      endsAt: "2026-09-04T02:00:00.000Z",
      note: null,
      cancelReason: null,
      createdAt: "2026-09-03T00:00:00.000Z",
      updatedAt: "2026-09-03T00:00:00.000Z",
      statusHistory: [],
    } satisfies BookingOrder;
    apiMocks.getUserHomeCarousel.mockResolvedValue(
      publishedPayload("正式轮播", "zh-CN"),
    );
    apiMocks.listOrders.mockResolvedValue({
      list: [currentBooking],
      page: 1,
      page_size: 100,
      total: 1,
    });
    homeMocks.petEnabled = true;

    await renderHome();
    await waitFor(() =>
      expect(apiMocks.listOrders).toHaveBeenCalledWith({
        page: 1,
        pageSize: 100,
      }),
    );

    const appointmentOverview = container.querySelector<HTMLAnchorElement>(
      'a[aria-label="查看预约记录"][href="/orders"]',
    );
    expect(appointmentOverview).not.toBeNull();
    expect(appointmentOverview?.textContent).toContain("10:00");
  });

  it("keeps the appointment overview button available when there is no active booking", async () => {
    apiMocks.getUserHomeCarousel.mockResolvedValue(
      publishedPayload("正式轮播", "zh-CN"),
    );

    await renderHome();
    await waitFor(() =>
      expect(apiMocks.listOrders).toHaveBeenCalledWith({
        page: 1,
        pageSize: 100,
      }),
    );

    const appointmentOverview = container.querySelector<HTMLAnchorElement>(
      'a[aria-label="查看预约记录"][href="/orders"]',
    );
    expect(appointmentOverview).not.toBeNull();
    expect(appointmentOverview?.textContent).toContain("预约一览");
  });

  it("reloads the formal scene when the content locale changes", async () => {
    apiMocks.getUserHomeCarousel
      .mockResolvedValueOnce(publishedPayload("中文公告", "zh-CN"))
      .mockResolvedValueOnce(publishedPayload("日本語のお知らせ", "ja"));

    await renderHome();
    await waitFor(() => expect(container.textContent).toContain("中文公告"));
    homeMocks.language = "ja";
    await renderHome();
    await waitFor(() =>
      expect(container.textContent).toContain("日本語のお知らせ"),
    );

    expect(apiMocks.getUserHomeCarousel).toHaveBeenNthCalledWith(1, "zh-CN");
    expect(apiMocks.getUserHomeCarousel).toHaveBeenNthCalledWith(2, "ja");
  });

  it("navigates through the formal target path", async () => {
    apiMocks.getUserHomeCarousel.mockResolvedValue(
      publishedPayload("正式服务", "zh-CN"),
    );

    await renderHome();
    await waitFor(() => expect(container.textContent).toContain("正式服务"));

    const target = container.querySelector<HTMLAnchorElement>(
      'a[href="/services/46969a0f-2c2c-4b7b-b986-88e406393255"]',
    );
    expect(target).not.toBeNull();
    await act(async () =>
      target?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      ),
    );
    expect(
      container.querySelector('[data-testid="location"]')?.textContent,
    ).toBe("/services/46969a0f-2c2c-4b7b-b986-88e406393255");
  });

  it("ignores legacy carousel storage revisions", async () => {
    apiMocks.getUserHomeCarousel.mockResolvedValue(
      publishedPayload("正式轮播", "zh-CN"),
    );

    await renderHome();
    await waitFor(() => expect(container.textContent).toContain("正式轮播"));
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "needo.carousel-scenes.formal-state.v1",
        newValue: JSON.stringify({ scenes: { home: [] } }),
        storageArea: window.localStorage,
      }),
    );
    await act(async () => Promise.resolve());

    expect(apiMocks.getUserHomeCarousel).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("正式轮播");
  });
});
