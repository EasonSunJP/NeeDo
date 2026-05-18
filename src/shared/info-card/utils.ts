import { yen } from "../../lib/utils";
import type { InfoCardBadge, InfoCardData, InfoCardMetric, InfoCardTone } from "./types";

export function getInfoCardToneClasses(dark: boolean, tone: InfoCardTone = "neutral") {
  const tones: Record<InfoCardTone, { light: string; dark: string }> = {
    success: {
      light: "bg-mint/16 text-[#2f6846]",
      dark: "bg-[#14301f] text-[#8de0af]"
    },
    warning: {
      light: "bg-lemon/22 text-[#7a5b00]",
      dark: "bg-[#34280f] text-[#f3cf78]"
    },
    neutral: {
      light: "bg-black/5 text-ink/72",
      dark: "bg-white/10 text-white/76"
    },
    accent: {
      light: "bg-moss/10 text-moss",
      dark: "bg-[#1d2e26] text-[#90d3b4]"
    }
  };

  return dark ? tones[tone].dark : tones[tone].light;
}

export function formatInfoCardRating(rating?: number, reviewCount?: number) {
  if (typeof rating !== "number") {
    return "暂无评分";
  }

  const ratingText = rating >= 10 ? rating.toFixed(0) : rating.toFixed(1);

  if (typeof reviewCount !== "number" || reviewCount <= 0) {
    return `★ ${ratingText}`;
  }

  return `★ ${ratingText} · ${reviewCount} 条评价`;
}

export function formatInfoCardCompactRating(metric?: InfoCardMetric) {
  if (!metric) {
    return null;
  }

  return {
    label: metric.label,
    value: metric.value
  };
}

export function getInfoCardPrimaryImage(data: InfoCardData) {
  return data.coverImage || data.avatar || "";
}

export function getInfoCardAvatarImage(data: InfoCardData) {
  return data.avatar || data.coverImage || "";
}

export function getInfoCardFallbackLabel(data: InfoCardData) {
  if (data.entityType === "shop") {
    return "店铺";
  }

  if (data.entityType === "technician") {
    return "技师";
  }

  return "用户";
}

export function getInfoCardPreviewTags(data: InfoCardData, limit: number) {
  return data.tags.slice(0, limit);
}

export function getInfoCardMetaLines(data: InfoCardData) {
  return data.metaLines?.filter(Boolean) ?? [];
}

export function getInfoCardMetricList(data: InfoCardData) {
  const metrics = data.metricList?.filter((item) => item.value.trim().length > 0) ?? [];

  if (metrics.length > 0) {
    return metrics;
  }

  const fallbackMetrics: InfoCardMetric[] = [];

  if (typeof data.rating === "number") {
    fallbackMetrics.push({
      label: data.ratingType ?? "评分",
      tone: "accent",
      value: data.rating.toFixed(1)
    });
  }

  if (typeof data.reviewCount === "number" && data.reviewCount > 0) {
    fallbackMetrics.push({
      label: "评价",
      tone: "neutral",
      value: `${data.reviewCount}`
    });
  }

  if (data.priceLabel) {
    fallbackMetrics.push({
      label: "价格",
      tone: "warning",
      value: data.priceLabel
    });
  }

  return fallbackMetrics;
}

export function getInfoCardSummaryText(data: InfoCardData) {
  if (data.description) {
    return data.description;
  }

  return data.entityType === "shop" ? data.addressSummary || data.region || "" : data.serviceArea || data.region || "";
}

export function formatTechnicianBudget(min?: string, max?: string) {
  if (min && max) {
    return `${min} - ${max}`;
  }

  return min || max || "";
}

export function formatPaymentMethods(paymentMethods?: string[]) {
  return paymentMethods?.filter(Boolean).join(" / ") ?? "";
}

export function buildInfoCardBadge(label: string, tone: InfoCardTone = "neutral"): InfoCardBadge {
  return { label, tone };
}

export function formatStoreStatus(openStatus: "open" | "resting" | "closed") {
  if (openStatus === "open") {
    return { label: "营业中", tone: "success" as const };
  }

  if (openStatus === "resting") {
    return { label: "可预约", tone: "warning" as const };
  }

  return { label: "暂未营业", tone: "neutral" as const };
}

export function formatTechnicianStatus(status: "available" | "busy" | "off") {
  if (status === "available") {
    return { label: "可预约", tone: "success" as const, nextAvailability: "今日可预约" };
  }

  if (status === "busy") {
    return { label: "服务中", tone: "warning" as const, nextAvailability: "可候补排队" };
  }

  return { label: "休息中", tone: "neutral" as const, nextAvailability: "今日休息" };
}

export function formatTechnicianPriceLabel(min?: string, max?: string) {
  const range = formatTechnicianBudget(min, max);

  if (range) {
    return range;
  }

  return "";
}

export function formatStorePriceSummary(priceLabel?: string, averagePrice?: string, startPrice?: string) {
  return averagePrice || startPrice || priceLabel || "";
}

export function formatMetricValue(label: string, value?: string | number) {
  if (typeof value === "number") {
    if (label === "价格") {
      return yen(value);
    }

    return `${value}`;
  }

  return value ?? "";
}
