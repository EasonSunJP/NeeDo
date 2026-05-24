import { orders } from "../data/mock";

const needoBookingTitlePrefix = "ND预约—";

export function formatNeedoBookingTitle(serviceName?: string | null) {
  const normalizedServiceName = serviceName?.trim();
  return normalizedServiceName ? `${needoBookingTitlePrefix}${normalizedServiceName}` : "ND预约";
}

export function getNeedoAppBookingTitle(orderId?: string | null, fallbackServiceName?: string | null) {
  if (!orderId) {
    return null;
  }

  const order = orders.find((item) => item.id === orderId);
  if (!order || order.source !== "app") {
    return null;
  }

  return formatNeedoBookingTitle(order.itemName || fallbackServiceName);
}
