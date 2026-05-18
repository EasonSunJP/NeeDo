import type { Language } from "../i18n/translations";

export type DispatchCalendarView = "day" | "week" | "month";

export const dispatchTodayKey = "2026-04-14";
export const dispatchCurrentHour = 14;
export const dispatchHours = Array.from({ length: 24 }, (_, index) => index);
const localeMap: Record<Language, string> = {
  zh: "zh-CN",
  "zh-Hant": "zh-Hant",
  ja: "ja-JP",
  en: "en-US",
  ko: "ko-KR"
};

const dispatchWeekdayLabelsMap: Record<Language, string[]> = {
  zh: ["日", "月", "火", "水", "木", "金", "土"],
  "zh-Hant": ["日", "一", "二", "三", "四", "五", "六"],
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  ko: ["일", "월", "화", "수", "목", "금", "토"]
};

export const dispatchWeekdayLabels = dispatchWeekdayLabelsMap.zh;

export function getDispatchWeekdayLabels(language: Language = "zh") {
  return dispatchWeekdayLabelsMap[language];
}
export const dispatchFrozenColumnWidth = 260;

const dispatchColumnWidthMap: Record<DispatchCalendarView, number> = {
  day: 58,
  week: 160,
  month: 104
};

export function getDispatchColumnWidth(view: DispatchCalendarView) {
  return dispatchColumnWidthMap[view];
}

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);

  return new Date(year, month - 1, day);
}

export function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);

  return next;
}

export function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);

  return next;
}

export function startOfWeek(date: Date) {
  return addDays(date, -date.getDay());
}

export function getMonthDates(date: Date) {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const dayCount = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

  return Array.from({ length: dayCount }, (_, index) => addDays(firstDay, index));
}

export function getDisplayDates(date: Date, view: DispatchCalendarView) {
  if (view === "month") {
    return getMonthDates(date);
  }

  if (view === "week") {
    const start = startOfWeek(date);

    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }

  return [date];
}

export function getCalendarTitle(date: Date, view: DispatchCalendarView, language: Language = "zh") {
  if (view === "day") {
    if (language !== "zh") {
      return new Intl.DateTimeFormat(localeMap[language], {
        year: "numeric",
        month: language === "en" ? "short" : "numeric",
        day: "numeric"
      }).format(date);
    }

    return `${date.getFullYear()}年 ${date.getMonth() + 1}月 ${date.getDate()}日`;
  }

  if (view === "week") {
    const start = startOfWeek(date);
    const end = addDays(start, 6);

    if (language !== "zh") {
      const formatter = new Intl.DateTimeFormat(localeMap[language], {
        month: language === "en" ? "short" : "numeric",
        day: "numeric"
      });
      const yearLabel = new Intl.DateTimeFormat(localeMap[language], { year: "numeric" }).format(end);

      return `${formatter.format(start)} - ${formatter.format(end)}, ${yearLabel}`;
    }

    return `${start.getMonth() + 1}月${start.getDate()}日 - ${end.getMonth() + 1}月${end.getDate()}日`;
  }

  if (language !== "zh") {
    return new Intl.DateTimeFormat(localeMap[language], {
      year: "numeric",
      month: language === "en" ? "long" : "numeric"
    }).format(date);
  }

  return `${date.getFullYear()}年 ${date.getMonth() + 1}月`;
}
