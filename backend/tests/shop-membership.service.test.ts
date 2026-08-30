import { ERROR_CODES } from "../src/constants/error-codes";
import type { ShopMembershipRepositoryPort } from "../src/repositories/shop-membership.repository";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { ShopMembershipService } from "../src/services/shop-membership.service";

const now = new Date("2026-08-31T03:00:00.000Z");
const merchant = (overrides: Partial<AuthenticatedAccessContext> = {}): AuthenticatedAccessContext => ({
  userId: 9,
  email: "owner@example.com",
  accessTokenJti: "jti",
  accessTokenExpiresAt: Math.floor(now.getTime() / 1000) + 900,
  currentIdentityType: "merchant",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 71,
  roles: ["merchant_owner"],
  permissions: ["shop.member.view", "shop.member.create"],
  ...overrides
});

const detail = {
  internalId: 31,
  publicId: "membership-31",
  customerProfileId: 41,
  customerNeedoId: "u0000000041",
  displayName: "王小美",
  avatarUrl: null,
  city: "东京",
  status: "active" as const,
  source: "merchant_manual" as const,
  startedAt: now,
  endedAt: null,
  createdAt: now,
  updatedAt: now,
  cardCount: 0,
  activeCardCount: 0,
  lastActivityAt: now,
  shop: { id: 71, shopNo: "s000000071", name: "青山护理店", city: "东京", address: "港区青山 1-1" },
  cards: []
};

function repository(overrides: Partial<jest.Mocked<ShopMembershipRepositoryPort>> = {}) {
  return {
    getOverview: jest.fn(),
    listMemberships: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
    findMembershipDetail: jest.fn(async () => detail),
    listCandidates: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
    findCandidateByNeedoId: jest.fn(async () => ({ customerProfileId: 41, customerNeedoId: "u0000000041", displayName: "王小美", avatarUrl: null, city: "东京", lastOrderAt: now, shopNo: "s000000071" })),
    createMembershipWithAudit: jest.fn(async () => detail),
    listCards: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
    listActivities: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
    getAnalytics: jest.fn(),
    listCustomerMemberships: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
    findCustomerMembershipDetail: jest.fn(async () => detail),
    ...overrides
  } as jest.Mocked<ShopMembershipRepositoryPort>;
}

describe("ShopMembershipService", () => {
  it("rejects non-shop merchant identities before repository access", async () => {
    const repo = repository();
    const service = new ShopMembershipService(repo, { createInput: jest.fn() }, () => now);

    await expect(
      service.listMerchantMemberships(
        merchant({ currentIdentityScopeType: "merchant_account", currentIdentityScopeId: 7 }),
        { page: 1, pageSize: 20 }
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 });
    expect(repo.listMemberships).not.toHaveBeenCalled();
  });

  it("resolves enrollment from the current shop and passes safe transactional audit metadata", async () => {
    const repo = repository();
    const audit = { createInput: jest.fn((input) => ({
      actorId: input.actor.userId,
      action: input.action,
      targetType: input.targetType,
      ip: input.context.ip,
      userAgent: input.context.userAgent,
      metadata: input.metadata
    })) };
    const service = new ShopMembershipService(repo, audit, () => now);

    await service.enrollMerchantMembership(merchant(), { ip: "127.0.0.1", userAgent: "jest" }, { customerNeedoId: "U0000000041" });

    expect(repo.findCandidateByNeedoId).toHaveBeenCalledWith(71, "u0000000041");
    expect(repo.createMembershipWithAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 9,
        customerNeedoId: "u0000000041",
        customerProfileId: 41,
        shopId: 71,
        audit: expect.objectContaining({
          action: "merchant.shop_membership.create",
          metadata: {
            customerNeedoId: "u0000000041",
            shopNo: "s000000071",
            source: "merchant_manual"
          }
        })
      })
    );
  });

  it("maps an active-key conflict to the stable membership conflict", async () => {
    const repo = repository({
      createMembershipWithAudit: jest.fn(async (input) => {
        void input;
        const error = new Error("unique") as Error & { code: string; meta: { target: string[] } };
        error.code = "P2002";
        error.meta = { target: ["active_key"] };
        throw error;
      })
    });
    const service = new ShopMembershipService(repo, { createInput: jest.fn((input) => input) }, () => now);

    await expect(
      service.enrollMerchantMembership(merchant(), { ip: "127.0.0.1" }, { customerNeedoId: "u0000000041" })
    ).rejects.toMatchObject({
      code: ERROR_CODES.SHOP_MEMBERSHIP_ALREADY_ACTIVE,
      message: "error.shop_membership.already_active",
      statusCode: 409
    });
  });

  it("enforces customer self scope for list and detail", async () => {
    const repo = repository();
    const service = new ShopMembershipService(repo, { createInput: jest.fn() }, () => now);
    const customer = merchant({
      currentIdentityType: "customer",
      currentIdentityScopeType: "customer_profile",
      currentIdentityScopeId: 41
    });

    await service.listCustomerMemberships(customer, { page: 1, pageSize: 20, status: "active" });
    await service.getCustomerMembershipDetail(customer, "membership-31");

    expect(repo.listCustomerMemberships).toHaveBeenCalledWith(41, { page: 1, pageSize: 20, status: "active" });
    expect(repo.findCustomerMembershipDetail).toHaveBeenCalledWith(41, "membership-31");
  });
});
