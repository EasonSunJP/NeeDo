import type { PrismaClient } from "@prisma/client";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

describe("RealtimeRepository contact visibility", () => {
  it("excludes a non-friend business contact when no accessible direct conversation exists", async () => {
    const createdAt = new Date("2026-09-06T00:00:00.000Z");
    const unavailableContact = {
      id: 7546,
      ownerUserId: 787,
      ownerIdentityId: 1287,
      contactUserId: 135,
      contactIdentityId: 136,
      nickname: null,
      source: "admin_6m_20260906_v1",
      blockedAt: null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      contactIdentity: {
        id: 136,
        type: "technician",
        displayName: "安藤 凛"
      },
      contactUser: {
        id: 135,
        needoId: "u6282136432",
        username: "安藤 凛",
        avatarUrl: null,
        customerProfile: null,
        technicianProfile: { displayName: "安藤 凛", deletedAt: null }
      }
    };
    const hasOpenableRelationshipFilter = (where: Record<string, unknown>): boolean =>
      Array.isArray(where.OR) && where.OR.length === 2;
    const client = {
      conversation: { findMany: jest.fn(async () => []) },
      contact: {
        findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
          hasOpenableRelationshipFilter(where) ? [] : [unavailableContact]
        ),
        count: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
          hasOpenableRelationshipFilter(where) ? 0 : 1
        )
      }
    } as unknown as PrismaClient;

    const result = await new RealtimeRepository(client).listContacts(1287, {
      page: 1,
      pageSize: 100
    });

    expect(result).toMatchObject({ list: [], total: 0 });
    expect(client.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: "DIRECT",
          deletedAt: null,
          participants: { some: { identityId: 1287, hiddenAt: null, deletedAt: null } }
        })
      })
    );
  });
});
