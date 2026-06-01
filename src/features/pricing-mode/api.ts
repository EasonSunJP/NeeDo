import { httpClient } from "../../api/httpClient";

export type ShopPricingMode = "merchant" | "technician";

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
  shopId: number;
  technicianId: number;
  sourceShopServiceId: number | null;
  name: string;
  description: string | null;
  categoryId: number;
  priceAmount: number;
  currency: string;
  durationMinutes: number;
  coverImageUrl: string | null;
  images: string[];
  tags: string[];
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
      auth: false,
      query
    });
  },

  listTechnicianServices(shopId: number, query: { page?: number; pageSize?: number; activeOnly?: boolean } = {}) {
    return httpClient.request<PaginatedPricingData<TechnicianServicePayload>>(
      `/technicians/me/shops/${shopId}/services`,
      { query }
    );
  },

  createTechnicianService(shopId: number, body: TechnicianServiceBody) {
    return httpClient.request<TechnicianServicePayload>(`/technicians/me/shops/${shopId}/services`, {
      body,
      method: "POST"
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

  listPublicTechnicianServices(shopId: number, technicianId: number, query: { page?: number; pageSize?: number } = {}) {
    return httpClient.request<PaginatedPricingData<TechnicianServicePayload>>(
      `/shops/${shopId}/technicians/${technicianId}/services`,
      {
        auth: false,
        query
      }
    );
  }
};
