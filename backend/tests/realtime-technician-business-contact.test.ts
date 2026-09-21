import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, jest } from "@jest/globals";
import { RealtimeRepository } from "../src/repositories/realtime.repository";
import { RealtimeService } from "../src/services/realtime.service";

const now = new Date("2026-09-21T03:00:00.000Z");

describe("technician booking contact conversation", () => {
  it("creates one expiring BUSINESS_CONTEXT conversation for the exact customer and technician identities", async () => {
    const tx = {
      userIdentity: {
        findFirst: jest.fn(async () => ({
          id: 82,
          userId: 52,
          user: { technicianProfile: { id: 13, status: "published", deletedAt: null } }
        }))
      },
      conversation: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({
          id: 92,
          businessContextExpiresAt: new Date("2026-09-22T03:00:00.000Z")
        }))
      }
    };
    const client = {
      $transaction: jest.fn(async (callback: (database: typeof tx) => unknown) => callback(tx))
    } as unknown as PrismaClient;
    const repository = new RealtimeRepository(client);

    await expect(repository.ensureTechnicianBusinessConversation({
      customerUserId: 41,
      customerIdentityId: 71,
      technicianPublicId: "s0000000052",
      now
    })).resolves.toEqual({
      conversationId: 92,
      expiresAt: "2026-09-22T03:00:00.000Z"
    });

    expect(tx.conversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accessPolicy: "BUSINESS_CONTEXT",
        businessContextType: "booking_contact",
        businessContextCustomerUserId: 41,
        businessContextTechnicianProfileId: 13,
        createdByIdentityId: 71,
        createdByUserId: 41,
        participants: {
          create: [
            { identityId: 71, role: "member", userId: 41 },
            { identityId: 82, role: "member", userId: 52 }
          ]
        }
      }),
      select: { id: true, businessContextExpiresAt: true }
    });
  });

  it("uses the active customer identity and never the account id as the chat participant", async () => {
    const repository = {
      ensureTechnicianBusinessConversation: jest.fn(async () => ({
        conversationId: 92,
        expiresAt: "2026-09-22T03:00:00.000Z"
      }))
    };
    const scope = {
      resolve: jest.fn(async () => ({
        identityId: 71,
        identityType: "customer",
        scopeId: 5,
        scopeType: "customer_profile",
        userId: 41
      }))
    };
    const service = new RealtimeService(
      repository as never,
      { publish: jest.fn(), subscribe: jest.fn() } as never,
      scope as never,
      undefined,
      () => now
    );

    await expect(service.ensureTechnicianBusinessConversation({
      userId: 41,
      currentIdentityId: 71,
      currentIdentityType: "customer"
    } as never, "s0000000052")).resolves.toEqual({
      conversationId: 92,
      expiresAt: "2026-09-22T03:00:00.000Z"
    });
    expect(repository.ensureTechnicianBusinessConversation).toHaveBeenCalledWith({
      customerIdentityId: 71,
      customerUserId: 41,
      technicianPublicId: "s0000000052",
      now
    });
  });
});
