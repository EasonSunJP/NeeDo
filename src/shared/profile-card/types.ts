import type { BaseInfoCardData, ShopInfoCardData, TechnicianInfoCardData, UserInfoCardData } from "../info-card";
import type { TechnicianReviewTagSummary } from "../../features/core-read/api";

export type BaseProfileCardData = BaseInfoCardData;
export type UserProfileData = UserInfoCardData;
export type ShopProfileData = ShopInfoCardData;
export type TechnicianProfileData = TechnicianInfoCardData;

export type TechnicianFormalMetrics = {
  completedOrderCount: number;
  ratingAverage: string;
  reviewCount: number;
  acceptanceRateBps: number;
};

export type TechnicianFormalContactService = {
  id: number;
  publicId?: string;
  shopId: number | null;
  shopPublicId?: string | null;
  shopAddress?: string | null;
  name: string;
  description?: string | null;
  priceAmount: number;
  currency: string;
  durationMinutes: number;
  usageCount?: number | null;
  coverImageUrl?: string | null;
  tags?: string[];
  taxIncluded: true;
  sortOrder: number;
};

export type TechnicianFormalContactDetails = {
  bidBudgetMinJpy: number | null;
  bidBudgetMaxJpy: number | null;
  paymentMethods: string[];
  specialTags: string[];
  profileTags: string[];
  services: TechnicianFormalContactService[];
};

export type TechnicianFormalContactCardData = {
  gender?: "female" | "male" | "private";
  yearsExperience?: number;
  metrics: TechnicianFormalMetrics;
  reviewTagSummary?: TechnicianReviewTagSummary;
  contactDetails?: TechnicianFormalContactDetails;
};

export type ExchangeIntelligenceShopPublisherProfileProjection = {
  type: "shop";
  publicId: string;
  name: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  imageUrls: string[];
  status: string;
  isBookable: boolean;
  ratingAverage: string | null;
  reviewCount: number;
  address: string;
  serviceMode: "store" | "onsite" | "flexible";
  detailPath: string;
};

export type ExchangeIntelligenceTechnicianPublisherProfileProjection = {
  type: "technician";
  publicId: string;
  displayName: string;
  avatarUrl: string | null;
  shop: { publicId: string; name: string };
  status: string;
  isBookable: boolean;
  yearsExperience: number;
  completedOrderCount: number | null;
  acceptanceRatePercent: number | null;
  ratingAverage: string | null;
  reviewCount: number;
  serviceAreas: string[];
  languages: string[];
  detailPath: string;
  servicesPath: string;
};

export type ExchangeIntelligencePublisherProfileProjection =
  | ExchangeIntelligenceShopPublisherProfileProjection
  | ExchangeIntelligenceTechnicianPublisherProfileProjection;
