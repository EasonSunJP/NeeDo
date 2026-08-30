import { ERROR_CODES } from "../constants/error-codes";
import type { MerchantShopContextRepositoryPort } from "../repositories/merchant-shop-context.repository";
import { AppError } from "../utils/app-error";

export interface MerchantShopIdentityScope {
  scopeType: string | null;
  scopeId: number | null;
}

export interface ResolvedMerchantShopScope {
  shopId: number;
  shopPublicId: string;
  tokenMerchantShopPublicId?: string;
}

export const merchantShopIdentityForbidden = (): AppError =>
  new AppError({
    code: ERROR_CODES.IDENTITY_FORBIDDEN,
    message: "error.identity.forbidden",
    statusCode: 403
  });

export const resolveMerchantShopScope = async (input: {
  repository: MerchantShopContextRepositoryPort;
  identity: MerchantShopIdentityScope;
  merchantShopPublicId?: string;
  now?: Date;
}): Promise<ResolvedMerchantShopScope | null> => {
  const now = input.now ?? new Date();
  if (input.identity.scopeType === "merchant_account") {
    if (!input.identity.scopeId) throw merchantShopIdentityForbidden();
    const resolved = input.merchantShopPublicId
      ? await input.repository.resolveShop({
          merchantAccountId: input.identity.scopeId,
          shopPublicId: input.merchantShopPublicId,
          now
        })
      : await input.repository.resolveDefaultShop({
          merchantAccountId: input.identity.scopeId,
          now
        });
    if (!resolved) throw merchantShopIdentityForbidden();
    return { ...resolved, tokenMerchantShopPublicId: resolved.shopPublicId };
  }

  if (input.identity.scopeType === "shop") {
    if (!input.identity.scopeId) throw merchantShopIdentityForbidden();
    const page = await input.repository.listManageableShops({
      identityScopeType: "shop",
      identityScopeId: input.identity.scopeId,
      selectedShopPublicId: null,
      now,
      page: 1,
      pageSize: 1
    });
    const ownShop = page.list[0];
    if (!ownShop || page.total !== 1) throw merchantShopIdentityForbidden();
    return { shopId: input.identity.scopeId, shopPublicId: ownShop.publicId };
  }

  return null;
};
