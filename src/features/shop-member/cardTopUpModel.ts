import type {
  MerchantShopMembershipCard,
  ShopMembershipCardTopUpPaymentMethod,
  ShopMembershipCardTopUpRequest
} from "./api";

export type CardTopUpEditor = {
  amountJpy: string;
  paymentMethod: ShopMembershipCardTopUpPaymentMethod;
  paymentReference: string;
  note: string;
};

export type CardTopUpAttempt = {
  signature: string;
  idempotencyKey: string;
  request: ShopMembershipCardTopUpRequest;
};

const paymentMethods = new Set<ShopMembershipCardTopUpPaymentMethod>([
  "cash",
  "card",
  "paypay",
  "bank_transfer",
  "other"
]);

export function createCardTopUpEditor(): CardTopUpEditor {
  return { amountJpy: "", paymentMethod: "cash", paymentReference: "", note: "" };
}

export function isCardTopUpEligible(card: MerchantShopMembershipCard): boolean {
  return card.type === "stored_value"
    && card.status === "active"
    && card.principalBalanceJpy !== null
    && card.pendingAdjustment === null;
}

function assertEligible(card: MerchantShopMembershipCard): void {
  if (card.type !== "stored_value") throw new Error("type");
  if (card.status !== "active" || card.principalBalanceJpy === null) throw new Error("state");
  if (card.pendingAdjustment !== null) throw new Error("pending");
}

export function buildCardTopUpAttempt(
  previous: CardTopUpAttempt | null,
  card: MerchantShopMembershipCard,
  editor: CardTopUpEditor,
  createKey: () => string
): CardTopUpAttempt {
  assertEligible(card);
  const normalizedAmount = editor.amountJpy.trim();
  if (!/^\d+$/.test(normalizedAmount)) throw new Error("amount");
  const amountJpy = Number(normalizedAmount);
  if (!Number.isSafeInteger(amountJpy) || amountJpy < 1 || amountJpy > 10_000_000) throw new Error("amount");
  if (!paymentMethods.has(editor.paymentMethod)) throw new Error("paymentMethod");
  const paymentReference = editor.paymentReference.trim() || null;
  const note = editor.note.trim() || null;
  if (!paymentReference && !note) throw new Error("evidence");
  if ((paymentReference?.length ?? 0) > 160 || (note?.length ?? 0) > 500) throw new Error("evidence");
  const nextKey = createKey().trim();
  if (nextKey.length < 8 || nextKey.length > 160) throw new Error("idempotency");
  const signature = JSON.stringify({ cardPublicId: card.publicId, amountJpy, paymentMethod: editor.paymentMethod, paymentReference, note });
  const idempotencyKey = previous?.signature === signature ? previous.idempotencyKey : nextKey;
  return {
    signature,
    idempotencyKey,
    request: { amountJpy, paymentMethod: editor.paymentMethod, paymentReference, note, idempotencyKey }
  };
}
