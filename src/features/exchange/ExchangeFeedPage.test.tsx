import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExchangePost } from "./types";
import { useExchangeFeed } from "./useExchangeFeed";
import { ExchangeFeedPage, getDefaultExchangePostType } from "./ExchangeFeedPage";

vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));
vi.mock("../../theme/ClientThemeProvider", () => ({ useClientTheme: () => ({ theme: "dark-green" }) }));
vi.mock("./useExchangeFeed", () => ({ useExchangeFeed: vi.fn() }));

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

  it("shows distinct loading, empty, permission, authentication, and unavailable states", () => {
    expect(renderFeed({ loading: true, posts: [] })).toContain("正在读取正式需求");
    expect(renderFeed({ posts: [], total: 0 })).toContain("还没有正式需求");
    expect(renderFeed({ posts: [], error: { kind: "unauthorized", message: "error.auth.required" } })).toContain("请重新登录后查看");
    expect(renderFeed({ posts: [], error: { kind: "forbidden", message: "error.permission.denied" } })).toContain("当前身份没有查看权限");
    expect(renderFeed({ posts: [], error: { kind: "unavailable", message: "error.network" } })).toContain("正式服务暂时无法连接");
    expect(renderFeed({ posts: [], error: { kind: "unknown", message: "error.api" } })).toContain("正式数据读取失败");
  });

  it("contains no deferred transaction controls or capability-gate copy", () => {
    const source = readFileSync(new URL("./ExchangeFeedPage.tsx", import.meta.url), "utf8");
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
