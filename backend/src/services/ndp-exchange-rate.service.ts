import { ERROR_CODES } from "../constants/error-codes";
import type {
  EffectiveNdpExchangeRate,
  NdpExchangeRateListInput,
  NdpExchangeRateOverview,
  NdpExchangeRatePublishResult,
  NdpExchangeRateRecord,
  NdpExchangeRateRepositoryPort
} from "../repositories/ndp-exchange-rate.repository";
import { AppError } from "../utils/app-error";
import type { AuditLogRecordInput, AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

export interface NdpExchangeRatePublishRequest {
  ndpUnits: number;
  jpyUnits: number;
  expectedVersion: number;
  effectiveFrom: Date;
  reason: string;
  idempotencyKey: string;
}

type AuditInputFactory = Pick<AuditLogService, "createInput">;

export class NdpExchangeRateService {
  public constructor(
    private readonly repository: NdpExchangeRateRepositoryPort,
    private readonly auditInputFactory: AuditInputFactory
  ) {}

  public async resolveEffectiveRate(at: Date): Promise<EffectiveNdpExchangeRate> {
    const rate = await this.repository.resolveEffectiveRate(at);
    if (rate) return rate;
    throw new AppError({
      code: ERROR_CODES.NDP_EXCHANGE_RATE_NOT_FOUND,
      message: "error.ndp_exchange_rate.not_found",
      statusCode: 404
    });
  }

  public async list(
    actor: AuthenticatedAccessContext,
    input: NdpExchangeRateListInput
  ): Promise<NdpExchangeRateOverview> {
    this.assertPlatformIdentity(actor);
    return this.repository.getOverview(input);
  }

  public async publish(
    actor: AuthenticatedAccessContext,
    input: NdpExchangeRatePublishRequest,
    context: AuthRequestContext
  ): Promise<NdpExchangeRateRecord> {
    this.assertPlatformIdentity(actor);
    const result = await this.repository.publish({
      ...input,
      actorUserId: actor.userId,
      audit: this.auditInputFactory.createInput(
        this.auditRecord(actor, context, {
          action: "backoffice.ndp_exchange_rate.version_published",
          targetType: "NdpExchangeRateRule",
          metadata: {
            expectedVersion: input.expectedVersion,
            ndpUnits: input.ndpUnits,
            jpyUnits: input.jpyUnits,
            effectiveFrom: input.effectiveFrom.toISOString(),
            reason: input.reason
          }
        })
      )
    });
    return this.unwrapPublish(result);
  }

  private unwrapPublish(result: NdpExchangeRatePublishResult): NdpExchangeRateRecord {
    if (result.outcome === "published" || result.outcome === "replayed") return result.rate;
    if (result.outcome === "idempotency_conflict") {
      throw new AppError({
        code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
        message: "error.idempotency.key_reused",
        statusCode: 409
      });
    }
    throw new AppError({
      code: ERROR_CODES.NDP_EXCHANGE_RATE_CONFLICT,
      message: "error.ndp_exchange_rate.conflict",
      statusCode: 409
    });
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

  private auditRecord(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: Omit<AuditLogRecordInput, "actor" | "context">
  ): AuditLogRecordInput {
    return { ...input, actor, context };
  }
}
