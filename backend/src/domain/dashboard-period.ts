export const DASHBOARD_PERIODS = [
  "today",
  "last7days",
  "last30days",
  "week",
  "month",
  "year",
  "custom"
] as const;

export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export interface DashboardPeriodQuery {
  period: DashboardPeriod;
  from?: string;
  to?: string;
}

export type DashboardGranularity = "hour" | "day" | "month";

export interface DashboardWindow {
  period: DashboardPeriod;
  timeZone: "Asia/Tokyo";
  granularity: DashboardGranularity;
  fromDate: string;
  toDate: string;
  fromInclusive: Date;
  toExclusive: Date;
  previousFromDate: string;
  previousToDate: string;
  previousFromInclusive: Date;
  previousToExclusive: Date;
  buckets: Array<{
    key: string;
    label: string;
    fromInclusive: Date;
    toExclusive: Date;
  }>;
}

const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_DASHBOARD_CUSTOM_RANGE_DAYS = 366;

export const formatCalendarDate = (year: number, month: number, day: number): string =>
  `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;

export const parseCalendarDate = (value: string): { year: number; month: number; day: number } => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("Invalid calendar date");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new Error("Invalid calendar date");
  }
  return { year, month, day };
};

export const shiftCalendarDate = (value: string, days: number): string => {
  const { year, month, day } = parseCalendarDate(value);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  return formatCalendarDate(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate()
  );
};

export const toTokyoCalendarDate = (value: Date): string => {
  const tokyo = new Date(value.getTime() + TOKYO_OFFSET_MS);
  return formatCalendarDate(tokyo.getUTCFullYear(), tokyo.getUTCMonth() + 1, tokyo.getUTCDate());
};

export const startOfTokyoCalendarDate = (value: string): Date => {
  const { year, month, day } = parseCalendarDate(value);
  return new Date(Date.UTC(year, month - 1, day) - TOKYO_OFFSET_MS);
};

const calendarDaysInclusive = (from: string, to: string): number => {
  const fromDate = parseCalendarDate(from);
  const toDate = parseCalendarDate(to);
  return (
    Math.floor(
      (Date.UTC(toDate.year, toDate.month - 1, toDate.day) -
        Date.UTC(fromDate.year, fromDate.month - 1, fromDate.day)) /
        DAY_MS
    ) + 1
  );
};

const monthEndDate = (date: string): string => {
  const monthStart = `${date.slice(0, 7)}-01`;
  return shiftCalendarDate(`${shiftCalendarDate(monthStart, 32).slice(0, 7)}-01`, -1);
};

const resolveDates = (
  query: DashboardPeriodQuery,
  now: Date
): { fromDate: string; toDate: string } => {
  const today = toTokyoCalendarDate(now);
  switch (query.period) {
    case "today":
      return { fromDate: today, toDate: today };
    case "last7days":
      return { fromDate: shiftCalendarDate(today, -6), toDate: today };
    case "last30days":
      return { fromDate: shiftCalendarDate(today, -29), toDate: today };
    case "week": {
      const { year, month, day } = parseCalendarDate(today);
      const mondayOffset = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
      const fromDate = shiftCalendarDate(today, -mondayOffset);
      return { fromDate, toDate: shiftCalendarDate(fromDate, 6) };
    }
    case "month":
      return { fromDate: `${today.slice(0, 7)}-01`, toDate: monthEndDate(today) };
    case "year":
      return { fromDate: `${today.slice(0, 4)}-01-01`, toDate: `${today.slice(0, 4)}-12-31` };
    case "custom": {
      if (!query.from || !query.to) {
        throw new Error("Custom period requires both from and to dates");
      }
      parseCalendarDate(query.from);
      parseCalendarDate(query.to);
      const days = calendarDaysInclusive(query.from, query.to);
      if (days < 1) {
        throw new Error("Custom period start must not be after its end");
      }
      if (days > MAX_DASHBOARD_CUSTOM_RANGE_DAYS) {
        throw new Error(`Custom period must not exceed ${MAX_DASHBOARD_CUSTOM_RANGE_DAYS} days`);
      }
      return { fromDate: query.from, toDate: query.to };
    }
  }
};

const bucket = (key: string, label: string, fromDate: string, toDate: string) => ({
  key,
  label,
  fromInclusive: startOfTokyoCalendarDate(fromDate),
  toExclusive: startOfTokyoCalendarDate(toDate)
});

const resolveBuckets = (
  granularity: DashboardGranularity,
  fromDate: string,
  toDate: string
): DashboardWindow["buckets"] => {
  const exclusiveDate = shiftCalendarDate(toDate, 1);
  if (granularity === "hour") {
    return Array.from({ length: 24 }, (_, hour) => {
      const start = new Date(startOfTokyoCalendarDate(fromDate).getTime() + hour * 60 * 60 * 1000);
      return {
        key: `${hour.toString().padStart(2, "0")}:00`,
        label: `${hour.toString().padStart(2, "0")}:00`,
        fromInclusive: start,
        toExclusive: new Date(start.getTime() + 60 * 60 * 1000)
      };
    });
  }

  if (granularity === "day") {
    const days = calendarDaysInclusive(fromDate, toDate);
    return Array.from({ length: days }, (_, index) => {
      const date = shiftCalendarDate(fromDate, index);
      return bucket(date, date.slice(5), date, shiftCalendarDate(date, 1));
    });
  }

  const buckets: DashboardWindow["buckets"] = [];
  let month = `${fromDate.slice(0, 7)}-01`;
  while (month < exclusiveDate) {
    const nextMonth = `${shiftCalendarDate(month, 32).slice(0, 7)}-01`;
    buckets.push(
      bucket(
        month.slice(0, 7),
        month.slice(0, 7),
        month < fromDate ? fromDate : month,
        nextMonth > exclusiveDate ? exclusiveDate : nextMonth
      )
    );
    month = nextMonth;
  }
  return buckets;
};

export const resolveDashboardWindow = (
  query: DashboardPeriodQuery,
  now = new Date()
): DashboardWindow => {
  const { fromDate, toDate } = resolveDates(query, now);
  const dayCount = calendarDaysInclusive(fromDate, toDate);
  const granularity: DashboardGranularity =
    query.period === "today"
      ? "hour"
      : query.period === "year" || (query.period === "custom" && dayCount > 92)
        ? "month"
        : "day";
  const previousToDate = shiftCalendarDate(fromDate, -1);
  const previousFromDate = shiftCalendarDate(previousToDate, -(dayCount - 1));

  return {
    period: query.period,
    timeZone: "Asia/Tokyo",
    granularity,
    fromDate,
    toDate,
    fromInclusive: startOfTokyoCalendarDate(fromDate),
    toExclusive: startOfTokyoCalendarDate(shiftCalendarDate(toDate, 1)),
    previousFromDate,
    previousToDate,
    previousFromInclusive: startOfTokyoCalendarDate(previousFromDate),
    previousToExclusive: startOfTokyoCalendarDate(fromDate),
    buckets: resolveBuckets(granularity, fromDate, toDate)
  };
};
