import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  backofficeRealDataApi,
  mapBackofficeOrder,
  type BackofficeOrderPayload,
  type BackofficeTechnicianRankingPayload,
  type CsvExportPayload,
  type TechnicianRankingQuery
} from "./backofficeRealData";
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
    await backofficeRealDataApi.customerTimeline("backoffice", 41, 2, 30);
    await backofficeRealDataApi.customerTimeline("merchant-admin", 41, 3, 50);
    await backofficeRealDataApi.assignCustomerMembership(41, {
      membershipLevel: "gold",
      grantMode: "operator_complimentary",
      durationUnit: "month",
      durationValue: 3,
      startsAt: "2026-08-29T00:00:00.000Z"
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/backoffice/technicians/31");
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/merchant-admin/technicians/31");
    expect(httpClient.request).toHaveBeenNthCalledWith(3, "/backoffice/customers/41");
    expect(httpClient.request).toHaveBeenNthCalledWith(4, "/merchant-admin/customers/41");
    expect(httpClient.request).toHaveBeenNthCalledWith(
      5,
      "/backoffice/customers/41/timeline",
      { query: { page: 2, pageSize: 30 } },
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      6,
      "/merchant-admin/customers/41/timeline",
      { query: { page: 3, pageSize: 50 } },
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      7,
      "/backoffice/customers/41/membership",
      {
        body: {
          membershipLevel: "gold",
          grantMode: "operator_complimentary",
          durationUnit: "month",
          durationValue: 3,
          startsAt: "2026-08-29T00:00:00.000Z"
        },
        method: "PUT"
      }
    );
  });

  it("loads and exports the operations technician ranking with the complete formal query", async () => {
    const query: TechnicianRankingQuery = {
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
    const ranking: BackofficeTechnicianRankingPayload = {
      list: [],
      total: 0,
      page: 2,
      page_size: 20,
      summary: {
        technicianCount: 0,
        completedServiceAmountJpy: 0,
        completedOrderCount: 0,
        workingDayCount: 0
      },
      period: {
        key: "custom",
        timeZone: "Asia/Tokyo",
        from: "2026-08-01",
        to: "2026-08-31"
      }
    };
    const csvExport: CsvExportPayload = {
      filename: "technician-rankings-custom-2026-08-01_2026-08-31.csv",
      contentType: "text/csv; charset=utf-8",
      content: "rank,displayName\n"
    };
    vi.mocked(httpClient.request)
      .mockResolvedValueOnce(ranking)
      .mockResolvedValueOnce(csvExport);

    await expect(backofficeRealDataApi.technicianRankings(query)).resolves.toBe(ranking);
    await expect(backofficeRealDataApi.exportTechnicianRankings(query)).resolves.toBe(csvExport);

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

  it("uses the formal operations affiliate task review endpoints", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});
    const query = {
      keyword: "Shibuya",
      page: 2,
      pageSize: 20,
      publisherType: "shop" as const,
      status: "pending_review" as const
    };

    await backofficeRealDataApi.affiliateTasks(query);
    await backofficeRealDataApi.affiliateTask(81);
    await backofficeRealDataApi.approveAffiliateTask(81);
    await backofficeRealDataApi.rejectAffiliateTask(81, "范围快照需要重新提交");

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/backoffice/affiliate/tasks", {
      query
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/backoffice/affiliate/tasks/81");
    expect(httpClient.request).toHaveBeenNthCalledWith(
      3,
      "/backoffice/affiliate/tasks/81/approve",
      { method: "POST" }
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      4,
      "/backoffice/affiliate/tasks/81/reject",
      { body: { reason: "范围快照需要重新提交" }, method: "POST" }
    );
  });

  it("preserves an empty ranking query for the shared http client", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await backofficeRealDataApi.technicianRankings({});
    await backofficeRealDataApi.exportTechnicianRankings({});

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/backoffice/technician-rankings", {
      query: {}
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/backoffice/technician-rankings/export",
      { query: {} }
    );
  });

  it("passes undefined ranking filters to the shared http client for serialization", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});
    const query: TechnicianRankingQuery = {
      period: "month",
      from: undefined,
      to: undefined,
      sortBy: "revenue",
      keyword: undefined,
      shopId: undefined,
      city: undefined,
      page: 1,
      pageSize: 20
    };

    await backofficeRealDataApi.technicianRankings(query);
    await backofficeRealDataApi.exportTechnicianRankings(query);

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/backoffice/technician-rankings", {
      query
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/backoffice/technician-rankings/export",
      { query }
    );
  });

  it("propagates list and export errors without adapter fallback behavior", async () => {
    const listError = new Error("error.forbidden");
    const exportError = new Error("error.network.timeout");
    vi.mocked(httpClient.request)
      .mockRejectedValueOnce(listError)
      .mockRejectedValueOnce(exportError);

    await expect(backofficeRealDataApi.technicianRankings({ period: "month" })).rejects.toBe(
      listError
    );
    await expect(backofficeRealDataApi.exportTechnicianRankings({ period: "month" })).rejects.toBe(
      exportError
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
