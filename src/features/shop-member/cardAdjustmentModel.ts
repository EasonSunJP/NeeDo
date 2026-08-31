import type {
  MerchantShopMembershipCard,
  ShopMembershipCardAdjustmentRequest
} from "./api";

export type CardAdjustmentEditor = { targetValue: string; reason: string };
export type CardAdjustmentAttempt = {
  signature: string;
  idempotencyKey: string;
  request: ShopMembershipCardAdjustmentRequest;
};

export function createCardAdjustmentEditor(): CardAdjustmentEditor {
  return { targetValue: "", reason: "" };
}

function parseTarget(value: string): number {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) throw new Error("value");
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 2_147_483_647) {
    throw new Error("value");
  }
  return parsed;
}

export function buildCardAdjustmentAttempt(
  previous: CardAdjustmentAttempt | null,
  card: MerchantShopMembershipCard,
  editor: CardAdjustmentEditor,
  createKey: () => string
): CardAdjustmentAttempt {
  if (card.status !== "active") throw new Error("state");
  if (card.type === "benefit") throw new Error("type");
  const reason = editor.reason.trim();
  if (!reason || reason.length > 500) throw new Error("reason");
  const targetValue = parseTarget(editor.targetValue);
  const currentValue = card.type === "stored_value" ? card.principalBalanceJpy : card.remainingUses;
  if (currentValue === null) throw new Error("state");
  if (targetValue === currentValue) throw new Error("unchanged");
  const provisional: ShopMembershipCardAdjustmentRequest = {
    targetPrincipalBalanceJpy: card.type === "stored_value" ? targetValue : null,
    targetRemainingUses: card.type === "count" ? targetValue : null,
    reason,
    idempotencyKey: createKey().trim()
  };
  if (provisional.idempotencyKey.length < 8 || provisional.idempotencyKey.length > 160) {
    throw new Error("idempotency");
  }
  const signature = JSON.stringify({
    cardPublicId: card.publicId,
    targetPrincipalBalanceJpy: provisional.targetPrincipalBalanceJpy,
    targetRemainingUses: provisional.targetRemainingUses,
    reason
  });
  const idempotencyKey = previous?.signature === signature
    ? previous.idempotencyKey
    : provisional.idempotencyKey;
  return { signature, idempotencyKey, request: { ...provisional, idempotencyKey } };
}

export function formatAdjustmentDeadline(expiresAt: string, now = new Date()): string {
  const deadline = new Date(expiresAt);
  if (Number.isNaN(deadline.getTime()) || deadline <= now) return "已截止";
  const hours = Math.ceil((deadline.getTime() - now.getTime()) / 3_600_000);
  if (hours <= 72) return `剩余约 ${hours} 小时`;
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(deadline);
}
