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
  name: string;
  city: string;
  address: string;
  coverUrl: string | null;
  reviewSummary: CoreReviewSummary;
};

export type CoreTechnicianCard = {
  id: number;
  displayName: string;
  city: string;
  avatarUrl: string | null;
  reviewSummary: CoreReviewSummary;
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
  displayName: string;
  city: string | null;
  bio: string | null;
  avatarUrl: string | null;
  membershipLevel: string;
  reviewSummary: CoreReviewSummary;
  createdAt: string;
  updatedAt: string;
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

const fallbackServiceImage = "/images/generated/services/service-home-organization.jpg";
const fallbackStoreImage = "/images/generated/stores/store-cafe-consult.jpg";
const fallbackTechnicianAvatar = "/images/generated/profiles/ai-profile-01.jpg";
const fallbackCustomerAvatar = "/images/generated/profiles/ai-profile-30.jpg";

const categoryCodeToHomeCategoryId: Partial<Record<string, ServiceCategory["id"]>> = {
  beauty: "beauty",
  business: "business",
  care: "care",
  cleaning: "cleaning",
  dining: "dining",
  pet: "pet",
  repair: "repair",
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

export function coreReadIdFromRoute(id: string | number | null | undefined) {
  return isCoreReadApiId(id) ? Number(id) : null;
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

  return {
    id: String(shop.id),
    systemId: `S-${shop.id}`,
    merchantId: `merchant-${shop.id}`,
    name: shop.name,
    area: shop.city,
    address: shop.address,
    rating: parseRating(shop.reviewSummary),
    reviewCount: shop.reviewSummary.reviewCount,
    priceLabel: priceRangeFromServices(detail?.services),
    tags: uniqueStrings([shop.city, ...shop.reviewSummary.highlights]).slice(0, 6),
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
    systemId: `B-${technician.id}`,
    name: technician.displayName,
    storeId: firstService ? String(firstService.shop.id) : "",
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

export function mapCoreCustomerToCustomer(customer: CoreCustomerProfile): Customer {
  const activeScore = Math.max(0, Math.min(100, Math.round(parseRating(customer.reviewSummary) * 20)));

  return {
    id: String(customer.id),
    systemId: `U-${customer.id}`,
    name: customer.displayName,
    avatar: customer.avatarUrl ?? fallbackCustomerAvatar,
    phone: "",
    nickname: customer.displayName,
    languages: ["日本語"],
    bio: customer.bio ?? undefined,
    creditRating: customer.reviewSummary.reviewCount > 0 ? "A" : undefined,
    points: 0,
    couponCount: 0,
    memberLevel: customer.membershipLevel,
    tags: uniqueStrings([customer.city, ...customer.reviewSummary.highlights]).slice(0, 6),
    ltv: 0,
    orderCount: customer.reviewSummary.reviewCount,
    lastOrderAt: "",
    activeScore,
    churnRisk: "low"
  };
}

export const coreReadApi = {
  listCategories(query: { page?: number; pageSize?: number; parentId?: number | null } = {}) {
    return httpClient.request<PaginatedCoreReadData<CoreCategory>>("/categories", { auth: false, query });
  },

  listServices(query: CoreServiceListQuery = {}) {
    return httpClient.request<PaginatedCoreReadData<CoreServiceCard>>("/services", { auth: false, query });
  },

  search(query: CoreServiceListQuery = {}) {
    return httpClient.request<PaginatedCoreReadData<CoreServiceCard>>("/search", { auth: false, query });
  },

  getHomeRecommendations(query: { city?: string; limit?: number } = {}) {
    return httpClient.request<CoreHomeRecommendations>("/home/recommendations", { auth: false, query });
  },

  getServiceDetail(id: number) {
    return httpClient.request<CoreServiceDetail>(`/services/${id}`, { auth: false });
  },

  getShopDetail(id: number) {
    return httpClient.request<CoreShopDetail>(`/shops/${id}`, { auth: false });
  },

  getTechnicianDetail(id: number) {
    return httpClient.request<CoreTechnicianDetail>(`/technicians/${id}`, { auth: false });
  },

  getCustomerProfile(id: number) {
    return httpClient.request<CoreCustomerProfile>(`/profiles/customers/${id}`, { auth: false });
  }
};
