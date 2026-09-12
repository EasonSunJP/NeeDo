import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";

export interface DueServerRetentionMessage {
  id: number;
  conversationId: number;
  senderUserId: number | null;
  createdAt: Date;
  expiresAt: Date;
  lifecycleVersion: number;
}

export interface DueImMedia {
  id: number;
  url: string;
  purgeAt: Date;
}

export interface RegisterImMediaUploadInput {
  conversationId: number;
  ownerUserId: number;
  ownerIdentityId: number;
  url: string;
  mimeType: string;
  checksumSha256: string;
  width: number | null;
  height: number | null;
  purgeAt: Date;
}

export interface ImServerRetentionRepositoryPort {
  listDueMessages(input: { now: Date; take: number }): Promise<DueServerRetentionMessage[]>;
  purgeMessage(input: { candidate: DueServerRetentionMessage; now: Date }): Promise<boolean>;
  listDueMedia(input: { now: Date; take: number }): Promise<DueImMedia[]>;
  markMediaPurged(input: { id: number; purgeAt: Date; now: Date }): Promise<boolean>;
}

export interface ImMediaLifecycleRepositoryPort {
  registerUpload(input: RegisterImMediaUploadInput): Promise<void>;
}

export class ImServerRetentionRepository
  implements ImServerRetentionRepositoryPort, ImMediaLifecycleRepositoryPort
{
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async registerUpload(input: RegisterImMediaUploadInput): Promise<void> {
    await this.client.mediaAsset.create({
      data: {
        entityType: "im_media_upload",
        entityId: input.conversationId,
        ownerUserId: input.ownerUserId,
        ownerIdentityId: input.ownerIdentityId,
        url: input.url,
        mimeType: input.mimeType,
        usageType: "im_message",
        checksumSha256: input.checksumSha256,
        width: input.width,
        height: input.height,
        purgeAt: input.purgeAt
      },
      select: { id: true }
    });
  }

  public async listDueMessages(input: {
    now: Date;
    take: number;
  }): Promise<DueServerRetentionMessage[]> {
    const messages = await this.client.message.findMany({
      where: {
        deletedAt: null,
        expiredAt: null,
        expiresAt: { lte: input.now },
        privacyPolicyVersionAtSend: null
      },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: input.take,
      select: {
        id: true,
        conversationId: true,
        senderUserId: true,
        createdAt: true,
        expiresAt: true,
        lifecycleVersion: true
      }
    });
    return messages.flatMap((message) =>
      message.expiresAt ? [{ ...message, expiresAt: message.expiresAt }] : []
    );
  }

  public async purgeMessage(input: {
    candidate: DueServerRetentionMessage;
    now: Date;
  }): Promise<boolean> {
    return this.client.$transaction(async (transaction) => {
      const claimed = await transaction.message.updateMany({
        where: {
          id: input.candidate.id,
          conversationId: input.candidate.conversationId,
          deletedAt: null,
          expiredAt: null,
          expiresAt: input.candidate.expiresAt,
          lifecycleVersion: input.candidate.lifecycleVersion,
          privacyPolicyVersionAtSend: null,
          AND: [{ expiresAt: { lte: input.now } }]
        },
        data: {
          content: null,
          metadata: Prisma.DbNull,
          contentPurgedAt: input.now,
          expiredAt: input.now,
          lifecycleVersion: { increment: 1 }
        }
      });
      if (claimed.count !== 1) return false;

      await transaction.imMessageTranslation.deleteMany({
        where: { messageId: input.candidate.id }
      });
      await transaction.messageReaction.deleteMany({ where: { messageId: input.candidate.id } });
      await transaction.messageUserDeletion.deleteMany({
        where: { messageId: input.candidate.id }
      });

      const previous = await transaction.message.findFirst({
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
      const latestRemaining = await transaction.message.findFirst({
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
      const conversation = await transaction.conversation.findUnique({
        where: { id: input.candidate.conversationId },
        select: { createdAt: true }
      });

      if (input.candidate.senderUserId !== null) {
        await transaction.conversationParticipant.updateMany({
          where: {
            conversationId: input.candidate.conversationId,
            userId: { not: input.candidate.senderUserId },
            unreadCount: { gt: 0 },
            deletedAt: null,
            OR: [
              { lastReadMessageId: null },
              { lastReadMessageId: { lt: input.candidate.id } }
            ]
          },
          data: { unreadCount: { decrement: 1 } }
        });
      }
      await transaction.conversationParticipant.updateMany({
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
      await transaction.conversation.update({
        where: { id: input.candidate.conversationId },
        data: {
          updatedAt:
            latestRemaining?.createdAt ?? conversation?.createdAt ?? input.candidate.createdAt
        }
      });
      await transaction.auditLog.create({
        data: {
          actorId: null,
          action: "im.message.server_retention_expired",
          targetType: "Message",
          targetId: input.candidate.id,
          ip: null,
          userAgent: null,
          metadata: {
            reason: "SERVER_RETENTION_EXPIRED",
            conversationId: input.candidate.conversationId,
            expiresAt: input.candidate.expiresAt.toISOString()
          },
          createdAt: input.now
        }
      });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  public async listDueMedia(input: { now: Date; take: number }): Promise<DueImMedia[]> {
    const rows = await this.client.mediaAsset.findMany({
      where: {
        entityType: { in: ["im_media_upload", "message"] },
        usageType: "im_message",
        isActive: true,
        deletedAt: null,
        purgedAt: null,
        purgeAt: { lte: input.now }
      },
      orderBy: [{ purgeAt: "asc" }, { id: "asc" }],
      take: input.take,
      select: { id: true, url: true, purgeAt: true }
    });
    return rows.flatMap((row) => (row.purgeAt ? [{ ...row, purgeAt: row.purgeAt }] : []));
  }

  public async markMediaPurged(input: {
    id: number;
    purgeAt: Date;
    now: Date;
  }): Promise<boolean> {
    const result = await this.client.mediaAsset.updateMany({
      where: {
        id: input.id,
        purgeAt: input.purgeAt,
        purgedAt: null,
        deletedAt: null
      },
      data: { purgedAt: input.now, isActive: false }
    });
    return result.count === 1;
  }
}
