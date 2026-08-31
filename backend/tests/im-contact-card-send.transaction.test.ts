import { ConversationType, MessageType } from "@prisma/client";
import { describe, expect, it, jest } from "@jest/globals";
import {
  contactCardRequestFingerprint,
  persistImContactCardInTransaction
} from "../src/repositories/im-contact-card-send.transaction";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

const transactionNow = new Date("2026-09-01T03:00:00.000Z");

const targetCustomer = {
  id: 52,
  needoId: "u0000000052",
  username: "佐藤花子",
  avatarUrl: "/media/sato.jpg",
  identities: [{ id: 520, type: "customer" }],
  customerProfile: {
    bio: "公開プロフィール",
    isPublic: true,
    visibility: "public",
    deletedAt: null,
    membershipLevel: "gold",
    membershipGrantMode: "SELF_SERVICE",
    membershipStartsAt: null,
    membershipExpiresAt: null
  },
  ekycVerifications: [{ id: 9 }]
};

function createdMessage(metadata: unknown) {
  return {
    id: 801,
    conversationId: 91,
    senderUserId: 41,
    senderIdentityId: 410,
    type: MessageType.TEXT,
    content: "佐藤花子",
    metadata,
    expiresAt: null,
    createdAt: transactionNow,
    recallDeadlineAt: new Date(transactionNow.getTime() + 180_000),
    recalledAt: null,
    recallMode: null,
    contentPurgedAt: null,
    privacyPolicyVersionAtSend: null,
    lifecycleVersion: 7,
    reactionVersion: 0,
    reactions: []
  };
}

function createTransaction(input: {
  target?: typeof targetCustomer | null;
  reciprocalFriend?: boolean;
  replay?: null | { requestFingerprint: string; message: ReturnType<typeof createdMessage> };
} = {}) {
  let storedMetadata: unknown;
  const tx = {
    imContactCardSendCommand: {
      findUnique: jest.fn(async () => input.replay ?? null),
      create: jest.fn(async () => ({ id: 1 }))
    },
    user: {
      findFirst: jest.fn(async () => input.target === undefined ? targetCustomer : input.target)
    },
    contact: {
      findFirst: jest.fn(async () => input.reciprocalFriend === false ? null : ({ id: 1 }))
    },
    userExperienceAccount: {
      upsert: jest.fn(async () => ({ currentLevel: 38 }))
    },
    conversationParticipant: {
      findFirst: jest.fn(async () => ({
        id: 1,
        conversation: {
          type: ConversationType.GROUP,
          accessPolicy: "BUSINESS_CONTEXT",
          privacyModeEnabled: false,
          disappearingTtlSeconds: null,
          privacyPolicyVersion: 1,
          participants: [
            { userId: 41, identityId: 410, identity: { ownedContacts: [] } },
            { userId: 67, identityId: 670, identity: { ownedContacts: [] } }
          ]
        }
      })),
      updateMany: jest.fn(async () => ({ count: 1 }))
    },
    imPolicy: {
      findFirst: jest.fn(async () => ({
        textRetentionSeconds: 3600,
        recallWindowSeconds: 180,
        version: 7
      }))
    },
    message: {
      create: jest.fn(async (args: { data: { metadata: unknown } }) => {
        storedMetadata = structuredClone(args.data.metadata);
        return createdMessage(storedMetadata);
      })
    },
    conversation: { update: jest.fn(async () => ({ id: 91 })) }
  };
  return { tx, storedMetadata: () => storedMetadata };
}

const command = {
  conversationId: 91,
  senderUserId: 41,
  senderIdentityId: 410,
  targetUserPublicId: "u0000000052",
  idempotencyKey: "contact-card-send-1",
  transactionNow
};

describe("persistImContactCardInTransaction", () => {
  it("uses authoritative profile, eKYC, level and tier data in an immutable V2 message snapshot", async () => {
    const { tx, storedMetadata } = createTransaction();

    await expect(persistImContactCardInTransaction(tx as never, command)).resolves.toMatchObject({
      status: "created",
      message: { id: 801 }
    });
    expect(storedMetadata()).toEqual({
      snapshotVersion: 2,
      type: "contact-card",
      contactCard: {
        targetUserPublicId: "u0000000052",
        needoId: "u0000000052",
        nickname: "佐藤花子",
        avatarUrl: "/media/sato.jpg",
        entityKind: "customer",
        ekycVerified: true,
        level: 38,
        bio: "公開プロフィール",
        tierCode: "gold",
        themeVersionPublicId: null,
        simpleTopColor: null,
        simpleBottomColor: null
      }
    });
    expect(tx.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { needoId: "u0000000052", isActive: true, deletedAt: null }
    }));
    expect(tx.userExperienceAccount.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 52 },
      create: expect.objectContaining({ userId: 52, currentLevel: 1, totalExpUnits: 0n })
    }));
  });

  it("rejects a nonfriend target without creating a message", async () => {
    const { tx } = createTransaction({ reciprocalFriend: false });

    await expect(persistImContactCardInTransaction(tx as never, command))
      .resolves.toEqual({ status: "target_not_allowed" });
    expect(tx.message.create).not.toHaveBeenCalled();
    expect(tx.imContactCardSendCommand.create).not.toHaveBeenCalled();
  });

  it("allows self without a friendship lookup", async () => {
    const selfTarget = {
      ...targetCustomer,
      id: 41,
      needoId: "u0000000041",
      username: "山田太郎"
    };
    const { tx } = createTransaction({ target: selfTarget });

    await expect(persistImContactCardInTransaction(tx as never, {
      ...command,
      targetUserPublicId: "u0000000041"
    })).resolves.toMatchObject({ status: "created" });
    expect(tx.contact.findFirst).not.toHaveBeenCalled();
  });

  it("never creates or displays a level for a technician-only target", async () => {
    const technician = {
      ...targetCustomer,
      identities: [{ id: 520, type: "technician" }],
      customerProfile: null,
      ekycVerifications: []
    };
    const { tx, storedMetadata } = createTransaction({ target: technician as never });

    await expect(persistImContactCardInTransaction(tx as never, command))
      .resolves.toMatchObject({ status: "created" });
    expect(tx.userExperienceAccount.upsert).not.toHaveBeenCalled();
    expect(storedMetadata()).toMatchObject({
      contactCard: {
        entityKind: "technician",
        ekycVerified: false,
        level: null,
        tierCode: null
      }
    });
  });

  it("replays the existing message for the same command without another profile or message write", async () => {
    const requestFingerprint = "b".repeat(64);
    const replayedMessage = createdMessage({ snapshotVersion: 2 });
    const { tx } = createTransaction({ replay: { requestFingerprint, message: replayedMessage } });

    await expect(persistImContactCardInTransaction(tx as never, {
      ...command,
      requestFingerprint
    })).resolves.toEqual({ status: "replayed", message: replayedMessage });
    expect(tx.user.findFirst).not.toHaveBeenCalled();
    expect(tx.message.create).not.toHaveBeenCalled();
  });

  it("rejects reusing an idempotency key for a different target", async () => {
    const { tx } = createTransaction({
      replay: {
        requestFingerprint: "a".repeat(64),
        message: createdMessage({ snapshotVersion: 2 })
      }
    });

    await expect(persistImContactCardInTransaction(tx as never, {
      ...command,
      requestFingerprint: "b".repeat(64)
    })).resolves.toEqual({ status: "idempotency_conflict" });
  });
});

describe("RealtimeRepository concurrent contact-card commands", () => {
  it("replays the winning command after a concurrent unique-key race", async () => {
    const requestFingerprint = contactCardRequestFingerprint(command);
    const replayedMessage = createdMessage({ snapshotVersion: 2, type: "contact-card" });
    const client = {
      $transaction: jest.fn(async () => {
        throw { code: "P2002" };
      }),
      imContactCardSendCommand: {
        findUnique: jest.fn(async () => ({ requestFingerprint, message: replayedMessage }))
      }
    };

    await expect(new RealtimeRepository(client as never).sendContactCard({
      conversationId: command.conversationId,
      senderUserId: command.senderUserId,
      senderIdentityId: command.senderIdentityId,
      targetUserPublicId: command.targetUserPublicId,
      idempotencyKey: command.idempotencyKey
    })).resolves.toMatchObject({
      status: "replayed",
      message: { id: 801, metadata: { snapshotVersion: 2, type: "contact-card" } }
    });
    expect(client.imContactCardSendCommand.findUnique).toHaveBeenCalledTimes(1);
  });
});
