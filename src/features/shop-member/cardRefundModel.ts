export type CardRefundAttempt = {
  redemptionPublicId: string;
  reason: string;
  idempotencyKey: string;
};

export function buildCardRefundAttempt(
  current: CardRefundAttempt | null,
  redemptionPublicId: string,
  reason: string,
  createKey: () => string
): CardRefundAttempt {
  const normalized = {
    redemptionPublicId: redemptionPublicId.trim(),
    reason: reason.trim()
  };
  if (
    current
    && current.redemptionPublicId === normalized.redemptionPublicId
    && current.reason === normalized.reason
  ) return current;
  return { ...normalized, idempotencyKey: createKey() };
}
