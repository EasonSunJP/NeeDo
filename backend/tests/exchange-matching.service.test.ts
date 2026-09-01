import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  ExchangeMatchingService,
  type ExchangeMatchingRepositoryPort
} from "../src/services/exchange-matching.service";
import type {
  ExchangeMatchingRecord,
  ExchangeMatchingSelectionClaim
} from "../src/repositories/exchange-matching.repository";
import type { ExchangeMatchingPayload } from "../src/types/exchange-matching.types";

const now = new Date("2026-09-01T01:00:00.000Z");
const access: AuthenticatedAccessContext = {
  userId: 7,
  email: "owner@needo.local",
  accessTokenJti: "matching-jti",
  accessTokenExpiresAt: 1_800_000_000,
  currentIdentityId: 17,
  currentPublicId: "C0000000017",
  currentIdentityType: "customer",
  currentIdentityScopeType: "user",
  currentIdentityScopeId: 7,
  roles: ["customer"],
  permissions: []
};

const participant = (claimId: number, technicianProfileId: number, quoteAmountJpy: number) => ({
  exchangeClaimId: claimId,
  provider: {
    publicId: `B${String(claimId).padStart(10, "0")}`,
    displayName: `Provider ${claimId}`,
    avatarUrl: null
  },
  shop: { id: 11, name: "Aoyama Care" },
  technician: {
    profileId: technicianProfileId,
    publicId: `S${String(technicianProfileId).padStart(10, "0")}`,
    displayName: `Technician ${technicianProfileId}`
  },
  service: { ref: "shop:501" as const, name: "ヘアセット", durationMinutes: 60 },
  scheduleSlotId: claimId + 1_000,
  quoteAmountJpy,
  currency: "JPY" as const,
  estimatedStartsAt: "2026-09-02T01:00:00.000Z",
  estimatedEndsAt: "2026-09-02T02:00:00.000Z",
  matchedAt: now.toISOString()
});

const openPayload: ExchangeMatchingPayload = {
  exchangePostId: 41,
  status: "open",
  version: 3,
  effectiveTargetProviderCount: 2,
  effectiveBudgetMaxJpy: 30_000,
  selectedQuoteTotalJpy: 0,
  matchedAt: null,
  participants: [],
  viewer: { canSelect: true }
};

const matchingRecord: ExchangeMatchingRecord = {
  id: 51,
  exchangePostId: 41,
  ownerUserId: 7,
  ownerIdentityId: 17,
  postType: "demand",
  postStatus: "published",
  matchMode: "selective",
  expiresAt: new Date("2026-09-01T12:00:00.000Z"),
  status: "open",
  effectiveTargetProviderCount: 2,
  effectiveBudgetMaxJpy: 30_000,
  selectedQuoteTotalJpy: 0,
  version: 3,
  matchedAt: null,
  payload: openPayload
};

const claim = (
  id: number,
  technicianProfileId: number,
  quoteAmountJpy: number
): ExchangeMatchingSelectionClaim => ({
  id,
  exchangePostId: 41,
  claimantUserId: id + 100,
  claimantIdentityId: id + 200,
  shopId: 11,
  technicianProfileId,
  serviceId: 501,
  technicianServiceId: null,
  scheduleSlotId: id + 1_000,
  quoteAmountJpy,
  currency: "JPY",
  status: "active",
  estimatedStartsAt: new Date("2026-09-02T01:00:00.000Z"),
  estimatedEndsAt: new Date("2026-09-02T02:00:00.000Z")
});

const claims = [claim(301, 81, 15_000), claim(302, 82, 14_000)];
const matchedPayload: ExchangeMatchingPayload = {
  ...openPayload,
  status: "matched",
  version: 4,
  selectedQuoteTotalJpy: 29_000,
  matchedAt: now.toISOString(),
  participants: [participant(301, 81, 15_000), participant(302, 82, 14_000)],
  viewer: { canSelect: false }
};

const createRepository = (
  overrides: Partial<ExchangeMatchingRepositoryPort> = {}
): ExchangeMatchingRepositoryPort => {
  const repository: ExchangeMatchingRepositoryPort = {
    runInTransaction: jest.fn(async (handler) => handler(repository)),
    findForViewer: jest.fn(async () => matchingRecord),
    findIdempotentSelection: jest.fn(async () => null),
    lockMatching: jest.fn(async () => matchingRecord),
    lockActiveClaims: jest.fn(async () => claims),
    lockTechnicians: jest.fn(async () => true),
    hasParticipantConflict: jest.fn(async () => false),
    hasBookingConflict: jest.fn(async () => false),
    completeSelection: jest.fn(async () => matchedPayload),
    ...overrides
  };
  return repository;
};

describe("ExchangeMatchingService", () => {
  it("reads only an owner or selected participant projection", async () => {
    const repository = createRepository();
    const service = new ExchangeMatchingService(repository, () => now);
    await expect(service.getMatching(access, 41)).resolves.toEqual(openPayload);
    expect(repository.findForViewer).toHaveBeenCalledWith(41, 17);

    const hidden = createRepository({ findForViewer: jest.fn(async () => null) });
    await expect(new ExchangeMatchingService(hidden, () => now).getMatching(access, 41))
      .rejects.toMatchObject({ code: 40423 });
  });

  it("matches the exact selected count and budget in one repository transaction", async () => {
    const repository = createRepository();
    const service = new ExchangeMatchingService(repository, () => now);

    await expect(
      service.selectMatching(
        access,
        41,
        { selectedClaimIds: [302, 301], expectedVersion: 3 },
        "matching-select-key-0001",
        { ip: "127.0.0.1", userAgent: "jest" }
      )
    ).resolves.toEqual(matchedPayload);

    expect(repository.lockMatching).toHaveBeenCalledWith(41);
    expect(repository.lockActiveClaims).toHaveBeenCalledWith(41);
    expect(repository.lockTechnicians).toHaveBeenCalledWith([81, 82]);
    expect(repository.completeSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        matchingId: 51,
        exchangePostId: 41,
        selectedClaimIds: [301, 302],
        unselectedClaims: [],
        unselectedClaimIds: [],
        selectedQuoteTotalJpy: 29_000,
        versionBefore: 3,
        versionAfter: 4,
        idempotencyKey: "matching-select-key-0001",
        actorUserId: 7,
        actorIdentityId: 17
      })
    );
  });

  it.each([
    ["wrong identity", { ownerIdentityId: 99 }, 40312],
    ["wrong mode", { matchMode: "quick" as const }, 40992],
    ["closed post", { postStatus: "withdrawn" as const }, 40992],
    ["expired", { expiresAt: now }, 40992],
    ["stale version", { version: 4 }, 40993]
  ])("rejects %s without completing", async (_label, patch, code) => {
    const repository = createRepository({
      lockMatching: jest.fn(async () => ({ ...matchingRecord, ...patch }))
    });
    const service = new ExchangeMatchingService(repository, () => now);
    await expect(
      service.selectMatching(
        access,
        41,
        { selectedClaimIds: [301, 302], expectedVersion: 3 },
        "matching-select-key-0001",
        { ip: "127.0.0.1", userAgent: "jest" }
      )
    ).rejects.toMatchObject({ code });
    expect(repository.completeSelection).not.toHaveBeenCalled();
  });

  it("rejects an inaccurate count, inactive claim set, duplicate technician and excess total", async () => {
    const service = new ExchangeMatchingService(createRepository(), () => now);
    await expect(
      service.selectMatching(
        access,
        41,
        { selectedClaimIds: [301], expectedVersion: 3 },
        "matching-select-key-0001",
        { ip: "127.0.0.1", userAgent: "jest" }
      )
    ).rejects.toMatchObject({ code: 40995 });

    const missing = createRepository({ lockActiveClaims: jest.fn(async () => [claims[0]!]) });
    await expect(
      new ExchangeMatchingService(missing, () => now).selectMatching(
        access,
        41,
        { selectedClaimIds: [301, 302], expectedVersion: 3 },
        "matching-select-key-0001",
        { ip: "127.0.0.1", userAgent: "jest" }
      )
    ).rejects.toMatchObject({ code: 40994 });

    const duplicateTechnician = createRepository({
      lockActiveClaims: jest.fn(async () => [claims[0]!, { ...claims[1]!, technicianProfileId: 81 }])
    });
    await expect(
      new ExchangeMatchingService(duplicateTechnician, () => now).selectMatching(
        access,
        41,
        { selectedClaimIds: [301, 302], expectedVersion: 3 },
        "matching-select-key-0001",
        { ip: "127.0.0.1", userAgent: "jest" }
      )
    ).rejects.toMatchObject({ code: 40994 });

    const overBudget = createRepository({
      lockActiveClaims: jest.fn(async () => [claims[0]!, { ...claims[1]!, quoteAmountJpy: 16_000 }])
    });
    await expect(
      new ExchangeMatchingService(overBudget, () => now).selectMatching(
        access,
        41,
        { selectedClaimIds: [301, 302], expectedVersion: 3 },
        "matching-select-key-0001",
        { ip: "127.0.0.1", userAgent: "jest" }
      )
    ).rejects.toMatchObject({ code: 40996 });
  });

  it("rejects participant and booking overlaps before completing", async () => {
    for (const method of ["hasParticipantConflict", "hasBookingConflict"] as const) {
      const repository = createRepository({ [method]: jest.fn(async () => true) });
      await expect(
        new ExchangeMatchingService(repository, () => now).selectMatching(
          access,
          41,
          { selectedClaimIds: [301, 302], expectedVersion: 3 },
          "matching-select-key-0001",
          { ip: "127.0.0.1", userAgent: "jest" }
        )
      ).rejects.toMatchObject({ code: 40997 });
      expect(repository.completeSelection).not.toHaveBeenCalled();
    }
  });

  it("replays the same idempotency fingerprint and rejects changed commands", async () => {
    const initial = createRepository();
    const service = new ExchangeMatchingService(initial, () => now);
    await service.selectMatching(
      access,
      41,
      { selectedClaimIds: [301, 302], expectedVersion: 3 },
      "matching-select-key-0001",
      { ip: "127.0.0.1", userAgent: "jest" }
    );
    const input = (initial.completeSelection as jest.Mock).mock.calls[0]?.[0] as {
      payloadFingerprint: string;
    };
    const replay = createRepository({
      findIdempotentSelection: jest.fn(async () => ({
        payload: matchedPayload,
        payloadFingerprint: input.payloadFingerprint
      }))
    });
    await expect(
      new ExchangeMatchingService(replay, () => now).selectMatching(
        access,
        41,
        { selectedClaimIds: [302, 301], expectedVersion: 3 },
        "matching-select-key-0001",
        { ip: "127.0.0.1", userAgent: "jest" }
      )
    ).resolves.toEqual(matchedPayload);
    expect(replay.lockMatching).not.toHaveBeenCalled();

    const conflict = createRepository({
      findIdempotentSelection: jest.fn(async () => ({
        payload: matchedPayload,
        payloadFingerprint: "f".repeat(64)
      }))
    });
    await expect(
      new ExchangeMatchingService(conflict, () => now).selectMatching(
        access,
        41,
        { selectedClaimIds: [301, 302], expectedVersion: 3 },
        "matching-select-key-0001",
        { ip: "127.0.0.1", userAgent: "jest" }
      )
    ).rejects.toMatchObject({ code: 40998 });
  });
});
