// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AffiliateMarketplaceTask } from "../../api/affiliateMarketplace";
import { AffiliateMarketplacePage } from "./AffiliateMarketplacePage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const apiMocks = vi.hoisted(() => ({ listTasks: vi.fn() }));

vi.mock("../../api/affiliateMarketplace", async () => {
  const actual = await vi.importActual<typeof import("../../api/affiliateMarketplace")>(
    "../../api/affiliateMarketplace"
  );
  return { ...actual, affiliateMarketplaceApi: apiMocks };
});

vi.mock("../../features/realtime/useRealtimeUnreadCounts", () => ({
  useRealtimeUnreadCounts: () => ({ conversations: 0, friendRequests: 0, notifications: 0 })
}));

vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({ language: "zh" })
}));

vi.mock("../../theme/ClientThemeProvider", () => ({
  getClientThemeClassName: () => "",
  useClientTheme: () => ({ isNight: true, theme: "dark-green" })
}));

const formalTask: AffiliateMarketplaceTask = {
  id: 22,
  taskCode: "AFF-PUBLIC-22",
  translations: {
    "zh-CN": { name: "涩谷芳香护理推广", description: "到店体验芳香护理并分享真实体验。" },
    "zh-TW": { name: "澀谷芳香護理推廣", description: "到店體驗芳香護理並分享真實體驗。" },
    en: { name: "Shibuya aroma campaign", description: "Share your real aroma treatment experience." },
    ja: { name: "渋谷アロマ体験キャンペーン", description: "アロマ施術の実体験を紹介してください。" },
    ko: { name: "시부야 아로마 체험", description: "아로마 시술의 실제 경험을 공유해 주세요." }
  },
  name: "涩谷芳香护理推广",
  description: "到店体验芳香护理并分享真实体验。",
  coverMediaAssetId: null,
  coverImageUrl: null,
  rewardNdpPerCompletedOrder: 1_000,
  totalBudgetNdp: 2_000_000,
  remainingBudgetNdp: 1_000_000,
  remainingBudgetBps: 5_000,
  customerDiscountType: "none",
  fixedDiscountJpy: 0,
  discountRateBps: 0,
  discountCapJpy: 0,
  minimumOrderAmountJpy: 0,
  claimStartsAt: "2026-09-01T00:00:00.000Z",
  claimEndsAt: "2026-09-20T00:00:00.000Z",
  taskStartsAt: "2026-09-10T00:00:00.000Z",
  taskEndsAt: "2026-09-30T00:00:00.000Z",
  attributionWindowDays: 30,
  maxCompletedOrdersPerClaim: 20,
  maxCompletedOrdersPerCustomer: null,
  status: "scheduled",
  claimable: true,
  shops: [
    {
      id: 1,
      shopId: 11,
      shopNameSnapshot: "Shibuya Relax",
      publicId: "shop0000000011",
      city: "Tokyo",
      address: "Shibuya 1-1",
      mediaAssets: []
    }
  ],
  services: [],
  createdAt: "2026-08-28T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z"
};

let container: HTMLDivElement;
let root: Root;

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

async function renderPage(initialEntry = "/afirieito/plan") {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <AffiliateMarketplacePage />
      </MemoryRouter>
    );
  });
}

async function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("AffiliateMarketplacePage", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("shows loading then renders the formal task page", async () => {
    let resolveRequest!: (value: unknown) => void;
    apiMocks.listTasks.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );

    await renderPage();
    expect(container.textContent).toContain("正在读取推荐任务");

    await act(async () => {
      resolveRequest({ list: [formalTask], total: 21, page: 1, page_size: 12 });
    });

    await waitFor(() => expect(container.textContent).toContain("涩谷芳香护理推广"));
    expect(container.textContent).toContain("共 21 个任务");
    expect(apiMocks.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 12, signal: expect.any(AbortSignal) })
    );
  });

  it("searches through the formal endpoint and advances server pagination", async () => {
    apiMocks.listTasks.mockResolvedValue({
      list: [formalTask],
      total: 21,
      page: 1,
      page_size: 12
    });

    await renderPage();
    await waitFor(() => expect(container.textContent).toContain("涩谷芳香护理推广"));

    const input = container.querySelector<HTMLInputElement>('input[name="affiliate-task-search"]')!;
    await setInput(input, "按摩");
    await act(async () => {
      input.closest("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await waitFor(() =>
      expect(apiMocks.listTasks).toHaveBeenLastCalledWith(
        expect.objectContaining({ keyword: "按摩", page: 1, pageSize: 12 })
      )
    );

    const next = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("下一页")
    )!;
    await act(async () => next.click());
    await waitFor(() =>
      expect(apiMocks.listTasks).toHaveBeenLastCalledWith(
        expect.objectContaining({ keyword: "按摩", page: 2, pageSize: 12 })
      )
    );
  });

  it("renders actionable empty and retryable error states", async () => {
    apiMocks.listTasks
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ list: [], total: 0, page: 1, page_size: 12 });

    await renderPage();
    await waitFor(() => expect(container.textContent).toContain("推荐任务读取失败"));

    const retry = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("重试")
    )!;
    await act(async () => retry.click());
    await waitFor(() => expect(container.textContent).toContain("暂无符合条件的任务"));
  });
});
