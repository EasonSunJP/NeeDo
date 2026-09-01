import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { currentMembershipBenefitsApi } from "./currentMembershipBenefitsApi";

describe("currentMembershipBenefitsApi", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("requests a localized read-only projection and rejects unsafe shapes", async () => {
    const request = vi.spyOn(httpClient, "request").mockResolvedValue({
      tierCode: "free",
      tierVersionPublicId: "tier-free-v1",
      expiresAt: null,
      list: [
        {
          code: "support_service",
          configuredEnabled: true,
          globallyEnabled: true,
          effective: false,
          deliveryCapability: "unavailable",
          name: "Dedicated support",
          description: "Coming later"
        }
      ]
    });

    await expect(currentMembershipBenefitsApi.getMine("en")).resolves.toMatchObject({
      tierCode: "free",
      list: [{ code: "support_service", deliveryCapability: "unavailable" }]
    });
    expect(request).toHaveBeenCalledWith("/me/membership-benefits?locale=en");

    request.mockResolvedValueOnce({ tierCode: "free", list: [{ targetUserId: 12 }] });
    await expect(currentMembershipBenefitsApi.getMine("en")).rejects.toBeInstanceOf(TypeError);
  });
});
