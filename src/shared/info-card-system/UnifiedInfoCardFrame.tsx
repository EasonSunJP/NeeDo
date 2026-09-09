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

function UnifiedMetricIcon({ name }: { name: IconName }) {
  return (
    <AppIcon
      className="h-5 w-5 shrink-0 sm:h-7 sm:w-7"
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
      className="pointer-events-none relative z-20 flex items-center px-2 py-2 sm:px-5 sm:py-4"
      data-testid="unified-card-metrics"
    >
      {metrics.map((metric, index) => (
        <Fragment key={metric.label}>
          <div className="relative flex min-h-[48px] min-w-0 flex-1 items-center justify-center gap-1 px-1 text-[#b8ff4a] sm:min-h-[62px] sm:gap-2 sm:px-3">
            {metric.action ? (
              <div className="pointer-events-auto">{metric.action}</div>
            ) : (
              <UnifiedMetricIcon name={metric.icon} />
            )}
            <div className="min-w-0">
              <div className="truncate text-[9px] font-black leading-4 text-[#f7f9f7] sm:text-[14px] sm:leading-5">
                {metric.value}
              </div>
              <div className="truncate text-[8px] font-bold leading-3 text-[#9aacb5] sm:text-[11px] sm:leading-4">
                {metric.label}
              </div>
            </div>
          </div>
          {index < metrics.length - 1 ? (
            <span
              aria-hidden="true"
              className="h-8 w-px shrink-0 bg-[#244047] sm:h-12"
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
    <div className="relative aspect-square min-h-0 overflow-hidden rounded-[18px] bg-[#07181b] sm:rounded-[24px]">
      {src ? (
        <img
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover"
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
  children,
  description,
  language = "zh",
  name,
  tags,
}: {
  children?: ReactNode;
  description: string | null;
  language?: Language;
  name: string;
  tags: string[];
}) {
  const text = getUnifiedCardCopy(language);
  const visibleTags = Array.from(
    new Set(tags.map((tag) => tag.trim()).filter(Boolean)),
  ).slice(0, 8);
  return (
    <div className="flex min-w-0 flex-col justify-start px-1 pb-11 pt-3 sm:px-2 sm:pb-16 sm:pt-8">
      <h3 className="break-words text-[clamp(16px,4.5vw,36px)] font-black leading-tight tracking-[-0.025em] text-[#f7f9f7] [overflow-wrap:anywhere]">
        {name}
      </h3>
      {children}
      <p className="mt-2 line-clamp-3 text-[10px] font-bold leading-4 text-[#9aacb5] sm:mt-3 sm:text-[14px] sm:leading-6">
        {description ?? text.noDescription}
      </p>
      <div
        className="mt-2 flex min-h-5 flex-wrap items-center gap-1 sm:mt-4 sm:min-h-7 sm:gap-2"
        data-testid="unified-card-tags"
      >
        {visibleTags.length > 0 ? (
          visibleTags.map((tag) => (
            <span
              className="rounded-full border border-[#648f25] px-2 py-0.5 text-[8px] font-black text-[#b8ff4a] sm:px-3 sm:py-1 sm:text-[11px]"
              key={tag}
            >
              {tag}
            </span>
          ))
        ) : (
          <span className="text-[8px] font-bold text-[#9aacb5] sm:text-[11px]">{text.noTags}</span>
        )}
      </div>
    </div>
  );
}
