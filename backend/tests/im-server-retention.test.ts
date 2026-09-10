import { ImServerRetentionService } from "../src/services/im-server-retention.service";
import { ImServerRetentionRepository } from "../src/repositories/im-server-retention.repository";

const now = new Date("2026-09-06T00:00:00.000Z");

describe("ImServerRetentionService", () => {
  it("purges due server messages and media without publishing a client deletion event", async () => {
    const repository = {
      listDueMessages: jest.fn(async () => [{
        id: 11,
        conversationId: 91,
        senderUserId: 41,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        expiresAt: now,
        lifecycleVersion: 2
      }]),
      purgeMessage: jest.fn(async () => true),
      listDueMedia: jest.fn(async () => [{
        id: 21,
        url: "https://media.needo.test/media/im/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
        purgeAt: now
      }]),
      markMediaPurged: jest.fn(async () => true)
    };
    const storage = { remove: jest.fn(async () => undefined) };
    const service = new ImServerRetentionService(repository, storage);

    await expect(service.purgeDue({ now, batchSize: 50 })).resolves.toEqual({
      scanned: 2,
      messagesPurged: 1,
      mediaPurged: 1,
      failed: 0
    });
    expect(storage.remove).toHaveBeenCalledWith(
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png"
    );
    expect(Object.keys(service)).not.toContain("gateway");
  });

  it("retains failed media rows for retry and counts failures", async () => {
    const repository = {
      listDueMessages: jest.fn(async () => []),
      purgeMessage: jest.fn(),
      listDueMedia: jest.fn(async () => [{ id: 21, url: "invalid", purgeAt: now }]),
      markMediaPurged: jest.fn()
    };
    const service = new ImServerRetentionService(repository, { remove: jest.fn() });

    await expect(service.purgeDue({ now, batchSize: 50 })).resolves.toEqual({
      scanned: 1,
      messagesPurged: 0,
      mediaPurged: 0,
      failed: 1
    });
    expect(repository.markMediaPurged).not.toHaveBeenCalled();
  });
});

describe("ImServerRetentionRepository", () => {
  it("purges server content with audit evidence and creates no client deletion directive", async () => {
    const transaction = {
      message: {
        updateMany: jest.fn(async () => ({ count: 1 })),
        findFirst: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)
      },
      imMessageTranslation: { deleteMany: jest.fn(async () => ({ count: 1 })) },
      messageReaction: { deleteMany: jest.fn(async () => ({ count: 1 })) },
      messageUserDeletion: { deleteMany: jest.fn(async () => ({ count: 1 })) },
      conversationParticipant: { updateMany: jest.fn(async () => ({ count: 1 })) },
      conversation: {
        findUnique: jest.fn(async () => ({ createdAt: new Date("2026-07-01T00:00:00.000Z") })),
        update: jest.fn(async () => ({ id: 91 }))
      },
      auditLog: { create: jest.fn(async () => ({ id: 1 })) }
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<boolean>) =>
        operation(transaction)
      )
    };
    const repository = new ImServerRetentionRepository(client as never);
    const candidate = {
      id: 11,
      conversationId: 91,
      senderUserId: 41,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      expiresAt: now,
      lifecycleVersion: 2
    };

    await expect(repository.purgeMessage({ candidate, now })).resolves.toBe(true);
    expect(transaction.message.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ privacyPolicyVersionAtSend: null }),
      data: expect.objectContaining({ content: null, contentPurgedAt: now, expiredAt: now })
    }));
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "im.message.server_retention_expired",
        metadata: expect.objectContaining({ reason: "SERVER_RETENTION_EXPIRED" })
      })
    });
    expect(transaction).not.toHaveProperty("imDeletionSync");
  });
});
