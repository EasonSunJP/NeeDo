import { httpClient } from "../../api/httpClient";
export type WorkStatus =
  | "unsynced"
  | "on_duty"
  | "traveling"
  | "in_service"
  | "resting"
  | "off_duty";
export type WorkStatusTarget =
  | { scope: "technician" }
  | { scope: "backoffice" | "merchant-admin"; technicianProfileId: number };
export type WorkStatusSnapshot = {
  technicianProfileId: number;
  status: WorkStatus;
  version: number;
  syncedAt: string | null;
  currentShop: { id: number; publicId: string | null; name: string } | null;
  activeOrderId?: number | null;
  month: {
    lateCount: number;
    earlyLeaveCount: number;
    from: string;
    to: string;
  };
};
export type AffectedWorkOrder = {
  id: number;
  orderNo: string | null;
  serviceName: string | null;
  startsAt: string;
  endsAt: string;
};
export type WorkStatusEvent = {
  id: string;
  at: string;
  kind: "status" | "late" | "early_leave" | "comment" | "service" | "shop_switch";
  basis: "shift" | "booking" | null;
  actorName: string;
  actorAvatarUrl: string | null;
  fromStatus: WorkStatus | null;
  toStatus: WorkStatus | null;
  plannedAt: string | null;
  actualAt: string | null;
  delaySeconds: number | null;
  reason: string | null;
  affectedOrders?: AffectedWorkOrder[];
  order: {
    id: number;
    orderNo: string;
    serviceName: string;
    customerName: string | null;
  } | null;
};
export type WorkStatusPage = {
  list: WorkStatusEvent[];
  total: number;
  page: number;
  page_size: number;
};
export type WorkStatusQuery = {
  page: number;
  page_size: number;
  from?: string;
  to?: string;
  kind?: "late" | "early_leave";
  incidentsOnly?: boolean;
};
export type WorkStatusMutation = {
  status: Exclude<WorkStatus, "unsynced" | "in_service">;
  expectedVersion: number;
  idempotencyKey: string;
  reason?: string;
  confirmEarlyLeave?: boolean;
  orderId?: number;
  shopId?: number;
};
export type WorkStatusShopSwitch = {
  shopId: number;
  idempotencyKey: string;
};
export function workStatusBase(target: WorkStatusTarget) {
  return target.scope === "technician"
    ? "/technician-work-status/me"
    : `/${target.scope}/technicians/${target.technicianProfileId}/work-status`;
}
export const workStatusApi = {
  snapshot(target: WorkStatusTarget) {
    return httpClient.request<WorkStatusSnapshot>(workStatusBase(target));
  },
  update(body: WorkStatusMutation) {
    return httpClient.request<WorkStatusSnapshot>(
      "/technician-work-status/me",
      { method: "PATCH", body },
    );
  },
  switchCurrentShop(body: WorkStatusShopSwitch) {
    return httpClient.request<WorkStatusSnapshot>(
      "/technician-work-status/me/current-shop",
      { method: "PATCH", body },
    );
  },
  events(target: WorkStatusTarget, query: WorkStatusQuery) {
    return httpClient.request<WorkStatusPage>(
      `${workStatusBase(target)}/events`,
      { query },
    );
  },
  comment(
    target: WorkStatusTarget,
    body: { message: string; idempotencyKey: string },
  ) {
    return httpClient.request<WorkStatusEvent>(
      `${workStatusBase(target)}/comments`,
      { method: "POST", body },
    );
  },
};
