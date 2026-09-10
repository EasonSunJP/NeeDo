import { ConversationType, MessageType } from "@prisma/client";
import { describe, expect, it, jest } from "@jest/globals";
import { persistImMessageInTransaction } from "../src/repositories/im-message-send.transaction";

const transactionNow = new Date("2026-08-31T09:00:00.000Z");

describe("persistImMessageInTransaction", () => {
  it("applies reciprocal-friendship authorization before any message lifecycle write", async () => {
    const tx = {
      conversationParticipant: {
        findFirst: jest.fn(async () => ({
          id: 1,
          conversation: {
            type: ConversationType.DIRECT,
            accessPolicy: "FRIENDSHIP_REQUIRED",
            privacyModeEnabled: false,
            disappearingTtlSeconds: null,
            privacyPolicyVersion: 1,
            participants: [
              { userId: 41, identityId: 71, identity: { ownedContacts: [] } },
              { userId: 52, identityId: 82, identity: { ownedContacts: [] } }
            ]
          }
        })),
        updateMany: jest.fn()
      },
      contact: { count: jest.fn(async () => 0) },
      imPolicy: { findFirst: jest.fn() },
      message: { create: jest.fn() },
      conversation: { update: jest.fn() }
    };

    await expect(
      persistImMessageInTransaction(tx as never, {
        content: "hello",
        conversationId: 91,
        metadata: null,
        senderIdentityId: 71,
        senderUserId: 41,
        transactionNow,
        type: MessageType.TEXT
      })
    ).resolves.toEqual({ status: "not_friends" });
    expect(tx.message.create).not.toHaveBeenCalled();
    expect(tx.conversation.update).not.toHaveBeenCalled();
    expect(tx.conversationParticipant.updateMany).not.toHaveBeenCalled();
  });

  it("uses one transaction clock for message expiry, recall, conversation, and unread lifecycle", async () => {
    const createdMessage = {
      id: 801,
      conversationId: 91,
      senderUserId: 41,
      senderIdentityId: 71,
      type: MessageType.TEXT,
      content: "hello",
      metadata: null,
      expiresAt: new Date(transactionNow.getTime() + 120_000),
      createdAt: transactionNow,
      recallDeadlineAt: new Date(transactionNow.getTime() + 180_000),
      recalledAt: null,
      recallMode: null,
      contentPurgedAt: null,
      privacyPolicyVersionAtSend: 4,
      lifecycleVersion: 7,
      reactionVersion: 0,
      reactions: []
    };
    const tx = {
      conversationParticipant: {
        findFirst: jest.fn(async () => ({
          id: 1,
          conversation: {
            type: ConversationType.GROUP,
            accessPolicy: "BUSINESS_CONTEXT",
            privacyModeEnabled: true,
            disappearingTtlSeconds: 120,
            privacyPolicyVersion: 4,
            participants: [
              { userId: 41, identityId: 71, identity: { ownedContacts: [] } },
              { userId: 52, identityId: 82, identity: { ownedContacts: [] } }
            ]
          }
        })),
        updateMany: jest.fn(async () => ({ count: 1 }))
      },
      contact: { count: jest.fn() },
      imPolicy: {
        findFirst: jest.fn(async () => ({
          textRetentionSeconds: 3600,
          recallWindowSeconds: 180,
          version: 7
        }))
      },
      message: { create: jest.fn(async () => createdMessage) },
      conversation: { update: jest.fn(async () => ({ id: 91 })) }
    };

    await expect(
      persistImMessageInTransaction(tx as never, {
        content: "hello",
        conversationId: 91,
        metadata: null,
        senderIdentityId: 71,
        senderUserId: 41,
        transactionNow,
        type: MessageType.TEXT
      })
    ).resolves.toMatchObject({
      status: "created",
      message: { id: 801 },
      recipients: [
        { userId: 41, identityId: 71 },
        { userId: 52, identityId: 82 }
      ]
    });
    expect(tx.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdAt: transactionNow,
        expiresAt: new Date(transactionNow.getTime() + 120_000),
        recallDeadlineAt: new Date(transactionNow.getTime() + 180_000),
        privacyPolicyVersionAtSend: 4,
        lifecycleVersion: 7
      }),
      include: expect.any(Object)
    });
    expect(tx.conversation.update).toHaveBeenCalledWith({
      where: { id: 91 },
      data: { updatedAt: transactionNow }
    });
    expect(tx.conversationParticipant.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ lastReadAt: transactionNow, updatedAt: transactionNow })
      })
    );
    expect(tx.conversationParticipant.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ updatedAt: transactionNow })
      })
    );
  });

  it("snapshots the active global retention policy without rewriting older messages", async () => {
    const createdMessage = { id: 802 };
    const tx = {
      conversationParticipant: {
        findFirst: jest.fn(async () => ({
          id: 1,
          conversation: {
            type: ConversationType.DIRECT,
            accessPolicy: "BUSINESS_CONTEXT",
            privacyModeEnabled: false,
            disappearingTtlSeconds: null,
            privacyPolicyVersion: 1,
            participants: [
              { userId: 41, identityId: 71, identity: { ownedContacts: [] } },
              { userId: 52, identityId: 82, identity: { ownedContacts: [] } }
            ]
          }
        })),
        updateMany: jest.fn()
      },
      contact: { count: jest.fn() },
      imPolicy: {
        findFirst: jest.fn(async () => ({
          textRetentionSeconds: 3_888_000,
          imageRetentionSeconds: 604_800,
          videoRetentionSeconds: 604_800,
          recallWindowSeconds: 180,
          version: 8
        }))
      },
      mediaAsset: { findFirst: jest.fn(), updateMany: jest.fn() },
      message: { create: jest.fn(async () => createdMessage) },
      conversation: { update: jest.fn() }
    };

    await persistImMessageInTransaction(tx as never, {
      content: "after update",
      conversationId: 91,
      metadata: null,
      senderIdentityId: 71,
      senderUserId: 41,
      transactionNow,
      type: MessageType.TEXT
    });

    expect(tx.message.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        expiresAt: new Date(transactionNow.getTime() + 3_888_000_000),
        lifecycleVersion: 8,
        privacyPolicyVersionAtSend: null
      })
    }));
  });

  it("binds same-conversation uploaded media to the message retention snapshot", async () => {
    const tx = {
      conversationParticipant: {
        findFirst: jest.fn(async () => ({
          id: 1,
          conversation: {
            type: ConversationType.DIRECT,
            accessPolicy: "BUSINESS_CONTEXT",
            privacyModeEnabled: false,
            disappearingTtlSeconds: null,
            privacyPolicyVersion: 1,
            participants: [
              { userId: 41, identityId: 71, identity: { ownedContacts: [] } },
              { userId: 52, identityId: 82, identity: { ownedContacts: [] } }
            ]
          }
        })),
        updateMany: jest.fn()
      },
      contact: { count: jest.fn() },
      imPolicy: {
        findFirst: jest.fn(async () => ({
          textRetentionSeconds: 2_592_000,
          imageRetentionSeconds: 604_800,
          videoRetentionSeconds: 604_800,
          recallWindowSeconds: 180,
          version: 9
        }))
      },
      mediaAsset: {
        findFirst: jest.fn(async () => ({ id: 33 })),
        updateMany: jest.fn(async () => ({ count: 1 }))
      },
      message: { create: jest.fn(async () => ({ id: 803 })) },
      conversation: { update: jest.fn() }
    };
    const url = "https://media.needo.test/media/im/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png";

    await expect(persistImMessageInTransaction(tx as never, {
      content: url,
      conversationId: 91,
      metadata: { needoMessageType: "image", needoMessageExt: { url } },
      senderIdentityId: 71,
      senderUserId: 41,
      transactionNow,
      type: MessageType.TEXT
    })).resolves.toMatchObject({ status: "created" });
    expect(tx.mediaAsset.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        entityType: "im_media_upload",
        entityId: 91,
        ownerUserId: 41,
        ownerIdentityId: 71,
        url
      })
    }));
    expect(tx.mediaAsset.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        entityType: "message",
        entityId: 803,
        purgeAt: new Date(transactionNow.getTime() + 604_800_000)
      }
    }));
  });
});
