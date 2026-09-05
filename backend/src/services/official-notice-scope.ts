import type { AuthenticatedAccessContext } from "./auth.service";
import { merchantShopIdentityForbidden, requireMerchantShopId } from "./merchant-shop-scope";

export type NoticeIssuerScope =
  | { type: "platform" }
  | { type: "shop"; shopId: number; actorUserId: number; actorIdentityId: number };

export type NoticeIssuerReadScope =
  | { type: "platform" }
  | { type: "shop"; shopId: number };

export function resolveNoticeReadScope(
  actor: AuthenticatedAccessContext
): NoticeIssuerReadScope {
  return { type: "shop", shopId: requireMerchantShopId(actor) };
}

export function resolveNoticeIssuerScope(
  actor: AuthenticatedAccessContext,
  issuerType: "platform" | "shop"
): NoticeIssuerScope {
  if (issuerType === "platform") return { type: "platform" };
  if (actor.isReadOnlyMerchantPreview || !actor.currentIdentityId)
    throw merchantShopIdentityForbidden();
  return { type: "shop", shopId: requireMerchantShopId(actor),
    actorUserId: actor.userId, actorIdentityId: actor.currentIdentityId };
}
