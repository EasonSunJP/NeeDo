import type { SocialProfileMiniData } from "../../shared/profile-card";
import type { Technician } from "../../types/domain";

type FormalStaffFields = Pick<Technician, "id" | "name" | "nickname" | "avatar" | "bio" | "serviceAreas" | "rating" | "reviewCount" | "specialReviewTags">;

export function buildFormalMerchantStaffCard(technician: FormalStaffFields): SocialProfileMiniData {
  return {
    id: technician.id,
    entityType: "technician",
    displayName: technician.nickname?.trim() || technician.name,
    avatar: technician.avatar,
    coverImage: technician.avatar,
    headline: technician.bio,
    regionLabel: technician.serviceAreas.join(" / "),
    primaryLabel: "技师",
    kycVerified: false,
    levelLabel: "",
    scoreLabel: "服务评价",
    scoreValue: technician.reviewCount > 0 ? String(technician.rating) : "—",
    followerCount: 0,
    followingCount: 0,
    specialReviewTags: technician.specialReviewTags ?? []
  };
}
