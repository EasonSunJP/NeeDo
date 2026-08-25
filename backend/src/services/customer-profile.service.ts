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

type AuditRecorder = Pick<AuditLogService, "createInput">;

export { type CustomerProfilePayload } from "../repositories/customer-profile.repository";

export class CustomerProfileService {
  public constructor(
    private readonly repository: CustomerProfileRepositoryPort,
    private readonly auditLogService: AuditRecorder,
    private readonly avatarStorage: CustomerAvatarStoragePort
  ) {}

  public async getMine(actor: AuthenticatedAccessContext): Promise<CustomerProfilePayload> {
    const { profileId, userId } = this.getCustomerScope(actor);
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
    const { profileId, userId } = this.getCustomerScope(actor);
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
    const profile = await this.repository.updateMine(userId, profileId, mutation, auditLog);

    return profile;
  }

  private getCustomerScope(actor: AuthenticatedAccessContext): {
    userId: number;
    profileId: number;
  } {
    if (
      actor.currentIdentityType !== "customer" ||
      actor.currentIdentityScopeType !== "customer_profile" ||
      !actor.currentIdentityScopeId
    ) {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        message: "error.forbidden",
        statusCode: 403
      });
    }

    return { userId: actor.userId, profileId: actor.currentIdentityScopeId };
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
