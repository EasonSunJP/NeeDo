import { ERROR_CODES } from "../src/constants/error-codes";
import { BackofficeService } from "../src/services/backoffice.service";
import { NeedoIdAllocationExhaustedError } from "../src/services/needo-id.service";

const context = { ip: "127.0.0.1", userAgent: "jest" };
const actor = {
  userId: 2,
  email: "merchant@example.com",
  accessTokenJti: "merchant-jti",
  accessTokenExpiresAt: Date.now() + 60_000,
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
    const service = new BackofficeService({ updateShop } as never, { record } as never);

    await expect(service.updateMerchantShop(
      { name: "Updated Studio", description: "Updated profile", city: "Yokohama" },
      actor as never,
      context
    )).resolves.toMatchObject({ id: 11, name: "Updated Studio" });

    expect(updateShop).toHaveBeenCalledWith(11, {
      name: "Updated Studio",
      description: "Updated profile",
      city: "Yokohama"
    });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      action: "merchant_admin.shop.update",
      targetType: "Shop",
      metadata: {
        shopId: 11,
        changedFields: ["name", "description", "city"]
      }
    }));
  });

  it("rejects a non-shop active identity before repository access", async () => {
    const updateShop = jest.fn();
    const service = new BackofficeService({ updateShop } as never, { record: jest.fn() } as never);

    await expect(service.updateMerchantShop(
      { name: "Forbidden" },
      { ...actor, currentIdentityScopeType: "global", currentIdentityScopeId: null } as never,
      context
    )).rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 });
    expect(updateShop).not.toHaveBeenCalled();
  });

  it("maps exhausted NeeDo ID allocation during merchant-owner creation to a stable error", async () => {
    const createShop = jest.fn(async () => {
      throw new NeedoIdAllocationExhaustedError();
    });
    const service = new BackofficeService(
      {
        findUserByEmail: jest.fn(async () => null),
        createShop
      } as never,
      { record: jest.fn(async () => undefined) } as never
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
