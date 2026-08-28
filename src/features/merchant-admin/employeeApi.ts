import { httpClient } from "../../api/httpClient";

export type EmployeeRelationshipType = "exclusive" | "partner";
export type EmployeeCurrentWorkStatus = "active" | "on_leave" | "suspended";
export type EmployeeWorkStatus = EmployeeCurrentWorkStatus | "ended";

export interface MerchantEmployee {
  needoId: string;
  displayName: string;
  avatarUrl: string | null;
  email: string;
  phone: string | null;
  profileStatus: string;
  verifiedAt: string | null;
  profile: {
    bio: string | null;
    city: string;
    serviceArea: string | null;
    yearsExperience: number;
    updatedAt: string;
  };
  account: {
    isActive: boolean;
    lastLoginAt: string | null;
  };
  affiliation: {
    id: number;
    relationshipType: EmployeeRelationshipType;
    workStatus: EmployeeWorkStatus;
    startsAt: string;
    endsAt: string | null;
    shop: {
      id: number;
      publicId: string;
      name: string;
    };
  };
}

export interface MerchantEmployeeProfileUpdate {
  displayName?: string;
  bio?: string | null;
  city?: string;
  serviceArea?: string | null;
  yearsExperience?: number;
}

export interface MerchantEmployeeAffiliationUpdate {
  relationshipType: EmployeeRelationshipType;
  workStatus: EmployeeWorkStatus;
  startsAt: string;
  endsAt: string | null;
}

export interface MerchantEmployeeListQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  relationshipType?: EmployeeRelationshipType;
  workStatus?: EmployeeCurrentWorkStatus;
}

export interface PaginatedMerchantEmployees {
  list: MerchantEmployee[];
  total: number;
  page: number;
  page_size: number;
}

const employeePath = (needoId: string) =>
  `/merchant-admin/employees/${encodeURIComponent(needoId.trim())}`;

export const merchantEmployeeApi = {
  list(query: MerchantEmployeeListQuery = {}) {
    return httpClient.request<PaginatedMerchantEmployees>("/merchant-admin/employees", {
      query: {
        keyword: query.keyword,
        page: query.page ?? 1,
        page_size: query.pageSize ?? 20,
        relationship_type: query.relationshipType,
        work_status: query.workStatus
      }
    });
  },

  detail(needoId: string) {
    return httpClient.request<MerchantEmployee>(employeePath(needoId));
  },

  updateProfile(needoId: string, body: MerchantEmployeeProfileUpdate) {
    return httpClient.request<MerchantEmployee>(`${employeePath(needoId)}/profile`, {
      body,
      method: "PATCH"
    });
  },

  updateAffiliation(needoId: string, body: MerchantEmployeeAffiliationUpdate) {
    return httpClient.request<MerchantEmployee>(`${employeePath(needoId)}/affiliation`, {
      body,
      method: "PUT"
    });
  }
};
