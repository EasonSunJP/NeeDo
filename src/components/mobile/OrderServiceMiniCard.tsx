import type { MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import { AppIcon } from "../client-ui/AppScaffold";
import { shareContent } from "../../lib/share";
import { cn, yen } from "../../lib/utils";
import { UnifiedServiceInfoCard, type UnifiedServiceInfoCardData } from "../../shared/service-card";
import type { Order, Store, Technician } from "../../types/domain";

type OrderServiceMiniCardTopTag = string | { label: string; tone?: "neutral" | "green" | "yellow" | "purple" };

type OrderServiceMiniCardProps = {
  order: Order;
  provider?: Store | Technician;
  className?: string;
  contactTo?: string;
  contactLabel?: string;
  dark?: boolean;
  detailTo?: string;
  onOpenDetails?: () => void;
  onShare?: () => void;
  shareLabel?: string;
  topTags?: OrderServiceMiniCardTopTag[];
};

export function buildOrderServiceMiniCardData(order: Order): UnifiedServiceInfoCardData {
  const durationMatch = order.itemName.match(/(\d+)\s*分钟/u)?.[1];
  const durationMinutes = durationMatch ? Number(durationMatch) : null;

  return {
    id: order.id,
    coverUrl: null,
    name: order.itemName,
    priceAmount: order.amount,
    currency: "JPY",
    durationMinutes,
    usageCount: null,
    shopPublicId: null,
    shopAddress: null,
    description: null,
    tags: []
  };
}

function OrderServiceIconButton({
  children,
  className,
  label,
  onClick,
  to
}: {
  children: ReactNode;
  className?: string;
  label: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  to?: string;
}) {
  const baseClassName = cn(
    "focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/18 bg-black/34 text-white shadow-[0_10px_24px_rgba(0,0,0,0.24)] backdrop-blur-md transition hover:bg-white/18 active:scale-[0.96]",
    className
  );

  if (to) {
    return (
      <Link
        aria-label={label}
        className={baseClassName}
        onClick={(event) => {
          event.stopPropagation();
        }}
        to={to}
      >
        {children}
      </Link>
    );
  }

  return (
    <button aria-label={label} className={baseClassName} onClick={onClick} type="button">
      {children}
    </button>
  );
}

function buildOrderShareText(order: Order) {
  return `${order.itemName}\n${order.bookedAt} · ${order.area}\n${yen(order.amount)}`;
}

export function OrderServiceMiniCard({
  className,
  contactLabel = "联系用户",
  contactTo,
  dark,
  detailTo,
  onOpenDetails,
  onShare,
  order,
  shareLabel = "转发服务卡",
  topTags = []
}: OrderServiceMiniCardProps) {
  const serviceCardData = buildOrderServiceMiniCardData(order);
  const visibleTopTags: OrderServiceMiniCardTopTag[] = [
    { label: yen(order.amount), tone: "yellow" },
    ...topTags
  ];
  const hasActions = Boolean(contactTo || onShare || detailTo || onOpenDetails);
  const handleShare = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (onShare) {
      onShare();
      return;
    }

    void shareContent({
      title: order.itemName,
      text: buildOrderShareText(order),
      url: detailTo ?? `/orders/${order.id}`,
      copiedMessage: "服务卡链接已复制，可以转发给联系人"
    });
  };

  const wrapperActions = hasActions || visibleTopTags.length > 0 ? (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1">
        {visibleTopTags.map((tag) => {
          const normalized = typeof tag === "string" ? { label: tag, tone: "neutral" as const } : tag;
          return (
            <span
              className={cn(
                "rounded-full border px-2 py-1 text-[9px] font-black",
                normalized.tone === "green" && "border-emerald-400/35 bg-emerald-500/15 text-emerald-500",
                normalized.tone === "yellow" && "border-amber-400/35 bg-amber-500/15 text-amber-500",
                normalized.tone === "purple" && "border-purple-400/35 bg-purple-500/15 text-purple-500",
                (!normalized.tone || normalized.tone === "neutral") && "border-[color:var(--client-line)] bg-[color:var(--client-elevated)] text-[color:var(--client-muted)]"
              )}
              key={normalized.label}
            >
              {normalized.label}
            </span>
          );
        })}
      </div>
      {hasActions ? (
        <div className="flex items-center gap-1.5">
          {contactTo ? (
            <OrderServiceIconButton label={contactLabel} to={contactTo}>
              <AppIcon className="h-4 w-4" name="chat" />
            </OrderServiceIconButton>
          ) : null}
          <OrderServiceIconButton label={shareLabel} onClick={handleShare}>
            <AppIcon className="h-4 w-4" name="share" />
          </OrderServiceIconButton>
        </div>
      ) : null}
    </div>
  ) : undefined;

  return (
    <UnifiedServiceInfoCard
      actionSlot={wrapperActions}
      className={cn(className, dark && "border-white/10 bg-[#15120f]")}
      data={serviceCardData}
      detailTo={detailTo}
      onOpenDetails={onOpenDetails}
    />
  );
}
