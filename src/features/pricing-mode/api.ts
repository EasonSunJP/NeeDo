import { httpClient } from "../../api/httpClient";
import { optimizeImageUpload } from "../../lib/image-upload";
import { persistentResourceCache } from "../../lib/persistentResourceCache";
import type { ContentLocale } from "../../shared/localized-content/localizedText";

export type ShopPricingMode = "merchant" | "technician";
export type ShopVisibility = "public" | "privateAll" | "limited" | "network";

export type ShopVisibilityResponse = {
  shopId: number;
  visibility: ShopVisibility;
  updatedAt: string | null;
  updatedBy: number | null;
};

export type ShopPricingModeResponse = {
  shopId: number;
  pricingMode: ShopPricingMode;
  technicianPricingRatePercent: number;
  updatedAt: string | null;
  updatedBy: number | null;
};

export type PaginatedPricingData<TItem> = {
  list: TItem[];
  total: number;
  page: number;
  page_size: number;
};

export type TechnicianServicePayload = {
  id: number;
  publicId: string;
  shopId: number | null;
  technicianId: number;
  sourceShopServiceId: number | null;
  name: string;
  description: string | null;
  localizedContent?: Partial<Record<ContentLocale, { name?: string; description?: string }>>;
  categoryId: number;
  priceAmount: number;
  currency: string;
  durationMinutes: number;
  usageCount: number;
  favoriteCount?: number;
  shareCount?: number;
  taxIncluded: true;
  coverImageUrl: string | null;
  images: string[];
  tags: string[];
  shop: { publicId: string | null; name: string; address: string } | null;
  isActive: boolean;
  isBookable: boolean;
  isRecommended: boolean;
  sortOrder: number;
  reviewStatus: string;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BookingNavigationTechnician = {
  id: number;
  displayName: string;
  city: string;
  avatarUrl: string | null;
  reviewSummary: unknown;
};

export type BookingNavigationService = {
  id: number;
  name: string;
  priceAmount: string;
  currency: string;
  durationMinutes: number;
  coverUrl: string | null;
  description: string | null;
  tags: string[];
  usageCount: number;
};

export type BookingNavigationResponse =
  | {
      shopId: number;
      pricingMode: "merchant";
      technicianPricingRatePercent: number;
      entry: "service_menu";
      services: PaginatedPricingData<BookingNavigationService>;
      technicians?: undefined;
    }
  | {
      shopId: number;
      pricingMode: "technician";
      technicianPricingRatePercent: number;
      entry: "technician_list";
      technicians: PaginatedPricingData<BookingNavigationTechnician>;
      services?: undefined;
    };

export type TechnicianServiceBody = {
  sourceShopServiceId?: number | null;
  localizedContent?: { locale: ContentLocale; name?: string; description?: string; syncAll?: boolean };
  name: string;
  description?: string | null;
  categoryId: number;
  priceAmount: number;
  currency?: string;
  durationMinutes: number;
  coverImageUrl?: string | null;
  images?: string[];
  tags?: string[];
  isActive?: boolean;
  isBookable?: boolean;
  isRecommended?: boolean;
  sortOrder?: number;
};

export const pricingModeApi = {
  getShopVisibility(shopId: number) {
    return httpClient.request<ShopVisibilityResponse>(
      `/merchant-admin/shops/${shopId}/visibility`
    );
  },

  updateShopVisibility(shopId: number, visibility: ShopVisibility) {
    return httpClient.request<ShopVisibilityResponse>(
      `/merchant-admin/shops/${shopId}/visibility`,
      { body: { visibility }, method: "PUT" }
    );
  },

  getShopPricingMode(shopId: number) {
    return httpClient.request<ShopPricingModeResponse>(`/shops/${shopId}/pricing-mode`);
  },

  updateShopPricingMode(shopId: number, pricingMode: ShopPricingMode, technicianPricingRatePercent?: number) {
    return httpClient.request<ShopPricingModeResponse>(`/shops/${shopId}/pricing-mode`, {
      body: { pricingMode, ...(typeof technicianPricingRatePercent === "number" ? { technicianPricingRatePercent } : {}) },
      method: "PUT"
    });
  },

  getBookingNavigation(shopId: number, query: { page?: number; pageSize?: number } = {}) {
    return httpClient.request<BookingNavigationResponse>(`/shops/${shopId}/booking-navigation`, {
      query
    });
  },

  listTechnicianServices(shopId: number, query: { page?: number; pageSize?: number; activeOnly?: boolean } = {}) {
    return httpClient.request<PaginatedPricingData<TechnicianServicePayload>>(
      `/technicians/me/shops/${shopId}/services`,
      { query }
    );
  },

  listMyTechnicianServices(query: { page?: number; pageSize?: number; activeOnly?: boolean } = {}) {
    return httpClient.request<PaginatedPricingData<TechnicianServicePayload>>(
      "/technicians/me/services",
      { query }
    );
  },

  reorderMyTechnicianServices(orderedServiceIds: number[], idempotencyKey: string) {
    return httpClient.request<TechnicianServicePayload[]>(
      "/technicians/me/services/order",
      {
        body: { orderedServiceIds, idempotencyKey },
        method: "PUT"
      }
    );
  },

  createTechnicianService(shopId: number, body: TechnicianServiceBody) {
    return httpClient.request<TechnicianServicePayload>(`/technicians/me/shops/${shopId}/services`, {
      body,
      method: "POST"
    });
  },

  createMyTechnicianService(body: TechnicianServiceBody) {
    return httpClient.request<TechnicianServicePayload>("/technicians/me/services", {
      body,
      method: "POST"
    });
  },

  async updateMyTechnicianService(serviceId: number, body: Partial<TechnicianServiceBody>) {
    const saved = await httpClient.request<TechnicianServicePayload>(`/technicians/me/services/${serviceId}`, {
      body,
      method: "PUT"
    });
    await Promise.all([
      persistentResourceCache.invalidate("public", `technician:public-profile-services:${saved.technicianId}`),
      persistentResourceCache.invalidate("public", `core:technician:${saved.technicianId}`)
    ]).catch(() => undefined);
    return saved;
  },

  deleteMyTechnicianService(serviceId: number) {
    return httpClient.request<{ deleted: true }>(`/technicians/me/services/${serviceId}`, {
      method: "DELETE"
    });
  },

  updateTechnicianService(shopId: number, serviceId: number, body: Partial<TechnicianServiceBody>) {
    return httpClient.request<TechnicianServicePayload>(
      `/technicians/me/shops/${shopId}/services/${serviceId}`,
      {
        body,
        method: "PUT"
      }
    );
  },

  deleteTechnicianService(shopId: number, serviceId: number) {
    return httpClient.request<{ deleted: true }>(`/technicians/me/shops/${shopId}/services/${serviceId}`, {
      method: "DELETE"
    });
  },

  async uploadTechnicianServiceCover(shopId: number, serviceId: number, file: File) {
    const optimized = await optimizeImageUpload(file, "service-cover");
    return httpClient.request<TechnicianServicePayload>(
      `/technicians/me/shops/${shopId}/services/${serviceId}/cover`,
      { body: optimized.file, headers: { "Content-Type": optimized.mimeType }, method: "PUT" }
    );
  },

  removeTechnicianServiceCover(shopId: number, serviceId: number) {
    return httpClient.request<TechnicianServicePayload>(
      `/technicians/me/shops/${shopId}/services/${serviceId}/cover`,
      { method: "DELETE" }
    );
  },

  listPublicTechnicianServices(shopId: number, technicianId: number, query: { page?: number; pageSize?: number } = {}) {
    return httpClient.request<PaginatedPricingData<TechnicianServicePayload>>(
      `/shops/${shopId}/technicians/${technicianId}/services`,
      {
        query
      }
    );
  },

  listPublicTechnicianProfileServices(technicianId: number, query: { page?: number; pageSize?: number } = {}) {
    return httpClient.request<PaginatedPricingData<TechnicianServicePayload>>(
      `/technicians/${technicianId}/services`,
      {
        query
      }
    );
  }
};
