import { MessageType } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import {
  serializeContactCardSnapshotV2,
  type ImContactCardV2
} from "../domain/im-contact-card";
import { resolveEffectiveCustomerMembershipLevel } from "../services/customer-membership.service";
import {
  imMessageInclude,
  persistImMessageInTransaction
} from "./im-message-send.transaction";

export interface PersistImContactCardInput {
  conversationId: number;
  senderUserId: number;
  senderIdentityId: number;
  targetUserPublicId: string;
  idempotencyKey: string;
  requestFingerprint?: string;
  transactionNow: Date;
}

export type ImContactCardMessageRecord = Prisma.MessageGetPayload<{
  include: typeof imMessageInclude;
}>;

export type PersistImContactCardOutcome =
  | { status: "created"; message: ImContactCardMessageRecord }
  | { status: "replayed"; message: ImContactCardMessageRecord }
  | { status: "target_not_found" }
  | { status: "target_not_allowed" }
  | { status: "idempotency_conflict" }
  | { status: "not_found" }
  | { status: "recipient_blocked" }
  | { status: "not_friends" };

export async function persistImContactCardInTransaction(
  tx: Prisma.TransactionClient,
  input: PersistImContactCardInput
): Promise<PersistImContactCardOutcome> {
  const requestFingerprint = input.requestFingerprint ?? contactCardRequestFingerprint(input);
  const replay = await tx.imContactCardSendCommand.findUnique({
    where: {
      actorIdentityId_idempotencyKey: {
        actorIdentityId: input.senderIdentityId,
        idempotencyKey: input.idempotencyKey
      }
    },
    include: { message: { include: imMessageInclude } }
  });
  if (replay) {
    return replay.requestFingerprint === requestFingerprint
      ? { status: "replayed", message: replay.message }
      : { status: "idempotency_conflict" };
  }

  const target = await tx.user.findFirst({
    where: {
      needoId: input.targetUserPublicId,
      isActive: true,
      deletedAt: null
    },
    select: {
      id: true,
      needoId: true,
      username: true,
      avatarUrl: true,
      identities: {
        where: { isActive: true, deletedAt: null },
        select: { id: true, type: true },
        orderBy: [{ isDefault: "desc" }, { id: "asc" }]
      },
      customerProfile: {
        select: {
          bio: true,
          isPublic: true,
          visibility: true,
          deletedAt: true,
          membershipLevel: true,
          membershipGrantMode: true,
          membershipStartsAt: true,
          membershipExpiresAt: true
        }
      },
      ekycVerifications: {
        where: {
          status: "verified",
          verifiedAt: { not: null },
          deletedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: input.transactionNow } }]
        },
        select: { id: true },
        take: 1
      }
    }
  });
  if (!target) return { status: "target_not_found" };

  if (target.id !== input.senderUserId) {
    const reciprocalFriend = await tx.contact.findFirst({
      where: {
        ownerIdentityId: input.senderIdentityId,
        contactUserId: target.id,
        blockedAt: null,
        deletedAt: null,
        contactIdentity: {
          isActive: true,
          deletedAt: null,
          ownedContacts: {
            some: {
              contactIdentityId: input.senderIdentityId,
              blockedAt: null,
              deletedAt: null
            }
          }
        }
      },
      select: { id: true }
    });
    if (!reciprocalFriend) return { status: "target_not_allowed" };
  }

  const customerProfile = target.customerProfile?.deletedAt === null
    ? target.customerProfile
    : null;
  const hasCustomerIdentity = target.identities.some((identity) => identity.type === "customer");
  const entityKind = customerProfile || hasCustomerIdentity
    ? "customer"
    : target.identities.some((identity) => identity.type === "technician")
      ? "technician"
      : target.identities.some((identity) =>
          identity.type === "merchant" || identity.type === "merchant_owner" ||
          identity.type === "merchant_organization"
        )
        ? "shop"
        : "service";
  const experience = entityKind === "customer"
    ? await tx.userExperienceAccount.upsert({
        where: { userId: target.id },
        create: {
          userId: target.id,
          currentLevel: 1,
          totalExpUnits: 0n,
          lockVersion: 1
        },
        update: {},
        select: { currentLevel: true }
      })
    : null;
  const tierCode = customerProfile
    ? normalizeTierCode(resolveEffectiveCustomerMembershipLevel(customerProfile, input.transactionNow))
    : null;
  const contactCard: ImContactCardV2 = {
    targetUserPublicId: target.needoId,
    needoId: target.needoId,
    nickname: target.username,
    avatarUrl: target.avatarUrl,
    entityKind,
    ekycVerified: target.ekycVerifications.length > 0,
    level: experience?.currentLevel ?? null,
    bio: customerProfile?.isPublic && customerProfile.visibility === "public"
      ? boundedBio(customerProfile.bio)
      : null,
    tierCode,
    themeVersionPublicId: null,
    simpleTopColor: null,
    simpleBottomColor: null
  };
  const metadata = serializeContactCardSnapshotV2(contactCard);
  const messageOutcome = await persistImMessageInTransaction(tx, {
    conversationId: input.conversationId,
    senderUserId: input.senderUserId,
    senderIdentityId: input.senderIdentityId,
    type: MessageType.TEXT,
    content: target.username,
    metadata,
    transactionNow: input.transactionNow
  });
  if (messageOutcome.status !== "created") return messageOutcome;

  await tx.imContactCardSendCommand.create({
    data: {
      conversationId: input.conversationId,
      actorUserId: input.senderUserId,
      actorIdentityId: input.senderIdentityId,
      targetUserId: target.id,
      messageId: messageOutcome.message.id,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint
    }
  });
  return { status: "created", message: messageOutcome.message };
}

export function contactCardRequestFingerprint(input: {
  conversationId: number;
  targetUserPublicId: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify({
      conversationId: input.conversationId,
      targetUserPublicId: input.targetUserPublicId
    }))
    .digest("hex");
}

function normalizeTierCode(value: string): ImContactCardV2["tierCode"] {
  const normalized = value.trim().toLowerCase();
  if (normalized === "standard" || normalized === "free") return "free";
  if (normalized === "silver") return "silver";
  if (normalized === "gold") return "gold";
  if (normalized === "black" || normalized === "black_diamond") return "black_diamond";
  return null;
}

function boundedBio(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 500);
}
