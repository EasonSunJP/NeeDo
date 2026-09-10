import type { TechnicianReviewTagSummary } from "../../features/core-read/api";
import type { UnifiedServiceInfoCardData } from "../service-card";

export type TechnicianProfileInfoModel = {
  publicId: string;
  displayName: string;
  avatarUrl: string | null;
  identityLabel: string;
  gender: "female" | "male" | "private";
  age: number | null;
  heightCm: number | null;
  languages: string[];
  bio: string | null;
  yearsExperience: number;
  acceptanceRatePercent: number | null;
  ratingAverage: number | null;
  reviewCount: number | null;
  completedOrderCount: number | null;
  reviewTagSummary: TechnicianReviewTagSummary;
  services: UnifiedServiceInfoCardData[];
};
