import type { OrderRebookDecision } from "../../types/domain";

export const stoppedServiceRebookNotice = "原服务已停止，请重新选择服务";

export type RebookAction = {
  enabled: boolean;
  label: "再次预约" | "重新选择服务";
  notice?: string;
  path?: string;
};

export function getRebookAction(decision: OrderRebookDecision | undefined): RebookAction {
  if (!decision || decision.action === "unavailable") {
    return {
      enabled: false,
      label: "再次预约",
      notice: stoppedServiceRebookNotice
    };
  }

  if (decision.action === "select_service") {
    return {
      enabled: true,
      label: "重新选择服务",
      notice: stoppedServiceRebookNotice,
      path: `/stores/${decision.shopId}`
    };
  }

  if (decision.serviceType === "technician_service") {
    if (!decision.technicianProfileId) {
      return { enabled: false, label: "再次预约", notice: stoppedServiceRebookNotice };
    }
    const params = new URLSearchParams({
      shop: String(decision.shopId),
      technician: String(decision.technicianProfileId)
    });
    if (decision.fulfillmentMode === "home") params.set("mode", "home");
    return {
      enabled: true,
      label: "再次预约",
      path: `/checkout/technician-service-${decision.serviceId}?${params.toString()}`
    };
  }

  const params = new URLSearchParams({ store: String(decision.shopId) });
  if (decision.fulfillmentMode === "home") params.set("mode", "home");
  if (decision.technicianProfileId) params.set("technician", String(decision.technicianProfileId));
  return {
    enabled: true,
    label: "再次预约",
    path: `/checkout/${decision.serviceId}?${params.toString()}`
  };
}
