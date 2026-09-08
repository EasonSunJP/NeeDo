export type UserUsagePeriod =
  | "last7days"
  | "thisWeek"
  | "last30days"
  | "thisMonth"
  | "thisYear"
  | "custom";

const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const tokyoCalendarStart = (year: number, monthIndex: number, day: number) =>
  new Date(Date.UTC(year, monthIndex, day) - TOKYO_OFFSET_MS);

const parseCalendarDate = (value: string): [number, number, number] => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError("Invalid calendar date");
  return [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
};

export function resolveUsagePeriod(
  period: UserUsagePeriod,
  now: Date,
  custom?: { from?: string; to?: string }
): { from: Date; to: Date } {
  const tokyoNow = new Date(now.getTime() + TOKYO_OFFSET_MS);
  const year = tokyoNow.getUTCFullYear();
  const month = tokyoNow.getUTCMonth();
  const day = tokyoNow.getUTCDate();
  const today = tokyoCalendarStart(year, month, day);
  if (period === "custom") {
    if (!custom?.from || !custom.to) throw new RangeError("Custom range requires from and to");
    const fromParts = parseCalendarDate(custom.from);
    const toParts = parseCalendarDate(custom.to);
    const from = tokyoCalendarStart(...fromParts);
    const toDay = tokyoCalendarStart(...toParts);
    if (from.getTime() > toDay.getTime()) throw new RangeError("Invalid custom range");
    return { from, to: new Date(toDay.getTime() + DAY_MS) };
  }
  if (period === "last7days") {
    return { from: new Date(today.getTime() - 6 * DAY_MS), to: new Date(today.getTime() + DAY_MS) };
  }
  if (period === "last30days") {
    return {
      from: new Date(today.getTime() - 29 * DAY_MS),
      to: new Date(today.getTime() + DAY_MS)
    };
  }
  if (period === "thisWeek") {
    const weekday = tokyoNow.getUTCDay();
    const from = new Date(today.getTime() - ((weekday + 6) % 7) * DAY_MS);
    return { from, to: new Date(from.getTime() + 7 * DAY_MS) };
  }
  if (period === "thisMonth") {
    return { from: tokyoCalendarStart(year, month, 1), to: tokyoCalendarStart(year, month + 1, 1) };
  }
  return { from: tokyoCalendarStart(year, 0, 1), to: tokyoCalendarStart(year + 1, 0, 1) };
}
