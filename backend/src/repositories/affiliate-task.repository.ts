import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  AffiliateBudgetReservationRecord,
  AffiliateBudgetTransactionKind,
  AffiliateDiscountType,
  AffiliatePublisherType,
  AffiliateServiceScopeMode,
  AffiliateServiceScopeRecord,
  AffiliateShopScopeRecord,
  AffiliateTaskEditableFields,
  AffiliateTaskListInput,
  AffiliateTaskPersistenceInput,
  AffiliateTaskRecord,
  AffiliateTaskRepositoryPort,
  AffiliateTaskTransactionClient,
  BackofficeAffiliateTaskListInput,
  UpdateAffiliateTaskPersistenceInput
} from "../services/affiliate-task.service";
import type { AffiliateTaskStatus } from "../services/affiliate-state-machine.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse } from "../utils/pagination";

type AffiliatePrismaClient = PrismaClient | Prisma.TransactionClient;

const taskInclude = {
  shops: {
    where: { deletedAt: null },
    orderBy: { id: "asc" as const }
  },
  services: {
    where: { deletedAt: null },
    orderBy: { id: "asc" as const }
  },
  budgetReservation: true
} satisfies Prisma.AffiliateTaskInclude;

type AffiliateTaskDbRecord = Prisma.AffiliateTaskGetPayload<{
  include: typeof taskInclude;
}>;

type AffiliateBudgetReservationDbRecord =
  Prisma.AffiliateBudgetReservationGetPayload<Record<string, never>>;

export class AffiliateTaskRepository implements AffiliateTaskRepositoryPort {
  public constructor(private readonly client: AffiliatePrismaClient = prisma) {}

  public async runInTransaction<T>(
    handler: (
      repository: AffiliateTaskRepositoryPort,
      transactionClient?: AffiliateTaskTransactionClient
    ) => Promise<T>,
    transactionClient?: AffiliateTaskTransactionClient
  ): Promise<T> {
    if (transactionClient) {
      return handler(
        new AffiliateTaskRepository(transactionClient as AffiliatePrismaClient),
        transactionClient
      );
    }
    if (this.canStartTransaction(this.client)) {
      return this.client.$transaction((tx) =>
        handler(new AffiliateTaskRepository(tx), tx)
      );
    }
    return handler(this, this.client);
  }

  public async getManageableMerchantAccountIds(userId: number): Promise<number[]> {
    const scopedRoles = await this.client.userRole.findMany({
      where: {
        userId,
        deletedAt: null,
        scopeType: { in: ["merchant", "merchant_account"] },
        scopeId: { not: null },
        role: {
          deletedAt: null,
          code: { in: ["merchant_owner", "merchant_staff"] }
        }
      },
      select: { scopeId: true }
    });
    const scopedIds = scopedRoles.flatMap((role) =>
      role.scopeId === null ? [] : [role.scopeId]
    );
    const accounts = await this.client.merchantAccount.findMany({
      where: {
        deletedAt: null,
        status: "active",
        OR: [{ ownerUserId: userId }, ...(scopedIds.length ? [{ id: { in: scopedIds } }] : [])]
      },
      select: { id: true },
      orderBy: { id: "asc" }
    });

    return accounts.map((account) => account.id);
  }

  public async findActiveShopsByIds(shopIds: number[]): Promise<AffiliateShopScopeRecord[]> {
    if (shopIds.length === 0) {
      return [];
    }
    return this.client.shop.findMany({
      where: {
        id: { in: shopIds },
        status: { in: ["active", "published"] },
        deletedAt: null
      },
      select: { id: true, name: true },
      orderBy: { id: "asc" }
    });
  }

  public async findActiveMerchantShops(
    merchantAccountId: number,
    shopIds: number[],
    now = new Date()
  ): Promise<AffiliateShopScopeRecord[]> {
    if (shopIds.length === 0) {
      return [];
    }
    const memberships = await this.client.merchantShopMembership.findMany({
      where: {
        merchantAccountId,
        shopId: { in: shopIds },
        activeKey: { not: null },
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        deletedAt: null,
        merchantAccount: { status: "active", deletedAt: null },
        shop: {
          status: { in: ["active", "published"] },
          deletedAt: null
        }
      },
      select: { shop: { select: { id: true, name: true } } },
      orderBy: { shopId: "asc" }
    });

    return memberships.map((membership) => membership.shop);
  }

  public async findEligibleServices(input: {
    shopIds: number[];
    selectedServiceIds?: number[];
  }): Promise<AffiliateServiceScopeRecord[]> {
    if (input.shopIds.length === 0) {
      return [];
    }
    const services = await this.client.service.findMany({
      where: {
        shopId: { in: input.shopIds },
        ...(input.selectedServiceIds ? { id: { in: input.selectedServiceIds } } : {}),
        status: { in: ["active", "published"] },
        currency: "JPY",
        deletedAt: null
      },
      select: { id: true, shopId: true, name: true, priceAmount: true },
      orderBy: { id: "asc" }
    });

    return services.map((service) => ({
      id: service.id,
      shopId: service.shopId,
      name: service.name,
      priceJpy: service.priceAmount.toNumber()
    }));
  }

  public async createTask(input: AffiliateTaskPersistenceInput): Promise<AffiliateTaskRecord> {
    const task = await this.client.affiliateTask.create({
      data: {
        ...this.editableData(input),
        taskCode: input.taskCode,
        lineageKey: input.lineageKey,
        publisherType: this.publisherTypeToDb(input.publisherType),
        publisherMerchantAccountId: input.publisherMerchantAccountId,
        publisherShopId: input.publisherShopId
      },
      include: taskInclude
    });

    return this.mapTask(task);
  }

  public async updateDraftTask(
    input: UpdateAffiliateTaskPersistenceInput
  ): Promise<AffiliateTaskRecord | null> {
    const update = await this.client.affiliateTask.updateMany({
      where: {
        id: input.taskId,
        status: "DRAFT",
        lockVersion: input.lockVersion,
        deletedAt: null
      },
      data: {
        ...this.editableData(input.fields),
        lockVersion: { increment: 1 }
      }
    });

    return update.count === 1 ? this.findTaskById(input.taskId) : null;
  }

  public async replaceTaskScopeSnapshots(input: {
    taskId: number;
    shops: AffiliateShopScopeRecord[];
    services: AffiliateServiceScopeRecord[];
  }): Promise<void> {
    const deletedAt = new Date();
    await this.client.affiliateTaskShop.updateMany({
      where: { taskId: input.taskId, deletedAt: null },
      data: { deletedAt }
    });
    await this.client.affiliateTaskService.updateMany({
      where: { taskId: input.taskId, deletedAt: null },
      data: { deletedAt }
    });

    for (const shop of input.shops) {
      await this.client.affiliateTaskShop.upsert({
        where: { taskId_shopId: { taskId: input.taskId, shopId: shop.id } },
        create: {
          taskId: input.taskId,
          shopId: shop.id,
          shopNameSnapshot: shop.name
        },
        update: { shopNameSnapshot: shop.name, deletedAt: null }
      });
    }
    for (const service of input.services) {
      await this.client.affiliateTaskService.upsert({
        where: {
          taskId_serviceId: { taskId: input.taskId, serviceId: service.id }
        },
        create: {
          taskId: input.taskId,
          shopId: service.shopId,
          serviceId: service.id,
          serviceNameSnapshot: service.name,
          servicePriceJpySnapshot: service.priceJpy
        },
        update: {
          shopId: service.shopId,
          serviceNameSnapshot: service.name,
          servicePriceJpySnapshot: service.priceJpy,
          deletedAt: null
        }
      });
    }
  }

  public async findTaskById(taskId: number): Promise<AffiliateTaskRecord | null> {
    const task = await this.client.affiliateTask.findFirst({
      where: { id: taskId, deletedAt: null },
      include: taskInclude
    });
    return task ? this.mapTask(task) : null;
  }

  public async lockTask(taskId: number): Promise<AffiliateTaskRecord | null> {
    const rows = await this.client.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM affiliate_tasks WHERE id = ${taskId} AND deleted_at IS NULL FOR UPDATE`
    );
    return rows.length === 1 ? this.findTaskById(taskId) : null;
  }

  public async listPublisherTasks(
    input: AffiliateTaskListInput & {
      shopId?: number;
      merchantAccountIds: number[];
      page: number;
      pageSize: number;
    }
  ): Promise<PaginatedResponse<AffiliateTaskRecord>> {
    const visibility: Prisma.AffiliateTaskWhereInput[] = [];
    if (input.shopId) {
      visibility.push({ publisherType: "SHOP", publisherShopId: input.shopId });
    }
    if (input.merchantAccountIds.length > 0) {
      visibility.push({
        publisherType: "MERCHANT_ACCOUNT",
        publisherMerchantAccountId: { in: input.merchantAccountIds }
      });
    }
    const where: Prisma.AffiliateTaskWhereInput = {
      deletedAt: null,
      ...(visibility.length > 0
        ? { AND: [{ OR: visibility }, this.taskFilters(input)] }
        : { id: -1 })
    };
    return this.listTasks(where, input);
  }

  public async listBackofficeTasks(
    input: BackofficeAffiliateTaskListInput & { page: number; pageSize: number }
  ): Promise<PaginatedResponse<AffiliateTaskRecord>> {
    const where: Prisma.AffiliateTaskWhereInput = {
      deletedAt: null,
      ...this.taskFilters(input),
      ...(input.merchantAccountId
        ? { publisherMerchantAccountId: input.merchantAccountId }
        : {}),
      ...(input.shopId ? { publisherShopId: input.shopId } : {})
    };
    return this.listTasks(where, input);
  }

  public async markTaskSubmitted(input: {
    taskId: number;
    submittedAt: Date;
    reservedBudgetNdp: number;
  }): Promise<void> {
    await this.client.affiliateTask.update({
      where: { id: input.taskId },
      data: {
        status: "PENDING_REVIEW",
        submittedAt: input.submittedAt,
        reservedBudgetNdp: input.reservedBudgetNdp,
        lockVersion: { increment: 1 }
      }
    });
  }

  public async createBudgetReservation(input: {
    taskId: number;
    walletId: number;
    totalFrozenNdp: number;
    idempotencyKey: string;
  }): Promise<AffiliateBudgetReservationRecord> {
    const reservation = await this.client.affiliateBudgetReservation.create({
      data: input
    });
    return this.mapReservation(reservation);
  }

  public async createBudgetTransactionLink(input: {
    reservationId: number;
    ledgerTransactionId: number;
    kind: AffiliateBudgetTransactionKind;
    amountNdp: number;
  }): Promise<void> {
    await this.client.affiliateBudgetTransaction.create({
      data: {
        budgetReservationId: input.reservationId,
        ledgerTransactionId: input.ledgerTransactionId,
        amountNdp: input.amountNdp,
        kind: input.kind === "freeze" ? "FREEZE" : "RELEASE"
      }
    });
  }

  public async lockBudgetReservation(
    taskId: number
  ): Promise<AffiliateBudgetReservationRecord | null> {
    const rows = await this.client.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM affiliate_budget_reservations WHERE task_id = ${taskId} AND deleted_at IS NULL FOR UPDATE`
    );
    if (rows.length !== 1) {
      return null;
    }
    const reservation = await this.client.affiliateBudgetReservation.findFirst({
      where: { id: rows[0].id, deletedAt: null }
    });
    return reservation ? this.mapReservation(reservation) : null;
  }

  public async markTaskApproved(input: {
    taskId: number;
    status: "scheduled" | "active";
    reviewedById: number;
    reviewedAt: Date;
    activatedAt: Date | null;
  }): Promise<void> {
    await this.client.affiliateTask.update({
      where: { id: input.taskId },
      data: {
        status: input.status === "scheduled" ? "SCHEDULED" : "ACTIVE",
        reviewedById: input.reviewedById,
        reviewedAt: input.reviewedAt,
        rejectionReason: null,
        activatedAt: input.activatedAt,
        lockVersion: { increment: 1 }
      }
    });
  }

  public async markTaskRejected(input: {
    taskId: number;
    reviewedById: number;
    reviewedAt: Date;
    rejectionReason: string;
    releasedBudgetNdp: number;
  }): Promise<void> {
    await this.client.affiliateTask.update({
      where: { id: input.taskId },
      data: {
        status: "REJECTED",
        reviewedById: input.reviewedById,
        reviewedAt: input.reviewedAt,
        rejectionReason: input.rejectionReason,
        releasedBudgetNdp: input.releasedBudgetNdp,
        lockVersion: { increment: 1 }
      }
    });
  }

  public async releaseBudgetReservation(input: {
    reservationId: number;
    releasedNdp: number;
    releasedAt: Date;
  }): Promise<void> {
    await this.client.affiliateBudgetReservation.update({
      where: { id: input.reservationId },
      data: {
        releasedNdp: input.releasedNdp,
        releasedAt: input.releasedAt,
        status: "RELEASED"
      }
    });
  }

  public async createAuditLog(input: {
    actorUserId: number;
    action: string;
    taskId: number;
    metadata?: unknown;
  }): Promise<void> {
    await this.client.auditLog.create({
      data: {
        actorId: input.actorUserId,
        action: input.action,
        targetType: "affiliate_task",
        targetId: input.taskId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined
      }
    });
  }

  private async listTasks(
    where: Prisma.AffiliateTaskWhereInput,
    input: { page: number; pageSize: number }
  ): Promise<PaginatedResponse<AffiliateTaskRecord>> {
    const pagination = toPrismaPagination(input);
    const [tasks, total] = await Promise.all([
      this.client.affiliateTask.findMany({
        where,
        include: taskInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.client.affiliateTask.count({ where })
    ]);
    return buildPaginatedResponse(tasks.map((task) => this.mapTask(task)), total, input);
  }

  private taskFilters(input: AffiliateTaskListInput): Prisma.AffiliateTaskWhereInput {
    return {
      ...(input.status ? { status: this.statusToDb(input.status) } : {}),
      ...(input.publisherType
        ? { publisherType: this.publisherTypeToDb(input.publisherType) }
        : {}),
      ...(input.keyword?.trim()
        ? {
            OR: [
              { name: { contains: input.keyword.trim() } },
              { taskCode: { contains: input.keyword.trim() } }
            ]
          }
        : {})
    };
  }

  private editableData(input: AffiliateTaskEditableFields) {
    return {
      name: input.name,
      description: input.description,
      coverMediaAssetId: input.coverMediaAssetId,
      rewardNdpPerCompletedOrder: input.rewardNdpPerCompletedOrder,
      totalBudgetNdp: input.totalBudgetNdp,
      customerDiscountType: this.discountTypeToDb(input.customerDiscountType),
      fixedDiscountJpy: input.fixedDiscountJpy,
      discountRateBps: input.discountRateBps,
      discountCapJpy: input.discountCapJpy,
      minimumOrderAmountJpy: input.minimumOrderAmountJpy,
      claimStartsAt: input.claimStartsAt,
      claimEndsAt: input.claimEndsAt,
      taskStartsAt: input.taskStartsAt,
      taskEndsAt: input.taskEndsAt,
      attributionWindowDays: input.attributionWindowDays,
      maxCompletedOrdersPerClaim: input.maxCompletedOrdersPerClaim,
      maxCompletedOrdersPerCustomer: input.maxCompletedOrdersPerCustomer,
      serviceScopeMode: this.serviceScopeModeToDb(input.serviceScopeMode)
    };
  }

  private mapTask(task: AffiliateTaskDbRecord): AffiliateTaskRecord {
    return {
      id: task.id,
      taskCode: task.taskCode,
      lineageKey: task.lineageKey,
      version: task.version,
      lockVersion: task.lockVersion,
      publisherType: task.publisherType.toLowerCase() as AffiliatePublisherType,
      publisherMerchantAccountId: task.publisherMerchantAccountId,
      publisherShopId: task.publisherShopId,
      name: task.name,
      description: task.description,
      coverMediaAssetId: task.coverMediaAssetId,
      rewardNdpPerCompletedOrder: task.rewardNdpPerCompletedOrder,
      totalBudgetNdp: task.totalBudgetNdp,
      reservedBudgetNdp: task.reservedBudgetNdp,
      allocatedBudgetNdp: task.allocatedBudgetNdp,
      settledBudgetNdp: task.settledBudgetNdp,
      releasedBudgetNdp: task.releasedBudgetNdp,
      customerDiscountType: task.customerDiscountType.toLowerCase() as AffiliateDiscountType,
      fixedDiscountJpy: task.fixedDiscountJpy,
      discountRateBps: task.discountRateBps,
      discountCapJpy: task.discountCapJpy,
      minimumOrderAmountJpy: task.minimumOrderAmountJpy,
      claimStartsAt: task.claimStartsAt,
      claimEndsAt: task.claimEndsAt,
      taskStartsAt: task.taskStartsAt,
      taskEndsAt: task.taskEndsAt,
      attributionWindowDays: task.attributionWindowDays,
      maxCompletedOrdersPerClaim: task.maxCompletedOrdersPerClaim,
      maxCompletedOrdersPerCustomer: task.maxCompletedOrdersPerCustomer,
      serviceScopeMode: task.serviceScopeMode.toLowerCase() as AffiliateServiceScopeMode,
      status: task.status.toLowerCase() as AffiliateTaskStatus,
      reviewedById: task.reviewedById,
      reviewedAt: task.reviewedAt,
      rejectionReason: task.rejectionReason,
      submittedAt: task.submittedAt,
      activatedAt: task.activatedAt,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      shops: task.shops.map((shop) => ({
        id: shop.id,
        shopId: shop.shopId,
        shopNameSnapshot: shop.shopNameSnapshot
      })),
      services: task.services.map((service) => ({
        id: service.id,
        shopId: service.shopId,
        serviceId: service.serviceId,
        serviceNameSnapshot: service.serviceNameSnapshot,
        servicePriceJpySnapshot: service.servicePriceJpySnapshot
      })),
      budgetReservation:
        task.budgetReservation && !task.budgetReservation.deletedAt
          ? this.mapReservation(task.budgetReservation)
          : null
    };
  }

  private mapReservation(
    reservation: AffiliateBudgetReservationDbRecord
  ): AffiliateBudgetReservationRecord {
    return {
      id: reservation.id,
      taskId: reservation.taskId,
      walletId: reservation.walletId,
      totalFrozenNdp: reservation.totalFrozenNdp,
      allocatedNdp: reservation.allocatedNdp,
      capturedNdp: reservation.capturedNdp,
      releasedNdp: reservation.releasedNdp,
      status: reservation.status.toLowerCase() as AffiliateBudgetReservationRecord["status"],
      idempotencyKey: reservation.idempotencyKey,
      frozenAt: reservation.frozenAt,
      releasedAt: reservation.releasedAt
    };
  }

  private publisherTypeToDb(value: AffiliatePublisherType) {
    return value === "merchant_account" ? ("MERCHANT_ACCOUNT" as const) : ("SHOP" as const);
  }

  private discountTypeToDb(value: AffiliateDiscountType) {
    if (value === "fixed_jpy") {
      return "FIXED_JPY" as const;
    }
    return value === "percent" ? ("PERCENT" as const) : ("NONE" as const);
  }

  private serviceScopeModeToDb(value: AffiliateServiceScopeMode) {
    return value === "selected_services"
      ? ("SELECTED_SERVICES" as const)
      : ("ALL_CURRENT_SERVICES" as const);
  }

  private statusToDb(status: AffiliateTaskStatus) {
    const values = {
      draft: "DRAFT",
      pending_review: "PENDING_REVIEW",
      scheduled: "SCHEDULED",
      active: "ACTIVE",
      paused: "PAUSED",
      budget_exhausted: "BUDGET_EXHAUSTED",
      ended: "ENDED",
      cancelled: "CANCELLED",
      rejected: "REJECTED"
    } as const;
    return values[status];
  }

  private canStartTransaction(client: AffiliatePrismaClient): client is PrismaClient {
    return "$transaction" in client && typeof client.$transaction === "function";
  }
}
