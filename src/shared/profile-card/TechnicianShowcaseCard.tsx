import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AppIcon,
  IconMetricAction,
  type IconName,
} from "../../components/client-ui/AppScaffold";
import { translateText, type Language } from "../../i18n/translations";
import { getGeneratedImageThumbnailUrl } from "../../lib/imageThumbnails";
import { cn } from "../../lib/utils";
import type { ServiceItem, Technician } from "../../types/domain";
import { getScopedProfileDetailPath } from "../profile-detail/paths";
import { SimpleRatingBadge } from "./SimpleRatingBadge";

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

type TechnicianCardBadge =
  | { id: string; kind: "rank"; label: string; rank: 1 | 2 | 3 }
  | { id: string; kind: "newcomer"; label: string };

const beginnerMarkIconSrc = "/images/icons/profile/needo_beginner_mark_icon.png";
const topRankIconSrcByRank: Record<1 | 2 | 3, string> = {
  1: "/images/icons/ranking/needo_rank_1_icon_transparent.png",
  2: "/images/icons/ranking/needo_rank_2_icon_transparent.png",
  3: "/images/icons/ranking/needo_rank_3_icon_transparent.png",
};

const formatTechnicianCardRating = (value: number) => {
  const normalized = Number.isFinite(value) && value > 0 ? value : 0;
  return normalized > 5 ? normalized / 2 : normalized;
};

const normalizeCount = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : null;

const formatPrice = (value: string, currency: string) => {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return null;
  const formatted = Math.max(0, Math.round(amount)).toLocaleString("ja-JP");
  return currency.toUpperCase() === "JPY"
    ? `¥${formatted}`
    : `${currency.toUpperCase()} ${formatted}`;
};

function getTechnicianCardCopy(language: Language) {
  if (language === "zh-Hant") {
    return { acceptRate: "接單率", available: "可預約", bookingConfirm: "預約確認中", off: "休息中", newcomer: "新人", recommendedService: "推薦服務", serviceFallback: "預約服務", favorite: "收藏", share: "分享", minuteSuffix: "分鐘", taxSuffix: "含稅", tokyo: "東京" };
  }
  if (language === "ja") {
    return { acceptRate: "注文受入率", available: "予約可能です", bookingConfirm: "予約確認中", off: "休憩中", newcomer: "新人", recommendedService: "おすすめサービス", serviceFallback: "予約サービス", favorite: "保存", share: "共有", minuteSuffix: "分", taxSuffix: "税込", tokyo: "東京" };
  }
  if (language === "en") {
    return { acceptRate: "acceptance", available: "Bookable", bookingConfirm: "Confirm booking", off: "Off", newcomer: "New", recommendedService: "Recommended service", serviceFallback: "Bookable service", favorite: "Favorite", share: "Share", minuteSuffix: "min", taxSuffix: "tax included", tokyo: "Tokyo" };
  }
  if (language === "ko") {
    return { acceptRate: "수락률", available: "예약 가능", bookingConfirm: "예약 확인 중", off: "휴식 중", newcomer: "신규", recommendedService: "추천 서비스", serviceFallback: "예약 서비스", favorite: "저장", share: "공유", minuteSuffix: "분", taxSuffix: "세금 포함", tokyo: "도쿄" };
  }
  return { acceptRate: "接单率", available: "可预约", bookingConfirm: "预约确认中", off: "休息中", newcomer: "新人", recommendedService: "推荐服务", serviceFallback: "预约服务", favorite: "收藏", share: "分享", minuteSuffix: "分钟", taxSuffix: "含税", tokyo: "东京" };
}

function localizeCardText(value: string, language: Language) {
  const normalized = value.trim().toLowerCase();
  const copy = getTechnicianCardCopy(language);
  if (normalized === "tokyo" || normalized === "東京") return copy.tokyo;
  if (normalized === "kitchen") {
    return language === "ja" ? "キッチン" : language === "ko" ? "주방" : language === "en" ? "kitchen" : language === "zh-Hant" ? "廚衛清潔" : "厨卫清洁";
  }
  if (normalized === "clean") {
    return language === "ja" ? "清掃" : language === "ko" ? "청소" : language === "en" ? "clean" : language === "zh-Hant" ? "清潔" : "清洁";
  }
  return translateText(value, language);
}

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
): Extract<TechnicianCardBadge, { kind: "rank" }> | null {
  const rank = rankIndex + 1;
  if (rank !== 1 && rank !== 2 && rank !== 3) return null;
  return { id: `rank-${rank}`, kind: "rank", label: `Best${rank}`, rank };
}

function TopRankImageBadge({
  label,
  rank,
}: {
  label: string;
  rank: 1 | 2 | 3;
}) {
  return (
    <span
      aria-label={label}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center"
      title={label}
    >
      <img
        alt=""
        aria-hidden="true"
        className="h-full w-full origin-center scale-[1.56] object-contain"
        draggable={false}
        src={topRankIconSrcByRank[rank]}
        style={{
          filter:
            "drop-shadow(0 0 1px rgba(0,0,0,0.95)) drop-shadow(0 0 2px rgba(0,0,0,0.72))",
        }}
      />
    </span>
  );
}

function normalizeCardText(value: string) {
  return value.toLowerCase().replace(/\s+/gu, "");
}

function scoreServiceForTechnician(
  service: ServiceItem,
  technician: Technician,
) {
  const serviceText = [
    service.name,
    service.summary,
    ...service.tags,
    ...service.serviceAreas,
  ]
    .map(normalizeCardText)
    .join("|");
  return [
    technician.name,
    technician.nickname ?? "",
    ...technician.skills,
    ...(technician.profileTags ?? []),
    ...technician.serviceAreas,
  ]
    .map(normalizeCardText)
    .filter(Boolean)
    .reduce(
      (total, target) => total + Number(serviceText.includes(target)),
      0,
    );
}

function getRecommendedService(
  technician: Technician,
  directService?: ServiceItem,
  fallbackServices: ServiceItem[] = [],
) {
  if (directService) return directService;
  return (
    [...fallbackServices].sort(
      (left, right) =>
        scoreServiceForTechnician(right, technician) -
        scoreServiceForTechnician(left, technician),
    )[0] ?? null
  );
}

export function TechnicianShowcaseCard({
  "aria-label": ariaLabel,
  className,
  detailTo,
  directService,
  fallbackServices = [],
  formalActionSlot,
  formalData,
  language,
  metricLayout = "cluster",
  onSelect,
  rankIndex,
  selected,
  selectionActiveIcon = "check",
  selectionAriaLabel,
  selectionDisabled = false,
  selectionInactiveIcon = "plus",
  technician,
}: TechnicianShowcaseCardProps) {
  const location = useLocation();
  const copy = getTechnicianCardCopy(language);
  const currentScope = location.pathname.startsWith("/merchant/")
    ? "merchant"
    : location.pathname.startsWith("/technician/")
      ? "technician"
      : "user";
  const detailHref =
    detailTo ?? getScopedTechnicianDynamicPath(currentScope, technician);
  const displayName =
    formalData?.displayName?.trim() ||
    technician.nickname?.trim() ||
    technician.name;
  const photoUrl = formalData
    ? formalData.avatarUrl?.trim() || null
    : technician.avatar || technician.gallery?.[0] || null;
  const primaryService = formalData?.primaryService ?? technician.primaryService ?? null;
  const recommendedService = primaryService
    ? null
    : getRecommendedService(technician, directService, fallbackServices);
  const servicePackage = recommendedService?.packages[0];
  const serviceName = localizeCardText(
    primaryService?.name ??
      recommendedService?.name ??
      technician.skills[0] ??
      copy.serviceFallback,
    language,
  );
  const priceLabel = primaryService
    ? formatPrice(primaryService.priceAmount, primaryService.currency)
    : Number.isFinite(servicePackage?.price ?? recommendedService?.priceFrom)
      ? `¥${Math.max(0, Math.round(servicePackage?.price ?? recommendedService?.priceFrom ?? 0)).toLocaleString("ja-JP")}`
      : null;
  const duration =
    primaryService?.durationMinutes ?? servicePackage?.durationMinutes ?? 60;
  const ratingSource =
    formalData?.ratingAverage === undefined
      ? technician.rating
      : Number.parseFloat(formalData.ratingAverage);
  const rating = formatTechnicianCardRating(ratingSource);
  const favoriteCount = formalData
    ? normalizeCount(formalData.favoriteCount)
    : normalizeCount(technician.favoriteCount ?? technician.orderCount);
  const shareCount = formalData
    ? normalizeCount(formalData.shareCount)
    : normalizeCount(technician.shareCount ?? 0);
  const acceptanceRate = formalData
    ? normalizeCount(formalData.acceptanceRatePercent)
    : normalizeCount(technician.acceptRate);
  const statusLabel =
    technician.status === "available"
      ? copy.available
      : technician.status === "busy"
        ? copy.bookingConfirm
        : copy.off;
  const statusLine = [
    statusLabel,
    acceptanceRate === null ? "" : `${copy.acceptRate} ${acceptanceRate}%`,
  ]
    .filter(Boolean)
    .join(" · ");
  const skill = localizeCardText(
    technician.skills[0] ?? technician.profileTags?.[0] ?? copy.serviceFallback,
    language,
  );
  const area = localizeCardText(
    formalData?.city?.trim() || technician.serviceAreas[0] || copy.tokyo,
    language,
  );
  const ageValue = formalData?.age ?? technician.age;
  const age = ageValue
    ? language === "ja"
      ? `${ageValue}歳`
      : language === "ko"
        ? `${ageValue}세`
        : language === "en"
          ? `${ageValue}`
          : `${ageValue}${language === "zh-Hant" ? "歲" : "岁"}`
    : "";
  const rankBadge = getTechnicianCardRankBadge(
    (formalData?.nearbyRank ?? rankIndex + 1) - 1,
  );
  const showBeginner = !rankBadge && shouldShowTechnicianBeginnerIcon(technician);
  const cardClassName = cn(
    "group block overflow-hidden rounded-[12px] border border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_94%,transparent)] text-left shadow-[0_16px_34px_rgba(0,0,0,0.16)] transition",
    selected &&
      "border-[color:color-mix(in_srgb,var(--client-primary)_72%,transparent)] shadow-[0_18px_42px_color-mix(in_srgb,var(--client-primary)_18%,transparent)]",
    className,
  );
  const details = (
    <div className="relative px-3 py-3 text-left">
      <p
        className="text-[10px] font-black uppercase leading-none text-[color:var(--client-primary)]"
        data-no-i18n
      >
        {copy.recommendedService}
      </p>
      <h4 className="mt-1.5 line-clamp-1 text-[13px] font-black leading-5 text-[color:var(--client-text)]">
        {serviceName}
      </h4>
      <p className="mt-1 flex min-w-0 items-baseline gap-1 text-[12px] font-semibold text-[color:var(--client-muted)]">
        {priceLabel ? (
          <strong className="text-[17px] font-black text-[color:var(--client-text)]">
            {priceLabel}
          </strong>
        ) : null}
        <span className="min-w-0 truncate">
          / {duration}{copy.minuteSuffix}({copy.taxSuffix})
        </span>
      </p>
    </div>
  );
  const photo = (
    <div className="relative aspect-[3/4] min-h-[228px] overflow-hidden bg-black">
      {photoUrl ? (
        <img
          alt={displayName}
          className="absolute inset-0 h-full w-full scale-[1.035] object-cover transition duration-300 group-hover:scale-[1.06]"
          src={getGeneratedImageThumbnailUrl(photoUrl)}
        />
      ) : (
        <div
          aria-label={`${displayName} 暂无公开照片`}
          className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_30%_20%,color-mix(in_srgb,var(--client-primary)_24%,transparent),transparent_42%),linear-gradient(145deg,#17242b,#071016)] text-[44px] font-black text-white/72"
          role="img"
        >
          {Array.from(displayName)[0] ?? "·"}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-[48%] bg-gradient-to-t from-black/84 via-black/48 to-transparent" />
      <div
        className={cn(
          "absolute left-2 top-2 z-20 flex items-start justify-between gap-1",
          metricLayout === "split" ? "right-[5px]" : "right-2",
        )}
      >
        <SimpleRatingBadge compact value={rating.toFixed(1)} />
        {formalActionSlot ? null : (
          <div className="flex shrink-0 items-start -space-x-[4px]">
            {favoriteCount === null ? null : (
              <IconMetricAction
                count={favoriteCount}
                icon="heart"
                label={`${copy.favorite} ${favoriteCount}`}
                size="cluster"
              />
            )}
            {shareCount === null ? null : (
              <IconMetricAction
                count={shareCount}
                icon="share"
                label={`${copy.share} ${shareCount}`}
                size="cluster"
              />
            )}
          </div>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 px-3 pb-3 pt-12 text-white">
        {rankBadge ? (
          <div className="-ml-1 mb-2 flex items-center gap-1" data-no-i18n>
            <TopRankImageBadge label={rankBadge.label} rank={rankBadge.rank} />
          </div>
        ) : null}
        <h3 className="flex min-w-0 items-center text-[17px] font-black leading-6">
          {showBeginner ? (
            <img
              alt=""
              aria-hidden="true"
              className="h-[18px] w-[18px] shrink-0 object-contain"
              draggable={false}
              src={beginnerMarkIconSrc}
            />
          ) : null}
          <span className={cn("min-w-0 truncate", showBeginner && "ml-1.5")}>
            {displayName}
          </span>
        </h3>
        <p className="mt-1 line-clamp-1 text-[12px] font-bold text-white/86">
          {[age, technician.height ?? "", skill, area].filter(Boolean).join(" / ")}
        </p>
        <p className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-white/72">
          {statusLine}
        </p>
      </div>
    </div>
  );
  const photoSection = (
    <div className="relative">
      <Link
        aria-label={`查看${displayName}详情`}
        className="block w-full text-left active:scale-[0.99]"
        to={detailHref}
      >
        {photo}
      </Link>
      {formalActionSlot ? (
        <div className="absolute right-2 top-2 z-30">{formalActionSlot}</div>
      ) : null}
      {onSelect ? (
        <button
          aria-disabled={selectionDisabled}
          aria-label={selectionAriaLabel ?? ariaLabel ?? (selected ? "已选技师" : "待选技师")}
          aria-pressed={selected}
          className={cn(
            "absolute bottom-2 right-2 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-md transition active:scale-95 disabled:cursor-not-allowed",
            selectionDisabled
              ? "border-white/46 bg-black/42 text-[#ff5f6e]"
              : selected
                ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[#06100b]"
                : "border-white/58 bg-black/38 text-white/78",
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
      ) : null}
    </div>
  );

  return (
    <div className={cardClassName} data-testid="technician-showcase-card">
      {photoSection}
      <Link
        aria-label={`查看${displayName}详情`}
        className="block active:scale-[0.99]"
        to={detailHref}
      >
        {details}
      </Link>
    </div>
  );
}
