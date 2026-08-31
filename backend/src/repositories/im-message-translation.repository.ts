import { createHash } from "node:crypto";
import { MessageType, Prisma, type PrismaClient } from "@prisma/client";
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

export interface ExpectedTranslationMessage {
  messageId: number;
  source: string | null;
  sourceContentHash: string | null;
}

export interface FinalizeTranslationsInput {
  conversationId: number;
  userId: number;
  identityId: number;
  messageIds: number[];
  expectedMessages: ExpectedTranslationMessage[];
  requiredCacheKeys: TranslationCacheKey[];
  writes: ImMessageTranslationCacheEntry[];
  now: Date;
}

export type FinalizeTranslationsOutcome = "committed" | "not_found" | "cache_conflict";

export interface ImMessageTranslationRepositoryPort {
  loadVisibleMessages(input: {
    conversationId: number;
    userId: number;
    identityId: number;
    messageIds: number[];
    now: Date;
  }): Promise<VisibleImMessage[]>;
  findCachedTranslations(keys: TranslationCacheKey[]): Promise<ImMessageTranslationCacheEntry[]>;
  finalizeTranslations(input: FinalizeTranslationsInput): Promise<FinalizeTranslationsOutcome>;
}

export const extractImMessageTranslationSource = (message: VisibleImMessage): string | null => {
  if (message.senderUserId === null || message.type !== "text") return null;
  const metadata =
    typeof message.metadata === "object" && message.metadata !== null
      ? (message.metadata as Record<string, unknown>)
      : null;
  const needoMessageType = metadata?.needoMessageType;

  if (needoMessageType === undefined || needoMessageType === "text") {
    return typeof message.content === "string" && message.content.trim().length > 0
      ? message.content
      : null;
  }
  if (needoMessageType === "image" || needoMessageType === "video") {
    const extension = metadata?.needoMessageExt;
    const caption =
      typeof extension === "object" && extension !== null
        ? (extension as Record<string, unknown>).caption
        : null;
    return typeof caption === "string" && caption.trim().length > 0 ? caption : null;
  }
  return null;
};

export const hashImMessageTranslationSource = (source: string): string =>
  createHash("sha256").update(source, "utf8").digest("hex");

const cacheKeyString = (key: {
  messageId: number;
  sourceContentHash: string;
  targetLanguage: string;
  providerKey: string;
}): string => `${key.messageId}:${key.sourceContentHash}:${key.targetLanguage}:${key.providerKey}`;

export class ImMessageTranslationRepository implements ImMessageTranslationRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async loadVisibleMessages(input: {
    conversationId: number;
    userId: number;
    identityId: number;
    messageIds: number[];
    now: Date;
  }): Promise<VisibleImMessage[]> {
    return this.loadVisibleMessagesWithClient(this.client, input);
  }

  public async finalizeTranslations(
    input: FinalizeTranslationsInput
  ): Promise<FinalizeTranslationsOutcome> {
    try {
      return await this.client.$transaction(
        async (tx) => {
          const messages = await this.loadVisibleMessagesWithClient(tx, input);
          const messagesById = new Map(messages.map((message) => [message.id, message]));
          if (messagesById.size !== input.messageIds.length) return "not_found";

          for (const expected of input.expectedMessages) {
            const message = messagesById.get(expected.messageId);
            if (!message) return "not_found";
            const source = extractImMessageTranslationSource(message);
            if (source !== expected.source) return "not_found";
            const currentHash = source === null ? null : hashImMessageTranslationSource(source);
            if (currentHash !== expected.sourceContentHash) return "not_found";
          }

          const checkedKeys = [...input.requiredCacheKeys, ...input.writes];
          const existing =
            checkedKeys.length === 0
              ? []
              : await tx.imMessageTranslation.findMany({
                  where: {
                    OR: checkedKeys.map((key) => ({
                      messageId: key.messageId,
                      sourceContentHash: key.sourceContentHash,
                      targetLanguage: key.targetLanguage,
                      providerKey: key.providerKey
                    }))
                  },
                  select: {
                    messageId: true,
                    sourceContentHash: true,
                    targetLanguage: true,
                    providerKey: true,
                    deletedAt: true
                  }
                });
          const existingByKey = new Map(existing.map((entry) => [cacheKeyString(entry), entry]));
          if (
            input.requiredCacheKeys.some(
              (key) => existingByKey.get(cacheKeyString(key))?.deletedAt !== null
            ) ||
            input.writes.some((entry) => existingByKey.has(cacheKeyString(entry)))
          ) {
            return "cache_conflict";
          }

          for (const entry of input.writes) {
            await tx.imMessageTranslation.create({ data: { ...entry, translatedAt: input.now } });
          }
          return "committed";
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return "cache_conflict";
      }
      throw error;
    }
  }

  private async loadVisibleMessagesWithClient(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      conversationId: number;
      userId: number;
      identityId: number;
      messageIds: number[];
      now: Date;
    }
  ): Promise<VisibleImMessage[]> {
    const participant = await client.conversationParticipant.findFirst({
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

    const messages = await client.message.findMany({
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

  private messageTypeFromDb(type: MessageType): VisibleImMessage["type"] {
    if (type === MessageType.SYSTEM) return "system";
    if (type === MessageType.ORDER_STATUS) return "orderStatus";
    return "text";
  }
}
