import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  AffiliateClaimPersistenceInput,
  AffiliateClaimRecord,
  AffiliateClaimStatus,
  AffiliateClaimUniqueConflict,
  AffiliateClaimUniqueField,
  AffiliateMarketplaceListInput,
  AffiliateMarketplaceRepositoryPort,
  AffiliateMarketplaceTransactionClient
} from "../services/affiliate-marketplace.service";
import type {
  AffiliateBudgetReservationRecord,
  AffiliateDiscountType,
  AffiliatePublisherType,
  AffiliateServiceScopeMode,
  AffiliateTaskRecord
} from "../services/affiliate-task.service";
import type { AffiliateTaskStatus } from "../services/affiliate-state-machine.service";
import {
  buildPaginatedResponse,
  toPrismaPagination,
  type PaginatedResponse
} from "../utils/pagination";

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

const claimInclude = {
  task: { include: taskInclude }
} satisfies Prisma.AffiliateClaimInclude;

type AffiliateTaskDbRecord = Prisma.AffiliateTaskGetPayload<{
  include: typeof taskInclude;
}>;
type AffiliateClaimDbRecord = Prisma.AffiliateClaimGetPayload<{
  include: typeof claimInclude;
}>;
type AffiliateBudgetReservationDbRecord =
  Prisma.AffiliateBudgetReservationGetPayload<Record<string, never>>;

export class AffiliateMarketplaceRepository
  implements AffiliateMarketplaceRepositoryPort
{
  public constructor(private readonly client: AffiliatePrismaClient = prisma) {}

  public async runInTransaction<T>(
    handler: (
      repository: AffiliateMarketplaceRepositoryPort,
      transactionClient?: AffiliateMarketplaceTransactionClient
    ) => Promise<T>,
    transactionClient?: AffiliateMarketplaceTransactionClient
  ): Promise<T> {
    if (transactionClient) {
      return handler(
        new AffiliateMarketplaceRepository(
          transactionClient as AffiliatePrismaClient
        ),
        transactionClient
      );
    }
    if (this.canStartTransaction(this.client)) {
      return this.client.$transaction((tx) =>
        handler(new AffiliateMarketplaceRepository(tx), tx)
      );
    }
    return handler(this, this.client);
  }

  public async listClaimableTasks(
    input: AffiliateMarketplaceListInput & {
      now: Date;
      page: number;
      pageSize: number;
    }
  ): Promise<PaginatedResponse<AffiliateTaskRecord>> {
    const pagination = toPrismaPagination(input);
    const conditions = this.eligibilityConditions(input, input.now);
    const [idRows, totalRows] = await Promise.all([
      this.client.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`
          SELECT task.id
          FROM affiliate_tasks AS task
          INNER JOIN affiliate_budget_reservations AS reservation
            ON reservation.task_id = task.id
          WHERE ${Prisma.join(conditions, " AND ")}
          ORDER BY task.claim_ends_at ASC, task.created_at DESC, task.id DESC
          LIMIT ${pagination.take} OFFSET ${pagination.skip}
        `
      ),
      this.client.$queryRaw<Array<{ total: bigint | number }>>(
        Prisma.sql`
          SELECT COUNT(DISTINCT task.id) AS total
          FROM affiliate_tasks AS task
          INNER JOIN affiliate_budget_reservations AS reservation
            ON reservation.task_id = task.id
          WHERE ${Prisma.join(conditions, " AND ")}
        `
      )
    ]);
    const taskIds = idRows.map((row) => Number(row.id));
    const tasks = await this.loadTasks(taskIds);

    return buildPaginatedResponse(
      tasks,
      Number(totalRows[0]?.total ?? 0),
      input
    );
  }

  public async findClaimableTaskById(
    taskId: number,
    now: Date
  ): Promise<AffiliateTaskRecord | null> {
    const rows = await this.eligibleTaskIds({ page: 1, pageSize: 1 }, now, taskId);
    if (rows.length !== 1) {
      return null;
    }
    return this.findTaskById(rows[0]);
  }

  public async findTaskById(taskId: number): Promise<AffiliateTaskRecord | null> {
    const task = await this.client.affiliateTask.findFirst({
      where: { id: taskId, deletedAt: null },
      include: taskInclude
    });
    return task ? this.mapTask(task) : null;
  }

  public async lockClaimableTaskForShare(
    taskId: number,
    now: Date
  ): Promise<AffiliateTaskRecord | null> {
    const conditions = this.eligibilityConditions({}, now, taskId);
    const rows = await this.client.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`
        SELECT task.id
        FROM affiliate_tasks AS task
        INNER JOIN affiliate_budget_reservations AS reservation
          ON reservation.task_id = task.id
        WHERE ${Prisma.join(conditions, " AND ")}
        FOR SHARE
      `
    );
    return rows.length === 1 ? this.findTaskById(Number(rows[0].id)) : null;
  }

  public async findClaimByTaskAndUser(
    taskId: number,
    userId: number
  ): Promise<AffiliateClaimRecord | null> {
    const claim = await this.client.affiliateClaim.findFirst({
      where: { taskId, userId, deletedAt: null },
      include: claimInclude
    });
    return claim ? this.mapClaim(claim) : null;
  }

  public async createClaim(
    input: AffiliateClaimPersistenceInput
  ): Promise<AffiliateClaimRecord> {
    const claim = await this.client.affiliateClaim.create({
      data: input,
      include: claimInclude
    });
    return this.mapClaim(claim);
  }

  public classifyClaimUniqueConflict(
    error: unknown
  ): AffiliateClaimUniqueConflict | null {
    if (!error || typeof error !== "object" || !("code" in error)) {
      return null;
    }
    const record = error as { code?: unknown; meta?: { target?: unknown } };
    if (record.code !== "P2002") {
      return null;
    }
    const target = Array.isArray(record.meta?.target)
      ? record.meta.target.join(" ")
      : String(record.meta?.target ?? "");
    const fields: AffiliateClaimUniqueField[] = [
      "active_key",
      "public_code",
      "public_token_id"
    ];
    const field = fields.find((candidate) => target.includes(candidate));
    if (!field) {
      return null;
    }
    return Object.assign(new Error("affiliate claim unique conflict"), { field });
  }

  public async listClaimsByUser(input: {
    userId: number;
    status?: AffiliateClaimStatus;
    page: number;
    pageSize: number;
  }): Promise<PaginatedResponse<AffiliateClaimRecord>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.AffiliateClaimWhereInput = {
      userId: input.userId,
      deletedAt: null,
      ...(input.status ? { status: this.claimStatusToDb(input.status) } : {})
    };
    const [claims, total] = await Promise.all([
      this.client.affiliateClaim.findMany({
        where,
        include: claimInclude,
        orderBy: [{ claimedAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.client.affiliateClaim.count({ where })
    ]);
    return buildPaginatedResponse(
      claims.map((claim) => this.mapClaim(claim)),
      total,
      input
    );
  }

  public async findClaimByIdAndUser(
    claimId: number,
    userId: number
  ): Promise<AffiliateClaimRecord | null> {
    const claim = await this.client.affiliateClaim.findFirst({
      where: { id: claimId, userId, deletedAt: null },
      include: claimInclude
    });
    return claim ? this.mapClaim(claim) : null;
  }

  public async findClaimByPublicTokenId(
    publicTokenId: string
  ): Promise<AffiliateClaimRecord | null> {
    const claim = await this.client.affiliateClaim.findFirst({
      where: { publicTokenId, deletedAt: null },
      include: claimInclude
    });
    return claim ? this.mapClaim(claim) : null;
  }

  public async createClaimAuditLog(input: {
    actorUserId: number;
    claimId: number;
    taskId: number;
    publicCode: string;
  }): Promise<void> {
    await this.client.auditLog.create({
      data: {
        actorId: input.actorUserId,
        action: "affiliate.claim.created",
        targetType: "affiliate_claim",
        targetId: input.claimId,
        metadata: {
          taskId: input.taskId,
          publicCode: input.publicCode
        }
      }
    });
  }

  private async eligibleTaskIds(
    input: AffiliateMarketplaceListInput & { page: number; pageSize: number },
    now: Date,
    taskId?: number
  ): Promise<number[]> {
    const pagination = toPrismaPagination(input);
    const conditions = this.eligibilityConditions(input, now, taskId);
    const rows = await this.client.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`
        SELECT task.id
        FROM affiliate_tasks AS task
        INNER JOIN affiliate_budget_reservations AS reservation
          ON reservation.task_id = task.id
        WHERE ${Prisma.join(conditions, " AND ")}
        ORDER BY task.claim_ends_at ASC, task.created_at DESC, task.id DESC
        LIMIT ${pagination.take} OFFSET ${pagination.skip}
      `
    );
    return rows.map((row) => Number(row.id));
  }

  private eligibilityConditions(
    input: AffiliateMarketplaceListInput,
    now: Date,
    taskId?: number
  ): Prisma.Sql[] {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`task.deleted_at IS NULL`,
      Prisma.sql`task.status IN ('scheduled', 'active')`,
      Prisma.sql`task.claim_starts_at <= ${now}`,
      Prisma.sql`task.claim_ends_at > ${now}`,
      Prisma.sql`task.task_ends_at > ${now}`,
      Prisma.sql`reservation.deleted_at IS NULL`,
      Prisma.sql`reservation.status = 'active'`,
      Prisma.sql`(
        reservation.total_frozen_ndp
        - reservation.allocated_ndp
        - reservation.captured_ndp
        - reservation.released_ndp
      ) >= task.reward_ndp_per_completed_order`,
      Prisma.sql`EXISTS (
        SELECT 1 FROM affiliate_task_shops AS task_shop
        WHERE task_shop.task_id = task.id AND task_shop.deleted_at IS NULL
      )`,
      Prisma.sql`EXISTS (
        SELECT 1 FROM affiliate_task_services AS task_service
        WHERE task_service.task_id = task.id AND task_service.deleted_at IS NULL
      )`
    ];
    if (taskId) {
      conditions.push(Prisma.sql`task.id = ${taskId}`);
    }
    if (input.keyword?.trim()) {
      const keyword = `%${input.keyword.trim()}%`;
      conditions.push(
        Prisma.sql`(task.name LIKE ${keyword} OR task.task_code LIKE ${keyword})`
      );
    }
    if (input.shopId) {
      conditions.push(
        Prisma.sql`EXISTS (
          SELECT 1 FROM affiliate_task_shops AS filtered_shop
          WHERE filtered_shop.task_id = task.id
            AND filtered_shop.shop_id = ${input.shopId}
            AND filtered_shop.deleted_at IS NULL
        )`
      );
    }
    if (input.serviceId) {
      conditions.push(
        Prisma.sql`EXISTS (
          SELECT 1 FROM affiliate_task_services AS filtered_service
          WHERE filtered_service.task_id = task.id
            AND filtered_service.service_id = ${input.serviceId}
            AND filtered_service.deleted_at IS NULL
        )`
      );
    }
    if (input.customerDiscountType) {
      conditions.push(
        Prisma.sql`task.customer_discount_type = ${input.customerDiscountType}`
      );
    }
    return conditions;
  }

  private async loadTasks(taskIds: number[]): Promise<AffiliateTaskRecord[]> {
    if (taskIds.length === 0) {
      return [];
    }
    const tasks = await this.client.affiliateTask.findMany({
      where: { id: { in: taskIds }, deletedAt: null },
      include: taskInclude
    });
    const taskById = new Map(tasks.map((task) => [task.id, this.mapTask(task)]));
    return taskIds.flatMap((taskId) => {
      const task = taskById.get(taskId);
      return task ? [task] : [];
    });
  }

  private mapClaim(claim: AffiliateClaimDbRecord): AffiliateClaimRecord {
    return {
      id: claim.id,
      taskId: claim.taskId,
      userId: claim.userId,
      activeKey: claim.activeKey ?? "",
      publicCode: claim.publicCode,
      publicTokenId: claim.publicTokenId,
      tokenHash: claim.tokenHash,
      status: claim.status.toLowerCase() as AffiliateClaimStatus,
      claimedAt: claim.claimedAt,
      expiresAt: claim.expiresAt,
      clickCount: claim.clickCount,
      codeUseCount: claim.codeUseCount,
      attributedOrderCount: claim.attributedOrderCount,
      completedOrderCount: claim.completedOrderCount,
      settledRewardNdp: claim.settledRewardNdp,
      createdAt: claim.createdAt,
      updatedAt: claim.updatedAt,
      task: this.mapTask(claim.task)
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
      customerDiscountType:
        task.customerDiscountType.toLowerCase() as AffiliateDiscountType,
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
      serviceScopeMode:
        task.serviceScopeMode.toLowerCase() as AffiliateServiceScopeMode,
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
      status:
        reservation.status.toLowerCase() as AffiliateBudgetReservationRecord["status"],
      idempotencyKey: reservation.idempotencyKey,
      frozenAt: reservation.frozenAt,
      releasedAt: reservation.releasedAt
    };
  }

  private claimStatusToDb(status: AffiliateClaimStatus) {
    const values = {
      active: "ACTIVE",
      expired: "EXPIRED",
      revoked: "REVOKED"
    } as const;
    return values[status];
  }

  private canStartTransaction(
    client: AffiliatePrismaClient
  ): client is PrismaClient {
    return "$transaction" in client && typeof client.$transaction === "function";
  }
}
