import type { PrismaClient } from "@prisma/client";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

describe("RealtimeRepository friend request lifecycle", () => {
  it("derives the 72-hour expiry from the database clock", async () => {
    const dbNow = new Date("2026-08-30T00:00:00.000Z");
    const expiresAt = new Date("2026-09-02T00:00:00.000Z");
    const friendRequest = {
      id: 19,
      requesterUserId: 41,
      targetUserId: 167,
      status: "PENDING",
      message: null,
      respondedAt: null,
      expiresAt,
      expiredAt: null,
      createdAt: dbNow,
      updatedAt: dbNow,
      deletedAt: null
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ dbNow }]),
      friendRequest: { create: jest.fn().mockResolvedValue(friendRequest) },
      notification: { create: jest.fn().mockResolvedValue({ id: 1 }) }
    };
    const client = {
      $transaction: jest.fn(async (callback: (database: typeof tx) => unknown) => callback(tx))
    } as unknown as PrismaClient;

    await new RealtimeRepository(client).createFriendRequest({
      requesterUserId: 41,
      targetUserId: 167
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.friendRequest.create).toHaveBeenCalledWith({
      data: {
        requesterUserId: 41,
        targetUserId: 167,
        message: null,
        expiresAt
      }
    });
  });
});
