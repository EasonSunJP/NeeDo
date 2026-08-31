import type { PlatformMembershipRepositoryPort } from "../src/repositories/platform-membership.repository";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { PlatformMembershipService } from "../src/services/platform-membership.service";

const now = new Date("2026-09-01T12:00:00.000Z");
const actor: AuthenticatedAccessContext = {
  userId: 9,
  email: "admin@example.com",
  accessTokenJti: "jti",
  accessTokenExpiresAt: Math.floor(now.getTime() / 1000) + 900,
  currentIdentityType: "operations",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null,
  roles: ["operations_admin"],
  permissions: ["backoffice:user-membership:write"]
};
const context = { ip: "127.0.0.1" };
const changed = {
  kind: "grant" as const,
  tierCode: "silver" as const,
  tierVersionPublicId: "tier-silver-v1",
  entitlementPublicId: "entitlement-1",
  startsAt: now,
  expiresAt: new Date("2026-10-01T12:00:00.000Z"),
  experienceValueNdp: 300,
  idempotent: false
};

const repository = (
  overrides: Partial<jest.Mocked<PlatformMembershipRepositoryPort>> = {}
): jest.Mocked<PlatformMembershipRepositoryPort> => ({
  listTiersForAdministration: jest.fn(),
  listBenefitsForAdministration: jest.fn(),
  hasActiveCustomerProfile: jest.fn(async (userId: number) => {
    void userId;
    return true;
  }),
  findActiveEntitlementAt: jest.fn(),
  findPublishedTierAt: jest.fn(),
  findTierDraft: jest.fn(),
  saveTierDraftWithAudit: jest.fn(),
  publishTierDraftWithAudit: jest.fn(),
  changeEntitlementWithAudit: jest.fn(async (input) => {
    void input;
    return { kind: "changed" as const, value: changed };
  }),
  updateBenefitWithAudit: jest.fn(),
  ...overrides
});
const audit = {
  createInput: jest.fn((input) => ({
    actorId: input.actor.userId,
    action: input.action,
    targetType: input.targetType,
    metadata: input.metadata
  }))
};

describe("PlatformMembershipService entitlement changes", () => {
  it("sends a normalized, audited grant command for a customer", async () => {
    const repo = repository();
    const service = new PlatformMembershipService(repo, audit, () => now);

    await expect(service.changeEntitlement(actor, context, 42, {
      kind: "grant",
      targetTierCode: "silver",
      billingCycle: "monthly",
      source: "operations",
      sourceReference: "ops:membership:42:1",
      expectedCurrentLockVersion: null
    })).resolves.toEqual(changed);
    expect(repo.changeEntitlementWithAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 9,
      userId: 42,
      occurredAt: now,
      command: expect.objectContaining({ sourceReference: "ops:membership:42:1" }),
      audit: expect.objectContaining({ action: "platform.membership_entitlement.grant" })
    }));
  });

  it("rejects technician-only targets before entering the transaction", async () => {
    const repo = repository({
      hasActiveCustomerProfile: jest.fn(async (userId: number) => {
        void userId;
        return false;
      })
    });
    const service = new PlatformMembershipService(repo, audit, () => now);

    await expect(service.changeEntitlement(actor, context, 99, {
      kind: "grant",
      targetTierCode: "silver",
      billingCycle: "monthly",
      source: "operations",
      sourceReference: "ops:membership:99:1",
      expectedCurrentLockVersion: null
    })).rejects.toMatchObject({
      message: "error.platform_membership.customer_required",
      statusCode: 422
    });
    expect(repo.changeEntitlementWithAudit).not.toHaveBeenCalled();
  });
});
