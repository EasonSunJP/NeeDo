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
  reactionVersion: 0,
  reactions: []
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
  context
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
      message: {
        findMany: jest.fn(async () => [
          {
            id: 11,
            type: MessageType.TEXT,
            metadata: null,
            recalledAt: null,
            expiredAt: null,
            expiresAt: null,
            contentPurgedAt: null,
            privacyPolicyVersionAtSend: null,
            deletedAt: null
          }
        ]),
        create: jest.fn(async () => message)
      },
      imChatRecordDelivery: { create: jest.fn(async () => ({ id: 901 })) },
      conversation: { update: jest.fn(async () => ({ id: 99 })) },
      auditLog: { create: jest.fn(async () => ({ id: 1001 })) }
    };
    const client = {
      $transaction: jest.fn(async (operation: (value: typeof tx) => unknown) => operation(tx))
    };
    const repository = new ImChatRecordRepository(client as never, { now: () => now });

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
    expect(tx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 99,
          senderUserId: 41,
          senderIdentityId: 71,
          createdAt: now,
          metadata: expect.objectContaining({ needoMessageType: "chat-record" })
        })
      })
    );
    expect(tx.imChatRecordDelivery.create).toHaveBeenCalledWith({
      data: { bundleId: 501, conversationId: 99, createdAt: now, messageId: 801 }
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

  it("preflights exact delivery and favorite replays before any source transaction", async () => {
    const deliveryReplay = {
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
    const favoriteReplay = {
      ...bundle,
      createdByIdentityId: 71,
      deliveries: [],
      favorites: [{ id: 601, createdAt: now }]
    };
    const replays = [deliveryReplay, favoriteReplay];
    const findUnique = jest.fn(async () => replays.shift() ?? null);
    const repository = new ImChatRecordRepository({
      imChatRecordBundle: { findUnique }
    } as never);

    await expect(
      repository.preflightCommand({
        commandType: "delivery",
        createdByIdentityId: 71,
        idempotencyKey: "delivery-key",
        requestFingerprint: "a".repeat(64)
      })
    ).resolves.toMatchObject({ commandType: "delivery", result: { replayed: true } });
    await expect(
      repository.preflightCommand({
        commandType: "favorite",
        createdByIdentityId: 71,
        idempotencyKey: "favorite-key",
        requestFingerprint: "a".repeat(64)
      })
    ).resolves.toMatchObject({ commandType: "favorite", result: { replayed: true } });
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(findUnique).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          createdByIdentityId_commandType_idempotencyKey: {
            createdByIdentityId: 71,
            commandType: "delivery",
            idempotencyKey: "delivery-key"
          },
          deletedAt: null
        }
      })
    );
    expect(findUnique).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          createdByIdentityId_commandType_idempotencyKey: {
            createdByIdentityId: 71,
            commandType: "favorite",
            idempotencyKey: "favorite-key"
          },
          deletedAt: null
        }
      })
    );
  });

  it("preflight rejects changed idempotency reuse without reading mutable source state", async () => {
    const findUnique = jest.fn(async () => ({
      ...bundle,
      createdByIdentityId: 71,
      deliveries: [],
      favorites: [{ id: 601, createdAt: now }]
    }));
    const repository = new ImChatRecordRepository({
      imChatRecordBundle: { findUnique }
    } as never);

    await expect(
      repository.preflightCommand({
        commandType: "favorite",
        createdByIdentityId: 71,
        idempotencyKey: "favorite-key",
        requestFingerprint: "b".repeat(64)
      })
    ).rejects.toMatchObject({ message: "error.idempotency_key_reused", statusCode: 409 });
  });

  it.each([
    ["exact", "a".repeat(64)],
    ["changed", "b".repeat(64)]
  ])(
    "rejects an inactive reservation for the %s payload",
    async (_payloadKind, requestFingerprint) => {
      const inactiveReservation = {
        ...bundle,
        createdByIdentityId: 71,
        deletedAt: now,
        deliveries: [],
        favorites: []
      };
      const findUnique = jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        Object.hasOwn(where, "deletedAt") ? null : inactiveReservation
      );
      const repository = new ImChatRecordRepository({
        imChatRecordBundle: { findUnique }
      } as never);

      await expect(
        repository.preflightCommand({
          commandType: "favorite",
          createdByIdentityId: 71,
          idempotencyKey: "soft-deleted-key",
          requestFingerprint
        })
      ).rejects.toMatchObject({ message: "error.idempotency_key_reused", statusCode: 409 });
      expect(findUnique).toHaveBeenCalledTimes(2);
    }
  );

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

  it("maps P2002 to an idempotency conflict when the reservation was deleted before recovery", async () => {
    const inactiveReservation = {
      ...bundle,
      createdByIdentityId: 71,
      deletedAt: now,
      deliveries: [],
      favorites: []
    };
    const uniqueConflict = Object.assign(new Error("unique conflict"), { code: "P2002" });
    const findUnique = jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      Object.hasOwn(where, "deletedAt") ? null : inactiveReservation
    );
    const client = {
      $transaction: jest.fn(async () => {
        throw uniqueConflict;
      }),
      imChatRecordBundle: { findUnique }
    };
    const repository = new ImChatRecordRepository(client as never);

    await expect(repository.createDelivery(deliveryInput())).rejects.toMatchObject({
      message: "error.idempotency_key_reused",
      statusCode: 409
    });
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("rolls back staged bundle and item writes when a later transaction write fails", async () => {
    const committed = { bundles: [] as unknown[], items: [] as unknown[] };
    const client = {
      $transaction: jest.fn(async (operation: (value: unknown) => unknown) => {
        const staged = { bundles: [...committed.bundles], items: [...committed.items] };
        const tx = {
          imChatRecordBundle: {
            findUnique: jest.fn(async () => null),
            create: jest.fn(async ({ data }) => {
              staged.bundles.push(data);
              return bundle;
            })
          },
          conversationParticipant: {
            findFirst: jest.fn(async ({ where }) =>
              where.conversationId === 91
                ? {
                    createdAt: new Date("2026-08-31T07:00:00.000Z"),
                    clearedThroughMessageId: null
                  }
                : {
                    id: 1,
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
            updateMany: jest.fn()
          },
          message: {
            findMany: jest.fn(async () => [
              {
                id: 11,
                type: MessageType.TEXT,
                metadata: null,
                recalledAt: null,
                expiredAt: null,
                expiresAt: null,
                contentPurgedAt: null,
                privacyPolicyVersionAtSend: null,
                deletedAt: null
              }
            ]),
            create: jest.fn(async () => {
              throw new Error("message insert failed");
            })
          },
          imChatRecordItem: {
            create: jest.fn(async ({ data }) => {
              staged.items.push(data);
              return { id: 701 };
            })
          },
          mediaAsset: { create: jest.fn() },
          contact: { count: jest.fn(async () => 2) },
          imPolicy: { findFirst: jest.fn(async () => null) }
        };
        const result = await operation(tx);
        committed.bundles = staged.bundles;
        committed.items = staged.items;
        return result;
      })
    };
    const repository = new ImChatRecordRepository(client as never);

    await expect(repository.createDelivery(deliveryInput())).rejects.toThrow(
      "message insert failed"
    );
    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(committed).toEqual({ bundles: [], items: [] });
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
      message: { findMany: jest.fn(async () => []) }
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
              size: 16
            }
          },
          media: {
            checksumSha256: "c".repeat(64),
            mimeType: "image/png",
            size: 16
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
      message: {
        findMany: jest.fn(async () => [
          {
            id: 11,
            type: MessageType.TEXT,
            metadata: null,
            recalledAt: null,
            expiredAt: null,
            expiresAt: null,
            contentPurgedAt: null,
            privacyPolicyVersionAtSend: null,
            deletedAt: null
          }
        ])
      },
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
        checksumSha256: "c".repeat(64),
        url: `/api/v1/im/chat-records/${bundle.publicId}/media/${"c".repeat(64)}`
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

  it("post-filters a returned bundle when its delivery is no longer visible", async () => {
    const repository = new ImChatRecordRepository({
      imChatRecordBundle: {
        findFirst: jest.fn(async () => ({
          ...bundle,
          createdByIdentityId: 999,
          favorites: [],
          deliveries: [
            {
              message: {
                id: 801,
                createdAt: now,
                deletedAt: null,
                recalledAt: now,
                contentPurgedAt: now,
                expiredAt: null,
                expiresAt: null,
                userDeletions: []
              },
              conversation: {
                participants: [
                  {
                    createdAt: new Date("2026-08-31T07:00:00.000Z"),
                    clearedThroughMessageId: null
                  }
                ]
              }
            }
          ]
        }))
      }
    } as never);

    await expect(
      repository.getBundle({ publicId: bundle.publicId, userId: 41, identityId: 71 })
    ).resolves.toBeNull();
  });

  it("applies the shared reciprocal-friendship gate to chat-record deliveries", async () => {
    const messageCreate = jest.fn();
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
                id: 1,
                conversation: {
                  type: "DIRECT",
                  accessPolicy: "FRIENDSHIP_REQUIRED",
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
        updateMany: jest.fn()
      },
      contact: { count: jest.fn(async () => 0) },
      message: {
        findMany: jest.fn(async () => [
          {
            id: 11,
            type: MessageType.TEXT,
            metadata: null,
            recalledAt: null,
            expiredAt: null,
            expiresAt: null,
            contentPurgedAt: null,
            privacyPolicyVersionAtSend: null,
            deletedAt: null
          }
        ]),
        create: messageCreate
      },
      imPolicy: { findFirst: jest.fn() },
      conversation: { update: jest.fn() }
    };
    const repository = new ImChatRecordRepository({
      $transaction: jest.fn(async (operation: (value: typeof tx) => unknown) => operation(tx))
    } as never);

    await expect(repository.createDelivery(deliveryInput())).rejects.toMatchObject({
      message: "error.im.not_friends",
      statusCode: 403
    });
    expect(messageCreate).not.toHaveBeenCalled();
    expect(tx.conversation.update).not.toHaveBeenCalled();
    expect(tx.conversationParticipant.updateMany).not.toHaveBeenCalled();
  });

  it("uses a transaction-start clock and rejects a source that expired while media was cloning", async () => {
    const transactionNow = new Date("2026-08-31T08:00:05.000Z");
    const bundleCreate = jest.fn();
    const tx = {
      imChatRecordBundle: { findUnique: jest.fn(async () => null), create: bundleCreate },
      conversationParticipant: {
        findFirst: jest.fn(async () => ({
          createdAt: new Date("2026-08-31T07:00:00.000Z"),
          clearedThroughMessageId: null
        }))
      },
      message: {
        findMany: jest.fn(async () => [
          {
            id: 11,
            type: MessageType.TEXT,
            metadata: null,
            recalledAt: null,
            expiredAt: null,
            expiresAt: new Date("2026-08-31T08:00:01.000Z"),
            contentPurgedAt: null,
            privacyPolicyVersionAtSend: null,
            deletedAt: null
          }
        ])
      }
    };
    const client = {
      $transaction: jest.fn(async (operation: (value: typeof tx) => unknown) => operation(tx))
    };
    const repository = new ImChatRecordRepository(client as never, { now: () => transactionNow });

    await expect(repository.createDelivery(deliveryInput())).rejects.toMatchObject({
      message: "error.im.chat_record_source_unavailable"
    });
    expect(tx.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ expiresAt: null }, { expiresAt: { gt: transactionNow } }]
        })
      })
    );
    expect(bundleCreate).not.toHaveBeenCalled();
  });

  it.each([
    [MessageType.SYSTEM, null],
    [MessageType.ORDER_STATUS, null],
    [
      MessageType.TEXT,
      {
        needoMessageType: "image",
        needoMessageExt: { mimeType: "image/png", url: "/media/im/a.png" }
      }
    ]
  ])(
    "applies the source type and media gate again inside the transaction",
    async (type, metadata) => {
      const bundleCreate = jest.fn();
      const tx = {
        imChatRecordBundle: { findUnique: jest.fn(async () => null), create: bundleCreate },
        conversationParticipant: {
          findFirst: jest.fn(async () => ({
            createdAt: new Date("2026-08-31T07:00:00.000Z"),
            clearedThroughMessageId: null
          }))
        },
        message: {
          findMany: jest.fn(async () => [
            {
              id: 11,
              type,
              metadata,
              recalledAt: null,
              expiredAt: null,
              expiresAt: null,
              contentPurgedAt: null,
              privacyPolicyVersionAtSend: null,
              deletedAt: null
            }
          ])
        }
      };
      const client = {
        $transaction: jest.fn(async (operation: (value: typeof tx) => unknown) => operation(tx))
      };
      const repository = new ImChatRecordRepository(client as never);

      await expect(repository.createDelivery(deliveryInput())).rejects.toMatchObject({
        message: "error.im.chat_record_source_unavailable"
      });
      expect(bundleCreate).not.toHaveBeenCalled();
    }
  );

  it("filters favorite rows and count by an active bundle", async () => {
    const findMany = jest.fn(async () => []);
    const count = jest.fn(async () => 0);
    const client = {
      imChatRecordFavorite: { findMany, count },
      $transaction: jest.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations))
    };
    const repository = new ImChatRecordRepository(client as never);

    await expect(
      repository.listFavorites({ identityId: 71, page: 1, pageSize: 20 })
    ).resolves.toMatchObject({ list: [], total: 0 });
    const expectedWhere = {
      ownerIdentityId: 71,
      deletedAt: null,
      bundle: { deletedAt: null }
    };
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }));
    expect(count).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it("derives first and subsequent cursor pages from active rows despite soft-deleted gaps", async () => {
    const row = (id: number, position: number) => ({
      id,
      position,
      senderDisplayNameSnapshot: `Sender ${id}`,
      senderAvatarSnapshot: null,
      messageType: "text",
      contentSnapshot: `message ${id}`,
      metadataSnapshot: null,
      sentAtSnapshot: now
    });
    const findMany = jest
      .fn<() => Promise<ReturnType<typeof row>[]>>()
      .mockResolvedValueOnce([row(705, 7), row(704, 5)])
      .mockResolvedValueOnce([row(703, 3)]);
    const count = jest
      .fn<() => Promise<number>>()
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);
    const repository = new ImChatRecordRepository({
      imChatRecordItem: { findMany, count },
      $transaction: jest.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations))
    } as never);

    await expect(repository.listItems({ bundleId: 501, pageSize: 2 })).resolves.toMatchObject({
      total: 3,
      page: 1,
      pageSize: 2,
      nextCursor: 5,
      list: [{ position: 5 }, { position: 7 }]
    });
    await expect(
      repository.listItems({ bundleId: 501, beforePosition: 5, pageSize: 2 })
    ).resolves.toMatchObject({
      total: 3,
      page: 2,
      pageSize: 2,
      nextCursor: null,
      list: [{ position: 3 }]
    });
    expect(count).toHaveBeenNthCalledWith(3, {
      where: { bundleId: 501, deletedAt: null, position: { gte: 5 } }
    });
  });

  it("omits a cursor when the first full page is the complete active result", async () => {
    const rows = [7, 5].map((position) => ({
      id: 700 + position,
      position,
      senderDisplayNameSnapshot: `Sender ${position}`,
      senderAvatarSnapshot: null,
      messageType: "text",
      contentSnapshot: `message ${position}`,
      metadataSnapshot: null,
      sentAtSnapshot: now
    }));
    const repository = new ImChatRecordRepository({
      imChatRecordItem: {
        findMany: jest.fn(async () => rows),
        count: jest.fn(async () => 2)
      },
      $transaction: jest.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations))
    } as never);

    await expect(repository.listItems({ bundleId: 501, pageSize: 2 })).resolves.toMatchObject({
      total: 2,
      page: 1,
      nextCursor: null
    });
  });

  it("omits a cursor when a subsequent final page is exactly full", async () => {
    const rows = [3, 1].map((position) => ({
      id: 700 + position,
      position,
      senderDisplayNameSnapshot: `Sender ${position}`,
      senderAvatarSnapshot: null,
      messageType: "text",
      contentSnapshot: `message ${position}`,
      metadataSnapshot: null,
      sentAtSnapshot: now
    }));
    const count = jest
      .fn<() => Promise<number>>()
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2);
    const repository = new ImChatRecordRepository({
      imChatRecordItem: { findMany: jest.fn(async () => rows), count },
      $transaction: jest.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations))
    } as never);

    await expect(
      repository.listItems({ bundleId: 501, beforePosition: 5, pageSize: 2 })
    ).resolves.toMatchObject({
      total: 4,
      page: 2,
      nextCursor: null
    });
  });

  it.each([
    ["creator", { createdByIdentityId: 71, favorites: [], deliveries: [] }],
    ["favorite", { createdByIdentityId: 999, favorites: [{ id: 1 }], deliveries: [] }],
    [
      "delivery",
      {
        createdByIdentityId: 999,
        favorites: [],
        deliveries: [
          {
            message: {
              id: 801,
              createdAt: now,
              deletedAt: null,
              recalledAt: null,
              contentPurgedAt: null,
              expiredAt: null,
              expiresAt: null,
              userDeletions: []
            },
            conversation: {
              participants: [
                {
                  createdAt: new Date("2026-08-31T07:00:00.000Z"),
                  clearedThroughMessageId: null
                }
              ]
            }
          }
        ]
      }
    ]
  ])("allows the active %s access branch", async (_branch, access) => {
    const repository = new ImChatRecordRepository({
      imChatRecordBundle: { findFirst: jest.fn(async () => ({ ...bundle, ...access })) }
    } as never);

    await expect(
      repository.getBundle({ publicId: bundle.publicId, userId: 41, identityId: 71 })
    ).resolves.toMatchObject({ id: bundle.id, publicId: bundle.publicId });
  });

  it("returns authorized media metadata without reading or returning a storage URL", async () => {
    const checksum = "c".repeat(64);
    const repository = new ImChatRecordRepository({
      imChatRecordBundle: {
        findFirst: jest.fn(async () => ({
          ...bundle,
          createdByIdentityId: 71,
          favorites: [],
          deliveries: []
        }))
      },
      imChatRecordItem: {
        findMany: jest.fn(async () => [
          {
            id: 701,
            metadataSnapshot: {
              media: { checksumSha256: checksum, mimeType: "image/png", size: 16 }
            }
          }
        ])
      },
      mediaAsset: {
        findFirst: jest.fn(async () => ({
          entityId: 701,
          checksumSha256: checksum,
          mimeType: "image/png"
        }))
      }
    } as never);

    const result = await repository.resolveAuthorizedMedia({
      publicId: bundle.publicId,
      checksumSha256: checksum,
      userId: 41,
      identityId: 71
    });

    expect(result).toEqual({
      publicId: bundle.publicId,
      checksumSha256: checksum,
      mimeType: "image/png",
      size: 16
    });
    expect(result).not.toHaveProperty("url");
  });
});
