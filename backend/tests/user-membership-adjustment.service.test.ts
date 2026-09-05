import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { PlatformMembershipService } from "../src/services/platform-membership.service";

const now = new Date("2026-09-06T00:00:00.000Z");
const actor: AuthenticatedAccessContext = {
  userId: 9,
  email: "admin@example.com",
  accessTokenJti: "jti",
  accessTokenExpiresAt: Math.floor(now.getTime() / 1000) + 900,
  currentIdentityType: "operations",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null,
  roles: ["operations_admin"],
  permissions: ["backoffice:user-membership:write"],
};
const context = { ip: "127.0.0.1" };

type AdjustmentService = {
  adjustUserMembership: (
    actor: AuthenticatedAccessContext,
    requestContext: { ip: string },
    userId: number,
    input: {
      tierCode?: "gold";
      multiplier?: number;
      reason: string;
      expectedLockVersion: number | null;
    },
  ) => Promise<unknown>;
};

describe("PlatformMembershipService user adjustment", () => {
  it("uses the active tier and multiplier override for future experience snapshots", async () => {
    const theme = {
      detailAccentColor: "#111111",
      detailSurfaceColor: "#222222",
      detailItemSurfaceColor: "#333333",
      detailOuterBorderColor: "#444444",
      detailItemBorderColor: "#555555",
      detailAvatarBorderColor: "#666666",
      simpleTopColor: "#777777",
      simpleBottomColor: "#888888",
    };
    const repository = {
      hasActiveCustomerProfile: jest.fn(async () => true),
      findActiveEntitlementAt: jest.fn(async () => ({
        tierCode: "silver",
        tierVersionPublicId: "silver-v1",
        multiplier: 1.1,
        expiresAt: null,
        benefits: [],
        theme,
      })),
      findActiveAdjustmentAt: jest.fn(async () => ({
        tierMembership: {
          tierCode: "gold",
          tierVersionPublicId: "gold-v3",
          multiplier: 1.5,
          expiresAt: null,
          benefits: [],
          theme,
        },
        multiplier: 1.25,
        lockVersion: 3,
        effectiveFrom: now,
      })),
      findPublishedTierAt: jest.fn(),
    };
    const service = new PlatformMembershipService(repository as never);

    await expect(service.resolveMembershipAt(41, now)).resolves.toMatchObject({
      tierCode: "gold",
      tierVersionPublicId: "gold-v3",
      multiplier: 1.25,
      adjustmentLockVersion: 3,
    });
    expect(repository.findPublishedTierAt).not.toHaveBeenCalled();
  });

  it("rejects a blank operational reason before persistence", async () => {
    const repository = {
      hasActiveCustomerProfile: jest.fn(async () => true),
      adjustUserMembershipWithAudit: jest.fn(),
    };
    const service = new PlatformMembershipService(repository as never) as unknown as AdjustmentService;

    await expect(
      service.adjustUserMembership(actor, context, 41, {
        multiplier: 1.25,
        reason: " ",
        expectedLockVersion: 2,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.adjustUserMembershipWithAudit).not.toHaveBeenCalled();
  });

  it("normalizes the multiplier, records the reason, and creates an audit command", async () => {
    const repository = {
      hasActiveCustomerProfile: jest.fn(async () => true),
      adjustUserMembershipWithAudit: jest.fn(async () => ({
        kind: "adjusted",
        value: {
          tierCode: "gold",
          multiplier: 1.25,
          lockVersion: 3,
          effectiveFrom: now,
        },
      })),
    };
    const audit = {
      createInput: jest.fn((input) => ({
        actorId: input.actor.userId,
        action: input.action,
        targetType: input.targetType,
        metadata: input.metadata,
      })),
    };
    const service = new PlatformMembershipService(
      repository as never,
      audit,
      () => now,
    ) as unknown as AdjustmentService;

    await expect(
      service.adjustUserMembership(actor, context, 41, {
        tierCode: "gold",
        multiplier: 1.25,
        reason: " Manual retention adjustment ",
        expectedLockVersion: 2,
      }),
    ).resolves.toMatchObject({
      tierCode: "gold",
      multiplier: 1.25,
      lockVersion: 3,
    });

    expect(repository.adjustUserMembershipWithAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 9,
        userId: 41,
        tierCode: "gold",
        multiplierBps: 12_500,
        reason: "Manual retention adjustment",
        expectedLockVersion: 2,
        effectiveFrom: now,
        audit: expect.objectContaining({
          action: "platform.user_membership.adjust",
          targetType: "UserMembershipAdjustment",
        }),
      }),
    );
  });

  it("maps optimistic concurrency conflicts to HTTP 409", async () => {
    const repository = {
      hasActiveCustomerProfile: jest.fn(async () => true),
      adjustUserMembershipWithAudit: jest.fn(async () => ({ kind: "version_conflict" })),
    };
    const audit = { createInput: jest.fn((input) => input) };
    const service = new PlatformMembershipService(
      repository as never,
      audit as never,
      () => now,
    ) as unknown as AdjustmentService;

    await expect(
      service.adjustUserMembership(actor, context, 41, {
        multiplier: 1.25,
        reason: "Approved retention adjustment",
        expectedLockVersion: 2,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
