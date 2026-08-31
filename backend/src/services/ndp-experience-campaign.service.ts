import { ERROR_CODES } from "../constants/error-codes";
import type {
  NdpExperienceCampaignDraftInput,
  NdpExperienceCampaignMutationResult,
  NdpExperienceCampaignPayload,
  NdpExperienceCampaignRepositoryPort
} from "../domain/ndp-experience-campaign";
import { AppError } from "../utils/app-error";
import type { PaginationInput } from "../utils/pagination";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

type AuditInputFactory = Pick<AuditLogService, "createInput">;

export class NdpExperienceCampaignService {
  public constructor(
    private readonly repository: NdpExperienceCampaignRepositoryPort,
    private readonly auditInputFactory?: AuditInputFactory,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async resolveCampaignAt(occurredAt: Date): Promise<{
    factorBps: number;
    versionPublicId: string | null;
  }> {
    if (Number.isNaN(occurredAt.getTime())) throw this.validationError();
    const campaign = await this.repository.resolveCampaignAt(occurredAt);
    return campaign
      ? { factorBps: campaign.factorBps, versionPublicId: campaign.versionPublicId }
      : { factorBps: 10_000, versionPublicId: null };
  }

  public async listCampaigns(actor: AuthenticatedAccessContext, query: PaginationInput) {
    this.assertOperationsIdentity(actor);
    return this.repository.listCampaigns(query);
  }

  public async saveDraft(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: NdpExperienceCampaignDraftInput
  ): Promise<NdpExperienceCampaignPayload> {
    this.assertOperationsIdentity(actor);
    const draft = this.normalizeDraft(input);
    const result = await this.repository.saveDraftWithAudit({
      actorId: actor.userId,
      draft,
      audit: this.requireAuditFactory().createInput({
        actor,
        context,
        action: "backoffice.ndp_experience_campaign.draft_save",
        targetType: "NdpExperienceCampaign",
        metadata: {
          expectedPublishedVersion: draft.expectedPublishedVersion,
          expectedDraftLockVersion: draft.expectedDraftLockVersion,
          name: draft.name,
          factorBps: draft.factorBps,
          effectiveFrom: draft.effectiveFrom.toISOString(),
          effectiveTo: draft.effectiveTo.toISOString()
        }
      })
    });
    return this.unwrap(result);
  }

  public async publishDraft(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: { versionPublicId: string; expectedVersion: number; expectedLockVersion: number }
  ): Promise<NdpExperienceCampaignPayload> {
    this.assertOperationsIdentity(actor);
    this.assertMutationIdentity(input);
    const publishedAt = this.now();
    const result = await this.repository.publishDraftWithAudit({
      actorId: actor.userId,
      ...input,
      publishedAt,
      audit: this.requireAuditFactory().createInput({
        actor,
        context,
        action: "backoffice.ndp_experience_campaign.publish",
        targetType: "NdpExperienceCampaign",
        metadata: {
          versionPublicId: input.versionPublicId,
          version: input.expectedVersion,
          publishedAt: publishedAt.toISOString()
        }
      })
    });
    return this.unwrap(result);
  }

  public async archiveCampaign(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: {
      versionPublicId: string;
      expectedVersion: number;
      expectedLockVersion: number;
      reason: string;
    }
  ): Promise<NdpExperienceCampaignPayload> {
    this.assertOperationsIdentity(actor);
    this.assertMutationIdentity(input);
    const reason = input.reason.trim();
    if (!reason || reason.length > 500) throw this.validationError();
    const archivedAt = this.now();
    const result = await this.repository.archiveCampaignWithAudit({
      actorId: actor.userId,
      versionPublicId: input.versionPublicId,
      expectedVersion: input.expectedVersion,
      expectedLockVersion: input.expectedLockVersion,
      reason,
      archivedAt,
      audit: this.requireAuditFactory().createInput({
        actor,
        context,
        action: "backoffice.ndp_experience_campaign.archive",
        targetType: "NdpExperienceCampaign",
        metadata: {
          versionPublicId: input.versionPublicId,
          version: input.expectedVersion,
          reason,
          archivedAt: archivedAt.toISOString()
        }
      })
    });
    return this.unwrap(result);
  }

  private normalizeDraft(input: NdpExperienceCampaignDraftInput): NdpExperienceCampaignDraftInput {
    const name = input.name.trim();
    const description = input.description?.trim() || null;
    if (
      !Number.isInteger(input.expectedPublishedVersion) ||
      input.expectedPublishedVersion < 0 ||
      (input.expectedDraftLockVersion !== null &&
        (!Number.isInteger(input.expectedDraftLockVersion) || input.expectedDraftLockVersion < 1)) ||
      !name ||
      name.length > 120 ||
      (description?.length ?? 0) > 500 ||
      !Number.isInteger(input.factorBps) ||
      input.factorBps < 1 ||
      input.factorBps > 1_000_000 ||
      Number.isNaN(input.effectiveFrom.getTime()) ||
      Number.isNaN(input.effectiveTo.getTime()) ||
      input.effectiveFrom.getTime() >= input.effectiveTo.getTime()
    ) {
      throw this.validationError();
    }
    return { ...input, name, description };
  }

  private assertMutationIdentity(input: {
    versionPublicId: string;
    expectedVersion: number;
    expectedLockVersion: number;
  }): void {
    if (
      !input.versionPublicId ||
      input.versionPublicId.length > 64 ||
      !Number.isInteger(input.expectedVersion) ||
      input.expectedVersion < 1 ||
      !Number.isInteger(input.expectedLockVersion) ||
      input.expectedLockVersion < 1
    ) {
      throw this.validationError();
    }
  }

  private unwrap(result: NdpExperienceCampaignMutationResult): NdpExperienceCampaignPayload {
    if ("value" in result) return result.value;
    if (result.kind === "not_found") {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.ndp_experience_campaign.not_found",
        statusCode: 404
      });
    }
    throw new AppError({
      code: ERROR_CODES.NDP_EXPERIENCE_CAMPAIGN_CONFLICT,
      message:
        result.kind === "overlap"
          ? "error.ndp_experience_campaign.overlap"
          : "error.ndp_experience_campaign.conflict",
      statusCode: 409
    });
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
      message: "error.ndp_experience_campaign.audit_unavailable",
      statusCode: 500
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
