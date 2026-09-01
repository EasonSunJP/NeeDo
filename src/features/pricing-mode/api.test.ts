import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { pricingModeApi } from "./api";

vi.mock("../../api/httpClient", () => ({
  httpClient: { request: vi.fn() },
}));

describe("pricingModeApi technician portfolio", () => {
  beforeEach(() => vi.mocked(httpClient.request).mockReset());

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
