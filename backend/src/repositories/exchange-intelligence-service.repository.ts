import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  ExchangeIntelligencePublisherScope,
  ExchangeIntelligenceServiceOptionPage,
  ExchangeIntelligenceServiceOptionPayload
} from "../types/exchange-intelligence-booking.types";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";

export interface ExchangeIntelligenceServiceOptionListInput {
  scope: ExchangeIntelligencePublisherScope;
  page: number;
  pageSize: number;
  now: Date;
}

interface ShopProjection {
  publicIdentifier: { publicId: string } | null;
  name: string;
  city: string;
  address: string;
}

interface ShopServiceProjection {
  id: number;
  name: string;
  durationMinutes: number;
  priceAmount: { toString(): string };
  currency: string;
  serviceMode: string;
  shop: ShopProjection;
}

interface TechnicianServiceProjection {
  id: number;
  name: string;
  durationMinutes: number;
  priceAmount: number;
  currency: string;
  sourceShopService: { serviceMode: string } | null;
  shop: ShopProjection;
  technicianProfile: {
    displayName: string;
    serviceArea: string | null;
    serviceAreasJson: Prisma.JsonValue | null;
    mediaAssets: Array<{ url: string }>;
    user: {
      identities: Array<{ publicIdentifier: { publicId: string } | null }>;
    };
  };
}

const publicShopWhere = {
  kind: "SHOP" as const,
  status: "ACTIVE" as const,
  deletedAt: null
};

const publicTechnicianWhere = {
  kind: "S" as const,
  status: "ACTIVE" as const,
  deletedAt: null
};

const shopProjection = {
  select: {
    name: true,
    city: true,
    address: true,
    publicIdentifier: { select: { publicId: true } }
  }
} as const;

export class ExchangeIntelligenceServiceRepository {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async listOptions(
    input: ExchangeIntelligenceServiceOptionListInput
  ): Promise<ExchangeIntelligenceServiceOptionPage> {
    return input.scope.kind === "merchant"
      ? this.listMerchantOptions(input, input.scope)
      : this.listTechnicianOptions(input, input.scope);
  }

  private async listMerchantOptions(
    input: ExchangeIntelligenceServiceOptionListInput,
    scope: { kind: "merchant"; shopId: number }
  ): Promise<ExchangeIntelligenceServiceOptionPage> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.ServiceWhereInput = {
      shopId: scope.shopId,
      status: "published",
      deletedAt: null,
      category: { isActive: true, deletedAt: null },
      shop: {
        status: "published",
        deletedAt: null,
        publicIdentifier: { is: publicShopWhere },
        entitySuspensions: {
          none: { activeKey: { not: null }, status: "active", deletedAt: null }
        }
      }
    };
    const [records, total] = await Promise.all([
      this.client.service.findMany({
        where,
        select: {
          id: true,
          name: true,
          durationMinutes: true,
          priceAmount: true,
          currency: true,
          serviceMode: true,
          shop: shopProjection
        },
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
      }),
      this.client.service.count({ where })
    ]);

    return buildPaginatedResponse(
      (records as unknown as ShopServiceProjection[]).map((record) =>
        this.mapShopService(record)
      ),
      total,
      pagination
    );
  }

  private async listTechnicianOptions(
    input: ExchangeIntelligenceServiceOptionListInput,
    scope: { kind: "technician"; technicianProfileId: number }
  ): Promise<ExchangeIntelligenceServiceOptionPage> {
    const pagination = toPrismaPagination(input);
    const affiliations = await this.client.technicianShopAffiliation.findMany({
      where: {
        technicianProfileId: scope.technicianProfileId,
        workStatus: "ACTIVE",
        activeKey: { not: null },
        startsAt: { lte: input.now },
        OR: [{ endsAt: null }, { endsAt: { gt: input.now } }],
        deletedAt: null,
        shop: {
          status: "published",
          deletedAt: null,
          publicIdentifier: { is: publicShopWhere }
        }
      },
      select: { shopId: true },
      orderBy: [{ shopId: "asc" }, { id: "asc" }]
    });
    const shopIds = [...new Set(affiliations.map(({ shopId }) => shopId))];
    if (shopIds.length === 0) {
      return buildPaginatedResponse([], 0, pagination);
    }

    const where: Prisma.TechnicianServiceWhereInput = {
      technicianId: scope.technicianProfileId,
      shopId: { in: shopIds },
      isActive: true,
      isBookable: true,
      reviewStatus: "APPROVED",
      deletedAt: null,
      category: { isActive: true, deletedAt: null },
      shop: {
        status: "published",
        deletedAt: null,
        publicIdentifier: { is: publicShopWhere },
        entitySuspensions: {
          none: { activeKey: { not: null }, status: "active", deletedAt: null }
        }
      },
      technicianProfile: {
        status: "published",
        visibility: "public",
        deletedAt: null,
        user: {
          isActive: true,
          deletedAt: null,
          identities: {
            some: {
              type: { in: ["technician", "service", "s"] },
              isActive: true,
              deletedAt: null,
              publicIdentifier: { is: publicTechnicianWhere }
            }
          }
        }
      }
    };
    const [records, total] = await Promise.all([
      this.client.technicianService.findMany({
        where,
        select: {
          id: true,
          name: true,
          durationMinutes: true,
          priceAmount: true,
          currency: true,
          sourceShopService: { select: { serviceMode: true } },
          shop: shopProjection,
          technicianProfile: {
            select: {
              displayName: true,
              serviceArea: true,
              serviceAreasJson: true,
              mediaAssets: {
                where: { usageType: "avatar", isActive: true, deletedAt: null },
                orderBy: { id: "desc" },
                take: 1,
                select: { url: true }
              },
              user: {
                select: {
                  identities: {
                    where: {
                      type: { in: ["technician", "service", "s"] },
                      isActive: true,
                      deletedAt: null,
                      publicIdentifier: { is: publicTechnicianWhere }
                    },
                    select: { publicIdentifier: { select: { publicId: true } } },
                    orderBy: { id: "asc" },
                    take: 1
                  }
                }
              }
            }
          }
        },
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
      }),
      this.client.technicianService.count({ where })
    ]);

    return buildPaginatedResponse(
      (records as unknown as TechnicianServiceProjection[]).map((record) =>
        this.mapTechnicianService(record)
      ),
      total,
      pagination
    );
  }

  private mapShopService(record: ShopServiceProjection): ExchangeIntelligenceServiceOptionPayload {
    return {
      serviceRef: `shop:${record.id}`,
      ownerType: "shop",
      name: record.name,
      durationMinutes: record.durationMinutes,
      catalogPriceJpy: this.jpyInteger(record.priceAmount.toString()),
      currency: this.jpyCurrency(record.currency),
      serviceMode: record.serviceMode,
      available: true,
      shop: this.mapShop(record.shop),
      technician: null
    };
  }

  private mapTechnicianService(
    record: TechnicianServiceProjection
  ): ExchangeIntelligenceServiceOptionPayload {
    const publicId = record.technicianProfile.user.identities[0]?.publicIdentifier?.publicId;
    if (!publicId || !/^s\d{10}$/u.test(publicId)) {
      throw new Error("error.exchange.intelligence_technician_public_id_invalid");
    }
    return {
      serviceRef: `technician:${record.id}`,
      ownerType: "technician",
      name: record.name,
      durationMinutes: record.durationMinutes,
      catalogPriceJpy: this.jpyInteger(record.priceAmount),
      currency: this.jpyCurrency(record.currency),
      serviceMode: record.sourceShopService?.serviceMode ?? "store",
      available: true,
      shop: this.mapShop(record.shop),
      technician: {
        publicId,
        displayName: record.technicianProfile.displayName,
        avatarUrl: record.technicianProfile.mediaAssets[0]?.url ?? null,
        serviceArea: record.technicianProfile.serviceArea,
        serviceAreas: this.stringArray(record.technicianProfile.serviceAreasJson)
      }
    };
  }

  private mapShop(record: ShopProjection): ExchangeIntelligenceServiceOptionPayload["shop"] {
    const publicId = record.publicIdentifier?.publicId;
    if (!publicId) throw new Error("error.exchange.intelligence_shop_public_id_invalid");
    return {
      publicId,
      name: record.name,
      city: record.city,
      address: record.address
    };
  }

  private jpyInteger(value: number | string): number {
    const amount = Number(value);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new Error("error.exchange.intelligence_catalog_price_invalid");
    }
    return amount;
  }

  private jpyCurrency(value: string): "JPY" {
    if (value !== "JPY") throw new Error("error.exchange.intelligence_currency_invalid");
    return value;
  }

  private stringArray(value: Prisma.JsonValue | null): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
}
