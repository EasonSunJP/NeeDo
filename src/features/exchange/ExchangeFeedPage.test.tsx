// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExchangePost } from "./types";
import { useExchangeFeed } from "./useExchangeFeed";
import { ExchangeFeedPage, getDefaultExchangePostType } from "./ExchangeFeedPage";

vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));
vi.mock("../../theme/ClientThemeProvider", () => ({ useClientTheme: () => ({ theme: "dark-green" }) }));
vi.mock("./useExchangeFeed", () => ({ useExchangeFeed: vi.fn() }));
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
    expect(markup).toContain("grid-cols-[90px,1fr]");
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
    "renders the same privacy-safe shop summary for %s intelligence viewers",
    (context) => {
      const markup = renderFeed(
        { activeType: "intelligence", posts: [intelligencePost] },
        context
      );
      const noteIndex = markup.indexOf("肩颈、足部、睡眠护理都可以约，支持双人房。");
      const shopIndex = markup.indexOf("GINZA Calm Body Lab");
      const expiryIndex = markup.indexOf("有效期限");

      expect(markup).toContain('data-testid="exchange-intelligence-shop-card"');
      expect(markup).toContain('data-card-size="compact"');
      expect(markup).toContain("銀座 · 中央区");
      expect(markup).toContain("可预约");
      expect(markup).toContain(`href="${context === "user" ? "" : `/${context}`}/profiles/shop/shop0000000061"`);
      expect(markup).not.toContain("LifeDance 管理员");
      expect(markup).not.toContain("b0000000001");
      expect(markup).not.toContain("shop0000000061</");
      expect(markup).not.toContain("東京都中央区銀座3-4-12");
      expect(markup).not.toContain("/private/admin-avatar.png");
      expect(markup).toContain('data-has-image="false"');
      expect(noteIndex).toBeGreaterThan(-1);
      expect(shopIndex).toBeGreaterThan(noteIndex);
      expect(expiryIndex).toBeGreaterThan(shopIndex);
    }
  );

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
            <Route path="/profiles/shop/:id" element={<Destination />} />
            <Route path="/needo/posts/:id" element={<Destination />} />
          </Routes>
        </MemoryRouter>
      ));
      const shopLink = container.querySelector<HTMLAnchorElement>('a[href="/profiles/shop/shop0000000061"]');
      expect(shopLink).not.toBeNull();
      await act(async () => shopLink?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
      expect(container.querySelector('[data-testid="destination"]')?.textContent).toBe("/needo");
      await act(async () => shopLink?.click());
      expect(container.querySelector('[data-testid="destination"]')?.textContent).toBe(
        "/profiles/shop/shop0000000061"
      );
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
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
