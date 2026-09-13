import type { Prisma, PrismaClient } from "@prisma/client";
import { calculateTechnicianPlatformRating } from "../domain/technician-rating";
import { prisma } from "../prisma/client";
import type { TechnicianServiceBookingContextPayload } from "../types/technician-service-booking-context.types";

const cardMedia = {
  where: { deletedAt: null, isActive: true },
  orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
  select: { url: true, usageType: true, sortOrder: true }
};

const contextInclude = {
  category: { select: { name: true } },
  sourceShopService: { select: { serviceMode: true } },
  shop: {
    include: {
      publicIdentifier: { select: { publicId: true } },
      mediaAssets: cardMedia,
      reviewSummary: {
        select: { ratingAverage: true, reviewCount: true, deletedAt: true }
      }
    }
  },
  technicianProfile: {
    include: {
      mediaAssets: cardMedia,
      reviewSummary: {
        select: { ratingAverage: true, reviewCount: true, deletedAt: true }
      },
      performanceSummary: {
        select: { completedOrderCount: true, acceptanceRateBps: true, deletedAt: true }
      },
      technicianShopAffiliations: {
        where: { deletedAt: null },
        select: {
          shopId: true,
          workStatus: true,
          activeKey: true,
          startsAt: true,
          endsAt: true,
          deletedAt: true
        }
      },
      user: {
        select: {
          avatarBootstrapUrl: true,
          identities: {
            where: {
              isActive: true,
              deletedAt: null,
              type: { in: ["technician", "service", "s"] },
              publicIdentifier: {
                is: { kind: "S", status: "ACTIVE", deletedAt: null }
              }
            },
            select: { publicIdentifier: { select: { publicId: true } } }
          }
        }
      }
    }
  }
} satisfies Prisma.TechnicianServiceInclude;

type ContextRecord = Prisma.TechnicianServiceGetPayload<{ include: typeof contextInclude }>;

export class TechnicianServiceBookingContextRepository {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findContext(
    id: number,
    now: Date
  ): Promise<TechnicianServiceBookingContextPayload | null> {
    const record = await this.client.technicianService.findFirst({
      where: {
        id,
        isActive: true,
        isBookable: true,
        reviewStatus: "APPROVED",
        deletedAt: null,
        currency: "JPY",
        durationMinutes: { gt: 0 },
        priceAmount: { gte: 0 },
        category: { is: { isActive: true, deletedAt: null } },
        shop: {
          is: {
            status: "published",
            deletedAt: null,
            publicIdentifier: {
              is: { kind: "SHOP", status: "ACTIVE", deletedAt: null }
            },
            entitySuspensions: {
              none: { activeKey: { not: null }, status: "active", deletedAt: null }
            }
          }
        },
        technicianProfile: {
          is: {
            status: "published",
            visibility: "public",
            deletedAt: null,
            user: {
              is: {
                isActive: true,
                deletedAt: null,
                identities: {
                  some: {
                    isActive: true,
                    deletedAt: null,
                    type: { in: ["technician", "service", "s"] },
                    publicIdentifier: {
                      is: { kind: "S", status: "ACTIVE", deletedAt: null }
                    }
                  }
                }
              }
            },
            technicianShopAffiliations: {
              some: {
                workStatus: "ACTIVE",
                activeKey: { not: null },
                startsAt: { lte: now },
                OR: [{ endsAt: null }, { endsAt: { gt: now } }],
                deletedAt: null
              }
            }
          }
        }
      },
      include: contextInclude
    });
    if (!record) return null;
    return this.mapContext(record, now);
  }

  private mapContext(
    record: ContextRecord,
    now: Date
  ): TechnicianServiceBookingContextPayload | null {
    if (record.shopId === null || record.shop === null) return null;
    const shopPublicId = record.shop.publicIdentifier?.publicId;
    const technicianPublicId =
      record.technicianProfile.user.identities[0]?.publicIdentifier?.publicId;
    const currentAffiliation = record.technicianProfile.technicianShopAffiliations.some(
      (affiliation) =>
        affiliation.shopId === record.shopId &&
        affiliation.workStatus === "ACTIVE" &&
        affiliation.activeKey !== null &&
        affiliation.deletedAt === null &&
        affiliation.startsAt.getTime() <= now.getTime() &&
        (affiliation.endsAt === null || affiliation.endsAt.getTime() > now.getTime())
    );
    if (
      !shopPublicId ||
      !/^shop\d{10}$/u.test(shopPublicId) ||
      !technicianPublicId ||
      !/^s\d{10}$/u.test(technicianPublicId) ||
      !currentAffiliation
    ) {
      return null;
    }

    const serviceMode = this.serviceMode(record.sourceShopService?.serviceMode ?? "store");
    if (!serviceMode) return null;
    const serviceAreas = this.serviceAreas(
      record.technicianProfile.serviceAreasJson,
      record.technicianProfile.serviceArea,
      record.technicianProfile.city
    );
    const serviceImageUrls = this.uniqueStrings([
      record.coverImageUrl,
      ...this.stringList(record.imagesJson)
    ]);
    const shopImageUrls = this.mediaUrls(record.shop.mediaAssets);
    const shopRating = this.rating(record.shop.reviewSummary);
    const technicianRating = this.technicianRating(record.technicianProfile.reviewSummary);
    const performance =
      record.technicianProfile.performanceSummary?.deletedAt === null
        ? record.technicianProfile.performanceSummary
        : null;
    const acceptanceRatePercent =
      performance &&
      performance.acceptanceRateBps >= 0 &&
      performance.acceptanceRateBps <= 10_000
        ? performance.acceptanceRateBps / 100
        : null;
    const servicesPath =
      `/stores/${shopPublicId}/technicians/${technicianPublicId}/services`;

    return {
      target: { type: "technician_service", id: record.id },
      serviceCard: {
        targetType: "technician_service",
        publicId: record.publicId,
        name: record.name,
        description: record.description,
        coverUrl: record.coverImageUrl?.trim() || serviceImageUrls[0] || null,
        imageUrls: serviceImageUrls,
        tags: this.stringList(record.tagsJson),
        catalogPriceJpy: record.priceAmount,
        currency: "JPY",
        durationMinutes: record.durationMinutes,
        serviceMode,
        serviceAreas,
        shopPublicId,
        shopAddress: record.shop.address,
        detailPath: servicesPath
      },
      shopCard: {
        type: "shop",
        publicId: shopPublicId,
        name: record.shop.name,
        coverUrl: this.mediaUrlByUsage(record.shop.mediaAssets, "cover"),
        imageUrls: shopImageUrls,
        status: "published",
        isBookable: true,
        ratingAverage: shopRating.ratingAverage,
        reviewCount: shopRating.reviewCount,
        address: record.shop.address,
        serviceMode,
        detailPath: `/profiles/shop/${shopPublicId}`
      },
      technicianCard: {
        type: "technician",
        publicId: technicianPublicId,
        displayName: record.technicianProfile.displayName,
        avatarUrl:
          this.mediaUrlByUsage(record.technicianProfile.mediaAssets, "avatar") ??
          record.technicianProfile.user.avatarBootstrapUrl,
        shop: { publicId: shopPublicId, name: record.shop.name },
        status: "published",
        isBookable: true,
        yearsExperience: record.technicianProfile.yearsExperience,
        completedOrderCount: performance?.completedOrderCount ?? null,
        acceptanceRatePercent,
        ratingAverage: technicianRating.ratingAverage,
        reviewCount: technicianRating.reviewCount,
        serviceAreas,
        languages: this.stringList(record.technicianProfile.languages),
        detailPath: `/profiles/technician/${technicianPublicId}`,
        servicesPath
      }
    };
  }

  private serviceMode(value: string): "store" | "onsite" | "flexible" | null {
    if (value === "store") return "store";
    if (value === "home" || value === "onsite") return "onsite";
    if (value === "flexible") return "flexible";
    return null;
  }

  private serviceAreas(value: Prisma.JsonValue | null, fallback: string | null, city: string) {
    const values = this.stringList(value);
    if (values.length > 0) return values;
    return this.uniqueStrings([fallback, city]);
  }

  private rating(
    summary: { ratingAverage: Prisma.Decimal; reviewCount: number; deletedAt: Date | null } | null
  ) {
    return !summary || summary.deletedAt !== null || summary.reviewCount <= 0
      ? { ratingAverage: null, reviewCount: 0 }
      : { ratingAverage: summary.ratingAverage.toString(), reviewCount: summary.reviewCount };
  }

  private technicianRating(
    summary: { ratingAverage: Prisma.Decimal; reviewCount: number; deletedAt: Date | null } | null
  ) {
    const reviewCount = summary?.deletedAt === null ? summary.reviewCount : 0;
    const reviewAverage = summary?.deletedAt === null ? Number(summary.ratingAverage) : 0;
    return {
      ratingAverage: calculateTechnicianPlatformRating(reviewAverage, reviewCount).toFixed(2),
      reviewCount
    };
  }

  private mediaUrls(media: Array<{ url: string }>) {
    return this.uniqueStrings(media.map(({ url }) => url));
  }

  private mediaUrlByUsage(
    media: Array<{ url: string; usageType: string }>,
    usageType: string
  ) {
    return media.find((asset) => asset.usageType === usageType)?.url.trim() || null;
  }

  private stringList(value: Prisma.JsonValue | null): string[] {
    return Array.isArray(value)
      ? this.uniqueStrings(value.filter((item): item is string => typeof item === "string"))
      : [];
  }

  private uniqueStrings(values: Array<string | null | undefined>): string[] {
    return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
  }
}
