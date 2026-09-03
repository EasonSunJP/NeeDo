import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { pricingModeApi, type TechnicianServicePayload } from "./api";

vi.mock("../../api/httpClient", () => ({
  httpClient: { request: vi.fn() },
}));

describe("pricingModeApi technician portfolio", () => {
  beforeEach(() => vi.mocked(httpClient.request).mockReset());

  it("types formal technician service identity, utilization, and public shop metadata", () => {
    const service = {
      id: 31,
      publicId: "00000000-0000-4000-8000-000000000031",
      shopId: 9,
      technicianId: 3,
      sourceShopServiceId: null,
      name: "Aroma 60",
      description: null,
      categoryId: 2,
      priceAmount: 8800,
      currency: "JPY",
      durationMinutes: 60,
      usageCount: 7,
      taxIncluded: true,
      coverImageUrl: null,
      images: [],
      tags: [],
      shop: { publicId: "shop0000000009", name: "LifeDance", address: "东京都港区" },
      isActive: true,
      isBookable: true,
      isRecommended: false,
      sortOrder: 0,
      reviewStatus: "approved",
      rejectionReason: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z"
    } satisfies TechnicianServicePayload;

    expect(service).toMatchObject({ usageCount: 7, shop: { publicId: "shop0000000009" } });
  });

  it("loads all services for the authenticated technician profile", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({
      list: [],
      total: 0,
      page: 1,
      page_size: 20,
    });

    await pricingModeApi.listMyTechnicianServices({
      page: 1,
      pageSize: 20,
      activeOnly: false,
    });

    expect(httpClient.request).toHaveBeenCalledWith("/technicians/me/services", {
      query: { page: 1, pageSize: 20, activeOnly: false },
    });
  });

  it("saves one complete ordered portfolio with an idempotency key", async () => {
    vi.mocked(httpClient.request).mockResolvedValue([]);

    await pricingModeApi.reorderMyTechnicianServices(
      [31, 22, 14],
      "technician-order-0001",
    );

    expect(httpClient.request).toHaveBeenCalledWith(
      "/technicians/me/services/order",
      {
        body: {
          orderedServiceIds: [31, 22, 14],
          idempotencyKey: "technician-order-0001",
        },
        method: "PUT",
      },
    );
  });
});
