import { randomInt } from "crypto";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import {
  normalizePagination,
  type PaginatedResponse,
  type PaginationInput
} from "../utils/pagination";
import type { AffiliateLinkTokenService } from "./affiliate-link-token.service";
import type { AffiliateTaskStatus } from "./affiliate-state-machine.service";
import type { AuthenticatedAccessContext } from "./auth.service";
import type { AffiliateDiscountType, AffiliateTaskRecord } from "./affiliate-task.service";

export type AffiliateClaimStatus = "active" | "expired" | "revoked";
export type AffiliateMarketplaceTransactionClient = unknown;
export type AffiliateClaimUniqueField = "active_key" | "public_code" | "public_token_id";
export type AffiliateClaimUniqueConflict = Error & {
  field: AffiliateClaimUniqueField;
};

export interface AffiliateMarketplaceListInput extends PaginationInput {
  keyword?: string;
  shopId?: number;
  serviceId?: number;
  customerDiscountType?: AffiliateDiscountType;
}

export interface AffiliateMarketplaceMediaAssetPublicView {
  url: string;
  altText: string | null;
  sortOrder: number;
}

export type AffiliateMarketplaceShopPublicView = AffiliateTaskRecord["shops"][number] & {
  publicId: string | null;
  city: string;
  address: string;
  mediaAssets: AffiliateMarketplaceMediaAssetPublicView[];
};

export type AffiliateMarketplaceTaskRecord = Omit<AffiliateTaskRecord, "shops"> & {
  coverImageUrl: string | null;
  shops: AffiliateMarketplaceShopPublicView[];
};

export interface AffiliateClaimListInput extends PaginationInput {
  status?: AffiliateClaimStatus;
}

export interface AffiliateClaimPersistenceInput {
  taskId: number;
  userId: number;
  activeKey: string;
  publicCode: string;
  publicTokenId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface AffiliateClaimRecord extends AffiliateClaimPersistenceInput {
  id: number;
  status: AffiliateClaimStatus;
  claimedAt: Date;
  clickCount: number;
  codeUseCount: number;
  attributedOrderCount: number;
  completedOrderCount: number;
  settledRewardNdp: number;
  createdAt: Date;
  updatedAt: Date;
  task: AffiliateMarketplaceTaskRecord;
}

export interface AffiliateMarketplaceTaskPublicView {
  id: number;
  taskCode: string;
  name: string;
  description: string | null;
  coverMediaAssetId: number | null;
  coverImageUrl: string | null;
  rewardNdpPerCompletedOrder: number;
  totalBudgetNdp: number;
  remainingBudgetNdp: number;
  remainingBudgetBps: number;
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
  status: AffiliateTaskStatus;
  claimable: boolean;
  shops: AffiliateMarketplaceShopPublicView[];
  services: AffiliateTaskRecord["services"];
  createdAt: Date;
  updatedAt: Date;
}

export interface AffiliateClaimView {
  id: number;
  taskId: number;
  publicCode: string;
  promotionUrl: string;
  status: AffiliateClaimStatus;
  claimedAt: Date;
  expiresAt: Date;
  clickCount: number;
  codeUseCount: number;
  attributedOrderCount: number;
  completedOrderCount: number;
  settledRewardNdp: number;
  task: AffiliateMarketplaceTaskPublicView;
}

export interface AffiliateResolvedLinkView {
  claimId: number;
  publicCode: string;
  expiresAt: Date;
  task: AffiliateMarketplaceTaskPublicView;
}

export interface AffiliateMarketplaceRepositoryPort {
  runInTransaction: <T>(
    handler: (
      repository: AffiliateMarketplaceRepositoryPort,
      transactionClient?: AffiliateMarketplaceTransactionClient
    ) => Promise<T>,
    transactionClient?: AffiliateMarketplaceTransactionClient
  ) => Promise<T>;
  listClaimableTasks: (
    input: AffiliateMarketplaceListInput & {
      now: Date;
      page: number;
      pageSize: number;
    }
  ) => Promise<PaginatedResponse<AffiliateMarketplaceTaskRecord>>;
  findClaimableTaskById: (
    taskId: number,
    now: Date
  ) => Promise<AffiliateMarketplaceTaskRecord | null>;
  findTaskById: (taskId: number) => Promise<AffiliateMarketplaceTaskRecord | null>;
  lockClaimableTaskForShare: (
    taskId: number,
    now: Date
  ) => Promise<AffiliateMarketplaceTaskRecord | null>;
  findClaimByTaskAndUser: (taskId: number, userId: number) => Promise<AffiliateClaimRecord | null>;
  createClaim: (input: AffiliateClaimPersistenceInput) => Promise<AffiliateClaimRecord>;
  classifyClaimUniqueConflict: (error: unknown) => AffiliateClaimUniqueConflict | null;
  listClaimsByUser: (
    input: AffiliateClaimListInput & {
      userId: number;
      page: number;
      pageSize: number;
    }
  ) => Promise<PaginatedResponse<AffiliateClaimRecord>>;
  findClaimByIdAndUser: (claimId: number, userId: number) => Promise<AffiliateClaimRecord | null>;
  findClaimByPublicTokenId: (publicTokenId: string) => Promise<AffiliateClaimRecord | null>;
  createClaimAuditLog: (input: {
    actorUserId: number;
    claimId: number;
    taskId: number;
    publicCode: string;
  }) => Promise<void>;
}

interface AffiliateMarketplaceServiceOptions {
  now?: () => Date;
  createPublicCode?: () => string;
  maxCredentialAttempts?: number;
}

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export class AffiliateMarketplaceService {
  private readonly now: () => Date;
  private readonly createPublicCode: () => string;
  private readonly maxCredentialAttempts: number;

  public constructor(
    private readonly repository: AffiliateMarketplaceRepositoryPort,
    private readonly linkTokens: AffiliateLinkTokenService,
    options: AffiliateMarketplaceServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.createPublicCode = options.createPublicCode ?? (() => this.randomPublicCode());
    this.maxCredentialAttempts = options.maxCredentialAttempts ?? 5;
  }

  public async listTasks(
    _actor: AuthenticatedAccessContext,
    input: AffiliateMarketplaceListInput
  ): Promise<PaginatedResponse<AffiliateMarketplaceTaskPublicView>> {
    const pagination = normalizePagination(input);
    const result = await this.repository.listClaimableTasks({
      ...input,
      ...pagination,
      now: this.now()
    });

    return {
      ...result,
      list: result.list.map((task) => this.publicTask(task, true))
    };
  }

  public async getTask(
    _actor: AuthenticatedAccessContext,
    taskId: number
  ): Promise<AffiliateMarketplaceTaskPublicView> {
    const task = await this.repository.findClaimableTaskById(taskId, this.now());
    if (!task) {
      throw this.taskNotFoundError();
    }
    return this.publicTask(task, true);
  }

  public async claimTask(
    actor: AuthenticatedAccessContext,
    taskId: number
  ): Promise<{ created: boolean; claim: AffiliateClaimView }> {
    try {
      return await this.repository.runInTransaction(async (repository) => {
        const existing = await repository.findClaimByTaskAndUser(taskId, actor.userId);
        if (existing) {
          return { created: false, claim: this.claimView(existing) };
        }

        const taskExists = await repository.findTaskById(taskId);
        if (!taskExists) {
          throw this.taskNotFoundError();
        }

        const task = await repository.lockClaimableTaskForShare(taskId, this.now());
        if (!task) {
          throw new AppError({
            code: ERROR_CODES.AFFILIATE_TASK_INVALID_STATE,
            message: "error.affiliate.task_not_claimable",
            statusCode: 409
          });
        }

        for (let attempt = 0; attempt < this.maxCredentialAttempts; attempt += 1) {
          const issued = this.linkTokens.issue({
            taskId: task.id,
            userId: actor.userId,
            expiresAt: task.taskEndsAt
          });
          try {
            const created = await repository.createClaim({
              taskId: task.id,
              userId: actor.userId,
              activeKey: `${task.id}:${actor.userId}`,
              publicCode: this.createPublicCode(),
              publicTokenId: issued.publicTokenId,
              tokenHash: issued.tokenHash,
              expiresAt: task.taskEndsAt
            });
            await repository.createClaimAuditLog({
              actorUserId: actor.userId,
              claimId: created.id,
              taskId: created.taskId,
              publicCode: created.publicCode
            });
            return { created: true, claim: this.claimView(created) };
          } catch (error) {
            const conflict = repository.classifyClaimUniqueConflict(error);
            if (!conflict || conflict.field === "active_key") {
              throw error;
            }
          }
        }

        throw this.claimConflictError();
      });
    } catch (error) {
      const conflict = this.repository.classifyClaimUniqueConflict(error);
      if (conflict?.field !== "active_key") {
        throw error;
      }
      const concurrent = await this.repository.findClaimByTaskAndUser(taskId, actor.userId);
      if (!concurrent) {
        throw this.claimConflictError();
      }
      return { created: false, claim: this.claimView(concurrent) };
    }
  }

  public async listMyClaims(
    actor: AuthenticatedAccessContext,
    input: AffiliateClaimListInput
  ): Promise<PaginatedResponse<AffiliateClaimView>> {
    const pagination = normalizePagination(input);
    const result = await this.repository.listClaimsByUser({
      ...input,
      ...pagination,
      userId: actor.userId
    });
    return {
      ...result,
      list: result.list.map((claim) => this.claimView(claim))
    };
  }

  public async getMyClaim(
    actor: AuthenticatedAccessContext,
    claimId: number
  ): Promise<AffiliateClaimView> {
    const claim = await this.repository.findClaimByIdAndUser(claimId, actor.userId);
    if (!claim) {
      throw this.claimNotFoundError();
    }
    return this.claimView(claim);
  }

  public async resolveLink(publicToken: string): Promise<AffiliateResolvedLinkView> {
    const [publicTokenId, signature, extra] = publicToken.split(".");
    if (!publicTokenId || !signature || extra) {
      throw this.invalidLinkError();
    }
    const claim = await this.repository.findClaimByPublicTokenId(publicTokenId);
    const currentTime = this.now();
    if (
      !claim ||
      claim.status !== "active" ||
      claim.expiresAt <= currentTime ||
      !this.isLinkTaskUsable(claim.task, currentTime) ||
      !this.linkTokens.verify({
        taskId: claim.taskId,
        userId: claim.userId,
        expiresAt: claim.expiresAt,
        publicTokenId: claim.publicTokenId,
        publicToken,
        tokenHash: claim.tokenHash
      })
    ) {
      throw this.invalidLinkError();
    }

    return {
      claimId: claim.id,
      publicCode: claim.publicCode,
      expiresAt: claim.expiresAt,
      task: this.publicTask(claim.task, true)
    };
  }

  private claimView(claim: AffiliateClaimRecord): AffiliateClaimView {
    const currentTime = this.now();
    const issued = this.linkTokens.rebuild({
      taskId: claim.taskId,
      userId: claim.userId,
      expiresAt: claim.expiresAt,
      publicTokenId: claim.publicTokenId
    });
    const effectiveStatus =
      claim.status === "active" && claim.expiresAt <= currentTime ? "expired" : claim.status;

    return {
      id: claim.id,
      taskId: claim.taskId,
      publicCode: claim.publicCode,
      promotionUrl: issued.promotionUrl,
      status: effectiveStatus,
      claimedAt: claim.claimedAt,
      expiresAt: claim.expiresAt,
      clickCount: claim.clickCount,
      codeUseCount: claim.codeUseCount,
      attributedOrderCount: claim.attributedOrderCount,
      completedOrderCount: claim.completedOrderCount,
      settledRewardNdp: claim.settledRewardNdp,
      task: this.publicTask(claim.task, this.isLinkTaskUsable(claim.task, currentTime))
    };
  }

  private publicTask(
    task: AffiliateMarketplaceTaskRecord,
    claimable: boolean
  ): AffiliateMarketplaceTaskPublicView {
    const remainingBudgetNdp = Math.max(
      0,
      task.budgetReservation
        ? task.budgetReservation.totalFrozenNdp -
            task.budgetReservation.allocatedNdp -
            task.budgetReservation.capturedNdp -
            task.budgetReservation.releasedNdp
        : task.totalBudgetNdp -
            task.allocatedBudgetNdp -
            task.settledBudgetNdp -
            task.releasedBudgetNdp
    );
    const remainingBudgetBps =
      task.totalBudgetNdp > 0
        ? Math.min(10_000, Math.floor((remainingBudgetNdp * 10_000) / task.totalBudgetNdp))
        : 0;

    return {
      id: task.id,
      taskCode: task.taskCode,
      name: task.name,
      description: task.description,
      coverMediaAssetId: task.coverMediaAssetId,
      coverImageUrl: task.coverImageUrl,
      rewardNdpPerCompletedOrder: task.rewardNdpPerCompletedOrder,
      totalBudgetNdp: task.totalBudgetNdp,
      remainingBudgetNdp,
      remainingBudgetBps,
      customerDiscountType: task.customerDiscountType,
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
      status: task.status,
      claimable,
      shops: task.shops,
      services: task.services,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    };
  }

  private isLinkTaskUsable(task: AffiliateTaskRecord, currentTime: Date): boolean {
    const reservation = task.budgetReservation;
    return (
      (task.status === "scheduled" || task.status === "active") &&
      task.taskEndsAt > currentTime &&
      task.shops.length > 0 &&
      task.services.length > 0 &&
      reservation?.status === "active" &&
      reservation.totalFrozenNdp -
        reservation.allocatedNdp -
        reservation.capturedNdp -
        reservation.releasedNdp >=
        task.rewardNdpPerCompletedOrder
    );
  }

  private randomPublicCode(): string {
    let suffix = "";
    for (let index = 0; index < 10; index += 1) {
      suffix += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    return `NDO-${suffix}`;
  }

  private taskNotFoundError(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_TASK_NOT_FOUND,
      message: "error.affiliate.task_not_found",
      statusCode: 404
    });
  }

  private claimNotFoundError(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_CLAIM_NOT_FOUND,
      message: "error.affiliate.claim_not_found",
      statusCode: 404
    });
  }

  private claimConflictError(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_CLAIM_CONFLICT,
      message: "error.affiliate.claim_conflict",
      statusCode: 409
    });
  }

  private invalidLinkError(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_LINK_INVALID,
      message: "error.affiliate.link_invalid",
      statusCode: 404
    });
  }
}
