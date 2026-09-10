import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import { toAuditLogCreateData, type AuditLogCreateInput } from "./audit-log.repository";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import {
  isRetryableTransactionConflict,
  runWithTransactionConflictRetry
} from "../utils/transaction-conflict-retry";

export type AgentCommissionPaymentMethod = "bank_transfer" | "ndp" | "other";
export type AgentCommissionPaymentDetails = Record<string, string | number | boolean | null> | null;

export interface AgentCommissionRuleRecord {
  id: number;
  publicId: string;
  agentProfileId: number;
  version: number;
  fixedSuccessRewardJpy: number;
  profitShareRateBps: number;
  paymentMethod: AgentCommissionPaymentMethod;
  paymentDetails: AgentCommissionPaymentDetails;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  publishedAt: Date;
  publishedById: number;
  reason: string;
  createdAt: Date;
}

export interface AgentCommissionRuleListInput extends PaginationInput {
  agentPublicId: string;
  at: Date;
}

export interface AgentCommissionRuleOverview {
  current: AgentCommissionRuleRecord | null;
  latestVersion: number;
  evaluatedAt: Date;
  history: PaginatedResponse<AgentCommissionRuleRecord>;
}

export type AgentCommissionRuleOverviewResult =
  | { outcome: "found"; overview: AgentCommissionRuleOverview }
  | { outcome: "agent_not_found" };

export interface AgentCommissionRulePublishInput {
  agentPublicId: string;
  fixedSuccessRewardJpy: number;
  profitShareRateBps: number;
  paymentMethod: AgentCommissionPaymentMethod;
  paymentDetails: AgentCommissionPaymentDetails;
  effectiveFrom: Date;
  reason: string;
  actorUserId: number;
  audit: AuditLogCreateInput;
}

export type AgentCommissionRulePublishResult =
  | { outcome: "published"; rule: AgentCommissionRuleRecord }
  | { outcome: "agent_not_found" | "conflict" };

export interface AgentCommissionRuleRepositoryPort {
  getOverview: (input: AgentCommissionRuleListInput) => Promise<AgentCommissionRuleOverviewResult>;
  publish: (input: AgentCommissionRulePublishInput) => Promise<AgentCommissionRulePublishResult>;
}

const ruleSelect = {
  id: true,
  publicId: true,
  agentProfileId: true,
  version: true,
  fixedSuccessRewardJpy: true,
  profitShareRateBps: true,
  paymentMethod: true,
  paymentDetailsJson: true,
  effectiveFrom: true,
  effectiveTo: true,
  publishedAt: true,
  publishedById: true,
  reason: true,
  createdAt: true
} as const satisfies Prisma.AgentCommissionRuleVersionSelect;

type StoredRule = Prisma.AgentCommissionRuleVersionGetPayload<{ select: typeof ruleSelect }>;
type RuleClient = PrismaClient | Prisma.TransactionClient;
class RulePublishConflict extends Error {}

export class AgentCommissionRuleRepository implements AgentCommissionRuleRepositoryPort {
  public constructor(private readonly client: RuleClient = prisma) {}

  public async getOverview(
    input: AgentCommissionRuleListInput
  ): Promise<AgentCommissionRuleOverviewResult> {
    const agent = await this.client.platformPartnerProfile.findFirst({
      where: {
        publicId: input.agentPublicId,
        partnerType: "AGENT",
        deletedAt: null,
        user: { deletedAt: null, isActive: true }
      },
      select: { id: true }
    });
    if (!agent) return { outcome: "agent_not_found" };

    const pagination = toPrismaPagination(input);
    const where = { agentProfileId: agent.id, deletedAt: null } as const;
    const [current, latest, history, total] = await Promise.all([
      this.client.agentCommissionRuleVersion.findFirst({
        where: {
          ...where,
          effectiveFrom: { lte: input.at },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.at } }]
        },
        orderBy: [{ version: "desc" }, { id: "desc" }],
        select: ruleSelect
      }),
      this.client.agentCommissionRuleVersion.findFirst({
        where,
        orderBy: [{ version: "desc" }, { id: "desc" }],
        select: ruleSelect
      }),
      this.client.agentCommissionRuleVersion.findMany({
        where,
        orderBy: [{ version: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take,
        select: ruleSelect
      }),
      this.client.agentCommissionRuleVersion.count({ where })
    ]);

    return {
      outcome: "found",
      overview: {
        current: current ? this.mapRule(current) : null,
        latestVersion: latest?.version ?? 0,
        evaluatedAt: input.at,
        history: buildPaginatedResponse(
          history.map((record) => this.mapRule(record)),
          total,
          pagination
        )
      }
    };
  }

  public async publish(
    input: AgentCommissionRulePublishInput
  ): Promise<AgentCommissionRulePublishResult> {
    if (!("$transaction" in this.client)) {
      throw new Error("error.agent_commission_rule.transaction_required");
    }
    try {
      return await runWithTransactionConflictRetry(() =>
        this.client.$transaction((transaction) => this.publishInTransaction(transaction, input))
      );
    } catch (error) {
      if (
        error instanceof RulePublishConflict ||
        isUniqueConflict(error) ||
        isRetryableTransactionConflict(error)
      ) {
        return { outcome: "conflict" };
      }
      throw error;
    }
  }

  private async publishInTransaction(
    transaction: Prisma.TransactionClient,
    input: AgentCommissionRulePublishInput
  ): Promise<AgentCommissionRulePublishResult> {
    const locked = await transaction.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM platform_partner_profiles WHERE public_id = ${input.agentPublicId} AND partner_type = 'agent' AND deleted_at IS NULL FOR UPDATE`
    );
    if (locked.length !== 1) return { outcome: "agent_not_found" };

    const agent = await transaction.platformPartnerProfile.findFirst({
      where: {
        id: locked[0].id,
        publicId: input.agentPublicId,
        partnerType: "AGENT",
        deletedAt: null,
        user: { deletedAt: null, isActive: true }
      },
      select: { id: true }
    });
    if (!agent) return { outcome: "agent_not_found" };

    const latest = await transaction.agentCommissionRuleVersion.findFirst({
      where: { agentProfileId: agent.id, deletedAt: null },
      orderBy: [{ version: "desc" }, { id: "desc" }],
      select: ruleSelect
    });
    if (
      latest &&
      (latest.effectiveTo !== null ||
        input.effectiveFrom.getTime() <= latest.effectiveFrom.getTime())
    ) {
      return { outcome: "conflict" };
    }

    if (latest) {
      const closed = await transaction.agentCommissionRuleVersion.updateMany({
        where: {
          id: latest.id,
          version: latest.version,
          effectiveTo: null,
          deletedAt: null
        },
        data: { effectiveTo: input.effectiveFrom }
      });
      if (closed.count !== 1) throw new RulePublishConflict();
    }

    const created = await transaction.agentCommissionRuleVersion.create({
      data: {
        agentProfileId: agent.id,
        version: (latest?.version ?? 0) + 1,
        fixedSuccessRewardJpy: BigInt(input.fixedSuccessRewardJpy),
        profitShareRateBps: input.profitShareRateBps,
        paymentMethod: paymentMethodToRecord(input.paymentMethod),
        paymentDetailsJson:
          input.paymentDetails === null
            ? Prisma.DbNull
            : (input.paymentDetails as Prisma.InputJsonValue),
        effectiveFrom: input.effectiveFrom,
        effectiveTo: null,
        publishedById: input.actorUserId,
        reason: input.reason
      },
      select: ruleSelect
    });

    const baseMetadata =
      input.audit.metadata && typeof input.audit.metadata === "object" ? input.audit.metadata : {};
    await transaction.auditLog.create({
      data: toAuditLogCreateData({
        ...input.audit,
        targetId: created.id,
        metadata: {
          ...baseMetadata,
          previous: latest
            ? {
                version: latest.version,
                fixedSuccessRewardJpy: toSafeJpy(latest.fixedSuccessRewardJpy),
                profitShareRateBps: latest.profitShareRateBps,
                paymentMethod: paymentMethodFromRecord(latest.paymentMethod)
              }
            : null,
          next: {
            version: created.version,
            fixedSuccessRewardJpy: toSafeJpy(created.fixedSuccessRewardJpy),
            profitShareRateBps: created.profitShareRateBps,
            paymentMethod: paymentMethodFromRecord(created.paymentMethod)
          },
          effectiveFrom: created.effectiveFrom.toISOString(),
          reason: created.reason
        }
      })
    });

    return { outcome: "published", rule: this.mapRule(created) };
  }

  private mapRule(record: StoredRule): AgentCommissionRuleRecord {
    return {
      id: record.id,
      publicId: record.publicId,
      agentProfileId: record.agentProfileId,
      version: record.version,
      fixedSuccessRewardJpy: toSafeJpy(record.fixedSuccessRewardJpy),
      profitShareRateBps: record.profitShareRateBps,
      paymentMethod: paymentMethodFromRecord(record.paymentMethod),
      paymentDetails: toPaymentDetails(record.paymentDetailsJson),
      effectiveFrom: record.effectiveFrom,
      effectiveTo: record.effectiveTo,
      publishedAt: record.publishedAt,
      publishedById: record.publishedById,
      reason: record.reason,
      createdAt: record.createdAt
    };
  }
}

const paymentMethodToRecord = (method: AgentCommissionPaymentMethod) => {
  if (method === "bank_transfer") return "BANK_TRANSFER" as const;
  if (method === "ndp") return "NDP" as const;
  return "OTHER" as const;
};

const paymentMethodFromRecord = (
  method: "BANK_TRANSFER" | "NDP" | "OTHER"
): AgentCommissionPaymentMethod => {
  if (method === "BANK_TRANSFER") return "bank_transfer";
  if (method === "NDP") return "ndp";
  return "other";
};

const toSafeJpy = (value: bigint): number => {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("error.agent_commission_rule.unsafe_amount");
  }
  return Number(value);
};

const toPaymentDetails = (value: Prisma.JsonValue | null): AgentCommissionPaymentDetails => {
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("error.agent_commission_rule.invalid_payment_details");
  }
  return value as AgentCommissionPaymentDetails;
};

const isUniqueConflict = (error: unknown): boolean =>
  Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
