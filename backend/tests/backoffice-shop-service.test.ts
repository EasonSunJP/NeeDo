import { ERROR_CODES } from "../src/constants/error-codes";
import { BackofficeService } from "../src/services/backoffice.service";
import { UserBootstrapKeyAllocationExhaustedError } from "../src/services/user-bootstrap-key.service";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";

const context = { ip: "127.0.0.1", userAgent: "jest" };
const actor = {
  userId: 2,
  email: "merchant@example.com",
  accessTokenJti: "merchant-jti",
  accessTokenExpiresAt: Date.now() + 60_000,
  currentIdentityId: 22,
  currentIdentityType: "merchant_owner",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 11,
  roles: ["merchant_owner"],
  permissions: ["merchant-admin:shop:write"]
};

describe("BackofficeService merchant shop updates", () => {
  it("derives the shop id from the active identity and records changed fields", async () => {
    const updateShop = jest.fn(async () => ({
      id: 11,
      ownerUserId: 2,
      ownerEmail: "merchant@example.com",
      avatarUrl: null,
      name: "Updated Studio",
      description: "Updated profile",
      city: "Yokohama",
      address: "Aoyama 1-1",
      phone: null,
      status: "published",
      isRecommended: false,
      createdAt: "2026-08-25T00:00:00.000Z"
    }));
    const record = jest.fn(async () => undefined);
    const service = new BackofficeService(
      { updateShop } as never,
      { record } as never,
      createDirectShopContextRepository()
    );

    await expect(
      service.updateMerchantShop(
        { name: "Updated Studio", description: "Updated profile", city: "Yokohama" },
        actor as never,
        context
      )
    ).resolves.toMatchObject({ id: 11, name: "Updated Studio" });

    expect(updateShop).toHaveBeenCalledWith(11, {
      name: "Updated Studio",
      description: "Updated profile",
      city: "Yokohama"
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "merchant_admin.shop.update",
        targetType: "Shop",
        metadata: {
          shopId: 11,
          changedFields: ["name", "description", "city"]
        }
      })
    );
  });

  it("persists a shop-only avatar after storage and records the public field name", async () => {
    const updateMerchantShopProfile = jest.fn(async () => ({
      id: 11,
      ownerUserId: 2,
      ownerEmail: "merchant@example.com",
      avatarUrl: "/media/customer-avatars/shop.png",
      name: "Studio",
      description: null,
      city: "Tokyo",
      address: "Aoyama 1-1",
      phone: null,
      status: "published",
      isRecommended: false,
      createdAt: "2026-08-25T00:00:00.000Z"
    }));
    const record = jest.fn(async () => undefined);
    const save = jest.fn(async () => ({
      absolutePath: "/private/tmp/shop.png",
      height: 1,
      mimeType: "image/png" as const,
      url: "/media/customer-avatars/shop.png",
      width: 1
    }));
    const service = new BackofficeService(
      { updateMerchantShopProfile } as never,
      { record } as never,
      createDirectShopContextRepository(),
      undefined,
      { save }
    );
    const avatarDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";

    await expect(
      service.updateMerchantShop({ avatarDataUrl }, actor as never, context)
    ).resolves.toMatchObject({ avatarUrl: "/media/customer-avatars/shop.png" });

    expect(save).toHaveBeenCalledWith(avatarDataUrl);
    expect(updateMerchantShopProfile).toHaveBeenCalledWith({
      avatar: { mimeType: "image/png", url: "/media/customer-avatars/shop.png" },
      fields: {},
      identityId: 22,
      shopId: 11,
      userId: 2
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { changedFields: ["avatar"], shopId: 11 }
      })
    );
  });

  it("rejects a non-shop active identity before repository access", async () => {
    const updateShop = jest.fn();
    const service = new BackofficeService(
      { updateShop } as never,
      { record: jest.fn() } as never,
      createDirectShopContextRepository()
    );

    await expect(
      service.updateMerchantShop(
        { name: "Forbidden" },
        { ...actor, currentIdentityScopeType: "global", currentIdentityScopeId: null } as never,
        context
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 });
    expect(updateShop).not.toHaveBeenCalled();
  });

  it("maps exhausted NeeDo ID allocation during merchant-owner creation to a stable error", async () => {
    const createShop = jest.fn(async () => {
      throw new UserBootstrapKeyAllocationExhaustedError();
    });
    const service = new BackofficeService(
      {
        findUserByEmail: jest.fn(async () => null),
        createShop
      } as never,
      { record: jest.fn(async () => undefined) } as never,
      createDirectShopContextRepository()
    );

    await expect(
      service.createPlatformShop(
        {
          ownerEmail: "allocation-failure@example.com",
          ownerUsername: "Allocation Failure",
          ownerPassword: "Abcd@1234",
          name: "Allocation Failure Shop",
          city: "Tokyo",
          address: "1-1"
        },
        actor as never,
        context
      )
    ).rejects.toMatchObject({
      code: ERROR_CODES.NEEDO_ID_ALLOCATION_UNAVAILABLE,
      message: "error.auth.needo_id_allocation_unavailable",
      statusCode: 503
    });
  });
});
