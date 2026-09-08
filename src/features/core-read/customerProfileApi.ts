import { httpClient } from "../../api/httpClient";
import { getAuthenticatedPersistentCacheScope } from "../../lib/persistentCacheScope";
import { persistentResourceCache } from "../../lib/persistentResourceCache";
export type CustomerProfileVisibility = "public" | "privateAll" | "limited" | "network";

export type CustomerSelfProfile = {
  id: number;
  publicId: string;
  userId: number;
  displayName: string;
  city: string | null;
  bio: string | null;
  avatarUrl: string | null;
  membershipLevel: string;
  level: number;
  gender: "female" | "male" | "private";
  age: number | null;
  heightCm: number | null;
  languages: string[];
  visibility: CustomerProfileVisibility;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomerSelfProfileUpdate = {
  displayName?: string;
  avatarDataUrl?: string;
  gender?: "female" | "male" | "private";
  age?: number | null;
  heightCm?: number | null;
  languages?: string[];
  bio?: string | null;
  visibility?: CustomerProfileVisibility;
};

export const customerProfileApi = {
  getMine() {
    return httpClient.request<CustomerSelfProfile>("/customer-profile/me");
  },
  async updateMine(input: CustomerSelfProfileUpdate) {
    const profile = await httpClient.request<CustomerSelfProfile>("/customer-profile/me", {
      body: input,
      method: "PATCH"
    });
    const scope = getAuthenticatedPersistentCacheScope();
    if (scope) await persistentResourceCache.write(scope, "customer:self", profile);
    return profile;
  }
};
