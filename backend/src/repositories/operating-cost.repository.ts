import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import {
  allocatePeriod,
  type OperatingCostAllocationMode
} from "../services/operating-cost.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import { toAuditLogCreateData, type AuditLogCreateInput } from "./audit-log.repository";
import {
  isRetryableTransactionConflict,
  runWithTransactionConflictRetry
} from "../utils/transaction-conflict-retry";

export type OperatingCostStatus = "draft" | "published" | "archived";
export type OperatingCostCategory = "personnel" | "server" | "third_party_api" | "other";
export type DirectAssignmentConfiguration =
  | { shopPublicId: string; amountJpy: number; shareBps?: never }
  | { shopPublicId: string; shareBps: number; amountJpy?: never };

export interface OperatingCostAllocationRecord {
  shopPublicId: string;
  shopName: string;
  amountJpy: number;
  allocationWeight: string | null;
}

export interface OperatingCostItemRecord {
  id: number;
  publicId: string;
  costCode: string;
  version: number;
  categoryCode: OperatingCostCategory;
  name: string;
  amountJpy: number;
  currency: "JPY";
  periodStart: Date;
  periodEnd: Date;
  allocationMode: OperatingCostAllocationMode;
  status: OperatingCostStatus;
  effectiveAt: Date;
  publishedAt: Date | null;
  configuredById: number;
  reason: string;
  directAssignments: DirectAssignmentConfiguration[] | null;
  allocations: OperatingCostAllocationRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OperatingCostListInput extends PaginationInput {
  keyword?: string;
  categoryCode?: OperatingCostCategory;
  status?: OperatingCostStatus;
  periodStart?: Date;
  periodEnd?: Date;
}

export interface OperatingCostConfigurationInput {
  categoryCode: OperatingCostCategory;
  name: string;
  amountJpy: number;
  periodStart: Date;
  periodEnd: Date;
  allocationMode: OperatingCostAllocationMode;
  directAssignments?: DirectAssignmentConfiguration[];
  effectiveAt: Date;
  reason: string;
}

export interface OperatingCostCreateInput extends OperatingCostConfigurationInput {
  costCode: string;
  actorUserId: number;
  audit: AuditLogCreateInput;
}

export interface OperatingCostUpdateInput extends OperatingCostConfigurationInput {
  publicId: string;
  actorUserId: number;
  audit: AuditLogCreateInput;
}

export interface OperatingCostCommandInput {
  publicId: string;
  actorUserId: number;
  reason: string;
  audit: AuditLogCreateInput;
}

export type OperatingCostCreateResult =
  | { outcome: "created"; item: OperatingCostItemRecord }
  | { outcome: "conflict" };
export type OperatingCostUpdateResult =
  | { outcome: "updated"; item: OperatingCostItemRecord }
  | { outcome: "not_found" | "conflict" };
export type OperatingCostDeleteResult =
  | { outcome: "deleted" }
  | { outcome: "not_found" | "conflict" };
export type OperatingCostPublishResult =
  | { outcome: "published"; item: OperatingCostItemRecord }
  | { outcome: "not_found" | "conflict" | "allocation_invalid" | "shop_not_found" };

export interface OperatingCostRepositoryPort {
  list: (input: OperatingCostListInput) => Promise<PaginatedResponse<OperatingCostItemRecord>>;
  createDraft: (input: OperatingCostCreateInput) => Promise<OperatingCostCreateResult>;
  updateDraft: (input: OperatingCostUpdateInput) => Promise<OperatingCostUpdateResult>;
  deleteDraft: (input: OperatingCostCommandInput) => Promise<OperatingCostDeleteResult>;
  publish: (input: OperatingCostCommandInput) => Promise<OperatingCostPublishResult>;
}

const allocationSelect = {
  amountJpy: true,
  allocationWeight: true,
  calculationSnapshotJson: true,
  shop: {
    select: {
      name: true,
      publicIdentifier: { select: { publicId: true, status: true, deletedAt: true } }
    }
  }
} as const satisfies Prisma.OperatingCostAllocationSelect;

const itemSelect = {
  id: true,
  publicId: true,
  costCode: true,
  version: true,
  categoryCode: true,
  name: true,
  amountJpy: true,
  currency: true,
  periodStart: true,
  periodEnd: true,
  allocationMode: true,
  status: true,
  effectiveAt: true,
  publishedAt: true,
  configuredById: true,
  reason: true,
  configurationSnapshotJson: true,
  createdAt: true,
  updatedAt: true,
  allocations: {
    where: { deletedAt: null },
    orderBy: [{ shopId: "asc" as const }, { id: "asc" as const }],
    select: allocationSelect
  }
} as const satisfies Prisma.OperatingCostItemSelect;

type StoredItem = Prisma.OperatingCostItemGetPayload<{ select: typeof itemSelect }>;
type OperatingCostClient = PrismaClient | Prisma.TransactionClient;
type IncomeBasisRow = {
  shopId?: number;
  shop_id?: number;
  settledPlatformIncomeJpy?: bigint | Prisma.Decimal | number | string;
  settled_platform_income_jpy?: bigint | Prisma.Decimal | number | string;
};
class OperatingCostConflict extends Error {}
class OperatingCostAllocationInvalid extends Error {}
class OperatingCostShopNotFound extends Error {}

export class OperatingCostRepository implements OperatingCostRepositoryPort {
  public constructor(private readonly client: OperatingCostClient = prisma) {}

  public async list(
    input: OperatingCostListInput
  ): Promise<PaginatedResponse<OperatingCostItemRecord>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.OperatingCostItemWhereInput = {
      deletedAt: null,
      ...(input.status ? { status: statusToRecord(input.status) } : {}),
      ...(input.categoryCode ? { categoryCode: input.categoryCode } : {}),
      ...(input.keyword
        ? {
            OR: [{ costCode: { contains: input.keyword } }, { name: { contains: input.keyword } }]
          }
        : {}),
      ...(input.periodStart ? { periodEnd: { gte: input.periodStart } } : {}),
      ...(input.periodEnd ? { periodStart: { lte: input.periodEnd } } : {})
    };
    const [rows, total] = await Promise.all([
      this.client.operatingCostItem.findMany({
        where,
        orderBy: [{ periodStart: "desc" }, { costCode: "asc" }, { version: "desc" }],
        skip: pagination.skip,
        take: pagination.take,
        select: itemSelect
      }),
      this.client.operatingCostItem.count({ where })
    ]);
    return buildPaginatedResponse(
      rows.map((row) => this.mapItem(row)),
      total,
      pagination
    );
  }

  public async createDraft(input: OperatingCostCreateInput): Promise<OperatingCostCreateResult> {
    if (!("$transaction" in this.client))
      throw new Error("error.operating_cost.transaction_required");
    try {
      return await runWithTransactionConflictRetry(() =>
        this.client.$transaction((transaction) => this.createDraftInTransaction(transaction, input))
      );
    } catch (error) {
      if (isConflictError(error)) return { outcome: "conflict" };
      throw error;
    }
  }

  public async updateDraft(input: OperatingCostUpdateInput): Promise<OperatingCostUpdateResult> {
    if (!("$transaction" in this.client))
      throw new Error("error.operating_cost.transaction_required");
    try {
      return await runWithTransactionConflictRetry(() =>
        this.client.$transaction((transaction) => this.updateDraftInTransaction(transaction, input))
      );
    } catch (error) {
      if (isConflictError(error)) return { outcome: "conflict" };
      throw error;
    }
  }

  public async deleteDraft(input: OperatingCostCommandInput): Promise<OperatingCostDeleteResult> {
    if (!("$transaction" in this.client))
      throw new Error("error.operating_cost.transaction_required");
    try {
      return await runWithTransactionConflictRetry(() =>
        this.client.$transaction((transaction) => this.deleteDraftInTransaction(transaction, input))
      );
    } catch (error) {
      if (isConflictError(error)) return { outcome: "conflict" };
      throw error;
    }
  }

  public async publish(input: OperatingCostCommandInput): Promise<OperatingCostPublishResult> {
    if (!("$transaction" in this.client))
      throw new Error("error.operating_cost.transaction_required");
    try {
      return await runWithTransactionConflictRetry(() =>
        this.client.$transaction((transaction) => this.publishInTransaction(transaction, input))
      );
    } catch (error) {
      if (error instanceof OperatingCostAllocationInvalid) return { outcome: "allocation_invalid" };
      if (error instanceof OperatingCostShopNotFound) return { outcome: "shop_not_found" };
      if (isConflictError(error)) return { outcome: "conflict" };
      throw error;
    }
  }

  private async createDraftInTransaction(
    transaction: Prisma.TransactionClient,
    input: OperatingCostCreateInput
  ): Promise<OperatingCostCreateResult> {
    await transaction.$queryRaw<Array<{ lockKey: string }>>(
      Prisma.sql`SELECT ${input.costCode} AS lockKey FROM operating_cost_items WHERE cost_code = ${input.costCode} ORDER BY version DESC LIMIT 1 FOR UPDATE`
    );
    const latest = await transaction.operatingCostItem.findFirst({
      where: { costCode: input.costCode, deletedAt: null },
      orderBy: [{ version: "desc" }, { id: "desc" }],
      select: { id: true, version: true, status: true }
    });
    if (latest?.status === "DRAFT") return { outcome: "conflict" };
    const created = await transaction.operatingCostItem.create({
      data: {
        costCode: input.costCode,
        version: (latest?.version ?? 0) + 1,
        ...this.configurationData(input),
        configuredById: input.actorUserId
      },
      select: itemSelect
    });
    await this.writeAudit(transaction, input.audit, created.id, {
      previous: latest ? { version: latest.version, status: latest.status.toLowerCase() } : null,
      next: this.auditSnapshot(created),
      reason: input.reason
    });
    return { outcome: "created", item: this.mapItem(created) };
  }

  private async updateDraftInTransaction(
    transaction: Prisma.TransactionClient,
    input: OperatingCostUpdateInput
  ): Promise<OperatingCostUpdateResult> {
    const locked = await this.lockItem(transaction, input.publicId);
    if (!locked) return { outcome: "not_found" };
    const current = await transaction.operatingCostItem.findFirst({
      where: { id: locked.id, publicId: input.publicId, deletedAt: null },
      select: itemSelect
    });
    if (!current) return { outcome: "not_found" };
    if (current.status !== "DRAFT") return { outcome: "conflict" };
    const updated = await transaction.operatingCostItem.update({
      where: { id: current.id },
      data: { ...this.configurationData(input), configuredById: input.actorUserId },
      select: itemSelect
    });
    await this.writeAudit(transaction, input.audit, updated.id, {
      previous: this.auditSnapshot(current),
      next: this.auditSnapshot(updated),
      reason: input.reason
    });
    return { outcome: "updated", item: this.mapItem(updated) };
  }

  private async deleteDraftInTransaction(
    transaction: Prisma.TransactionClient,
    input: OperatingCostCommandInput
  ): Promise<OperatingCostDeleteResult> {
    const locked = await this.lockItem(transaction, input.publicId);
    if (!locked) return { outcome: "not_found" };
    const current = await transaction.operatingCostItem.findFirst({
      where: { id: locked.id, publicId: input.publicId, deletedAt: null },
      select: itemSelect
    });
    if (!current) return { outcome: "not_found" };
    if (current.status !== "DRAFT") return { outcome: "conflict" };
    const deletedAt = new Date();
    const updated = await transaction.operatingCostItem.updateMany({
      where: { id: current.id, status: "DRAFT", deletedAt: null },
      data: { deletedAt }
    });
    if (updated.count !== 1) throw new OperatingCostConflict();
    await this.writeAudit(transaction, input.audit, current.id, {
      previous: this.auditSnapshot(current),
      next: { status: "deleted", deletedAt: deletedAt.toISOString() },
      reason: input.reason
    });
    return { outcome: "deleted" };
  }

  private async publishInTransaction(
    transaction: Prisma.TransactionClient,
    input: OperatingCostCommandInput
  ): Promise<OperatingCostPublishResult> {
    const locked = await this.lockItem(transaction, input.publicId);
    if (!locked) return { outcome: "not_found" };
    const current = await transaction.operatingCostItem.findFirst({
      where: { id: locked.id, publicId: input.publicId, deletedAt: null },
      select: itemSelect
    });
    if (!current) return { outcome: "not_found" };
    if (current.status !== "DRAFT" || current.allocations.length !== 0) {
      return { outcome: "conflict" };
    }

    const amountJpy = toSafeJpy(current.amountJpy);
    const mode = modeFromRecord(current.allocationMode);
    const allocationContext = await this.resolveAllocationContext(transaction, current, mode);
    let allocations;
    try {
      allocations = await allocatePeriod(
        mode === "direct_shops"
          ? {
              amountJpy,
              allocationMode: mode,
              directAssignments: allocationContext.rows.map((row) => ({
                shopId: row.shopId,
                amountJpy: row.directAmountJpy ?? 0
              }))
            }
          : mode === "platform_income_proportional"
            ? {
                amountJpy,
                allocationMode: mode,
                shops: allocationContext.rows.map((row) => ({
                  shopId: row.shopId,
                  settledPlatformIncomeJpy: row.settledPlatformIncomeJpy ?? 0
                }))
              }
            : {
                amountJpy,
                allocationMode: mode,
                shops: allocationContext.rows.map((row) => ({ shopId: row.shopId }))
              }
      );
    } catch (error) {
      if (error instanceof RangeError) throw new OperatingCostAllocationInvalid();
      throw error;
    }

    for (const allocation of allocations) {
      const contextRow = allocationContext.rows.find((row) => row.shopId === allocation.shopId);
      if (!contextRow) throw new OperatingCostAllocationInvalid();
      await transaction.operatingCostAllocation.create({
        data: {
          operatingCostItemId: current.id,
          shopId: allocation.shopId,
          amountJpy: BigInt(allocation.amountJpy),
          allocationWeight: allocationWeight(
            mode,
            allocation.amountJpy,
            amountJpy,
            contextRow,
            allocationContext.totalBasisJpy
          ),
          calculationSnapshotJson: {
            schemaVersion: 1,
            allocationMode: mode,
            periodStart: current.periodStart.toISOString().slice(0, 10),
            periodEnd: current.periodEnd.toISOString().slice(0, 10),
            costAmountJpy: amountJpy,
            allocatedAmountJpy: allocation.amountJpy,
            settledPlatformIncomeJpy: contextRow.settledPlatformIncomeJpy ?? null,
            directAmountJpy: contextRow.directAmountJpy ?? null,
            directShareBps: contextRow.directShareBps ?? null,
            shopPublicIdAtPublication: contextRow.shopPublicId,
            shopNameAtPublication: contextRow.shopName,
            totalBasisJpy: allocationContext.totalBasisJpy,
            remainderPolicy: "shop_numeric_id_ascending"
          }
        }
      });
    }

    const publishedAt = new Date();
    const published = await transaction.operatingCostItem.update({
      where: { id: current.id },
      data: { status: "PUBLISHED", publishedAt },
      select: itemSelect
    });
    await this.writeAudit(transaction, input.audit, current.id, {
      previous: this.auditSnapshot(current),
      next: this.auditSnapshot(published),
      allocationCount: allocations.length,
      allocatedTotalJpy: allocations.reduce((sum, row) => sum + row.amountJpy, 0),
      basisFormula:
        mode === "platform_income_proportional"
          ? "settled_order_platform_fees_at_order_rate_plus_confirmed_saas_fees"
          : null,
      reason: input.reason
    });
    return { outcome: "published", item: this.mapItem(published) };
  }

  private configurationData(input: OperatingCostConfigurationInput) {
    return {
      categoryCode: input.categoryCode,
      name: input.name,
      amountJpy: BigInt(input.amountJpy),
      currency: "JPY",
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      allocationMode: modeToRecord(input.allocationMode),
      status: "DRAFT" as const,
      effectiveAt: input.effectiveAt,
      publishedAt: null,
      reason: input.reason,
      configurationSnapshotJson: {
        schemaVersion: 1,
        directAssignments: input.directAssignments ?? null
      } as Prisma.InputJsonValue
    };
  }

  private async lockItem(
    transaction: Prisma.TransactionClient,
    publicId: string
  ): Promise<{ id: number } | null> {
    const rows = await transaction.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM operating_cost_items WHERE public_id = ${publicId} AND deleted_at IS NULL FOR UPDATE`
    );
    if (rows.length > 1) throw new OperatingCostConflict();
    return rows[0] ?? null;
  }

  private async resolveAllocationContext(
    transaction: Prisma.TransactionClient,
    item: StoredItem,
    mode: OperatingCostAllocationMode
  ): Promise<{
    rows: Array<{
      shopId: number;
      shopPublicId: string;
      shopName: string;
      settledPlatformIncomeJpy?: number;
      directAmountJpy?: number;
      directShareBps?: number;
    }>;
    totalBasisJpy: number | null;
  }> {
    if (mode === "equal_active_shops") {
      const shops = await transaction.shop.findMany({
        where: { status: "published", deletedAt: null },
        orderBy: { id: "asc" },
        select: {
          id: true,
          name: true,
          publicIdentifier: {
            select: { publicId: true, kind: true, status: true, deletedAt: true }
          }
        }
      });
      if (
        shops.some(
          (shop) =>
            !shop.publicIdentifier ||
            shop.publicIdentifier.kind !== "SHOP" ||
            shop.publicIdentifier.status !== "ACTIVE" ||
            shop.publicIdentifier.deletedAt !== null
        )
      ) {
        throw new OperatingCostShopNotFound();
      }
      return {
        rows: shops.map((shop) => ({
          shopId: shop.id,
          shopPublicId: shop.publicIdentifier?.publicId ?? "",
          shopName: shop.name
        })),
        totalBasisJpy: null
      };
    }
    if (mode === "platform_income_proportional") {
      const periodEndExclusive = new Date(item.periodEnd.getTime() + 86_400_000);
      const rows = await transaction.$queryRaw<IncomeBasisRow[]>(Prisma.sql`
        /* operating_cost_settled_platform_income_basis */
        WITH settled_order_income AS (
          SELECT financial.shop_id,
            SUM(FLOOR(CAST(financial.b_platform_fee_actual_ndp + financial.c_request_fee_actual_ndp AS DECIMAL(65, 0))
              * rate.jpy_units / rate.ndp_units)) AS amount_jpy
          FROM order_financials AS financial
          INNER JOIN booking_orders AS booking
            ON booking.id = financial.booking_order_id
            AND booking.shop_id = financial.shop_id
            AND booking.status = ${"completed"}
            AND booking.payment_status = ${"confirmed"}
            AND booking.payment_confirmed_at >= ${item.periodStart}
            AND booking.payment_confirmed_at < ${periodEndExclusive}
            AND booking.payment_confirmed_by_id IS NOT NULL
            AND booking.payment_refunded_at IS NULL
            AND booking.payment_refunded_by_id IS NULL
            AND booking.payment_refund_reference IS NULL
            AND booking.payment_refund_reason IS NULL
            AND booking.deleted_at IS NULL
          INNER JOIN order_checkouts AS checkout
            ON checkout.booking_order_id = booking.id AND checkout.deleted_at IS NULL
          INNER JOIN ndp_exchange_rate_rules AS rate
            ON rate.id = checkout.ndp_rate_rule_id
            AND rate.ndp_units > 0 AND rate.jpy_units > 0
            AND rate.deleted_at IS NULL
          WHERE financial.ndp_currency = ${"NDP"}
            AND financial.settlement_status = ${"settled"}
            AND financial.b_platform_fee_actual_ndp >= 0
            AND financial.c_request_fee_actual_ndp >= 0
            AND financial.deleted_at IS NULL
          GROUP BY financial.shop_id
        ),
        settled_saas_income AS (
          SELECT COALESCE(line.shop_id, invoice.shop_id) AS shop_id,
            SUM(CAST(line.amount_jpy AS DECIMAL(65, 0))) AS amount_jpy
          FROM saas_invoice_lines AS line
          INNER JOIN saas_invoices AS invoice
            ON invoice.id = line.invoice_id
            AND invoice.status = ${"paid"}
            AND invoice.deleted_at IS NULL
          WHERE COALESCE(line.shop_id, invoice.shop_id) IS NOT NULL
            AND line.amount_jpy >= 0
            AND line.deleted_at IS NULL
            AND EXISTS (
              SELECT 1 FROM saas_payments AS payment
              WHERE payment.invoice_id = invoice.id
                AND payment.status = ${"confirmed"}
                AND payment.amount_jpy = invoice.amount_jpy
                AND payment.received_at >= ${item.periodStart}
                AND payment.received_at < ${periodEndExclusive}
                AND payment.deleted_at IS NULL
            )
          GROUP BY COALESCE(line.shop_id, invoice.shop_id)
        )
        SELECT shop.id AS shopId,
          CAST(COALESCE(order_income.amount_jpy, 0) + COALESCE(saas_income.amount_jpy, 0)
            AS DECIMAL(65, 0)) AS settledPlatformIncomeJpy
        FROM shops AS shop
        LEFT JOIN settled_order_income AS order_income ON order_income.shop_id = shop.id
        LEFT JOIN settled_saas_income AS saas_income ON saas_income.shop_id = shop.id
        WHERE shop.status = ${"published"} AND shop.deleted_at IS NULL
          AND COALESCE(order_income.amount_jpy, 0) + COALESCE(saas_income.amount_jpy, 0) > 0
        ORDER BY shop.id ASC
      `);
      const mapped = rows.map((row) => ({
        shopId: toSafeId(row.shopId ?? row.shop_id),
        settledPlatformIncomeJpy: toSafeAggregate(
          row.settledPlatformIncomeJpy ?? row.settled_platform_income_jpy
        )
      }));
      const totalBasisJpy = mapped.reduce((sum, row) => sum + row.settledPlatformIncomeJpy, 0);
      if (!Number.isSafeInteger(totalBasisJpy)) throw new OperatingCostAllocationInvalid();
      const shops = await transaction.shop.findMany({
        where: { id: { in: mapped.map((row) => row.shopId) }, deletedAt: null },
        select: {
          id: true,
          name: true,
          publicIdentifier: {
            select: { publicId: true, kind: true, status: true, deletedAt: true }
          }
        }
      });
      const shopById = new Map(shops.map((shop) => [shop.id, shop]));
      if (
        shops.length !== mapped.length ||
        shops.some(
          (shop) =>
            !shop.publicIdentifier ||
            shop.publicIdentifier.kind !== "SHOP" ||
            shop.publicIdentifier.status !== "ACTIVE" ||
            shop.publicIdentifier.deletedAt !== null
        )
      ) {
        throw new OperatingCostShopNotFound();
      }
      return {
        rows: mapped.map((row) => {
          const shop = shopById.get(row.shopId);
          if (!shop?.publicIdentifier) throw new OperatingCostShopNotFound();
          return {
            ...row,
            shopPublicId: shop.publicIdentifier.publicId,
            shopName: shop.name
          };
        }),
        totalBasisJpy
      };
    }

    const assignments = readDirectAssignments(item.configurationSnapshotJson);
    if (!assignments?.length) throw new OperatingCostAllocationInvalid();
    const publicIds = assignments.map((assignment) => assignment.shopPublicId);
    const shops = await transaction.shop.findMany({
      where: {
        status: "published",
        deletedAt: null,
        publicIdentifier: {
          is: {
            publicId: { in: publicIds },
            kind: "SHOP",
            status: "ACTIVE",
            deletedAt: null
          }
        }
      },
      select: { id: true, name: true, publicIdentifier: { select: { publicId: true } } }
    });
    if (shops.length !== assignments.length) throw new OperatingCostShopNotFound();
    const byPublicId = new Map(
      shops.map((shop) => [shop.publicIdentifier?.publicId, shop.id] as const)
    );
    const usesShares = assignments.every((assignment) => assignment.shareBps !== undefined);
    let rows = assignments.map((assignment) => ({
      shopId: byPublicId.get(assignment.shopPublicId) ?? 0,
      shopPublicId: assignment.shopPublicId,
      shopName:
        shops.find((shop) => shop.publicIdentifier?.publicId === assignment.shopPublicId)?.name ??
        "",
      directAmountJpy: assignment.amountJpy,
      directShareBps: assignment.shareBps
    }));
    if (rows.some((row) => row.shopId <= 0)) throw new OperatingCostShopNotFound();
    if (usesShares) {
      const shareAllocations = allocateByBasis(
        toSafeJpy(item.amountJpy),
        rows.map((row) => ({ shopId: row.shopId, basis: row.directShareBps ?? 0 })),
        10_000
      );
      const amountByShop = new Map(shareAllocations.map((row) => [row.shopId, row.amountJpy]));
      rows = rows.map((row) => ({ ...row, directAmountJpy: amountByShop.get(row.shopId) ?? 0 }));
    }
    rows.sort((left, right) => left.shopId - right.shopId);
    return { rows, totalBasisJpy: null };
  }

  private async writeAudit(
    transaction: Prisma.TransactionClient,
    input: AuditLogCreateInput,
    targetId: number,
    metadata: Record<string, unknown>
  ): Promise<void> {
    const base = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
    await transaction.auditLog.create({
      data: toAuditLogCreateData({ ...input, targetId, metadata: { ...base, ...metadata } })
    });
  }

  private auditSnapshot(item: StoredItem): Record<string, unknown> {
    return {
      publicId: item.publicId,
      costCode: item.costCode,
      version: item.version,
      categoryCode: item.categoryCode,
      name: item.name,
      amountJpy: toSafeJpy(item.amountJpy),
      currency: item.currency,
      periodStart: item.periodStart.toISOString().slice(0, 10),
      periodEnd: item.periodEnd.toISOString().slice(0, 10),
      allocationMode: modeFromRecord(item.allocationMode),
      status: item.status.toLowerCase(),
      effectiveAt: item.effectiveAt.toISOString(),
      publishedAt: item.publishedAt?.toISOString() ?? null,
      directAssignments: readDirectAssignments(item.configurationSnapshotJson)
    };
  }

  private mapItem(item: StoredItem): OperatingCostItemRecord {
    return {
      id: item.id,
      publicId: item.publicId,
      costCode: item.costCode,
      version: item.version,
      categoryCode: categoryFromRecord(item.categoryCode),
      name: item.name,
      amountJpy: toSafeJpy(item.amountJpy),
      currency: currencyFromRecord(item.currency),
      periodStart: item.periodStart,
      periodEnd: item.periodEnd,
      allocationMode: modeFromRecord(item.allocationMode),
      status: statusFromRecord(item.status),
      effectiveAt: item.effectiveAt,
      publishedAt: item.publishedAt,
      configuredById: item.configuredById,
      reason: item.reason,
      directAssignments: readDirectAssignments(item.configurationSnapshotJson),
      allocations: item.allocations.map((allocation) => {
        const identifier = allocation.shop.publicIdentifier;
        const snapshotIdentity = readAllocationIdentity(allocation.calculationSnapshotJson);
        if (!snapshotIdentity && (!identifier || identifier.deletedAt !== null)) {
          throw new Error("error.operating_cost.shop_public_identifier_missing");
        }
        return {
          shopPublicId: snapshotIdentity?.shopPublicId ?? identifier?.publicId ?? "",
          shopName: snapshotIdentity?.shopName ?? allocation.shop.name,
          amountJpy: toSafeJpy(allocation.amountJpy),
          allocationWeight: allocation.allocationWeight?.toFixed(8) ?? null
        };
      }),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    };
  }
}

const modeToRecord = (mode: OperatingCostAllocationMode) => {
  if (mode === "equal_active_shops") return "EQUAL_ACTIVE_SHOPS" as const;
  if (mode === "platform_income_proportional") return "PLATFORM_INCOME_PROPORTIONAL" as const;
  return "DIRECT_SHOPS" as const;
};
const modeFromRecord = (
  mode: "EQUAL_ACTIVE_SHOPS" | "PLATFORM_INCOME_PROPORTIONAL" | "DIRECT_SHOPS"
): OperatingCostAllocationMode => {
  if (mode === "EQUAL_ACTIVE_SHOPS") return "equal_active_shops";
  if (mode === "PLATFORM_INCOME_PROPORTIONAL") return "platform_income_proportional";
  return "direct_shops";
};
const statusToRecord = (status: OperatingCostStatus) =>
  status.toUpperCase() as "DRAFT" | "PUBLISHED" | "ARCHIVED";
const statusFromRecord = (status: "DRAFT" | "PUBLISHED" | "ARCHIVED") =>
  status.toLowerCase() as OperatingCostStatus;
const categoryFromRecord = (category: string): OperatingCostCategory => {
  if (["personnel", "server", "third_party_api", "other"].includes(category)) {
    return category as OperatingCostCategory;
  }
  throw new Error("error.operating_cost.invalid_category");
};
const currencyFromRecord = (currency: string): "JPY" => {
  if (currency !== "JPY") throw new Error("error.operating_cost.invalid_currency");
  return "JPY";
};
const toSafeJpy = (value: bigint): number => {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("error.operating_cost.unsafe_amount");
  }
  return Number(value);
};
const toSafeId = (value: number | undefined): number => {
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) throw new OperatingCostAllocationInvalid();
  return value as number;
};
const toSafeAggregate = (value: bigint | Prisma.Decimal | number | string | undefined): number => {
  if (value === undefined) throw new OperatingCostAllocationInvalid();
  const text = value.toString();
  if (!/^\d+$/.test(text)) throw new OperatingCostAllocationInvalid();
  const parsed = BigInt(text);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) throw new OperatingCostAllocationInvalid();
  return Number(parsed);
};

const readDirectAssignments = (
  value: Prisma.JsonValue | null
): DirectAssignmentConfiguration[] | null => {
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value))
    throw new Error("error.operating_cost.invalid_snapshot");
  const assignments = value.directAssignments;
  if (assignments === null || assignments === undefined) return null;
  if (!Array.isArray(assignments)) throw new Error("error.operating_cost.invalid_snapshot");
  const parsed = assignments.map((assignment) => {
    if (!assignment || typeof assignment !== "object" || Array.isArray(assignment)) {
      throw new Error("error.operating_cost.invalid_snapshot");
    }
    const shopPublicId = assignment.shopPublicId;
    const amountJpy = assignment.amountJpy;
    const shareBps = assignment.shareBps;
    if (typeof shopPublicId !== "string") throw new Error("error.operating_cost.invalid_snapshot");
    if (typeof amountJpy === "number" && shareBps === undefined) {
      return { shopPublicId, amountJpy } as DirectAssignmentConfiguration;
    }
    if (typeof shareBps === "number" && amountJpy === undefined) {
      return { shopPublicId, shareBps } as DirectAssignmentConfiguration;
    }
    throw new Error("error.operating_cost.invalid_snapshot");
  });
  return parsed;
};

const readAllocationIdentity = (
  value: Prisma.JsonValue
): { shopPublicId: string; shopName: string } | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return typeof value.shopPublicIdAtPublication === "string" &&
    typeof value.shopNameAtPublication === "string"
    ? {
        shopPublicId: value.shopPublicIdAtPublication,
        shopName: value.shopNameAtPublication
      }
    : null;
};

const allocateByBasis = (
  amountJpy: number,
  rows: Array<{ shopId: number; basis: number }>,
  expectedBasis: number
): Array<{ shopId: number; amountJpy: number }> => {
  const sorted = [...rows].sort((left, right) => left.shopId - right.shopId);
  const total = sorted.reduce((sum, row) => sum + row.basis, 0);
  if (total !== expectedBasis || total <= 0) throw new OperatingCostAllocationInvalid();
  const amount = BigInt(amountJpy);
  const denominator = BigInt(total);
  const allocations = sorted.map((row) => ({
    shopId: row.shopId,
    amountJpy: Number((amount * BigInt(row.basis)) / denominator)
  }));
  let remainder = amount - allocations.reduce((sum, row) => sum + BigInt(row.amountJpy), 0n);
  for (const row of allocations) {
    if (remainder === 0n) break;
    row.amountJpy += 1;
    remainder -= 1n;
  }
  return allocations;
};

const allocationWeight = (
  mode: OperatingCostAllocationMode,
  allocatedAmountJpy: number,
  totalAmountJpy: number,
  row: { settledPlatformIncomeJpy?: number; directShareBps?: number },
  totalBasisJpy: number | null
): Prisma.Decimal | null => {
  if (mode === "platform_income_proportional") {
    return ratioDecimal(row.settledPlatformIncomeJpy ?? 0, totalBasisJpy ?? 0);
  }
  if (mode === "direct_shops" && row.directShareBps !== undefined) {
    return ratioDecimal(row.directShareBps, 10_000);
  }
  return ratioDecimal(allocatedAmountJpy, totalAmountJpy);
};
const ratioDecimal = (numerator: number, denominator: number): Prisma.Decimal | null => {
  if (denominator === 0) return numerator === 0 ? new Prisma.Decimal("0") : null;
  const scaled = (BigInt(numerator) * 100_000_000n) / BigInt(denominator);
  const digits = scaled.toString().padStart(9, "0");
  return new Prisma.Decimal(`${digits.slice(0, -8)}.${digits.slice(-8)}`);
};
const isConflictError = (error: unknown): boolean =>
  error instanceof OperatingCostConflict ||
  isRetryableTransactionConflict(error) ||
  Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
