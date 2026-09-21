import {
  WorkStatusRepository,
  WorkStatusSession
} from "../src/repositories/work-status.repository";
import type { PrismaClient } from "@prisma/client";
it("returns an active service across midnight without restricting it to today", async () => {
  const active = jest.fn(async ({ where }: { where: { shopId?: number } }) =>
    where.shopId === 3 ? { id: 88, shopId: 3 } : null
  );
  const db = {
    technicianProfile: {
      findFirst: jest.fn(async () => ({
        shopId: 3,
        currentOperatingShopId: 3,
        technicianShopAffiliations: [
          {
            shopId: 3,
            shop: {
              id: 3,
              name: "Current shop",
              publicIdentifier: { publicId: "shop0000000003", deletedAt: null }
            }
          }
        ]
      })),
      update: jest.fn()
    },
    shop: {
      findFirst: jest.fn(async ({ where }: { where: { id: number } }) => ({
        id: where.id,
        name: `Shop ${where.id}`,
        publicIdentifier: { publicId: `shop${where.id}`, deletedAt: null }
      }))
    },
    technicianWorkState: {
      findFirst: jest.fn(async ({ where }: { where: { shopId: number } }) =>
        where.shopId === 3
          ? {
              shopId: 3,
              status: "on_duty",
              version: 4,
              syncedAt: new Date("2026-09-06T14:00:00Z")
            }
          : null
      )
    },
    bookingOrder: { findFirst: active },
    technicianAttendanceIncident: { count: jest.fn(async () => 0) }
  };
  const snapshot = await new WorkStatusSession(
    db as unknown as ConstructorParameters<typeof WorkStatusSession>[0]
  ).snapshot({ technicianProfileId: 12 }, new Date("2026-09-06T16:00:00Z"));
  expect(snapshot).toMatchObject({ status: "in_service", activeOrderId: 88, version: 4 });
  expect(
    await new WorkStatusSession(
      db as unknown as ConstructorParameters<typeof WorkStatusSession>[0]
    ).snapshot({ technicianProfileId: 12, shopId: 4 }, new Date("2026-09-06T16:00:00Z"))
  ).toMatchObject({ status: "unsynced", activeOrderId: null, currentShop: { id: 4 } });
  expect(active).toHaveBeenCalledWith({
    where: { technicianProfileId: 12, shopId: 3, deletedAt: null, status: "IN_SERVICE" },
    select: { id: true, shopId: true }
  });
});

it("checks for an active shop affiliation at the requested instant", async () => {
  const findFirst = jest.fn(async () => ({ id: 91 }));
  const db = {
    technicianShopAffiliation: { findFirst }
  };
  const now = new Date("2026-09-09T04:30:00.000Z");

  await expect(
    new WorkStatusSession(
      db as unknown as ConstructorParameters<typeof WorkStatusSession>[0]
    ).hasActiveAffiliation(12, now)
  ).resolves.toEqual({ id: 91 });
  expect(findFirst).toHaveBeenCalledWith({
    where: {
      technicianProfileId: 12,
      activeKey: { not: null },
      deletedAt: null,
      workStatus: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      shop: { status: "published", deletedAt: null }
    },
    select: { id: true }
  });
});

it("scopes attendance to the canonical active shop affiliation", async () => {
  const findFirst = jest.fn().mockResolvedValue({ id: 12 });
  const db = { technicianProfile: { findFirst } };
  const now = new Date("2026-09-13T04:30:00.000Z");

  await new WorkStatusSession(
    db as unknown as ConstructorParameters<typeof WorkStatusSession>[0]
  ).assertScope({ technicianProfileId: 12, shopId: 16 }, now);

  expect(findFirst).toHaveBeenCalledWith({
    where: {
      id: 12,
      deletedAt: null,
      technicianShopAffiliations: {
        some: {
          shopId: 16,
          activeKey: { not: null },
          deletedAt: null,
          workStatus: "ACTIVE",
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          shop: { status: "published", deletedAt: null }
        }
      }
    },
    select: { id: true }
  });
});

it("reads each merchant shop's independent status and active service", async () => {
  const db = {
    shop: {
      findFirst: jest.fn(async () => ({
        id: 4,
        name: "Merchant shop",
        publicIdentifier: { publicId: "shop0000000004", deletedAt: null }
      }))
    },
    technicianWorkState: {
      findFirst: jest.fn(async () => ({
        shopId: 4,
        status: "resting",
        version: 4,
        syncedAt: new Date("2026-09-21T01:00:00Z"),
        shop: null
      }))
    },
    bookingOrder: { findFirst: jest.fn(async () => null) },
    technicianAttendanceIncident: { count: jest.fn(async () => 0) }
  };
  const session = new WorkStatusSession(
    db as unknown as ConstructorParameters<typeof WorkStatusSession>[0]
  );

  await expect(
    session.snapshot({ technicianProfileId: 12, shopId: 4 }, new Date("2026-09-21T02:00:00Z"))
  ).resolves.toMatchObject({
    status: "resting",
    activeOrderId: null,
    currentShop: { id: 4 },
    version: 4
  });
});

it("limits a merchant timeline to events recorded for that shop", async () => {
  const findMany = jest.fn(async () => []);
  const count = jest.fn(async () => 0);
  const db = {
    technicianWorkEvent: { findMany, count }
  };
  const session = new WorkStatusSession(
    db as unknown as ConstructorParameters<typeof WorkStatusSession>[0]
  );

  await session.events(
    { technicianProfileId: 12, shopId: 4 },
    { page: 1, page_size: 20 }
  );

  expect(findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ shopId: 4 })
    })
  );
  const [query] = findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }];
  const where = query.where;
  expect(where).not.toHaveProperty("OR");
});

it("targets realtime invalidation only to the affected shop's merchants", async () => {
  const profileFindFirst = jest.fn(async () => ({
    userId: 7,
    technicianShopAffiliations: [
      {
        shopId: 4,
        shop: { merchantMemberships: [{ merchantAccountId: 44 }] }
      }
    ]
  }));
  const identityFindMany = jest.fn(async () => []);
  const repository = new WorkStatusRepository({
    technicianProfile: { findFirst: profileFindFirst },
    userIdentity: { findMany: identityFindMany }
  } as unknown as PrismaClient);

  await repository.recipients(12, 4);

  expect(profileFindFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      select: expect.objectContaining({
        technicianShopAffiliations: expect.objectContaining({
          where: expect.objectContaining({ shopId: 4 })
        })
      })
    })
  );
  expect(identityFindMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({ scopeType: "shop", scopeId: { in: [4] } }),
          expect.objectContaining({ scopeId: { in: [44] } })
        ])
      })
    })
  );
});

it("keeps operating-shop switches private from every merchant", async () => {
  const identityFindMany = jest.fn(async () => []);
  const repository = new WorkStatusRepository({
    technicianProfile: {
      findFirst: jest.fn(async () => ({ userId: 7, technicianShopAffiliations: [] }))
    },
    userIdentity: { findMany: identityFindMany }
  } as unknown as PrismaClient);

  await repository.recipients(12, undefined, false);

  const [{ where }] = identityFindMany.mock.calls[0] as unknown as [
    { where: { OR: Array<{ scopeType?: unknown }> } }
  ];
  expect(where.OR).toHaveLength(2);
  expect(where.OR).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ scopeType: "shop" })])
  );
});
