import {
  Prisma,
  ShopCustomerMembershipStatus,
  ShopMembershipCardAdjustmentStatus,
  ShopMembershipCardStatus,
  ShopMembershipCardTopUpPaymentMethod,
  ShopMembershipCardType,
  type PrismaClient
} from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type {
  CreateShopMembershipCardTopUpRepositoryInput,
  ShopMembershipCardTopUpListInput,
  ShopMembershipCardTopUpPaymentMethodPayload,
  ShopMembershipCardTopUpRecord,
  ShopMembershipCardTopUpRepositoryPort
} from "../services/shop-membership-card-topup.service";
import { AppError } from "../utils/app-error";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import { runWithTransactionConflictRetry } from "../utils/transaction-conflict-retry";
import { toAuditLogCreateData } from "./audit-log.repository";
import { resolveCanonicalPersonalIdentityId } from "./personal-identity-scope.repository";

const cardSelect = Prisma.validator<Prisma.ShopMembershipCardSelect>()({
  id: true,
  publicId: true,
  cardNo: true,
  name: true,
  type: true,
  status: true,
  principalBalanceJpy: true,
  bonusBalanceJpy: true,
  expiresAt: true,
  lockVersion: true,
  membership: {
    select: {
      status: true,
      shop: { select: { id: true, shopNo: true, name: true } },
      customerProfile: {
        select: {
          displayName: true,
          user: { select: { id: true, needoId: true } }
        }
      }
    }
  }
});

const topUpSelect = Prisma.validator<Prisma.ShopMembershipCardTopUpSelect>()({
  id: true,
  publicId: true,
  amountJpy: true,
  paymentMethod: true,
  paymentReference: true,
  note: true,
  principalBalanceBeforeJpy: true,
  principalBalanceAfterJpy: true,
  cardLockVersionBefore: true,
  requestFingerprint: true,
  createdAt: true,
  updatedAt: true,
  card: { select: cardSelect },
  shop: { select: { shopNo: true, name: true } },
  createdBy: { select: { needoId: true, username: true } }
});

type CardRecord = Prisma.ShopMembershipCardGetPayload<{ select: typeof cardSelect }>;
type TopUpRecord = Prisma.ShopMembershipCardTopUpGetPayload<{ select: typeof topUpSelect }>;

export class ShopMembershipCardTopUpRepository implements ShopMembershipCardTopUpRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findByIdempotencyKey(shopId: number, idempotencyKey: string): Promise<ShopMembershipCardTopUpRecord | null> {
    const record = await this.client.shopMembershipCardTopUp.findFirst({
      where: { shopId, idempotencyKey, deletedAt: null },
      select: topUpSelect
    });
    return record ? this.mapTopUp(record) : null;
  }

  public async createWithAuditAndNotification(input: CreateShopMembershipCardTopUpRepositoryInput) {
    try {
      return await runWithTransactionConflictRetry(() => this.client.$transaction(async (transaction) => {
        const replay = await transaction.shopMembershipCardTopUp.findFirst({
          where: { shopId: input.shopId, idempotencyKey: input.idempotencyKey, deletedAt: null },
          select: topUpSelect
        });
        if (replay) {
          return replay.requestFingerprint === input.requestFingerprint
            ? { kind: "replayed" as const, value: this.mapTopUp(replay) }
            : { kind: "idempotency_conflict" as const };
        }

        const candidate = await this.loadCard(transaction, input.shopId, input.cardPublicId);
        if (!candidate) return { kind: "not_found" as const };
        const lockedRows = await transaction.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM shop_membership_cards WHERE id = ${candidate.id} AND deleted_at IS NULL FOR UPDATE`
        );
        if (lockedRows.length !== 1) return { kind: "not_found" as const };
        const databaseNow = await this.getDatabaseNow(transaction);
        const card = await this.loadCard(transaction, input.shopId, input.cardPublicId);
        if (!card) return { kind: "not_found" as const };
        if (!this.isEligible(card, databaseNow)) return { kind: "invalid_state" as const };

        const pendingAdjustment = await transaction.shopMembershipCardAdjustmentRequest.findFirst({
          where: {
            cardId: card.id,
            status: ShopMembershipCardAdjustmentStatus.PENDING,
            expiresAt: { gt: databaseNow },
            deletedAt: null
          },
          select: { id: true }
        });
        if (pendingAdjustment) return { kind: "pending_conflict" as const };

        const principalBefore = card.principalBalanceJpy!;
        const principalAfter = principalBefore + input.amountJpy;
        if (!Number.isSafeInteger(principalAfter) || principalAfter > 2_147_483_647) {
          return { kind: "invalid_state" as const };
        }
        const updated = await transaction.shopMembershipCard.updateMany({
          where: {
            id: card.id,
            lockVersion: card.lockVersion,
            type: ShopMembershipCardType.STORED_VALUE,
            status: ShopMembershipCardStatus.ACTIVE,
            principalBalanceJpy: principalBefore,
            deletedAt: null
          },
          data: { principalBalanceJpy: principalAfter, lockVersion: { increment: 1 } }
        });
        if (updated.count !== 1) return { kind: "concurrency_conflict" as const };

        const created = await transaction.shopMembershipCardTopUp.create({
          data: {
            cardId: card.id,
            shopId: input.shopId,
            createdById: input.actorId,
            amountJpy: input.amountJpy,
            paymentMethod: this.paymentMethodToDb(input.paymentMethod),
            paymentReference: input.paymentReference,
            note: input.note,
            principalBalanceBeforeJpy: principalBefore,
            principalBalanceAfterJpy: principalAfter,
            cardLockVersionBefore: card.lockVersion,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.requestFingerprint,
            createdAt: databaseNow
          },
          select: topUpSelect
        });

        const recipientUserId = card.membership.customerProfile.user.id;
        const recipientIdentityId = await resolveCanonicalPersonalIdentityId(transaction, recipientUserId);
        const actorIdentityId = await resolveCanonicalPersonalIdentityId(transaction, input.actorId);
        if (!recipientIdentityId || !actorIdentityId) {
          throw new AppError({ code: ERROR_CODES.IDENTITY_NOT_FOUND, message: "error.auth.identity_not_found", statusCode: 403 });
        }
        const metadata = {
          ...this.metadata(input.audit.metadata),
          topUpPublicId: created.publicId,
          cardPublicId: card.publicId,
          customerNeedoId: card.membership.customerProfile.user.needoId,
          shopNo: card.membership.shop.shopNo,
          principalBalanceBeforeJpy: principalBefore,
          principalBalanceAfterJpy: principalAfter
        };
        await transaction.auditLog.create({
          data: {
            ...toAuditLogCreateData({ ...input.audit, targetId: created.id, metadata }),
            createdAt: databaseNow
          }
        });
        await transaction.notification.create({
          data: {
            recipientUserId,
            recipientIdentityId,
            actorUserId: input.actorId,
            actorIdentityId,
            type: "SYSTEM",
            title: "shop_membership.card_topup.created.title",
            body: "shop_membership.card_topup.created.body",
            payload: {
              topUpPublicId: created.publicId,
              cardPublicId: card.publicId,
              shopNo: card.membership.shop.shopNo,
              amountJpy: input.amountJpy,
              paymentMethod: input.paymentMethod,
              principalBalanceBeforeJpy: principalBefore,
              principalBalanceAfterJpy: principalAfter
            },
            createdAt: databaseNow
          }
        });
        return { kind: "created" as const, value: this.mapTopUp(created) };
      }));
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const targets = this.uniqueTargets(error);
      if (!targets.some((target) => target.includes("idempotency_key"))) throw error;
      const existing = await this.findByIdempotencyKey(input.shopId, input.idempotencyKey);
      if (!existing) throw error;
      return existing.requestFingerprint === input.requestFingerprint
        ? { kind: "replayed" as const, value: existing }
        : { kind: "idempotency_conflict" as const };
    }
  }

  public listMerchant(shopId: number, input: ShopMembershipCardTopUpListInput) {
    const where: Prisma.ShopMembershipCardTopUpWhereInput = {
      shopId,
      ...(input.cardPublicId ? { card: { publicId: input.cardPublicId, deletedAt: null } } : {}),
      deletedAt: null
    };
    return this.list(where, input);
  }

  public listCustomer(customerUserId: number, input: ShopMembershipCardTopUpListInput) {
    const where: Prisma.ShopMembershipCardTopUpWhereInput = {
      card: {
        ...(input.cardPublicId ? { publicId: input.cardPublicId } : {}),
        membership: { customerProfile: { userId: customerUserId }, deletedAt: null },
        deletedAt: null
      },
      deletedAt: null
    };
    return this.list(where, input);
  }

  private async list(where: Prisma.ShopMembershipCardTopUpWhereInput, input: ShopMembershipCardTopUpListInput) {
    const pagination = toPrismaPagination(input);
    const [records, total] = await Promise.all([
      this.client.shopMembershipCardTopUp.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take,
        select: topUpSelect
      }),
      this.client.shopMembershipCardTopUp.count({ where })
    ]);
    return buildPaginatedResponse(records.map((record) => this.mapTopUp(record)), total, input);
  }

  private loadCard(client: Prisma.TransactionClient, shopId: number, cardPublicId: string): Promise<CardRecord | null> {
    return client.shopMembershipCard.findFirst({
      where: { publicId: cardPublicId, membership: { shopId, deletedAt: null }, deletedAt: null },
      select: cardSelect
    });
  }

  private async getDatabaseNow(client: Prisma.TransactionClient): Promise<Date> {
    const rows = await client.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT CURRENT_TIMESTAMP(3) AS now`);
    const databaseNow = rows[0]?.now;
    if (!(databaseNow instanceof Date) || Number.isNaN(databaseNow.getTime())) throw new Error("error.database_clock_unavailable");
    return databaseNow;
  }

  private isEligible(card: CardRecord, databaseNow: Date): boolean {
    return card.type === ShopMembershipCardType.STORED_VALUE
      && card.status === ShopMembershipCardStatus.ACTIVE
      && card.membership.status === ShopCustomerMembershipStatus.ACTIVE
      && card.principalBalanceJpy !== null
      && (!card.expiresAt || card.expiresAt > databaseNow);
  }

  private mapTopUp(record: TopUpRecord): ShopMembershipCardTopUpRecord {
    return {
      internalId: record.id,
      publicId: record.publicId,
      amountJpy: record.amountJpy,
      paymentMethod: this.paymentMethodFromDb(record.paymentMethod),
      paymentReference: record.paymentReference,
      note: record.note,
      principalBalanceBeforeJpy: record.principalBalanceBeforeJpy,
      principalBalanceAfterJpy: record.principalBalanceAfterJpy,
      cardLockVersionBefore: record.cardLockVersionBefore,
      requestFingerprint: record.requestFingerprint,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      card: {
        publicId: record.card.publicId,
        cardNo: record.card.cardNo,
        name: record.card.name,
        type: record.card.type === ShopMembershipCardType.STORED_VALUE ? "stored_value" : record.card.type === ShopMembershipCardType.COUNT ? "count" : "benefit",
        status: record.card.status === ShopMembershipCardStatus.ACTIVE ? "active" : record.card.status === ShopMembershipCardStatus.FROZEN ? "frozen" : record.card.status === ShopMembershipCardStatus.EXPIRED ? "expired" : "void",
        principalBalanceJpy: record.card.principalBalanceJpy,
        bonusBalanceJpy: record.card.bonusBalanceJpy,
        expiresAt: record.card.expiresAt,
        lockVersion: record.card.lockVersion
      },
      shop: record.shop,
      customer: {
        userId: record.card.membership.customerProfile.user.id,
        needoId: record.card.membership.customerProfile.user.needoId,
        displayName: record.card.membership.customerProfile.displayName
      },
      createdBy: { needoId: record.createdBy.needoId, displayName: record.createdBy.username }
    };
  }

  private paymentMethodToDb(value: ShopMembershipCardTopUpPaymentMethodPayload): ShopMembershipCardTopUpPaymentMethod {
    const values = {
      cash: ShopMembershipCardTopUpPaymentMethod.CASH,
      card: ShopMembershipCardTopUpPaymentMethod.CARD,
      paypay: ShopMembershipCardTopUpPaymentMethod.PAYPAY,
      bank_transfer: ShopMembershipCardTopUpPaymentMethod.BANK_TRANSFER,
      other: ShopMembershipCardTopUpPaymentMethod.OTHER
    } as const;
    return values[value];
  }

  private paymentMethodFromDb(value: ShopMembershipCardTopUpPaymentMethod): ShopMembershipCardTopUpPaymentMethodPayload {
    const values: Record<ShopMembershipCardTopUpPaymentMethod, ShopMembershipCardTopUpPaymentMethodPayload> = {
      [ShopMembershipCardTopUpPaymentMethod.CASH]: "cash",
      [ShopMembershipCardTopUpPaymentMethod.CARD]: "card",
      [ShopMembershipCardTopUpPaymentMethod.PAYPAY]: "paypay",
      [ShopMembershipCardTopUpPaymentMethod.BANK_TRANSFER]: "bank_transfer",
      [ShopMembershipCardTopUpPaymentMethod.OTHER]: "other"
    };
    return values[value];
  }

  private metadata(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private isUniqueConflict(error: unknown): error is { code: string; meta?: { target?: unknown } } {
    return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002");
  }

  private uniqueTargets(error: { meta?: { target?: unknown } }): string[] {
    const target = error.meta?.target;
    return Array.isArray(target) ? target.map(String) : target ? [String(target)] : [];
  }
}
