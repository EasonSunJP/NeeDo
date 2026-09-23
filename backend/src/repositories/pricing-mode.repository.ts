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
import { calculateTechnicianPlatformRating } from "../domain/technician-rating";
import { readLocalizedServiceMap } from "../domain/technician-localized-content";

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
      bookingOrders: { where: { status: "COMPLETED" as const, deletedAt: null } },
      entityFavorites: { where: { deletedAt: null } },
      entityShareEvents: { where: { deletedAt: null } }
    }
  }
} satisfies Prisma.TechnicianServiceInclude;

type TechnicianServiceRecord = Prisma.TechnicianServiceGetPayload<{
  include: typeof technicianServiceCardInclude;
}>;
type ShopFinanceRuleRecord = Prisma.ShopFinanceRuleSetGetPayload<Record<string, never>>;

type ShopServiceRecord = Prisma.ServiceGetPayload<{
  include: {
    mediaAssets: true;
    _count: { select: { bookingOrders: true } };
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
      return await this.updatePricingModeAndSettlementRule(
        shopId,
        pricingMode,
        technicianPricingRatePercent,
        actorUserId,
        true
      );
    } catch (error) {
      if (!this.isMissingTechnicianPricingRateColumn(error)) {
        throw error;
      }

      legacyShopTechnicianPricingRatePercent.set(shopId, technicianPricingRatePercent);
      return this.updatePricingModeAndSettlementRule(
        shopId,
        pricingMode,
        technicianPricingRatePercent,
        actorUserId,
        false
      );
    }
  }

  public async findTechnicianShopScope(
    technicianId: number,
    shopId: number
  ): Promise<TechnicianShopScopePayload | null> {
    const now = new Date();
    const technician = await this.client.technicianProfile.findFirst({
      where: {
        id: technicianId,
        deletedAt: null,
        OR: [
          { shopId },
          {
            technicianShopAffiliations: {
              some: {
                shopId,
                deletedAt: null,
                workStatus: "ACTIVE",
                startsAt: { lte: now },
                OR: [{ endsAt: null }, { endsAt: { gt: now } }]
              }
            }
          }
        ]
      },
      select: {
        id: true
      }
    });

    return technician ? { technicianId: technician.id, shopId } : null;
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

  public async listPublicTechnicianProfileServices(
    input: PaginationInput & {
      technicianId: number;
      shopVisibilityWhere?: Record<string, unknown>;
    }
  ): Promise<PaginatedResponse<TechnicianServicePayload>> {
    const pagination = toPrismaPagination(input);
    const now = new Date();
    const technician = await this.client.technicianProfile.findFirst({
      where: {
        id: input.technicianId,
        deletedAt: null,
        status: "published",
        visibility: "public",
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
        }
      },
      select: {
        shopId: true,
        technicianShopAffiliations: {
          where: {
            workStatus: "ACTIVE",
            activeKey: { not: null },
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
            deletedAt: null,
            shop: {
              is: {
                status: "published",
                deletedAt: null,
                publicIdentifier: {
                  is: { kind: "SHOP", status: "ACTIVE", deletedAt: null }
                },
                entitySuspensions: {
                  none: { activeKey: { not: null }, status: "active", deletedAt: null }
                },
                ...(input.shopVisibilityWhere ?? { visibility: "public" })
              }
            }
          },
          select: { shopId: true }
        }
      }
    });
    const eligibleShopIds = technician
      ? Array.from(
          new Set([
            ...(technician.shopId === null ? [] : [technician.shopId]),
            ...technician.technicianShopAffiliations.map(({ shopId }) => shopId)
          ])
        )
      : [];
    if (eligibleShopIds.length === 0) {
      return buildPaginatedResponse([], 0, input);
    }

    const where: Prisma.TechnicianServiceWhereInput = {
      technicianId: input.technicianId,
      shopId: { in: eligibleShopIds },
      deletedAt: null,
      isActive: true,
      isBookable: true,
      reviewStatus: "APPROVED",
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
          },
          ...(input.shopVisibilityWhere ?? { visibility: "public" })
        }
      },
      technicianProfile: {
        is: {
          id: input.technicianId,
          deletedAt: null,
          status: "published",
          visibility: "public"
        }
      }
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
          width: input.width,
          height: input.height,
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
          localizedContentJson: input.localizedContent ? { [input.localizedContent.locale]: {
            ...(input.localizedContent.name !== undefined ? { name: input.localizedContent.name } : {}),
            ...(input.localizedContent.description !== undefined ? { description: input.localizedContent.description } : {})
          } } : Prisma.JsonNull,
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
    if (input.localizedContent) {
      const localizedEdit = input.localizedContent;
      return this.client.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM technician_services WHERE id = ${input.serviceId} AND technician_id = ${input.technicianId} AND deleted_at IS NULL FOR UPDATE`
        );
        const current = await transaction.technicianService.findFirst({
          where: { id: input.serviceId, technicianId: input.technicianId, deletedAt: null, ...(input.shopId ? { shopId: input.shopId } : {}) }
        });
        if (!current) return null;
        const { locale, name, description } = localizedEdit;
        const localizedContent = readLocalizedServiceMap(current.localizedContentJson);
        await transaction.technicianService.update({
          where: { id: current.id },
          data: {
            ...this.technicianServiceUpdateData(input),
            localizedContentJson: {
              ...localizedContent,
              [locale]: { ...localizedContent[locale], ...(name !== undefined ? { name } : {}), ...(description !== undefined ? { description } : {}) }
            }
          }
        });
        const service = await transaction.technicianService.findUniqueOrThrow({ where: { id: current.id }, include: technicianServiceCardInclude });
        return this.mapTechnicianService(service);
      });
    }
    const update = await this.client.technicianService.updateMany({
      where: {
        id: input.serviceId,
        ...(input.shopId ? { shopId: input.shopId } : {}),
        technicianId: input.technicianId,
        deletedAt: null
      },
      data: this.technicianServiceUpdateData(input)
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
      const locked = input.shopId
        ? await transaction.$queryRaw<Array<{ id: number }>>(
            Prisma.sql`SELECT id FROM technician_services
              WHERE id = ${input.serviceId}
                AND shop_id = ${input.shopId}
                AND technician_id = ${input.technicianId}
                AND deleted_at IS NULL
              FOR UPDATE`
          )
        : await transaction.$queryRaw<Array<{ id: number }>>(
            Prisma.sql`SELECT id FROM technician_services
              WHERE id = ${input.serviceId}
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
        include: {
          mediaAssets: true,
          _count: {
            select: {
              bookingOrders: {
                where: { status: "COMPLETED", deletedAt: null }
              }
            }
          }
        },
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
    const now = new Date();
    const where: Prisma.TechnicianProfileWhereInput = {
      deletedAt: null,
      status: "published",
      OR: [
        { shopId: input.shopId },
        {
          technicianShopAffiliations: {
            some: {
              shopId: input.shopId,
              deletedAt: null,
              workStatus: "ACTIVE",
              startsAt: { lte: now },
              OR: [{ endsAt: null }, { endsAt: { gt: now } }]
            }
          }
        }
      ]
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
    const now = new Date();
    const where: Prisma.TechnicianServiceWhereInput = {
      technicianId: input.technicianId,
      deletedAt: null,
      isActive: true,
      isBookable: true,
      reviewStatus: "APPROVED",
      technicianProfile: {
        deletedAt: null,
        status: "published",
        OR: [
          { shopId: input.shopId },
          {
            technicianShopAffiliations: {
              some: {
                shopId: input.shopId,
                deletedAt: null,
                workStatus: "ACTIVE",
                startsAt: { lte: now },
                OR: [{ endsAt: null }, { endsAt: { gt: now } }]
              }
            }
          }
        ]
      }
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

  private technicianServiceUpdateData(input: TechnicianServiceUpdateRepositoryInput): Prisma.TechnicianServiceUncheckedUpdateManyInput {
    return {
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
    };
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
      localizedContent: readLocalizedServiceMap(service.localizedContentJson),
      categoryId: service.categoryId,
      priceAmount: service.priceAmount,
      currency: service.currency,
      durationMinutes: service.durationMinutes,
      usageCount: service._count.bookingOrders,
      favoriteCount: service._count.entityFavorites,
      shareCount: service._count.entityShareEvents,
      taxIncluded: true,
      coverImageUrl: service.coverImageUrl,
      images: this.stringArrayFromJson(service.imagesJson),
      tags: this.stringArrayFromJson(service.tagsJson),
      shop: service.shop
        ? {
            publicId: this.activeShopPublicId(service.shop.publicIdentifier),
            name: service.shop.name,
            address: service.shop.address
          }
        : null,
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
      coverUrl: service.mediaAssets.find((asset) => asset.usageType === "cover")?.url ?? null,
      description: service.description,
      tags: [],
      usageCount: service._count.bookingOrders
    };
  }

  private mapTechnician(technician: TechnicianRecord): BookingNavigationTechnicianPayload {
    const reviewSummary =
      technician.reviewSummary?.deletedAt === null ? technician.reviewSummary : null;
    const reviewCount = reviewSummary?.reviewCount ?? 0;
    const ratingAverage = calculateTechnicianPlatformRating(
      reviewSummary ? Number(reviewSummary.ratingAverage) : 0,
      reviewCount
    ).toFixed(2);

    return {
      id: technician.id,
      displayName: technician.displayName,
      city: technician.city,
      avatarUrl: technician.mediaAssets.find((asset) => asset.usageType === "avatar")?.url ?? null,
      reviewSummary: {
        ratingAverage,
        reviewCount,
        latestReviewAt: reviewSummary?.latestReviewAt?.toISOString() ?? null,
        highlights: reviewSummary ? this.stringArrayFromJson(reviewSummary.highlights) : []
      }
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

  private async updatePricingModeAndSettlementRule(
    shopId: number,
    pricingMode: PricingModePayload,
    technicianPricingRatePercent: number,
    actorUserId: number,
    includeLegacyRateColumn: boolean
  ): Promise<ShopPricingModePayload> {
    return this.client.$transaction(async (transaction) => {
      const currentRule = await transaction.shopFinanceRuleSet.findFirst({
        where: { shopId, status: "active", deletedAt: null },
        orderBy: { id: "desc" }
      });
      const shareBps = technicianPricingRatePercent * 100;
      if (
        !currentRule ||
        currentRule.commissionRateBps !== shareBps ||
        currentRule.extensionCommissionRateBps !== shareBps
      ) {
        if (currentRule) {
          await transaction.shopFinanceRuleSet.updateMany({
            where: { shopId, status: "active", deletedAt: null },
            data: { status: "archived", updatedById: actorUserId }
          });
        }
        await transaction.shopFinanceRuleSet.create({
          data: this.nextShopFinanceRule(
            shopId,
            currentRule,
            technicianPricingRatePercent,
            actorUserId
          )
        });
      }

      const shop = await transaction.shop.update({
        where: { id: shopId },
        data: {
          pricingMode: this.pricingModeToDb(pricingMode),
          ...(includeLegacyRateColumn ? { technicianPricingRatePercent } : {}),
          pricingModeUpdatedAt: new Date(),
          pricingModeUpdatedBy: actorUserId
        },
        select: {
          id: true,
          pricingMode: true,
          ...(includeLegacyRateColumn ? { technicianPricingRatePercent: true } : {}),
          pricingModeUpdatedAt: true,
          pricingModeUpdatedBy: true
        }
      });

      return this.mapShopPricingMode(
        shop as ShopPricingModeRecord,
        technicianPricingRatePercent
      ) as ShopPricingModePayload;
    });
  }

  private nextShopFinanceRule(
    shopId: number,
    current: ShopFinanceRuleRecord | null,
    technicianSharePercent: number,
    actorUserId: number
  ): Prisma.ShopFinanceRuleSetUncheckedCreateInput {
    const shareBps = technicianSharePercent * 100;
    return {
      shopId,
      name: current?.name ?? "Default merchant finance rules",
      status: "active",
      wageMode: current?.wageMode ?? "commission",
      baseSalaryJpy: current?.baseSalaryJpy ?? 0,
      hourlyRateJpy: current?.hourlyRateJpy ?? 0,
      dailyRateJpy: current?.dailyRateJpy ?? 0,
      fixedOrderPayJpy: current?.fixedOrderPayJpy ?? 0,
      commissionRateBps: shareBps,
      extensionCommissionRateBps: shareBps,
      nominationFeeJpy: current?.nominationFeeJpy ?? 0,
      guaranteedMinimumJpy: current?.guaranteedMinimumJpy ?? 0,
      ndpFeeBearer: current?.ndpFeeBearer ?? "shop",
      technicianNdpShareBps: current?.technicianNdpShareBps ?? 0,
      bonusRulesJson: current?.bonusRulesJson ?? Prisma.JsonNull,
      deductionRulesJson: current?.deductionRulesJson ?? Prisma.JsonNull,
      effectiveFrom: current?.effectiveFrom ?? null,
      effectiveTo: current?.effectiveTo ?? null,
      createdById: actorUserId,
      updatedById: actorUserId
    };
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
    identifier: NonNullable<TechnicianServiceRecord["shop"]>["publicIdentifier"]
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
