import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import {
  createExchangeClaim,
  createExchangeComment,
  getMyExchangeClaim,
  getExchangePost,
  getRequestPublicationContext,
  likeExchangePost,
  listExchangeClaimOptions,
  listExchangeComments,
  listExchangePosts,
  listReceivedExchangeClaims,
  publishExchangePost,
  recordExchangeShare,
  unlikeExchangePost,
  withdrawExchangeClaim,
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
  viewer: { liked: false, canWithdraw: true, canClaim: false, canViewClaims: true },
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
      line1: "東京都千代田区",
      line2: null,
      line3: null,
      line2GenerallyVisible: false,
      line3GenerallyVisible: false,
      disclosure: "owner"
    }
  },
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

  it("loads Request publication authority from the dedicated authenticated route", async () => {
    const context = {
      canPublish: true,
      capacitySource: "customer_membership" as const,
      membershipLevel: "gold" as const,
      maxTargetProviderCount: 3,
      publicationFee: { amountNdp: 1000, currency: "TEST_NDP" as const, ruleSetVersion: 1 }
    };
    vi.mocked(httpClient.request).mockResolvedValueOnce(context);

    await expect(getRequestPublicationContext()).resolves.toEqual(context);
    expect(httpClient.request).toHaveBeenCalledWith("/exchange/request-publication-context");
  });

  it("publishes each subtype without client-controlled actor fields", async () => {
    await publishExchangePost({
      type: "demand",
      title: formalPost.title,
      detail: formalPost.detail,
      contentLocale: "zh-CN",
      serviceStartAt: formalPost.serviceStartAt,
      serviceEndAt: formalPost.serviceEndAt,
      expiresAt: formalPost.expiresAt,
      targetProviderCount: 1,
      matchMode: "quick",
      budgetMode: "total",
      budgetMinJpy: 8000,
      budgetMaxJpy: 12000,
      addressLine1: formalPost.areaLabel,
      addressLine2: null,
      addressLine3: null,
      addressLine2Public: false,
      addressLine3Public: false,
      publisherIdentityPublic: false
    }, "exchange-publish-0001");

    expect(httpClient.request).toHaveBeenCalledWith("/exchange/posts", {
      body: {
        type: "demand",
        title: formalPost.title,
        detail: formalPost.detail,
        contentLocale: "zh-CN",
        serviceStartAt: formalPost.serviceStartAt,
        serviceEndAt: formalPost.serviceEndAt,
        expiresAt: formalPost.expiresAt,
        targetProviderCount: 1,
        matchMode: "quick",
        budgetMode: "total",
        budgetMinJpy: 8000,
        budgetMaxJpy: 12000,
        addressLine1: formalPost.areaLabel,
        addressLine2: null,
        addressLine3: null,
        addressLine2Public: false,
        addressLine3Public: false,
        publisherIdentityPublic: false
      },
      headers: { "Idempotency-Key": "exchange-publish-0001" },
      method: "POST"
    });
    expect(vi.mocked(httpClient.request).mock.calls[0]?.[1]?.body).not.toEqual(
      expect.objectContaining({
        areaLabel: expect.anything(),
        authorUserId: expect.anything(),
        authorIdentityId: expect.anything()
      })
    );
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

  it("uses the five formal selective claim routes with paginated query names", async () => {
    const signal = new AbortController().signal;

    await listExchangeClaimOptions("41", {
      page: 2,
      pageSize: 10,
      shopId: 7,
      technicianProfileId: 12,
      serviceRef: "technician:31",
      signal
    });
    await createExchangeClaim(
      "41",
      { scheduleSlotId: 91, quoteAmountJpy: 15_000, message: null },
      "exchange-claim-create-0001"
    );
    await listReceivedExchangeClaims("41", { page: 3, pageSize: 5, signal });
    await getMyExchangeClaim("41", signal);
    await withdrawExchangeClaim("73");

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/exchange/posts/41/claim-options", {
      query: {
        page: 2,
        page_size: 10,
        shop_id: 7,
        technician_profile_id: 12,
        service_ref: "technician:31"
      },
      signal
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/exchange/posts/41/claims", {
      body: { scheduleSlotId: 91, quoteAmountJpy: 15_000, message: null },
      headers: { "Idempotency-Key": "exchange-claim-create-0001" },
      method: "POST"
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(3, "/exchange/posts/41/claims", {
      query: { page: 3, page_size: 5 },
      signal
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(4, "/exchange/posts/41/claims/mine", {
      signal
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(5, "/exchange/claims/73/withdraw", {
      method: "POST"
    });
  });
});
