import { ERROR_CODES } from "../constants/error-codes";
import type { MerchantShopContextRepositoryPort } from "../repositories/merchant-shop-context.repository";
import { AppError } from "../utils/app-error";

export interface MerchantShopIdentityScope {
  type: string;
  scopeType: string | null;
  scopeId: number | null;
}

export const FORMAL_DIRECT_SHOP_MERCHANT_IDENTITY_TYPES: ReadonlySet<string> = new Set([
  "merchant",
  "merchant_owner",
  "merchant_staff"
]);

export const FORMAL_MERCHANT_ACCOUNT_IDENTITY_TYPES: ReadonlySet<string> = new Set([
  "merchant_organization"
]);

export const FORMAL_MERCHANT_IDENTITY_TYPES: ReadonlySet<string> = new Set([
  ...FORMAL_DIRECT_SHOP_MERCHANT_IDENTITY_TYPES,
  ...FORMAL_MERCHANT_ACCOUNT_IDENTITY_TYPES
]);

export type FormalMerchantIdentityKind = "merchant_account" | "shop";

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

export const resolveFormalMerchantIdentityKind = (
  identity: MerchantShopIdentityScope
): FormalMerchantIdentityKind | null => {
  const hasMerchantType = FORMAL_MERCHANT_IDENTITY_TYPES.has(identity.type);
  const claimsMerchantScope =
    identity.scopeType === "merchant_account" || identity.scopeType === "shop";
  if (!hasMerchantType && !claimsMerchantScope) return null;
  if (!identity.scopeId || !Number.isSafeInteger(identity.scopeId)) {
    throw merchantShopIdentityForbidden();
  }
  if (
    identity.scopeType === "merchant_account" &&
    FORMAL_MERCHANT_ACCOUNT_IDENTITY_TYPES.has(identity.type)
  ) {
    return "merchant_account";
  }
  if (
    identity.scopeType === "shop" &&
    FORMAL_DIRECT_SHOP_MERCHANT_IDENTITY_TYPES.has(identity.type)
  ) {
    return "shop";
  }
  throw merchantShopIdentityForbidden();
};

export const resolveMerchantShopScope = async (input: {
  repository: MerchantShopContextRepositoryPort;
  identity: MerchantShopIdentityScope;
  merchantShopPublicId?: string;
  now?: Date;
}): Promise<ResolvedMerchantShopScope | null> => {
  const now = input.now ?? new Date();
  const merchantIdentityKind = resolveFormalMerchantIdentityKind(input.identity);
  if (merchantIdentityKind === null) return null;
  const scopeId = input.identity.scopeId;
  if (scopeId === null) throw merchantShopIdentityForbidden();

  if (merchantIdentityKind === "merchant_account") {
    const resolved = input.merchantShopPublicId
      ? await input.repository.resolveShop({
          merchantAccountId: scopeId,
          shopPublicId: input.merchantShopPublicId,
          now
        })
      : await input.repository.resolveDefaultShop({
          merchantAccountId: scopeId,
          now
        });
    if (!resolved) throw merchantShopIdentityForbidden();
    return { ...resolved, tokenMerchantShopPublicId: resolved.shopPublicId };
  }

  if (merchantIdentityKind === "shop") {
    const page = await input.repository.listManageableShops({
      identityScopeType: "shop",
      identityScopeId: scopeId,
      selectedShopPublicId: null,
      now,
      page: 1,
      pageSize: 1
    });
    const ownShop = page.list[0];
    if (!ownShop || page.total !== 1) throw merchantShopIdentityForbidden();
    return { shopId: scopeId, shopPublicId: ownShop.publicId };
  }
  throw merchantShopIdentityForbidden();
};
