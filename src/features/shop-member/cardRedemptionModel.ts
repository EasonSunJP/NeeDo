export type CardRedemptionAttempt = {
  orderNo: string;
  idempotencyKey: string;
};

export function buildCardRedemptionAttempt(
  previous: CardRedemptionAttempt | null,
  rawOrderNo: string,
  createIdempotencyKey: () => string
): CardRedemptionAttempt {
  const orderNo = rawOrderNo.trim();
  if (!orderNo || orderNo.length > 40) throw new Error("order");
  if (previous?.orderNo === orderNo) return previous;
  return { orderNo, idempotencyKey: createIdempotencyKey() };
}

export function isCardRedemptionEligible(card: MerchantShopMembershipCard): boolean {
  if (card.status !== "active" || !card.planVersionPublicId || card.pendingAdjustment) return false;
  if (card.type === "stored_value") return (card.principalBalanceJpy ?? 0) > 0;
  if (card.type === "count") return (card.remainingUses ?? 0) > 0;
  return true;
}
import type { MerchantShopMembershipCard } from "./api";
