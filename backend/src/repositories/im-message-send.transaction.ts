import { ConversationAccessPolicy, ConversationType, Prisma } from "@prisma/client";
import type { MessageType } from "@prisma/client";
import { IM_PRIVACY_TTL_MAX_SECONDS, IM_PRIVACY_TTL_MIN_SECONDS } from "../constants/im-privacy";

export const imMessageInclude = {
  reactions: {
    where: { deletedAt: null },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          customerProfile: { select: { displayName: true, deletedAt: true } },
          technicianProfile: { select: { displayName: true, deletedAt: true } }
        }
      },
      identity: {
        select: {
          id: true,
          type: true,
          displayName: true,
          merchantIdentityProfile: { select: { displayName: true, deletedAt: true } }
        }
      }
    },
    orderBy: { id: "asc" as const }
  }
} satisfies Prisma.MessageInclude;

export type PersistedImMessage = Prisma.MessageGetPayload<{ include: typeof imMessageInclude }>;

export interface PersistImMessageInput {
  conversationId: number;
  senderUserId: number;
  senderIdentityId: number;
  type: MessageType;
  content: string;
  metadata: unknown;
  transactionNow: Date;
}

export type PersistImMessageOutcome =
  | { status: "not_found" | "recipient_blocked" | "not_friends" }
  | {
      status: "created";
      message: PersistedImMessage;
      recipients: Array<{ userId: number; identityId: number }>;
    };

export async function persistImMessageInTransaction(
  transaction: Prisma.TransactionClient,
  input: PersistImMessageInput
): Promise<PersistImMessageOutcome> {
  const participant = await transaction.conversationParticipant.findFirst({
    where: {
      conversationId: input.conversationId,
      identityId: input.senderIdentityId,
      deletedAt: null,
      conversation: { deletedAt: null }
    },
    select: {
      id: true,
      createdAt: true,
      conversation: {
        select: {
          type: true,
          privacyModeEnabled: true,
          disappearingTtlSeconds: true,
          privacyPolicyVersion: true,
          accessPolicy: true,
          participants: {
            where: { deletedAt: null },
            select: {
              userId: true,
              identityId: true,
              identity: {
                select: {
                  ownedContacts: {
                    where: {
                      contactIdentityId: input.senderIdentityId,
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
  if (!participant) return { status: "not_found" };

  const conversation = participant.conversation;
  if (
    conversation.type === ConversationType.DIRECT &&
    conversation.participants.some(
      (candidate) =>
        candidate.userId !== input.senderUserId && candidate.identity.ownedContacts.length > 0
    )
  ) {
    return { status: "recipient_blocked" };
  }
  if (conversation.accessPolicy === ConversationAccessPolicy.FRIENDSHIP_REQUIRED) {
    const identityIds = conversation.participants.map(({ identityId }) => identityId);
    if (identityIds.length !== 2) return { status: "not_friends" };
    const reciprocalContactCount = await transaction.contact.count({
      where: {
        deletedAt: null,
        OR: [
          { ownerIdentityId: identityIds[0], contactIdentityId: identityIds[1] },
          { ownerIdentityId: identityIds[1], contactIdentityId: identityIds[0] }
        ]
      }
    });
    if (reciprocalContactCount !== 2) return { status: "not_friends" };
  }

  const policy = await transaction.imPolicy.findFirst({
    where: { activeKey: "active", deletedAt: null },
    select: {
      textRetentionSeconds: true,
      imageRetentionSeconds: true,
      videoRetentionSeconds: true,
      recallWindowSeconds: true,
      version: true
    }
  });
  const privacyTtlSeconds = conversation.disappearingTtlSeconds;
  const usesPrivacyExpiry =
    conversation.type === ConversationType.GROUP &&
    conversation.privacyModeEnabled &&
    typeof privacyTtlSeconds === "number" &&
    Number.isInteger(privacyTtlSeconds) &&
    privacyTtlSeconds >= IM_PRIVACY_TTL_MIN_SECONDS &&
    privacyTtlSeconds <= IM_PRIVACY_TTL_MAX_SECONDS;
  const retentionSeconds = usesPrivacyExpiry
    ? privacyTtlSeconds
    : (policy?.textRetentionSeconds ?? 30 * 86_400);
  const expiresAt = new Date(input.transactionNow.getTime() + retentionSeconds * 1_000);
  const mediaReference = imMediaReference(input.metadata, input.content);
  if (mediaReference === "invalid") throw new ImMediaBindingError();
  const mediaAsset = mediaReference
    ? await transaction.mediaAsset.findFirst({
        where: {
          entityType: "im_media_upload",
          entityId: input.conversationId,
          ownerUserId: input.senderUserId,
          ownerIdentityId: input.senderIdentityId,
          url: mediaReference.url,
          mimeType: { startsWith: mediaReference.kind },
          isActive: true,
          purgedAt: null,
          deletedAt: null
        },
        select: { id: true }
      })
    : null;
  if (mediaReference && !mediaAsset) throw new ImMediaBindingError();
  const message = await transaction.message.create({
    data: {
      conversationId: input.conversationId,
      senderUserId: input.senderUserId,
      senderIdentityId: input.senderIdentityId,
      type: input.type,
      content: input.content,
      metadata: toJsonValue(input.metadata),
      createdAt: input.transactionNow,
      expiresAt,
      recallDeadlineAt: new Date(
        input.transactionNow.getTime() + (policy?.recallWindowSeconds ?? 180) * 1_000
      ),
      privacyPolicyVersionAtSend: usesPrivacyExpiry ? conversation.privacyPolicyVersion : null,
      lifecycleVersion: policy?.version ?? 1
    },
    include: imMessageInclude
  });

  if (mediaReference && mediaAsset) {
    const mediaRetentionSeconds =
      mediaReference.kind === "video"
        ? (policy?.videoRetentionSeconds ?? 3 * 86_400)
        : (policy?.imageRetentionSeconds ?? 3 * 86_400);
    const bound = await transaction.mediaAsset.updateMany({
      where: {
        id: mediaAsset.id,
        entityType: "im_media_upload",
        entityId: input.conversationId,
        ownerUserId: input.senderUserId,
        ownerIdentityId: input.senderIdentityId,
        purgedAt: null,
        deletedAt: null
      },
      data: {
        entityType: "message",
        entityId: message.id,
        purgeAt: new Date(input.transactionNow.getTime() + mediaRetentionSeconds * 1_000)
      }
    });
    if (bound.count !== 1) throw new Error("IM media binding conflict");
  }

  await transaction.conversation.update({
    where: { id: input.conversationId },
    data: { updatedAt: input.transactionNow }
  });
  await transaction.conversationParticipant.updateMany({
    where: {
      conversationId: input.conversationId,
      identityId: input.senderIdentityId,
      deletedAt: null
    },
    data: {
      unreadCount: 0,
      hiddenAt: null,
      lastReadMessageId: message.id,
      lastReadAt: input.transactionNow,
      updatedAt: input.transactionNow
    }
  });
  await transaction.conversationParticipant.updateMany({
    where: {
      conversationId: input.conversationId,
      identityId: { not: input.senderIdentityId },
      deletedAt: null
    },
    data: { unreadCount: { increment: 1 }, hiddenAt: null, updatedAt: input.transactionNow }
  });

  return {
    status: "created",
    message,
    recipients: conversation.participants.map(({ userId, identityId }) => ({
      userId,
      identityId
    }))
  };
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

export class ImMediaBindingError extends Error {}

function imMediaReference(
  metadata: unknown,
  content: string
): { kind: "image" | "video"; url: string } | "invalid" | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata as Record<string, unknown>;
  if (value.needoMessageType !== "image" && value.needoMessageType !== "video") return null;
  const ext = value.needoMessageExt;
  if (!ext || typeof ext !== "object" || Array.isArray(ext)) return "invalid";
  const url = (ext as Record<string, unknown>).url;
  if (typeof url !== "string" || url !== content) return "invalid";
  return { kind: value.needoMessageType, url };
}
