import { createHash } from "node:crypto";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import type { AuthenticatedAccessContext } from "./auth.service";
import type {
  FeeCalculationResult,
  FeeCalculationService,
  FeeType,
  FinanceOrderType
} from "./fee-calculation.service";
import type {
  BookingPlatformFeePolicySnapshot,
  PlatformFeePolicyService
} from "./platform-fee-policy.service";
import { LedgerCurrencyService, type LedgerCurrency } from "./ledger-currency.service";

export type { LedgerCurrency } from "./ledger-currency.service";

export type WalletOwnerType =
  | "user"
  | "shop"
  | "platform"
  | "merchant_account"
  | "alliance";
export type WalletLedgerDirection =
  | "available_credit"
  | "available_debit"
  | "freeze"
  | "unfreeze"
  | "frozen_debit"
  | "frozen_credit";
export type LedgerTransactionType =
  | "booking_accept_freeze"
  | "booking_cancel_unfreeze"
  | "booking_complete_settlement"
  | "booking_merchant_cancel_compensation"
  | "manual_topup_approved"
  | "manual_withdrawal_approved"
  | "seed_credit"
  | "affiliate_task_budget_freeze"
  | "affiliate_task_budget_release"
  | "affiliate_reward_settlement"
  | "affiliate_reward_reversal"
  | "affiliate_reward_recovery"
  | "test_balance_calibration";
export type LedgerTransactionStatus = "applied";
export type FinanceReconciliationStatus = "pending" | "exported" | "test_only";
export type LedgerTransactionClient = unknown;
export type WalletHoldStatus = "active" | "captured" | "released" | "partially_captured";
export type OrderFinancialSettlementStatus =
  | "pending"
  | "holding"
  | "settled"
  | "released"
  | "cancelled"
  | "compensated";
export type PlatformFeeDebtStatus = "none" | "outstanding" | "settled";
export type UserRewardStatus = "disabled" | "immediate" | "pending" | "paid" | "expired";

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

export type WalletAdjustmentType = "topup" | "withdrawal";
export type WalletAdjustmentStatus = "pending" | "approved" | "rejected";

export interface WalletAdjustmentRequestPayload {
  id: number;
  type: WalletAdjustmentType;
  status: WalletAdjustmentStatus;
  ownerType: WalletOwnerType;
  ownerId: number;
  walletId: number;
  amountNdp: number;
  idempotencyKey: string;
  bankReference: string | null;
  note: string | null;
  requestedById: number;
  reviewedById: number | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  ledgerTransactionId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWalletAdjustmentRequestInput {
  type: WalletAdjustmentType;
  amountNdp: number;
  idempotencyKey: string;
  bankReference?: string | null;
  note?: string | null;
}

export interface AffiliateWithdrawalEligibilityPort {
  assertEligible: (
    userId: number,
    now: Date
  ) => Promise<{ eKycVerificationId: number; bankAccountId: number }>;
}

export interface WalletAdjustmentRequestListInput extends PaginationInput {
  ownerType?: WalletOwnerType;
  ownerId?: number;
  type?: WalletAdjustmentType;
  status?: WalletAdjustmentStatus;
}

export interface ReviewWalletAdjustmentRequestInput {
  action: "approve" | "reject";
  note: string;
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
  currency: LedgerCurrency;
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
  ndpCurrency: LedgerCurrency;
  customerUserId: number;
  shopId: number;
  technicianProfileId?: number | null;
  serviceAmountJpy: number;
  unknownOrUnreportedServiceAmountJpy?: number;
  bPlatformFeeHoldNdp?: number;
  bPlatformFeeActualNdp?: number;
  cRequestFeeHoldNdp?: number;
  cRequestFeeActualNdp?: number;
  userRewardNdp?: number;
  penaltyNdp?: number;
  compensationToUserNdp?: number;
  campaignDiscountNdp?: number;
  releasedNdp?: number;
  platformFeePayerType?: string | null;
  platformFeePayerId?: number | null;
  platformFeeEnabledSnapshot?: boolean | null;
  platformFeeGlobalVersion?: number | null;
  platformFeePolicyVersion?: number | null;
  platformFeeAmountNdpSnapshot?: number;
  platformFeeWalletOwnerType?: WalletOwnerType | null;
  platformFeeWalletOwnerId?: number | null;
  platformFeeWalletId?: number | null;
  platformFeeShortfallNdp?: number;
  platformFeeOutstandingNdp?: number;
  platformFeeDebtStatus?: PlatformFeeDebtStatus;
  platformFeeAcceptedAt?: Date | null;
  platformFeeOverdraftConfirmationKey?: string | null;
  platformFeePreviewVersion?: string | null;
  userRewardEligibleNdp?: number;
  userRewardStatus?: UserRewardStatus;
  userRewardDeadlineAt?: Date | null;
  userRewardGrantedAt?: Date | null;
  completedOrderOrdinalInPeriod?: number | null;
  appliedFeeRuleIds?: string[];
  timelineEvent?: unknown;
  settlementStatus?: OrderFinancialSettlementStatus;
}

export interface OrderFinancialPlatformFeeSnapshot {
  bookingOrderId: number;
  ndpCurrency: LedgerCurrency;
  customerUserId: number;
  shopId: number;
  technicianProfileId: number | null;
  platformFeeEnabledSnapshot: boolean;
  platformFeeAmountNdpSnapshot: number;
  platformFeeWalletOwnerType: WalletOwnerType | null;
  platformFeeWalletOwnerId: number | null;
  platformFeeWalletId: number | null;
  platformFeeOutstandingNdp: number;
  platformFeeDebtStatus: PlatformFeeDebtStatus;
  platformFeeAcceptedAt: Date | null;
  userRewardEligibleNdp: number;
  userRewardStatus: UserRewardStatus;
  userRewardDeadlineAt: Date | null;
  userRewardGrantedAt: Date | null;
  settlementStatus: OrderFinancialSettlementStatus;
}

export interface PlatformFeeDebtAllocationRecord {
  id: number;
  bookingOrderId: number;
  ndpCurrency: LedgerCurrency;
  customerUserId: number;
  platformFeeWalletId: number;
  platformFeeAcceptedAt: Date;
  platformFeeOutstandingNdp: number;
  platformFeeDebtStatus: Extract<PlatformFeeDebtStatus, "outstanding" | "settled">;
  userRewardEligibleNdp: number;
  userRewardStatus: UserRewardStatus;
  userRewardDeadlineAt: Date | null;
  userRewardGrantedAt: Date | null;
  userRewardNdp: number;
  settlementStatus: OrderFinancialSettlementStatus;
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
    handler: (
      repository: LedgerRepositoryPort,
      transactionClient?: LedgerTransactionClient
    ) => Promise<T>,
    transactionClient?: LedgerTransactionClient
  ) => Promise<T>;
  findTransactionByIdempotencyKey: (
    idempotencyKey: string
  ) => Promise<LedgerTransactionPayload | null>;
  findUserAccountClassification: (
    userId: number
  ) => Promise<{ isTestAccount: boolean } | null>;
  getOrCreateWallet: (input: {
    ownerType: WalletOwnerType;
    ownerId: number;
    currency: LedgerCurrency;
  }) => Promise<WalletPayload>;
  findTechnicianUserId?: (technicianProfileId: number) => Promise<number | null>;
  findOrderFinancialByOverdraftConfirmationKey?: (
    idempotencyKey: string
  ) => Promise<{ bookingOrderId: number; previewVersion: string } | null>;
  findOrderFinancialPlatformFeeSnapshot?: (
    bookingOrderId: number
  ) => Promise<OrderFinancialPlatformFeeSnapshot | null>;
  lockOrderFinancialPlatformFeeSnapshot?: (
    bookingOrderId: number
  ) => Promise<OrderFinancialPlatformFeeSnapshot | null>;
  lockWalletById?: (walletId: number) => Promise<WalletPayload | null>;
  getDatabaseNow?: () => Promise<Date>;
  findPlatformFeeHoldByBookingOrderId?: (
    bookingOrderId: number
  ) => Promise<WalletHoldPayload | null>;
  listOutstandingPlatformFeeDebtIds?: (input: {
    walletId: number;
    limit: number;
  }) => Promise<number[]>;
  lockPlatformFeeDebt?: (id: number) => Promise<PlatformFeeDebtAllocationRecord | null>;
  updatePlatformFeeDebt?: (input: {
    id: number;
    expectedOutstandingNdp: number;
    platformFeeOutstandingNdp: number;
    platformFeeDebtStatus: Extract<PlatformFeeDebtStatus, "outstanding" | "settled">;
    userRewardStatus?: UserRewardStatus;
    userRewardNdp?: number;
    userRewardGrantedAt?: Date | null;
  }) => Promise<boolean>;
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
    currency: LedgerCurrency;
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
    currency: Extract<LedgerCurrency, "NDP">;
    expectedAmount: number;
    actualAmount: number;
  }) => Promise<void>;
  createAuditLog: (input: {
    actorUserId: number | null;
    action: string;
    targetType?: string;
    targetId: number;
    metadata?: unknown;
  }) => Promise<void>;
  findWalletAdjustmentByIdempotencyKey?: (
    idempotencyKey: string
  ) => Promise<WalletAdjustmentRequestPayload | null>;
  createWalletAdjustmentRequest?: (input: {
    type: WalletAdjustmentType;
    ownerType: WalletOwnerType;
    ownerId: number;
    walletId: number;
    amountNdp: number;
    idempotencyKey: string;
    bankReference?: string | null;
    note?: string | null;
    requestedById: number;
  }) => Promise<WalletAdjustmentRequestPayload>;
  listWalletAdjustmentRequests?: (
    input: WalletAdjustmentRequestListInput
  ) => Promise<PaginatedResponse<WalletAdjustmentRequestPayload>>;
  lockWalletAdjustmentRequest?: (id: number) => Promise<WalletAdjustmentRequestPayload | null>;
  approveWalletAdjustmentRequest?: (input: {
    id: number;
    reviewedById: number;
    reviewNote: string;
    ledgerTransactionId: number;
  }) => Promise<WalletAdjustmentRequestPayload>;
  rejectWalletAdjustmentRequest?: (input: {
    id: number;
    reviewedById: number;
    reviewNote: string;
  }) => Promise<WalletAdjustmentRequestPayload>;
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
    currency: LedgerCurrency;
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
  insufficientBalanceConfirmation?: {
    confirmed: true;
    idempotencyKey: string;
    previewVersion: string;
  };
}

export interface LedgerMutationContext {
  transactionClient?: LedgerTransactionClient;
}

export interface FreezeAffiliateTaskBudgetInput {
  taskId: number;
  ownerType: Extract<WalletOwnerType, "merchant_account" | "shop">;
  ownerId: number;
  amountNdp: number;
  idempotencyKey: string;
  actorUserId: number | null;
}

export interface ReleaseAffiliateTaskBudgetInput extends FreezeAffiliateTaskBudgetInput {
  walletId: number;
}

export interface AffiliateBudgetLedgerResult {
  transaction: LedgerTransactionPayload;
  walletId: number;
}

export interface SettleAffiliateRewardInput {
  taskId: number;
  attributionId: number;
  rewardId: number;
  bookingOrderId: number;
  publisherOwnerType: Extract<WalletOwnerType, "merchant_account" | "shop">;
  publisherOwnerId: number;
  publisherWalletId: number;
  claimantUserId: number;
  amountNdp: number;
  idempotencyKey: string;
  actorUserId: number;
}

export interface AffiliateRewardLedgerResult {
  transaction: LedgerTransactionPayload;
  publisherWalletId: number;
  claimantWalletId: number;
}

export interface AffiliateRewardSettlementPort {
  settleAffiliateReward: (
    input: SettleAffiliateRewardInput,
    context?: LedgerMutationContext
  ) => Promise<AffiliateRewardLedgerResult>;
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

const PLATFORM_FEE_DEBT_ALLOCATION_BATCH_SIZE = 100;

export class LedgerService implements BookingLedgerSettlementPort, AffiliateRewardSettlementPort {
  public constructor(
    private readonly repository: LedgerRepositoryPort,
    private readonly feeCalculationService?: Pick<FeeCalculationService, "calculateFee">,
    private readonly affiliateWithdrawalEligibility?: AffiliateWithdrawalEligibilityPort,
    private readonly now: () => Date = () => new Date(),
    private readonly platformFeePolicyService?: Pick<
      PlatformFeePolicyService,
      "resolveForBookingSettlement"
    >
  ) {}

  public freezeAffiliateTaskBudget(
    input: FreezeAffiliateTaskBudgetInput,
    context: LedgerMutationContext = {}
  ): Promise<AffiliateBudgetLedgerResult> {
    return this.repository.runInTransaction(async (repository) => {
      const existing = await repository.findTransactionByIdempotencyKey(input.idempotencyKey);

      if (existing) {
        return {
          transaction: existing,
          walletId: await this.resolveAffiliateWalletId(repository, existing, input)
        };
      }

      if (input.actorUserId === null) {
        throw this.walletMutationError();
      }
      const currency = await this.resolveCurrencyForUser(repository, input.actorUserId);

      const wallet = await repository.getOrCreateWallet({
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        currency
      });

      if (wallet.availableBalance < input.amountNdp) {
        throw this.insufficientAvailableError();
      }

      const updatedWallet = await repository.applyWalletDelta({
        walletId: wallet.id,
        availableDelta: -input.amountNdp,
        frozenDelta: input.amountNdp,
        requireAvailableAtLeast: input.amountNdp
      });

      if (!updatedWallet) {
        throw this.insufficientAvailableError();
      }

      const transaction = await repository.createTransaction({
        idempotencyKey: input.idempotencyKey,
        type: "affiliate_task_budget_freeze",
        referenceType: "affiliate_task",
        referenceId: input.taskId,
        actorUserId: input.actorUserId,
        amount: input.amountNdp,
        currency,
        metadata: {
          taskId: input.taskId,
          ownerType: input.ownerType,
          ownerId: input.ownerId,
          walletId: wallet.id
        }
      });
      await repository.createLedgerEntry({
        transactionId: transaction.id,
        walletId: wallet.id,
        direction: "freeze",
        amount: input.amountNdp,
        availableDelta: -input.amountNdp,
        frozenDelta: input.amountNdp,
        availableBalanceAfter: updatedWallet.availableBalance,
        frozenBalanceAfter: updatedWallet.frozenBalance,
        reason: "affiliate_task_budget_freeze"
      });
      await this.recordFinanceAndAudit(repository, transaction, {
        action: "ledger.affiliate_task_budget.freeze",
        expectedAmount: input.amountNdp,
        actualAmount: input.amountNdp
      });

      return {
        transaction:
          (await repository.findTransactionByIdempotencyKey(input.idempotencyKey)) ?? transaction,
        walletId: wallet.id
      };
    }, context.transactionClient);
  }

  public releaseAffiliateTaskBudget(
    input: ReleaseAffiliateTaskBudgetInput,
    context: LedgerMutationContext = {}
  ): Promise<AffiliateBudgetLedgerResult> {
    if (!Number.isSafeInteger(input.amountNdp) || input.amountNdp <= 0) {
      throw this.walletMutationError();
    }

    return this.repository.runInTransaction(async (repository) => {
      const existing = await repository.findTransactionByIdempotencyKey(input.idempotencyKey);

      if (existing) {
        return this.resolveExistingAffiliateTaskBudgetRelease(repository, existing, input);
      }

      const wallet = await this.lockWalletById(repository, input.walletId);

      if (wallet.ownerType !== input.ownerType || wallet.ownerId !== input.ownerId) {
        throw this.walletMutationError();
      }
      const currency = wallet.currency;
      if (wallet.frozenBalance < input.amountNdp) {
        throw this.insufficientFrozenError();
      }

      const updatedWallet = await repository.applyWalletDelta({
        walletId: wallet.id,
        availableDelta: input.amountNdp,
        frozenDelta: -input.amountNdp,
        requireFrozenAtLeast: input.amountNdp
      });

      if (!updatedWallet) {
        throw this.insufficientFrozenError();
      }

      const transaction = await repository.createTransaction({
        idempotencyKey: input.idempotencyKey,
        type: "affiliate_task_budget_release",
        referenceType: "affiliate_task",
        referenceId: input.taskId,
        actorUserId: input.actorUserId,
        amount: input.amountNdp,
        currency,
        metadata: {
          taskId: input.taskId,
          ownerType: input.ownerType,
          ownerId: input.ownerId,
          walletId: wallet.id
        }
      });
      await repository.createLedgerEntry({
        transactionId: transaction.id,
        walletId: wallet.id,
        direction: "unfreeze",
        amount: input.amountNdp,
        availableDelta: input.amountNdp,
        frozenDelta: -input.amountNdp,
        availableBalanceAfter: updatedWallet.availableBalance,
        frozenBalanceAfter: updatedWallet.frozenBalance,
        reason: "affiliate_task_budget_release"
      });
      await this.recordFinanceAndAudit(repository, transaction, {
        action: "ledger.affiliate_task_budget.release",
        expectedAmount: input.amountNdp,
        actualAmount: input.amountNdp
      });

      return {
        transaction:
          (await repository.findTransactionByIdempotencyKey(input.idempotencyKey)) ?? transaction,
        walletId: wallet.id
      };
    }, context.transactionClient);
  }

  public async settleAffiliateReward(
    input: SettleAffiliateRewardInput,
    context: LedgerMutationContext = {}
  ): Promise<AffiliateRewardLedgerResult> {
    if (!Number.isSafeInteger(input.amountNdp) || input.amountNdp <= 0) {
      throw this.walletMutationError();
    }

    return this.repository.runInTransaction(async (repository) => {
      const existing = await repository.findTransactionByIdempotencyKey(input.idempotencyKey);

      if (existing) {
        return this.resolveAffiliateRewardLedgerResult(repository, existing, input);
      }

      const publisherWallet = await this.lockWalletById(repository, input.publisherWalletId);

      if (
        publisherWallet.ownerType !== input.publisherOwnerType ||
        publisherWallet.ownerId !== input.publisherOwnerId
      ) {
        throw this.walletMutationError();
      }
      if (publisherWallet.frozenBalance < input.amountNdp) {
        throw this.insufficientFrozenError();
      }

      const claimantCurrency = await this.resolveCurrencyForUser(
        repository,
        input.claimantUserId
      );
      LedgerCurrencyService.assertSameCurrency(publisherWallet.currency, [claimantCurrency]);
      const currency = publisherWallet.currency;
      const claimantWallet = await repository.getOrCreateWallet({
        ownerType: "user",
        ownerId: input.claimantUserId,
        currency
      });
      const updatedPublisherWallet = await repository.applyWalletDelta({
        walletId: publisherWallet.id,
        availableDelta: 0,
        frozenDelta: -input.amountNdp,
        requireFrozenAtLeast: input.amountNdp
      });

      if (!updatedPublisherWallet) {
        throw this.insufficientFrozenError();
      }

      const updatedClaimantWallet = await repository.applyWalletDelta({
        walletId: claimantWallet.id,
        availableDelta: input.amountNdp,
        frozenDelta: 0
      });

      if (!updatedClaimantWallet) {
        throw this.walletMutationError();
      }

      const transaction = await repository.createTransaction({
        idempotencyKey: input.idempotencyKey,
        type: "affiliate_reward_settlement",
        referenceType: "affiliate_reward",
        referenceId: input.rewardId,
        actorUserId: input.actorUserId,
        amount: input.amountNdp,
        currency,
        metadata: {
          taskId: input.taskId,
          attributionId: input.attributionId,
          bookingOrderId: input.bookingOrderId,
          publisherOwnerType: input.publisherOwnerType,
          publisherOwnerId: input.publisherOwnerId,
          publisherWalletId: publisherWallet.id,
          claimantUserId: input.claimantUserId,
          claimantWalletId: claimantWallet.id
        }
      });
      await repository.createLedgerEntry({
        transactionId: transaction.id,
        walletId: publisherWallet.id,
        direction: "frozen_debit",
        amount: input.amountNdp,
        availableDelta: 0,
        frozenDelta: -input.amountNdp,
        availableBalanceAfter: updatedPublisherWallet.availableBalance,
        frozenBalanceAfter: updatedPublisherWallet.frozenBalance,
        reason: "affiliate_reward_publisher_frozen_debit"
      });
      await repository.createLedgerEntry({
        transactionId: transaction.id,
        walletId: claimantWallet.id,
        direction: "available_credit",
        amount: input.amountNdp,
        availableDelta: input.amountNdp,
        frozenDelta: 0,
        availableBalanceAfter: updatedClaimantWallet.availableBalance,
        frozenBalanceAfter: updatedClaimantWallet.frozenBalance,
        reason: "affiliate_reward_claimant_available_credit"
      });
      await this.recordFinanceAndAudit(repository, transaction, {
        action: "ledger.affiliate_reward.settlement",
        expectedAmount: input.amountNdp,
        actualAmount: input.amountNdp
      });

      return {
        transaction:
          (await repository.findTransactionByIdempotencyKey(input.idempotencyKey)) ?? transaction,
        publisherWalletId: publisherWallet.id,
        claimantWalletId: claimantWallet.id
      };
    }, context.transactionClient);
  }

  public freezeBookingAcceptance(
    input: BookingLedgerSettlementInput,
    context: LedgerMutationContext = {}
  ): Promise<LedgerTransactionPayload | void> {
    return this.repository
      .runInTransaction(async (repository, transactionClient) => {
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
        const currency = await this.resolveBookingCurrency(repository, input);
        const feeType = this.acceptanceFeeType(input);
        const transactionContext = { transactionClient };
        if (feeType === "b_platform_fee" && this.platformFeePolicyService) {
          return this.freezeBookingPlatformFeeAcceptance(
            repository,
            input,
            idempotencyKey,
            transactionContext,
            currency
          );
        }
        const fee = await this.calculateFee(feeType, "hold", input, transactionContext);
        const holdOwner = this.acceptanceHoldOwner(input, feeType);
        const holdAmount = fee.holdAmountNdp;

        const wallet = await repository.getOrCreateWallet({
          ownerType: holdOwner.ownerType,
          ownerId: holdOwner.ownerId,
          currency
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
          ownerType: holdOwner.ownerType,
          ownerId: holdOwner.ownerId,
          bookingOrderId: input.bookingOrderId,
          feeType,
          holdAmountNdp: holdAmount,
          currency,
          status: "active",
          idempotencyKey,
          calculationLogId: fee.calculationLogId,
          metadata: this.feeMetadata(fee)
        });
        await this.upsertOrderFinancial(repository, input, {
          ...this.holdFinancialFields(feeType, holdAmount),
          campaignDiscountNdp: fee.campaignDiscountNdp,
          platformFeePayerType: fee.payerType,
          platformFeePayerId: fee.payerId,
          appliedFeeRuleIds: fee.appliedRuleIds,
          settlementStatus: holdAmount > 0 ? "holding" : "pending",
          timelineEvent: {
            action:
              feeType === "c_request_dispatch_fee"
                ? "request_accept_dispatch_fee_hold"
                : "booking_accept_hold",
            amountNdp: holdAmount,
            fee
          }
        }, currency);

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
          currency,
          metadata: { shopId: input.shopId, holdOwner, fee }
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
          reason:
            feeType === "c_request_dispatch_fee"
              ? "request_accept_dispatch_fee_freeze"
              : "booking_accept_freeze"
        });
        await this.recordFinanceAndAudit(repository, transaction, {
          action: "ledger.booking_accept.freeze",
          expectedAmount: holdAmount,
          actualAmount: holdAmount
        });

        return (await repository.findTransactionByIdempotencyKey(idempotencyKey)) ?? transaction;
      }, context.transactionClient)
      .catch((error: unknown) => {
        if (this.isPlatformFeeConfirmationKeyConflict(error)) {
          throw this.platformFeeConfirmationConflictError();
        }

        throw error;
      });
  }

  private async freezeBookingPlatformFeeAcceptance(
    repository: LedgerRepositoryPort,
    input: BookingLedgerSettlementInput,
    idempotencyKey: string,
    context: LedgerMutationContext,
    currency: LedgerCurrency
  ): Promise<LedgerTransactionPayload | void> {
    const acceptedAt = input.acceptedAt ?? this.now();
    const policy = await this.platformFeePolicyService!.resolveForBookingSettlement(
      input.shopId,
      acceptedAt,
      context.transactionClient
    );
    const owner = await this.resolveBookingPlatformFeeOwner(repository, input, policy);
    const payerOverride =
      owner.payerType === "shop"
        ? { payerType: "shop" as const, payerId: owner.payerId }
        : { payerType: "cast" as const, payerId: owner.payerId };
    const fee = await this.calculateFee("b_platform_fee", "hold", input, context, {
      payerOverride,
      ...(policy.feeEnabled ? {} : { waiveReason: "shop_policy_disabled" as const })
    });

    if (!policy.feeEnabled) {
      await this.upsertOrderFinancial(repository, input, {
        bPlatformFeeHoldNdp: 0,
        campaignDiscountNdp: fee.campaignDiscountNdp,
        platformFeePayerType: owner.payerType,
        platformFeePayerId: owner.payerId,
        appliedFeeRuleIds: fee.appliedRuleIds,
        settlementStatus: "pending",
        ...this.platformFeeSnapshotFields({
          policy,
          acceptedAt,
          amountNdp: 0,
          wallet: null,
          shortfallNdp: 0,
          confirmationKey: null,
          previewVersion: null
        }),
        userRewardEligibleNdp: 0,
        userRewardStatus: "disabled",
        timelineEvent: {
          action: "booking_accept_platform_fee_disabled",
          amountNdp: 0,
          policy,
          fee: this.feeMetadata(fee)
        }
      }, currency);

      return undefined;
    }

    const holdAmount = fee.holdAmountNdp;
    const wallet = await repository.getOrCreateWallet({
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      currency
    });
    const deficitBeforeNdp = Math.max(0, -wallet.availableBalance);
    const deficitAfterNdp = Math.max(0, -(wallet.availableBalance - holdAmount));
    const shortfallNdp = deficitAfterNdp - deficitBeforeNdp;
    const previewVersion = this.bookingPlatformFeePreviewVersion({
      input,
      policy,
      owner,
      wallet,
      fee
    });
    const confirmation = input.insufficientBalanceConfirmation;

    if (shortfallNdp > 0) {
      if (!confirmation) {
        throw this.platformFeeConfirmationRequiredError({
          feeAmountNdp: holdAmount,
          availableBalanceNdp: wallet.availableBalance,
          shortfallNdp,
          payerType: policy.payerType,
          walletOwnerType: owner.ownerType,
          previewVersion
        });
      }
      if (!repository.findOrderFinancialByOverdraftConfirmationKey) {
        throw this.repositoryUnavailableError();
      }
      const usedConfirmation = await repository.findOrderFinancialByOverdraftConfirmationKey(
        confirmation.idempotencyKey
      );
      if (usedConfirmation && usedConfirmation.bookingOrderId !== input.bookingOrderId) {
        throw this.platformFeeConfirmationConflictError();
      }
      if (confirmation.previewVersion !== previewVersion) {
        throw this.platformFeePreviewStaleError();
      }
    }

    const updatedWallet =
      holdAmount > 0
        ? await repository.applyWalletDelta({
            walletId: wallet.id,
            availableDelta: -holdAmount,
            frozenDelta: holdAmount,
            ...(shortfallNdp > 0 ? {} : { requireAvailableAtLeast: holdAmount })
          })
        : wallet;
    if (!updatedWallet) {
      throw this.insufficientAvailableError();
    }

    await repository.createWalletHold!({
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      bookingOrderId: input.bookingOrderId,
      feeType: "b_platform_fee",
      holdAmountNdp: holdAmount,
      currency,
      status: "active",
      idempotencyKey,
      calculationLogId: fee.calculationLogId,
      metadata: { policy, owner, previewVersion, fee: this.feeMetadata(fee) }
    });
    await this.upsertOrderFinancial(repository, input, {
      bPlatformFeeHoldNdp: holdAmount,
      campaignDiscountNdp: fee.campaignDiscountNdp,
      platformFeePayerType: owner.payerType,
      platformFeePayerId: owner.payerId,
      appliedFeeRuleIds: fee.appliedRuleIds,
      settlementStatus: holdAmount > 0 ? "holding" : "pending",
      ...this.platformFeeSnapshotFields({
        policy,
        acceptedAt,
        amountNdp: holdAmount,
        wallet,
        shortfallNdp,
        confirmationKey: shortfallNdp > 0 ? (confirmation?.idempotencyKey ?? null) : null,
        previewVersion
      }),
      userRewardEligibleNdp: 100,
      userRewardStatus: shortfallNdp > 0 ? "pending" : "immediate",
      timelineEvent: {
        action: "booking_accept_hold",
        amountNdp: holdAmount,
        shortfallNdp,
        policy,
        owner,
        previewVersion,
        fee: this.feeMetadata(fee)
      }
    }, currency);

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
      currency,
      metadata: { shopId: input.shopId, policy, owner, shortfallNdp, previewVersion }
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
      actualAmount: holdAmount,
      metadata: {
        insufficientBalanceConfirmed: shortfallNdp > 0,
        shortfallNdp,
        confirmationKey: confirmation?.idempotencyKey ?? null,
        previewVersion
      }
    });

    return (await repository.findTransactionByIdempotencyKey(idempotencyKey)) ?? transaction;
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
      const lockedSettlement =
        input.orderType === "booking"
          ? await this.lockOrderFinancialPlatformFeeSnapshot(repository, input.bookingOrderId)
          : null;
      const snapshot = lockedSettlement?.snapshot ?? null;
      if (snapshot && !snapshot.platformFeeEnabledSnapshot) {
        if (snapshot.settlementStatus === "cancelled") {
          return undefined;
        }
        await this.upsertOrderFinancial(repository, input, {
          platformFeeOutstandingNdp: 0,
          platformFeeDebtStatus: "none",
          userRewardEligibleNdp: 0,
          userRewardStatus: "disabled",
          userRewardDeadlineAt: null,
          userRewardGrantedAt: null,
          settlementStatus: "cancelled",
          timelineEvent: {
            action: "booking_cancel_platform_fee_disabled",
            amountNdp: 0
          }
        }, snapshot.ndpCurrency);

        return undefined;
      }
      const hold = snapshot
        ? await this.requireSnapshotPlatformFeeHold(repository, input.bookingOrderId)
        : await this.requireAcceptanceHold(repository, input);
      const currency = snapshot?.ndpCurrency ?? hold.currency;
      LedgerCurrencyService.assertSameCurrency(currency, [hold.currency]);
      const releaseAmount = this.remainingHoldAmount(hold);

      if (releaseAmount <= 0) {
        await repository.updateWalletHold!({
          id: hold.id,
          status: "released",
          releasedAt: new Date()
        });
        await this.upsertOrderFinancial(repository, input, {
          ...(snapshot
            ? {
                platformFeeOutstandingNdp: 0,
                platformFeeDebtStatus: "none" as const,
                userRewardEligibleNdp: 0,
                userRewardStatus: "disabled" as const,
                userRewardDeadlineAt: null,
                userRewardGrantedAt: null
              }
            : {}),
          settlementStatus: "cancelled",
          timelineEvent: {
            action: "booking_cancel_no_remaining_hold",
            amountNdp: 0
          }
        }, currency);

        return undefined;
      }

      const wallet =
        lockedSettlement?.payerWallet ??
        (await repository.getOrCreateWallet({
          ownerType: hold.ownerType,
          ownerId: hold.ownerId,
          currency
        }));
      LedgerCurrencyService.assertSameCurrency(currency, [wallet.currency]);

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
        currency,
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
        reason:
          hold.feeType === "c_request_dispatch_fee"
            ? "request_cancel_dispatch_fee_unfreeze"
            : "booking_cancel_unfreeze"
      });
      await repository.updateWalletHold!({
        id: hold.id,
        releasedAmountNdp: hold.releasedAmountNdp + releaseAmount,
        status: "released",
        releasedAt: new Date()
      });
      await this.upsertOrderFinancial(repository, input, {
        releasedNdp: releaseAmount,
        ...(snapshot
          ? {
              platformFeeOutstandingNdp: 0,
              platformFeeDebtStatus: "none" as const,
              userRewardEligibleNdp: 0,
              userRewardStatus: "disabled" as const,
              userRewardDeadlineAt: null,
              userRewardGrantedAt: null
            }
          : {}),
        settlementStatus: "cancelled",
        timelineEvent: {
          action: "booking_cancel_release",
          amountNdp: releaseAmount
        }
      }, currency);
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
    if (input.orderType === "request") {
      return this.settleRequestCompletion(input, context);
    }

    return this.repository.runInTransaction(async (repository, transactionClient) => {
      const idempotencyKey = `booking:${input.bookingOrderId}:complete:settlement`;
      const existing = await repository.findTransactionByIdempotencyKey(idempotencyKey);

      if (existing) {
        return existing;
      }
      this.assertFinanceMutationRepository(repository);
      const lockedSettlement = await this.lockOrderFinancialPlatformFeeSnapshot(
        repository,
        input.bookingOrderId
      );
      if (lockedSettlement) {
        return this.settleBookingCompletionFromSnapshot(
          repository,
          input,
          lockedSettlement.snapshot,
          lockedSettlement.payerWallet,
          idempotencyKey,
          { transactionClient }
        );
      }
      const hold = await this.requireAcceptanceHold(repository, input);
      const currency = hold.currency;
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
        currency
      });

      if (merchantWallet.frozenBalance < captureAmount + releaseAmount) {
        throw this.insufficientFrozenError();
      }

      const customerWallet = await repository.getOrCreateWallet({
        ownerType: "user",
        ownerId: input.customerUserId,
        currency
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
      }, currency);

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
        currency,
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

  private async settleBookingCompletionFromSnapshot(
    repository: LedgerRepositoryPort,
    input: BookingLedgerSettlementInput & { customerUserId: number },
    snapshot: OrderFinancialPlatformFeeSnapshot,
    lockedPayerWallet: WalletPayload | null,
    idempotencyKey: string,
    context: LedgerMutationContext
  ): Promise<LedgerTransactionPayload | void> {
    const completedAt = input.completedAt ?? this.now();
    if (!snapshot.platformFeeEnabledSnapshot) {
      if (snapshot.settlementStatus === "settled") {
        return undefined;
      }
      await this.upsertOrderFinancial(repository, input, {
        bPlatformFeeActualNdp: 0,
        userRewardNdp: 0,
        platformFeeOutstandingNdp: 0,
        platformFeeDebtStatus: "none",
        userRewardEligibleNdp: 0,
        userRewardStatus: "disabled",
        userRewardDeadlineAt: null,
        userRewardGrantedAt: null,
        settlementStatus: "settled",
        timelineEvent: {
          action: "booking_complete_platform_fee_disabled",
          platformFeeNdp: 0,
          userRewardNdp: 0
        }
      }, snapshot.ndpCurrency);

      return undefined;
    }

    const hold = await this.requireSnapshotPlatformFeeHold(repository, input.bookingOrderId);
    LedgerCurrencyService.assertSameCurrency(snapshot.ndpCurrency, [
      hold.currency,
      ...(lockedPayerWallet ? [lockedPayerWallet.currency] : [])
    ]);
    const holdRemaining = this.remainingHoldAmount(hold);
    const captureAmount = Math.min(snapshot.platformFeeAmountNdpSnapshot, holdRemaining);
    const releaseAmount = Math.max(0, holdRemaining - captureAmount);
    const reward = await this.calculateFee("user_reward", "capture", input, context);
    const eligibleRewardNdp = reward.finalFeeNdp;
    const rewardPending = snapshot.platformFeeOutstandingNdp > 0;
    const rewardAmount = rewardPending ? 0 : eligibleRewardNdp;
    const rewardDeadlineAt = rewardPending
      ? new Date(completedAt.getTime() + 7 * 24 * 60 * 60 * 1000)
      : null;
    const transactionAmount = captureAmount + releaseAmount + rewardAmount;
    if (!lockedPayerWallet) {
      throw this.walletMutationError();
    }
    const payerWallet = lockedPayerWallet;
    if (snapshot.platformFeeWalletId && payerWallet.id !== snapshot.platformFeeWalletId) {
      throw this.walletMutationError();
    }
    if (payerWallet.frozenBalance < captureAmount + releaseAmount) {
      throw this.insufficientFrozenError();
    }

    const updatedPayerWallet =
      captureAmount + releaseAmount > 0
        ? await repository.applyWalletDelta({
            walletId: payerWallet.id,
            availableDelta: releaseAmount,
            frozenDelta: -(captureAmount + releaseAmount),
            requireFrozenAtLeast: captureAmount + releaseAmount
          })
        : payerWallet;
    if (!updatedPayerWallet) {
      throw this.insufficientFrozenError();
    }

    const customerWallet =
      rewardAmount > 0
        ? await repository.getOrCreateWallet({
            ownerType: "user",
            ownerId: input.customerUserId,
            currency: snapshot.ndpCurrency
          })
        : null;
    const updatedCustomerWallet = customerWallet
      ? await repository.applyWalletDelta({
          walletId: customerWallet.id,
          availableDelta: rewardAmount,
          frozenDelta: 0
        })
      : null;
    if (customerWallet && !updatedCustomerWallet) {
      throw this.walletMutationError();
    }

    await repository.updateWalletHold!({
      id: hold.id,
      capturedAmountNdp: hold.capturedAmountNdp + captureAmount,
      releasedAmountNdp: hold.releasedAmountNdp + releaseAmount,
      status:
        captureAmount === 0 ? "released" : releaseAmount > 0 ? "partially_captured" : "captured",
      capturedAt: captureAmount > 0 ? completedAt : null,
      releasedAt: releaseAmount > 0 ? completedAt : null,
      metadata: {
        holdMetadata: hold.metadata,
        snapshottedPlatformFeeNdp: snapshot.platformFeeAmountNdpSnapshot,
        rewardFee: this.feeMetadata(reward)
      }
    });
    await this.upsertOrderFinancial(repository, input, {
      bPlatformFeeActualNdp: captureAmount,
      userRewardNdp: rewardAmount,
      releasedNdp: releaseAmount,
      platformFeeOutstandingNdp: snapshot.platformFeeOutstandingNdp,
      platformFeeDebtStatus: snapshot.platformFeeDebtStatus,
      userRewardEligibleNdp: eligibleRewardNdp,
      userRewardStatus: rewardPending ? "pending" : "immediate",
      userRewardDeadlineAt: rewardDeadlineAt,
      userRewardGrantedAt: rewardPending ? null : completedAt,
      appliedFeeRuleIds: reward.appliedRuleIds,
      settlementStatus: "settled",
      timelineEvent: {
        action: "booking_complete_snapshot_settlement",
        platformFeeNdp: captureAmount,
        releasedNdp: releaseAmount,
        userRewardNdp: rewardAmount,
        userRewardEligibleNdp: eligibleRewardNdp,
        rewardStatus: rewardPending ? "pending" : "immediate",
        rewardDeadlineAt: rewardDeadlineAt?.toISOString() ?? null
      }
    }, snapshot.ndpCurrency);

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
      currency: snapshot.ndpCurrency,
      metadata: {
        shopId: input.shopId,
        customerUserId: input.customerUserId,
        platformFeeWalletId: payerWallet.id,
        platformFeeAmount: captureAmount,
        platformFeeReleaseAmount: releaseAmount,
        customerRewardAmount: rewardAmount,
        rewardStatus: rewardPending ? "pending" : "immediate"
      }
    });
    if (captureAmount > 0) {
      await repository.createLedgerEntry({
        transactionId: transaction.id,
        walletId: payerWallet.id,
        direction: "frozen_debit",
        amount: captureAmount,
        availableDelta: 0,
        frozenDelta: -captureAmount,
        availableBalanceAfter: updatedPayerWallet.availableBalance,
        frozenBalanceAfter: updatedPayerWallet.frozenBalance,
        reason: "booking_complete_platform_fee_debit"
      });
    }
    if (releaseAmount > 0) {
      await repository.createLedgerEntry({
        transactionId: transaction.id,
        walletId: payerWallet.id,
        direction: "unfreeze",
        amount: releaseAmount,
        availableDelta: releaseAmount,
        frozenDelta: -releaseAmount,
        availableBalanceAfter: updatedPayerWallet.availableBalance,
        frozenBalanceAfter: updatedPayerWallet.frozenBalance,
        reason: "booking_complete_hold_difference_release"
      });
    }
    if (rewardAmount > 0 && updatedCustomerWallet) {
      await repository.createLedgerEntry({
        transactionId: transaction.id,
        walletId: updatedCustomerWallet.id,
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
      action: "ledger.booking_complete.snapshot_settlement",
      expectedAmount: transactionAmount,
      actualAmount: transactionAmount
    });

    return (await repository.findTransactionByIdempotencyKey(idempotencyKey)) ?? transaction;
  }

  private settleRequestCompletion(
    input: BookingLedgerSettlementInput & { customerUserId: number },
    context: LedgerMutationContext
  ): Promise<LedgerTransactionPayload | void> {
    return this.repository.runInTransaction(async (repository) => {
      const idempotencyKey = `booking:${input.bookingOrderId}:complete:settlement`;
      const existing = await repository.findTransactionByIdempotencyKey(idempotencyKey);

      if (existing) {
        return existing;
      }
      this.assertFinanceMutationRepository(repository);
      const hold = await this.requireAcceptanceHold(repository, input);
      const currency = hold.currency;
      const fee = await this.calculateFee("c_request_dispatch_fee", "capture", input, context);
      const holdRemaining = this.remainingHoldAmount(hold);
      const captureAmount = Math.min(fee.finalFeeNdp, holdRemaining);
      const releaseAmount = Math.max(0, holdRemaining - captureAmount);
      const transactionAmount = captureAmount + releaseAmount;

      const customerWallet = await repository.getOrCreateWallet({
        ownerType: "user",
        ownerId: input.customerUserId,
        currency
      });

      if (customerWallet.frozenBalance < captureAmount + releaseAmount) {
        throw this.insufficientFrozenError();
      }

      const updatedCustomerWallet =
        captureAmount + releaseAmount > 0
          ? await repository.applyWalletDelta({
              walletId: customerWallet.id,
              availableDelta: releaseAmount,
              frozenDelta: -(captureAmount + releaseAmount),
              requireFrozenAtLeast: captureAmount + releaseAmount
            })
          : customerWallet;

      if (!updatedCustomerWallet) {
        throw this.insufficientFrozenError();
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
          dispatchFee: this.feeMetadata(fee)
        }
      });
      await this.upsertOrderFinancial(repository, input, {
        cRequestFeeActualNdp: captureAmount,
        campaignDiscountNdp: fee.campaignDiscountNdp,
        releasedNdp: releaseAmount,
        completedOrderOrdinalInPeriod: fee.completedOrderOrdinalInPeriod,
        appliedFeeRuleIds: fee.appliedRuleIds,
        settlementStatus: "settled",
        timelineEvent: {
          action: "request_complete_dispatch_fee_settlement",
          requestFeeNdp: captureAmount,
          releasedNdp: releaseAmount,
          fee
        }
      }, currency);

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
        currency,
        metadata: {
          shopId: input.shopId,
          customerUserId: input.customerUserId,
          requestFeeAmount: captureAmount,
          customerReleaseAmount: releaseAmount,
          fee
        }
      });
      if (captureAmount > 0) {
        await repository.createLedgerEntry({
          transactionId: transaction.id,
          walletId: customerWallet.id,
          direction: "frozen_debit",
          amount: captureAmount,
          availableDelta: 0,
          frozenDelta: -captureAmount,
          availableBalanceAfter: updatedCustomerWallet.availableBalance,
          frozenBalanceAfter: updatedCustomerWallet.frozenBalance,
          reason: "request_complete_dispatch_fee_debit"
        });
      }
      if (releaseAmount > 0) {
        await repository.createLedgerEntry({
          transactionId: transaction.id,
          walletId: customerWallet.id,
          direction: "unfreeze",
          amount: releaseAmount,
          availableDelta: releaseAmount,
          frozenDelta: -releaseAmount,
          availableBalanceAfter: updatedCustomerWallet.availableBalance,
          frozenBalanceAfter: updatedCustomerWallet.frozenBalance,
          reason: "request_complete_dispatch_fee_release"
        });
      }
      await this.recordFinanceAndAudit(repository, transaction, {
        action: "ledger.request_complete.dispatch_fee_settlement",
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
    if (input.orderType === "request") {
      return this.releaseBookingHold(input, context);
    }

    return this.repository.runInTransaction(async (repository, transactionClient) => {
      const idempotencyKey = `booking:${input.bookingOrderId}:merchant-cancel:compensation`;
      const existing = await repository.findTransactionByIdempotencyKey(idempotencyKey);

      if (existing) {
        return existing;
      }
      this.assertFinanceMutationRepository(repository);
      const financialSnapshot = await repository.findOrderFinancialPlatformFeeSnapshot?.(
        input.bookingOrderId
      );
      const currency =
        financialSnapshot?.ndpCurrency ?? (await this.resolveBookingCurrency(repository, input));
      await this.releaseBookingHold(input, { transactionClient });
      const penaltyFee = await this.calculateFee("penalty", "capture", input, {
        transactionClient
      });
      const penaltyAmount = penaltyFee.finalFeeNdp;

      const merchantWallet = await repository.getOrCreateWallet({
        ownerType: "shop",
        ownerId: input.shopId,
        currency
      });

      if (merchantWallet.availableBalance < penaltyAmount) {
        throw this.insufficientAvailableError();
      }

      const customerWallet = await repository.getOrCreateWallet({
        ownerType: "user",
        ownerId: input.customerUserId,
        currency
      });
      const updatedMerchantWallet =
        penaltyAmount > 0
          ? await repository.applyWalletDelta({
              walletId: merchantWallet.id,
              availableDelta: -penaltyAmount,
              frozenDelta: 0,
              requireAvailableAtLeast: penaltyAmount
            })
          : merchantWallet;

      if (!updatedMerchantWallet) {
        throw this.insufficientAvailableError();
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
      }, currency);

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
        currency,
        metadata: {
          shopId: input.shopId,
          customerUserId: input.customerUserId,
          penaltyFee
        }
      });
      await repository.createLedgerEntry({
        transactionId: transaction.id,
        walletId: merchantWallet.id,
        direction: "available_debit",
        amount: penaltyAmount,
        availableDelta: -penaltyAmount,
        frozenDelta: 0,
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
    context: LedgerMutationContext,
    override: Pick<
      Parameters<FeeCalculationService["calculateFee"]>[0],
      "payerOverride" | "waiveReason"
    > = {}
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
        timezone: "Asia/Tokyo",
        ...override
      },
      { transactionClient: context.transactionClient }
    );
  }

  private async resolveBookingPlatformFeeOwner(
    repository: LedgerRepositoryPort,
    input: BookingLedgerSettlementInput,
    policy: BookingPlatformFeePolicySnapshot
  ): Promise<{
    payerType: "shop" | "technician";
    payerId: number;
    ownerType: "shop" | "user";
    ownerId: number;
  }> {
    if (policy.payerType === "shop") {
      return {
        payerType: "shop",
        payerId: input.shopId,
        ownerType: "shop",
        ownerId: input.shopId
      };
    }

    if (typeof input.technicianProfileId !== "number" || !repository.findTechnicianUserId) {
      throw this.platformFeeTechnicianRequiredError();
    }
    const technicianUserId = await repository.findTechnicianUserId(input.technicianProfileId);
    if (!technicianUserId) {
      throw this.platformFeeTechnicianRequiredError();
    }

    return {
      payerType: "technician",
      payerId: input.technicianProfileId,
      ownerType: "user",
      ownerId: technicianUserId
    };
  }

  private platformFeeSnapshotFields(input: {
    policy: BookingPlatformFeePolicySnapshot;
    acceptedAt: Date;
    amountNdp: number;
    wallet: WalletPayload | null;
    shortfallNdp: number;
    confirmationKey: string | null;
    previewVersion: string | null;
  }): Pick<
    OrderFinancialUpsertInput,
    | "platformFeeEnabledSnapshot"
    | "platformFeeGlobalVersion"
    | "platformFeePolicyVersion"
    | "platformFeeAmountNdpSnapshot"
    | "platformFeeWalletOwnerType"
    | "platformFeeWalletOwnerId"
    | "platformFeeWalletId"
    | "platformFeeShortfallNdp"
    | "platformFeeOutstandingNdp"
    | "platformFeeDebtStatus"
    | "platformFeeAcceptedAt"
    | "platformFeeOverdraftConfirmationKey"
    | "platformFeePreviewVersion"
  > {
    return {
      platformFeeEnabledSnapshot: input.policy.feeEnabled,
      platformFeeGlobalVersion: input.policy.globalVersion,
      platformFeePolicyVersion: input.policy.policyVersion,
      platformFeeAmountNdpSnapshot: input.amountNdp,
      platformFeeWalletOwnerType: input.wallet?.ownerType ?? null,
      platformFeeWalletOwnerId: input.wallet?.ownerId ?? null,
      platformFeeWalletId: input.wallet?.id ?? null,
      platformFeeShortfallNdp: input.shortfallNdp,
      platformFeeOutstandingNdp: input.shortfallNdp,
      platformFeeDebtStatus: input.shortfallNdp > 0 ? "outstanding" : "none",
      platformFeeAcceptedAt: input.acceptedAt,
      platformFeeOverdraftConfirmationKey: input.confirmationKey,
      platformFeePreviewVersion: input.previewVersion
    };
  }

  private bookingPlatformFeePreviewVersion(input: {
    input: BookingLedgerSettlementInput;
    policy: BookingPlatformFeePolicySnapshot;
    owner: {
      payerType: "shop" | "technician";
      payerId: number;
      ownerType: "shop" | "user";
      ownerId: number;
    };
    wallet: WalletPayload;
    fee: FeeCalculationResult;
  }): string {
    const stableTuple = [
      input.input.bookingOrderId,
      input.policy.globalVersion,
      input.policy.policyVersion,
      input.policy.feeEnabled,
      input.owner.payerType,
      input.owner.payerId,
      input.owner.ownerType,
      input.owner.ownerId,
      input.wallet.id,
      input.fee.holdAmountNdp,
      input.wallet.availableBalance,
      input.fee.appliedRuleIds
    ];

    return `sha256:${createHash("sha256").update(JSON.stringify(stableTuple)).digest("hex")}`;
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

  private async lockOrderFinancialPlatformFeeSnapshot(
    repository: LedgerRepositoryPort,
    bookingOrderId: number
  ): Promise<{
    snapshot: OrderFinancialPlatformFeeSnapshot;
    payerWallet: WalletPayload | null;
  } | null> {
    if (
      !repository.findOrderFinancialPlatformFeeSnapshot ||
      !repository.lockOrderFinancialPlatformFeeSnapshot ||
      !repository.lockWalletById
    ) {
      throw this.repositoryUnavailableError();
    }
    const preliminary = await repository.findOrderFinancialPlatformFeeSnapshot(bookingOrderId);
    if (!preliminary) {
      return null;
    }
    const payerWallet =
      preliminary.platformFeeWalletId === null
        ? null
        : await repository.lockWalletById(preliminary.platformFeeWalletId);
    if (preliminary.platformFeeWalletId !== null && !payerWallet) {
      throw this.walletMutationError();
    }
    const locked = await repository.lockOrderFinancialPlatformFeeSnapshot(bookingOrderId);
    if (!locked || locked.platformFeeWalletId !== preliminary.platformFeeWalletId) {
      throw this.walletMutationError();
    }
    LedgerCurrencyService.assertSameCurrency(locked.ndpCurrency, [
      preliminary.ndpCurrency,
      ...(payerWallet ? [payerWallet.currency] : [])
    ]);
    return { snapshot: locked, payerWallet };
  }

  private async requireAcceptanceHold(
    repository: LedgerRepositoryPort,
    input: BookingLedgerSettlementInput
  ): Promise<WalletHoldPayload> {
    const feeType = this.acceptanceFeeType(input);
    const holdOwner = this.acceptanceHoldOwner(input, feeType);
    const hold = await repository.findWalletHold?.({
      bookingOrderId: input.bookingOrderId,
      ownerType: holdOwner.ownerType,
      ownerId: holdOwner.ownerId,
      feeType
    });

    if (!hold) {
      throw this.insufficientFrozenError();
    }

    return hold;
  }

  private async requireSnapshotPlatformFeeHold(
    repository: LedgerRepositoryPort,
    bookingOrderId: number
  ): Promise<WalletHoldPayload> {
    const hold = await repository.findPlatformFeeHoldByBookingOrderId?.(bookingOrderId);
    if (!hold) {
      throw this.insufficientFrozenError();
    }

    return hold;
  }

  private acceptanceFeeType(input: BookingLedgerSettlementInput): FeeType {
    return input.orderType === "request" ? "c_request_dispatch_fee" : "b_platform_fee";
  }

  private acceptanceHoldOwner(
    input: BookingLedgerSettlementInput,
    feeType: FeeType
  ): { ownerType: WalletOwnerType; ownerId: number } {
    if (feeType === "c_request_dispatch_fee") {
      return {
        ownerType: "user",
        ownerId: this.requireCustomerUserId(input)
      };
    }

    return {
      ownerType: "shop",
      ownerId: input.shopId
    };
  }

  private holdFinancialFields(
    feeType: FeeType,
    holdAmount: number
  ): Pick<OrderFinancialUpsertInput, "bPlatformFeeHoldNdp" | "cRequestFeeHoldNdp"> {
    if (feeType === "c_request_dispatch_fee") {
      return { cRequestFeeHoldNdp: holdAmount };
    }

    return { bPlatformFeeHoldNdp: holdAmount };
  }

  private requireCustomerUserId(input: BookingLedgerSettlementInput): number {
    if (typeof input.customerUserId === "number") {
      return input.customerUserId;
    }

    throw new AppError({
      code: ERROR_CODES.INTERNAL,
      message: "error.ledger.customer_user_required",
      statusCode: 500
    });
  }

  private resolveCurrencyForUser(
    repository: LedgerRepositoryPort,
    userId: number
  ): Promise<LedgerCurrency> {
    return new LedgerCurrencyService(repository).resolveForUser(userId);
  }

  private resolveBookingCurrency(
    repository: LedgerRepositoryPort,
    input: BookingLedgerSettlementInput
  ): Promise<LedgerCurrency> {
    const userId = input.customerUserId ?? input.actorUserId;
    if (userId === null || userId === undefined) {
      throw new AppError({
        code: ERROR_CODES.INTERNAL,
        message: "error.ledger.currency_user_required",
        statusCode: 500
      });
    }

    return this.resolveCurrencyForUser(repository, userId);
  }

  private async lockWalletById(
    repository: LedgerRepositoryPort,
    walletId: number
  ): Promise<WalletPayload> {
    if (!repository.lockWalletById) {
      throw this.repositoryUnavailableError();
    }
    const wallet = await repository.lockWalletById(walletId);
    if (!wallet) {
      throw this.walletMutationError();
    }

    return wallet;
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
    override: Partial<OrderFinancialUpsertInput>,
    ndpCurrency: LedgerCurrency
  ): Promise<void> {
    return repository.upsertOrderFinancial!({
      bookingOrderId: input.bookingOrderId,
      orderType: input.orderType,
      ndpCurrency,
      customerUserId: input.customerUserId ?? 0,
      shopId: input.shopId,
      technicianProfileId: input.technicianProfileId ?? null,
      serviceAmountJpy: input.serviceAmountJpy,
      unknownOrUnreportedServiceAmountJpy: input.serviceAmountJpy,
      ...override
    });
  }

  public createWalletAdjustmentRequest(
    actor: AuthenticatedAccessContext,
    input: CreateWalletAdjustmentRequestInput
  ): Promise<WalletAdjustmentRequestPayload> {
    return this.repository.runInTransaction(async (repository) => {
      this.assertWalletAdjustmentRepository(repository);
      const owner = this.walletOwnerForActor(actor);
      const currency = await this.resolveCurrencyForUser(repository, actor.userId);
      if (currency === "TEST_NDP") {
        throw this.testNdpSettlementForbiddenError();
      }
      const existing = await repository.findWalletAdjustmentByIdempotencyKey!(input.idempotencyKey);

      if (existing) {
        if (
          existing.ownerType !== owner.ownerType ||
          existing.ownerId !== owner.ownerId ||
          existing.type !== input.type ||
          existing.amountNdp !== input.amountNdp ||
          existing.bankReference !== (input.bankReference ?? null) ||
          existing.note !== (input.note ?? null)
        ) {
          throw this.walletAdjustmentConflictError();
        }

        return existing;
      }

      if (input.type === "withdrawal" && actor.roles.includes("scout")) {
        if (!this.affiliateWithdrawalEligibility) {
          throw new AppError({
            code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
            message: "error.affiliate_withdrawal.verification_unavailable",
            statusCode: 503
          });
        }
        await this.affiliateWithdrawalEligibility.assertEligible(actor.userId, this.now());
      }

      const wallet = await repository.getOrCreateWallet({
        ...owner,
        currency
      });
      const created = await repository.createWalletAdjustmentRequest!({
        ...input,
        ...owner,
        walletId: wallet.id,
        requestedById: actor.userId
      });
      await repository.createAuditLog({
        actorUserId: actor.userId,
        action: "wallet.adjustment.requested",
        targetType: "wallet_adjustment_request",
        targetId: created.id,
        metadata: {
          type: created.type,
          ownerType: created.ownerType,
          ownerId: created.ownerId,
          amountNdp: created.amountNdp
        }
      });

      return created;
    });
  }

  public listMyWalletAdjustmentRequests(
    actor: AuthenticatedAccessContext,
    input: PaginationInput
  ): Promise<PaginatedResponse<WalletAdjustmentRequestPayload>> {
    this.assertWalletAdjustmentRepository(this.repository);
    const owner = this.walletOwnerForActor(actor);

    return this.repository.listWalletAdjustmentRequests!({ ...input, ...owner });
  }

  public listWalletAdjustmentRequests(
    actor: AuthenticatedAccessContext,
    input: WalletAdjustmentRequestListInput
  ): Promise<PaginatedResponse<WalletAdjustmentRequestPayload>> {
    this.assertPlatformReviewer(actor);
    this.assertWalletAdjustmentRepository(this.repository);

    return this.repository.listWalletAdjustmentRequests!(input);
  }

  public reviewWalletAdjustmentRequest(
    actor: AuthenticatedAccessContext,
    id: number,
    input: ReviewWalletAdjustmentRequestInput
  ): Promise<WalletAdjustmentRequestPayload> {
    this.assertPlatformReviewer(actor);

    return this.repository.runInTransaction(async (repository) => {
      this.assertWalletAdjustmentRepository(repository);
      const request = await repository.lockWalletAdjustmentRequest!(id);

      if (!request) {
        throw new AppError({
          code: ERROR_CODES.WALLET_ADJUSTMENT_NOT_FOUND,
          message: "error.wallet.adjustment_not_found",
          statusCode: 404
        });
      }
      if (request.status !== "pending") {
        if (
          (input.action === "approve" && request.status === "approved") ||
          (input.action === "reject" && request.status === "rejected")
        ) {
          return request;
        }

        throw this.walletAdjustmentInvalidStateError();
      }

      if (input.action === "reject") {
        const rejected = await repository.rejectWalletAdjustmentRequest!({
          id: request.id,
          reviewedById: actor.userId,
          reviewNote: input.note
        });
        await repository.createAuditLog({
          actorUserId: actor.userId,
          action: "wallet.adjustment.rejected",
          targetType: "wallet_adjustment_request",
          targetId: request.id,
          metadata: { type: request.type, amountNdp: request.amountNdp, note: input.note }
        });

        return rejected;
      }

      const wallet = await this.lockWalletById(repository, request.walletId);
      if (
        wallet.ownerType !== request.ownerType ||
        wallet.ownerId !== request.ownerId ||
        wallet.currency === "TEST_NDP"
      ) {
        if (wallet.currency === "TEST_NDP") {
          throw this.testNdpSettlementForbiddenError();
        }
        throw this.walletMutationError();
      }
      const availableDelta = request.type === "topup" ? request.amountNdp : -request.amountNdp;
      const updatedWallet = await repository.applyWalletDelta({
        walletId: wallet.id,
        availableDelta,
        frozenDelta: 0,
        ...(request.type === "withdrawal" ? { requireAvailableAtLeast: request.amountNdp } : {})
      });

      if (!updatedWallet) {
        if (request.type === "withdrawal") {
          throw this.insufficientAvailableError();
        }
        throw this.walletMutationError();
      }

      const transaction = await repository.createTransaction({
        idempotencyKey: `wallet-adjustment:${request.id}:approved`,
        type: request.type === "topup" ? "manual_topup_approved" : "manual_withdrawal_approved",
        referenceType: "wallet_adjustment_request",
        referenceId: request.id,
        actorUserId: actor.userId,
        amount: request.amountNdp,
        currency: wallet.currency,
        metadata: {
          ownerType: request.ownerType,
          ownerId: request.ownerId,
          bankReference: request.bankReference,
          reviewNote: input.note
        }
      });
      await repository.createLedgerEntry({
        transactionId: transaction.id,
        walletId: wallet.id,
        direction: request.type === "topup" ? "available_credit" : "available_debit",
        amount: request.amountNdp,
        availableDelta,
        frozenDelta: 0,
        availableBalanceAfter: updatedWallet.availableBalance,
        frozenBalanceAfter: updatedWallet.frozenBalance,
        reason: request.type === "topup" ? "manual_topup_approved" : "manual_withdrawal_approved"
      });
      await this.recordFinanceAndAudit(repository, transaction, {
        action: `ledger.wallet_adjustment.${request.type}.approved`,
        expectedAmount: request.amountNdp,
        actualAmount: request.amountNdp
      });
      if (request.type === "topup") {
        await this.allocateApprovedTopupToPlatformFeeDebt(
          repository,
          wallet.id,
          request.amountNdp,
          actor.userId
        );
      }

      return repository.approveWalletAdjustmentRequest!({
        id: request.id,
        reviewedById: actor.userId,
        reviewNote: input.note,
        ledgerTransactionId: transaction.id
      });
    });
  }

  private async allocateApprovedTopupToPlatformFeeDebt(
    repository: LedgerRepositoryPort,
    walletId: number,
    amountNdp: number,
    actorUserId: number
  ): Promise<void> {
    this.assertPlatformFeeDebtAllocationRepository(repository);
    let remainingBudgetNdp = amountNdp;

    while (remainingBudgetNdp > 0) {
      const candidateIds = await repository.listOutstandingPlatformFeeDebtIds!({
        walletId,
        limit: PLATFORM_FEE_DEBT_ALLOCATION_BATCH_SIZE
      });
      if (candidateIds.length === 0) {
        return;
      }
      let progressed = false;

      for (const id of candidateIds) {
        if (remainingBudgetNdp <= 0) {
          break;
        }
        const debt = await repository.lockPlatformFeeDebt!(id);
        if (
          !debt ||
          debt.platformFeeWalletId !== walletId ||
          debt.platformFeeDebtStatus !== "outstanding" ||
          debt.platformFeeOutstandingNdp <= 0
        ) {
          continue;
        }

        const allocatedNdp = Math.min(remainingBudgetNdp, debt.platformFeeOutstandingNdp);
        const outstandingNdp = debt.platformFeeOutstandingNdp - allocatedNdp;
        const settled = outstandingNdp === 0;
        const rewardUpdate = settled
          ? await this.resolveSettledDebtReward(repository, debt, actorUserId)
          : {};
        const updated = await repository.updatePlatformFeeDebt!({
          id: debt.id,
          expectedOutstandingNdp: debt.platformFeeOutstandingNdp,
          platformFeeOutstandingNdp: outstandingNdp,
          platformFeeDebtStatus: settled ? "settled" : "outstanding",
          ...rewardUpdate
        });
        if (!updated) {
          throw this.walletMutationError();
        }

        remainingBudgetNdp -= allocatedNdp;
        progressed = true;
        await repository.createAuditLog({
          actorUserId,
          action: "booking.platform_fee.debt.allocated",
          targetType: "order_financial",
          targetId: debt.id,
          metadata: {
            bookingOrderId: debt.bookingOrderId,
            walletId,
            allocatedNdp,
            outstandingNdp,
            debtStatus: settled ? "settled" : "outstanding"
          }
        });
      }

      if (!progressed) {
        return;
      }
    }
  }

  private async resolveSettledDebtReward(
    repository: LedgerRepositoryPort,
    debt: PlatformFeeDebtAllocationRecord,
    actorUserId: number
  ): Promise<{
    userRewardStatus?: UserRewardStatus;
    userRewardNdp?: number;
    userRewardGrantedAt?: Date | null;
  }> {
    if (debt.ndpCurrency === "TEST_NDP") {
      throw this.testNdpSettlementForbiddenError();
    }
    if (debt.settlementStatus !== "settled") {
      return {
        userRewardStatus: "immediate",
        userRewardNdp: 0,
        userRewardGrantedAt: null
      };
    }
    if (debt.userRewardStatus !== "pending") {
      return {};
    }
    const resolvedAt = await repository.getDatabaseNow!();
    if (!debt.userRewardDeadlineAt || resolvedAt >= debt.userRewardDeadlineAt) {
      await repository.createAuditLog({
        actorUserId,
        action: "booking.user_reward.expired",
        targetType: "order_financial",
        targetId: debt.id,
        metadata: {
          bookingOrderId: debt.bookingOrderId,
          deadlineAt: debt.userRewardDeadlineAt?.toISOString() ?? null,
          resolvedAt: resolvedAt.toISOString()
        }
      });

      return {
        userRewardStatus: "expired",
        userRewardNdp: 0,
        userRewardGrantedAt: null
      };
    }

    const idempotencyKey = `booking:${debt.bookingOrderId}:reward:settlement`;
    const existing = await repository.findTransactionByIdempotencyKey(idempotencyKey);
    if (!existing) {
      const customerWallet = await repository.getOrCreateWallet({
        ownerType: "user",
        ownerId: debt.customerUserId,
        currency: debt.ndpCurrency
      });
      const updatedCustomerWallet = await repository.applyWalletDelta({
        walletId: customerWallet.id,
        availableDelta: debt.userRewardEligibleNdp,
        frozenDelta: 0
      });
      if (!updatedCustomerWallet) {
        throw this.walletMutationError();
      }
      const transaction = await repository.createTransaction({
        idempotencyKey,
        type: "booking_complete_settlement",
        referenceType: "booking_order",
        referenceId: debt.bookingOrderId,
        actorUserId,
        amount: debt.userRewardEligibleNdp,
        currency: debt.ndpCurrency,
        metadata: {
          delayedUserReward: true,
          orderFinancialId: debt.id,
          customerUserId: debt.customerUserId
        }
      });
      if (debt.userRewardEligibleNdp > 0) {
        await repository.createLedgerEntry({
          transactionId: transaction.id,
          walletId: customerWallet.id,
          direction: "available_credit",
          amount: debt.userRewardEligibleNdp,
          availableDelta: debt.userRewardEligibleNdp,
          frozenDelta: 0,
          availableBalanceAfter: updatedCustomerWallet.availableBalance,
          frozenBalanceAfter: updatedCustomerWallet.frozenBalance,
          reason: "booking_delayed_customer_reward"
        });
      }
      await this.recordFinanceAndAudit(repository, transaction, {
        action: "ledger.booking_user_reward.delayed_settlement",
        expectedAmount: debt.userRewardEligibleNdp,
        actualAmount: debt.userRewardEligibleNdp
      });
    }

    return {
      userRewardStatus: "paid",
      userRewardNdp: debt.userRewardEligibleNdp,
      userRewardGrantedAt: resolvedAt
    };
  }

  public async getMyWallet(actor: AuthenticatedAccessContext): Promise<WalletPayload> {
    const owner = this.walletOwnerForReadActor(actor);
    const currency = await this.resolveCurrencyForUser(this.repository, actor.userId);

    if (this.repository.findWallet) {
      const existing = await this.repository.findWallet({
        ...owner,
        currency
      });

      if (existing) {
        return existing;
      }
    }

    const wallet = await this.repository.getOrCreateWallet({
      ...owner,
      currency
    });

    return wallet;
  }

  public async getWallet(input: WalletLookupInput): Promise<WalletPayload> {
    if (!this.repository.findWallet) {
      throw this.repositoryUnavailableError();
    }

    const wallet = await this.repository.findWallet({
      ...input,
      currency: input.currency ?? "NDP"
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

  public async listWalletLedger(
    actor: AuthenticatedAccessContext,
    input: WalletLedgerListInput
  ): Promise<PaginatedResponse<WalletLedgerPayload>> {
    if (!this.repository.listWalletLedger || !this.repository.findWallet) {
      throw this.repositoryUnavailableError();
    }

    if (
      actor.currentIdentityScopeType !== "global" &&
      actor.currentIdentityScopeType !== "platform"
    ) {
      const currency = await this.resolveCurrencyForUser(this.repository, actor.userId);
      const wallet = await this.repository.findWallet({
        ...this.walletOwnerForReadActor(actor),
        currency
      });

      if (!wallet || wallet.id !== input.walletId) {
        throw new AppError({
          code: ERROR_CODES.WALLET_NOT_FOUND,
          message: "error.wallet.not_found",
          statusCode: 404
        });
      }
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
    input: {
      action: string;
      expectedAmount: number;
      actualAmount: number;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    if (transaction.currency === "NDP") {
      await repository.createFinanceReconciliation({
        transactionId: transaction.id,
        referenceType: transaction.referenceType,
        referenceId: transaction.referenceId,
        currency: "NDP",
        expectedAmount: input.expectedAmount,
        actualAmount: input.actualAmount
      });
    }
    await repository.createAuditLog({
      actorUserId: transaction.actorUserId,
      action: input.action,
      targetId: transaction.id,
      metadata: {
        referenceType: transaction.referenceType,
        referenceId: transaction.referenceId,
        amount: transaction.amount,
        currency: transaction.currency,
        ...input.metadata
      }
    });
  }

  private async resolveAffiliateWalletId(
    repository: LedgerRepositoryPort,
    transaction: LedgerTransactionPayload,
    input: Pick<FreezeAffiliateTaskBudgetInput, "ownerType" | "ownerId">
  ): Promise<number> {
    const entryWalletId = transaction.entries[0]?.walletId;

    if (entryWalletId) {
      return entryWalletId;
    }

    const wallet = await repository.getOrCreateWallet({
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      currency: transaction.currency
    });

    return wallet.id;
  }

  private async resolveExistingAffiliateTaskBudgetRelease(
    repository: LedgerRepositoryPort,
    transaction: LedgerTransactionPayload,
    input: ReleaseAffiliateTaskBudgetInput
  ): Promise<AffiliateBudgetLedgerResult> {
    const metadata = transaction.metadata;
    const wallet = await this.lockWalletById(repository, input.walletId);

    if (!this.isPlainObject(metadata)) {
      throw this.walletMutationError();
    }
    const metadataKeys = Reflect.ownKeys(metadata);

    if (
      transaction.type !== "affiliate_task_budget_release" ||
      transaction.status !== "applied" ||
      transaction.referenceType !== "affiliate_task" ||
      transaction.referenceId !== input.taskId ||
      transaction.actorUserId !== input.actorUserId ||
      transaction.amount !== input.amountNdp ||
      transaction.currency !== wallet.currency ||
      metadata.taskId !== input.taskId ||
      metadata.ownerType !== input.ownerType ||
      metadata.ownerId !== input.ownerId ||
      metadata.walletId !== input.walletId ||
      metadataKeys.length !== 4 ||
      !["taskId", "ownerType", "ownerId", "walletId"].every((key) =>
        Object.prototype.hasOwnProperty.call(metadata, key)
      ) ||
      transaction.entries.length !== 1
    ) {
      throw this.walletMutationError();
    }

    const entry = transaction.entries[0];

    if (
      !entry ||
      entry.transactionId !== transaction.id ||
      entry.walletId !== input.walletId ||
      entry.direction !== "unfreeze" ||
      entry.amount !== input.amountNdp ||
      entry.availableDelta !== input.amountNdp ||
      entry.frozenDelta !== -input.amountNdp ||
      entry.reason !== "affiliate_task_budget_release"
    ) {
      throw this.walletMutationError();
    }

    return { transaction, walletId: input.walletId };
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  private async resolveAffiliateRewardLedgerResult(
    repository: LedgerRepositoryPort,
    transaction: LedgerTransactionPayload,
    input: SettleAffiliateRewardInput
  ): Promise<AffiliateRewardLedgerResult> {
    if (
      transaction.type !== "affiliate_reward_settlement" ||
      transaction.referenceType !== "affiliate_reward" ||
      transaction.referenceId !== input.rewardId ||
      transaction.amount !== input.amountNdp
    ) {
      throw this.walletMutationError();
    }

    const publisherEntry = transaction.entries.find((entry) => entry.direction === "frozen_debit");
    const claimantEntry = transaction.entries.find(
      (entry) => entry.direction === "available_credit"
    );
    const publisherWallet = await this.lockWalletById(repository, input.publisherWalletId);
    const claimantCurrency = await this.resolveCurrencyForUser(repository, input.claimantUserId);
    LedgerCurrencyService.assertSameCurrency(transaction.currency, [
      publisherWallet.currency,
      claimantCurrency
    ]);
    const claimantWallet = await repository.getOrCreateWallet({
      ownerType: "user",
      ownerId: input.claimantUserId,
      currency: transaction.currency
    });

    if (
      publisherWallet.id !== input.publisherWalletId ||
      publisherEntry?.walletId !== publisherWallet.id ||
      claimantEntry?.walletId !== claimantWallet.id
    ) {
      throw this.walletMutationError();
    }

    return {
      transaction,
      publisherWalletId: publisherWallet.id,
      claimantWalletId: claimantWallet.id
    };
  }

  private assertWalletAdjustmentRepository(repository: LedgerRepositoryPort): void {
    if (
      !repository.findWalletAdjustmentByIdempotencyKey ||
      !repository.createWalletAdjustmentRequest ||
      !repository.listWalletAdjustmentRequests ||
      !repository.lockWalletAdjustmentRequest ||
      !repository.approveWalletAdjustmentRequest ||
      !repository.rejectWalletAdjustmentRequest
    ) {
      throw this.repositoryUnavailableError();
    }
  }

  private assertPlatformFeeDebtAllocationRepository(repository: LedgerRepositoryPort): void {
    if (
      !repository.listOutstandingPlatformFeeDebtIds ||
      !repository.lockPlatformFeeDebt ||
      !repository.updatePlatformFeeDebt ||
      !repository.getDatabaseNow
    ) {
      throw this.repositoryUnavailableError();
    }
  }

  private walletOwnerForActor(actor: AuthenticatedAccessContext): {
    ownerType: WalletOwnerType;
    ownerId: number;
  } {
    if (actor.currentIdentityScopeType === "shop" && actor.currentIdentityScopeId) {
      return { ownerType: "shop", ownerId: actor.currentIdentityScopeId };
    }
    if (
      actor.currentIdentityScopeType === "platform" ||
      actor.currentIdentityType === "platform" ||
      actor.currentIdentityType === "admin"
    ) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.identity.forbidden",
        statusCode: 403
      });
    }

    return { ownerType: "user", ownerId: actor.userId };
  }

  private walletOwnerForReadActor(actor: AuthenticatedAccessContext): {
    ownerType: WalletOwnerType;
    ownerId: number;
  } {
    if (actor.currentIdentityScopeType === "shop" && actor.currentIdentityScopeId) {
      return { ownerType: "shop", ownerId: actor.currentIdentityScopeId };
    }

    return { ownerType: "user", ownerId: actor.userId };
  }

  private assertPlatformReviewer(actor: AuthenticatedAccessContext): void {
    if (
      actor.currentIdentityScopeType !== "global" &&
      actor.currentIdentityScopeType !== "platform"
    ) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.identity.forbidden",
        statusCode: 403
      });
    }
  }

  private insufficientAvailableError(): AppError {
    return new AppError({
      code: ERROR_CODES.WALLET_INSUFFICIENT_AVAILABLE,
      message: "error.wallet.insufficient_available",
      statusCode: 409
    });
  }

  private platformFeeConfirmationRequiredError(data: {
    feeAmountNdp: number;
    availableBalanceNdp: number;
    shortfallNdp: number;
    payerType: "shop" | "technician";
    walletOwnerType: "shop" | "user";
    previewVersion: string;
  }): AppError {
    return new AppError({
      code: ERROR_CODES.PLATFORM_FEE_INSUFFICIENT_CONFIRMATION_REQUIRED,
      message: "error.platform_fee.insufficient_balance_confirmation_required",
      statusCode: 409,
      data
    });
  }

  private platformFeePreviewStaleError(): AppError {
    return new AppError({
      code: ERROR_CODES.PLATFORM_FEE_PREVIEW_STALE,
      message: "error.platform_fee.preview_stale",
      statusCode: 409
    });
  }

  private platformFeeTechnicianRequiredError(): AppError {
    return new AppError({
      code: ERROR_CODES.PLATFORM_FEE_TECHNICIAN_REQUIRED,
      message: "error.platform_fee.technician_required",
      statusCode: 409
    });
  }

  private platformFeeConfirmationConflictError(): AppError {
    return new AppError({
      code: ERROR_CODES.PLATFORM_FEE_CONFIRMATION_CONFLICT,
      message: "error.platform_fee.confirmation_conflict",
      statusCode: 409
    });
  }

  private isPlatformFeeConfirmationKeyConflict(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }
    const candidate = error as { code?: unknown; meta?: { target?: unknown } };
    if (candidate.code !== "P2002") {
      return false;
    }
    const target = Array.isArray(candidate.meta?.target)
      ? candidate.meta.target.join(",")
      : String(candidate.meta?.target ?? "");

    return /overdraft_confirmation_key|platformFeeOverdraftConfirmationKey/i.test(target);
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

  private testNdpSettlementForbiddenError(): AppError {
    return new AppError({
      code: ERROR_CODES.TEST_NDP_SETTLEMENT_FORBIDDEN,
      message: "error.test_ndp.settlement_forbidden",
      statusCode: 409
    });
  }

  private walletAdjustmentConflictError(): AppError {
    return new AppError({
      code: ERROR_CODES.WALLET_ADJUSTMENT_CONFLICT,
      message: "error.wallet.adjustment_conflict",
      statusCode: 409
    });
  }

  private walletAdjustmentInvalidStateError(): AppError {
    return new AppError({
      code: ERROR_CODES.WALLET_ADJUSTMENT_INVALID_STATE,
      message: "error.wallet.adjustment_invalid_state",
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
