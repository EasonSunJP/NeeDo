import request from "supertest";
import { createApp } from "../src/app";
import { ERROR_CODES } from "../src/constants/error-codes";
import type { ContentMediaRepositoryPort } from "../src/services/content-media.service";
import type { ContentMediaStoragePort } from "../src/services/content-media.storage";
import type { PricingModeRepositoryPort } from "../src/services/pricing-mode.service";
import { AppError } from "../src/utils/app-error";
import { validJpeg } from "./fixtures/content-images";
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
    findTechnicianServiceCoverTarget: jest.fn(),
    replaceTechnicianServiceCover: jest.fn(),
    removeTechnicianServiceCover: jest.fn(),
    hasActiveMediaUrl: jest.fn(),
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
          coverImageUrl: null,
          images: [],
          tags: [],
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
      list: [
        { id: 11, shopId: 1 },
        { id: 12, shopId: 2 }
      ]
    });
    expect(pricingModeRepository.listTechnicianServicesByProfile).toHaveBeenCalledWith({
      technicianId: 3,
      page: 1,
      pageSize: 20,
      activeOnly: false
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

  it("protects raw cover writes before parsing and supports the authenticated upload/remove flow", async () => {
    const pricingModeRepository = createRepository();
    let coverImageUrl: string | null = null;
    const baseService = serviceRecordForApi(11, 1);
    pricingModeRepository.findTechnicianShopScope.mockResolvedValue({ technicianId: 3, shopId: 1 });
    pricingModeRepository.findTechnicianServiceCoverTarget.mockImplementation(async () => ({
      service: { ...baseService, coverImageUrl },
      activeMediaAssetId: coverImageUrl ? 101 : null,
      checksumSha256: coverImageUrl ? "a".repeat(64) : null,
      mimeType: coverImageUrl ? "image/jpeg" : null
    }));
    pricingModeRepository.replaceTechnicianServiceCover.mockImplementation(async (input) => {
      coverImageUrl = input.url;
      return { ...baseService, coverImageUrl };
    });
    pricingModeRepository.removeTechnicianServiceCover.mockImplementation(async () => {
      coverImageUrl = null;
      return { ...baseService, coverImageUrl };
    });
    const contentMediaStorage: jest.Mocked<ContentMediaStoragePort> = {
      prepare: jest.fn(async ({ bytes, mimeType }) => {
        if (!bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
          throw new AppError({
            code: ERROR_CODES.VALIDATION,
            message: "error.content.media_invalid",
            statusCode: 400
          });
        }
        return { fileKey: "cover.jpg", checksumSha256: "a".repeat(64), mimeType };
      }),
      save: jest.fn(async ({ mimeType }) => ({
        fileKey: "cover.jpg",
        checksumSha256: "a".repeat(64),
        mimeType,
        created: true
      })),
      read: jest.fn(),
      delete: jest.fn()
    };
    const contentMediaRepository = {
      withChecksumLock: jest.fn(
        async (_checksum: string, operation: (locked: unknown) => Promise<unknown>) => operation({})
      )
    } as unknown as jest.Mocked<ContentMediaRepositoryPort>;
    const fixture = await createStep06Fixture({
      pricingModeRepository,
      contentMediaStorage,
      contentMediaRepository
    });
    fixture.users[0].identities[0] = {
      ...fixture.users[0].identities[0],
      type: "technician",
      scopeType: "technician_profile",
      scopeId: 3
    };

    await request(fixture.app)
      .put("/api/v1/technicians/me/shops/1/services/11/cover")
      .set("Content-Type", "image/jpeg")
      .send(validJpeg)
      .expect(401);
    expect(pricingModeRepository.findTechnicianShopScope).not.toHaveBeenCalled();
    expect(contentMediaStorage.prepare).not.toHaveBeenCalled();
    expect(contentMediaRepository.withChecksumLock).not.toHaveBeenCalled();

    fixture.replaceAdminPermissions(["auth:me"]);
    const accessToken = await fixture.loginAsAdmin();
    await request(fixture.app)
      .put("/api/v1/technicians/me/shops/1/services/11/cover")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Content-Type", "image/jpeg")
      .send(validJpeg)
      .expect(403);
    expect(pricingModeRepository.findTechnicianShopScope).not.toHaveBeenCalled();
    expect(contentMediaStorage.prepare).not.toHaveBeenCalled();
    expect(contentMediaRepository.withChecksumLock).not.toHaveBeenCalled();

    fixture.replaceAdminPermissions(["auth:me", "technician:services:write"]);
    await request(fixture.app)
      .put("/api/v1/technicians/me/shops/1/services/11/cover")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Content-Type", "text/plain")
      .send("not-an-image")
      .expect(415);
    expect(pricingModeRepository.findTechnicianShopScope).not.toHaveBeenCalled();
    expect(contentMediaStorage.prepare).not.toHaveBeenCalled();
    expect(contentMediaRepository.withChecksumLock).not.toHaveBeenCalled();

    await request(fixture.app)
      .put("/api/v1/technicians/me/shops/1/services/11/cover")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Content-Type", "image/jpeg")
      .send(Buffer.alloc(0))
      .expect(400);
    await request(fixture.app)
      .put("/api/v1/technicians/me/shops/1/services/11/cover")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Content-Type", "image/jpeg")
      .send(Buffer.from([0x00, 0x01, 0x02]))
      .expect(400);
    await request(fixture.app)
      .put("/api/v1/technicians/me/shops/1/services/11/cover")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Content-Type", "image/jpeg")
      .send(Buffer.alloc(8 * 1024 * 1024 + 1))
      .expect(413);

    const upload = await request(fixture.app)
      .put("/api/v1/technicians/me/shops/1/services/11/cover")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Content-Type", "image/jpeg")
      .send(validJpeg)
      .expect(200);
    expect(upload.body.data).toMatchObject({
      id: 11,
      coverImageUrl: "/media/content/cover.jpg"
    });

    await request(fixture.app)
      .delete("/api/v1/technicians/me/shops/1/services/11/cover")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => expect(response.body.data.coverImageUrl).toBeNull());
  });
});

const serviceRecordForApi = (id: number, shopId: number) => ({
  id,
  publicId: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  shopId,
  technicianId: 3,
  sourceShopServiceId: null,
  name: `Service ${id}`,
  description: null,
  categoryId: 2,
  priceAmount: 8_800,
  currency: "JPY",
  durationMinutes: 60,
  usageCount: 7,
  taxIncluded: true as const,
  coverImageUrl: null,
  images: [],
  tags: [],
  shop: {
    publicId: `shop${String(shopId).padStart(10, "0")}`,
    name: `Shop ${shopId}`,
    address: `Address ${shopId}`
  },
  isActive: true,
  isBookable: true,
  isRecommended: false,
  sortOrder: 0,
  reviewStatus: "approved",
  rejectionReason: null,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
});
