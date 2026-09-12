import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  backofficeRealDataApi,
  formatBackofficeOrderPaymentSummary,
  mapBackofficeOrder,
  type BackofficeOrderPayload,
  type BackofficeTechnicianRankingPayload,
  type CsvExportPayload,
  type TechnicianRankingQuery
} from "./backofficeRealData";
import { httpClient } from "./httpClient";
import { optimizeImageUpload } from "../lib/image-upload";

vi.mock("./httpClient", () => ({ httpClient: { request: vi.fn() } }));
vi.mock("../lib/image-upload", () => ({ optimizeImageUpload: vi.fn() }));

describe("backofficeRealDataApi master data writes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads the paired NDP summary for the selected Tokyo calendar date", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await backofficeRealDataApi.ndpSummary({ date: "2026-08-30" });

    expect(httpClient.request).toHaveBeenCalledWith("/backoffice/finance/ndp-summary", {
      query: { date: "2026-08-30" }
    });
  });

  it("strictly accepts formal, test, and mixed analytics ranking composition", async () => {
    const query = {
      metric: "gmv" as const,
      period: "last7days" as const,
      page: 1,
      pageSize: 10
    };
    const row = {
      rank: 1,
      entityType: "service",
      entityPublicId: "00000000-0000-4000-8000-000000000001",
      entityNumericId: 1,
      displayName: "Service",
      avatarUrl: null,
      categoryId: 8,
      gmvJpy: 12_300,
      completedCount: 2,
      testGmvJpy: 0,
      testCompletedCount: 0,
      dataComposition: "formal",
      registeredAt: "2026-01-01T00:00:00.000Z"
    };
    const payload = (item: Record<string, unknown>) => ({
      dataStatus: "ready",
      filter: {
        kind: "service",
        metric: "gmv",
        period: "last7days",
        from: "2026-08-26",
        to: "2026-09-01",
        timeZone: "Asia/Tokyo",
        city: null,
        categoryId: null,
        evaluatedAt: "2026-09-01T05:30:00.000Z"
      },
      list: [item],
      total: 1,
      page: 1,
      page_size: 10
    });
    for (const item of [
      row,
      { ...row, testGmvJpy: 12_300, testCompletedCount: 2, dataComposition: "test" },
      { ...row, testGmvJpy: 6_000, testCompletedCount: 1, dataComposition: "mixed" }
    ]) {
      vi.mocked(httpClient.request).mockResolvedValueOnce(payload(item));
      await expect(backofficeRealDataApi.analyticsRankings("service", query)).resolves.toMatchObject({
        list: [expect.objectContaining({ dataComposition: item.dataComposition })]
      });
    }
  });

  it("rejects contradictory analytics ranking composition", async () => {
    const query = {
      metric: "gmv" as const,
      period: "last7days" as const,
      page: 1,
      pageSize: 10
    };
    const row = {
      rank: 1,
      entityType: "service",
      entityPublicId: "00000000-0000-4000-8000-000000000001",
      entityNumericId: 1,
      displayName: "Service",
      avatarUrl: null,
      categoryId: 8,
      gmvJpy: 12_300,
      completedCount: 2,
      testGmvJpy: 6_000,
      testCompletedCount: 1,
      dataComposition: "mixed",
      registeredAt: "2026-01-01T00:00:00.000Z"
    };
    const payload = (item: Record<string, unknown>) => ({
      dataStatus: "ready",
      filter: {
        kind: "service",
        metric: "gmv",
        period: "last7days",
        from: "2026-08-26",
        to: "2026-09-01",
        timeZone: "Asia/Tokyo",
        city: null,
        categoryId: null,
        evaluatedAt: "2026-09-01T05:30:00.000Z"
      },
      list: [item],
      total: 1,
      page: 1,
      page_size: 10
    });
    for (const item of [
      { ...row, dataComposition: "unknown" },
      { ...row, testGmvJpy: row.gmvJpy + 1 },
      { ...row, testCompletedCount: row.completedCount + 1 },
      { ...row, dataComposition: "formal", testCompletedCount: 1 }
    ]) {
      vi.mocked(httpClient.request).mockResolvedValueOnce(payload(item));
      await expect(backofficeRealDataApi.analyticsRankings("service", query)).rejects.toThrow(
        "error.api"
      );
    }
  });

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

  it("uploads only locally optimized merchant presentation media", async () => {
    const original = new File(["original"], "shop.png", { type: "image/png" });
    const optimized = new File(["optimized"], "shop.webp", { type: "image/webp" });
    vi.mocked(optimizeImageUpload).mockResolvedValue({
      file: optimized, height: 800, mimeType: "image/webp", resultBytes: 9,
      sourceBytes: 8, ssim: 0.999, status: "reencoded", width: 1200
    });

    await backofficeRealDataApi.uploadMerchantShopPresentationMedia(original, "店铺");

    expect(optimizeImageUpload).toHaveBeenCalledWith(original, "shop-presentation");
    expect(httpClient.request).toHaveBeenCalledWith("/merchant-admin/shop/presentation/media", {
      body: optimized,
      headers: { "Content-Type": "image/webp" },
      method: "POST",
      query: { alt_text: "店铺" }
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
      customerProfileId: 1,
      customerName: "Customer",
      serviceId: 1,
      serviceName: "Service",
      shopId: 1,
      shopName: "Shop",
      technicianProfileId: null,
      technicianNeedoId: null,
      technicianName: null,
      fulfillmentMode: "store",
      priceAmount: 9800,
      totalAmountJpy: 14_500,
      amountSource: "checkout",
      currency: "JPY",
      paymentMethod: "ndp",
      effectivePaymentMethod: "ndp",
      otherMethodCode: null,
      otherMethodLabel: null,
      checkoutPaymentAmountNdp: 14_500,
      ndpCurrency: "TEST_NDP",
      startsAt: "2026-08-25T01:00:00.000Z",
      endsAt: "2026-08-25T02:00:00.000Z",
      note: null,
      cancelReason: null,
      createdAt: "2026-08-24T01:00:00.000Z",
      updatedAt: "2026-08-25T01:00:00.000Z"
    };

    expect(mapBackofficeOrder(order).paymentStatus).toBe(expected);
  });

  it.each([
    ["NDP", 14_500, "NDP", "14,500 NDP"],
    ["Test NDP", 14_500, "TEST_NDP", "14,500 Test NDP"],
    ["an unresolved NDP unit", null, null, "NDP · UNKNOWN UNIT"]
  ] as const)("formats %s without treating the JPY order total as a token amount", (_label, amount, unit, expected) => {
    expect(formatBackofficeOrderPaymentSummary({
      effectivePaymentMethod: "ndp",
      otherMethodLabel: null,
      checkoutPaymentAmountNdp: amount,
      ndpCurrency: unit
    })).toBe(expected);
  });

  it("does not invent a checkout channel before the customer selects one", () => {
    expect(formatBackofficeOrderPaymentSummary({
      effectivePaymentMethod: null,
      otherMethodLabel: null,
      checkoutPaymentAmountNdp: null,
      ndpCurrency: null
    })).toBe("");
  });

  it("formats an authoritative custom checkout payment label", () => {
    expect(formatBackofficeOrderPaymentSummary({
      effectivePaymentMethod: "other",
      otherMethodLabel: "PayPay",
      checkoutPaymentAmountNdp: null,
      ndpCurrency: null
    })).toBe("PayPay");
  });

  it.each([
    ["onsite", "ONSITE"],
    ["cash", "CASH"],
    ["bank_transfer", "BANK TRANSFER"]
  ] as const)("formats the persisted %s payment channel", (paymentMethod, expected) => {
    expect(formatBackofficeOrderPaymentSummary({
      effectivePaymentMethod: paymentMethod,
      otherMethodLabel: null,
      checkoutPaymentAmountNdp: null,
      ndpCurrency: null
    })).toBe(expected);
  });
});
