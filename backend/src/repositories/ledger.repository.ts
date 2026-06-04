import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  FinanceReconciliationExportPayload,
  FinanceReconciliationListInput,
  FinanceReconciliationPayload,
  FinanceReconciliationStatus,
  LedgerCurrency,
  LedgerRepositoryPort,
  LedgerTransactionClient,
  LedgerTransactionListInput,
  LedgerTransactionPayload,
  LedgerTransactionStatus,
  LedgerTransactionType,
  OrderFinancialUpsertInput,
  WalletLedgerDirection,
  WalletLedgerListInput,
  WalletLedgerPayload,
  WalletHoldPayload,
  WalletHoldStatus,
  WalletLookupInput,
  WalletOwnerType,
  WalletPayload
} from "../services/ledger.service";
import type { FeeType } from "../services/fee-calculation.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse } from "../utils/pagination";

type LedgerPrismaClient = PrismaClient | Prisma.TransactionClient;

type LedgerTransactionRecord = Prisma.LedgerTransactionGetPayload<{
  include: {
    entries: {
      where: { deletedAt: null };
      orderBy: { id: "asc" };
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

export class LedgerRepository implements LedgerRepositoryPort {
  public constructor(private readonly client: LedgerPrismaClient = prisma) {}

  public async runInTransaction<T>(
    handler: (repository: LedgerRepositoryPort) => Promise<T>,
    transactionClient?: LedgerTransactionClient
  ): Promise<T> {
    if (transactionClient) {
      return handler(new LedgerRepository(transactionClient as LedgerPrismaClient));
    }

    if (this.canStartTransaction(this.client)) {
      return this.client.$transaction((tx) => handler(new LedgerRepository(tx)));
    }

    return handler(this);
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

  public async getOrCreateWallet(input: {
    ownerType: WalletOwnerType;
    ownerId: number;
    currency: LedgerCurrency;
  }): Promise<WalletPayload> {
    const wallet = await this.client.wallet.upsert({
      where: {
        ownerType_ownerId_currency: {
          ownerType: this.ownerTypeToDb(input.ownerType),
          ownerId: input.ownerId,
          currency: input.currency
        }
      },
      create: {
        ownerType: this.ownerTypeToDb(input.ownerType),
        ownerId: input.ownerId,
        currency: input.currency
      },
      update: { deletedAt: null }
    });

    return this.mapWallet(wallet);
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

  public async createTransaction(input: {
    idempotencyKey: string;
    type: LedgerTransactionType;
    referenceType: string;
    referenceId: number;
    actorUserId: number | null;
    amount: number;
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
        currency: "NDP",
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

    return this.mapLedgerEntry(entry);
  }

  public async createFinanceReconciliation(input: {
    transactionId: number;
    referenceType: string;
    referenceId: number;
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
        currency: "NDP"
      }
    });
  }

  public async createAuditLog(input: {
    actorUserId: number | null;
    action: string;
    targetId: number;
    metadata?: unknown;
  }): Promise<void> {
    await this.client.auditLog.create({
      data: {
        actorId: input.actorUserId,
        action: input.action,
        targetType: "ledger_transaction",
        targetId: input.targetId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined
      }
    });
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
    feeType: FeeType;
    holdAmountNdp: number;
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

  public async upsertOrderFinancial(input: OrderFinancialUpsertInput): Promise<void> {
    const existing = await this.client.orderFinancial.findUnique({
      where: { bookingOrderId: input.bookingOrderId }
    });
    const appliedRuleIds = this.mergeStringArrays(
      existing?.appliedFeeRuleIdsJson,
      input.appliedFeeRuleIds
    );
    const timeline = this.appendTimeline(existing?.moneyTimelineJson, input.timelineEvent);
    const baseData = {
      orderType: input.orderType,
      customerUserId: input.customerUserId,
      shopId: input.shopId,
      technicianProfileId: input.technicianProfileId ?? null,
      serviceAmountJpy: input.serviceAmountJpy,
      unknownOrUnreportedServiceAmountJpy:
        input.unknownOrUnreportedServiceAmountJpy ?? input.serviceAmountJpy,
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
        orderBy: { id: "asc" as const }
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
      currency: "NDP",
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
      currency: "NDP",
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
      createdAt: entry.createdAt
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
      currency: "NDP",
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
      feeType: this.feeTypeFromDb(hold.feeType),
      holdAmountNdp: hold.holdAmountNdp,
      capturedAmountNdp: hold.capturedAmountNdp,
      releasedAmountNdp: hold.releasedAmountNdp,
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

  private appendTimeline(existing: unknown, event: unknown): unknown[] {
    const timeline = Array.isArray(existing) ? existing : [];

    if (!event) {
      return timeline;
    }

    return [
      ...timeline,
      {
        ...(typeof event === "object" && event !== null ? event : { event }),
        recordedAt: new Date().toISOString()
      }
    ];
  }

  private ownerTypeToDb(ownerType: WalletOwnerType) {
    if (ownerType === "shop") {
      return "SHOP" as const;
    }
    if (ownerType === "platform") {
      return "PLATFORM" as const;
    }

    return "USER" as const;
  }

  private ownerTypeFromDb(ownerType: string): WalletOwnerType {
    if (ownerType === "SHOP") {
      return "shop";
    }
    if (ownerType === "PLATFORM") {
      return "platform";
    }

    return "user";
  }

  private transactionTypeToDb(type: LedgerTransactionType) {
    if (type === "booking_cancel_unfreeze") {
      return "BOOKING_CANCEL_UNFREEZE" as const;
    }
    if (type === "booking_complete_settlement") {
      return "BOOKING_COMPLETE_SETTLEMENT" as const;
    }
    if (type === "booking_merchant_cancel_compensation") {
      return "BOOKING_MERCHANT_CANCEL_COMPENSATION" as const;
    }
    if (type === "seed_credit") {
      return "SEED_CREDIT" as const;
    }

    return "BOOKING_ACCEPT_FREEZE" as const;
  }

  private transactionTypeFromDb(type: string): LedgerTransactionType {
    if (type === "BOOKING_CANCEL_UNFREEZE") {
      return "booking_cancel_unfreeze";
    }
    if (type === "BOOKING_COMPLETE_SETTLEMENT") {
      return "booking_complete_settlement";
    }
    if (type === "BOOKING_MERCHANT_CANCEL_COMPENSATION") {
      return "booking_merchant_cancel_compensation";
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
    return status === "exported" ? ("EXPORTED" as const) : ("PENDING" as const);
  }

  private reconciliationStatusFromDb(status: string): FinanceReconciliationStatus {
    return status === "EXPORTED" ? "exported" : "pending";
  }

  private feeTypeFromDb(value: string): FeeType {
    if (value === "c_request_dispatch_fee" || value === "user_reward" || value === "penalty") {
      return value;
    }

    return "b_platform_fee";
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
