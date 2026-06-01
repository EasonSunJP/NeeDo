import { Link } from "react-router-dom";
import { AppIcon, IconMetricAction, type IconName } from "../../components/client-ui/AppScaffold";
import { translateText, type Language } from "../../i18n/translations";
import { getGeneratedImageThumbnailUrl } from "../../lib/imageThumbnails";
import { cn } from "../../lib/utils";
import type { ServiceItem, Technician } from "../../types/domain";
import { SimpleRatingBadge } from "./SimpleRatingBadge";

type TechnicianShowcaseCardProps = {
  "aria-label"?: string;
  className?: string;
  detailTo?: string;
  directService?: ServiceItem;
  fallbackServices?: ServiceItem[];
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

type TechnicianCardBadge =
  | {
      id: string;
      kind: "rank";
      label: string;
      rank: 1 | 2 | 3;
    }
  | {
      id: string;
      kind: "newcomer";
      label: string;
    };

const beginnerMarkIconSrc = "/images/icons/profile/needo_beginner_mark_icon.png";

function formatTechnicianCardRating(value: number) {
  const normalized = Number.isFinite(value) && value > 0 ? value : 0;
  return normalized > 5 ? normalized / 2 : normalized;
}

function formatCardYen(value: number) {
  return `¥${Math.max(0, Math.round(value)).toLocaleString("ja-JP")}`;
}

function getTechnicianDisplayName(technician: Technician) {
  return technician.nickname?.trim() || technician.name;
}

function getTechnicianPhoto(technician: Technician) {
  return technician.avatar || technician.gallery?.[0];
}

function getTechnicianCardFavoriteCount(technician: Technician) {
  return Math.max(0, technician.orderCount);
}

function getTechnicianCardShareCount() {
  return 0;
}

export function getTechnicianDynamicPath(technician: Technician) {
  return `/profiles/technician/${technician.id}`;
}

function getStableBucketFromText(value: string) {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) % 9973;
  }

  return hash % 5;
}

export function shouldShowTechnicianBeginnerIcon(technician: Pick<Technician, "id" | "name"> & Partial<Pick<Technician, "nickname">>) {
  const numericSuffix = technician.id.match(/\d+$/)?.[0];

  if (numericSuffix) {
    return Number.parseInt(numericSuffix, 10) % 5 === 1;
  }

  const seed = `${technician.id || ""}${technician.nickname || ""}${technician.name || ""}`;
  return getStableBucketFromText(seed) === 0;
}

function getTechnicianCardCopy(language: Language) {
  if (language === "zh-Hant") {
    return {
      acceptRate: "接單率",
      available: "可預約",
      bookingConfirm: "預約確認中",
      inexperienced: "未經驗",
      newcomer: "新人",
      off: "休息中",
      recommended: "推薦",
      recommendedService: "推薦服務",
      serviceFallback: "預約服務",
      favorite: "收藏",
      minuteSuffix: "分鐘",
      pricePending: "價格待確認",
      share: "分享",
      taxSuffix: "含稅",
      tokyo: "東京"
    };
  }

  if (language === "ja") {
    return {
      acceptRate: "注文受入率",
      available: "予約可能です",
      bookingConfirm: "予約確認中",
      inexperienced: "未経験",
      newcomer: "新人",
      off: "休憩中",
      recommended: "おすすめ",
      recommendedService: "おすすめサービス",
      serviceFallback: "予約サービス",
      favorite: "保存",
      minuteSuffix: "分",
      pricePending: "価格確認中",
      share: "共有",
      taxSuffix: "税込",
      tokyo: "東京"
    };
  }

  if (language === "en") {
    return {
      acceptRate: "acceptance",
      available: "Bookable",
      bookingConfirm: "Confirm booking",
      inexperienced: "Newcomer",
      newcomer: "New",
      off: "Off",
      recommended: "Recommended",
      recommendedService: "Recommended service",
      serviceFallback: "Bookable service",
      favorite: "Favorite",
      minuteSuffix: "min",
      pricePending: "Price pending",
      share: "Share",
      taxSuffix: "tax included",
      tokyo: "Tokyo"
    };
  }

  if (language === "ko") {
    return {
      acceptRate: "수락률",
      available: "예약 가능",
      bookingConfirm: "예약 확인 중",
      inexperienced: "미경험",
      newcomer: "신규",
      off: "휴식 중",
      recommended: "추천",
      recommendedService: "추천 서비스",
      serviceFallback: "예약 서비스",
      favorite: "저장",
      minuteSuffix: "분",
      pricePending: "가격 확인 중",
      share: "공유",
      taxSuffix: "세금 포함",
      tokyo: "도쿄"
    };
  }

  return {
    acceptRate: "接单率",
    available: "可预约",
    bookingConfirm: "预约确认中",
    inexperienced: "未经验",
    newcomer: "新人",
    off: "休息中",
    recommended: "推荐",
    recommendedService: "推荐服务",
    serviceFallback: "预约服务",
    favorite: "收藏",
    minuteSuffix: "分钟",
    pricePending: "价格待确认",
    share: "分享",
    taxSuffix: "含税",
    tokyo: "东京"
  };
}

function localizeTechnicianCardText(value: string, language: Language) {
  const normalized = value.trim().toLowerCase();
  const copy = getTechnicianCardCopy(language);

  if (normalized === "tokyo" || normalized === "東京") {
    return copy.tokyo;
  }

  if (normalized === "kitchen") {
    if (language === "zh-Hant") return "廚衛清潔";
    if (language === "ja") return "キッチン";
    if (language === "ko") return "주방";
    if (language === "en") return "kitchen";
    return "厨卫清洁";
  }

  if (normalized === "clean") {
    if (language === "zh-Hant") return "清潔";
    if (language === "ja") return "清掃";
    if (language === "ko") return "청소";
    if (language === "en") return "clean";
    return "清洁";
  }

  return translateText(value, language);
}

export function getTechnicianCardRankBadge(rankIndex: number): Extract<TechnicianCardBadge, { kind: "rank" }> | null {
  const rank = rankIndex + 1;

  if (rank !== 1 && rank !== 2 && rank !== 3) {
    return null;
  }

  return {
    id: `rank-${rank}`,
    kind: "rank",
    label: `Best${rank}`,
    rank
  };
}

function buildTechnicianCardBadges(technician: Technician, rankIndex: number, language: Language) {
  const isNewToPlatform = technician.reviewCount <= 3 || technician.orderCount <= 3;
  const copy = getTechnicianCardCopy(language);
  const rankBadge = getTechnicianCardRankBadge(rankIndex);
  const badges: TechnicianCardBadge[] = rankBadge ? [rankBadge] : [];

  if (!rankBadge && isNewToPlatform) {
    badges.push({
      id: "newcomer",
      kind: "newcomer",
      label: copy.newcomer
    });
  }

  return badges.slice(0, 5);
}

const topRankIconSrcByRank: Record<1 | 2 | 3, string> = {
  1: "/images/icons/ranking/needo_rank_1_icon_transparent.png",
  2: "/images/icons/ranking/needo_rank_2_icon_transparent.png",
  3: "/images/icons/ranking/needo_rank_3_icon_transparent.png"
};

function TopRankImageBadge({ label, rank }: { label: string; rank: 1 | 2 | 3 }) {
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
        style={{ filter: "drop-shadow(0 0 1px rgba(0,0,0,0.95)) drop-shadow(0 0 2px rgba(0,0,0,0.72))" }}
      />
    </span>
  );
}

function TextStatusBadge({ label }: { label: string }) {
  return (
    <span
      className="inline-flex h-6 items-center rounded-full bg-black/70 px-2 text-[10px] font-black leading-none text-white shadow-[0_8px_18px_rgba(0,0,0,0.22)] backdrop-blur-md"
      title={label}
    >
      {label}
    </span>
  );
}

function TechnicianCardBadgeView({ badge }: { badge: TechnicianCardBadge }) {
  if (badge.kind === "rank") {
    return <TopRankImageBadge label={badge.label} rank={badge.rank} />;
  }

  return <TextStatusBadge label={badge.label} />;
}

function normalizeCardText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function scoreServiceForTechnician(service: ServiceItem, technician: Technician) {
  const serviceText = [service.name, service.summary, ...service.tags, ...service.serviceAreas].map(normalizeCardText).join("|");
  const targets = [technician.name, technician.nickname ?? "", ...technician.skills, ...(technician.profileTags ?? []), ...technician.serviceAreas]
    .map(normalizeCardText)
    .filter(Boolean);

  return targets.reduce((total, target) => total + Number(Boolean(target && serviceText.includes(target))), 0);
}

function getRecommendedServiceForTechnician(technician: Technician, directService?: ServiceItem, fallbackServices: ServiceItem[] = []) {
  if (directService) {
    return directService;
  }

  return (
    [...fallbackServices].sort((left, right) => scoreServiceForTechnician(right, technician) - scoreServiceForTechnician(left, technician))[0] ??
    null
  );
}

export function TechnicianShowcaseCard({
  "aria-label": ariaLabel,
  className,
  detailTo,
  directService,
  fallbackServices = [],
  language,
  metricLayout = "cluster",
  onSelect,
  rankIndex,
  selected,
  selectionActiveIcon = "check",
  selectionAriaLabel,
  selectionDisabled = false,
  selectionInactiveIcon = "plus",
  technician
}: TechnicianShowcaseCardProps) {
  const recommendedService = getRecommendedServiceForTechnician(technician, directService, fallbackServices);
  const copy = getTechnicianCardCopy(language);
  const displayName = getTechnicianDisplayName(technician);
  const topBadges = buildTechnicianCardBadges(technician, rankIndex, language);
  const primarySkill = localizeTechnicianCardText(technician.skills[0] ?? technician.profileTags?.[0] ?? copy.serviceFallback, language);
  const areaLabel = localizeTechnicianCardText(technician.serviceAreas[0] ?? copy.tokyo, language);
  const statusLabel = technician.status === "available" ? copy.available : technician.status === "busy" ? copy.bookingConfirm : copy.off;
  const packageInfo = recommendedService?.packages[0];
  const price = packageInfo?.price ?? recommendedService?.priceFrom ?? Number.parseInt(technician.bidBudgetMin ?? "", 10);
  const duration = packageInfo?.durationMinutes ?? 60;
  const priceLabel = Number.isFinite(price) && price > 0 ? formatCardYen(price) : copy.pricePending;
  const serviceName = localizeTechnicianCardText(recommendedService?.name ?? primarySkill, language);
  const detailHref = detailTo ?? getTechnicianDynamicPath(technician);
  const selectionLabel = selectionAriaLabel ?? ariaLabel ?? (selected ? "已选技师" : "待选技师");
  const selectionIconName = selected ? selectionActiveIcon : selectionInactiveIcon;
  const favoriteCount = getTechnicianCardFavoriteCount(technician);
  const shareCount = getTechnicianCardShareCount();
  const showBeginnerIcon = shouldShowTechnicianBeginnerIcon(technician);
  const ageLabel = technician.age
    ? language === "zh-Hant"
      ? `${technician.age}歲`
      : language === "ja"
        ? `${technician.age}歳`
        : language === "ko"
          ? `${technician.age}세`
          : language === "en"
            ? `${technician.age}`
            : `${technician.age}岁`
    : "";
  const cardClassName = cn(
    "group block overflow-hidden rounded-[12px] border border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_94%,transparent)] text-left shadow-[0_16px_34px_rgba(0,0,0,0.16)] transition",
    typeof selected === "boolean" && selected
      ? "border-[color:color-mix(in_srgb,var(--client-primary)_72%,transparent)] shadow-[0_18px_42px_color-mix(in_srgb,var(--client-primary)_18%,transparent)]"
      : "",
    className
  );
  const photoContent = (
    <div className="relative aspect-[3/4] min-h-[228px] overflow-hidden bg-black">
      <img
        alt={displayName}
        className="absolute inset-0 h-full w-full scale-[1.035] object-cover transition duration-300 group-hover:scale-[1.06]"
        src={getGeneratedImageThumbnailUrl(getTechnicianPhoto(technician))}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/18 via-transparent to-black/10" />
      <div className="absolute inset-x-0 bottom-0 h-[48%] bg-gradient-to-t from-black/84 via-black/48 to-transparent" />

      {metricLayout === "split" ? (
        <div className="absolute left-2 right-[5px] top-2 z-20 flex items-start justify-between gap-1">
          <SimpleRatingBadge compact value={formatTechnicianCardRating(technician.rating).toFixed(1)} />
          <div className="flex shrink-0 items-start -space-x-[4px]">
            <IconMetricAction
              count={favoriteCount}
              icon="heart"
              label={`${copy.favorite} ${favoriteCount}`}
              size="cluster"
            />
            <IconMetricAction
              count={shareCount}
              icon="share"
              label={`${copy.share} ${shareCount}`}
              size="cluster"
            />
          </div>
        </div>
      ) : (
        <div className="absolute left-2 top-2 z-20 flex max-w-[calc(100%-16px)] items-start -space-x-[4px]">
          <SimpleRatingBadge compact value={formatTechnicianCardRating(technician.rating).toFixed(1)} />
          <IconMetricAction
            count={favoriteCount}
            icon="heart"
            label={`${copy.favorite} ${favoriteCount}`}
            size="cluster"
          />
          <IconMetricAction
            count={shareCount}
            icon="share"
            label={`${copy.share} ${shareCount}`}
            size="cluster"
          />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 px-3 pb-3 pt-12 text-white">
        {topBadges.length > 0 ? (
          <div className="-ml-1 mb-2 flex items-center gap-1" data-no-i18n>
            {topBadges.map((badge) => (
              <TechnicianCardBadgeView badge={badge} key={badge.id} />
            ))}
          </div>
        ) : null}
        <h3 className="flex min-w-0 items-center text-[17px] font-black leading-6">
          {showBeginnerIcon ? (
            <img
              alt=""
              aria-hidden="true"
              className="h-[18px] w-[18px] shrink-0 object-contain"
              draggable={false}
              src={beginnerMarkIconSrc}
            />
          ) : null}
          <span className={cn("min-w-0 truncate", showBeginnerIcon ? "ml-1.5" : "")}>{displayName}</span>
        </h3>
        <p className="mt-1 line-clamp-1 text-[12px] font-bold text-white/86">
          {[ageLabel, technician.height ?? "", primarySkill, areaLabel].filter(Boolean).join(" / ")}
        </p>
        <p className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-white/72">
          {statusLabel} · {copy.acceptRate} {technician.acceptRate}%
        </p>
      </div>
    </div>
  );
  const detailContent = (
    <div className="relative px-3 py-3 text-left">
      <p className="text-[10px] font-black uppercase leading-none text-[color:var(--client-primary)]" data-no-i18n>
        {copy.recommendedService}
      </p>
      <h4 className="mt-1.5 line-clamp-1 text-[13px] font-black leading-5 text-[color:var(--client-text)]">
        {serviceName}
      </h4>
      <p className="mt-1 flex min-w-0 items-baseline justify-start gap-1 text-[12px] font-semibold text-[color:var(--client-muted)]">
        <strong className="text-[17px] font-black text-[color:var(--client-text)]">{priceLabel}</strong>
        <span className="min-w-0 truncate">/ {duration}{copy.minuteSuffix}({copy.taxSuffix})</span>
      </p>
    </div>
  );
  return onSelect ? (
    <div className={cardClassName}>
      <div className="relative">
        <Link aria-label={`查看${displayName}动态`} className="block active:scale-[0.99]" to={detailHref}>
          {photoContent}
        </Link>
        {typeof selected === "boolean" ? (
          <button
            aria-disabled={selectionDisabled}
            aria-label={selectionLabel}
            aria-pressed={selected}
            className={cn(
              "absolute bottom-2 right-2 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-md transition active:scale-95 disabled:cursor-not-allowed",
              selectionDisabled
                ? "border-white/46 bg-black/42 text-[#ff5f6e] shadow-[0_8px_20px_rgba(0,0,0,0.22)]"
                : selected
                ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[#06100b] shadow-[0_8px_20px_color-mix(in_srgb,var(--client-primary)_40%,transparent)]"
                : "border-white/58 bg-black/38 text-white/78 shadow-[0_8px_20px_rgba(0,0,0,0.22)]"
            )}
            disabled={selectionDisabled}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (selectionDisabled) {
                return;
              }
              onSelect();
            }}
            type="button"
          >
            <AppIcon className="h-5 w-5" name={selectionIconName} />
          </button>
        ) : null}
      </div>
      <Link aria-label={`查看${displayName}动态`} className="block active:scale-[0.99]" to={detailHref}>
        {detailContent}
      </Link>
    </div>
  ) : (
    <Link
      className={cardClassName}
      to={detailHref}
    >
      {photoContent}
      {detailContent}
    </Link>
  );
}
