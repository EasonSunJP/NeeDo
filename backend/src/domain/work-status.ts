import { AppError } from "../utils/app-error";
import type { AuthenticatedAccessContext } from "../services/auth.service";
import { requireMerchantShopId } from "../services/merchant-shop-scope";
export type WorkStatus =
  | "unsynced"
  | "on_duty"
  | "traveling"
  | "in_service"
  | "resting"
  | "off_duty";
export type WorkStatusPortal = "technician" | "merchant" | "operations";
export interface WorkScope {
  technicianProfileId: number;
  shopId?: number;
  userId?: number;
}
export const workError = (
  reason: string,
  statusCode = 409,
  details: Record<string, unknown> = {}
) =>
  new AppError({
    code: statusCode * 100 + 1,
    statusCode,
    message: `error.work_status.${reason}`,
    data: { reason, ...details }
  });
export function workStatusScope(
  actor: AuthenticatedAccessContext,
  portal: WorkStatusPortal,
  id?: number
): WorkScope {
  if (!actor.currentIdentityId) throw workError("identity_forbidden", 403);
  if (portal === "technician") {
    if (
      actor.currentIdentityType !== "technician" ||
      actor.currentIdentityScopeType !== "technician_profile" ||
      !actor.currentIdentityScopeId
    )
      throw workError("identity_forbidden", 403);
    return { technicianProfileId: actor.currentIdentityScopeId, userId: actor.userId };
  }
  if (!id || !Number.isSafeInteger(id)) throw workError("invalid_id", 400);
  if (portal === "merchant")
    return { technicianProfileId: id, shopId: requireMerchantShopId(actor) };
  if (
    !["platform", "platform_admin"].includes(actor.currentIdentityType ?? "") ||
    !["global", "platform"].includes(actor.currentIdentityScopeType ?? "")
  )
    throw workError("identity_forbidden", 403);
  return { technicianProfileId: id };
}
export const attendanceDelay = (planned: Date, actual: Date): number | null =>
  actual.getTime() > planned.getTime() ? (actual.getTime() - planned.getTime()) / 1000 : null;
export function monthRangeJst(now: Date) {
  const shifted = new Date(now.getTime() + 9 * 3600000);
  return {
    from: new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - 9 * 3600000),
    to: new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1) - 9 * 3600000)
  };
}
export function stateAtBoundary(
  events: { at: Date; status: WorkStatus }[],
  boundary: Date
): WorkStatus {
  return (
    events.filter((e) => e.at <= boundary).sort((a, b) => b.at.getTime() - a.at.getTime())[0]
      ?.status ?? "unsynced"
  );
}
export interface WorkStatusSnapshot {
  activeOrderId: number | null;
  technicianProfileId: number;
  status: WorkStatus;
  version: number;
  syncedAt: string | null;
  currentShop: { id: number; publicId: string | null; name: string } | null;
  month: { lateCount: number; earlyLeaveCount: number; from: string; to: string };
}
export interface WorkStatusAffectedOrder {
  id: number;
  orderNo: string;
  serviceName: string | null;
  startsAt: string;
  endsAt: string;
}
export interface WorkStatusEvent {
  affectedOrders: WorkStatusAffectedOrder[];
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
  order: { id: number; orderNo: string; serviceName: string; customerName: string | null } | null;
}
