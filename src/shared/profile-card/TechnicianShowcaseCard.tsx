import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AppIcon, type IconName } from "../../components/client-ui/AppScaffold";
import type { Language } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import type { ServiceItem, Technician } from "../../types/domain";
import { getScopedProfileDetailPath } from "../profile-detail/paths";
import {
  UnifiedEntityInfoCard,
  type UnifiedEntityInfoCardData,
} from "./UnifiedEntityInfoCard";
import { mapTechnicianToUnifiedEntityData } from "./unifiedEntityMappers";

type TechnicianShowcaseCardProps = {
  "aria-label"?: string;
  className?: string;
  detailTo?: string;
  directService?: ServiceItem;
  fallbackServices?: ServiceItem[];
  formalActionSlot?: ReactNode;
  formalData?: TechnicianShowcaseFormalData;
  language: Language;
  metricLayout?: "cluster" | "split";
  onSelect?: () => void;
  rankIndex: number;
  selected?: boolean;
  selectionActiveIcon?: IconName;
  selectionAriaLabel?: string;
  selectionDisabled?: boolean;
  selectionInactiveIcon?: IconName;
  technician: Technician;
};

export type TechnicianShowcaseFormalData = {
  acceptanceRatePercent?: number;
  age?: number | null;
  avatarUrl?: string | null;
  city?: string;
  completedOrderCount?: number;
  displayName?: string;
  distanceKm?: number;
  favoriteCount?: number;
  isFavorited?: boolean;
  languages?: string[];
  nearbyRank?: 1 | 2 | 3 | null;
  primaryService?: {
    currency: string;
    durationMinutes: number;
    name: string;
    priceAmount: string;
  } | null;
  ratingAverage?: string;
  reviewCount?: number;
  shareCount?: number;
};

type TechnicianCardRankBadge = {
  id: string;
  kind: "rank";
  label: string;
  rank: 1 | 2 | 3;
};

type TechnicianPublicProfileReference = Pick<Technician, "id"> &
  Partial<Pick<Technician, "systemId">>;

export function getTechnicianPublicProfileId(
  technician: TechnicianPublicProfileReference,
) {
  const publicId = technician.systemId?.trim();
  return publicId && /^s\d{10}$/u.test(publicId) ? publicId : technician.id;
}

export function getTechnicianDynamicPath(
  technician: TechnicianPublicProfileReference,
) {
  return getScopedTechnicianDynamicPath("user", technician);
}

export function getScopedTechnicianDynamicPath(
  scope: "user" | "merchant" | "technician",
  technician: TechnicianPublicProfileReference,
) {
  return getScopedProfileDetailPath(
    scope,
    "technician",
    getTechnicianPublicProfileId(technician),
  );
}

function getStableBucketFromText(value: string) {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) % 9973;
  }
  return hash % 5;
}

export function shouldShowTechnicianBeginnerIcon(
  technician: Pick<Technician, "id" | "name"> &
    Partial<Pick<Technician, "nickname">>,
) {
  const numericSuffix = technician.id.match(/\d+$/)?.[0];
  if (numericSuffix) return Number.parseInt(numericSuffix, 10) % 5 === 1;
  return (
    getStableBucketFromText(
      `${technician.id || ""}${technician.nickname || ""}${technician.name || ""}`,
    ) === 0
  );
}

export function getTechnicianCardRankBadge(
  rankIndex: number,
): TechnicianCardRankBadge | null {
  const rank = rankIndex + 1;
  if (rank !== 1 && rank !== 2 && rank !== 3) return null;
  return { id: `rank-${rank}`, kind: "rank", label: `Best${rank}`, rank };
}

function buildUnifiedData(
  technician: Technician,
  formalData?: TechnicianShowcaseFormalData,
): UnifiedEntityInfoCardData {
  const mapped = mapTechnicianToUnifiedEntityData(technician);
  if (!formalData) return mapped;

  const parsedRating = Number.parseFloat(formalData.ratingAverage ?? "");
  return {
    ...mapped,
    name: formalData.displayName?.trim() || technician.name,
    imageUrl: formalData.avatarUrl?.trim() || null,
    description: [technician.bio, formalData.city].filter(Boolean).join(" · ") || null,
    languages: formalData.languages ?? technician.languages,
    rating: Number.isFinite(parsedRating) ? parsedRating : null,
    reviewCount: formalData.reviewCount ?? null,
    completedOrderCount: formalData.completedOrderCount ?? technician.orderCount,
    distanceKm: formalData.distanceKm ?? technician.distanceKm ?? null,
    favoriteCount: formalData.favoriteCount ?? null,
    isFavorited: formalData.isFavorited,
    shareCount: formalData.shareCount ?? null,
  };
}

/**
 * Legacy recommendation entry point retained for call-site compatibility.
 * It intentionally delegates to the only simplified technician-card design.
 */
export function TechnicianShowcaseCard({
  className,
  detailTo,
  formalActionSlot,
  formalData,
  onSelect,
  selected,
  selectionActiveIcon = "check",
  selectionAriaLabel,
  selectionDisabled = false,
  selectionInactiveIcon = "plus",
  technician,
}: TechnicianShowcaseCardProps) {
  const location = useLocation();
  const currentScope = location.pathname.startsWith("/merchant/")
    ? "merchant"
    : location.pathname.startsWith("/technician/")
      ? "technician"
      : "user";
  const data = buildUnifiedData(technician, formalData);
  const detailHref =
    detailTo ?? getScopedTechnicianDynamicPath(currentScope, technician);
  const selectionAction = onSelect ? (
    <button
      aria-disabled={selectionDisabled}
      aria-label={
        selectionAriaLabel ?? (selected ? "已选技师" : "待选技师")
      }
      aria-pressed={selected}
      className={cn(
        "grid h-11 w-11 place-items-center rounded-full border border-[#648f25] bg-[#07181b] text-[#b8ff4a] shadow-lg",
        selectionDisabled && "cursor-not-allowed opacity-55",
        selected && "bg-[#b8ff4a] text-[#031014]",
      )}
      disabled={selectionDisabled}
      onClick={onSelect}
      type="button"
    >
      <AppIcon
        className="h-5 w-5"
        name={selected ? selectionActiveIcon : selectionInactiveIcon}
      />
    </button>
  ) : undefined;

  return (
    <UnifiedEntityInfoCard
      actionSlot={
        selectionAction ?? (data.engagementTarget ? undefined : formalActionSlot)
      }
      className={className}
      data={data}
      detailTo={detailHref}
    />
  );
}
