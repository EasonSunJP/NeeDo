import { createHash } from "node:crypto";
import { describe, expect, it, jest } from "@jest/globals";
import type {
  ChatRecordSourceMessage,
  ImChatRecordRepositoryPort
} from "../src/repositories/im-chat-record.repository";
import type { AuthRequestContext, AuthenticatedAccessContext } from "../src/services/auth.service";
import type { ImChatRecordMediaStoragePort } from "../src/services/im-chat-record-media.storage";
import { ImChatRecordService } from "../src/services/im-chat-record.service";

const now = new Date("2026-08-31T08:00:00.000Z");
const context: AuthRequestContext = { ip: "127.0.0.1", userAgent: "chat-record-test" };
const auth = {
  userId: 41,
  currentIdentityId: 71,
  currentIdentityType: "customer"
} as AuthenticatedAccessContext;

const sourceMessage = (
  id: number,
  senderDisplayName: string,
  overrides: Partial<ChatRecordSourceMessage> = {}
): ChatRecordSourceMessage => ({
  id,
  conversationId: 91,
  senderUserId: id + 100,
  senderIdentityId: id + 200,
  senderDisplayName,
  senderAvatarUrl: null,
  messageType: "text",
  content: `message ${id}`,
  metadata: null,
  sentAt: new Date(now.getTime() + id * 1_000),
  recalledAt: null,
  expiredAt: null,
  expiresAt: null,
  contentPurgedAt: null,
  deletedAt: null,
  hiddenForViewer: false,
  disappearing: false,
  ...overrides
});

const titleCases: ReadonlyArray<readonly [readonly string[], "single" | "pair" | "group"]> = [
  [["A"], "single"],
  [["A", "B"], "pair"],
  [["A", "B", "C"], "group"]
];

const repositoryFixture = (): jest.Mocked<ImChatRecordRepositoryPort> => ({
  readSourceMessages: jest.fn(async () => []),
  createDelivery: jest.fn(async (input) => ({
    replayed: false,
    bundle: {
      id: 501,
      publicId: input.publicId,
      title: input.titleSnapshot,
      preview: input.previewSnapshot,
      senderCount: input.senderNamesSnapshot.length,
      itemCount: input.items.length,
      createdAt: now
    },
    message: {
      id: 801,
      conversationId: input.targetConversationId,
      senderUserId: input.createdByUserId,
      type: "text",
      content: input.titleSnapshot,
      metadata: { needoMessageType: "chat-record" },
      reactions: [],
      expiresAt: null,
      createdAt: now,
      recallDeadlineAt: new Date(now.getTime() + 180_000),
      recalledAt: null,
      recallMode: null,
      contentPurgedAt: null,
      privacyPolicyVersionAtSend: null,
      lifecycleVersion: 1,
      reactionVersion: 0,
      availableRecallModes: ["standard"]
    },
    recipients: [{ userId: 41, identityId: 71 }]
  })),
  createFavorite: jest.fn(async (input) => ({
    replayed: false,
    favorite: {
      id: 601,
      bundlePublicId: input.publicId,
      title: input.titleSnapshot,
      preview: input.previewSnapshot,
      senderCount: input.senderNamesSnapshot.length,
      itemCount: input.items.length,
      createdAt: now
    }
  })),
  getBundle: jest.fn(async () => null),
  listItems: jest.fn(async () => ({ list: [], nextCursor: null })),
  listFavorites: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
  removeFavorite: jest.fn(async () => false),
  resolveAuthorizedMedia: jest.fn(async () => null)
});

const createFixture = () => {
  const repository = repositoryFixture();
  const identityScope = {
    resolve: jest.fn(async () => ({
      identityId: 71,
      userId: 41,
      identityType: "customer",
      scopeType: null,
      scopeId: null
    }))
  };
  const mediaStorage: jest.Mocked<ImChatRecordMediaStoragePort> = {
    clone: jest.fn(async () => ({
      created: true,
      fileKey: `${"a".repeat(64)}/11111111-1111-4111-8111-111111111111/${"a".repeat(64)}.png`,
      mimeType: "image/png",
      size: 16,
      checksumSha256: "a".repeat(64)
    })),
    delete: jest.fn(async () => undefined),
    read: jest.fn(async (checksumSha256, mimeType) => ({
      bytes: Buffer.from("protected-media"),
      checksumSha256,
      mimeType,
      size: 15
    }))
  };
  const eventGateway = {
    publish: jest.fn(),
    subscribe: jest.fn(async () => () => undefined)
  };
  const warn = jest.fn();
  const service = new ImChatRecordService(repository, identityScope, mediaStorage, eventGateway, {
    now: () => now,
    createPublicId: () => "11111111-1111-4111-8111-111111111111",
    warn
  });
  return { repository, identityScope, mediaStorage, eventGateway, warn, service };
};

describe("ImChatRecordService", () => {
  it.each(titleCases)("derives %s sender title kind", async (names, titleKind) => {
    const fixture = createFixture();
    fixture.repository.readSourceMessages.mockResolvedValue(
      names.map((name, index) => sourceMessage(index + 1, name))
    );

    await fixture.service.createFavorite(auth, context, {
      idempotencyKey: `favorite-${names.length}`,
      messageIds: names.map((_, index) => index + 1),
      sourceConversationId: 91
    });

    expect(fixture.repository.createFavorite).toHaveBeenCalledWith(
      expect.objectContaining({ titleKind, senderNamesSnapshot: names })
    );
  });

  it("sorts authoritative time/id order, deduplicates requested IDs, and builds two preview lines", async () => {
    const fixture = createFixture();
    fixture.repository.readSourceMessages.mockResolvedValue([
      sourceMessage(30, "B", { sentAt: new Date("2026-08-31T08:02:00.000Z") }),
      sourceMessage(20, "A", {
        senderIdentityId: 210,
        senderUserId: 110,
        sentAt: new Date("2026-08-31T08:01:00.000Z")
      }),
      sourceMessage(10, "A", { sentAt: new Date("2026-08-31T08:01:00.000Z") })
    ]);

    await fixture.service.createFavorite(auth, context, {
      idempotencyKey: "ordered",
      messageIds: [30, 10, 20, 10],
      sourceConversationId: 91
    });

    expect(fixture.repository.readSourceMessages).toHaveBeenCalledWith({
      conversationId: 91,
      identityId: 71,
      messageIds: [10, 20, 30],
      now
    });
    expect(fixture.repository.createFavorite).toHaveBeenCalledWith(
      expect.objectContaining({
        senderNamesSnapshot: ["A", "B"],
        previewSnapshot: "A: message 10\nA: message 20",
        items: [
          expect.objectContaining({ position: 1, sourceMessageId: 10 }),
          expect.objectContaining({ position: 2, sourceMessageId: 20 }),
          expect.objectContaining({ position: 3, sourceMessageId: 30 })
        ]
      })
    );
  });

  it("deduplicates senders by identity instead of display name and preserves the first name snapshot", async () => {
    const fixture = createFixture();
    fixture.repository.readSourceMessages.mockResolvedValue([
      sourceMessage(1, "同名", { senderIdentityId: 501, senderUserId: 101 }),
      sourceMessage(2, "同名", { senderIdentityId: 502, senderUserId: 102 }),
      sourceMessage(3, "后来改名", { senderIdentityId: 501, senderUserId: 101 })
    ]);

    await fixture.service.createFavorite(auth, context, {
      idempotencyKey: "same-display-name",
      messageIds: [1, 2, 3],
      sourceConversationId: 91
    });

    expect(fixture.repository.createFavorite).toHaveBeenCalledWith(
      expect.objectContaining({
        senderNamesSnapshot: ["同名", "同名"],
        titleKind: "pair"
      })
    );
  });

  it("falls back to sender user ID when the source identity snapshot is absent", async () => {
    const fixture = createFixture();
    fixture.repository.readSourceMessages.mockResolvedValue([
      sourceMessage(1, "最初の名前", { senderIdentityId: null, senderUserId: 101 }),
      sourceMessage(2, "後の名前", { senderIdentityId: null, senderUserId: 101 })
    ]);

    await fixture.service.createFavorite(auth, context, {
      idempotencyKey: "sender-user-fallback",
      messageIds: [1, 2],
      sourceConversationId: 91
    });

    expect(fixture.repository.createFavorite).toHaveBeenCalledWith(
      expect.objectContaining({
        senderNamesSnapshot: ["最初の名前"],
        titleKind: "single"
      })
    );
  });

  it("rejects the entire command when any source message is recalled, expired, hidden, or disappearing", async () => {
    const cases: Array<Partial<ChatRecordSourceMessage>> = [
      { recalledAt: now },
      { expiredAt: now },
      { expiresAt: now },
      { hiddenForViewer: true },
      { disappearing: true },
      { contentPurgedAt: now },
      { deletedAt: now }
    ];

    for (const unavailable of cases) {
      const fixture = createFixture();
      fixture.repository.readSourceMessages.mockResolvedValue([
        sourceMessage(1, "A"),
        sourceMessage(2, "B", unavailable)
      ]);

      await expect(
        fixture.service.createFavorite(auth, context, {
          idempotencyKey: "unavailable",
          messageIds: [1, 2],
          sourceConversationId: 91
        })
      ).rejects.toMatchObject({ message: "error.im.chat_record_source_unavailable" });
      expect(fixture.repository.createFavorite).not.toHaveBeenCalled();
    }
  });

  it("rejects incomplete source reads and commands outside the 1-100 item boundary", async () => {
    const incomplete = createFixture();
    incomplete.repository.readSourceMessages.mockResolvedValue([sourceMessage(1, "A")]);
    await expect(
      incomplete.service.createFavorite(auth, context, {
        idempotencyKey: "incomplete",
        messageIds: [1, 2],
        sourceConversationId: 91
      })
    ).rejects.toMatchObject({ message: "error.im.chat_record_source_unavailable" });

    const invalid = createFixture();
    await expect(
      invalid.service.createFavorite(auth, context, {
        idempotencyKey: "empty",
        messageIds: [],
        sourceConversationId: 91
      })
    ).rejects.toMatchObject({ message: "error.im.chat_record_item_count_invalid" });
    await expect(
      invalid.service.createFavorite(auth, context, {
        idempotencyKey: "too-many",
        messageIds: Array.from({ length: 101 }, (_, index) => index + 1),
        sourceConversationId: 91
      })
    ).rejects.toMatchObject({ message: "error.im.chat_record_item_count_invalid" });
    expect(invalid.repository.readSourceMessages).not.toHaveBeenCalled();
  });

  it.each([
    ["system", null],
    ["orderStatus", null],
    ["text", { needoMessageType: "video", needoMessageExt: {} }],
    ["text", { needoMessageType: "file", needoMessageExt: {} }],
    ["text", { needoMessageType: "chat-record", needoMessageExt: {} }],
    ["text", { needoMessageType: "system" }],
    ["text", { needoMessageType: "unknown" }]
  ])("rejects disallowed source type %s", async (messageType, metadata) => {
    const fixture = createFixture();
    fixture.repository.readSourceMessages.mockResolvedValue([
      sourceMessage(1, "A", { messageType, metadata })
    ]);

    await expect(
      fixture.service.createFavorite(auth, context, {
        idempotencyKey: `disallowed-${messageType}`,
        messageIds: [1],
        sourceConversationId: 91
      })
    ).rejects.toMatchObject({ message: "error.im.chat_record_source_unavailable" });
    expect(fixture.repository.createFavorite).not.toHaveBeenCalled();
  });

  it.each([
    { needoMessageType: "image", needoMessageExt: { mimeType: "image/png", url: "/media/im/a" } },
    {
      needoMessageType: "image",
      needoMessageExt: { fileSize: 16, mimeType: "audio/ogg", url: "/media/im/a" }
    },
    {
      needoMessageType: "voice",
      needoMessageExt: { fileSize: 16, mimeType: "audio/ogg" }
    }
  ])("rejects a malformed media-bearing source descriptor", async (metadata) => {
    const fixture = createFixture();
    fixture.repository.readSourceMessages.mockResolvedValue([
      sourceMessage(1, "A", { messageType: "text", metadata })
    ]);

    await expect(
      fixture.service.createFavorite(auth, context, {
        idempotencyKey: "malformed-media",
        messageIds: [1],
        sourceConversationId: 91
      })
    ).rejects.toMatchObject({ message: "error.im.chat_record_source_unavailable" });
    expect(fixture.mediaStorage.clone).not.toHaveBeenCalled();
    expect(fixture.repository.createFavorite).not.toHaveBeenCalled();
  });

  it("calculates a stable SHA-256 request fingerprint from the normalized command", async () => {
    const fixture = createFixture();
    fixture.repository.readSourceMessages.mockResolvedValue([
      sourceMessage(1, "A"),
      sourceMessage(2, "B")
    ]);

    await fixture.service.createFavorite(auth, context, {
      idempotencyKey: "fingerprint",
      messageIds: [2, 1, 2],
      sourceConversationId: 91
    });

    const input = fixture.repository.createFavorite.mock.calls[0]?.[0];
    expect(input?.requestFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(input?.requestFingerprint).toBe(
      createHash("sha256")
        .update(
          JSON.stringify({
            commandType: "favorite",
            createdByIdentityId: 71,
            createdByUserId: 41,
            messageIds: [1, 2],
            sourceConversationId: 91
          })
        )
        .digest("hex")
    );
  });

  it("clones protected media, persists only descriptors, and compensates created files on persistence failure", async () => {
    const fixture = createFixture();
    fixture.repository.readSourceMessages.mockResolvedValue([
      sourceMessage(1, "A", {
        metadata: {
          needoMessageType: "image",
          needoMessageExt: {
            fileKey: "must-not-leak.png",
            fileSize: 16,
            mimeType: "image/png",
            url: "/media/im/source.png"
          }
        }
      })
    ]);
    fixture.repository.createFavorite.mockRejectedValue(new Error("transaction failed"));

    await expect(
      fixture.service.createFavorite(auth, context, {
        idempotencyKey: "media",
        messageIds: [1],
        sourceConversationId: 91
      })
    ).rejects.toThrow("transaction failed");

    expect(fixture.mediaStorage.clone).toHaveBeenCalledWith("/media/im/source.png", "image/png");
    const persistenceInput = fixture.repository.createFavorite.mock.calls[0]?.[0];
    expect(persistenceInput?.items[0]?.metadataSnapshot).toEqual({
      media: {
        checksumSha256: "a".repeat(64),
        mimeType: "image/png",
        size: 16
      }
    });
    expect(JSON.stringify(persistenceInput)).not.toContain("must-not-leak.png");
    expect(JSON.stringify(persistenceInput)).not.toContain(`${"a".repeat(64)}.png`);
    expect(fixture.mediaStorage.delete).toHaveBeenCalledWith(
      `${"a".repeat(64)}/11111111-1111-4111-8111-111111111111/${"a".repeat(64)}.png`
    );
  });

  it("logs a structured warning when persistence compensation fails", async () => {
    const fixture = createFixture();
    fixture.repository.readSourceMessages.mockResolvedValue([
      sourceMessage(1, "A", {
        metadata: {
          needoMessageType: "image",
          needoMessageExt: {
            fileSize: 16,
            mimeType: "image/png",
            url: "/media/im/source.png"
          }
        }
      })
    ]);
    fixture.repository.createFavorite.mockRejectedValue(new Error("transaction failed"));
    fixture.mediaStorage.delete.mockRejectedValue(new Error("cleanup failed"));

    await expect(
      fixture.service.createFavorite(auth, context, {
        idempotencyKey: "cleanup-warning",
        messageIds: [1],
        sourceConversationId: 91
      })
    ).rejects.toThrow("transaction failed");

    expect(fixture.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        checksumSha256: "a".repeat(64),
        error: expect.any(Error),
        operation: "im_chat_record_media_compensation"
      }),
      "Chat record media compensation failed"
    );
    expect(fixture.warn.mock.calls[0]?.[0]).not.toHaveProperty("fileKey");
  });

  it("authorizes by checksum metadata and returns protected bytes without a storage locator", async () => {
    const fixture = createFixture();
    fixture.repository.resolveAuthorizedMedia.mockResolvedValue({
      publicId: "11111111-1111-4111-8111-111111111111",
      checksumSha256: "a".repeat(64),
      mimeType: "image/png",
      size: 15
    });

    const result = await fixture.service.resolveAuthorizedMedia(
      auth,
      "11111111-1111-4111-8111-111111111111",
      "a".repeat(64)
    );

    expect(fixture.mediaStorage.read).toHaveBeenCalledWith("a".repeat(64), "image/png");
    expect(result).toEqual({
      bytes: Buffer.from("protected-media"),
      checksumSha256: "a".repeat(64),
      mimeType: "image/png",
      publicId: "11111111-1111-4111-8111-111111111111",
      size: 15
    });
    expect(result).not.toHaveProperty("url");
    expect(result).not.toHaveProperty("fileKey");
  });

  it("publishes a committed delivery once and never republishes an idempotent replay", async () => {
    const fixture = createFixture();
    fixture.repository.readSourceMessages.mockResolvedValue([sourceMessage(1, "A")]);

    await fixture.service.createDelivery(auth, context, {
      idempotencyKey: "delivery",
      messageIds: [1],
      sourceConversationId: 91,
      targetConversationId: 99
    });
    expect(fixture.eventGateway.publish).toHaveBeenCalledTimes(1);
    expect(fixture.eventGateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "message.created",
        recipientUserId: 41,
        recipientIdentityId: 71,
        payload: expect.objectContaining({ id: 801 })
      })
    );

    fixture.repository.createDelivery.mockImplementation(async (input) => ({
      ...(await repositoryFixture().createDelivery(input)),
      replayed: true
    }));
    await fixture.service.createDelivery(auth, context, {
      idempotencyKey: "delivery",
      messageIds: [1],
      sourceConversationId: 91,
      targetConversationId: 99
    });
    expect(fixture.eventGateway.publish).toHaveBeenCalledTimes(1);
  });
});
