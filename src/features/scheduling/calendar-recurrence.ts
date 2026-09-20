export type CalendarRepeatRule = "none" | "daily" | "weekly" | "monthly" | "yearly";

export type CalendarEventInterval = {
  startsAt: Date;
  endsAt: Date;
};

const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

type TokyoParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

function tokyoParts(value: Date): TokyoParts {
  const shifted = new Date(value.getTime() + TOKYO_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    millisecond: shifted.getUTCMilliseconds()
  };
}

function fromTokyoParts(parts: TokyoParts, year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day, parts.hour, parts.minute, parts.second, parts.millisecond) - TOKYO_OFFSET_MS);
}

function occurrenceStart(anchor: TokyoParts, repeatRule: Exclude<CalendarRepeatRule, "none">, index: number) {
  if (repeatRule === "daily" || repeatRule === "weekly") {
    return fromTokyoParts(anchor, anchor.year, anchor.month, anchor.day + index * (repeatRule === "weekly" ? 7 : 1));
  }
  if (repeatRule === "monthly") {
    const monthIndex = anchor.year * 12 + anchor.month + index;
    const year = Math.floor(monthIndex / 12);
    const month = monthIndex - year * 12;
    const result = fromTokyoParts(anchor, year, month, anchor.day);
    const resultParts = tokyoParts(result);
    return resultParts.year === year && resultParts.month === month && resultParts.day === anchor.day ? result : null;
  }
  const year = anchor.year + index;
  const result = fromTokyoParts(anchor, year, anchor.month, anchor.day);
  const resultParts = tokyoParts(result);
  return resultParts.year === year && resultParts.month === anchor.month && resultParts.day === anchor.day ? result : null;
}

function firstOccurrenceIndex(anchor: TokyoParts, repeatRule: Exclude<CalendarRepeatRule, "none">, earliestStart: Date) {
  const earliest = tokyoParts(earliestStart);
  if (repeatRule === "daily" || repeatRule === "weekly") {
    const anchorDay = Date.UTC(anchor.year, anchor.month, anchor.day) / DAY_MS;
    const earliestDay = Date.UTC(earliest.year, earliest.month, earliest.day) / DAY_MS;
    return Math.max(0, Math.floor((earliestDay - anchorDay) / (repeatRule === "weekly" ? 7 : 1)) - 1);
  }
  if (repeatRule === "monthly") {
    return Math.max(0, (earliest.year * 12 + earliest.month) - (anchor.year * 12 + anchor.month) - 1);
  }
  return Math.max(0, earliest.year - anchor.year - 1);
}

export function expandCalendarEventIntervals({
  startsAt,
  endsAt,
  repeatRule,
  from,
  to
}: CalendarEventInterval & { repeatRule: CalendarRepeatRule; from: Date; to: Date }): CalendarEventInterval[] {
  if (endsAt <= startsAt || to <= from) return [];
  if (repeatRule === "none") return startsAt < to && endsAt > from ? [{ startsAt, endsAt }] : [];

  const durationMs = endsAt.getTime() - startsAt.getTime();
  const anchor = tokyoParts(startsAt);
  const earliestStart = new Date(from.getTime() - durationMs);
  const intervals: CalendarEventInterval[] = [];
  let index = firstOccurrenceIndex(anchor, repeatRule, earliestStart);

  while (true) {
    const occurrence = occurrenceStart(anchor, repeatRule, index);
    index += 1;
    if (!occurrence) continue;
    if (occurrence >= to) break;
    const occurrenceEnd = new Date(occurrence.getTime() + durationMs);
    if (occurrenceEnd > from) intervals.push({ startsAt: occurrence, endsAt: occurrenceEnd });
  }

  return intervals;
}
