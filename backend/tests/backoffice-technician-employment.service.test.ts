import { BackofficeService } from "../src/services/backoffice.service";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";

describe("BackofficeService merchant technician employment", () => {
  it("forwards persisted employment fields inside the authenticated shop scope", async () => {
    const updateTechnician = jest.fn(async () => ({ id: 7 }));
    const record = jest.fn(async () => undefined);
    const service = new BackofficeService(
      { updateTechnician } as never,
      { record } as never,
      createDirectShopContextRepository()
    );

    await service.updateMerchantTechnician(
      7,
      {
        employmentType: "temporary",
        employmentStartedAt: "2026-08-01T00:00:00.000Z"
      },
      {
        userId: 2,
        email: "merchant@example.com",
        accessTokenJti: "merchant-access",
        accessTokenExpiresAt: 1_800_000_000,
        currentIdentityType: "merchant_owner",
        currentIdentityScopeType: "shop",
        currentIdentityScopeId: 11,
        roles: ["merchant_owner"],
        permissions: ["merchant-admin:technicians:write"]
      },
      { ip: "127.0.0.1", userAgent: "jest" }
    );

    expect(updateTechnician).toHaveBeenCalledWith({
      scope: "merchant",
      shopId: 11,
      technicianId: 7,
      employmentType: "temporary",
      employmentStartedAt: "2026-08-01T00:00:00.000Z"
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "merchant_admin.technician.update",
        metadata: {
          technicianId: 7,
          shopId: 11,
          changedFields: ["employmentType", "employmentStartedAt"]
        }
      })
    );
  });
});
