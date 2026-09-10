import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import {
  EXCHANGE_REQUEST_FEE_FAMILY,
  EXCHANGE_REQUEST_FEE_TYPE,
  EXCHANGE_REQUEST_ORDER_TYPE,
  ExchangeRequestFeeConfigurationError,
  type ExchangeRequestFeeRepositoryPort,
  type ExchangeRequestFeeSnapshot,
  type ExchangeRequestFeeVersionCreateInput,
  type ExchangeRequestFeeVersionCreateResult,
  type ExchangeRequestPublicationCalculationInput
} from "../services/exchange-request-fee.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import { toAuditLogCreateData } from "./audit-log.repository";

type ExchangeRequestFeePrismaClient = PrismaClient | Prisma.TransactionClient;

interface RequestFeeRuleRecord {
  id: number;
  baseAmountNdp: number;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
}

interface RequestFeeRuleSetRecord {
  id: number;
  version: number;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  rules: RequestFeeRuleRecord[];
}

interface CurrentRequestFeeRuleSetRecord extends RequestFeeRuleSetRecord {
  name: string;
  description: string | null;
  scopeType: string;
  priority: number;
}

class ExchangeRequestFeeVersionConflictError extends Error {}

export class ExchangeRequestFeeRepository implements ExchangeRequestFeeRepositoryPort {
  public constructor(private readonly client: ExchangeRequestFeePrismaClient = prisma) {}

  public withTransactionClient(transactionClient: unknown): ExchangeRequestFeeRepositoryPort {
    return new ExchangeRequestFeeRepository(transactionClient as ExchangeRequestFeePrismaClient);
  }

  public async findCurrent(at: Date): Promise<ExchangeRequestFeeSnapshot | null> {
    const ruleWhere = this.ruleWhere(at);
    const records = await this.client.platformFeeRuleSet.findMany({
      where: {
        familyCode: EXCHANGE_REQUEST_FEE_FAMILY,
        status: "active",
        deletedAt: null,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
        rules: { some: ruleWhere }
      },
      orderBy: [{ version: "desc" }, { id: "desc" }],
      take: 2,
      select: this.snapshotSelect(ruleWhere)
    });

    if (records.length !== 1) return null;
    return this.mapSnapshotOrNull(records[0] as RequestFeeRuleSetRecord);
  }

  public async listVersions(
    input: PaginationInput
  ): Promise<PaginatedResponse<ExchangeRequestFeeSnapshot>> {
    const pagination = toPrismaPagination(input);
    const ruleWhere = this.ruleWhere();
    const where: Prisma.PlatformFeeRuleSetWhereInput = {
      familyCode: EXCHANGE_REQUEST_FEE_FAMILY,
      status: "active",
      deletedAt: null,
      rules: { some: ruleWhere }
    };
    const [records, total] = await Promise.all([
      this.client.platformFeeRuleSet.findMany({
        where,
        orderBy: [{ version: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take,
        select: this.snapshotSelect(ruleWhere)
      }),
      this.client.platformFeeRuleSet.count({ where })
    ]);
    const list = records.map((record) => {
      const snapshot = this.mapSnapshotOrNull(record as RequestFeeRuleSetRecord);
      if (!snapshot) throw new ExchangeRequestFeeConfigurationError();
      return snapshot;
    });

    return buildPaginatedResponse(list, total, input);
  }

  public async createVersion(
    input: ExchangeRequestFeeVersionCreateInput
  ): Promise<ExchangeRequestFeeVersionCreateResult> {
    try {
      const mutate = async (
        transaction: ExchangeRequestFeePrismaClient
      ): Promise<ExchangeRequestFeeVersionCreateResult> => {
        const ruleWhere = this.ruleWhere();
        const current = await transaction.platformFeeRuleSet.findFirst({
          where: {
            familyCode: EXCHANGE_REQUEST_FEE_FAMILY,
            status: "active",
            effectiveTo: null,
            deletedAt: null
          },
          orderBy: [{ version: "desc" }, { id: "desc" }],
          select: {
            ...this.snapshotSelect(ruleWhere),
            name: true,
            description: true,
            scopeType: true,
            priority: true
          }
        });
        const active = current as CurrentRequestFeeRuleSetRecord | null;
        if (
          !active ||
          active.version !== input.expectedCurrentVersion ||
          !active.effectiveFrom ||
          input.effectiveFrom <= active.effectiveFrom ||
          active.rules.length !== 1 ||
          !this.validAmount(active.rules[0]?.baseAmountNdp)
        ) {
          return { kind: "conflict" };
        }
        const currentRule = active.rules[0] as RequestFeeRuleRecord;

        const closedRuleSet = await transaction.platformFeeRuleSet.updateMany({
          where: {
            id: active.id,
            familyCode: EXCHANGE_REQUEST_FEE_FAMILY,
            version: input.expectedCurrentVersion,
            status: "active",
            effectiveTo: null,
            deletedAt: null
          },
          data: {
            effectiveTo: input.effectiveFrom,
            updatedById: input.actorUserId
          }
        });
        if (closedRuleSet.count !== 1) throw new ExchangeRequestFeeVersionConflictError();

        const closedRule = await transaction.platformFeeRule.updateMany({
          where: {
            id: currentRule.id,
            ruleSetId: active.id,
            feeType: EXCHANGE_REQUEST_FEE_TYPE,
            orderType: EXCHANGE_REQUEST_ORDER_TYPE,
            status: "active",
            effectiveTo: null,
            deletedAt: null
          },
          data: {
            effectiveTo: input.effectiveFrom,
            updatedById: input.actorUserId
          }
        });
        if (closedRule.count !== 1) throw new ExchangeRequestFeeVersionConflictError();

        const nextVersion = input.expectedCurrentVersion + 1;
        const createdRuleSet = await transaction.platformFeeRuleSet.create({
          data: {
            name: active.name,
            description: active.description,
            scopeType: active.scopeType,
            familyCode: EXCHANGE_REQUEST_FEE_FAMILY,
            priority: active.priority,
            status: "active",
            version: nextVersion,
            effectiveFrom: input.effectiveFrom,
            effectiveTo: null,
            createdById: input.actorUserId,
            updatedById: input.actorUserId
          },
          select: {
            id: true,
            version: true,
            effectiveFrom: true,
            effectiveTo: true
          }
        });
        const createdRule = await transaction.platformFeeRule.create({
          data: {
            ruleSetId: createdRuleSet.id,
            feeType: EXCHANGE_REQUEST_FEE_TYPE,
            orderType: EXCHANGE_REQUEST_ORDER_TYPE,
            payerType: "publisher",
            baseAmountNdp: input.amountNdp,
            calculationMode: "fixed",
            holdStrategy: "exact_estimate",
            pricingLockMode: "lock_at_publish",
            stackingMode: "sum",
            priority: 100,
            status: "active",
            effectiveFrom: input.effectiveFrom,
            effectiveTo: null,
            createdById: input.actorUserId,
            updatedById: input.actorUserId
          },
          select: { id: true, baseAmountNdp: true }
        });

        await transaction.auditLog.create({
          data: toAuditLogCreateData({
            ...input.audit,
            action: "exchange.request_fee.version.create",
            targetType: "platform_fee_rule_set",
            targetId: createdRuleSet.id,
            metadata: {
              amountNdp: createdRule.baseAmountNdp,
              version: createdRuleSet.version
            }
          })
        });

        return {
          kind: "success",
          value: {
            ruleSetId: createdRuleSet.id,
            ruleSetVersion: createdRuleSet.version,
            ruleId: createdRule.id,
            amountNdp: createdRule.baseAmountNdp,
            effectiveFrom: createdRuleSet.effectiveFrom,
            effectiveTo: createdRuleSet.effectiveTo
          }
        };
      };

      return this.canStartTransaction(this.client)
        ? await this.client.$transaction((transaction) => mutate(transaction))
        : await mutate(this.client);
    } catch (error) {
      if (error instanceof ExchangeRequestFeeVersionConflictError) {
        return { kind: "conflict" };
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { kind: "conflict" };
      }
      throw error;
    }
  }

  public async recordPublicationCalculation(
    input: ExchangeRequestPublicationCalculationInput
  ): Promise<number> {
    const log = await this.client.feeCalculationLog.create({
      data: {
        bookingOrderId: null,
        exchangePostId: input.exchangePostId,
        calculationStage: "request_publication",
        feeType: EXCHANGE_REQUEST_FEE_TYPE,
        payerType: input.payerType,
        payerId: input.payerId,
        baseFeeNdp: input.fee.amountNdp,
        tierAdjustmentNdp: 0,
        timeAdjustmentNdp: 0,
        campaignDiscountNdp: 0,
        finalFeeNdp: input.fee.amountNdp,
        holdAmountNdp: input.fee.amountNdp,
        appliedRuleIdsJson: [input.fee.ruleId] as Prisma.InputJsonValue,
        explanationJson: {
          familyCode: EXCHANGE_REQUEST_FEE_FAMILY,
          ruleSetId: input.fee.ruleSetId,
          ruleSetVersion: input.fee.ruleSetVersion,
          pricingLockMode: "lock_at_publish"
        },
        calculatedAt: input.calculatedAt
      },
      select: { id: true }
    });
    return log.id;
  }

  private snapshotSelect(ruleWhere: Prisma.PlatformFeeRuleWhereInput) {
    return {
      id: true,
      version: true,
      effectiveFrom: true,
      effectiveTo: true,
      rules: {
        where: ruleWhere,
        orderBy: [{ priority: "asc" as const }, { id: "asc" as const }],
        take: 2,
        select: { id: true, baseAmountNdp: true, effectiveFrom: true, effectiveTo: true }
      }
    } satisfies Prisma.PlatformFeeRuleSetSelect;
  }

  private ruleWhere(at?: Date): Prisma.PlatformFeeRuleWhereInput {
    const effectiveBounds: Prisma.PlatformFeeRuleWhereInput[] = at
      ? [
          { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: at } }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }] }
        ]
      : [];
    return {
      feeType: EXCHANGE_REQUEST_FEE_TYPE,
      orderType: EXCHANGE_REQUEST_ORDER_TYPE,
      calculationMode: "fixed",
      pricingLockMode: "lock_at_publish",
      status: "active",
      deletedAt: null,
      ...(effectiveBounds.length > 0 ? { AND: effectiveBounds } : {})
    };
  }

  private mapSnapshotOrNull(record: RequestFeeRuleSetRecord): ExchangeRequestFeeSnapshot | null {
    if (record.rules.length !== 1) return null;
    const rule = record.rules[0];
    if (!rule || !this.validAmount(rule.baseAmountNdp)) return null;
    return {
      ruleSetId: record.id,
      ruleSetVersion: record.version,
      ruleId: rule.id,
      amountNdp: rule.baseAmountNdp,
      effectiveFrom: record.effectiveFrom,
      effectiveTo: record.effectiveTo
    };
  }

  private validAmount(value: number | undefined): boolean {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  }

  private canStartTransaction(client: ExchangeRequestFeePrismaClient): client is PrismaClient {
    return "$transaction" in client && typeof client.$transaction === "function";
  }
}
