import { describe, expect, it, vi } from "vitest";
import { loadCurrentMerchantShopServices } from "./shopServiceCatalog";
import type { BackofficeServicePayload } from "../../api/backofficeRealData";

function service(
  id: number,
  overrides: Partial<BackofficeServicePayload> = {}
): BackofficeServicePayload {
  return {
    id,
    categoryId: 1,
    categoryName: "Massage",
    shopId: 9,
    shopName: "Shop",
    technicianProfileId: null,
    name: `Service ${id}`,
    description: null,
    city: "Tokyo",
    serviceMode: "store",
    priceAmount: 8_800,
    currency: "JPY",
    durationMinutes: 60,
    status: "published",
    isRecommended: false,
    sortOrder: id,
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    ...overrides
  };
}

describe("merchant shop service catalog", () => {
  it("collects every page and counts only current shop services", async () => {
    const listPage = vi.fn()
      .mockResolvedValueOnce({
        list: [service(79), service(700, { technicianProfileId: 31 })],
        total: 4,
        page: 1,
        page_size: 2
      })
      .mockResolvedValueOnce({
        list: [service(80), service(701, { status: "archived" })],
        total: 4,
        page: 2,
        page_size: 2
      });

    await expect(loadCurrentMerchantShopServices(listPage, 2)).resolves.toEqual([
      expect.objectContaining({ id: 79 }),
      expect.objectContaining({ id: 80 })
    ]);
    expect(listPage).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 2 });
    expect(listPage).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 2 });
  });
});
