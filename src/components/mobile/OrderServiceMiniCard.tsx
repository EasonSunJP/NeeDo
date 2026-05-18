import type { MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import { AppIcon } from "../client-ui/AppScaffold";
import { services } from "../../data/mock";
import { shareContent } from "../../lib/share";
import { cn, yen } from "../../lib/utils";
import { SocialProfileMiniCard, buildServiceMiniCardData } from "../../shared/profile-card";
import type { Order, ServiceItem, Store, Technician } from "../../types/domain";

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

function normalizeOrderServiceName(value: string) {
  return value.replace(/\s+\d+\s*分钟/g, "").trim();
}

export function findOrderService(order: Order): ServiceItem {
  const normalizedOrderName = normalizeOrderServiceName(order.itemName);

  return services.find((service) =>
    order.itemName.includes(service.name) ||
    service.name.includes(normalizedOrderName) ||
    service.packages.some((item) => order.itemName.includes(item.name))
  ) ?? services[0]!;
}

export function buildOrderServiceMiniCardData(order: Order, provider?: Store | Technician) {
  const service = findOrderService(order);
  const modeLabel = order.mode === "home" ? "上门服务" : "到店预约";

  return {
    ...buildServiceMiniCardData(service, provider),
    id: order.id,
    displayName: order.itemName,
    headline: `${order.bookedAt} · ${order.customerName}`,
    regionLabel: order.area,
    addressLabel: order.area,
    addressValue: order.storeName ?? order.area,
    serviceTags: [modeLabel, order.area, ...service.tags].slice(0, 6),
    detailPath: undefined
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
  provider,
  shareLabel = "转发服务卡",
  topTags = []
}: OrderServiceMiniCardProps) {
  const serviceCardData = buildOrderServiceMiniCardData(order, provider);
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

  return (
    <SocialProfileMiniCard
      actionSlot={hasActions ? (
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
      ) : undefined}
      className={className}
      dark={dark}
      data={serviceCardData}
      detailTo={detailTo}
      onOpenDetails={onOpenDetails}
      topTags={visibleTopTags}
    />
  );
}
