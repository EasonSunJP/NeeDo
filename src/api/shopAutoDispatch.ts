import { httpClient } from "./httpClient";

export type AutoDispatchStrategy = "balanced" | "longest_idle" | "highest_rating" | "preferred";

export interface ShopAutoDispatchTechnician {
  id: number;
  displayName: string;
}

export interface ShopAutoDispatchRule {
  id: number | null;
  shopId: number;
  enabled: boolean;
  startsOn: string | null;
  endsOn: string | null;
  startMinute: number;
  endMinute: number;
  allowStore: boolean;
  allowHome: boolean;
  minimumRating: number | null;
  minimumAcceptanceRate: number | null;
  maximumCancellationRate: number | null;
  dailyTechnicianLimit: number | null;
  strategy: AutoDispatchStrategy;
  preferredTechnicianIds: number[];
  travelMinutesPerKm: number;
  strictWindow: boolean;
  candidates: ShopAutoDispatchTechnician[];
  createdAt: string | null;
  updatedAt: string | null;
}

export type ShopAutoDispatchRuleInput = Omit<ShopAutoDispatchRule, "id" | "shopId" | "candidates" | "createdAt" | "updatedAt">;

export const shopAutoDispatchApi = {
  read() {
    return httpClient.request<ShopAutoDispatchRule>("/merchant-admin/auto-dispatch-rule");
  },
  update(input: ShopAutoDispatchRuleInput) {
    return httpClient.request<ShopAutoDispatchRule>("/merchant-admin/auto-dispatch-rule", {
      method: "PUT",
      body: input
    });
  }
};
