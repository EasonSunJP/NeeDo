import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { httpClient } from "./httpClient";
import {
  affiliateAllianceApi,
  type AffiliateAlliance,
  type AffiliateAllianceCreateInput,
  type AffiliateAllianceMineResponse
} from "./affiliateAlliance";

vi.mock("./httpClient", () => ({
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
