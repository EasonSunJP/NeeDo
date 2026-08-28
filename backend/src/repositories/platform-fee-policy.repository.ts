import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  GlobalAmountMutationInput,
  GlobalBookingPlatformFeePayload,
  PlatformFeePolicyRepositoryPort,
  PolicyMutationResult,
  ShopFeeEnabledMutationInput,
  ShopPlatformFeePayer,
  ShopPolicyIdentity,
  ShopPolicyListInput,
  ShopPolicyRecord,
  ShopPayerMutationInput
} from "../services/platform-fee-policy.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse } from "../utils/pagination";
import { toAuditLogCreateData } from "./audit-log.repository";

const fullRuleSetInclude = {
  rules: {
    where: { deletedAt: null },
    orderBy: [{ priority: "asc" as const }, { id: "asc" as const }],
    include: {
      tiers: {
        where: { deletedAt: null },
        orderBy: [{ minValue: "asc" as const }, { id: "asc" as const }]
      },
      timeWindows: {
        where: { deletedAt: null },
        orderBy: { id: "asc" as const }
      }
    }
  }
};

const shopIdentitySelect = {
  id: true,
  name: true,
  publicIdentifier: {
    select: { publicId: true, status: true, deletedAt: true }
  }
};

type FullRuleSetRecord = Prisma.PlatformFeeRuleSetGetPayload<{
  include: typeof fullRuleSetInclude;
}>;
type ShopIdentityRecord = Prisma.ShopGetPayload<{ select: typeof shopIdentitySelect }>;
type ShopPolicyRecordWithShop = Prisma.ShopPlatformFeePolicyGetPayload<{
  include: { shop: { select: typeof shopIdentitySelect } };
}>;
type PolicyClient = PrismaClient | Prisma.TransactionClient;

export class PlatformFeePolicyRepository implements PlatformFeePolicyRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findGlobalBookingFee(at: Date): Promise<GlobalBookingPlatformFeePayload | null> {
    const current = await this.client.platformFeeRuleSet.findFirst({
      where: this.activeGlobalFamilyWhere(at),
      include: fullRuleSetInclude,
      orderBy: { version: "desc" }
    });

    return current ? this.mapGlobalBookingFee(current) : null;
  }

  public async findShopPolicy(shopId: number): Promise<ShopPolicyRecord | null> {
    const policy = await this.client.shopPlatformFeePolicy.findFirst({
      where: { shopId, deletedAt: null },
      include: { shop: { select: shopIdentitySelect } }
    });

    return policy ? this.mapShopPolicy(policy) : null;
  }

  public async findShopById(shopId: number): Promise<ShopPolicyIdentity | null> {
    const shop = await this.client.shop.findFirst({
      where: { id: shopId, deletedAt: null },
      select: shopIdentitySelect
    });

    return shop ? this.mapShopIdentity(shop) : null;
  }

  public async listShopPolicies(
    input: ShopPolicyListInput
  ): Promise<PaginatedResponse<ShopPolicyIdentity & { policy: ShopPolicyRecord | null }>> {
    const pagination = toPrismaPagination(input);
    const filters: Prisma.ShopWhereInput[] = [];
    if (input.keyword) {
      filters.push({
        OR: [
          { name: { contains: input.keyword } },
          {
            publicIdentifier: {
              is: {
                publicId: { contains: input.keyword },
                status: "ACTIVE",
                deletedAt: null
              }
            }
          }
        ]
      });
    }
    if (input.feeEnabled === true) {
      filters.push({
        OR: [
          { platformFeePolicy: { is: null } },
          { platformFeePolicy: { is: { feeEnabled: true, deletedAt: null } } }
        ]
      });
    } else if (input.feeEnabled === false) {
      filters.push({
        platformFeePolicy: { is: { feeEnabled: false, deletedAt: null } }
      });
    }
    const where: Prisma.ShopWhereInput = {
      deletedAt: null,
      ...(filters.length > 0 ? { AND: filters } : {})
    };
    const [shops, total] = await Promise.all([
      this.client.shop.findMany({
        where,
        select: {
          ...shopIdentitySelect,
          platformFeePolicy: {
            where: { deletedAt: null },
            include: { shop: { select: shopIdentitySelect } }
          }
        },
        orderBy: [{ id: "asc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.client.shop.count({ where })
    ]);

    return buildPaginatedResponse(
      shops.map((shop) => ({
        ...this.mapShopIdentity(shop),
        policy: shop.platformFeePolicy ? this.mapShopPolicy(shop.platformFeePolicy) : null
      })),
      total,
      pagination
    );
  }

  public async updateGlobalAmount(
    input: GlobalAmountMutationInput
  ): Promise<PolicyMutationResult<GlobalBookingPlatformFeePayload>> {
    try {
      return await this.client.$transaction(async (tx) => {
        const current = await tx.platformFeeRuleSet.findFirst({
          where: this.activeGlobalFamilyWhere(input.changedAt),
          include: fullRuleSetInclude,
          orderBy: { version: "desc" }
        });
        if (!current) {
          return { kind: "config_conflict" } as const;
        }
        if (current.version !== input.expectedVersion) {
          return { kind: "version_conflict" } as const;
        }

        const bookingRules = current.rules.filter(
          (rule) => rule.feeType === "b_platform_fee" && rule.orderType === "booking"
        );
        if (bookingRules.length !== 1) {
          return { kind: "config_conflict" } as const;
        }

        const closed = await tx.platformFeeRuleSet.updateMany({
          where: {
            id: current.id,
            version: input.expectedVersion,
            effectiveTo: current.effectiveTo,
            deletedAt: null
          },
          data: { effectiveTo: input.changedAt, updatedById: input.actorUserId }
        });
        if (closed.count !== 1) {
          return { kind: "version_conflict" } as const;
        }

        const next = await tx.platformFeeRuleSet.create({
          data: {
            name: current.name,
            description: current.description,
            scopeType: current.scopeType,
            familyCode: "booking_default",
            priority: current.priority,
            status: "active",
            version: current.version + 1,
            effectiveFrom: input.changedAt,
            effectiveTo: null,
            createdById: input.actorUserId,
            updatedById: input.actorUserId
          },
          select: { id: true, version: true, effectiveFrom: true }
        });

        for (const rule of current.rules) {
          const clonedRule = await tx.platformFeeRule.create({
            data: {
              ruleSetId: next.id,
              feeType: rule.feeType,
              orderType: rule.orderType,
              payerType: rule.payerType,
              baseAmountNdp: rule.id === bookingRules[0]?.id ? input.amountNdp : rule.baseAmountNdp,
              calculationMode: rule.calculationMode,
              holdStrategy: rule.holdStrategy,
              pricingLockMode: rule.pricingLockMode,
              stackingMode: rule.stackingMode,
              priority: rule.priority,
              conditionJson: this.jsonInput(rule.conditionJson),
              formulaJson: this.jsonInput(rule.formulaJson),
              capJson: this.jsonInput(rule.capJson),
              status: rule.status,
              effectiveFrom: rule.effectiveFrom,
              effectiveTo: rule.effectiveTo,
              createdById: input.actorUserId,
              updatedById: input.actorUserId
            },
            select: { id: true }
          });
          if (rule.tiers.length > 0) {
            await tx.platformFeeTier.createMany({
              data: rule.tiers.map((tier) => ({
                ruleId: clonedRule.id,
                tierBasis: tier.tierBasis,
                tierMode: tier.tierMode,
                minValue: tier.minValue,
                maxValue: tier.maxValue,
                feeAmountNdp: tier.feeAmountNdp,
                adjustmentAmountNdp: tier.adjustmentAmountNdp,
                adjustmentPercent: tier.adjustmentPercent
              }))
            });
          }
          if (rule.timeWindows.length > 0) {
            await tx.platformFeeTimeWindow.createMany({
              data: rule.timeWindows.map((window) => ({
                ruleId: clonedRule.id,
                timeBasis: window.timeBasis,
                timezone: window.timezone,
                dayOfWeekMask: window.dayOfWeekMask,
                holidayCalendarId: window.holidayCalendarId,
                startTime: window.startTime,
                endTime: window.endTime,
                crossDay: window.crossDay,
                adjustmentType: window.adjustmentType,
                adjustmentValueNdp: window.adjustmentValueNdp
              }))
            });
          }
        }

        await tx.auditLog.create({
          data: toAuditLogCreateData({
            ...input.audit,
            targetId: next.id,
            metadata: this.auditMetadata(input.audit.metadata, {
              previousAmountNdp: bookingRules[0]?.baseAmountNdp,
              nextAmountNdp: input.amountNdp,
              previousVersion: current.version,
              nextVersion: next.version,
              effectiveFrom: input.changedAt.toISOString()
            })
          })
        });

        return {
          kind: "updated",
          value: {
            amountNdp: input.amountNdp,
            version: next.version,
            effectiveFrom: next.effectiveFrom?.toISOString() ?? null,
            source: "persisted"
          }
        } as const;
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        return { kind: "version_conflict" };
      }
      throw error;
    }
  }

  public updateShopFeeEnabled(
    input: ShopFeeEnabledMutationInput
  ): Promise<PolicyMutationResult<ShopPolicyRecord>> {
    return this.updateShopPolicy({ ...input, field: "feeEnabled" });
  }

  public async updateShopPayerType(
    input: ShopPayerMutationInput
  ): Promise<PolicyMutationResult<ShopPolicyRecord>> {
    try {
      return await this.client.$transaction(async (tx) => {
        const hasScope = await this.hasMerchantShopScopeWithClient(tx, {
          ...input.merchantScope,
          shopId: input.shopId
        });
        if (!hasScope) {
          return { kind: "scope_forbidden" } as const;
        }
        return this.mutateShopPolicy(tx, {
          ...input,
          field: "payerType"
        });
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        return { kind: "version_conflict" };
      }
      throw error;
    }
  }

  public hasMerchantShopScope(input: {
    scopeType: "shop" | "merchant_account";
    scopeId: number;
    shopId: number;
  }): Promise<boolean> {
    return this.hasMerchantShopScopeWithClient(this.client, input);
  }

  private async updateShopPolicy(
    input: ShopFeeEnabledMutationInput & { field: "feeEnabled" }
  ): Promise<PolicyMutationResult<ShopPolicyRecord>> {
    try {
      return await this.client.$transaction((tx) => this.mutateShopPolicy(tx, input));
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        return { kind: "version_conflict" };
      }
      throw error;
    }
  }

  private async mutateShopPolicy(
    tx: Prisma.TransactionClient,
    input:
      | (ShopFeeEnabledMutationInput & { field: "feeEnabled" })
      | (ShopPayerMutationInput & { field: "payerType" })
  ): Promise<PolicyMutationResult<ShopPolicyRecord>> {
    if (input.expectedVersion === 0) {
      const [shop, existing] = await Promise.all([
        tx.shop.findFirst({ where: { id: input.shopId, deletedAt: null }, select: { id: true } }),
        tx.shopPlatformFeePolicy.findFirst({ where: { shopId: input.shopId } })
      ]);
      if (!shop || existing?.deletedAt) {
        return { kind: "config_conflict" };
      }
      if (existing) {
        return { kind: "version_conflict" };
      }
      await tx.shopPlatformFeePolicy.create({
        data: {
          shopId: input.shopId,
          feeEnabled: input.field === "feeEnabled" ? input.feeEnabled : true,
          payerType: input.field === "payerType" ? this.payerTypeToPrisma(input.payerType) : "SHOP",
          version: 1,
          createdById: input.actorUserId,
          updatedById: input.actorUserId
        }
      });
    } else {
      const updated = await tx.shopPlatformFeePolicy.updateMany({
        where: {
          shopId: input.shopId,
          version: input.expectedVersion,
          deletedAt: null
        },
        data:
          input.field === "feeEnabled"
            ? {
                feeEnabled: input.feeEnabled,
                version: { increment: 1 },
                updatedById: input.actorUserId
              }
            : {
                payerType: this.payerTypeToPrisma(input.payerType),
                version: { increment: 1 },
                updatedById: input.actorUserId
              }
      });
      if (updated.count !== 1) {
        return { kind: "version_conflict" };
      }
    }

    const policy = await tx.shopPlatformFeePolicy.findFirstOrThrow({
      where: { shopId: input.shopId, deletedAt: null },
      include: { shop: { select: shopIdentitySelect } }
    });
    await tx.auditLog.create({
      data: toAuditLogCreateData({
        ...input.audit,
        targetId: policy.id,
        metadata: this.auditMetadata(input.audit.metadata, {
          shopId: input.shopId,
          policyVersion: policy.version
        })
      })
    });

    return { kind: "updated", value: this.mapShopPolicy(policy) };
  }

  private async hasMerchantShopScopeWithClient(
    client: PolicyClient,
    input: {
      scopeType: "shop" | "merchant_account";
      scopeId: number;
      shopId: number;
    }
  ): Promise<boolean> {
    if (input.scopeType === "shop") {
      if (input.scopeId !== input.shopId) {
        return false;
      }
      return (await client.shop.count({ where: { id: input.shopId, deletedAt: null } })) === 1;
    }

    const at = new Date();
    const membership = await client.merchantShopMembership.findFirst({
      where: {
        merchantAccountId: input.scopeId,
        shopId: input.shopId,
        activeKey: { not: null },
        deletedAt: null,
        startsAt: { lte: at },
        OR: [{ endsAt: null }, { endsAt: { gt: at } }]
      },
      select: { id: true }
    });

    return Boolean(membership);
  }

  private activeGlobalFamilyWhere(at: Date): Prisma.PlatformFeeRuleSetWhereInput {
    return {
      familyCode: "booking_default",
      status: "active",
      deletedAt: null,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }]
    };
  }

  private mapGlobalBookingFee(record: FullRuleSetRecord): GlobalBookingPlatformFeePayload | null {
    const rule = record.rules.find(
      (candidate) => candidate.feeType === "b_platform_fee" && candidate.orderType === "booking"
    );
    if (!rule) {
      return null;
    }
    return {
      amountNdp: rule.baseAmountNdp,
      version: record.version,
      effectiveFrom: record.effectiveFrom?.toISOString() ?? null,
      source: "persisted"
    };
  }

  private mapShopIdentity(shop: ShopIdentityRecord): ShopPolicyIdentity {
    const identifier = shop.publicIdentifier;
    return {
      shopId: shop.id,
      shopPublicId:
        identifier && !identifier.deletedAt && identifier.status === "ACTIVE"
          ? identifier.publicId
          : null,
      shopName: shop.name
    };
  }

  private mapShopPolicy(policy: ShopPolicyRecordWithShop): ShopPolicyRecord {
    return {
      ...this.mapShopIdentity(policy.shop),
      feeEnabled: policy.feeEnabled,
      payerType: this.payerTypeFromPrisma(policy.payerType),
      version: policy.version,
      updatedAt: policy.updatedAt
    };
  }

  private payerTypeToPrisma(payerType: ShopPlatformFeePayer): "SHOP" | "TECHNICIAN" {
    return payerType === "technician" ? "TECHNICIAN" : "SHOP";
  }

  private payerTypeFromPrisma(payerType: "SHOP" | "TECHNICIAN"): ShopPlatformFeePayer {
    return payerType === "TECHNICIAN" ? "technician" : "shop";
  }

  private jsonInput(
    value: Prisma.JsonValue | null
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
  }

  private auditMetadata(current: unknown, next: Record<string, unknown>): Record<string, unknown> {
    return {
      ...(current && typeof current === "object" && !Array.isArray(current) ? current : {}),
      ...next
    };
  }

  private isUniqueConflict(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
  }
}
