import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  backofficeRealDataApi,
  type BackofficeDashboardPayload,
  type DashboardPlatformGlobalNdpPair,
  type DashboardQuery,
  type ManageableMerchantShopPayload,
} from "./backofficeRealData";
import { httpClient } from "./httpClient";

vi.mock("./httpClient", () => ({ httpClient: { request: vi.fn() } }));

describe("formal dashboard frontend API contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serializes the required default platform period explicitly", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({});

    await backofficeRealDataApi.dashboard("backoffice", {
      period: "last7days",
    });

    expect(httpClient.request).toHaveBeenCalledWith("/backoffice/dashboard", {
      query: { period: "last7days" },
    });
  });

  it("serializes the complete custom platform range and city", async () => {
    const query: DashboardQuery = {
      period: "custom",
      from: "2026-08-01",
      to: "2026-08-31",
      city: "Tokyo",
    };
    vi.mocked(httpClient.request).mockResolvedValueOnce({});

    await backofficeRealDataApi.dashboard("backoffice", query);

    expect(httpClient.request).toHaveBeenCalledWith("/backoffice/dashboard", {
      query,
    });
  });

  it("whitelists platform query fields and removes non-custom boundaries", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({});
    const untrustedQuery = {
      period: "month",
      from: "2026-08-01",
      to: "2026-08-31",
      city: "Tokyo",
      shopId: "999",
      unknown: "must-not-leave-client",
    } as DashboardQuery & { shopId: string; unknown: string };

    await backofficeRealDataApi.dashboard("backoffice", untrustedQuery);

    expect(httpClient.request).toHaveBeenCalledWith("/backoffice/dashboard", {
      query: { period: "month", city: "Tokyo" },
    });
  });

  it("rejects a custom query unless both formal boundaries are present", () => {
    expect(() =>
      backofficeRealDataApi.dashboard("backoffice", {
        period: "custom",
        from: "2026-08-01",
      }),
    ).toThrow("error.dashboard.custom_range_required");
    expect(() =>
      backofficeRealDataApi.dashboard("merchant-admin", {
        period: "custom",
        to: "2026-08-31",
      }),
    ).toThrow("error.dashboard.custom_range_required");
    expect(httpClient.request).not.toHaveBeenCalled();
  });

  it("never serializes city or an arbitrary shopId for merchant dashboard scope", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({});
    const untrustedQuery = {
      period: "custom",
      from: "2026-08-01",
      to: "2026-08-31",
      city: "Osaka",
      shopId: "999",
    } as DashboardQuery & { shopId: string };

    await backofficeRealDataApi.dashboard("merchant-admin", untrustedQuery);

    expect(httpClient.request).toHaveBeenCalledWith(
      "/merchant-admin/dashboard",
      {
        query: {
          period: "custom",
          from: "2026-08-01",
          to: "2026-08-31",
        },
      },
    );
  });

  it("forwards the caller abort signal without adding it to the query", async () => {
    const controller = new AbortController();
    vi.mocked(httpClient.request).mockResolvedValueOnce({});

    await backofficeRealDataApi.dashboard(
      "merchant-admin",
      { period: "last7days" },
      { signal: controller.signal },
    );

    expect(httpClient.request).toHaveBeenCalledWith(
      "/merchant-admin/dashboard",
      {
        query: { period: "last7days" },
        signal: controller.signal,
      },
    );
  });

  it("uses strict backend pagination names for manageable merchant shops", async () => {
    const page = {
      list: [
        {
          publicId: "shop0000000011",
          name: "Aoyama Care Studio",
          city: "Tokyo",
          status: "published",
          selected: true,
        },
      ],
      total: 1,
      page: 2,
      page_size: 50,
    };
    vi.mocked(httpClient.request).mockResolvedValueOnce(page);

    await expect(
      backofficeRealDataApi.manageableMerchantShops(2, 50),
    ).resolves.toEqual(page);

    expect(httpClient.request).toHaveBeenCalledWith(
      "/merchant-admin/manageable-shops",
      {
        query: { page: 2, page_size: 50 },
      },
    );
  });

  it("projects manageable shops to the locked safe fields", async () => {
    vi.mocked(httpClient.request).mockResolvedValueOnce({
      list: [
        {
          id: 99,
          ownerUserId: 7,
          publicId: "shop0000000011",
          name: "Aoyama Care Studio",
          city: "Tokyo",
          status: "published",
          selected: true,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
    });

    await expect(
      backofficeRealDataApi.manageableMerchantShops(),
    ).resolves.toEqual({
      list: [
        {
          publicId: "shop0000000011",
          name: "Aoyama Care Studio",
          city: "Tokyo",
          status: "published",
          selected: true,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
    });
  });

  it.each([
    [{ list: [], total: 0, page: 0, page_size: 20 }],
    [{ list: [], total: 0, page: 1, page_size: 0 }],
    [
      {
        list: [
          {
            publicId: "11",
            name: "Aoyama Care Studio",
            city: "Tokyo",
            status: "published",
            selected: true,
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
      },
    ],
    [
      {
        list: [
          {
            publicId: "shop0000000011",
            name: "Aoyama Care Studio",
            city: "Tokyo",
            status: "published",
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
      },
    ],
  ])(
    "rejects an unsafe manageable-shop page without exposing partial fields",
    async (page) => {
      vi.mocked(httpClient.request).mockResolvedValueOnce(page);

      await expect(
        backofficeRealDataApi.manageableMerchantShops(),
      ).rejects.toThrow("error.api");
    },
  );

  it.each([
    [0, 20],
    [1, 0],
    [1, 101],
    [1.5, 20],
  ])(
    "rejects invalid manageable-shop pagination before the request (%s, %s)",
    async (page, pageSize) => {
      await expect(
        backofficeRealDataApi.manageableMerchantShops(page, pageSize),
      ).rejects.toThrow("error.pagination.invalid");
      expect(httpClient.request).not.toHaveBeenCalled();
    },
  );

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
    expectTypeOf<BackofficeDashboardPayload>().not.toHaveProperty(
      "technicians",
    );
    expectTypeOf<BackofficeDashboardPayload>().not.toHaveProperty("shops");
  });
});
