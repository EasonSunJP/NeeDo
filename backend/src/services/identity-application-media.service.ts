import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { AuthenticatedAccessContext } from "./auth.service";
import type {
  IdentityApplicationMediaMimeType,
  IdentityApplicationMediaStoragePort
} from "./identity-application-media.storage";

export type IdentityApplicationMediaPurpose =
  | "portrait"
  | "identity_document"
  | "corporate_registration"
  | "representative_identity"
  | "showcase";

export interface IdentityApplicationMediaEditableContext {
  applicationId: number;
  userId: number;
  type: "technician" | "merchant";
  status: string;
  version: number;
  activeMediaCount: number;
}

export interface AttachIdentityApplicationMediaRepositoryInput {
  applicationId: number;
  userId: number;
  expectedVersion: number;
  purpose: IdentityApplicationMediaPurpose;
  fileKey: string;
  mimeType: IdentityApplicationMediaMimeType;
  checksumSha256: string;
  createdAt: Date;
}

export interface IdentityApplicationMediaProjection {
  id: number;
  applicationId: number;
  purpose: string;
  mimeType: string;
  applicationVersion: number;
  createdAt: Date;
}

export interface IdentityApplicationMediaAccessRecord {
  mediaAssetId: number;
  applicationId: number;
  applicantUserId: number;
  targetShopId: number | null;
  fileKey: string;
  mimeType: string;
}

export interface IdentityApplicationMediaRepositoryPort {
  findEditableContext: (
    applicationId: number
  ) => Promise<IdentityApplicationMediaEditableContext | null>;
  attachInTransaction: (
    input: AttachIdentityApplicationMediaRepositoryInput
  ) => Promise<IdentityApplicationMediaProjection>;
  findMediaAccess: (
    applicationId: number,
    mediaAssetId: number
  ) => Promise<IdentityApplicationMediaAccessRecord | null>;
}

export interface UploadIdentityApplicationMediaInput {
  userId: number;
  applicationId: number;
  expectedVersion: number;
  purpose: IdentityApplicationMediaPurpose;
  bytes: Buffer;
  mimeType: IdentityApplicationMediaMimeType;
  now: Date;
}

const allowedPurposes: Readonly<
  Record<"technician" | "merchant", ReadonlySet<IdentityApplicationMediaPurpose>>
> = {
  technician: new Set(["portrait", "identity_document"]),
  merchant: new Set(["corporate_registration", "representative_identity", "showcase"])
};

export class IdentityApplicationMediaService {
  public constructor(
    private readonly repository: IdentityApplicationMediaRepositoryPort,
    private readonly storage: IdentityApplicationMediaStoragePort
  ) {}

  public async upload(
    input: UploadIdentityApplicationMediaInput
  ): Promise<IdentityApplicationMediaProjection> {
    const context = await this.repository.findEditableContext(input.applicationId);
    if (!context || context.userId !== input.userId) {
      throw this.notFound();
    }
    if (!allowedPurposes[context.type].has(input.purpose)) {
      throw this.validation("error.identity_application.media_purpose_invalid");
    }
    if (context.status !== "draft" && context.status !== "rejected") {
      throw this.conflict("error.identity_application.submitted_snapshot_locked");
    }
    if (context.version !== input.expectedVersion) {
      throw this.conflict("error.identity_application.version_conflict");
    }
    if (context.activeMediaCount >= 10) {
      throw this.validation("error.identity_application.media_limit");
    }

    const stored = await this.storage.save({
      applicationId: input.applicationId,
      bytes: input.bytes,
      mimeType: input.mimeType
    });
    try {
      return await this.repository.attachInTransaction({
        applicationId: input.applicationId,
        userId: input.userId,
        expectedVersion: input.expectedVersion,
        purpose: input.purpose,
        fileKey: stored.fileKey,
        mimeType: stored.mimeType,
        checksumSha256: stored.checksumSha256,
        createdAt: input.now
      });
    } catch (error) {
      await this.storage.delete(stored.fileKey);
      throw error;
    }
  }

  public async read(
    actor: AuthenticatedAccessContext,
    applicationId: number,
    mediaAssetId: number
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const media = await this.repository.findMediaAccess(applicationId, mediaAssetId);
    if (!media || !this.canRead(actor, media)) {
      throw this.notFound();
    }
    return { buffer: await this.storage.read(media.fileKey), mimeType: media.mimeType };
  }

  private canRead(
    actor: AuthenticatedAccessContext,
    media: IdentityApplicationMediaAccessRecord
  ): boolean {
    if (actor.userId === media.applicantUserId) {
      return true;
    }
    if (!actor.permissions.includes("identity-application-media:sensitive-read")) {
      return false;
    }
    if (actor.currentIdentityScopeType === "shop") {
      return media.targetShopId !== null && actor.currentIdentityScopeId === media.targetShopId;
    }
    return actor.currentIdentityType === "admin" || actor.roles.includes("operator");
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.identity_application.media_not_found",
      statusCode: 404
    });
  }

  private validation(message: string): AppError {
    return new AppError({ code: ERROR_CODES.VALIDATION, message, statusCode: 400 });
  }

  private conflict(message: string): AppError {
    return new AppError({
      code: ERROR_CODES.SAAS_BILLING_CONFLICT,
      message,
      statusCode: 409
    });
  }
}
