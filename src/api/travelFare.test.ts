import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "./httpClient";
import { travelFareApi } from "./travelFare";

vi.mock("./httpClient", () => ({ httpClient: { request: vi.fn() } }));

describe("travelFareApi", () => {
  beforeEach(() => vi.mocked(httpClient.request).mockReset());

  it("reads redacted provider status", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({ configured: false } as never);
    await travelFareApi.getProviderStatus();
    expect(httpClient.request).toHaveBeenCalledWith("/backoffice/travel/providers/status");
  });

  it("passes paginated policy filters as formal query parameters", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({ list: [], total: 0, page: 2, page_size: 10 } as never);
    await travelFareApi.listPolicies({ page: 2, pageSize: 10, city: "Tokyo", shopKeyword: "NeeDo" });
    expect(httpClient.request).toHaveBeenCalledWith("/backoffice/travel/fare-policies", {
      query: { page: 2, pageSize: 10, city: "Tokyo", shopKeyword: "NeeDo" }
    });
  });

  it("reads and publishes merchant policy versions through the signed-shop endpoints", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({ current: null, next: null } as never);
    await travelFareApi.getMerchantPolicy();
    expect(httpClient.request).toHaveBeenLastCalledWith("/merchant-admin/travel-fare-policy");

    await travelFareApi.listMerchantPolicyVersions({ page: 1, pageSize: 20 });
    expect(httpClient.request).toHaveBeenLastCalledWith(
      "/merchant-admin/travel-fare-policy/versions",
      { query: { page: 1, pageSize: 20 } }
    );

    const input = { expectedVersion: 0, effectiveFrom: "2026-09-06T00:00:00.000Z", reason: "Initial policy", bands: [{ maximumDistanceMeters: 5000, fareAmountJpy: 800 }] };
    await travelFareApi.publishMerchantPolicy(input);
    expect(httpClient.request).toHaveBeenLastCalledWith("/merchant-admin/travel-fare-policy/versions", { method: "POST", body: input });
  });

  it("creates a customer estimate from a structured Japanese address", async () => {
    const input = { servicePublicId: "svc0000000031", scheduleSlotId: 701, destination: { countryCode: "JP" as const, postalCode: "104-0061", prefecture: "東京都", city: "中央区", addressLine1: "銀座1-2-3" } };
    vi.mocked(httpClient.request).mockResolvedValue({ publicId: "estimate" } as never);
    await travelFareApi.createEstimate(input);
    expect(httpClient.request).toHaveBeenLastCalledWith("/bookings/travel-estimates", { method: "POST", body: input });
  });
});
