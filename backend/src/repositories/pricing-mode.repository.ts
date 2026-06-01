import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import {
  type BookingNavigationServicePayload,
  type BookingNavigationTechnicianPayload,
  type PricingModePayload,
  type PricingModeRepositoryPort,
  type ShopPricingModePayload,
  type TechnicianServiceCreateRepositoryInput,
  type TechnicianServicePayload,
  type TechnicianServiceUpdateRepositoryInput,
  type TechnicianShopScopePayload
} from "../services/pricing-mode.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";

type DecimalLike = {
  toFixed: (decimalPlaces?: number) => string;
};

type ShopPricingModeRecord = {
  id: number;
  pricingMode: string;
  technicianPricingRatePercent?: number;
  pricingModeUpdatedAt: Date | null;
  pricingModeUpdatedBy: number | null;
};

const legacyShopTechnicianPricingRatePercent = new Map<number, number>();

type TechnicianServiceRecord = Prisma.TechnicianServiceGetPayload<Record<string, never>>;

type ShopServiceRecord = Prisma.ServiceGetPayload<{
  include: {
    mediaAssets: true;
  };
}>;

type TechnicianRecord = Prisma.TechnicianProfileGetPayload<{
  include: {
    mediaAssets: true;
    reviewSummary: true;
  };
}>;

export class PricingModeRepository implements PricingModeRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findShopPricingMode(shopId: number): Promise<ShopPricingModePayload | null> {
    try {
      return this.mapShopPricingMode(await this.findShopPricingModeWithRate(shopId));
    } catch (error) {
      if (!this.isMissingTechnicianPricingRateColumn(error)) {
        throw error;
      }

      return this.mapShopPricingMode(
        await this.findShopPricingModeWithoutRate(shopId),
        legacyShopTechnicianPricingRatePercent.get(shopId)
      );
    }
  }

  public async updateShopPricingMode(
    shopId: number,
    pricingMode: PricingModePayload,
    technicianPricingRatePercent: number,
    actorUserId: number
  ): Promise<ShopPricingModePayload> {
    try {
      return this.mapShopPricingMode(
        await this.updateShopPricingModeWithRate(shopId, pricingMode, technicianPricingRatePercent, actorUserId)
      ) as ShopPricingModePayload;
    } catch (error) {
      if (!this.isMissingTechnicianPricingRateColumn(error)) {
        throw error;
      }

      const shop = await this.updateShopPricingModeWithoutRate(shopId, pricingMode, actorUserId);
      legacyShopTechnicianPricingRatePercent.set(shopId, technicianPricingRatePercent);
      return {
        ...(this.mapShopPricingMode(
          shop,
          technicianPricingRatePercent
        ) as ShopPricingModePayload)
      };
    }
  }

  public async findTechnicianShopScope(
    technicianId: number
  ): Promise<TechnicianShopScopePayload | null> {
    const technician = await this.client.technicianProfile.findFirst({
      where: {
        id: technicianId,
        deletedAt: null
      },
      select: {
        id: true,
        shopId: true
      }
    });

    return technician ? { technicianId: technician.id, shopId: technician.shopId } : null;
  }

  public async listTechnicianServices(
    input: PaginationInput & { shopId: number; technicianId: number; activeOnly?: boolean }
  ): Promise<PaginatedResponse<TechnicianServicePayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.TechnicianServiceWhereInput = {
      shopId: input.shopId,
      technicianId: input.technicianId,
      deletedAt: null,
      ...(input.activeOnly ? { isActive: true } : {})
    };

    const [list, total] = await Promise.all([
      this.client.technicianService.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
      }),
      this.client.technicianService.count({ where })
    ]);

    return buildPaginatedResponse(list.map((service) => this.mapTechnicianService(service)), total, input);
  }

  public async createTechnicianService(
    input: TechnicianServiceCreateRepositoryInput
  ): Promise<TechnicianServicePayload> {
    const service = await this.client.technicianService.create({
      data: {
        shopId: input.shopId,
        technicianId: input.technicianId,
        sourceShopServiceId: input.sourceShopServiceId ?? null,
        name: input.name,
        description: input.description ?? null,
        categoryId: input.categoryId,
        priceAmount: input.priceAmount,
        currency: input.currency,
        durationMinutes: input.durationMinutes,
        coverImageUrl: input.coverImageUrl ?? null,
        imagesJson: input.images ?? [],
        tagsJson: input.tags ?? [],
        isActive: input.isActive ?? true,
        isBookable: input.isBookable ?? true,
        isRecommended: input.isRecommended ?? false,
        sortOrder: input.sortOrder ?? 0,
        reviewStatus: "APPROVED",
        createdBy: input.createdBy,
        updatedBy: input.createdBy
      }
    });

    return this.mapTechnicianService(service);
  }

  public async updateTechnicianService(
    input: TechnicianServiceUpdateRepositoryInput
  ): Promise<TechnicianServicePayload | null> {
    const update = await this.client.technicianService.updateMany({
      where: {
        id: input.serviceId,
        shopId: input.shopId,
        technicianId: input.technicianId,
        deletedAt: null
      },
      data: {
        sourceShopServiceId: input.sourceShopServiceId,
        name: input.name,
        description: input.description,
        categoryId: input.categoryId,
        priceAmount: input.priceAmount,
        currency: input.currency,
        durationMinutes: input.durationMinutes,
        coverImageUrl: input.coverImageUrl,
        imagesJson: input.images,
        tagsJson: input.tags,
        isActive: input.isActive,
        isBookable: input.isBookable,
        isRecommended: input.isRecommended,
        sortOrder: input.sortOrder,
        updatedBy: input.updatedBy
      }
    });

    if (update.count !== 1) {
      return null;
    }

    const service = await this.client.technicianService.findFirst({
      where: { id: input.serviceId, deletedAt: null }
    });

    return service ? this.mapTechnicianService(service) : null;
  }

  public async deleteTechnicianService(input: {
    shopId: number;
    technicianId: number;
    serviceId: number;
    updatedBy: number;
  }): Promise<boolean> {
    const update = await this.client.technicianService.updateMany({
      where: {
        id: input.serviceId,
        shopId: input.shopId,
        technicianId: input.technicianId,
        deletedAt: null
      },
      data: {
        isActive: false,
        isBookable: false,
        updatedBy: input.updatedBy,
        deletedAt: new Date()
      }
    });

    return update.count === 1;
  }

  public async listBookingNavigationShopServices(
    input: PaginationInput & { shopId: number }
  ): Promise<PaginatedResponse<BookingNavigationServicePayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.ServiceWhereInput = {
      shopId: input.shopId,
      deletedAt: null,
      status: "published"
    };
    const [list, total] = await Promise.all([
      this.client.service.findMany({
        where,
        include: { mediaAssets: true },
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
      }),
      this.client.service.count({ where })
    ]);

    return buildPaginatedResponse(list.map((service) => this.mapShopService(service)), total, input);
  }

  public async listBookingNavigationTechnicians(
    input: PaginationInput & { shopId: number }
  ): Promise<PaginatedResponse<BookingNavigationTechnicianPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.TechnicianProfileWhereInput = {
      shopId: input.shopId,
      deletedAt: null,
      status: "published"
    };
    const [list, total] = await Promise.all([
      this.client.technicianProfile.findMany({
        where,
        include: {
          mediaAssets: true,
          reviewSummary: true
        },
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ isRecommended: "desc" }, { id: "asc" }]
      }),
      this.client.technicianProfile.count({ where })
    ]);

    return buildPaginatedResponse(list.map((technician) => this.mapTechnician(technician)), total, input);
  }

  public async listPublicTechnicianServices(
    input: PaginationInput & { shopId: number; technicianId: number }
  ): Promise<PaginatedResponse<TechnicianServicePayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.TechnicianServiceWhereInput = {
      shopId: input.shopId,
      technicianId: input.technicianId,
      deletedAt: null,
      isActive: true,
      isBookable: true,
      reviewStatus: "APPROVED"
    };
    const [list, total] = await Promise.all([
      this.client.technicianService.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ isRecommended: "desc" }, { sortOrder: "asc" }, { id: "asc" }]
      }),
      this.client.technicianService.count({ where })
    ]);

    return buildPaginatedResponse(list.map((service) => this.mapTechnicianService(service)), total, input);
  }

  private mapTechnicianService(service: TechnicianServiceRecord): TechnicianServicePayload {
    return {
      id: service.id,
      shopId: service.shopId,
      technicianId: service.technicianId,
      sourceShopServiceId: service.sourceShopServiceId,
      name: service.name,
      description: service.description,
      categoryId: service.categoryId,
      priceAmount: service.priceAmount,
      currency: service.currency,
      durationMinutes: service.durationMinutes,
      coverImageUrl: service.coverImageUrl,
      images: this.stringArrayFromJson(service.imagesJson),
      tags: this.stringArrayFromJson(service.tagsJson),
      isActive: service.isActive,
      isBookable: service.isBookable,
      isRecommended: service.isRecommended,
      sortOrder: service.sortOrder,
      reviewStatus: this.reviewStatusFromDb(service.reviewStatus),
      rejectionReason: service.rejectionReason,
      createdAt: service.createdAt.toISOString(),
      updatedAt: service.updatedAt.toISOString()
    };
  }

  private mapShopService(service: ShopServiceRecord): BookingNavigationServicePayload {
    return {
      id: service.id,
      name: service.name,
      priceAmount: this.formatDecimal(service.priceAmount, 2),
      currency: service.currency,
      durationMinutes: service.durationMinutes,
      coverUrl: service.mediaAssets.find((asset) => asset.usageType === "cover")?.url ?? null
    };
  }

  private mapTechnician(technician: TechnicianRecord): BookingNavigationTechnicianPayload {
    return {
      id: technician.id,
      displayName: technician.displayName,
      city: technician.city,
      avatarUrl: technician.mediaAssets.find((asset) => asset.usageType === "avatar")?.url ?? null,
      reviewSummary: technician.reviewSummary
        ? {
            ratingAverage: this.formatDecimal(technician.reviewSummary.ratingAverage, 2),
            reviewCount: technician.reviewSummary.reviewCount,
            latestReviewAt: technician.reviewSummary.latestReviewAt?.toISOString() ?? null,
            highlights: this.stringArrayFromJson(technician.reviewSummary.highlights)
          }
        : null
    };
  }

  private async findShopPricingModeWithRate(shopId: number): Promise<ShopPricingModeRecord | null> {
    return this.client.shop.findFirst({
      where: { id: shopId, deletedAt: null },
      select: {
        id: true,
        pricingMode: true,
        technicianPricingRatePercent: true,
        pricingModeUpdatedAt: true,
        pricingModeUpdatedBy: true
      }
    });
  }

  private async findShopPricingModeWithoutRate(shopId: number): Promise<ShopPricingModeRecord | null> {
    return this.client.shop.findFirst({
      where: { id: shopId, deletedAt: null },
      select: {
        id: true,
        pricingMode: true,
        pricingModeUpdatedAt: true,
        pricingModeUpdatedBy: true
      }
    });
  }

  private async updateShopPricingModeWithRate(
    shopId: number,
    pricingMode: PricingModePayload,
    technicianPricingRatePercent: number,
    actorUserId: number
  ): Promise<ShopPricingModeRecord> {
    return this.client.shop.update({
      where: { id: shopId },
      data: {
        pricingMode: this.pricingModeToDb(pricingMode),
        technicianPricingRatePercent,
        pricingModeUpdatedAt: new Date(),
        pricingModeUpdatedBy: actorUserId
      },
      select: {
        id: true,
        pricingMode: true,
        technicianPricingRatePercent: true,
        pricingModeUpdatedAt: true,
        pricingModeUpdatedBy: true
      }
    });
  }

  private async updateShopPricingModeWithoutRate(
    shopId: number,
    pricingMode: PricingModePayload,
    actorUserId: number
  ): Promise<ShopPricingModeRecord> {
    return this.client.shop.update({
      where: { id: shopId },
      data: {
        pricingMode: this.pricingModeToDb(pricingMode),
        pricingModeUpdatedAt: new Date(),
        pricingModeUpdatedBy: actorUserId
      },
      select: {
        id: true,
        pricingMode: true,
        pricingModeUpdatedAt: true,
        pricingModeUpdatedBy: true
      }
    });
  }

  private mapShopPricingMode(shop: ShopPricingModeRecord | null, fallbackRatePercent = 100): ShopPricingModePayload | null {
    return shop
      ? {
          shopId: shop.id,
          pricingMode: this.pricingModeFromDb(shop.pricingMode),
          technicianPricingRatePercent: shop.technicianPricingRatePercent ?? fallbackRatePercent,
          updatedAt: shop.pricingModeUpdatedAt,
          updatedBy: shop.pricingModeUpdatedBy
        }
      : null;
  }

  private isMissingTechnicianPricingRateColumn(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    const issue = error as { code?: unknown; message?: unknown; meta?: Record<string, unknown> };
    const evidence = [
      issue.message,
      issue.meta?.column,
      issue.meta?.target,
      issue.meta?.modelName
    ]
      .map((value) => String(value ?? ""))
      .join(" ");

    return (
      issue.code === "P2022" &&
      (evidence.includes("technician_pricing_rate_percent") ||
        evidence.includes("technicianPricingRatePercent"))
    );
  }

  private pricingModeFromDb(value: string): PricingModePayload {
    return value === "TECHNICIAN" ? "technician" : "merchant";
  }

  private pricingModeToDb(value: PricingModePayload) {
    return value === "technician" ? "TECHNICIAN" : "MERCHANT";
  }

  private reviewStatusFromDb(value: string): string {
    return value.toLowerCase();
  }

  private stringArrayFromJson(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  }

  private formatDecimal(value: DecimalLike | string | number, scale: number): string {
    if (typeof value === "number") {
      return value.toFixed(scale);
    }
    if (typeof value === "string") {
      return Number.parseFloat(value).toFixed(scale);
    }

    return value.toFixed(scale);
  }
}
