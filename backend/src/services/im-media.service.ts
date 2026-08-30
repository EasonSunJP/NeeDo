import { basename } from "node:path";
import { ERROR_CODES } from "../constants/error-codes";
import type { RealtimeRepositoryPort } from "../repositories/realtime.repository";
import { AppError } from "../utils/app-error";
import type { AuthenticatedAccessContext } from "./auth.service";
import type { ImMediaMimeType, ImMediaStoragePort } from "./im-media.storage";
import type { PersonalIdentityScopeService } from "./personal-identity-scope.service";

export interface UploadImMediaInput {
  bytes: Buffer;
  conversationId: number;
  fileName: string;
  mimeType: ImMediaMimeType;
}

export class ImMediaService {
  public constructor(
    private readonly repository: Pick<RealtimeRepositoryPort, "getConversationForUser">,
    private readonly storage: ImMediaStoragePort,
    private readonly publicBaseUrl: string,
    private readonly personalIdentityScope?: Pick<PersonalIdentityScopeService, "resolve">
  ) {}

  public async upload(auth: AuthenticatedAccessContext, input: UploadImMediaInput) {
    const identityScope = this.personalIdentityScope
      ? await this.personalIdentityScope.resolve(auth)
      : { identityId: auth.currentIdentityId ?? auth.userId };
    const conversation = await this.repository.getConversationForUser(
      input.conversationId,
      identityScope.identityId,
      auth.userId
    );
    if (!conversation) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.realtime.conversation_not_found",
        statusCode: 404
      });
    }

    const stored = await this.storage.save(input.bytes, input.mimeType);
    const safeFileName =
      basename(input.fileName).trim().slice(0, 255) || `image.${stored.fileKey.split(".").at(-1)}`;
    return {
      fileName: safeFileName,
      fileSize: stored.size,
      mimeType: stored.mimeType,
      url: `${this.publicBaseUrl.replace(/\/$/u, "")}/${stored.fileKey}`
    };
  }
}
