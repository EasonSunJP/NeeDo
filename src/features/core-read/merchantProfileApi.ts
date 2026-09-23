import { httpClient } from "../../api/httpClient";
import type { ContentLocale } from "../../shared/localized-content/localizedText";

export type MerchantProfileGender = "female" | "male" | "private";
export type MerchantProfileVisibility = "public" | "privateAll" | "limited" | "network";

export type MerchantIdentityProfile = {
  id: number;
  publicId: string;
  userId: number;
  identityId: number;
  displayName: string;
  avatarUrl: string | null;
  gender: MerchantProfileGender;
  age: number | null;
  heightCm: number | null;
  languages: string[];
  bio: string | null;
  bioLocales?: Partial<Record<ContentLocale, string>>;
  visibility: MerchantProfileVisibility;
  createdAt: string;
  updatedAt: string;
};

export type MerchantIdentityProfileUpdate = Partial<Pick<
  MerchantIdentityProfile,
  "displayName" | "gender" | "age" | "heightCm" | "languages" | "bio" | "visibility"
>> & { avatarDataUrl?: string; localizedBio?: { locale: ContentLocale; bio: string; syncAll?: boolean } };

export const merchantProfileApi = {
  getMine() {
    return httpClient.request<MerchantIdentityProfile>("/merchant-profile/me");
  },
  updateMine(body: MerchantIdentityProfileUpdate) {
    return httpClient.request<MerchantIdentityProfile>("/merchant-profile/me", {
      method: "PATCH",
      body
    });
  }
};
