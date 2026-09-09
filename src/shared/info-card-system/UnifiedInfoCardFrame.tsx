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
      className="grid h-7 w-7 shrink-0 place-items-center text-[25px] font-black leading-none"
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
      className="grid grid-cols-2 border-b border-[#244047] sm:grid-cols-5"
      data-testid="unified-card-metrics"
    >
      {metrics.map((metric) => (
        <div
          className="relative flex min-h-[70px] min-w-0 items-center gap-2 border-[#244047] px-3 py-2 text-[#b8ff4a] [&:not(:last-child)]:border-r"
          key={metric.label}
        >
          {metric.action ?? (
            <UnifiedMetricIcon name={metric.icon} />
          )}
          <div className="min-w-0">
            <div className="truncate text-[14px] font-black leading-5 text-[#f7f9f7]">
              {metric.value}
            </div>
            <div className="truncate text-[11px] font-bold leading-4 text-[#9aacb5]">
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
  const content = body;
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-[30px] border border-[#244047] bg-[#031014] text-[#f7f9f7] shadow-[0_24px_60px_rgba(0,0,0,0.32)]",
        className,
      )}
      data-card-kind={kind}
      data-testid="unified-info-card"
    >
      <UnifiedCardMetricRail metrics={metrics ?? []} />
      {detailTo ? (
        <Link
          aria-label={ariaLabel}
          className="focus-ring block text-left"
          to={detailTo}
        >
          {content}
        </Link>
      ) : onOpenDetails ? (
        <button
          aria-label={ariaLabel}
          className="focus-ring block w-full text-left"
          onClick={onOpenDetails}
          type="button"
        >
          {content}
        </button>
      ) : (
        content
      )}
      {actionSlot ? (
        <div
          className="absolute bottom-3 right-3 z-20 flex items-center gap-1"
          data-testid="unified-card-actions"
        >
          {actionSlot}
        </div>
      ) : null}
      {!actionSlot && (detailTo || onOpenDetails) ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-4 right-4 z-20 grid h-12 w-12 place-items-center rounded-full bg-[#b8ff4a] text-[34px] font-black leading-none text-[#031014] shadow-[0_0_24px_rgba(184,255,74,0.32)]"
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
    <div className="relative min-h-[240px] overflow-hidden bg-[#07181b]">
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
          className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_20%_15%,rgba(184,255,74,0.14),transparent_42%),linear-gradient(145deg,#07181b,#031014)] px-4 text-center text-[12px] font-black text-[#9aacb5]"
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
    <div className="flex min-h-[240px] min-w-0 flex-col justify-center px-5 py-5 sm:px-7">
      <h3 className="break-words text-[clamp(22px,4.8vw,36px)] font-black leading-tight tracking-[-0.025em] text-[#f7f9f7] [overflow-wrap:anywhere]">
        {name}
      </h3>
      {children}
      <p className="mt-3 line-clamp-3 text-[14px] font-bold leading-6 text-[#9aacb5]">
        {description ?? text.noDescription}
      </p>
      <div
        className="mt-4 flex min-h-7 flex-wrap items-center gap-2"
        data-testid="unified-card-tags"
      >
        {visibleTags.length > 0 ? (
          visibleTags.map((tag) => (
            <span
              className="rounded-full border border-[#648f25] px-3 py-1 text-[11px] font-black text-[#b8ff4a]"
              key={tag}
            >
              {tag}
            </span>
          ))
        ) : (
          <span className="text-[11px] font-bold text-[#9aacb5]">{text.noTags}</span>
        )}
      </div>
    </div>
  );
}
