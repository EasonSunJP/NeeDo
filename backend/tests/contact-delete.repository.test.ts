import type { PrismaClient } from "@prisma/client";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

describe("RealtimeRepository contact deletion", () => {
  it("soft-deletes an owned contact and writes an audit record in the same transaction", async () => {
    const contactFindFirst = jest.fn(async () => ({ id: 31, contactUserId: 167 }));
    const contactUpdate = jest.fn(async () => ({ id: 31 }));
    const auditCreate = jest.fn(async () => ({ id: 12 }));
    const transaction = {
      contact: { findFirst: contactFindFirst, update: contactUpdate },
      auditLog: { create: auditCreate }
    };
    const client = {
      $transaction: async (operation: (tx: typeof transaction) => unknown) => operation(transaction)
    } as unknown as PrismaClient;
    const repository = new RealtimeRepository(client) as RealtimeRepository & {
      deleteContact: (input: {
        contactId: number;
        ownerUserId: number;
      }) => Promise<{
        contactId: number;
        contactUserId: number;
        deleted: true;
        deletedAt: Date;
        ownerUserId: number;
      } | null>;
    };

    await expect(
      repository.deleteContact({ contactId: 31, ownerUserId: 41 })
    ).resolves.toEqual({
      contactId: 31,
      contactUserId: 167,
      deleted: true,
      deletedAt: expect.any(Date),
      ownerUserId: 41
    });

    expect(contactFindFirst).toHaveBeenCalledWith({
      where: {
        id: 31,
        ownerIdentityId: 41,
        deletedAt: null,
        contactUser: { deletedAt: null, isActive: true }
      },
      select: { contactUserId: true, id: true }
    });
    expect(contactUpdate).toHaveBeenCalledWith({
      where: { id: 31 },
      data: { blockedAt: null, deletedAt: expect.any(Date) }
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        actorId: 41,
        action: "im.contact.deleted",
        targetType: "Contact",
        targetId: 31,
        ip: null,
        userAgent: null,
        metadata: { contactUserId: 167 }
      }
    });
  });

  it("does not mutate or audit another user's contact", async () => {
    const contactUpdate = jest.fn();
    const auditCreate = jest.fn();
    const transaction = {
      contact: {
        findFirst: jest.fn(async () => null),
        update: contactUpdate
      },
      auditLog: { create: auditCreate }
    };
    const client = {
      $transaction: async (operation: (tx: typeof transaction) => unknown) => operation(transaction)
    } as unknown as PrismaClient;
    const repository = new RealtimeRepository(client) as RealtimeRepository & {
      deleteContact: (input: {
        contactId: number;
        ownerUserId: number;
      }) => Promise<unknown>;
    };

    await expect(
      repository.deleteContact({ contactId: 31, ownerUserId: 99 })
    ).resolves.toBeNull();
    expect(contactUpdate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
