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

export function AvailabilityCalendar({
  title,
  selectedDay,
  onSelectDay,
  selectedDate,
  onSelectDate,
  people,
  onPeopleChange,
  time,
  onTimeChange,
  timeOptions,
  alwaysAvailable = false,
  className
}: {
  title: string;
  selectedDay: number;
  onSelectDay: (day: number) => void;
  selectedDate?: Date;
  onSelectDate?: (date: Date) => void;
  people: string;
  onPeopleChange: (people: string) => void;
  time: string;
  onTimeChange: (time: string) => void;
  timeOptions: string[];
  alwaysAvailable?: boolean;
  className?: string;
}) {
  const { language } = useI18n();
  const [viewDate, setViewDate] = useState(() =>
    selectedDate ? new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1) : new Date(2026, 3, 1)
  );
  const weekLabels = weekdayLabelsByLanguage[language];
  const peopleOptions = peopleOptionsByLanguage[language];
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
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          type="button"
          aria-label="上个月"
        >
          ‹
        </button>
        <h4 className="text-[19px] font-black text-ink/72">{formatMonthHeading(year, month, language)}</h4>
        <button
          className="grid h-9 w-9 place-items-center text-[30px] font-black text-ink/35"
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
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
          const selectable =
            !cell.ghost &&
            (alwaysAvailable ? normalizeDate(date).getTime() >= today.getTime() : isAvailableDay(year, month, cell.day));
          const selected = selectable && cell.day === currentSelectedDay && year === selectedYear && month === selectedMonth;
          const mutedDay = !selectable && !cell.ghost;

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
              {cell.day === 13 && !cell.ghost ? <span className="availability-calendar-tel mt-1.5 text-xs text-ink/35">TEL</span> : null}
              {selectable ? <span className="mt-1.5 h-5 w-5 rounded-full border-[4px] border-[#f08a00]" /> : <span className="availability-calendar-dash mt-1.5 text-lg text-ink/20">－</span>}
            </button>
          );
        })}
      </div>

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
            <select className="min-w-0 flex-1 appearance-none bg-transparent outline-none" onChange={(event) => onTimeChange(event.target.value)} value={time}>
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
