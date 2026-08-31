// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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
import routeSource from "../../pages/mobile/NeedoRoutePages.tsx?raw";
import detailSource from "./ExchangePostDetailPage.tsx?raw";

const mockI18n = vi.hoisted(() => ({ language: "zh" as "zh" | "zh-Hant" | "ja" | "en" | "ko" }));

vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: mockI18n.language }) }));
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
  ExchangeClaimPanel: ({ post }: { post: ExchangePost }) => <div data-post-id={post.id} data-testid="formal-claim-panel" />
}));
vi.mock("./ExchangeReceivedClaims", () => ({
  ExchangeReceivedClaims: ({ postId }: { postId: string }) => <div data-post-id={postId} data-testid="formal-received-claims" />
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

const intelligencePost: ExchangePost = {
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
    campaignPriceJpy: 9_800
  }
};

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

async function renderDetail(path = "/needo/posts/41") {
  await act(async () => root.render(
    <MemoryRouter initialEntries={[path]} key={`${path}-${renderVersion += 1}`}>
      <Routes>
        <Route path="/needo/posts/:postId" element={<ExchangePostDetailPage context="user" />} />
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

  it("renders a redacted publisher without reconstructing private identity", async () => {
    vi.mocked(getExchangePost).mockResolvedValue({ ...demandPost, publisher: null });
    await renderDetail();
    await waitFor(() => expect(document.body.textContent).toContain("正式详情标题"));

    expect(document.body.textContent).toContain("发布者已隐藏身份");
    expect(document.body.textContent).not.toContain("测试客户 41");
    expect(document.body.textContent).not.toContain("u0000000041");
  });

  it("renders only the Request address lines projected by the server", async () => {
    vi.mocked(getExchangePost).mockResolvedValue({
      ...demandPost,
      publisher: null,
      demand: {
        ...demandPost.demand!,
        budgetMinJpy: null,
        address: {
          line1: "東京都港区六本木 3-2-1",
          line2: "Prince Tower 12F",
          line3: null,
          line2GenerallyVisible: true,
          line3GenerallyVisible: false,
          disclosure: "general"
        }
      }
    });
    await renderDetail();
    await waitFor(() => expect(document.body.textContent).toContain("正式详情标题"));

    expect(document.body.textContent).toContain("東京都港区六本木 3-2-1");
    expect(document.body.textContent).toContain("Prince Tower 12F");
    expect(document.body.textContent).not.toContain("测试客户 41");
    expect(document.body.textContent).not.toContain("u0000000041");
    expect(document.body.textContent).toContain("¥12,000");
    expect(document.body.textContent).not.toContain("¥0–¥12,000");
  });

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
    expect(document.body.textContent).toContain("m0000000061");
    expect(document.body.textContent).toContain("¥9,800");
    expect(document.body.textContent).toContain("预约与支付后续开放");
    expect(document.body.querySelector('[data-testid="exchange-detail-hero"] img')?.getAttribute("src")).toBe(
      "/simulation/shops/ginza-calm-body-lab.png"
    );
    expect(document.body.querySelector('[data-testid="formal-interactions"]')?.getAttribute("data-show-action-bar")).toBe("false");
    expect(document.body.querySelector('[data-testid="formal-interactions"]')?.getAttribute("data-variant")).toBe("detail");
    expect(document.body.querySelector<HTMLButtonElement>('[data-action="booking-deferred"]')?.disabled).toBe(true);
    expect(document.body.querySelector('[data-action="detail-like"]')).not.toBeNull();
    expect(document.body.querySelector('[data-action="detail-share"]')).not.toBeNull();
  });

  it("localizes the detail type and publisher identity instead of exposing raw identity codes", async () => {
    mockI18n.language = "en";
    vi.mocked(getExchangePost).mockResolvedValue(intelligencePost);
    await renderDetail("/needo/posts/61");
    await waitFor(() => expect(document.body.textContent).toContain(intelligencePost.title));

    expect(document.body.textContent).toContain("Service post details");
    expect(document.body.textContent).toContain("Service posts");
    expect(document.body.textContent).toContain("Merchant");
    expect(document.body.textContent).not.toContain("merchant_owner");
    expect(document.body.textContent).not.toContain("情报");
  });

  it("distinguishes an invalid route, missing post, and expired status", async () => {
    await renderDetail("/needo/posts/not-a-number");
    expect(document.body.textContent).toContain("链接无效");
    expect(getExchangePost).not.toHaveBeenCalled();

    vi.mocked(getExchangePost).mockRejectedValueOnce(new Error("error.exchange.post_not_found"));
    await renderDetail();
    await waitFor(() => expect(document.body.textContent).toContain("内容不存在或不可查看"));

    vi.mocked(getExchangePost).mockResolvedValueOnce({ ...demandPost, status: "expired" });
    await renderDetail();
    await waitFor(() => expect(document.body.textContent).toContain("这条内容已过期"));
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

  it("composes the read-only received list only from the owner capability flag", async () => {
    vi.mocked(getExchangePost).mockResolvedValue({
      ...demandPost,
      viewer: { liked: false, canWithdraw: true, canClaim: false, canViewClaims: true },
      demand: { ...demandPost.demand!, matchMode: "selective" }
    });
    await renderDetail();
    await waitFor(() => expect(document.body.querySelector('[data-testid="formal-received-claims"]')).not.toBeNull());

    expect(document.body.querySelector('[data-testid="formal-claim-panel"]')).toBeNull();
    expect(document.body.querySelector<HTMLButtonElement>('[data-action="booking-deferred"]')?.disabled).toBe(true);
  });

  it("keeps the formal claim composition free of local or fake workflow bridges", () => {
    expect(appSource).not.toContain("/needo/posts/:postId/customer");
    expect(appSource).not.toContain("NeedoPostCustomerRoutePage");
    expect(routeSource).not.toMatch(/getDemandDetail|formalRuntimeFallbacks|localStorage/u);
    expect(detailSource).toContain("ExchangeClaimPanel");
    expect(detailSource).toContain("ExchangeReceivedClaims");
    expect(detailSource).not.toMatch(/localStorage|fakeBooking|fakePayment/u);
  });
});
