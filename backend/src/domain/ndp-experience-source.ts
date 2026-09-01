export interface NdpExperienceTransactionFact {
  ledgerTransactionId: number;
  transactionNo: string;
  type: string;
  status: string;
  referenceType: string;
  referenceId: number;
  currency: string;
  occurredAt: Date;
  metadata: unknown;
}

export interface NdpExperienceWalletEntryFact {
  walletOwnerType: string;
  walletOwnerId: number;
  walletCurrency: string;
  direction: string;
  amount: number;
  availableDelta: number;
  frozenDelta: number;
}

export type NdpExperienceSourceClassification =
  | {
      kind: "qualifying_consumption";
      userId: number;
      settledNdp: number;
      ledgerTransactionId: number;
      transactionNo: string;
      occurredAt: Date;
    }
  | {
      kind: "membership_purchase";
      userId: number;
      settledNdp: number;
      ledgerTransactionId: number;
      transactionNo: string;
      entitlementPublicId: string;
      occurredAt: Date;
    }
  | {
      kind: "reversal";
      userId: number;
      reversedNdp: number;
      ledgerTransactionId: number;
      transactionNo: string;
      originalLedgerTransactionNo: string;
      occurredAt: Date;
    }
  | {
      kind: "ineligible";
      reason:
        | "not_applied_ndp"
        | "not_user_wallet"
        | "not_final_debit_or_credit"
        | "unsupported_settlement"
        | "invalid_membership_reference"
        | "invalid_reversal_reference";
    };

const QUALIFYING_SETTLEMENTS = new Set([
  "booking_complete_settlement:booking_order:service",
  "service_consumption_settlement:service_order:service",
  "product_consumption_settlement:product_order:product"
]);

const REVERSAL_SETTLEMENTS = new Set([
  "booking_consumption_refund:booking_order_refund",
  "service_consumption_refund:service_order_refund",
  "product_consumption_refund:product_order_refund"
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRANSACTION_NO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/;

const metadataValue = (metadata: unknown, key: string): unknown => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }
  return (metadata as Record<string, unknown>)[key];
};

const isPositiveInteger = (value: number): boolean => Number.isSafeInteger(value) && value > 0;

const finalDebitAmount = (entry: NdpExperienceWalletEntryFact): number | null => {
  if (!isPositiveInteger(entry.amount)) {
    return null;
  }
  if (
    entry.direction === "available_debit" &&
    entry.availableDelta === -entry.amount &&
    entry.frozenDelta === 0
  ) {
    return entry.amount;
  }
  if (
    entry.direction === "frozen_debit" &&
    entry.availableDelta === 0 &&
    entry.frozenDelta === -entry.amount
  ) {
    return entry.amount;
  }
  return null;
};

const finalCreditAmount = (entry: NdpExperienceWalletEntryFact): number | null => {
  if (!isPositiveInteger(entry.amount)) {
    return null;
  }
  if (
    entry.direction === "available_credit" &&
    entry.availableDelta === entry.amount &&
    entry.frozenDelta === 0
  ) {
    return entry.amount;
  }
  return null;
};

export const classifyExperienceSource = (
  transaction: NdpExperienceTransactionFact,
  userEntry: NdpExperienceWalletEntryFact
): NdpExperienceSourceClassification => {
  if (
    transaction.status !== "applied" ||
    transaction.currency !== "NDP" ||
    userEntry.walletCurrency !== "NDP"
  ) {
    return { kind: "ineligible", reason: "not_applied_ndp" };
  }
  if (userEntry.walletOwnerType !== "user" || !isPositiveInteger(userEntry.walletOwnerId)) {
    return { kind: "ineligible", reason: "not_user_wallet" };
  }

  const settlementKey = `${transaction.type}:${transaction.referenceType}`;
  if (
    transaction.type === "platform_membership_purchase" &&
    transaction.referenceType === "platform_membership_entitlement"
  ) {
    const settledNdp = finalDebitAmount(userEntry);
    const entitlementPublicId = metadataValue(transaction.metadata, "entitlementPublicId");
    if (!settledNdp) {
      return { kind: "ineligible", reason: "not_final_debit_or_credit" };
    }
    if (typeof entitlementPublicId !== "string" || !UUID_PATTERN.test(entitlementPublicId)) {
      return { kind: "ineligible", reason: "invalid_membership_reference" };
    }
    return {
      kind: "membership_purchase",
      userId: userEntry.walletOwnerId,
      settledNdp,
      ledgerTransactionId: transaction.ledgerTransactionId,
      transactionNo: transaction.transactionNo,
      entitlementPublicId,
      occurredAt: transaction.occurredAt
    };
  }

  if (REVERSAL_SETTLEMENTS.has(settlementKey)) {
    const reversedNdp = finalCreditAmount(userEntry);
    const originalLedgerTransactionNo = metadataValue(
      transaction.metadata,
      "originalLedgerTransactionNo"
    );
    if (!reversedNdp) {
      return { kind: "ineligible", reason: "not_final_debit_or_credit" };
    }
    if (
      typeof originalLedgerTransactionNo !== "string" ||
      !TRANSACTION_NO_PATTERN.test(originalLedgerTransactionNo)
    ) {
      return { kind: "ineligible", reason: "invalid_reversal_reference" };
    }
    return {
      kind: "reversal",
      userId: userEntry.walletOwnerId,
      reversedNdp,
      ledgerTransactionId: transaction.ledgerTransactionId,
      transactionNo: transaction.transactionNo,
      originalLedgerTransactionNo,
      occurredAt: transaction.occurredAt
    };
  }

  const consumptionKind = metadataValue(transaction.metadata, "experienceConsumptionKind");
  if (
    typeof consumptionKind !== "string" ||
    !QUALIFYING_SETTLEMENTS.has(`${settlementKey}:${consumptionKind}`)
  ) {
    return { kind: "ineligible", reason: "unsupported_settlement" };
  }
  const settledNdp = finalDebitAmount(userEntry);
  if (!settledNdp) {
    return { kind: "ineligible", reason: "not_final_debit_or_credit" };
  }
  return {
    kind: "qualifying_consumption",
    userId: userEntry.walletOwnerId,
    settledNdp,
    ledgerTransactionId: transaction.ledgerTransactionId,
    transactionNo: transaction.transactionNo,
    occurredAt: transaction.occurredAt
  };
};
