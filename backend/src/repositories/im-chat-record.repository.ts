import {
  ConversationAccessPolicy,
  ConversationType,
  MessageRecallMode,
  MessageType,
  Prisma
} from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type { AuthRequestContext } from "../services/auth.service";
import type { MessagePayload } from "./realtime.repository";
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
  url: string;
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
  now: Date;
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

export interface AuthorizedChatRecordMedia {
  publicId: string;
  checksumSha256: string;
  mimeType: string;
  url: string;
}

export interface ImChatRecordRepositoryPort {
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
  public constructor(private readonly client: PrismaClient = prisma) {}

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
      const replay = await this.findCommandReplay(transaction, input);
      if (replay) return this.toDeliveryReplay(replay, input.requestFingerprint);

      await this.assertSourceMessagesCurrent(transaction, input);
      const participant = await this.requireDeliveryParticipant(transaction, input);
      const createdBundle = await this.createBundleAndItems(transaction, input);
      const message = await this.createDeliveryMessage(
        transaction,
        input,
        participant.conversation
      );

      await transaction.imChatRecordDelivery.create({
        data: {
          bundleId: createdBundle.id,
          messageId: message.id,
          conversationId: input.targetConversationId
        }
      });
      await transaction.conversation.update({
        where: { id: input.targetConversationId },
        data: { updatedAt: input.now }
      });
      await transaction.conversationParticipant.updateMany({
        where: {
          conversationId: input.targetConversationId,
          identityId: input.createdByIdentityId,
          deletedAt: null
        },
        data: {
          unreadCount: 0,
          hiddenAt: null,
          lastReadMessageId: message.id,
          lastReadAt: message.createdAt
        }
      });
      await transaction.conversationParticipant.updateMany({
        where: {
          conversationId: input.targetConversationId,
          identityId: { not: input.createdByIdentityId },
          deletedAt: null
        },
        data: { unreadCount: { increment: 1 }, hiddenAt: null }
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
        message: this.mapMessage(message, input.createdByIdentityId, input.now),
        recipients: participant.conversation.participants.map(({ userId, identityId }) => ({
          userId,
          identityId
        }))
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
      const replay = await this.findCommandReplay(transaction, input);
      if (replay) return this.toFavoriteReplay(replay, input.requestFingerprint);

      await this.assertSourceMessagesCurrent(transaction, input);
      const createdBundle = await this.createBundleAndItems(transaction, input);
      const favorite = await transaction.imChatRecordFavorite.create({
        data: {
          bundleId: createdBundle.id,
          ownerUserId: input.createdByUserId,
          ownerIdentityId: input.createdByIdentityId,
          createdAt: input.now
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
    const rows = await this.client.imChatRecordItem.findMany({
      where: {
        bundleId: input.bundleId,
        deletedAt: null,
        ...(input.beforePosition === undefined ? {} : { position: { lt: input.beforePosition } })
      },
      orderBy: { position: "desc" },
      take: input.pageSize
    });
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
      nextCursor: rows.length === input.pageSize ? (rows.at(-1)?.position ?? null) : null
    };
  }

  public async listFavorites(input: {
    identityId: number;
    page: number;
    pageSize: number;
  }): Promise<ChatRecordFavoritePage> {
    const where = {
      ownerIdentityId: input.identityId,
      deletedAt: null
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
    const itemIds = await this.client.imChatRecordItem.findMany({
      where: { bundleId: authorized.id, deletedAt: null },
      select: { id: true }
    });
    if (itemIds.length === 0) return null;
    const asset = await this.client.mediaAsset.findFirst({
      where: {
        entityType: "im_chat_record_item",
        entityId: { in: itemIds.map((item) => item.id) },
        usageType: "im_chat_record",
        checksumSha256: input.checksumSha256,
        isActive: true,
        deletedAt: null,
        purgedAt: null
      },
      select: { checksumSha256: true, mimeType: true, url: true }
    });
    if (!asset?.checksumSha256) return null;
    return {
      publicId: input.publicId,
      checksumSha256: asset.checksumSha256,
      mimeType: asset.mimeType,
      url: asset.url
    };
  }

  private findCommandReplay(
    transaction: TransactionClient | PrismaClient,
    input: CreateChatRecordPersistenceBase
  ) {
    return transaction.imChatRecordBundle.findUnique({
      where: {
        createdByIdentityId_commandType_idempotencyKey: {
          createdByIdentityId: input.createdByIdentityId,
          commandType: input.commandType,
          idempotencyKey: input.idempotencyKey
        }
      },
      include: {
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
      }
    });
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
    input: CreateChatRecordPersistenceBase
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
        createdAt: input.now
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
          createdAt: input.now
        }
      });
      if (source.media) {
        await transaction.mediaAsset.create({
          data: {
            entityType: "im_chat_record_item",
            entityId: item.id,
            ownerUserId: input.createdByUserId,
            ownerIdentityId: input.createdByIdentityId,
            url: source.media.url,
            mimeType: source.media.mimeType,
            usageType: "im_chat_record",
            sortOrder: source.position,
            checksumSha256: source.media.checksumSha256,
            createdAt: input.now
          }
        });
      }
    }
    return bundle;
  }

  private async assertSourceMessagesCurrent(
    transaction: TransactionClient,
    input: CreateChatRecordPersistenceBase
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
    const count = await transaction.message.count({
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
        OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
        userDeletions: {
          none: { identityId: input.createdByIdentityId, deletedAt: null }
        }
      }
    });
    if (count !== input.items.length) throw this.sourceUnavailable();
  }

  private async requireDeliveryParticipant(
    transaction: TransactionClient,
    input: CreateChatRecordDeliveryPersistenceInput
  ) {
    const participant = await transaction.conversationParticipant.findFirst({
      where: {
        conversationId: input.targetConversationId,
        identityId: input.createdByIdentityId,
        deletedAt: null,
        conversation: { deletedAt: null }
      },
      select: {
        conversation: {
          select: {
            type: true,
            accessPolicy: true,
            privacyModeEnabled: true,
            disappearingTtlSeconds: true,
            privacyPolicyVersion: true,
            participants: {
              where: { deletedAt: null },
              select: {
                userId: true,
                identityId: true,
                identity: {
                  select: {
                    ownedContacts: {
                      where: {
                        contactIdentityId: input.createdByIdentityId,
                        blockedAt: { not: null },
                        deletedAt: null
                      },
                      select: { id: true }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });
    if (!participant) throw this.notFound("error.realtime.conversation_not_found");
    if (
      participant.conversation.type === ConversationType.DIRECT &&
      participant.conversation.participants.some(
        (candidate) =>
          candidate.identityId !== input.createdByIdentityId &&
          candidate.identity.ownedContacts.length > 0
      )
    ) {
      throw this.forbidden("error.im.recipient_blocked");
    }
    if (participant.conversation.accessPolicy === ConversationAccessPolicy.FRIENDSHIP_REQUIRED) {
      const identityIds = participant.conversation.participants.map(({ identityId }) => identityId);
      const contactCount =
        identityIds.length === 2
          ? await transaction.contact.count({
              where: {
                deletedAt: null,
                OR: [
                  { ownerIdentityId: identityIds[0], contactIdentityId: identityIds[1] },
                  { ownerIdentityId: identityIds[1], contactIdentityId: identityIds[0] }
                ]
              }
            })
          : 0;
      if (contactCount !== 2) throw this.forbidden("error.im.not_friends");
    }
    return participant;
  }

  private async createDeliveryMessage(
    transaction: TransactionClient,
    input: CreateChatRecordDeliveryPersistenceInput,
    conversation: {
      type: ConversationType;
      privacyModeEnabled: boolean;
      disappearingTtlSeconds: number | null;
      privacyPolicyVersion: number;
    }
  ) {
    const policy = await transaction.imPolicy.findFirst({
      where: { activeKey: "active", deletedAt: null },
      select: { textRetentionSeconds: true, recallWindowSeconds: true, version: true }
    });
    const usesPrivacyExpiry =
      conversation.type === ConversationType.GROUP &&
      conversation.privacyModeEnabled &&
      conversation.disappearingTtlSeconds !== null;
    const retentionSeconds = usesPrivacyExpiry
      ? conversation.disappearingTtlSeconds
      : (policy?.textRetentionSeconds ?? null);
    const expiresAt =
      retentionSeconds === null ? null : new Date(input.now.getTime() + retentionSeconds * 1_000);
    return transaction.message.create({
      data: {
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
        createdAt: input.now,
        expiresAt,
        recallDeadlineAt: new Date(
          input.now.getTime() + (policy?.recallWindowSeconds ?? 180) * 1_000
        ),
        privacyPolicyVersionAtSend: usesPrivacyExpiry ? conversation.privacyPolicyVersion : null,
        lifecycleVersion: policy?.version ?? 1
      }
    });
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
