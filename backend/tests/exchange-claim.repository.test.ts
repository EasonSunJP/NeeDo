import type { PrismaClient } from "@prisma/client";
import { ExchangeClaimRepository } from "../src/repositories/exchange-claim.repository";

type SqlQuery = { sql?: string; strings?: readonly string[]; values?: unknown[] };

const now = new Date("2026-09-01T00:00:00.000Z");

const optionRow = {
  scheduleSlotId: 91,
  shopId: 11,
  shopName: "Aoyama Care",
  technicianProfileId: 81,
  technicianPublicId: "S000000081",
  technicianDisplayName: "山田 花子",
  serviceId: 501,
  technicianServiceId: null,
  serviceName: "ヘアセット",
  durationMinutes: 60,
  startsAt: new Date("2026-09-02T01:00:00.000Z"),
  endsAt: new Date("2026-09-02T02:00:00.000Z")
};

const claimRow = {
  id: 301,
  exchangePostId: 41,
  claimantUserId: 7,
  claimantIdentityId: 17,
  shopId: 11,
  technicianProfileId: 81,
  serviceId: 501,
  technicianServiceId: null,
  scheduleSlotId: 91,
  quoteAmountJpy: 15_000,
  currency: "JPY",
  message: null,
  status: "ACTIVE",
  activeKey: "request:41:technician:81",
  idempotencyKey: "claim-key-00000001",
  payloadFingerprint: "a".repeat(64),
  withdrawalIdempotencyKey: null,
  withdrawalPayloadFingerprint: null,
  withdrawnAt: null,
  terminalAt: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  claimantIdentity: {
    displayName: "青山店",
    publicIdentifier: { publicId: "M000000017" },
    user: { username: "aoyama", avatarUrl: null }
  },
  shop: { id: 11, name: "Aoyama Care" },
  technicianProfile: {
    id: 81,
    displayName: "山田 花子",
    user: {
      identities: [
        {
          displayName: "山田 花子",
          publicIdentifier: { publicId: "S000000081" }
        }
      ]
    }
  },
  service: { id: 501, name: "ヘアセット", durationMinutes: 60 },
  technicianService: null,
  scheduleSlot: {
    id: 91,
    startsAt: new Date("2026-09-02T01:00:00.000Z"),
    endsAt: new Date("2026-09-02T02:00:00.000Z")
  }
};

describe("ExchangeClaimRepository option projection", () => {
  it("paginates merchant options through formal affiliation, schedule and overlap authorities", async () => {
    const queryRaw = jest.fn(async (query: SqlQuery) =>
      query.sql?.includes("COUNT(*)") ? [{ total: 1n }] : [optionRow]
    );
    const repository = new ExchangeClaimRepository({
      $queryRaw: queryRaw
    } as unknown as PrismaClient);

    await expect(
      repository.listOptions({
        postId: 41,
        scope: { kind: "merchant", shopId: 11 },
        page: 1,
        pageSize: 20,
        now
      })
    ).resolves.toEqual({
      list: [
        {
          scheduleSlotId: 91,
          shop: { id: 11, name: "Aoyama Care" },
          technician: {
            profileId: 81,
            publicId: "S000000081",
            displayName: "山田 花子"
          },
          service: { ref: "shop:501", name: "ヘアセット", durationMinutes: 60 },
          startsAt: "2026-09-02T01:00:00.000Z",
          endsAt: "2026-09-02T02:00:00.000Z"
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    });

    const sql = queryRaw.mock.calls.map(([query]) => query.sql ?? "").join("\n");
    expect(sql).toContain("FROM `exchange_posts` AS post");
    expect(sql).toContain("JOIN `exchange_demands` AS demand");
    expect(sql).toContain("JOIN `technician_shop_affiliations` AS affiliation");
    expect(sql).toContain("slot.`booked_count` < slot.`capacity`");
    expect(sql).toContain("affiliation.`work_status` = 'active'");
    expect(sql).toContain("slot.`starts_at` >= post.`service_start_at`");
    expect(sql).toContain("slot.`ends_at` <= post.`service_end_at`");
    expect(sql).toContain("shop_service.`shop_id` = slot.`shop_id`");
    expect(sql).toContain("technician_service.`shop_id` = slot.`shop_id`");
    expect(sql).toContain("technician_service.`technician_id` = slot.`technician_profile_id`");
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("FROM `exchange_claims` AS active_claim");
    expect(sql).toContain("FROM `exchange_match_participants` AS matched_participant");
    expect(sql).toContain("matched_participant.`active_reservation_key` IS NOT NULL");
    expect(sql).toContain("FROM `booking_orders` AS busy_order");
    expect(sql).toContain("slot.`shop_id` =");
    expect(sql).toContain("suspension.`active_key` IS NOT NULL");
  });

  it("scopes technician options to the current technician profile and optional formal filters", async () => {
    const queryRaw = jest.fn(async (query: SqlQuery) =>
      query.sql?.includes("COUNT(*)")
        ? [{ total: 1n }]
        : [{ ...optionRow, serviceId: null, technicianServiceId: 701 }]
    );
    const repository = new ExchangeClaimRepository({
      $queryRaw: queryRaw
    } as unknown as PrismaClient);

    const result = await repository.listOptions({
      postId: 41,
      scope: { kind: "technician", technicianProfileId: 81 },
      shopId: 11,
      technicianProfileId: 81,
      serviceRef: "technician:701",
      page: 2,
      pageSize: 20,
      now
    });

    expect(result.list[0]?.service.ref).toBe("technician:701");
    expect(result.page).toBe(2);
    const sql = queryRaw.mock.calls.map(([query]) => query.sql ?? "").join("\n");
    expect(sql).toContain("slot.`technician_profile_id` =");
    expect(sql).toContain("slot.`shop_id` =");
    expect(sql).toContain("slot.`technician_service_id` =");
    expect(sql).toContain("LIMIT");
    expect(sql).toContain("OFFSET");
  });
});

describe("ExchangeClaimRepository mutation primitives", () => {
  it("locks and advances the matching version with one append-only claim event", async () => {
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const eventCreate = jest.fn(async () => ({ id: 81 }));
    const repository = new ExchangeClaimRepository({
      $queryRaw: jest.fn(async () => [{ id: 51 }]),
      exchangeRequestMatching: {
        findUnique: jest.fn(async () => ({ id: 51, status: "OPEN", version: 3 })),
        updateMany
      },
      exchangeMatchEvent: { create: eventCreate }
    } as unknown as PrismaClient);

    await expect(repository.lockMatching(41)).resolves.toEqual({
      id: 51,
      status: "open",
      version: 3
    });
    await expect(
      repository.advanceMatchingForClaimEvent({
        matchingId: 51,
        exchangePostId: 41,
        claimId: 301,
        type: "claim_added",
        actorUserId: 7,
        actorIdentityId: 17,
        versionBefore: 3,
        at: now
      })
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 51,
        exchangePostId: 41,
        status: "OPEN",
        version: 3,
        deletedAt: null
      },
      data: { version: 4, updatedAt: now }
    });
    expect(eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        matchingId: 51,
        sequence: 4,
        type: "CLAIM_ADDED",
        versionBefore: 3,
        versionAfter: 4,
        payload: { exchangePostId: 41, exchangeClaimId: 301 }
      })
    });
  });

  it("detects an overlapping selected participant without touching a schedule slot", async () => {
    const findFirst = jest.fn(async () => ({ id: 71 }));
    const repository = new ExchangeClaimRepository({
      exchangeMatchParticipant: { findFirst }
    } as unknown as PrismaClient);
    const startsAt = new Date("2026-09-02T01:00:00.000Z");
    const endsAt = new Date("2026-09-02T02:00:00.000Z");
    await expect(repository.hasOverlappingMatchParticipant(81, startsAt, endsAt)).resolves.toBe(
      true
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        technicianProfileId: 81,
        estimatedStartsAt: { lt: endsAt },
        estimatedEndsAt: { gt: startsAt },
        activeReservationKey: { not: null },
        deletedAt: null
      },
      select: { id: true }
    });
  });

  it("runs request, technician and schedule locks before conflict checks and creation", async () => {
    const events: string[] = [];
    const queryRaw = jest.fn(async (query: SqlQuery) => {
      const sql = query.sql ?? "";
      if (sql.includes("FROM `exchange_posts`")) {
        events.push("lock-request");
        return [{ id: 41 }];
      }
      if (sql.includes("FROM `technician_profiles`")) {
        events.push("lock-technician");
        return [{ id: 81 }];
      }
      if (sql.includes("FROM `schedule_slots`")) {
        events.push("lock-slot");
        return [{ id: 91 }];
      }
      return [];
    });
    const exchangePost = {
      findFirst: jest.fn(async () => ({
        id: 41,
        authorUserId: 99,
        ownerIdentityId: 21,
        type: "DEMAND",
        status: "PUBLISHED",
        serviceStartAt: new Date("2026-09-02T00:00:00.000Z"),
        serviceEndAt: new Date("2026-09-02T04:00:00.000Z"),
        expiresAt: new Date("2026-09-01T12:00:00.000Z"),
        demand: { matchMode: "SELECTIVE", budgetMinJpy: 10_000, budgetMaxJpy: 30_000 }
      }))
    };
    const scheduleSlot = {
      findFirst: jest.fn(async () => ({
        id: 91,
        shopId: 11,
        technicianProfileId: 81,
        serviceId: 501,
        technicianServiceId: null,
        startsAt: new Date("2026-09-02T01:00:00.000Z"),
        endsAt: new Date("2026-09-02T02:00:00.000Z"),
        service: { name: "ヘアセット", durationMinutes: 60, shopId: 11 },
        technicianService: null,
        technicianProfile: {
          technicianShopAffiliations: [{ shopId: 11 }]
        }
      }))
    };
    const exchangeClaim = {
      findFirst: jest.fn(async () => {
        events.push("check-claim-conflict");
        return null;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        events.push("create-claim");
        return {
          ...claimRow,
          ...data
        };
      })
    };
    const bookingOrder = {
      findFirst: jest.fn(async () => {
        events.push("check-booking-conflict");
        return null;
      })
    };
    const transactionClient = {
      $queryRaw: queryRaw,
      exchangePost,
      scheduleSlot,
      exchangeClaim,
      bookingOrder
    };
    const transaction = jest.fn(
      async (handler: (client: typeof transactionClient) => Promise<unknown>) =>
        handler(transactionClient)
    );
    const repository = new ExchangeClaimRepository({
      $transaction: transaction
    } as unknown as PrismaClient);

    await repository.runInTransaction(async (lockedRepository) => {
      const request = await lockedRepository.lockRequest(41);
      expect(request).toMatchObject({
        id: 41,
        authorUserId: 99,
        type: "demand",
        status: "published",
        demand: { matchMode: "selective", budgetMinJpy: 10_000, budgetMaxJpy: 30_000 }
      });
      await expect(lockedRepository.lockTechnician(81)).resolves.toBe(true);
      const option = await lockedRepository.lockOption(91, {
        kind: "merchant",
        shopId: 11
      });
      expect(option).toMatchObject({
        scheduleSlotId: 91,
        shopId: 11,
        technicianProfileId: 81,
        serviceId: 501,
        technicianServiceId: null
      });
      await expect(
        lockedRepository.hasOverlappingActiveClaim(81, option!.startsAt, option!.endsAt)
      ).resolves.toBe(false);
      await expect(
        lockedRepository.hasConflictingBooking(81, option!.startsAt, option!.endsAt)
      ).resolves.toBe(false);
      await lockedRepository.create({
        exchangePostId: 41,
        claimantUserId: 7,
        claimantIdentityId: 17,
        shopId: 11,
        technicianProfileId: 81,
        serviceId: 501,
        technicianServiceId: null,
        scheduleSlotId: 91,
        quoteAmountJpy: 15_000,
        message: null,
        idempotencyKey: "claim-key-00000001",
        payloadFingerprint: "a".repeat(64),
        now
      });
    });

    expect(events).toEqual([
      "lock-request",
      "lock-technician",
      "lock-slot",
      "check-claim-conflict",
      "check-booking-conflict",
      "create-claim"
    ]);
    expect(exchangeClaim.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activeKey: "request:41:technician:81",
        status: "ACTIVE"
      }),
      include: expect.any(Object)
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "ReadCommitted"
    });
  });

  it("rejects a locked slot whose service belongs to another shop", async () => {
    const repository = new ExchangeClaimRepository({
      $queryRaw: jest.fn(async () => [{ id: 91 }]),
      scheduleSlot: {
        findFirst: jest.fn(async () => ({
          id: 91,
          shopId: 11,
          technicianProfileId: 81,
          serviceId: 501,
          technicianServiceId: null,
          startsAt: new Date("2026-09-02T01:00:00.000Z"),
          endsAt: new Date("2026-09-02T02:00:00.000Z"),
          capacity: 1,
          bookedCount: 0,
          service: {
            name: "Foreign service",
            durationMinutes: 60,
            shopId: 99
          },
          technicianService: null,
          technicianProfile: {
            technicianShopAffiliations: [{ shopId: 11 }]
          }
        }))
      }
    } as unknown as PrismaClient);

    await expect(
      repository.lockOption(91, { kind: "merchant", shopId: 11 }, now)
    ).resolves.toBeNull();
  });

  it("rejects a technician slot when only another shop affiliation remains active", async () => {
    const repository = new ExchangeClaimRepository({
      $queryRaw: jest.fn(async () => [{ id: 91 }]),
      scheduleSlot: {
        findFirst: jest.fn(async () => ({
          id: 91,
          shopId: 11,
          technicianProfileId: 81,
          serviceId: 501,
          technicianServiceId: null,
          startsAt: new Date("2026-09-02T01:00:00.000Z"),
          endsAt: new Date("2026-09-02T02:00:00.000Z"),
          capacity: 1,
          bookedCount: 0,
          service: { name: "Former shop service", durationMinutes: 60, shopId: 11 },
          technicianService: null,
          technicianProfile: {
            technicianShopAffiliations: [{ shopId: 12 }]
          }
        }))
      }
    } as unknown as PrismaClient);

    await expect(
      repository.lockOption(91, { kind: "technician", technicianProfileId: 81 }, now)
    ).resolves.toBeNull();
  });

  it("resolves only a provider-scoped technician candidate and detects same-request duplicates", async () => {
    const slotFindFirst = jest.fn(async () => ({ technicianProfileId: 81 }));
    const claimFindFirst = jest.fn(async () => ({ id: 301 }));
    const repository = new ExchangeClaimRepository({
      scheduleSlot: { findFirst: slotFindFirst },
      exchangeClaim: { findFirst: claimFindFirst }
    } as unknown as PrismaClient);

    await expect(
      repository.findOptionCandidate(91, { kind: "merchant", shopId: 11 })
    ).resolves.toEqual({ technicianProfileId: 81 });
    await expect(
      repository.findOptionCandidate(91, {
        kind: "technician",
        technicianProfileId: 81
      })
    ).resolves.toEqual({ technicianProfileId: 81 });
    await expect(repository.hasActiveClaimForRequestTechnician(41, 81)).resolves.toBe(true);
    expect(slotFindFirst).toHaveBeenNthCalledWith(1, {
      where: { id: 91, shopId: 11, technicianProfileId: { not: null }, deletedAt: null },
      select: { technicianProfileId: true }
    });
    expect(slotFindFirst).toHaveBeenNthCalledWith(2, {
      where: { id: 91, technicianProfileId: 81, deletedAt: null },
      select: { technicianProfileId: true }
    });
    expect(claimFindFirst).toHaveBeenCalledWith({
      where: {
        exchangePostId: 41,
        technicianProfileId: 81,
        status: "ACTIVE",
        deletedAt: null
      },
      select: { id: true }
    });
  });

  it("scopes idempotent, own and owner reads and releases the active key on withdraw", async () => {
    let withdrawn = false;
    const findFirst = jest.fn(async () =>
      withdrawn
        ? {
            ...claimRow,
            status: "WITHDRAWN",
            activeKey: null,
            withdrawnAt: now,
            terminalAt: now
          }
        : claimRow
    );
    const findMany = jest.fn(async () => [claimRow]);
    const count = jest.fn(async () => 1);
    const updateMany = jest.fn(async () => {
      withdrawn = true;
      return { count: 1 };
    });
    const queryRaw = jest.fn(async () => [{ id: 301 }]);
    const auditCreate = jest.fn(async () => ({ id: 1 }));
    const repository = new ExchangeClaimRepository({
      $queryRaw: queryRaw,
      exchangeClaim: { findFirst, findMany, count, updateMany },
      auditLog: { create: auditCreate }
    } as unknown as PrismaClient);

    await expect(repository.findIdempotent("claim-key-00000001")).resolves.toMatchObject({
      claim: { id: 301, status: "active" },
      fingerprint: "a".repeat(64)
    });
    await expect(repository.findMine(41, 17)).resolves.toMatchObject({
      id: 301,
      exchangePostId: 41
    });
    await expect(repository.findMineById(301, 17)).resolves.toMatchObject({
      id: 301,
      exchangePostId: 41
    });
    await expect(repository.listReceived(41, 21, { page: 1, pageSize: 20 })).resolves.toMatchObject(
      { total: 1, page: 1, page_size: 20 }
    );
    await expect(repository.lockClaim(301)).resolves.toMatchObject({
      id: 301,
      exchangePostId: 41,
      claimantIdentityId: 17,
      status: "active"
    });
    await expect(
      repository.withdraw(301, 17, now, "claim-withdraw-key-0001", "b".repeat(64))
    ).resolves.toMatchObject({
      id: 301,
      status: "withdrawn"
    });
    await repository.createAudit({
      actorId: 7,
      action: "exchange.claim.withdraw",
      targetType: "exchange_claim",
      targetId: 301,
      metadata: { exchangePostId: 41 }
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: { idempotencyKey: "claim-key-00000001", deletedAt: null },
      include: expect.any(Object)
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ exchangePostId: 41, claimantIdentityId: 17 })
      })
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          exchangePostId: 41,
          exchangePost: { is: { ownerIdentityId: 21, deletedAt: null } },
          deletedAt: null
        }),
        take: 20,
        skip: 0
      })
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 301,
        claimantIdentityId: 17,
        status: "ACTIVE",
        deletedAt: null
      },
      data: {
        status: "WITHDRAWN",
        activeKey: null,
        withdrawnAt: now,
        terminalAt: now,
        withdrawalIdempotencyKey: "claim-withdraw-key-0001",
        withdrawalPayloadFingerprint: "b".repeat(64),
        updatedAt: now
      }
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "exchange.claim.withdraw", targetId: 301 })
    });
  });
});
