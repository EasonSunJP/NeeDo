import type { SocialProfileMiniData } from "../../shared/profile-card";

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
    avatar: profile.avatarUrl ?? "", coverImage: profile.avatarUrl ?? "",
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
