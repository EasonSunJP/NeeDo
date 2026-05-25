import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";

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
  shopId: number;
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
    input: Required<BookingLedgerSettlementInput>,
    context?: LedgerMutationContext
  ) => Promise<LedgerTransactionPayload | void>;
  compensateCustomerForMerchantCancellation: (
    input: Required<BookingLedgerSettlementInput>,
    context?: LedgerMutationContext
  ) => Promise<LedgerTransactionPayload | void>;
}

const CURRENCY: LedgerCurrency = "NDP";
const BOOKING_FREEZE_AMOUNT = 500;
const CUSTOMER_COMPLETION_REWARD_AMOUNT = 100;

export class LedgerService implements BookingLedgerSettlementPort {
  public constructor(private readonly repository: LedgerRepositoryPort) {}

  public freezeBookingAcceptance(
    input: BookingLedgerSettlementInput,
    context: LedgerMutationContext = {}
  ): Promise<LedgerTransactionPayload> {
    return this.repository.runInTransaction(async (repository) => {
      const idempotencyKey = `booking:${input.bookingOrderId}:accept:freeze`;
      const existing = await repository.findTransactionByIdempotencyKey(idempotencyKey);

      if (existing) {
        return existing;
      }

      const wallet = await repository.getOrCreateWallet({
        ownerType: "shop",
        ownerId: input.shopId,
        currency: CURRENCY
      });

      if (wallet.availableBalance < BOOKING_FREEZE_AMOUNT) {
        throw this.insufficientAvailableError();
      }

      const updatedWallet = await repository.applyWalletDelta({
        walletId: wallet.id,
        availableDelta: -BOOKING_FREEZE_AMOUNT,
        frozenDelta: BOOKING_FREEZE_AMOUNT,
        requireAvailableAtLeast: BOOKING_FREEZE_AMOUNT
      });

      if (!updatedWallet) {
        throw this.insufficientAvailableError();
      }

      const transaction = await repository.createTransaction({
        idempotencyKey,
        type: "booking_accept_freeze",
        referenceType: "booking_order",
        referenceId: input.bookingOrderId,
        actorUserId: input.actorUserId,
        amount: BOOKING_FREEZE_AMOUNT,
        metadata: { shopId: input.shopId }
      });
      await repository.createLedgerEntry({
        transactionId: transaction.id,
        walletId: wallet.id,
        direction: "freeze",
        amount: BOOKING_FREEZE_AMOUNT,
        availableDelta: -BOOKING_FREEZE_AMOUNT,
        frozenDelta: BOOKING_FREEZE_AMOUNT,
        availableBalanceAfter: updatedWallet.availableBalance,
        frozenBalanceAfter: updatedWallet.frozenBalance,
        reason: "booking_accept_freeze"
      });
      await this.recordFinanceAndAudit(repository, transaction, {
        action: "ledger.booking_accept.freeze",
        expectedAmount: BOOKING_FREEZE_AMOUNT,
        actualAmount: BOOKING_FREEZE_AMOUNT
      });

      return (await repository.findTransactionByIdempotencyKey(idempotencyKey)) ?? transaction;
    }, context.transactionClient);
  }

  public releaseBookingHold(
    input: BookingLedgerSettlementInput,
    context: LedgerMutationContext = {}
  ): Promise<LedgerTransactionPayload> {
    return this.repository.runInTransaction(async (repository) => {
      const idempotencyKey = `booking:${input.bookingOrderId}:cancel:unfreeze`;
      const existing = await repository.findTransactionByIdempotencyKey(idempotencyKey);

      if (existing) {
        return existing;
      }

      const wallet = await repository.getOrCreateWallet({
        ownerType: "shop",
        ownerId: input.shopId,
        currency: CURRENCY
      });

      if (wallet.frozenBalance < BOOKING_FREEZE_AMOUNT) {
        throw this.insufficientFrozenError();
      }

      const updatedWallet = await repository.applyWalletDelta({
        walletId: wallet.id,
        availableDelta: BOOKING_FREEZE_AMOUNT,
        frozenDelta: -BOOKING_FREEZE_AMOUNT,
        requireFrozenAtLeast: BOOKING_FREEZE_AMOUNT
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
        amount: BOOKING_FREEZE_AMOUNT,
        metadata: { shopId: input.shopId }
      });
      await repository.createLedgerEntry({
        transactionId: transaction.id,
        walletId: wallet.id,
        direction: "unfreeze",
        amount: BOOKING_FREEZE_AMOUNT,
        availableDelta: BOOKING_FREEZE_AMOUNT,
        frozenDelta: -BOOKING_FREEZE_AMOUNT,
        availableBalanceAfter: updatedWallet.availableBalance,
        frozenBalanceAfter: updatedWallet.frozenBalance,
        reason: "booking_cancel_unfreeze"
      });
      await this.recordFinanceAndAudit(repository, transaction, {
        action: "ledger.booking_cancel.unfreeze",
        expectedAmount: BOOKING_FREEZE_AMOUNT,
        actualAmount: BOOKING_FREEZE_AMOUNT
      });

      return (await repository.findTransactionByIdempotencyKey(idempotencyKey)) ?? transaction;
    }, context.transactionClient);
  }

  public settleBookingCompletion(
    input: Required<BookingLedgerSettlementInput>,
    context: LedgerMutationContext = {}
  ): Promise<LedgerTransactionPayload> {
    return this.repository.runInTransaction(async (repository) => {
      const idempotencyKey = `booking:${input.bookingOrderId}:complete:settlement`;
      const existing = await repository.findTransactionByIdempotencyKey(idempotencyKey);

      if (existing) {
        return existing;
      }

      const merchantWallet = await repository.getOrCreateWallet({
        ownerType: "shop",
        ownerId: input.shopId,
        currency: CURRENCY
      });

      if (merchantWallet.frozenBalance < BOOKING_FREEZE_AMOUNT) {
        throw this.insufficientFrozenError();
      }

      const customerWallet = await repository.getOrCreateWallet({
        ownerType: "user",
        ownerId: input.customerUserId,
        currency: CURRENCY
      });
      const updatedMerchantWallet = await repository.applyWalletDelta({
        walletId: merchantWallet.id,
        availableDelta: 0,
        frozenDelta: -BOOKING_FREEZE_AMOUNT,
        requireFrozenAtLeast: BOOKING_FREEZE_AMOUNT
      });

      if (!updatedMerchantWallet) {
        throw this.insufficientFrozenError();
      }

      const updatedCustomerWallet = await repository.applyWalletDelta({
        walletId: customerWallet.id,
        availableDelta: CUSTOMER_COMPLETION_REWARD_AMOUNT,
        frozenDelta: 0
      });

      if (!updatedCustomerWallet) {
        throw this.walletMutationError();
      }

      const transactionAmount = BOOKING_FREEZE_AMOUNT + CUSTOMER_COMPLETION_REWARD_AMOUNT;
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
          merchantDebitAmount: BOOKING_FREEZE_AMOUNT,
          customerRewardAmount: CUSTOMER_COMPLETION_REWARD_AMOUNT
        }
      });
      await repository.createLedgerEntry({
        transactionId: transaction.id,
        walletId: merchantWallet.id,
        direction: "frozen_debit",
        amount: BOOKING_FREEZE_AMOUNT,
        availableDelta: 0,
        frozenDelta: -BOOKING_FREEZE_AMOUNT,
        availableBalanceAfter: updatedMerchantWallet.availableBalance,
        frozenBalanceAfter: updatedMerchantWallet.frozenBalance,
        reason: "booking_complete_merchant_debit"
      });
      await repository.createLedgerEntry({
        transactionId: transaction.id,
        walletId: customerWallet.id,
        direction: "available_credit",
        amount: CUSTOMER_COMPLETION_REWARD_AMOUNT,
        availableDelta: CUSTOMER_COMPLETION_REWARD_AMOUNT,
        frozenDelta: 0,
        availableBalanceAfter: updatedCustomerWallet.availableBalance,
        frozenBalanceAfter: updatedCustomerWallet.frozenBalance,
        reason: "booking_complete_customer_reward"
      });
      await this.recordFinanceAndAudit(repository, transaction, {
        action: "ledger.booking_complete.settlement",
        expectedAmount: transactionAmount,
        actualAmount: transactionAmount
      });

      return (await repository.findTransactionByIdempotencyKey(idempotencyKey)) ?? transaction;
    }, context.transactionClient);
  }

  public compensateCustomerForMerchantCancellation(
    input: Required<BookingLedgerSettlementInput>,
    context: LedgerMutationContext = {}
  ): Promise<LedgerTransactionPayload> {
    return this.repository.runInTransaction(async (repository) => {
      const idempotencyKey = `booking:${input.bookingOrderId}:merchant-cancel:compensation`;
      const existing = await repository.findTransactionByIdempotencyKey(idempotencyKey);

      if (existing) {
        return existing;
      }

      const merchantWallet = await repository.getOrCreateWallet({
        ownerType: "shop",
        ownerId: input.shopId,
        currency: CURRENCY
      });

      if (merchantWallet.frozenBalance < BOOKING_FREEZE_AMOUNT) {
        throw this.insufficientFrozenError();
      }

      const customerWallet = await repository.getOrCreateWallet({
        ownerType: "user",
        ownerId: input.customerUserId,
        currency: CURRENCY
      });
      const updatedMerchantWallet = await repository.applyWalletDelta({
        walletId: merchantWallet.id,
        availableDelta: 0,
        frozenDelta: -BOOKING_FREEZE_AMOUNT,
        requireFrozenAtLeast: BOOKING_FREEZE_AMOUNT
      });

      if (!updatedMerchantWallet) {
        throw this.insufficientFrozenError();
      }

      const updatedCustomerWallet = await repository.applyWalletDelta({
        walletId: customerWallet.id,
        availableDelta: BOOKING_FREEZE_AMOUNT,
        frozenDelta: 0
      });

      if (!updatedCustomerWallet) {
        throw this.walletMutationError();
      }

      const transaction = await repository.createTransaction({
        idempotencyKey,
        type: "booking_merchant_cancel_compensation",
        referenceType: "booking_order",
        referenceId: input.bookingOrderId,
        actorUserId: input.actorUserId,
        amount: BOOKING_FREEZE_AMOUNT,
        metadata: { shopId: input.shopId, customerUserId: input.customerUserId }
      });
      await repository.createLedgerEntry({
        transactionId: transaction.id,
        walletId: merchantWallet.id,
        direction: "frozen_debit",
        amount: BOOKING_FREEZE_AMOUNT,
        availableDelta: 0,
        frozenDelta: -BOOKING_FREEZE_AMOUNT,
        availableBalanceAfter: updatedMerchantWallet.availableBalance,
        frozenBalanceAfter: updatedMerchantWallet.frozenBalance,
        reason: "booking_merchant_cancel_penalty"
      });
      await repository.createLedgerEntry({
        transactionId: transaction.id,
        walletId: customerWallet.id,
        direction: "available_credit",
        amount: BOOKING_FREEZE_AMOUNT,
        availableDelta: BOOKING_FREEZE_AMOUNT,
        frozenDelta: 0,
        availableBalanceAfter: updatedCustomerWallet.availableBalance,
        frozenBalanceAfter: updatedCustomerWallet.frozenBalance,
        reason: "booking_merchant_cancel_customer_compensation"
      });
      await this.recordFinanceAndAudit(repository, transaction, {
        action: "ledger.booking_merchant_cancel.compensation",
        expectedAmount: BOOKING_FREEZE_AMOUNT,
        actualAmount: BOOKING_FREEZE_AMOUNT
      });

      return (await repository.findTransactionByIdempotencyKey(idempotencyKey)) ?? transaction;
    }, context.transactionClient);
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
