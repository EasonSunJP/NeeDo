import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import {
  normalizePagination,
  type PaginatedResponse,
  type PaginationInput
} from "../utils/pagination";
import type { AffiliateTaskFeeSnapshot } from "./affiliate-platform-fee.service";
import type {
  AffiliateTaskRecord,
  AffiliateTaskShopSnapshot
} from "./affiliate-task.service";
import type { AuthenticatedAccessContext } from "./auth.service";

export type MerchantAffiliatePublisherType = "shop" | "merchant_account";

export interface MerchantAffiliatePublisherOption {
  publisherType: MerchantAffiliatePublisherType;
  merchantAccountId: number | null;
  shopId: number | null;
  publicId: string | null;
  displayName: string;
  current: boolean;
  manageableShopCount: number;
}

export interface MerchantAffiliateShopOption {
  shopId: number;
  publicId: string;
  name: string;
  city: string;
  activeServiceCount: number;
}

export interface MerchantAffiliateServiceOption {
  serviceId: number;
  shopId: number;
  serviceName: string;
  priceJpy: number;
  shopName: string;
  shopPublicId: string;
}

export interface MerchantAffiliateFeePreview {
  evaluatedAt: Date;
  effectiveAt: Date;
  platformFeeBps: number;
  commissionBudgetNdp: number;
  platformFeeReserveNdp: number;
  grossFreezeNdp: number;
  shopRateStatus: "consistent";
}

export type MerchantAffiliateTaskView = Omit<AffiliateTaskRecord, "shops"> & {
  publisherDisplayName: string;
  shops: Array<AffiliateTaskShopSnapshot & { publicId: string }>;
};

export interface MerchantAffiliateTaskContextRepositoryPort {
  findCurrentShopPublisher(input: {
    shopId: number;
    keyword?: string;
  }): Promise<MerchantAffiliatePublisherOption | null>;
  listManageableMerchantPublishers(input: {
    userId: number;
    keyword?: string;
    offset: number;
    limit: number;
    now: Date;
  }): Promise<{ list: MerchantAffiliatePublisherOption[]; total: number }>;
  isManageableMerchantAccount(userId: number, merchantAccountId: number): Promise<boolean>;
  listCurrentShop(input: {
    shopId: number;
    keyword?: string;
    page: number;
    pageSize: number;
  }): Promise<PaginatedResponse<MerchantAffiliateShopOption>>;
  listMerchantShops(input: {
    merchantAccountId: number;
    keyword?: string;
    page: number;
    pageSize: number;
    now: Date;
  }): Promise<PaginatedResponse<MerchantAffiliateShopOption>>;
  countEligibleShops(input: {
    publisherType: MerchantAffiliatePublisherType;
    currentShopId: number | null;
    merchantAccountId: number | null;
    shopIds: number[];
    now: Date;
  }): Promise<number>;
  listServices(input: {
    shopIds: number[];
    keyword?: string;
    page: number;
    pageSize: number;
  }): Promise<PaginatedResponse<MerchantAffiliateServiceOption>>;
  findTaskDisplayResources(input: {
    merchantAccountIds: number[];
    shopIds: number[];
  }): Promise<{
    merchantAccounts: Array<{ id: number; name: string }>;
    shops: Array<{ id: number; publicId: string | null }>;
  }>;
}

export interface MerchantAffiliatePublisherListInput extends PaginationInput {
  keyword?: string;
}

export interface MerchantAffiliateScopedListInput extends PaginationInput {
  publisherType: MerchantAffiliatePublisherType;
  merchantAccountId?: number | null;
  keyword?: string;
}

export interface MerchantAffiliateServiceListInput extends MerchantAffiliateScopedListInput {
  shopIds: number[];
}

export interface MerchantAffiliateFeePreviewInput {
  publisherType: MerchantAffiliatePublisherType;
  merchantAccountId?: number | null;
  shopIds: number[];
  totalBudgetNdp: number;
}

interface AffiliatePlatformFeeReadPort {
  resolveForTask(
    shopIds: number[],
    effectiveAt: Date,
    transactionClient?: unknown
  ): Promise<AffiliateTaskFeeSnapshot>;
}

type Clock = () => Date;

interface ResolvedPublisherScope {
  publisherType: MerchantAffiliatePublisherType;
  currentShopId: number | null;
  merchantAccountId: number | null;
}

export class MerchantAffiliateTaskContextService {
  public constructor(
    private readonly repository: MerchantAffiliateTaskContextRepositoryPort,
    private readonly platformFeeService: AffiliatePlatformFeeReadPort,
    private readonly clock: Clock = () => new Date()
  ) {}

  public async listPublishers(
    actor: AuthenticatedAccessContext,
    input: MerchantAffiliatePublisherListInput
  ): Promise<PaginatedResponse<MerchantAffiliatePublisherOption>> {
    const { page, pageSize } = normalizePagination(input);
    const now = this.clock();
    const currentShop =
      actor.currentIdentityScopeType === "shop" && actor.currentIdentityScopeId
        ? await this.repository.findCurrentShopPublisher({
            shopId: actor.currentIdentityScopeId,
            keyword: input.keyword
          })
        : null;
    const shopCount = currentShop ? 1 : 0;
    const requestedOffset = (page - 1) * pageSize;
    const includesShop = currentShop !== null && requestedOffset === 0;
    const merchantOffset = Math.max(0, requestedOffset - shopCount);
    const merchantLimit = Math.max(0, pageSize - (includesShop ? 1 : 0));
    const merchantPage = await this.repository.listManageableMerchantPublishers({
      userId: actor.userId,
      keyword: input.keyword,
      offset: merchantOffset,
      limit: merchantLimit,
      now
    });
    const merchantRows = merchantPage.list.map((publisher) => ({
      ...publisher,
      current:
        (actor.currentIdentityScopeType === "merchant" ||
          actor.currentIdentityScopeType === "merchant_account") &&
        actor.currentIdentityScopeId === publisher.merchantAccountId
    }));

    return {
      list: [
        ...(includesShop && currentShop ? [{ ...currentShop, current: true }] : []),
        ...merchantRows
      ],
      total: shopCount + merchantPage.total,
      page,
      page_size: pageSize
    };
  }

  public async listShops(
    actor: AuthenticatedAccessContext,
    input: MerchantAffiliateScopedListInput
  ): Promise<PaginatedResponse<MerchantAffiliateShopOption>> {
    const pagination = normalizePagination(input);
    const scope = await this.resolvePublisherScope(actor, input);

    if (scope.publisherType === "shop") {
      return this.repository.listCurrentShop({
        shopId: scope.currentShopId as number,
        keyword: input.keyword,
        ...pagination
      });
    }

    return this.repository.listMerchantShops({
      merchantAccountId: scope.merchantAccountId as number,
      keyword: input.keyword,
      ...pagination,
      now: this.clock()
    });
  }

  public async listServices(
    actor: AuthenticatedAccessContext,
    input: MerchantAffiliateServiceListInput
  ): Promise<PaginatedResponse<MerchantAffiliateServiceOption>> {
    const scope = await this.resolvePublisherScope(actor, input);
    const shopIds = this.normalizeShopIds(input.shopIds);
    await this.assertEligibleShops(scope, shopIds);

    return this.repository.listServices({
      shopIds,
      keyword: input.keyword,
      ...normalizePagination(input)
    });
  }

  public async previewFee(
    actor: AuthenticatedAccessContext,
    input: MerchantAffiliateFeePreviewInput
  ): Promise<MerchantAffiliateFeePreview> {
    if (!Number.isSafeInteger(input.totalBudgetNdp) || input.totalBudgetNdp <= 0) {
      throw this.validationError("error.affiliate.budget_invalid");
    }
    const scope = await this.resolvePublisherScope(actor, input);
    const shopIds = this.normalizeShopIds(input.shopIds);
    await this.assertEligibleShops(scope, shopIds);
    const evaluatedAt = this.clock();
    const feeSnapshot = await this.platformFeeService.resolveForTask(shopIds, evaluatedAt);
    const platformFeeReserveNdp = Math.ceil((input.totalBudgetNdp * feeSnapshot.feeBps) / 10_000);
    const grossFreezeNdp = input.totalBudgetNdp + platformFeeReserveNdp;
    if (!Number.isSafeInteger(grossFreezeNdp)) {
      throw this.validationError("error.affiliate.budget_invalid");
    }

    return {
      evaluatedAt,
      effectiveAt: feeSnapshot.effectiveAt,
      platformFeeBps: feeSnapshot.feeBps,
      commissionBudgetNdp: input.totalBudgetNdp,
      platformFeeReserveNdp,
      grossFreezeNdp,
      shopRateStatus: "consistent"
    };
  }

  public async presentTask(task: AffiliateTaskRecord): Promise<MerchantAffiliateTaskView> {
    const page = await this.presentTaskPage({ list: [task], total: 1, page: 1, page_size: 1 });
    return page.list[0] as MerchantAffiliateTaskView;
  }

  public async presentTaskPage(
    page: PaginatedResponse<AffiliateTaskRecord>
  ): Promise<PaginatedResponse<MerchantAffiliateTaskView>> {
    const merchantAccountIds = [
      ...new Set(
        page.list.flatMap((task) =>
          task.publisherMerchantAccountId === null ? [] : [task.publisherMerchantAccountId]
        )
      )
    ].sort((left, right) => left - right);
    const shopIds = [
      ...new Set(page.list.flatMap((task) => task.shops.map((shop) => shop.shopId)))
    ].sort((left, right) => left - right);
    const resources = await this.repository.findTaskDisplayResources({ merchantAccountIds, shopIds });
    const merchantNames = new Map(resources.merchantAccounts.map((merchant) => [merchant.id, merchant.name]));
    const shopPublicIds = new Map(resources.shops.map((shop) => [shop.id, shop.publicId]));

    return {
      ...page,
      list: page.list.map((task) => {
        const shops = task.shops.map((shop) => {
          const publicId = shopPublicIds.get(shop.shopId);
          if (!publicId) {
            throw new AppError({
              code: ERROR_CODES.AFFILIATE_SHOP_PUBLIC_IDENTIFIER_UNAVAILABLE,
              message: "error.affiliate.shop_public_id_unavailable",
              statusCode: 409
            });
          }
          return { ...shop, publicId };
        });
        const publisherDisplayName = this.resolvePublisherDisplayName(task, merchantNames);
        return { ...task, publisherDisplayName, shops };
      })
    };
  }

  private async resolvePublisherScope(
    actor: AuthenticatedAccessContext,
    input: Pick<MerchantAffiliateScopedListInput, "publisherType" | "merchantAccountId">
  ): Promise<ResolvedPublisherScope> {
    if (input.publisherType === "shop") {
      if (
        input.merchantAccountId !== undefined &&
        input.merchantAccountId !== null ||
        actor.currentIdentityScopeType !== "shop" ||
        !actor.currentIdentityScopeId
      ) {
        throw this.publisherScopeError();
      }
      return {
        publisherType: "shop",
        currentShopId: actor.currentIdentityScopeId,
        merchantAccountId: null
      };
    }

    if (
      !input.merchantAccountId ||
      !(await this.repository.isManageableMerchantAccount(actor.userId, input.merchantAccountId))
    ) {
      throw this.publisherScopeError();
    }
    return {
      publisherType: "merchant_account",
      currentShopId: null,
      merchantAccountId: input.merchantAccountId
    };
  }

  private normalizeShopIds(shopIds: number[]): number[] {
    const normalizedShopIds = [...new Set(shopIds)].sort((left, right) => left - right);
    if (
      normalizedShopIds.length === 0 ||
      normalizedShopIds.length !== shopIds.length ||
      normalizedShopIds.some((shopId) => !Number.isSafeInteger(shopId) || shopId <= 0)
    ) {
      throw this.validationError("error.affiliate.publisher_scope_invalid");
    }
    return normalizedShopIds;
  }

  private async assertEligibleShops(scope: ResolvedPublisherScope, shopIds: number[]): Promise<void> {
    const count = await this.repository.countEligibleShops({
      ...scope,
      shopIds,
      now: this.clock()
    });
    if (count !== shopIds.length) {
      throw this.publisherScopeError();
    }
  }

  private resolvePublisherDisplayName(
    task: AffiliateTaskRecord,
    merchantNames: Map<number, string>
  ): string {
    if (task.publisherType === "shop") {
      const publisherShop = task.shops.find((shop) => shop.shopId === task.publisherShopId);
      if (!publisherShop) throw this.taskNotFoundError();
      return publisherShop.shopNameSnapshot;
    }
    const displayName =
      task.publisherMerchantAccountId === null
        ? undefined
        : merchantNames.get(task.publisherMerchantAccountId);
    if (!displayName) throw this.taskNotFoundError();
    return displayName;
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

  private taskNotFoundError(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_TASK_NOT_FOUND,
      message: "error.affiliate.task_not_found",
      statusCode: 404
    });
  }
}
