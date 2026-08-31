import { MessageRecallMode, MessageType, Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type { AuthRequestContext } from "../services/auth.service";
import type { MessagePayload } from "./realtime.repository";
import { persistImMessageInTransaction } from "./im-message-send.transaction";
import { parseChatRecordSourcePolicy } from "../services/im-chat-record-source.policy";
import { AppError } from "../utils/app-error";

export type ChatRecordTitleKind = "single" | "pair" | "group";
export type ChatRecordCommandType = "delivery" | "favorite";

export type ChatRecordCommand = {
  idempotencyKey: string;
  messageIds: number[];
  sourceConversationId: number;
};

export interface ChatRecordSourceMessage {
  id: number;
  conversationId: number;
  senderUserId: number | null;
  senderIdentityId: number | null;
  senderDisplayName: string;
  senderAvatarUrl: string | null;
  messageType: string;
  content: string | null;
  metadata: unknown;
  sentAt: Date;
  recalledAt: Date | null;
  expiredAt: Date | null;
  expiresAt: Date | null;
  contentPurgedAt: Date | null;
  deletedAt: Date | null;
  hiddenForViewer: boolean;
  disappearing: boolean;
}

export interface ChatRecordMediaDescriptor {
  checksumSha256: string;
  mimeType: string;
  size: number;
}

export interface ChatRecordPersistenceItem {
  position: number;
  sourceMessageId: number;
  senderUserId: number | null;
  senderIdentityId: number | null;
  senderDisplayNameSnapshot: string;
  senderAvatarSnapshot: string | null;
  messageType: string;
  contentSnapshot: string | null;
  metadataSnapshot: unknown;
  sentAtSnapshot: Date;
  media: ChatRecordMediaDescriptor | null;
}

interface CreateChatRecordPersistenceBase {
  commandType: ChatRecordCommandType;
  idempotencyKey: string;
  requestFingerprint: string;
  publicId: string;
  createdByUserId: number;
  createdByIdentityId: number;
  sourceConversationId: number;
  senderNamesSnapshot: string[];
  titleKind: ChatRecordTitleKind;
  titleSnapshot: string;
  previewSnapshot: string;
  items: ChatRecordPersistenceItem[];
  context: AuthRequestContext;
}

export interface CreateChatRecordDeliveryPersistenceInput extends CreateChatRecordPersistenceBase {
  commandType: "delivery";
  targetConversationId: number;
}

export interface CreateChatRecordFavoritePersistenceInput extends CreateChatRecordPersistenceBase {
  commandType: "favorite";
}

export interface ChatRecordBundlePayload {
  id: number;
  publicId: string;
  title: string;
  preview: string;
  senderCount: number;
  itemCount: number;
  createdAt: Date;
}

export interface ChatRecordItemPayload {
  id: number;
  position: number;
  senderDisplayName: string;
  senderAvatarUrl: string | null;
  messageType: string;
  content: string | null;
  metadata: unknown;
  sentAt: Date;
}

export interface ChatRecordItemPage {
  list: ChatRecordItemPayload[];
  total: number;
  page: number;
  pageSize: number;
  nextCursor: number | null;
}

export interface ChatRecordFavoritePayload {
  id: number;
  bundlePublicId: string;
  title: string;
  preview: string;
  senderCount: number;
  itemCount: number;
  createdAt: Date;
}

export interface ChatRecordFavoritePage {
  list: ChatRecordFavoritePayload[];
  total: number;
  page: number;
  page_size: number;
}

export interface ChatRecordDeliveryPayload {
  replayed: boolean;
  bundle: ChatRecordBundlePayload;
  message: MessagePayload;
  recipients: Array<{ userId: number; identityId: number }>;
}

export interface ChatRecordFavoriteCreationPayload {
  replayed: boolean;
  favorite: ChatRecordFavoritePayload;
}

export interface ChatRecordCommandPreflightInput {
  commandType: ChatRecordCommandType;
  createdByIdentityId: number;
  idempotencyKey: string;
  requestFingerprint: string;
}

export type ChatRecordCommandPreflightResult =
  | { commandType: "delivery"; result: ChatRecordDeliveryPayload }
  | { commandType: "favorite"; result: ChatRecordFavoriteCreationPayload };

export interface AuthorizedChatRecordMedia {
  publicId: string;
  checksumSha256: string;
  mimeType: string;
  size: number;
}

export interface ImChatRecordRepositoryPort {
  preflightCommand(
    input: ChatRecordCommandPreflightInput
  ): Promise<ChatRecordCommandPreflightResult | null>;
  readSourceMessages(input: {
    conversationId: number;
    identityId: number;
    messageIds: number[];
    now: Date;
  }): Promise<ChatRecordSourceMessage[]>;
  createDelivery(
    input: CreateChatRecordDeliveryPersistenceInput
  ): Promise<ChatRecordDeliveryPayload>;
  createFavorite(
    input: CreateChatRecordFavoritePersistenceInput
  ): Promise<ChatRecordFavoriteCreationPayload>;
  getBundle(input: {
    publicId: string;
    userId: number;
    identityId: number;
  }): Promise<ChatRecordBundlePayload | null>;
  listItems(input: {
    bundleId: number;
    beforePosition?: number;
    pageSize: number;
  }): Promise<ChatRecordItemPage>;
  listFavorites(input: {
    identityId: number;
    page: number;
    pageSize: number;
  }): Promise<ChatRecordFavoritePage>;
  removeFavorite(input: {
    favoriteId: number;
    userId: number;
    identityId: number;
    context: AuthRequestContext;
  }): Promise<boolean>;
  resolveAuthorizedMedia(input: {
    publicId: string;
    checksumSha256: string;
    userId: number;
    identityId: number;
  }): Promise<AuthorizedChatRecordMedia | null>;
}

type TransactionClient = Prisma.TransactionClient;

const commandReplayInclude = {
  deliveries: {
    where: { deletedAt: null },
    include: {
      message: true,
      conversation: {
        select: {
          participants: {
            where: { deletedAt: null },
            select: { userId: true, identityId: true }
          }
        }
      }
    }
  },
  favorites: { where: { deletedAt: null } }
} satisfies Prisma.ImChatRecordBundleInclude;

const activeBundleAccessWhere = (input: { publicId: string; userId: number; identityId: number }) =>
  ({
    publicId: input.publicId,
    deletedAt: null,
    OR: [
      { createdByIdentityId: input.identityId },
      { favorites: { some: { ownerIdentityId: input.identityId, deletedAt: null } } },
      {
        deliveries: {
          some: {
            deletedAt: null,
            message: {
              deletedAt: null,
              recalledAt: null,
              contentPurgedAt: null,
              expiredAt: null,
              userDeletions: {
                none: { identityId: input.identityId, deletedAt: null }
              }
            },
            conversation: {
              deletedAt: null,
              participants: {
                some: { userId: input.userId, identityId: input.identityId, deletedAt: null }
              }
            }
          }
        }
      }
    ]
  }) satisfies Prisma.ImChatRecordBundleWhereInput;

export class ImChatRecordRepository implements ImChatRecordRepositoryPort {
  private readonly now: () => Date;

  public constructor(
    private readonly client: PrismaClient = prisma,
    options: { now?: () => Date } = {}
  ) {
    this.now = options.now ?? (() => new Date());
  }

  public async readSourceMessages(input: {
    conversationId: number;
    identityId: number;
    messageIds: number[];
    now: Date;
  }): Promise<ChatRecordSourceMessage[]> {
    const participant = await this.client.conversationParticipant.findFirst({
      where: {
        conversationId: input.conversationId,
        identityId: input.identityId,
        deletedAt: null,
        conversation: { deletedAt: null }
      },
      select: { createdAt: true, clearedThroughMessageId: true }
    });
    if (!participant) return [];

    const messages = await this.client.message.findMany({
      where: {
        id: { in: input.messageIds },
        conversationId: input.conversationId,
        createdAt: { gte: participant.createdAt },
        ...(participant.clearedThroughMessageId === null
          ? {}
          : { id: { in: input.messageIds, gt: participant.clearedThroughMessageId } }),
        conversation: { deletedAt: null },
        userDeletions: { none: { identityId: input.identityId, deletedAt: null } }
      },
      select: {
        id: true,
        conversationId: true,
        senderUserId: true,
        senderIdentityId: true,
        type: true,
        content: true,
        metadata: true,
        createdAt: true,
        recalledAt: true,
        expiredAt: true,
        expiresAt: true,
        contentPurgedAt: true,
        privacyPolicyVersionAtSend: true,
        deletedAt: true,
        sender: { select: { username: true, avatarUrl: true } },
        senderIdentity: { select: { displayName: true } }
      }
    });

    return messages.map((message) => ({
      id: message.id,
      conversationId: message.conversationId,
      senderUserId: message.senderUserId,
      senderIdentityId: message.senderIdentityId,
      senderDisplayName:
        message.senderIdentity?.displayName?.trim() || message.sender?.username?.trim() || "NeeDo",
      senderAvatarUrl: message.sender?.avatarUrl ?? null,
      messageType: this.messageTypeFromDb(message.type),
      content: message.content,
      metadata: message.metadata,
      sentAt: message.createdAt,
      recalledAt: message.recalledAt,
      expiredAt: message.expiredAt,
      expiresAt: message.expiresAt,
      contentPurgedAt: message.contentPurgedAt,
      deletedAt: message.deletedAt,
      hiddenForViewer: false,
      disappearing: message.privacyPolicyVersionAtSend !== null
    }));
  }

  public async preflightCommand(
    input: ChatRecordCommandPreflightInput
  ): Promise<ChatRecordCommandPreflightResult | null> {
    const replay = await this.findCommandReplay(this.client, input);
    if (!replay) return null;
    if (input.commandType === "delivery") {
      return {
        commandType: "delivery",
        result: this.toDeliveryReplay(replay, input.requestFingerprint)
      };
    }
    return {
      commandType: "favorite",
      result: this.toFavoriteReplay(replay, input.requestFingerprint)
    };
  }

  public async createDelivery(
    input: CreateChatRecordDeliveryPersistenceInput
  ): Promise<ChatRecordDeliveryPayload> {
    try {
      return await this.createDeliveryTransaction(input);
    } catch (error) {
      const replay = await this.recoverUniqueReplay(error, input);
      if (replay) return this.toDeliveryReplay(replay, input.requestFingerprint);
      throw error;
    }
  }

  private createDeliveryTransaction(
    input: CreateChatRecordDeliveryPersistenceInput
  ): Promise<ChatRecordDeliveryPayload> {
    return this.client.$transaction(async (transaction) => {
      const transactionNow = this.now();
      const replay = await this.findCommandReplay(transaction, input);
      if (replay) return this.toDeliveryReplay(replay, input.requestFingerprint);

      await this.assertSourceMessagesCurrent(transaction, input, transactionNow);
      const createdBundle = await this.createBundleAndItems(transaction, input, transactionNow);
      const send = await persistImMessageInTransaction(transaction, {
        conversationId: input.targetConversationId,
        senderUserId: input.createdByUserId,
        senderIdentityId: input.createdByIdentityId,
        type: MessageType.TEXT,
        content: input.titleSnapshot,
        metadata: {
          needoMessageType: "chat-record",
          needoMessageExt: {
            bundlePublicId: input.publicId,
            itemCount: input.items.length,
            preview: input.previewSnapshot,
            senderCount: input.senderNamesSnapshot.length,
            title: input.titleSnapshot,
            titleKind: input.titleKind
          }
        },
        transactionNow
      });
      if (send.status !== "created") throw this.sendRejected(send.status);
      const { message } = send;

      await transaction.imChatRecordDelivery.create({
        data: {
          bundleId: createdBundle.id,
          messageId: message.id,
          conversationId: input.targetConversationId,
          createdAt: transactionNow
        }
      });
      await transaction.auditLog.create({
        data: {
          actorId: input.createdByUserId,
          action: "im.chat_record.delivered",
          targetType: "ImChatRecordBundle",
          targetId: createdBundle.id,
          ip: input.context.ip,
          userAgent: input.context.userAgent ?? null,
          metadata: {
            conversationId: input.targetConversationId,
            itemCount: input.items.length,
            messageId: message.id
          }
        }
      });

      return {
        replayed: false,
        bundle: this.mapBundle(createdBundle),
        message: this.mapMessage(message, input.createdByIdentityId, transactionNow),
        recipients: send.recipients
      };
    });
  }

  public async createFavorite(
    input: CreateChatRecordFavoritePersistenceInput
  ): Promise<ChatRecordFavoriteCreationPayload> {
    try {
      return await this.createFavoriteTransaction(input);
    } catch (error) {
      const replay = await this.recoverUniqueReplay(error, input);
      if (replay) return this.toFavoriteReplay(replay, input.requestFingerprint);
      throw error;
    }
  }

  private createFavoriteTransaction(
    input: CreateChatRecordFavoritePersistenceInput
  ): Promise<ChatRecordFavoriteCreationPayload> {
    return this.client.$transaction(async (transaction) => {
      const transactionNow = this.now();
      const replay = await this.findCommandReplay(transaction, input);
      if (replay) return this.toFavoriteReplay(replay, input.requestFingerprint);

      await this.assertSourceMessagesCurrent(transaction, input, transactionNow);
      const createdBundle = await this.createBundleAndItems(transaction, input, transactionNow);
      const favorite = await transaction.imChatRecordFavorite.create({
        data: {
          bundleId: createdBundle.id,
          ownerUserId: input.createdByUserId,
          ownerIdentityId: input.createdByIdentityId,
          createdAt: transactionNow
        }
      });
      await transaction.auditLog.create({
        data: {
          actorId: input.createdByUserId,
          action: "im.chat_record.favorited",
          targetType: "ImChatRecordBundle",
          targetId: createdBundle.id,
          ip: input.context.ip,
          userAgent: input.context.userAgent ?? null,
          metadata: { favoriteId: favorite.id, itemCount: input.items.length }
        }
      });
      return {
        replayed: false,
        favorite: this.mapFavorite(favorite.id, favorite.createdAt, createdBundle)
      };
    });
  }

  public async getBundle(input: {
    publicId: string;
    userId: number;
    identityId: number;
  }): Promise<ChatRecordBundlePayload | null> {
    const bundle = await this.client.imChatRecordBundle.findFirst({
      where: activeBundleAccessWhere(input),
      include: {
        favorites: {
          where: { ownerIdentityId: input.identityId, deletedAt: null },
          select: { id: true }
        },
        deliveries: {
          where: { deletedAt: null },
          include: {
            message: {
              include: {
                userDeletions: {
                  where: { identityId: input.identityId, deletedAt: null },
                  select: { id: true }
                }
              }
            },
            conversation: {
              include: {
                participants: {
                  where: { identityId: input.identityId, deletedAt: null },
                  select: { createdAt: true, clearedThroughMessageId: true }
                }
              }
            }
          }
        }
      }
    });
    if (!bundle) return null;
    if (
      bundle.createdByIdentityId !== input.identityId &&
      bundle.favorites.length === 0 &&
      !bundle.deliveries.some((delivery) => this.deliveryVisible(delivery))
    ) {
      return null;
    }
    return this.mapBundle(bundle);
  }

  public async listItems(input: {
    bundleId: number;
    beforePosition?: number;
    pageSize: number;
  }): Promise<ChatRecordItemPage> {
    const activeWhere = { bundleId: input.bundleId, deletedAt: null };
    const rowsQuery = this.client.imChatRecordItem.findMany({
      where: {
        ...activeWhere,
        ...(input.beforePosition === undefined ? {} : { position: { lt: input.beforePosition } })
      },
      orderBy: { position: "desc" },
      take: input.pageSize
    });
    const totalQuery = this.client.imChatRecordItem.count({ where: activeWhere });
    let rows;
    let total;
    let consumed = 0;
    if (input.beforePosition === undefined) {
      [rows, total] = await this.client.$transaction([rowsQuery, totalQuery]);
    } else {
      [rows, total, consumed] = await this.client.$transaction([
        rowsQuery,
        totalQuery,
        this.client.imChatRecordItem.count({
          where: { ...activeWhere, position: { gte: input.beforePosition } }
        })
      ]);
    }
    return {
      list: [...rows].reverse().map((item) => ({
        id: item.id,
        position: item.position,
        senderDisplayName: item.senderDisplayNameSnapshot,
        senderAvatarUrl: item.senderAvatarSnapshot,
        messageType: item.messageType,
        content: item.contentSnapshot,
        metadata: item.metadataSnapshot,
        sentAt: item.sentAtSnapshot
      })),
      total,
      page: Math.floor(consumed / input.pageSize) + 1,
      pageSize: input.pageSize,
      nextCursor: consumed + rows.length < total ? (rows.at(-1)?.position ?? null) : null
    };
  }

  public async listFavorites(input: {
    identityId: number;
    page: number;
    pageSize: number;
  }): Promise<ChatRecordFavoritePage> {
    const where = {
      ownerIdentityId: input.identityId,
      deletedAt: null,
      bundle: { deletedAt: null }
    } satisfies Prisma.ImChatRecordFavoriteWhereInput;
    const [rows, total] = await this.client.$transaction([
      this.client.imChatRecordFavorite.findMany({
        where,
        include: { bundle: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize
      }),
      this.client.imChatRecordFavorite.count({ where })
    ]);
    return {
      list: rows.map((favorite) =>
        this.mapFavorite(favorite.id, favorite.createdAt, favorite.bundle)
      ),
      total,
      page: input.page,
      page_size: input.pageSize
    };
  }

  public removeFavorite(input: {
    favoriteId: number;
    userId: number;
    identityId: number;
    context: AuthRequestContext;
  }): Promise<boolean> {
    return this.client.$transaction(async (transaction) => {
      const favorite = await transaction.imChatRecordFavorite.findFirst({
        where: {
          id: input.favoriteId,
          ownerUserId: input.userId,
          ownerIdentityId: input.identityId,
          deletedAt: null
        },
        select: { id: true, bundleId: true }
      });
      if (!favorite) return false;
      const deletedAt = new Date();
      await transaction.imChatRecordFavorite.update({
        where: { id: favorite.id },
        data: { deletedAt }
      });
      await transaction.auditLog.create({
        data: {
          actorId: input.userId,
          action: "im.chat_record.favorite_removed",
          targetType: "ImChatRecordFavorite",
          targetId: favorite.id,
          ip: input.context.ip,
          userAgent: input.context.userAgent ?? null,
          metadata: { bundleId: favorite.bundleId }
        }
      });
      return true;
    });
  }

  public async resolveAuthorizedMedia(input: {
    publicId: string;
    checksumSha256: string;
    userId: number;
    identityId: number;
  }): Promise<AuthorizedChatRecordMedia | null> {
    const authorized = await this.getBundle(input);
    if (!authorized) return null;
    const items = await this.client.imChatRecordItem.findMany({
      where: { bundleId: authorized.id, deletedAt: null },
      select: { id: true, metadataSnapshot: true }
    });
    if (items.length === 0) return null;
    const asset = await this.client.mediaAsset.findFirst({
      where: {
        entityType: "im_chat_record_item",
        entityId: { in: items.map((item) => item.id) },
        usageType: "im_chat_record",
        checksumSha256: input.checksumSha256,
        isActive: true,
        deletedAt: null,
        purgedAt: null
      },
      select: { entityId: true, checksumSha256: true, mimeType: true }
    });
    if (!asset?.checksumSha256) return null;
    const descriptor = this.mediaDescriptor(
      items.find((item) => item.id === asset.entityId)?.metadataSnapshot
    );
    if (
      !descriptor ||
      descriptor.checksumSha256 !== asset.checksumSha256 ||
      descriptor.mimeType !== asset.mimeType
    ) {
      return null;
    }
    return {
      publicId: input.publicId,
      checksumSha256: asset.checksumSha256,
      mimeType: asset.mimeType,
      size: descriptor.size
    };
  }

  private async findCommandReplay(
    transaction: TransactionClient | PrismaClient,
    input: Pick<
      ChatRecordCommandPreflightInput,
      "commandType" | "createdByIdentityId" | "idempotencyKey"
    >
  ) {
    const activeReplay = await transaction.imChatRecordBundle.findUnique({
      where: {
        createdByIdentityId_commandType_idempotencyKey: {
          createdByIdentityId: input.createdByIdentityId,
          commandType: input.commandType,
          idempotencyKey: input.idempotencyKey
        },
        deletedAt: null
      },
      include: commandReplayInclude
    });
    if (activeReplay) return activeReplay;

    const reservation = await transaction.imChatRecordBundle.findUnique({
      where: {
        createdByIdentityId_commandType_idempotencyKey: {
          createdByIdentityId: input.createdByIdentityId,
          commandType: input.commandType,
          idempotencyKey: input.idempotencyKey
        }
      },
      include: commandReplayInclude
    });
    if (!reservation) return null;
    if (reservation.deletedAt !== null) throw this.idempotencyConflict();
    return reservation;
  }

  private recoverUniqueReplay(error: unknown, input: CreateChatRecordPersistenceBase) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "P2002"
    ) {
      return null;
    }
    return this.findCommandReplay(this.client, input);
  }

  private async createBundleAndItems(
    transaction: TransactionClient,
    input: CreateChatRecordPersistenceBase,
    transactionNow: Date
  ) {
    const bundle = await transaction.imChatRecordBundle.create({
      data: {
        publicId: input.publicId,
        commandType: input.commandType,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        createdByUserId: input.createdByUserId,
        createdByIdentityId: input.createdByIdentityId,
        sourceConversationId: input.sourceConversationId,
        senderCount: input.senderNamesSnapshot.length,
        itemCount: input.items.length,
        senderNamesSnapshot: input.senderNamesSnapshot,
        titleSnapshot: input.titleSnapshot,
        previewSnapshot: input.previewSnapshot,
        createdAt: transactionNow
      }
    });
    for (const source of input.items) {
      const item = await transaction.imChatRecordItem.create({
        data: {
          bundleId: bundle.id,
          position: source.position,
          sourceMessageId: source.sourceMessageId,
          senderUserId: source.senderUserId,
          senderIdentityId: source.senderIdentityId,
          senderDisplayNameSnapshot: source.senderDisplayNameSnapshot,
          senderAvatarSnapshot: source.senderAvatarSnapshot,
          messageType: source.messageType,
          contentSnapshot: source.contentSnapshot,
          metadataSnapshot: this.toJsonValue(source.metadataSnapshot),
          sentAtSnapshot: source.sentAtSnapshot,
          createdAt: transactionNow
        }
      });
      if (source.media) {
        await transaction.mediaAsset.create({
          data: {
            entityType: "im_chat_record_item",
            entityId: item.id,
            ownerUserId: input.createdByUserId,
            ownerIdentityId: input.createdByIdentityId,
            url: `/api/v1/im/chat-records/${input.publicId}/media/${source.media.checksumSha256}`,
            mimeType: source.media.mimeType,
            usageType: "im_chat_record",
            sortOrder: source.position,
            checksumSha256: source.media.checksumSha256,
            createdAt: transactionNow
          }
        });
      }
    }
    return bundle;
  }

  private async assertSourceMessagesCurrent(
    transaction: TransactionClient,
    input: CreateChatRecordPersistenceBase,
    transactionNow: Date
  ): Promise<void> {
    const participant = await transaction.conversationParticipant.findFirst({
      where: {
        conversationId: input.sourceConversationId,
        identityId: input.createdByIdentityId,
        deletedAt: null,
        conversation: { deletedAt: null }
      },
      select: { createdAt: true, clearedThroughMessageId: true }
    });
    if (!participant) throw this.sourceUnavailable();

    const sourceMessageIds = input.items.map((item) => item.sourceMessageId);
    const messages = await transaction.message.findMany({
      where: {
        id: {
          in: sourceMessageIds,
          ...(participant.clearedThroughMessageId === null
            ? {}
            : { gt: participant.clearedThroughMessageId })
        },
        conversationId: input.sourceConversationId,
        createdAt: { gte: participant.createdAt },
        recalledAt: null,
        expiredAt: null,
        contentPurgedAt: null,
        privacyPolicyVersionAtSend: null,
        deletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: transactionNow } }],
        userDeletions: {
          none: { identityId: input.createdByIdentityId, deletedAt: null }
        }
      },
      select: {
        id: true,
        type: true,
        metadata: true,
        recalledAt: true,
        expiredAt: true,
        expiresAt: true,
        contentPurgedAt: true,
        privacyPolicyVersionAtSend: true,
        deletedAt: true
      }
    });
    if (
      messages.length !== input.items.length ||
      messages.some(
        (message) =>
          message.recalledAt !== null ||
          message.expiredAt !== null ||
          message.contentPurgedAt !== null ||
          message.privacyPolicyVersionAtSend !== null ||
          message.deletedAt !== null ||
          (message.expiresAt !== null && message.expiresAt <= transactionNow) ||
          parseChatRecordSourcePolicy(this.messageTypeFromDb(message.type), message.metadata) ===
            null
      )
    ) {
      throw this.sourceUnavailable();
    }
  }

  private toDeliveryReplay(
    bundle: Awaited<ReturnType<ImChatRecordRepository["findCommandReplay"]>> & object,
    requestFingerprint: string
  ): ChatRecordDeliveryPayload {
    if (bundle.requestFingerprint !== requestFingerprint) throw this.idempotencyConflict();
    const delivery = bundle.deliveries[0];
    if (!delivery) throw this.idempotencyConflict();
    return {
      replayed: true,
      bundle: this.mapBundle(bundle),
      message: this.mapMessage(delivery.message, bundle.createdByIdentityId, new Date()),
      recipients: delivery.conversation.participants
    };
  }

  private toFavoriteReplay(
    bundle: Awaited<ReturnType<ImChatRecordRepository["findCommandReplay"]>> & object,
    requestFingerprint: string
  ): ChatRecordFavoriteCreationPayload {
    if (bundle.requestFingerprint !== requestFingerprint) throw this.idempotencyConflict();
    const favorite = bundle.favorites[0];
    if (!favorite) throw this.idempotencyConflict();
    return {
      replayed: true,
      favorite: this.mapFavorite(favorite.id, favorite.createdAt, bundle)
    };
  }

  private deliveryVisible(delivery: {
    message: {
      id: number;
      createdAt: Date;
      deletedAt: Date | null;
      recalledAt: Date | null;
      contentPurgedAt: Date | null;
      expiredAt: Date | null;
      expiresAt: Date | null;
      userDeletions: Array<{ id: number }>;
    };
    conversation: {
      participants: Array<{ createdAt: Date; clearedThroughMessageId: number | null }>;
    };
  }): boolean {
    const participant = delivery.conversation.participants[0];
    const message = delivery.message;
    return Boolean(
      participant &&
      participant.createdAt <= message.createdAt &&
      (participant.clearedThroughMessageId === null ||
        participant.clearedThroughMessageId < message.id) &&
      message.deletedAt === null &&
      message.recalledAt === null &&
      message.contentPurgedAt === null &&
      message.expiredAt === null &&
      (message.expiresAt === null || message.expiresAt > new Date()) &&
      message.userDeletions.length === 0
    );
  }

  private mapBundle(bundle: {
    id: number;
    publicId: string;
    titleSnapshot: string;
    previewSnapshot: string;
    senderCount: number;
    itemCount: number;
    createdAt: Date;
  }): ChatRecordBundlePayload {
    return {
      id: bundle.id,
      publicId: bundle.publicId,
      title: bundle.titleSnapshot,
      preview: bundle.previewSnapshot,
      senderCount: bundle.senderCount,
      itemCount: bundle.itemCount,
      createdAt: bundle.createdAt
    };
  }

  private mapFavorite(
    id: number,
    createdAt: Date,
    bundle: {
      publicId: string;
      titleSnapshot: string;
      previewSnapshot: string;
      senderCount: number;
      itemCount: number;
    }
  ): ChatRecordFavoritePayload {
    return {
      id,
      bundlePublicId: bundle.publicId,
      title: bundle.titleSnapshot,
      preview: bundle.previewSnapshot,
      senderCount: bundle.senderCount,
      itemCount: bundle.itemCount,
      createdAt
    };
  }

  private mapMessage(
    message: {
      id: number;
      conversationId: number;
      senderUserId: number | null;
      senderIdentityId: number | null;
      type: MessageType;
      content: string | null;
      metadata: unknown;
      expiresAt: Date | null;
      createdAt: Date;
      recallDeadlineAt: Date;
      recalledAt: Date | null;
      recallMode: MessageRecallMode | null;
      contentPurgedAt: Date | null;
      privacyPolicyVersionAtSend: number | null;
      lifecycleVersion: number;
      reactionVersion: number;
    },
    viewerIdentityId: number,
    now: Date
  ): MessagePayload {
    const active =
      message.recalledAt === null &&
      message.contentPurgedAt === null &&
      (message.expiresAt === null || message.expiresAt > now);
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderUserId: message.senderUserId,
      type: this.messageTypeFromDb(message.type),
      content: message.content,
      metadata: message.metadata,
      reactions: [],
      expiresAt: message.expiresAt,
      createdAt: message.createdAt,
      recallDeadlineAt: message.recallDeadlineAt,
      recalledAt: message.recalledAt,
      recallMode:
        message.recallMode === MessageRecallMode.STANDARD
          ? "standard"
          : message.recallMode === MessageRecallMode.TRACELESS
            ? "traceless"
            : null,
      contentPurgedAt: message.contentPurgedAt,
      privacyPolicyVersionAtSend: message.privacyPolicyVersionAtSend,
      lifecycleVersion: message.lifecycleVersion,
      reactionVersion: message.reactionVersion,
      availableRecallModes:
        active && message.senderIdentityId === viewerIdentityId && message.recallDeadlineAt >= now
          ? ["standard"]
          : []
    };
  }

  private messageTypeFromDb(type: MessageType): "text" | "system" | "orderStatus" {
    if (type === MessageType.SYSTEM) return "system";
    if (type === MessageType.ORDER_STATUS) return "orderStatus";
    return "text";
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    return value === null || value === undefined
      ? Prisma.JsonNull
      : (value as Prisma.InputJsonValue);
  }

  private mediaDescriptor(value: unknown): ChatRecordMediaDescriptor | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const media = (value as Record<string, unknown>).media;
    if (!media || typeof media !== "object" || Array.isArray(media)) return null;
    const { checksumSha256, mimeType, size } = media as Record<string, unknown>;
    if (
      typeof checksumSha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(checksumSha256) ||
      typeof mimeType !== "string" ||
      !Number.isInteger(size) ||
      (size as number) <= 0
    ) {
      return null;
    }
    return { checksumSha256, mimeType, size: size as number };
  }

  private sendRejected(status: "not_found" | "recipient_blocked" | "not_friends"): AppError {
    if (status === "not_found") return this.notFound("error.realtime.conversation_not_found");
    return this.forbidden(
      status === "recipient_blocked" ? "error.im.recipient_blocked" : "error.im.not_friends"
    );
  }

  private idempotencyConflict(): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.idempotency_key_reused",
      statusCode: 409
    });
  }

  private sourceUnavailable(): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.im.chat_record_source_unavailable",
      statusCode: 409
    });
  }

  private notFound(message: string): AppError {
    return new AppError({ code: ERROR_CODES.NOT_FOUND, message, statusCode: 404 });
  }

  private forbidden(message: string): AppError {
    return new AppError({ code: ERROR_CODES.FORBIDDEN, message, statusCode: 403 });
  }
}
