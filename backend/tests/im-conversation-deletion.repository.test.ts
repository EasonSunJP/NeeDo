import type { PrismaClient } from "@prisma/client";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

it("atomically hides the viewer conversation, clears its history, and preserves contacts", async () => {
  const participant = { id: 8, createdAt: new Date("2026-01-01") };
  const update = jest.fn(async () => participant);
  const audit = jest.fn(async () => ({}));
  const deleteContacts = jest.fn();
  const updateContacts = jest.fn();
  const tx = {
    conversationParticipant: { findFirst: jest.fn(async () => participant), update },
    message: { findFirst: jest.fn(async () => ({ id: 700, createdAt: new Date() })) },
    contact: { deleteMany: deleteContacts, updateMany: updateContacts },
    auditLog: { create: audit }
  };
  const transaction = jest.fn(async (operation: (value: typeof tx) => unknown) => operation(tx));
  const repository = new RealtimeRepository({ ...tx, $transaction: transaction } as unknown as PrismaClient);
  jest.spyOn(repository, "getConversationForUser").mockResolvedValue(null);
  await repository.hideConversation({ conversationId: 91, userId: 100, identityId: 101 });
  expect(transaction).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith({ where: { id: 8 }, data: expect.objectContaining({
    hiddenAt: expect.any(Date), clearedThroughMessageId: 700, unreadCount: 0, isPinned: false
  }) });
  expect(audit).toHaveBeenCalledWith({ data: expect.objectContaining({ actorId: 100, targetId: 91 }) });
  expect(deleteContacts).not.toHaveBeenCalled();
  expect(updateContacts).not.toHaveBeenCalled();
});

it("keeps reopened history scoped above the viewer deletion boundary", async () => {
  const createdAt = new Date("2026-01-01");
  const findMany = jest.fn(async () => []);
  const repository = new RealtimeRepository({
    conversationParticipant: { findFirst: jest.fn(async () => ({ id: 8, createdAt, clearedThroughMessageId: 700 })) },
    message: { findMany, count: jest.fn(async () => 0) }
  } as unknown as PrismaClient);
  await repository.listMessages({ conversationId: 91, userId: 100, identityId: 101 });
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ conversationId: 91, id: { gt: 700 }, userDeletions: { none: { identityId: 101, deletedAt: null } } })
  }));
});
