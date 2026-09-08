import { ERROR_CODES } from "../constants/error-codes";
import type { ExchangeIntelligenceServiceOptionListInput } from "../repositories/exchange-intelligence-service.repository";
import type {
  ExchangeIntelligencePublisherScope,
  ExchangeIntelligenceServiceOptionPage
} from "../types/exchange-intelligence-booking.types";
import { AppError } from "../utils/app-error";
import type { ExchangeIntelligenceServiceOptionListQuery } from "../validators/exchange-intelligence-service.validators";
import type { AuthenticatedAccessContext } from "./auth.service";
import type { ExchangeActorLookup, ExchangeActorRecord } from "./exchange.service";

export interface ExchangeIntelligenceServiceRepositoryPort {
  listOptions(
    input: ExchangeIntelligenceServiceOptionListInput
  ): Promise<ExchangeIntelligenceServiceOptionPage>;
}

export interface ExchangeIntelligenceActorResolverPort {
  resolveActor(input: ExchangeActorLookup): Promise<ExchangeActorRecord | null>;
}

const MERCHANT_IDENTITIES = new Set(["merchant", "merchant_owner", "merchant_staff"]);

export class ExchangeIntelligenceServiceService {
  public constructor(
    private readonly repository: ExchangeIntelligenceServiceRepositoryPort,
    private readonly actorResolver: ExchangeIntelligenceActorResolverPort,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async listOptions(
    access: AuthenticatedAccessContext,
    input: ExchangeIntelligenceServiceOptionListQuery
  ): Promise<ExchangeIntelligenceServiceOptionPage> {
    const actor = await this.resolveActor(access);
    return this.repository.listOptions({
      scope: this.publisherScope(actor),
      page: input.page,
      pageSize: input.page_size,
      now: this.now()
    });
  }

  private async resolveActor(access: AuthenticatedAccessContext): Promise<ExchangeActorRecord> {
    if (!access.currentIdentityId || !access.currentIdentityType || !access.currentPublicId) {
      throw this.identityForbidden();
    }
    const lookup: ExchangeActorLookup = {
      userId: access.userId,
      identityId: access.currentIdentityId,
      identityType: access.currentIdentityType,
      scopeType: access.currentIdentityScopeType ?? null,
      scopeId: access.currentIdentityScopeId ?? null,
      publicId: access.currentPublicId
    };
    const actor = await this.actorResolver.resolveActor(lookup);
    if (
      !actor ||
      actor.userId !== lookup.userId ||
      actor.identityId !== lookup.identityId ||
      actor.identityType !== lookup.identityType ||
      actor.scopeType !== lookup.scopeType ||
      actor.scopeId !== lookup.scopeId ||
      actor.publicId !== lookup.publicId
    ) {
      throw this.identityForbidden();
    }
    return actor;
  }

  private publisherScope(actor: ExchangeActorRecord): ExchangeIntelligencePublisherScope {
    if (MERCHANT_IDENTITIES.has(actor.identityType)) {
      if (
        actor.scopeType !== "shop" ||
        !actor.scopeId ||
        !actor.shopScope ||
        actor.shopScope.shopId !== actor.scopeId ||
        actor.shopScope.status !== "published"
      ) {
        throw this.identityForbidden();
      }
      return { kind: "merchant", shopId: actor.scopeId };
    }
    if (
      actor.identityType === "technician" &&
      actor.scopeType === "technician_profile" &&
      actor.scopeId
    ) {
      return { kind: "technician", technicianProfileId: actor.scopeId };
    }
    throw this.identityForbidden();
  }

  private identityForbidden(): AppError {
    return new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }
}
