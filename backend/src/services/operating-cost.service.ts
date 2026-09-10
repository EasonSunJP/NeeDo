import { ERROR_CODES } from "../constants/error-codes";
import type {
  DirectAssignmentConfiguration,
  OperatingCostConfigurationInput,
  OperatingCostCreateResult,
  OperatingCostDeleteResult,
  OperatingCostItemRecord,
  OperatingCostListInput,
  OperatingCostPublishResult,
  OperatingCostRepositoryPort,
  OperatingCostUpdateResult
} from "../repositories/operating-cost.repository";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse } from "../utils/pagination";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

const allocationError = "operating_cost_allocation_invalid";

export type OperatingCostAllocationMode =
  | "equal_active_shops"
  | "platform_income_proportional"
  | "direct_shops";

export interface ShopOperatingCostAllocation {
  shopId: number;
  amountJpy: number;
}

type EqualAllocationInput = {
  amountJpy: number;
  allocationMode: "equal_active_shops";
  shops: Array<{ shopId: number }>;
};

type ProportionalAllocationInput = {
  amountJpy: number;
  allocationMode: "platform_income_proportional";
  shops: Array<{ shopId: number; settledPlatformIncomeJpy: number }>;
};

type DirectAllocationInput = {
  amountJpy: number;
  allocationMode: "direct_shops";
  directAssignments: Array<
    | { shopId: number; amountJpy: number; shareBps?: never }
    | { shopId: number; shareBps: number; amountJpy?: never }
  >;
};

export type OperatingCostAllocationInput =
  | EqualAllocationInput
  | ProportionalAllocationInput
  | DirectAllocationInput;

const assertSafeNonnegativeInteger = (value: number): void => {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(allocationError);
};

const sortedUniqueShopIds = (shopIds: number[]): number[] => {
  for (const shopId of shopIds) {
    if (!Number.isSafeInteger(shopId) || shopId <= 0) throw new RangeError(allocationError);
  }
  const sorted = [...shopIds].sort((left, right) => left - right);
  if (sorted.length === 0 || new Set(sorted).size !== sorted.length) {
    throw new RangeError(allocationError);
  }
  return sorted;
};

const ensureExactTotal = (
  amountJpy: number,
  allocations: ShopOperatingCostAllocation[]
): ShopOperatingCostAllocation[] => {
  const total = allocations.reduce((sum, row) => sum + BigInt(row.amountJpy), 0n);
  if (total !== BigInt(amountJpy)) throw new RangeError(allocationError);
  return allocations;
};

export const allocatePeriod = async (
  input: OperatingCostAllocationInput
): Promise<ShopOperatingCostAllocation[]> => {
  assertSafeNonnegativeInteger(input.amountJpy);

  if (input.allocationMode === "equal_active_shops") {
    const shopIds = sortedUniqueShopIds(input.shops.map((shop) => shop.shopId));
    const total = BigInt(input.amountJpy);
    const count = BigInt(shopIds.length);
    const base = total / count;
    const remainder = total % count;
    return ensureExactTotal(
      input.amountJpy,
      shopIds.map((shopId, index) => ({
        shopId,
        amountJpy: Number(base + (BigInt(index) < remainder ? 1n : 0n))
      }))
    );
  }

  if (input.allocationMode === "platform_income_proportional") {
    const shopIds = sortedUniqueShopIds(input.shops.map((shop) => shop.shopId));
    const basisByShop = new Map<number, bigint>();
    for (const shop of input.shops) {
      assertSafeNonnegativeInteger(shop.settledPlatformIncomeJpy);
      basisByShop.set(shop.shopId, BigInt(shop.settledPlatformIncomeJpy));
    }
    const totalBasis = [...basisByShop.values()].reduce((sum, value) => sum + value, 0n);
    if (totalBasis === 0n) throw new RangeError(allocationError);

    const amount = BigInt(input.amountJpy);
    const allocations = shopIds.map((shopId) => ({
      shopId,
      amountJpy: Number((amount * (basisByShop.get(shopId) ?? 0n)) / totalBasis)
    }));
    let remainder = amount - allocations.reduce((sum, row) => sum + BigInt(row.amountJpy), 0n);
    for (const allocation of allocations) {
      if (remainder === 0n) break;
      allocation.amountJpy += 1;
      remainder -= 1n;
    }
    return ensureExactTotal(input.amountJpy, allocations);
  }

  const shopIds = sortedUniqueShopIds(
    input.directAssignments.map((assignment) => assignment.shopId)
  );
  const usesAmounts = input.directAssignments.every(
    (assignment) => assignment.amountJpy !== undefined && assignment.shareBps === undefined
  );
  const usesShares = input.directAssignments.every(
    (assignment) => assignment.shareBps !== undefined && assignment.amountJpy === undefined
  );
  if (!usesAmounts && !usesShares) throw new RangeError(allocationError);

  if (usesShares) {
    const sharesByShop = new Map<number, bigint>();
    for (const assignment of input.directAssignments) {
      assertSafeNonnegativeInteger(assignment.shareBps ?? -1);
      sharesByShop.set(assignment.shopId, BigInt(assignment.shareBps ?? 0));
    }
    const totalShares = [...sharesByShop.values()].reduce((sum, share) => sum + share, 0n);
    if (totalShares !== 10_000n) throw new RangeError(allocationError);
    const total = BigInt(input.amountJpy);
    const allocations = shopIds.map((shopId) => ({
      shopId,
      amountJpy: Number((total * (sharesByShop.get(shopId) ?? 0n)) / 10_000n)
    }));
    let remainder = total - allocations.reduce((sum, row) => sum + BigInt(row.amountJpy), 0n);
    for (const allocation of allocations) {
      if (remainder === 0n) break;
      allocation.amountJpy += 1;
      remainder -= 1n;
    }
    return ensureExactTotal(input.amountJpy, allocations);
  }

  const amountByShop = new Map<number, number>();
  for (const assignment of input.directAssignments) {
    const directAmountJpy = assignment.amountJpy ?? -1;
    assertSafeNonnegativeInteger(directAmountJpy);
    amountByShop.set(assignment.shopId, directAmountJpy);
  }
  return ensureExactTotal(
    input.amountJpy,
    shopIds.map((shopId) => ({ shopId, amountJpy: amountByShop.get(shopId) ?? 0 }))
  );
};

export type OperatingCostItemPayload = Omit<OperatingCostItemRecord, "id">;

export interface OperatingCostConfigurationRequest extends Omit<
  OperatingCostConfigurationInput,
  "directAssignments"
> {
  directAssignments?: Array<{
    shopPublicId: string;
    amountJpy?: number;
    shareBps?: number;
  }>;
}

export interface OperatingCostCreateRequest extends OperatingCostConfigurationRequest {
  costCode: string;
}

export class OperatingCostService {
  public constructor(
    private readonly repository: OperatingCostRepositoryPort,
    private readonly auditInputFactory: Pick<AuditLogService, "createInput">
  ) {}

  public async listCosts(
    actor: AuthenticatedAccessContext,
    input: OperatingCostListInput
  ): Promise<PaginatedResponse<OperatingCostItemPayload>> {
    this.assertPlatformIdentity(actor);
    const result = await this.repository.list(input);
    return { ...result, list: result.list.map((item) => this.serialize(item)) };
  }

  public async createCost(
    actor: AuthenticatedAccessContext,
    input: OperatingCostCreateRequest,
    context: AuthRequestContext
  ): Promise<OperatingCostItemPayload> {
    this.assertPlatformIdentity(actor);
    const result = await this.repository.createDraft({
      ...input,
      directAssignments: input.directAssignments as DirectAssignmentConfiguration[] | undefined,
      actorUserId: actor.userId,
      audit: this.auditInputFactory.createInput({
        actor,
        action: "backoffice.operating_cost.draft_created",
        targetType: "OperatingCostItem",
        context,
        metadata: {
          costCode: input.costCode,
          categoryCode: input.categoryCode,
          amountJpy: input.amountJpy,
          allocationMode: input.allocationMode,
          periodStart: input.periodStart.toISOString().slice(0, 10),
          periodEnd: input.periodEnd.toISOString().slice(0, 10),
          reason: input.reason
        }
      })
    });
    return this.serialize(this.unwrapCreate(result));
  }

  public async updateCost(
    actor: AuthenticatedAccessContext,
    publicId: string,
    input: OperatingCostConfigurationRequest,
    context: AuthRequestContext
  ): Promise<OperatingCostItemPayload> {
    this.assertPlatformIdentity(actor);
    const result = await this.repository.updateDraft({
      ...input,
      directAssignments: input.directAssignments as DirectAssignmentConfiguration[] | undefined,
      publicId,
      actorUserId: actor.userId,
      audit: this.auditInputFactory.createInput({
        actor,
        action: "backoffice.operating_cost.draft_updated",
        targetType: "OperatingCostItem",
        context,
        metadata: { publicId, reason: input.reason }
      })
    });
    return this.serialize(this.unwrapUpdate(result));
  }

  public async deleteCost(
    actor: AuthenticatedAccessContext,
    publicId: string,
    reason: string,
    context: AuthRequestContext
  ): Promise<void> {
    this.assertPlatformIdentity(actor);
    const result = await this.repository.deleteDraft({
      publicId,
      reason,
      actorUserId: actor.userId,
      audit: this.auditInputFactory.createInput({
        actor,
        action: "backoffice.operating_cost.draft_deleted",
        targetType: "OperatingCostItem",
        context,
        metadata: { publicId, reason }
      })
    });
    this.unwrapDelete(result);
  }

  public async publishCost(
    actor: AuthenticatedAccessContext,
    publicId: string,
    reason: string,
    context: AuthRequestContext
  ): Promise<OperatingCostItemPayload> {
    this.assertPlatformIdentity(actor);
    const result = await this.repository.publish({
      publicId,
      reason,
      actorUserId: actor.userId,
      audit: this.auditInputFactory.createInput({
        actor,
        action: "backoffice.operating_cost.published",
        targetType: "OperatingCostItem",
        context,
        metadata: { publicId, reason }
      })
    });
    return this.serialize(this.unwrapPublish(result));
  }

  private unwrapCreate(result: OperatingCostCreateResult): OperatingCostItemRecord {
    if (result.outcome === "created") return result.item;
    throw this.conflict();
  }

  private unwrapUpdate(result: OperatingCostUpdateResult): OperatingCostItemRecord {
    if (result.outcome === "updated") return result.item;
    if (result.outcome === "not_found") throw this.notFound();
    throw this.conflict();
  }

  private unwrapDelete(result: OperatingCostDeleteResult): void {
    if (result.outcome === "deleted") return;
    if (result.outcome === "not_found") throw this.notFound();
    throw this.conflict();
  }

  private unwrapPublish(result: OperatingCostPublishResult): OperatingCostItemRecord {
    if (result.outcome === "published") return result.item;
    if (result.outcome === "not_found") throw this.notFound();
    if (result.outcome === "shop_not_found") {
      throw new AppError({
        code: ERROR_CODES.OPERATING_COST_SHOP_NOT_FOUND,
        message: "error.operating_cost.shop_not_found",
        statusCode: 404
      });
    }
    if (result.outcome === "allocation_invalid") {
      throw new AppError({
        code: ERROR_CODES.OPERATING_COST_ALLOCATION_INVALID,
        message: "error.operating_cost.allocation_invalid",
        statusCode: 422
      });
    }
    throw this.conflict();
  }

  private serialize(item: OperatingCostItemRecord): OperatingCostItemPayload {
    return {
      publicId: item.publicId,
      costCode: item.costCode,
      version: item.version,
      categoryCode: item.categoryCode,
      name: item.name,
      amountJpy: item.amountJpy,
      currency: item.currency,
      periodStart: item.periodStart,
      periodEnd: item.periodEnd,
      allocationMode: item.allocationMode,
      status: item.status,
      effectiveAt: item.effectiveAt,
      publishedAt: item.publishedAt,
      configuredById: item.configuredById,
      reason: item.reason,
      directAssignments: item.directAssignments,
      allocations: item.allocations,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    };
  }

  private assertPlatformIdentity(actor: AuthenticatedAccessContext): void {
    if (
      actor.currentIdentityScopeType !== "global" &&
      actor.currentIdentityScopeType !== "platform"
    ) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.identity.forbidden",
        statusCode: 403
      });
    }
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.OPERATING_COST_NOT_FOUND,
      message: "error.operating_cost.not_found",
      statusCode: 404
    });
  }

  private conflict(): AppError {
    return new AppError({
      code: ERROR_CODES.OPERATING_COST_CONFLICT,
      message: "error.operating_cost.conflict",
      statusCode: 409
    });
  }
}
