import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { customerShopMembershipApi, merchantShopMembershipApi } from "./api";

vi.mock("../../api/httpClient", () => ({
  httpClient: { request: vi.fn() }
}));

describe("shop membership API clients", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses fixed shop-scoped merchant routes without accepting a shop id", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await merchantShopMembershipApi.overview();
    await merchantShopMembershipApi.list({ keyword: "u0000000123", page: 2, pageSize: 20, status: "active" });
    await merchantShopMembershipApi.detail(" member/1 ");
    await merchantShopMembershipApi.candidates({ keyword: "田中", page: 1, pageSize: 10 });
    await merchantShopMembershipApi.enroll(" U0000000123 ");
    await merchantShopMembershipApi.cards({ page: 1, pageSize: 20, status: "frozen", type: "stored_value" });
    await merchantShopMembershipApi.activities({ page: 3, pageSize: 20 });
    await merchantShopMembershipApi.analytics("last30days");

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/merchant-admin/shop-memberships/overview");
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/merchant-admin/shop-memberships", {
      query: { keyword: "u0000000123", page: 2, pageSize: 20, status: "active" }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(3, "/merchant-admin/shop-memberships/member%2F1");
    expect(httpClient.request).toHaveBeenNthCalledWith(4, "/merchant-admin/shop-membership-candidates", {
      query: { keyword: "田中", page: 1, pageSize: 10 }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(5, "/merchant-admin/shop-memberships", {
      body: { customerNeedoId: "u0000000123" },
      method: "POST"
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(6, "/merchant-admin/shop-membership-cards", {
      query: { page: 1, pageSize: 20, status: "frozen", type: "stored_value" }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(7, "/merchant-admin/shop-membership-activities", {
      query: { page: 3, pageSize: 20 }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(8, "/merchant-admin/shop-membership-analytics", {
      query: { period: "last30days" }
    });
  });

  it("uses self-scoped customer routes without user or profile ids", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await customerShopMembershipApi.list({ page: 1, pageSize: 20, status: "active" });
    await customerShopMembershipApi.detail(" member/2 ");

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/customer-profile/me/shop-memberships", {
      query: { page: 1, pageSize: 20, status: "active" }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/customer-profile/me/shop-memberships/member%2F2");
  });

  it("uses formal card-plan and issuance routes without later wallet mutations", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});
    const draft = { expectedLockVersion: 0 } as never;
    const scenario = { eligibleAmountJpy: 10_000 } as never;

    await merchantShopMembershipApi.listCardPlans({ page: 2, pageSize: 10 });
    await merchantShopMembershipApi.getCardPlan(" plan/1 ");
    await merchantShopMembershipApi.createCardPlan(draft);
    await merchantShopMembershipApi.saveCardPlanDraft("plan-id", draft);
    await merchantShopMembershipApi.previewCardPlan("plan-id", scenario);
    await merchantShopMembershipApi.publishCardPlan("plan-id", 3);
    await merchantShopMembershipApi.retireCardPlan("plan-id");
    const issuance = { planPublicId: "plan-id", idempotencyKey: "retry-key-1" } as never;
    await merchantShopMembershipApi.issueCard(" member/3 ", issuance);

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/merchant-admin/shop-membership-card-plans", { query: { page: 2, pageSize: 10 } });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/merchant-admin/shop-membership-card-plans/plan%2F1");
    expect(httpClient.request).toHaveBeenNthCalledWith(3, "/merchant-admin/shop-membership-card-plans", { method: "POST", body: draft });
    expect(httpClient.request).toHaveBeenNthCalledWith(4, "/merchant-admin/shop-membership-card-plans/plan-id/draft", { method: "PATCH", body: draft });
    expect(httpClient.request).toHaveBeenNthCalledWith(5, "/merchant-admin/shop-membership-card-plans/plan-id/preview", { method: "POST", body: scenario });
    expect(httpClient.request).toHaveBeenNthCalledWith(6, "/merchant-admin/shop-membership-card-plans/plan-id/publish", { method: "POST", body: { expectedLockVersion: 3 } });
    expect(httpClient.request).toHaveBeenNthCalledWith(7, "/merchant-admin/shop-membership-card-plans/plan-id/retire", { method: "POST", body: {} });
    expect(httpClient.request).toHaveBeenNthCalledWith(8, "/merchant-admin/shop-memberships/member%2F3/cards", { method: "POST", body: issuance });
    expect(merchantShopMembershipApi).not.toHaveProperty("topUpCard");
    expect(merchantShopMembershipApi).not.toHaveProperty("redeemCard");
  });
});
