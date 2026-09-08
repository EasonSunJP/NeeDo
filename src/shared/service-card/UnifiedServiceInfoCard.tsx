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

export function UnifiedServiceInfoCard({ actionSlot, className, data, detailTo, onOpenDetails }: UnifiedServiceInfoCardProps) {
  const hasActions = Boolean(actionSlot);
  const content = <ServiceCardContent data={data} hasActions={hasActions} />;
  const interactiveClassName = "focus-ring block text-left";

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)] bg-[color:var(--client-surface)] text-[color:var(--client-text)] shadow-panel",
        className
      )}
      data-testid="unified-service-info-card"
    >
      {detailTo ? (
        <Link aria-label={`查看服务 ${data.name}`} className={interactiveClassName} to={detailTo}>{content}</Link>
      ) : onOpenDetails ? (
        <button aria-label={`查看服务 ${data.name}`} className={cn(interactiveClassName, "w-full")} onClick={onOpenDetails} type="button">{content}</button>
      ) : content}
      {actionSlot ? (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1" data-testid="unified-service-info-actions">
          {actionSlot}
        </div>
      ) : null}
    </article>
  );
}
