import { ERROR_CODES } from "../constants/error-codes";
import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import type { AuditLogRecordInput, AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

export type ShopPlatformFeePayer = "shop" | "technician";
export type PlatformFeePolicySource = "persisted" | "default";

export interface GlobalBookingPlatformFeePayload {
  amountNdp: number;
  version: number;
  effectiveFrom: string | null;
  source: PlatformFeePolicySource;
}

export interface ShopPlatformFeePolicyPayload {
  shopId: number;
  shopPublicId: string | null;
  shopName: string;
  globalAmountNdp: number;
  globalVersion: number;
  feeEnabled: boolean;
  payerType: ShopPlatformFeePayer;
  policyVersion: number;
  policySource: PlatformFeePolicySource;
  updatedAt: string | null;
}

export interface ShopPolicyIdentity {
  shopId: number;
  shopPublicId: string | null;
  shopName: string;
}

export interface ShopPolicyRecord extends ShopPolicyIdentity {
  feeEnabled: boolean;
  payerType: ShopPlatformFeePayer;
  version: number;
  updatedAt: Date;
}

export interface ShopPolicyListInput extends PaginationInput {
  keyword?: string;
  feeEnabled?: boolean;
}

export type PolicyMutationResult<T> =
  | { kind: "updated"; value: T }
  | { kind: "version_conflict" }
  | { kind: "config_conflict" }
  | { kind: "scope_forbidden" };

interface PolicyMutationBase {
  actorUserId: number;
  expectedVersion: number;
  audit: AuditLogCreateInput;
}

export interface GlobalAmountMutationInput extends PolicyMutationBase {
  amountNdp: number;
  changedAt: Date;
}

export interface ShopFeeEnabledMutationInput extends PolicyMutationBase {
  shopId: number;
  feeEnabled: boolean;
}

export interface ShopPayerMutationInput extends PolicyMutationBase {
  shopId: number;
  payerType: ShopPlatformFeePayer;
  merchantScope: { scopeType: "shop" | "merchant_account"; scopeId: number };
}

export interface PlatformFeePolicyRepositoryPort {
  findGlobalBookingFee: (at: Date) => Promise<GlobalBookingPlatformFeePayload | null>;
  findShopPolicy: (shopId: number) => Promise<ShopPolicyRecord | null>;
  findShopById: (shopId: number) => Promise<ShopPolicyIdentity | null>;
  listShopPolicies: (
    input: ShopPolicyListInput
  ) => Promise<PaginatedResponse<ShopPolicyIdentity & { policy: ShopPolicyRecord | null }>>;
  updateGlobalAmount: (
    input: GlobalAmountMutationInput
  ) => Promise<PolicyMutationResult<GlobalBookingPlatformFeePayload>>;
  updateShopFeeEnabled: (
    input: ShopFeeEnabledMutationInput
  ) => Promise<PolicyMutationResult<ShopPolicyRecord>>;
  updateShopPayerType: (
    input: ShopPayerMutationInput
  ) => Promise<PolicyMutationResult<ShopPolicyRecord>>;
  hasMerchantShopScope: (input: {
    scopeType: "shop" | "merchant_account";
    scopeId: number;
    shopId: number;
  }) => Promise<boolean>;
}

type AuditInputFactory = Pick<AuditLogService, "createInput">;

export class PlatformFeePolicyService {
  public constructor(
    private readonly repository: PlatformFeePolicyRepositoryPort,
    private readonly auditInputFactory: AuditInputFactory
  ) {}

  public async getGlobalPolicy(at = new Date()): Promise<GlobalBookingPlatformFeePayload> {
    return (await this.repository.findGlobalBookingFee(at)) ?? this.defaultGlobalPolicy();
  }

  public async getShopPolicy(
    actor: AuthenticatedAccessContext,
    _context: AuthRequestContext,
    shopId: number,
    at = new Date()
  ): Promise<ShopPlatformFeePolicyPayload> {
    await this.assertCanAccessShop(actor, shopId, true);
    const [shop, policy, global] = await Promise.all([
      this.repository.findShopById(shopId),
      this.repository.findShopPolicy(shopId),
      this.getGlobalPolicy(at)
    ]);
    if (!shop) {
      throw this.shopNotFoundError();
    }

    return this.mapEffectivePolicy(shop, policy, global);
  }

  public async listShopPolicies(
    actor: AuthenticatedAccessContext,
    input: ShopPolicyListInput,
    at = new Date()
  ): Promise<PaginatedResponse<ShopPlatformFeePolicyPayload>> {
    this.assertOperationsIdentity(actor);
    const [page, global] = await Promise.all([
      this.repository.listShopPolicies(input),
      this.getGlobalPolicy(at)
    ]);
    return {
      ...page,
      list: page.list.map((item) => this.mapEffectivePolicy(item, item.policy, global))
    };
  }

  public async updateGlobalAmount(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: { amountNdp: number; expectedVersion: number }
  ): Promise<GlobalBookingPlatformFeePayload> {
    this.assertOperationsIdentity(actor);
    const result = await this.repository.updateGlobalAmount({
      ...input,
      actorUserId: actor.userId,
      changedAt: new Date(),
      audit: this.auditInputFactory.createInput(
        this.auditRecord(actor, context, {
          action: "backoffice.platform_fee.global_amount.update",
          targetType: "platform_fee_rule_set",
          metadata: input
        })
      )
    });

    return this.unwrapMutation(result);
  }

  public async updateShopFeeEnabled(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    shopId: number,
    input: { feeEnabled: boolean; expectedVersion: number }
  ): Promise<ShopPlatformFeePolicyPayload> {
    this.assertOperationsIdentity(actor);
    const result = await this.repository.updateShopFeeEnabled({
      shopId,
      ...input,
      actorUserId: actor.userId,
      audit: this.auditInputFactory.createInput(
        this.auditRecord(actor, context, {
          action: "backoffice.shop_platform_fee.enabled.update",
          targetType: "shop_platform_fee_policy",
          targetId: shopId,
          metadata: input
        })
      )
    });

    const policy = this.unwrapMutation(result);
    return this.mapEffectivePolicy(policy, policy, await this.getGlobalPolicy());
  }

  public async updateShopPayerType(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    shopId: number,
    input: { payerType: ShopPlatformFeePayer; expectedVersion: number }
  ): Promise<ShopPlatformFeePolicyPayload> {
    const merchantScope = await this.resolveMerchantScope(actor, shopId);
    const result = await this.repository.updateShopPayerType({
      shopId,
      ...input,
      actorUserId: actor.userId,
      merchantScope,
      audit: this.auditInputFactory.createInput(
        this.auditRecord(actor, context, {
          action: "merchant_admin.shop_platform_fee.payer.update",
          targetType: "shop_platform_fee_policy",
          targetId: shopId,
          metadata: input
        })
      )
    });

    const policy = this.unwrapMutation(result);
    return this.mapEffectivePolicy(policy, policy, await this.getGlobalPolicy());
  }

  private mapEffectivePolicy(
    shop: ShopPolicyIdentity,
    policy: ShopPolicyRecord | null,
    global: GlobalBookingPlatformFeePayload
  ): ShopPlatformFeePolicyPayload {
    return {
      ...shop,
      globalAmountNdp: global.amountNdp,
      globalVersion: global.version,
      feeEnabled: policy?.feeEnabled ?? true,
      payerType: policy?.payerType ?? "shop",
      policyVersion: policy?.version ?? 0,
      policySource: policy ? "persisted" : "default",
      updatedAt: policy?.updatedAt.toISOString() ?? null
    };
  }

  private defaultGlobalPolicy(): GlobalBookingPlatformFeePayload {
    return {
      amountNdp: 500,
      version: 0,
      effectiveFrom: null,
      source: "default"
    };
  }

  private async assertCanAccessShop(
    actor: AuthenticatedAccessContext,
    shopId: number,
    allowOperations: boolean
  ): Promise<void> {
    if (
      allowOperations &&
      (actor.currentIdentityScopeType === "global" || actor.currentIdentityScopeType === "platform")
    ) {
      return;
    }
    await this.resolveMerchantScope(actor, shopId);
  }

  private async resolveMerchantScope(
    actor: AuthenticatedAccessContext,
    shopId: number
  ): Promise<{ scopeType: "shop" | "merchant_account"; scopeId: number }> {
    const scopeType = actor.currentIdentityScopeType;
    const scopeId = actor.currentIdentityScopeId;
    if ((scopeType !== "shop" && scopeType !== "merchant_account") || !scopeId) {
      throw this.identityForbiddenError();
    }
    if (scopeType === "shop" && scopeId !== shopId) {
      throw this.identityForbiddenError();
    }
    const hasScope = await this.repository.hasMerchantShopScope({ scopeType, scopeId, shopId });
    if (!hasScope) {
      throw this.identityForbiddenError();
    }

    return { scopeType, scopeId };
  }

  private assertOperationsIdentity(actor: AuthenticatedAccessContext): void {
    if (
      actor.currentIdentityScopeType !== "global" &&
      actor.currentIdentityScopeType !== "platform"
    ) {
      throw this.identityForbiddenError();
    }
  }

  private unwrapMutation<T>(result: PolicyMutationResult<T>): T {
    if (result.kind === "updated") {
      return result.value;
    }
    if (result.kind === "version_conflict") {
      throw new AppError({
        code: ERROR_CODES.PLATFORM_FEE_POLICY_VERSION_CONFLICT,
        message: "error.platform_fee_policy.version_conflict",
        statusCode: 409
      });
    }
    if (result.kind === "scope_forbidden") {
      throw this.identityForbiddenError();
    }
    throw new AppError({
      code: ERROR_CODES.PLATFORM_FEE_POLICY_CONFIG_CONFLICT,
      message: "error.platform_fee_policy.config_conflict",
      statusCode: 409
    });
  }

  private auditRecord(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: Omit<AuditLogRecordInput, "actor" | "context">
  ): AuditLogRecordInput {
    return { ...input, actor, context };
  }

  private identityForbiddenError(): AppError {
    return new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }

  private shopNotFoundError(): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.shop.not_found",
      statusCode: 404
    });
  }
}
