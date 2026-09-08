import type { WorkStatus } from "./api";
export type WorkStatusPeriod =
  | "today"
  | "last7days"
  | "last30days"
  | "week"
  | "month"
  | "year"
  | "custom";
const DAY = 86_400_000;
const TOKYO_OFFSET = 9 * 60 * 60 * 1000;
function dateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("invalid_date_range");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new Error("invalid_date_range");
  return date.getTime();
}
export function workStatusRange(
  period: WorkStatusPeriod,
  now: Date,
  customFrom = "",
  customTo = "",
) {
  const tokyo = new Date(now.getTime() + TOKYO_OFFSET);
  const today = Date.UTC(
    tokyo.getUTCFullYear(),
    tokyo.getUTCMonth(),
    tokyo.getUTCDate(),
  );
  let from = today,
    to = today + DAY;
  if (period === "custom") {
    from = dateOnly(customFrom);
    to = dateOnly(customTo) + DAY;
    if (to <= from) throw new Error("invalid_date_range");
  }
  if (period === "last7days") from -= 6 * DAY;
  if (period === "last30days") from -= 29 * DAY;
  if (period === "week") {
    from -= ((tokyo.getUTCDay() + 6) % 7) * DAY;
    to = from + 7 * DAY;
  }
  if (period === "month") {
    from = Date.UTC(tokyo.getUTCFullYear(), tokyo.getUTCMonth(), 1);
    to = Date.UTC(tokyo.getUTCFullYear(), tokyo.getUTCMonth() + 1, 1);
  }
  if (period === "year") {
    from = Date.UTC(tokyo.getUTCFullYear(), 0, 1);
    to = Date.UTC(tokyo.getUTCFullYear() + 1, 0, 1);
  }
  return {
    from: new Date(from - TOKYO_OFFSET).toISOString(),
    to: new Date(to - TOKYO_OFFSET).toISOString(),
  };
}
export function incidentDeviation(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return { minutes: Math.floor(total / 60), seconds: total % 60 };
}
export function mapWorkStatusToLegacy(
  status: WorkStatus | undefined,
): "available" | "busy" | "off" {
  return status === "on_duty"
    ? "available"
    : status === "in_service"
      ? "busy"
      : "off";
}
