import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { persistentResourceCache } from "../../lib/persistentResourceCache";
import { mapCoreCustomerToCustomer } from "./api";
import { customerProfileApi, type CustomerSelfProfile } from "./customerProfileApi";

vi.mock("../../api/httpClient", () => ({ httpClient: { request: vi.fn() } }));
vi.mock("../../lib/persistentCacheScope", () => ({
  getAuthenticatedPersistentCacheScope: () => "account:12"
}));
vi.mock("../../lib/persistentResourceCache", () => ({
  persistentResourceCache: { peek: vi.fn(), write: vi.fn() }
}));

describe("customerProfileApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(persistentResourceCache.write).mockResolvedValue({});
  });

  it("uses only the protected current-profile routes", async () => {
    const saved = { id: 41, displayName: "松尾 雄大", visibility: "network" };
    vi.mocked(httpClient.request).mockResolvedValue(saved);
    vi.mocked(persistentResourceCache.peek).mockReturnValue({
      profile: { id: 41, displayName: "旧姓名" },
      wallet: { ndp: { available: 100 } }
    });

    await customerProfileApi.getMine();
    await customerProfileApi.updateMine({ displayName: "松尾 雄大", visibility: "network" });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/customer-profile/me");
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/customer-profile/me", {
      body: { displayName: "松尾 雄大", visibility: "network" },
      method: "PATCH"
    });
    expect(persistentResourceCache.write).toHaveBeenNthCalledWith(
      1,
      "account:12",
      "customer:self",
      saved
    );
    expect(persistentResourceCache.write).toHaveBeenNthCalledWith(
      2,
      "account:12",
      "user-center:self:41",
      expect.objectContaining({
        profile: saved,
        wallet: { ndp: { available: 100 } }
      })
    );
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
      level: 72,
      gender: "private",
      age: 36,
      heightCm: 171,
      languages: ["日本語", "English"],
      visibility: "network",
      isPublic: false,
      createdAt: "2026-08-26T00:00:00.000Z",
      updatedAt: "2026-08-26T00:00:00.000Z"
    } as CustomerSelfProfile & { level: number };

    expect(() => mapCoreCustomerToCustomer(selfProfile)).not.toThrow();
    expect(mapCoreCustomerToCustomer(selfProfile)).toMatchObject({
      systemId: "u3141592653",
      experienceLevel: 72,
      activeScore: 0,
      creditRating: undefined,
      orderCount: 0
    });
  });
});
