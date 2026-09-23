import { useEffect, useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import { useI18n } from "../../i18n/I18nProvider";
import { languageLocales, type Language } from "../../i18n/translations";

const weekdayLabelsByLanguage = {
  zh: ["日", "月", "火", "水", "木", "金", "土"],
  "zh-Hant": ["日", "一", "二", "三", "四", "五", "六"],
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  ko: ["일", "월", "화", "수", "목", "금", "토"]
} as const;

const peopleOptionsByLanguage = {
  zh: ["1名", "2名", "3名", "4名"],
  "zh-Hant": ["1名", "2名", "3名", "4名"],
  ja: ["1名", "2名", "3名", "4名"],
  en: ["1 person", "2 people", "3 people", "4 people"],
  ko: ["1명", "2명", "3명", "4명"]
} as const;

const emptyTimeLabelByLanguage = {
  zh: "暂无可预约时间",
  "zh-Hant": "暫無可預約時間",
  ja: "予約可能な時間はありません",
  en: "No times available",
  ko: "예약 가능한 시간이 없습니다"
} as const;

const availabilityLoadingLabelByLanguage = {
  zh: "正在读取可约日期…",
  "zh-Hant": "正在讀取可預約日期…",
  ja: "予約可能日を読み込み中…",
  en: "Loading available dates…",
  ko: "예약 가능 날짜를 불러오는 중…"
} as const;

const timeLoadingLabelByLanguage = {
  zh: "正在读取可预约时间…",
  "zh-Hant": "正在讀取可預約時間…",
  ja: "予約可能な時間を読み込み中…",
  en: "Loading available times…",
  ko: "예약 가능 시간을 불러오는 중…"
} as const;

function formatDateLabel(year: number, month: number, selectedDay: number, language: Language) {
  const date = new Date(year, month, selectedDay);

  if (language === "zh") {
    const week = weekdayLabelsByLanguage.zh[date.getDay()];

    return `${month + 1} 月 ${selectedDay} 日（${week}）`;
  }

  return new Intl.DateTimeFormat(languageLocales[language], {
    year: language === "en" ? undefined : "numeric",
    month: language === "en" ? "short" : "numeric",
    day: "numeric",
    weekday: "short"
  }).format(date);
}

function formatMonthHeading(year: number, month: number, language: Language) {
  const date = new Date(year, month, 1);

  if (language === "zh") {
    return `${year} 年 ${month + 1} 月`;
  }

  return new Intl.DateTimeFormat(languageLocales[language], {
    year: "numeric",
    month: language === "en" ? "long" : "numeric"
  }).format(date);
}

function isAvailableDay(year: number, month: number, day: number) {
  const isPastInitialDate = year > 2026 || month > 3 || day >= 14;

  return isPastInitialDate && (day + month) % 5 !== 0;
}

function normalizeDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

export type AvailabilityDateCapacity = {
  availableStartCount: number;
  availableTechnicianCount: number;
};

export function AvailabilityCalendar({
  title,
  selectedDay,
  onSelectDay,
  selectedDate,
  onSelectDate,
  people,
  maxPeople = 4,
  onPeopleChange,
  time,
  onTimeChange,
  timeOptions,
  availableDateKeys,
  availabilityByDate,
  authoritativeAvailability = false,
  availabilityLoading = false,
  alwaysAvailable = false,
  onViewMonthChange,
  technicianCountRelevant = true,
  className
}: {
  title: string;
  selectedDay: number;
  onSelectDay: (day: number) => void;
  selectedDate?: Date;
  onSelectDate?: (date: Date) => void;
  people: string;
  maxPeople?: number;
  onPeopleChange: (people: string) => void;
  time: string;
  onTimeChange: (time: string) => void;
  timeOptions: string[];
  availableDateKeys?: readonly string[];
  availabilityByDate?: Readonly<Record<string, AvailabilityDateCapacity>>;
  authoritativeAvailability?: boolean;
  availabilityLoading?: boolean;
  alwaysAvailable?: boolean;
  onViewMonthChange?: (month: Date) => void;
  technicianCountRelevant?: boolean;
  className?: string;
}) {
  const { language } = useI18n();
  const [viewDate, setViewDate] = useState(() =>
    selectedDate ? new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1) : new Date(2026, 3, 1)
  );
  const weekLabels = weekdayLabelsByLanguage[language];
  const peopleOptions = Array.from({ length: Math.max(1, Math.min(10, maxPeople)) }, (_, index) =>
    peopleOptionsByLanguage[language][index] ?? (
      language === "en" ? `${index + 1} people` : language === "ko" ? `${index + 1}명` : `${index + 1}名`
    )
  );
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const selectedYear = selectedDate?.getFullYear() ?? year;
  const selectedMonth = selectedDate?.getMonth() ?? month;
  const currentSelectedDay = selectedDate?.getDate() ?? selectedDay;
  const selectedDaysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const safeSelectedDay = Math.min(currentSelectedDay, selectedDaysInMonth);
  const today = useMemo(() => normalizeDate(new Date()), []);
  const availableDates = useMemo(
    () => availableDateKeys ? new Set(availableDateKeys) : null,
    [availableDateKeys]
  );
  const monthCells = useMemo(
    () => [
      ...Array.from({ length: firstWeekday }, () => ({ day: 0, ghost: true })),
      ...Array.from({ length: daysInMonth }, (_, index) => ({ day: index + 1, ghost: false }))
    ],
    [daysInMonth, firstWeekday]
  );

  useEffect(() => {
    if (!selectedDate) {
      return;
    }

    setViewDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  }, [selectedDate]);

  return (
    <div className={cn("availability-calendar text-ink", className)}>
      <div className="grid grid-cols-[82px,1fr] items-center gap-2.5">
        <h3 className="text-[15px] font-black text-ink/72">{title}</h3>
        <button className="focus-ring flex h-11 items-center justify-between border border-line bg-white px-4 text-left text-[18px] font-black" type="button">
          <span>{formatDateLabel(selectedYear, selectedMonth, safeSelectedDay, language)}</span>
          <span className="text-xs text-ink/35">▲</span>
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between px-1">
        <button
          className="grid h-9 w-9 place-items-center text-[30px] font-black text-ink/35"
          onClick={() => {
            const previousMonth = new Date(year, month - 1, 1);
            setViewDate(previousMonth);
            onViewMonthChange?.(previousMonth);
          }}
          type="button"
          aria-label="上个月"
        >
          ‹
        </button>
        <h4 className="text-[19px] font-black text-ink/72">{formatMonthHeading(year, month, language)}</h4>
        <button
          className="grid h-9 w-9 place-items-center text-[30px] font-black text-ink/35"
          onClick={() => {
            const nextMonth = new Date(year, month + 1, 1);
            setViewDate(nextMonth);
            onViewMonthChange?.(nextMonth);
          }}
          type="button"
          aria-label="下个月"
        >
          ›
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 text-center text-[15px] font-black">
        {weekLabels.map((label, index) => (
          <span className={cn(index === 0 && "text-coral", index === 6 && "text-[#3a91df]", index !== 0 && index !== 6 && "text-ink/65")} key={label}>
            {label}
          </span>
        ))}
      </div>

      <div className="mt-1.5 grid grid-cols-7 gap-y-1.5 text-center">
        {monthCells.map((cell, index) => {
          const weekday = index % 7;
          const date = new Date(year, month, cell.day || 1);
          const dateKey = formatDateKey(date);
          const dateCapacity = availabilityByDate?.[dateKey];
          const hasAuthoritativeCapacity = Boolean(
            dateCapacity
            && dateCapacity.availableStartCount > 0
            && (!technicianCountRelevant || dateCapacity.availableTechnicianCount > 0)
          );
          const selectable =
            !cell.ghost &&
            normalizeDate(date).getTime() >= today.getTime() &&
            (authoritativeAvailability
              ? !availabilityLoading && (availabilityByDate
                ? hasAuthoritativeCapacity
                : Boolean(availableDates?.has(dateKey)))
              : availableDates
              ? availableDates.has(dateKey)
              : alwaysAvailable || isAvailableDay(year, month, cell.day));
          const scarce = Boolean(
            selectable
            && dateCapacity
            && (
              dateCapacity.availableStartCount < 4
              || (technicianCountRelevant && dateCapacity.availableTechnicianCount < 4)
            )
          );
          const selected = selectable && cell.day === currentSelectedDay && year === selectedYear && month === selectedMonth;
          const mutedDay = !selectable && !cell.ghost && !availabilityLoading;

          return (
            <button
              className={cn(
                "focus-ring mx-auto flex h-[60px] w-[48px] flex-col items-center justify-start pt-1 font-black transition",
                selected && "bg-lemon/30 ring-1 ring-lemon",
                cell.ghost && "availability-calendar-ghost pointer-events-none",
                mutedDay && "availability-calendar-muted-day",
                weekday === 0 && !cell.ghost && "text-coral",
                weekday === 6 && !cell.ghost && "text-[#3a91df]"
              )}
              disabled={!selectable}
              key={`${cell.day}-${index}`}
              onClick={() => {
                onSelectDay(cell.day);
                onSelectDate?.(new Date(year, month, cell.day));
              }}
              type="button"
            >
              <span className={cn("availability-calendar-day text-[18px] leading-none", cell.ghost ? "text-ink/28" : "text-current", mutedDay && "availability-calendar-day-muted", selected && "availability-calendar-day-selected")}>
                {cell.ghost ? "" : cell.day}
              </span>
              {!authoritativeAvailability && !availableDates && cell.day === 13 && !cell.ghost ? <span className="availability-calendar-tel mt-1.5 text-xs text-ink/35">TEL</span> : null}
              {cell.ghost ? null : availabilityLoading ? (
                <span
                  aria-hidden="true"
                  className="availability-calendar-loading-marker mt-2 h-3.5 w-7 animate-pulse rounded-full bg-ink/12"
                />
              ) : scarce ? (
                <span className="availability-calendar-scarce-marker mt-1.5 h-0 w-0 border-x-[10px] border-b-[18px] border-x-transparent border-b-[#f08a00]" />
              ) : selectable ? (
                <span className="availability-calendar-available-marker mt-1.5 h-5 w-5 rounded-full border-[4px] border-[#f08a00]" />
              ) : (
                <span className="availability-calendar-dash mt-1.5 text-lg text-ink/20">－</span>
              )}
            </button>
          );
        })}
      </div>

      {authoritativeAvailability && availabilityLoading ? (
        <p aria-live="polite" className="mt-3 text-center text-sm font-black text-ink/55">
          {availabilityLoadingLabelByLanguage[language]}
        </p>
      ) : null}

      <div className="mt-4 space-y-2.5 border-t border-line pt-3">
        <label className="grid grid-cols-[82px,1fr] items-center gap-2.5">
          <span className="text-[15px] font-black text-ink/72">人数</span>
          <span className="flex h-11 items-center justify-between border border-line bg-white px-4 text-[18px] font-black">
            <select className="min-w-0 flex-1 appearance-none bg-transparent outline-none" onChange={(event) => onPeopleChange(event.target.value)} value={people}>
              {peopleOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <span className="text-xs text-ink/35">▼</span>
          </span>
        </label>
        <label className="grid grid-cols-[82px,1fr] items-center gap-2.5">
          <span className="text-[15px] font-black text-ink/72">时间</span>
          <span className="flex h-11 items-center justify-between border border-line bg-white px-4 text-[18px] font-black">
            <select className="min-w-0 flex-1 appearance-none bg-transparent outline-none" disabled={availabilityLoading} onChange={(event) => onTimeChange(event.target.value)} value={time}>
              {timeOptions.length === 0 ? (
                <option value="">
                  {availabilityLoading ? timeLoadingLabelByLanguage[language] : emptyTimeLabelByLanguage[language]}
                </option>
              ) : null}
              {timeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <span className="text-xs text-ink/35">▼</span>
          </span>
        </label>
      </div>
    </div>
  );
}
