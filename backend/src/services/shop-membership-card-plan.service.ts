import { z } from "zod";
import { ERROR_CODES } from "../constants/error-codes";
import {
  evaluateMembershipRewardRules,
  membershipRewardCapsSchema,
  membershipRewardRuleListSchema,
  membershipRewardRuleSchema,
  type MembershipRewardPreviewFacts,
  type MembershipRewardRuleInput
} from "../domain/shop-membership-reward-rule";
import type {
  MembershipRewardFeePolicyPayload,
  ShopMembershipCardPlanDraftPersistenceInput,
  ShopMembershipCardPlanPayload,
  ShopMembershipCardPlanRepositoryPort
} from "../repositories/shop-membership-card-plan.repository";
import { AppError } from "../utils/app-error";
import type { PaginationInput } from "../utils/pagination";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

type AuditInputFactory = Pick<AuditLogService, "createInput">;

export type ShopMembershipCardPlanDraftInput = ShopMembershipCardPlanDraftPersistenceInput;

export interface MembershipRewardFeePolicyCreateInput {
  feeRateBps: number;
  expectedVersion: number;
  effectiveFrom: Date;
  reason: string;
}

const merchantIdentityTypes = new Set(["merchant", "merchant_owner", "merchant_staff"]);

export class ShopMembershipCardPlanService {
  public constructor(
    private readonly repository: ShopMembershipCardPlanRepositoryPort,
    private readonly auditInputFactory: AuditInputFactory,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async listPlans(actor: AuthenticatedAccessContext, input: PaginationInput) {
    const page = await this.repository.listPlans(this.requireMerchantShop(actor), input);
    return { ...page, list: page.list.map((plan) => this.toPublicPlan(plan)) };
  }

  public async getPlan(actor: AuthenticatedAccessContext, publicId: string) {
    const plan = await this.repository.findPlan(this.requireMerchantShop(actor), publicId);
    if (!plan) throw this.notFound();
    return this.toPublicPlan(plan);
  }

  public async createPlan(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: ShopMembershipCardPlanDraftInput
  ) {
    const shopId = this.requireMerchantShop(actor);
    if (input.expectedLockVersion !== 0) throw this.versionConflict();
    const draft = this.normalizeDraft(input);
    await this.assertRuleReferences(shopId, draft.rules);
    const plan = await this.repository.createPlanWithDraft({
      actorId: actor.userId,
      shopId,
      draft,
      audit: this.auditInputFactory.createInput({
        actor,
        context,
        action: "merchant.shop_membership_card_plan.create",
        targetType: "ShopMembershipCardPlan",
        metadata: { name: draft.name, cardType: draft.cardType }
      })
    });
    return this.toPublicPlan(plan);
  }

  public async updateDraft(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    planPublicId: string,
    input: ShopMembershipCardPlanDraftInput
  ) {
    const shopId = this.requireMerchantShop(actor);
    const draft = this.normalizeDraft(input);
    await this.assertRuleReferences(shopId, draft.rules);
    const result = await this.repository.updateDraftWithAudit({
      actorId: actor.userId,
      shopId,
      planPublicId,
      draft,
      audit: this.auditInputFactory.createInput({
        actor,
        context,
        action: "merchant.shop_membership_card_plan.draft_update",
        targetType: "ShopMembershipCardPlan",
        metadata: { planPublicId, expectedLockVersion: draft.expectedLockVersion, name: draft.name, cardType: draft.cardType }
      })
    });
    return this.toPublicPlan(this.unwrapPlanMutation(result));
  }

  public async previewPlan(
    actor: AuthenticatedAccessContext,
    planPublicId: string,
    facts: MembershipRewardPreviewFacts
  ) {
    const plan = await this.repository.findPlan(this.requireMerchantShop(actor), planPublicId);
    if (!plan) throw this.notFound();
    const version = plan.draftVersion ?? plan.currentVersion;
    if (!version) throw this.invalidState();
    const feeRateBps = version.status === "published" && version.platformFeeRateBps !== null
      ? version.platformFeeRateBps
      : (await this.requireEffectiveFeePolicy()).feeRateBps;
    try {
      const rules = version.rules.map((rule) => {
        const persistedRule: Record<string, unknown> = { ...rule };
        delete persistedRule.publicId;
        delete persistedRule.ruleGroup;
        delete persistedRule.sortOrder;
        return membershipRewardRuleSchema.parse(persistedRule);
      });
      return evaluateMembershipRewardRules({ rules, caps: version.caps, facts, platformFeeRateBps: feeRateBps });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof RangeError) throw this.validationError(error);
      throw error;
    }
  }

  public async publishPlan(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    planPublicId: string,
    input: { expectedLockVersion: number }
  ) {
    const shopId = this.requireMerchantShop(actor);
    const plan = await this.repository.findPlan(shopId, planPublicId);
    if (!plan) throw this.notFound();
    if (!plan.draftVersion) throw this.invalidState();
    await this.assertRuleReferences(shopId, plan.draftVersion.rules);
    const result = await this.repository.publishDraftWithAudit({
      actorId: actor.userId,
      shopId,
      planPublicId,
      expectedLockVersion: input.expectedLockVersion,
      audit: this.auditInputFactory.createInput({
        actor,
        context,
        action: "merchant.shop_membership_card_plan.publish",
        targetType: "ShopMembershipCardPlan",
        metadata: { planPublicId, expectedLockVersion: input.expectedLockVersion }
      })
    });
    return this.toPublicPlan(this.unwrapPlanMutation(result));
  }

  public async retirePlan(actor: AuthenticatedAccessContext, context: AuthRequestContext, planPublicId: string) {
    const shopId = this.requireMerchantShop(actor);
    const result = await this.repository.retirePlanWithAudit({
      actorId: actor.userId,
      shopId,
      planPublicId,
      audit: this.auditInputFactory.createInput({
        actor,
        context,
        action: "merchant.shop_membership_card_plan.retire",
        targetType: "ShopMembershipCardPlan",
        metadata: { planPublicId }
      })
    });
    return this.toPublicPlan(this.unwrapPlanMutation(result));
  }

  public async listFeePolicies(actor: AuthenticatedAccessContext, input: PaginationInput) {
    this.assertOperationsIdentity(actor);
    return this.repository.listFeePolicies(input);
  }

  public async getFeePolicySummary(actor: AuthenticatedAccessContext, at = this.now()) {
    this.assertOperationsIdentity(actor);
    return this.repository.getFeePolicySummary(at);
  }

  public async createFeePolicyVersion(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: MembershipRewardFeePolicyCreateInput
  ) {
    this.assertOperationsIdentity(actor);
    if (!Number.isInteger(input.feeRateBps) || input.feeRateBps < 0 || input.feeRateBps > 10_000) throw this.validationError();
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) throw this.validationError();
    if (!(input.effectiveFrom instanceof Date) || Number.isNaN(input.effectiveFrom.getTime()) || input.effectiveFrom < this.now()) throw this.validationError();
    const reason = input.reason.trim();
    if (!reason || reason.length > 500) throw this.validationError();
    const result = await this.repository.createFeePolicyVersionWithAudit({
      actorId: actor.userId,
      feeRateBps: input.feeRateBps,
      expectedVersion: input.expectedVersion,
      effectiveFrom: input.effectiveFrom,
      reason,
      audit: this.auditInputFactory.createInput({
        actor,
        context,
        action: "platform.membership_reward_fee.publish",
        targetType: "MembershipRewardFeePolicyVersion",
        metadata: { feeRateBps: input.feeRateBps, expectedVersion: input.expectedVersion, effectiveFrom: input.effectiveFrom.toISOString(), reason }
      })
    });
    if (result.kind === "created") return result.value;
    if (result.kind === "version_conflict") {
      throw new AppError({ code: ERROR_CODES.MEMBERSHIP_REWARD_FEE_VERSION_CONFLICT, message: "error.membership_reward_fee.version_conflict", statusCode: 409 });
    }
    throw new AppError({ code: ERROR_CODES.MEMBERSHIP_REWARD_FEE_POLICY_CONFLICT, message: "error.membership_reward_fee.policy_conflict", statusCode: 409 });
  }

  private normalizeDraft(input: ShopMembershipCardPlanDraftInput): ShopMembershipCardPlanDraftPersistenceInput {
    try {
      if (!Number.isInteger(input.expectedLockVersion) || input.expectedLockVersion < 0) throw new Error("lock");
      const name = input.name.trim();
      const description = input.description?.trim() || null;
      if (!name || name.length > 120 || (description?.length ?? 0) > 500) throw new Error("copy");
      const caps = membershipRewardCapsSchema.parse(input.caps);
      const rules = membershipRewardRuleListSchema.parse(input.rules);
      this.assertValidity(input.validity);
      const issuance = this.normalizeIssuance(input.issuance);
      if (input.cardType === "stored_value" && (issuance.minInitialUses !== null || issuance.maxInitialUses !== null)) throw this.invalidCardFields();
      if (input.cardType === "count" && (issuance.minInitialPrincipalJpy !== null || issuance.maxInitialPrincipalJpy !== null)) throw this.invalidCardFields();
      if (input.cardType === "benefit" && Object.values(issuance).some((value) => value !== null)) throw this.invalidCardFields();
      return { ...input, name, description, issuance, caps, rules };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw this.validationError(error);
    }
  }

  private normalizeIssuance(input: ShopMembershipCardPlanDraftInput["issuance"]) {
    const values = Object.values(input);
    if (values.some((value) => value !== null && (!Number.isSafeInteger(value) || value < 0))) throw this.invalidCardFields();
    if (input.minInitialPrincipalJpy !== null && input.maxInitialPrincipalJpy !== null && input.minInitialPrincipalJpy > input.maxInitialPrincipalJpy) throw this.invalidCardFields();
    if (input.minInitialUses !== null && input.maxInitialUses !== null && input.minInitialUses > input.maxInitialUses) throw this.invalidCardFields();
    return { ...input };
  }

  private assertValidity(validity: ShopMembershipCardPlanDraftInput["validity"]): void {
    if (validity.mode === "never") return;
    if (validity.mode === "fixed_days" && Number.isInteger(validity.days) && validity.days > 0 && validity.days <= 3650) return;
    if (validity.mode === "fixed_date" && validity.expiresAt instanceof Date && validity.expiresAt > this.now()) return;
    throw this.validationError();
  }

  private async assertRuleReferences(shopId: number, rules: MembershipRewardRuleInput[]): Promise<void> {
    const servicePublicIds = [...new Set(rules.flatMap((rule) => [...rule.scope.servicePublicIds, ...rule.scope.excludedServicePublicIds]))];
    const categoryCodes = [...new Set(rules.flatMap((rule) => [...rule.scope.categoryCodes, ...rule.scope.excludedCategoryCodes]))];
    if (await this.repository.validateShopRuleReferences(shopId, servicePublicIds, categoryCodes)) return;
    throw new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_PLAN_RULE_REFERENCE_NOT_FOUND, message: "error.shop_membership_card_plan.rule_reference_not_found", statusCode: 404 });
  }

  private async requireEffectiveFeePolicy(): Promise<MembershipRewardFeePolicyPayload> {
    const policy = await this.repository.getEffectiveFeePolicy(this.now());
    if (policy) return policy;
    throw new AppError({ code: ERROR_CODES.MEMBERSHIP_REWARD_FEE_POLICY_CONFLICT, message: "error.membership_reward_fee.policy_conflict", statusCode: 409 });
  }

  private unwrapPlanMutation(result: Awaited<ReturnType<ShopMembershipCardPlanRepositoryPort["publishDraftWithAudit"]>>): ShopMembershipCardPlanPayload {
    if ("value" in result) return result.value;
    if (result.kind === "not_found") throw this.notFound();
    if (result.kind === "version_conflict") throw this.versionConflict();
    if (result.kind === "fee_policy_conflict") throw new AppError({ code: ERROR_CODES.MEMBERSHIP_REWARD_FEE_POLICY_CONFLICT, message: "error.membership_reward_fee.policy_conflict", statusCode: 409 });
    throw this.invalidState();
  }

  private toPublicPlan(plan: ShopMembershipCardPlanPayload) {
    const stripVersion = (version: ShopMembershipCardPlanPayload["draftVersion"]) => {
      if (!version) return null;
      const { internalId: _internalId, ...publicVersion } = version;
      void _internalId;
      return publicVersion;
    };
    const { internalId: _internalId, currentVersion, draftVersion, ...publicPlan } = plan;
    void _internalId;
    return { ...publicPlan, currentVersion: stripVersion(currentVersion), draftVersion: stripVersion(draftVersion) };
  }

  private requireMerchantShop(actor: AuthenticatedAccessContext): number {
    if (!actor.currentIdentityType || !merchantIdentityTypes.has(actor.currentIdentityType) || actor.currentIdentityScopeType !== "shop" || !actor.currentIdentityScopeId) {
      throw new AppError({ code: ERROR_CODES.IDENTITY_FORBIDDEN, message: "error.identity.forbidden", statusCode: 403 });
    }
    return actor.currentIdentityScopeId;
  }

  private assertOperationsIdentity(actor: AuthenticatedAccessContext): void {
    if (actor.currentIdentityScopeType !== "global" && actor.currentIdentityScopeType !== "platform") {
      throw new AppError({ code: ERROR_CODES.IDENTITY_FORBIDDEN, message: "error.identity.forbidden", statusCode: 403 });
    }
  }

  private notFound(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_PLAN_NOT_FOUND, message: "error.shop_membership_card_plan.not_found", statusCode: 404 });
  }

  private versionConflict(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_PLAN_VERSION_CONFLICT, message: "error.shop_membership_card_plan.version_conflict", statusCode: 409 });
  }

  private invalidState(): AppError {
    return new AppError({ code: ERROR_CODES.SHOP_MEMBERSHIP_CARD_PLAN_INVALID_STATE, message: "error.shop_membership_card_plan.invalid_state", statusCode: 409 });
  }

  private invalidCardFields(): AppError {
    return new AppError({ code: ERROR_CODES.VALIDATION, message: "error.shop_membership_card_plan.invalid_card_fields", statusCode: 400 });
  }

  private validationError(cause?: unknown): AppError {
    return new AppError({ code: ERROR_CODES.VALIDATION, message: "error.validation", statusCode: 400, cause });
  }
}
