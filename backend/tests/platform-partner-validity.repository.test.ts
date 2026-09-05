import { PlatformPartnerRepository } from "../src/repositories/platform-partner.repository";

const startsAt = new Date("2026-09-06T00:00:00.000Z");
const endsAt = new Date("2026-10-06T00:00:00.000Z");

function fixture(overlap: { id: number } | null) {
  const findFirst = jest.fn(async () => overlap);
  const create = jest.fn(async () => ({
    id: 41,
    publicId: "11111111-1111-4111-8111-111111111111",
    partnerType: "AGENT",
    activatedAt: startsAt,
    endsAt,
    markedById: 1,
    reason: "Signed agency contract",
    createdAt: startsAt,
    user: {
      id: 88,
      needoId: "u0000000088",
      username: "Agent",
      avatarUrl: null,
      isActive: true
    }
  }));
  const transaction = {
    $queryRaw: jest.fn(async () => [{ id: 88 }]),
    user: { findFirst: jest.fn(async () => ({ id: 88 })) },
    platformPartnerProfile: { findFirst, create }
  };
  const client = {
    $transaction: jest.fn(async (callback: (value: typeof transaction) => unknown) =>
      callback(transaction)
    )
  };
  return {
    repository: new PlatformPartnerRepository(client as never),
    transaction,
    findFirst,
    create
  };
}

describe("PlatformPartnerRepository validity ranges", () => {
  it("locks the user and rejects an overlapping range for the same partner type", async () => {
    const test = fixture({ id: 40 });

    await expect(test.repository.markPartnerProfile({
      userId: 88,
      partnerType: "AGENT",
      startsAt,
      endsAt,
      markedById: 1,
      reason: "Signed agency contract"
    })).resolves.toEqual({ kind: "overlap" });

    expect(test.transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(test.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 88,
        partnerType: "AGENT",
        deletedAt: null,
        activatedAt: { lt: endsAt },
        OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }]
      },
      select: { id: true }
    });
    expect(test.create).not.toHaveBeenCalled();
  });

  it("creates a new immutable row when the same-type range does not overlap", async () => {
    const test = fixture(null);

    await expect(test.repository.markPartnerProfile({
      userId: 88,
      partnerType: "FRANCHISEE",
      startsAt,
      endsAt: null,
      markedById: 1,
      reason: "Permanent franchise agreement"
    })).resolves.toMatchObject({ kind: "created" });

    expect(test.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ partnerType: "FRANCHISEE", activatedAt: undefined })
    }));
    expect(test.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        partnerType: "FRANCHISEE",
        activatedAt: startsAt,
        endsAt: null
      })
    }));
  });
});
