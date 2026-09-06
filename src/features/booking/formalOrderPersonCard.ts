import type { SocialProfileMiniData } from "../../shared/profile-card";

export function buildFormalOrderPersonCard(profile: {
  id: number;
  displayName: string;
  avatarUrl: string | null;
  city?: string | null;
  bio?: string | null;
  reviewSummary?: { ratingAverage: string; reviewCount: number };
}, entityType: "user" | "technician"): SocialProfileMiniData {
  return {
    id: String(profile.id), entityType, displayName: profile.displayName,
    avatar: profile.avatarUrl ?? "", coverImage: profile.avatarUrl ?? "",
    headline: profile.bio ?? undefined, regionLabel: profile.city ?? "",
    primaryLabel: "", kycVerified: false, levelLabel: "", scoreLabel: "评价",
    scoreValue: profile.reviewSummary && profile.reviewSummary.reviewCount > 0 ? profile.reviewSummary.ratingAverage : "—",
    followerCount: 0, followingCount: 0
  };
}
