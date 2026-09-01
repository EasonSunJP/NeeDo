// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import { listExchangePosts } from "./api";
import type { ExchangePost, Paginated } from "./types";
import { useExchangeFeed } from "./useExchangeFeed";

vi.mock("./api", () => ({ listExchangePosts: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const demandPost: ExchangePost = {
  id: 41,
  type: "demand",
  status: "published",
  title: "正式需求",
  detail: "数据库中的需求正文",
  contentLocale: "zh-CN",
  areaLabel: "东京",
  serviceStartAt: "2026-08-31T04:00:00.000Z",
  serviceEndAt: "2026-08-31T05:00:00.000Z",
  expiresAt: "2026-08-31T05:00:00.000Z",
  publishedAt: "2026-08-30T04:00:00.000Z",
  publisher: { publicId: "u0000000041", identityType: "customer", displayName: "客户 41", avatarUrl: null },
  counts: { comments: 3, likes: 10, shares: 2 },
  viewer: { liked: false, canWithdraw: true },
  demand: {
    serviceMode: "store",
    targetProviderCount: 1,
    targetProviderLimitSnapshot: 1,
    publisherCapacitySource: "customer_membership",
    membershipLevelSnapshot: "standard",
    matchMode: "quick",
    budgetMode: "total",
    budgetMinJpy: 5000,
    budgetMaxJpy: 8000,
    address: { line1: "东京", line2: null, line3: null, line2GenerallyVisible: false, line3GenerallyVisible: false, disclosure: "owner" }
  },
  intelligence: null
};

const intelligencePost: ExchangePost = {
  ...demandPost,
  id: 81,
  type: "intelligence",
  title: "正式情报",
  publisher: { publicId: "t0000000081", identityType: "technician", displayName: "技师 81", avatarUrl: null },
  demand: null,
  intelligence: {
    serviceMode: "onsite",
    addressLabel: null,
    serviceAreas: ["新宿区", "渋谷区"],
    originalPriceJpy: 12000,
    campaignPriceJpy: 9000
  }
};

function page(list: ExchangePost[], current = 1, total = list.length): Paginated<ExchangePost> {
  return { list, total, page: current, page_size: 1 };
}

function FeedProbe({ initialType = "demand" }: { initialType?: "demand" | "intelligence" }) {
  const feed = useExchangeFeed(initialType, 1);
  return (
    <div>
      <span data-testid="type">{feed.activeType}</span>
      <span data-testid="loading">{String(feed.loading)}</span>
      <span data-testid="loading-more">{String(feed.loadingMore)}</span>
      <span data-testid="ids">{feed.posts.map((post) => post.id).join(",")}</span>
      <span data-testid="likes">{feed.posts.find((post) => post.id === 41)?.counts.likes ?? 0}</span>
      <span data-testid="liked">{String(feed.posts.find((post) => post.id === 41)?.viewer.liked ?? false)}</span>
      <span data-testid="error">{feed.error ? `${feed.error.kind}:${feed.error.message}` : "none"}</span>
      <button data-action="intelligence" onClick={() => feed.setActiveType("intelligence")} type="button">intelligence</button>
      <button data-action="more" onClick={feed.loadMore} type="button">more</button>
      <button data-action="refresh" onClick={feed.refresh} type="button">refresh</button>
      <button data-action="upsert" onClick={() => feed.upsertPost({ ...demandPost, id: 42 })} type="button">upsert</button>
      <button data-action="counts" onClick={() => feed.replaceCounts(41, { comments: 4, likes: 11, shares: 3 }, { liked: true })} type="button">counts</button>
      <button data-action="remove" onClick={() => feed.removePost(41)} type="button">remove</button>
    </div>
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

let container: HTMLDivElement;
let root: Root;

describe("useExchangeFeed", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("shows initial loading then only the formal first page", async () => {
    let resolveRequest: ((value: Paginated<ExchangePost>) => void) | undefined;
    vi.mocked(listExchangePosts).mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));

    await act(async () => root.render(<FeedProbe />));
    expect(container.querySelector('[data-testid="loading"]')?.textContent).toBe("true");
    expect(container.querySelector('[data-testid="ids"]')?.textContent).toBe("");

    await act(async () => resolveRequest?.(page([demandPost], 1, 2)));
    await waitFor(() => expect(container.querySelector('[data-testid="ids"]')?.textContent).toBe("41"));
    expect(container.querySelector('[data-testid="loading"]')?.textContent).toBe("false");
  });

  it("appends pagination and aborts obsolete tab requests", async () => {
    let firstSignal: AbortSignal | undefined;
    vi.mocked(listExchangePosts).mockImplementation((input) => {
      if (input.type === "demand" && input.page === 1) {
        firstSignal = input.signal;
        return Promise.resolve(page([demandPost], 1, 2));
      }
      if (input.type === "demand") {
        return Promise.resolve(page([{ ...demandPost, id: 42 }], 2, 2));
      }
      return Promise.resolve(page([intelligencePost], 1, 1));
    });

    await act(async () => root.render(<FeedProbe />));
    await waitFor(() => expect(container.querySelector('[data-testid="ids"]')?.textContent).toBe("41"));

    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="more"]')?.click());
    await waitFor(() => expect(container.querySelector('[data-testid="ids"]')?.textContent).toBe("41,42"));

    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="intelligence"]')?.click());
    await waitFor(() => expect(container.querySelector('[data-testid="ids"]')?.textContent).toBe("81"));
    expect(firstSignal?.aborted).toBe(true);
    expect(listExchangePosts).toHaveBeenLastCalledWith(expect.objectContaining({ type: "intelligence", page: 1, pageSize: 1 }));
  });

  it("refreshes from page one and never preserves stale success as a fallback", async () => {
    vi.mocked(listExchangePosts)
      .mockResolvedValueOnce(page([demandPost], 1, 1))
      .mockRejectedValueOnce(new ApiClientError("error.network", 503, 503));

    await act(async () => root.render(<FeedProbe />));
    await waitFor(() => expect(container.querySelector('[data-testid="ids"]')?.textContent).toBe("41"));

    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="refresh"]')?.click());
    await waitFor(() => expect(container.querySelector('[data-testid="error"]')?.textContent).toBe("unavailable:error.network"));
    expect(container.querySelector('[data-testid="ids"]')?.textContent).toBe("");
  });

  it.each([
    [new ApiClientError("error.auth.required", 401, 401), "unauthorized:error.auth.required"],
    [new ApiClientError("error.permission.denied", 403, 403), "forbidden:error.permission.denied"],
    [new TypeError("Failed to fetch"), "unavailable:Failed to fetch"]
  ])("classifies authenticated, permission, and backend failures", async (error, expected) => {
    vi.mocked(listExchangePosts).mockRejectedValue(error);
    await act(async () => root.render(<FeedProbe />));
    await waitFor(() => expect(container.querySelector('[data-testid="error"]')?.textContent).toBe(expected));
    expect(container.querySelector('[data-testid="ids"]')?.textContent).toBe("");
  });

  it("reconciles inserts, server counts, viewer state, and removals in one canonical map", async () => {
    vi.mocked(listExchangePosts).mockResolvedValue(page([demandPost], 1, 1));
    await act(async () => root.render(<FeedProbe />));
    await waitFor(() => expect(container.querySelector('[data-testid="ids"]')?.textContent).toBe("41"));

    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="upsert"]')?.click());
    expect(container.querySelector('[data-testid="ids"]')?.textContent).toBe("42,41");

    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="counts"]')?.click());
    expect(container.querySelector('[data-testid="likes"]')?.textContent).toBe("11");
    expect(container.querySelector('[data-testid="liked"]')?.textContent).toBe("true");

    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="remove"]')?.click());
    expect(container.querySelector('[data-testid="ids"]')?.textContent).toBe("42");
  });
});
