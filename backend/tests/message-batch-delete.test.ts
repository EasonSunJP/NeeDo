import { createHash } from "node:crypto";
import { ERROR_CODES } from "../src/constants/error-codes";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

type FixtureRow = Record<string, unknown>;
type FixtureTransaction = {
  conversationParticipant: { findFirst: jest.Mock };
  message: { findMany: jest.Mock };
  imMessageBatchDeleteCommand: { findUnique: jest.Mock; create?: jest.Mock };
  messageUserDeletion: { upsert: jest.Mock };
  auditLog: { create: jest.Mock };
};

const idempotencyKey = "22222222-2222-4222-8222-222222222222";
const input = {
  conversationId: 91,
  messageIds: [12, 11],
  idempotencyKey,
  userId: 41,
  identityId: 71
};
const expectedFingerprint = createHash("sha256")
  .update(JSON.stringify({ conversationId: 91, messageIds: [11, 12] }))
  .digest("hex");

const createTransactionFixture = () => {
  const committed = {
    commands: [] as FixtureRow[],
    deletions: [] as FixtureRow[],
    audits: [] as FixtureRow[]
  };
  let failAtMessageId: number | null = null;
  const commandFindUnique = jest.fn(
    async () =>
      committed.commands.find(
        (command) => command.ownerIdentityId === 71 && command.idempotencyKey === idempotencyKey
      ) ?? null
  );
  const client = {
    imMessageBatchDeleteCommand: { findUnique: commandFindUnique },
    $transaction: jest.fn(
      async (operation: (transaction: FixtureTransaction) => Promise<unknown>) => {
        const staged = {
          commands: [] as FixtureRow[],
          deletions: [] as FixtureRow[],
          audits: [] as FixtureRow[]
        };
        const transaction = {
          conversationParticipant: {
            findFirst: jest.fn(async () => ({ createdAt: new Date("2026-08-31T07:00:00.000Z") }))
          },
          message: {
            findMany: jest.fn(async ({ where }: { where: { id: { in: number[] } } }) =>
              (where.id.in as number[]).map((id) => ({ id }))
            )
          },
          imMessageBatchDeleteCommand: {
            findUnique: commandFindUnique,
            create: jest.fn(async ({ data }: { data: FixtureRow }) => {
              const created = { id: 901, ...data };
              staged.commands.push(created);
              return created;
            })
          },
          messageUserDeletion: {
            upsert: jest.fn(async ({ create }: { create: FixtureRow }) => {
              if (create.messageId === failAtMessageId) throw new Error("forced deletion failure");
              staged.deletions.push(create);
              return create;
            })
          },
          auditLog: {
            create: jest.fn(async ({ data }: { data: FixtureRow }) => {
              staged.audits.push(data);
              return data;
            })
          }
        };
        const result = await operation(transaction);
        committed.commands.push(...staged.commands);
        committed.deletions.push(...staged.deletions);
        committed.audits.push(...staged.audits);
        return result;
      }
    )
  };
  return {
    client,
    committed,
    failAt: (messageId: number) => {
      failAtMessageId = messageId;
    }
  };
};

describe("atomic message batch delete", () => {
  it("persists sorted deletions, one command result, and one body-free audit in one transaction", async () => {
    const fixture = createTransactionFixture();
    const repository = new RealtimeRepository(fixture.client as never);
    await expect(repository.deleteMessagesForUser(input)).resolves.toEqual({
      conversationId: 91,
      messageIds: [11, 12],
      count: 2,
      deleted: true,
      replayed: false
    });
    expect(fixture.committed.deletions.map((row) => row.messageId)).toEqual([11, 12]);
    expect(fixture.committed.commands).toEqual([
      expect.objectContaining({
        conversationId: 91,
        ownerUserId: 41,
        ownerIdentityId: 71,
        idempotencyKey,
        requestFingerprint: expectedFingerprint,
        resultJson: { conversationId: 91, messageIds: [11, 12], count: 2, deleted: true }
      })
    ]);
    expect(fixture.committed.audits).toEqual([
      expect.objectContaining({
        actorId: 41,
        action: "im.messages.deleted_for_user",
        targetType: "Conversation",
        targetId: 91,
        metadata: { conversationId: 91, count: 2, messageIds: [11, 12] }
      })
    ]);
    expect(JSON.stringify(fixture.committed.audits)).not.toContain("message 11");
  });

  it("rolls back every deletion, command, and audit when any requested write fails", async () => {
    const fixture = createTransactionFixture();
    fixture.failAt(12);
    await expect(
      new RealtimeRepository(fixture.client as never).deleteMessagesForUser(input)
    ).rejects.toThrow("forced deletion failure");
    expect(fixture.committed).toEqual({ commands: [], deletions: [], audits: [] });
  });

  it("returns not found before writes unless every requested message is visible", async () => {
    const fixture = createTransactionFixture();
    fixture.client.$transaction.mockImplementationOnce(
      async (operation: (transaction: FixtureTransaction) => Promise<unknown>) =>
        operation({
          conversationParticipant: {
            findFirst: jest.fn(async () => ({ createdAt: new Date("2026-08-31T07:00:00.000Z") }))
          },
          message: { findMany: jest.fn(async () => [{ id: 11 }]) },
          imMessageBatchDeleteCommand: { findUnique: jest.fn() },
          messageUserDeletion: { upsert: jest.fn() },
          auditLog: { create: jest.fn() }
        })
    );
    await expect(
      new RealtimeRepository(fixture.client as never).deleteMessagesForUser(input)
    ).resolves.toBeNull();
    expect(fixture.committed).toEqual({ commands: [], deletions: [], audits: [] });
  });

  it("replays an exact key and rejects changed payload reuse", async () => {
    const fixture = createTransactionFixture();
    const repository = new RealtimeRepository(fixture.client as never);
    await repository.deleteMessagesForUser(input);
    await expect(repository.deleteMessagesForUser(input)).resolves.toEqual({
      conversationId: 91,
      messageIds: [11, 12],
      count: 2,
      deleted: true,
      replayed: true
    });
    expect(fixture.committed.audits).toHaveLength(1);
    await expect(
      repository.deleteMessagesForUser({ ...input, messageIds: [11] })
    ).rejects.toMatchObject({
      code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
      message: "error.idempotency_key_reused",
      statusCode: 409
    });
    expect(fixture.committed.audits).toHaveLength(1);
  });

  it("recovers an exact concurrent unique-key winner and rejects a different winner payload", async () => {
    const fixture = createTransactionFixture();
    fixture.committed.commands.push({
      ownerIdentityId: 71,
      idempotencyKey,
      requestFingerprint: expectedFingerprint,
      resultJson: { conversationId: 91, messageIds: [11, 12], count: 2, deleted: true }
    });
    fixture.client.$transaction.mockRejectedValue({ code: "P2002" });
    const repository = new RealtimeRepository(fixture.client as never);

    await expect(repository.deleteMessagesForUser(input)).resolves.toEqual({
      conversationId: 91,
      messageIds: [11, 12],
      count: 2,
      deleted: true,
      replayed: true
    });
    await expect(
      repository.deleteMessagesForUser({ ...input, messageIds: [11] })
    ).rejects.toMatchObject({
      code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
      message: "error.idempotency_key_reused",
      statusCode: 409
    });
  });

  it("delegates legacy single-message deletion to the atomic batch path", async () => {
    const repository = new RealtimeRepository({} as never);
    const deleteBatch = jest.spyOn(repository, "deleteMessagesForUser").mockResolvedValue({
      conversationId: 91,
      messageIds: [11],
      count: 1,
      deleted: true,
      replayed: false
    });

    await expect(
      repository.deleteMessageForUser({
        conversationId: 91,
        messageId: 11,
        userId: 41,
        identityId: 71
      })
    ).resolves.toEqual({ conversationId: 91, messageId: 11, deleted: true });
    expect(deleteBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 91,
        messageIds: [11],
        userId: 41,
        identityId: 71,
        idempotencyKey: expect.any(String)
      })
    );
  });
});
