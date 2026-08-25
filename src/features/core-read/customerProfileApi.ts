import { httpClient } from "../../api/httpClient";
import type { CoreCustomerProfile } from "./api";

export type CustomerProfileVisibility = "public" | "privateAll" | "limited" | "network";

export type CustomerSelfProfile = CoreCustomerProfile & {
  userId: number;
  gender: "female" | "male" | "private";
  age: number | null;
  heightCm: number | null;
  languages: string[];
  visibility: CustomerProfileVisibility;
  isPublic: boolean;
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
  updateMine(input: CustomerSelfProfileUpdate) {
    return httpClient.request<CustomerSelfProfile>("/customer-profile/me", {
      body: input,
      method: "PATCH"
    });
  }
};
