import type {
  Category,
  CustomerProfile,
  MediaAsset,
  Prisma,
  PrismaClient,
  ReviewSummary,
  Service,
  Shop,
  TechnicianProfile
} from "@prisma/client";
import { prisma } from "../prisma/client";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";

const PUBLISHED_STATUS = "published";
const DEFAULT_HOME_LIMIT = 6;

const activeMediaArgs = {
  where: { deletedAt: null, isActive: true },
  orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }]
};

export type CoreReadSort = "recommended" | "rating_desc" | "price_asc" | "price_desc" | "newest";

export interface CategoryListInput extends PaginationInput {
  parentId?: number | null;
}

export interface ServiceListInput extends PaginationInput {
  keyword?: string;
  categoryId?: number;
  shopId?: number;
  technicianId?: number;
  city?: string;
  serviceMode?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: CoreReadSort;
}

export interface HomeRecommendationsInput {
  city?: string;
  limit?: number;
}

export interface ReviewSummaryPayload {
  ratingAverage: string;
  reviewCount: number;
  latestReviewAt: Date | null;
  highlights: string[];
}

export interface MediaAssetPayload {
  id: number;
  url: string;
  mimeType: string;
  usageType: string;
  width: number | null;
  height: number | null;
  altText: string | null;
  sortOrder: number;
}

export interface CategoryPayload {
  id: number;
  code: string;
  name: string;
  nameJa: string | null;
  nameEn: string | null;
  parentId: number | null;
  iconUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShopCardPayload {
  id: number;
  name: string;
  city: string;
  address: string;
  coverUrl: string | null;
  reviewSummary: ReviewSummaryPayload;
}

export interface TechnicianCardPayload {
  id: number;
  displayName: string;
  city: string;
  avatarUrl: string | null;
  reviewSummary: ReviewSummaryPayload;
}

export interface ServiceCardPayload {
  id: number;
  name: string;
  description: string | null;
  category: CategoryPayload;
  shop: ShopCardPayload;
  technician: TechnicianCardPayload | null;
  city: string;
  priceAmount: string;
  currency: string;
  durationMinutes: number;
  coverUrl: string | null;
  reviewSummary: ReviewSummaryPayload;
}

export interface ServiceDetailPayload extends ServiceCardPayload {
  serviceMode: string;
  mediaAssets: MediaAssetPayload[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ShopDetailPayload extends ShopCardPayload {
  description: string | null;
  phone: string | null;
  latitude: string | null;
  longitude: string | null;
  mediaAssets: MediaAssetPayload[];
  services: ServiceCardPayload[];
  technicians: TechnicianCardPayload[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TechnicianDetailPayload extends TechnicianCardPayload {
  bio: string | null;
  serviceArea: string | null;
  yearsExperience: number;
  mediaAssets: MediaAssetPayload[];
  services: ServiceCardPayload[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerProfilePayload {
  id: number;
  displayName: string;
  city: string | null;
  bio: string | null;
  avatarUrl: string | null;
  membershipLevel: string;
  reviewSummary: ReviewSummaryPayload;
  createdAt: Date;
  updatedAt: Date;
}

export interface HomeRecommendationsPayload {
  categories: CategoryPayload[];
  services: ServiceCardPayload[];
  shops: ShopCardPayload[];
  technicians: TechnicianCardPayload[];
}

export interface CoreReadRepositoryPort {
  listCategories: (input: CategoryListInput) => Promise<PaginatedResponse<CategoryPayload>>;
  listServices: (input: ServiceListInput) => Promise<PaginatedResponse<ServiceCardPayload>>;
  findServiceDetail: (id: number) => Promise<ServiceDetailPayload | null>;
  getHomeRecommendations: (input: HomeRecommendationsInput) => Promise<HomeRecommendationsPayload>;
  search: (input: ServiceListInput) => Promise<PaginatedResponse<ServiceCardPayload>>;
  findShopDetail: (id: number) => Promise<ShopDetailPayload | null>;
  findTechnicianDetail: (id: number) => Promise<TechnicianDetailPayload | null>;
  findCustomerProfile: (id: number) => Promise<CustomerProfilePayload | null>;
}

type ShopCardRecord = Shop & {
  mediaAssets: MediaAsset[];
  reviewSummary: ReviewSummary | null;
};

type TechnicianCardRecord = TechnicianProfile & {
  mediaAssets: MediaAsset[];
  reviewSummary: ReviewSummary | null;
};

type ServiceRecordBase = Service & {
  category: Category;
  technicianProfile: TechnicianCardRecord | null;
  mediaAssets: MediaAsset[];
  reviewSummary: ReviewSummary | null;
};

type ServiceCardRecord = ServiceRecordBase & {
  shop: ShopCardRecord;
};

type ShopDetailRecord = ShopCardRecord & {
  services: ServiceRecordBase[];
  technicians: TechnicianCardRecord[];
};

type TechnicianDetailRecord = TechnicianCardRecord & {
  services: ServiceCardRecord[];
};

type CustomerProfileRecord = CustomerProfile & {
  mediaAssets: MediaAsset[];
  reviewSummary: ReviewSummary | null;
};

type DecimalLike = {
  toFixed: (decimalPlaces?: number) => string;
  toString: () => string;
};

export class CoreReadRepository implements CoreReadRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async listCategories(
    input: CategoryListInput
  ): Promise<PaginatedResponse<CategoryPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.CategoryWhereInput = {
      deletedAt: null,
      isActive: true,
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {})
    };
    const [list, total] = await Promise.all([
      this.client.category.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
      }),
      this.client.category.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((category) => this.mapCategory(category)),
      total,
      pagination
    );
  }

  public async listServices(
    input: ServiceListInput
  ): Promise<PaginatedResponse<ServiceCardPayload>> {
    const pagination = toPrismaPagination(input);
    const where = this.buildServiceWhere(input);
    const [list, total] = await Promise.all([
      this.client.service.findMany({
        where,
        include: this.serviceCardInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: this.buildServiceOrderBy(input.sort)
      }),
      this.client.service.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((service) => this.mapServiceCard(service)),
      total,
      pagination
    );
  }

  public async findServiceDetail(id: number): Promise<ServiceDetailPayload | null> {
    const service = await this.client.service.findFirst({
      where: {
        id,
        deletedAt: null,
        status: PUBLISHED_STATUS
      },
      include: this.serviceCardInclude()
    });

    return service ? this.mapServiceDetail(service) : null;
  }

  public async getHomeRecommendations(
    input: HomeRecommendationsInput
  ): Promise<HomeRecommendationsPayload> {
    const take = input.limit ?? DEFAULT_HOME_LIMIT;
    const cityWhere = input.city ? { city: input.city } : {};
    const [categories, services, shops, technicians] = await Promise.all([
      this.client.category.findMany({
        where: { deletedAt: null, isActive: true },
        take,
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
      }),
      this.client.service.findMany({
        where: {
          ...this.buildServiceWhere({ city: input.city }),
          isRecommended: true
        },
        include: this.serviceCardInclude(),
        take,
        orderBy: this.buildServiceOrderBy("recommended")
      }),
      this.client.shop.findMany({
        where: {
          deletedAt: null,
          status: PUBLISHED_STATUS,
          isRecommended: true,
          ...cityWhere
        },
        include: this.shopCardInclude(),
        take,
        orderBy: [{ id: "asc" }]
      }),
      this.client.technicianProfile.findMany({
        where: {
          deletedAt: null,
          status: PUBLISHED_STATUS,
          isRecommended: true,
          ...cityWhere
        },
        include: this.technicianCardInclude(),
        take,
        orderBy: [{ id: "asc" }]
      })
    ]);

    return {
      categories: categories.map((category) => this.mapCategory(category)),
      services: services.map((service) => this.mapServiceCard(service)),
      shops: shops.map((shop) => this.mapShopCard(shop)),
      technicians: technicians.map((technician) => this.mapTechnicianCard(technician))
    };
  }

  public search(input: ServiceListInput): Promise<PaginatedResponse<ServiceCardPayload>> {
    return this.listServices({ ...input, sort: input.sort ?? "rating_desc" });
  }

  public async findShopDetail(id: number): Promise<ShopDetailPayload | null> {
    const shop = await this.client.shop.findFirst({
      where: {
        id,
        deletedAt: null,
        status: PUBLISHED_STATUS
      },
      include: {
        ...this.shopCardInclude(),
        services: {
          where: { deletedAt: null, status: PUBLISHED_STATUS },
          include: this.serviceWithoutShopInclude(),
          orderBy: this.buildServiceOrderBy("recommended")
        },
        technicians: {
          where: { deletedAt: null, status: PUBLISHED_STATUS },
          include: this.technicianCardInclude(),
          orderBy: [{ id: "asc" }]
        }
      }
    });

    return shop ? this.mapShopDetail(shop) : null;
  }

  public async findTechnicianDetail(id: number): Promise<TechnicianDetailPayload | null> {
    const technician = await this.client.technicianProfile.findFirst({
      where: {
        id,
        deletedAt: null,
        status: PUBLISHED_STATUS
      },
      include: {
        ...this.technicianCardInclude(),
        services: {
          where: { deletedAt: null, status: PUBLISHED_STATUS },
          include: this.serviceCardInclude(),
          orderBy: this.buildServiceOrderBy("recommended")
        }
      }
    });

    return technician ? this.mapTechnicianDetail(technician) : null;
  }

  public async findCustomerProfile(id: number): Promise<CustomerProfilePayload | null> {
    const customer = await this.client.customerProfile.findFirst({
      where: {
        id,
        deletedAt: null,
        isPublic: true
      },
      include: {
        mediaAssets: activeMediaArgs,
        reviewSummary: true
      }
    });

    return customer ? this.mapCustomerProfile(customer) : null;
  }

  private serviceCardInclude() {
    return {
      category: true,
      shop: {
        include: this.shopCardInclude()
      },
      technicianProfile: {
        include: this.technicianCardInclude()
      },
      mediaAssets: activeMediaArgs,
      reviewSummary: true
    };
  }

  private serviceWithoutShopInclude() {
    return {
      category: true,
      technicianProfile: {
        include: this.technicianCardInclude()
      },
      mediaAssets: activeMediaArgs,
      reviewSummary: true
    };
  }

  private shopCardInclude() {
    return {
      mediaAssets: activeMediaArgs,
      reviewSummary: true
    };
  }

  private technicianCardInclude() {
    return {
      mediaAssets: activeMediaArgs,
      reviewSummary: true
    };
  }

  private buildServiceWhere(input: ServiceListInput): Prisma.ServiceWhereInput {
    const priceAmount =
      input.minPrice !== undefined || input.maxPrice !== undefined
        ? {
            ...(input.minPrice !== undefined ? { gte: input.minPrice } : {}),
            ...(input.maxPrice !== undefined ? { lte: input.maxPrice } : {})
          }
        : undefined;
    const keyword = input.keyword?.trim();

    return {
      deletedAt: null,
      status: PUBLISHED_STATUS,
      category: {
        deletedAt: null,
        isActive: true
      },
      shop: {
        deletedAt: null,
        status: PUBLISHED_STATUS
      },
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.shopId ? { shopId: input.shopId } : {}),
      ...(input.technicianId ? { technicianProfileId: input.technicianId } : {}),
      ...(input.city ? { city: input.city } : {}),
      ...(input.serviceMode ? { serviceMode: input.serviceMode } : {}),
      ...(priceAmount ? { priceAmount } : {}),
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword } },
              { description: { contains: keyword } },
              { category: { name: { contains: keyword } } },
              { category: { nameJa: { contains: keyword } } },
              { category: { nameEn: { contains: keyword } } },
              { shop: { name: { contains: keyword } } },
              { technicianProfile: { displayName: { contains: keyword } } }
            ]
          }
        : {})
    };
  }

  private buildServiceOrderBy(
    sort: CoreReadSort = "recommended"
  ): Prisma.ServiceOrderByWithRelationInput[] {
    if (sort === "price_asc") {
      return [{ priceAmount: "asc" }, { id: "asc" }];
    }
    if (sort === "price_desc") {
      return [{ priceAmount: "desc" }, { id: "asc" }];
    }
    if (sort === "newest") {
      return [{ createdAt: "desc" }, { id: "desc" }];
    }
    if (sort === "rating_desc") {
      return [
        { reviewSummary: { ratingAverage: "desc" } },
        { isRecommended: "desc" },
        { sortOrder: "asc" },
        { id: "asc" }
      ];
    }

    return [{ isRecommended: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }, { id: "asc" }];
  }

  private mapCategory(category: Category): CategoryPayload {
    return {
      id: category.id,
      code: category.code,
      name: category.name,
      nameJa: category.nameJa,
      nameEn: category.nameEn,
      parentId: category.parentId,
      iconUrl: category.iconUrl,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt
    };
  }

  private mapServiceCard(
    service: ServiceRecordBase | ServiceCardRecord,
    shopOverride?: ShopCardPayload
  ): ServiceCardPayload {
    const shop = shopOverride ?? ("shop" in service ? this.mapShopCard(service.shop) : undefined);

    if (!shop) {
      throw new Error("Service card mapping requires a shop payload.");
    }

    return {
      id: service.id,
      name: service.name,
      description: service.description,
      category: this.mapCategory(service.category),
      shop,
      technician: service.technicianProfile
        ? this.mapTechnicianCard(service.technicianProfile)
        : null,
      city: service.city,
      priceAmount: this.formatDecimal(service.priceAmount, 2),
      currency: service.currency,
      durationMinutes: service.durationMinutes,
      coverUrl: this.findMediaUrl(service.mediaAssets, "cover"),
      reviewSummary: this.mapReviewSummary(service.reviewSummary)
    };
  }

  private mapServiceDetail(service: ServiceCardRecord): ServiceDetailPayload {
    return {
      ...this.mapServiceCard(service),
      serviceMode: service.serviceMode,
      mediaAssets: service.mediaAssets.map((asset) => this.mapMediaAsset(asset)),
      createdAt: service.createdAt,
      updatedAt: service.updatedAt
    };
  }

  private mapShopCard(shop: ShopCardRecord): ShopCardPayload {
    return {
      id: shop.id,
      name: shop.name,
      city: shop.city,
      address: shop.address,
      coverUrl: this.findMediaUrl(shop.mediaAssets, "cover"),
      reviewSummary: this.mapReviewSummary(shop.reviewSummary)
    };
  }

  private mapShopDetail(shop: ShopDetailRecord): ShopDetailPayload {
    const shopCard = this.mapShopCard(shop);

    return {
      ...shopCard,
      description: shop.description,
      phone: shop.phone,
      latitude: this.formatNullableDecimal(shop.latitude, 7),
      longitude: this.formatNullableDecimal(shop.longitude, 7),
      mediaAssets: shop.mediaAssets.map((asset) => this.mapMediaAsset(asset)),
      services: shop.services.map((service) => this.mapServiceCard(service, shopCard)),
      technicians: shop.technicians.map((technician) => this.mapTechnicianCard(technician)),
      createdAt: shop.createdAt,
      updatedAt: shop.updatedAt
    };
  }

  private mapTechnicianCard(technician: TechnicianCardRecord): TechnicianCardPayload {
    return {
      id: technician.id,
      displayName: technician.displayName,
      city: technician.city,
      avatarUrl: this.findMediaUrl(technician.mediaAssets, "avatar"),
      reviewSummary: this.mapReviewSummary(technician.reviewSummary)
    };
  }

  private mapTechnicianDetail(technician: TechnicianDetailRecord): TechnicianDetailPayload {
    return {
      ...this.mapTechnicianCard(technician),
      bio: technician.bio,
      serviceArea: technician.serviceArea,
      yearsExperience: technician.yearsExperience,
      mediaAssets: technician.mediaAssets.map((asset) => this.mapMediaAsset(asset)),
      services: technician.services.map((service) => this.mapServiceCard(service)),
      createdAt: technician.createdAt,
      updatedAt: technician.updatedAt
    };
  }

  private mapCustomerProfile(customer: CustomerProfileRecord): CustomerProfilePayload {
    return {
      id: customer.id,
      displayName: customer.displayName,
      city: customer.city,
      bio: customer.bio,
      avatarUrl: this.findMediaUrl(customer.mediaAssets, "avatar"),
      membershipLevel: customer.membershipLevel,
      reviewSummary: this.mapReviewSummary(customer.reviewSummary),
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt
    };
  }

  private mapMediaAsset(asset: MediaAsset): MediaAssetPayload {
    return {
      id: asset.id,
      url: asset.url,
      mimeType: asset.mimeType,
      usageType: asset.usageType,
      width: asset.width,
      height: asset.height,
      altText: asset.altText,
      sortOrder: asset.sortOrder
    };
  }

  private mapReviewSummary(summary: ReviewSummary | null): ReviewSummaryPayload {
    if (!summary || summary.deletedAt) {
      return {
        ratingAverage: "0.00",
        reviewCount: 0,
        latestReviewAt: null,
        highlights: []
      };
    }

    return {
      ratingAverage: this.formatDecimal(summary.ratingAverage, 2),
      reviewCount: summary.reviewCount,
      latestReviewAt: summary.latestReviewAt,
      highlights: this.normalizeHighlights(summary.highlights)
    };
  }

  private normalizeHighlights(value: Prisma.JsonValue | null): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === "string");
  }

  private findMediaUrl(mediaAssets: MediaAsset[], usageType: string): string | null {
    const preferred = mediaAssets.find((asset) => asset.usageType === usageType);

    return preferred?.url ?? mediaAssets[0]?.url ?? null;
  }

  private formatNullableDecimal(
    value: DecimalLike | string | number | null,
    scale: number
  ): string | null {
    return value === null ? null : this.formatDecimal(value, scale);
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
