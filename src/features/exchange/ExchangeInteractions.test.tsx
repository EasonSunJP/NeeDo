// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shareContent } from "../../lib/share";
import {
  createExchangeComment,
  likeExchangePost,
  listExchangeComments,
  recordExchangeShare,
  unlikeExchangePost
} from "./api";
import { ExchangeInteractions } from "./ExchangeInteractions";
import type { ExchangeComment, ExchangeInteractionCounts, ExchangePost, ExchangeViewerState } from "./types";

vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));
vi.mock("../../lib/share", () => ({ shareContent: vi.fn() }));
vi.mock("./api", () => ({
  createExchangeComment: vi.fn(),
  likeExchangePost: vi.fn(),
  listExchangeComments: vi.fn(),
  recordExchangeShare: vi.fn(),
  unlikeExchangePost: vi.fn()
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const post: ExchangePost = {
  id: 41,
  type: "demand",
  status: "published",
  title: "正式需求",
  detail: "持久化正文",
  contentLocale: "zh-CN",
  areaLabel: "东京",
  serviceStartAt: "2026-08-31T04:00:00.000Z",
  serviceEndAt: "2026-08-31T05:00:00.000Z",
  expiresAt: "2026-08-31T05:00:00.000Z",
  publishedAt: "2026-08-30T04:00:00.000Z",
  publisher: { publicId: "u0000000041", identityType: "customer", displayName: "客户 41", avatarUrl: null },
  counts: { comments: 3, likes: 10, shares: 2 },
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
    budgetMinJpy: 5000,
    budgetMaxJpy: 8000,
    address: { line1: "东京", line2: null, line3: null, line2GenerallyVisible: false, line3GenerallyVisible: false, disclosure: "owner" }
  },
  intelligence: null
};

const comments: ExchangeComment[] = [1, 2, 3].map((id) => ({
  id,
  postId: 41,
  author: { publicId: `u000000000${id}`, identityType: "customer", displayName: `评论者 ${id}`, avatarUrl: null },
  content: `正式评论 ${id}`,
  createdAt: `2026-08-30T0${id}:00:00.000Z`
}));

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

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
}

let container: HTMLDivElement;
let root: Root;
let onCountsChange = vi.fn((_counts: ExchangeInteractionCounts, _viewer: Pick<ExchangeViewerState, "liked">) => undefined);

async function renderInteractions(currentPost = post) {
  await act(async () => root.render(<MemoryRouter><ExchangeInteractions onCountsChange={onCountsChange} post={currentPost} /></MemoryRouter>));
  await waitFor(() => expect(container.textContent).toContain("正式评论 1"));
}

describe("ExchangeInteractions", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    onCountsChange = vi.fn((_counts: ExchangeInteractionCounts, _viewer: Pick<ExchangeViewerState, "liked">) => undefined);
    vi.clearAllMocks();
    vi.mocked(listExchangeComments).mockResolvedValue({ list: comments, total: 3, page: 1, page_size: 20 });
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("123e4567-e89b-42d3-a456-426614174000") });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("loads 3–10 persisted comments independently and renders public actors", async () => {
    await renderInteractions();
    expect(listExchangeComments).toHaveBeenCalledWith("41", expect.objectContaining({ page: 1, pageSize: 20 }));
    expect(container.textContent).toContain("评论者 1");
    expect(container.textContent).toContain("u0000000001");
    expect(container.textContent).toContain("正式评论 3");
  });

  it("opens the exact technician author's activity identity without linking archived authors", async () => {
    vi.mocked(listExchangeComments).mockResolvedValue({
      list: [
        { ...comments[0], author: { publicId: "s0000000001", identityType: "technician", displayName: "Eason", avatarUrl: "https://example.test/technician.jpg" }, authorProfilePath: "/moments/users/9?identityId=19" },
        { ...comments[1], authorProfilePath: null }
      ], total: 2, page: 1, page_size: 20
    });
    await act(async () => root.render(<MemoryRouter><ExchangeInteractions context="technician" onCountsChange={onCountsChange} post={post} /></MemoryRouter>));
    await waitFor(() => expect(container.textContent).toContain("Eason"));
    expect(container.querySelector('a[href="/technician/moments/users/9?identityId=19"] img')?.getAttribute("src")).toBe("https://example.test/technician.jpg");
    expect(container.querySelectorAll("article a")).toHaveLength(1);
  });

  it("reuses the same idempotency key when a failed comment is retried", async () => {
    const created = { ...comments[0], id: 9, content: "新评论" };
    vi.mocked(createExchangeComment).mockRejectedValueOnce(new Error("error.network")).mockResolvedValueOnce(created);
    await renderInteractions();
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea[name="comment"]');
    if (!textarea) throw new Error("missing comment textarea");
    setTextareaValue(textarea, "新评论");

    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="comment"]')?.click());
    await waitFor(() => expect(container.textContent).toContain("评论发送失败"));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="comment"]')?.click());
    await waitFor(() => expect(container.textContent).toContain("新评论"));

    expect(createExchangeComment).toHaveBeenNthCalledWith(1, "41", "新评论", "123e4567-e89b-42d3-a456-426614174000");
    expect(createExchangeComment).toHaveBeenNthCalledWith(2, "41", "新评论", "123e4567-e89b-42d3-a456-426614174000");
    expect(onCountsChange).toHaveBeenCalledWith({ comments: 4, likes: 10, shares: 2 }, { liked: false });
  });

  it("shows the returned comment first and reloads its persisted identity projection", async () => {
    const created: ExchangeComment = {
      ...comments[0],
      id: 9,
      author: { publicId: "s2433935375", identityType: "technician", displayName: "担当技師", avatarUrl: "https://example.test/technician.jpg" },
      authorProfilePath: "/moments/users/9?identityId=19",
      content: "新しい正式コメント"
    };
    vi.mocked(createExchangeComment).mockResolvedValue(created);
    await renderInteractions();
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea[name="comment"]');
    if (!textarea) throw new Error("missing comment textarea");
    await act(async () => setTextareaValue(textarea, created.content));

    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="comment"]')?.click());
    expect(container.querySelectorAll("article")[0]?.textContent).toContain(created.content);
    expect(onCountsChange).toHaveBeenCalledWith({ comments: 4, likes: 10, shares: 2 }, { liked: false });

    vi.mocked(listExchangeComments).mockResolvedValue({ list: [created, ...comments], total: 4, page: 1, page_size: 20 });
    await renderInteractions({ ...post, id: 42, counts: { ...post.counts, comments: 4 } });
    await renderInteractions(post);
    expect(container.querySelectorAll("article")[0]?.textContent).toContain("s2433935375");
    expect(container.querySelector('a[href="/moments/users/9?identityId=19"] img')?.getAttribute("src")).toBe("https://example.test/technician.jpg");
  });

  it("uses server counts for like and unlike", async () => {
    vi.mocked(likeExchangePost).mockResolvedValue({ comments: 3, likes: 11, shares: 2 });
    vi.mocked(unlikeExchangePost).mockResolvedValue({ comments: 3, likes: 10, shares: 2 });
    await renderInteractions();

    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="like"]')?.click());
    await waitFor(() => expect(onCountsChange).toHaveBeenCalledWith({ comments: 3, likes: 11, shares: 2 }, { liked: true }));
    await renderInteractions({ ...post, counts: { comments: 3, likes: 11, shares: 2 }, viewer: { ...post.viewer, liked: true } });
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="like"]')?.click());
    await waitFor(() => expect(onCountsChange).toHaveBeenCalledWith({ comments: 3, likes: 10, shares: 2 }, { liked: false }));
  });

  it("records a share only after native share or copy succeeds", async () => {
    vi.mocked(recordExchangeShare).mockResolvedValue({ comments: 3, likes: 10, shares: 3 });
    vi.mocked(shareContent)
      .mockResolvedValueOnce({ status: "cancelled", url: "https://needo.test/needo/posts/41" })
      .mockResolvedValueOnce({ status: "manual-copy", url: "https://needo.test/needo/posts/41" })
      .mockResolvedValueOnce({ status: "copied", url: "https://needo.test/needo/posts/41" });
    await renderInteractions();

    const shareButton = () => container.querySelector<HTMLButtonElement>('[data-action="share"]');
    await act(async () => shareButton()?.click());
    await act(async () => shareButton()?.click());
    expect(recordExchangeShare).not.toHaveBeenCalled();
    await act(async () => shareButton()?.click());
    await waitFor(() => expect(recordExchangeShare).toHaveBeenCalledTimes(1));
    expect(onCountsChange).toHaveBeenCalledWith({ comments: 3, likes: 10, shares: 3 }, { liked: false });
  });

  it("keeps withdrawn and expired comments read-only", async () => {
    await renderInteractions({ ...post, status: "withdrawn" });
    expect(container.querySelector('[data-action="comment"]')).toBeNull();
    expect(container.querySelector('[data-action="like"]')).toBeNull();
    expect(container.querySelector('[data-action="share"]')).toBeNull();
    expect(container.textContent).toContain("互动已关闭，历史评论仍可查看");
  });

  it("supports the approved detail-card layout without duplicating header actions", async () => {
    await act(async () => root.render(
      <MemoryRouter><ExchangeInteractions onCountsChange={onCountsChange} post={post} showActionBar={false} variant="detail" /></MemoryRouter>
    ));
    await waitFor(() => expect(container.textContent).toContain("正式评论 1"));

    expect(container.querySelector('[data-action="like"]')).toBeNull();
    expect(container.querySelector('[data-action="share"]')).toBeNull();
    expect(container.querySelector('[data-testid="exchange-comments-card"]')?.className).toContain("rounded-[28px]");
  });
});
