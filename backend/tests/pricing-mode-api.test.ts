import request from "supertest";
import { createApp } from "../src/app";
import type { PricingModeRepositoryPort } from "../src/services/pricing-mode.service";
import { createStep06Fixture } from "./helpers/step06-fixture";

const now = new Date("2026-06-02T00:00:00.000Z");

const paginated = <T>(list: T[]) => ({
  list,
  total: list.length,
  page: 1,
  page_size: 20
});

const createRepository = (): jest.Mocked<PricingModeRepositoryPort> =>
  ({
    findShopPricingMode: jest.fn(async () => ({
      shopId: 1,
      pricingMode: "technician",
      technicianPricingRatePercent: 200,
      updatedAt: now,
      updatedBy: 7
    })),
    updateShopPricingMode: jest.fn(),
    findTechnicianShopScope: jest.fn(),
    listTechnicianServices: jest.fn(),
    listTechnicianServicesByProfile: jest.fn(),
    findPrimaryTechnicianService: jest.fn(),
    reorderTechnicianServices: jest.fn(),
    createTechnicianService: jest.fn(),
    updateTechnicianService: jest.fn(),
    deleteTechnicianService: jest.fn(),
    listBookingNavigationShopServices: jest.fn(),
    listBookingNavigationTechnicians: jest.fn(async () =>
      paginated([
        { id: 3, displayName: "Mika", city: "Tokyo", avatarUrl: null, reviewSummary: null }
      ])
    ),
    listPublicTechnicianServices: jest.fn(async () =>
      paginated([
        {
          id: 11,
          shopId: 1,
          technicianId: 3,
          sourceShopServiceId: null,
          name: "深层护理 60 分钟",
          description: null,
          categoryId: 2,
          priceAmount: 8800,
          currency: "JPY",
          durationMinutes: 60,
          coverImageUrl: null,
          images: [],
          tags: [],
          isActive: true,
          isBookable: true,
          isRecommended: false,
          sortOrder: 0,
          reviewStatus: "approved",
          rejectionReason: null,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        }
      ])
    )
  }) as unknown as jest.Mocked<PricingModeRepositoryPort>;

describe("pricing mode public API", () => {
  it("returns technician booking navigation and public technician services", async () => {
    const pricingModeRepository = createRepository();
    const app = createApp(undefined, {
      redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
      pricingModeRepository
    } as never);

    const navigationResponse = await request(app)
      .get("/api/v1/shops/1/booking-navigation?page=1&pageSize=20")
      .expect(200);
    expect(navigationResponse.body.data).toMatchObject({
      shopId: 1,
      pricingMode: "technician",
      entry: "technician_list",
      technicians: paginated([
        { id: 3, displayName: "Mika", city: "Tokyo", avatarUrl: null, reviewSummary: null }
      ])
    });

    const servicesResponse = await request(app)
      .get("/api/v1/shops/1/technicians/3/services?page=1&pageSize=20")
      .expect(200);
    expect(servicesResponse.body.data).toMatchObject({
      list: [{ id: 11, name: "深层护理 60 分钟", priceAmount: 17600 }]
    });
  });

  it("keeps public technician services readable in merchant pricing mode without exposing them in booking navigation", async () => {
    const pricingModeRepository = createRepository();
    pricingModeRepository.findShopPricingMode.mockResolvedValue({
      shopId: 1,
      pricingMode: "merchant",
      technicianPricingRatePercent: 200,
      updatedAt: now,
      updatedBy: 7
    });
    pricingModeRepository.listBookingNavigationShopServices.mockResolvedValue(
      paginated([
        {
          id: 21,
          name: "店铺肩颈护理",
          priceAmount: "8800.00",
          currency: "JPY",
          durationMinutes: 60,
          coverUrl: null
        }
      ])
    );
    const app = createApp(undefined, {
      redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
      pricingModeRepository
    } as never);

    const navigationResponse = await request(app)
      .get("/api/v1/shops/1/booking-navigation?page=1&pageSize=20")
      .expect(200);
    expect(navigationResponse.body.data).toMatchObject({
      shopId: 1,
      pricingMode: "merchant",
      entry: "service_menu",
      services: paginated([{ id: 21, name: "店铺肩颈护理" }])
    });
    expect(navigationResponse.body.data).not.toHaveProperty("technicians");

    const servicesResponse = await request(app)
      .get("/api/v1/shops/1/technicians/3/services?page=1&pageSize=20")
      .expect(200);
    expect(servicesResponse.body.data).toMatchObject({
      list: [{ id: 11, name: "深层护理 60 分钟", priceAmount: 8800 }]
    });
  });

  it("lists and reorders the authenticated technician portfolio with validated commands", async () => {
    const pricingModeRepository = createRepository();
    pricingModeRepository.listTechnicianServicesByProfile.mockResolvedValue(
      paginated([
        { ...serviceRecordForApi(11, 1), sortOrder: 0 },
        { ...serviceRecordForApi(12, 2), sortOrder: 1 }
      ])
    );
    pricingModeRepository.reorderTechnicianServices.mockResolvedValue([
      { ...serviceRecordForApi(12, 2), sortOrder: 0 },
      { ...serviceRecordForApi(11, 1), sortOrder: 1 }
    ]);
    const fixture = await createStep06Fixture({ pricingModeRepository });
    fixture.replaceAdminPermissions([
      "auth:me",
      "technician:services:list",
      "technician:services:write"
    ]);
    fixture.users[0].identities[0] = {
      ...fixture.users[0].identities[0],
      type: "technician",
      scopeType: "technician_profile",
      scopeId: 3
    };
    const accessToken = await fixture.loginAsAdmin();

    const listResponse = await request(fixture.app)
      .get("/api/v1/technicians/me/services?page=1&pageSize=20&activeOnly=false")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(listResponse.body.data).toMatchObject({
      total: 2,
      list: [{ id: 11, shopId: 1 }, { id: 12, shopId: 2 }]
    });

    const reorderResponse = await request(fixture.app)
      .put("/api/v1/technicians/me/services/order")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        orderedServiceIds: [12, 11],
        idempotencyKey: "technician-order-0001"
      })
      .expect(200);
    expect(reorderResponse.body.data).toEqual([
      expect.objectContaining({ id: 12, sortOrder: 0 }),
      expect.objectContaining({ id: 11, sortOrder: 1 })
    ]);
    expect(pricingModeRepository.reorderTechnicianServices).toHaveBeenCalledTimes(1);

    await request(fixture.app)
      .put("/api/v1/technicians/me/services/order")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ orderedServiceIds: [12, 11, 10, 9, 8, 7], idempotencyKey: "too-many-services-01" })
      .expect(400);
    await request(fixture.app)
      .put("/api/v1/technicians/me/services/order")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ orderedServiceIds: [12, 11], idempotencyKey: "short" })
      .expect(400);
    expect(pricingModeRepository.reorderTechnicianServices).toHaveBeenCalledTimes(1);
  });
});

const serviceRecordForApi = (id: number, shopId: number) => ({
  id,
  shopId,
  technicianId: 3,
  sourceShopServiceId: null,
  name: `Service ${id}`,
  description: null,
  categoryId: 2,
  priceAmount: 8_800,
  currency: "JPY",
  durationMinutes: 60,
  taxIncluded: true as const,
  coverImageUrl: null,
  images: [],
  tags: [],
  isActive: true,
  isBookable: true,
  isRecommended: false,
  sortOrder: 0,
  reviewStatus: "approved",
  rejectionReason: null,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
});
