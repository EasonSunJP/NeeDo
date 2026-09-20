import type { Language } from "../../i18n/translations";

export type FavoriteTab =
  | "all"
  | "shop"
  | "technician"
  | "service"
  | "social_post"
  | "chat_record";

export type FavoriteItemType = Exclude<FavoriteTab, "all">;

export type UnifiedFavoriteItem = {
  key: string;
  type: FavoriteItemType;
  itemKey: string;
  title: string;
  summary: string | null;
  imageUrl: string | null;
  detailPath: string;
  favoritedAt: string;
  activityAt: string;
  pinnedAt: string | null;
  reaction: string | null;
  canForward: boolean;
  canDelete: boolean;
};

export type UnifiedFavoritePage = {
  list: UnifiedFavoriteItem[];
  total: number;
  page: number;
  page_size: number;
};

export const favoriteTabs: FavoriteTab[] = [
  "all",
  "shop",
  "technician",
  "service",
  "social_post",
  "chat_record",
];

export function sortFavorites(rows: readonly UnifiedFavoriteItem[]) {
  return [...rows].sort((left, right) => {
    if (Boolean(left.pinnedAt) !== Boolean(right.pinnedAt)) {
      return left.pinnedAt ? -1 : 1;
    }
    if (left.pinnedAt && right.pinnedAt) {
      const pinnedOrder = Date.parse(right.pinnedAt) - Date.parse(left.pinnedAt);
      if (pinnedOrder !== 0) return pinnedOrder;
    }
    const activityOrder = Date.parse(right.activityAt) - Date.parse(left.activityAt);
    return activityOrder || left.key.localeCompare(right.key);
  });
}

const languageLocale: Record<Language, string> = {
  zh: "zh-CN",
  "zh-Hant": "zh-TW",
  ja: "ja-JP",
  en: "en-US",
  ko: "ko-KR",
};

const relativeLabels: Record<Language, { today: string; yesterday: string }> = {
  zh: { today: "今天", yesterday: "昨天" },
  "zh-Hant": { today: "今天", yesterday: "昨天" },
  ja: { today: "今日", yesterday: "昨日" },
  en: { today: "Today", yesterday: "Yesterday" },
  ko: { today: "오늘", yesterday: "어제" },
};

function tokyoDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function previousDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return previous.toISOString().slice(0, 10);
}

function fullDateLabel(key: string, language: Language) {
  const [year, month, day] = key.split("-").map(Number);
  const paddedMonth = String(month).padStart(2, "0");
  const paddedDay = String(day).padStart(2, "0");
  if (language === "zh" || language === "zh-Hant" || language === "ja") {
    return `${year}年${paddedMonth}月${paddedDay}日`;
  }
  if (language === "ko") {
    return `${year}년 ${paddedMonth}월 ${paddedDay}일`;
  }
  return new Intl.DateTimeFormat(languageLocale[language], {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function groupFavoritesByTokyoDate(
  rows: readonly UnifiedFavoriteItem[],
  now: Date,
  language: Language,
) {
  const today = tokyoDateKey(now);
  const yesterday = previousDateKey(today);
  const groups = new Map<string, UnifiedFavoriteItem[]>();
  for (const row of sortFavorites(rows)) {
    const key = tokyoDateKey(new Date(row.activityAt));
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].map(([key, items]) => ({
    key,
    label:
      key === today
        ? relativeLabels[language].today
        : key === yesterday
          ? relativeLabels[language].yesterday
          : fullDateLabel(key, language),
    items,
  }));
}
