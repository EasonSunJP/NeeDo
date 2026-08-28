import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { httpClient } from "./httpClient";
import {
  affiliateProfileApi,
  type AffiliateProfile,
  type AffiliateProfileUpdateInput
} from "./affiliateProfile";

vi.mock("./httpClient", () => ({
  httpClient: { request: vi.fn() }
}));

const profile: AffiliateProfile = {
  profileId: 57,
  needoId: "u0000000007",
  displayName: "Affiliate 7",
  avatarUrl: null,
  affiliateStatus: "active",
  cooperationStatus: "available",
  version: 3,
  bio: null,
  strengths: [],
  serviceAreas: [],
  channels: [],
  updatedAt: "2026-08-28T09:00:00.000Z"
};

describe("affiliate profile API client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(httpClient.request).mockResolvedValue(profile);
  });

  it("uses the exact authenticated profile and channel contracts", async () => {
    const update: AffiliateProfileUpdateInput = {
      expectedVersion: 3,
      bio: "東京の美容サービスを紹介します",
      strengths: ["美容"],
      serviceAreas: ["東京都"],
      cooperationStatus: "available"
    };

    await affiliateProfileApi.getMine();
    await affiliateProfileApi.updateMine(update);
    await affiliateProfileApi.createChannel({
      expectedProfileVersion: 4,
      platform: "instagram",
      homepageUrl: "https://instagram.com/needo",
      sortOrder: 0
    });
    await affiliateProfileApi.updateChannel(72, {
      expectedProfileVersion: 5,
      platform: "custom",
      customLabel: "Blog",
      homepageUrl: "https://creator.example/profile",
      sortOrder: 1
    });
    await affiliateProfileApi.deleteChannel(72, 6);

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/affiliate/profile");
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/affiliate/profile", {
      method: "PATCH",
      body: update
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(3, "/affiliate/profile/channels", {
      method: "POST",
      body: {
        expectedProfileVersion: 4,
        platform: "instagram",
        homepageUrl: "https://instagram.com/needo",
        sortOrder: 0
      }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(
      4,
      "/affiliate/profile/channels/72",
      {
        method: "PATCH",
        body: {
          expectedProfileVersion: 5,
          platform: "custom",
          customLabel: "Blog",
          homepageUrl: "https://creator.example/profile",
          sortOrder: 1
        }
      }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      5,
      "/affiliate/profile/channels/72",
      {
        method: "DELETE",
        query: { expected_profile_version: 6 }
      }
    );
  });

  it("keeps internal user and identity identifiers out of the public type", () => {
    type ForbiddenKeys = Extract<
      keyof AffiliateProfile,
      "userId" | "identityId" | "identityType" | "scout"
    >;

    expectTypeOf<ForbiddenKeys>().toEqualTypeOf<never>();
  });
});
