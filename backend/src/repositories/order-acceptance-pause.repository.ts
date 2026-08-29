import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  OrderAcceptancePauseActorScope,
  OrderAcceptancePauseCreateRepositoryInput,
  OrderAcceptancePauseListInput,
  OrderAcceptancePauseMutationResult,
  OrderAcceptancePausePayload,
  OrderAcceptancePauseReleaseRepositoryInput,
  OrderAcceptancePauseRepositoryPort,
  OrderAcceptancePauseSubject
} from "../services/order-acceptance-pause.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import { runWithTransactionConflictRetry } from "../utils/transaction-conflict-retry";
import { toAuditLogCreateData } from "./audit-log.repository";

const pauseInclude = {
  merchantAccount: { select: { id: true, name: true } },
  shop: { select: { id: true, name: true } }
};

type PauseRecord = Prisma.OrderAcceptancePauseGetPayload<{
  include: typeof pauseInclude;
}>;

export class OrderAcceptancePauseRepository implements OrderAcceptancePauseRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async listPauses(
    actorScope: OrderAcceptancePauseActorScope,
    input: OrderAcceptancePauseListInput
  ) {
    const pagination = toPrismaPagination(input);
    const where: Prisma.OrderAcceptancePauseWhereInput = {
      AND: [
        { deletedAt: null },
        this.actorVisibilityWhere(actorScope),
        ...(input.status
          ? [
              {
                status: input.status === "active" ? ("ACTIVE" as const) : ("RELEASED" as const)
              }
            ]
          : []),
        ...(input.subjectType
          ? [
              {
                subjectType:
                  input.subjectType === "shop" ? ("SHOP" as const) : ("MERCHANT_ACCOUNT" as const)
              }
            ]
          : []),
        ...(input.subjectId
          ? input.subjectType === "merchant_account"
            ? [{ merchantAccountId: input.subjectId }]
            : input.subjectType === "shop"
              ? [{ shopId: input.subjectId }]
              : [
                  {
                    OR: [{ merchantAccountId: input.subjectId }, { shopId: input.subjectId }]
                  }
                ]
          : [])
      ]
    };
    const [records, total] = await Promise.all([
      this.client.orderAcceptancePause.findMany({
        where,
        include: pauseInclude,
        orderBy: [{ startsAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.client.orderAcceptancePause.count({ where })
    ]);

    return buildPaginatedResponse(
      records.map((record) => this.mapPause(record)),
      total,
      pagination
    );
  }

  public createPause(
    input: OrderAcceptancePauseCreateRepositoryInput
  ): Promise<OrderAcceptancePauseMutationResult> {
    const activeKey = this.activeKey(
      input.actorScope.authorityType,
      input.subjectType,
      input.subjectId
    );

    return runWithTransactionConflictRetry(async () => {
      try {
        return await this.client.$transaction(
          async (tx) => {
            await this.lockSubject(tx, input.subjectType, input.subjectId);
            if (
              !(await this.canControlSubject(
                tx,
                input.actorScope,
                input.subjectType,
                input.subjectId
              ))
            ) {
              return { kind: "scope_forbidden" } as const;
            }

            const existing = await tx.orderAcceptancePause.findFirst({
              where: { activeKey, status: "ACTIVE", deletedAt: null },
              include: pauseInclude
            });
            if (existing) {
              return { kind: "existing", value: this.mapPause(existing) } as const;
            }

            const created = await tx.orderAcceptancePause.create({
              data: {
                subjectType: this.subjectTypeToDb(input.subjectType),
                merchantAccountId:
                  input.subjectType === "merchant_account" ? input.subjectId : null,
                shopId: input.subjectType === "shop" ? input.subjectId : null,
                authorityType: this.authorityTypeToDb(input.actorScope.authorityType),
                status: "ACTIVE",
                reasonCode: input.reasonCode.trim(),
                reasonDetail: input.reasonDetail.trim(),
                createdById: input.actorUserId,
                activeKey
              },
              include: pauseInclude
            });
            await tx.auditLog.create({
              data: toAuditLogCreateData({
                ...input.audit,
                targetId: created.id,
                metadata: this.auditMetadata(input.audit.metadata, {
                  pauseId: created.id,
                  authorityType: input.actorScope.authorityType,
                  subjectType: input.subjectType,
                  subjectId: input.subjectId
                })
              })
            });
            return { kind: "created", value: this.mapPause(created) } as const;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
        );
      } catch (error) {
        if (!this.isUniqueConflict(error)) {
          throw error;
        }
        const existing = await this.client.orderAcceptancePause.findFirst({
          where: { activeKey, status: "ACTIVE", deletedAt: null },
          include: pauseInclude
        });
        return existing
          ? { kind: "existing", value: this.mapPause(existing) }
          : { kind: "conflict" };
      }
    });
  }

  public releasePause(
    input: OrderAcceptancePauseReleaseRepositoryInput
  ): Promise<OrderAcceptancePauseMutationResult> {
    return runWithTransactionConflictRetry(() =>
      this.client.$transaction(
        async (tx) => {
          let current = await tx.orderAcceptancePause.findFirst({
            where: { id: input.pauseId, deletedAt: null },
            include: pauseInclude
          });
          if (!current) {
            return { kind: "not_found" } as const;
          }
          const subjectType = this.subjectTypeFromDb(current.subjectType);
          const subjectId = current.shopId ?? current.merchantAccountId;
          if (!subjectId) {
            return { kind: "conflict" } as const;
          }
          await this.lockSubject(tx, subjectType, subjectId);
          current = await tx.orderAcceptancePause.findFirst({
            where: { id: input.pauseId, deletedAt: null },
            include: pauseInclude
          });
          if (!current) {
            return { kind: "not_found" } as const;
          }
          if (!(await this.canReleasePause(tx, input.actorScope, current))) {
            return { kind: "scope_forbidden" } as const;
          }
          if (current.status === "RELEASED") {
            return { kind: "already_released", value: this.mapPause(current) } as const;
          }

          const releasedAt = new Date();
          const updated = await tx.orderAcceptancePause.updateMany({
            where: {
              id: current.id,
              status: "ACTIVE",
              activeKey: { not: null },
              deletedAt: null
            },
            data: {
              status: "RELEASED",
              activeKey: null,
              releasedById: input.actorUserId,
              releasedAt,
              releaseReason: input.releaseReason.trim()
            }
          });
          if (updated.count !== 1) {
            return { kind: "conflict" } as const;
          }
          const released = await tx.orderAcceptancePause.findFirstOrThrow({
            where: { id: current.id, deletedAt: null },
            include: pauseInclude
          });
          await tx.auditLog.create({
            data: toAuditLogCreateData({
              ...input.audit,
              targetId: released.id,
              metadata: this.auditMetadata(input.audit.metadata, {
                pauseId: released.id,
                authorityType: this.authorityTypeFromDb(released.authorityType),
                subjectType,
                subjectId
              })
            })
          });
          return { kind: "released", value: this.mapPause(released) } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
      )
    );
  }

  private actorVisibilityWhere(
    actorScope: OrderAcceptancePauseActorScope
  ): Prisma.OrderAcceptancePauseWhereInput {
    if (actorScope.authorityType === "operations") {
      return {};
    }
    if (actorScope.authorityType === "shop") {
      return { subjectType: "SHOP", shopId: actorScope.scopeId };
    }
    const at = new Date();
    return {
      OR: [
        { subjectType: "MERCHANT_ACCOUNT", merchantAccountId: actorScope.scopeId },
        {
          subjectType: "SHOP",
          shop: {
            merchantMemberships: {
              some: {
                merchantAccountId: actorScope.scopeId,
                activeKey: { not: null },
                deletedAt: null,
                startsAt: { lte: at },
                OR: [{ endsAt: null }, { endsAt: { gt: at } }]
              }
            }
          }
        }
      ]
    };
  }

  private async canControlSubject(
    client: Prisma.TransactionClient,
    actorScope: OrderAcceptancePauseActorScope,
    subjectType: OrderAcceptancePauseSubject,
    subjectId: number
  ): Promise<boolean> {
    if (actorScope.authorityType === "operations") {
      return this.subjectExists(client, subjectType, subjectId);
    }
    if (actorScope.authorityType === "shop") {
      return (
        subjectType === "shop" &&
        actorScope.scopeId === subjectId &&
        (await this.subjectExists(client, subjectType, subjectId))
      );
    }
    if (subjectType === "merchant_account") {
      return (
        actorScope.scopeId === subjectId &&
        (await this.subjectExists(client, subjectType, subjectId))
      );
    }
    return this.hasActiveMerchantShopMembership(client, actorScope.scopeId, subjectId);
  }

  private async canReleasePause(
    client: Prisma.TransactionClient,
    actorScope: OrderAcceptancePauseActorScope,
    pause: PauseRecord
  ): Promise<boolean> {
    if (actorScope.authorityType === "operations") {
      return true;
    }
    if (pause.authorityType === "OPERATIONS") {
      return false;
    }
    if (actorScope.authorityType === "shop") {
      return (
        pause.authorityType === "SHOP" &&
        pause.subjectType === "SHOP" &&
        pause.shopId === actorScope.scopeId
      );
    }
    if (pause.subjectType === "MERCHANT_ACCOUNT") {
      return pause.merchantAccountId === actorScope.scopeId;
    }
    return Boolean(
      pause.shopId &&
      (await this.hasActiveMerchantShopMembership(client, actorScope.scopeId, pause.shopId))
    );
  }

  private async subjectExists(
    client: Prisma.TransactionClient,
    subjectType: OrderAcceptancePauseSubject,
    subjectId: number
  ): Promise<boolean> {
    return subjectType === "shop"
      ? (await client.shop.count({ where: { id: subjectId, deletedAt: null } })) === 1
      : (await client.merchantAccount.count({ where: { id: subjectId, deletedAt: null } })) === 1;
  }

  private async hasActiveMerchantShopMembership(
    client: Prisma.TransactionClient,
    merchantAccountId: number,
    shopId: number
  ): Promise<boolean> {
    const at = new Date();
    return Boolean(
      await client.merchantShopMembership.findFirst({
        where: {
          merchantAccountId,
          shopId,
          activeKey: { not: null },
          deletedAt: null,
          startsAt: { lte: at },
          OR: [{ endsAt: null }, { endsAt: { gt: at } }]
        },
        select: { id: true }
      })
    );
  }

  private async lockSubject(
    client: Prisma.TransactionClient,
    subjectType: OrderAcceptancePauseSubject,
    subjectId: number
  ): Promise<void> {
    const table = subjectType === "shop" ? Prisma.raw("shops") : Prisma.raw("merchant_accounts");
    await client.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM ${table} WHERE id = ${subjectId} AND deleted_at IS NULL FOR UPDATE`
    );
  }

  private activeKey(
    authorityType: OrderAcceptancePauseActorScope["authorityType"],
    subjectType: OrderAcceptancePauseSubject,
    subjectId: number
  ): string {
    return `${authorityType}:${subjectType}:${subjectId}`;
  }

  private mapPause(record: PauseRecord): OrderAcceptancePausePayload {
    return {
      id: record.id,
      subjectType: this.subjectTypeFromDb(record.subjectType),
      subjectId: record.shopId ?? record.merchantAccountId ?? 0,
      merchantAccountId: record.merchantAccountId,
      merchantAccountName: record.merchantAccount?.name ?? null,
      shopId: record.shopId,
      shopName: record.shop?.name ?? null,
      authorityType: this.authorityTypeFromDb(record.authorityType),
      status: record.status === "ACTIVE" ? "active" : "released",
      reasonCode: record.reasonCode,
      reasonDetail: record.reasonDetail,
      startsAt: record.startsAt,
      releasedAt: record.releasedAt,
      releaseReason: record.releaseReason,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }

  private subjectTypeToDb(subjectType: OrderAcceptancePauseSubject) {
    return subjectType === "shop" ? ("SHOP" as const) : ("MERCHANT_ACCOUNT" as const);
  }

  private subjectTypeFromDb(subjectType: "SHOP" | "MERCHANT_ACCOUNT"): OrderAcceptancePauseSubject {
    return subjectType === "SHOP" ? "shop" : "merchant_account";
  }

  private authorityTypeToDb(authorityType: OrderAcceptancePauseActorScope["authorityType"]) {
    if (authorityType === "operations") return "OPERATIONS" as const;
    if (authorityType === "merchant") return "MERCHANT" as const;
    return "SHOP" as const;
  }

  private authorityTypeFromDb(
    authorityType: "OPERATIONS" | "MERCHANT" | "SHOP"
  ): OrderAcceptancePausePayload["authorityType"] {
    if (authorityType === "OPERATIONS") return "operations";
    if (authorityType === "MERCHANT") return "merchant";
    return "shop";
  }

  private auditMetadata(current: unknown, next: Record<string, unknown>) {
    return {
      ...(current && typeof current === "object" && !Array.isArray(current) ? current : {}),
      ...next
    };
  }

  private isUniqueConflict(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
  }
}
