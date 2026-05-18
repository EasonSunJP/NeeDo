import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { getGeneratedImageThumbnailUrl } from "../../lib/imageThumbnails";
import { cn } from "../../lib/utils";
import type { InfoCardData, InfoCardVariant } from "./types";
import {
  formatInfoCardCompactRating,
  formatInfoCardRating,
  getInfoCardAvatarImage,
  getInfoCardFallbackLabel,
  getInfoCardMetaLines,
  getInfoCardMetricList,
  getInfoCardPrimaryImage,
  getInfoCardPreviewTags,
  getInfoCardSummaryText,
  getInfoCardToneClasses
} from "./utils";

type BaseInfoCardProps = {
  data: InfoCardData;
  variant: InfoCardVariant;
  dark?: boolean;
  className?: string;
  detailTo?: string;
  onOpenDetails?: () => void;
  actionSlot?: ReactNode;
  trailingSlot?: ReactNode;
  footerSlot?: ReactNode;
  maxTags?: number;
};

function InteractiveArea({
  children,
  className,
  detailTo,
  onOpenDetails
}: {
  children: ReactNode;
  className?: string;
  detailTo?: string;
  onOpenDetails?: () => void;
}) {
  if (detailTo) {
    return (
      <Link className={className} to={detailTo}>
        {children}
      </Link>
    );
  }

  if (onOpenDetails) {
    return (
      <button className={className} onClick={onOpenDetails} type="button">
        {children}
      </button>
    );
  }

  return <div className={className}>{children}</div>;
}

function CardBadge({
  dark,
  label,
  tone
}: {
  dark: boolean;
  label: string;
  tone?: "success" | "warning" | "neutral" | "accent";
}) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black", getInfoCardToneClasses(dark, tone))}>
      {label}
    </span>
  );
}

function TagChip({ dark, label, styleMode }: { dark: boolean; label: string; styleMode?: "实心" | "描边" }) {
  const outlined = styleMode === "描边";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold",
        outlined
          ? dark
            ? "border border-white/18 bg-transparent text-white/72"
            : "border border-line bg-transparent text-ink/62"
          : dark
            ? "bg-white/8 text-white/72"
            : "bg-paper text-ink/62"
      )}
    >
      {label}
    </span>
  );
}

function EmptyVisual({ dark, label, roundedClass }: { dark: boolean; label: string; roundedClass: string }) {
  return (
    <div className={cn("grid h-full w-full place-items-center bg-gradient-to-br text-xs font-black tracking-[0.14em]", roundedClass, dark ? "from-[#1f1a14] to-[#0e0c09] text-[#f3cf78]" : "from-[#f6f4ed] to-[#ebe7da] text-moss")}>
      {label}
    </div>
  );
}

function CoverVisual({
  dark,
  image,
  label,
  className,
  style
}: {
  dark: boolean;
  image: string;
  label: string;
  className: string;
  style?: CSSProperties;
}) {
  if (!image) {
    return <EmptyVisual dark={dark} label={label} roundedClass={className} />;
  }

  return <img alt={label} className={cn("object-cover", className)} src={getGeneratedImageThumbnailUrl(image)} style={style} />;
}

function AvatarVisual({
  image,
  label,
  className
}: {
  image: string;
  label: string;
  className: string;
}) {
  return <AvatarImage alt={label} className={className} src={image} />;
}

function renderNearListCard({
  data,
  variant,
  dark,
  className,
  detailTo,
  onOpenDetails,
  actionSlot,
  footerSlot,
  maxTags
}: Omit<BaseInfoCardProps, "trailingSlot"> & { dark: boolean }) {
  const isNearby = variant === "nearby";
  const showStoreVisual = data.entityType === "shop";
  const image = getInfoCardPrimaryImage(data);
  const tags = getInfoCardPreviewTags(data, maxTags ?? 3);
  const metaLines = getInfoCardMetaLines(data);
  const summary = getInfoCardSummaryText(data);
  const ratingText = formatInfoCardRating(data.rating, data.reviewCount);
  const cardUi = data.cardUi;
  const coverHeight = cardUi?.coverHeight ? Number.parseInt(cardUi.coverHeight, 10) : null;
  const coverStyle = showStoreVisual && coverHeight ? { height: `${coverHeight}px` } : undefined;
  const visualClass = showStoreVisual
    ? isNearby
      ? "h-32 w-[132px] rounded-[18px]"
      : "h-28 w-[112px] rounded-[18px]"
    : isNearby
      ? "h-20 w-20 rounded-[18px]"
      : "h-[76px] w-[76px] rounded-[18px]";

  return (
    <article
      className={cn(
        "rounded-[24px] border p-3 shadow-panel",
        dark ? "border-white/10 bg-[#11100d] text-white" : "border-line/90 bg-white text-ink",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <InteractiveArea
          className={cn("min-w-0 flex-1 text-left", detailTo || onOpenDetails ? "focus-ring" : undefined)}
          detailTo={detailTo}
          onOpenDetails={onOpenDetails}
        >
          <div className={cn("grid gap-3", showStoreVisual ? "grid-cols-[132px,1fr]" : "grid-cols-[84px,1fr]", !isNearby && showStoreVisual && "grid-cols-[112px,1fr]")}>
            <CoverVisual
              className={visualClass}
              dark={dark}
              image={image}
              label={data.displayName}
              style={coverStyle}
            />
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {data.subtitle ? (
                    <p className={cn("text-[11px] font-black uppercase tracking-[0.14em]", dark ? "text-white/40" : "text-ink/42")}>{data.subtitle}</p>
                  ) : null}
                  <h3 className={cn("mt-1 font-black", isNearby ? "text-base leading-6" : "text-[15px] leading-6")}>{data.displayName}</h3>
                </div>
                {actionSlot ? <div className="shrink-0">{actionSlot}</div> : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.badgeList.slice(0, 2).map((badge) => (
                  <CardBadge dark={dark} key={`${badge.label}-${badge.tone ?? "neutral"}`} label={badge.label} tone={badge.tone} />
                ))}
              </div>
              <p className={cn("mt-2 text-xs font-bold", dark ? "text-[#f3cf78]" : "text-coral")}>{ratingText}</p>
              {metaLines.map((line) => (
                <p className={cn("mt-1 text-xs", dark ? "text-white/58" : "text-ink/55")} key={line}>
                  {line}
                </p>
              ))}
              {summary ? (
                <p className={cn("mt-2 line-clamp-2 text-xs leading-5", dark ? "text-white/62" : "text-ink/62")}>{summary}</p>
              ) : null}
            </div>
          </div>
        </InteractiveArea>
      </div>

      {(tags.length > 0 || data.nextAvailability || footerSlot) ? (
        <div className={cn("mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3", dark ? "border-white/10" : "border-line")}>
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {tags.map((tag) => (
              <TagChip dark={dark} key={tag} label={tag} styleMode={cardUi?.tagStyle} />
            ))}
          </div>
          {footerSlot ? footerSlot : data.nextAvailability || cardUi?.cta ? (
            <div className="flex shrink-0 items-center gap-2">
              {data.nextAvailability ? (
                <span className={cn("text-xs font-black", dark ? "text-[#90d3b4]" : "text-moss")}>{data.nextAvailability}</span>
              ) : null}
              {cardUi?.cta ? (
                <span className={cn("rounded-full px-3 py-1.5 text-[11px] font-black", dark ? "bg-white/10 text-white" : "bg-moss/10 text-moss")}>
                  {cardUi.cta}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function renderCompactCard({
  data,
  variant,
  dark,
  detailTo,
  onOpenDetails,
  actionSlot,
  trailingSlot,
  className
}: BaseInfoCardProps & { dark: boolean }) {
  const metric = formatInfoCardCompactRating(getInfoCardMetricList(data)[0]);
  const avatar = getInfoCardAvatarImage(data);
  const metaLine = getInfoCardMetaLines(data)[0] || data.region || data.serviceArea || "";
  const shareLabel = variant === "share" ? "分享名片" : null;
  const ctaLabel = data.cardUi?.cta;

  return (
    <article className={cn("rounded-[22px] border px-3 py-2 shadow-panel", dark ? "border-white/10 bg-[#15120f] text-white" : "border-line bg-white text-ink", className)}>
      <div className="flex items-center gap-3">
        <InteractiveArea
          className={cn("flex min-w-0 flex-1 items-center gap-3 text-left", detailTo || onOpenDetails ? "focus-ring" : undefined)}
          detailTo={detailTo}
          onOpenDetails={onOpenDetails}
        >
          {avatar ? (
            <AvatarVisual className="h-14 w-14 shrink-0 rounded-[16px]" image={avatar} label={data.displayName} />
          ) : (
            <EmptyVisual dark={dark} label={getInfoCardFallbackLabel(data)} roundedClass="h-14 w-14 shrink-0 rounded-[16px]" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 truncate text-[16px] font-black leading-none">{data.displayName}</h3>
              {data.badgeList[0] ? <CardBadge dark={dark} label={data.badgeList[0].label} tone={data.badgeList[0].tone} /> : null}
            </div>
            <p className={cn("mt-1.5 truncate text-[12px] leading-none", dark ? "text-white/54" : "text-ink/45")}>
              {shareLabel ? `${shareLabel} · ${metaLine || data.subtitle || ""}` : metaLine || data.subtitle || ""}
            </p>
          </div>
        </InteractiveArea>
        <div className="flex shrink-0 items-center gap-2">
          {metric ? (
            <InteractiveArea
              className={cn("rounded-[14px] px-2.5 py-2 text-right shadow-panel", dark ? "bg-[#0f0f0f] text-[#f3cf78]" : "bg-moss/10 text-moss")}
              detailTo={detailTo}
              onOpenDetails={onOpenDetails}
            >
              <span className={cn("block text-[10px] font-bold leading-none", dark ? "text-white/45" : "text-ink/45")}>{metric.label}</span>
              <span className="mt-1 block text-[12px] font-black leading-none">{metric.value}</span>
            </InteractiveArea>
          ) : null}
          {actionSlot}
          {trailingSlot}
          {ctaLabel ? (
            <span className={cn("rounded-full px-2.5 py-2 text-[10px] font-black leading-none", dark ? "bg-white/10 text-white" : "bg-moss/10 text-moss")}>
              {ctaLabel}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function renderDetailHeaderCard({
  data,
  dark,
  detailTo,
  onOpenDetails,
  actionSlot,
  footerSlot,
  maxTags
}: Omit<BaseInfoCardProps, "variant" | "trailingSlot"> & { dark: boolean }) {
  const avatar = getInfoCardAvatarImage(data);
  const metrics = getInfoCardMetricList(data).slice(0, 3);
  const tags = (data.highlightChips?.length ? data.highlightChips : getInfoCardPreviewTags(data, maxTags ?? 5)).slice(0, 5);

  return (
    <article className={cn("rounded-[30px] border p-4 shadow-soft", dark ? "border-[#45361c]/55 bg-[#14110f] text-white" : "border-line bg-white text-ink")}>
      <div className="flex items-start justify-between gap-3">
        <InteractiveArea
          className={cn("min-w-0 flex-1 text-left", detailTo || onOpenDetails ? "focus-ring" : undefined)}
          detailTo={detailTo}
          onOpenDetails={onOpenDetails}
        >
          <div className="flex items-start gap-3">
            {avatar ? (
              <AvatarVisual className="h-16 w-16 shrink-0 rounded-[18px]" image={avatar} label={data.displayName} />
            ) : (
              <EmptyVisual dark={dark} label={getInfoCardFallbackLabel(data)} roundedClass="h-16 w-16 shrink-0 rounded-[18px]" />
            )}
            <div className="min-w-0 flex-1">
              {data.subtitle ? (
                <p className={cn("text-[11px] font-black uppercase tracking-[0.14em]", dark ? "text-white/44" : "text-ink/42")}>{data.subtitle}</p>
              ) : null}
              <h2 className="mt-1 text-[24px] font-black leading-tight">{data.displayName}</h2>
              <p className={cn("mt-2 text-sm font-bold leading-6", dark ? "text-white/64" : "text-ink/56")}>
                {[data.region, data.priceLabel].filter(Boolean).join(" · ") || getInfoCardSummaryText(data)}
              </p>
            </div>
          </div>
        </InteractiveArea>
        {actionSlot ? <div className="shrink-0">{actionSlot}</div> : null}
      </div>

      {data.badgeList.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {data.badgeList.slice(0, 3).map((badge) => (
            <CardBadge dark={dark} key={`${badge.label}-${badge.tone ?? "neutral"}`} label={badge.label} tone={badge.tone} />
          ))}
        </div>
      ) : null}

      {metrics.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {metrics.map((metric) => (
            <div className={cn("rounded-[22px] px-3.5 py-3", dark ? "bg-[#100d0a]" : "bg-paper")} key={`${metric.label}-${metric.value}`}>
              <p className={cn("text-[11px] font-black uppercase tracking-[0.14em]", dark ? "text-white/42" : "text-ink/42")}>{metric.label}</p>
              <p className="mt-2 text-sm font-black leading-6">{metric.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <TagChip dark={dark} key={tag} label={tag} />
          ))}
        </div>
      ) : null}

      {footerSlot ? <div className="mt-4">{footerSlot}</div> : null}
    </article>
  );
}

export function BaseInfoCard(props: BaseInfoCardProps) {
  const dark = props.dark ?? false;
  const resolvedProps = {
    ...props,
    detailTo: props.detailTo ?? props.data.detailPath
  };

  if (props.variant === "compact" || props.variant === "share") {
    return renderCompactCard({ ...resolvedProps, dark });
  }

  if (props.variant === "detailHeader") {
    return renderDetailHeaderCard({ ...resolvedProps, dark });
  }

  return renderNearListCard({ ...resolvedProps, dark });
}
