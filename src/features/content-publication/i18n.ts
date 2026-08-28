import type { Language } from "../../i18n/translations";

export const contentPublicationTranslations = {
  loading: {
    zh: "正在读取轮播内容",
    "zh-Hant": "正在讀取輪播內容",
    ja: "カルーセルを読み込み中",
    en: "Loading carousel",
    ko: "캐러셀을 불러오는 중"
  },
  error: {
    zh: "轮播内容读取失败",
    "zh-Hant": "輪播內容讀取失敗",
    ja: "カルーセルを読み込めませんでした",
    en: "Couldn't load carousel",
    ko: "캐러셀을 불러오지 못했습니다"
  },
  retry: {
    zh: "重试",
    "zh-Hant": "重試",
    ja: "再試行",
    en: "Retry",
    ko: "다시 시도"
  },
  empty: {
    zh: "暂无轮播内容",
    "zh-Hant": "暫無輪播內容",
    ja: "現在表示できるカルーセルはありません",
    en: "No carousel content is available",
    ko: "현재 표시할 캐러셀 콘텐츠가 없습니다"
  }
} satisfies Record<string, Record<Language, string>>;

export type ContentPublicationTranslationKey = keyof typeof contentPublicationTranslations;

export function contentPublicationText(
  key: ContentPublicationTranslationKey,
  language: Language
) {
  return contentPublicationTranslations[key][language];
}
