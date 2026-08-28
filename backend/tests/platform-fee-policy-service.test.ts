import { ERROR_CODES } from "../src/constants/error-codes";
import {
  PlatformFeePolicyService,
  type PlatformFeePolicyRepositoryPort
} from "../src/services/platform-fee-policy.service";

const context = { ip: "127.0.0.1", userAgent: "jest" };
const operationsActor = {
  userId: 1,
  email: "operator@example.com",
  accessTokenJti: "operator-jti",
  accessTokenExpiresAt: Date.now() + 60_000,
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null,
  roles: ["operator"],
  permissions: ["backoffice:platform-fee-policy:write"]
};
const merchantActor = {
  ...operationsActor,
  userId: 7,
  email: "merchant@example.com",
  currentIdentityScopeType: "merchant_account",
  currentIdentityScopeId: 4,
  roles: ["merchant_owner"],
  permissions: ["merchant-admin:platform-fee-policy:write"]
};

const shop = {
  shopId: 11,
  shopPublicId: "b0000000011",
  shopName: "Aoyama Care Studio"
};

const createRepository = (): jest.Mocked<PlatformFeePolicyRepositoryPort> =>
  ({
    findGlobalBookingFee: jest.fn(async () => null),
    findShopPolicy: jest.fn(async () => null),
    findShopById: jest.fn(async () => shop),
    listShopPolicies: jest.fn(),
    updateGlobalAmount: jest.fn(),
    updateShopFeeEnabled: jest.fn(async () => ({
      kind: "updated",
      value: {
        ...shop,
        feeEnabled: false,
        payerType: "shop",
        version: 1,
        updatedAt: new Date("2026-08-29T00:00:00.000Z")
      }
    })),
    updateShopPayerType: jest.fn(async () => ({
      kind: "updated",
      value: {
        ...shop,
        feeEnabled: true,
        payerType: "technician",
        version: 2,
        updatedAt: new Date("2026-08-29T00:00:00.000Z")
      }
    })),
    hasMerchantShopScope: jest.fn(async () => false)
  }) as unknown as jest.Mocked<PlatformFeePolicyRepositoryPort>;

const createService = (repository: jest.Mocked<PlatformFeePolicyRepositoryPort>) =>
  new PlatformFeePolicyService(repository, {
    createInput: jest.fn((input) => ({
      actorId: input.actor.userId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      ip: input.context.ip,
      userAgent: input.context.userAgent,
      metadata: input.metadata
    }))
  });

describe("PlatformFeePolicyService", () => {
  it("returns safe defaults when no shop policy or global family exists", async () => {
    const repository = createRepository();
    const service = createService(repository);

    await expect(service.getShopPolicy(operationsActor, context, 11)).resolves.toMatchObject({
      ...shop,
      globalAmountNdp: 500,
      globalVersion: 0,
      feeEnabled: true,
      payerType: "shop",
      policyVersion: 0,
      policySource: "default"
    });
  });

  it("updates only the operations-owned feeEnabled field", async () => {
    const repository = createRepository();
    const service = createService(repository);

    await service.updateShopFeeEnabled(operationsActor, context, 11, {
      feeEnabled: false,
      expectedVersion: 0
    });

    expect(repository.updateShopFeeEnabled).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 11,
        feeEnabled: false,
        expectedVersion: 0,
        actorUserId: 1,
        audit: expect.objectContaining({
          action: "backoffice.shop_platform_fee.enabled.update"
        })
      })
    );
    expect(repository.updateShopPayerType).not.toHaveBeenCalled();
  });

  it("updates only payerType inside the active merchant identity scope", async () => {
    const repository = createRepository();
    repository.hasMerchantShopScope.mockResolvedValue(true);
    const service = createService(repository);

    await service.updateShopPayerType(merchantActor, context, 11, {
      payerType: "technician",
      expectedVersion: 1
    });

    expect(repository.hasMerchantShopScope).toHaveBeenCalledWith({
      scopeType: "merchant_account",
      scopeId: 4,
      shopId: 11
    });
    expect(repository.updateShopPayerType).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 11,
        payerType: "technician",
        expectedVersion: 1,
        actorUserId: 7,
        merchantScope: { scopeType: "merchant_account", scopeId: 4 },
        audit: expect.objectContaining({
          action: "merchant_admin.shop_platform_fee.payer.update"
        })
      })
    );
    expect(repository.updateShopFeeEnabled).not.toHaveBeenCalled();
  });

  it("maps optimistic conflicts to a stable policy error", async () => {
    const repository = createRepository();
    repository.updateShopFeeEnabled.mockResolvedValue({ kind: "version_conflict" });
    const service = createService(repository);

    await expect(
      service.updateShopFeeEnabled(operationsActor, context, 11, {
        feeEnabled: false,
        expectedVersion: 4
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.PLATFORM_FEE_POLICY_VERSION_CONFLICT,
      message: "error.platform_fee_policy.version_conflict",
      statusCode: 409
    });
  });

  it("rejects global mutation when the canonical family is absent", async () => {
    const repository = createRepository();
    repository.updateGlobalAmount.mockResolvedValue({ kind: "config_conflict" });
    const service = createService(repository);

    await expect(
      service.updateGlobalAmount(operationsActor, context, {
        amountNdp: 700,
        expectedVersion: 1
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.PLATFORM_FEE_POLICY_CONFIG_CONFLICT,
      message: "error.platform_fee_policy.config_conflict",
      statusCode: 409
    });
  });

  it("rejects payer changes from a non-shop and non-merchant identity", async () => {
    const repository = createRepository();
    const service = createService(repository);

    await expect(
      service.updateShopPayerType(
        { ...merchantActor, currentIdentityScopeType: "customer_profile", currentIdentityScopeId: 8 },
        context,
        11,
        { payerType: "shop", expectedVersion: 0 }
      )
    ).rejects.toMatchObject({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
    expect(repository.updateShopPayerType).not.toHaveBeenCalled();
  });
});
