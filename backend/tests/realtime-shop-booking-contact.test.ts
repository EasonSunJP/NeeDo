import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, jest } from "@jest/globals";
import { RealtimeRepository } from "../src/repositories/realtime.repository";
import { RealtimeService } from "../src/services/realtime.service";

const now = new Date("2026-09-24T03:00:00.000Z");

describe("shop booking contact conversation", () => {
  it("opens a reusable business chat for the configured owner without a conversation deadline", async () => {
    const transaction = {
      conversation: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({ id: 94 }))
      }
    };
    const client = {
      shop: { findFirst: jest.fn(async () => ({
        ownerUserId: 51,
        createdById: 51,
        bookingContactTarget: "owner",
        bookingContactEmployeeNeedoId: null,
        merchantMemberships: [{ merchantAccountId: 8 }]
      })) },
      userIdentity: { findFirst: jest.fn(async () => ({ id: 71, userId: 51 })) },
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction))
    } as unknown as PrismaClient;
    const repository = new RealtimeRepository(client);

    await expect(repository.ensureShopBookingContactConversation({
      customerUserId: 41,
      customerIdentityId: 61,
      shopId: 36,
      nominatedTechnicianProfileId: null,
      now
    })).resolves.toEqual({ conversationId: 94, expiresAt: null });
    expect(transaction.conversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accessPolicy: "BUSINESS_CONTEXT",
        businessContextType: "shop_booking_contact",
        businessContextShopId: 36,
        businessContextExpiresAt: null,
        participants: { create: [
          { userId: 41, identityId: 61, role: "member" },
          { userId: 51, identityId: 71, role: "member" }
        ] }
      }),
      select: { id: true }
    });
  });

  it("requires a customer identity and forwards the nominated technician only as a hint", async () => {
    const repository = {
      ensureShopBookingContactConversation: jest.fn(async () => ({ conversationId: 94, expiresAt: null }))
    };
    const scope = { resolve: jest.fn(async () => ({
      identityId: 61, identityType: "customer", scopeType: "customer_profile", scopeId: 3, userId: 41
    })) };
    const service = new RealtimeService(repository as never, { publish: jest.fn(), subscribe: jest.fn() } as never, scope as never, undefined, () => now);
    await expect(service.ensureShopBookingContactConversation({ userId: 41 } as never, 36, 19)).resolves.toEqual({ conversationId: 94, expiresAt: null });
    expect(repository.ensureShopBookingContactConversation).toHaveBeenCalledWith({
      customerUserId: 41,
      customerIdentityId: 61,
      shopId: 36,
      nominatedTechnicianProfileId: 19,
      now
    });
  });
});
