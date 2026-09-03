import { httpClient } from "../../api/httpClient";
import type { TechnicianReviewTagSummary } from "./api";

export type TechnicianProfileVisibility = "public" | "privateAll" | "limited" | "network";
export type TechnicianProfileGender = "female" | "male" | "private";
export type TechnicianProfilePaymentMethod =
  | "platform"
  | "offline"
  | "prepay"
  | "cash"
  | "paypay"
  | "paypal"
  | "wechatpay"
  | "alipay";

export type TechnicianSelfProfile = {
  id: number;
  publicId: string;
  userId: number;
  shopId: number | null;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  city: string;
  gender: TechnicianProfileGender;
  age: number | null;
  heightCm: number | null;
  languages: string[];
  serviceAreas: string[];
  specialTags: string[];
  profileTags: string[];
  reviewTagSummary: TechnicianReviewTagSummary;
  canServeForeigners: boolean;
  bidBudgetMinJpy: number | null;
  bidBudgetMaxJpy: number | null;
  paymentMethods: TechnicianProfilePaymentMethod[];
  serviceBase: { latitude: number; longitude: number } | null;
  visibility: TechnicianProfileVisibility;
  employmentType: "independent" | "full_time" | "temporary";
  yearsExperience: number;
  createdAt: string;
  updatedAt: string;
};

export type TechnicianSelfProfileUpdate = Partial<Pick<
  TechnicianSelfProfile,
  | "displayName"
  | "gender"
  | "age"
  | "heightCm"
  | "languages"
  | "bio"
  | "serviceAreas"
  | "canServeForeigners"
  | "bidBudgetMinJpy"
  | "bidBudgetMaxJpy"
  | "paymentMethods"
  | "serviceBase"
  | "visibility"
>> & { avatarDataUrl?: string };

export type TechnicianPersonalCenterUpdate = Pick<
  TechnicianSelfProfile,
  "gender" | "age" | "heightCm" | "languages" | "bio" | "visibility"
>;

export const technicianProfileApi = {
  getMine() {
    return httpClient.request<TechnicianSelfProfile>("/technician-profile/me");
  },
  updateMine(input: TechnicianSelfProfileUpdate) {
    return httpClient.request<TechnicianSelfProfile>("/technician-profile/me", {
      method: "PATCH",
      body: input
    });
  }
};
