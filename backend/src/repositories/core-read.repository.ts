import type {
  Category,
  CustomerProfile,
  MediaAsset,
  Prisma,
  PrismaClient,
  PublicIdentifier,
  ReviewSummary,
  Service,
  Shop,
  TechnicianProfile
} from "@prisma/client";
import { prisma } from "../prisma/client";
import { resolveEffectiveCustomerMembershipLevel } from "../services/customer-membership.service";
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

export type CoreSearchEntityType = "service" | "shop" | "technician";

export interface CoreSearchInput extends ServiceListInput {
  entityType: CoreSearchEntityType;
  keywords: string[];
  categoryIds: number[];
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
  publicId: string;
  name: string;
  city: string;
  address: string;
  coverUrl: string | null;
  reviewSummary: ReviewSummaryPayload;
}

export interface TechnicianCardPayload {
  id: number;
  publicId: string;
  displayName: string;
  city: string;
  avatarUrl: string | null;
  reviewSummary: ReviewSummaryPayload;
}

export interface ServiceCardPayload {
  id: number;
  publicId: string;
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
  shop: ShopCardPayload | null;
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
  publicId: string;
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

export type CoreSearchResponse =
  | PaginatedResponse<ServiceCardPayload>
  | PaginatedResponse<ShopCardPayload>
  | PaginatedResponse<TechnicianCardPayload>;

export interface CoreReadRepositoryPort {
  listCategories: (input: CategoryListInput) => Promise<PaginatedResponse<CategoryPayload>>;
  listServices: (input: ServiceListInput) => Promise<PaginatedResponse<ServiceCardPayload>>;
  findServiceDetail: (id: number | string) => Promise<ServiceDetailPayload | null>;
  getHomeRecommendations: (input: HomeRecommendationsInput) => Promise<HomeRecommendationsPayload>;
  search: (input: CoreSearchInput) => Promise<PaginatedResponse<ServiceCardPayload>>;
  searchShops: (input: CoreSearchInput) => Promise<PaginatedResponse<ShopCardPayload>>;
  searchTechnicians: (
    input: CoreSearchInput
  ) => Promise<PaginatedResponse<TechnicianCardPayload>>;
  findShopDetail: (id: number | string) => Promise<ShopDetailPayload | null>;
  findTechnicianDetail: (id: number) => Promise<TechnicianDetailPayload | null>;
  findCustomerProfile: (id: number) => Promise<CustomerProfilePayload | null>;
}

type ShopCardRecord = Shop & {
  mediaAssets: MediaAsset[];
  publicIdentifier: PublicIdentifier | null;
  reviewSummary: ReviewSummary | null;
};

type TechnicianCardRecord = TechnicianProfile & {
  mediaAssets: MediaAsset[];
  reviewSummary: ReviewSummary | null;
  user: {
    avatarBootstrapUrl: string | null;
    identities: Array<{ publicIdentifier: PublicIdentifier | null }>;
  };
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
  shop: ShopCardRecord | null;
  services: ServiceCardRecord[];
};

type CustomerProfileRecord = CustomerProfile & {
  mediaAssets: MediaAsset[];
  reviewSummary: ReviewSummary | null;
  user: { avatarBootstrapUrl: string | null; avatarUrl: string | null; needoId: string };
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
    input: ServiceListInput | CoreSearchInput
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

  public async findServiceDetail(id: number | string): Promise<ServiceDetailPayload | null> {
    const service = await this.client.service.findFirst({
      where: {
        ...(typeof id === "number" ? { id } : { publicId: id }),
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
          ...this.publishedTechnicianProfileWhere(),
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

  public search(input: CoreSearchInput): Promise<PaginatedResponse<ServiceCardPayload>> {
    return this.listServices({ ...input, sort: input.sort ?? "rating_desc" });
  }

  public async searchShops(
    input: CoreSearchInput
  ): Promise<PaginatedResponse<ShopCardPayload>> {
    const pagination = toPrismaPagination(input);
    const where = this.buildShopSearchWhere(input);
    const [list, total] = await Promise.all([
      this.client.shop.findMany({
        where,
        include: this.shopCardInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ isRecommended: "desc" }, { id: "asc" }]
      }),
      this.client.shop.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((shop) => this.mapShopCard(shop)),
      total,
      pagination
    );
  }

  public async searchTechnicians(
    input: CoreSearchInput
  ): Promise<PaginatedResponse<TechnicianCardPayload>> {
    const pagination = toPrismaPagination(input);
    const where = this.buildTechnicianSearchWhere(input);
    const [list, total] = await Promise.all([
      this.client.technicianProfile.findMany({
        where,
        include: this.technicianCardInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ isRecommended: "desc" }, { id: "asc" }]
      }),
      this.client.technicianProfile.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((technician) => this.mapTechnicianCard(technician)),
      total,
      pagination
    );
  }

  public async findShopDetail(id: number | string): Promise<ShopDetailPayload | null> {
    const shop = await this.client.shop.findFirst({
      where: {
        ...(typeof id === "number"
          ? { id }
          : {
              publicIdentifier: {
                is: { publicId: id, status: "ACTIVE", deletedAt: null }
              }
            }),
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
          where: this.publishedTechnicianProfileWhere(),
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
        ...this.publishedTechnicianProfileWhere()
      },
      include: {
        ...this.technicianCardInclude(),
        shop: {
          include: this.shopCardInclude()
        },
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
        reviewSummary: true,
        user: { select: { avatarBootstrapUrl: true, avatarUrl: true, needoId: true } }
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
      publicIdentifier: true,
      reviewSummary: true
    };
  }

  private technicianCardInclude() {
    return {
      mediaAssets: activeMediaArgs,
      reviewSummary: true,
      user: {
        select: {
          avatarBootstrapUrl: true,
          identities: {
            where: {
              deletedAt: null,
              isActive: true,
              type: { in: ["technician", "service", "s"] },
              publicIdentifier: {
                is: this.publicIdentifierWhere("S")
              }
            },
            include: { publicIdentifier: true }
          }
        }
      }
    };
  }

  private searchKeywords(input: Pick<CoreSearchInput, "keyword" | "keywords">): string[] {
    return Array.from(
      new Set(
        [input.keyword, ...input.keywords]
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value))
      )
    );
  }

  private publicIdentifierWhere(kind: "S" | "SHOP"): Prisma.PublicIdentifierWhereInput {
    return { kind, status: "ACTIVE", deletedAt: null };
  }

  private serviceKeywordBranches(keyword: string): Prisma.ServiceWhereInput[] {
    return [
      { name: { contains: keyword } },
      { description: { contains: keyword } },
      { category: { name: { contains: keyword } } },
      { category: { nameJa: { contains: keyword } } },
      { category: { nameEn: { contains: keyword } } },
      { shop: { name: { contains: keyword } } },
      { technicianProfile: { displayName: { contains: keyword } } }
    ];
  }

  private publishedServiceKeywordWhere(keyword: string): Prisma.ServiceWhereInput {
    return {
      deletedAt: null,
      status: PUBLISHED_STATUS,
      category: { deletedAt: null, isActive: true },
      OR: this.serviceKeywordBranches(keyword)
    };
  }

  private publishedServiceCategoryWhere(categoryIds: number[]): Prisma.ServiceWhereInput {
    return {
      deletedAt: null,
      status: PUBLISHED_STATUS,
      categoryId: { in: categoryIds },
      category: { deletedAt: null, isActive: true }
    };
  }

  private technicianServiceKeywordWhere(
    keyword: string
  ): Prisma.TechnicianServiceWhereInput {
    return {
      deletedAt: null,
      isActive: true,
      reviewStatus: "APPROVED",
      OR: [
        { name: { contains: keyword } },
        { description: { contains: keyword } },
        { category: { name: { contains: keyword } } },
        { category: { nameJa: { contains: keyword } } },
        { category: { nameEn: { contains: keyword } } }
      ]
    };
  }

  private technicianServiceCategoryWhere(
    categoryIds: number[]
  ): Prisma.TechnicianServiceWhereInput {
    return {
      deletedAt: null,
      isActive: true,
      reviewStatus: "APPROVED",
      categoryId: { in: categoryIds },
      category: { deletedAt: null, isActive: true }
    };
  }

  private activeTechnicianIdentityWhere(
    publicId?: string
  ): Prisma.UserIdentityWhereInput {
    return {
      deletedAt: null,
      isActive: true,
      type: { in: ["technician", "service", "s"] },
      publicIdentifier: {
        is: {
          ...this.publicIdentifierWhere("S"),
          ...(publicId ? { publicId } : {})
        }
      }
    };
  }

  private publishedTechnicianProfileWhere(): Prisma.TechnicianProfileWhereInput {
    return {
      deletedAt: null,
      status: PUBLISHED_STATUS,
      user: {
        identities: { some: this.activeTechnicianIdentityWhere() }
      }
    };
  }

  private buildShopSearchWhere(input: CoreSearchInput): Prisma.ShopWhereInput {
    const keywords = this.searchKeywords(input);
    const searchBranches: Prisma.ShopWhereInput[] = keywords.flatMap((keyword) => [
      { name: { contains: keyword } },
      { city: { contains: keyword } },
      { address: { contains: keyword } },
      { description: { contains: keyword } },
      { publicIdentifier: { is: { publicId: keyword } } },
      { services: { some: this.publishedServiceKeywordWhere(keyword) } }
    ]);

    if (input.categoryIds.length > 0) {
      searchBranches.push({
        services: { some: this.publishedServiceCategoryWhere(input.categoryIds) }
      });
    }

    return {
      deletedAt: null,
      status: PUBLISHED_STATUS,
      publicIdentifier: { is: this.publicIdentifierWhere("SHOP") },
      ...(input.city ? { city: input.city } : {}),
      ...(searchBranches.length > 0 ? { OR: searchBranches } : {})
    };
  }

  private buildTechnicianSearchWhere(
    input: CoreSearchInput
  ): Prisma.TechnicianProfileWhereInput {
    const keywords = this.searchKeywords(input);
    const searchBranches: Prisma.TechnicianProfileWhereInput[] = keywords.flatMap(
      (keyword) => [
        { displayName: { contains: keyword } },
        { city: { contains: keyword } },
        { bio: { contains: keyword } },
        { serviceArea: { contains: keyword } },
        {
          user: {
            identities: { some: this.activeTechnicianIdentityWhere(keyword) }
          }
        },
        { services: { some: this.publishedServiceKeywordWhere(keyword) } },
        { technicianServices: { some: this.technicianServiceKeywordWhere(keyword) } },
        {
          technicianShopAffiliations: {
            some: {
              deletedAt: null,
              workStatus: "ACTIVE",
              shop: {
                deletedAt: null,
                status: PUBLISHED_STATUS,
                services: { some: this.publishedServiceKeywordWhere(keyword) }
              }
            }
          }
        }
      ]
    );

    if (input.categoryIds.length > 0) {
      searchBranches.push(
        { services: { some: this.publishedServiceCategoryWhere(input.categoryIds) } },
        {
          technicianServices: {
            some: this.technicianServiceCategoryWhere(input.categoryIds)
          }
        },
        {
          technicianShopAffiliations: {
            some: {
              deletedAt: null,
              workStatus: "ACTIVE",
              shop: {
                deletedAt: null,
                status: PUBLISHED_STATUS,
                services: { some: this.publishedServiceCategoryWhere(input.categoryIds) }
              }
            }
          }
        }
      );
    }

    return {
      ...this.publishedTechnicianProfileWhere(),
      ...(input.city ? { city: input.city } : {}),
      ...(searchBranches.length > 0 ? { OR: searchBranches } : {})
    };
  }

  private buildServiceWhere(
    input: ServiceListInput | CoreSearchInput
  ): Prisma.ServiceWhereInput {
    const priceAmount =
      input.minPrice !== undefined || input.maxPrice !== undefined
        ? {
            ...(input.minPrice !== undefined ? { gte: input.minPrice } : {}),
            ...(input.maxPrice !== undefined ? { lte: input.maxPrice } : {})
          }
        : undefined;
    const keyword = input.keyword?.trim();
    const isCoreSearch = "keywords" in input && "categoryIds" in input;
    const hasOrSearch =
      isCoreSearch && (input.keywords.length > 0 || input.categoryIds.length > 0);
    const searchBranches = hasOrSearch
      ? [
          ...this.searchKeywords(input).flatMap((value) => this.serviceKeywordBranches(value)),
          ...(input.categoryIds.length > 0
            ? [{ categoryId: { in: input.categoryIds } } satisfies Prisma.ServiceWhereInput]
            : [])
        ]
      : keyword
        ? this.serviceKeywordBranches(keyword)
        : [];

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
      ...(searchBranches.length > 0 ? { OR: searchBranches } : {})
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
      publicId: service.publicId,
      name: service.name,
      description: service.description,
      category: this.mapCategory(service.category),
      shop,
      technician: service.technicianProfile && this.isPublicTechnicianCard(service.technicianProfile)
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
      publicId: this.requirePublicId(shop.publicIdentifier, "SHOP"),
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
    const identifier = technician.user.identities.find(
      (identity) => this.isActivePublicIdentifier(identity.publicIdentifier, "S")
    )?.publicIdentifier;

    return {
      id: technician.id,
      publicId: this.requirePublicId(identifier ?? null, "S"),
      displayName: technician.displayName,
      city: technician.city,
      avatarUrl:
        this.findMediaUrl(technician.mediaAssets, "avatar") ??
        technician.user.avatarBootstrapUrl,
      reviewSummary: this.mapReviewSummary(technician.reviewSummary)
    };
  }

  private isPublicTechnicianCard(technician: TechnicianCardRecord): boolean {
    return (
      technician.deletedAt === null &&
      technician.status === PUBLISHED_STATUS &&
      technician.user.identities.some((identity) =>
        this.isActivePublicIdentifier(identity.publicIdentifier, "S")
      )
    );
  }

  private isActivePublicIdentifier(
    identifier: PublicIdentifier | null,
    expectedKind: "S" | "SHOP"
  ): identifier is PublicIdentifier {
    return Boolean(
      identifier &&
      identifier.kind === expectedKind &&
      identifier.status === "ACTIVE" &&
      identifier.deletedAt === null
    );
  }

  private mapTechnicianDetail(technician: TechnicianDetailRecord): TechnicianDetailPayload {
    return {
      ...this.mapTechnicianCard(technician),
      shop: technician.shop ? this.mapShopCard(technician.shop) : null,
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
      publicId: this.requireCustomerPublicId(customer.user.needoId),
      displayName: customer.displayName,
      city: customer.city,
      bio: customer.bio,
      avatarUrl:
        this.findMediaUrl(customer.mediaAssets, "avatar") ??
        customer.user.avatarUrl ??
        customer.user.avatarBootstrapUrl,
      membershipLevel: resolveEffectiveCustomerMembershipLevel(customer),
      reviewSummary: this.mapReviewSummary(customer.reviewSummary),
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt
    };
  }

  private requirePublicId(identifier: PublicIdentifier | null, expectedKind: "S" | "SHOP"): string {
    if (this.isActivePublicIdentifier(identifier, expectedKind)) {
      return identifier.publicId;
    }

    throw new Error(`Formal ${expectedKind} public identifier is unavailable.`);
  }

  private requireCustomerPublicId(publicId: string): string {
    if (/^(?:u|needo)\d{10}$/.test(publicId)) {
      return publicId;
    }

    throw new Error("Formal customer public identifier is unavailable.");
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
