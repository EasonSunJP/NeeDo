import type {
  ExchangeOperationsDetail,
  ExchangeOperationsPage
} from "../src/types/exchange-operations.types";
import {
  ExchangeOperationsService,
  type ExchangeOperationsRepositoryPort
} from "../src/services/exchange-operations.service";

const now = new Date("2026-09-13T02:00:00.000Z");

const row = {
  id: 6,
  type: "demand" as const,
  status: "published" as const,
  title: "全流程测试：ボディケア 60分",
  publisher: {
    publicIdMasked: "u0000••••01",
    displayNameMasked: "E•••n",
    identityType: "customer"
  },
  serviceMode: "store" as const,
  areaLabel: "東京都千代田区",
  serviceStartAt: "2026-09-14T12:00:00.000Z",
  serviceEndAt: "2026-09-14T13:00:00.000Z",
  expiresAt: "2026-09-14T15:00:00.000Z",
  publishedAt: "2026-09-13T01:00:00.000Z",
  budgetMinJpy: null,
  budgetMaxJpy: 8_000,
  matchMode: "quick" as const,
  claimCount: 1,
  activeClaimCount: 1,
  matchedCount: 0,
  financial: {
    state: "held" as const,
    amountNdp: 1_000,
    currency: "TEST_NDP" as const,
    heldAmountNdp: 1_000,
    capturedAmountNdp: 0,
    releasedAmountNdp: 0,
    ruleSetVersion: 1,
    createdAt: "2026-09-13T01:00:00.000Z",
    capturedAt: null,
    releasedAt: null
  }
};

const page: ExchangeOperationsPage = {
  list: [row],
  total: 1,
  page: 1,
  page_size: 20
};

const detail: ExchangeOperationsDetail = {
  ...row,
  detail: "到店施術の正式テスト",
  contentLocale: "ja-JP",
  demand: {
    targetProviderCount: 1,
    targetProviderLimitSnapshot: 1,
    publisherCapacitySource: "customer_membership",
    membershipLevelSnapshot: "standard",
    matchMode: "quick",
    budgetMode: "total",
    budgetMinJpy: null,
    budgetMaxJpy: 8_000,
    serviceMode: "store",
    addressLine1: "東京都千代田区"
  },
  intelligence: null,
  claims: [],
  matching: {
    status: "open",
    version: 1,
    effectiveTargetProviderCount: 1,
    effectiveBudgetMaxJpy: 8_000,
    selectedQuoteTotalJpy: 0,
    matchedAt: null,
    participants: []
  },
  timeline: []
};

const repository = (): jest.Mocked<ExchangeOperationsRepositoryPort> => ({
  list: jest.fn(async (input) => {
    void input;
    return page;
  }),
  findDetail: jest.fn(async (postId, currentTime) => {
    void postId;
    void currentTime;
    return detail;
  })
});

describe("ExchangeOperationsService", () => {
  it("forwards the strict operations filters and pagination", async () => {
    const repo = repository();
    const service = new ExchangeOperationsService(repo, () => now);

    await expect(
      service.list({
        type: "demand",
        status: "published",
        matchMode: "quick",
        publisherIdentityType: "customer",
        keyword: "ボディケア",
        page: 1,
        page_size: 20
      })
    ).resolves.toEqual(page);
    expect(repo.list).toHaveBeenCalledWith({
      type: "demand",
      status: "published",
      matchMode: "quick",
      publisherIdentityType: "customer",
      keyword: "ボディケア",
      page: 1,
      pageSize: 20,
      now,
      showTestNdpData: true
    });
  });

  it("returns a redacted persisted detail without actor ids or private address lines", async () => {
    const repo = repository();
    const service = new ExchangeOperationsService(repo, () => now);

    const value = await service.detail(6);

    expect(value).toEqual(detail);
    expect(JSON.stringify(value)).not.toMatch(
      /authorUserId|authorIdentityId|claimantUserId|claimantIdentityId|email|phone|addressLine2|addressLine3/
    );
    expect(repo.findDetail).toHaveBeenCalledWith(6, now, true);
  });

  it("uses the standard not-found error for missing or soft-deleted posts", async () => {
    const repo = repository();
    repo.findDetail.mockResolvedValue(null);
    const service = new ExchangeOperationsService(repo, () => now);

    await expect(service.detail(999)).rejects.toMatchObject({
      statusCode: 404,
      message: "error.exchange.post_not_found"
    });
  });
});
