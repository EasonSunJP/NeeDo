import type { PrismaClient } from "@prisma/client";
import { TechnicianServiceBookingContextRepository } from "../src/repositories/technician-service-booking-context.repository";

const now = new Date("2026-09-05T03:00:00.000Z");

const record = () => ({
  id: 701,
  shopId: 11,
  technicianId: 81,
  publicId: "3a4dd96e-24d9-447e-a9c2-e230b5bdc32b",
  name: "着付け",
  description: "式典向け着付けです。",
  priceAmount: 18_000,
  currency: "JPY",
  durationMinutes: 90,
  coverImageUrl: "https://cdn.example.test/kitsuke-cover.jpg",
  imagesJson: ["https://cdn.example.test/kitsuke-2.jpg"],
  tagsJson: ["着物", "式典"],
  sourceShopService: { serviceMode: "store" },
  category: { name: "着付け" },
  shop: {
    name: "青山ケア",
    address: "港区青山1-1",
    status: "published",
    publicIdentifier: { publicId: "shop0000000011" },
    mediaAssets: [
      { url: "https://cdn.example.test/shop-cover.jpg", usageType: "cover", sortOrder: 1 }
    ],
    reviewSummary: {
      ratingAverage: { toString: () => "4.80" },
      reviewCount: 32,
      deletedAt: null
    }
  },
  technicianProfile: {
    displayName: "山田 花子",
    city: "港区",
    serviceArea: "東京23区",
    serviceAreasJson: ["港区", "渋谷区"],
    languages: ["ja", "zh-CN"],
    yearsExperience: 9,
    status: "published",
    mediaAssets: [
      { url: "https://cdn.example.test/yamada.jpg", usageType: "avatar", sortOrder: 1 }
    ],
    reviewSummary: {
      ratingAverage: { toString: () => "4.70" },
      reviewCount: 27,
      deletedAt: null
    },
    performanceSummary: {
      completedOrderCount: 64,
      acceptanceRateBps: 9_600,
      deletedAt: null
    },
    technicianShopAffiliations: [
      {
        shopId: 11,
        workStatus: "ACTIVE",
        activeKey: "81:11",
        startsAt: new Date("2026-01-01T00:00:00.000Z"),
        endsAt: null,
        deletedAt: null
      }
    ],
    user: {
      avatarBootstrapUrl: null,
      identities: [{ publicIdentifier: { publicId: "s0000000081" } }]
    }
  }
});

describe("TechnicianServiceBookingContextRepository", () => {
  it.each([
    [null, "5.00", 0],
    [{ ratingAverage: { toString: () => "4.00" }, reviewCount: 1, deletedAt: null }, "4.50", 1]
  ] as const)(
    "projects the platform rating prior for a technician review summary",
    async (reviewSummary, ratingAverage, reviewCount) => {
      const technicianService = record();
      technicianService.technicianProfile.reviewSummary = reviewSummary as never;
      const repository = new TechnicianServiceBookingContextRepository({
        technicianService: { findFirst: jest.fn(async () => technicianService) }
      } as unknown as PrismaClient);

      await expect(repository.findContext(701, now)).resolves.toMatchObject({
        technicianCard: { ratingAverage, reviewCount }
      });
    }
  );

  it("returns only the public, currently affiliated technician-service checkout context", async () => {
    const findFirst = jest.fn(async () => record());
    const repository = new TechnicianServiceBookingContextRepository({
      technicianService: { findFirst }
    } as unknown as PrismaClient);

    await expect(repository.findContext(701, now)).resolves.toEqual({
      target: { type: "technician_service", id: 701 },
      serviceCard: {
        targetType: "technician_service",
        publicId: "3a4dd96e-24d9-447e-a9c2-e230b5bdc32b",
        name: "着付け",
        description: "式典向け着付けです。",
        coverUrl: "https://cdn.example.test/kitsuke-cover.jpg",
        imageUrls: [
          "https://cdn.example.test/kitsuke-cover.jpg",
          "https://cdn.example.test/kitsuke-2.jpg"
        ],
        tags: ["着物", "式典"],
        catalogPriceJpy: 18_000,
        currency: "JPY",
        durationMinutes: 90,
        serviceMode: "store",
        serviceAreas: ["港区", "渋谷区"],
        shopPublicId: "shop0000000011",
        shopAddress: "港区青山1-1",
        detailPath: "/stores/shop0000000011/technicians/s0000000081/services"
      },
      shopCard: {
        type: "shop",
        publicId: "shop0000000011",
        name: "青山ケア",
        coverUrl: "https://cdn.example.test/shop-cover.jpg",
        imageUrls: ["https://cdn.example.test/shop-cover.jpg"],
        status: "published",
        isBookable: true,
        ratingAverage: "4.80",
        reviewCount: 32,
        address: "港区青山1-1",
        serviceMode: "store",
        detailPath: "/profiles/shop/shop0000000011"
      },
      technicianCard: {
        type: "technician",
        publicId: "s0000000081",
        displayName: "山田 花子",
        avatarUrl: "https://cdn.example.test/yamada.jpg",
        shop: { publicId: "shop0000000011", name: "青山ケア" },
        status: "published",
        isBookable: true,
        yearsExperience: 9,
        completedOrderCount: 64,
        acceptanceRatePercent: 96,
        ratingAverage: "4.71",
        reviewCount: 27,
        serviceAreas: ["港区", "渋谷区"],
        languages: ["ja", "zh-CN"],
        detailPath: "/profiles/technician/s0000000081",
        servicesPath: "/stores/shop0000000011/technicians/s0000000081/services"
      }
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 701,
        isActive: true,
        isBookable: true,
        reviewStatus: "APPROVED",
        deletedAt: null,
        category: { is: { isActive: true, deletedAt: null } },
        shop: expect.objectContaining({
          is: expect.objectContaining({ status: "published", deletedAt: null })
        }),
        technicianProfile: expect.objectContaining({
          is: expect.objectContaining({
            status: "published",
            visibility: "public",
            deletedAt: null,
            technicianShopAffiliations: {
              some: {
                workStatus: "ACTIVE",
                activeKey: { not: null },
                startsAt: { lte: now },
                OR: [{ endsAt: null }, { endsAt: { gt: now } }],
                deletedAt: null
              }
            }
          })
        })
      }),
      include: expect.any(Object)
    });
    expect(JSON.stringify(await repository.findContext(701, now))).not.toMatch(
      /userId|identityId|shopId|technicianProfileId|phone|email|homeAddress|kyc/iu
    );
  });

  it("returns the same not-found boundary for nonexistent or ineligible records", async () => {
    const repository = new TechnicianServiceBookingContextRepository({
      technicianService: { findFirst: jest.fn(async () => null) }
    } as unknown as PrismaClient);

    await expect(repository.findContext(999, now)).resolves.toBeNull();
  });

  it("fails closed when the active affiliation belongs to another shop", async () => {
    const mismatched = record();
    mismatched.technicianProfile.technicianShopAffiliations[0]!.shopId = 12;
    const repository = new TechnicianServiceBookingContextRepository({
      technicianService: { findFirst: jest.fn(async () => mismatched) }
    } as unknown as PrismaClient);

    await expect(repository.findContext(701, now)).resolves.toBeNull();
  });
});
