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
  currentIdentityType: "merchant_owner",
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

const createRepository = (): jest.Mocked<PricingModeRepositoryPort> => {
  const repository: jest.Mocked<PricingModeRepositoryPort> = {
    findShopPricingMode: jest.fn(async (_shopId: number) => {
      void _shopId;
      return {
        shopId: 1,
        pricingMode: "merchant" as const,
        technicianPricingRatePercent: 100,
        updatedAt: null,
        updatedBy: null
      };
    }),
    updateShopPricingMode: jest.fn(
      async (_shopId, pricingMode, technicianPricingRatePercent, actorUserId) => ({
        shopId: 1,
        pricingMode,
        technicianPricingRatePercent,
        updatedAt: now,
        updatedBy: actorUserId
      })
    ),
    findTechnicianShopScope: jest.fn(async (_technicianId: number, shopId: number) => {
      void _technicianId;
      return { technicianId: 3, shopId };
    }),
    listTechnicianServices: jest.fn(async (_input) => {
      void _input;
      return { list: [], total: 0, page: 1, page_size: 20 };
    }),
    listTechnicianServicesByProfile: jest.fn(async (_input) => {
      void _input;
      return { list: [], total: 0, page: 1, page_size: 20 };
    }),
    findPrimaryTechnicianService: jest.fn(async (_technicianId: number) => {
      void _technicianId;
      return null;
    }),
    reorderTechnicianServices: jest.fn(async (_input) => {
      void _input;
      return [];
    }),
    createTechnicianService: jest.fn(async (_input) => {
      void _input;
      return {
        id: 11,
        publicId: "00000000-0000-4000-8000-000000000011",
        shopId: 1,
        technicianId: 3,
        sourceShopServiceId: null,
        name: "深层护理 60 分钟",
        description: "肩颈放松",
        categoryId: 2,
        priceAmount: 8800,
        currency: "JPY",
        durationMinutes: 60,
        usageCount: 7,
        taxIncluded: true as const,
        coverImageUrl: null,
        images: [],
        tags: ["推荐"],
        shop: { publicId: "shop0000000001", name: "LifeDance", address: "东京都港区" },
        isActive: true,
        isBookable: true,
        isRecommended: false,
        sortOrder: 0,
        reviewStatus: "approved",
        rejectionReason: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };
    }),
    updateTechnicianService: jest.fn(),
    deleteTechnicianService: jest.fn(),
    findTechnicianServiceCoverTarget: jest.fn(async (_input) => {
      void _input;
      return null;
    }),
    replaceTechnicianServiceCover: jest.fn(async (_input) => {
      void _input;
      return null;
    }),
    removeTechnicianServiceCover: jest.fn(async (_input) => {
      void _input;
      return null;
    }),
    hasActiveMediaUrl: jest.fn(async (_url: string) => {
      void _url;
      return false;
    }),
    listBookingNavigationShopServices: jest.fn(async (_input) => {
      void _input;
      return { list: [], total: 0, page: 1, page_size: 20 };
    }),
    listBookingNavigationTechnicians: jest.fn(async (_input) => {
      void _input;
      return {
        list: [{ id: 3, displayName: "Mika", city: "Tokyo", avatarUrl: null, reviewSummary: null }],
        total: 1,
        page: 1,
        page_size: 20
      };
    }),
    listPublicTechnicianServices: jest.fn(async (_input) => {
      void _input;
      return {
        list: [
          {
            id: 11,
            publicId: "00000000-0000-4000-8000-000000000011",
            shopId: 1,
            technicianId: 3,
            sourceShopServiceId: null,
            name: "深层护理 60 分钟",
            description: null,
            categoryId: 2,
            priceAmount: 8800,
            currency: "JPY",
            durationMinutes: 60,
            usageCount: 7,
            taxIncluded: true as const,
            coverImageUrl: null,
            images: [],
            tags: ["推荐"],
            shop: { publicId: "shop0000000001", name: "LifeDance", address: "东京都港区" },
            isActive: true,
            isBookable: true,
            isRecommended: false,
            sortOrder: 0,
            reviewStatus: "approved",
            rejectionReason: null,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
          }
        ],
        total: 1,
        page: 1,
        page_size: 20
      };
    })
  };

  return repository;
};

describe("PricingModeService", () => {
  it("updates a merchant scoped shop pricing mode and records an audit log", async () => {
    const repository = createRepository();
    const auditLogService = { record: jest.fn(async () => undefined) };
    const service = new PricingModeService(repository, auditLogService);

    const result = await service.updateShopPricingMode(
      merchantActor,
      context,
      1,
      "technician",
      110
    );

    expect(result.pricingMode).toBe("technician");
    expect(result.technicianPricingRatePercent).toBe(100);
    expect(repository.updateShopPricingMode).toHaveBeenCalledWith(1, "technician", 100, 7);
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: merchantActor,
        action: "merchant_admin.shop.pricing_mode.update",
        targetType: "shop",
        metadata: {
          previousPricingMode: "merchant",
          nextPricingMode: "technician",
          previousTechnicianPricingRatePercent: 100,
          nextTechnicianPricingRatePercent: 100
        }
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
    const auditLogService = { record: jest.fn() };
    const service = new PricingModeService(repository, auditLogService);

    await service.createTechnicianService(technicianActor, context, 1, {
      name: "深层护理 60 分钟",
      description: "肩颈放松",
      categoryId: 2,
      priceAmount: 8800,
      currency: "JPY",
      durationMinutes: 60,
      tags: ["推荐"]
    });

    expect(repository.findTechnicianShopScope).toHaveBeenCalledWith(3, 1);
    expect(repository.createTechnicianService).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 1,
        technicianId: 3,
        createdBy: 8,
        name: "深层护理 60 分钟",
        auditLog: expect.objectContaining({
          actorId: 8,
          action: "technician.services.create",
          targetType: "technician_service",
          ip: "127.0.0.1",
          userAgent: "jest"
        })
      })
    );
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it("accepts the same technician in another actively affiliated shop without changing the portfolio", async () => {
    const repository = createRepository();
    const service = new PricingModeService(repository, { record: jest.fn() });

    await service.listTechnicianServices(technicianActor, context, 2, {
      page: 1,
      pageSize: 20
    });

    expect(repository.findTechnicianShopScope).toHaveBeenCalledWith(3, 2);
    expect(repository.listTechnicianServices).toHaveBeenCalledWith(expect.objectContaining({
      shopId: 2,
      technicianId: 3
    }));
  });

  it("creates an independent technician service without requiring a shop", async () => {
    const repository = createRepository();
    const service = new PricingModeService(repository, { record: jest.fn() });

    await service.createMyTechnicianService(technicianActor, context, {
      name: "独立服务",
      categoryId: 2,
      priceAmount: 6800,
      currency: "JPY",
      durationMinutes: 45
    });

    expect(repository.findTechnicianShopScope).not.toHaveBeenCalled();
    expect(repository.createTechnicianService).toHaveBeenCalledWith(expect.objectContaining({
      shopId: null,
      technicianId: 3,
      name: "独立服务"
    }));
  });

  it("lists and reorders the authenticated technician profile across shop contexts", async () => {
    const repository = createRepository();
    const service = new PricingModeService(repository, { record: jest.fn() });

    await service.listMyTechnicianServices(technicianActor, context, {
      page: 1,
      pageSize: 20,
      activeOnly: false
    });
    await service.reorderMyTechnicianServices(technicianActor, context, {
      orderedServiceIds: [13, 11, 12],
      idempotencyKey: "technician-order-0001"
    });

    expect(repository.listTechnicianServicesByProfile).toHaveBeenCalledWith({
      technicianId: 3,
      page: 1,
      pageSize: 20,
      activeOnly: false
    });
    expect(repository.reorderTechnicianServices).toHaveBeenCalledWith(
      expect.objectContaining({
        technicianId: 3,
        orderedServiceIds: [13, 11, 12],
        actorUserId: 8,
        idempotencyKey: "technician-order-0001",
        requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        auditLog: expect.objectContaining({
          action: "technician.services.reorder",
          targetType: "technician_profile",
          targetId: 3
        })
      })
    );
  });

  it("passes service deletion audit evidence into the repository transaction only once", async () => {
    const repository = createRepository();
    repository.deleteTechnicianService.mockResolvedValueOnce(true);
    const auditLogService = { record: jest.fn(async () => undefined) };
    const service = new PricingModeService(repository, auditLogService);

    await expect(service.deleteTechnicianService(technicianActor, context, 1, 11)).resolves.toEqual(
      { deleted: true }
    );

    expect(repository.deleteTechnicianService).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 1,
        technicianId: 3,
        serviceId: 11,
        updatedBy: 8,
        now: expect.any(Date),
        auditLog: {
          actorId: 8,
          action: "technician.services.delete",
          targetType: "shop",
          targetId: 1,
          ip: "127.0.0.1",
          userAgent: "jest",
          metadata: { technicianId: 3, serviceId: 11 }
        }
      })
    );
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it("rejects global portfolio access outside technician identity scope", async () => {
    const service = new PricingModeService(createRepository(), { record: jest.fn() });

    await expect(
      service.listMyTechnicianServices(merchantActor, context, { page: 1, pageSize: 20 })
    ).rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 });
  });

  it("returns technician list navigation when a shop is in technician pricing mode", async () => {
    const repository = createRepository();
    repository.findShopPricingMode.mockResolvedValueOnce({
      shopId: 1,
      pricingMode: "technician",
      technicianPricingRatePercent: 100,
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

  it("keeps the customer-facing technician service price independent from settlement share", async () => {
    const repository = createRepository();
    repository.findShopPricingMode.mockResolvedValueOnce({
      shopId: 1,
      pricingMode: "technician",
      technicianPricingRatePercent: 30,
      updatedAt: now,
      updatedBy: 7
    });
    const service = new PricingModeService(repository, { record: jest.fn() });

    const result = await service.listPublicTechnicianServices(1, 3, { page: 1, pageSize: 20 });

    expect(result.list[0]?.priceAmount).toBe(8800);
    expect(repository.listPublicTechnicianServices).toHaveBeenCalledWith({
      shopId: 1,
      technicianId: 3,
      page: 1,
      pageSize: 20
    });
  });

  it("does not expose technician services as bookable in merchant pricing mode", async () => {
    const repository = createRepository();
    repository.findShopPricingMode.mockResolvedValueOnce({
      shopId: 1,
      pricingMode: "merchant",
      technicianPricingRatePercent: 30,
      updatedAt: now,
      updatedBy: 7
    });
    const service = new PricingModeService(repository, { record: jest.fn() });

    const result = await service.listPublicTechnicianServices(1, 3, { page: 1, pageSize: 20 });

    expect(result).toEqual({ list: [], total: 0, page: 1, page_size: 20 });
    expect(repository.listPublicTechnicianServices).not.toHaveBeenCalled();
  });
});
