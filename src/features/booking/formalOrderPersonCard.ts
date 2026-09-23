import type { SocialProfileMiniData } from "../../shared/profile-card";
import { resolveAvatarUrl } from "../../lib/defaultAvatar";
import {
  registerTranslationEntries,
  translateText,
  type Language
} from "../../i18n/translations";

const assignedTechnicianUnavailableSource = "担当技师已确认，公开资料暂不可用。";

registerTranslationEntries({
  [assignedTechnicianUnavailableSource]: {
    "zh-Hant": "已確認擔當技師，公開資料暫時無法使用。",
    ja: "担当者は確定していますが、公開プロフィールは現在利用できません。",
    en: "The assigned technician is confirmed, but their public profile is currently unavailable.",
    ko: "담당 기사는 확정되었지만 공개 프로필을 현재 이용할 수 없습니다."
  }
});

export function translateAssignedTechnicianUnavailable(language: Language): string {
  return translateText(assignedTechnicianUnavailableSource, language);
}

export function buildFormalOrderPersonCard(profile: {
  id: number;
  displayName: string;
  avatarUrl: string | null;
  city?: string | null;
  bio?: string | null;
  serviceArea?: string | null;
  languages?: string[];
  reviewSummary?: { ratingAverage: string; reviewCount: number };
  completedOrderCount?: number;
  favoriteCount?: number;
  shareCount?: number;
}, entityType: "user" | "technician"): SocialProfileMiniData {
  return {
    id: String(profile.id), entityType, displayName: profile.displayName,
    avatar: resolveAvatarUrl(profile.avatarUrl), coverImage: resolveAvatarUrl(profile.avatarUrl),
    headline: profile.bio ?? undefined, regionLabel: profile.serviceArea ?? profile.city ?? "",
    primaryLabel: "", kycVerified: false, levelLabel: "", scoreLabel: "评价",
    scoreValue: profile.reviewSummary && profile.reviewSummary.reviewCount > 0 ? profile.reviewSummary.ratingAverage : "—",
    followerCount: profile.favoriteCount ?? 0,
    followingCount: profile.reviewSummary?.reviewCount ?? 0,
    completedOrderCount: profile.completedOrderCount,
    favoriteCount: profile.favoriteCount,
    shareCount: profile.shareCount,
    languages: profile.languages ?? []
  };
}
