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
import type {
  PlatformMembershipEntitlementMutationResult,
  PlatformMembershipRepositoryPort,
  PlatformMembershipTierDraftPersistenceInput,
  PlatformMembershipTierMutationResult,
  PlatformMembershipTierVersionPayload
} from "../repositories/platform-membership.repository";
import { AppError } from "../utils/app-error";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

type AuditInputFactory = Pick<AuditLogService, "createInput">;

export type PlatformMembershipTierDraftInput =
  PlatformMembershipTierDraftPersistenceInput;

const tierCodeSet = new Set<string>(PLATFORM_MEMBERSHIP_TIER_CODES);
const entitlementSourceSet = new Set<string>(PLATFORM_MEMBERSHIP_ENTITLEMENT_SOURCES);
const hexColorPattern = /^#[0-9A-Fa-f]{6}$/;
const themeKeys = [
  "detailAccentColor",
  "detailSurfaceColor",
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
    private readonly now: () => Date = () => new Date()
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

    const entitlement = await this.repository.findActiveEntitlementAt(userId, occurredAt);
    if (entitlement) return entitlement;

    const freeTier = await this.repository.findPublishedTierAt("free", occurredAt);
    if (freeTier) return freeTier;

    throw new AppError({
      code: ERROR_CODES.INTERNAL,
      message: "error.platform_membership.free_version_unavailable",
      statusCode: 500
    });
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
    this.assertThemeContrast(draft.theme.detailAccentColor, draft.theme.detailSurfaceColor);

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

  private assertThemeContrast(accentColor: string, surfaceColor: string): void {
    if (this.contrastRatio(accentColor, surfaceColor) >= 3) return;
    throw new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.platform_membership.theme_contrast",
      statusCode: 400
    });
  }

  private contrastRatio(first: string, second: string): number {
    const luminance = (value: string): number => {
      const channels = [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
      const linear = channels.map((channel) =>
        channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      );
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
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

  private assertOperationsIdentity(actor: AuthenticatedAccessContext): void {
    if (actor.currentIdentityScopeType === "global" || actor.currentIdentityScopeType === "platform") {
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
