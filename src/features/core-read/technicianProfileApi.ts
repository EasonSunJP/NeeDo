import { httpClient } from "../../api/httpClient";

export type TechnicianProfileVisibility = "public" | "privateAll" | "limited" | "network";
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
  age: number | null;
  heightCm: number | null;
  languages: string[];
  serviceAreas: string[];
  specialTags: string[];
  profileTags: string[];
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
  | "age"
  | "heightCm"
  | "languages"
  | "bio"
  | "serviceAreas"
  | "profileTags"
  | "canServeForeigners"
  | "bidBudgetMinJpy"
  | "bidBudgetMaxJpy"
  | "paymentMethods"
  | "serviceBase"
  | "visibility"
>> & { avatarDataUrl?: string };

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
