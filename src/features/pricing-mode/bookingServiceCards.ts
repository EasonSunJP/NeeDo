import type { StoreMenuConfig } from "../../types/domain";
import type { BookingNavigationService } from "./api";

function formatBookingServicePrice(amount: string, currency: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency}`.trim();
  if (currency === "JPY") return `¥${Math.round(value).toLocaleString("ja-JP")}`;
  return new Intl.NumberFormat("ja-JP", { currency, style: "currency" }).format(value);
}

export function mapBookingNavigationServiceToMenuCard(
  service: BookingNavigationService,
  fallbackCover: string
): StoreMenuConfig {
  return {
    id: `api-booking-service-${service.id}`,
    sourceServiceId: String(service.id),
    name: service.name,
    subtitle: service.description?.trim() ?? "",
    duration: `${service.durationMinutes} 分钟`,
    priceLabel: formatBookingServicePrice(service.priceAmount, service.currency),
    audience: `已使用 ${service.usageCount} 次`,
    tags: service.tags.slice(0, 4),
    cover: service.coverUrl || fallbackCover,
    highlights: []
  };
}
