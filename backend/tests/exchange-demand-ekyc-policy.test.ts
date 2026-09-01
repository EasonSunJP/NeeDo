import { ERROR_CODES } from "../src/constants/error-codes";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { ExchangeService } from "../src/services/exchange.service";
import { AppError } from "../src/utils/app-error";

const now = new Date("2026-09-01T10:00:00.000Z");
const access: AuthenticatedAccessContext = {
  userId: 41,
  email: "customer@example.com",
  accessTokenJti: "access-41",
  accessTokenExpiresAt: 1_800_000_000,
  currentIdentityId: 410,
  currentIdentityType: "customer",
  currentIdentityScopeType: "customer_profile",
  currentIdentityScopeId: 91,
  currentPublicId: "u0000000041",
  roles: ["customer"],
  permissions: ["exchange:posts:create-demand"]
};
const demandInput = {
  type: "demand" as const,
  title: "Request",
  detail: "Need a service",
  contentLocale: "en" as const,
  serviceStartAt: new Date("2026-09-02T10:00:00.000Z"),
  serviceEndAt: new Date("2026-09-02T11:00:00.000Z"),
  expiresAt: new Date("2026-09-02T12:00:00.000Z"),
  serviceMode: "home" as const,
  targetProviderCount: 1,
  matchMode: "quick" as const,
  budgetMode: "total" as const,
  budgetMinJpy: null,
  budgetMaxJpy: 10_000,
  addressLine1: "Tokyo",
  addressLine2: null,
  addressLine3: null,
  addressLine2Public: false,
  addressLine3Public: false,
  publisherIdentityPublic: false
};
const actor = {
  userId: 41,
  identityId: 410,
  identityType: "customer",
  scopeType: "customer_profile",
  scopeId: 91,
  publicId: "u0000000041",
  displayName: "Customer",
  avatarUrl: null,
  isTestAccount: false,
  customerMembership: {
    profileId: 91,
    membershipLevel: "standard",
    membershipGrantMode: "permanent",
    membershipStartsAt: null,
    membershipExpiresAt: null
  },
  shopScope: null
};
const post = {
  id: 51,
  type: "demand" as const,
  status: "published" as const,
  title: "Request",
  detail: "Need a service",
  contentLocale: "en" as const,
  areaLabel: "Tokyo",
  serviceStartAt: demandInput.serviceStartAt.toISOString(),
  serviceEndAt: demandInput.serviceEndAt.toISOString(),
  expiresAt: demandInput.expiresAt.toISOString(),
  publishedAt: now.toISOString(),
  publisher: {
    publicId: actor.publicId,
    identityType: "customer",
    displayName: "Customer",
    avatarUrl: null
  },
  counts: { comments: 0, likes: 0, shares: 0 },
  viewer: { liked: false, canWithdraw: true },
  demand: {
    serviceMode: "home" as const,
    targetProviderCount: 1,
    targetProviderLimitSnapshot: 1,
    publisherCapacitySource: "customer_membership" as const,
    membershipLevelSnapshot: "standard" as const,
    matchMode: "quick" as const,
    budgetMode: "total" as const,
    budgetMinJpy: null,
    budgetMaxJpy: 10_000,
    address: {
      line1: "Tokyo",
      line2: null,
      line3: null,
      line2GenerallyVisible: false,
      line3GenerallyVisible: false,
      disclosure: "owner" as const
    }
  },
  intelligence: null
};

function fixture() {
  let reject = true;
  const repository: Record<string, jest.Mock> = {
    runInTransaction: jest.fn(
      async (handler: (repository: unknown, tx: unknown) => Promise<unknown>) =>
        handler(repository, { tx: true })
    ),
    resolveActor: jest.fn(async () => actor),
    findPostByIdempotencyKey: jest.fn(async () => null),
    createPost: jest.fn(async () => ({ id: 51 })),
    createAudit: jest.fn(async () => undefined),
    findPostByIdOrThrow: jest.fn(async () => post)
  };
  const enforcement = {
    assertServiceEkyc: jest.fn(async () => {
      if (reject)
        throw new AppError({
          code: ERROR_CODES.USER_POLICY_COMPLIANCE_REQUIRED,
          message: "error.user_policy.ekyc_required",
          statusCode: 403
        });
    })
  };
  const fee: Record<string, jest.Mock> = {
    resolveCurrent: jest.fn(async () => ({ amountNdp: 1_000, ruleSetVersion: 1 })),
    recordPublicationCalculation: jest.fn(async () => 71),
    withTransactionClient: jest.fn(() => fee)
  };
  const ledger = {
    freezeExchangeRequestPublication: jest.fn(async () => undefined),
    captureExchangeRequestPublication: jest.fn(),
    releaseExchangeRequestPublication: jest.fn()
  };
  const service = new ExchangeService(
    repository as never,
    () => now,
    undefined,
    fee as never,
    ledger as never,
    enforcement as never
  );
  return {
    enforcement,
    repository,
    service,
    allow: () => {
      reject = false;
    }
  };
}

describe("Exchange demand eKYC policy", () => {
  it("rejects a Request before transaction, post, fee, ledger or audit mutation", async () => {
    const state = fixture();
    await expect(
      state.service.publish(access, demandInput, "request-policy-0001")
    ).rejects.toMatchObject({
      code: ERROR_CODES.USER_POLICY_COMPLIANCE_REQUIRED,
      statusCode: 403
    });
    expect(state.enforcement.assertServiceEkyc).toHaveBeenCalledWith(41, "home", now);
    expect(state.repository.runInTransaction).not.toHaveBeenCalled();
    expect(state.repository.createPost).not.toHaveBeenCalled();
    expect(state.repository.createAudit).not.toHaveBeenCalled();
  });

  it("allows an idempotent retry after eKYC becomes valid", async () => {
    const state = fixture();
    await expect(
      state.service.publish(access, demandInput, "request-policy-0002")
    ).rejects.toBeInstanceOf(AppError);
    state.allow();
    await expect(
      state.service.publish(access, demandInput, "request-policy-0002")
    ).resolves.toEqual(post);
    expect(state.repository.createPost).toHaveBeenCalledTimes(1);
    expect(state.repository.createAudit).toHaveBeenCalledTimes(1);
  });

  it("does not apply the eKYC gate to intelligence publication", async () => {
    const state = fixture();
    state.repository.resolveActor.mockResolvedValue({
      ...actor,
      identityType: "technician",
      customerMembership: null
    });
    await state.service.publish(
      {
        ...access,
        currentIdentityType: "technician"
      },
      {
        type: "intelligence",
        title: "Offer",
        detail: "Available",
        contentLocale: "en",
        serviceStartAt: demandInput.serviceStartAt,
        serviceEndAt: demandInput.serviceEndAt,
        expiresAt: demandInput.expiresAt,
        areaLabel: "Tokyo",
        serviceMode: "store",
        addressLabel: null,
        serviceAreas: ["Tokyo"],
        originalPriceJpy: null,
        campaignPriceJpy: 8_000
      },
      "intelligence-policy-1"
    );
    expect(state.enforcement.assertServiceEkyc).not.toHaveBeenCalled();
  });
});
