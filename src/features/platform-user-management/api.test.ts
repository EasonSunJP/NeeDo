import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { platformUserManagementApi } from "./api";

vi.mock("../../api/httpClient", async () => {
  const actual = await vi.importActual<typeof import("../../api/httpClient")>("../../api/httpClient");
  return { ...actual, httpClient: { request: vi.fn() } };
});

const userResponse = (experience: unknown) => ({
  id: 41, needoId: "u4083532147", username: "Mia", displayName: "Mia", email: "mia@example.test",
  phone: null, emailBound: true, phoneBound: false, avatarUrl: null, city: null,
  privacyMode: false, privacyScope: null, isActive: true, isTestAccount: false,
  source: [], identities: [], roles: [], groups: [], ekycVerified: false,
  membership: { tierCode: "free", tierVersionPublicId: null, entitlementPublicId: null, expiresAt: null, experienceMultiplier: 1, lockVersion: null },
  ndpBalance: { available: 0, frozen: 0 }, experience, bookingCount: 0,
  lastLoginAt: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z"
});

describe("platformUserManagementApi", () => {
  beforeEach(() => vi.mocked(httpClient.request).mockReset());

  it.each(["operations", "merchant"] as const)("uses exact EXP amounts and drops legacy units in %s", async (scope) => {
    vi.mocked(httpClient.request).mockResolvedValue({ list: [userResponse({ currentLevel: 1, totalExp: "4.0001", totalExpUnits: "40001" })], total: 1, page: 1, page_size: 20 });
    const page = await platformUserManagementApi.listUsers(scope, {});
    expect(page.list[0].experience).toEqual({ currentLevel: 1, totalExp: "4.0001" });
  });

  it.each([undefined, "4 EXP", "-1", "1e4", "0.00001"])("rejects missing or invalid business EXP instead of displaying storage units: %s", async (totalExp) => {
    vi.mocked(httpClient.request).mockResolvedValue({ list: [userResponse({ currentLevel: 1, totalExp, totalExpUnits: "40000" })], total: 1, page: 1, page_size: 20 });
    await expect(platformUserManagementApi.listUsers("operations", {})).rejects.toThrow("Invalid user management response");
  });

  it("preserves not-applicable experience without inventing a zero balance", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({ list: [userResponse(null)], total: 1, page: 1, page_size: 20 });
    expect((await platformUserManagementApi.listUsers("operations", {})).list[0].experience).toBeNull();
  });

  it("serializes the formal routes and maps page_size to pageSize", async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce({ list: [], total: 0, page: 2, page_size: 25 })
      .mockResolvedValueOnce({ list: [], total: 0, page: 1, page_size: 20 })
      .mockResolvedValueOnce({ current: null, draft: null })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ list: [], total: 0, page: 1, page_size: 20 });

    await platformUserManagementApi.listUsers("operations", { page: 2, page_size: 25, tier: "gold" });
    await platformUserManagementApi.listGroups({ page: 1, page_size: 20 });
    await platformUserManagementApi.getGlobalSettings();
    await platformUserManagementApi.listTiers();
    await platformUserManagementApi.listBenefits();
    await platformUserManagementApi.listExperienceEntries(41, { page: 1, page_size: 20 });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/backoffice/users", {
      query: { page: 2, pageSize: 25, tier: "gold" }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/backoffice/user-groups", {
      query: { page: 1, pageSize: 20 }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(3, "/backoffice/user-global-settings");
    expect(httpClient.request).toHaveBeenNthCalledWith(4, "/backoffice/membership-tiers");
    expect(httpClient.request).toHaveBeenNthCalledWith(5, "/backoffice/membership-benefits");
    expect(httpClient.request).toHaveBeenNthCalledWith(
      6,
      "/backoffice/users/41/experience-entries",
      { query: { page: 1, pageSize: 20 } }
    );
  });

  it("uses the canonical scoped user route and serializes server filters", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({ list: [], total: 0, page: 2, page_size: 20 });

    await platformUserManagementApi.listUsers("merchant", {
      page: 2,
      page_size: 20,
      city: "Tokyo",
      privacyScopes: ["enabled"],
      tiers: ["silver", "gold"],
      minBookings: 10,
      maxBookings: 50,
      sortBy: "city",
      sortDirection: "desc",
      registeredFrom: "2026-09-01T00:00:00.000Z",
      registeredTo: "2026-09-30T23:59:59.999Z"
    });

    expect(httpClient.request).toHaveBeenCalledWith("/merchant-admin/users", {
      query: {
        page: 2,
        pageSize: 20,
        city: "Tokyo",
        privacyScopes: ["enabled"],
        tiers: ["silver", "gold"],
        minBookings: 10,
        maxBookings: 50,
        sortBy: "city",
        sortDirection: "desc",
        registeredFrom: "2026-09-01T00:00:00.000Z",
        registeredTo: "2026-09-30T23:59:59.999Z"
      }
    });
  });

  it("uses the canonical scoped detail route", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});
    await expect(platformUserManagementApi.getUser("merchant", 41)).rejects.toThrow("Invalid user management response");
    expect(httpClient.request).toHaveBeenCalledWith("/merchant-admin/users/41");
  });

  it("sends a reasoned membership adjustment without a level field", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});
    await platformUserManagementApi.adjustMembership(41, {
      tierCode: "gold",
      reason: "Approved retention adjustment",
      expectedLockVersion: 2
    });
    expect(httpClient.request).toHaveBeenCalledWith(
      "/backoffice/users/41/membership-adjustment",
      {
        method: "PATCH",
        body: {
          tierCode: "gold",
          reason: "Approved retention adjustment",
          expectedLockVersion: 2
        }
      }
    );
  });

  it("uses scoped ten-row review reads and append-only amendments", async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce({ list: [], total: 0, page: 2, page_size: 10 })
      .mockResolvedValueOnce({ reviewId: 77, version: 2 });

    await platformUserManagementApi.listReceivedReviews("merchant", 41, {
      page: 2,
      page_size: 10
    });
    await platformUserManagementApi.amendReview(77, {
      rating: 3,
      reason: "Refund evidence confirmed",
      expectedVersion: 1
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/merchant-admin/users/41/received-reviews",
      { query: { page: 2, page_size: 10 } }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/backoffice/reviews/77/amendments",
      {
        method: "POST",
        body: {
          rating: 3,
          reason: "Refund evidence confirmed",
          expectedVersion: 1
        }
      }
    );
  });

  it("decodes formal payment and extra-time facts and rejects invented payment states", async () => {
    const review = {
      reviewId: 77, targetType: "customer", rating: 5, comment: null, tags: [],
      createdAt: "2026-09-05T10:00:00.000Z", amendmentVersion: 0, amendmentHistory: [],
      reviewer: { needoId: "s0000000042", displayName: "Mika", avatarUrl: null },
      order: { id: 88, orderNo: "B-88", serviceName: "Care", startsAt: "2026-09-05T09:00:00.000Z",
        shopName: "Tokyo", durationMinutes: 60, note: null, paymentMethod: "ndp", paymentStatus: "refunded",
        paymentCurrency: "TEST_NDP", otherPaymentMethod: null, addOnCount: 1, addOnMinutes: 30 }
    };
    const page = { list: [review], total: 1, page: 1, page_size: 10 };
    vi.mocked(httpClient.request).mockResolvedValueOnce(page);
    const result = await platformUserManagementApi.listReceivedReviews("operations", 41, { page: 1, page_size: 10 });
    expect(result.list[0].order).toEqual(review.order);
    vi.mocked(httpClient.request).mockResolvedValueOnce({ ...page, list: [{ ...review, order: { ...review.order, paymentStatus: "smooth" } }] });
    await expect(platformUserManagementApi.listReceivedReviews("operations", 41, { page: 1, page_size: 10 })).rejects.toThrow();
  });

  it("uses scoped ten-row usage reads, timeline, comments and refund amendments", async () => {
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce({ list: [], total: 0, page: 1, page_size: 10 })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ commentId: 201 })
      .mockResolvedValueOnce({ orderId: 88, version: 1 });
    await platformUserManagementApi.listUsage("merchant", 41, { page: 1, page_size: 10, period: "thisMonth" });
    await expect(platformUserManagementApi.getUsageTimeline("merchant", 41, 88)).rejects.toThrow("Invalid user management response");
    await platformUserManagementApi.appendUsageComment(41, 88, "Customer contacted");
    await platformUserManagementApi.amendUsageRefund(41, 88, { note: "Confirmed", reason: "Evidence", expectedVersion: 0 });
    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/merchant-admin/users/41/usages", {
      query: { page: 1, page_size: 10, period: "thisMonth" }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/merchant-admin/users/41/usages/88");
    expect(httpClient.request).toHaveBeenNthCalledWith(3, "/backoffice/users/41/usages/88/comments", {
      method: "POST", body: { body: "Customer contacted" }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(4, "/backoffice/users/41/usages/88/refund-amendments", {
      method: "POST", body: { note: "Confirmed", reason: "Evidence", expectedVersion: 0 }
    });
  });

  it("rejects malformed responses instead of accepting legacy local data", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({ list: [{ id: "not-an-id" }], total: 1, page: 1, page_size: 20 });

    await expect(platformUserManagementApi.listUsers("operations")).rejects.toThrow("Invalid user management response");
  });

  it("preserves 409 conflicts for the workspace recovery UI", async () => {
    const conflict = { message: "error.version_conflict", code: 40901, status: 409 };
    vi.mocked(httpClient.request).mockImplementationOnce(() => {
      throw conflict;
    });

    let caught: unknown;
    try {
      await platformUserManagementApi.publishGlobalSettings({ expectedVersion: 2, expectedLockVersion: 1 });
    } catch (error) {
      caught = error;
    }
    const preserved = caught as typeof conflict;
    expect(preserved.status).toBe(409);
    expect(preserved.code).toBe(40901);
    expect(preserved.message).toBe("error.version_conflict");
  });
});
