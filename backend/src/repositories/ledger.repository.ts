import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  FinanceReconciliationExportPayload,
  FinanceReconciliationListInput,
  FinanceReconciliationPayload,
  FinanceReconciliationStatus,
  ExchangeRequestFinancialPayload,
  ExchangeRequestFreezeInput,
  LedgerRepositoryPort,
  LedgerTransactionClient,
  LedgerTransactionListInput,
  LedgerTransactionPayload,
  LedgerTransactionStatus,
  LedgerTransactionType,
  OrderFinancialPlatformFeeSnapshot,
  OrderFinancialUpsertInput,
  PlatformFeeDebtAllocationRecord,
  WalletLedgerDirection,
  WalletLedgerListInput,
  WalletLedgerPayload,
  WalletAdjustmentRequestListInput,
  WalletAdjustmentRequestPayload,
  WalletAdjustmentStatus,
  WalletAdjustmentType,
  WalletHoldPayload,
  WalletHoldFeeType,
  WalletHoldStatus,
  WalletLookupInput,
  WalletOwnerType,
  WalletPayload
} from "../services/ledger.service";
import type { FeeType } from "../services/fee-calculation.service";
import { LedgerCurrencyService, type LedgerCurrency } from "../services/ledger-currency.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse } from "../utils/pagination";
import type {
  CompensationAdjustmentRule,
  CompensationNdpBearer,
  CompensationRuleSet,
  CompensationWageMode
} from "../services/compensation-engine.service";

type LedgerPrismaClient = PrismaClient | Prisma.TransactionClient;

type LedgerTransactionRecord = Prisma.LedgerTransactionGetPayload<{
  include: {
    entries: {
      where: { deletedAt: null };
      orderBy: { id: "asc" };
      include: {
        wallet: {
          select: { ownerType: true; ownerId: true; currency: true };
        };
      };
    };
  };
}>;

type FinanceReconciliationRecord = Prisma.FinanceReconciliationGetPayload<{
  include: {
    transaction: {
      select: {
        transactionNo: true;
      };
    };
  };
}>;

type WalletHoldRecord = Prisma.WalletHoldGetPayload<Record<string, never>>;
type ExchangeRequestFinancialRecord = Prisma.ExchangeRequestFinancialGetPayload<
  Record<string, never>
>;
type WalletAdjustmentRequestRecord = Prisma.WalletAdjustmentRequestGetPayload<
  Record<string, never>
>;
type LockedOrderFinancialPlatformFeeRow = {
  bookingOrderId: number;
  ndpCurrency: string;
  customerUserId: number;
  shopId: number;
  technicianProfileId: number | null;
  platformFeeEnabledSnapshot: boolean | number;
  platformFeeAmountNdpSnapshot: number;
  platformFeeWalletOwnerType: string | null;
  platformFeeWalletOwnerId: number | null;
  platformFeeWalletId: number | null;
  platformFeeOutstandingNdp: number;
  platformFeeDebtStatus: string;
  platformFeeAcceptedAt: Date | null;
  userRewardEligibleNdp: number;
  userRewardStatus: string;
  userRewardDeadlineAt: Date | null;
  userRewardGrantedAt: Date | null;
  settlementStatus: string;
};
type LockedPlatformFeeDebtRow = {
  id: number;
  bookingOrderId: number;
  ndpCurrency: string;
  customerUserId: number;
  platformFeeWalletId: number | null;
  platformFeeAcceptedAt: Date | null;
  platformFeeOutstandingNdp: number;
  platformFeeDebtStatus: string;
  userRewardEligibleNdp: number;
  userRewardStatus: string;
  userRewardDeadlineAt: Date | null;
  userRewardGrantedAt: Date | null;
  userRewardNdp: number;
  settlementStatus: string;
};
type LockedWalletRow = {
  id: number;
  ownerType: string;
  ownerId: number;
  currency: string;
  availableBalance: number;
  frozenBalance: number;
  createdAt: Date;
  updatedAt: Date;
};
type LockedExchangeRequestFinancialRow = {
  id: number;
  exchangePostId: number;
  payerType: string;
  payerId: number;
  walletOwnerType: string;
  walletOwnerId: number;
  currency: string;
  feeRuleSetId: number;
  feeRuleSetVersion: number;
  feeRuleId: number;
  feeCalculationLogId: number;
  walletHoldId: number;
  amountNdp: number;
  state: string;
  capturedAt: Date | null;
  releasedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export class LedgerRepository implements LedgerRepositoryPort {
  public constructor(private readonly client: LedgerPrismaClient = prisma) {}

  public async runInTransaction<T>(
    handler: (
      repository: LedgerRepositoryPort,
      transactionClient?: LedgerTransactionClient
    ) => Promise<T>,
    transactionClient?: LedgerTransactionClient
  ): Promise<T> {
    if (transactionClient) {
      return handler(
        new LedgerRepository(transactionClient as LedgerPrismaClient),
        transactionClient
      );
    }

    if (this.canStartTransaction(this.client)) {
      return this.client.$transaction((tx) => handler(new LedgerRepository(tx), tx));
    }

    return handler(this, this.client);
  }

  public async findTransactionByIdempotencyKey(
    idempotencyKey: string
  ): Promise<LedgerTransactionPayload | null> {
    const transaction = await this.client.ledgerTransaction.findFirst({
      where: { idempotencyKey, deletedAt: null },
      include: this.transactionInclude()
    });

    return transaction ? this.mapTransaction(transaction) : null;
  }

  public async findUserAccountClassification(
    userId: number
  ): Promise<{ isTestAccount: boolean } | null> {
    return this.client.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { isTestAccount: true }
    });
  }

  public async getOrCreateWallet(input: {
    ownerType: WalletOwnerType;
    ownerId: number;
    currency: LedgerCurrency;
  }): Promise<WalletPayload> {
    const walletKey = {
      ownerType: this.ownerTypeToDb(input.ownerType),
      ownerId: input.ownerId,
      currency: input.currency
    };
    await this.client.$executeRaw(
      Prisma.sql`
        INSERT INTO wallets (
          owner_type,
          owner_id,
          currency,
          updated_at,
          deleted_at
        )
        VALUES (
          ${input.ownerType},
          ${input.ownerId},
          ${input.currency},
          CURRENT_TIMESTAMP(3),
          NULL
        )
        ON DUPLICATE KEY UPDATE
          deleted_at = NULL,
          updated_at = CURRENT_TIMESTAMP(3)
      `
    );
    const wallet = await this.client.wallet.findUniqueOrThrow({
      where: { ownerType_ownerId_currency: walletKey }
    });

    return this.mapWallet(wallet);
  }

  public async findTechnicianUserId(technicianProfileId: number): Promise<number | null> {
    const technician = await this.client.technicianProfile.findFirst({
      where: {
        id: technicianProfileId,
        deletedAt: null,
        user: { deletedAt: null }
      },
      select: { userId: true }
    });

    return technician?.userId ?? null;
  }

  public async applyWalletDelta(input: {
    walletId: number;
    availableDelta: number;
    frozenDelta: number;
    requireAvailableAtLeast?: number;
    requireFrozenAtLeast?: number;
  }): Promise<WalletPayload | null> {
    const update = await this.client.wallet.updateMany({
      where: {
        id: input.walletId,
        deletedAt: null,
        ...(typeof input.requireAvailableAtLeast === "number"
          ? { availableBalance: { gte: input.requireAvailableAtLeast } }
          : {}),
        ...(typeof input.requireFrozenAtLeast === "number"
          ? { frozenBalance: { gte: input.requireFrozenAtLeast } }
          : {})
      },
      data: {
        availableBalance: { increment: input.availableDelta },
        frozenBalance: { increment: input.frozenDelta }
      }
    });

    if (update.count !== 1) {
      return null;
    }

    const wallet = await this.client.wallet.findFirst({
      where: { id: input.walletId, deletedAt: null }
    });

    return wallet ? this.mapWallet(wallet) : null;
  }

  public async findExchangeRequestFinancialByPostId(
    exchangePostId: number
  ): Promise<ExchangeRequestFinancialPayload | null> {
    const financial = await this.client.exchangeRequestFinancial.findFirst({
      where: { exchangePostId, deletedAt: null }
    });

    return financial ? this.mapExchangeRequestFinancial(financial) : null;
  }

  public async lockExchangeRequestFinancialByPostId(
    exchangePostId: number
  ): Promise<ExchangeRequestFinancialPayload | null> {
    const rows = await this.client.$queryRaw<LockedExchangeRequestFinancialRow[]>(
      Prisma.sql`SELECT
          id,
          exchange_post_id AS exchangePostId,
          payer_type AS payerType,
          payer_id AS payerId,
          wallet_owner_type AS walletOwnerType,
          wallet_owner_id AS walletOwnerId,
          currency,
          fee_rule_set_id AS feeRuleSetId,
          fee_rule_set_version AS feeRuleSetVersion,
          fee_rule_id AS feeRuleId,
          fee_calculation_log_id AS feeCalculationLogId,
          wallet_hold_id AS walletHoldId,
          amount_ndp AS amountNdp,
          state,
          captured_at AS capturedAt,
          released_at AS releasedAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM exchange_request_financials
        WHERE exchange_post_id = ${exchangePostId}
          AND deleted_at IS NULL
        FOR UPDATE`
    );
    const financial = rows[0];

    return financial ? this.mapExchangeRequestFinancial(financial) : null;
  }

  public async findWalletHoldByExchangePostId(
    exchangePostId: number
  ): Promise<WalletHoldPayload | null> {
    const hold = await this.client.walletHold.findFirst({
      where: { exchangePostId, deletedAt: null }
    });

    return hold ? this.mapWalletHold(hold) : null;
  }

  public async createExchangeRequestFreezeEvidence(input: {
    freeze: ExchangeRequestFreezeInput;
    walletId: number;
    availableBalanceAfter: number;
    frozenBalanceAfter: number;
  }): Promise<ExchangeRequestFinancialPayload> {
    const { freeze } = input;
    const transaction = await this.createTransaction({
      idempotencyKey: `exchange-request:${freeze.exchangePostId}:freeze`,
      type: "exchange_request_publication_freeze",
      referenceType: "exchange_request",
      referenceId: freeze.exchangePostId,
      actorUserId: freeze.actorUserId,
      amount: freeze.fee.amountNdp,
      currency: freeze.currency,
      metadata: {
        payerType: freeze.payerType,
        payerId: freeze.payerId,
        walletOwnerType: freeze.walletOwnerType,
        walletOwnerId: freeze.walletOwnerId,
        walletId: input.walletId,
        feeRuleSetId: freeze.fee.ruleSetId,
        feeRuleSetVersion: freeze.fee.ruleSetVersion,
        feeRuleId: freeze.fee.ruleId,
        feeCalculationLogId: freeze.feeCalculationLogId
      }
    });
    if (freeze.fee.amountNdp > 0) {
      await this.createLedgerEntry({
        transactionId: transaction.id,
        walletId: input.walletId,
        direction: "freeze",
        amount: freeze.fee.amountNdp,
        availableDelta: -freeze.fee.amountNdp,
        frozenDelta: freeze.fee.amountNdp,
        availableBalanceAfter: input.availableBalanceAfter,
        frozenBalanceAfter: input.frozenBalanceAfter,
        reason: "exchange_request_publication_freeze"
      });
    }
    const hold = await this.client.walletHold.create({
      data: {
        ownerType: this.ownerTypeToDb(freeze.walletOwnerType),
        ownerId: freeze.walletOwnerId,
        bookingOrderId: null,
        exchangePostId: freeze.exchangePostId,
        feeType: "exchange_request_publication_fee",
        holdAmountNdp: freeze.fee.amountNdp,
        currency: freeze.currency,
        status: "active",
        idempotencyKey: `exchange-request:${freeze.exchangePostId}:hold`,
        calculationLogId: freeze.feeCalculationLogId,
        metadata: {
          payerType: freeze.payerType,
          payerId: freeze.payerId,
          walletId: input.walletId,
          feeRuleSetVersion: freeze.fee.ruleSetVersion
        }
      }
    });
    const financial = await this.client.exchangeRequestFinancial.create({
      data: {
        exchangePostId: freeze.exchangePostId,
        payerType: freeze.payerType,
        payerId: freeze.payerId,
        walletOwnerType: this.ownerTypeToDb(freeze.walletOwnerType),
        walletOwnerId: freeze.walletOwnerId,
        currency: freeze.currency,
        feeRuleSetId: freeze.fee.ruleSetId,
        feeRuleSetVersion: freeze.fee.ruleSetVersion,
        feeRuleId: freeze.fee.ruleId,
        feeCalculationLogId: freeze.feeCalculationLogId,
        walletHoldId: hold.id,
        amountNdp: freeze.fee.amountNdp,
        state: "HELD"
      }
    });
    await this.createExchangeRequestReconciliation({
      transactionId: transaction.id,
      referenceId: freeze.exchangePostId,
      currency: freeze.currency,
      expectedAmount: freeze.fee.amountNdp,
      actualAmount: freeze.fee.amountNdp
    });
    await this.createAuditLog({
      actorUserId: freeze.actorUserId,
      action: "ledger.exchange_request_publication.freeze",
      targetType: "ledger_transaction",
      targetId: transaction.id,
      metadata: {
        exchangePostId: freeze.exchangePostId,
        financialId: financial.id,
        walletHoldId: hold.id,
        amount: freeze.fee.amountNdp,
        currency: freeze.currency
      }
    });

    return this.mapExchangeRequestFinancial(financial);
  }

  public async completeExchangeRequestFinancial(input: {
    financialId: number;
    walletHoldId: number;
    expectedState: "held";
    state: "captured" | "released";
    amountNdp: number;
    occurredAt: Date;
    transactionId: number;
  }): Promise<ExchangeRequestFinancialPayload | null> {
    const financialUpdate = await this.client.exchangeRequestFinancial.updateMany({
      where: {
        id: input.financialId,
        state: "HELD",
        deletedAt: null
      },
      data: {
        state: input.state === "captured" ? "CAPTURED" : "RELEASED",
        capturedAt: input.state === "captured" ? input.occurredAt : null,
        releasedAt: input.state === "released" ? input.occurredAt : null
      }
    });
    if (financialUpdate.count !== 1) return null;

    const holdUpdate = await this.client.walletHold.updateMany({
      where: {
        id: input.walletHoldId,
        status: "active",
        deletedAt: null
      },
      data: {
        status: input.state,
        capturedAmountNdp: input.state === "captured" ? { increment: input.amountNdp } : undefined,
        releasedAmountNdp: input.state === "released" ? { increment: input.amountNdp } : undefined,
        capturedAt: input.state === "captured" ? input.occurredAt : null,
        releasedAt: input.state === "released" ? input.occurredAt : null,
        metadata: {
          terminalTransactionId: input.transactionId,
          terminalState: input.state
        }
      }
    });
    if (holdUpdate.count !== 1) return null;
    const financial = await this.client.exchangeRequestFinancial.findFirst({
      where: { id: input.financialId, deletedAt: null }
    });

    return financial ? this.mapExchangeRequestFinancial(financial) : null;
  }

  public async createExchangeRequestReconciliation(input: {
    transactionId: number;
    referenceId: number;
    currency: LedgerCurrency;
    expectedAmount: number;
    actualAmount: number;
  }): Promise<void> {
    await this.client.financeReconciliation.create({
      data: {
        transactionId: input.transactionId,
        referenceType: "exchange_request",
        referenceId: input.referenceId,
        status: input.currency === "TEST_NDP" ? "TEST_ONLY" : "PENDING",
        currency: input.currency,
        expectedAmount: input.expectedAmount,
        actualAmount: input.actualAmount,
        differenceAmount: input.actualAmount - input.expectedAmount
      }
    });
  }

  public async createTransaction(input: {
    idempotencyKey: string;
    type: LedgerTransactionType;
    referenceType: string;
    referenceId: number;
    actorUserId: number | null;
    amount: number;
    currency: LedgerCurrency;
    metadata?: unknown;
  }): Promise<LedgerTransactionPayload> {
    const transaction = await this.client.ledgerTransaction.create({
      data: {
        transactionNo: this.createTransactionNo(),
        idempotencyKey: input.idempotencyKey,
        type: this.transactionTypeToDb(input.type),
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        actorUserId: input.actorUserId,
        amount: input.amount,
        currency: input.currency,
        metadata: input.metadata as Prisma.InputJsonValue | undefined
      },
      include: this.transactionInclude()
    });

    return this.mapTransaction(transaction);
  }

  public async createLedgerEntry(input: {
    transactionId: number;
    walletId: number;
    direction: WalletLedgerDirection;
    amount: number;
    availableDelta: number;
    frozenDelta: number;
    availableBalanceAfter: number;
    frozenBalanceAfter: number;
    reason: string;
  }): Promise<WalletLedgerPayload> {
    const [transaction, wallet] = await Promise.all([
      this.client.ledgerTransaction.findFirst({
        where: { id: input.transactionId, deletedAt: null },
        select: { currency: true }
      }),
      this.client.wallet.findFirst({
        where: { id: input.walletId, deletedAt: null },
        select: { ownerType: true, ownerId: true, currency: true }
      })
    ]);
    const transactionCurrency = LedgerCurrencyService.fromStored(transaction?.currency ?? "");
    const walletCurrency = LedgerCurrencyService.fromStored(wallet?.currency ?? "");
    LedgerCurrencyService.assertSameCurrency(transactionCurrency, [walletCurrency]);

    const entry = await this.client.walletLedger.create({
      data: {
        transactionId: input.transactionId,
        walletId: input.walletId,
        direction: this.directionToDb(input.direction),
        amount: input.amount,
        availableDelta: input.availableDelta,
        frozenDelta: input.frozenDelta,
        availableBalanceAfter: input.availableBalanceAfter,
        frozenBalanceAfter: input.frozenBalanceAfter,
        reason: input.reason
      }
    });

    return this.mapLedgerEntry({ ...entry, wallet: wallet ?? undefined });
  }

  public async createFinanceReconciliation(input: {
    transactionId: number;
    referenceType: string;
    referenceId: number;
    currency: Extract<LedgerCurrency, "NDP">;
    expectedAmount: number;
    actualAmount: number;
  }): Promise<void> {
    await this.client.financeReconciliation.create({
      data: {
        transactionId: input.transactionId,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        expectedAmount: input.expectedAmount,
        actualAmount: input.actualAmount,
        differenceAmount: input.actualAmount - input.expectedAmount,
        currency: input.currency
      }
    });
  }

  public async createAuditLog(input: {
    actorUserId: number | null;
    action: string;
    targetType?: string;
    targetId: number;
    metadata?: unknown;
  }): Promise<void> {
    await this.client.auditLog.create({
      data: {
        actorId: input.actorUserId,
        action: input.action,
        targetType: input.targetType ?? "ledger_transaction",
        targetId: input.targetId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined
      }
    });
  }

  public async findWalletAdjustmentByIdempotencyKey(
    idempotencyKey: string
  ): Promise<WalletAdjustmentRequestPayload | null> {
    const request = await this.client.walletAdjustmentRequest.findFirst({
      where: { idempotencyKey, deletedAt: null }
    });

    return request ? this.mapWalletAdjustmentRequest(request) : null;
  }

  public async createWalletAdjustmentRequest(input: {
    type: WalletAdjustmentType;
    ownerType: WalletOwnerType;
    ownerId: number;
    walletId: number;
    amountNdp: number;
    idempotencyKey: string;
    bankReference?: string | null;
    note?: string | null;
    requestedById: number;
  }): Promise<WalletAdjustmentRequestPayload> {
    const request = await this.client.walletAdjustmentRequest.create({
      data: {
        type: this.walletAdjustmentTypeToDb(input.type),
        ownerType: this.ownerTypeToDb(input.ownerType),
        ownerId: input.ownerId,
        walletId: input.walletId,
        amountNdp: input.amountNdp,
        idempotencyKey: input.idempotencyKey,
        bankReference: input.bankReference ?? null,
        note: input.note ?? null,
        requestedById: input.requestedById
      }
    });

    return this.mapWalletAdjustmentRequest(request);
  }

  public async listWalletAdjustmentRequests(
    input: WalletAdjustmentRequestListInput
  ): Promise<PaginatedResponse<WalletAdjustmentRequestPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.WalletAdjustmentRequestWhereInput = {
      deletedAt: null,
      ...(input.ownerType ? { ownerType: this.ownerTypeToDb(input.ownerType) } : {}),
      ...(input.ownerId ? { ownerId: input.ownerId } : {}),
      ...(input.type ? { type: this.walletAdjustmentTypeToDb(input.type) } : {}),
      ...(input.status ? { status: this.walletAdjustmentStatusToDb(input.status) } : {})
    };
    const [list, total] = await Promise.all([
      this.client.walletAdjustmentRequest.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.walletAdjustmentRequest.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((request) => this.mapWalletAdjustmentRequest(request)),
      total,
      pagination
    );
  }

  public async lockWalletAdjustmentRequest(
    id: number
  ): Promise<WalletAdjustmentRequestPayload | null> {
    await this.client.$queryRaw(
      Prisma.sql`SELECT id FROM wallet_adjustment_requests WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`
    );
    const request = await this.client.walletAdjustmentRequest.findFirst({
      where: { id, deletedAt: null }
    });

    return request ? this.mapWalletAdjustmentRequest(request) : null;
  }

  public async approveWalletAdjustmentRequest(input: {
    id: number;
    reviewedById: number;
    reviewNote: string;
    ledgerTransactionId: number;
  }): Promise<WalletAdjustmentRequestPayload> {
    const request = await this.client.walletAdjustmentRequest.update({
      where: { id: input.id },
      data: {
        status: "APPROVED",
        reviewedById: input.reviewedById,
        reviewedAt: new Date(),
        reviewNote: input.reviewNote,
        ledgerTransactionId: input.ledgerTransactionId
      }
    });

    return this.mapWalletAdjustmentRequest(request);
  }

  public async rejectWalletAdjustmentRequest(input: {
    id: number;
    reviewedById: number;
    reviewNote: string;
  }): Promise<WalletAdjustmentRequestPayload> {
    const request = await this.client.walletAdjustmentRequest.update({
      where: { id: input.id },
      data: {
        status: "REJECTED",
        reviewedById: input.reviewedById,
        reviewedAt: new Date(),
        reviewNote: input.reviewNote
      }
    });

    return this.mapWalletAdjustmentRequest(request);
  }

  public async findWalletHoldByIdempotencyKey(
    idempotencyKey: string
  ): Promise<WalletHoldPayload | null> {
    const hold = await this.client.walletHold.findFirst({
      where: { idempotencyKey, deletedAt: null }
    });

    return hold ? this.mapWalletHold(hold) : null;
  }

  public async findWalletHold(input: {
    bookingOrderId: number;
    ownerType: WalletOwnerType;
    ownerId: number;
    feeType: FeeType;
  }): Promise<WalletHoldPayload | null> {
    const hold = await this.client.walletHold.findFirst({
      where: {
        bookingOrderId: input.bookingOrderId,
        ownerType: this.ownerTypeToDb(input.ownerType),
        ownerId: input.ownerId,
        feeType: input.feeType,
        deletedAt: null
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });

    return hold ? this.mapWalletHold(hold) : null;
  }

  public async createWalletHold(input: {
    ownerType: WalletOwnerType;
    ownerId: number;
    bookingOrderId: number;
    feeType: WalletHoldFeeType;
    holdAmountNdp: number;
    currency: LedgerCurrency;
    status: WalletHoldStatus;
    idempotencyKey: string;
    calculationLogId: number | null;
    metadata?: unknown;
  }): Promise<WalletHoldPayload> {
    const hold = await this.client.walletHold.create({
      data: {
        ownerType: this.ownerTypeToDb(input.ownerType),
        ownerId: input.ownerId,
        bookingOrderId: input.bookingOrderId,
        feeType: input.feeType,
        holdAmountNdp: input.holdAmountNdp,
        currency: input.currency,
        status: input.status,
        idempotencyKey: input.idempotencyKey,
        calculationLogId: input.calculationLogId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined
      }
    });

    return this.mapWalletHold(hold);
  }

  public async updateWalletHold(input: {
    id: number;
    capturedAmountNdp?: number;
    releasedAmountNdp?: number;
    status: WalletHoldStatus;
    capturedAt?: Date | null;
    releasedAt?: Date | null;
    metadata?: unknown;
  }): Promise<WalletHoldPayload> {
    const hold = await this.client.walletHold.update({
      where: { id: input.id },
      data: {
        ...(typeof input.capturedAmountNdp === "number"
          ? { capturedAmountNdp: input.capturedAmountNdp }
          : {}),
        ...(typeof input.releasedAmountNdp === "number"
          ? { releasedAmountNdp: input.releasedAmountNdp }
          : {}),
        status: input.status,
        ...(input.capturedAt !== undefined ? { capturedAt: input.capturedAt } : {}),
        ...(input.releasedAt !== undefined ? { releasedAt: input.releasedAt } : {}),
        ...(input.metadata !== undefined
          ? { metadata: input.metadata as Prisma.InputJsonValue }
          : {})
      }
    });

    return this.mapWalletHold(hold);
  }

  public async findOrderFinancialByOverdraftConfirmationKey(
    idempotencyKey: string
  ): Promise<{ bookingOrderId: number; previewVersion: string } | null> {
    const financial = await this.client.orderFinancial.findFirst({
      where: {
        platformFeeOverdraftConfirmationKey: idempotencyKey,
        deletedAt: null
      },
      select: {
        bookingOrderId: true,
        platformFeePreviewVersion: true
      }
    });

    return financial
      ? {
          bookingOrderId: financial.bookingOrderId,
          previewVersion: financial.platformFeePreviewVersion ?? ""
        }
      : null;
  }

  public async findOrderFinancialPlatformFeeSnapshot(
    bookingOrderId: number
  ): Promise<OrderFinancialPlatformFeeSnapshot | null> {
    const financial = await this.client.orderFinancial.findFirst({
      where: {
        bookingOrderId,
        platformFeeEnabledSnapshot: { not: null },
        deletedAt: null
      },
      select: {
        bookingOrderId: true,
        ndpCurrency: true,
        customerUserId: true,
        shopId: true,
        technicianProfileId: true,
        platformFeeEnabledSnapshot: true,
        platformFeeAmountNdpSnapshot: true,
        platformFeeWalletOwnerType: true,
        platformFeeWalletOwnerId: true,
        platformFeeWalletId: true,
        platformFeeOutstandingNdp: true,
        platformFeeDebtStatus: true,
        platformFeeAcceptedAt: true,
        userRewardEligibleNdp: true,
        userRewardStatus: true,
        userRewardDeadlineAt: true,
        userRewardGrantedAt: true,
        settlementStatus: true
      }
    });
    if (!financial || financial.platformFeeEnabledSnapshot === null) {
      return null;
    }

    return {
      ...financial,
      ndpCurrency: LedgerCurrencyService.fromStored(financial.ndpCurrency),
      platformFeeEnabledSnapshot: financial.platformFeeEnabledSnapshot,
      platformFeeWalletOwnerType: financial.platformFeeWalletOwnerType
        ? this.ownerTypeFromDb(financial.platformFeeWalletOwnerType)
        : null,
      platformFeeDebtStatus:
        financial.platformFeeDebtStatus.toLowerCase() as OrderFinancialPlatformFeeSnapshot["platformFeeDebtStatus"],
      userRewardStatus:
        financial.userRewardStatus.toLowerCase() as OrderFinancialPlatformFeeSnapshot["userRewardStatus"],
      settlementStatus:
        financial.settlementStatus as OrderFinancialPlatformFeeSnapshot["settlementStatus"]
    };
  }

  public async lockOrderFinancialPlatformFeeSnapshot(
    bookingOrderId: number
  ): Promise<OrderFinancialPlatformFeeSnapshot | null> {
    const rows = await this.client.$queryRaw<LockedOrderFinancialPlatformFeeRow[]>(
      Prisma.sql`SELECT
          booking_order_id AS bookingOrderId,
          ndp_currency AS ndpCurrency,
          customer_user_id AS customerUserId,
          shop_id AS shopId,
          technician_profile_id AS technicianProfileId,
          platform_fee_enabled_snapshot AS platformFeeEnabledSnapshot,
          platform_fee_amount_ndp_snapshot AS platformFeeAmountNdpSnapshot,
          platform_fee_wallet_owner_type AS platformFeeWalletOwnerType,
          platform_fee_wallet_owner_id AS platformFeeWalletOwnerId,
          platform_fee_wallet_id AS platformFeeWalletId,
          platform_fee_outstanding_ndp AS platformFeeOutstandingNdp,
          platform_fee_debt_status AS platformFeeDebtStatus,
          platform_fee_accepted_at AS platformFeeAcceptedAt,
          user_reward_eligible_ndp AS userRewardEligibleNdp,
          user_reward_status AS userRewardStatus,
          user_reward_deadline_at AS userRewardDeadlineAt,
          user_reward_granted_at AS userRewardGrantedAt,
          settlement_status AS settlementStatus
        FROM order_financials
        WHERE booking_order_id = ${bookingOrderId}
          AND platform_fee_enabled_snapshot IS NOT NULL
          AND deleted_at IS NULL
        FOR UPDATE`
    );
    const financial = rows[0];
    if (!financial || rows.length !== 1) {
      return null;
    }
    return {
      ...financial,
      ndpCurrency: LedgerCurrencyService.fromStored(financial.ndpCurrency),
      platformFeeEnabledSnapshot: Boolean(financial.platformFeeEnabledSnapshot),
      platformFeeWalletOwnerType: financial.platformFeeWalletOwnerType
        ? this.ownerTypeFromDb(financial.platformFeeWalletOwnerType)
        : null,
      platformFeeDebtStatus:
        financial.platformFeeDebtStatus.toLowerCase() as OrderFinancialPlatformFeeSnapshot["platformFeeDebtStatus"],
      userRewardStatus:
        financial.userRewardStatus.toLowerCase() as OrderFinancialPlatformFeeSnapshot["userRewardStatus"],
      settlementStatus:
        financial.settlementStatus as OrderFinancialPlatformFeeSnapshot["settlementStatus"]
    };
  }

  public async lockWalletById(walletId: number): Promise<WalletPayload | null> {
    const rows = await this.client.$queryRaw<LockedWalletRow[]>(
      Prisma.sql`SELECT
          id,
          owner_type AS ownerType,
          owner_id AS ownerId,
          currency,
          available_balance AS availableBalance,
          frozen_balance AS frozenBalance,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM wallets
        WHERE id = ${walletId} AND deleted_at IS NULL
        FOR UPDATE`
    );
    const wallet = rows[0];
    if (!wallet || rows.length !== 1) {
      return null;
    }
    return this.mapWallet(wallet);
  }

  public async getDatabaseNow(): Promise<Date> {
    const rows = await this.client.$queryRaw<Array<{ now: Date }>>(
      Prisma.sql`SELECT CURRENT_TIMESTAMP(3) AS now`
    );
    const databaseNow = rows[0]?.now;
    if (!(databaseNow instanceof Date) || Number.isNaN(databaseNow.getTime())) {
      throw new Error("error.database_clock_unavailable");
    }
    return databaseNow;
  }

  public async findPlatformFeeHoldByBookingOrderId(
    bookingOrderId: number
  ): Promise<WalletHoldPayload | null> {
    const hold = await this.client.walletHold.findFirst({
      where: {
        bookingOrderId,
        feeType: "b_platform_fee",
        status: { in: ["ACTIVE", "PARTIALLY_CAPTURED"] },
        deletedAt: null
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });

    return hold ? this.mapWalletHold(hold) : null;
  }

  public async listOutstandingPlatformFeeDebtIds(input: {
    walletId: number;
    limit: number;
  }): Promise<number[]> {
    const rows = await this.client.orderFinancial.findMany({
      where: {
        platformFeeWalletId: input.walletId,
        platformFeeDebtStatus: "OUTSTANDING",
        platformFeeOutstandingNdp: { gt: 0 },
        platformFeeAcceptedAt: { not: null },
        deletedAt: null
      },
      select: { id: true },
      orderBy: [{ platformFeeAcceptedAt: "asc" }, { id: "asc" }],
      take: input.limit
    });

    return rows.map((row) => row.id);
  }

  public async lockPlatformFeeDebt(id: number): Promise<PlatformFeeDebtAllocationRecord | null> {
    const rows = await this.client.$queryRaw<LockedPlatformFeeDebtRow[]>(
      Prisma.sql`SELECT
          id,
          booking_order_id AS bookingOrderId,
          ndp_currency AS ndpCurrency,
          customer_user_id AS customerUserId,
          platform_fee_wallet_id AS platformFeeWalletId,
          platform_fee_accepted_at AS platformFeeAcceptedAt,
          platform_fee_outstanding_ndp AS platformFeeOutstandingNdp,
          platform_fee_debt_status AS platformFeeDebtStatus,
          user_reward_eligible_ndp AS userRewardEligibleNdp,
          user_reward_status AS userRewardStatus,
          user_reward_deadline_at AS userRewardDeadlineAt,
          user_reward_granted_at AS userRewardGrantedAt,
          user_reward_ndp AS userRewardNdp,
          settlement_status AS settlementStatus
        FROM order_financials
        WHERE id = ${id} AND deleted_at IS NULL
        FOR UPDATE`
    );
    const financial = rows[0];
    if (
      !financial ||
      financial.platformFeeWalletId === null ||
      financial.platformFeeAcceptedAt === null
    ) {
      return null;
    }

    return {
      ...financial,
      ndpCurrency: LedgerCurrencyService.fromStored(financial.ndpCurrency),
      platformFeeWalletId: financial.platformFeeWalletId,
      platformFeeAcceptedAt: financial.platformFeeAcceptedAt,
      platformFeeDebtStatus:
        financial.platformFeeDebtStatus.toLowerCase() as PlatformFeeDebtAllocationRecord["platformFeeDebtStatus"],
      userRewardStatus:
        financial.userRewardStatus.toLowerCase() as PlatformFeeDebtAllocationRecord["userRewardStatus"],
      settlementStatus:
        financial.settlementStatus as PlatformFeeDebtAllocationRecord["settlementStatus"]
    };
  }

  public async updatePlatformFeeDebt(input: {
    id: number;
    expectedOutstandingNdp: number;
    platformFeeOutstandingNdp: number;
    platformFeeDebtStatus: "outstanding" | "settled";
    userRewardStatus?: PlatformFeeDebtAllocationRecord["userRewardStatus"];
    userRewardNdp?: number;
    userRewardGrantedAt?: Date | null;
  }): Promise<boolean> {
    const update = await this.client.orderFinancial.updateMany({
      where: {
        id: input.id,
        platformFeeOutstandingNdp: input.expectedOutstandingNdp,
        platformFeeDebtStatus: "OUTSTANDING",
        deletedAt: null
      },
      data: {
        platformFeeOutstandingNdp: input.platformFeeOutstandingNdp,
        platformFeeDebtStatus: this.platformFeeDebtStatusToDb(input.platformFeeDebtStatus),
        ...(input.userRewardStatus !== undefined
          ? { userRewardStatus: this.userRewardStatusToDb(input.userRewardStatus) }
          : {}),
        ...(input.userRewardNdp !== undefined ? { userRewardNdp: input.userRewardNdp } : {}),
        ...(input.userRewardGrantedAt !== undefined
          ? { userRewardGrantedAt: input.userRewardGrantedAt }
          : {})
      }
    });

    return update.count === 1;
  }

  public async upsertOrderFinancial(input: OrderFinancialUpsertInput): Promise<void> {
    const existing = await this.client.orderFinancial.findUnique({
      where: { bookingOrderId: input.bookingOrderId }
    });
    if (existing) {
      LedgerCurrencyService.assertSameCurrency(
        LedgerCurrencyService.fromStored(existing.ndpCurrency),
        [input.ndpCurrency]
      );
    }
    const appliedRuleIds = this.mergeStringArrays(
      existing?.appliedFeeRuleIdsJson,
      input.appliedFeeRuleIds
    );
    const timeline = this.appendTimeline(
      existing?.moneyTimelineJson,
      input.timelineEvents ?? (input.timelineEvent ? [input.timelineEvent] : [])
    );
    const baseData = {
      orderType: input.orderType,
      ndpCurrency: input.ndpCurrency,
      customerUserId: input.customerUserId,
      shopId: input.shopId,
      technicianProfileId: input.technicianProfileId ?? null,
      serviceAmountJpy: input.serviceAmountJpy,
      ...(input.baseServiceAmountJpy !== undefined
        ? { baseServiceAmountJpy: input.baseServiceAmountJpy }
        : {}),
      ...(input.extensionAmountJpy !== undefined
        ? { extensionAmountJpy: input.extensionAmountJpy }
        : {}),
      ...(input.nominationChargeAmountJpy !== undefined
        ? { nominationChargeAmountJpy: input.nominationChargeAmountJpy }
        : {}),
      ...(input.wasTechnicianNominated !== undefined
        ? { wasTechnicianNominated: input.wasTechnicianNominated }
        : {}),
      ...(input.compensationBasisVersion !== undefined
        ? { compensationBasisVersion: input.compensationBasisVersion }
        : {}),
      ...(input.platformCollectedServiceAmountJpy !== undefined
        ? { platformCollectedServiceAmountJpy: input.platformCollectedServiceAmountJpy }
        : {}),
      ...(input.offlineReportedServiceAmountJpy !== undefined
        ? { offlineReportedServiceAmountJpy: input.offlineReportedServiceAmountJpy }
        : {}),
      unknownOrUnreportedServiceAmountJpy:
        input.unknownOrUnreportedServiceAmountJpy ?? input.serviceAmountJpy,
      ...(input.paymentChannel !== undefined ? { paymentChannel: input.paymentChannel } : {}),
      ...(input.serviceIncomeStatus !== undefined
        ? { serviceIncomeStatus: input.serviceIncomeStatus }
        : {}),
      ...(input.serviceIncomeReportedById !== undefined
        ? { serviceIncomeReportedById: input.serviceIncomeReportedById }
        : {}),
      ...(input.serviceIncomeReportedAt !== undefined
        ? { serviceIncomeReportedAt: input.serviceIncomeReportedAt }
        : {}),
      ...(input.serviceIncomeConfirmedById !== undefined
        ? { serviceIncomeConfirmedById: input.serviceIncomeConfirmedById }
        : {}),
      ...(input.serviceIncomeConfirmedAt !== undefined
        ? { serviceIncomeConfirmedAt: input.serviceIncomeConfirmedAt }
        : {}),
      ...(input.serviceIncomeNote !== undefined
        ? { serviceIncomeNote: input.serviceIncomeNote }
        : {}),
      ...(input.bPlatformFeeHoldNdp !== undefined
        ? { bPlatformFeeHoldNdp: input.bPlatformFeeHoldNdp }
        : {}),
      ...(input.bPlatformFeeActualNdp !== undefined
        ? { bPlatformFeeActualNdp: input.bPlatformFeeActualNdp }
        : {}),
      ...(input.cRequestFeeHoldNdp !== undefined
        ? { cRequestFeeHoldNdp: input.cRequestFeeHoldNdp }
        : {}),
      ...(input.cRequestFeeActualNdp !== undefined
        ? { cRequestFeeActualNdp: input.cRequestFeeActualNdp }
        : {}),
      ...(input.userRewardNdp !== undefined ? { userRewardNdp: input.userRewardNdp } : {}),
      ...(input.penaltyNdp !== undefined ? { penaltyNdp: input.penaltyNdp } : {}),
      ...(input.compensationToUserNdp !== undefined
        ? { compensationToUserNdp: input.compensationToUserNdp }
        : {}),
      ...(input.campaignDiscountNdp !== undefined
        ? { campaignDiscountNdp: input.campaignDiscountNdp }
        : {}),
      ...(input.releasedNdp !== undefined ? { releasedNdp: input.releasedNdp } : {}),
      ...(input.platformFeePayerType !== undefined
        ? { platformFeePayerType: input.platformFeePayerType }
        : {}),
      ...(input.platformFeePayerId !== undefined
        ? { platformFeePayerId: input.platformFeePayerId }
        : {}),
      ...(input.platformFeeEnabledSnapshot !== undefined
        ? { platformFeeEnabledSnapshot: input.platformFeeEnabledSnapshot }
        : {}),
      ...(input.platformFeeGlobalVersion !== undefined
        ? { platformFeeGlobalVersion: input.platformFeeGlobalVersion }
        : {}),
      ...(input.platformFeePolicyVersion !== undefined
        ? { platformFeePolicyVersion: input.platformFeePolicyVersion }
        : {}),
      ...(input.platformFeeAmountNdpSnapshot !== undefined
        ? { platformFeeAmountNdpSnapshot: input.platformFeeAmountNdpSnapshot }
        : {}),
      ...(input.platformFeeWalletOwnerType !== undefined
        ? {
            platformFeeWalletOwnerType:
              input.platformFeeWalletOwnerType === null
                ? null
                : this.ownerTypeToDb(input.platformFeeWalletOwnerType)
          }
        : {}),
      ...(input.platformFeeWalletOwnerId !== undefined
        ? { platformFeeWalletOwnerId: input.platformFeeWalletOwnerId }
        : {}),
      ...(input.platformFeeWalletId !== undefined
        ? { platformFeeWalletId: input.platformFeeWalletId }
        : {}),
      ...(input.platformFeeShortfallNdp !== undefined
        ? { platformFeeShortfallNdp: input.platformFeeShortfallNdp }
        : {}),
      ...(input.platformFeeOutstandingNdp !== undefined
        ? { platformFeeOutstandingNdp: input.platformFeeOutstandingNdp }
        : {}),
      ...(input.platformFeeDebtStatus !== undefined
        ? { platformFeeDebtStatus: this.platformFeeDebtStatusToDb(input.platformFeeDebtStatus) }
        : {}),
      ...(input.platformFeeAcceptedAt !== undefined
        ? { platformFeeAcceptedAt: input.platformFeeAcceptedAt }
        : {}),
      ...(input.platformFeeOverdraftConfirmationKey !== undefined
        ? {
            platformFeeOverdraftConfirmationKey: input.platformFeeOverdraftConfirmationKey
          }
        : {}),
      ...(input.platformFeePreviewVersion !== undefined
        ? { platformFeePreviewVersion: input.platformFeePreviewVersion }
        : {}),
      ...(input.userRewardEligibleNdp !== undefined
        ? { userRewardEligibleNdp: input.userRewardEligibleNdp }
        : {}),
      ...(input.userRewardStatus !== undefined
        ? { userRewardStatus: this.userRewardStatusToDb(input.userRewardStatus) }
        : {}),
      ...(input.userRewardDeadlineAt !== undefined
        ? { userRewardDeadlineAt: input.userRewardDeadlineAt }
        : {}),
      ...(input.userRewardGrantedAt !== undefined
        ? { userRewardGrantedAt: input.userRewardGrantedAt }
        : {}),
      ...(input.completedOrderOrdinalInPeriod !== undefined
        ? { completedOrderOrdinalInPeriod: input.completedOrderOrdinalInPeriod }
        : {}),
      appliedFeeRuleIdsJson: appliedRuleIds as Prisma.InputJsonValue,
      moneyTimelineJson: timeline as Prisma.InputJsonValue,
      settlementStatus: input.settlementStatus ?? existing?.settlementStatus ?? "pending",
      deletedAt: null
    };

    if (existing) {
      await this.client.orderFinancial.update({
        where: { id: existing.id },
        data: baseData
      });
      return;
    }

    await this.client.orderFinancial.create({
      data: {
        bookingOrderId: input.bookingOrderId,
        ...baseData
      }
    });
  }

  public async findCompensationRuleByBasis(
    shopId: number,
    technicianProfileId: number | null,
    basisVersion: `shop_default:${number}` | `technician_override:${number}`
  ): Promise<CompensationRuleSet | null> {
    const [sourceType, rawId] = basisVersion.split(":") as [
      "shop_default" | "technician_override",
      string
    ];
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    if (sourceType === "technician_override") {
      if (technicianProfileId === null) return null;
      const record = await this.client.technicianCompensationProfile.findFirst({
        where: { id, shopId, technicianProfileId }
      });
      return record
        ? {
            id: record.id,
            sourceType,
            shopId: record.shopId,
            technicianProfileId: record.technicianProfileId,
            name: record.name,
            wageMode: this.compensationWageMode(record.wageMode),
            baseSalaryJpy: record.baseSalaryJpy,
            hourlyRateJpy: record.hourlyRateJpy,
            dailyRateJpy: record.dailyRateJpy,
            fixedOrderPayJpy: record.fixedOrderPayJpy,
            commissionRatePercent: record.commissionRateBps / 100,
            extensionCommissionRatePercent: record.extensionCommissionRateBps / 100,
            nominationFeeJpy: record.nominationFeeJpy,
            guaranteedMinimumJpy: record.guaranteedMinimumJpy,
            ndpFeeBearer: this.compensationNdpBearer(record.ndpFeeBearer),
            technicianNdpSharePercent: record.technicianNdpShareBps / 100,
            bonusRules: this.compensationAdjustmentRules(record.bonusRulesJson),
            deductionRules: this.compensationAdjustmentRules(record.deductionRulesJson)
          }
        : null;
    }
    const record = await this.client.shopFinanceRuleSet.findFirst({ where: { id, shopId } });
    return record
      ? {
          id: record.id,
          sourceType,
          shopId: record.shopId,
          technicianProfileId: null,
          name: record.name,
          wageMode: this.compensationWageMode(record.wageMode),
          baseSalaryJpy: record.baseSalaryJpy,
          hourlyRateJpy: record.hourlyRateJpy,
          dailyRateJpy: record.dailyRateJpy,
          fixedOrderPayJpy: record.fixedOrderPayJpy,
          commissionRatePercent: record.commissionRateBps / 100,
          extensionCommissionRatePercent: record.extensionCommissionRateBps / 100,
          nominationFeeJpy: record.nominationFeeJpy,
          guaranteedMinimumJpy: record.guaranteedMinimumJpy,
          ndpFeeBearer: this.compensationNdpBearer(record.ndpFeeBearer),
          technicianNdpSharePercent: record.technicianNdpShareBps / 100,
          bonusRules: this.compensationAdjustmentRules(record.bonusRulesJson),
          deductionRules: this.compensationAdjustmentRules(record.deductionRulesJson)
        }
      : null;
  }

  public async findWallet(input: WalletLookupInput): Promise<WalletPayload | null> {
    const wallet = await this.client.wallet.findFirst({
      where: {
        ownerType: this.ownerTypeToDb(input.ownerType),
        ownerId: input.ownerId,
        currency: input.currency ?? "NDP",
        deletedAt: null
      }
    });

    return wallet ? this.mapWallet(wallet) : null;
  }

  public async findWallets(input: {
    ownerType: WalletOwnerType;
    ownerId: number;
    currencies: LedgerCurrency[];
  }): Promise<WalletPayload[]> {
    const wallets = await this.client.wallet.findMany({
      where: {
        ownerType: this.ownerTypeToDb(input.ownerType),
        ownerId: input.ownerId,
        currency: { in: input.currencies },
        deletedAt: null
      },
      orderBy: { id: "asc" }
    });

    return wallets.map((wallet) => this.mapWallet(wallet));
  }

  public async listWalletLedger(
    input: WalletLedgerListInput
  ): Promise<PaginatedResponse<WalletLedgerPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.WalletLedgerWhereInput = {
      walletId: input.walletId,
      deletedAt: null,
      wallet: { deletedAt: null }
    };
    const [list, total] = await Promise.all([
      this.client.walletLedger.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.walletLedger.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((entry) => this.mapLedgerEntry(entry)),
      total,
      pagination
    );
  }

  public async listLedgerTransactions(
    input: LedgerTransactionListInput
  ): Promise<PaginatedResponse<LedgerTransactionPayload>> {
    const pagination = toPrismaPagination(input);
    const where = this.transactionWhere(input);
    const [list, total] = await Promise.all([
      this.client.ledgerTransaction.findMany({
        where,
        include: this.transactionInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.ledgerTransaction.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((transaction) => this.mapTransaction(transaction)),
      total,
      pagination
    );
  }

  public async listFinanceReconciliation(
    input: FinanceReconciliationListInput
  ): Promise<PaginatedResponse<FinanceReconciliationPayload>> {
    const pagination = toPrismaPagination(input);
    const where = this.reconciliationWhere(input);
    const [list, total] = await Promise.all([
      this.client.financeReconciliation.findMany({
        where,
        include: { transaction: { select: { transactionNo: true } } },
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      this.client.financeReconciliation.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((row) => this.mapReconciliation(row)),
      total,
      pagination
    );
  }

  public async exportFinanceReconciliation(
    input: FinanceReconciliationListInput
  ): Promise<FinanceReconciliationExportPayload> {
    const rows = await this.client.financeReconciliation.findMany({
      where: this.reconciliationWhere(input),
      include: { transaction: { select: { transactionNo: true } } },
      take: 1000,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
    const header = [
      "transaction_no",
      "reference_type",
      "reference_id",
      "status",
      "expected_amount",
      "actual_amount",
      "difference_amount"
    ];
    const body = rows.map((row) =>
      [
        row.transaction.transactionNo,
        row.referenceType,
        String(row.referenceId),
        this.reconciliationStatusFromDb(row.status),
        String(row.expectedAmount),
        String(row.actualAmount),
        String(row.differenceAmount)
      ]
        .map((value) => this.csvEscape(value))
        .join(",")
    );

    return {
      filename: `finance-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`,
      contentType: "text/csv",
      csv: `${header.join(",")}\n${body.join("\n")}${body.length ? "\n" : ""}`
    };
  }

  private transactionWhere(input: LedgerTransactionListInput): Prisma.LedgerTransactionWhereInput {
    return {
      deletedAt: null,
      ...(input.type ? { type: this.transactionTypeToDb(input.type) } : {}),
      ...(input.referenceType ? { referenceType: input.referenceType } : {}),
      ...(input.referenceId ? { referenceId: input.referenceId } : {}),
      ...this.createdAtFilter(input)
    };
  }

  private reconciliationWhere(
    input: FinanceReconciliationListInput
  ): Prisma.FinanceReconciliationWhereInput {
    return {
      deletedAt: null,
      currency: "NDP",
      ...(input.status ? { status: this.reconciliationStatusToDb(input.status) } : {}),
      ...(input.referenceType ? { referenceType: input.referenceType } : {}),
      ...(input.referenceId ? { referenceId: input.referenceId } : {}),
      ...this.createdAtFilter(input)
    };
  }

  private createdAtFilter(input: { from?: Date; to?: Date }) {
    if (!input.from && !input.to) {
      return {};
    }

    return {
      createdAt: {
        ...(input.from ? { gte: input.from } : {}),
        ...(input.to ? { lte: input.to } : {})
      }
    };
  }

  private transactionInclude() {
    return {
      entries: {
        where: { deletedAt: null },
        orderBy: { id: "asc" as const },
        include: {
          wallet: { select: { ownerType: true, ownerId: true, currency: true } }
        }
      }
    };
  }

  private mapWallet(wallet: {
    id: number;
    ownerType: string;
    ownerId: number;
    currency: string;
    availableBalance: number;
    frozenBalance: number;
    createdAt: Date;
    updatedAt: Date;
  }): WalletPayload {
    return {
      id: wallet.id,
      ownerType: this.ownerTypeFromDb(wallet.ownerType),
      ownerId: wallet.ownerId,
      currency: LedgerCurrencyService.fromStored(wallet.currency),
      availableBalance: wallet.availableBalance,
      frozenBalance: wallet.frozenBalance,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt
    };
  }

  private mapTransaction(transaction: LedgerTransactionRecord): LedgerTransactionPayload {
    return {
      id: transaction.id,
      transactionNo: transaction.transactionNo,
      idempotencyKey: transaction.idempotencyKey,
      type: this.transactionTypeFromDb(transaction.type),
      status: this.transactionStatusFromDb(transaction.status),
      referenceType: transaction.referenceType,
      referenceId: transaction.referenceId,
      actorUserId: transaction.actorUserId,
      amount: transaction.amount,
      currency: LedgerCurrencyService.fromStored(transaction.currency),
      metadata: transaction.metadata ?? null,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      entries: transaction.entries.map((entry) => this.mapLedgerEntry(entry))
    };
  }

  private mapLedgerEntry(entry: {
    id: number;
    transactionId: number;
    walletId: number;
    direction: string;
    amount: number;
    availableDelta: number;
    frozenDelta: number;
    availableBalanceAfter: number;
    frozenBalanceAfter: number;
    reason: string;
    createdAt: Date;
    wallet?: { ownerType: string; ownerId: number; currency: string };
  }): WalletLedgerPayload {
    return {
      id: entry.id,
      transactionId: entry.transactionId,
      walletId: entry.walletId,
      direction: this.directionFromDb(entry.direction),
      amount: entry.amount,
      availableDelta: entry.availableDelta,
      frozenDelta: entry.frozenDelta,
      availableBalanceAfter: entry.availableBalanceAfter,
      frozenBalanceAfter: entry.frozenBalanceAfter,
      reason: entry.reason,
      createdAt: entry.createdAt,
      ...(entry.wallet
        ? {
            walletOwnerType: this.ownerTypeFromDb(entry.wallet.ownerType),
            walletOwnerId: entry.wallet.ownerId,
            walletCurrency: LedgerCurrencyService.fromStored(entry.wallet.currency)
          }
        : {})
    };
  }

  private mapReconciliation(row: FinanceReconciliationRecord): FinanceReconciliationPayload {
    return {
      id: row.id,
      transactionId: row.transactionId,
      transactionNo: row.transaction.transactionNo,
      referenceType: row.referenceType,
      referenceId: row.referenceId,
      status: this.reconciliationStatusFromDb(row.status),
      currency: LedgerCurrencyService.fromStored(row.currency),
      expectedAmount: row.expectedAmount,
      actualAmount: row.actualAmount,
      differenceAmount: row.differenceAmount,
      exportedAt: row.exportedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  private mapWalletHold(hold: WalletHoldRecord): WalletHoldPayload {
    return {
      id: hold.id,
      ownerType: this.ownerTypeFromDb(hold.ownerType),
      ownerId: hold.ownerId,
      bookingOrderId: hold.bookingOrderId,
      exchangePostId: hold.exchangePostId,
      feeType: this.feeTypeFromDb(hold.feeType),
      holdAmountNdp: hold.holdAmountNdp,
      capturedAmountNdp: hold.capturedAmountNdp,
      releasedAmountNdp: hold.releasedAmountNdp,
      currency: LedgerCurrencyService.fromStored(hold.currency),
      status: this.walletHoldStatus(hold.status),
      idempotencyKey: hold.idempotencyKey,
      calculationLogId: hold.calculationLogId,
      metadata: hold.metadata ?? null,
      capturedAt: hold.capturedAt,
      releasedAt: hold.releasedAt,
      createdAt: hold.createdAt,
      updatedAt: hold.updatedAt
    };
  }

  private mapExchangeRequestFinancial(
    financial: ExchangeRequestFinancialRecord | LockedExchangeRequestFinancialRow
  ): ExchangeRequestFinancialPayload {
    const walletOwnerType = this.ownerTypeFromDb(financial.walletOwnerType);
    if (walletOwnerType !== "user" && walletOwnerType !== "shop") {
      throw new Error("Invalid Exchange Request wallet owner");
    }
    if (financial.payerType !== "user" && financial.payerType !== "shop") {
      throw new Error("Invalid Exchange Request payer");
    }

    return {
      id: financial.id,
      exchangePostId: financial.exchangePostId,
      payerType: financial.payerType,
      payerId: financial.payerId,
      walletOwnerType,
      walletOwnerId: financial.walletOwnerId,
      currency: LedgerCurrencyService.fromStored(financial.currency),
      feeRuleSetId: financial.feeRuleSetId,
      feeRuleSetVersion: financial.feeRuleSetVersion,
      feeRuleId: financial.feeRuleId,
      feeCalculationLogId: financial.feeCalculationLogId,
      walletHoldId: financial.walletHoldId,
      amountNdp: financial.amountNdp,
      state: this.exchangeRequestFinancialStateFromDb(financial.state),
      capturedAt: financial.capturedAt,
      releasedAt: financial.releasedAt,
      createdAt: financial.createdAt,
      updatedAt: financial.updatedAt
    };
  }

  private mapWalletAdjustmentRequest(
    request: WalletAdjustmentRequestRecord
  ): WalletAdjustmentRequestPayload {
    return {
      id: request.id,
      type: this.walletAdjustmentTypeFromDb(request.type),
      status: this.walletAdjustmentStatusFromDb(request.status),
      ownerType: this.ownerTypeFromDb(request.ownerType),
      ownerId: request.ownerId,
      walletId: request.walletId,
      amountNdp: request.amountNdp,
      idempotencyKey: request.idempotencyKey,
      bankReference: request.bankReference,
      note: request.note,
      requestedById: request.requestedById,
      reviewedById: request.reviewedById,
      reviewedAt: request.reviewedAt,
      reviewNote: request.reviewNote,
      ledgerTransactionId: request.ledgerTransactionId,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt
    };
  }

  private mergeStringArrays(existing: unknown, incoming: string[] | undefined): string[] {
    const values = new Set<string>();

    if (Array.isArray(existing)) {
      for (const item of existing) {
        if (typeof item === "string") {
          values.add(item);
        }
      }
    }
    for (const item of incoming ?? []) {
      values.add(item);
    }

    return [...values];
  }

  private appendTimeline(existing: unknown, events: unknown[]): unknown[] {
    const timeline = Array.isArray(existing) ? existing : [];
    return [
      ...timeline,
      ...events.filter(Boolean).map((event) => ({
        ...(typeof event === "object" && event !== null ? event : { event }),
        recordedAt: new Date().toISOString()
      }))
    ];
  }

  private compensationWageMode(value: string): CompensationWageMode {
    return value === "fixed_per_order" || value === "base_plus_commission" || value === "hourly"
      ? value
      : "commission";
  }

  private compensationNdpBearer(value: string): CompensationNdpBearer {
    return value === "technician" || value === "split" ? value : "shop";
  }

  private compensationAdjustmentRules(value: Prisma.JsonValue | null): CompensationAdjustmentRule[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, Prisma.JsonValue>;
      if (
        typeof record.id !== "string" ||
        typeof record.name !== "string" ||
        typeof record.triggerType !== "string" ||
        typeof record.threshold !== "number" ||
        typeof record.amountJpy !== "number" ||
        typeof record.active !== "boolean"
      )
        return [];
      if (
        ![
          "monthly_order_count",
          "monthly_service_gmv",
          "rating_average",
          "late_cancellation_count",
          "rating_average_below"
        ].includes(record.triggerType)
      )
        return [];
      return [
        {
          id: record.id,
          name: record.name,
          triggerType: record.triggerType as CompensationAdjustmentRule["triggerType"],
          threshold: record.threshold,
          amountJpy: record.amountJpy,
          active: record.active
        }
      ];
    });
  }

  private ownerTypeToDb(ownerType: WalletOwnerType) {
    if (ownerType === "alliance") {
      return "ALLIANCE" as const;
    }
    if (ownerType === "merchant_account") {
      return "MERCHANT_ACCOUNT" as const;
    }
    if (ownerType === "shop") {
      return "SHOP" as const;
    }
    if (ownerType === "platform") {
      return "PLATFORM" as const;
    }

    return "USER" as const;
  }

  private platformFeeDebtStatusToDb(status: "none" | "outstanding" | "settled") {
    if (status === "outstanding") {
      return "OUTSTANDING" as const;
    }
    if (status === "settled") {
      return "SETTLED" as const;
    }

    return "NONE" as const;
  }

  private userRewardStatusToDb(status: "disabled" | "immediate" | "pending" | "paid" | "expired") {
    return status.toUpperCase() as "DISABLED" | "IMMEDIATE" | "PENDING" | "PAID" | "EXPIRED";
  }

  private ownerTypeFromDb(ownerType: string): WalletOwnerType {
    if (ownerType === "ALLIANCE" || ownerType === "alliance") {
      return "alliance";
    }
    if (ownerType === "MERCHANT_ACCOUNT" || ownerType === "merchant_account") {
      return "merchant_account";
    }
    if (ownerType === "SHOP" || ownerType === "shop") {
      return "shop";
    }
    if (ownerType === "PLATFORM" || ownerType === "platform") {
      return "platform";
    }

    return "user";
  }

  private transactionTypeToDb(type: LedgerTransactionType) {
    if (type === "shop_membership_reward_reversal") {
      return "SHOP_MEMBERSHIP_REWARD_REVERSAL" as const;
    }
    if (type === "service_consumption_settlement") {
      return "SERVICE_CONSUMPTION_SETTLEMENT" as const;
    }
    if (type === "product_consumption_settlement") {
      return "PRODUCT_CONSUMPTION_SETTLEMENT" as const;
    }
    if (type === "platform_membership_purchase") {
      return "PLATFORM_MEMBERSHIP_PURCHASE" as const;
    }
    if (type === "booking_consumption_refund") {
      return "BOOKING_CONSUMPTION_REFUND" as const;
    }
    if (type === "service_consumption_refund") {
      return "SERVICE_CONSUMPTION_REFUND" as const;
    }
    if (type === "product_consumption_refund") {
      return "PRODUCT_CONSUMPTION_REFUND" as const;
    }
    if (type === "shop_membership_reward_settlement") {
      return "SHOP_MEMBERSHIP_REWARD_SETTLEMENT" as const;
    }
    if (type === "exchange_request_publication_freeze") {
      return "EXCHANGE_REQUEST_PUBLICATION_FREEZE" as const;
    }
    if (type === "exchange_request_publication_capture") {
      return "EXCHANGE_REQUEST_PUBLICATION_CAPTURE" as const;
    }
    if (type === "exchange_request_publication_release") {
      return "EXCHANGE_REQUEST_PUBLICATION_RELEASE" as const;
    }
    if (type === "test_balance_calibration") {
      return "TEST_BALANCE_CALIBRATION" as const;
    }
    if (type === "affiliate_task_budget_freeze") {
      return "AFFILIATE_TASK_BUDGET_FREEZE" as const;
    }
    if (type === "affiliate_task_budget_release") {
      return "AFFILIATE_TASK_BUDGET_RELEASE" as const;
    }
    if (type === "affiliate_reward_settlement") {
      return "AFFILIATE_REWARD_SETTLEMENT" as const;
    }
    if (type === "affiliate_reward_reversal") {
      return "AFFILIATE_REWARD_REVERSAL" as const;
    }
    if (type === "affiliate_reward_recovery") {
      return "AFFILIATE_REWARD_RECOVERY" as const;
    }
    if (type === "booking_cancel_unfreeze") {
      return "BOOKING_CANCEL_UNFREEZE" as const;
    }
    if (type === "booking_complete_settlement") {
      return "BOOKING_COMPLETE_SETTLEMENT" as const;
    }
    if (type === "booking_merchant_cancel_compensation") {
      return "BOOKING_MERCHANT_CANCEL_COMPENSATION" as const;
    }
    if (type === "manual_topup_approved") {
      return "MANUAL_TOPUP_APPROVED" as const;
    }
    if (type === "manual_withdrawal_approved") {
      return "MANUAL_WITHDRAWAL_APPROVED" as const;
    }
    if (type === "seed_credit") {
      return "SEED_CREDIT" as const;
    }

    return "BOOKING_ACCEPT_FREEZE" as const;
  }

  private transactionTypeFromDb(type: string): LedgerTransactionType {
    if (type === "SHOP_MEMBERSHIP_REWARD_REVERSAL") {
      return "shop_membership_reward_reversal";
    }
    if (type === "SERVICE_CONSUMPTION_SETTLEMENT") {
      return "service_consumption_settlement";
    }
    if (type === "PRODUCT_CONSUMPTION_SETTLEMENT") {
      return "product_consumption_settlement";
    }
    if (type === "PLATFORM_MEMBERSHIP_PURCHASE") {
      return "platform_membership_purchase";
    }
    if (type === "BOOKING_CONSUMPTION_REFUND") {
      return "booking_consumption_refund";
    }
    if (type === "SERVICE_CONSUMPTION_REFUND") {
      return "service_consumption_refund";
    }
    if (type === "PRODUCT_CONSUMPTION_REFUND") {
      return "product_consumption_refund";
    }
    if (type === "SHOP_MEMBERSHIP_REWARD_SETTLEMENT") {
      return "shop_membership_reward_settlement";
    }
    if (type === "EXCHANGE_REQUEST_PUBLICATION_FREEZE") {
      return "exchange_request_publication_freeze";
    }
    if (type === "EXCHANGE_REQUEST_PUBLICATION_CAPTURE") {
      return "exchange_request_publication_capture";
    }
    if (type === "EXCHANGE_REQUEST_PUBLICATION_RELEASE") {
      return "exchange_request_publication_release";
    }
    if (type === "TEST_BALANCE_CALIBRATION") {
      return "test_balance_calibration";
    }
    if (type === "AFFILIATE_TASK_BUDGET_FREEZE") {
      return "affiliate_task_budget_freeze";
    }
    if (type === "AFFILIATE_TASK_BUDGET_RELEASE") {
      return "affiliate_task_budget_release";
    }
    if (type === "AFFILIATE_REWARD_SETTLEMENT") {
      return "affiliate_reward_settlement";
    }
    if (type === "AFFILIATE_REWARD_REVERSAL") {
      return "affiliate_reward_reversal";
    }
    if (type === "AFFILIATE_REWARD_RECOVERY") {
      return "affiliate_reward_recovery";
    }
    if (type === "BOOKING_CANCEL_UNFREEZE") {
      return "booking_cancel_unfreeze";
    }
    if (type === "BOOKING_COMPLETE_SETTLEMENT") {
      return "booking_complete_settlement";
    }
    if (type === "BOOKING_MERCHANT_CANCEL_COMPENSATION") {
      return "booking_merchant_cancel_compensation";
    }
    if (type === "MANUAL_TOPUP_APPROVED") {
      return "manual_topup_approved";
    }
    if (type === "MANUAL_WITHDRAWAL_APPROVED") {
      return "manual_withdrawal_approved";
    }
    if (type === "SEED_CREDIT") {
      return "seed_credit";
    }

    return "booking_accept_freeze";
  }

  private transactionStatusFromDb(status: string): LedgerTransactionStatus {
    return status === "APPLIED" ? "applied" : "applied";
  }

  private directionToDb(direction: WalletLedgerDirection) {
    if (direction === "frozen_credit") {
      return "FROZEN_CREDIT" as const;
    }
    if (direction === "available_credit") {
      return "AVAILABLE_CREDIT" as const;
    }
    if (direction === "available_debit") {
      return "AVAILABLE_DEBIT" as const;
    }
    if (direction === "unfreeze") {
      return "UNFREEZE" as const;
    }
    if (direction === "frozen_debit") {
      return "FROZEN_DEBIT" as const;
    }

    return "FREEZE" as const;
  }

  private directionFromDb(direction: string): WalletLedgerDirection {
    if (direction === "FROZEN_CREDIT") {
      return "frozen_credit";
    }
    if (direction === "AVAILABLE_CREDIT") {
      return "available_credit";
    }
    if (direction === "AVAILABLE_DEBIT") {
      return "available_debit";
    }
    if (direction === "UNFREEZE") {
      return "unfreeze";
    }
    if (direction === "FROZEN_DEBIT") {
      return "frozen_debit";
    }

    return "freeze";
  }

  private reconciliationStatusToDb(status: FinanceReconciliationStatus) {
    if (status === "test_only") {
      return "TEST_ONLY" as const;
    }
    return status === "exported" ? ("EXPORTED" as const) : ("PENDING" as const);
  }

  private reconciliationStatusFromDb(status: string): FinanceReconciliationStatus {
    if (status === "TEST_ONLY") {
      return "test_only";
    }
    return status === "EXPORTED" ? "exported" : "pending";
  }

  private walletAdjustmentTypeToDb(type: WalletAdjustmentType) {
    return type === "withdrawal" ? ("WITHDRAWAL" as const) : ("TOPUP" as const);
  }

  private walletAdjustmentTypeFromDb(type: string): WalletAdjustmentType {
    return type === "WITHDRAWAL" ? "withdrawal" : "topup";
  }

  private walletAdjustmentStatusToDb(status: WalletAdjustmentStatus) {
    if (status === "approved") {
      return "APPROVED" as const;
    }
    if (status === "rejected") {
      return "REJECTED" as const;
    }

    return "PENDING" as const;
  }

  private walletAdjustmentStatusFromDb(status: string): WalletAdjustmentStatus {
    if (status === "APPROVED") {
      return "approved";
    }
    if (status === "REJECTED") {
      return "rejected";
    }

    return "pending";
  }

  private feeTypeFromDb(value: string): WalletHoldFeeType {
    if (value === "exchange_request_publication_fee") {
      return value;
    }
    if (value === "c_request_dispatch_fee" || value === "user_reward" || value === "penalty") {
      return value;
    }

    return "b_platform_fee";
  }

  private exchangeRequestFinancialStateFromDb(
    state: string
  ): ExchangeRequestFinancialPayload["state"] {
    if (state === "CAPTURED" || state === "captured") return "captured";
    if (state === "RELEASED" || state === "released") return "released";
    return "held";
  }

  private walletHoldStatus(status: string): WalletHoldStatus {
    if (status === "captured" || status === "released" || status === "partially_captured") {
      return status;
    }

    return "active";
  }

  private canStartTransaction(client: LedgerPrismaClient): client is PrismaClient {
    return "$transaction" in client;
  }

  private createTransactionNo(): string {
    const now = new Date();
    const timestamp = [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, "0"),
      String(now.getUTCDate()).padStart(2, "0"),
      String(now.getUTCHours()).padStart(2, "0"),
      String(now.getUTCMinutes()).padStart(2, "0"),
      String(now.getUTCSeconds()).padStart(2, "0")
    ].join("");
    const suffix = String(Math.floor(Math.random() * 900000) + 100000);

    return `LT${timestamp}${suffix}`;
  }

  private csvEscape(value: string): string {
    if (/[",\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }

    return value;
  }
}
