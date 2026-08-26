import type { PrismaClient } from "@prisma/client";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

describe("RealtimeRepository technician application contact", () => {
  it("upserts bilateral contacts and reuses the exact existing direct conversation", async () => {
    const tx = {
      contact: { upsert: jest.fn().mockResolvedValue({ id: 1 }) },
      conversation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 91,
            participants: [{ userId: 7 }, { userId: 30 }]
          }
        ]),
        create: jest.fn()
      }
    };
    const client = {
      $transaction: jest.fn(async (callback: (database: typeof tx) => unknown) => callback(tx))
    } as unknown as PrismaClient;
    const repository = new RealtimeRepository(client);

    await expect(
      repository.ensureDirectContactConversation({
        serviceUserId: 30,
        applicantUserId: 7,
        createdByUserId: 31
      })
    ).resolves.toEqual({ conversationId: 91 });
    expect(tx.contact.upsert).toHaveBeenCalledTimes(2);
    expect(tx.contact.upsert).toHaveBeenNthCalledWith(1, {
      where: { ownerUserId_contactUserId: { ownerUserId: 30, contactUserId: 7 } },
      create: { ownerUserId: 30, contactUserId: 7, source: "technician_application" },
      update: { source: "technician_application", deletedAt: null }
    });
    expect(tx.conversation.create).not.toHaveBeenCalled();
  });

  it("creates one direct conversation with both participants when no exact conversation exists", async () => {
    const tx = {
      contact: { upsert: jest.fn().mockResolvedValue({ id: 1 }) },
      conversation: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 92 })
      }
    };
    const client = {
      $transaction: jest.fn(async (callback: (database: typeof tx) => unknown) => callback(tx))
    } as unknown as PrismaClient;
    const repository = new RealtimeRepository(client);

    await expect(
      repository.ensureDirectContactConversation({
        serviceUserId: 30,
        applicantUserId: 7,
        createdByUserId: 31
      })
    ).resolves.toEqual({ conversationId: 92 });
    expect(tx.conversation.create).toHaveBeenCalledWith({
      data: {
        type: "DIRECT",
        createdByUserId: 31,
        participants: {
          create: [{ userId: 30, role: "member" }, { userId: 7, role: "member" }]
        }
      },
      select: { id: true }
    });
  });
});
