import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "./httpClient";
import { platformPartnersApi } from "./platformPartners";

vi.mock("./httpClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./httpClient")>()),
  httpClient: { request: vi.fn() },
}));

const partner = {
  publicId: "11111111-1111-4111-8111-111111111111",
  partnerType: "agent",
  startsAt: "2026-09-01T00:00:00.000Z",
  endsAt: null,
  permanent: true,
  markedAt: "2026-09-01T01:00:00.000Z",
  reason: "合同审核完成",
  user: {
    id: 88,
    needoId: "u0000000088",
    nickname: "山田代理",
    avatarUrl: null,
    status: "active",
  },
  administration: {
    referralCount: 1,
    referredShops: [
      { publicId: "shop0000000019", name: "LifeDance 涩谷", city: "东京都" },
    ],
    currentRule: null,
    latestSettlement: null,
  },
  internalId: 41,
};

const referral = {
  publicId: "22222222-2222-4222-8222-222222222222",
  agentPublicId: partner.publicId,
  status: "active",
  source: "运营人工确认",
  confirmedAt: "2026-09-01T02:00:00.000Z",
  successQualifiedAt: null,
  reason: "店铺签约资料已核对",
  createdAt: "2026-09-01T03:00:00.000Z",
  shop: { publicId: "shop0000000019", name: "LifeDance 涩谷", city: "东京都" },
};

const cost = {
  publicId: "33333333-3333-4333-8333-333333333333",
  costCode: "server-2026-09",
  version: 1,
  categoryCode: "server",
  name: "九月服务器",
  amountJpy: 1000,
  currency: "JPY",
  periodStart: "2026-09-01T00:00:00.000Z",
  periodEnd: "2026-09-30T00:00:00.000Z",
  allocationMode: "equal_active_shops",
  status: "draft",
  effectiveAt: "2026-09-02T00:00:00.000Z",
  publishedAt: null,
  configuredById: 91,
  reason: "月度账单",
  directAssignments: null,
  allocations: [],
  createdAt: "2026-09-02T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
};

describe("platformPartnersApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads formal agents and their referred shops without leaking internal fields", async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce({
        list: [partner],
        total: 1,
        page: 1,
        page_size: 20,
      })
      .mockResolvedValueOnce({
        list: [referral],
        total: 1,
        page: 1,
        page_size: 20,
      });

    const agents = await platformPartnersApi.listAgents({
      page: 1,
      pageSize: 20,
      keyword: "山田",
      status: "active",
    });
    const referrals = await platformPartnersApi.listShopReferrals(
      partner.publicId,
      { page: 1, pageSize: 20 },
    );

    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/backoffice/agents",
      {
        query: { page: 1, pageSize: 20, keyword: "山田", status: "active" },
      },
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      `/backoffice/agents/${partner.publicId}/shop-referrals`,
      {
        query: { page: 1, pageSize: 20 },
      },
    );
    expect(agents.list[0]?.user.needoId).toBe("u0000000088");
    expect(referrals.list[0]?.shop.publicId).toBe("shop0000000019");
    expect(JSON.stringify(agents)).not.toContain("internalId");
  });

  it("sends exact evidence-bearing partner, referral, and rule commands", async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce(partner)
      .mockResolvedValueOnce(referral)
      .mockResolvedValueOnce({
        publicId: "44444444-4444-4444-8444-444444444444",
        version: 1,
        fixedSuccessRewardJpy: 50000,
        profitShareRateBps: 1500,
        paymentMethod: "bank_transfer",
        paymentDetails: null,
        effectiveFrom: "2026-10-01T00:00:00.000Z",
        effectiveTo: null,
        publishedAt: "2026-09-02T00:00:00.000Z",
        publishedById: 91,
        reason: "2026 contract",
        createdAt: "2026-09-02T00:00:00.000Z",
      });

    await platformPartnersApi.markPartnerProfile(88, {
      partnerType: "agent",
      startsAt: partner.startsAt,
      endsAt: partner.endsAt,
      permanent: partner.permanent,
      reason: partner.reason,
    });
    await platformPartnersApi.linkShop(partner.publicId, {
      shopPublicId: referral.shop.publicId,
      source: referral.source,
      confirmedAt: referral.confirmedAt,
      reason: referral.reason,
    });
    await platformPartnersApi.publishCommissionRule(partner.publicId, {
      fixedSuccessRewardJpy: 50000,
      profitShareRateBps: 1500,
      paymentMethod: "bank_transfer",
      effectiveFrom: "2026-10-01T00:00:00.000Z",
      reason: "2026 contract",
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/backoffice/users/88/partner-profiles",
      expect.objectContaining({ method: "POST" }),
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      `/backoffice/agents/${partner.publicId}/shop-referrals`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      3,
      `/backoffice/agents/${partner.publicId}/commission-rules`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("lists, creates, publishes, and deletes operating costs through the formal API", async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce({ list: [cost], total: 1, page: 1, page_size: 20 })
      .mockResolvedValueOnce(cost)
      .mockResolvedValueOnce({
        ...cost,
        status: "published",
        publishedAt: "2026-09-02T01:00:00.000Z",
      })
      .mockResolvedValueOnce(undefined);

    await platformPartnersApi.listOperatingCosts({
      page: 1,
      pageSize: 20,
      status: "draft",
    });
    await platformPartnersApi.createOperatingCost({
      costCode: cost.costCode,
      categoryCode: "server",
      name: cost.name,
      amountJpy: 1000,
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      allocationMode: "equal_active_shops",
      effectiveAt: cost.effectiveAt,
      reason: cost.reason,
    });
    await platformPartnersApi.publishOperatingCost(
      cost.publicId,
      "财务复核完成",
    );
    await platformPartnersApi.deleteOperatingCost(cost.publicId, "撤回草稿");

    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/backoffice/operating-costs",
      { query: { page: 1, pageSize: 20, status: "draft" } },
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      3,
      `/backoffice/operating-costs/${cost.publicId}/publish`,
      { method: "POST", body: { reason: "财务复核完成" } },
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      4,
      `/backoffice/operating-costs/${cost.publicId}`,
      { method: "DELETE", body: { reason: "撤回草稿" } },
    );
  });

  it("rejects malformed formal responses instead of inventing fallback data", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({
      list: [{ ...partner, user: null }],
      total: 1,
      page: 1,
      page_size: 20,
    });
    await expect(platformPartnersApi.listAgents()).rejects.toThrow(
      "Invalid platform partner response",
    );
  });
});
