import { MessageType, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type { ImTranslationTargetLanguage } from "../services/im-translation.provider";

export interface VisibleImMessage {
  id: number;
  conversationId: number;
  senderUserId: number | null;
  type: "text" | "system" | "orderStatus";
  content: string | null;
  metadata: unknown;
}

export interface TranslationCacheKey {
  messageId: number;
  sourceContentHash: string;
  targetLanguage: ImTranslationTargetLanguage;
  providerKey: string;
}

export interface ImMessageTranslationCacheEntry extends TranslationCacheKey {
  sourceLanguage: string | null;
  translatedContent: string;
  providerRequestId: string | null;
}

export interface ImMessageTranslationRepositoryPort {
  loadVisibleMessages(input: {
    conversationId: number;
    userId: number;
    identityId: number;
    messageIds: number[];
    now: Date;
  }): Promise<VisibleImMessage[]>;
  findCachedTranslations(keys: TranslationCacheKey[]): Promise<ImMessageTranslationCacheEntry[]>;
  saveTranslations(entries: ImMessageTranslationCacheEntry[]): Promise<void>;
}

export class ImMessageTranslationRepository implements ImMessageTranslationRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async loadVisibleMessages(input: {
    conversationId: number;
    userId: number;
    identityId: number;
    messageIds: number[];
    now: Date;
  }): Promise<VisibleImMessage[]> {
    const participant = await this.client.conversationParticipant.findFirst({
      where: {
        conversationId: input.conversationId,
        userId: input.userId,
        identityId: input.identityId,
        deletedAt: null,
        conversation: { deletedAt: null }
      },
      select: { createdAt: true, clearedThroughMessageId: true }
    });
    if (!participant) return [];

    const messages = await this.client.message.findMany({
      where: {
        id:
          participant.clearedThroughMessageId === null
            ? { in: input.messageIds }
            : { in: input.messageIds, gt: participant.clearedThroughMessageId },
        conversationId: input.conversationId,
        createdAt: { gte: participant.createdAt },
        deletedAt: null,
        recalledAt: null,
        contentPurgedAt: null,
        expiredAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
        conversation: { deletedAt: null },
        userDeletions: { none: { identityId: input.identityId, deletedAt: null } }
      },
      select: {
        id: true,
        conversationId: true,
        senderUserId: true,
        type: true,
        content: true,
        metadata: true
      }
    });

    return messages.map((message) => ({
      id: message.id,
      conversationId: message.conversationId,
      senderUserId: message.senderUserId,
      type: this.messageTypeFromDb(message.type),
      content: message.content,
      metadata: message.metadata
    }));
  }

  public async findCachedTranslations(
    keys: TranslationCacheKey[]
  ): Promise<ImMessageTranslationCacheEntry[]> {
    if (keys.length === 0) return [];
    const records = await this.client.imMessageTranslation.findMany({
      where: {
        deletedAt: null,
        OR: keys.map((key) => ({
          messageId: key.messageId,
          sourceContentHash: key.sourceContentHash,
          targetLanguage: key.targetLanguage,
          providerKey: key.providerKey
        }))
      },
      select: {
        messageId: true,
        sourceContentHash: true,
        sourceLanguage: true,
        targetLanguage: true,
        translatedContent: true,
        providerKey: true,
        providerRequestId: true
      }
    });

    return records.map((record) => ({
      ...record,
      targetLanguage: record.targetLanguage as ImTranslationTargetLanguage
    }));
  }

  public async saveTranslations(entries: ImMessageTranslationCacheEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const translatedAt = new Date();
    await this.client.$transaction(
      entries.map((entry) =>
        this.client.imMessageTranslation.upsert({
          where: {
            messageId_sourceContentHash_targetLanguage_providerKey: {
              messageId: entry.messageId,
              sourceContentHash: entry.sourceContentHash,
              targetLanguage: entry.targetLanguage,
              providerKey: entry.providerKey
            }
          },
          create: { ...entry, translatedAt },
          update: {
            sourceLanguage: entry.sourceLanguage,
            translatedContent: entry.translatedContent,
            providerRequestId: entry.providerRequestId,
            translatedAt,
            deletedAt: null
          }
        })
      )
    );
  }

  private messageTypeFromDb(type: MessageType): VisibleImMessage["type"] {
    if (type === MessageType.SYSTEM) return "system";
    if (type === MessageType.ORDER_STATUS) return "orderStatus";
    return "text";
  }
}
