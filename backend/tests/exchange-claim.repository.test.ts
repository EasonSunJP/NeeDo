import type { PrismaClient } from "@prisma/client";
import { ExchangeClaimRepository } from "../src/repositories/exchange-claim.repository";
import { encodeDynamicAvailabilityId } from "../src/domain/dynamic-booking-window";
import { BookingRepository } from "../src/repositories/booking.repository";
import type { ExchangeClaimRequestRecord } from "../src/repositories/exchange-claim.repository";

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
  source: "shop_dispatch",
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
  shop: { id: 11, name: "Aoyama Care", publicIdentifier: { publicId: "shop0000000011" } },
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
  service: { id: 501, publicId: "service0000000501", name: "ヘアセット", durationMinutes: 60 },
  technicianService: null,
  scheduleSlot: {
    id: 91,
    startsAt: new Date("2026-09-02T01:00:00.000Z"),
    endsAt: new Date("2026-09-02T02:00:00.000Z")
  }
};

describe("ExchangeClaimRepository option projection", () => {
  it("requires both the service category and an active shop keyword for tagged Requests", async () => {
    const request: ExchangeClaimRequestRecord = {
      id: 41, authorUserId: 99, ownerIdentityId: 98, type: "demand", status: "published",
      serviceStartAt: now, serviceEndAt: now, expiresAt: now,
      demand: { matchMode: "selective", budgetMinJpy: null, budgetMaxJpy: 30000,
        categoryId: 1, businessKeywordIds: [10] }
    };
    const service = { findUnique: jest.fn(async () => ({ categoryId: 2, category: { isActive: true, deletedAt: null } })) };
    let matchedKeyword: { id: number } | null = { id: 1 };
    const keywords = { findFirst: jest.fn(async () => matchedKeyword) };
    const repository = new ExchangeClaimRepository({
      service,
      shopBusinessKeyword: keywords
    } as unknown as PrismaClient);
    const lockedOption = {
      scheduleSlotId: 91, shopId: 11, technicianProfileId: 81, technicianUserId: 8,
      serviceId: 501, technicianServiceId: null, serviceName: "massage", durationMinutes: 60,
      startsAt: now, endsAt: now
    };
    await expect(repository.matchesRequestTaxonomy(request, lockedOption)).resolves.toBe(false);
    service.findUnique.mockResolvedValue({ categoryId: 1, category: { isActive: true, deletedAt: null } });
    matchedKeyword = null;
    await expect(repository.matchesRequestTaxonomy(request, lockedOption)).resolves.toBe(false);
    matchedKeyword = { id: 1 };
    await expect(repository.matchesRequestTaxonomy(request, lockedOption)).resolves.toBe(true);
    expect(keywords.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({
      shopId: 11, businessKeywordId: { in: [10] }, deletedAt: null
    }), select: { id: true } });
  });

  it("paginates merchant options through formal affiliation, schedule and overlap authorities", async () => {
    const queryRaw = jest.fn(async (query: SqlQuery) =>
      query.sql?.includes("SELECT COUNT(*) AS total") ? [{ total: 1n }] : [optionRow]
    );
    const repository = new ExchangeClaimRepository({
      $queryRaw: queryRaw,
      scheduleCycle: { findMany: jest.fn(async () => []) },
      availability: { findMany: jest.fn(async () => []) }
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
    expect(sql).toContain("JOIN `exchange_request_matchings` AS matching");
    expect(sql).toContain("matching.`status` = 'open'");
    expect(sql).toContain("demand.`match_mode` = 'quick'");
    expect(sql).toContain("capacity_claim.`status` = 'active'");
    expect(sql).toContain("matching.`effective_target_provider_count`");
    expect(sql).toContain("JOIN `technician_shop_affiliations` AS affiliation");
    expect(sql).toContain("slot.`booked_count` < slot.`capacity`");
    expect(sql).toContain("affiliation.`work_status` = 'active'");
    expect(sql).toContain("slot.`starts_at` >= post.`service_start_at`");
    expect(sql).toMatch(/slot\.`starts_at` > \?/u);
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
    expect(sql).toContain("demand.`category_id`");
    expect(sql).toContain("demand.`preferred_technician_gender`");
    expect(sql).toContain("JSON_CONTAINS(demand.`business_keyword_ids_json`");
  });

  it("scopes technician options to the current technician profile and optional formal filters", async () => {
    const queryRaw = jest.fn(async (query: SqlQuery) =>
      query.sql?.includes("SELECT COUNT(*) AS total")
        ? [{ total: 1n }]
        : [{ ...optionRow, serviceId: null, technicianServiceId: 701 }]
    );
    const repository = new ExchangeClaimRepository({
      $queryRaw: queryRaw,
      scheduleCycle: { findMany: jest.fn(async () => []) },
      availability: { findMany: jest.fn(async () => []) }
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

  it("lists current dynamic Booking options with their distinct service references", async () => {
    const dynamicId = encodeDynamicAvailabilityId(81, 30);
    const cycleFindMany = jest.fn(async () => [{
      shopId: 11,
      periodStart: new Date("2026-09-01T00:00:00.000Z"),
      periodEnd: new Date("2026-09-03T00:00:00.000Z"),
      ruleSet: { dynamicAvailability: true }
    }]);
    const bookingOptions = jest.spyOn(BookingRepository.prototype, "listDynamicClaimSlots")
      .mockImplementation(async (input, _technicianIds, visit) => {
        visit?.({ id: dynamicId, shopId: 11, shopName: "Aoyama Care", technicianProfileId: 81,
          technicianName: "山田 花子", serviceId: input.serviceId ?? null, technicianServiceId: null,
          serviceName: input.serviceId === 501 ? "Shop service" : "Second service",
          durationMinutes: 60, startsAt: new Date("2026-09-02T01:00:00.000Z"),
          endsAt: new Date("2026-09-02T02:00:00.000Z"), status: "available" } as never);
        return [];
      });
    try {
      const repository = new ExchangeClaimRepository({
        $queryRaw: jest.fn(async (query: SqlQuery) =>
          query.sql?.includes("SELECT COUNT(*) AS total") ? [{ total: 0n }] : []),
        availability: { findMany: jest.fn(async () => [{ technicianProfileId: 81 }]) },
        scheduleCycle: { findMany: cycleFindMany },
        exchangePost: { findFirst: jest.fn(async () => ({
          id: 41, authorUserId: 99, ownerIdentityId: 98, type: "DEMAND",
          status: "PUBLISHED", serviceStartAt: new Date("2026-09-02T00:00:00.000Z"),
          serviceEndAt: new Date("2026-09-02T03:00:00.000Z"),
          expiresAt: new Date("2026-09-03T00:00:00.000Z"),
          demand: { matchMode: "SELECTIVE", budgetMinJpy: null, budgetMaxJpy: 30000 }
        })) },
        exchangeRequestMatching: { findUnique: jest.fn(async () => ({
          status: "OPEN", effectiveTargetProviderCount: 1
        })) },
        service: { findMany: jest.fn(async () => [
          { id: 501, shopId: 11, durationMinutes: 60 },
          { id: 502, shopId: 11, durationMinutes: 60 }
        ]) },
        technicianService: { findMany: jest.fn(async () => []) },
        userIdentity: { findMany: jest.fn(async () => [{
          scopeId: 81, publicIdentifier: { publicId: "S000000081" }
        }]) },
        exchangeClaim: { findMany: jest.fn(async () => []) }
      } as unknown as PrismaClient);
      const result = await repository.listOptions({
        postId: 41, scope: { kind: "merchant", shopId: 11 }, page: 1, pageSize: 20, now
      });
      expect(result.total).toBe(2);
      expect(result.list.map((option) => option.service.ref)).toEqual(["shop:501", "shop:502"]);
      expect(result.list.map((option) => option.scheduleSlotId)).toEqual([dynamicId, dynamicId]);
      expect(bookingOptions).toHaveBeenCalledWith(expect.objectContaining({
        shopId: 11, from: expect.any(Date), to: expect.any(Date)
      }), undefined, expect.any(Function));
      cycleFindMany.mockResolvedValueOnce([{
        shopId: 11,
        periodStart: new Date("2026-10-01T00:00:00.000Z"),
        periodEnd: new Date("2026-10-03T00:00:00.000Z"),
        ruleSet: { dynamicAvailability: true }
      }]);
      bookingOptions.mockClear();
      await expect(repository.listOptions({
        postId: 41, scope: { kind: "merchant", shopId: 11 }, page: 1, pageSize: 20, now
      })).resolves.toMatchObject({ list: [], total: 0 });
      expect(bookingOptions).not.toHaveBeenCalled();
    } finally {
      bookingOptions.mockRestore();
    }
  });

  it("counts a materialized slot once and removes its dynamic twin across pages", async () => {
    const dynamicId = encodeDynamicAvailabilityId(81, 30);
    const bookingOptions = jest.spyOn(BookingRepository.prototype, "listDynamicClaimSlots")
      .mockImplementation(async (input, _technicianIds, visit) => {
        visit?.({
          id: dynamicId, shopId: 11, shopName: "Aoyama Care", technicianProfileId: 81,
          technicianName: "山田 花子", serviceId: input.serviceId ?? null,
          technicianServiceId: null, serviceName: input.serviceId === 501 ? "ヘアセット" : "Second service",
          durationMinutes: 60, startsAt: new Date("2026-09-02T01:00:00.000Z"),
          endsAt: new Date("2026-09-02T02:00:00.000Z"), status: "available"
        } as never);
        return [];
      });
    try {
      const repository = new ExchangeClaimRepository({
        $queryRaw: jest.fn(async (query: SqlQuery) =>
          query.sql?.includes("SELECT COUNT(*) AS total") ? [{ total: 1n }] : [optionRow]),
        availability: { findMany: jest.fn(async () => [{ technicianProfileId: 81 }]) },
        scheduleCycle: { findMany: jest.fn(async () => [{
          shopId: 11, periodStart: new Date("2026-09-01T00:00:00.000Z"),
          periodEnd: new Date("2026-09-03T00:00:00.000Z"),
          ruleSet: { dynamicAvailability: true }
        }]) },
        exchangePost: { findFirst: jest.fn(async () => ({
          id: 41, authorUserId: 99, ownerIdentityId: 98, type: "DEMAND", status: "PUBLISHED",
          serviceStartAt: new Date("2026-09-02T00:00:00.000Z"),
          serviceEndAt: new Date("2026-09-02T03:00:00.000Z"),
          expiresAt: new Date("2026-09-03T00:00:00.000Z"),
          demand: { matchMode: "SELECTIVE", budgetMinJpy: null, budgetMaxJpy: 30_000 }
        })) },
        exchangeRequestMatching: { findUnique: jest.fn(async () => ({ status: "OPEN" })) },
        service: { findMany: jest.fn(async () => [
          { id: 501, shopId: 11, durationMinutes: 60 },
          { id: 502, shopId: 11, durationMinutes: 60 }
        ]) },
        technicianService: { findMany: jest.fn(async () => []) },
        userIdentity: { findMany: jest.fn(async () => [{
          scopeId: 81, publicIdentifier: { publicId: "S000000081" }
        }]) },
        exchangeClaim: { findMany: jest.fn(async () => []) }
      } as unknown as PrismaClient);
      const input = { postId: 41, scope: { kind: "merchant" as const, shopId: 11 },
        pageSize: 1, now };
      const first = await repository.listOptions({ ...input, page: 1 });
      const second = await repository.listOptions({ ...input, page: 2 });
      expect(first.total).toBe(2);
      expect(second.total).toBe(2);
      expect(first.list.map((option) => [option.scheduleSlotId, option.service.ref]))
        .toEqual([[dynamicId, "shop:502"]]);
      expect(second.list.map((option) => [option.scheduleSlotId, option.service.ref]))
        .toEqual([[91, "shop:501"]]);
    } finally {
      bookingOptions.mockRestore();
    }
  });

  it("counts only claimable dynamic options after Booking and identity filters", async () => {
    const dynamicId = encodeDynamicAvailabilityId(81, 30);
    const activeClaims = jest.fn(async () => [] as Array<{
      technicianProfileId: number;
      scheduleSlot: { startsAt: Date; endsAt: Date };
    }>);
    const bookingOptions = jest.spyOn(BookingRepository.prototype, "listDynamicClaimSlots")
      .mockImplementation(async (_input, _technicianIds, visit) => {
        for (const slot of [
        { id: dynamicId, shopId: 11, shopName: "Shop", technicianProfileId: 81,
          technicianName: "Technician", serviceId: 501, technicianServiceId: null,
          serviceName: "Service", durationMinutes: 60,
          startsAt: new Date("2026-09-02T01:00:00.000Z"),
          endsAt: new Date("2026-09-02T02:00:00.000Z"), status: "available" },
        { id: encodeDynamicAvailabilityId(81, 35), shopId: 11, shopName: "Shop",
          technicianProfileId: 81, technicianName: "Technician", serviceId: 501,
          technicianServiceId: null, serviceName: "Service", durationMinutes: 60,
          startsAt: new Date("2026-09-02T01:00:00.000Z"),
          endsAt: new Date("2026-09-02T02:00:00.000Z"), status: "available" },
        { id: 91, shopId: 11, shopName: "Shop", technicianProfileId: 81,
          technicianName: "Technician", serviceId: 501, technicianServiceId: null,
          serviceName: "Service", durationMinutes: 60,
          startsAt: new Date("2026-09-02T01:00:00.000Z"),
          endsAt: new Date("2026-09-02T02:00:00.000Z"), status: "available" },
        { id: encodeDynamicAvailabilityId(82, 30), shopId: 11, shopName: "Shop",
          technicianProfileId: 82, technicianName: "Other", serviceId: 501,
          technicianServiceId: null, serviceName: "Service", durationMinutes: 60,
          startsAt: new Date("2026-09-02T01:00:00.000Z"),
          endsAt: new Date("2026-09-02T02:00:00.000Z"), status: "available" }
        ]) visit?.(slot as never);
        return [];
      });
    try {
      const repository = new ExchangeClaimRepository({
        $queryRaw: jest.fn(async (query: SqlQuery) =>
          query.sql?.includes("SELECT COUNT(*) AS total") ? [{ total: 0n }] : []),
        availability: { findMany: jest.fn(async () => [{ technicianProfileId: 81 }, { technicianProfileId: 82 }]) },
        scheduleCycle: { findMany: jest.fn(async () => [{
          shopId: 11, periodStart: new Date("2026-09-01T00:00:00.000Z"),
          periodEnd: new Date("2026-09-03T00:00:00.000Z"),
          ruleSet: { dynamicAvailability: true }
        }]) },
        exchangePost: { findFirst: jest.fn(async () => ({
          id: 41, authorUserId: 99, type: "DEMAND", status: "PUBLISHED",
          serviceStartAt: new Date("2026-09-02T00:00:00.000Z"),
          serviceEndAt: new Date("2026-09-02T03:00:00.000Z"),
          expiresAt: new Date("2026-09-03T00:00:00.000Z"),
          demand: { matchMode: "SELECTIVE" }
        })) },
        exchangeRequestMatching: { findUnique: jest.fn(async () => ({ status: "OPEN" })) },
        service: { findMany: jest.fn(async () => [{ id: 501, shopId: 11, durationMinutes: 60 }]) },
        technicianService: { findMany: jest.fn(async () => []) },
        userIdentity: { findMany: jest.fn(async () => [{
          scopeId: 81, publicIdentifier: { publicId: "S000000081" }
        }]) },
        exchangeClaim: { findMany: activeClaims }
      } as unknown as PrismaClient);
      const result = await repository.listOptions({
        postId: 41, scope: { kind: "merchant", shopId: 11 }, page: 2, pageSize: 1, now
      });
      expect(result).toMatchObject({ list: [], total: 1 });
      activeClaims.mockResolvedValueOnce([{
        technicianProfileId: 81,
        scheduleSlot: {
          startsAt: new Date("2026-09-02T01:00:00.000Z"),
          endsAt: new Date("2026-09-02T02:00:00.000Z")
        }
      }]);
      await expect(repository.listOptions({
        postId: 41, scope: { kind: "merchant", shopId: 11 }, page: 1, pageSize: 20, now
      })).resolves.toMatchObject({ list: [], total: 0 });
    } finally {
      bookingOptions.mockRestore();
    }
  });

  it("enumerates each of 52 shop services once without a per-page Booking replay", async () => {
    const bookingOptions = jest.spyOn(BookingRepository.prototype, "listDynamicClaimSlots")
      .mockResolvedValue([]);
    const serviceFindMany = jest.fn(async () => Array.from({ length: 52 }, (_, index) => ({
      id: 501 + index, shopId: 11, durationMinutes: 60
    })));
    try {
      const repository = new ExchangeClaimRepository({
        availability: { findMany: jest.fn(async () => Array.from({ length: 26 }, (_, index) => ({ technicianProfileId: 31 + index }))) },
        userIdentity: { findMany: jest.fn(async () => []) },
        exchangeClaim: { findMany: jest.fn(async () => []) },
        scheduleCycle: { findMany: jest.fn(async () => [{
          shopId: 11, periodStart: new Date("2026-09-01T00:00:00.000Z"),
          periodEnd: new Date("2026-09-03T00:00:00.000Z"),
          ruleSet: { dynamicAvailability: true }
        }]) },
        exchangePost: { findFirst: jest.fn(async () => ({
          id: 41, type: "DEMAND", status: "PUBLISHED",
          serviceStartAt: new Date("2026-09-02T00:00:00.000Z"),
          serviceEndAt: new Date("2026-09-02T03:00:00.000Z"),
          expiresAt: new Date("2026-09-03T00:00:00.000Z"),
          demand: { matchMode: "SELECTIVE" }
        })) },
        exchangeRequestMatching: { findUnique: jest.fn(async () => ({ status: "OPEN" })) },
        service: { findMany: serviceFindMany },
        technicianService: { findMany: jest.fn(async () => []) }
      } as unknown as PrismaClient);
      await expect(repository.listDynamicOptions({
        postId: 41, scope: { kind: "merchant", shopId: 11 }, page: 1, pageSize: 20,
        now, latestStartAt: new Date("2026-09-02T01:00:00.000Z")
      }, Number.MAX_SAFE_INTEGER, Array.from({ length: 26 }, (_, index) => 31 + index)))
        .resolves.toEqual({ list: [], total: 0 });
      expect(bookingOptions).toHaveBeenCalledTimes(52);
      expect(bookingOptions).toHaveBeenNthCalledWith(1, expect.objectContaining({
        to: new Date("2026-09-02T01:00:00.001Z")
      }),
        Array.from({ length: 26 }, (_, index) => 31 + index), expect.any(Function));
      bookingOptions.mockClear();
      serviceFindMany.mockResolvedValueOnce(Array.from({ length: 129 }, (_, index) => ({
        id: 501 + index, shopId: 11, durationMinutes: 60
      })));
      await expect(repository.listDynamicOptions({
        postId: 41, scope: { kind: "merchant", shopId: 11 }, page: 1, pageSize: 20, now
      }, Number.MAX_SAFE_INTEGER)).rejects.toThrow("service source limit");
      expect(bookingOptions).not.toHaveBeenCalled();
    } finally {
      bookingOptions.mockRestore();
    }
  });

  it("counts 26 by 52 three-hour Claim options while retaining only the requested page", async () => {
    const bookingOptions = jest.spyOn(BookingRepository.prototype, "listDynamicClaimSlots")
      .mockImplementation(async (input, _technicianIds, visit) => {
        for (let technician = 0; technician < 26; technician += 1) {
          for (let offset = 0; offset < 25; offset += 1) {
            const startsAt = new Date(Date.UTC(2026, 8, 2, 0, offset * 5));
            visit?.({
              id: encodeDynamicAvailabilityId(31 + technician, offset * 5),
              shopId: 11, shopName: "Shop", technicianProfileId: 31 + technician,
              technicianName: "Technician", serviceId: input.serviceId ?? null,
              technicianServiceId: null, serviceName: "Service", durationMinutes: 60,
              startsAt, endsAt: new Date(startsAt.getTime() + 60 * 60_000),
              status: "available"
            } as never);
          }
        }
        return [];
      });
    try {
      const repository = new ExchangeClaimRepository({
        $queryRaw: jest.fn(async (query: SqlQuery) =>
          query.sql?.includes("SELECT COUNT(*) AS total") ? [{ total: 0n }] : []),
        availability: { findMany: jest.fn(async () => Array.from({ length: 26 }, (_, index) =>
          ({ technicianProfileId: 31 + index }))) },
        scheduleCycle: { findMany: jest.fn(async () => [{
          shopId: 11, periodStart: new Date("2026-09-01T00:00:00.000Z"),
          periodEnd: new Date("2026-09-03T00:00:00.000Z"),
          ruleSet: { dynamicAvailability: true }
        }]) },
        exchangePost: { findFirst: jest.fn(async () => ({
          id: 41, type: "DEMAND", status: "PUBLISHED",
          serviceStartAt: new Date("2026-09-02T00:00:00.000Z"),
          serviceEndAt: new Date("2026-09-02T03:00:00.000Z"),
          expiresAt: new Date("2026-09-03T00:00:00.000Z"),
          demand: { matchMode: "SELECTIVE" }
        })) },
        exchangeRequestMatching: { findUnique: jest.fn(async () => ({ status: "OPEN" })) },
        service: { findMany: jest.fn(async () => Array.from({ length: 52 }, (_, index) =>
          ({ id: 501 + index, shopId: 11, durationMinutes: 60 }))) },
        technicianService: { findMany: jest.fn(async () => []) },
        userIdentity: { findMany: jest.fn(async () => Array.from({ length: 26 }, (_, index) =>
          ({ scopeId: 31 + index, publicIdentifier: { publicId: `S${31 + index}` } }))) },
        exchangeClaim: { findMany: jest.fn(async () => []) }
      } as unknown as PrismaClient);
      const page = await repository.listOptions({
        postId: 41, scope: { kind: "merchant", shopId: 11 }, page: 2, pageSize: 20, now
      });
      expect(page.total).toBe(33_800);
      expect(page.list).toHaveLength(20);
      expect(page.list[0]?.startsAt).toBe("2026-09-02T00:00:00.000Z");
      expect(page.list[0]?.service.ref).toBe("shop:521");
      expect(bookingOptions).toHaveBeenCalledTimes(52);
    } finally {
      bookingOptions.mockRestore();
    }
  });

  it("lists a technician-priced self-scheduled option only for its technician identity", async () => {
    const dynamicId = encodeDynamicAvailabilityId(82, 60);
    const bookingOptions = jest.spyOn(BookingRepository.prototype, "listDynamicClaimSlots")
      .mockImplementation(async (_input, _technicianIds, visit) => {
        visit?.({
        id: dynamicId, shopId: 11, shopName: "Shop", technicianProfileId: 81,
        technicianName: "Technician", serviceId: null, technicianServiceId: 701,
        serviceName: "Tech service", durationMinutes: 60,
        startsAt: new Date("2026-09-02T01:00:00.000Z"),
        endsAt: new Date("2026-09-02T02:00:00.000Z"), status: "available",
        availabilitySourceType: "technician"
        } as never);
        return [];
      });
    try {
      const repository = new ExchangeClaimRepository({
        $queryRaw: jest.fn(async (query: SqlQuery) =>
          query.sql?.includes("SELECT COUNT(*) AS total") ? [{ total: 0n }] : []),
        availability: { findMany: jest.fn(async () => [{ shopId: 11, technicianProfileId: 81 }]) },
        scheduleCycle: { findMany: jest.fn(async () => [{
          shopId: 11,
          periodStart: new Date("2026-09-01T00:00:00.000Z"),
          periodEnd: new Date("2026-09-03T00:00:00.000Z"),
          ruleSet: { dynamicAvailability: true }
        }]) },
        exchangePost: { findFirst: jest.fn(async () => ({
          id: 41, authorUserId: 99, ownerIdentityId: 98, type: "DEMAND", status: "PUBLISHED",
          serviceStartAt: new Date("2026-09-02T00:00:00.000Z"),
          serviceEndAt: new Date("2026-09-02T03:00:00.000Z"),
          expiresAt: new Date("2026-09-03T00:00:00.000Z"),
          demand: { matchMode: "SELECTIVE", budgetMinJpy: null, budgetMaxJpy: 30000 }
        })) },
        exchangeRequestMatching: { findUnique: jest.fn(async () => ({ status: "OPEN" })) },
        service: { findMany: jest.fn(async () => []) },
        technicianService: { findMany: jest.fn(async () => [{ id: 701, shopId: 11, durationMinutes: 60 }]) },
        userIdentity: { findMany: jest.fn(async () => [{ scopeId: 81, publicIdentifier: { publicId: "S000000081" } }]) },
        exchangeClaim: { findMany: jest.fn(async () => []) }
      } as unknown as PrismaClient);
      const result = await repository.listOptions({
        postId: 41, scope: { kind: "technician", technicianProfileId: 81 },
        page: 1, pageSize: 20, now
      });
      expect(result.list).toEqual([expect.objectContaining({
        scheduleSlotId: dynamicId,
        service: expect.objectContaining({ ref: "technician:701" })
      })]);
      expect(bookingOptions).toHaveBeenCalledWith(expect.objectContaining({
        technicianId: 81, technicianServiceId: 701
      }), undefined, expect.any(Function));
    } finally {
      bookingOptions.mockRestore();
    }
  });
});

describe("ExchangeClaimRepository mutation primitives", () => {
  it("resolves a dynamic control window only inside the provider scope", async () => {
    const id = encodeDynamicAvailabilityId(81, 30);
    const findFirst = jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      where.shopId === 11 || where.technicianProfileId === 81
        ? { technicianProfileId: 81 }
        : null
    );
    const repository = new ExchangeClaimRepository({
      availability: { findFirst }
    } as unknown as PrismaClient);

    await expect(repository.findOptionCandidate(id, { kind: "merchant", shopId: 11 }))
      .resolves.toEqual({ technicianProfileId: 81 });
    await expect(repository.findOptionCandidate(id, { kind: "merchant", shopId: 12 }))
      .resolves.toBeNull();
    await expect(repository.findOptionCandidate(id, { kind: "technician", technicianProfileId: 82 }))
      .resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ isScheduleControlWindow: true, isActive: true, deletedAt: null })
    }));
  });

  it("materializes a dynamic option inside the claim transaction before locking its persisted slot", async () => {
    const dynamicId = encodeDynamicAvailabilityId(81, 30);
    const materialize = jest.spyOn(BookingRepository.prototype, "materializeDynamicSlotForClaim")
      .mockResolvedValue(91);
    const findFirst = jest.fn(async () => ({
      id: 91, shopId: 11, technicianProfileId: 81,
      serviceId: 501, technicianServiceId: null,
      startsAt: new Date("2026-09-02T01:00:00.000Z"),
      endsAt: new Date("2026-09-02T02:00:00.000Z"),
      capacity: 1, bookedCount: 0,
      service: { id: 501, name: "Service", durationMinutes: 60, shopId: 11 },
      technicianService: null,
      technicianProfile: { technicianShopAffiliations: [{ shopId: 11 }] }
    }));
    try {
      const repository = new ExchangeClaimRepository({
        $queryRaw: jest.fn(async () => [{ id: 91 }]),
        scheduleSlot: { findFirst }
      } as unknown as PrismaClient);
      await expect(repository.lockOption(
        dynamicId, { kind: "merchant", shopId: 11 }, now, "shop:501"
      )).resolves.toMatchObject({ scheduleSlotId: 91, serviceId: 501 });
      await expect(repository.lockOption(
        dynamicId, { kind: "merchant", shopId: 11 }, now, "shop:502"
      )).resolves.toBeNull();
      expect(materialize).toHaveBeenCalledWith({
        scheduleSlotId: dynamicId,
        serviceId: 501,
        nominatedTechnicianProfileId: undefined
      });
    } finally {
      materialize.mockRestore();
    }
  });
  it("locks and advances the matching version with one append-only claim event", async () => {
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const eventCreate = jest.fn(async () => ({ id: 81 }));
    const repository = new ExchangeClaimRepository({
      $queryRaw: jest.fn(async () => [{ id: 51 }]),
      exchangeRequestMatching: {
        findUnique: jest.fn(async () => ({
          id: 51,
          status: "OPEN",
          version: 3,
          effectiveTargetProviderCount: 2,
          effectiveBudgetMaxJpy: 30_000
        })),
        updateMany
      },
      exchangeMatchEvent: { create: eventCreate }
    } as unknown as PrismaClient);

    await expect(repository.lockMatching(41)).resolves.toEqual({
      id: 51,
      status: "open",
      version: 3,
      effectiveTargetProviderCount: 2,
      effectiveBudgetMaxJpy: 30_000
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
      }, now);
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
        source: "shop_dispatch",
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

  it("rejects a persisted option whose start has passed", async () => {
    const repository = new ExchangeClaimRepository({
      $queryRaw: jest.fn(async () => [{ id: 91 }]),
      scheduleSlot: { findFirst: jest.fn(async () => ({
        id: 91, shopId: 11, technicianProfileId: 81, serviceId: 501,
        technicianServiceId: null,
        startsAt: new Date(now.getTime() - 60_000),
        endsAt: new Date(now.getTime() + 3_540_000),
        capacity: 1, bookedCount: 0,
        service: { name: "Service", durationMinutes: 60, shopId: 11 },
        technicianService: null,
        technicianProfile: { technicianShopAffiliations: [{ shopId: 11 }] }
      })) }
    } as unknown as PrismaClient);
    await expect(repository.lockOption(91, { kind: "merchant", shopId: 11 }, now))
      .resolves.toBeNull();
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

  it("hides withdrawn claims from participant and publisher reads while retaining the withdrawal row for idempotency", async () => {
    const findFirst = jest.fn(async () => null);
    const findMany = jest.fn(async () => []);
    const count = jest.fn(async () => 0);
    const repository = new ExchangeClaimRepository({
      exchangeClaim: { findFirst, findMany, count }
    } as unknown as PrismaClient);

    await expect(repository.findMine(41, 17)).resolves.toBeNull();
    await expect(repository.listReceived(41, 21, { page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 0, list: [] });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ exchangePostId: 41, claimantIdentityId: 17, status: { not: "WITHDRAWN" } })
    }));
    expect(count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { not: "WITHDRAWN" } })
    }));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { not: "WITHDRAWN" } })
    }));
  });
});
