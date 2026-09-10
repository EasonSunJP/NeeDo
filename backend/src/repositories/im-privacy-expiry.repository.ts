import { ImDeletionAction, Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "../prisma/client";
import type {
  DuePrivacyMessage,
  ImPrivacyExpiryRepositoryPort,
  PrivacyExpiryExecution
} from "../services/im-privacy-expiry.service";

export class ImPrivacyExpiryRepository implements ImPrivacyExpiryRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async listDue(input: { now: Date; take: number }): Promise<DuePrivacyMessage[]> {
    const messages = await this.client.message.findMany({
      where: {
        deletedAt: null,
        expiredAt: null,
        expiresAt: { lte: input.now },
        privacyPolicyVersionAtSend: { not: null }
      },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: input.take,
      select: {
        id: true,
        conversationId: true,
        senderUserId: true,
        createdAt: true,
        expiresAt: true,
        lifecycleVersion: true,
        privacyPolicyVersionAtSend: true
      }
    });

    return messages.flatMap((message) =>
      message.expiresAt !== null && message.privacyPolicyVersionAtSend !== null
        ? [
            {
              ...message,
              expiresAt: message.expiresAt,
              privacyPolicyVersionAtSend: message.privacyPolicyVersionAtSend
            }
          ]
        : []
    );
  }

  public expire(input: {
    candidate: DuePrivacyMessage;
    now: Date;
  }): Promise<PrivacyExpiryExecution | null> {
    return this.client.$transaction(
      async (tx) => {
        const claimed = await tx.message.updateMany({
          where: {
            id: input.candidate.id,
            conversationId: input.candidate.conversationId,
            deletedAt: null,
            expiredAt: null,
            expiresAt: input.candidate.expiresAt,
            lifecycleVersion: input.candidate.lifecycleVersion,
            privacyPolicyVersionAtSend: { not: null },
            AND: [{ expiresAt: { lte: input.now } }]
          },
          data: {
            lifecycleVersion: { increment: 1 }
          }
        });
        if (claimed.count !== 1) return null;

        await tx.imMessageTranslation.deleteMany({
          where: { messageId: input.candidate.id }
        });
        await tx.message.update({
          where: { id: input.candidate.id },
          data: {
            content: null,
            metadata: Prisma.DbNull,
            contentPurgedAt: input.now,
            expiredAt: input.now
          }
        });

        const participants = await tx.conversationParticipant.findMany({
          where: {
            conversationId: input.candidate.conversationId,
            createdAt: { lte: input.candidate.createdAt },
            OR: [{ deletedAt: null }, { deletedAt: { gt: input.candidate.createdAt } }]
          },
          select: { userId: true },
          orderBy: { userId: "asc" }
        });
        const previous = await tx.message.findFirst({
          where: {
            conversationId: input.candidate.conversationId,
            id: { lt: input.candidate.id },
            deletedAt: null,
            expiredAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }]
          },
          orderBy: { id: "desc" },
          select: { id: true, createdAt: true }
        });
        const latestRemaining = await tx.message.findFirst({
          where: {
            conversationId: input.candidate.conversationId,
            id: { not: input.candidate.id },
            deletedAt: null,
            expiredAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }]
          },
          orderBy: { id: "desc" },
          select: { createdAt: true }
        });
        const conversation = await tx.conversation.findUnique({
          where: { id: input.candidate.conversationId },
          select: { createdAt: true }
        });

        await tx.messageReaction.deleteMany({ where: { messageId: input.candidate.id } });
        await tx.messageUserDeletion.deleteMany({ where: { messageId: input.candidate.id } });
        const directive = await tx.imDeletionSync.create({
          data: {
            conversationId: input.candidate.conversationId,
            messageId: input.candidate.id,
            action: ImDeletionAction.PRIVACY_EXPIRED,
            mediaKind: null,
            occurredAt: input.now
          }
        });
        await tx.auditLog.create({
          data: {
            actorId: null,
            action: "im.message.privacy_expired",
            targetType: "Message",
            targetId: input.candidate.id,
            ip: null,
            userAgent: null,
            metadata: {
              conversationId: input.candidate.conversationId,
              privacyPolicyVersionAtSend: input.candidate.privacyPolicyVersionAtSend
            },
            createdAt: input.now
          }
        });

        const unreadRecipientUserIds = participants
          .map((participant) => participant.userId)
          .filter((userId) => userId !== input.candidate.senderUserId);
        if (unreadRecipientUserIds.length > 0) {
          await tx.conversationParticipant.updateMany({
            where: {
              conversationId: input.candidate.conversationId,
              userId: { in: unreadRecipientUserIds },
              unreadCount: { gt: 0 },
              deletedAt: null,
              OR: [{ lastReadMessageId: null }, { lastReadMessageId: { lt: input.candidate.id } }]
            },
            data: { unreadCount: { decrement: 1 } }
          });
        }
        await tx.conversationParticipant.updateMany({
          where: {
            conversationId: input.candidate.conversationId,
            lastReadMessageId: input.candidate.id,
            deletedAt: null
          },
          data: {
            lastReadMessageId: previous?.id ?? null,
            lastReadAt: previous?.createdAt ?? null
          }
        });
        await tx.message.delete({ where: { id: input.candidate.id } });
        await tx.conversation.update({
          where: { id: input.candidate.conversationId },
          data: {
            updatedAt:
              latestRemaining?.createdAt ?? conversation?.createdAt ?? input.candidate.createdAt
          }
        });

        return {
          directiveId: directive.id,
          conversationId: input.candidate.conversationId,
          messageId: input.candidate.id,
          occurredAt: input.now,
          participantUserIds: participants.map((participant) => participant.userId)
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }
}
