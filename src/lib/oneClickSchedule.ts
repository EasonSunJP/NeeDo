import type { Language } from "../i18n/translations";

export type OneClickScheduleCycle = "single" | "weekly";

export type OneClickScheduleSlot = {
  id: string;
  startTime: string;
  endTime: string;
  minStaff: number;
  maxStaff: number;
};

export type OneClickScheduleConfig = {
  cycle: OneClickScheduleCycle;
  repeatWeeks: number;
  weekdays: number[];
  maxWorkHoursPerDay: number | "ignore";
  slots: OneClickScheduleSlot[];
};

const localeMap: Record<Language, string> = {
  zh: "zh-CN",
  "zh-Hant": "zh-Hant",
  ja: "ja-JP",
  en: "en-US",
  ko: "ko-KR"
};

const weekdayLabelsMap: Record<Language, string[]> = {
  zh: ["日", "月", "火", "水", "木", "金", "土"],
  "zh-Hant": ["日", "一", "二", "三", "四", "五", "六"],
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  ko: ["일", "월", "화", "수", "목", "금", "토"]
};

export const weekdayLabels = weekdayLabelsMap.zh;

export function getWeekdayLabels(language: Language = "zh") {
  return weekdayLabelsMap[language];
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

export function startOfWeek(date: Date) {
  return addDays(date, -date.getDay());
}

export function formatFullDateLabel(date: Date, language: Language = "zh") {
  if (language === "zh") {
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（${weekdayLabelsMap.zh[date.getDay()]}）`;
  }

  return new Intl.DateTimeFormat(localeMap[language], {
    year: "numeric",
    month: language === "en" ? "short" : "numeric",
    day: "numeric",
    weekday: "short"
  }).format(date);
}

export function timeToMinutes(time: string) {
  const [hour = 0, minute = 0] = time.split(":").map(Number);

  return hour * 60 + minute;
}

export function getRangeMinutes(startTime: string, endTime: string) {
  return Math.max(0, timeToMinutes(endTime) - timeToMinutes(startTime));
}

export function formatRangeDuration(startTime: string, endTime: string) {
  const minutes = getRangeMinutes(startTime, endTime);
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  if (restMinutes === 0) {
    return `${hours}h`;
  }

  if (hours === 0) {
    return `${restMinutes}m`;
  }

  return `${hours}h ${restMinutes}m`;
}

export function getOneClickTargetDates(baseDate: Date, config: Pick<OneClickScheduleConfig, "cycle" | "repeatWeeks" | "weekdays">) {
  const baseDateKey = formatDateKey(baseDate);

  if (config.cycle === "single") {
    return [baseDateKey];
  }

  return Array.from({ length: config.repeatWeeks }, (_, weekIndex) => {
    const weekStart = addDays(startOfWeek(baseDate), weekIndex * 7);
    const selectedWeekdays = config.weekdays.length > 0 ? config.weekdays : [baseDate.getDay()];

    return selectedWeekdays
      .map((weekday) => formatDateKey(addDays(weekStart, weekday)))
      .filter((dateKey) => dateKey >= baseDateKey);
  }).flat();
}
