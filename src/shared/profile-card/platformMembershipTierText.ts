import type { Language } from "../../i18n/translations";

export type PlatformMembershipTierCode = "free" | "silver" | "gold" | "black_diamond";

const labels: Record<Language, Record<PlatformMembershipTierCode, string>> = {
  zh: { free: "免费会员", silver: "白银会员", gold: "黄金会员", black_diamond: "黑钻会员" },
  "zh-Hant": { free: "免費會員", silver: "白銀會員", gold: "黃金會員", black_diamond: "黑鑽會員" },
  ja: { free: "無料会員", silver: "シルバー会員", gold: "ゴールド会員", black_diamond: "ブラックダイヤ会員" },
  en: { free: "Free membership", silver: "Silver membership", gold: "Gold membership", black_diamond: "Black Diamond membership" },
  ko: { free: "무료 회원", silver: "실버 회원", gold: "골드 회원", black_diamond: "블랙 다이아 회원" }
};

export function platformMembershipTierText(
  code: PlatformMembershipTierCode,
  language: Language,
) {
  return labels[language][code];
}
