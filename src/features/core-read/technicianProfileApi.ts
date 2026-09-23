import { httpClient } from "../../api/httpClient";
import { getAuthenticatedPersistentCacheScope } from "../../lib/persistentCacheScope";
import { persistentResourceCache } from "../../lib/persistentResourceCache";
import type { TechnicianReviewTagSummary } from "./api";
import type { ContentLocale } from "../../shared/localized-content/localizedText";

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
  shopAccessStatus: "active" | "requires_shop";
  shopAffiliations: Array<{
    id: number;
    shopId: number;
    publicId: string | null;
    name: string;
    city: string;
    address: string;
    relationshipType: "partner";
    workStatus: "active" | "on_leave" | "suspended";
    startsAt: string;
  }>;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  bioLocales?: Partial<Record<ContentLocale, string>>;
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
>> & { avatarDataUrl?: string; localizedBio?: { locale: ContentLocale; bio: string } };

export type TechnicianPersonalCenterUpdate = Pick<
  TechnicianSelfProfile,
  "gender" | "age" | "heightCm" | "languages" | "bio" | "visibility"
> & { avatarDataUrl?: string };

export const technicianProfileApi = {
  getMine() {
    return httpClient.request<TechnicianSelfProfile>("/technician-profile/me");
  },
  async updateMine(input: TechnicianSelfProfileUpdate) {
    const profile = await httpClient.request<TechnicianSelfProfile>("/technician-profile/me", {
      method: "PATCH",
      body: input
    });
    const scope = getAuthenticatedPersistentCacheScope();
    if (scope) await persistentResourceCache.write(scope, "technician:self", profile);
    await persistentResourceCache.invalidate("public", `core:technician:${profile.id}`).catch(() => undefined);
    await persistentResourceCache.invalidate("public", `core:technician:${profile.publicId}`).catch(() => undefined);
    return profile;
  }
};
