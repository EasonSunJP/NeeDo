import type { Order } from "../../types/domain";

type RebookOrder = Pick<Order, "mode" | "serviceId" | "shopId" | "technicianProfileId" | "technicianServiceId">;

export function getRebookPath(order: RebookOrder) {
  if (order.technicianServiceId) {
    if (!order.shopId || !order.technicianProfileId) return null;
    const params = new URLSearchParams({
      shop: order.shopId,
      technician: order.technicianProfileId
    });
    if (order.mode === "home") params.set("mode", "home");
    return `/checkout/technician-service-${order.technicianServiceId}?${params.toString()}`;
  }

  if (!order.serviceId) return null;
  const params = new URLSearchParams();
  if (order.shopId) params.set("store", order.shopId);
  if (order.mode === "home") params.set("mode", "home");
  if (order.technicianProfileId) params.set("technician", order.technicianProfileId);
  const query = params.toString();
  return `/checkout/${order.serviceId}${query ? `?${query}` : ""}`;
}
