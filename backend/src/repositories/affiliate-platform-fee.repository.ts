import {
  AffiliatePlatformFeeScopeType as PrismaAffiliatePlatformFeeScopeType,
  Prisma,
  type PrismaClient
} from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  AffiliatePlatformFeeRepositoryPort,
  AffiliatePlatformFeeRuleListInput,
  AffiliatePlatformFeeRuleMutationInput,
  AffiliatePlatformFeeRuleMutationResult,
  AffiliatePlatformFeeRuleRecord,
  AffiliatePlatformFeeRuleSummary,
  AffiliatePlatformFeeShopOption,
  AffiliatePlatformFeeShopOptionInput
} from "../services/affiliate-platform-fee.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import { toAuditLogCreateData } from "./audit-log.repository";

const ruleSelect = {
  id: true,
  scopeType: true,
  scopeKey: true,
  shopId: true,
  feeBps: true,
  version: true,
  effectiveFrom: true,
  effectiveTo: true,
  activeKey: true,
  reason: true,
  createdAt: true,
  updatedAt: true,
  shop: { select: { name: true, city: true } },
  createdBy: { select: { needoId: true } },
  updatedBy: { select: { needoId: true } }
} satisfies Prisma.AffiliatePlatformFeeRuleSelect;

type RuleRecord = Prisma.AffiliatePlatformFeeRuleGetPayload<{ select: typeof ruleSelect }>;
type AffiliatePlatformFeePrismaClient = PrismaClient | Prisma.TransactionClient;

export class AffiliatePlatformFeeRepository implements AffiliatePlatformFeeRepositoryPort {
  public constructor(private readonly client: AffiliatePlatformFeePrismaClient = prisma) {}

  public withTransactionClient(transactionClient: unknown): AffiliatePlatformFeeRepositoryPort {
    return new AffiliatePlatformFeeRepository(
      transactionClient as AffiliatePlatformFeePrismaClient
    );
  }

  public async findActiveShopIds(shopIds: number[]): Promise<number[]> {
    const shops = await this.client.shop.findMany({
      where: { id: { in: shopIds }, status: "published", deletedAt: null },
      select: { id: true },
      orderBy: { id: "asc" }
    });
    return shops.map((shop) => shop.id);
  }

  public async findEffectiveRules(
    shopIds: number[],
    effectiveAt: Date
  ): Promise<AffiliatePlatformFeeRuleRecord[]> {
    const rules = await this.client.affiliatePlatformFeeRule.findMany({
      where: {
        deletedAt: null,
        effectiveFrom: { lte: effectiveAt },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveAt } }],
        AND: [
          {
            OR: [
              { scopeType: PrismaAffiliatePlatformFeeScopeType.GLOBAL },
              {
                scopeType: PrismaAffiliatePlatformFeeScopeType.SHOP,
                shopId: { in: shopIds }
              }
            ]
          }
        ]
      },
      orderBy: [{ scopeType: "asc" }, { shopId: "asc" }, { version: "desc" }],
      select: ruleSelect
    });
    return rules.map((rule) => this.mapRule(rule));
  }

  public async listRules(
    input: AffiliatePlatformFeeRuleListInput
  ): Promise<ReturnType<typeof buildPaginatedResponse<AffiliatePlatformFeeRuleRecord>>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.AffiliatePlatformFeeRuleWhereInput = {
      deletedAt: null,
      ...(input.scopeType
        ? {
            scopeType:
              input.scopeType === "global"
                ? PrismaAffiliatePlatformFeeScopeType.GLOBAL
                : PrismaAffiliatePlatformFeeScopeType.SHOP
          }
        : {}),
      ...(input.shopId !== undefined ? { shopId: input.shopId } : {})
    };
    const [rules, total] = await Promise.all([
      this.client.affiliatePlatformFeeRule.findMany({
        where,
        orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take,
        select: ruleSelect
      }),
      this.client.affiliatePlatformFeeRule.count({ where })
    ]);
    return buildPaginatedResponse(
      rules.map((rule) => this.mapRule(rule)),
      total,
      pagination
    );
  }

  public async getGlobalSummary(
    evaluatedAt: Date
  ): Promise<AffiliatePlatformFeeRuleSummary> {
    const baseWhere = { scopeKey: "global", deletedAt: null } as const;
    const [current, nextScheduled, latest] = await Promise.all([
      this.client.affiliatePlatformFeeRule.findFirst({
        where: {
          ...baseWhere,
          effectiveFrom: { lte: evaluatedAt },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: evaluatedAt } }]
        },
        orderBy: [{ version: "desc" }, { id: "desc" }],
        select: ruleSelect
      }),
      this.client.affiliatePlatformFeeRule.findFirst({
        where: { ...baseWhere, effectiveFrom: { gt: evaluatedAt } },
        orderBy: [{ effectiveFrom: "asc" }, { version: "asc" }],
        select: ruleSelect
      }),
      this.client.affiliatePlatformFeeRule.findFirst({
        where: baseWhere,
        orderBy: [{ version: "desc" }, { id: "desc" }],
        select: ruleSelect
      })
    ]);

    return {
      evaluatedAt,
      current: current ? this.mapRule(current) : null,
      nextScheduled: nextScheduled ? this.mapRule(nextScheduled) : null,
      latestVersion: latest?.version ?? 0
    };
  }

  public async listEligibleShops(
    input: AffiliatePlatformFeeShopOptionInput
  ): Promise<ReturnType<typeof buildPaginatedResponse<AffiliatePlatformFeeShopOption>>> {
    const pagination = toPrismaPagination(input);
    const keyword = input.keyword?.trim();
    const numericId = keyword && /^\d+$/.test(keyword) ? Number(keyword) : null;
    const where: Prisma.ShopWhereInput = {
      deletedAt: null,
      status: "published",
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword } },
              ...(numericId && Number.isSafeInteger(numericId) && numericId > 0
                ? [{ id: numericId }]
                : [])
            ]
          }
        : {})
    };
    const [list, total] = await Promise.all([
      this.client.shop.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: pagination.skip,
        take: pagination.take,
        select: { id: true, name: true, city: true }
      }),
      this.client.shop.count({ where })
    ]);

    return buildPaginatedResponse(list, total, pagination);
  }

  public async createRuleVersion(
    input: AffiliatePlatformFeeRuleMutationInput
  ): Promise<AffiliatePlatformFeeRuleMutationResult> {
    try {
      const mutate = async (transaction: AffiliatePlatformFeePrismaClient) => {
        if (input.scopeType === "shop") {
          const shop = await transaction.shop.findFirst({
            where: { id: input.shopId as number, status: "published", deletedAt: null },
            select: { id: true }
          });
          if (!shop) return { kind: "shop_not_found" } as const;
        }

        const current = await transaction.affiliatePlatformFeeRule.findFirst({
          where: { scopeKey: input.scopeKey, effectiveTo: null, deletedAt: null },
          orderBy: { version: "desc" },
          select: ruleSelect
        });
        if ((current?.version ?? 0) !== input.expectedVersion) {
          return { kind: "version_conflict" } as const;
        }
        if (current && input.effectiveFrom <= current.effectiveFrom) {
          return { kind: "scope_conflict" } as const;
        }
        if (current) {
          const closed = await transaction.affiliatePlatformFeeRule.updateMany({
            where: {
              id: current.id,
              version: input.expectedVersion,
              effectiveTo: null,
              deletedAt: null
            },
            data: {
              activeKey: null,
              effectiveTo: input.effectiveFrom,
              updatedById: input.actorUserId
            }
          });
          if (closed.count !== 1) return { kind: "version_conflict" } as const;
        }

        const nextVersion = input.expectedVersion + 1;
        const created = await transaction.affiliatePlatformFeeRule.create({
          data: {
            scopeType:
              input.scopeType === "global"
                ? PrismaAffiliatePlatformFeeScopeType.GLOBAL
                : PrismaAffiliatePlatformFeeScopeType.SHOP,
            scopeKey: input.scopeKey,
            shopId: input.shopId,
            feeBps: input.feeBps,
            version: nextVersion,
            effectiveFrom: input.effectiveFrom,
            effectiveTo: null,
            activeKey: input.scopeKey,
            reason: input.reason,
            createdById: input.actorUserId,
            updatedById: input.actorUserId
          },
          select: ruleSelect
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
              previous: current ? { feeBps: current.feeBps, version: current.version } : null,
              next: { feeBps: created.feeBps, version: created.version }
            }
          })
        });

        return { kind: "created", value: this.mapRule(created) } as const;
      };
      return this.canStartTransaction(this.client)
        ? await this.client.$transaction((transaction) => mutate(transaction))
        : await mutate(this.client);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { kind: "version_conflict" };
      }
      throw error;
    }
  }

  private canStartTransaction(client: AffiliatePlatformFeePrismaClient): client is PrismaClient {
    return "$transaction" in client && typeof client.$transaction === "function";
  }

  private mapRule(rule: RuleRecord): AffiliatePlatformFeeRuleRecord {
    return {
      id: rule.id,
      scopeType: rule.scopeType === PrismaAffiliatePlatformFeeScopeType.GLOBAL ? "global" : "shop",
      scopeKey: rule.scopeKey,
      shopId: rule.shopId,
      shopName: rule.shop?.name ?? null,
      shopCity: rule.shop?.city ?? null,
      feeBps: rule.feeBps,
      version: rule.version,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo,
      activeKey: rule.activeKey,
      reason: rule.reason,
      createdByNeedoId: rule.createdBy?.needoId ?? null,
      updatedByNeedoId: rule.updatedBy?.needoId ?? null,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt
    };
  }
}
