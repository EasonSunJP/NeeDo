import { beforeEach, describe, expect, it, vi } from "vitest";
import { backofficeRealDataApi, mapBackofficeOrder, type BackofficeOrderPayload } from "./backofficeRealData";
import { httpClient } from "./httpClient";

vi.mock("./httpClient", () => ({ httpClient: { request: vi.fn() } }));

describe("backofficeRealDataApi master data writes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses protected operations endpoints for shops and technician approval", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});
    const api = backofficeRealDataApi as typeof backofficeRealDataApi & Record<string, (...args: never[]) => Promise<unknown>>;

    expect(api.createShop).toBeTypeOf("function");
    expect(api.approveShop).toBeTypeOf("function");
    expect(api.approveTechnician).toBeTypeOf("function");
    if (!api.createShop || !api.approveShop || !api.approveTechnician) return;

    await api.createShop({ ownerEmail: "owner@example.com", ownerUsername: "Owner", ownerPassword: "Owner.2026!", name: "Aoyama", city: "Tokyo", address: "Aoyama 1-1" } as never);
    await api.approveShop(11 as never);
    await api.approveTechnician("backoffice" as never, 31 as never, { shopId: 11 } as never);

    expect(httpClient.request).toHaveBeenCalledWith("/backoffice/shops", expect.objectContaining({ method: "POST" }));
    expect(httpClient.request).toHaveBeenCalledWith("/backoffice/shops/11/approve", { method: "POST" });
    expect(httpClient.request).toHaveBeenCalledWith("/backoffice/technicians/31/approve", { body: { shopId: 11 }, method: "POST" });
  });

  it("derives merchant service and customer paths from the selected API scope", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({ list: [], total: 0, page: 1, page_size: 20 });
    const api = backofficeRealDataApi as typeof backofficeRealDataApi & Record<string, (...args: never[]) => Promise<unknown>>;

    expect(api.customers).toBeTypeOf("function");
    expect(api.services).toBeTypeOf("function");
    expect(api.createService).toBeTypeOf("function");
    if (!api.customers || !api.services || !api.createService) return;

    await api.customers("merchant-admin" as never, { page: 1 } as never);
    await api.services("merchant-admin" as never, { page: 1 } as never);
    await api.createService("merchant-admin" as never, { categoryId: 1, name: "Aroma", city: "Tokyo", serviceMode: "store", priceAmount: 12000, durationMinutes: 60 } as never);

    expect(httpClient.request).toHaveBeenCalledWith("/merchant-admin/customers", { query: { page: 1 } });
    expect(httpClient.request).toHaveBeenCalledWith("/merchant-admin/services", { query: { page: 1 } });
    expect(httpClient.request).toHaveBeenCalledWith("/merchant-admin/services", expect.objectContaining({ method: "POST" }));
  });

  it("loads selected technician and customer detail by API scope", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await backofficeRealDataApi.technician("backoffice", 31);
    await backofficeRealDataApi.technician("merchant-admin", 31);
    await backofficeRealDataApi.customer("backoffice", 41);
    await backofficeRealDataApi.customer("merchant-admin", 41);

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/backoffice/technicians/31");
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/merchant-admin/technicians/31");
    expect(httpClient.request).toHaveBeenNthCalledWith(3, "/backoffice/customers/41");
    expect(httpClient.request).toHaveBeenNthCalledWith(4, "/merchant-admin/customers/41");
  });

  it("loads and exports the operations technician ranking with the same formal filters", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});
    const query = {
      period: "custom" as const,
      from: "2026-08-01",
      to: "2026-08-31",
      sortBy: "completedOrders" as const,
      sortOrder: "desc" as const,
      keyword: "Mika",
      shopId: 11,
      city: "Tokyo",
      page: 2,
      pageSize: 20
    };
    const api = backofficeRealDataApi as typeof backofficeRealDataApi &
      Record<string, (...args: never[]) => Promise<unknown>>;

    expect(api.technicianRankings).toBeTypeOf("function");
    expect(api.exportTechnicianRankings).toBeTypeOf("function");
    if (!api.technicianRankings || !api.exportTechnicianRankings) return;

    await api.technicianRankings(query as never);
    await api.exportTechnicianRankings(query as never);

    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      "/backoffice/technician-rankings",
      { query }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/backoffice/technician-rankings/export",
      { query }
    );
  });

  it("updates the authenticated merchant shop without accepting a shop id", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await backofficeRealDataApi.updateMerchantShop({
      name: "Updated Studio",
      description: "Updated profile",
      city: "Yokohama"
    });

    expect(httpClient.request).toHaveBeenCalledWith("/merchant-admin/shop", {
      body: { name: "Updated Studio", description: "Updated profile", city: "Yokohama" },
      method: "PATCH"
    });
  });

  it.each([
    ["pending", "unpaid"],
    ["confirmed", "paid"],
    ["refundPending", "paid"],
    ["refunded", "refunded"]
  ] as const)("maps formal payment status %s for the current order UI", (paymentStatus, expected) => {
    const order: BackofficeOrderPayload = {
      id: 1,
      orderNo: "ND-1",
      status: "confirmed",
      paymentStatus,
      customerUserId: 1,
      customerName: "Customer",
      serviceId: 1,
      serviceName: "Service",
      shopId: 1,
      shopName: "Shop",
      technicianProfileId: null,
      technicianName: null,
      fulfillmentMode: "store",
      priceAmount: 9800,
      currency: "JPY",
      startsAt: "2026-08-25T01:00:00.000Z",
      endsAt: "2026-08-25T02:00:00.000Z",
      note: null,
      cancelReason: null,
      createdAt: "2026-08-24T01:00:00.000Z",
      updatedAt: "2026-08-25T01:00:00.000Z"
    };

    expect(mapBackofficeOrder(order).paymentStatus).toBe(expected);
  });
});
