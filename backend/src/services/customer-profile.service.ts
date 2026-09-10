import { ERROR_CODES } from "../constants/error-codes";
import type {
  CustomerProfileMutation,
  CustomerProfilePayload,
  CustomerProfileRepositoryPort
} from "../repositories/customer-profile.repository";
import { AppError } from "../utils/app-error";
import type { CustomerProfileUpdateBody } from "../validators/customer-profile.validator";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { CustomerAvatarStoragePort } from "./customer-avatar.storage";
import type { PersonalIdentityScopeService } from "./personal-identity-scope.service";

type AuditRecorder = Pick<AuditLogService, "createInput">;

export { type CustomerProfilePayload } from "../repositories/customer-profile.repository";

export class CustomerProfileService {
  public constructor(
    private readonly repository: CustomerProfileRepositoryPort,
    private readonly auditLogService: AuditRecorder,
    private readonly avatarStorage: CustomerAvatarStoragePort,
    private readonly personalIdentityScope?: Pick<PersonalIdentityScopeService, "resolve">
  ) {}

  public async getMine(actor: AuthenticatedAccessContext): Promise<CustomerProfilePayload> {
    const { profileId, userId } = await this.getCustomerScope(actor);
    const profile = await this.repository.findMine(userId, profileId);

    if (!profile) {
      throw this.notFound();
    }

    return profile;
  }

  public async updateMine(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: CustomerProfileUpdateBody
  ): Promise<CustomerProfilePayload> {
    const { identityId, profileId, userId } = await this.getCustomerScope(actor);
    const mutation = this.toMutation(input);

    if (input.avatarDataUrl) {
      const avatar = await this.avatarStorage.save(input.avatarDataUrl);
      mutation.avatar = { url: avatar.url, mimeType: avatar.mimeType };
    }

    const auditLog = this.auditLogService.createInput({
      actor,
      context,
      action: "customer_profile.self_update",
      targetType: "CustomerProfile",
      targetId: profileId,
      metadata: { changedFields: this.changedFields(input) }
    });
    const profile = await this.repository.updateMine(
      userId,
      profileId,
      identityId,
      mutation,
      auditLog
    );

    return profile;
  }

  private async getCustomerScope(actor: AuthenticatedAccessContext): Promise<{
    identityId: number;
    userId: number;
    profileId: number;
  }> {
    const scope = this.personalIdentityScope
      ? await this.personalIdentityScope.resolve(actor)
      : {
          identityId: actor.currentIdentityId,
          userId: actor.userId,
          identityType: actor.currentIdentityType,
          scopeType: actor.currentIdentityScopeType,
          scopeId: actor.currentIdentityScopeId
        };
    if (
      scope.identityType !== "customer" ||
      scope.scopeType !== "customer_profile" ||
      !scope.scopeId
    ) {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        message: "error.forbidden",
        statusCode: 403
      });
    }

    if (!scope.identityId) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.forbidden",
        statusCode: 403
      });
    }

    return { identityId: scope.identityId, userId: scope.userId, profileId: scope.scopeId };
  }

  private toMutation(input: CustomerProfileUpdateBody): CustomerProfileMutation {
    return {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
      ...(input.age !== undefined ? { age: input.age } : {}),
      ...(input.heightCm !== undefined ? { heightCm: input.heightCm } : {}),
      ...(input.languages !== undefined ? { languages: input.languages } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(input.visibility !== undefined
        ? {
            visibility: input.visibility,
            isPublic: input.visibility === "public"
          }
        : {})
    };
  }

  private changedFields(input: CustomerProfileUpdateBody): string[] {
    return Object.keys(input)
      .map((field) => (field === "avatarDataUrl" ? "avatar" : field))
      .sort();
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.customer_profile.not_found",
      statusCode: 404
    });
  }
}
