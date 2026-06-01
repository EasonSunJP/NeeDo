import request from "supertest";
import { createApp } from "../src/app";
import type { PricingModeRepositoryPort } from "../src/services/pricing-mode.service";

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
      updatedAt: now,
      updatedBy: 7
    })),
    updateShopPricingMode: jest.fn(),
    findTechnicianShopScope: jest.fn(),
    listTechnicianServices: jest.fn(),
    createTechnicianService: jest.fn(),
    updateTechnicianService: jest.fn(),
    deleteTechnicianService: jest.fn(),
    listBookingNavigationShopServices: jest.fn(),
    listBookingNavigationTechnicians: jest.fn(async () =>
      paginated([{ id: 3, displayName: "Mika", city: "Tokyo", avatarUrl: null, reviewSummary: null }])
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
      list: [{ id: 11, name: "深层护理 60 分钟", priceAmount: 8800 }]
    });
  });
});
