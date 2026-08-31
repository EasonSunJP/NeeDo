import {
  NdpExchangeRateRuleStatus as PrismaNdpExchangeRateRuleStatus,
  Prisma,
  type PrismaClient
} from "@prisma/client";
import { prisma } from "../prisma/client";
import type { AuditLogCreateInput } from "./audit-log.repository";
import { toAuditLogCreateData } from "./audit-log.repository";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import {
  isRetryableTransactionConflict,
  runWithTransactionConflictRetry
} from "../utils/transaction-conflict-retry";

const ACTIVE_KEY = "ndp_exchange_rate";

const rateSelect = {
  id: true,
  publicId: true,
  version: true,
  ndpUnits: true,
  jpyUnits: true,
  status: true,
  effectiveFrom: true,
  effectiveTo: true,
  activeKey: true,
  idempotencyKey: true,
  reason: true,
  createdById: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.NdpExchangeRateRuleSelect;

type StoredRate = Prisma.NdpExchangeRateRuleGetPayload<{ select: typeof rateSelect }>;
type RateClient = PrismaClient | Prisma.TransactionClient;

export interface EffectiveNdpExchangeRate {
  ruleId: number;
  publicId: string;
  version: number;
  ndpUnits: number;
  jpyUnits: number;
  effectiveFrom: Date;
}

export interface NdpExchangeRateRecord extends EffectiveNdpExchangeRate {
  status: "active" | "superseded";
  effectiveTo: Date | null;
  reason: string;
  createdById: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NdpExchangeRateListInput {
  page?: number;
  pageSize?: number;
  at: Date;
}

export interface NdpExchangeRateOverview {
  current: NdpExchangeRateRecord | null;
  nextScheduled: NdpExchangeRateRecord | null;
  latestVersion: number;
  evaluatedAt: Date;
  history: ReturnType<typeof buildPaginatedResponse<NdpExchangeRateRecord>>;
}

export interface NdpExchangeRatePublishInput {
  ndpUnits: number;
  jpyUnits: number;
  expectedVersion: number;
  effectiveFrom: Date;
  reason: string;
  idempotencyKey: string;
  actorUserId: number;
  audit: AuditLogCreateInput;
}

export type NdpExchangeRatePublishResult =
  | { outcome: "published" | "replayed"; rate: NdpExchangeRateRecord }
  | { outcome: "conflict" | "idempotency_conflict" };

export interface NdpExchangeRateRepositoryPort {
  resolveEffectiveRate: (at: Date) => Promise<EffectiveNdpExchangeRate | null>;
  getOverview: (input: NdpExchangeRateListInput) => Promise<NdpExchangeRateOverview>;
  publish: (input: NdpExchangeRatePublishInput) => Promise<NdpExchangeRatePublishResult>;
}

class PublishConflict extends Error {}

export class NdpExchangeRateRepository implements NdpExchangeRateRepositoryPort {
  public constructor(private readonly client: RateClient = prisma) {}

  public async resolveEffectiveRate(at: Date): Promise<EffectiveNdpExchangeRate | null> {
    const rate = await this.client.ndpExchangeRateRule.findFirst({
      where: {
        deletedAt: null,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }]
      },
      orderBy: [{ version: "desc" }, { id: "desc" }],
      select: rateSelect
    });
    return rate ? this.mapEffective(rate) : null;
  }

  public async getOverview(input: NdpExchangeRateListInput): Promise<NdpExchangeRateOverview> {
    const pagination = toPrismaPagination(input);
    const where = { deletedAt: null } as const;
    const [current, nextScheduled, latest, history, total] = await Promise.all([
      this.client.ndpExchangeRateRule.findFirst({
        where: {
          ...where,
          effectiveFrom: { lte: input.at },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.at } }]
        },
        orderBy: [{ version: "desc" }, { id: "desc" }],
        select: rateSelect
      }),
      this.client.ndpExchangeRateRule.findFirst({
        where: { ...where, effectiveFrom: { gt: input.at } },
        orderBy: [{ effectiveFrom: "asc" }, { version: "asc" }, { id: "asc" }],
        select: rateSelect
      }),
      this.client.ndpExchangeRateRule.findFirst({
        where,
        orderBy: [{ version: "desc" }, { id: "desc" }],
        select: rateSelect
      }),
      this.client.ndpExchangeRateRule.findMany({
        where,
        orderBy: [{ version: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take,
        select: rateSelect
      }),
      this.client.ndpExchangeRateRule.count({ where })
    ]);

    return {
      current: current ? this.mapRecord(current) : null,
      nextScheduled: nextScheduled ? this.mapRecord(nextScheduled) : null,
      latestVersion: latest?.version ?? 0,
      evaluatedAt: input.at,
      history: buildPaginatedResponse(
        history.map((rate) => this.mapRecord(rate)),
        total,
        pagination
      )
    };
  }

  public async publish(
    input: NdpExchangeRatePublishInput
  ): Promise<NdpExchangeRatePublishResult> {
    try {
      if (!("$transaction" in this.client)) {
        throw new Error("error.ndp_exchange_rate.transaction_required");
      }
      return await runWithTransactionConflictRetry(() =>
        this.client.$transaction(async (transaction) => this.publishInTransaction(transaction, input))
      );
    } catch (error) {
      if (
        error instanceof PublishConflict ||
        this.isUniqueConflict(error) ||
        isRetryableTransactionConflict(error)
      ) {
        return { outcome: "conflict" };
      }
      throw error;
    }
  }

  private async publishInTransaction(
    transaction: Prisma.TransactionClient,
    input: NdpExchangeRatePublishInput
  ): Promise<NdpExchangeRatePublishResult> {
    await transaction.$queryRaw(
      Prisma.sql`SELECT id FROM ndp_exchange_rate_rules WHERE active_key = ${ACTIVE_KEY} AND deleted_at IS NULL FOR UPDATE`
    );
    const latest = await transaction.ndpExchangeRateRule.findFirst({
      where: {
        activeKey: ACTIVE_KEY,
        status: PrismaNdpExchangeRateRuleStatus.ACTIVE,
        deletedAt: null
      },
      orderBy: [{ version: "desc" }, { id: "desc" }],
      select: rateSelect
    });
    const existing = await transaction.ndpExchangeRateRule.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: rateSelect
    });
    if (existing) {
      return this.isEquivalentReplay(existing, input)
        ? { outcome: "replayed", rate: this.mapRecord(existing) }
        : { outcome: "idempotency_conflict" };
    }
    if (
      !latest ||
      latest.version !== input.expectedVersion ||
      input.effectiveFrom <= latest.effectiveFrom ||
      latest.effectiveTo !== null
    ) {
      return { outcome: "conflict" };
    }

    const closed = await transaction.ndpExchangeRateRule.updateMany({
      where: {
        id: latest.id,
        version: input.expectedVersion,
        status: PrismaNdpExchangeRateRuleStatus.ACTIVE,
        activeKey: ACTIVE_KEY,
        effectiveTo: null,
        deletedAt: null
      },
      data: {
        status: PrismaNdpExchangeRateRuleStatus.SUPERSEDED,
        effectiveTo: input.effectiveFrom,
        activeKey: null
      }
    });
    if (closed.count !== 1) throw new PublishConflict();

    const created = await transaction.ndpExchangeRateRule.create({
      data: {
        version: input.expectedVersion + 1,
        ndpUnits: input.ndpUnits,
        jpyUnits: input.jpyUnits,
        status: PrismaNdpExchangeRateRuleStatus.ACTIVE,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: null,
        activeKey: ACTIVE_KEY,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
        createdById: input.actorUserId
      },
      select: rateSelect
    });
    const baseMetadata =
      input.audit.metadata && typeof input.audit.metadata === "object"
        ? input.audit.metadata
        : {};
    await transaction.auditLog.create({
      data: toAuditLogCreateData({
        ...input.audit,
        targetId: created.id,
        metadata: {
          ...baseMetadata,
          previous: {
            version: latest.version,
            ndpUnits: latest.ndpUnits,
            jpyUnits: latest.jpyUnits
          },
          next: {
            version: created.version,
            ndpUnits: created.ndpUnits,
            jpyUnits: created.jpyUnits
          },
          effectiveFrom: created.effectiveFrom.toISOString(),
          reason: created.reason
        }
      })
    });
    return { outcome: "published", rate: this.mapRecord(created) };
  }

  private isEquivalentReplay(rate: StoredRate, input: NdpExchangeRatePublishInput): boolean {
    return (
      rate.createdById === input.actorUserId &&
      rate.version === input.expectedVersion + 1 &&
      rate.ndpUnits === input.ndpUnits &&
      rate.jpyUnits === input.jpyUnits &&
      rate.effectiveFrom.getTime() === input.effectiveFrom.getTime() &&
      rate.reason === input.reason
    );
  }

  private isUniqueConflict(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
  }

  private mapEffective(rate: StoredRate): EffectiveNdpExchangeRate {
    return {
      ruleId: rate.id,
      publicId: rate.publicId,
      version: rate.version,
      ndpUnits: rate.ndpUnits,
      jpyUnits: rate.jpyUnits,
      effectiveFrom: rate.effectiveFrom
    };
  }

  private mapRecord(rate: StoredRate): NdpExchangeRateRecord {
    return {
      ...this.mapEffective(rate),
      status:
        rate.status === PrismaNdpExchangeRateRuleStatus.ACTIVE ? "active" : "superseded",
      effectiveTo: rate.effectiveTo,
      reason: rate.reason,
      createdById: rate.createdById,
      createdAt: rate.createdAt,
      updatedAt: rate.updatedAt
    };
  }
}
