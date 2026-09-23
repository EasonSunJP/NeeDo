// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getExchangePost,
  likeExchangePost,
  recordExchangeShare,
  unlikeExchangePost,
  withdrawExchangePost
} from "./api";
import { ExchangePostDetailPage } from "./ExchangePostDetailPage";
import type { ExchangePost } from "./types";
import appSource from "../../App.tsx?raw";
import type { MessageCenterContext } from "../../lib/messageCenter";
import routeSource from "../../pages/mobile/NeedoRoutePages.tsx?raw";
import detailSource from "./ExchangePostDetailPage.tsx?raw";
import { shareContent } from "../../lib/share";

const mockI18n = vi.hoisted(() => ({ language: "zh" as "zh" | "zh-Hant" | "ja" | "en" | "ko" }));
const receivedClaimsMock = vi.hoisted(() => ({
  onEffectiveBudgetChange: undefined as undefined | ((budgetMaxJpy: number) => void)
}));
const claimPanelMock = vi.hoisted(() => ({ scrollIntoView: vi.fn() }));

vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({ language: mockI18n.language }),
  useOptionalI18n: () => ({ language: mockI18n.language })
}));
vi.mock("../../lib/share", () => ({ shareContent: vi.fn() }));
vi.mock("../../theme/ClientThemeProvider", () => ({
  getClientThemeClassName: () => "client-theme-dark-green",
  useClientTheme: () => ({ theme: "dark-green", isNight: true })
}));
vi.mock("./api", () => ({
  getExchangePost: vi.fn(),
  likeExchangePost: vi.fn(),
  recordExchangeShare: vi.fn(),
  unlikeExchangePost: vi.fn(),
  withdrawExchangePost: vi.fn()
}));
vi.mock("./ExchangeInteractions", () => ({
  ExchangeInteractions: ({ post, showActionBar, variant }: { post: ExchangePost; showActionBar?: boolean; variant?: string }) => (
    <div data-show-action-bar={String(showActionBar)} data-testid="formal-interactions" data-variant={variant}>{post.counts.comments}</div>
  )
}));
vi.mock("./ExchangeClaimPanel", () => ({
  ExchangeClaimPanel: ({ post }: { post: ExchangePost }) => (
    <div data-post-id={post.id} data-testid="formal-claim-panel">
      <div
        data-testid="exchange-claim-panel"
        ref={(element) => {
          if (element) element.scrollIntoView = claimPanelMock.scrollIntoView;
        }}
      />
    </div>
  )
}));
vi.mock("./ExchangeReceivedClaims", () => ({
  ExchangeReceivedClaims: ({
    onEffectiveBudgetChange,
    postId
  }: {
    onEffectiveBudgetChange?: (budgetMaxJpy: number) => void;
    postId: string;
  }) => {
    receivedClaimsMock.onEffectiveBudgetChange = onEffectiveBudgetChange;
    return <div data-post-id={postId} data-testid="formal-received-claims" />;
  }
}));
vi.mock("./ExchangeMatchedBookingCard", () => ({
  ExchangeMatchedBookingCard: ({ postId }: { postId: string }) => <div data-post-id={postId} data-testid="formal-matched-booking" />
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const demandPost: ExchangePost = {
  id: 41,
  type: "demand",
  status: "published",
  title: "正式详情标题",
  detail: "数据库详情正文",
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
    address: {
      line1: "東京都千代田区丸の内 1-1",
      line2: null,
      line3: null,
      line2GenerallyVisible: false,
      line3GenerallyVisible: false,
      disclosure: "owner"
    }
  },
  intelligence: null
};

const intelligencePost = {
  ...demandPost,
  id: 61,
  type: "intelligence",
  title: "20:30 后还有 3 个空档，会员 8 折",
  detail: "肩颈、足部、睡眠护理都可以约，支持双人房。",
  publisher: {
    publicId: "m0000000061",
    identityType: "merchant_owner",
    displayName: "GINZA Calm Body Lab",
    avatarUrl: "/simulation/shops/ginza-calm-body-lab.png"
  },
  counts: { comments: 7, likes: 42, shares: 8 },
  viewer: { liked: false, canWithdraw: false, canClaim: false, canViewClaims: false },
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
      avatarUrl: "/simulation/shops/ginza-calm-body-lab-avatar.png",
      coverUrl: "/simulation/shops/ginza-calm-body-lab.png",
      imageUrls: ["/simulation/shops/ginza-calm-body-lab.png"],
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
    serviceCard: {
      targetType: "shop_service",
      publicId: "service0000000701",
      name: "深层放松护理",
      description: "肩颈与足部深层护理",
      coverUrl: "/services/deep-relaxation.png",
      imageUrls: ["/services/deep-relaxation.png"],
      tags: ["肩颈", "足部"],
      catalogPriceJpy: 12_250,
      campaignPriceJpy: 9_800,
      currency: "JPY",
      durationMinutes: 90,
      serviceMode: "store",
      shopPublicId: "shop0000000061",
      shopAddress: "東京都中央区銀座3-4-12",
      detailPath: "/services/service0000000701"
    }
  }
} as unknown as ExchangePost;

const technicianIntelligencePost = {
  ...intelligencePost,
  id: 62,
  publisher: {
    publicId: "s0000000062",
    identityType: "technician",
    displayName: "佐藤 真央",
    avatarUrl: "/technicians/sato.png"
  },
  intelligence: {
    ...intelligencePost.intelligence!,
    serviceMode: "store",
    booking: {
      ...intelligencePost.intelligence!.booking,
      target: { type: "technician_service", id: 801 },
      serviceMode: "store"
    },
    publisherCard: {
      type: "technician",
      publicId: "s0000000062",
      displayName: "佐藤 真央",
      avatarUrl: "/technicians/sato.png",
      shop: { publicId: "shop0000000061", name: "GINZA Calm Body Lab" },
      status: "published",
      isBookable: true,
      yearsExperience: 8,
      completedOrderCount: 352,
      acceptanceRatePercent: 97.5,
      ratingAverage: "4.9",
      reviewCount: 88,
      serviceAreas: ["中央区", "港区"],
      languages: ["日本語", "中文"],
      detailPath: "/profiles/technician/s0000000062",
      servicesPath: "/stores/shop0000000061/technicians/s0000000062/services"
    },
    serviceCard: {
      ...intelligencePost.intelligence!.serviceCard!,
      targetType: "technician_service",
      publicId: "technician-service0000000801",
      serviceMode: "store",
      detailPath: "/stores/shop0000000061/technicians/s0000000062/services"
    }
  }
} as unknown as ExchangePost;

function CheckoutDestination() {
  const location = useLocation();
  return <div data-testid="checkout-destination">{location.pathname}{location.search}</div>;
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

let container: HTMLDivElement;
let root: Root;
let renderVersion = 0;

function detailBasePath(context: MessageCenterContext) {
  return context === "user" ? "/needo" : `/${context}/needo`;
}

async function renderDetail(
  path = "/needo/posts/41",
  context: MessageCenterContext = "user"
) {
  const basePath = detailBasePath(context);
  await act(async () => root.render(
    <MemoryRouter initialEntries={[path]} key={`${path}-${context}-${renderVersion += 1}`}>
      <Routes>
        <Route
          path={`${basePath}/posts/:postId`}
          element={<ExchangePostDetailPage context={context} />}
        />
        <Route path={basePath} element={<div data-testid="exchange-root">{basePath}</div>} />
        <Route path="/checkout/:serviceId" element={<CheckoutDestination />} />
        <Route path="/checkout/technician-service/:technicianServiceId" element={<CheckoutDestination />} />
      </Routes>
    </MemoryRouter>
  ));
}

describe("ExchangePostDetailPage", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    mockI18n.language = "zh";
    vi.mocked(getExchangePost).mockReset();
    vi.mocked(likeExchangePost).mockReset();
    vi.mocked(recordExchangeShare).mockReset();
    vi.mocked(unlikeExchangePost).mockReset();
    vi.mocked(withdrawExchangePost).mockReset();
    receivedClaimsMock.onEffectiveBudgetChange = undefined;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("loads direct navigation from the formal detail endpoint", async () => {
    vi.mocked(getExchangePost).mockResolvedValue(demandPost);
    await renderDetail();
    await waitFor(() => expect(document.body.textContent).toContain("正式详情标题"));

    expect(getExchangePost).toHaveBeenCalledWith("41", expect.any(AbortSignal));
    expect(document.body.textContent).toContain("测试客户 41");
    expect(document.body.textContent).toContain("u0000000041");
    expect(document.body.textContent).toContain("¥8,000–¥12,000");
    expect(document.body.querySelector('[data-testid="formal-interactions"]')).not.toBeNull();
    expect(document.body.innerHTML).toContain('data-no-i18n="true"');
  });

  it("shows the authored system-language version in the detail without a translate button", async () => {
    vi.mocked(getExchangePost).mockResolvedValue({
      ...demandPost,
      contentLocale: "ja",
      title: "日本語タイトル",
      detail: "日本語説明",
      contentTranslations: { "zh-CN": { title: "中文标题", detail: "中文说明" } }
    });
    await renderDetail();
    await waitFor(() => expect(document.body.textContent).toContain("中文标题"));
    expect(document.body.textContent).toContain("中文说明");
    expect(document.body.querySelector('[data-action="detail-translate"]')).toBeNull();
  });

  it("renders the projected demand cover in a 16:9 hero without using the publisher avatar", async () => {
    vi.mocked(getExchangePost).mockResolvedValue({
      ...demandPost,
      publisher: { ...demandPost.publisher!, avatarUrl: "/people/publisher.jpg" },
      demand: { ...demandPost.demand!, cover: { url: "/media/content/exchange/aa.webp", isDefault: false } }
    });
    await renderDetail();
    await waitFor(() => expect(document.body.textContent).toContain(demandPost.title));

    const hero = document.body.querySelector('[data-testid="exchange-detail-hero"]');
    expect(hero?.className).toContain("aspect-video");
    expect(hero?.querySelector("img")?.getAttribute("src")).toBe("/media/content/exchange/aa.webp");
    expect(hero?.querySelector("img")?.className).toContain("object-cover");
    expect(hero?.innerHTML).not.toContain("/people/publisher.jpg");
  });

  it("shows the demand share count after success and after reloading the server projection", async () => {
    vi.mocked(getExchangePost).mockResolvedValue(demandPost);
    vi.mocked(shareContent).mockResolvedValue({ status: "copied", url: "https://needo.test/needo/posts/41" });
    const counts = { ...demandPost.counts, shares: 7 };
    vi.mocked(recordExchangeShare).mockResolvedValue(counts);
    await renderDetail();
    const shareButton = () => document.body.querySelector<HTMLButtonElement>('button[aria-label="转发"]');
    await waitFor(() => expect(shareButton()?.textContent).toContain("6"));

    await act(async () => shareButton()?.click());
    await waitFor(() => expect(shareButton()?.textContent).toContain("7"));
    expect(recordExchangeShare).toHaveBeenCalledOnce();

    vi.mocked(getExchangePost).mockResolvedValue({ ...demandPost, counts });
    await renderDetail();
    await waitFor(() => expect(shareButton()?.textContent).toContain("7"));
  });

  it("renders the server-projected default demand cover in the hero", async () => {
    vi.mocked(getExchangePost).mockResolvedValue(demandPost);
    await renderDetail();
    await waitFor(() => expect(document.body.textContent).toContain(demandPost.title));

    expect(document.body.querySelector('[data-testid="exchange-detail-hero"] img')?.getAttribute("src"))
      .toBe("/images/exchange-demand-default-cover.svg");
  });

  it("keeps every owner budget summary aligned with the current matching budget", async () => {
    vi.mocked(getExchangePost).mockResolvedValue({
      ...demandPost,
      viewer: { liked: false, canWithdraw: true, canClaim: false, canViewClaims: true }
    });
    await renderDetail();
    await waitFor(() => expect(receivedClaimsMock.onEffectiveBudgetChange).toBeTypeOf("function"));

    await act(async () => receivedClaimsMock.onEffectiveBudgetChange?.(32_000));

    expect(document.body.textContent).toContain("¥8,000–¥32,000");
    expect(document.body.textContent).not.toContain("¥8,000–¥12,000");
  });

  it.each([
    ["user", "/needo/posts/61", "/needo"],
    ["merchant", "/merchant/needo/posts/61", "/merchant/needo"],
    ["technician", "/technician/needo/posts/61", "/technician/needo"]
  ] as const)("closes a direct %s detail to its Exchange root", async (context, path, expectedRoot) => {
    vi.mocked(getExchangePost).mockResolvedValue(intelligencePost);
    await renderDetail(path, context);
    await waitFor(() => expect(document.body.textContent).toContain(intelligencePost.title));

    const close = document.body.querySelector<HTMLButtonElement>('button[aria-label="关闭"]');
    expect(close).not.toBeNull();
    await act(async () => close?.click());

    expect(document.body.querySelector('[data-testid="exchange-root"]')?.textContent).toBe(expectedRoot);
  });

  it("keeps a deterministic close action in invalid, loading, and read-error states", async () => {
    await renderDetail("/needo/posts/not-a-number");
    expect(document.body.querySelector('button[aria-label="关闭"]')).not.toBeNull();

    vi.mocked(getExchangePost).mockImplementationOnce(() => new Promise<ExchangePost>(() => undefined));
    await renderDetail("/needo/posts/41");
    expect(document.body.textContent).toContain("正在读取正式详情");
    expect(document.body.querySelector('button[aria-label="关闭"]')).not.toBeNull();

    vi.mocked(getExchangePost).mockRejectedValueOnce(new Error("error.exchange.post_not_found"));
    await renderDetail("/needo/posts/42");
    await waitFor(() => expect(document.body.textContent).toContain("内容不存在或不可查看"));
    expect(document.body.querySelector('button[aria-label="关闭"]')).not.toBeNull();
  });

  it("renders a redacted publisher without reconstructing private identity", async () => {
    vi.mocked(getExchangePost).mockResolvedValue({ ...demandPost, publisher: null });
    await renderDetail();
    await waitFor(() => expect(document.body.textContent).toContain("正式详情标题"));

    expect(document.body.textContent).toContain("发布者已隐藏身份");
    expect(document.body.textContent).not.toContain("测试客户 41");
    expect(document.body.textContent).not.toContain("u0000000041");
  });

  it.each(["general", undefined] as const)(
    "renders only the coarse Request service area for disclosure %s",
    async (disclosure) => {
    vi.mocked(getExchangePost).mockResolvedValue({
      ...demandPost,
      areaLabel: "東京都港区",
      publisher: null,
      demand: {
        ...demandPost.demand!,
        budgetMinJpy: null,
        address: {
          line1: "東京都港区六本木 3-2-1",
          line2: "Prince Tower 12F",
          line3: "受付で田中を呼び出してください",
          line2GenerallyVisible: true,
          line3GenerallyVisible: true,
          disclosure: disclosure as never
        }
      }
    });
    await renderDetail();
    await waitFor(() => expect(document.body.textContent).toContain("正式详情标题"));

    expect(document.body.textContent).toContain("東京都港区");
    expect(document.body.textContent).not.toContain("東京都港区六本木 3-2-1");
    expect(document.body.textContent).not.toContain("Prince Tower 12F");
    expect(document.body.textContent).not.toContain("田中");
    expect(document.body.textContent).not.toContain("测试客户 41");
    expect(document.body.textContent).not.toContain("u0000000041");
    expect(document.body.textContent).toContain("¥12,000");
    expect(document.body.textContent).not.toContain("¥0–¥12,000");
    }
  );

  it("restores the approved full-screen intelligence detail composition with formal fields", async () => {
    vi.mocked(getExchangePost).mockResolvedValue(intelligencePost);
    await renderDetail("/needo/posts/61");
    await waitFor(() => expect(document.body.textContent).toContain(intelligencePost.title));

    const page = document.body.querySelector('[data-testid="exchange-detail-page"]');
    expect(page).not.toBeNull();
    expect(document.body.textContent).toContain("情报详情");
    expect(document.body.textContent).toContain("介绍");
    expect(document.body.textContent).toContain("支付信息");
    expect(document.body.textContent).toContain("服务流程");
    expect(document.body.textContent).toContain("服务要求");
    expect(document.body.textContent).toContain("GINZA Calm Body Lab");
    expect(document.body.textContent).not.toContain("shop0000000061");
    expect(document.body.textContent).toContain("¥9,800");
    expect(document.body.textContent).toContain("可通过正式预约流程下单");
    expect(document.body.textContent).toContain("请通过平台保留沟通记录和服务凭证");
    expect(document.body.querySelector('[data-testid="exchange-detail-hero"] img')?.getAttribute("src")).toBe(
      "/simulation/shops/ginza-calm-body-lab.png"
    );
    expect(document.body.querySelector('[data-testid="formal-interactions"]')?.getAttribute("data-show-action-bar")).toBe("false");
    expect(document.body.querySelector('[data-testid="formal-interactions"]')?.getAttribute("data-variant")).toBe("detail");
    expect(document.body.querySelector<HTMLButtonElement>('[data-action="book-intelligence"]')?.disabled).toBe(false);
    expect(document.body.querySelector('[data-action="detail-like"]')).not.toBeNull();
    expect(document.body.querySelector('[data-action="detail-share"]')).not.toBeNull();
  });

  it("renders the formal shop and service projections through the shared cards and opens the exact checkout", async () => {
    vi.mocked(getExchangePost).mockResolvedValue(intelligencePost);
    await renderDetail("/needo/posts/61");
    await waitFor(() => expect(document.body.textContent).toContain("深层放松护理"));

    expect(document.body.querySelector('[data-testid="exchange-intelligence-publisher-card"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="unified-info-card"][data-card-kind="service"]')).not.toBeNull();
    expect(document.body.textContent).toContain("4.8");
    expect(document.body.textContent).not.toContain("126");
    expect(document.body.textContent).toContain("￥9,800");
    expect(document.body.textContent).not.toContain("￥12,250");
    expect(document.body.textContent).toContain("90分钟");
    expect(document.body.querySelector('a[href="/stores/shop0000000061"]')).not.toBeNull();
    expect(document.body.querySelector('a[href="/services/service0000000701"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain("701");

    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="book-intelligence"]')?.click());
    expect(document.body.querySelector('[data-testid="checkout-destination"]')?.textContent).toBe(
      "/checkout/701?date=2026-08-31&time=13%3A00&exchangePost=61"
    );
  });

  it.each(["user", "merchant", "technician"] as const)(
    "reuses the full shop card without leaking the merchant administrator for %s viewers",
    async (context) => {
      vi.mocked(getExchangePost).mockResolvedValue({
        ...intelligencePost,
        publisher: {
          publicId: "b0000000001",
          identityType: "merchant_owner",
          displayName: "LifeDance 管理员",
          avatarUrl: "/private/admin-avatar.png"
        }
      });
      await renderDetail(`${detailBasePath(context)}/posts/61`, context);
      await waitFor(() => expect(document.body.textContent).toContain("GINZA Calm Body Lab"));

      const shopCard = document.body.querySelector('[data-testid="exchange-intelligence-shop-card"]');
      expect(shopCard).not.toBeNull();
      expect(shopCard?.textContent).toContain("銀座");
      expect(shopCard?.textContent).toContain("中央区");
      expect(shopCard?.textContent).toContain("可预约");
      expect(shopCard?.textContent).not.toContain("shop0000000061");
      expect(document.body.textContent).not.toContain("LifeDance 管理员");
      expect(document.body.textContent).not.toContain("b0000000001");
      expect(shopCard?.textContent).toContain("東京都中央区銀座3-4-12");
      expect(document.body.innerHTML).not.toContain("/private/admin-avatar.png");
      expect(document.body.querySelector(`a[href="${context === "user" ? "" : `/${context}`}/stores/shop0000000061"]`)).not.toBeNull();
    }
  );

  it("does not fall back to an administrator portrait when the shop projection is unavailable", async () => {
    vi.mocked(getExchangePost).mockResolvedValue({
      ...intelligencePost,
      publisher: {
        publicId: "b0000000001",
        identityType: "merchant_owner",
        displayName: "LifeDance 管理员",
        avatarUrl: "/private/admin-avatar.png"
      },
      intelligence: {
        ...intelligencePost.intelligence!,
        publisherCard: null
      }
    });
    await renderDetail("/needo/posts/61");
    await waitFor(() => expect(document.body.textContent).toContain(intelligencePost.title));

    expect(document.body.querySelector('[data-testid="exchange-detail-hero"] img')?.getAttribute("src")).toBe(
      "/icons/needo-nav-button-dark.png"
    );
    expect(document.body.innerHTML).not.toContain("/private/admin-avatar.png");
    expect(document.body.textContent).not.toContain("LifeDance 管理员");
    expect(document.body.textContent).not.toContain("b0000000001");
  });

  it("renders the canonical technician projection and opens technician-service checkout", async () => {
    vi.mocked(getExchangePost).mockResolvedValue(technicianIntelligencePost);
    await renderDetail("/needo/posts/62");
    await waitFor(() => expect(document.body.textContent).toContain("佐藤 真央"));

    expect(document.body.textContent).toContain("352");
    expect(document.body.textContent).toContain("日本語");
    expect(document.body.querySelector('a[href="/profiles/technician/s0000000062"]')).not.toBeNull();

    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="book-intelligence"]')?.click());
    expect(document.body.querySelector('[data-testid="checkout-destination"]')?.textContent).toBe(
      "/checkout/technician-service/801?date=2026-08-31&time=13%3A00&exchangePost=62"
    );
  });

  it("fails closed for onsite Intelligence until structured travel checkout is integrated", async () => {
    vi.mocked(getExchangePost).mockResolvedValue({
      ...technicianIntelligencePost,
      intelligence: {
        ...technicianIntelligencePost.intelligence!,
        serviceMode: "onsite",
        booking: { ...technicianIntelligencePost.intelligence!.booking, serviceMode: "onsite" },
        serviceCard: { ...technicianIntelligencePost.intelligence!.serviceCard!, serviceMode: "onsite" }
      }
    } as ExchangePost);
    await renderDetail("/needo/posts/62");
    await waitFor(() => expect(document.body.textContent).toContain("佐藤 真央"));

    const button = document.body.querySelector<HTMLButtonElement>('[data-action="book-intelligence"]')!;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("预约后续开放");
    expect(document.body.querySelector('[data-testid="checkout-destination"]')).toBeNull();
  });

  it.each([
    ["legacy_unbound", "这条历史情报没有绑定正式服务，无法预约"],
    ["publisher_unavailable", "发布方当前不可预约"],
    ["service_unavailable", "绑定的正式服务当前不可预约"],
    ["post_unavailable", "这条情报已结束，无法预约"]
  ] as const)("fails closed with a localized %s reason", async (reason, expectedText) => {
    vi.mocked(getExchangePost).mockResolvedValue({
      ...intelligencePost,
      intelligence: {
        ...intelligencePost.intelligence!,
        booking: {
          ...intelligencePost.intelligence!.booking,
          available: false,
          unavailableReason: reason
        }
      }
    } as ExchangePost);
    await renderDetail("/needo/posts/61");
    await waitFor(() => expect(document.body.textContent).toContain(expectedText));

    expect(document.body.querySelector<HTMLButtonElement>('[data-action="book-intelligence"]')?.disabled).toBe(true);
  });

  it("localizes the detail type and publisher identity instead of exposing raw identity codes", async () => {
    mockI18n.language = "en";
    const publisherCard = intelligencePost.intelligence!.publisherCard;
    if (!publisherCard || publisherCard.type !== "shop") throw new Error("expected shop fixture");
    vi.mocked(getExchangePost).mockResolvedValue({
      ...intelligencePost,
      publisher: {
        publicId: "shop00000011",
        identityType: "shop",
        displayName: "StagingTest",
        avatarUrl: null
      },
      intelligence: {
        ...intelligencePost.intelligence!,
        publisherCard: {
          ...publisherCard,
          publicId: "shop00000011",
          name: "StagingTest",
          detailPath: "/profiles/shop/shop00000011"
        }
      }
    });
    await renderDetail("/needo/posts/61");
    await waitFor(() => expect(document.body.textContent).toContain(intelligencePost.title));

    expect(document.body.textContent).toContain("Service post details");
    expect(document.body.textContent).toContain("Service posts");
    expect(document.body.textContent).not.toContain("Rating");
    expect(document.body.textContent).not.toContain("merchant_owner");
    expect(document.body.textContent).toContain("StagingTest");
    expect(document.body.textContent).not.toContain("shop00000011");
    expect(Array.from(document.body.querySelectorAll("span")).some((node) => node.textContent === "shop")).toBe(false);
    expect(document.body.textContent).not.toContain("情报");
  });

  it("distinguishes an invalid route, missing post, expired status, and a terminal match", async () => {
    await renderDetail("/needo/posts/not-a-number");
    expect(document.body.textContent).toContain("链接无效");
    expect(getExchangePost).not.toHaveBeenCalled();

    vi.mocked(getExchangePost).mockRejectedValueOnce(new Error("error.exchange.post_not_found"));
    await renderDetail();
    await waitFor(() => expect(document.body.textContent).toContain("内容不存在或不可查看"));

    vi.mocked(getExchangePost).mockResolvedValueOnce({ ...demandPost, status: "expired" });
    await renderDetail();
    await waitFor(() => expect(document.body.textContent).toContain("这条内容已过期"));

    vi.mocked(getExchangePost).mockResolvedValueOnce({
      ...demandPost,
      status: "matched",
      viewer: { liked: false, canWithdraw: false, canClaim: false, canViewClaims: true },
      demand: { ...demandPost.demand!, matchMode: "selective" }
    });
    await renderDetail();
    await waitFor(() => expect(document.body.textContent).toContain("匹配已完成，请查看已选服务者的预约状态；支付不会自动扣款"));
    expect(document.body.textContent).toContain("确认预约后，每位已匹配服务者各有一张独立订单；支付仍未启用");
    expect(document.body.querySelector('[data-testid="formal-received-claims"]')).not.toBeNull();
    expect(document.body.querySelector<HTMLButtonElement>('[data-action="matching-inbox"]')?.disabled).toBe(true);
  });

  it("keeps the persisted matching-closed state copy unchanged", async () => {
    vi.mocked(getExchangePost).mockResolvedValue({
      ...demandPost,
      status: "closed",
      viewer: { liked: false, canWithdraw: false, canClaim: false, canViewClaims: false }
    });

    await renderDetail();
    await waitFor(() => expect(document.body.textContent).toContain("这条需求的匹配已关闭"));

    expect(
      document.body.querySelector<HTMLButtonElement>('[data-action="matching-inbox"]')?.textContent
    ).toBe("匹配已关闭");
  });

  it("requires confirmation and renders the server-authoritative withdrawn state", async () => {
    vi.mocked(getExchangePost).mockResolvedValue(demandPost);
    vi.mocked(withdrawExchangePost).mockResolvedValue({ ...demandPost, status: "withdrawn", viewer: { liked: false, canWithdraw: false, canClaim: false, canViewClaims: false } });
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirm);
    vi.stubGlobal("crypto", { randomUUID: () => "123e4567-e89b-42d3-a456-426614174000" });

    await renderDetail();
    await waitFor(() => expect(document.body.textContent).toContain("撤回"));
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="withdraw"]')?.click());
    expect(withdrawExchangePost).not.toHaveBeenCalled();

    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="withdraw"]')?.click());
    await waitFor(() => expect(document.body.textContent).toContain("这条内容已撤回"));
    expect(withdrawExchangePost).toHaveBeenCalledWith("41", "123e4567-e89b-42d3-a456-426614174000");
    expect(document.body.querySelector('[data-action="withdraw"]')).toBeNull();
  });

  it("composes the provider claim panel only from the server capability flag", async () => {
    vi.mocked(getExchangePost).mockResolvedValue({
      ...demandPost,
      viewer: { liked: false, canWithdraw: false, canClaim: true, canViewClaims: false },
      demand: { ...demandPost.demand!, matchMode: "selective" }
    });
    await renderDetail();
    await waitFor(() => expect(document.body.querySelector('[data-testid="formal-claim-panel"]')).not.toBeNull());

    expect(document.body.querySelector('[data-testid="formal-received-claims"]')).toBeNull();
  });

  it("keeps the bottom provider action as an explicit claim-panel locator", async () => {
    vi.mocked(getExchangePost).mockResolvedValue({
      ...demandPost,
      viewer: { liked: false, canWithdraw: false, canClaim: true, canViewClaims: false },
      demand: { ...demandPost.demand!, matchMode: "selective" }
    });
    await renderDetail("/technician/needo/posts/41", "technician");
    await waitFor(() => expect(document.body.querySelector('[data-testid="exchange-claim-panel"]')).not.toBeNull());

    const locator = document.body.querySelector<HTMLButtonElement>('[data-action="claim-panel-locator"]')!;
    expect(locator.disabled).toBe(false);
    expect(locator.textContent).toBe("查看抢单选项");
    expect(locator.getAttribute("aria-controls")).toBe("exchange-claim-panel");
    await act(async () => locator.click());
    expect(claimPanelMock.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("uses the themed translucent bottom mask without a solid action bar", async () => {
    vi.mocked(getExchangePost).mockResolvedValue(demandPost);
    await renderDetail();
    await waitFor(() => expect(document.body.querySelector(".client-edge-mask--bottom")).not.toBeNull());

    const footer = document.body.querySelector("footer:has([data-action='matching-inbox'])");
    expect(footer?.className).toContain("pointer-events-none");
    expect(footer?.className).not.toContain("bg-[color:");
  });

  it("does not show a translation action in demand or intelligence headers", async () => {
    vi.mocked(getExchangePost).mockResolvedValue(demandPost);
    await renderDetail();
    await waitFor(() => expect(document.body.textContent).toContain(demandPost.title));
    expect(document.body.querySelector('[data-action="detail-translate"]')).toBeNull();
  });

  it.each([
    ["zh", "不能参与自己发布的需求"],
    ["zh-Hant", "不能參與自己發布的需求"],
    ["ja", "自分が投稿した依頼には応募できません"],
    ["en", "You can't participate in your own request"],
    ["ko", "직접 게시한 요청에는 참여할 수 없습니다"]
  ] as const)("labels a live self-published Request accurately in %s", async (language, expected) => {
    mockI18n.language = language;
    vi.mocked(getExchangePost).mockResolvedValue({
      ...demandPost,
      viewer: {
        liked: false,
        canWithdraw: false,
        canClaim: false,
        canViewClaims: false,
        canViewMatching: false,
        claimUnavailableReason: "self_published"
      }
    } as ExchangePost);

    await renderDetail("/technician/needo/posts/41", "technician");
    await waitFor(() => expect(document.body.textContent).toContain(expected));

    const action = document.body.querySelector<HTMLButtonElement>('[data-action="matching-inbox"]');
    expect(action?.disabled).toBe(true);
    expect(action?.textContent).toBe(expected);
    expect(action?.textContent).not.toBe("匹配已关闭");
  });

  it("composes the formal matching inbox only from the owner capability flag", async () => {
    vi.mocked(getExchangePost).mockResolvedValue({
      ...demandPost,
      viewer: { liked: false, canWithdraw: true, canClaim: false, canViewClaims: true },
      demand: { ...demandPost.demand!, matchMode: "selective" }
    });
    await renderDetail();
    await waitFor(() => expect(document.body.querySelector('[data-testid="formal-received-claims"]')).not.toBeNull());

    expect(document.body.querySelector('[data-testid="formal-claim-panel"]')).toBeNull();
    expect(document.body.querySelector<HTMLButtonElement>('[data-action="matching-inbox"]')?.disabled).toBe(false);
    expect(document.body.textContent).toContain("选择服务者完成匹配");
  });

  it("labels the owner Quick inbox without suggesting manual provider selection", async () => {
    vi.mocked(getExchangePost).mockResolvedValue({
      ...demandPost,
      viewer: { liked: false, canWithdraw: true, canClaim: false, canViewClaims: true },
      demand: { ...demandPost.demand!, matchMode: "quick" }
    });
    await renderDetail();
    await waitFor(() =>
      expect(document.body.querySelector('[data-testid="formal-received-claims"]')).not.toBeNull()
    );

    const inboxButton = document.body.querySelector<HTMLButtonElement>(
      '[data-action="matching-inbox"]'
    );
    expect(inboxButton?.textContent).toBe("查看速配状态");
    expect(document.body.textContent).not.toContain("选择服务者完成匹配");
  });

  it("keeps the formal claim composition free of local or fake workflow bridges", () => {
    expect(appSource).not.toContain("/needo/posts/:postId/customer");
    expect(appSource).not.toContain("NeedoPostCustomerRoutePage");
    expect(routeSource).not.toMatch(/getDemandDetail|formalRuntimeFallbacks|localStorage/u);
    expect(detailSource).toContain("ExchangeClaimPanel");
    expect(detailSource).toContain("ExchangeReceivedClaims");
    expect(detailSource).not.toMatch(/localStorage|fakeBooking|fakePayment/u);
  });

  it("renders only the provider-scoped booking panel for a matched participant", async () => {
    vi.mocked(getExchangePost).mockResolvedValue({
      ...demandPost,
      status: "matched",
      viewer: { liked: false, canWithdraw: false, canClaim: false, canViewClaims: false, canViewMatching: true }
    });
    await renderDetail("/technician/needo/posts/41", "technician");
    await waitFor(() => expect(document.body.querySelector('[data-testid="formal-matched-booking"]')).not.toBeNull());

    expect(document.body.querySelector('[data-testid="formal-received-claims"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="formal-claim-panel"]')).toBeNull();
  });

  it("does not expose a matching or booking panel to an unselected viewer", async () => {
    vi.mocked(getExchangePost).mockResolvedValue({
      ...demandPost,
      status: "matched",
      viewer: { liked: false, canWithdraw: false, canClaim: false, canViewClaims: false, canViewMatching: false }
    });
    await renderDetail();
    await waitFor(() => expect(document.body.textContent).toContain("正式详情标题"));

    expect(document.body.querySelector('[data-testid="formal-received-claims"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="formal-matched-booking"]')).toBeNull();
  });
});
