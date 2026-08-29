import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { httpClient } from "./httpClient";
import {
  affiliateAllianceApi,
  type AffiliateAlliance,
  type AffiliateAllianceCreateInput,
  type AffiliateAllianceInvitationCreateInput,
  type AffiliateAllianceMineResponse
} from "./affiliateAlliance";

vi.mock("./httpClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./httpClient")>()),
  httpClient: { request: vi.fn() }
}));

describe("affiliate alliance API client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(httpClient.request).mockResolvedValue({ alliance: null });
  });

  it("uses the exact authenticated alliance read and create contracts", async () => {
    const input: AffiliateAllianceCreateInput = {
      name: "东京美容联盟",
      description: "面向东京地区",
      defaultPromoterShareBps: 7550
    };

    await affiliateAllianceApi.getMine();
    await affiliateAllianceApi.create(input);

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/affiliate/alliances/me");
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/affiliate/alliances", {
      method: "POST",
      body: input
    });
  });

  it("uses all seven invitation endpoints with encoded paging and filters", async () => {
    const controller = new AbortController();
    const partnerInvitation: AffiliateAllianceInvitationCreateInput = {
      inviteeNeedoId: "u0000000008",
      role: "partner",
      proposedParentMemberId: null
    };

    await affiliateAllianceApi.listMembers({
      page: 2,
      pageSize: 25,
      q: "山田 & 花",
      signal: controller.signal
    });
    await affiliateAllianceApi.listEligibleContacts({ page: 3, pageSize: 10, q: "u0000000008" });
    await affiliateAllianceApi.listSentInvitations({
      page: 4,
      pageSize: 15,
      status: "pending"
    });
    await affiliateAllianceApi.createInvitation(partnerInvitation, { signal: controller.signal });
    await affiliateAllianceApi.listReceivedInvitations({ page: 5, pageSize: 20, status: "expired" });
    await affiliateAllianceApi.acceptInvitation(41, { signal: controller.signal });
    await affiliateAllianceApi.rejectInvitation(42);

    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/affiliate/alliances/me/members?page=2&pageSize=25&q=%E5%B1%B1%E7%94%B0+%26+%E8%8A%B1",
      { signal: controller.signal }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/affiliate/alliances/me/eligible-contacts?page=3&pageSize=10&q=u0000000008"
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      3,
      "/affiliate/alliances/me/invitations?page=4&pageSize=15&status=pending"
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      4,
      "/affiliate/alliances/me/invitations",
      { body: partnerInvitation, method: "POST", signal: controller.signal }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      5,
      "/affiliate/alliance-invitations/mine?page=5&pageSize=20&status=expired"
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      6,
      "/affiliate/alliance-invitations/41/accept",
      { body: {}, method: "POST", signal: controller.signal }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      7,
      "/affiliate/alliance-invitations/42/reject",
      { body: {}, method: "POST" }
    );
  });

  it("returns unwrapped success data and preserves stable server error keys", async () => {
    const receivedPage = { list: [], total: 0, page: 1, page_size: 20 };
    const serverError = Object.assign(
      new Error("error.affiliate_alliance.invitation_state_conflict"),
      { code: 40940, status: 409 }
    );
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce(receivedPage)
      .mockRejectedValueOnce(serverError);

    await expect(affiliateAllianceApi.listReceivedInvitations()).resolves.toBe(receivedPage);
    await expect(affiliateAllianceApi.acceptInvitation(41)).rejects.toBe(serverError);
  });

  it("keeps internal account and identity fields out of public types", () => {
    type ForbiddenAllianceKeys = Extract<
      keyof AffiliateAlliance,
      "userId" | "identityId" | "identityType" | "scout"
    >;
    type ForbiddenResponseKeys = Extract<
      keyof AffiliateAllianceMineResponse,
      "userId" | "identityId" | "identityType" | "scout"
    >;

    expectTypeOf<ForbiddenAllianceKeys>().toEqualTypeOf<never>();
    expectTypeOf<ForbiddenResponseKeys>().toEqualTypeOf<never>();
  });
});
