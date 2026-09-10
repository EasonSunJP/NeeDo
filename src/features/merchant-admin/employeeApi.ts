import type { WorkStatus } from "../technician-work-status/api";
import { httpClient } from "../../api/httpClient";

export type EmployeeRelationshipType = "partner";
export type EmployeeCurrentWorkStatus = "active" | "on_leave" | "suspended";
export type EmployeeWorkStatus = EmployeeCurrentWorkStatus | "ended";

export interface MerchantEmployee {
  technicianProfileId?: number;
  workStatus?: WorkStatus;
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

export type EmployeeTimelineTone = "accent" | "green" | "red" | "neutral";

export interface EmployeeTimelineEvent {
  id: string;
  at: string;
  actorName: string;
  actorAvatarUrl: string | null;
  actorRole: string;
  message: string;
  tone: EmployeeTimelineTone;
}

export interface PaginatedEmployeeTimeline {
  list: EmployeeTimelineEvent[];
  total: number;
  page: number;
  page_size: number;
}

export type EmployeeScheduleView = "day" | "week" | "month";

interface EmployeeScheduleEventBase {
  projectionId: string;
  startsAt: string;
  endsAt: string;
  title: string;
  isClickable: boolean;
  isEditable: boolean;
}

export interface EmployeeScheduleVisibleEvent extends EmployeeScheduleEventBase {
  kind: "availability" | "schedule" | "booking";
  visibility: "current_shop" | "affiliated_shops";
  status:
    | "available"
    | "scheduled"
    | "pending"
    | "confirmed"
    | "in_service"
    | "completed"
    | "blocked";
  detail?: string;
  orderId?: number;
}

export interface EmployeeScheduleRedactedEvent extends EmployeeScheduleEventBase {
  kind: "busy_redacted";
  visibility: "busy_redacted";
  status: "busy";
  title: "其他店铺已有确认安排";
  isClickable: false;
  isEditable: false;
}

export type EmployeeScheduleEvent =
  | EmployeeScheduleVisibleEvent
  | EmployeeScheduleRedactedEvent;

export interface EmployeeScheduleProjection {
  employee: Pick<MerchantEmployee, "needoId" | "displayName" | "avatarUrl"> & {
    relationshipType: EmployeeRelationshipType;
    workStatus: EmployeeWorkStatus;
  };
  range: {
    from: string;
    to: string;
    view: EmployeeScheduleView;
  };
  events: EmployeeScheduleEvent[];
}

export interface EmployeeScheduleQuery {
  from: string;
  to: string;
  view: EmployeeScheduleView;
}

const employeePath = (needoId: string) =>
  `/merchant-admin/employees/${encodeURIComponent(needoId.trim())}`;

export const merchantEmployeeApi = {
  list(query: MerchantEmployeeListQuery = {}) {
    return httpClient.request<PaginatedMerchantEmployees>(
      "/merchant-admin/employees",
      {
        query: {
          keyword: query.keyword,
          page: query.page ?? 1,
          pageSize: query.pageSize ?? 20,
          relationshipType: query.relationshipType,
          workStatus: query.workStatus,
        },
      },
    );
  },

  detail(needoId: string) {
    return httpClient.request<MerchantEmployee>(employeePath(needoId));
  },

  schedule(needoId: string, query: EmployeeScheduleQuery) {
    return httpClient.request<EmployeeScheduleProjection>(
      `${employeePath(needoId)}/schedule`,
      {
        query: {
          from: query.from,
          to: query.to,
          view: query.view,
        },
      },
    );
  },

  timeline(needoId: string, page = 1, pageSize = 10) {
    return httpClient.request<PaginatedEmployeeTimeline>(
      `${employeePath(needoId)}/timeline`,
      { query: { page, pageSize } },
    );
  },

  addTimelineComment(needoId: string, message: string) {
    return httpClient.request<{ created: true }>(
      `${employeePath(needoId)}/timeline/comments`,
      {
        body: { message: message.trim() },
        method: "POST",
      },
    );
  },

  updateProfile(needoId: string, body: MerchantEmployeeProfileUpdate) {
    return httpClient.request<MerchantEmployee>(
      `${employeePath(needoId)}/profile`,
      {
        body,
        method: "PATCH",
      },
    );
  },

  updateAffiliation(needoId: string, body: MerchantEmployeeAffiliationUpdate) {
    return httpClient.request<MerchantEmployee>(
      `${employeePath(needoId)}/affiliation`,
      {
        body,
        method: "PUT",
      },
    );
  },
};
