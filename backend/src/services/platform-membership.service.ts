import { ERROR_CODES } from "../constants/error-codes";
import {
  PLATFORM_MEMBERSHIP_BENEFIT_CODES,
  PLATFORM_MEMBERSHIP_TIER_CODES,
  type PlatformMembershipTierCodeValue
} from "../domain/platform-membership";
import {
  PLATFORM_MEMBERSHIP_ENTITLEMENT_SOURCES,
  type PlatformMembershipEntitlementChangeResult,
  type PlatformMembershipEntitlementCommand
} from "../domain/platform-membership-entitlement";
import type { MembershipRenewalExperienceSource } from "../domain/user-experience";
import type {
  PlatformMembershipBenefitAdministrationPayload,
  PlatformMembershipLocalizedText,
  PlatformMembershipBenefitMutationResult,
  PlatformMembershipEntitlementMutationResult,
  PlatformMembershipRepositoryPort,
  PlatformMembershipTierDraftPersistenceInput,
  PlatformMembershipTierMutationResult,
  PlatformMembershipTierAdministrationPayload,
  PlatformMembershipTierVersionPayload
} from "../repositories/platform-membership.repository";
import { AppError } from "../utils/app-error";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import {
  MembershipBenefitCapabilityService,
  type MembershipBenefitDeliveryCapability
} from "./membership-benefit-capability.service";
import type {
  PlatformMembershipBenefitUpdateBody,
  UserMembershipAdjustmentBody
} from "../validators/platform-membership.validator";

type AuditInputFactory = Pick<AuditLogService, "createInput">;

export interface PlatformMembershipExperienceRecorderPort {
  recordMembershipRenewal: (
    source: MembershipRenewalExperienceSource,
    options?: { transactionClient?: unknown }
  ) => Promise<unknown>;
}

export type PlatformMembershipTierDraftInput = PlatformMembershipTierDraftPersistenceInput;

export type MembershipBenefitLocale = "zh" | "zh-Hant" | "ja" | "en" | "ko";

export interface CurrentMembershipBenefitItem {
  code: (typeof PLATFORM_MEMBERSHIP_BENEFIT_CODES)[number];
  configuredEnabled: boolean;
  globallyEnabled: boolean;
  effective: boolean;
  deliveryCapability: MembershipBenefitDeliveryCapability;
  name: string;
  description: string;
}

const tierCodeSet = new Set<string>(PLATFORM_MEMBERSHIP_TIER_CODES);
const benefitCodeSet = new Set<string>(PLATFORM_MEMBERSHIP_BENEFIT_CODES);
const entitlementSourceSet = new Set<string>(PLATFORM_MEMBERSHIP_ENTITLEMENT_SOURCES);
const hexColorPattern = /^#[0-9A-Fa-f]{6}$/;
const themeKeys = [
  "detailAccentColor",
  "detailSurfaceColor",
  "detailSurfaceMiddleColor",
  "detailSurfaceBottomColor",
  "detailItemSurfaceColor",
  "detailOuterBorderColor",
  "detailItemBorderColor",
  "detailAvatarBorderColor",
  "simpleTopColor",
  "simpleBottomColor"
] as const;

export class PlatformMembershipService {
  public constructor(
    private readonly repository: PlatformMembershipRepositoryPort,
    private readonly auditInputFactory?: AuditInputFactory,
    private readonly now: () => Date = () => new Date(),
    private readonly experienceRecorder?: PlatformMembershipExperienceRecorderPort,
    private readonly benefitCapabilities = new MembershipBenefitCapabilityService()
  ) {}

  public async resolveMembershipAt(userId: number, occurredAt: Date) {
    if (!Number.isInteger(userId) || userId <= 0 || Number.isNaN(occurredAt.getTime())) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.validation",
        statusCode: 400
      });
    }

    if (!(await this.repository.hasActiveCustomerProfile(userId))) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.platform_membership.customer_required",
        statusCode: 422
      });
    }

    const [entitlement, adjustment] = await Promise.all([
      this.repository.findActiveEntitlementAt(userId, occurredAt),
      this.repository.findActiveAdjustmentAt?.(userId, occurredAt) ?? Promise.resolve(null)
    ]);
    const baseMembership =
      adjustment?.tierMembership ??
      entitlement ??
      (await this.repository.findPublishedTierAt("free", occurredAt));
    if (baseMembership) {
      return {
        ...baseMembership,
        multiplier: adjustment?.multiplier ?? baseMembership.multiplier,
        adjustmentLockVersion: adjustment?.lockVersion ?? null
      };
    }

    throw new AppError({
      code: ERROR_CODES.INTERNAL,
      message: "error.platform_membership.free_version_unavailable",
      statusCode: 500
    });
  }

  public async getMyMembership(actor: AuthenticatedAccessContext) {
    const occurredAt = this.now();
    const [membership, ekycVerified] = await Promise.all([
      this.resolveMembershipAt(actor.userId, occurredAt),
      this.repository.hasVerifiedEkycAt(actor.userId, occurredAt)
    ]);
    return {
      tierCode: membership.tierCode,
      tierVersionPublicId: membership.tierVersionPublicId,
      multiplier: membership.multiplier,
      expiresAt: membership.expiresAt?.toISOString() ?? null,
      ekycVerified,
      benefits: membership.benefits.map((benefit) => ({
        code: benefit.code,
        configuration: benefit.configuration
      })),
      theme: membership.theme
    };
  }

  public async getMyMembershipBenefits(
    actor: AuthenticatedAccessContext,
    locale: MembershipBenefitLocale
  ): Promise<{
    tierCode: PlatformMembershipTierCodeValue;
    tierVersionPublicId: string;
    expiresAt: string | null;
    list: CurrentMembershipBenefitItem[];
  }> {
    const membership = await this.resolveMembershipAt(actor.userId, this.now());
    if (!membership.benefitCatalog) {
      throw new AppError({
        code: ERROR_CODES.INTERNAL,
        message: "error.platform_membership.benefit_catalog_unavailable",
        statusCode: 500
      });
    }
    return {
      tierCode: membership.tierCode,
      tierVersionPublicId: membership.tierVersionPublicId,
      expiresAt: membership.expiresAt?.toISOString() ?? null,
      list: membership.benefitCatalog.map((benefit) => {
        const deliveryCapability = this.benefitCapabilities.resolve(benefit.code);
        return {
          code: benefit.code,
          configuredEnabled: benefit.configuredEnabled,
          globallyEnabled: benefit.globallyEnabled,
          effective:
            benefit.configuredEnabled &&
            benefit.globallyEnabled &&
            deliveryCapability === "available",
          deliveryCapability,
          name: benefit.nameTranslations[locale],
          description: benefit.descriptionTranslations[locale]
        };
      })
    };
  }

  public async listTiersForAdministration(
    actor: AuthenticatedAccessContext
  ): Promise<PlatformMembershipTierAdministrationPayload[]> {
    this.assertOperationsIdentity(actor);
    const tiers = await this.repository.listTiersForAdministration();
    if (
      tiers.length !== PLATFORM_MEMBERSHIP_TIER_CODES.length ||
      tiers.some((tier, index) => tier.tierCode !== PLATFORM_MEMBERSHIP_TIER_CODES[index])
    ) {
      throw this.catalogInvalid();
    }
    return tiers;
  }

  public async getTierDraft(
    actor: AuthenticatedAccessContext,
    tierCode: PlatformMembershipTierCodeValue
  ): Promise<PlatformMembershipTierVersionPayload> {
    this.assertOperationsIdentity(actor);
    const normalizedTierCode = this.normalizeTierCode(tierCode);
    const draft = await this.repository.findTierDraft(normalizedTierCode);
    if (draft) return draft;
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.platform_membership.draft_not_found",
      statusCode: 404
    });
  }

  public async listBenefitsForAdministration(
    actor: AuthenticatedAccessContext
  ): Promise<PlatformMembershipBenefitAdministrationPayload[]> {
    this.assertOperationsIdentity(actor);
    const benefits = await this.repository.listBenefitsForAdministration();
    if (
      benefits.length !== PLATFORM_MEMBERSHIP_BENEFIT_CODES.length ||
      benefits.some((benefit, index) => benefit.code !== PLATFORM_MEMBERSHIP_BENEFIT_CODES[index])
    ) {
      throw this.catalogInvalid();
    }
    return benefits;
  }

  public async updateBenefit(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    benefitCode: string,
    input: PlatformMembershipBenefitUpdateBody
  ): Promise<PlatformMembershipBenefitAdministrationPayload> {
    this.assertOperationsIdentity(actor);
    const normalizedBenefitCode = this.normalizeBenefitCode(benefitCode);
    if (
      typeof input.isGloballyEnabled !== "boolean" ||
      !Number.isInteger(input.sortOrder) ||
      input.sortOrder < 0 ||
      input.sortOrder > 10_000 ||
      !Number.isInteger(input.expectedLockVersion) ||
      input.expectedLockVersion < 1
    ) {
      throw this.validationError();
    }
    const nameTranslations = this.normalizeLocalizedText(input.nameTranslations, 120);
    const descriptionTranslations = this.normalizeLocalizedText(
      input.descriptionTranslations,
      1_000
    );
    const result = await this.repository.updateBenefitWithAudit({
      actorId: actor.userId,
      benefitCode: normalizedBenefitCode,
      isGloballyEnabled: input.isGloballyEnabled,
      sortOrder: input.sortOrder,
      nameTranslations,
      descriptionTranslations,
      expectedLockVersion: input.expectedLockVersion,
      audit: this.requireAuditFactory().createInput({
        actor,
        context,
        action: "platform.membership_benefit.update",
        targetType: "PlatformMembershipBenefit",
        metadata: {
          benefitCode: normalizedBenefitCode,
          isGloballyEnabled: input.isGloballyEnabled,
          sortOrder: input.sortOrder,
          expectedLockVersion: input.expectedLockVersion
        }
      })
    });
    return this.unwrapBenefitMutation(result);
  }

  public async changeEntitlement(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    userId: number,
    command: PlatformMembershipEntitlementCommand
  ): Promise<PlatformMembershipEntitlementChangeResult> {
    this.assertOperationsIdentity(actor);
    if (!Number.isInteger(userId) || userId <= 0) throw this.validationError();
    const normalized = this.normalizeEntitlementCommand(command);

    if (!(await this.repository.hasActiveCustomerProfile(userId))) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.platform_membership.customer_required",
        statusCode: 422
      });
    }

    const occurredAt = this.now();
    const result = await this.repository.changeEntitlementWithAudit({
      actorId: actor.userId,
      userId,
      occurredAt,
      command: normalized,
      ...(this.experienceRecorder
        ? {
            onEntitlementCreated: async ({ transactionClient, ...source }) => {
              await this.experienceRecorder!.recordMembershipRenewal(source, {
                transactionClient
              });
            }
          }
        : {}),
      audit: this.requireAuditFactory().createInput({
        actor,
        context,
        action: `platform.membership_entitlement.${normalized.kind}`,
        targetType: "PlatformMembershipEntitlement",
        metadata: {
          userId,
          kind: normalized.kind,
          source: normalized.source,
          sourceReference: normalized.sourceReference,
          expectedCurrentLockVersion: normalized.expectedCurrentLockVersion,
          occurredAt: occurredAt.toISOString()
        }
      })
    });
    return this.unwrapEntitlementMutation(result);
  }

  public async adjustUserMembership(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    userId: number,
    input: UserMembershipAdjustmentBody
  ) {
    this.assertOperationsIdentity(actor);
    if (!Number.isInteger(userId) || userId <= 0) throw this.validationError();
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if (
      reason.length < 1 ||
      reason.length > 500 ||
      (input.tierCode === undefined && input.multiplier === undefined) ||
      (input.multiplier !== undefined &&
        (!Number.isFinite(input.multiplier) || input.multiplier <= 0 || input.multiplier > 100)) ||
      (input.expectedLockVersion !== null &&
        (!Number.isInteger(input.expectedLockVersion) || input.expectedLockVersion < 1))
    ) {
      throw this.validationError();
    }
    const tierCode =
      input.tierCode === undefined ? undefined : this.normalizeTierCode(input.tierCode);
    const multiplierBps =
      input.multiplier === undefined ? undefined : Math.round(input.multiplier * 10_000);
    const effectiveFrom = this.now();
    const adjust = this.repository.adjustUserMembershipWithAudit;
    if (!adjust) throw this.invalidState();
    const result = await adjust.call(this.repository, {
      actorId: actor.userId,
      userId,
      ...(tierCode === undefined ? {} : { tierCode }),
      ...(multiplierBps === undefined ? {} : { multiplierBps }),
      reason,
      expectedLockVersion: input.expectedLockVersion,
      effectiveFrom,
      audit: this.requireAuditFactory().createInput({
        actor,
        context,
        action: "platform.user_membership.adjust",
        targetType: "UserMembershipAdjustment",
        metadata: {
          userId,
          tierCode: tierCode ?? null,
          multiplierBps: multiplierBps ?? null,
          reason,
          expectedLockVersion: input.expectedLockVersion,
          effectiveFrom: effectiveFrom.toISOString()
        }
      })
    });
    if ("value" in result) return result.value;
    if (result.kind === "not_found") {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.platform_membership.adjustment_target_not_found",
        statusCode: 404
      });
    }
    if (result.kind === "version_conflict") throw this.versionConflict();
    throw this.invalidState();
  }

  public async saveTierDraft(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    tierCode: PlatformMembershipTierCodeValue,
    input: PlatformMembershipTierDraftInput
  ): Promise<PlatformMembershipTierVersionPayload> {
    this.assertOperationsIdentity(actor);
    const normalizedTierCode = this.normalizeTierCode(tierCode);
    const draft = this.normalizeDraft(normalizedTierCode, input);
    const result = await this.repository.saveTierDraftWithAudit({
      actorId: actor.userId,
      tierCode: normalizedTierCode,
      draft,
      audit: this.requireAuditFactory().createInput({
        actor,
        context,
        action: "platform.membership_tier.draft_save",
        targetType: "PlatformMembershipTier",
        metadata: {
          tierCode: normalizedTierCode,
          expectedVersion: draft.expectedVersion,
          expectedLockVersion: draft.expectedLockVersion
        }
      })
    });
    return this.unwrapMutation(result);
  }

  public async publishTierVersion(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    tierCode: PlatformMembershipTierCodeValue,
    input: { expectedVersion: number; expectedLockVersion: number }
  ): Promise<PlatformMembershipTierVersionPayload> {
    this.assertOperationsIdentity(actor);
    const normalizedTierCode = this.normalizeTierCode(tierCode);
    this.assertVersion(input.expectedVersion, input.expectedLockVersion);
    const draft = await this.repository.findTierDraft(normalizedTierCode);
    if (!draft) throw this.invalidState();
    if (
      draft.version !== input.expectedVersion ||
      draft.lockVersion !== input.expectedLockVersion
    ) {
      throw this.versionConflict();
    }
    const result = await this.repository.publishTierDraftWithAudit({
      actorId: actor.userId,
      tierCode: normalizedTierCode,
      expectedVersion: input.expectedVersion,
      expectedLockVersion: input.expectedLockVersion,
      audit: this.requireAuditFactory().createInput({
        actor,
        context,
        action: "platform.membership_tier.publish",
        targetType: "PlatformMembershipTierVersion",
        metadata: {
          tierCode: normalizedTierCode,
          tierVersionPublicId: draft.tierVersionPublicId,
          version: draft.version,
          expectedLockVersion: input.expectedLockVersion,
          publishedAt: this.now().toISOString()
        }
      })
    });
    return this.unwrapMutation(result);
  }

  private normalizeDraft(
    tierCode: PlatformMembershipTierCodeValue,
    input: PlatformMembershipTierDraftInput
  ): PlatformMembershipTierDraftPersistenceInput {
    this.assertVersion(input.expectedVersion, input.expectedLockVersion);
    const isFree = tierCode === "free";
    if (
      (isFree &&
        (input.durationDays !== null ||
          input.monthlyValueNdp !== 0 ||
          input.annualBillingMonths !== 0)) ||
      (!isFree &&
        (!Number.isInteger(input.durationDays) ||
          (input.durationDays ?? 0) <= 0 ||
          (input.durationDays ?? 0) > 3_650 ||
          !Number.isSafeInteger(input.monthlyValueNdp) ||
          input.monthlyValueNdp <= 0 ||
          !Number.isInteger(input.annualBillingMonths) ||
          input.annualBillingMonths < 1 ||
          input.annualBillingMonths > 12))
    ) {
      throw this.validationError();
    }
    if (
      !Number.isFinite(input.experienceMultiplier) ||
      input.experienceMultiplier <= 0 ||
      input.experienceMultiplier > 100 ||
      !Number.isInteger(input.experienceMultiplier * 10_000)
    ) {
      throw this.validationError();
    }

    const description = input.description?.trim() || null;
    if ((description?.length ?? 0) > 500) throw this.validationError();

    if (
      !input.theme ||
      Object.keys(input.theme).length !== themeKeys.length ||
      themeKeys.some((key) => !(key in input.theme))
    ) {
      throw this.validationError();
    }
    const normalizeColor = (key: (typeof themeKeys)[number]): string => {
      const value = input.theme[key];
      if (!hexColorPattern.test(value)) throw this.validationError();
      return value.toUpperCase();
    };
    const theme: PlatformMembershipTierDraftPersistenceInput["theme"] = {
      detailAccentColor: normalizeColor("detailAccentColor"),
      detailSurfaceColor: normalizeColor("detailSurfaceColor"),
      detailSurfaceMiddleColor: normalizeColor("detailSurfaceMiddleColor"),
      detailSurfaceBottomColor: normalizeColor("detailSurfaceBottomColor"),
      detailItemSurfaceColor: normalizeColor("detailItemSurfaceColor"),
      detailOuterBorderColor: normalizeColor("detailOuterBorderColor"),
      detailItemBorderColor: normalizeColor("detailItemBorderColor"),
      detailAvatarBorderColor: normalizeColor("detailAvatarBorderColor"),
      simpleTopColor: normalizeColor("simpleTopColor"),
      simpleBottomColor: normalizeColor("simpleBottomColor")
    };

    if (input.benefits.length !== PLATFORM_MEMBERSHIP_BENEFIT_CODES.length) {
      throw this.validationError();
    }
    const benefitByCode = new Map(input.benefits.map((benefit) => [benefit.code, benefit]));
    if (
      benefitByCode.size !== PLATFORM_MEMBERSHIP_BENEFIT_CODES.length ||
      PLATFORM_MEMBERSHIP_BENEFIT_CODES.some((code) => !benefitByCode.has(code))
    ) {
      throw this.validationError();
    }
    const benefits = PLATFORM_MEMBERSHIP_BENEFIT_CODES.map((code) => {
      const benefit = benefitByCode.get(code);
      if (!benefit) throw this.validationError();
      const configuration = this.normalizeBenefitConfiguration(code, benefit.configuration);
      return { code, isEnabled: benefit.isEnabled, configuration };
    });

    return { ...input, description, theme, benefits };
  }

  private normalizeEntitlementCommand(
    command: PlatformMembershipEntitlementCommand
  ): PlatformMembershipEntitlementCommand {
    if (!command || typeof command !== "object") throw this.validationError();
    const sourceReference = command.sourceReference?.trim();
    if (
      !entitlementSourceSet.has(command.source) ||
      !sourceReference ||
      sourceReference.length > 160
    ) {
      throw this.validationError();
    }

    if (command.kind === "expire") {
      if (
        !Number.isInteger(command.expectedCurrentLockVersion) ||
        command.expectedCurrentLockVersion < 1
      ) {
        throw this.validationError();
      }
      return { ...command, sourceReference };
    }

    if (
      !["grant", "renew", "upgrade", "schedule_downgrade"].includes(command.kind) ||
      !tierCodeSet.has(command.targetTierCode) ||
      command.targetTierCode === "free" ||
      !["monthly", "annual"].includes(command.billingCycle) ||
      (command.kind === "grant"
        ? command.expectedCurrentLockVersion !== null
        : !Number.isInteger(command.expectedCurrentLockVersion) ||
          (command.expectedCurrentLockVersion ?? 0) < 1)
    ) {
      throw this.validationError();
    }
    return {
      ...command,
      targetTierCode: command.targetTierCode as PlatformMembershipTierCodeValue,
      sourceReference
    };
  }

  private normalizeBenefitConfiguration(
    code: PlatformMembershipTierDraftPersistenceInput["benefits"][number]["code"],
    configuration: Record<string, unknown>
  ): Record<string, unknown> {
    if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) {
      throw this.validationError();
    }
    if (code !== "ndp_experience") {
      if (Object.keys(configuration).length !== 0) throw this.validationError();
      return {};
    }

    const keys = Object.keys(configuration).sort();
    if (keys.join(",") !== "extraAwardExpUnits,extraThresholdNdp") {
      throw this.validationError();
    }
    const threshold = configuration.extraThresholdNdp;
    const award = configuration.extraAwardExpUnits;
    const thresholdValid =
      threshold === null || (Number.isSafeInteger(threshold) && Number(threshold) > 0);
    const awardValid = award === null || (Number.isSafeInteger(award) && Number(award) > 0);
    if (!thresholdValid || !awardValid || (threshold === null) !== (award === null)) {
      throw this.validationError();
    }
    return { extraThresholdNdp: threshold, extraAwardExpUnits: award };
  }

  private assertVersion(expectedVersion: number, expectedLockVersion: number): void {
    if (
      !Number.isInteger(expectedVersion) ||
      expectedVersion < 1 ||
      !Number.isInteger(expectedLockVersion) ||
      expectedLockVersion < 1
    ) {
      throw this.validationError();
    }
  }

  private normalizeTierCode(tierCode: string): PlatformMembershipTierCodeValue {
    if (tierCodeSet.has(tierCode)) return tierCode as PlatformMembershipTierCodeValue;
    throw this.validationError();
  }

  private normalizeBenefitCode(
    benefitCode: string
  ): (typeof PLATFORM_MEMBERSHIP_BENEFIT_CODES)[number] {
    if (benefitCodeSet.has(benefitCode)) {
      return benefitCode as (typeof PLATFORM_MEMBERSHIP_BENEFIT_CODES)[number];
    }
    throw this.validationError();
  }

  private normalizeLocalizedText(
    value: PlatformMembershipLocalizedText,
    maxLength: number
  ): PlatformMembershipLocalizedText {
    const locales = ["zh", "zh-Hant", "ja", "en", "ko"] as const;
    const result = {} as PlatformMembershipLocalizedText;
    for (const locale of locales) {
      const text = value?.[locale]?.trim();
      if (!text || text.length > maxLength) throw this.validationError();
      result[locale] = text;
    }
    return result;
  }

  private assertOperationsIdentity(actor: AuthenticatedAccessContext): void {
    if (
      actor.currentIdentityScopeType === "global" ||
      actor.currentIdentityScopeType === "platform"
    ) {
      return;
    }
    throw new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }

  private requireAuditFactory(): AuditInputFactory {
    if (this.auditInputFactory) return this.auditInputFactory;
    throw new AppError({
      code: ERROR_CODES.INTERNAL,
      message: "error.platform_membership.audit_unavailable",
      statusCode: 500
    });
  }

  private unwrapMutation(
    result: PlatformMembershipTierMutationResult
  ): PlatformMembershipTierVersionPayload {
    if ("value" in result) return result.value;
    if (result.kind === "not_found") {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.platform_membership.tier_not_found",
        statusCode: 404
      });
    }
    if (result.kind === "version_conflict") throw this.versionConflict();
    throw this.invalidState();
  }

  private unwrapEntitlementMutation(
    result: PlatformMembershipEntitlementMutationResult
  ): PlatformMembershipEntitlementChangeResult {
    if ("value" in result) return result.value;
    if (result.kind === "not_found") {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.platform_membership.entitlement_target_not_found",
        statusCode: 404
      });
    }
    if (result.kind === "version_conflict") throw this.versionConflict();
    throw this.invalidState();
  }

  private unwrapBenefitMutation(
    result: PlatformMembershipBenefitMutationResult
  ): PlatformMembershipBenefitAdministrationPayload {
    if ("value" in result) return result.value;
    if (result.kind === "version_conflict") throw this.versionConflict();
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.platform_membership.benefit_not_found",
      statusCode: 404
    });
  }

  private catalogInvalid(): AppError {
    return new AppError({
      code: ERROR_CODES.INTERNAL,
      message: "error.platform_membership.catalog_invalid",
      statusCode: 500
    });
  }

  private versionConflict(): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.platform_membership.version_conflict",
      statusCode: 409
    });
  }

  private invalidState(): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.platform_membership.invalid_state",
      statusCode: 409
    });
  }

  private validationError(): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.validation",
      statusCode: 400
    });
  }
}
