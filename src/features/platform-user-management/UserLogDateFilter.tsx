import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
export type UserLogRange = { audit_from?: string; audit_to?: string };
const periods = ["all", "last7days", "thisWeek", "last30days", "thisMonth", "thisYear", "custom"] as const;
type Period = typeof periods[number];
const labels: Record<Language, string[]> = {
  zh: ["全部", "近7天", "本周", "近30天", "本月", "今年", "自定义日期", "开始日期", "结束日期", "查询"],
  "zh-Hant": ["全部", "近7天", "本週", "近30天", "本月", "今年", "自訂日期", "開始日期", "結束日期", "查詢"],
  ja: ["すべて", "直近7日", "今週", "直近30日", "今月", "今年", "日付指定", "開始日", "終了日", "検索"],
  en: ["All", "Last 7 days", "This week", "Last 30 days", "This month", "This year", "Custom dates", "From", "To", "Search"],
  ko: ["전체", "최근 7일", "이번 주", "최근 30일", "이번 달", "올해", "날짜 지정", "시작일", "종료일", "검색"]
};
export function resolveUserLogRange(period: Period, now: Date, from = "", to = ""): UserLogRange {
  if (period === "all") return {};
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  if (period === "last7days" || period === "last30days") start.setDate(start.getDate() - (period === "last7days" ? 6 : 29));
  if (period === "thisWeek") start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  if (period === "thisMonth") start.setDate(1);
  if (period === "thisYear") { start.setMonth(0, 1); }
  if (period === "custom") {
    const customStart = new Date(`${from}T00:00:00`); const customEnd = new Date(`${to}T00:00:00`); customEnd.setDate(customEnd.getDate() + 1);
    return { audit_from: customStart.toISOString(), audit_to: customEnd.toISOString() };
  }
  return { audit_from: start.toISOString(), audit_to: end.toISOString() };
}
export function UserLogDateFilter({ disabled, onChange }: { disabled: boolean; onChange: (range: UserLogRange) => void }) {
  const { language } = useOptionalI18n(); const copy = labels[language];
  const [period, setPeriod] = useState<Period>("all"); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  return <form className="space-y-3 rounded-xl border border-line bg-paper p-3" onSubmit={(event) => { event.preventDefault(); if (from && to && from <= to) onChange(resolveUserLogRange("custom", new Date(), from, to)); }}>
    <div className="flex flex-wrap gap-2">{periods.map((value, index) => <Button key={value} type="button" size="sm" disabled={disabled} variant={period === value ? "primary" : "secondary"} onClick={() => { setPeriod(value); if (value !== "custom") onChange(resolveUserLogRange(value, new Date())); }}>{copy[index]}</Button>)}</div>
    {period === "custom" ? <div className="flex flex-wrap items-end gap-2"><label className="min-w-0 text-xs">{copy[7]}<input className="block max-w-full rounded border border-line bg-white p-2" aria-label={copy[7]} type="date" value={from} required max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label><label className="min-w-0 text-xs">{copy[8]}<input className="block max-w-full rounded border border-line bg-white p-2" aria-label={copy[8]} type="date" value={to} required min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label><Button type="submit" size="sm" disabled={disabled || !from || !to || from > to}>{copy[9]}</Button></div> : null}
  </form>;
}
