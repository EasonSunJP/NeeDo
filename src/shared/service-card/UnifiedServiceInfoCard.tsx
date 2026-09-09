import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";
import type { UnifiedServiceInfoCardData } from "./model";

type UnifiedServiceInfoCardProps = {
  actionSlot?: ReactNode;
  className?: string;
  data: UnifiedServiceInfoCardData;
  detailTo?: string;
  onOpenDetails?: () => void;
  variant?: "default" | "showcase";
};

function formatPrice(amount: number, currency: string) {
  const normalized = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const price = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 }).format(normalized);
  return currency.toUpperCase() === "JPY" ? `￥${price}` : `${currency.toUpperCase()} ${price}`;
}

function formatDuration(durationMinutes: number | null) {
  return durationMinutes !== null && Number.isFinite(durationMinutes) && durationMinutes > 0
    ? `${durationMinutes}分钟`
    : "时长未读取";
}

function ServiceCardContent({ data, hasActions }: { data: UnifiedServiceInfoCardData; hasActions: boolean }) {
  const visibleTags = data.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 8);
  const showCatalogPrice = data.catalogPriceAmount !== null && data.catalogPriceAmount !== undefined && data.catalogPriceAmount > data.priceAmount;

  return (
    <div className="grid min-h-[190px] grid-cols-[minmax(112px,36%)_1fr]">
      <div className="relative min-h-full overflow-hidden bg-[color:var(--client-elevated)]">
        {data.coverUrl ? (
          <img alt={data.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" src={data.coverUrl} />
        ) : (
          <div
            aria-label={`${data.name} 暂无公开图片`}
            className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--client-primary)_18%,transparent),transparent_48%),linear-gradient(145deg,color-mix(in_srgb,var(--client-elevated)_94%,black),color-mix(in_srgb,var(--client-surface)_88%,black))] px-3 text-center text-[12px] font-black text-[color:var(--client-muted)]"
            role="img"
          >
            暂无公开图片
          </div>
        )}
      </div>

      <div className={cn("min-w-0 px-4 py-3.5", hasActions ? "pr-[118px]" : "")}>
        <h3 className="text-[17px] font-black leading-6 text-[color:var(--client-text)]">{data.name}</h3>
        <strong className="mt-1 block text-[19px] font-black tracking-[-0.02em] text-[color:var(--client-primary)]">
          {formatPrice(data.priceAmount, data.currency)}/{formatDuration(data.durationMinutes)}
        </strong>
        {showCatalogPrice ? (
          <p className="mt-1 text-[12px] font-bold text-[color:var(--client-muted)]">
            <span className="line-through">{formatPrice(data.catalogPriceAmount!, data.currency)}</span>
          </p>
        ) : null}

        <div className="mt-2 space-y-1 text-[11px] font-bold leading-4 text-[color:var(--client-muted)]">
          <p>利用回数：<span className="font-black text-[color:var(--client-text)]">{data.usageCount ?? "未读取"}</span></p>
        </div>

        <p className="mt-2 line-clamp-2 text-[12px] font-bold leading-5 text-[color:var(--client-muted)]">
          {data.description ?? "暂无简介"}
        </p>

        <div className="mt-2 flex min-h-6 flex-wrap items-center gap-1.5" data-testid="unified-service-info-tags">
          {visibleTags.length > 0 ? visibleTags.map((tag) => (
            <span
              className="rounded-full bg-[color:var(--client-primary-soft)] px-2 py-1 text-[10px] font-black leading-3 text-[color:var(--client-primary)]"
              key={tag}
            >
              {tag}
            </span>
          )) : <span className="text-[11px] font-bold text-[color:var(--client-muted)]">暂无标签</span>}
        </div>
      </div>
    </div>
  );
}

function ServiceShowcaseContent({ data }: { data: UnifiedServiceInfoCardData }) {
  const visibleTags = data.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 5);
  const showCatalogPrice = data.catalogPriceAmount !== null && data.catalogPriceAmount !== undefined && data.catalogPriceAmount > data.priceAmount;

  return (
    <div className="relative" data-testid="unified-service-showcase-body">
      <header
        className="grid min-h-[88px] grid-cols-[34%_66%] items-center bg-[radial-gradient(circle_at_18%_0%,color-mix(in_srgb,var(--client-primary)_13%,transparent),transparent_45%),repeating-linear-gradient(72deg,transparent_0,transparent_7px,color-mix(in_srgb,var(--client-primary)_5%,transparent)_8px,color-mix(in_srgb,var(--client-primary)_5%,transparent)_9px),linear-gradient(110deg,#071611,#020807_62%,#030a0b)] px-4"
        data-testid="unified-service-showcase-header"
      >
        <h3 className="col-start-2 min-w-0 pl-3 text-[clamp(17px,4.3vw,25px)] font-black leading-tight tracking-[-0.02em] text-white">
          {data.name}
        </h3>
      </header>

      <div className="grid min-h-[132px] grid-cols-[34%_66%] bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,#0d2028)]">
        <div className="relative min-w-0">
          <div
            className="absolute -top-10 bottom-auto left-4 right-0 aspect-square overflow-hidden rounded-[24px] border border-white/10 bg-[color:var(--client-surface)] shadow-[0_10px_28px_rgba(0,0,0,0.34)]"
            data-testid="unified-service-showcase-cover"
          >
            {data.coverUrl ? (
              <img alt={data.name} className="h-full w-full object-cover" loading="lazy" src={data.coverUrl} />
            ) : (
              <div
                aria-label={`${data.name} 暂无公开图片`}
                className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--client-primary)_18%,transparent),transparent_50%),linear-gradient(145deg,color-mix(in_srgb,var(--client-elevated)_94%,black),color-mix(in_srgb,var(--client-surface)_88%,black))] px-2 text-center text-[11px] font-black text-[color:var(--client-muted)]"
                role="img"
              >
                暂无公开图片
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 px-3 pb-3 pt-2.5">
          <p className="text-[12px] font-bold leading-4 text-[color:var(--client-muted)]">
            利用回数： <span className="text-[14px] font-black text-[color:var(--client-text)]">{data.usageCount ?? "未读取"}</span>
          </p>

          <div className="mt-1.5 flex min-h-5 flex-wrap items-center gap-1" data-testid="unified-service-info-tags">
            {visibleTags.length > 0 ? visibleTags.map((tag) => (
              <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-black leading-4 text-[color:var(--client-muted)]" key={tag}>
                {tag}
              </span>
            )) : <span className="text-[11px] font-bold text-[color:var(--client-muted)]">暂无标签</span>}
          </div>

          <p className="mt-1.5 line-clamp-2 text-[12px] font-bold leading-[1.55] text-[color:var(--client-muted)]">
            {data.description ?? "暂无简介"}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="unified-service-showcase-facts">
            <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-black leading-4 text-[color:var(--client-muted)]">
              {formatPrice(data.priceAmount, data.currency)}
            </span>
            <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-black leading-4 text-[color:var(--client-muted)]">
              {formatDuration(data.durationMinutes)}
            </span>
            {showCatalogPrice ? (
              <span className="text-[10px] font-bold text-[color:var(--client-muted)] line-through">
                {formatPrice(data.catalogPriceAmount!, data.currency)}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function UnifiedServiceInfoCard({ actionSlot, className, data, detailTo, onOpenDetails, variant = "default" }: UnifiedServiceInfoCardProps) {
  const hasActions = Boolean(actionSlot);
  const isShowcase = variant === "showcase";
  const content = isShowcase
    ? <ServiceShowcaseContent data={data} />
    : <ServiceCardContent data={data} hasActions={hasActions} />;
  const interactiveClassName = "focus-ring block text-left";

  return (
    <article
      className={cn(
        "relative overflow-hidden border bg-[color:var(--client-surface)] text-[color:var(--client-text)] shadow-panel",
        isShowcase
          ? "rounded-[28px] border-[color:color-mix(in_srgb,var(--client-primary)_28%,var(--client-line))]"
          : "rounded-[26px] border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)]",
        className
      )}
      data-variant={variant}
      data-testid="unified-service-info-card"
    >
      {detailTo ? (
        <Link aria-label={`查看服务 ${data.name}`} className={interactiveClassName} to={detailTo}>{content}</Link>
      ) : onOpenDetails ? (
        <button aria-label={`查看服务 ${data.name}`} className={cn(interactiveClassName, "w-full")} onClick={onOpenDetails} type="button">{content}</button>
      ) : content}
      {actionSlot ? (
        <div className={cn(
          "z-10 flex items-center gap-1",
          isShowcase
            ? "justify-end border-t border-white/10 bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,#0d2028)] px-3 py-2"
            : "absolute right-3 top-3"
        )} data-testid="unified-service-info-actions">
          {actionSlot}
        </div>
      ) : null}
    </article>
  );
}
