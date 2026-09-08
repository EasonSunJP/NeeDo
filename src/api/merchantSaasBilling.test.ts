import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantGroupCard, ShopCard } from "../features/merchant-saas-billing/model";
import { merchantSaasBillingApi, refreshMerchantAccountCard } from "./merchantSaasBilling";
import { httpClient } from "./httpClient";

vi.mock("./httpClient", () => ({ httpClient: { request: vi.fn() } }));

describe("merchant SaaS billing detail contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refreshes a group through its formal account detail endpoint", async () => {
    const group = { id: 9, type: "merchant_group" } as MerchantGroupCard;
    vi.mocked(httpClient.request).mockResolvedValueOnce(group);

    await expect(refreshMerchantAccountCard(group)).resolves.toBe(group);
    expect(httpClient.request).toHaveBeenCalledWith("/backoffice/merchant-accounts/9");
  });

  it("refreshes a shop through its formal SaaS account detail endpoint", async () => {
    const shop = { id: 11, type: "shop" } as ShopCard;
    vi.mocked(httpClient.request).mockResolvedValueOnce(shop);

    await expect(refreshMerchantAccountCard(shop)).resolves.toBe(shop);
    expect(httpClient.request).toHaveBeenCalledWith("/backoffice/shops/11/saas-account");
    expect(merchantSaasBillingApi.getShopAccount).toBeTypeOf("function");
  });
});
