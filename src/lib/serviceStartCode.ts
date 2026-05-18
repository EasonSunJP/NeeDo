import type { OrderStatus } from "../types/domain";

export function getServiceStartCode(orderId: string) {
  if (orderId === "ord-1") {
    return "079";
  }

  const seed = orderId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return String((seed % 900) + 100).padStart(3, "0");
}

export function canShowServiceStartCode(status: OrderStatus) {
  return !["completed", "cancelled", "refunded"].includes(status);
}
