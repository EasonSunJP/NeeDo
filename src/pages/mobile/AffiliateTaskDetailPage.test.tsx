// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AffiliateClaim,
  AffiliateMarketplaceTask
} from "../../api/affiliateMarketplace";
import { AffiliateTaskDetailPage } from "./AffiliateTaskDetailPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const apiMocks = vi.hoisted(() => ({ claimTask: vi.fn(), getTask: vi.fn() }));
const localeState = vi.hoisted(() => ({ language: "zh" }));

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
  useI18n: () => ({ language: localeState.language })
}));

vi.mock("../../theme/ClientThemeProvider", () => ({
  getClientThemeClassName: () => "",
  useClientTheme: () => ({ isNight: true, theme: "dark-green" })
}));

const task: AffiliateMarketplaceTask = {
  id: 22,
  taskCode: "AFF-PUBLIC-22",
  translations: {
    "zh-CN": { name: "涩谷芳香护理推广", description: "请按预约时间到店，完成服务后分享真实体验。" },
    "zh-TW": { name: "澀谷芳香護理推廣", description: "請按預約時間到店，完成服務後分享真實體驗。" },
    en: { name: "Shibuya aroma campaign", description: "Visit at the booked time and share your experience." },
    ja: { name: "渋谷アロマ体験キャンペーン", description: "予約時間に来店し、施術後の実体験を紹介してください。" },
    ko: { name: "시부야 아로마 체험", description: "예약 시간에 방문해 서비스 후 실제 경험을 공유해 주세요." }
  },
  name: "涩谷芳香护理推广",
  description: "请按预约时间到店，完成服务后分享真实体验。",
  coverMediaAssetId: 91,
  coverImageUrl: "https://cdn.needo.test/task-cover.jpg",
  rewardNdpPerCompletedOrder: 10_000,
  totalBudgetNdp: 2_000_000,
  remainingBudgetNdp: 700_000,
  remainingBudgetBps: 3_500,
  customerDiscountType: "fixed_jpy",
  fixedDiscountJpy: 500,
  discountRateBps: 0,
  discountCapJpy: 0,
  minimumOrderAmountJpy: 5_000,
  claimStartsAt: "2026-09-01T00:00:00.000Z",
  claimEndsAt: "2026-09-20T00:00:00.000Z",
  taskStartsAt: "2026-09-10T00:00:00.000Z",
  taskEndsAt: "2026-09-30T00:00:00.000Z",
  attributionWindowDays: 30,
  maxCompletedOrdersPerClaim: 20,
  maxCompletedOrdersPerCustomer: 1,
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
      mediaAssets: [
        {
          url: "https://cdn.needo.test/shop-room.jpg",
          altText: "芳香护理房间",
          sortOrder: 0
        }
      ]
    }
  ],
  services: [
    {
      id: 2,
      shopId: 11,
      serviceId: 101,
      serviceNameSnapshot: "Aroma 60",
      servicePriceJpySnapshot: 8_000
    }
  ],
  createdAt: "2026-08-28T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z"
};

const claim: AffiliateClaim = {
  id: 5,
  taskId: 22,
  publicCode: "NDO-7K4M9X2P8Q",
  promotionUrl: "https://app.needo.test/afirieito/r/token",
  status: "active",
  claimedAt: "2026-09-05T00:00:00.000Z",
  expiresAt: task.taskEndsAt,
  clickCount: 0,
  codeUseCount: 0,
  attributedOrderCount: 0,
  completedOrderCount: 0,
  settledRewardNdp: 0,
  task
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

async function renderPage(taskId = "22") {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/afirieito/tasks/${taskId}`]}>
        <Routes>
          <Route path="/afirieito/tasks/:taskId" element={<AffiliateTaskDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
  });
}

describe("AffiliateTaskDetailPage", () => {
  beforeEach(() => {
    localeState.language = "zh";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    apiMocks.getTask.mockResolvedValue(task);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders the formal task terms, gallery, store and consultation navigation", async () => {
    await renderPage();
    await waitFor(() => expect(container.textContent).toContain("涩谷芳香护理推广"));

    expect(container.textContent).toContain("任务详细");
    expect(container.textContent).toContain("本次总预算");
    expect(container.textContent).toContain("2,000,000 NDP");
    expect(container.textContent).toContain("目前剩余预算 35%");
    expect(container.textContent).toContain("开始日期时间");
    expect(container.textContent).toContain("截止日期时间");
    expect(container.textContent).toContain("注意事项");
    expect(container.textContent).toContain("用户获得单价");
    expect(container.textContent).toContain("10,000 NDP");
    expect(container.querySelectorAll("button[data-gallery-image]")).toHaveLength(2);
    expect(container.querySelector('a[href="/stores/shop0000000011"]')).not.toBeNull();
    expect(
      Array.from(container.querySelectorAll("a")).some(
        (link) =>
          link.getAttribute("href") === "/messages/new?mode=friend&q=Shibuya+Relax"
      )
    ).toBe(true);
  });

  it("renders task title and instructions from the selected authored language", async () => {
    localeState.language = "ja";
    await renderPage();
    await waitFor(() =>
      expect(container.textContent).toContain("渋谷アロマ体験キャンペーン")
    );

    expect(container.textContent).toContain(
      "予約時間に来店し、施術後の実体験を紹介してください。"
    );
    expect(container.textContent).not.toContain(
      "请按预约时间到店，完成服务后分享真实体验。"
    );
  });

  it("changes the selected public gallery image", async () => {
    await renderPage();
    await waitFor(() => expect(container.querySelectorAll("button[data-gallery-image]")).toHaveLength(2));

    const thumbnails = container.querySelectorAll<HTMLButtonElement>("button[data-gallery-image]");
    await act(async () => thumbnails[1].click());
    expect(container.querySelector<HTMLImageElement>('img[data-testid="affiliate-task-hero"]')?.src).toBe(
      "https://cdn.needo.test/shop-room.jpg"
    );
  });

  it("submits once while pending and presents the persisted idempotent claim", async () => {
    let resolveClaim!: (value: AffiliateClaim) => void;
    apiMocks.claimTask.mockReturnValue(
      new Promise<AffiliateClaim>((resolve) => {
        resolveClaim = resolve;
      })
    );

    await renderPage();
    await waitFor(() => expect(container.textContent).toContain("立即参加"));
    const participate = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("立即参加")
    )!;

    await act(async () => {
      participate.click();
      participate.click();
    });
    expect(apiMocks.claimTask).toHaveBeenCalledTimes(1);
    expect(participate.disabled).toBe(true);

    await act(async () => resolveClaim(claim));
    await waitFor(() => expect(container.textContent).toContain("NDO-7K4M9X2P8Q"));
    expect(container.textContent).toContain("https://app.needo.test/afirieito/r/token");
  });

  it("rejects invalid route ids before requesting the API", async () => {
    await renderPage("not-an-id");
    expect(container.textContent).toContain("任务链接无效");
    expect(apiMocks.getTask).not.toHaveBeenCalled();
  });
});
