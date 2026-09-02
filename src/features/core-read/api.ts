import { httpClient } from "../../api/httpClient";
import type { Customer, FulfillmentMode, ServiceCategory, ServiceItem, Store, Technician } from "../../types/domain";

export type PaginatedCoreReadData<TItem> = {
  list: TItem[];
  total: number;
  page: number;
  page_size: number;
};

export type CoreReadSort = "recommended" | "rating_desc" | "price_asc" | "price_desc" | "newest";

export type CoreReviewSummary = {
  ratingAverage: string;
  reviewCount: number;
  latestReviewAt: string | null;
  highlights: string[];
};

export type CoreMediaAsset = {
  id: number;
  url: string;
  mimeType: string;
  usageType: string;
  width: number | null;
  height: number | null;
  altText: string | null;
  sortOrder: number;
};

export type CoreCategory = {
  id: number;
  code: string;
  name: string;
  nameJa: string | null;
  nameEn: string | null;
  parentId: number | null;
  iconUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CoreShopCard = {
  id: number;
  publicId: string;
  name: string;
  city: string;
  address: string;
  coverUrl: string | null;
  reviewSummary: CoreReviewSummary;
  favoriteCount: number;
  shareCount: number;
  serviceCategories: Array<{ id: number; code: string; label: string }>;
  businessKeywords: Array<{ id: number; code: string; label: string; categoryId: number }>;
};

export type CorePrimaryTechnicianService = {
  id: number;
  name: string;
  priceAmount: string;
  currency: string;
  durationMinutes: number;
};

export type CoreTechnicianCard = {
  id: number;
  publicId: string;
  displayName: string;
  city: string;
  avatarUrl: string | null;
  reviewSummary: CoreReviewSummary;
  age: number | null;
  favoriteCount: number;
  shareCount: number;
  completedOrderCount: number;
  acceptanceRatePercent: number;
  primaryService: CorePrimaryTechnicianService | null;
  distanceKm?: number;
  nearbyRank?: 1 | 2 | 3 | null;
  resolvedRadiusKm?: number;
};

export type CoreServiceCard = {
  id: number;
  name: string;
  description: string | null;
  category: CoreCategory;
  shop: CoreShopCard;
  technician: CoreTechnicianCard | null;
  city: string;
  priceAmount: string;
  currency: string;
  durationMinutes: number;
  coverUrl: string | null;
  reviewSummary: CoreReviewSummary;
};

export type CoreServiceDetail = CoreServiceCard & {
  serviceMode: string;
  mediaAssets: CoreMediaAsset[];
  createdAt: string;
  updatedAt: string;
};

export type CoreShopDetail = CoreShopCard & {
  description: string | null;
  phone: string | null;
  latitude: string | null;
  longitude: string | null;
  mediaAssets: CoreMediaAsset[];
  services: CoreServiceCard[];
  technicians: CoreTechnicianCard[];
  createdAt: string;
  updatedAt: string;
};

export type CoreTechnicianDetail = CoreTechnicianCard & {
  shop: CoreShopCard | null;
  bio: string | null;
  serviceArea: string | null;
  yearsExperience: number;
  mediaAssets: CoreMediaAsset[];
  services: CoreServiceCard[];
  createdAt: string;
  updatedAt: string;
};

export type CoreCustomerProfile = {
  id: number;
  publicId: string;
  displayName: string;
  city: string | null;
  bio: string | null;
  avatarUrl: string | null;
  gender?: "female" | "male" | "private";
  age?: number | null;
  heightCm?: number | null;
  languages?: string[];
  visibility?: "public" | "privateAll" | "limited" | "network";
  membershipLevel: string;
  reviewSummary: CoreReviewSummary;
  createdAt: string;
  updatedAt: string;
};

type CustomerProfileViewSource = Omit<CoreCustomerProfile, "reviewSummary"> & {
  level?: number;
  reviewSummary?: CoreReviewSummary;
};

export type CoreHomeRecommendations = {
  categories: CoreCategory[];
  services: CoreServiceCard[];
  shops: CoreShopCard[];
  technicians: CoreTechnicianCard[];
};

export type CoreServiceListQuery = {
  categoryId?: number;
  city?: string;
  keyword?: string;
  maxPrice?: number;
  minPrice?: number;
  page?: number;
  pageSize?: number;
  serviceMode?: string;
  shopId?: number;
  sort?: CoreReadSort;
  technicianId?: number;
};

export type CoreSearchListQuery = Omit<CoreServiceListQuery, "keyword" | "categoryId"> & {
  keyword?: string;
  keywords?: readonly string[];
  categoryIds?: readonly number[];
  latitude?: number;
  longitude?: number;
};

const fallbackServiceImage = "/images/generated/services/service-home-organization.jpg";
const fallbackStoreImage = "/images/generated/stores/store-cafe-consult.jpg";
const fallbackTechnicianAvatar = "/images/generated/profiles/ai-profile-01.jpg";
const fallbackCustomerAvatar = "/images/generated/profiles/ai-profile-30.jpg";

const categoryCodeToHomeCategoryId: Partial<Record<string, ServiceCategory["id"]>> = {
  appliance: "appliance",
  beauty: "beauty",
  business: "business",
  care: "care",
  cleaning: "cleaning",
  deep: "deep",
  dining: "dining",
  guide: "guide",
  homecare: "homecare",
  install: "install",
  laundry: "laundry",
  legal: "legal",
  massage: "massage",
  moving: "moving",
  nanny: "nanny",
  other: "other",
  pet: "pet",
  property: "property",
  recycle: "recycle",
  renovation: "renovation",
  repair: "repair",
  sports: "sports",
  storage: "storage",
  tutor: "tutor",
  wellness: "massage"
};

function uniqueStrings(items: Array<string | null | undefined>) {
  return Array.from(new Set(items.map((item) => item?.trim() ?? "").filter(Boolean)));
}

function parseAmount(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseRating(summary: CoreReviewSummary) {
  return parseAmount(summary.ratingAverage);
}

function getCoreCategoryHomeId(category: CoreCategory): ServiceCategory["id"] {
  const code = category.code.trim().toLowerCase();
  const direct = categoryCodeToHomeCategoryId[code];

  if (direct) {
    return direct;
  }

  const text = `${category.name} ${category.nameJa ?? ""} ${category.nameEn ?? ""}`.toLowerCase();

  if (text.includes("beauty") || text.includes("美容")) {
    return "beauty";
  }

  if (text.includes("wellness") || text.includes("body") || text.includes("care") || text.includes("ウェルネス")) {
    return "massage";
  }

  return "other";
}

function categoryDisplayName(category: CoreCategory) {
  return category.nameJa ?? category.nameEn ?? category.name;
}

function splitServiceArea(value: string | null | undefined, fallbackCity: string) {
  const areas = uniqueStrings((value ?? "").split(/,|，|、|\//));
  return areas.length > 0 ? areas : [fallbackCity].filter(Boolean);
}

function mediaGallery(mediaAssets?: CoreMediaAsset[], fallback?: string | null) {
  const media = [...(mediaAssets ?? [])]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id)
    .map((asset) => asset.url);
  return uniqueStrings([...media, fallback]).slice(0, 5);
}

function priceRangeFromServices(services?: CoreServiceCard[]) {
  const prices = (services ?? []).map((service) => parseAmount(service.priceAmount)).filter((price) => price > 0);

  if (prices.length === 0) {
    return "预约确认";
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? `¥${min.toLocaleString("ja-JP")}` : `¥${min.toLocaleString("ja-JP")}-¥${max.toLocaleString("ja-JP")}`;
}

function firstServiceMode(services?: CoreServiceCard[]): FulfillmentMode {
  const mode = (services?.[0] as Partial<CoreServiceDetail> | undefined)?.serviceMode;
  return mode === "home" || mode === "onsite" ? "home" : "store";
}

function serviceModeToFulfillmentMode(service: CoreServiceCard | CoreServiceDetail): FulfillmentMode {
  const mode = "serviceMode" in service ? service.serviceMode : undefined;
  return mode === "home" || mode === "onsite" ? "home" : "store";
}

export function isCoreReadApiId(id: string | number | null | undefined) {
  return typeof id === "number" ? Number.isInteger(id) && id > 0 : Boolean(id && /^[1-9]\d*$/.test(id));
}

const coreReadUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function coreReadIdFromRoute(
  id: string | number | null | undefined,
  options: { allowUuid: true }
): number | string | null;
export function coreReadIdFromRoute(id: string | number | null | undefined): number | null;
export function coreReadIdFromRoute(
  id: string | number | null | undefined,
  options?: { allowUuid?: boolean }
) {
  if (isCoreReadApiId(id)) {
    return Number(id);
  }

  return options?.allowUuid && typeof id === "string" && coreReadUuidPattern.test(id) ? id : null;
}

export function coreReadShopIdFromRoute(
  id: string | number | null | undefined
): number | string | null {
  if (isCoreReadApiId(id)) {
    return Number(id);
  }

  return typeof id === "string" && /^shop\d{10}$/.test(id) ? id : null;
}

export function mapCoreCategoryToServiceCategory(category: CoreCategory): ServiceCategory {
  const name = categoryDisplayName(category);

  return {
    id: getCoreCategoryHomeId(category),
    name,
    icon: (name.trim()[0] ?? category.code.trim()[0] ?? "服").toUpperCase(),
    mode: "both",
    hot: category.isActive
  };
}

export function mapCoreServiceToServiceItem(service: CoreServiceCard | CoreServiceDetail): ServiceItem {
  const price = parseAmount(service.priceAmount);
  const categoryName = categoryDisplayName(service.category);
  const tags = uniqueStrings([categoryName, service.city, ...service.reviewSummary.highlights]).slice(0, 4);
  const description = service.description?.trim() || `${service.name} · ${categoryName}`;

  return {
    id: String(service.id),
    categoryId: getCoreCategoryHomeId(service.category),
    name: service.name,
    mode: serviceModeToFulfillmentMode(service),
    priceFrom: price,
    rating: parseRating(service.reviewSummary),
    sales: service.reviewSummary.reviewCount,
    summary: description,
    tags: tags.length > 0 ? tags : [categoryName],
    fastestArrival: "可预约",
    serviceAreas: uniqueStrings([service.city, service.shop.city]),
    technicianCount: service.technician ? 1 : 0,
    cover: service.coverUrl ?? service.shop.coverUrl ?? fallbackServiceImage,
    packages: [
      {
        id: `api-service-${service.id}`,
        name: service.name,
        price,
        durationMinutes: service.durationMinutes,
        description,
        includes: uniqueStrings([categoryName, service.city, ...service.reviewSummary.highlights]).slice(0, 4)
      }
    ],
    notice: ["预约前请确认服务时间、地址与付款方式。"],
    flow: ["选择服务", "确认时间", "到店/上门", "完成服务", "评价反馈"]
  };
}

export function mapCoreShopToStore(shop: CoreShopCard | CoreShopDetail): Store {
  const detail = "services" in shop ? shop : undefined;
  const gallery = mediaGallery(detail?.mediaAssets, shop.coverUrl ?? fallbackStoreImage);
  const businessKeywords = Array.isArray(shop.businessKeywords) ? shop.businessKeywords : [];

  return {
    id: String(shop.id),
    systemId: shop.publicId,
    merchantId: `merchant-${shop.id}`,
    name: shop.name,
    area: shop.city,
    address: shop.address,
    rating: parseRating(shop.reviewSummary),
    reviewCount: shop.reviewSummary.reviewCount,
    priceLabel: priceRangeFromServices(detail?.services),
    tags: uniqueStrings(businessKeywords.map((keyword) => keyword.label)).slice(0, 5),
    openStatus: "open",
    nextSlot: "可预约",
    alwaysBookable: true,
    cover: shop.coverUrl ?? gallery[0] ?? fallbackStoreImage,
    gallery: gallery.length > 0 ? gallery : [fallbackStoreImage],
    description: detail?.description ?? `${shop.name} · ${shop.city}`,
    rankLabel: shop.reviewSummary.reviewCount > 0 ? `★ ${parseRating(shop.reviewSummary).toFixed(1)} · ${shop.reviewSummary.reviewCount} 条评价` : "公开店铺",
    businessHours: "请以店铺确认为准",
    mode: firstServiceMode(detail?.services),
    paymentMethods: ["platform", "offline"]
  };
}

export function mapCoreTechnicianToTechnician(technician: CoreTechnicianCard | CoreTechnicianDetail): Technician {
  const detail = "services" in technician ? technician : undefined;
  const firstService = detail?.services[0];
  const serviceAreas = splitServiceArea(detail?.serviceArea, technician.city);
  const skills = uniqueStrings([
    ...(detail?.services.map((service) => service.category.nameJa ?? service.category.name) ?? []),
    ...technician.reviewSummary.highlights
  ]).slice(0, 5);

  return {
    id: String(technician.id),
    systemId: technician.publicId,
    name: technician.displayName,
    storeId: detail?.shop ? String(detail.shop.id) : firstService ? String(firstService.shop.id) : "",
    role: "therapist",
    status: "available",
    rating: parseRating(technician.reviewSummary),
    orderCount: technician.reviewSummary.reviewCount,
    income: 0,
    skills: skills.length > 0 ? skills : ["预约服务"],
    serviceAreas,
    acceptRate: 98,
    cancelRate: 0,
    reviewCount: technician.reviewSummary.reviewCount,
    languages: ["日本語"],
    avatar: technician.avatarUrl ?? fallbackTechnicianAvatar,
    bio: detail?.bio ?? undefined,
    identityLabel: "店铺所属技师",
    profileTags: skills.length > 0 ? skills : ["预约服务"],
    gallery: mediaGallery(detail?.mediaAssets, technician.avatarUrl ?? fallbackTechnicianAvatar),
    paymentMethods: ["platform", "offline"]
  };
}

export function mapCoreCustomerToCustomer(customer: CustomerProfileViewSource): Customer {
  const reviewCount = customer.reviewSummary?.reviewCount ?? 0;
  const reviewSummary = customer.reviewSummary ?? {
    ratingAverage: "0",
    reviewCount: 0,
    latestReviewAt: null,
    highlights: []
  };
  const activeScore = Math.max(0, Math.min(100, Math.round(parseRating(reviewSummary) * 20)));

  return {
    id: String(customer.id),
    systemId: customer.publicId,
    name: customer.displayName,
    avatar: customer.avatarUrl ?? fallbackCustomerAvatar,
    phone: "",
    nickname: customer.displayName,
    gender: customer.gender,
    age: customer.age === null || customer.age === undefined ? undefined : String(customer.age),
    height: customer.heightCm === null || customer.heightCm === undefined ? undefined : `${customer.heightCm}cm`,
    languages: customer.languages?.length ? customer.languages : ["日本語"],
    bio: customer.bio ?? undefined,
    creditRating: reviewCount > 0 ? "A" : undefined,
    points: 0,
    couponCount: 0,
    memberLevel: customer.membershipLevel,
    experienceLevel: customer.level,
    tags: uniqueStrings([customer.city, ...(customer.reviewSummary?.highlights ?? [])]).slice(0, 6),
    ltv: 0,
    orderCount: reviewCount,
    lastOrderAt: "",
    activeScore,
    churnRisk: "low"
  };
}

function searchEntity<TItem>(entityType: "service" | "shop" | "technician", query: CoreSearchListQuery) {
  return httpClient.request<PaginatedCoreReadData<TItem>>("/search", {
    auth: false,
    query: { ...query, entityType }
  });
}

export const coreReadApi = {
  listCategories(query: { page?: number; pageSize?: number; parentId?: number | null } = {}) {
    return httpClient.request<PaginatedCoreReadData<CoreCategory>>("/categories", { auth: false, query });
  },

  listServices(query: CoreServiceListQuery = {}) {
    return httpClient.request<PaginatedCoreReadData<CoreServiceCard>>("/services", { auth: false, query });
  },

  searchServices(query: CoreSearchListQuery = {}) {
    return searchEntity<CoreServiceCard>("service", query);
  },

  searchShops(query: CoreSearchListQuery = {}) {
    return searchEntity<CoreShopCard>("shop", query);
  },

  searchTechnicians(query: CoreSearchListQuery = {}) {
    return searchEntity<CoreTechnicianCard>("technician", query);
  },

  search(query: CoreServiceListQuery | CoreSearchListQuery = {}) {
    return searchEntity<CoreServiceCard>("service", query);
  },

  getHomeRecommendations(query: { city?: string; limit?: number } = {}) {
    return httpClient.request<CoreHomeRecommendations>("/home/recommendations", { auth: false, query });
  },

  getServiceDetail(id: number | string) {
    return httpClient.request<CoreServiceDetail>(`/services/${id}`, { auth: false });
  },

  getShopDetail(id: number | string) {
    return httpClient.request<CoreShopDetail>(`/shops/${id}`, { auth: false });
  },

  getTechnicianDetail(id: number) {
    return httpClient.request<CoreTechnicianDetail>(`/technicians/${id}`, { auth: false });
  },

  getCustomerProfile(id: number) {
    return httpClient.request<CoreCustomerProfile>(`/profiles/customers/${id}`, { auth: false });
  }
};
