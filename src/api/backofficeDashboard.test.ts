import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  backofficeRealDataApi,
  type BackofficeDashboardPayload,
  type DashboardPlatformGlobalNdpPair,
  type DashboardQuery,
  type ManageableMerchantShopPayload
} from "./backofficeRealData";
import { httpClient } from "./httpClient";

vi.mock("./httpClient", () => ({ httpClient: { request: vi.fn() } }));

describe("formal dashboard frontend API contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serializes the required default platform period explicitly", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({});

    await backofficeRealDataApi.dashboard("backoffice", { period: "last7days" });

    expect(httpClient.request).toHaveBeenCalledWith("/backoffice/dashboard", {
      query: { period: "last7days" }
    });
  });

  it("serializes the complete custom platform range and city", async () => {
    const query: DashboardQuery = {
      period: "custom",
      from: "2026-08-01",
      to: "2026-08-31",
      city: "Tokyo"
    };
    vi.mocked(httpClient.request).mockResolvedValueOnce({});

    await backofficeRealDataApi.dashboard("backoffice", query);

    expect(httpClient.request).toHaveBeenCalledWith("/backoffice/dashboard", {
      query
    });
  });

  it("never serializes city or an arbitrary shopId for merchant dashboard scope", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({});
    const untrustedQuery = {
      period: "custom",
      from: "2026-08-01",
      to: "2026-08-31",
      city: "Osaka",
      shopId: "999"
    } as DashboardQuery & { shopId: string };

    await backofficeRealDataApi.dashboard("merchant-admin", untrustedQuery);

    expect(httpClient.request).toHaveBeenCalledWith("/merchant-admin/dashboard", {
      query: {
        period: "custom",
        from: "2026-08-01",
        to: "2026-08-31"
      }
    });
  });

  it("uses strict backend pagination names for manageable merchant shops", async () => {
    const page = {
      list: [
        {
          publicId: "shop0000000011",
          name: "Aoyama Care Studio",
          city: "Tokyo",
          status: "published",
          selected: true
        }
      ],
      total: 1,
      page: 2,
      page_size: 50
    };
    vi.mocked(httpClient.request).mockResolvedValueOnce(page);

    await expect(backofficeRealDataApi.manageableMerchantShops(2, 50)).resolves.toBe(page);

    expect(httpClient.request).toHaveBeenCalledWith("/merchant-admin/manageable-shops", {
      query: { page: 2, page_size: 50 }
    });
  });

  it("matches the locked nullable merchant finance and public shop DTO", () => {
    expectTypeOf<ManageableMerchantShopPayload>().toEqualTypeOf<{
      publicId: string;
      name: string;
      city: string;
      status: string;
      selected: boolean;
    }>();
    expectTypeOf<
      BackofficeDashboardPayload["finance"]["walletStock"]
    >().toEqualTypeOf<DashboardPlatformGlobalNdpPair | null>();
    expectTypeOf<
      BackofficeDashboardPayload["finance"]["withdrawn"]
    >().toEqualTypeOf<DashboardPlatformGlobalNdpPair | null>();
    expectTypeOf<
      NonNullable<BackofficeDashboardPayload["shop"]>["publicId"]
    >().toEqualTypeOf<string>();
    expectTypeOf<BackofficeDashboardPayload>().not.toHaveProperty("metrics");
    expectTypeOf<BackofficeDashboardPayload>().not.toHaveProperty("orders");
    expectTypeOf<BackofficeDashboardPayload>().not.toHaveProperty("technicians");
    expectTypeOf<BackofficeDashboardPayload>().not.toHaveProperty("shops");
  });
});
