import { ERROR_CODES } from "../constants/error-codes";
import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import type { AuditLogRecordInput, AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

export type AffiliatePlatformFeeScope = "global" | "shop";

export interface AffiliatePlatformFeeRuleRecord {
  id: number;
  scopeType: AffiliatePlatformFeeScope;
  scopeKey: string;
  shopId: number | null;
  feeBps: number;
  version: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  activeKey: string | null;
  reason: string;
  createdByNeedoId: string | null;
  updatedByNeedoId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AffiliateTaskFeeSnapshot {
  ruleId: number;
  ruleIds: number[];
  feeBps: number;
  source: AffiliatePlatformFeeScope;
  shopIds: number[];
  effectiveAt: Date;
}

export interface AffiliatePlatformFeeRuleListInput extends PaginationInput {
  scopeType?: AffiliatePlatformFeeScope;
  shopId?: number;
}

export interface AffiliatePlatformFeeRuleCreateInput {
  scopeType: AffiliatePlatformFeeScope;
  shopId: number | null;
  feeBps: number;
  expectedVersion: number;
  effectiveFrom: Date;
  reason: string;
}

export interface AffiliatePlatformFeeRuleMutationInput extends AffiliatePlatformFeeRuleCreateInput {
  scopeKey: string;
  actorUserId: number;
  audit: AuditLogCreateInput;
}

export type AffiliatePlatformFeeRuleMutationResult =
  | { kind: "created"; value: AffiliatePlatformFeeRuleRecord }
  | { kind: "version_conflict" }
  | { kind: "scope_conflict" }
  | { kind: "shop_not_found" };

export interface AffiliatePlatformFeeRepositoryPort {
  withTransactionClient: (transactionClient: unknown) => AffiliatePlatformFeeRepositoryPort;
  findActiveShopIds: (shopIds: number[]) => Promise<number[]>;
  findEffectiveRules: (
    shopIds: number[],
    effectiveAt: Date
  ) => Promise<AffiliatePlatformFeeRuleRecord[]>;
  listRules: (
    input: AffiliatePlatformFeeRuleListInput
  ) => Promise<PaginatedResponse<AffiliatePlatformFeeRuleRecord>>;
  createRuleVersion: (
    input: AffiliatePlatformFeeRuleMutationInput
  ) => Promise<AffiliatePlatformFeeRuleMutationResult>;
}

type AuditInputFactory = Pick<AuditLogService, "createInput">;

export class AffiliatePlatformFeeService {
  public constructor(
    private readonly repository: AffiliatePlatformFeeRepositoryPort,
    private readonly auditInputFactory: AuditInputFactory
  ) {}

  public async resolveForTask(
    shopIds: number[],
    effectiveAt: Date,
    transactionClient?: unknown
  ): Promise<AffiliateTaskFeeSnapshot> {
    const normalizedShopIds = [...new Set(shopIds)].sort((left, right) => left - right);
    if (shopIds.length === 0 || normalizedShopIds.length !== shopIds.length) {
      throw this.validationError();
    }
    const repository = transactionClient
      ? this.repository.withTransactionClient(transactionClient)
      : this.repository;
    const activeShopIds = (await repository.findActiveShopIds(normalizedShopIds)).sort(
      (left, right) => left - right
    );
    if (
      activeShopIds.length !== normalizedShopIds.length ||
      activeShopIds.some((shopId, index) => shopId !== normalizedShopIds[index])
    ) {
      throw new AppError({
        code: ERROR_CODES.AFFILIATE_PLATFORM_FEE_SHOP_NOT_FOUND,
        message: "error.affiliate.platform_fee_shop_not_found",
        statusCode: 404
      });
    }

    const rules = await repository.findEffectiveRules(normalizedShopIds, effectiveAt);
    const globalRules = rules.filter((rule) => rule.scopeType === "global");
    if (globalRules.length > 1) throw this.policyConflictError();
    const globalRule = globalRules[0] ?? null;
    const resolvedRules = normalizedShopIds.map((shopId) => {
      const shopRules = rules.filter((rule) => rule.scopeType === "shop" && rule.shopId === shopId);
      if (shopRules.length > 1) throw this.policyConflictError();
      const rule = shopRules[0] ?? globalRule;
      if (!rule) throw this.policyConflictError();
      return rule;
    });
    const feeBps = resolvedRules[0]?.feeBps;
    if (
      feeBps === undefined ||
      resolvedRules.some((resolvedRule) => resolvedRule.feeBps !== feeBps)
    ) {
      throw new AppError({
        code: ERROR_CODES.AFFILIATE_PLATFORM_FEE_RATE_MISMATCH,
        message: "error.affiliate.platform_fee_rate_mismatch",
        statusCode: 409
      });
    }
    const ruleIds = [...new Set(resolvedRules.map((rule) => rule.id))].sort(
      (left, right) => left - right
    );

    return {
      ruleId: ruleIds[0] as number,
      ruleIds,
      feeBps,
      source: resolvedRules.some((rule) => rule.scopeType === "shop") ? "shop" : "global",
      shopIds: normalizedShopIds,
      effectiveAt
    };
  }

  public async listRules(
    actor: AuthenticatedAccessContext,
    input: AffiliatePlatformFeeRuleListInput
  ): Promise<PaginatedResponse<AffiliatePlatformFeeRuleRecord>> {
    this.assertOperationsIdentity(actor);
    return this.repository.listRules(input);
  }

  public async createRuleVersion(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: AffiliatePlatformFeeRuleCreateInput
  ): Promise<AffiliatePlatformFeeRuleRecord> {
    this.assertOperationsIdentity(actor);
    const scopeKey = this.scopeKey(input.scopeType, input.shopId);
    const result = await this.repository.createRuleVersion({
      ...input,
      scopeKey,
      actorUserId: actor.userId,
      audit: this.auditInputFactory.createInput(
        this.auditRecord(actor, context, {
          action: "backoffice.affiliate_platform_fee_rule.version_created",
          targetType: "AffiliatePlatformFeeRule",
          metadata: {
            scopeType: input.scopeType,
            shopId: input.shopId,
            feeBps: input.feeBps,
            expectedVersion: input.expectedVersion,
            effectiveFrom: input.effectiveFrom.toISOString(),
            reason: input.reason
          }
        })
      )
    });
    if (result.kind === "created") return result.value;
    if (result.kind === "shop_not_found") {
      throw new AppError({
        code: ERROR_CODES.AFFILIATE_PLATFORM_FEE_SHOP_NOT_FOUND,
        message: "error.affiliate.platform_fee_shop_not_found",
        statusCode: 404
      });
    }
    if (result.kind === "version_conflict") {
      throw new AppError({
        code: ERROR_CODES.AFFILIATE_PLATFORM_FEE_VERSION_CONFLICT,
        message: "error.affiliate.platform_fee_version_conflict",
        statusCode: 409
      });
    }
    throw this.policyConflictError();
  }

  private scopeKey(scopeType: AffiliatePlatformFeeScope, shopId: number | null): string {
    if (scopeType === "global" && shopId === null) return "global";
    if (scopeType === "shop" && typeof shopId === "number" && shopId > 0) {
      return `shop:${shopId}`;
    }
    throw this.validationError();
  }

  private assertOperationsIdentity(actor: AuthenticatedAccessContext): void {
    if (
      actor.currentIdentityScopeType !== "global" &&
      actor.currentIdentityScopeType !== "platform"
    ) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.identity_forbidden",
        statusCode: 403
      });
    }
  }

  private validationError(): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.validation",
      statusCode: 400
    });
  }

  private policyConflictError(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_PLATFORM_FEE_POLICY_CONFLICT,
      message: "error.affiliate.platform_fee_policy_conflict",
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
}
