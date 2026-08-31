import { createHash, randomUUID } from "node:crypto";
import { logger } from "../config/logger";
import { ERROR_CODES } from "../constants/error-codes";
import { PRISMA_INT_MAX } from "../constants/database";
import type {
  AuthorizedChatRecordMedia,
  ChatRecordCommand,
  ChatRecordPersistenceItem,
  ChatRecordSourceMessage,
  ChatRecordTitleKind,
  CreateChatRecordDeliveryPersistenceInput,
  CreateChatRecordFavoritePersistenceInput,
  ImChatRecordRepositoryPort
} from "../repositories/im-chat-record.repository";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type {
  ChatRecordMediaClone,
  ImChatRecordMediaStoragePort
} from "./im-chat-record-media.storage";
import { parseChatRecordSourcePolicy } from "./im-chat-record-source.policy";
import type { RealtimeEventGatewayPort } from "./realtime-event.gateway";
import type { PersonalIdentityScopeService } from "./personal-identity-scope.service";
import { AppError } from "../utils/app-error";

const MAX_ITEMS = 100;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export type CreateChatRecordDeliveryCommand = ChatRecordCommand & {
  targetConversationId: number;
};

interface ImChatRecordServiceOptions {
  now?: () => Date;
  createPublicId?: () => string;
  warn?: (details: Record<string, unknown>, message: string) => void;
}

type PersonalIdentityResolver = Pick<PersonalIdentityScopeService, "resolve">;

export class ImChatRecordService {
  private readonly now: () => Date;
  private readonly createPublicId: () => string;
  private readonly warn: (details: Record<string, unknown>, message: string) => void;

  public constructor(
    private readonly repository: ImChatRecordRepositoryPort,
    private readonly personalIdentityScope: PersonalIdentityResolver,
    private readonly mediaStorage: ImChatRecordMediaStoragePort,
    private readonly eventGateway: RealtimeEventGatewayPort,
    options: ImChatRecordServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.createPublicId = options.createPublicId ?? randomUUID;
    this.warn = options.warn ?? ((details, message) => logger.warn(details, message));
  }

  public async createFavorite(
    auth: AuthenticatedAccessContext,
    context: AuthRequestContext,
    command: ChatRecordCommand
  ) {
    const scope = await this.personalIdentityScope.resolve(auth);
    const normalizedIds = this.normalizeCommand(command);
    const requestFingerprint = this.fingerprint({
      commandType: "favorite",
      createdByIdentityId: scope.identityId,
      createdByUserId: auth.userId,
      messageIds: normalizedIds,
      sourceConversationId: command.sourceConversationId
    });
    const preflight = await this.repository.preflightCommand({
      commandType: "favorite",
      createdByIdentityId: scope.identityId,
      idempotencyKey: command.idempotencyKey,
      requestFingerprint
    });
    if (preflight?.commandType === "favorite") return preflight.result;
    const currentTime = this.now();
    const prepared = await this.prepareItems(
      command.sourceConversationId,
      scope.identityId,
      normalizedIds,
      currentTime
    );
    const input: CreateChatRecordFavoritePersistenceInput = {
      commandType: "favorite",
      idempotencyKey: command.idempotencyKey,
      requestFingerprint,
      publicId: this.createPublicId(),
      createdByUserId: auth.userId,
      createdByIdentityId: scope.identityId,
      sourceConversationId: command.sourceConversationId,
      senderNamesSnapshot: prepared.senderNames,
      titleKind: prepared.titleKind,
      titleSnapshot: prepared.title,
      previewSnapshot: prepared.preview,
      items: prepared.items,
      context
    };

    try {
      const result = await this.repository.createFavorite(input);
      if (result.replayed) await this.compensate(prepared.clones);
      return result;
    } catch (error) {
      await this.compensate(prepared.clones);
      throw error;
    }
  }

  public async createDelivery(
    auth: AuthenticatedAccessContext,
    context: AuthRequestContext,
    command: CreateChatRecordDeliveryCommand
  ) {
    const scope = await this.personalIdentityScope.resolve(auth);
    const normalizedIds = this.normalizeCommand(command);
    if (!this.isSafePositiveInteger(command.targetConversationId)) {
      throw this.validation("error.im.chat_record_target_invalid");
    }
    const requestFingerprint = this.fingerprint({
      commandType: "delivery",
      createdByIdentityId: scope.identityId,
      createdByUserId: auth.userId,
      messageIds: normalizedIds,
      sourceConversationId: command.sourceConversationId,
      targetConversationId: command.targetConversationId
    });
    const preflight = await this.repository.preflightCommand({
      commandType: "delivery",
      createdByIdentityId: scope.identityId,
      idempotencyKey: command.idempotencyKey,
      requestFingerprint
    });
    if (preflight?.commandType === "delivery") return preflight.result;
    const currentTime = this.now();
    const prepared = await this.prepareItems(
      command.sourceConversationId,
      scope.identityId,
      normalizedIds,
      currentTime
    );
    const input: CreateChatRecordDeliveryPersistenceInput = {
      commandType: "delivery",
      idempotencyKey: command.idempotencyKey,
      requestFingerprint,
      publicId: this.createPublicId(),
      createdByUserId: auth.userId,
      createdByIdentityId: scope.identityId,
      sourceConversationId: command.sourceConversationId,
      targetConversationId: command.targetConversationId,
      senderNamesSnapshot: prepared.senderNames,
      titleKind: prepared.titleKind,
      titleSnapshot: prepared.title,
      previewSnapshot: prepared.preview,
      items: prepared.items,
      context
    };

    let result;
    try {
      result = await this.repository.createDelivery(input);
      if (result.replayed) await this.compensate(prepared.clones);
    } catch (error) {
      await this.compensate(prepared.clones);
      throw error;
    }

    if (!result.replayed) {
      for (const recipient of result.recipients) {
        try {
          this.eventGateway.publish({
            id: randomUUID(),
            type: "message.created",
            recipientUserId: recipient.userId,
            recipientIdentityId: recipient.identityId,
            payload: result.message,
            createdAt: this.now().toISOString()
          });
        } catch (error) {
          this.warn(
            {
              conversationId: command.targetConversationId,
              error,
              eventType: "message.created",
              messageId: result.message.id,
              operation: "im_chat_record_realtime_publish",
              recipientIdentityId: recipient.identityId
            },
            "Chat record realtime publication failed"
          );
        }
      }
    }
    return result;
  }

  public async getBundle(auth: AuthenticatedAccessContext, publicId: string) {
    const scope = await this.personalIdentityScope.resolve(auth);
    const bundle = await this.repository.getBundle({
      publicId,
      userId: auth.userId,
      identityId: scope.identityId
    });
    if (!bundle) throw this.notFound();
    return bundle;
  }

  public async listItems(
    auth: AuthenticatedAccessContext,
    publicId: string,
    input: { beforePosition?: number; pageSize?: number }
  ) {
    if (input.beforePosition !== undefined && !this.isSafePositiveInteger(input.beforePosition)) {
      throw this.validation("error.validation_failed");
    }
    const pageSize = this.pageSize(input.pageSize);
    const bundle = await this.getBundle(auth, publicId);
    return this.repository.listItems({
      bundleId: bundle.id,
      beforePosition: input.beforePosition,
      pageSize
    });
  }

  public async listFavorites(
    auth: AuthenticatedAccessContext,
    input: { page?: number; pageSize?: number }
  ) {
    const scope = await this.personalIdentityScope.resolve(auth);
    const page = input.page ?? 1;
    if (!this.isSafePositiveInteger(page)) throw this.validation("error.validation_failed");
    return this.repository.listFavorites({
      identityId: scope.identityId,
      page,
      pageSize: this.pageSize(input.pageSize)
    });
  }

  public async removeFavorite(
    auth: AuthenticatedAccessContext,
    context: AuthRequestContext,
    favoriteId: number
  ) {
    if (!this.isSafePositiveInteger(favoriteId)) {
      throw this.validation("error.validation_failed");
    }
    const scope = await this.personalIdentityScope.resolve(auth);
    const removed = await this.repository.removeFavorite({
      favoriteId,
      userId: auth.userId,
      identityId: scope.identityId,
      context
    });
    if (!removed) throw this.notFound();
    return { deleted: true };
  }

  public async resolveAuthorizedMedia(
    auth: AuthenticatedAccessContext,
    publicId: string,
    checksumSha256: string
  ): Promise<AuthorizedChatRecordMedia & { bytes: Buffer }> {
    if (!/^[a-f0-9]{64}$/u.test(checksumSha256)) {
      throw this.notFound("error.im.chat_record_media_unavailable");
    }
    const scope = await this.personalIdentityScope.resolve(auth);
    const media = await this.repository.resolveAuthorizedMedia({
      publicId,
      checksumSha256,
      userId: auth.userId,
      identityId: scope.identityId
    });
    if (!media) throw this.notFound("error.im.chat_record_media_unavailable");
    const stored = await this.mediaStorage.read(media.checksumSha256, media.mimeType);
    if (stored.size !== media.size) {
      throw this.notFound("error.im.chat_record_media_unavailable");
    }
    return { ...media, bytes: stored.bytes };
  }

  private normalizeCommand(command: ChatRecordCommand): number[] {
    if (
      !this.isSafePositiveInteger(command.sourceConversationId) ||
      typeof command.idempotencyKey !== "string" ||
      command.idempotencyKey.trim().length === 0
    ) {
      throw this.validation("error.validation_failed");
    }
    const ids = Array.from(new Set(command.messageIds));
    if (
      ids.length < 1 ||
      ids.length > MAX_ITEMS ||
      ids.some((id) => !this.isSafePositiveInteger(id))
    ) {
      throw this.validation("error.im.chat_record_item_count_invalid");
    }
    return ids.sort((left, right) => left - right);
  }

  private async prepareItems(
    sourceConversationId: number,
    identityId: number,
    messageIds: number[],
    now: Date
  ): Promise<{
    clones: ChatRecordMediaClone[];
    items: ChatRecordPersistenceItem[];
    preview: string;
    senderNames: string[];
    title: string;
    titleKind: ChatRecordTitleKind;
  }> {
    const source = await this.repository.readSourceMessages({
      conversationId: sourceConversationId,
      identityId,
      messageIds,
      now
    });
    if (source.length !== messageIds.length) throw this.sourceUnavailable();
    const uniqueMessages = new Map(source.map((message) => [message.id, message]));
    if (
      uniqueMessages.size !== messageIds.length ||
      messageIds.some((id) => !uniqueMessages.has(id))
    ) {
      throw this.sourceUnavailable();
    }
    const ordered = [...uniqueMessages.values()].sort(
      (left, right) => left.sentAt.getTime() - right.sentAt.getTime() || left.id - right.id
    );
    if (ordered.some((message) => this.isUnavailable(message, now))) {
      throw this.sourceUnavailable();
    }

    const clones: ChatRecordMediaClone[] = [];
    const items: ChatRecordPersistenceItem[] = [];
    try {
      for (const [index, message] of ordered.entries()) {
        const sourcePolicy = parseChatRecordSourcePolicy(message.messageType, message.metadata);
        if (!sourcePolicy) throw this.sourceUnavailable();
        const mediaSource = sourcePolicy.kind === "media" ? sourcePolicy.media : null;
        const clone = mediaSource
          ? await this.mediaStorage.clone(mediaSource.url, mediaSource.mimeType)
          : null;
        if (clone) clones.push(clone);
        if (
          clone &&
          (clone.mimeType !== mediaSource?.mimeType || clone.size !== mediaSource.fileSize)
        ) {
          throw this.sourceUnavailable();
        }
        const media = clone
          ? {
              checksumSha256: clone.checksumSha256,
              mimeType: clone.mimeType,
              size: clone.size
            }
          : null;
        items.push({
          position: index + 1,
          sourceMessageId: message.id,
          senderUserId: message.senderUserId,
          senderIdentityId: message.senderIdentityId,
          senderDisplayNameSnapshot: message.senderDisplayName,
          senderAvatarSnapshot: message.senderAvatarUrl,
          messageType: message.messageType,
          contentSnapshot: mediaSource ? null : message.content,
          metadataSnapshot: media ? { media } : null,
          sentAtSnapshot: message.sentAt,
          media
        });
      }
    } catch (error) {
      await this.compensate(clones);
      throw error;
    }

    const senderNamesByIdentity = new Map<string, string>();
    for (const message of ordered) {
      const key =
        message.senderIdentityId !== null
          ? `identity:${message.senderIdentityId}`
          : message.senderUserId !== null
            ? `user:${message.senderUserId}`
            : `message:${message.id}`;
      if (!senderNamesByIdentity.has(key)) {
        senderNamesByIdentity.set(key, message.senderDisplayName.trim() || "NeeDo");
      }
    }
    const senderNames = [...senderNamesByIdentity.values()];
    if (senderNames.length === 0) senderNames.push("NeeDo");
    const titleKind: ChatRecordTitleKind =
      senderNames.length === 1 ? "single" : senderNames.length === 2 ? "pair" : "group";
    return {
      clones,
      items,
      preview: ordered
        .slice(0, 2)
        .map((message) => this.previewLine(message))
        .join("\n")
        .slice(0, 500),
      senderNames,
      title: this.title(senderNames, titleKind),
      titleKind
    };
  }

  private isUnavailable(message: ChatRecordSourceMessage, now: Date): boolean {
    return Boolean(
      message.recalledAt ||
      message.expiredAt ||
      message.contentPurgedAt ||
      message.deletedAt ||
      message.hiddenForViewer ||
      message.disappearing ||
      (message.expiresAt && message.expiresAt <= now) ||
      parseChatRecordSourcePolicy(message.messageType, message.metadata) === null
    );
  }

  private previewLine(message: ChatRecordSourceMessage): string {
    const sourcePolicy = parseChatRecordSourcePolicy(message.messageType, message.metadata);
    if (!sourcePolicy) throw this.sourceUnavailable();
    const content =
      sourcePolicy.kind === "media"
        ? sourcePolicy.media.mimeType.startsWith("image/")
          ? "[图片]"
          : "[语音]"
        : this.safeTextPreview(message.content);
    return `${message.senderDisplayName}: ${content}`.slice(0, 245);
  }

  private safeTextPreview(content: string | null): string {
    const compact = content?.replace(/\s+/gu, " ").trim();
    if (!compact) return "[文本]";
    return compact;
  }

  private title(senderNames: string[], kind: ChatRecordTitleKind): string {
    if (kind === "single") return senderNames[0]!.slice(0, 255);
    if (kind === "pair") return `${senderNames[0]}、${senderNames[1]}`.slice(0, 255);
    return `${senderNames[0]}、${senderNames[1]} 等 ${senderNames.length} 人`.slice(0, 255);
  }

  private fingerprint(value: Record<string, unknown>): string {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }

  private async compensate(clones: ChatRecordMediaClone[]): Promise<void> {
    for (const clone of clones.filter((candidate) => candidate.created)) {
      try {
        await this.mediaStorage.delete(clone.fileKey);
      } catch (error) {
        this.warn(
          {
            checksumSha256: clone.checksumSha256,
            error,
            operation: "im_chat_record_media_compensation"
          },
          "Chat record media compensation failed"
        );
      }
    }
  }

  private pageSize(value?: number): number {
    const pageSize = value ?? DEFAULT_PAGE_SIZE;
    if (!this.isSafePositiveInteger(pageSize) || pageSize > MAX_PAGE_SIZE) {
      throw this.validation("error.validation_failed");
    }
    return pageSize;
  }

  private isSafePositiveInteger(value: number): boolean {
    return Number.isSafeInteger(value) && value > 0 && value <= PRISMA_INT_MAX;
  }

  private sourceUnavailable(): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.im.chat_record_source_unavailable",
      statusCode: 409
    });
  }

  private validation(message: string): AppError {
    return new AppError({ code: ERROR_CODES.VALIDATION, message, statusCode: 400 });
  }

  private notFound(message = "error.im.chat_record_not_found"): AppError {
    return new AppError({ code: ERROR_CODES.NOT_FOUND, message, statusCode: 404 });
  }
}
