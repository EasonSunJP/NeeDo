import { ERROR_CODES } from "../constants/error-codes";
import type {
  MerchantProfileMutation,
  MerchantProfilePayload,
  MerchantProfileRepositoryPort
} from "../repositories/merchant-profile.repository";
import { AppError } from "../utils/app-error";
import type { MerchantProfileUpdateBody } from "../validators/merchant-profile.validator";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { CustomerAvatarStoragePort } from "./customer-avatar.storage";

type AuditRecorder = Pick<AuditLogService, "createInput">;

const merchantIdentityTypes = new Set([
  "merchant",
  "merchant_owner",
  "merchant_staff",
  "merchant_organization"
]);

export class MerchantProfileService {
  public constructor(
    private readonly repository: MerchantProfileRepositoryPort,
    private readonly auditLogService: AuditRecorder,
    private readonly avatarStorage: CustomerAvatarStoragePort
  ) {}

  public async getMine(actor: AuthenticatedAccessContext): Promise<MerchantProfilePayload> {
    const { userId, identityId } = this.scope(actor);
    const profile = await this.repository.findMine(userId, identityId);
    if (!profile) throw this.notFound();
    return profile;
  }

  public async updateMine(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: MerchantProfileUpdateBody
  ): Promise<MerchantProfilePayload> {
    const { userId, identityId } = this.scope(actor);
    const current = await this.repository.findMine(userId, identityId);
    if (!current) throw this.notFound();
    const mutation = await this.mutation(input);
    const auditLog = this.auditLogService.createInput({
      actor,
      context,
      action: "merchant_profile.self_update",
      targetType: "MerchantIdentityProfile",
      targetId: current.id,
      metadata: { changedFields: this.changedFields(input) }
    });
    return this.repository.updateMine(userId, identityId, mutation, auditLog);
  }

  private scope(actor: AuthenticatedAccessContext): { userId: number; identityId: number } {
    if (
      !actor.currentIdentityType ||
      !merchantIdentityTypes.has(actor.currentIdentityType) ||
      !actor.currentIdentityId
    ) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.identity.forbidden",
        statusCode: 403
      });
    }
    return { userId: actor.userId, identityId: actor.currentIdentityId };
  }

  private async mutation(input: MerchantProfileUpdateBody): Promise<MerchantProfileMutation> {
    const mutation: MerchantProfileMutation = {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
      ...(input.age !== undefined ? { age: input.age } : {}),
      ...(input.heightCm !== undefined ? { heightCm: input.heightCm } : {}),
      ...(input.languages !== undefined ? { languages: input.languages } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {})
    };
    if (input.avatarDataUrl) {
      const avatar = await this.avatarStorage.save(input.avatarDataUrl);
      mutation.avatar = { url: avatar.url, mimeType: avatar.mimeType };
    }
    return mutation;
  }

  private changedFields(input: MerchantProfileUpdateBody): string[] {
    return Object.keys(input)
      .map((field) => (field === "avatarDataUrl" ? "avatar" : field))
      .sort();
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.merchant_profile.not_found",
      statusCode: 404
    });
  }
}
