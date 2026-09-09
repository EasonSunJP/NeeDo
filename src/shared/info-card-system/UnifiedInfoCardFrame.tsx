import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AppIcon, type IconName } from "../../components/client-ui/AppScaffold";
import type { Language } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import { getUnifiedCardCopy } from "./copy";

export type UnifiedCardMetric = {
  icon: IconName;
  label: string;
  value: ReactNode;
  action?: ReactNode;
};

export function UnifiedDistanceMetricValue({
  value,
}: {
  value: number | null | undefined;
}) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span>-</span>;
  }

  return (
    <span className="inline-flex items-baseline whitespace-nowrap">
      <span data-testid="unified-card-distance-value">
        {value.toFixed(value < 10 ? 1 : 0)}
      </span>
      <span
        className="ml-0.5 text-[8px] sm:text-[11px]"
        data-testid="unified-card-distance-unit"
      >
        km
      </span>
    </span>
  );
}

function UnifiedMetricIcon({ name }: { name: IconName }) {
  return (
    <AppIcon
      className="h-6 w-6 shrink-0 sm:h-8 sm:w-8"
      name={name}
    />
  );
}

export function UnifiedCardMetricRail({
  metrics,
}: {
  metrics: UnifiedCardMetric[];
}) {
  if (metrics.length === 0) return null;
  return (
    <div
      className="pointer-events-none relative z-20 flex items-center px-2 py-1.5 sm:px-5 sm:py-3"
      data-testid="unified-card-metrics"
    >
      {metrics.map((metric, index) => (
        <Fragment key={metric.label}>
          <div aria-label={metric.label} className="relative flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-1.5 px-1 text-[#b8ff4a] sm:min-h-[56px] sm:gap-2 sm:px-3">
            {metric.action ? (
              <div className="pointer-events-auto">{metric.action}</div>
            ) : (
              <UnifiedMetricIcon name={metric.icon} />
            )}
            <div className="flex min-w-0 items-baseline whitespace-nowrap text-[11px] font-black leading-4 text-[#f7f9f7] sm:text-[16px] sm:leading-5">
              {metric.value}
            </div>
          </div>
          {index < metrics.length - 1 ? (
            <span
              aria-hidden="true"
              className="h-7 w-px shrink-0 bg-[#244047] sm:h-10"
              data-testid="unified-card-metric-separator"
            />
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}

export function UnifiedInfoCardFrame({
  actionSlot,
  ariaLabel,
  body,
  className,
  detailTo,
  kind,
  metrics,
  onOpenDetails,
}: {
  actionSlot?: ReactNode;
  ariaLabel: string;
  body: ReactNode;
  className?: string;
  detailTo?: string;
  kind: "service" | "shop" | "technician" | "user";
  metrics?: UnifiedCardMetric[];
  onOpenDetails?: () => void;
}) {
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-[20px] border border-[#244047] bg-[#031014] text-[#f7f9f7] shadow-[0_24px_60px_rgba(0,0,0,0.32)] sm:rounded-[30px]",
        className,
      )}
      data-card-kind={kind}
      data-card-size="default"
      data-testid="unified-info-card"
    >
      <UnifiedCardMetricRail metrics={metrics ?? []} />
      {body}
      {detailTo ? (
        <Link
          aria-label={ariaLabel}
          className="focus-ring absolute inset-0 z-10 rounded-[20px] sm:rounded-[30px]"
          to={detailTo}
        />
      ) : onOpenDetails ? (
        <button
          aria-label={ariaLabel}
          className="focus-ring absolute inset-0 z-10 w-full rounded-[20px] text-left sm:rounded-[30px]"
          onClick={onOpenDetails}
          type="button"
        />
      ) : null}
      {actionSlot ? (
        <div
          className="absolute bottom-2 right-2 z-20 flex items-center gap-1 sm:bottom-3 sm:right-3"
          data-testid="unified-card-actions"
        >
          {actionSlot}
        </div>
      ) : null}
      {!actionSlot && (detailTo || onOpenDetails) ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 right-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-[#b8ff4a] text-[#031014] shadow-[0_0_24px_rgba(184,255,74,0.32)] sm:bottom-5 sm:right-5 sm:h-12 sm:w-12"
          data-icon="chevron-right"
          data-testid="unified-card-detail-arrow"
        >
          <AppIcon className="h-5 w-5 rotate-180 sm:h-7 sm:w-7" name="back" />
        </span>
      ) : null}
    </article>
  );
}

export function UnifiedCardImage({
  alt,
  children,
  language = "zh",
  src,
}: {
  alt: string;
  children?: ReactNode;
  language?: Language;
  src: string | null;
}) {
  const text = getUnifiedCardCopy(language);
  return (
    <div
      className="relative isolate aspect-square min-h-0 overflow-hidden rounded-[18px] bg-[#07181b] sm:rounded-[24px]"
      data-testid="unified-card-image"
    >
      {src ? (
        <img
          alt={alt}
          className="absolute inset-0 h-full w-full scale-[1.015] transform-gpu object-cover"
          loading="lazy"
          src={src}
        />
      ) : (
        <div
          aria-label={`${alt} ${text.noImage}`}
          className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_20%_15%,rgba(184,255,74,0.14),transparent_42%),linear-gradient(145deg,#07181b,#031014)] px-2 text-center text-[9px] font-black text-[#9aacb5] sm:px-4 sm:text-[12px]"
          role="img"
        >
          {text.noImage}
        </div>
      )}
      {children}
    </div>
  );
}

export function UnifiedCardDetails({
  afterDescription,
  children,
  description,
  language = "zh",
  name,
  showEmptyTags = true,
  tags,
  density = "default",
}: {
  afterDescription?: ReactNode;
  children?: ReactNode;
  description: string | null;
  language?: Language;
  name: string;
  showEmptyTags?: boolean;
  tags: string[];
  density?: "default" | "name-card";
}) {
  const text = getUnifiedCardCopy(language);
  const visibleTags = Array.from(
    new Set(tags.map((tag) => tag.trim()).filter(Boolean)),
  ).slice(0, 8);
  const compact = density === "name-card";
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col justify-start px-1 pt-2 sm:px-2",
        compact ? "pb-8 sm:pb-9 sm:pt-3" : "pb-10 sm:pb-11 sm:pt-4",
      )}
      data-card-density={density}
    >
      <h3 className={cn(
        "break-words font-black leading-tight tracking-[-0.025em] text-[#f7f9f7] [overflow-wrap:anywhere]",
        compact
          ? "text-[clamp(16px,4vw,26px)]"
          : "text-[clamp(16px,4.2vw,30px)]",
      )}>
        {name}
      </h3>
      {children}
      <p className={cn(
        "mt-2 text-[12px] font-bold leading-[1.55] text-[#9aacb5] sm:mt-3 sm:text-[16px] sm:leading-6",
        compact ? "line-clamp-2" : "line-clamp-3",
      )}>
        {description ?? text.noDescription}
      </p>
      {afterDescription}
      {visibleTags.length > 0 || showEmptyTags ? (
        <div
          className="mt-2 flex min-h-5 flex-wrap items-center gap-1 sm:mt-3 sm:min-h-7 sm:gap-2"
          data-testid="unified-card-tags"
        >
          {visibleTags.length > 0 ? (
            visibleTags.map((tag) => (
              <span
                className="rounded-full border border-[#648f25] px-2.5 py-1 text-[10px] font-black text-[#b8ff4a] sm:px-4 sm:py-1.5 sm:text-[14px]"
                key={tag}
              >
                {tag}
              </span>
            ))
          ) : (
            <span className="text-[10px] font-bold text-[#9aacb5] sm:text-[13px]">{text.noTags}</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
