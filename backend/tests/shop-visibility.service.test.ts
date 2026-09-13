import { ERROR_CODES } from "../src/constants/error-codes";
import {
  ShopVisibilityService,
  type ShopVisibilityRepositoryPort
} from "../src/services/shop-visibility.service";

const context = { ip: "127.0.0.1", userAgent: "jest" };
const actor = {
  userId: 7,
  email: "merchant@example.test",
  accessTokenJti: "jti",
  accessTokenExpiresAt: Date.now() + 60_000,
  currentIdentityId: 70,
  currentIdentityType: "merchant_owner",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 16,
  roles: ["merchant_owner"],
  permissions: ["merchant-admin:shop:read", "merchant-admin:shop:write"]
};

const current = {
  shopId: 16,
  visibility: "public" as const,
  updatedAt: null,
  updatedBy: null
};

const createRepository = (): jest.Mocked<ShopVisibilityRepositoryPort> => ({
  buildVisibilityWhere: jest.fn(async () => ({ visibility: "public" })),
  canView: jest.fn(),
  canViewTarget: jest.fn(),
  findVisibility: jest.fn(async (_shopId: number) => {
    void _shopId;
    return current;
  }),
  updateVisibility: jest.fn(async (input) => ({
    shopId: input.shopId,
    visibility: input.visibility,
    updatedAt: input.updatedAt,
    updatedBy: input.actorUserId
  }))
});

describe("ShopVisibilityService", () => {
  it("reads the authenticated merchant's current shop visibility", async () => {
    const repository = createRepository();
    const service = new ShopVisibilityService(repository);

    await expect(service.get(actor, 16)).resolves.toEqual(current);
    expect(repository.findVisibility).toHaveBeenCalledWith(16);
  });

  it("updates visibility with the selected shop scope and transactional audit evidence", async () => {
    const repository = createRepository();
    const now = new Date("2026-09-13T06:00:00.000Z");
    const service = new ShopVisibilityService(repository, () => now);

    await expect(service.update(actor, context, 16, "network")).resolves.toMatchObject({
      shopId: 16,
      visibility: "network",
      updatedBy: 7
    });
    expect(repository.updateVisibility).toHaveBeenCalledWith({
      shopId: 16,
      visibility: "network",
      actorUserId: 7,
      updatedAt: now,
      auditLog: {
        actorId: 7,
        action: "merchant_admin.shop.visibility.update",
        targetType: "shop",
        targetId: 16,
        ip: "127.0.0.1",
        userAgent: "jest",
        metadata: { previousVisibility: "public", nextVisibility: "network" }
      }
    });
  });

  it("rejects another shop and read-only merchant preview before repository access", async () => {
    const repository = createRepository();
    const service = new ShopVisibilityService(repository);

    await expect(service.get(actor, 17)).rejects.toMatchObject({
      code: ERROR_CODES.IDENTITY_FORBIDDEN
    });
    await expect(
      service.update(
        { ...actor, isReadOnlyMerchantPreview: true, merchantPreviewShopId: 16 },
        context,
        16,
        "privateAll"
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN });
    expect(repository.findVisibility).not.toHaveBeenCalled();
    expect(repository.updateVisibility).not.toHaveBeenCalled();
  });

  it("returns a formal not-found error when the scoped shop row is unavailable", async () => {
    const repository = createRepository();
    repository.findVisibility.mockResolvedValue(null);
    const service = new ShopVisibilityService(repository);

    await expect(service.get(actor, 16)).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.shop.not_found",
      statusCode: 404
    });
  });
});
