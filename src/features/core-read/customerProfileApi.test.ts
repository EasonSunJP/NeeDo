import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { mapCoreCustomerToCustomer } from "./api";
import { customerProfileApi, type CustomerSelfProfile } from "./customerProfileApi";

vi.mock("../../api/httpClient", () => ({ httpClient: { request: vi.fn() } }));

describe("customerProfileApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses only the protected current-profile routes", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await customerProfileApi.getMine();
    await customerProfileApi.updateMine({ displayName: "松尾 雄大", visibility: "network" });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/customer-profile/me");
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/customer-profile/me", {
      body: { displayName: "松尾 雄大", visibility: "network" },
      method: "PATCH"
    });
  });

  it("maps every persisted editable field into the customer view model", () => {
    expect(
      mapCoreCustomerToCustomer({
        id: 41,
        publicId: "u3141592653",
        displayName: "松尾 雄大",
        city: "Tokyo",
        bio: "自己紹介",
        avatarUrl: null,
        membershipLevel: "standard",
        reviewSummary: { ratingAverage: "0", reviewCount: 0, latestReviewAt: null, highlights: [] },
        gender: "private",
        age: 36,
        heightCm: 171,
        languages: ["日本語", "English"],
        visibility: "network",
        createdAt: "2026-08-26T00:00:00.000Z",
        updatedAt: "2026-08-26T00:00:00.000Z"
      })
    ).toMatchObject({
      nickname: "松尾 雄大",
      gender: "private",
      age: "36",
      height: "171cm",
      languages: ["日本語", "English"],
      bio: "自己紹介"
    });
  });

  it("maps the real self-profile response without a public review summary", () => {
    const selfProfile = {
      id: 41,
      publicId: "u3141592653",
      userId: 12,
      displayName: "松尾 雄大",
      city: "Tokyo",
      bio: "自己紹介",
      avatarUrl: null,
      membershipLevel: "standard",
      gender: "private",
      age: 36,
      heightCm: 171,
      languages: ["日本語", "English"],
      visibility: "network",
      isPublic: false,
      createdAt: "2026-08-26T00:00:00.000Z",
      updatedAt: "2026-08-26T00:00:00.000Z"
    } satisfies CustomerSelfProfile;

    expect(() => mapCoreCustomerToCustomer(selfProfile)).not.toThrow();
    expect(mapCoreCustomerToCustomer(selfProfile)).toMatchObject({
      systemId: "u3141592653",
      activeScore: 0,
      creditRating: undefined,
      orderCount: 0
    });
  });
});
