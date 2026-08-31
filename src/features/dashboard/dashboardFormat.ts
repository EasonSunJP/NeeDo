import { languageLocales, type Language } from "../../i18n/translations";

export type DashboardValueUnit = "count" | "slots" | "people" | "jpy" | "ndp" | "hours" | "percent";
export type DashboardComparisonDirection = "positive" | "negative" | "zero" | "unavailable";

const unitLabels: Record<DashboardValueUnit, string> = {
  count: "个",
  slots: "个时段",
  people: "人",
  jpy: "JPY",
  ndp: "NDP",
  hours: "小时",
  percent: "%"
};

export function normalizeDashboardNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function formatDashboardNumber(value: number, language: Language, maximumFractionDigits = 2): string {
  const locale = languageLocales[language] ?? languageLocales.zh;

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits,
    minimumFractionDigits: 0
  }).format(normalizeDashboardNumber(value));
}

export function formatDashboardValue(
  value: number,
  unit: DashboardValueUnit,
  language: Language
): { number: string; unit: string } {
  const maximumFractionDigits = unit === "hours" ? 2 : unit === "percent" ? 1 : 0;

  return {
    number: formatDashboardNumber(value, language, maximumFractionDigits),
    unit: unitLabels[unit]
  };
}

export function formatDashboardChange(changeRatePercent: number | null): {
  direction: DashboardComparisonDirection;
  label: string;
} {
  if (changeRatePercent === null || !Number.isFinite(changeRatePercent)) {
    return { direction: "unavailable", label: "—" };
  }

  const normalized = Object.is(changeRatePercent, -0) ? 0 : changeRatePercent;
  const label = `${normalized > 0 ? "+" : ""}${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2
  }).format(normalized)}%`;

  return {
    direction: normalized > 0 ? "positive" : normalized < 0 ? "negative" : "zero",
    label
  };
}
