import { httpClient } from "../../api/httpClient";

export type TechnicianAutomationKind = "booking" | "request";
export type TechnicianAutomationTimeWindow = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export type TechnicianAutomationRules = {
  timeWindows: TechnicianAutomationTimeWindow[];
  minLeadMinutes: number;
  bufferMinutes: 0 | 15 | 30 | 60;
  areaCodes: string[];
  maxDistanceKm: number | null;
  minOrderAmountJpy: number | null;
  minNetAmountJpy: number | null;
  minCustomerRating: number | null;
  acceptNewCustomers: boolean;
  minCompletedOrders: 0 | 1 | 3 | 5 | 10;
  requireEkyc: boolean;
  maxCancellationRatePercent: number | null;
  source: {
    mode: "any" | "existing_contacts" | "specific_contacts" | "existing_contact_referrals" | "specific_contact_referrals";
    contactIdentityIds: number[];
  };
  customerType: "all" | "returning" | "new";
  partyTypes: Array<"single" | "multiple">;
  serviceModes: Array<"store" | "home">;
  paymentMethods: Array<"onsite" | "card" | "ndp" | "bank_transfer" | "other">;
  serviceIds: number[];
  minimumPrepaymentPercent: number;
  onlyOnline: boolean;
  requestStartWindow: "immediate" | "within_1_hour" | "within_3_hours" | "today" | "any";
  requireMatchingTags: boolean;
};

export type TechnicianAutomationSetting = {
  kind: TechnicianAutomationKind;
  enabled: boolean;
  entitled: boolean;
  testBadgeEnabled: boolean;
  rules: TechnicianAutomationRules;
  version: number;
  updatedAt: string | null;
};

export type TechnicianAutomationContactPage = {
  list: Array<{ identityId: number; publicId: string; displayName: string; avatarUrl: string | null }>;
  total: number;
  page: number;
  page_size: number;
};

export const automationApi = {
  getSetting(kind: TechnicianAutomationKind) {
    return httpClient.request<TechnicianAutomationSetting>(`/technician/automation-settings/${kind}`);
  },
  updateSetting(
    kind: TechnicianAutomationKind,
    input: { enabled: boolean; expectedVersion: number; rules: TechnicianAutomationRules }
  ) {
    return httpClient.request<TechnicianAutomationSetting>(`/technician/automation-settings/${kind}`, {
      body: input,
      method: "PUT"
    });
  },
  listContacts(search = "") {
    return httpClient.request<TechnicianAutomationContactPage>("/technician/automation-settings/contacts", {
      query: { page: 1, page_size: 100, ...(search.trim() ? { search: search.trim() } : {}) }
    });
  }
};
