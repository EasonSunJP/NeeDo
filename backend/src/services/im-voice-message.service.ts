import { basename, extname } from "node:path";
import { ERROR_CODES } from "../constants/error-codes";
import type { CreateMessageInput, MessagePayload } from "../repositories/realtime.repository";
import type { AuthenticatedAccessContext } from "./auth.service";
import type { ImVoiceMimeType, ImVoiceStoragePort, StoredImVoice } from "./im-voice.storage";
import type { RealtimeService } from "./realtime.service";
import { AppError } from "../utils/app-error";

export interface SendImVoiceMessageInput {
  bytes: Buffer;
  conversationId: number;
  durationSeconds: number;
  fileName: string;
  mimeType: ImVoiceMimeType;
}

type VoiceMessageInput = Omit<CreateMessageInput, "senderUserId">;
type VoiceMessageRealtimePort = Pick<RealtimeService, "assertMessageSendAllowed" | "createMessage">;

export class ImVoiceMessageService {
  public constructor(
    private readonly realtime: VoiceMessageRealtimePort,
    private readonly storage: ImVoiceStoragePort,
    private readonly publicBaseUrl: string
  ) {}

  public async send(
    auth: AuthenticatedAccessContext,
    input: SendImVoiceMessageInput
  ): Promise<MessagePayload> {
    if (
      !Number.isInteger(input.durationSeconds) ||
      input.durationSeconds < 1 ||
      input.durationSeconds > 59
    ) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.im.voice_duration_invalid",
        statusCode: 400
      });
    }

    await this.realtime.assertMessageSendAllowed(auth, input.conversationId);
    const stored = await this.storage.save(input.bytes, input.mimeType);
    const messageInput = this.buildMessageInput(input, stored);

    try {
      return await this.realtime.createMessage(auth, messageInput);
    } catch (error) {
      await this.cleanupStoredFile(stored.fileKey, error);
      throw error;
    }
  }

  private async cleanupStoredFile(fileKey: string, originalError: unknown): Promise<void> {
    let lastCleanupError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.storage.remove(fileKey);
        return;
      } catch (cleanupError) {
        lastCleanupError = cleanupError;
      }
    }

    if (
      lastCleanupError !== undefined &&
      originalError !== null &&
      (typeof originalError === "object" || typeof originalError === "function")
    ) {
      try {
        Object.defineProperty(originalError, "cleanupError", {
          configurable: true,
          enumerable: false,
          value: lastCleanupError,
          writable: true
        });
      } catch {
        return;
      }
    }
  }

  private buildMessageInput(
    input: SendImVoiceMessageInput,
    stored: StoredImVoice
  ): VoiceMessageInput {
    const extension = stored.fileKey.split(".").at(-1)!;
    const originalBase =
      basename(input.fileName, extname(input.fileName)).trim().slice(0, 240) || "voice";
    const fileName = `${originalBase}.${extension}`;
    const url = `${this.publicBaseUrl.replace(/\/$/u, "")}/${stored.fileKey}`;

    return {
      conversationId: input.conversationId,
      type: "text",
      content: "语音",
      metadata: {
        needoMessageType: "voice",
        needoMessageExt: {
          duration: input.durationSeconds,
          fileName,
          fileSize: stored.size,
          mimeType: stored.mimeType,
          url
        }
      }
    };
  }
}
