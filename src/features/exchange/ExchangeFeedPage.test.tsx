// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { likeExchangePost, recordExchangeShare } from "./api";
import { shareContent } from "../../lib/share";
import type { ExchangeInteractionCounts, ExchangePost, ExchangeViewerState } from "./types";
import { useExchangeFeed } from "./useExchangeFeed";
import { ExchangeFeedPage, getDefaultExchangePostType } from "./ExchangeFeedPage";

vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));
vi.mock("../../theme/ClientThemeProvider", () => ({ useClientTheme: () => ({ theme: "dark-green" }) }));
vi.mock("./useExchangeFeed", () => ({ useExchangeFeed: vi.fn() }));
vi.mock("./api", () => ({ likeExchangePost: vi.fn(), recordExchangeShare: vi.fn(), unlikeExchangePost: vi.fn() }));
vi.mock("../../lib/share", () => ({ shareContent: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const demandPost: ExchangePost = {
  id: 41,
  type: "demand",
  status: "published",
  title: "東京駅附近寻找中文口译",
  detail: "这段正文由测试账号用简体中文发布，不应自动翻译。",
  contentLocale: "zh-CN",
  areaLabel: "東京都千代田区",
  serviceStartAt: "2026-08-31T04:00:00.000Z",
  serviceEndAt: "2026-08-31T06:00:00.000Z",
  expiresAt: "2026-08-31T06:00:00.000Z",
  publishedAt: "2026-08-30T04:00:00.000Z",
  publisher: { publicId: "u0000000041", identityType: "customer", displayName: "测试客户 41", avatarUrl: null },
  counts: { comments: 4, likes: 21, shares: 6 },
  viewer: { liked: false, canWithdraw: true, canClaim: false, canViewClaims: false },
  demand: {
    cover: { url: "/images/exchange-demand-default-cover.svg", isDefault: true },
    serviceMode: "store",
    targetProviderCount: 1,
    targetProviderLimitSnapshot: 1,
    publisherCapacitySource: "customer_membership",
    membershipLevelSnapshot: "standard",
    matchMode: "quick",
    budgetMode: "total",
    budgetMinJpy: 8000,
    budgetMaxJpy: 12000,
    address: { line1: "東京都千代田区", line2: null, line3: null, line2GenerallyVisible: false, line3GenerallyVisible: false, disclosure: "owner" }
  },
  intelligence: null
};

const intelligencePost: ExchangePost = {
  ...demandPost,
  id: 61,
  type: "intelligence",
  title: "20:30 后还有 3 个空档，会员 8 折",
  detail: "肩颈、足部、睡眠护理都可以约，支持双人房。",
  publisher: {
    publicId: "b0000000001",
    identityType: "merchant_owner",
    displayName: "LifeDance 管理员",
    avatarUrl: "/private/admin-avatar.png"
  },
  demand: null,
  intelligence: {
    serviceMode: "store",
    addressLabel: "東京都中央区銀座3-4-12",
    serviceAreas: ["銀座", "中央区"],
    originalPriceJpy: 12_250,
    campaignPriceJpy: 9_800,
    booking: {
      available: true,
      unavailableReason: null,
      target: { type: "shop_service", id: 701 },
      catalogPriceJpy: 12_250,
      campaignPriceJpy: 9_800,
      serviceName: "深层放松护理",
      durationMinutes: 90,
      serviceMode: "store",
      serviceWindow: {
        startsAt: "2026-08-31T04:00:00.000Z",
        endsAt: "2026-08-31T06:00:00.000Z"
      }
    },
    publisherCard: {
      type: "shop",
      publicId: "shop0000000061",
      name: "GINZA Calm Body Lab",
      avatarUrl: "/public/shop-avatar.png",
      coverUrl: "/public/shop-cover.png",
      imageUrls: ["/public/shop-cover.png"],
      status: "published",
      isBookable: true,
      ratingAverage: "4.8",
      reviewCount: 126,
      completedOrderCount: 73,
      favoriteCount: 8,
      shareCount: 6,
      address: "東京都中央区銀座3-4-12",
      serviceMode: "store",
      detailPath: "/profiles/shop/shop0000000061"
    },
    serviceCard: null
  }
};

const baseResource: ReturnType<typeof useExchangeFeed> = {
  activeType: "demand" as const,
  posts: [demandPost],
  total: 1,
  page: 1,
  hasMore: false,
  loading: false,
  loadingMore: false,
  error: null,
  setActiveType: vi.fn(),
  refresh: vi.fn(),
  loadMore: vi.fn(),
  upsertPost: vi.fn(),
  replaceCounts: vi.fn(),
  removePost: vi.fn()
};

function renderFeed(overrides: Partial<typeof baseResource> = {}, context: "user" | "merchant" | "technician" = "user") {
  vi.mocked(useExchangeFeed).mockReturnValue({ ...baseResource, ...overrides });
  return renderToStaticMarkup(
    <MemoryRouter>
      <ExchangeFeedPage context={context} />
    </MemoryRouter>
  );
}

describe("ExchangeFeedPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a private My Requests tab to users and keeps both formal lists for merchant and technician portals", () => {
    expect(getDefaultExchangePostType("user")).toBe("intelligence");
    expect(getDefaultExchangePostType("merchant")).toBe("intelligence");
    expect(getDefaultExchangePostType("technician")).toBe("demand");

    const userMarkup = renderFeed();
    expect(userMarkup).toContain("我的需求");
    expect(userMarkup).toContain("情报");
    expect(userMarkup).toContain("client-feature-segmented-tabs--header");
    expect(useExchangeFeed).toHaveBeenLastCalledWith("intelligence", 20);

    const merchantMarkup = renderFeed({}, "merchant");
    expect(merchantMarkup).toContain("需求");
    expect(merchantMarkup).toContain("情报");
    expect(merchantMarkup).toContain("client-feature-segmented-tabs--header");
    expect(merchantMarkup).not.toContain(">全部<");

    renderFeed({}, "technician");
    expect(useExchangeFeed).toHaveBeenLastCalledWith("demand", 20);
  });

  it("restores the original high-fidelity search, tabs, offer card, and interaction bar", () => {
    const markup = renderFeed();
    expect(markup).toContain("搜索需要的服务");
    expect(markup).toContain('data-image-layout="wide"');
    expect(markup).toContain("利用条件");
    expect(markup).toContain("适用范围");
    expect(markup).toContain("备注");
    expect(markup).toContain("有效期限");
    expect(markup).toContain("测试客户 41");
    expect(markup).toContain("u0000000041");
    expect(markup).toContain("東京駅附近寻找中文口译");
    expect(markup).toContain("这段正文由测试账号用简体中文发布，不应自动翻译。");
    expect(markup).toContain("東京都千代田区");
    expect(markup).toContain("¥8,000–¥12,000");
    expect(markup).toContain("4");
    expect(markup).toContain("21");
    expect(markup).toContain("6");
    expect(markup).toContain('data-no-i18n="true"');
    expect(markup).toContain('data-post-id="41"');
    expect(markup).toContain("转发");
  });

  it("passes persisted like and share counts from the demand card to the feed", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    document.body.appendChild(container);
    let currentPost = demandPost;
    const replaceCounts = vi.fn((postId: number, counts: ExchangeInteractionCounts, viewer?: Partial<ExchangeViewerState>) => {
      if (postId === currentPost.id) currentPost = { ...currentPost, counts, viewer: { ...currentPost.viewer, ...viewer } };
    });
    vi.mocked(useExchangeFeed).mockImplementation(() => ({ ...baseResource, posts: [currentPost], replaceCounts }));
    vi.mocked(likeExchangePost).mockResolvedValue({ comments: 6, likes: 30, shares: 6 });
    vi.mocked(shareContent).mockResolvedValue({ status: "copied", url: "https://needo.test/needo/posts/41" });
    vi.mocked(recordExchangeShare).mockResolvedValue({ comments: 6, likes: 30, shares: 7 });
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("123e4567-e89b-42d3-a456-426614174000") });

    try {
      await act(async () => root.render(<MemoryRouter><ExchangeFeedPage context="user" /></MemoryRouter>));
      const buttons = container.querySelectorAll<HTMLButtonElement>('[data-post-id="41"] .flex.items-center.justify-between button');
      expect(buttons).toHaveLength(3);
      await act(async () => buttons[0]?.click());
      expect(replaceCounts).toHaveBeenCalledWith(41, { comments: 6, likes: 30, shares: 6 }, { liked: true });
      await act(async () => root.render(<MemoryRouter><ExchangeFeedPage context="user" /></MemoryRouter>));
      await act(async () => buttons[2]?.click());
      expect(recordExchangeShare).toHaveBeenCalledWith("41", "123e4567-e89b-42d3-a456-426614174000");
      expect(replaceCounts).toHaveBeenCalledWith(41, { comments: 6, likes: 30, shares: 7 }, { liked: true });
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it("opens the matching demand detail from the comment action and does not record cancelled shares", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    document.body.appendChild(container);
    vi.mocked(useExchangeFeed).mockReturnValue(baseResource);
    vi.mocked(shareContent).mockResolvedValue({ status: "cancelled", url: "https://needo.test/needo/posts/41" });
    function Destination() {
      return <div data-testid="destination">{useLocation().pathname}</div>;
    }

    try {
      await act(async () => root.render(
        <MemoryRouter initialEntries={["/needo"]}>
          <Routes>
            <Route path="/needo" element={<ExchangeFeedPage context="user" />} />
            <Route path="/needo/posts/:id" element={<Destination />} />
          </Routes>
        </MemoryRouter>
      ));
      const buttons = container.querySelectorAll<HTMLButtonElement>('[data-post-id="41"] .flex.items-center.justify-between button');
      expect(buttons).toHaveLength(3);
      await act(async () => buttons[2]?.click());
      expect(recordExchangeShare).not.toHaveBeenCalled();
      await act(async () => buttons[1]?.click());
      expect(container.querySelector('[data-testid="destination"]')?.textContent).toBe("/needo/posts/41");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("renders the projected demand cover in a wide frame without using the publisher avatar", () => {
    const post: ExchangePost = {
      ...demandPost,
      publisher: { ...demandPost.publisher!, avatarUrl: "/people/publisher.jpg" },
      demand: { ...demandPost.demand!, cover: { url: "/media/content/exchange/aa.webp", isDefault: false } }
    };
    const markup = renderFeed({ posts: [post] });

    expect(markup).toContain('src="/media/content/exchange/aa.webp"');
    expect(markup).toContain('data-image-layout="wide"');
    expect(markup).toContain("aspect-video w-full");
    expect(markup).not.toContain("/people/publisher.jpg");
  });

  it("renders the server-projected default demand cover when there is no uploaded image", () => {
    const markup = renderFeed({ posts: [demandPost] });

    expect(markup).toContain('src="/images/exchange-demand-default-cover.svg"');
    expect(markup).toContain('data-image-layout="wide"');
  });

  it("renders a provider-visible Request when the server redacts its publisher", () => {
    const markup = renderFeed(
      { posts: [{ ...demandPost, publisher: null }] },
      "merchant"
    );

    expect(markup).toContain("发布者已隐藏身份");
    expect(markup).toContain("東京駅附近寻找中文口译");
    expect(markup).not.toContain("测试客户 41");
    expect(markup).not.toContain("u0000000041");
  });

  it.each(["user", "merchant"] as const)(
    "does not expose a shop publisher identity without its public card in the %s portal",
    (context) => {
      const intelligencePost = {
        ...demandPost,
        id: 51,
        type: "intelligence",
        publisher: {
          publicId: "shop00000011",
          identityType: "shop",
          displayName: "StagingTest",
          avatarUrl: null
        },
        demand: null,
        intelligence: {
          serviceMode: "store",
          addressLabel: "東京都新宿区",
          serviceAreas: ["新宿区"],
          originalPriceJpy: 12_000,
          campaignPriceJpy: 10_000,
          booking: {
            available: true,
            unavailableReason: null,
            target: { type: "shop_service", id: 501 },
            catalogPriceJpy: 12_000,
            campaignPriceJpy: 10_000,
            serviceName: "正式サービス",
            durationMinutes: 60,
            serviceMode: "store",
            serviceWindow: {
              startsAt: demandPost.serviceStartAt,
              endsAt: demandPost.serviceEndAt
            }
          },
          publisherCard: null,
          serviceCard: null
        }
      } as ExchangePost;

      const markup = renderFeed({ posts: [intelligencePost], activeType: "intelligence" }, context);

      expect(markup).not.toContain("StagingTest");
      expect(markup).not.toContain("shop00000011");
      expect(markup).not.toContain('data-testid="exchange-intelligence-shop-card"');
      expect(markup).not.toContain("LifeDance 管理员");
      expect(markup).not.toContain("b0000000001");
    }
  );

  it.each(["user", "merchant", "technician"] as const)(
    "reuses the full shop information card for %s intelligence viewers",
    (context) => {
      const markup = renderFeed(
        { activeType: "intelligence", posts: [intelligencePost] },
        context
      );
      const noteIndex = markup.indexOf("肩颈、足部、睡眠护理都可以约，支持双人房。");
      const shopIndex = markup.indexOf("GINZA Calm Body Lab");
      const expiryIndex = markup.indexOf("有效期限");

      expect(markup).toContain('data-testid="exchange-intelligence-shop-card"');
      expect(markup).toContain('data-card-size="default"');
      expect(markup).toContain('data-testid="unified-card-metrics"');
      expect(markup).toContain('data-testid="unified-card-detail-arrow"');
      expect(markup).toContain("4.8");
      expect(markup).toContain(">73<");
      expect(markup).toContain(">8<");
      expect(markup).toContain(">6<");
      expect(markup).toContain("東京都中央区銀座3-4-12");
      expect(markup).toContain(`href="${context === "user" ? "" : `/${context}`}/stores/shop0000000061"`);
      expect(markup).not.toContain("sourcePostId");
      expect(markup).not.toContain("LifeDance 管理员");
      expect(markup).not.toContain("b0000000001");
      expect(markup).not.toContain("shop0000000061</");
      expect(markup).not.toContain("/private/admin-avatar.png");
      expect(markup).toContain('data-has-image="false"');
      expect(noteIndex).toBeGreaterThan(-1);
      expect(shopIndex).toBeGreaterThan(noteIndex);
      expect(expiryIndex).toBeGreaterThan(shopIndex);
    }
  );

  it("omits the location row when the shop has not set an address", () => {
    const post = {
      ...intelligencePost,
      intelligence: {
        ...intelligencePost.intelligence!,
        publisherCard: {
          ...intelligencePost.intelligence!.publisherCard!,
          address: "   "
        }
      }
    } as ExchangePost;

    const markup = renderFeed({ activeType: "intelligence", posts: [post] }, "user");

    expect(markup).toContain('data-testid="exchange-intelligence-shop-card"');
    expect(markup).not.toContain('data-testid="unified-card-location-icon"');
  });

  it("does not let the post keyboard handler hijack its nested shop link", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    vi.mocked(useExchangeFeed).mockReturnValue({
      ...baseResource,
      activeType: "intelligence",
      posts: [intelligencePost]
    });
    function Destination() {
      const location = useLocation();
      return <div data-testid="destination">{location.pathname}</div>;
    }

    try {
      await act(async () => root.render(
        <MemoryRouter initialEntries={["/needo"]}>
          <Routes>
            <Route path="/needo" element={<><ExchangeFeedPage context="user" /><Destination /></>} />
            <Route path="/stores/:id" element={<Destination />} />
            <Route path="/needo/posts/:id" element={<Destination />} />
          </Routes>
        </MemoryRouter>
      ));
      const shopLink = container.querySelector<HTMLAnchorElement>('a[href="/stores/shop0000000061"]');
      expect(shopLink).not.toBeNull();
      await act(async () => shopLink?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
      expect(container.querySelector('[data-testid="destination"]')?.textContent).toBe("/needo");
      await act(async () => shopLink?.click());
      expect(container.querySelector('[data-testid="destination"]')?.textContent).toBe(
        "/stores/shop0000000061"
      );
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("has a protected technician store homepage for the Intelligence card target", () => {
    const appSource = readFileSync(`${process.cwd()}/src/App.tsx`, "utf8");
    expect(appSource).toContain('path="/technician/stores/:id" element={protect("technician", <StoreDetailPage scope="technician" />)}');
  });

  it("shows distinct loading, empty, permission, authentication, and unavailable states", () => {
    expect(renderFeed({ loading: true, posts: [] })).toContain("正在读取正式需求");
    expect(renderFeed({ posts: [], total: 0 })).toContain("还没有正式需求");
    expect(renderFeed({ posts: [], error: { kind: "unauthorized", message: "error.auth.required" } })).toContain("请重新登录后查看");
    expect(renderFeed({ posts: [], error: { kind: "forbidden", message: "error.permission.denied" } })).toContain("当前身份没有查看权限");
    expect(renderFeed({ posts: [], error: { kind: "unavailable", message: "error.network" } })).toContain("正式服务暂时无法连接");
    expect(renderFeed({ posts: [], error: { kind: "unknown", message: "error.api" } })).toContain("正式数据读取失败");
  });

  it("contains no deferred transaction controls or capability-gate copy", () => {
    const source = readFileSync("src/features/exchange/ExchangeFeedPage.tsx", "utf8");
    expect(source).not.toMatch(/抢单|报价|匹配|预约|支付/u);
    expect(source).not.toContain("正式需求与情报功能尚未启用");
    expect(source).not.toContain("localStorage");
    expect(source).toContain("OfferInfoCard");
    expect(source).toContain("FloatingHomeHeader");
    expect(source).toContain("FloatingHeaderSearchBar");
    expect(source).toContain("FeatureSegmentedTabs");
    expect(source).toContain("MomentActionBar");
  });
});
