// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getExchangePost, withdrawExchangePost } from "./api";
import { ExchangePostDetailPage } from "./ExchangePostDetailPage";
import type { ExchangePost } from "./types";
import appSource from "../../App.tsx?raw";
import routeSource from "../../pages/mobile/NeedoRoutePages.tsx?raw";

vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));
vi.mock("./api", () => ({ getExchangePost: vi.fn(), withdrawExchangePost: vi.fn() }));
vi.mock("./ExchangeInteractions", () => ({
  ExchangeInteractions: ({ post }: { post: ExchangePost }) => <div data-testid="formal-interactions">{post.counts.comments}</div>
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
  viewer: { liked: false, canWithdraw: true },
  demand: { budgetMinJpy: 8000, budgetMaxJpy: 12000 },
  intelligence: null
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
    vi.mocked(getExchangePost).mockReset();
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
    await waitFor(() => expect(container.textContent).toContain("正式详情标题"));

    expect(getExchangePost).toHaveBeenCalledWith("41", expect.any(AbortSignal));
    expect(container.textContent).toContain("测试客户 41");
    expect(container.textContent).toContain("u0000000041");
    expect(container.textContent).toContain("¥8,000–¥12,000");
    expect(container.querySelector('[data-testid="formal-interactions"]')).not.toBeNull();
    expect(container.innerHTML).toContain('data-no-i18n="true"');
  });

  it("distinguishes an invalid route, missing post, and expired status", async () => {
    await renderDetail("/needo/posts/not-a-number");
    expect(container.textContent).toContain("链接无效");
    expect(getExchangePost).not.toHaveBeenCalled();

    vi.mocked(getExchangePost).mockRejectedValueOnce(new Error("error.exchange.post_not_found"));
    await renderDetail();
    await waitFor(() => expect(container.textContent).toContain("内容不存在或不可查看"));

    vi.mocked(getExchangePost).mockResolvedValueOnce({ ...demandPost, status: "expired" });
    await renderDetail();
    await waitFor(() => expect(container.textContent).toContain("这条内容已过期"));
  });

  it("requires confirmation and renders the server-authoritative withdrawn state", async () => {
    vi.mocked(getExchangePost).mockResolvedValue(demandPost);
    vi.mocked(withdrawExchangePost).mockResolvedValue({ ...demandPost, status: "withdrawn", viewer: { liked: false, canWithdraw: false } });
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirm);
    vi.stubGlobal("crypto", { randomUUID: () => "123e4567-e89b-42d3-a456-426614174000" });

    await renderDetail();
    await waitFor(() => expect(container.textContent).toContain("撤回"));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="withdraw"]')?.click());
    expect(withdrawExchangePost).not.toHaveBeenCalled();

    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="withdraw"]')?.click());
    await waitFor(() => expect(container.textContent).toContain("这条内容已撤回"));
    expect(withdrawExchangePost).toHaveBeenCalledWith("41", "123e4567-e89b-42d3-a456-426614174000");
    expect(container.querySelector('[data-action="withdraw"]')).toBeNull();
  });

  it("removes the obsolete customer-detail route and local profile bridge", () => {
    expect(appSource).not.toContain("/needo/posts/:postId/customer");
    expect(appSource).not.toContain("NeedoPostCustomerRoutePage");
    expect(routeSource).not.toMatch(/getDemandDetail|formalRuntimeFallbacks|localStorage|抢单|预约|支付/u);
  });
});
