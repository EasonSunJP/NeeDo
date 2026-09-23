import type { CoreTechnicianDetail } from "../../features/core-read/api";
import type { TechnicianSelfProfile } from "../../features/core-read/technicianProfileApi";
import type { TechnicianServicePayload } from "../../features/pricing-mode/api";
import { mapTechnicianServiceToUnifiedData } from "../service-card";
import type { TechnicianProfileInfoModel } from "./model";

function parseRating(value: string, reviewCount: number) {
  if (reviewCount <= 0) {
    return null;
  }

  const rating = Number.parseFloat(value);
  return Number.isFinite(rating) ? rating : null;
}

export function fromTechnicianSelfProfile(
  profile: TechnicianSelfProfile,
  detail: CoreTechnicianDetail | null,
  services: TechnicianServicePayload[]
): TechnicianProfileInfoModel {
  const reviewCount = detail?.reviewSummary.reviewCount ?? null;

  return {
    publicId: profile.publicId,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    identityLabel: profile.shopAffiliations.length > 0 ? "店铺所属" : "待归属",
    gender: profile.gender,
    age: profile.age,
    heightCm: profile.heightCm,
    languages: profile.languages,
    bio: profile.bio,
    bioLocales: profile.bioLocales,
    yearsExperience: profile.yearsExperience,
    acceptanceRatePercent: detail?.acceptanceRatePercent ?? null,
    ratingAverage: detail ? parseRating(detail.reviewSummary.ratingAverage, detail.reviewSummary.reviewCount) : null,
    reviewCount,
    completedOrderCount: detail?.completedOrderCount ?? null,
    reviewTagSummary: profile.reviewTagSummary,
    services: services.map(mapTechnicianServiceToUnifiedData)
  };
}

export function fromCoreTechnicianDetail(
  detail: CoreTechnicianDetail,
  services: TechnicianServicePayload[]
): TechnicianProfileInfoModel {
  const reviewCount = detail.reviewSummary.reviewCount;

  return {
    publicId: detail.publicId,
    displayName: detail.displayName,
    avatarUrl: detail.avatarUrl,
    identityLabel: detail.shop ? "店铺所属" : "待归属",
    gender: detail.gender,
    age: detail.age,
    heightCm: detail.heightCm,
    languages: detail.languages,
    bio: detail.bio,
    bioLocales: detail.bioLocales,
    yearsExperience: detail.yearsExperience,
    acceptanceRatePercent: detail.acceptanceRatePercent,
    ratingAverage: parseRating(detail.reviewSummary.ratingAverage, reviewCount),
    reviewCount,
    completedOrderCount: detail.completedOrderCount,
    reviewTagSummary: detail.reviewTagSummary,
    services: services.map(mapTechnicianServiceToUnifiedData)
  };
}
