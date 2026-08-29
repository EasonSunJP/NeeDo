import { randomUUID } from "crypto";
import {
  CONTENT_LOCALES,
  initializeContentTranslations,
  type ContentLocaleCode
} from "../constants/content-locales";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import {
  calculateAffiliateUnallocatedBudget,
  transitionAffiliateTask,
  type AffiliateTaskStatus
} from "./affiliate-state-machine.service";
import type { AuthenticatedAccessContext } from "./auth.service";
import type {
  AffiliateBudgetLedgerResult,
  FreezeAffiliateTaskBudgetInput,
  LedgerMutationContext,
  ReleaseAffiliateTaskBudgetInput
} from "./ledger.service";

export type AffiliatePublisherType = "merchant_account" | "shop";
export type AffiliateDiscountType = "none" | "fixed_jpy" | "percent";
export type AffiliateServiceScopeMode = "all_current_services" | "selected_services";
export type AffiliateBudgetStatus = "active" | "released" | "exhausted";
export type AffiliateBudgetTransactionKind = "freeze" | "release";
export type AffiliateTaskTransactionClient = unknown;

export interface AffiliateTaskTranslationPayload {
  name: string;
  description: string | null;
  sourceLocale: ContentLocaleCode;
  isInitialCopy: boolean;
}

export type AffiliateTaskTranslations = Record<
  ContentLocaleCode,
  AffiliateTaskTranslationPayload
>;

export interface AffiliateShopScopeRecord {
  id: number;
  name: string;
}

export interface AffiliateServiceScopeRecord {
  id: number;
  shopId: number;
  name: string;
  priceJpy: number;
}

export interface AffiliateTaskShopSnapshot {
  id: number;
  shopId: number;
  shopNameSnapshot: string;
}

export interface AffiliateTaskServiceSnapshot {
  id: number;
  shopId: number;
  serviceId: number;
  serviceNameSnapshot: string;
  servicePriceJpySnapshot: number;
}

export interface AffiliateBudgetReservationRecord {
  id: number;
  taskId: number;
  walletId: number;
  totalFrozenNdp: number;
  allocatedNdp: number;
  capturedNdp: number;
  releasedNdp: number;
  status: AffiliateBudgetStatus;
  idempotencyKey: string;
  frozenAt: Date;
  releasedAt: Date | null;
}

export interface AffiliateTaskEditableFields {
  name: string;
  description: string | null;
  coverMediaAssetId: number | null;
  rewardNdpPerCompletedOrder: number;
  totalBudgetNdp: number;
  customerDiscountType: AffiliateDiscountType;
  fixedDiscountJpy: number;
  discountRateBps: number;
  discountCapJpy: number;
  minimumOrderAmountJpy: number;
  claimStartsAt: Date;
  claimEndsAt: Date;
  taskStartsAt: Date;
  taskEndsAt: Date;
  attributionWindowDays: number;
  maxCompletedOrdersPerClaim: number | null;
  maxCompletedOrdersPerCustomer: number | null;
  serviceScopeMode: AffiliateServiceScopeMode;
}

interface AffiliateTaskScopeInput {
  selectedServiceIds: number[];
}

export type CreateAffiliateTaskInput =
  | (AffiliateTaskEditableFields &
      AffiliateTaskScopeInput & {
        publisherType: "shop";
        sourceLocale?: ContentLocaleCode;
      })
  | (AffiliateTaskEditableFields &
      AffiliateTaskScopeInput & {
        publisherType: "merchant_account";
        merchantAccountId: number;
        shopIds: number[];
        sourceLocale?: ContentLocaleCode;
      });

export type UpdateAffiliateTaskInput = AffiliateTaskEditableFields &
  AffiliateTaskScopeInput & {
    lockVersion: number;
    shopIds?: number[];
  };

export interface AffiliateTaskPersistenceInput extends AffiliateTaskEditableFields {
  taskCode: string;
  lineageKey: string;
  publisherType: AffiliatePublisherType;
  publisherMerchantAccountId: number | null;
  publisherShopId: number | null;
  translations: AffiliateTaskTranslations;
}

export interface UpdateAffiliateTaskPersistenceInput {
  taskId: number;
  lockVersion: number;
  fields: AffiliateTaskEditableFields;
}

export interface UpdateAffiliateTaskTranslationInput {
  lockVersion: number;
  name: string;
  description: string | null;
  syncToAll: boolean;
}

export interface UpdateAffiliateTaskTranslationPersistenceInput {
  taskId: number;
  locale: ContentLocaleCode;
  lockVersion: number;
  name: string;
  description: string | null;
  syncToAll: boolean;
}

export interface AffiliateTaskRecord extends AffiliateTaskPersistenceInput {
  id: number;
  version: number;
  lockVersion: number;
  status: AffiliateTaskStatus;
  reservedBudgetNdp: number;
  allocatedBudgetNdp: number;
  settledBudgetNdp: number;
  releasedBudgetNdp: number;
  reviewedById: number | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  submittedAt: Date | null;
  activatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  shops: AffiliateTaskShopSnapshot[];
  services: AffiliateTaskServiceSnapshot[];
  budgetReservation: AffiliateBudgetReservationRecord | null;
}

export interface AffiliateTaskListInput extends PaginationInput {
  status?: AffiliateTaskStatus;
  publisherType?: AffiliatePublisherType;
  keyword?: string;
}

export interface BackofficeAffiliateTaskListInput extends AffiliateTaskListInput {
  merchantAccountId?: number;
  shopId?: number;
}

export interface AffiliateBudgetLedgerPort {
  freezeAffiliateTaskBudget: (
    input: FreezeAffiliateTaskBudgetInput,
    context?: LedgerMutationContext
  ) => Promise<AffiliateBudgetLedgerResult>;
  releaseAffiliateTaskBudget: (
    input: ReleaseAffiliateTaskBudgetInput,
    context?: LedgerMutationContext
  ) => Promise<AffiliateBudgetLedgerResult>;
}

export interface AffiliateTaskRepositoryPort {
  runInTransaction: <T>(
    handler: (
      repository: AffiliateTaskRepositoryPort,
      transactionClient?: AffiliateTaskTransactionClient
    ) => Promise<T>,
    transactionClient?: AffiliateTaskTransactionClient
  ) => Promise<T>;
  getManageableMerchantAccountIds: (userId: number) => Promise<number[]>;
  findActiveShopsByIds: (shopIds: number[], now?: Date) => Promise<AffiliateShopScopeRecord[]>;
  findActiveMerchantShops: (
    merchantAccountId: number,
    shopIds: number[],
    now?: Date
  ) => Promise<AffiliateShopScopeRecord[]>;
  findEligibleServices: (input: {
    shopIds: number[];
    selectedServiceIds?: number[];
  }) => Promise<AffiliateServiceScopeRecord[]>;
  createTask: (input: AffiliateTaskPersistenceInput) => Promise<AffiliateTaskRecord>;
  updateDraftTask: (
    input: UpdateAffiliateTaskPersistenceInput
  ) => Promise<AffiliateTaskRecord | null>;
  updateDraftTranslation: (
    input: UpdateAffiliateTaskTranslationPersistenceInput
  ) => Promise<AffiliateTaskRecord | null>;
  replaceTaskScopeSnapshots: (input: {
    taskId: number;
    shops: AffiliateShopScopeRecord[];
    services: AffiliateServiceScopeRecord[];
  }) => Promise<void>;
  findTaskById: (taskId: number) => Promise<AffiliateTaskRecord | null>;
  lockTask: (taskId: number) => Promise<AffiliateTaskRecord | null>;
  listPublisherTasks: (
    input: AffiliateTaskListInput & {
      shopId?: number;
      merchantAccountIds: number[];
      page: number;
      pageSize: number;
    }
  ) => Promise<PaginatedResponse<AffiliateTaskRecord>>;
  listBackofficeTasks: (
    input: BackofficeAffiliateTaskListInput & { page: number; pageSize: number }
  ) => Promise<PaginatedResponse<AffiliateTaskRecord>>;
  markTaskSubmitted: (input: {
    taskId: number;
    submittedAt: Date;
    reservedBudgetNdp: number;
  }) => Promise<void>;
  createBudgetReservation: (input: {
    taskId: number;
    walletId: number;
    totalFrozenNdp: number;
    idempotencyKey: string;
  }) => Promise<AffiliateBudgetReservationRecord>;
  createBudgetTransactionLink: (input: {
    reservationId: number;
    ledgerTransactionId: number;
    kind: AffiliateBudgetTransactionKind;
    amountNdp: number;
  }) => Promise<void>;
  lockBudgetReservation: (taskId: number) => Promise<AffiliateBudgetReservationRecord | null>;
  markTaskApproved: (input: {
    taskId: number;
    status: "scheduled" | "active";
    reviewedById: number;
    reviewedAt: Date;
    activatedAt: Date | null;
  }) => Promise<void>;
  markTaskRejected: (input: {
    taskId: number;
    reviewedById: number;
    reviewedAt: Date;
    rejectionReason: string;
    releasedBudgetNdp: number;
  }) => Promise<void>;
  releaseBudgetReservation: (input: {
    reservationId: number;
    releasedNdp: number;
    releasedAt: Date;
  }) => Promise<void>;
  createAuditLog: (input: {
    actorUserId: number;
    action: string;
    taskId: number;
    metadata?: unknown;
  }) => Promise<void>;
}

interface AffiliateTaskServiceOptions {
  now?: () => Date;
  createTaskCode?: () => string;
}

interface ResolvedTaskScope {
  shops: AffiliateShopScopeRecord[];
  services: AffiliateServiceScopeRecord[];
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export class AffiliateTaskService {
  private readonly now: () => Date;
  private readonly createTaskCode: () => string;

  public constructor(
    private readonly repository: AffiliateTaskRepositoryPort,
    private readonly ledger: AffiliateBudgetLedgerPort,
    options: AffiliateTaskServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.createTaskCode = options.createTaskCode ?? (() => `AFF-${randomUUID()}`);
  }

  public createDraft(
    actor: AuthenticatedAccessContext,
    input: CreateAffiliateTaskInput
  ): Promise<AffiliateTaskRecord> {
    return this.repository.runInTransaction(async (repository) => {
      const fields = this.normalizeAndValidateFields(input);
      const publisher = await this.resolveCreatePublisher(repository, actor, input);
      const scope = await this.resolveScope(repository, {
        publisherType: input.publisherType,
        merchantAccountId:
          input.publisherType === "merchant_account" ? input.merchantAccountId : null,
        shopIds: publisher.shopIds,
        serviceScopeMode: fields.serviceScopeMode,
        selectedServiceIds: input.selectedServiceIds
      });
      const taskCode = this.createTaskCode();
      const sourceLocale = input.sourceLocale ?? "zh-CN";
      const initialized = initializeContentTranslations(sourceLocale, {
        name: fields.name,
        description: fields.description
      });
      const translations = Object.fromEntries(
        CONTENT_LOCALES.map((locale) => [
          locale,
          {
            ...initialized[locale],
            sourceLocale,
            isInitialCopy: locale !== sourceLocale
          }
        ])
      ) as AffiliateTaskTranslations;
      const created = await repository.createTask({
        ...fields,
        taskCode,
        lineageKey: taskCode,
        publisherType: input.publisherType,
        publisherMerchantAccountId:
          input.publisherType === "merchant_account" ? input.merchantAccountId : null,
        publisherShopId: input.publisherType === "shop" ? publisher.shopIds[0] : null,
        translations
      });
      await repository.replaceTaskScopeSnapshots({ taskId: created.id, ...scope });
      await repository.createAuditLog({
        actorUserId: actor.userId,
        action: "affiliate.task.draft_created",
        taskId: created.id,
        metadata: {
          publisherType: created.publisherType,
          publisherMerchantAccountId: created.publisherMerchantAccountId,
          publisherShopId: created.publisherShopId
        }
      });

      return this.requireTask(await repository.findTaskById(created.id));
    });
  }

  public updateDraft(
    actor: AuthenticatedAccessContext,
    taskId: number,
    input: UpdateAffiliateTaskInput
  ): Promise<AffiliateTaskRecord> {
    return this.repository.runInTransaction(async (repository) => {
      const task = this.requireTask(await repository.findTaskById(taskId));
      await this.assertPublisherAccess(repository, actor, task);
      if (task.status !== "draft") {
        throw this.invalidStateError("error.affiliate.task_not_editable");
      }
      if (task.publisherType === "shop" && input.shopIds !== undefined) {
        throw this.publisherScopeError();
      }

      const fields = this.normalizeAndValidateFields(input);
      const shopIds =
        task.publisherType === "shop"
          ? [this.requirePublisherShopId(task)]
          : this.uniquePositiveIds(input.shopIds ?? []);
      const scope = await this.resolveScope(repository, {
        publisherType: task.publisherType,
        merchantAccountId: task.publisherMerchantAccountId,
        shopIds,
        serviceScopeMode: fields.serviceScopeMode,
        selectedServiceIds: input.selectedServiceIds
      });
      const updated = await repository.updateDraftTask({
        taskId,
        lockVersion: input.lockVersion,
        fields
      });

      if (!updated) {
        throw this.conflictError();
      }

      await repository.replaceTaskScopeSnapshots({ taskId, ...scope });
      await repository.createAuditLog({
        actorUserId: actor.userId,
        action: "affiliate.task.draft_updated",
        taskId,
        metadata: { lockVersion: updated.lockVersion }
      });

      return this.requireTask(await repository.findTaskById(taskId));
    });
  }

  public updateDraftLocale(
    actor: AuthenticatedAccessContext,
    taskId: number,
    locale: ContentLocaleCode,
    input: UpdateAffiliateTaskTranslationInput
  ): Promise<AffiliateTaskRecord> {
    return this.repository.runInTransaction(async (repository) => {
      const task = this.requireTask(await repository.findTaskById(taskId));
      await this.assertPublisherAccess(repository, actor, task);
      if (task.status !== "draft") {
        throw this.invalidStateError("error.affiliate.task_not_editable");
      }

      const name = input.name.trim();
      const description = input.description?.trim() || null;
      if (!name || name.length > 160 || (description?.length ?? 0) > 10_000) {
        throw this.validationError("error.affiliate.task_translation_invalid");
      }
      const updated = await repository.updateDraftTranslation({
        taskId,
        locale,
        lockVersion: input.lockVersion,
        name,
        description,
        syncToAll: input.syncToAll
      });
      if (!updated) {
        throw this.conflictError();
      }

      await repository.createAuditLog({
        actorUserId: actor.userId,
        action: "affiliate.task.translation_updated",
        taskId,
        metadata: { locale, syncToAll: input.syncToAll, lockVersion: updated.lockVersion }
      });
      return this.requireTask(await repository.findTaskById(taskId));
    });
  }

  public async listPublisherTasks(
    actor: AuthenticatedAccessContext,
    input: AffiliateTaskListInput
  ): Promise<PaginatedResponse<AffiliateTaskRecord>> {
    const merchantAccountIds = await this.repository.getManageableMerchantAccountIds(
      actor.userId
    );
    const shopId =
      actor.currentIdentityScopeType === "shop" && actor.currentIdentityScopeId
        ? actor.currentIdentityScopeId
        : undefined;
    const page = this.normalizePage(input.page);
    const pageSize = this.normalizePageSize(input.pageSize);

    return this.repository.listPublisherTasks({
      ...input,
      ...(shopId ? { shopId } : {}),
      merchantAccountIds,
      page,
      pageSize
    });
  }

  public async getPublisherTask(
    actor: AuthenticatedAccessContext,
    taskId: number
  ): Promise<AffiliateTaskRecord> {
    const task = this.requireTask(await this.repository.findTaskById(taskId));
    await this.assertPublisherAccess(this.repository, actor, task);
    return task;
  }

  public submit(
    actor: AuthenticatedAccessContext,
    taskId: number
  ): Promise<AffiliateTaskRecord> {
    return this.repository.runInTransaction(async (repository, transactionClient) => {
      const task = this.requireTask(await repository.lockTask(taskId));
      await this.assertPublisherAccess(repository, actor, task);

      if (task.status === "pending_review" && task.budgetReservation) {
        return task;
      }
      if (task.status !== "draft") {
        throw this.invalidStateError();
      }
      if (!this.hasCompleteTranslations(task.translations)) {
        throw this.invalidStateError("error.affiliate.task_translations_incomplete");
      }

      const currentTime = this.now();
      if (currentTime >= task.taskEndsAt) {
        throw this.invalidStateError("error.affiliate.task_window_expired");
      }

      const shopIds = task.shops.map((shop) => shop.shopId);
      const scope = await this.resolveScope(repository, {
        publisherType: task.publisherType,
        merchantAccountId: task.publisherMerchantAccountId,
        shopIds,
        serviceScopeMode: task.serviceScopeMode,
        selectedServiceIds:
          task.serviceScopeMode === "selected_services"
            ? task.services.map((service) => service.serviceId)
            : []
      });
      await repository.replaceTaskScopeSnapshots({ taskId, ...scope });

      const transition = transitionAffiliateTask(
        task.status,
        "submit",
        this.transitionContext(task, currentTime, {
          totalFrozenNdp: task.totalBudgetNdp,
          allocatedNdp: 0,
          capturedNdp: 0,
          releasedNdp: 0
        })
      );
      if (!transition.ok || transition.status !== "pending_review") {
        throw this.invalidStateError();
      }

      const reservationKey = `affiliate-task:${task.id}:v${task.version}:reservation`;
      const ledgerResult = await this.ledger.freezeAffiliateTaskBudget(
        {
          taskId: task.id,
          ownerType: task.publisherType,
          ownerId: this.publisherOwnerId(task),
          amountNdp: task.totalBudgetNdp,
          idempotencyKey: `affiliate-task:${task.id}:v${task.version}:freeze`,
          actorUserId: actor.userId
        },
        { transactionClient }
      );
      const reservation = await repository.createBudgetReservation({
        taskId,
        walletId: ledgerResult.walletId,
        totalFrozenNdp: task.totalBudgetNdp,
        idempotencyKey: reservationKey
      });
      await repository.createBudgetTransactionLink({
        reservationId: reservation.id,
        ledgerTransactionId: ledgerResult.transaction.id,
        kind: "freeze",
        amountNdp: task.totalBudgetNdp
      });
      await repository.markTaskSubmitted({
        taskId,
        submittedAt: currentTime,
        reservedBudgetNdp: task.totalBudgetNdp
      });
      await repository.createAuditLog({
        actorUserId: actor.userId,
        action: "affiliate.task.submitted",
        taskId,
        metadata: {
          reservationId: reservation.id,
          ledgerTransactionId: ledgerResult.transaction.id,
          totalBudgetNdp: task.totalBudgetNdp
        }
      });

      return this.requireTask(await repository.findTaskById(taskId));
    });
  }

  public approve(
    actor: AuthenticatedAccessContext,
    taskId: number
  ): Promise<AffiliateTaskRecord> {
    this.assertBackofficeActor(actor);
    return this.repository.runInTransaction(async (repository) => {
      const task = this.requireTask(await repository.lockTask(taskId));

      if (task.status === "scheduled" || task.status === "active") {
        return task;
      }
      if (task.status !== "pending_review" || !task.budgetReservation) {
        throw this.invalidStateError();
      }

      const reviewedAt = this.now();
      const transition = transitionAffiliateTask(
        task.status,
        "approve",
        this.transitionContext(task, reviewedAt, task.budgetReservation)
      );
      if (
        !transition.ok ||
        (transition.status !== "scheduled" && transition.status !== "active")
      ) {
        throw this.invalidStateError("error.affiliate.task_window_expired");
      }

      await repository.markTaskApproved({
        taskId,
        status: transition.status,
        reviewedById: actor.userId,
        reviewedAt,
        activatedAt: transition.status === "active" ? reviewedAt : null
      });
      await repository.createAuditLog({
        actorUserId: actor.userId,
        action: "affiliate.task.approved",
        taskId,
        metadata: { status: transition.status }
      });

      return this.requireTask(await repository.findTaskById(taskId));
    });
  }

  public reject(
    actor: AuthenticatedAccessContext,
    taskId: number,
    reasonInput: string
  ): Promise<AffiliateTaskRecord> {
    this.assertBackofficeActor(actor);
    const reason = reasonInput.trim();
    if (!reason || reason.length > 500) {
      throw this.validationError("error.affiliate.rejection_reason_invalid");
    }

    return this.repository.runInTransaction(async (repository, transactionClient) => {
      const task = this.requireTask(await repository.lockTask(taskId));
      if (task.status === "rejected" && task.budgetReservation?.status === "released") {
        return task;
      }
      if (task.status !== "pending_review") {
        throw this.invalidStateError();
      }

      const reservation = await repository.lockBudgetReservation(taskId);
      if (!reservation || reservation.status !== "active") {
        throw this.invalidStateError("error.affiliate.budget_reservation_invalid");
      }
      const releaseAmount = calculateAffiliateUnallocatedBudget({
        totalFrozenNdp: reservation.totalFrozenNdp,
        allocatedNdp: reservation.allocatedNdp,
        capturedNdp: reservation.capturedNdp,
        releasedNdp: reservation.releasedNdp
      });
      if (releaseAmount !== reservation.totalFrozenNdp) {
        throw this.invalidStateError("error.affiliate.review_requires_unallocated_budget");
      }

      const transition = transitionAffiliateTask(
        task.status,
        "reject",
        this.transitionContext(task, this.now(), reservation)
      );
      if (!transition.ok || transition.status !== "rejected") {
        throw this.invalidStateError();
      }

      const reviewedAt = this.now();
      const ledgerResult = await this.ledger.releaseAffiliateTaskBudget(
        {
          taskId,
          walletId: reservation.walletId,
          ownerType: task.publisherType,
          ownerId: this.publisherOwnerId(task),
          amountNdp: releaseAmount,
          idempotencyKey: `affiliate-task:${task.id}:v${task.version}:release:rejected`,
          actorUserId: actor.userId
        },
        { transactionClient }
      );
      await repository.createBudgetTransactionLink({
        reservationId: reservation.id,
        ledgerTransactionId: ledgerResult.transaction.id,
        kind: "release",
        amountNdp: releaseAmount
      });
      await repository.releaseBudgetReservation({
        reservationId: reservation.id,
        releasedNdp: releaseAmount,
        releasedAt: reviewedAt
      });
      await repository.markTaskRejected({
        taskId,
        reviewedById: actor.userId,
        reviewedAt,
        rejectionReason: reason,
        releasedBudgetNdp: releaseAmount
      });
      await repository.createAuditLog({
        actorUserId: actor.userId,
        action: "affiliate.task.rejected",
        taskId,
        metadata: {
          reason,
          releasedBudgetNdp: releaseAmount,
          ledgerTransactionId: ledgerResult.transaction.id
        }
      });

      return this.requireTask(await repository.findTaskById(taskId));
    });
  }

  public listBackofficeTasks(
    actor: AuthenticatedAccessContext,
    input: BackofficeAffiliateTaskListInput
  ): Promise<PaginatedResponse<AffiliateTaskRecord>> {
    this.assertBackofficeActor(actor);
    return this.repository.listBackofficeTasks({
      ...input,
      page: this.normalizePage(input.page),
      pageSize: this.normalizePageSize(input.pageSize)
    });
  }

  public async getBackofficeTask(
    actor: AuthenticatedAccessContext,
    taskId: number
  ): Promise<AffiliateTaskRecord> {
    this.assertBackofficeActor(actor);
    return this.requireTask(await this.repository.findTaskById(taskId));
  }

  private async resolveCreatePublisher(
    repository: AffiliateTaskRepositoryPort,
    actor: AuthenticatedAccessContext,
    input: CreateAffiliateTaskInput
  ): Promise<{ shopIds: number[] }> {
    if (input.publisherType === "shop") {
      const shopId = this.currentShopId(actor);
      const shops = await repository.findActiveShopsByIds([shopId], this.now());
      if (shops.length !== 1) {
        throw this.publisherScopeError();
      }
      return { shopIds: [shopId] };
    }

    await this.assertMerchantAccountAccess(repository, actor.userId, input.merchantAccountId);
    return { shopIds: this.uniquePositiveIds(input.shopIds) };
  }

  private async resolveScope(
    repository: AffiliateTaskRepositoryPort,
    input: {
      publisherType: AffiliatePublisherType;
      merchantAccountId: number | null;
      shopIds: number[];
      serviceScopeMode: AffiliateServiceScopeMode;
      selectedServiceIds: number[];
    }
  ): Promise<ResolvedTaskScope> {
    const shopIds = this.uniquePositiveIds(input.shopIds);
    if (shopIds.length === 0) {
      throw this.publisherScopeError();
    }

    const shops =
      input.publisherType === "merchant_account"
        ? await repository.findActiveMerchantShops(
            this.requireMerchantAccountId(input.merchantAccountId),
            shopIds,
            this.now()
          )
        : await repository.findActiveShopsByIds(shopIds, this.now());
    if (shops.length !== shopIds.length) {
      throw this.publisherScopeError();
    }

    const selectedServiceIds = this.uniquePositiveIds(input.selectedServiceIds);
    if (
      input.serviceScopeMode === "all_current_services" &&
      selectedServiceIds.length > 0
    ) {
      throw this.validationError("error.affiliate.service_scope_invalid");
    }
    if (
      input.serviceScopeMode === "selected_services" &&
      selectedServiceIds.length !== input.selectedServiceIds.length
    ) {
      throw this.validationError("error.affiliate.service_scope_invalid");
    }
    if (input.serviceScopeMode === "selected_services" && selectedServiceIds.length === 0) {
      throw this.validationError("error.affiliate.service_scope_invalid");
    }

    const services = await repository.findEligibleServices({
      shopIds,
      ...(input.serviceScopeMode === "selected_services"
        ? { selectedServiceIds }
        : {})
    });
    if (
      services.length === 0 ||
      (input.serviceScopeMode === "selected_services" &&
        services.length !== selectedServiceIds.length)
    ) {
      throw this.validationError("error.affiliate.service_scope_invalid");
    }

    return { shops, services };
  }

  private async assertPublisherAccess(
    repository: AffiliateTaskRepositoryPort,
    actor: AuthenticatedAccessContext,
    task: AffiliateTaskRecord
  ): Promise<void> {
    if (task.publisherType === "shop") {
      if (
        actor.currentIdentityScopeType !== "shop" ||
        actor.currentIdentityScopeId !== task.publisherShopId
      ) {
        throw this.notFoundError();
      }
      return;
    }

    try {
      await this.assertMerchantAccountAccess(
        repository,
        actor.userId,
        this.requireMerchantAccountId(task.publisherMerchantAccountId)
      );
    } catch {
      throw this.notFoundError();
    }
  }

  private async assertMerchantAccountAccess(
    repository: AffiliateTaskRepositoryPort,
    userId: number,
    merchantAccountId: number
  ): Promise<void> {
    const manageableIds = await repository.getManageableMerchantAccountIds(userId);
    if (!manageableIds.includes(merchantAccountId)) {
      throw this.publisherScopeError();
    }
  }

  private normalizeAndValidateFields(
    input: AffiliateTaskEditableFields
  ): AffiliateTaskEditableFields {
    const fields: AffiliateTaskEditableFields = {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      coverMediaAssetId: input.coverMediaAssetId,
      rewardNdpPerCompletedOrder: input.rewardNdpPerCompletedOrder,
      totalBudgetNdp: input.totalBudgetNdp,
      customerDiscountType: input.customerDiscountType,
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
      serviceScopeMode: input.serviceScopeMode
    };

    if (!fields.name || fields.name.length > 160) {
      throw this.validationError("error.affiliate.task_name_invalid");
    }
    if (
      !Number.isInteger(fields.rewardNdpPerCompletedOrder) ||
      fields.rewardNdpPerCompletedOrder <= 0 ||
      !Number.isInteger(fields.totalBudgetNdp) ||
      fields.totalBudgetNdp < fields.rewardNdpPerCompletedOrder
    ) {
      throw this.validationError("error.affiliate.budget_invalid");
    }
    if (!this.hasValidDiscount(fields)) {
      throw this.validationError("error.affiliate.discount_invalid");
    }
    if (
      !Number.isInteger(fields.minimumOrderAmountJpy) ||
      fields.minimumOrderAmountJpy < 0 ||
      !Number.isInteger(fields.attributionWindowDays) ||
      fields.attributionWindowDays < 1 ||
      fields.attributionWindowDays > 365 ||
      !this.isOptionalPositiveInteger(fields.maxCompletedOrdersPerClaim) ||
      !this.isOptionalPositiveInteger(fields.maxCompletedOrdersPerCustomer)
    ) {
      throw this.validationError("error.affiliate.task_limits_invalid");
    }
    if (
      fields.taskStartsAt >= fields.taskEndsAt ||
      fields.claimStartsAt < fields.taskStartsAt ||
      fields.claimStartsAt >= fields.claimEndsAt ||
      fields.claimEndsAt > fields.taskEndsAt
    ) {
      throw this.validationError("error.affiliate.task_window_invalid");
    }

    return fields;
  }

  private hasValidDiscount(fields: AffiliateTaskEditableFields): boolean {
    const valuesAreNonNegativeIntegers = [
      fields.fixedDiscountJpy,
      fields.discountRateBps,
      fields.discountCapJpy
    ].every((value) => Number.isInteger(value) && value >= 0);
    if (!valuesAreNonNegativeIntegers) {
      return false;
    }
    if (fields.customerDiscountType === "none") {
      return (
        fields.fixedDiscountJpy === 0 &&
        fields.discountRateBps === 0 &&
        fields.discountCapJpy === 0
      );
    }
    if (fields.customerDiscountType === "fixed_jpy") {
      return (
        fields.fixedDiscountJpy > 0 &&
        fields.discountRateBps === 0 &&
        fields.discountCapJpy === 0
      );
    }
    return (
      fields.fixedDiscountJpy === 0 &&
      fields.discountRateBps >= 1 &&
      fields.discountRateBps <= 10_000 &&
      fields.discountCapJpy > 0
    );
  }

  private hasCompleteTranslations(translations: AffiliateTaskTranslations): boolean {
    return CONTENT_LOCALES.every((locale) => {
      const translation = translations[locale];
      return (
        Boolean(translation) &&
        Boolean(translation.name.trim()) &&
        translation.name.length <= 160 &&
        (translation.description?.length ?? 0) <= 10_000
      );
    });
  }

  private isOptionalPositiveInteger(value: number | null): boolean {
    return value === null || (Number.isInteger(value) && value > 0);
  }

  private transitionContext(
    task: AffiliateTaskRecord,
    now: Date,
    budget: {
      totalFrozenNdp: number;
      allocatedNdp: number;
      capturedNdp: number;
      releasedNdp: number;
    }
  ) {
    return {
      now,
      startsAt: task.taskStartsAt,
      endsAt: task.taskEndsAt,
      rewardNdpPerCompletedOrder: task.rewardNdpPerCompletedOrder,
      budget
    };
  }

  private publisherOwnerId(task: AffiliateTaskRecord): number {
    return task.publisherType === "shop"
      ? this.requirePublisherShopId(task)
      : this.requireMerchantAccountId(task.publisherMerchantAccountId);
  }

  private currentShopId(actor: AuthenticatedAccessContext): number {
    if (actor.currentIdentityScopeType === "shop" && actor.currentIdentityScopeId) {
      return actor.currentIdentityScopeId;
    }
    throw this.publisherScopeError();
  }

  private requirePublisherShopId(task: AffiliateTaskRecord): number {
    if (task.publisherShopId) {
      return task.publisherShopId;
    }
    throw this.publisherScopeError();
  }

  private requireMerchantAccountId(value: number | null): number {
    if (value) {
      return value;
    }
    throw this.publisherScopeError();
  }

  private uniquePositiveIds(ids: number[]): number[] {
    if (!ids.every((id) => Number.isInteger(id) && id > 0)) {
      throw this.validationError("error.affiliate.scope_id_invalid");
    }
    return [...new Set(ids)];
  }

  private normalizePage(value: number | undefined): number {
    return Number.isInteger(value) && (value ?? 0) > 0 ? (value as number) : DEFAULT_PAGE;
  }

  private normalizePageSize(value: number | undefined): number {
    if (!Number.isInteger(value) || (value ?? 0) <= 0) {
      return DEFAULT_PAGE_SIZE;
    }
    return Math.min(value as number, MAX_PAGE_SIZE);
  }

  private assertBackofficeActor(actor: AuthenticatedAccessContext): void {
    if (
      actor.currentIdentityScopeType !== "platform" &&
      actor.currentIdentityScopeType !== "global"
    ) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.identity.forbidden",
        statusCode: 403
      });
    }
  }

  private requireTask(task: AffiliateTaskRecord | null): AffiliateTaskRecord {
    if (!task) {
      throw this.notFoundError();
    }
    return task;
  }

  private validationError(message: string): AppError {
    return new AppError({ code: ERROR_CODES.VALIDATION, message, statusCode: 400 });
  }

  private publisherScopeError(): AppError {
    return new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.affiliate.publisher_scope_invalid",
      statusCode: 403
    });
  }

  private notFoundError(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_TASK_NOT_FOUND,
      message: "error.affiliate.task_not_found",
      statusCode: 404
    });
  }

  private conflictError(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_TASK_CONFLICT,
      message: "error.affiliate.task_conflict",
      statusCode: 409
    });
  }

  private invalidStateError(message = "error.affiliate.task_invalid_state"): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_TASK_INVALID_STATE,
      message,
      statusCode: 409
    });
  }
}
