import { ERROR_CODES } from "../constants/error-codes";
import type {
  TechnicianProfileMutation,
  TechnicianProfilePayload,
  TechnicianProfileRepositoryPort
} from "../repositories/technician-profile.repository";
import { AppError } from "../utils/app-error";
import type { TechnicianProfileUpdateBody } from "../validators/technician-profile.validator";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { CustomerAvatarStoragePort } from "./customer-avatar.storage";
import type { ProfileUpdatedNotificationPort } from "./realtime.service";

type AuditRecorder = Pick<AuditLogService, "createInput">;

export class TechnicianProfileService {
  public constructor(
    private readonly repository: TechnicianProfileRepositoryPort,
    private readonly auditLogService: AuditRecorder,
    private readonly avatarStorage: CustomerAvatarStoragePort,
    private readonly profileUpdateNotifier?: ProfileUpdatedNotificationPort
  ) {}

  public async getMine(actor: AuthenticatedAccessContext): Promise<TechnicianProfilePayload> {
    const { userId, profileId } = this.scope(actor);
    const profile = await this.repository.findMine(userId, profileId);
    if (!profile) throw this.notFound();
    return profile;
  }

  public async updateMine(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: TechnicianProfileUpdateBody
  ): Promise<TechnicianProfilePayload> {
    const { userId, profileId, identityId } = this.scope(actor);
    const mutation = this.mutation(input);
    if (input.avatarDataUrl) {
      const avatar = await this.avatarStorage.save(input.avatarDataUrl);
      mutation.avatar = { url: avatar.url, mimeType: avatar.mimeType };
    }
    const auditLog = this.auditLogService.createInput({
      actor,
      context,
      action: "technician_profile.self_update",
      targetType: "TechnicianProfile",
      targetId: profileId,
      metadata: {
        changedFields: Object.keys(input)
          .map((field) => (field === "avatarDataUrl" ? "avatar" : field))
          .sort()
      }
    });
    const profile = await this.repository.updateMine(
      userId,
      profileId,
      identityId,
      mutation,
      auditLog
    );
    if (
      this.profileUpdateNotifier &&
      (input.displayName !== undefined || input.avatarDataUrl !== undefined)
    ) {
      await this.profileUpdateNotifier.notifyProfileUpdated({
        userId,
        identityId,
        includePersonalIdentities: true
      });
    }
    return profile;
  }

  private scope(actor: AuthenticatedAccessContext): {
    userId: number;
    profileId: number;
    identityId: number;
  } {
    if (
      actor.currentIdentityType !== "technician" ||
      actor.currentIdentityScopeType !== "technician_profile" ||
      !actor.currentIdentityScopeId ||
      !actor.currentIdentityId
    ) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.identity.forbidden",
        statusCode: 403
      });
    }
    return {
      userId: actor.userId,
      profileId: actor.currentIdentityScopeId,
      identityId: actor.currentIdentityId
    };
  }

  private mutation(input: TechnicianProfileUpdateBody): TechnicianProfileMutation {
    return {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
      ...(input.age !== undefined ? { age: input.age } : {}),
      ...(input.heightCm !== undefined ? { heightCm: input.heightCm } : {}),
      ...(input.languages !== undefined ? { languages: input.languages } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(input.localizedBio !== undefined ? { localizedBio: input.localizedBio } : {}),
      ...(input.serviceAreas !== undefined ? { serviceAreas: input.serviceAreas } : {}),
      ...(input.canServeForeigners !== undefined
        ? { canServeForeigners: input.canServeForeigners }
        : {}),
      ...(input.bidBudgetMinJpy !== undefined ? { bidBudgetMinJpy: input.bidBudgetMinJpy } : {}),
      ...(input.bidBudgetMaxJpy !== undefined ? { bidBudgetMaxJpy: input.bidBudgetMaxJpy } : {}),
      ...(input.paymentMethods !== undefined ? { paymentMethods: input.paymentMethods } : {}),
      ...(input.serviceBase !== undefined ? { serviceBase: input.serviceBase } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {})
    };
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.technician_profile.not_found",
      statusCode: 404
    });
  }
}
