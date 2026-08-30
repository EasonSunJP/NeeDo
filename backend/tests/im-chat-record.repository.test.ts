import { MessageType } from "@prisma/client";
import { describe, expect, it, jest } from "@jest/globals";
import { ImChatRecordRepository } from "../src/repositories/im-chat-record.repository";

const now = new Date("2026-08-31T08:00:00.000Z");
const context = { ip: "127.0.0.1", userAgent: "chat-record-repository-test" };
const bundle = {
  id: 501,
  publicId: "11111111-1111-4111-8111-111111111111",
  requestFingerprint: "a".repeat(64),
  titleSnapshot: "A",
  previewSnapshot: "A: hello",
  senderCount: 1,
  itemCount: 1,
  createdAt: now
};
const message = {
  id: 801,
  conversationId: 99,
  senderUserId: 41,
  senderIdentityId: 71,
  type: MessageType.TEXT,
  content: "A",
  metadata: { needoMessageType: "chat-record" },
  expiresAt: null,
  createdAt: now,
  recallDeadlineAt: new Date(now.getTime() + 180_000),
  recalledAt: null,
  recallMode: null,
  contentPurgedAt: null,
  privacyPolicyVersionAtSend: null,
  lifecycleVersion: 1,
  reactionVersion: 0
};

const deliveryInput = () => ({
  commandType: "delivery" as const,
  idempotencyKey: "delivery-key",
  requestFingerprint: "a".repeat(64),
  publicId: bundle.publicId,
  createdByUserId: 41,
  createdByIdentityId: 71,
  sourceConversationId: 91,
  targetConversationId: 99,
  senderNamesSnapshot: ["A"],
  titleKind: "single" as const,
  titleSnapshot: "A",
  previewSnapshot: "A: hello",
  items: [
    {
      position: 1,
      sourceMessageId: 11,
      senderUserId: 41,
      senderIdentityId: 71,
      senderDisplayNameSnapshot: "A",
      senderAvatarSnapshot: null,
      messageType: "text",
      contentSnapshot: "hello",
      metadataSnapshot: null,
      sentAtSnapshot: now,
      media: null
    }
  ],
  context,
  now
});

describe("ImChatRecordRepository", () => {
  it("creates bundle, immutable items, message, delivery, unread state, and audit in one transaction", async () => {
    const tx = {
      imChatRecordBundle: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => bundle)
      },
      imChatRecordItem: { create: jest.fn(async () => ({ id: 701 })) },
      mediaAsset: { create: jest.fn() },
      conversationParticipant: {
        findFirst: jest.fn(async ({ where }) =>
          where.conversationId === 91
            ? { createdAt: new Date("2026-08-31T07:00:00.000Z"), clearedThroughMessageId: null }
            : {
                conversation: {
                  type: "DIRECT",
                  accessPolicy: "BUSINESS_CONTEXT",
                  privacyModeEnabled: false,
                  disappearingTtlSeconds: null,
                  privacyPolicyVersion: 0,
                  participants: [
                    { userId: 41, identityId: 71, identity: { ownedContacts: [] } },
                    { userId: 52, identityId: 82, identity: { ownedContacts: [] } }
                  ]
                }
              }
        ),
        updateMany: jest.fn(async () => ({ count: 1 }))
      },
      contact: { count: jest.fn(async () => 2) },
      imPolicy: {
        findFirst: jest.fn(async () => ({
          textRetentionSeconds: null,
          recallWindowSeconds: 180,
          version: 1
        }))
      },
      message: { count: jest.fn(async () => 1), create: jest.fn(async () => message) },
      imChatRecordDelivery: { create: jest.fn(async () => ({ id: 901 })) },
      conversation: { update: jest.fn(async () => ({ id: 99 })) },
      auditLog: { create: jest.fn(async () => ({ id: 1001 })) }
    };
    const client = {
      $transaction: jest.fn(async (operation: (value: typeof tx) => unknown) => operation(tx))
    };
    const repository = new ImChatRecordRepository(client as never);

    await expect(repository.createDelivery(deliveryInput())).resolves.toMatchObject({
      replayed: false,
      bundle: { id: 501 },
      message: { id: 801 },
      recipients: [
        { userId: 41, identityId: 71 },
        { userId: 52, identityId: 82 }
      ]
    });

    expect(tx.imChatRecordBundle.create).toHaveBeenCalledTimes(1);
    expect(tx.imChatRecordItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ bundleId: 501, position: 1, sourceMessageId: 11 })
    });
    expect(tx.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: 99,
        senderUserId: 41,
        senderIdentityId: 71,
        metadata: expect.objectContaining({ needoMessageType: "chat-record" })
      })
    });
    expect(tx.imChatRecordDelivery.create).toHaveBeenCalledWith({
      data: { bundleId: 501, conversationId: 99, messageId: 801 }
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 41,
        action: "im.chat_record.delivered",
        targetType: "ImChatRecordBundle",
        targetId: 501,
        ip: context.ip,
        userAgent: context.userAgent
      })
    });
  });

  it("returns the exact idempotent delivery replay and rejects a changed payload", async () => {
    const replay = {
      ...bundle,
      deliveries: [{ message, conversation: { participants: [{ userId: 41, identityId: 71 }] } }]
    };
    const tx = {
      imChatRecordBundle: { findUnique: jest.fn(async () => replay) }
    };
    const client = {
      $transaction: jest.fn(async (operation: (value: typeof tx) => unknown) => operation(tx))
    };
    const repository = new ImChatRecordRepository(client as never);

    await expect(repository.createDelivery(deliveryInput())).resolves.toMatchObject({
      replayed: true,
      bundle: { id: 501 },
      message: { id: 801 }
    });
    await expect(
      repository.createDelivery({ ...deliveryInput(), requestFingerprint: "b".repeat(64) })
    ).rejects.toMatchObject({ message: "error.idempotency_key_reused", statusCode: 409 });
  });

  it("recovers the winning exact replay after a concurrent unique-key race", async () => {
    const replay = {
      ...bundle,
      createdByIdentityId: 71,
      deliveries: [
        {
          message,
          conversation: { participants: [{ userId: 41, identityId: 71 }] }
        }
      ],
      favorites: []
    };
    const uniqueConflict = Object.assign(new Error("unique conflict"), { code: "P2002" });
    const client = {
      $transaction: jest.fn(async () => {
        throw uniqueConflict;
      }),
      imChatRecordBundle: { findUnique: jest.fn(async () => replay) }
    };
    const repository = new ImChatRecordRepository(client as never);

    await expect(repository.createDelivery(deliveryInput())).resolves.toMatchObject({
      replayed: true,
      bundle: { id: 501 },
      message: { id: 801 }
    });
    expect(client.imChatRecordBundle.findUnique).toHaveBeenCalledTimes(1);
  });

  it("lets the Prisma transaction reject atomically without retrying partial writes", async () => {
    const client = {
      $transaction: jest.fn(async () => {
        throw new Error("item insert failed");
      })
    };
    const repository = new ImChatRecordRepository(client as never);

    await expect(repository.createDelivery(deliveryInput())).rejects.toThrow("item insert failed");
    expect(client.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rechecks every source message inside the transaction before creating a bundle", async () => {
    const bundleCreate = jest.fn();
    const tx = {
      imChatRecordBundle: { findUnique: jest.fn(async () => null), create: bundleCreate },
      conversationParticipant: {
        findFirst: jest.fn(async () => ({
          createdAt: new Date("2026-08-31T07:00:00.000Z"),
          clearedThroughMessageId: null
        }))
      },
      message: { count: jest.fn(async () => 0) }
    };
    const client = {
      $transaction: jest.fn(async (operation: (value: typeof tx) => unknown) => operation(tx))
    };
    const repository = new ImChatRecordRepository(client as never);

    await expect(repository.createDelivery(deliveryInput())).rejects.toMatchObject({
      message: "error.im.chat_record_source_unavailable",
      statusCode: 409
    });
    expect(bundleCreate).not.toHaveBeenCalled();
  });

  it("creates a favorite and item-owned media asset in the same transaction", async () => {
    const favoriteInput = {
      ...deliveryInput(),
      commandType: "favorite" as const,
      items: [
        {
          ...deliveryInput().items[0]!,
          metadataSnapshot: {
            media: {
              checksumSha256: "c".repeat(64),
              mimeType: "image/png",
              size: 16,
              url: `/media/im-chat-record/${"c".repeat(64)}.png`
            }
          },
          media: {
            checksumSha256: "c".repeat(64),
            mimeType: "image/png",
            size: 16,
            url: `/media/im-chat-record/${"c".repeat(64)}.png`
          }
        }
      ]
    };
    const tx = {
      imChatRecordBundle: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => bundle)
      },
      conversationParticipant: {
        findFirst: jest.fn(async () => ({
          createdAt: new Date("2026-08-31T07:00:00.000Z"),
          clearedThroughMessageId: null
        }))
      },
      message: { count: jest.fn(async () => 1) },
      imChatRecordItem: { create: jest.fn(async () => ({ id: 701 })) },
      mediaAsset: { create: jest.fn(async () => ({ id: 702 })) },
      imChatRecordFavorite: {
        create: jest.fn(async () => ({ id: 601, createdAt: now }))
      },
      auditLog: { create: jest.fn(async () => ({ id: 1001 })) }
    };
    const client = {
      $transaction: jest.fn(async (operation: (value: typeof tx) => unknown) => operation(tx))
    };
    const repository = new ImChatRecordRepository(client as never);

    await expect(repository.createFavorite(favoriteInput)).resolves.toMatchObject({
      replayed: false,
      favorite: { id: 601, bundlePublicId: bundle.publicId }
    });
    expect(tx.mediaAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "im_chat_record_item",
        entityId: 701,
        usageType: "im_chat_record",
        ownerUserId: 41,
        ownerIdentityId: 71,
        checksumSha256: "c".repeat(64)
      })
    });
    expect(tx.imChatRecordFavorite.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ bundleId: 501, ownerUserId: 41, ownerIdentityId: 71 })
    });
  });

  it("keeps unauthorized bundle reads indistinguishable from missing bundles", async () => {
    const findFirst = jest.fn(async () => null);
    const repository = new ImChatRecordRepository({
      imChatRecordBundle: { findFirst }
    } as never);

    await expect(
      repository.getBundle({ publicId: bundle.publicId, userId: 41, identityId: 71 })
    ).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publicId: bundle.publicId,
          deletedAt: null,
          OR: expect.arrayContaining([
            { createdByIdentityId: 71 },
            { favorites: { some: { ownerIdentityId: 71, deletedAt: null } } },
            expect.objectContaining({ deliveries: expect.any(Object) })
          ])
        })
      })
    );
  });
});
