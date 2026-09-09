import { Link } from "react-router-dom";
import { AppIcon } from "../../components/client-ui/AppScaffold";
import type { TechnicianReviewTagSummary } from "../../features/core-read/api";
import { cn } from "../../lib/utils";
import type { Technician } from "../../types/domain";
import { TechnicianProfileInfoView, type TechnicianProfileInfoModel } from "../technician-profile";
import type { UnifiedServiceInfoCardData } from "../service-card";
import type { TechnicianFormalContactCardData, TechnicianFormalContactService } from "./types";

export type TechnicianPublicInfoCardThemeScope = "user" | "merchant" | "technician";

const emptyReviewTagSummary: TechnicianReviewTagSummary = {
  special: [],
  custom: []
};

function parseOptionalNumber(value?: string) {
  if (!value?.trim()) return null;
  const parsed = Number.parseFloat(value.replace(/\s*(cm|厘米|センチ|㎝)$/i, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function ratingFromFormalData(formalData?: TechnicianFormalContactCardData) {
  if (!formalData || formalData.metrics.reviewCount <= 0) return null;
  const rating = Number.parseFloat(formalData.metrics.ratingAverage);
  return Number.isFinite(rating) ? rating : null;
}

function mapContactService(service: TechnicianFormalContactService): UnifiedServiceInfoCardData {
  return {
    id: String(service.id),
    coverUrl: service.coverImageUrl?.trim() || null,
    name: service.name,
    priceAmount: service.priceAmount,
    currency: service.currency,
    durationMinutes: service.durationMinutes,
    completedOrderCount: service.usageCount ?? null,
    shopPublicId: service.shopPublicId?.trim() || null,
    shopAddress: service.shopAddress?.trim() || null,
    description: service.description?.trim() || null,
    tags: service.tags?.map((tag) => tag.trim()).filter(Boolean) ?? []
  };
}

function mapCompatibilityModel(technician: Technician, formalData?: TechnicianFormalContactCardData): TechnicianProfileInfoModel {
  const details = formalData?.contactDetails;
  const identityLabel = technician.identityLabel === "店铺所属技师" ? "店铺所属" : "个人技师";

  return {
    publicId: technician.systemId,
    displayName: technician.nickname?.trim() || technician.name,
    avatarUrl: technician.avatar.trim() || null,
    identityLabel,
    gender: formalData?.gender ?? technician.gender ?? "private",
    age: parseOptionalNumber(technician.age),
    heightCm: parseOptionalNumber(technician.height),
    languages: technician.languages,
    bio: technician.bio?.trim() || null,
    yearsExperience: formalData?.yearsExperience ?? 0,
    acceptanceRatePercent: formalData ? formalData.metrics.acceptanceRateBps / 100 : 0,
    ratingAverage: ratingFromFormalData(formalData),
    reviewCount: formalData?.metrics.reviewCount ?? 0,
    completedOrderCount: formalData?.metrics.completedOrderCount ?? 0,
    reviewTagSummary: formalData?.reviewTagSummary ?? emptyReviewTagSummary,
    services: details?.services.map(mapContactService) ?? []
  };
}

export function TechnicianPublicInfoCard({
  className,
  dynamicTo,
  formalData,
  onClose,
  technician,
  themeScope = "user"
}: {
  className?: string;
  dynamicTo?: string;
  formalData?: TechnicianFormalContactCardData;
  hideUnavailableFields?: boolean;
  onClose?: () => void;
  technician: Technician;
  themeScope?: TechnicianPublicInfoCardThemeScope;
}) {
  const model = mapCompatibilityModel(technician, formalData);
  const actionButtonClassName = "focus-ring grid h-11 w-11 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_30%,var(--client-line))] bg-[color:var(--client-elevated)] text-[color:var(--client-primary)] shadow-panel";

  return (
    <div className={cn("relative", className)} data-theme-scope={themeScope} data-testid="technician-public-info-card">
      {onClose || dynamicTo ? (
        <div className="absolute right-4 top-4 z-20 flex flex-col gap-2">
          {onClose ? (
            <button aria-label="关闭技师信息卡" className={actionButtonClassName} onClick={onClose} type="button">
              <AppIcon className="h-5 w-5" name="close" />
            </button>
          ) : null}
          {dynamicTo ? (
            <Link aria-label={`查看${model.displayName}动态页`} className={actionButtonClassName} to={dynamicTo}>
              <AppIcon className="h-5 w-5" name="moments" />
            </Link>
          ) : null}
        </div>
      ) : null}
      <TechnicianProfileInfoView model={model} />
    </div>
  );
}
