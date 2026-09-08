import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { ERROR_CODES } from "../src/constants/error-codes";
import type {
  PlatformMembershipRepositoryPort,
  ResolvedPlatformMembership
} from "../src/repositories/platform-membership.repository";
import { PlatformMembershipService } from "../src/services/platform-membership.service";

const now = new Date("2026-09-01T10:00:00.000Z");

const membership = (
  tierCode: ResolvedPlatformMembership["tierCode"],
  multiplier: number,
  expiresAt: Date | null = null
): ResolvedPlatformMembership => ({
  tierCode,
  tierVersionPublicId: `tier-version-${tierCode}`,
  multiplier,
  expiresAt,
  benefits: [
    {
      code: "ndp_experience",
      configuration: { extraThresholdNdp: null, extraAwardExpUnits: null }
    }
  ],
  theme: {
    detailAccentColor: "#A7FF33",
    detailSurfaceColor: "#102731",
    detailSurfaceMiddleColor: "#183A32",
    detailSurfaceBottomColor: "#24314B",
    detailItemSurfaceColor: "#0B1820",
    detailOuterBorderColor: "#577A39",
    detailItemBorderColor: "#34514A",
    detailAvatarBorderColor: "#729548",
    simpleTopColor: "#0A2619",
    simpleBottomColor: "#102631"
  }
});

const repository = (
  overrides: Partial<jest.Mocked<PlatformMembershipRepositoryPort>> = {}
): jest.Mocked<PlatformMembershipRepositoryPort> => ({
  listTiersForAdministration: jest.fn(),
  listBenefitsForAdministration: jest.fn(),
  hasActiveCustomerProfile: jest.fn(async (userId: number) => {
    void userId;
    return true;
  }),
  hasVerifiedEkycAt: jest.fn(async (userId: number, occurredAt: Date) => {
    void userId;
    void occurredAt;
    return false;
  }),
  findActiveEntitlementAt: jest.fn(async (userId: number, occurredAt: Date) => {
    void userId;
    void occurredAt;
    return null;
  }),
  findPublishedTierAt: jest.fn(async (tierCode, occurredAt: Date) => {
    void tierCode;
    void occurredAt;
    return membership("free", 1);
  }),
  findTierDraft: jest.fn(),
  saveTierDraftWithAudit: jest.fn(),
  publishTierDraftWithAudit: jest.fn(),
  changeEntitlementWithAudit: jest.fn(),
  updateBenefitWithAudit: jest.fn(),
  ...overrides
});

describe("PlatformMembershipService", () => {
  it("falls back to the published free tier without creating an entitlement", async () => {
    const repo = repository();
    const service = new PlatformMembershipService(repo);

    await expect(service.resolveMembershipAt(41, now)).resolves.toMatchObject({
      tierCode: "free",
      multiplier: 1,
      expiresAt: null
    });
    expect(repo.findActiveEntitlementAt).toHaveBeenCalledWith(41, now);
    expect(repo.findPublishedTierAt).toHaveBeenCalledWith("free", now);
  });

  it("returns the entitlement version that covers the occurrence time", async () => {
    const expiresAt = new Date("2026-10-01T10:00:00.000Z");
    const repo = repository({
      findActiveEntitlementAt: jest.fn(async (userId: number, occurredAt: Date) => {
        void userId;
        void occurredAt;
        return membership("gold", 5, expiresAt);
      })
    });
    const service = new PlatformMembershipService(repo);

    await expect(service.resolveMembershipAt(42, now)).resolves.toMatchObject({
      tierCode: "gold",
      multiplier: 5,
      expiresAt
    });
    expect(repo.findPublishedTierAt).not.toHaveBeenCalled();
  });

  it("renders the newly published design while keeping the granted membership terms", async () => {
    const expiresAt = new Date("2026-10-01T00:00:00.000Z");
    const granted = membership("gold", 5, expiresAt);
    const published = { ...membership("gold", 9), theme: { ...granted.theme, detailSurfaceColor: "#665533", detailAccentColor: "#CCBB00" } };
    const repo = repository({
      findActiveEntitlementAt: jest.fn(async (userId: number, at: Date) => { void userId; void at; return granted; }),
      findPublishedTierAt: jest.fn(async (code: ResolvedPlatformMembership["tierCode"], at: Date) => { void code; void at; return published; })
    });
    const service = new PlatformMembershipService(repo, undefined, () => now);
    const result = await service.getMyMembership({ userId: 42 } as AuthenticatedAccessContext);
    expect(result.theme).toEqual(published.theme);
    expect(result.multiplier).toBe(5);
    expect(result.expiresAt).toBe(expiresAt.toISOString());
    expect(result.tierVersionPublicId).toBe(granted.tierVersionPublicId);
    expect(repo.findPublishedTierAt).toHaveBeenCalledWith("gold", now);
  });

  it("rejects technician-only users instead of assigning a customer tier", async () => {
    const repo = repository({
      hasActiveCustomerProfile: jest.fn(async (userId: number) => {
        void userId;
        return false;
      })
    });
    const service = new PlatformMembershipService(repo);

    await expect(service.resolveMembershipAt(99, now)).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION,
      message: "error.platform_membership.customer_required",
      statusCode: 422
    });
    expect(repo.findActiveEntitlementAt).not.toHaveBeenCalled();
  });
});
