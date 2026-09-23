import type { ExchangeServiceMode } from "./exchange.types";
import type { ContentLocaleCode } from "../constants/content-locales";

export interface TechnicianServiceBookingContextServiceCardPayload {
  targetType: "technician_service";
  publicId: string;
  name: string;
  description: string | null;
  localizedContent?: Partial<Record<ContentLocaleCode, { name?: string; description?: string }>>;
  coverUrl: string | null;
  imageUrls: string[];
  tags: string[];
  catalogPriceJpy: number;
  currency: "JPY";
  durationMinutes: number;
  serviceMode: ExchangeServiceMode;
  serviceAreas: string[];
  shopPublicId: string;
  shopAddress: string;
  detailPath: string;
}

export interface TechnicianServiceBookingContextShopCardPayload {
  type: "shop";
  id: number;
  publicId: string;
  name: string;
  coverUrl: string | null;
  imageUrls: string[];
  status: "published";
  isBookable: true;
  ratingAverage: string | null;
  reviewCount: number;
  address: string;
  serviceMode: ExchangeServiceMode;
  detailPath: string;
}

export interface TechnicianServiceBookingContextTechnicianCardPayload {
  type: "technician";
  publicId: string;
  displayName: string;
  avatarUrl: string | null;
  shop: { publicId: string; name: string };
  status: "published";
  isBookable: true;
  yearsExperience: number;
  completedOrderCount: number | null;
  acceptanceRatePercent: number | null;
  ratingAverage: string | null;
  reviewCount: number;
  serviceAreas: string[];
  languages: string[];
  detailPath: string;
  servicesPath: string;
}

export interface TechnicianServiceBookingContextPayload {
  target: { type: "technician_service"; id: number };
  serviceCard: TechnicianServiceBookingContextServiceCardPayload;
  shopCard: TechnicianServiceBookingContextShopCardPayload;
  technicianCard: TechnicianServiceBookingContextTechnicianCardPayload;
}
