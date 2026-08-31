import type { MerchantShopContextRepositoryPort } from "../../src/repositories/merchant-shop-context.repository";

interface DirectShopContextOptions {
  shopId?: number;
  shopPublicId?: string;
  name?: string;
  city?: string;
  status?: string;
}

interface MerchantAccountMembership extends Required<
  Pick<DirectShopContextOptions, "shopPublicId">
> {
  merchantAccountId: number;
  shopId: number;
  name?: string;
  city?: string;
  status?: string;
}

interface MerchantAccountShopContextOptions extends MerchantAccountMembership {
  additionalMemberships?: MerchantAccountMembership[];
}

const shopRow = (input: {
  shopId: number;
  shopPublicId?: string;
  name?: string;
  city?: string;
  status?: string;
}) => ({
  publicId: input.shopPublicId ?? `shop${String(input.shopId).padStart(10, "0")}`,
  name: input.name ?? "Authenticated shop",
  city: input.city ?? "Tokyo",
  status: input.status ?? "published",
  selected: true
});

export const createDirectShopContextRepository = (
  options: DirectShopContextOptions = {}
): MerchantShopContextRepositoryPort => ({
  listManageableShops: jest.fn(async (input) => {
    const directShop =
      input.identityScopeType === "shop" &&
      (options.shopId === undefined || input.identityScopeId === options.shopId);
    const resolvedShopId = options.shopId ?? input.identityScopeId;
    return {
      list: directShop && input.page === 1 ? [shopRow({ ...options, shopId: resolvedShopId })] : [],
      total: directShop ? 1 : 0,
      page: input.page,
      page_size: input.pageSize
    };
  }),
  resolveShop: jest.fn(async () => null),
  resolveDefaultShop: jest.fn(async () => null)
});

export const createMerchantAccountShopContextRepository = (
  options: MerchantAccountShopContextOptions
): MerchantShopContextRepositoryPort => {
  const memberships = [options, ...(options.additionalMemberships ?? [])];
  return {
    listManageableShops: jest.fn(async (input) => {
      const membership = memberships.find((item) =>
        input.identityScopeType === "merchant_account"
          ? item.merchantAccountId === input.identityScopeId
          : input.identityScopeType === "shop" && item.shopId === input.identityScopeId
      );
      return {
        list: membership && input.page === 1 ? [shopRow(membership)] : [],
        total: membership ? 1 : 0,
        page: input.page,
        page_size: input.pageSize
      };
    }),
    resolveShop: jest.fn(async (input) => {
      const membership = memberships.find(
        (item) =>
          item.merchantAccountId === input.merchantAccountId &&
          item.shopPublicId === input.shopPublicId
      );
      return membership
        ? { shopId: membership.shopId, shopPublicId: membership.shopPublicId }
        : null;
    }),
    resolveDefaultShop: jest.fn(async (input) => {
      const membership = memberships.find(
        (item) => item.merchantAccountId === input.merchantAccountId
      );
      return membership
        ? { shopId: membership.shopId, shopPublicId: membership.shopPublicId }
        : null;
    })
  };
};
