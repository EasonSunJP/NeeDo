import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import {
  createExchangeComment,
  getExchangePost,
  likeExchangePost,
  listExchangeComments,
  listExchangePosts,
  publishExchangePost,
  recordExchangeShare,
  unlikeExchangePost,
  withdrawExchangePost
} from "./api";
import type { ExchangePost } from "./types";

vi.mock("../../api/httpClient", () => ({ httpClient: { request: vi.fn() } }));

const formalPost = {
  id: 41,
  type: "demand",
  status: "published",
  title: "東京駅近くで通訳をお願いします",
  detail: "8月31日の午後、日本語と中国語の通訳を探しています。",
  contentLocale: "zh-CN",
  areaLabel: "東京都千代田区",
  serviceStartAt: "2026-08-31T04:00:00.000Z",
  serviceEndAt: "2026-08-31T06:00:00.000Z",
  expiresAt: "2026-08-31T06:00:00.000Z",
  publishedAt: "2026-08-30T04:00:00.000Z",
  publisher: {
    publicId: "u0000000041",
    identityType: "customer",
    displayName: "测试用户 41",
    avatarUrl: null
  },
  counts: { comments: 4, likes: 21, shares: 6 },
  viewer: { liked: false, canWithdraw: true },
  demand: { budgetMinJpy: 8000, budgetMaxJpy: 12000 },
  intelligence: null
} satisfies ExchangePost;

describe("formal Exchange API client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(httpClient.request).mockResolvedValue(formalPost);
  });

  it("matches the public post contract without internal actor identifiers", () => {
    expect(formalPost.publisher.publicId).toBe("u0000000041");
    expect(Object.keys(formalPost.publisher).sort()).toEqual([
      "avatarUrl",
      "displayName",
      "identityType",
      "publicId"
    ]);

    const typeSource = readFileSync(new URL("./types.ts", import.meta.url), "utf8");
    expect(typeSource).not.toMatch(/authorUserId|authorIdentityId|actorUserId|actorIdentityId/u);
  });

  it("loads posts and comments from the exact authenticated paginated routes", async () => {
    const signal = new AbortController().signal;

    await listExchangePosts({ type: "demand", page: 2, pageSize: 10, signal });
    await getExchangePost("41", signal);
    await listExchangeComments("41", { page: 3, pageSize: 5, signal });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/exchange/posts", {
      query: { type: "demand", page: 2, page_size: 10 },
      signal
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/exchange/posts/41", { signal });
    expect(httpClient.request).toHaveBeenNthCalledWith(3, "/exchange/posts/41/comments", {
      query: { page: 3, page_size: 5 },
      signal
    });
  });

  it("publishes each subtype without client-controlled actor fields", async () => {
    await publishExchangePost({
      type: "demand",
      title: formalPost.title,
      detail: formalPost.detail,
      contentLocale: "zh-CN",
      areaLabel: formalPost.areaLabel,
      serviceStartAt: formalPost.serviceStartAt,
      serviceEndAt: formalPost.serviceEndAt,
      expiresAt: formalPost.expiresAt,
      budgetMinJpy: 8000,
      budgetMaxJpy: 12000
    }, "exchange-publish-0001");

    expect(httpClient.request).toHaveBeenCalledWith("/exchange/posts", {
      body: expect.not.objectContaining({ authorUserId: expect.anything(), authorIdentityId: expect.anything() }),
      headers: { "Idempotency-Key": "exchange-publish-0001" },
      method: "POST"
    });
  });

  it("uses idempotency headers for every formal mutation route", async () => {
    await withdrawExchangePost("41", "exchange-withdraw-01");
    await createExchangeComment("41", "内容很清楚。", "exchange-comment-001");
    await likeExchangePost("41", "exchange-like-00001");
    await unlikeExchangePost("41", "exchange-unlike-001");
    await recordExchangeShare("41", "exchange-share-0001");

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/exchange/posts/41/withdraw", {
      headers: { "Idempotency-Key": "exchange-withdraw-01" },
      method: "POST"
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/exchange/posts/41/comments", {
      body: { content: "内容很清楚。" },
      headers: { "Idempotency-Key": "exchange-comment-001" },
      method: "POST"
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(3, "/exchange/posts/41/like", {
      headers: { "Idempotency-Key": "exchange-like-00001" },
      method: "PUT"
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(4, "/exchange/posts/41/like", {
      headers: { "Idempotency-Key": "exchange-unlike-001" },
      method: "DELETE"
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(5, "/exchange/posts/41/shares", {
      headers: { "Idempotency-Key": "exchange-share-0001" },
      method: "POST"
    });
  });
});
