import { beforeEach, describe, expect, it, vi } from "vitest";
import { backofficeRealDataApi } from "./backofficeRealData";
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
});
