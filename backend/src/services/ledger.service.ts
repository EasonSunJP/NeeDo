import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import type {
  FeeCalculationResult,
  FeeCalculationService,
  FeeType,
  FinanceOrderType
} from "./fee-calculation.service";

export type WalletOwnerType = "user" | "shop" | "platform";
export type LedgerCurrency = "NDP";
export type WalletLedgerDirection =
  | "available_credit"
  | "available_debit"
  | "freeze"
  | "unfreeze"
  | "frozen_debit";
export type LedgerTransactionType =
  | "booking_accept_freeze"
  | "booking_cancel_unfreeze"
  | "booking_complete_settlement"
  | "booking_merchant_cancel_compensation"
  | "seed_credit";
export type LedgerTransactionStatus = "applied";
export type FinanceReconciliationStatus = "pending" | "exported";
export type LedgerTransactionClient = unknown;
export type WalletHoldStatus = "active" | "captured" | "released" | "partially_captured";
export type OrderFinancialSettlementStatus =
  | "pending"
  | "holding"
  | "settled"
  | "released"
  | "cancelled"
  | "compensated";

export interface WalletPayload {
  id: number;
  ownerType: WalletOwnerType;
  ownerId: number;
  currency: LedgerCurrency;
  availableBalance: number;
  frozenBalance: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletLedgerPayload {
  id: number;
  transactionId: number;
  walletId: number;
  direction: WalletLedgerDirection;
  amount: number;
  availableDelta: number;
  frozenDelta: number;
  availableBalanceAfter: number;
  frozenBalanceAfter: number;
  reason: string;
  createdAt: Date;
}

export interface LedgerTransactionPayload {
  id: number;
  transactionNo: string;
  idempotencyKey: string;
  type: LedgerTransactionType;
  status: LedgerTransactionStatus;
  referenceType: string;
  referenceId: number;
  actorUserId: number | null;
  amount: number;
  currency: LedgerCurrency;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  entries: WalletLedgerPayload[];
}

export interface FinanceReconciliationPayload {
  id: number;
  transactionId: number;
  transactionNo: string;
  referenceType: string;
  referenceId: number;
  status: FinanceReconciliationStatus;
  currency: LedgerCurrency;
  expectedAmount: number;
  actualAmount: number;
  differenceAmount: number;
  exportedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FinanceReconciliationExportPayload {
  filename: string;
  contentType: "text/csv";
  csv: string;
}

export interface WalletHoldPayload {
  id: number;
  ownerType: WalletOwnerType;
  ownerId: number;
  bookingOrderId: number;
  feeType: FeeType;
  holdAmountNdp: number;
  capturedAmountNdp: number;
  releasedAmountNdp: number;
  status: WalletHoldStatus;
  idempotencyKey: string;
  calculationLogId: number | null;
  metadata: unknown;
  capturedAt: Date | null;
  releasedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderFinancialUpsertInput {
  bookingOrderId: number;
  orderType: FinanceOrderType;
  customerUserId: number;
  shopId: number;
  technicianProfileId?: number | null;
  serviceAmountJpy: number;
  unknownOrUnreportedServiceAmountJpy?: number;
  bPlatformFeeHoldNdp?: number;
  bPlatformFeeActualNdp?: number;
  userRewardNdp?: number;
  penaltyNdp?: number;
  compensationToUserNdp?: number;
  campaignDiscountNdp?: number;
  releasedNdp?: number;
  platformFeePayerType?: string | null;
  platformFeePayerId?: number | null;
  completedOrderOrdinalInPeriod?: number | null;
  appliedFeeRuleIds?: string[];
  timelineEvent?: unknown;
  settlementStatus?: OrderFinancialSettlementStatus;
}

export interface WalletLookupInput {
  ownerType: WalletOwnerType;
  ownerId: number;
  currency?: LedgerCurrency;
}

export interface WalletLedgerListInput extends PaginationInput {
  walletId: number;
}

export interface LedgerTransactionListInput extends PaginationInput {
  type?: LedgerTransactionType;
  referenceType?: string;
  referenceId?: number;
  from?: Date;
  to?: Date;
}

export interface FinanceReconciliationListInput extends PaginationInput {
  status?: FinanceReconciliationStatus;
  referenceType?: string;
  referenceId?: number;
  from?: Date;
  to?: Date;
}

export interface LedgerRepositoryPort {
  runInTransaction: <T>(
    handler: (repository: LedgerRepositoryPort) => Promise<T>,
    transactionClient?: LedgerTransactionClient
  ) => Promise<T>;
  findTransactionByIdempotencyKey: (
    idempotencyKey: string
  ) => Promise<LedgerTransactionPayload | null>;
  getOrCreateWallet: (input: {
    ownerType: WalletOwnerType;
    ownerId: number;
    currency: LedgerCurrency;
  }) => Promise<WalletPayload>;
  applyWalletDelta: (input: {
    walletId: number;
    availableDelta: number;
    frozenDelta: number;
    requireAvailableAtLeast?: number;
    requireFrozenAtLeast?: number;
  }) => Promise<WalletPayload | null>;
  createTransaction: (input: {
    idempotencyKey: string;
    type: LedgerTransactionType;
    referenceType: string;
    referenceId: number;
    actorUserId: number | null;
    amount: number;
    metadata?: unknown;
  }) => Promise<LedgerTransactionPayload>;
  createLedgerEntry: (input: {
    transactionId: number;
    walletId: number;
    direction: WalletLedgerDirection;
    amount: number;
    availableDelta: number;
    frozenDelta: number;
    availableBalanceAfter: number;
    frozenBalanceAfter: number;
    reason: string;
  }) => Promise<WalletLedgerPayload>;
  createFinanceReconciliation: (input: {
    transactionId: number;
    referenceType: string;
    referenceId: number;
    expectedAmount: number;
    actualAmount: number;
  }) => Promise<void>;
  createAuditLog: (input: {
    actorUserId: number | null;
    action: string;
    targetId: number;
    metadata?: unknown;
  }) => Promise<void>;
  findWalletHoldByIdempotencyKey?: (idempotencyKey: string) => Promise<WalletHoldPayload | null>;
  findWalletHold?: (input: {
    bookingOrderId: number;
    ownerType: WalletOwnerType;
    ownerId: number;
    feeType: FeeType;
  }) => Promise<WalletHoldPayload | null>;
  createWalletHold?: (input: {
    ownerType: WalletOwnerType;
    ownerId: number;
    bookingOrderId: number;
    feeType: FeeType;
    holdAmountNdp: number;
    status: WalletHoldStatus;
    idempotencyKey: string;
    calculationLogId: number | null;
    metadata?: unknown;
  }) => Promise<WalletHoldPayload>;
  updateWalletHold?: (input: {
    id: number;
    capturedAmountNdp?: number;
    releasedAmountNdp?: number;
    status: WalletHoldStatus;
    capturedAt?: Date | null;
    releasedAt?: Date | null;
    metadata?: unknown;
  }) => Promise<WalletHoldPayload>;
  upsertOrderFinancial?: (input: OrderFinancialUpsertInput) => Promise<void>;
  findWallet?: (input: WalletLookupInput) => Promise<WalletPayload | null>;
  listWalletLedger?: (
    input: WalletLedgerListInput
  ) => Promise<PaginatedResponse<WalletLedgerPayload>>;
  listLedgerTransactions?: (
    input: LedgerTransactionListInput
  ) => Promise<PaginatedResponse<LedgerTransactionPayload>>;
  listFinanceReconciliation?: (
    input: FinanceReconciliationListInput
  ) => Promise<PaginatedResponse<FinanceReconciliationPayload>>;
  exportFinanceReconciliation?: (
    input: FinanceReconciliationListInput
  ) => Promise<FinanceReconciliationExportPayload>;
}

export interface BookingLedgerSettlementInput {
  bookingOrderId: number;
  orderType: FinanceOrderType;
  shopId: number;
  technicianProfileId?: number | null;
  serviceId?: number | null;
  serviceAmountJpy: number;
  scheduledStartAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;
  customerUserId?: number;
  actorUserId: number | null;
}

export interface LedgerMutationContext {
  transactionClient?: LedgerTransactionClient;
}

export interface BookingLedgerSettlementPort {
  freezeBookingAcceptance: (
    input: BookingLedgerSettlementInput,
    context?: LedgerMutationContext
  ) => Promise<LedgerTransactionPayload | void>;
  releaseBookingHold: (
    input: BookingLedgerSettlementInput,
    context?: LedgerMutationContext
  ) => Promise<LedgerTransactionPayload | void>;
  settleBookingCompletion: (
    input: BookingLedgerSettlementInput & { customerUserId: number },
    context?: LedgerMutationContext
  ) => Promise<LedgerTransactionPayload | void>;
  compensateCustomerForMerchantCancellation: (
    input: BookingLedgerSettlementInput & { customerUserId: number },
    context?: LedgerMutationContext
  ) => Promise<LedgerTransactionPayload | void>;
}

const CURRENCY: LedgerCurrency = "NDP";

export class LedgerService implements BookingLedgerSettlementPort {
  public constructor(
    private readonly repository: LedgerRepositoryPort,
    private readonly feeCalculationService?: Pick<FeeCalculationService, "calculateFee">
  ) {}

  public freezeBookingAcceptance(
    input: BookingLedgerSettlementInput,
    context: LedgerMutationContext = {}
  ): Promise<LedgerTransactionPayload | void> {
    return this.repository.runInTransaction(async (repository) => {
      const idempotencyKey = `booking:${input.bookingOrderId}:accept:freeze`;
      const existing = await repository.findTransactionByIdempotencyKey(idempotencyKey);

      if (existing) {
        return existing;
      }
      const existingHold = await repository.findWalletHoldByIdempotencyKey?.(idempotencyKey);

      if (existingHold) {
        return undefined;
      }

      this.assertFinanceMutationRepository(repository);
      const fee = await this.calculateFee("b_platform_fee", "hold", input, context);
      const holdAmount = fee.holdAmountNdp;

      const wallet = await repository.getOrCreateWallet({
        ownerType: "shop",
        ownerId: input.shopId,
        currency: CURRENCY
      });

      if (wallet.availableBalance < holdAmount) {
        throw this.insufficientAvailableError();
      }

      const updatedWallet =
        holdAmount > 0
          ? await repository.applyWalletDelta({
              walletId: wallet.id,
              availableDelta: -holdAmount,
              frozenDelta: holdAmount,
              requireAvailableAtLeast: holdAmount
            })
          : wallet;

      if (!updatedWallet) {
        throw this.insufficientAvailableError();
      }

      await repository.createWalletHold!({
        ownerType: "shop",
        ownerId: input.shopId,
        bookingOrderId: input.bookingOrderId,
        feeType: "b_platform_fee",
        holdAmountNdp: holdAmount,
        status: "active",
        idempotencyKey,
        calculationLogId: fee.calculationLogId,
        metadata: this.feeMetadata(fee)
      });
      await this.upsertOrderFinancial(repository, input, {
        bPlatformFeeHoldNdp: holdAmount,
        campaignDiscountNdp: fee.campaignDiscountNdp,
        platformFeePayerType: fee.payerType,
        platformFeePayerId: fee.payerId,
        appliedFeeRuleIds: fee.appliedRuleIds,
        settlementStatus: holdAmount > 0 ? "holding" : "pending",
        timelineEvent: {
          action: "booking_accept_hold",
          amountNdp: holdAmount,
          fee
        }
      });

      if (holdAmount === 0) {
        return undefined;
      }

      const transaction = await repository.createTransaction({
        idempotencyKey,
        type: "booking_accept_freeze",
        referenceType: "booking_order",
        referenceId: input.bookingOrderId,
        actorUserId: input.actorUserId,
        amount: holdAmount,
        metadata: { shopId: input.shopId, fee }
      });
      await repository.createLedgerEntry({
        transactionId: transaction.id,
        walletId: wallet.id,
        direction: "freeze",
        amount: holdAmount,
        availableDelta: -holdAmount,
        frozenDelta: holdAmount,
        availableBalanceAfter: updatedWallet.availableBalance,
        frozenBalanceAfter: updatedWallet.frozenBalance,
        reason: "booking_accept_freeze"
      });
      await this.recordFinanceAndAudit(repository, transaction, {
        action: "ledger.booking_accept.freeze",
        expectedAmount: holdAmount,
        actualAmount: holdAmount
      });

      return (await repository.findTransactionByIdempotencyKey(idempotencyKey)) ?? transaction;
    }, context.transactionClient);
  }

  public releaseBookingHold(
    input: BookingLedgerSettlementInput,
    context: LedgerMutationContext = {}
  ): Promise<LedgerTransactionPayload | void> {
    return this.repository.runInTransaction(async (repository) => {
      const idempotencyKey = `booking:${input.bookingOrderId}:cancel:unfreeze`;
      const existing = await repository.findTransactionByIdempotencyKey(idempotencyKey);

      if (existing) {
        return existing;
      }
      this.assertFinanceMutationRepository(repository);
      const hold = await this.requireBookingHold(repository, input);
      const releaseAmount = this.remainingHoldAmount(hold);

      if (releaseAmount <= 0) {
        await repository.updateWalletHold!({
          id: hold.id,
          status: "released",
          releasedAt: new Date()
        });
        await this.upsertOrderFinancial(repository, input, {
          settlementStatus: "cancelled",
          timelineEvent: {
            action: "booking_cancel_no_remaining_hold",
            amountNdp: 0
          }
        });

        return undefined;
      }

      const wallet = await repository.getOrCreateWallet({
        ownerType: "shop",
        ownerId: input.shopId,
        currency: CURRENCY
      });

      if (wallet.frozenBalance < releaseAmount) {
        throw this.insufficientFrozenError();
      }

      const updatedWallet = await repository.applyWalletDelta({
        walletId: wallet.id,
        availableDelta: releaseAmount,
        frozenDelta: -releaseAmount,
        requireFrozenAtLeast: releaseAmount
      });

      if (!updatedWallet) {
        throw this.insufficientFrozenError();
      }

      const transaction = await repository.createTransaction({
        idempotencyKey,
        type: "booking_cancel_unfreeze",
        referenceType: "booking_order",
        referenceId: input.bookingOrderId,
        actorUserId: input.actorUserId,
        amount: releaseAmount,
        metadata: { shopId: input.shopId, holdId: hold.id }
      });
      await repository.createLedgerEntry({
        transactionId: transaction.id,
        walletId: wallet.id,
        direction: "unfreeze",
        amount: releaseAmount,
        availableDelta: releaseAmount,
        frozenDelta: -releaseAmount,
        availableBalanceAfter: updatedWallet.availableBalance,
        frozenBalanceAfter: updatedWallet.frozenBalance,
        reason: "booking_cancel_unfreeze"
      });
      await repository.updateWalletHold!({
        id: hold.id,
        releasedAmountNdp: hold.releasedAmountNdp + releaseAmount,
        status: "released",
        releasedAt: new Date()
      });
      await this.upsertOrderFinancial(repository, input, {
        releasedNdp: releaseAmount,
        settlementStatus: "cancelled",
        timelineEvent: {
          action: "booking_cancel_release",
          amountNdp: releaseAmount
        }
      });
      await this.recordFinanceAndAudit(repository, transaction, {
        action: "ledger.booking_cancel.unfreeze",
        expectedAmount: releaseAmount,
        actualAmount: releaseAmount
      });

      return (await repository.findTransactionByIdempotencyKey(idempotencyKey)) ?? transaction;
    }, context.transactionClient);
  }

  public settleBookingCompletion(
    input: BookingLedgerSettlementInput & { customerUserId: number },
    context: LedgerMutationContext = {}
  ): Promise<LedgerTransactionPayload | void> {
    return this.repository.runInTransaction(async (repository) => {
      const idempotencyKey = `booking:${input.bookingOrderId}:complete:settlement`;
      const existing = await repository.findTransactionByIdempotencyKey(idempotencyKey);

      if (existing) {
        return existing;
      }
      this.assertFinanceMutationRepository(repository);
      const hold = await this.requireBookingHold(repository, input);
      const fee = await this.calculateFee("b_platform_fee", "capture", input, context);
      const reward = await this.calculateFee("user_reward", "capture", input, context);
      const holdRemaining = this.remainingHoldAmount(hold);
      const captureAmount = Math.min(fee.finalFeeNdp, holdRemaining);
      const releaseAmount = Math.max(0, holdRemaining - captureAmount);
      const rewardAmount = reward.finalFeeNdp;
      const merchantFrozenDelta = -(captureAmount + releaseAmount);
      const merchantAvailableDelta = releaseAmount;
      const transactionAmount = captureAmount + releaseAmount + rewardAmount;

      const merchantWallet = await repository.getOrCreateWallet({
        ownerType: "shop",
        ownerId: input.shopId,
        currency: CURRENCY
      });

      if (merchantWallet.frozenBalance < captureAmount + releaseAmount) {
        throw this.insufficientFrozenError();
      }

      const customerWallet = await repository.getOrCreateWallet({
        ownerType: "user",
        ownerId: input.customerUserId,
        currency: CURRENCY
      });
      const updatedMerchantWallet =
        captureAmount + releaseAmount > 0
          ? await repository.applyWalletDelta({
              walletId: merchantWallet.id,
              availableDelta: merchantAvailableDelta,
              frozenDelta: merchantFrozenDelta,
              requireFrozenAtLeast: captureAmount + releaseAmount
            })
          : merchantWallet;

      if (!updatedMerchantWallet) {
        throw this.insufficientFrozenError();
      }

      const updatedCustomerWallet =
        rewardAmount > 0
          ? await repository.applyWalletDelta({
              walletId: customerWallet.id,
              availableDelta: rewardAmount,
              frozenDelta: 0
            })
          : customerWallet;

      if (!updatedCustomerWallet) {
        throw this.walletMutationError();
      }

      await repository.updateWalletHold!({
        id: hold.id,
        capturedAmountNdp: hold.capturedAmountNdp + captureAmount,
        releasedAmountNdp: hold.releasedAmountNdp + releaseAmount,
        status: releaseAmount > 0 && captureAmount > 0 ? "partially_captured" : "captured",
        capturedAt: new Date(),
        releasedAt: releaseAmount > 0 ? new Date() : null,
        metadata: {
          holdMetadata: hold.metadata,
          captureFee: this.feeMetadata(fee),
          rewardFee: this.feeMetadata(reward)
        }
      });
      await this.upsertOrderFinancial(repository, input, {
        bPlatformFeeActualNdp: captureAmount,
        userRewardNdp: rewardAmount,
        campaignDiscountNdp: fee.campaignDiscountNdp,
        releasedNdp: releaseAmount,
        completedOrderOrdinalInPeriod: fee.completedOrderOrdinalInPeriod,
        appliedFeeRuleIds: [...fee.appliedRuleIds, ...reward.appliedRuleIds],
        settlementStatus: "settled",
        timelineEvent: {
          action: "booking_complete_settlement",
          platformFeeNdp: captureAmount,
          releasedNdp: releaseAmount,
          userRewardNdp: rewardAmount,
          fee,
          reward
        }
      });

      if (transactionAmount === 0) {
        return undefined;
      }

      const transaction = await repository.createTransaction({
        idempotencyKey,
        type: "booking_complete_settlement",
        referenceType: "booking_order",
        referenceId: input.bookingOrderId,
        actorUserId: input.actorUserId,
        amount: transactionAmount,
        metadata: {
          shopId: input.shopId,
          customerUserId: input.customerUserId,
          merchantDebitAmount: captureAmount,
          merchantReleaseAmount: releaseAmount,
          customerRewardAmount: rewardAmount,
          fee,
          reward
        }
      });
      if (captureAmount > 0) {
        await repository.createLedgerEntry({
          transactionId: transaction.id,
          walletId: merchantWallet.id,
          direction: "frozen_debit",
          amount: captureAmount,
          availableDelta: 0,
          frozenDelta: -captureAmount,
          availableBalanceAfter: updatedMerchantWallet.availableBalance,
          frozenBalanceAfter: updatedMerchantWallet.frozenBalance,
          reason: "booking_complete_merchant_debit"
        });
      }
      if (releaseAmount > 0) {
        await repository.createLedgerEntry({
          transactionId: transaction.id,
          walletId: merchantWallet.id,
          direction: "unfreeze",
          amount: releaseAmount,
          availableDelta: releaseAmount,
          frozenDelta: -releaseAmount,
          availableBalanceAfter: updatedMerchantWallet.availableBalance,
          frozenBalanceAfter: updatedMerchantWallet.frozenBalance,
          reason: "booking_complete_hold_difference_release"
        });
      }
      if (rewardAmount > 0) {
        await repository.createLedgerEntry({
          transactionId: transaction.id,
          walletId: customerWallet.id,
          direction: "available_credit",
          amount: rewardAmount,
          availableDelta: rewardAmount,
          frozenDelta: 0,
          availableBalanceAfter: updatedCustomerWallet.availableBalance,
          frozenBalanceAfter: updatedCustomerWallet.frozenBalance,
          reason: "booking_complete_customer_reward"
        });
      }
      await this.recordFinanceAndAudit(repository, transaction, {
        action: "ledger.booking_complete.settlement",
        expectedAmount: transactionAmount,
        actualAmount: transactionAmount
      });

      return (await repository.findTransactionByIdempotencyKey(idempotencyKey)) ?? transaction;
    }, context.transactionClient);
  }

  public compensateCustomerForMerchantCancellation(
    input: BookingLedgerSettlementInput & { customerUserId: number },
    context: LedgerMutationContext = {}
  ): Promise<LedgerTransactionPayload | void> {
    return this.repository.runInTransaction(async (repository) => {
      const idempotencyKey = `booking:${input.bookingOrderId}:merchant-cancel:compensation`;
      const existing = await repository.findTransactionByIdempotencyKey(idempotencyKey);

      if (existing) {
        return existing;
      }
      this.assertFinanceMutationRepository(repository);
      const hold = await this.requireBookingHold(repository, input);
      const penaltyFee = await this.calculateFee("penalty", "capture", input, context);
      const holdRemaining = this.remainingHoldAmount(hold);
      const penaltyAmount = Math.min(penaltyFee.finalFeeNdp || holdRemaining, holdRemaining);

      const merchantWallet = await repository.getOrCreateWallet({
        ownerType: "shop",
        ownerId: input.shopId,
        currency: CURRENCY
      });

      if (merchantWallet.frozenBalance < penaltyAmount) {
        throw this.insufficientFrozenError();
      }

      const customerWallet = await repository.getOrCreateWallet({
        ownerType: "user",
        ownerId: input.customerUserId,
        currency: CURRENCY
      });
      const updatedMerchantWallet =
        penaltyAmount > 0
          ? await repository.applyWalletDelta({
              walletId: merchantWallet.id,
              availableDelta: 0,
              frozenDelta: -penaltyAmount,
              requireFrozenAtLeast: penaltyAmount
            })
          : merchantWallet;

      if (!updatedMerchantWallet) {
        throw this.insufficientFrozenError();
      }

      const updatedCustomerWallet =
        penaltyAmount > 0
          ? await repository.applyWalletDelta({
              walletId: customerWallet.id,
              availableDelta: penaltyAmount,
              frozenDelta: 0
            })
          : customerWallet;

      if (!updatedCustomerWallet) {
        throw this.walletMutationError();
      }

      await repository.updateWalletHold!({
        id: hold.id,
        capturedAmountNdp: hold.capturedAmountNdp + penaltyAmount,
        status: "captured",
        capturedAt: new Date(),
        metadata: {
          holdMetadata: hold.metadata,
          penaltyFee: this.feeMetadata(penaltyFee)
        }
      });
      await this.upsertOrderFinancial(repository, input, {
        penaltyNdp: penaltyAmount,
        compensationToUserNdp: penaltyAmount,
        campaignDiscountNdp: penaltyFee.campaignDiscountNdp,
        appliedFeeRuleIds: penaltyFee.appliedRuleIds,
        settlementStatus: "compensated",
        timelineEvent: {
          action: "booking_merchant_cancel_compensation",
          penaltyNdp: penaltyAmount,
          compensationToUserNdp: penaltyAmount,
          penaltyFee
        }
      });

      if (penaltyAmount === 0) {
        return undefined;
      }

      const transaction = await repository.createTransaction({
        idempotencyKey,
        type: "booking_merchant_cancel_compensation",
        referenceType: "booking_order",
        referenceId: input.bookingOrderId,
        actorUserId: input.actorUserId,
        amount: penaltyAmount,
        metadata: {
          shopId: input.shopId,
          customerUserId: input.customerUserId,
          penaltyFee
        }
      });
      await repository.createLedgerEntry({
        transactionId: transaction.id,
        walletId: merchantWallet.id,
        direction: "frozen_debit",
        amount: penaltyAmount,
        availableDelta: 0,
        frozenDelta: -penaltyAmount,
        availableBalanceAfter: updatedMerchantWallet.availableBalance,
        frozenBalanceAfter: updatedMerchantWallet.frozenBalance,
        reason: "booking_merchant_cancel_penalty"
      });
      await repository.createLedgerEntry({
        transactionId: transaction.id,
        walletId: customerWallet.id,
        direction: "available_credit",
        amount: penaltyAmount,
        availableDelta: penaltyAmount,
        frozenDelta: 0,
        availableBalanceAfter: updatedCustomerWallet.availableBalance,
        frozenBalanceAfter: updatedCustomerWallet.frozenBalance,
        reason: "booking_merchant_cancel_customer_compensation"
      });
      await this.recordFinanceAndAudit(repository, transaction, {
        action: "ledger.booking_merchant_cancel.compensation",
        expectedAmount: penaltyAmount,
        actualAmount: penaltyAmount
      });

      return (await repository.findTransactionByIdempotencyKey(idempotencyKey)) ?? transaction;
    }, context.transactionClient);
  }

  private async calculateFee(
    feeType: FeeType,
    stage: "hold" | "capture" | "release" | "reversal" | "preview",
    input: BookingLedgerSettlementInput,
    context: LedgerMutationContext
  ): Promise<FeeCalculationResult> {
    if (!this.feeCalculationService) {
      throw new AppError({
        code: ERROR_CODES.INTERNAL,
        message: "error.finance.calculation_unavailable",
        statusCode: 500
      });
    }

    return this.feeCalculationService.calculateFee(
      {
        bookingOrderId: input.bookingOrderId,
        orderType: input.orderType,
        stage,
        feeType,
        shopId: input.shopId,
        castId: input.technicianProfileId ?? undefined,
        userId: input.customerUserId,
        serviceId: input.serviceId ?? undefined,
        scheduledStartAt: input.scheduledStartAt,
        acceptedAt: input.acceptedAt,
        completedAt: input.completedAt,
        serviceAmountJpy: input.serviceAmountJpy,
        timezone: "Asia/Tokyo"
      },
      { transactionClient: context.transactionClient }
    );
  }

  private assertFinanceMutationRepository(repository: LedgerRepositoryPort): void {
    if (
      !repository.findWalletHold ||
      !repository.createWalletHold ||
      !repository.updateWalletHold ||
      !repository.upsertOrderFinancial
    ) {
      throw this.repositoryUnavailableError();
    }
  }

  private async requireBookingHold(
    repository: LedgerRepositoryPort,
    input: BookingLedgerSettlementInput
  ): Promise<WalletHoldPayload> {
    const hold = await repository.findWalletHold?.({
      bookingOrderId: input.bookingOrderId,
      ownerType: "shop",
      ownerId: input.shopId,
      feeType: "b_platform_fee"
    });

    if (!hold) {
      throw this.insufficientFrozenError();
    }

    return hold;
  }

  private remainingHoldAmount(hold: WalletHoldPayload): number {
    return Math.max(0, hold.holdAmountNdp - hold.capturedAmountNdp - hold.releasedAmountNdp);
  }

  private feeMetadata(fee: FeeCalculationResult) {
    return {
      feeType: fee.feeType,
      stage: fee.stage,
      payerType: fee.payerType,
      payerId: fee.payerId,
      baseFeeNdp: fee.baseFeeNdp,
      tierAdjustmentNdp: fee.tierAdjustmentNdp,
      timeAdjustmentNdp: fee.timeAdjustmentNdp,
      campaignDiscountNdp: fee.campaignDiscountNdp,
      finalFeeNdp: fee.finalFeeNdp,
      holdAmountNdp: fee.holdAmountNdp,
      completedOrderOrdinalInPeriod: fee.completedOrderOrdinalInPeriod,
      appliedRuleIds: fee.appliedRuleIds,
      explanation: fee.explanation,
      calculationLogId: fee.calculationLogId
    };
  }

  private upsertOrderFinancial(
    repository: LedgerRepositoryPort,
    input: BookingLedgerSettlementInput,
    override: Partial<OrderFinancialUpsertInput>
  ): Promise<void> {
    return repository.upsertOrderFinancial!({
      bookingOrderId: input.bookingOrderId,
      orderType: input.orderType,
      customerUserId: input.customerUserId ?? 0,
      shopId: input.shopId,
      technicianProfileId: input.technicianProfileId ?? null,
      serviceAmountJpy: input.serviceAmountJpy,
      unknownOrUnreportedServiceAmountJpy: input.serviceAmountJpy,
      ...override
    });
  }

  public async getMyWallet(ownerId: number): Promise<WalletPayload> {
    if (this.repository.findWallet) {
      const existing = await this.repository.findWallet({
        ownerType: "user",
        ownerId,
        currency: CURRENCY
      });

      if (existing) {
        return existing;
      }
    }

    const wallet = await this.repository.getOrCreateWallet({
      ownerType: "user",
      ownerId,
      currency: CURRENCY
    });

    return wallet;
  }

  public async getWallet(input: WalletLookupInput): Promise<WalletPayload> {
    if (!this.repository.findWallet) {
      throw this.repositoryUnavailableError();
    }

    const wallet = await this.repository.findWallet({
      ...input,
      currency: input.currency ?? CURRENCY
    });

    if (!wallet) {
      throw new AppError({
        code: ERROR_CODES.WALLET_NOT_FOUND,
        message: "error.wallet.not_found",
        statusCode: 404
      });
    }

    return wallet;
  }

  public listWalletLedger(
    input: WalletLedgerListInput
  ): Promise<PaginatedResponse<WalletLedgerPayload>> {
    if (!this.repository.listWalletLedger) {
      throw this.repositoryUnavailableError();
    }

    return this.repository.listWalletLedger(input);
  }

  public listLedgerTransactions(
    input: LedgerTransactionListInput
  ): Promise<PaginatedResponse<LedgerTransactionPayload>> {
    if (!this.repository.listLedgerTransactions) {
      throw this.repositoryUnavailableError();
    }

    return this.repository.listLedgerTransactions(input);
  }

  public listFinanceReconciliation(
    input: FinanceReconciliationListInput
  ): Promise<PaginatedResponse<FinanceReconciliationPayload>> {
    if (!this.repository.listFinanceReconciliation) {
      throw this.repositoryUnavailableError();
    }

    return this.repository.listFinanceReconciliation(input);
  }

  public exportFinanceReconciliation(
    input: FinanceReconciliationListInput
  ): Promise<FinanceReconciliationExportPayload> {
    if (!this.repository.exportFinanceReconciliation) {
      throw this.repositoryUnavailableError();
    }

    return this.repository.exportFinanceReconciliation(input);
  }

  private async recordFinanceAndAudit(
    repository: LedgerRepositoryPort,
    transaction: LedgerTransactionPayload,
    input: { action: string; expectedAmount: number; actualAmount: number }
  ): Promise<void> {
    await repository.createFinanceReconciliation({
      transactionId: transaction.id,
      referenceType: transaction.referenceType,
      referenceId: transaction.referenceId,
      expectedAmount: input.expectedAmount,
      actualAmount: input.actualAmount
    });
    await repository.createAuditLog({
      actorUserId: transaction.actorUserId,
      action: input.action,
      targetId: transaction.id,
      metadata: {
        referenceType: transaction.referenceType,
        referenceId: transaction.referenceId,
        amount: transaction.amount,
        currency: transaction.currency
      }
    });
  }

  private insufficientAvailableError(): AppError {
    return new AppError({
      code: ERROR_CODES.WALLET_INSUFFICIENT_AVAILABLE,
      message: "error.wallet.insufficient_available",
      statusCode: 409
    });
  }

  private insufficientFrozenError(): AppError {
    return new AppError({
      code: ERROR_CODES.WALLET_INSUFFICIENT_FROZEN,
      message: "error.wallet.insufficient_frozen",
      statusCode: 409
    });
  }

  private walletMutationError(): AppError {
    return new AppError({
      code: ERROR_CODES.WALLET_MUTATION_FAILED,
      message: "error.wallet.mutation_failed",
      statusCode: 409
    });
  }

  private repositoryUnavailableError(): AppError {
    return new AppError({
      code: ERROR_CODES.INTERNAL,
      message: "error.ledger.repository_unavailable",
      statusCode: 500
    });
  }
}
