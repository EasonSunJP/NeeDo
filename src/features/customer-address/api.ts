import { httpClient } from "../../api/httpClient";
import type { JapaneseRouteAddress } from "../../api/travelFare";

export type CustomerAddress = Omit<JapaneseRouteAddress, "addressLine2" | "building"> & {
  id: number;
  publicId: string;
  label: string;
  admin1Code: string;
  admin2Code: string;
  addressLine2: string | null;
  building: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomerAddressPage = {
  list: CustomerAddress[];
  total: number;
  page: number;
  page_size: number;
};

export type CustomerAddressCreateInput = Omit<CustomerAddress, "id" | "publicId" | "createdAt" | "updatedAt" | "addressLine2" | "building" | "isDefault"> & {
  addressLine2?: string;
  building?: string;
  isDefault?: boolean;
};

export type CustomerAddressUpdateInput = Partial<Omit<CustomerAddressCreateInput, "isDefault">> & {
  addressLine2?: string | null;
  building?: string | null;
  isDefault?: true;
};

export const customerAddressApi = {
  list(query: { page?: number; pageSize?: number } = {}) {
    return httpClient.request<CustomerAddressPage>("/customer-profile/me/addresses", {
      query: { page: query.page ?? 1, pageSize: query.pageSize ?? 20 }
    });
  },
  create(input: CustomerAddressCreateInput) {
    return httpClient.request<CustomerAddress>("/customer-profile/me/addresses", { method: "POST", body: input });
  },
  update(publicId: string, input: CustomerAddressUpdateInput) {
    return httpClient.request<CustomerAddress>(`/customer-profile/me/addresses/${encodeURIComponent(publicId)}`, { method: "PATCH", body: input });
  },
  remove(publicId: string) {
    return httpClient.request<{ deleted: true }>(`/customer-profile/me/addresses/${encodeURIComponent(publicId)}`, { method: "DELETE" });
  }
};
