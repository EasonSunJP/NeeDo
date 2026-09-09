import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { IconName } from "../../components/client-ui/AppScaffold";
import type { Language } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import { getUnifiedCardCopy } from "./copy";

export type UnifiedCardMetric = {
  icon: IconName;
  label: string;
  value: ReactNode;
  action?: ReactNode;
};

const metricGlyph: Partial<Record<IconName, string>> = {
  calendar: "▦",
  heart: "♡",
  map: "⌖",
  moments: "◫",
  share: "⌯",
  star: "★",
};

function UnifiedMetricIcon({ name }: { name: IconName }) {
  return (
    <span
      aria-hidden="true"
      className="grid h-5 w-5 shrink-0 place-items-center text-[18px] font-black leading-none sm:h-7 sm:w-7 sm:text-[25px]"
    >
      {metricGlyph[name] ?? "•"}
    </span>
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
      className="pointer-events-none relative z-20 grid grid-cols-5 border-b border-[#244047]"
      data-testid="unified-card-metrics"
    >
      {metrics.map((metric) => (
        <div
          className="relative flex min-h-[56px] min-w-0 items-center gap-1 border-[#244047] px-1 py-2 text-[#b8ff4a] sm:min-h-[70px] sm:gap-2 sm:px-3 [&:not(:last-child)]:border-r"
          key={metric.label}
        >
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
          className="pointer-events-none absolute bottom-2 right-2 z-20 grid h-9 w-9 place-items-center rounded-full bg-[#b8ff4a] text-[26px] font-black leading-none text-[#031014] shadow-[0_0_24px_rgba(184,255,74,0.32)] sm:bottom-4 sm:right-4 sm:h-12 sm:w-12 sm:text-[34px]"
        >
          ›
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
    <div className="relative min-h-[180px] overflow-hidden bg-[#07181b] sm:min-h-[240px]">
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
    <div className="flex min-h-[180px] min-w-0 flex-col justify-center px-3 py-3 sm:min-h-[240px] sm:px-7 sm:py-5">
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
