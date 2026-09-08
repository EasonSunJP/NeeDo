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
