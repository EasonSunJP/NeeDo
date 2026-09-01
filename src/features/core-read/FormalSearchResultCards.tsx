import { Link } from "react-router-dom";
import { AppIcon, type IconName } from "../../components/client-ui/AppScaffold";
import { translateText, type Language } from "../../i18n/translations";
import { getGeneratedImageThumbnailUrl } from "../../lib/imageThumbnails";
import { cn } from "../../lib/utils";
import type { CoreShopCard, CoreTechnicianCard } from "./api";

const technicianFallbackImage = "/images/generated/profiles/ai-profile-01.jpg";
const shopFallbackImage = "/images/generated/stores/store-cafe-consult.jpg";

const rankImageByRank: Record<1 | 2 | 3, string> = {
  1: "/images/icons/ranking/needo_rank_1_icon_transparent.png",
  2: "/images/icons/ranking/needo_rank_2_icon_transparent.png",
  3: "/images/icons/ranking/needo_rank_3_icon_transparent.png"
};

export function formatCompactEngagementCount(value: number) {
  const count = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return count < 1000 ? String(count) : `${Math.floor(count / 1000)}k`;
}

function formatRating(value: string) {
  const rating = Number.parseFloat(value);
  return Number.isFinite(rating) ? rating.toFixed(1) : "0.0";
}

function formatPrice(value: string, currency: string) {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return null;
  const formatted = Math.max(0, Math.round(amount)).toLocaleString("ja-JP");
  return currency.toUpperCase() === "JPY" ? `¥${formatted}` : `${currency.toUpperCase()} ${formatted}`;
}

function getNearbyRankLabel(rank: 1 | 2 | 3, language: Language) {
  if (language === "ja") return `近隣第${rank}位`;
  if (language === "en") return `Nearby rank ${rank}`;
  if (language === "ko") return `인근 ${rank}위`;
  if (language === "zh-Hant") return `附近第${rank}名`;
  return `附近第${rank}名`;
}

function SearchCardMetric({
  count,
  icon,
  label
}: {
  count: number;
  icon: Extract<IconName, "heart" | "share">;
  label: string;
}) {
  const formatted = formatCompactEngagementCount(count);

  return (
    <span
      aria-label={`${label} ${formatted}`}
      className="inline-flex min-w-7 flex-col items-center gap-0.5 text-white"
      title={`${label} ${formatted}`}
    >
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_62%,transparent)] bg-black/55 text-[color:var(--client-primary)] backdrop-blur-md">
        <AppIcon className="h-4 w-4" name={icon} />
      </span>
      <span className="text-[10px] font-black leading-none tabular-nums">{formatted}</span>
    </span>
  );
}

function SearchCardRating({ value }: { value: string }) {
  return (
    <span className="inline-flex h-8 min-w-12 items-center justify-center rounded-full bg-white/90 px-2.5 text-[12px] font-black tabular-nums text-[#26323a] shadow-[0_8px_18px_rgba(0,0,0,0.22)]">
      {formatRating(value)}
    </span>
  );
}

export function FormalTechnicianSearchCard({
  className,
  language,
  profile
}: {
  className?: string;
  language: Language;
  profile: CoreTechnicianCard;
}) {
  const primaryService = profile.primaryService;
  const price = primaryService
    ? formatPrice(primaryService.priceAmount, primaryService.currency)
    : null;
  const cityAndAge = profile.age === null ? profile.city : `${profile.age} / ${profile.city}`;
  const favoriteLabel = translateText("收藏", language);
  const shareLabel = translateText("分享", language);
  const acceptanceLabel = translateText("接单率", language);
  const recommendedServiceLabel = translateText("推荐服务", language);
  const availableLabel = translateText("可预约", language);
  const minuteLabel = translateText("分钟", language);
  const taxLabel = translateText("含税", language);

  return (
    <Link
      aria-label={`${translateText("技师", language)} ${profile.displayName}`}
      className={cn(
        "group block min-w-0 overflow-hidden rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[#13222c] shadow-[0_18px_38px_rgba(0,0,0,0.18)] outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--client-primary)]",
        className
      )}
      data-search-entity="technician"
      to={`/profiles/technician/${profile.id}`}
    >
      <div className="relative aspect-[0.78] min-h-[214px] overflow-hidden bg-[#071016]">
        <img
          alt={profile.displayName}
          className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.025]"
          src={getGeneratedImageThumbnailUrl(profile.avatarUrl ?? technicianFallbackImage)}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(1,8,12,0.08)_34%,rgba(1,8,12,0.92)_100%)]" />

        <div className="absolute inset-x-2 top-2 z-10 flex items-start justify-between gap-2">
          <SearchCardRating value={profile.reviewSummary.ratingAverage} />
          <span className="flex items-start gap-1">
            <SearchCardMetric count={profile.favoriteCount} icon="heart" label={favoriteLabel} />
            <SearchCardMetric count={profile.shareCount} icon="share" label={shareLabel} />
          </span>
        </div>

        <div className="absolute inset-x-3 bottom-3 z-10 min-w-0">
          {profile.nearbyRank ? (
            <span
              aria-label={getNearbyRankLabel(profile.nearbyRank, language)}
              className="mb-1.5 inline-flex h-11 w-11 items-center justify-center"
              title={getNearbyRankLabel(profile.nearbyRank, language)}
            >
              <img
                alt=""
                aria-hidden="true"
                className="h-full w-full origin-center scale-[1.4] object-contain drop-shadow-[0_3px_3px_rgba(0,0,0,0.76)]"
                src={rankImageByRank[profile.nearbyRank]}
              />
            </span>
          ) : null}
          <h4 className="line-clamp-2 text-[17px] font-black leading-[1.05] tracking-[-0.02em] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
            {profile.displayName}
          </h4>
          <p className="mt-1.5 line-clamp-1 text-[11px] font-bold text-white/90">{cityAndAge}</p>
          <p className="mt-0.5 text-[10px] font-black text-white">
            {availableLabel} · {acceptanceLabel} {profile.acceptanceRatePercent.toFixed(0)}%
          </p>
        </div>
      </div>

      <div className="min-h-[104px] space-y-1.5 bg-[#13222c] px-3 py-3">
        {primaryService ? (
          <>
            <p className="text-[10px] font-black text-[color:var(--client-primary)]">{recommendedServiceLabel}</p>
            <p className="line-clamp-1 text-[13px] font-bold text-white">{primaryService.name}</p>
            <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
              {price ? <strong className="text-[17px] font-black tracking-[-0.02em] text-white">{price}</strong> : null}
              <span className="text-[10px] font-bold text-white/55">
                {primaryService.durationMinutes}{minuteLabel}({taxLabel})
              </span>
            </div>
          </>
        ) : (
          <p className="pt-4 text-[12px] font-black text-[color:var(--client-primary)]">{availableLabel}</p>
        )}
      </div>
    </Link>
  );
}

export function FormalShopSearchCard({
  className,
  language,
  profile
}: {
  className?: string;
  language: Language;
  profile: CoreShopCard;
}) {
  const favoriteLabel = translateText("收藏", language);
  const shareLabel = translateText("分享", language);

  return (
    <Link
      aria-label={`${translateText("店铺", language)} ${profile.name}`}
      className={cn(
        "group block min-w-0 overflow-hidden rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[#13222c] shadow-[0_20px_42px_rgba(0,0,0,0.18)] outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--client-primary)]",
        className
      )}
      data-search-entity="shop"
      to={`/stores/${profile.id}`}
    >
      <div className="relative min-h-[174px] overflow-hidden bg-[#06110d] px-4 pb-3 pt-3">
        <div className="absolute inset-0 opacity-45 [background-image:repeating-linear-gradient(116deg,rgba(175,255,47,0.08)_0,rgba(175,255,47,0.08)_1px,transparent_1px,transparent_7px)]" />
        <div className="relative z-10 flex items-start justify-between gap-2">
          <SearchCardRating value={profile.reviewSummary.ratingAverage} />
          <span className="flex items-start gap-1.5">
            <SearchCardMetric count={profile.favoriteCount} icon="heart" label={favoriteLabel} />
            <SearchCardMetric count={profile.shareCount} icon="share" label={shareLabel} />
          </span>
        </div>

        <div className="relative z-10 mt-2 grid grid-cols-[42%_1fr] items-center gap-3">
          <div className="aspect-square overflow-hidden rounded-[24px] bg-black shadow-[0_14px_28px_rgba(0,0,0,0.34)]">
            <img
              alt={profile.name}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.025]"
              src={getGeneratedImageThumbnailUrl(profile.coverUrl ?? shopFallbackImage)}
            />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-start gap-2">
              <h4 className="line-clamp-2 min-w-0 text-[18px] font-black leading-[1.08] tracking-[-0.025em] text-white">
                {profile.name}
              </h4>
              <span className="mt-0.5 shrink-0 rounded-full bg-white/10 px-2 py-1 text-[10px] font-black text-white">
                {translateText("店铺", language)}
              </span>
            </div>
            <p className="mt-3 line-clamp-3 text-[11px] font-bold leading-5 text-white/55">
              {profile.city} · {profile.address}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2.5 border-t border-white/5 bg-[#13222c] px-4 py-3">
        <p className="line-clamp-2 text-[12px] font-bold leading-5 text-white/66">{profile.address}</p>
        {profile.businessKeywords.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {profile.businessKeywords.slice(0, 5).map((keyword) => (
              <span
                className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-black text-white/70"
                key={keyword.id}
              >
                {keyword.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
