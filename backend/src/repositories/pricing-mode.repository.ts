import { Prisma, type PrismaClient } from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import { toAuditLogCreateData } from "./audit-log.repository";
import {
  type BookingNavigationServicePayload,
  type BookingNavigationTechnicianPayload,
  type PricingModePayload,
  type PricingModeRepositoryPort,
  type ShopPricingModePayload,
  type TechnicianServiceCoverTarget,
  type TechnicianServiceCoverWriteInput,
  type TechnicianServiceCreateRepositoryInput,
  type TechnicianServiceDeleteRepositoryInput,
  type TechnicianServicePayload,
  type TechnicianServiceReorderRepositoryInput,
  type TechnicianServiceUpdateRepositoryInput,
  type TechnicianShopScopePayload
} from "../services/pricing-mode.service";
import { assertTechnicianServiceQuota } from "../services/technician-service-policy";
import { assertCompleteServiceOrder } from "../services/technician-service-policy";
import { AppError } from "../utils/app-error";
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

const technicianServiceCardInclude = {
  shop: {
    select: {
      name: true,
      address: true,
      publicIdentifier: {
        select: { publicId: true, kind: true, status: true, deletedAt: true }
      }
    }
  },
  _count: {
    select: {
      bookingOrders: { where: { status: "COMPLETED" as const, deletedAt: null } }
    }
  }
} satisfies Prisma.TechnicianServiceInclude;

type TechnicianServiceRecord = Prisma.TechnicianServiceGetPayload<{
  include: typeof technicianServiceCardInclude;
}>;

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
        await this.updateShopPricingModeWithRate(
          shopId,
          pricingMode,
          technicianPricingRatePercent,
          actorUserId
        )
      ) as ShopPricingModePayload;
    } catch (error) {
      if (!this.isMissingTechnicianPricingRateColumn(error)) {
        throw error;
      }

      const shop = await this.updateShopPricingModeWithoutRate(shopId, pricingMode, actorUserId);
      legacyShopTechnicianPricingRatePercent.set(shopId, technicianPricingRatePercent);
      return {
        ...(this.mapShopPricingMode(shop, technicianPricingRatePercent) as ShopPricingModePayload)
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
        include: technicianServiceCardInclude,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
      }),
      this.client.technicianService.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((service) => this.mapTechnicianService(service)),
      total,
      input
    );
  }

  public async listTechnicianServicesByProfile(
    input: PaginationInput & { technicianId: number; activeOnly?: boolean }
  ): Promise<PaginatedResponse<TechnicianServicePayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.TechnicianServiceWhereInput = {
      technicianId: input.technicianId,
      deletedAt: null,
      ...(input.activeOnly ? { isActive: true } : {})
    };
    const [list, total] = await Promise.all([
      this.client.technicianService.findMany({
        where,
        include: technicianServiceCardInclude,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
      }),
      this.client.technicianService.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((service) => this.mapTechnicianService(service)),
      total,
      input
    );
  }

  public async findPrimaryTechnicianService(
    technicianId: number
  ): Promise<TechnicianServicePayload | null> {
    const service = await this.client.technicianService.findFirst({
      where: {
        technicianId,
        deletedAt: null,
        isActive: true,
        reviewStatus: "APPROVED"
      },
      include: technicianServiceCardInclude,
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
    });

    return service ? this.mapTechnicianService(service) : null;
  }

  public async findTechnicianServiceCoverTarget(input: {
    shopId: number;
    technicianId: number;
    serviceId: number;
  }): Promise<TechnicianServiceCoverTarget | null> {
    const service = await this.client.technicianService.findFirst({
      where: {
        id: input.serviceId,
        shopId: input.shopId,
        technicianId: input.technicianId,
        deletedAt: null
      },
      include: technicianServiceCardInclude
    });
    if (!service) {
      return null;
    }

    const cover = await this.client.mediaAsset.findFirst({
      where: {
        entityType: "technician_service",
        entityId: input.serviceId,
        usageType: "cover",
        isActive: true,
        deletedAt: null,
        purgedAt: null
      },
      select: { id: true, checksumSha256: true, mimeType: true }
    });

    return {
      service: this.mapTechnicianService(service),
      activeMediaAssetId: cover?.id ?? null,
      checksumSha256: cover?.checksumSha256 ?? null,
      mimeType: cover?.mimeType ?? null
    };
  }

  public async replaceTechnicianServiceCover(
    input: TechnicianServiceCoverWriteInput
  ): Promise<TechnicianServicePayload | null> {
    const service = await this.client.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM technician_services
          WHERE id = ${input.serviceId}
            AND shop_id = ${input.shopId}
            AND technician_id = ${input.technicianId}
            AND deleted_at IS NULL
          FOR UPDATE`
      );
      if (locked.length !== 1) {
        return null;
      }

      const oldAsset = await this.findActiveTechnicianServiceCover(transaction, input.serviceId);
      const oldByteCount = oldAsset
        ? await this.findTechnicianServiceCoverByteCount(transaction, input.serviceId, oldAsset)
        : null;

      await transaction.mediaAsset.updateMany({
        where: {
          entityType: "technician_service",
          entityId: input.serviceId,
          usageType: "cover",
          isActive: true,
          deletedAt: null
        },
        data: { isActive: false, deletedAt: input.now }
      });
      const newAsset = await transaction.mediaAsset.create({
        data: {
          entityType: "technician_service",
          entityId: input.serviceId,
          shopId: input.shopId,
          technicianProfileId: input.technicianId,
          ownerUserId: input.ownerUserId,
          ownerIdentityId: input.ownerIdentityId,
          url: input.url,
          mimeType: input.mimeType,
          usageType: "cover",
          checksumSha256: input.checksumSha256,
          isActive: true,
          createdAt: input.now
        }
      });
      const updated = await transaction.technicianService.update({
        where: { id: input.serviceId },
        data: { coverImageUrl: input.url, updatedBy: input.ownerUserId },
        include: technicianServiceCardInclude
      });
      await transaction.auditLog.create({
        data: toAuditLogCreateData({
          actorId: input.ownerUserId,
          action: input.action,
          targetType: "technician_service",
          targetId: input.serviceId,
          ip: input.context.ip,
          userAgent: input.context.userAgent,
          metadata: {
            shopId: input.shopId,
            technicianProfileId: input.technicianId,
            oldMediaAssetId: oldAsset?.id ?? null,
            newMediaAssetId: newAsset.id,
            oldChecksumSha256: oldAsset?.checksumSha256 ?? null,
            newChecksumSha256: newAsset.checksumSha256,
            oldMimeType: oldAsset?.mimeType ?? null,
            newMimeType: newAsset.mimeType,
            oldByteCount,
            newByteCount: input.fileSize
          }
        })
      });

      return updated;
    });

    return service ? this.mapTechnicianService(service) : null;
  }

  public async removeTechnicianServiceCover(input: {
    shopId: number;
    technicianId: number;
    serviceId: number;
    ownerUserId: number;
    ownerIdentityId: number;
    now: Date;
    action: "technician.service.cover.removed";
    context: { ip: string; userAgent?: string };
  }): Promise<TechnicianServicePayload | null> {
    const service = await this.client.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM technician_services
          WHERE id = ${input.serviceId}
            AND shop_id = ${input.shopId}
            AND technician_id = ${input.technicianId}
            AND deleted_at IS NULL
          FOR UPDATE`
      );
      if (locked.length !== 1) {
        return null;
      }

      const oldAsset = await this.findActiveTechnicianServiceCover(transaction, input.serviceId);
      const oldByteCount = oldAsset
        ? await this.findTechnicianServiceCoverByteCount(transaction, input.serviceId, oldAsset)
        : null;

      await transaction.mediaAsset.updateMany({
        where: {
          entityType: "technician_service",
          entityId: input.serviceId,
          usageType: "cover",
          isActive: true,
          deletedAt: null
        },
        data: { isActive: false, deletedAt: input.now }
      });
      const updated = await transaction.technicianService.update({
        where: { id: input.serviceId },
        data: { coverImageUrl: null, updatedBy: input.ownerUserId },
        include: technicianServiceCardInclude
      });
      await transaction.auditLog.create({
        data: toAuditLogCreateData({
          actorId: input.ownerUserId,
          action: input.action,
          targetType: "technician_service",
          targetId: input.serviceId,
          ip: input.context.ip,
          userAgent: input.context.userAgent,
          metadata: {
            shopId: input.shopId,
            technicianProfileId: input.technicianId,
            oldMediaAssetId: oldAsset?.id ?? null,
            newMediaAssetId: null,
            oldChecksumSha256: oldAsset?.checksumSha256 ?? null,
            newChecksumSha256: null,
            oldMimeType: oldAsset?.mimeType ?? null,
            newMimeType: null,
            oldByteCount,
            newByteCount: null
          }
        })
      });

      return updated;
    });

    return service ? this.mapTechnicianService(service) : null;
  }

  public async hasActiveMediaUrl(url: string): Promise<boolean> {
    const asset = await this.client.mediaAsset.findFirst({
      where: {
        url,
        isActive: true,
        deletedAt: null,
        purgedAt: null
      },
      select: { id: true }
    });

    return asset !== null;
  }

  public async reorderTechnicianServices(
    input: TechnicianServiceReorderRepositoryInput
  ): Promise<TechnicianServicePayload[]> {
    const services = await this.client.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT id FROM technician_profiles WHERE id = ${input.technicianId} AND deleted_at IS NULL FOR UPDATE`
      );
      const existingAudit = await transaction.auditLog.findFirst({
        where: {
          actorId: input.actorUserId,
          action: input.auditLog.action,
          targetType: input.auditLog.targetType,
          targetId: input.technicianId,
          metadata: { path: "$.idempotencyKey", equals: input.idempotencyKey }
        },
        select: { metadata: true }
      });
      if (existingAudit) {
        const metadata = this.metadataObject(existingAudit.metadata);
        if (metadata.requestFingerprint !== input.requestFingerprint) {
          throw new AppError({
            code: ERROR_CODES.VALIDATION,
            message: "error.idempotency_key_reused",
            statusCode: 409
          });
        }

        return transaction.technicianService.findMany({
          where: { technicianId: input.technicianId, deletedAt: null },
          include: technicianServiceCardInclude,
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
        });
      }

      const owned = await transaction.technicianService.findMany({
        where: { technicianId: input.technicianId, deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
      });
      assertCompleteServiceOrder(
        owned.map(({ id }) => id),
        input.orderedServiceIds
      );

      for (const [sortOrder, serviceId] of input.orderedServiceIds.entries()) {
        await transaction.technicianService.updateMany({
          where: {
            id: serviceId,
            technicianId: input.technicianId,
            deletedAt: null
          },
          data: { sortOrder, updatedBy: input.actorUserId }
        });
      }

      const reordered = await transaction.technicianService.findMany({
        where: { technicianId: input.technicianId, deletedAt: null },
        include: technicianServiceCardInclude,
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
      });
      await transaction.auditLog.create({
        data: toAuditLogCreateData({
          ...input.auditLog,
          targetId: input.technicianId,
          metadata: {
            ...this.metadataObject(input.auditLog.metadata),
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.requestFingerprint,
            orderedServiceIds: input.orderedServiceIds
          }
        })
      });

      return reordered;
    });

    return services.map((service) => this.mapTechnicianService(service));
  }

  public async createTechnicianService(
    input: TechnicianServiceCreateRepositoryInput
  ): Promise<TechnicianServicePayload> {
    const service = await this.client.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT id FROM technician_profiles WHERE id = ${input.technicianId} AND deleted_at IS NULL FOR UPDATE`
      );
      const nonDeletedCount = await transaction.technicianService.count({
        where: { technicianId: input.technicianId, deletedAt: null }
      });
      assertTechnicianServiceQuota(nonDeletedCount + 1);

      const created = await transaction.technicianService.create({
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
        },
        include: technicianServiceCardInclude
      });
      await transaction.auditLog.create({
        data: toAuditLogCreateData({ ...input.auditLog, targetId: created.id })
      });

      return created;
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
      where: { id: input.serviceId, deletedAt: null },
      include: technicianServiceCardInclude
    });

    return service ? this.mapTechnicianService(service) : null;
  }

  public async deleteTechnicianService(
    input: TechnicianServiceDeleteRepositoryInput
  ): Promise<boolean> {
    return this.client.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM technician_services
          WHERE id = ${input.serviceId}
            AND shop_id = ${input.shopId}
            AND technician_id = ${input.technicianId}
            AND deleted_at IS NULL
          FOR UPDATE`
      );
      if (locked.length !== 1) {
        return false;
      }

      await transaction.mediaAsset.updateMany({
        where: {
          entityType: "technician_service",
          entityId: input.serviceId,
          usageType: "cover",
          isActive: true,
          deletedAt: null
        },
        data: { isActive: false, deletedAt: input.now }
      });
      await transaction.technicianService.update({
        where: { id: input.serviceId },
        data: {
          coverImageUrl: null,
          isActive: false,
          isBookable: false,
          updatedBy: input.updatedBy,
          deletedAt: input.now
        }
      });
      await transaction.auditLog.create({
        data: toAuditLogCreateData(input.auditLog)
      });

      return true;
    });
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

    return buildPaginatedResponse(
      list.map((service) => this.mapShopService(service)),
      total,
      input
    );
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

    return buildPaginatedResponse(
      list.map((technician) => this.mapTechnician(technician)),
      total,
      input
    );
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
        include: technicianServiceCardInclude,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ isRecommended: "desc" }, { sortOrder: "asc" }, { id: "asc" }]
      }),
      this.client.technicianService.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((service) => this.mapTechnicianService(service)),
      total,
      input
    );
  }

  private mapTechnicianService(service: TechnicianServiceRecord): TechnicianServicePayload {
    return {
      id: service.id,
      publicId: service.publicId,
      shopId: service.shopId,
      technicianId: service.technicianId,
      sourceShopServiceId: service.sourceShopServiceId,
      name: service.name,
      description: service.description,
      categoryId: service.categoryId,
      priceAmount: service.priceAmount,
      currency: service.currency,
      durationMinutes: service.durationMinutes,
      usageCount: service._count.bookingOrders,
      taxIncluded: true,
      coverImageUrl: service.coverImageUrl,
      images: this.stringArrayFromJson(service.imagesJson),
      tags: this.stringArrayFromJson(service.tagsJson),
      shop: {
        publicId: this.activeShopPublicId(service.shop.publicIdentifier),
        name: service.shop.name,
        address: service.shop.address
      },
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

  private findActiveTechnicianServiceCover(
    transaction: Pick<Prisma.TransactionClient, "mediaAsset">,
    serviceId: number
  ) {
    return transaction.mediaAsset.findFirst({
      where: {
        entityType: "technician_service",
        entityId: serviceId,
        usageType: "cover",
        isActive: true,
        deletedAt: null,
        purgedAt: null
      },
      select: { id: true, checksumSha256: true, mimeType: true }
    });
  }

  private async findTechnicianServiceCoverByteCount(
    transaction: Pick<Prisma.TransactionClient, "auditLog">,
    serviceId: number,
    asset: { id: number; checksumSha256: string | null }
  ): Promise<number> {
    const audit = await transaction.auditLog.findFirst({
      where: {
        action: "technician.service.cover.updated",
        targetType: "technician_service",
        targetId: serviceId,
        OR: [
          { metadata: { path: "$.newMediaAssetId", equals: asset.id } },
          ...(asset.checksumSha256
            ? [{ metadata: { path: "$.checksumSha256", equals: asset.checksumSha256 } }]
            : [])
        ]
      },
      orderBy: { id: "desc" },
      select: { metadata: true }
    });
    const metadata = this.metadataObject(audit?.metadata);
    const byteCount = metadata.newByteCount ?? metadata.fileSize;
    if (!Number.isInteger(byteCount) || (byteCount as number) <= 0) {
      throw new Error("error.technician_service.cover_lifecycle_incomplete");
    }
    return byteCount as number;
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

  private async findShopPricingModeWithoutRate(
    shopId: number
  ): Promise<ShopPricingModeRecord | null> {
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

  private mapShopPricingMode(
    shop: ShopPricingModeRecord | null,
    fallbackRatePercent = 100
  ): ShopPricingModePayload | null {
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
    const evidence = [issue.message, issue.meta?.column, issue.meta?.target, issue.meta?.modelName]
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

  private activeShopPublicId(
    identifier: TechnicianServiceRecord["shop"]["publicIdentifier"]
  ): string | null {
    return identifier?.kind === "SHOP" &&
      identifier.status === "ACTIVE" &&
      identifier.deletedAt === null
      ? identifier.publicId
      : null;
  }

  private stringArrayFromJson(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }

  private metadataObject(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
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
