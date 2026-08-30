import { basename, extname } from "node:path";
import { ERROR_CODES } from "../constants/error-codes";
import type { CreateMessageInput, MessagePayload } from "../repositories/realtime.repository";
import type { AuthenticatedAccessContext } from "./auth.service";
import type { ImVoiceDurationMetadata, ImVoiceDurationProbePort } from "./im-voice-duration-probe";
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
    private readonly durationProbe: ImVoiceDurationProbePort,
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
    const authoritativeDurationSeconds = await this.getAuthoritativeDuration(input);
    const stored = await this.storage.save(input.bytes, input.mimeType);
    const messageInput = this.buildMessageInput(input, stored, authoritativeDurationSeconds);

    try {
      return await this.realtime.createMessage(auth, messageInput);
    } catch (error) {
      await this.cleanupStoredFile(stored.fileKey, error);
      throw error;
    }
  }

  private async getAuthoritativeDuration(input: SendImVoiceMessageInput): Promise<number> {
    let metadata: ImVoiceDurationMetadata;
    try {
      metadata = await this.durationProbe.probe(input.bytes, input.mimeType);
    } catch (error) {
      throw this.invalidDuration(error);
    }

    const candidate = metadata as unknown;
    if (typeof candidate !== "object" || candidate === null) {
      throw this.invalidDuration();
    }
    const { durationSeconds, hasAudio, hasVideo } = candidate as Record<string, unknown>;
    if (
      typeof durationSeconds !== "number" ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0 ||
      durationSeconds > 59.5 ||
      hasAudio !== true ||
      hasVideo !== false
    ) {
      throw this.invalidDuration();
    }

    const authoritativeDurationSeconds = Math.min(59, Math.max(1, Math.ceil(durationSeconds)));
    if (Math.abs(input.durationSeconds - authoritativeDurationSeconds) > 1) {
      throw this.invalidDuration();
    }
    return authoritativeDurationSeconds;
  }

  private invalidDuration(cause?: unknown): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.im.voice_duration_invalid",
      statusCode: 400,
      cause
    });
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
    stored: StoredImVoice,
    authoritativeDurationSeconds: number
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
          duration: authoritativeDurationSeconds,
          fileName,
          fileSize: stored.size,
          mimeType: stored.mimeType,
          url
        }
      }
    };
  }
}
