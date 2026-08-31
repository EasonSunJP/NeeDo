import {
  Prisma,
  ShopCustomerMembershipStatus,
  ShopMembershipCardIssuanceSource,
  ShopMembershipCardPlanStatus,
  ShopMembershipCardPlanValidityMode,
  ShopMembershipCardPlanVersionStatus,
  ShopMembershipCardStatus,
  ShopMembershipCardType,
  type PrismaClient
} from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type {
  CreateMembershipCardIssuanceRepositoryInput,
  IssuedMembershipCardRecord,
  ShopMembershipCardIssuanceContext,
  ShopMembershipCardIssuanceContextResult,
  ShopMembershipCardIssuanceMutationResult,
  ShopMembershipCardIssuanceRepositoryPort,
  ShopMembershipCardIssuanceSourcePayload,
  ShopMembershipCardIssuanceTypePayload
} from "../services/shop-membership-card-issuance.service";
import { AppError } from "../utils/app-error";
import { toAuditLogCreateData } from "./audit-log.repository";
import { resolveCanonicalPersonalIdentityId } from "./personal-identity-scope.repository";

const membershipSelect = Prisma.validator<Prisma.ShopCustomerMembershipSelect>()({
  id: true,
  publicId: true,
  status: true,
  shop: { select: { id: true, shopNo: true, name: true } },
  customerProfile: {
    select: {
      displayName: true,
      user: { select: { id: true, needoId: true } }
    }
  }
});

const planSelect = Prisma.validator<Prisma.ShopMembershipCardPlanSelect>()({
  id: true,
  publicId: true,
  status: true,
  currentVersionId: true,
  currentVersion: {
    select: {
      id: true,
      publicId: true,
      version: true,
      status: true,
      name: true,
      cardType: true,
      validityMode: true,
      validityDays: true,
      fixedExpiryAt: true,
      minInitialPrincipalJpy: true,
      maxInitialPrincipalJpy: true,
      minInitialUses: true,
      maxInitialUses: true,
      platformFeeRateBps: true
    }
  }
});

const issuedCardSelect = Prisma.validator<Prisma.ShopMembershipCardSelect>()({
  id: true,
  publicId: true,
  cardNo: true,
  name: true,
  type: true,
  status: true,
  principalBalanceJpy: true,
  bonusBalanceJpy: true,
  remainingUses: true,
  totalUses: true,
  initialPrincipalJpy: true,
  initialUses: true,
  issuanceSource: true,
  issuanceReference: true,
  issuanceNote: true,
  issuedAt: true,
  expiresAt: true,
  frozenAt: true,
  platformFeeRateBpsSnapshot: true,
  issuanceFingerprint: true,
  plan: { select: { publicId: true } },
  planVersion: { select: { publicId: true, version: true } },
  membership: {
    select: {
      customerProfile: {
        select: { displayName: true, user: { select: { needoId: true } } }
      }
    }
  }
});

type ContextClient = Pick<PrismaClient, "shopCustomerMembership" | "shopMembershipCardPlan"> | Pick<Prisma.TransactionClient, "shopCustomerMembership" | "shopMembershipCardPlan">;
type IssuedCardRecord = Prisma.ShopMembershipCardGetPayload<{ select: typeof issuedCardSelect }>;

export class ShopMembershipCardIssuanceRepository implements ShopMembershipCardIssuanceRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findByIdempotencyKey(shopId: number, idempotencyKey: string): Promise<IssuedMembershipCardRecord | null> {
    const record = await this.client.shopMembershipCard.findFirst({
      where: {
        issuanceIdempotencyKey: idempotencyKey,
        membership: { shopId, deletedAt: null },
        deletedAt: null
      },
      select: issuedCardSelect
    });
    return record ? this.mapCard(record) : null;
  }

  public getIssuanceContext(shopId: number, membershipPublicId: string, planPublicId: string): Promise<ShopMembershipCardIssuanceContextResult> {
    return this.loadIssuanceContext(this.client, shopId, membershipPublicId, planPublicId);
  }

  public async issueCardWithAuditAndNotification(input: CreateMembershipCardIssuanceRepositoryInput): Promise<ShopMembershipCardIssuanceMutationResult> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const existing = await transaction.shopMembershipCard.findFirst({
          where: {
            issuanceIdempotencyKey: input.issuanceIdempotencyKey,
            membership: { shopId: input.shopId, deletedAt: null },
            deletedAt: null
          },
          select: issuedCardSelect
        });
        if (existing) {
          return existing.issuanceFingerprint === input.issuanceFingerprint
            ? { kind: "replayed" as const, value: this.mapCard(existing) }
            : { kind: "idempotency_conflict" as const };
        }

        const contextResult = await this.loadIssuanceContext(
          transaction,
          input.shopId,
          input.membershipPublicId,
          input.planPublicId
        );
        if (contextResult.kind !== "ready") return contextResult;
        const context = contextResult.value;
        if (
          context.version.publicId !== input.expectedPlanVersionPublicId ||
          context.version.cardType !== input.type ||
          context.version.name !== input.name ||
          context.version.platformFeeRateBps !== input.platformFeeRateBpsSnapshot
        ) {
          return { kind: "invalid_state" as const };
        }

        const created = await transaction.shopMembershipCard.create({
          data: {
            membershipId: context.membership.internalId,
            planId: context.plan.internalId,
            planVersionId: context.version.internalId,
            issuedById: input.actorId,
            cardNo: input.cardNo,
            name: input.name,
            type: this.cardTypeToDb(input.type),
            status: ShopMembershipCardStatus.ACTIVE,
            issuanceSource: this.sourceToDb(input.issuanceSource),
            issuanceReference: input.issuanceReference,
            issuanceNote: input.issuanceNote,
            initialPrincipalJpy: input.initialPrincipalJpy,
            initialUses: input.initialUses,
            platformFeeRateBpsSnapshot: input.platformFeeRateBpsSnapshot,
            issuanceIdempotencyKey: input.issuanceIdempotencyKey,
            issuanceFingerprint: input.issuanceFingerprint,
            principalBalanceJpy: input.principalBalanceJpy,
            bonusBalanceJpy: input.bonusBalanceJpy,
            remainingUses: input.remainingUses,
            totalUses: input.totalUses,
            issuedAt: input.issuedAt,
            expiresAt: input.expiresAt
          },
          select: issuedCardSelect
        });

        const recipientIdentityId = await resolveCanonicalPersonalIdentityId(transaction, context.membership.customerUserId);
        const actorIdentityId = await resolveCanonicalPersonalIdentityId(transaction, input.actorId);
        if (!recipientIdentityId || !actorIdentityId) {
          throw new AppError({ code: ERROR_CODES.IDENTITY_NOT_FOUND, message: "error.auth.identity_not_found", statusCode: 403 });
        }

        const sharedMetadata = {
          ...(input.audit.metadata && typeof input.audit.metadata === "object" ? input.audit.metadata : {}),
          cardPublicId: created.publicId,
          membershipPublicId: context.membership.publicId,
          planPublicId: context.plan.publicId,
          planVersionPublicId: context.version.publicId,
          planVersion: context.version.version
        };
        await transaction.auditLog.create({
          data: {
            ...toAuditLogCreateData({ ...input.audit, targetId: created.id, metadata: sharedMetadata }),
            createdAt: input.issuedAt
          }
        });
        await transaction.notification.create({
          data: {
            recipientUserId: context.membership.customerUserId,
            recipientIdentityId,
            actorUserId: input.actorId,
            actorIdentityId,
            type: "SYSTEM",
            title: "shop_membership.card_issued.title",
            body: "shop_membership.card_issued.body",
            payload: {
              cardPublicId: created.publicId,
              membershipPublicId: context.membership.publicId,
              shopNo: context.shop.shopNo,
              planPublicId: context.plan.publicId,
              planVersionPublicId: context.version.publicId,
              planVersion: context.version.version,
              cardType: input.type,
              initialPrincipalJpy: input.initialPrincipalJpy,
              initialUses: input.initialUses,
              issuanceSource: input.issuanceSource
            },
            createdAt: input.issuedAt
          }
        });
        return { kind: "created" as const, value: this.mapCard(created) };
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const targets = this.uniqueTargets(error);
      if (targets.some((target) => target.includes("issuance_idempotency_key"))) {
        const existing = await this.findByIdempotencyKey(input.shopId, input.issuanceIdempotencyKey);
        if (!existing) throw error;
        return existing.issuanceFingerprint === input.issuanceFingerprint
          ? { kind: "replayed", value: existing }
          : { kind: "idempotency_conflict" };
      }
      if (targets.some((target) => target.includes("card_no"))) return { kind: "card_number_conflict" };
      throw error;
    }
  }

  private async loadIssuanceContext(
    client: ContextClient,
    shopId: number,
    membershipPublicId: string,
    planPublicId: string
  ): Promise<ShopMembershipCardIssuanceContextResult> {
    const [membership, plan] = await Promise.all([
      client.shopCustomerMembership.findFirst({
        where: { publicId: membershipPublicId, shopId, deletedAt: null },
        select: membershipSelect
      }),
      client.shopMembershipCardPlan.findFirst({
        where: { publicId: planPublicId, shopId, deletedAt: null },
        select: planSelect
      })
    ]);
    if (!membership || !plan) return { kind: "not_found" };
    const version = plan.currentVersion;
    if (
      membership.status !== ShopCustomerMembershipStatus.ACTIVE ||
      plan.status !== ShopMembershipCardPlanStatus.ACTIVE ||
      !version ||
      plan.currentVersionId !== version.id ||
      version.status !== ShopMembershipCardPlanVersionStatus.PUBLISHED
    ) {
      return { kind: "invalid_state" };
    }
    const validity = this.validityFromDb(version.validityMode, version.validityDays, version.fixedExpiryAt);
    if (!validity) return { kind: "invalid_state" };
    return {
      kind: "ready",
      value: {
        membership: {
          internalId: membership.id,
          publicId: membership.publicId,
          customerUserId: membership.customerProfile.user.id,
          customerNeedoId: membership.customerProfile.user.needoId,
          customerDisplayName: membership.customerProfile.displayName
        },
        shop: { internalId: membership.shop.id, shopNo: membership.shop.shopNo, name: membership.shop.name },
        plan: { internalId: plan.id, publicId: plan.publicId },
        version: {
          internalId: version.id,
          publicId: version.publicId,
          version: version.version,
          name: version.name,
          cardType: this.cardTypeFromDb(version.cardType),
          validity,
          minInitialPrincipalJpy: version.minInitialPrincipalJpy,
          maxInitialPrincipalJpy: version.maxInitialPrincipalJpy,
          minInitialUses: version.minInitialUses,
          maxInitialUses: version.maxInitialUses,
          platformFeeRateBps: version.platformFeeRateBps
        }
      }
    };
  }

  private mapCard(record: IssuedCardRecord): IssuedMembershipCardRecord {
    if (!record.plan || !record.planVersion || !record.issuanceSource || record.platformFeeRateBpsSnapshot === null || !record.issuanceFingerprint) {
      throw new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_ISSUANCE_INVALID_STATE, message: "error.shop_membership_card_issuance.invalid_state", statusCode: 409 });
    }
    return {
      internalId: record.id,
      publicId: record.publicId,
      cardNo: record.cardNo,
      name: record.name,
      type: this.cardTypeFromDb(record.type),
      status: this.cardStatusFromDb(record.status),
      principalBalanceJpy: record.principalBalanceJpy,
      bonusBalanceJpy: record.bonusBalanceJpy,
      remainingUses: record.remainingUses,
      totalUses: record.totalUses,
      initialPrincipalJpy: record.initialPrincipalJpy,
      initialUses: record.initialUses,
      issuanceSource: this.sourceFromDb(record.issuanceSource),
      issuanceReference: record.issuanceReference,
      issuanceNote: record.issuanceNote,
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
      frozenAt: record.frozenAt,
      platformFeeRateBpsSnapshot: record.platformFeeRateBpsSnapshot,
      issuanceFingerprint: record.issuanceFingerprint,
      planPublicId: record.plan.publicId,
      planVersionPublicId: record.planVersion.publicId,
      planVersion: record.planVersion.version,
      customerNeedoId: record.membership.customerProfile.user.needoId,
      customerDisplayName: record.membership.customerProfile.displayName
    };
  }

  private cardTypeToDb(type: ShopMembershipCardIssuanceTypePayload): ShopMembershipCardType {
    return type === "stored_value" ? ShopMembershipCardType.STORED_VALUE : type === "count" ? ShopMembershipCardType.COUNT : ShopMembershipCardType.BENEFIT;
  }

  private cardTypeFromDb(type: ShopMembershipCardType): ShopMembershipCardIssuanceTypePayload {
    return type === ShopMembershipCardType.STORED_VALUE ? "stored_value" : type === ShopMembershipCardType.COUNT ? "count" : "benefit";
  }

  private sourceToDb(source: ShopMembershipCardIssuanceSourcePayload): ShopMembershipCardIssuanceSource {
    return source === "offline_paid" ? ShopMembershipCardIssuanceSource.OFFLINE_PAID : source === "historical_replacement" ? ShopMembershipCardIssuanceSource.HISTORICAL_REPLACEMENT : ShopMembershipCardIssuanceSource.MANUAL_GRANT;
  }

  private sourceFromDb(source: ShopMembershipCardIssuanceSource): ShopMembershipCardIssuanceSourcePayload {
    return source === ShopMembershipCardIssuanceSource.OFFLINE_PAID ? "offline_paid" : source === ShopMembershipCardIssuanceSource.HISTORICAL_REPLACEMENT ? "historical_replacement" : "manual_grant";
  }

  private cardStatusFromDb(status: ShopMembershipCardStatus): "active" | "frozen" | "expired" | "void" {
    return status === ShopMembershipCardStatus.ACTIVE ? "active" : status === ShopMembershipCardStatus.FROZEN ? "frozen" : status === ShopMembershipCardStatus.EXPIRED ? "expired" : "void";
  }

  private validityFromDb(mode: ShopMembershipCardPlanValidityMode, days: number | null, fixedExpiryAt: Date | null): ShopMembershipCardIssuanceContext["version"]["validity"] | null {
    if (mode === ShopMembershipCardPlanValidityMode.NEVER) return days === null && fixedExpiryAt === null ? { mode: "never" } : null;
    if (mode === ShopMembershipCardPlanValidityMode.FIXED_DAYS) return days && days > 0 && fixedExpiryAt === null ? { mode: "fixed_days", days } : null;
    return fixedExpiryAt && days === null ? { mode: "fixed_date", expiresAt: fixedExpiryAt } : null;
  }

  private isUniqueConflict(error: unknown): error is { code: string; meta?: { target?: unknown } } {
    return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002");
  }

  private uniqueTargets(error: { meta?: { target?: unknown } }): string[] {
    const target = error.meta?.target;
    return Array.isArray(target) ? target.map(String) : target ? [String(target)] : [];
  }
}
