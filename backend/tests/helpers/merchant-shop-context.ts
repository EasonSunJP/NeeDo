import type { MerchantShopContextRepositoryPort } from "../../src/repositories/merchant-shop-context.repository";

export const createDirectShopContextRepository = (): MerchantShopContextRepositoryPort => ({
  listManageableShops: jest.fn(async (input) => {
    const directShop = input.identityScopeType === "shop";
    return {
      list:
        directShop && input.page === 1
          ? [
              {
                publicId: `shop${String(input.identityScopeId).padStart(10, "0")}`,
                name: "Authenticated shop",
                city: "Tokyo",
                status: "published",
                selected: true
              }
            ]
          : [],
      total: directShop ? 1 : 0,
      page: input.page,
      page_size: input.pageSize
    };
  }),
  resolveShop: jest.fn(async () => null),
  resolveDefaultShop: jest.fn(async () => null)
});
