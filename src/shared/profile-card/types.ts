import type { BaseInfoCardData, ShopInfoCardData, TechnicianInfoCardData, UserInfoCardData } from "../info-card";

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
  shopId: number;
  name: string;
  priceAmount: number;
  currency: string;
  durationMinutes: number;
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
  metrics: TechnicianFormalMetrics;
  contactDetails?: TechnicianFormalContactDetails;
};
