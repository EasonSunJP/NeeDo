import { ERROR_CODES } from "../src/constants/error-codes";
import {
  PricingModeService,
  type PricingModeRepositoryPort
} from "../src/services/pricing-mode.service";

const now = new Date("2026-06-02T00:00:00.000Z");
const context = { ip: "127.0.0.1", userAgent: "jest" };

const merchantActor = {
  userId: 7,
  email: "merchant@example.com",
  accessTokenJti: "jti",
  accessTokenExpiresAt: Date.now() + 60_000,
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 1,
  roles: ["merchant_owner"],
  permissions: ["merchant-admin:shop:pricing-mode:update"]
};

const technicianActor = {
  ...merchantActor,
  userId: 8,
  email: "technician@example.com",
  currentIdentityScopeType: "technician_profile",
  currentIdentityScopeId: 3,
  roles: ["technician"],
  permissions: ["technician:services:write"]
};

const createRepository = (): jest.Mocked<PricingModeRepositoryPort> =>
  ({
    findShopPricingMode: jest.fn(async () => ({
      shopId: 1,
      pricingMode: "merchant",
      updatedAt: null,
      updatedBy: null
    })),
    updateShopPricingMode: jest.fn(async (_shopId, pricingMode, actorUserId) => ({
      shopId: 1,
      pricingMode,
      updatedAt: now,
      updatedBy: actorUserId
    })),
    findTechnicianShopScope: jest.fn(async () => ({ technicianId: 3, shopId: 1 })),
    listTechnicianServices: jest.fn(async () => ({
      list: [],
      total: 0,
      page: 1,
      page_size: 20
    })),
    createTechnicianService: jest.fn(async () => ({
      id: 11,
      shopId: 1,
      technicianId: 3,
      sourceShopServiceId: null,
      name: "深层护理 60 分钟",
      description: "肩颈放松",
      categoryId: 2,
      priceAmount: 8800,
      currency: "JPY",
      durationMinutes: 60,
      coverImageUrl: null,
      images: [],
      tags: ["推荐"],
      isActive: true,
      isBookable: true,
      isRecommended: false,
      sortOrder: 0,
      reviewStatus: "approved",
      rejectionReason: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })),
    updateTechnicianService: jest.fn(),
    deleteTechnicianService: jest.fn(),
    listBookingNavigationShopServices: jest.fn(async () => ({
      list: [],
      total: 0,
      page: 1,
      page_size: 20
    })),
    listBookingNavigationTechnicians: jest.fn(async () => ({
      list: [{ id: 3, displayName: "Mika", city: "Tokyo", avatarUrl: null, reviewSummary: null }],
      total: 1,
      page: 1,
      page_size: 20
    })),
    listPublicTechnicianServices: jest.fn(async () => ({
      list: [],
      total: 0,
      page: 1,
      page_size: 20
    }))
  }) as unknown as jest.Mocked<PricingModeRepositoryPort>;

describe("PricingModeService", () => {
  it("updates a merchant scoped shop pricing mode and records an audit log", async () => {
    const repository = createRepository();
    const auditLogService = { record: jest.fn(async () => undefined) };
    const service = new PricingModeService(repository, auditLogService);

    const result = await service.updateShopPricingMode(
      merchantActor,
      context,
      1,
      "technician"
    );

    expect(result.pricingMode).toBe("technician");
    expect(repository.updateShopPricingMode).toHaveBeenCalledWith(1, "technician", 7);
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: merchantActor,
        action: "merchant_admin.shop.pricing_mode.update",
        targetType: "shop",
        metadata: { previousPricingMode: "merchant", nextPricingMode: "technician" }
      })
    );
  });

  it("rejects pricing mode updates outside the actor shop scope", async () => {
    const service = new PricingModeService(createRepository(), { record: jest.fn() });

    await expect(
      service.updateShopPricingMode(merchantActor, context, 2, "technician")
    ).rejects.toMatchObject({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden"
    });
  });

  it("creates technician services only for the authenticated technician shop scope", async () => {
    const repository = createRepository();
    const service = new PricingModeService(repository, { record: jest.fn() });

    await service.createTechnicianService(technicianActor, context, 1, {
      name: "深层护理 60 分钟",
      description: "肩颈放松",
      categoryId: 2,
      priceAmount: 8800,
      currency: "JPY",
      durationMinutes: 60,
      tags: ["推荐"]
    });

    expect(repository.findTechnicianShopScope).toHaveBeenCalledWith(3);
    expect(repository.createTechnicianService).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 1,
        technicianId: 3,
        createdBy: 8,
        name: "深层护理 60 分钟"
      })
    );
  });

  it("returns technician list navigation when a shop is in technician pricing mode", async () => {
    const repository = createRepository();
    repository.findShopPricingMode.mockResolvedValueOnce({
      shopId: 1,
      pricingMode: "technician",
      updatedAt: now,
      updatedBy: 7
    });
    const service = new PricingModeService(repository, { record: jest.fn() });

    const result = await service.getBookingNavigation(1, { page: 1, pageSize: 20 });

    expect(result.pricingMode).toBe("technician");
    expect(result.entry).toBe("technician_list");
    expect(repository.listBookingNavigationTechnicians).toHaveBeenCalledWith({
      shopId: 1,
      page: 1,
      pageSize: 20
    });
  });
});
