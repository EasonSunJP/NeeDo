import {
  Prisma,
  ShopCustomerMembershipStatus,
  ShopMembershipCardAdjustmentStatus,
  ShopMembershipCardStatus,
  ShopMembershipCardType,
  type PrismaClient
} from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type {
  CancelShopMembershipCardAdjustmentRepositoryInput,
  CreateShopMembershipCardAdjustmentRepositoryInput,
  DecideShopMembershipCardAdjustmentRepositoryInput,
  ShopMembershipCardAdjustmentCancelResult,
  ShopMembershipCardAdjustmentCardContext,
  ShopMembershipCardAdjustmentContextResult,
  ShopMembershipCardAdjustmentCreateResult,
  ShopMembershipCardAdjustmentDecisionResult,
  ShopMembershipCardAdjustmentRecord,
  ShopMembershipCardAdjustmentRepositoryPort,
  ShopMembershipCardAdjustmentListInput,
  ShopMembershipCardAdjustmentStatusPayload
} from "../services/shop-membership-card-adjustment.service";
import { AppError } from "../utils/app-error";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import { runWithTransactionConflictRetry } from "../utils/transaction-conflict-retry";
import { toAuditLogCreateData } from "./audit-log.repository";
import { resolveCanonicalPersonalIdentityId } from "./personal-identity-scope.repository";

const cardContextSelect = Prisma.validator<Prisma.ShopMembershipCardSelect>()({
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
  lockVersion: true,
  expiresAt: true,
  membership: {
    select: {
      status: true,
      deletedAt: true,
      shop: { select: { id: true, shopNo: true, name: true } },
      customerProfile: {
        select: { displayName: true, user: { select: { id: true, needoId: true } } }
      }
    }
  }
});

const adjustmentSelect = Prisma.validator<Prisma.ShopMembershipCardAdjustmentRequestSelect>()({
  id: true,
  publicId: true,
  status: true,
  pendingKey: true,
  reason: true,
  beforePrincipalBalanceJpy: true,
  targetPrincipalBalanceJpy: true,
  beforeRemainingUses: true,
  targetRemainingUses: true,
  cardLockVersionBefore: true,
  requestFingerprint: true,
  decisionFingerprint: true,
  expiresAt: true,
  decidedAt: true,
  cancelledAt: true,
  invalidatedAt: true,
  createdAt: true,
  updatedAt: true,
  shop: { select: { shopNo: true, name: true } },
  requestedBy: { select: { id: true } },
  card: { select: cardContextSelect }
});

type AdjustmentRecord = Prisma.ShopMembershipCardAdjustmentRequestGetPayload<{
  select: typeof adjustmentSelect;
}>;
type CardRecord = Prisma.ShopMembershipCardGetPayload<{ select: typeof cardContextSelect }>;
type AdjustmentClient = PrismaClient | Prisma.TransactionClient;

const REQUEST_TTL_MS = 72 * 60 * 60 * 1000;

export class ShopMembershipCardAdjustmentRepository implements ShopMembershipCardAdjustmentRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findByRequestIdempotencyKey(
    shopId: number,
    idempotencyKey: string
  ): Promise<ShopMembershipCardAdjustmentRecord | null> {
    const record = await this.client.shopMembershipCardAdjustmentRequest.findFirst({
      where: { shopId, requestIdempotencyKey: idempotencyKey, deletedAt: null },
      select: adjustmentSelect
    });
    return record ? this.mapAdjustment(record) : null;
  }

  public async findByDecisionIdempotencyKey(
    customerUserId: number,
    idempotencyKey: string
  ): Promise<ShopMembershipCardAdjustmentRecord | null> {
    const record = await this.client.shopMembershipCardAdjustmentRequest.findFirst({
      where: {
        decisionIdempotencyKey: idempotencyKey,
        card: {
          membership: { customerProfile: { userId: customerUserId }, deletedAt: null },
          deletedAt: null
        },
        deletedAt: null
      },
      select: adjustmentSelect
    });
    return record ? this.mapAdjustment(record) : null;
  }

  public async getMerchantCardContext(
    shopId: number,
    cardPublicId: string
  ): Promise<ShopMembershipCardAdjustmentContextResult> {
    const [card, databaseNow] = await Promise.all([
      this.loadMerchantCard(this.client, shopId, cardPublicId),
      this.getDatabaseNow(this.client)
    ]);
    if (!card) return { kind: "not_found" };
    if (!this.isCardAdjustable(card, databaseNow)) return { kind: "invalid_state" };
    return { kind: "ready", value: this.mapCard(card) };
  }

  public async listMerchantRequests(shopId: number, input: ShopMembershipCardAdjustmentListInput) {
    const pagination = toPrismaPagination(input);
    const databaseNow = await this.getDatabaseNow(this.client);
    const where: Prisma.ShopMembershipCardAdjustmentRequestWhereInput = {
      shopId,
      status: input.status ? this.statusToDb(input.status) : undefined,
      ...this.visibleStatusFilter(input.status, databaseNow),
      card: input.cardPublicId ? { publicId: input.cardPublicId, deletedAt: null } : undefined,
      deletedAt: null
    };
    const [records, total] = await Promise.all([
      this.client.shopMembershipCardAdjustmentRequest.findMany({
        where,
        select: adjustmentSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.client.shopMembershipCardAdjustmentRequest.count({ where })
    ]);
    return buildPaginatedResponse(
      records.map((record) => this.mapAdjustment(record)),
      total,
      input
    );
  }

  public async listCustomerRequests(
    customerUserId: number,
    input: ShopMembershipCardAdjustmentListInput
  ) {
    const pagination = toPrismaPagination(input);
    const databaseNow = await this.getDatabaseNow(this.client);
    const where: Prisma.ShopMembershipCardAdjustmentRequestWhereInput = {
      status: input.status ? this.statusToDb(input.status) : undefined,
      ...this.visibleStatusFilter(input.status, databaseNow),
      card: {
        publicId: input.cardPublicId,
        membership: { customerProfile: { userId: customerUserId }, deletedAt: null },
        deletedAt: null
      },
      deletedAt: null
    };
    const [records, total] = await Promise.all([
      this.client.shopMembershipCardAdjustmentRequest.findMany({
        where,
        select: adjustmentSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.client.shopMembershipCardAdjustmentRequest.count({ where })
    ]);
    return buildPaginatedResponse(
      records.map((record) => this.mapAdjustment(record)),
      total,
      input
    );
  }

  private visibleStatusFilter(
    status: ShopMembershipCardAdjustmentStatusPayload | undefined,
    databaseNow: Date
  ): Prisma.ShopMembershipCardAdjustmentRequestWhereInput {
    if (status === "pending") return { expiresAt: { gt: databaseNow } };
    if (status !== undefined) return {};
    return {
      AND: [
        {
          OR: [
            { status: { not: ShopMembershipCardAdjustmentStatus.PENDING } },
            { status: ShopMembershipCardAdjustmentStatus.PENDING, expiresAt: { gt: databaseNow } }
          ]
        }
      ]
    };
  }

  public async expireDue(input: {
    batchSize: number;
    shopId?: number;
    customerUserId?: number;
  }): Promise<{ scanned: number; expired: number; failed: number }> {
    const databaseNow = await this.getDatabaseNow(this.client);
    const candidates = await this.client.shopMembershipCardAdjustmentRequest.findMany({
      where: {
        shopId: input.shopId,
        status: ShopMembershipCardAdjustmentStatus.PENDING,
        expiresAt: { lte: databaseNow },
        card:
          input.customerUserId === undefined
            ? undefined
            : {
                membership: {
                  customerProfile: { userId: input.customerUserId },
                  deletedAt: null
                },
                deletedAt: null
              },
        deletedAt: null
      },
      select: { publicId: true },
      orderBy: { id: "asc" },
      take: input.batchSize
    });
    const summary = { scanned: candidates.length, expired: 0, failed: 0 };

    for (const candidate of candidates) {
      try {
        const expired = await runWithTransactionConflictRetry(() =>
          this.client.$transaction(async (transaction) => {
            const lockedId = await this.lockRequest(transaction, candidate.publicId);
            if (!lockedId) return false;
            const request = await transaction.shopMembershipCardAdjustmentRequest.findFirst({
              where: {
                id: lockedId,
                status: ShopMembershipCardAdjustmentStatus.PENDING,
                deletedAt: null
              },
              select: adjustmentSelect
            });
            if (!request) return false;
            const currentDatabaseNow = await this.getDatabaseNow(transaction);
            if (request.expiresAt > currentDatabaseNow) return false;
            await this.expireLockedRequest(transaction, request, currentDatabaseNow);
            return true;
          })
        );
        if (expired) summary.expired += 1;
      } catch {
        summary.failed += 1;
      }
    }
    return summary;
  }

  public async createRequestWithAuditAndNotification(
    input: CreateShopMembershipCardAdjustmentRepositoryInput
  ): Promise<ShopMembershipCardAdjustmentCreateResult> {
    try {
      return await runWithTransactionConflictRetry(() =>
        this.client.$transaction(async (transaction) => {
          const existing = await transaction.shopMembershipCardAdjustmentRequest.findFirst({
            where: {
              shopId: input.shopId,
              requestIdempotencyKey: input.requestIdempotencyKey,
              deletedAt: null
            },
            select: adjustmentSelect
          });
          if (existing) {
            return existing.requestFingerprint === input.requestFingerprint
              ? { kind: "replayed" as const, value: this.mapAdjustment(existing) }
              : { kind: "idempotency_conflict" as const };
          }

          let databaseNow = await this.getDatabaseNow(transaction);
          let card = await this.loadMerchantCard(transaction, input.shopId, input.cardPublicId);
          if (!card) return { kind: "not_found" as const };
          if (!this.isCardAdjustable(card, databaseNow) || !this.matchesCreateSnapshot(card, input))
            return { kind: "invalid_state" as const };
          const pending = await transaction.shopMembershipCardAdjustmentRequest.findFirst({
            where: {
              cardId: card.id,
              status: ShopMembershipCardAdjustmentStatus.PENDING,
              deletedAt: null
            },
            select: { publicId: true }
          });
          if (pending) {
            const lockedId = await this.lockRequest(transaction, pending.publicId);
            if (!lockedId) throw this.transactionStateConflict();
            databaseNow = await this.getDatabaseNow(transaction);
            const lockedPending = await transaction.shopMembershipCardAdjustmentRequest.findFirst({
              where: {
                id: lockedId,
                cardId: card.id,
                status: ShopMembershipCardAdjustmentStatus.PENDING,
                deletedAt: null
              },
              select: adjustmentSelect
            });
            if (lockedPending) {
              if (lockedPending.expiresAt > databaseNow)
                return { kind: "pending_conflict" as const };
              await this.expireLockedRequest(transaction, lockedPending, databaseNow);
            }
            const replacementPending =
              await transaction.shopMembershipCardAdjustmentRequest.findFirst({
                where: {
                  cardId: card.id,
                  status: ShopMembershipCardAdjustmentStatus.PENDING,
                  deletedAt: null
                },
                select: { id: true }
              });
            if (replacementPending) return { kind: "pending_conflict" as const };
            card = await this.loadMerchantCard(transaction, input.shopId, input.cardPublicId);
            if (!card) return { kind: "not_found" as const };
            if (
              !this.isCardAdjustable(card, databaseNow) ||
              !this.matchesCreateSnapshot(card, input)
            )
              return { kind: "invalid_state" as const };
          }

          const created = await transaction.shopMembershipCardAdjustmentRequest.create({
            data: {
              cardId: card.id,
              shopId: input.shopId,
              requestedById: input.actorId,
              status: ShopMembershipCardAdjustmentStatus.PENDING,
              pendingKey: `card:${card.id}`,
              reason: input.reason,
              beforePrincipalBalanceJpy: input.beforePrincipalBalanceJpy,
              targetPrincipalBalanceJpy: input.targetPrincipalBalanceJpy,
              beforeRemainingUses: input.beforeRemainingUses,
              targetRemainingUses: input.targetRemainingUses,
              cardLockVersionBefore: input.cardLockVersionBefore,
              requestIdempotencyKey: input.requestIdempotencyKey,
              requestFingerprint: input.requestFingerprint,
              expiresAt: new Date(databaseNow.getTime() + REQUEST_TTL_MS),
              createdAt: databaseNow
            },
            select: adjustmentSelect
          });

          const recipientIdentityId = await resolveCanonicalPersonalIdentityId(
            transaction,
            card.membership.customerProfile.user.id
          );
          const actorIdentityId = await resolveCanonicalPersonalIdentityId(
            transaction,
            input.actorId
          );
          this.requireIdentityPair(recipientIdentityId, actorIdentityId);
          await transaction.auditLog.create({
            data: {
              ...toAuditLogCreateData({
                ...input.audit,
                targetId: created.id,
                metadata: {
                  ...this.metadata(input.audit.metadata),
                  requestPublicId: created.publicId,
                  cardPublicId: card.publicId,
                  expiresAt: created.expiresAt.toISOString()
                }
              }),
              createdAt: databaseNow
            }
          });
          await transaction.notification.create({
            data: {
              recipientUserId: card.membership.customerProfile.user.id,
              recipientIdentityId: recipientIdentityId!,
              actorUserId: input.actorId,
              actorIdentityId: actorIdentityId!,
              type: "SYSTEM",
              title: "shop_membership.card_adjustment.request.title",
              body: "shop_membership.card_adjustment.request.body",
              payload: this.notificationPayload(created) as Prisma.InputJsonValue,
              createdAt: databaseNow
            }
          });
          return { kind: "created" as const, value: this.mapAdjustment(created) };
        })
      );
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const targets = this.uniqueTargets(error);
      if (targets.some((target) => target.includes("request_idempotency_key"))) {
        const existing = await this.findByRequestIdempotencyKey(
          input.shopId,
          input.requestIdempotencyKey
        );
        if (!existing) throw error;
        return existing.requestFingerprint === input.requestFingerprint
          ? { kind: "replayed", value: existing }
          : { kind: "idempotency_conflict" };
      }
      if (targets.some((target) => target.includes("pending_key")))
        return { kind: "pending_conflict" };
      throw error;
    }
  }

  public async decideRequestWithAuditAndNotification(
    input: DecideShopMembershipCardAdjustmentRepositoryInput
  ): Promise<ShopMembershipCardAdjustmentDecisionResult> {
    try {
      return await runWithTransactionConflictRetry(() =>
        this.client.$transaction(async (transaction) => {
          const replay = await transaction.shopMembershipCardAdjustmentRequest.findFirst({
            where: {
              decisionIdempotencyKey: input.decisionIdempotencyKey,
              card: {
                membership: { customerProfile: { userId: input.customerUserId }, deletedAt: null },
                deletedAt: null
              },
              deletedAt: null
            },
            select: adjustmentSelect
          });
          if (replay) {
            return replay.decisionFingerprint === input.decisionFingerprint
              ? { kind: "replayed" as const, value: this.mapAdjustment(replay) }
              : { kind: "idempotency_conflict" as const };
          }

          const locked = await this.lockRequest(transaction, input.requestPublicId);
          if (!locked) return { kind: "not_found" as const };
          const databaseNow = await this.getDatabaseNow(transaction);
          const request = await transaction.shopMembershipCardAdjustmentRequest.findFirst({
            where: {
              id: locked,
              publicId: input.requestPublicId,
              card: {
                membership: { customerProfile: { userId: input.customerUserId }, deletedAt: null },
                deletedAt: null
              },
              deletedAt: null
            },
            select: adjustmentSelect
          });
          if (!request) return { kind: "not_found" as const };
          if (request.status !== ShopMembershipCardAdjustmentStatus.PENDING)
            return { kind: "invalid_state" as const };
          if (request.expiresAt <= databaseNow) {
            const expired = await this.expireLockedRequest(
              transaction,
              request,
              databaseNow,
              input
            );
            return { kind: "expired" as const, value: expired };
          }
          if (!this.matchesDecisionSnapshot(request, databaseNow)) {
            const invalidated = await this.invalidateLockedRequest(
              transaction,
              request,
              input,
              databaseNow
            );
            return { kind: "invalidated" as const, value: invalidated };
          }

          if (input.decision === "approve") {
            const cardUpdated = await this.applyCardTarget(transaction, request);
            if (!cardUpdated) {
              const invalidated = await this.invalidateLockedRequest(
                transaction,
                request,
                input,
                databaseNow
              );
              return { kind: "invalidated" as const, value: invalidated };
            }
          }
          const targetStatus =
            input.decision === "approve"
              ? ShopMembershipCardAdjustmentStatus.APPROVED
              : ShopMembershipCardAdjustmentStatus.REJECTED;
          const transitioned = await transaction.shopMembershipCardAdjustmentRequest.updateMany({
            where: {
              id: request.id,
              status: ShopMembershipCardAdjustmentStatus.PENDING,
              pendingKey: request.pendingKey,
              expiresAt: { gt: databaseNow },
              deletedAt: null
            },
            data: {
              status: targetStatus,
              pendingKey: null,
              decisionIdempotencyKey: input.decisionIdempotencyKey,
              decisionFingerprint: input.decisionFingerprint,
              decidedAt: databaseNow,
              decidedById: input.customerUserId
            }
          });
          if (transitioned.count !== 1) throw this.transactionStateConflict();
          await transaction.auditLog.create({
            data: {
              ...toAuditLogCreateData({
                ...input.audit,
                targetId: request.id,
                metadata: {
                  ...this.metadata(input.audit.metadata),
                  requestPublicId: request.publicId
                }
              }),
              createdAt: databaseNow
            }
          });
          await this.notifyOne(transaction, {
            recipientUserId: request.requestedBy.id,
            actorUserId: input.customerUserId,
            title: `shop_membership.card_adjustment.${input.decision === "approve" ? "approved" : "rejected"}.title`,
            body: `shop_membership.card_adjustment.${input.decision === "approve" ? "approved" : "rejected"}.body`,
            request,
            createdAt: databaseNow
          });
          const updated = await this.findAdjustmentById(transaction, request.id);
          return {
            kind: input.decision === "approve" ? ("approved" as const) : ("rejected" as const),
            value: this.mapAdjustment(updated)
          };
        })
      );
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const existing = await this.findByDecisionIdempotencyKey(
        input.customerUserId,
        input.decisionIdempotencyKey
      );
      if (!existing) throw error;
      return existing.decisionFingerprint === input.decisionFingerprint
        ? { kind: "replayed", value: existing }
        : { kind: "idempotency_conflict" };
    }
  }

  public async cancelRequestWithAuditAndNotification(
    input: CancelShopMembershipCardAdjustmentRepositoryInput
  ): Promise<ShopMembershipCardAdjustmentCancelResult> {
    return runWithTransactionConflictRetry(() =>
      this.client.$transaction(async (transaction) => {
        const locked = await this.lockRequest(transaction, input.requestPublicId);
        if (!locked) return { kind: "not_found" as const };
        const databaseNow = await this.getDatabaseNow(transaction);
        const request = await transaction.shopMembershipCardAdjustmentRequest.findFirst({
          where: {
            id: locked,
            publicId: input.requestPublicId,
            shopId: input.shopId,
            deletedAt: null
          },
          select: adjustmentSelect
        });
        if (!request) return { kind: "not_found" as const };
        if (request.status === ShopMembershipCardAdjustmentStatus.CANCELLED)
          return { kind: "replayed" as const, value: this.mapAdjustment(request) };
        if (request.status !== ShopMembershipCardAdjustmentStatus.PENDING)
          return { kind: "invalid_state" as const };
        if (request.expiresAt <= databaseNow) {
          const expired = await this.expireLockedRequest(transaction, request, databaseNow);
          void expired;
          return { kind: "expired" as const };
        }
        const transitioned = await transaction.shopMembershipCardAdjustmentRequest.updateMany({
          where: {
            id: request.id,
            status: ShopMembershipCardAdjustmentStatus.PENDING,
            pendingKey: request.pendingKey,
            expiresAt: { gt: databaseNow },
            deletedAt: null
          },
          data: {
            status: ShopMembershipCardAdjustmentStatus.CANCELLED,
            pendingKey: null,
            cancelledAt: databaseNow,
            cancelledById: input.actorId
          }
        });
        if (transitioned.count !== 1) throw this.transactionStateConflict();
        await transaction.auditLog.create({
          data: {
            ...toAuditLogCreateData({ ...input.audit, targetId: request.id }),
            createdAt: databaseNow
          }
        });
        await this.notifyOne(transaction, {
          recipientUserId: request.card.membership.customerProfile.user.id,
          actorUserId: input.actorId,
          title: "shop_membership.card_adjustment.cancelled.title",
          body: "shop_membership.card_adjustment.cancelled.body",
          request,
          createdAt: databaseNow
        });
        return {
          kind: "cancelled" as const,
          value: this.mapAdjustment(await this.findAdjustmentById(transaction, request.id))
        };
      })
    );
  }

  private async loadMerchantCard(
    client: AdjustmentClient,
    shopId: number,
    cardPublicId: string
  ): Promise<CardRecord | null> {
    return client.shopMembershipCard.findFirst({
      where: { publicId: cardPublicId, membership: { shopId, deletedAt: null }, deletedAt: null },
      select: cardContextSelect
    });
  }

  private async getDatabaseNow(client: AdjustmentClient): Promise<Date> {
    const rows = await client.$queryRaw<Array<{ now: Date }>>(
      Prisma.sql`SELECT CURRENT_TIMESTAMP(3) AS now`
    );
    const databaseNow = rows[0]?.now;
    if (!(databaseNow instanceof Date) || Number.isNaN(databaseNow.getTime()))
      throw new Error("error.database_clock_unavailable");
    return databaseNow;
  }

  private async lockRequest(
    client: Prisma.TransactionClient,
    publicId: string
  ): Promise<number | null> {
    const rows = await client.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM shop_membership_card_adjustment_requests WHERE public_id = ${publicId} AND deleted_at IS NULL FOR UPDATE`
    );
    return rows.length === 1 ? rows[0].id : null;
  }

  private async applyCardTarget(
    client: Prisma.TransactionClient,
    request: AdjustmentRecord
  ): Promise<boolean> {
    if (request.beforePrincipalBalanceJpy !== null && request.targetPrincipalBalanceJpy !== null) {
      const update = await client.shopMembershipCard.updateMany({
        where: {
          id: request.card.id,
          lockVersion: request.cardLockVersionBefore,
          status: ShopMembershipCardStatus.ACTIVE,
          principalBalanceJpy: request.beforePrincipalBalanceJpy,
          deletedAt: null
        },
        data: {
          principalBalanceJpy: request.targetPrincipalBalanceJpy,
          lockVersion: { increment: 1 }
        }
      });
      return update.count === 1;
    }
    if (
      request.beforeRemainingUses === null ||
      request.targetRemainingUses === null ||
      request.card.totalUses === null
    )
      return false;
    const targetTotalUses =
      request.card.totalUses + request.targetRemainingUses - request.beforeRemainingUses;
    if (
      !Number.isSafeInteger(targetTotalUses) ||
      targetTotalUses < 0 ||
      targetTotalUses > 2_147_483_647
    )
      return false;
    const update = await client.shopMembershipCard.updateMany({
      where: {
        id: request.card.id,
        lockVersion: request.cardLockVersionBefore,
        status: ShopMembershipCardStatus.ACTIVE,
        remainingUses: request.beforeRemainingUses,
        totalUses: request.card.totalUses,
        deletedAt: null
      },
      data: {
        remainingUses: request.targetRemainingUses,
        totalUses: targetTotalUses,
        lockVersion: { increment: 1 }
      }
    });
    return update.count === 1;
  }

  private async expireLockedRequest(
    client: Prisma.TransactionClient,
    request: AdjustmentRecord,
    databaseNow: Date,
    decision?: Pick<
      DecideShopMembershipCardAdjustmentRepositoryInput,
      "decisionIdempotencyKey" | "decisionFingerprint"
    >
  ): Promise<ShopMembershipCardAdjustmentRecord> {
    const update = await client.shopMembershipCardAdjustmentRequest.updateMany({
      where: {
        id: request.id,
        status: ShopMembershipCardAdjustmentStatus.PENDING,
        pendingKey: request.pendingKey,
        expiresAt: { lte: databaseNow },
        deletedAt: null
      },
      data: {
        status: ShopMembershipCardAdjustmentStatus.EXPIRED,
        pendingKey: null,
        ...(decision
          ? {
              decisionIdempotencyKey: decision.decisionIdempotencyKey,
              decisionFingerprint: decision.decisionFingerprint
            }
          : {})
      }
    });
    if (update.count !== 1) throw this.transactionStateConflict();
    await client.auditLog.create({
      data: {
        actorId: null,
        action: "system.shop_membership_card.adjustment.expire",
        targetType: "ShopMembershipCardAdjustmentRequest",
        targetId: request.id,
        metadata: {
          requestPublicId: request.publicId,
          cardPublicId: request.card.publicId,
          expiresAt: request.expiresAt.toISOString(),
          expiredAt: databaseNow.toISOString()
        },
        createdAt: databaseNow
      }
    });
    await this.notifyBothSystem(client, request, "expired", databaseNow);
    return this.mapAdjustment(await this.findAdjustmentById(client, request.id));
  }

  private async invalidateLockedRequest(
    client: Prisma.TransactionClient,
    request: AdjustmentRecord,
    input: DecideShopMembershipCardAdjustmentRepositoryInput,
    databaseNow: Date
  ): Promise<ShopMembershipCardAdjustmentRecord> {
    const update = await client.shopMembershipCardAdjustmentRequest.updateMany({
      where: {
        id: request.id,
        status: ShopMembershipCardAdjustmentStatus.PENDING,
        pendingKey: request.pendingKey,
        deletedAt: null
      },
      data: {
        status: ShopMembershipCardAdjustmentStatus.INVALIDATED,
        pendingKey: null,
        invalidatedAt: databaseNow,
        decisionIdempotencyKey: input.decisionIdempotencyKey,
        decisionFingerprint: input.decisionFingerprint,
        decidedAt: databaseNow,
        decidedById: input.customerUserId
      }
    });
    if (update.count !== 1) throw this.transactionStateConflict();
    await client.auditLog.create({
      data: {
        actorId: null,
        action: "system.shop_membership_card.adjustment.invalidate",
        targetType: "ShopMembershipCardAdjustmentRequest",
        targetId: request.id,
        metadata: {
          requestPublicId: request.publicId,
          cardPublicId: request.card.publicId,
          expectedLockVersion: request.cardLockVersionBefore,
          actualLockVersion: request.card.lockVersion
        },
        createdAt: databaseNow
      }
    });
    await this.notifyBothSystem(client, request, "invalidated", databaseNow);
    return this.mapAdjustment(await this.findAdjustmentById(client, request.id));
  }

  private async notifyBothSystem(
    client: Prisma.TransactionClient,
    request: AdjustmentRecord,
    state: "expired" | "invalidated",
    createdAt: Date
  ): Promise<void> {
    await this.notifyOne(client, {
      recipientUserId: request.card.membership.customerProfile.user.id,
      actorUserId: null,
      title: `shop_membership.card_adjustment.${state}.title`,
      body: `shop_membership.card_adjustment.${state}.body`,
      request,
      createdAt
    });
    await this.notifyOne(client, {
      recipientUserId: request.requestedBy.id,
      actorUserId: null,
      title: `shop_membership.card_adjustment.${state}.title`,
      body: `shop_membership.card_adjustment.${state}.body`,
      request,
      createdAt
    });
  }

  private async notifyOne(
    client: Prisma.TransactionClient,
    input: {
      recipientUserId: number;
      actorUserId: number | null;
      title: string;
      body: string;
      request: AdjustmentRecord;
      createdAt: Date;
    }
  ): Promise<void> {
    const recipientIdentityId = await resolveCanonicalPersonalIdentityId(
      client,
      input.recipientUserId
    );
    const actorIdentityId =
      input.actorUserId === null
        ? null
        : await resolveCanonicalPersonalIdentityId(client, input.actorUserId);
    if (!recipientIdentityId || (input.actorUserId !== null && !actorIdentityId))
      this.throwIdentityNotFound();
    await client.notification.create({
      data: {
        recipientUserId: input.recipientUserId,
        recipientIdentityId: recipientIdentityId!,
        actorUserId: input.actorUserId,
        actorIdentityId,
        type: "SYSTEM",
        title: input.title,
        body: input.body,
        payload: this.notificationPayload(input.request) as Prisma.InputJsonValue,
        createdAt: input.createdAt
      }
    });
  }

  private async findAdjustmentById(
    client: AdjustmentClient,
    id: number
  ): Promise<AdjustmentRecord> {
    const record = await client.shopMembershipCardAdjustmentRequest.findUnique({
      where: { id },
      select: adjustmentSelect
    });
    if (!record) throw this.transactionStateConflict();
    return record;
  }

  private isCardAdjustable(card: CardRecord, databaseNow: Date): boolean {
    return (
      card.status === ShopMembershipCardStatus.ACTIVE &&
      card.membership.status === ShopCustomerMembershipStatus.ACTIVE &&
      card.membership.deletedAt === null &&
      (card.expiresAt === null || card.expiresAt > databaseNow)
    );
  }

  private matchesCreateSnapshot(
    card: CardRecord,
    input: CreateShopMembershipCardAdjustmentRepositoryInput
  ): boolean {
    if (card.lockVersion !== input.cardLockVersionBefore) return false;
    if (card.type === ShopMembershipCardType.STORED_VALUE) {
      return (
        card.principalBalanceJpy === input.beforePrincipalBalanceJpy &&
        input.targetPrincipalBalanceJpy !== null &&
        input.beforeRemainingUses === null &&
        input.targetRemainingUses === null
      );
    }
    if (card.type === ShopMembershipCardType.COUNT) {
      return (
        card.remainingUses === input.beforeRemainingUses &&
        input.targetRemainingUses !== null &&
        input.beforePrincipalBalanceJpy === null &&
        input.targetPrincipalBalanceJpy === null
      );
    }
    return false;
  }

  private matchesDecisionSnapshot(request: AdjustmentRecord, databaseNow: Date): boolean {
    if (
      !this.isCardAdjustable(request.card, databaseNow) ||
      request.card.lockVersion !== request.cardLockVersionBefore
    )
      return false;
    if (request.beforePrincipalBalanceJpy !== null)
      return request.card.principalBalanceJpy === request.beforePrincipalBalanceJpy;
    return (
      request.beforeRemainingUses !== null &&
      request.card.remainingUses === request.beforeRemainingUses
    );
  }

  private mapCard(record: CardRecord): ShopMembershipCardAdjustmentCardContext {
    return {
      publicId: record.publicId,
      cardNo: record.cardNo,
      name: record.name,
      type:
        record.type === ShopMembershipCardType.STORED_VALUE
          ? "stored_value"
          : record.type === ShopMembershipCardType.COUNT
            ? "count"
            : "benefit",
      status:
        record.status === ShopMembershipCardStatus.ACTIVE
          ? "active"
          : record.status === ShopMembershipCardStatus.FROZEN
            ? "frozen"
            : record.status === ShopMembershipCardStatus.EXPIRED
              ? "expired"
              : "void",
      principalBalanceJpy: record.principalBalanceJpy,
      bonusBalanceJpy: record.bonusBalanceJpy,
      remainingUses: record.remainingUses,
      totalUses: record.totalUses,
      lockVersion: record.lockVersion
    };
  }

  private mapAdjustment(record: AdjustmentRecord): ShopMembershipCardAdjustmentRecord {
    return {
      internalId: record.id,
      publicId: record.publicId,
      status: this.statusFromDb(record.status),
      reason: record.reason,
      beforePrincipalBalanceJpy: record.beforePrincipalBalanceJpy,
      targetPrincipalBalanceJpy: record.targetPrincipalBalanceJpy,
      beforeRemainingUses: record.beforeRemainingUses,
      targetRemainingUses: record.targetRemainingUses,
      cardLockVersionBefore: record.cardLockVersionBefore,
      requestFingerprint: record.requestFingerprint,
      decisionFingerprint: record.decisionFingerprint,
      expiresAt: record.expiresAt,
      decidedAt: record.decidedAt,
      cancelledAt: record.cancelledAt,
      invalidatedAt: record.invalidatedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      card: this.mapCard(record.card),
      shop: record.shop,
      customer: {
        userId: record.card.membership.customerProfile.user.id,
        needoId: record.card.membership.customerProfile.user.needoId,
        displayName: record.card.membership.customerProfile.displayName
      }
    };
  }

  private statusFromDb(
    status: ShopMembershipCardAdjustmentStatus
  ): ShopMembershipCardAdjustmentStatusPayload {
    return status.toLowerCase() as ShopMembershipCardAdjustmentStatusPayload;
  }

  private statusToDb(
    status: ShopMembershipCardAdjustmentStatusPayload
  ): ShopMembershipCardAdjustmentStatus {
    return status.toUpperCase() as ShopMembershipCardAdjustmentStatus;
  }

  private notificationPayload(request: AdjustmentRecord): Record<string, unknown> {
    return {
      requestPublicId: request.publicId,
      cardPublicId: request.card.publicId,
      shopNo: request.shop.shopNo,
      status: this.statusFromDb(request.status),
      expiresAt: request.expiresAt.toISOString()
    };
  }

  private metadata(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private requireIdentityPair(
    recipientIdentityId: number | null,
    actorIdentityId: number | null
  ): void {
    if (!recipientIdentityId || !actorIdentityId) this.throwIdentityNotFound();
  }

  private throwIdentityNotFound(): never {
    throw new AppError({
      code: ERROR_CODES.IDENTITY_NOT_FOUND,
      message: "error.auth.identity_not_found",
      statusCode: 403
    });
  }

  private transactionStateConflict(): AppError {
    return new AppError({
      code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_INVALID_STATE,
      message: "error.shop_membership_card_adjustment.invalid_state",
      statusCode: 409
    });
  }

  private isUniqueConflict(error: unknown): error is { code: string; meta?: { target?: unknown } } {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
  }

  private uniqueTargets(error: { meta?: { target?: unknown } }): string[] {
    const target = error.meta?.target;
    return Array.isArray(target) ? target.map(String) : [String(target ?? "")];
  }
}
