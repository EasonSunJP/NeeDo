import type { ReactNode } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { cn, yen } from "../../lib/utils";
import {
  dineInOrderItemStatusLabels,
  dineInOrderStatusLabels,
  facilityStatusLabels,
  facilityTypeLabels,
  menuItemRestrictionFlagLabels,
  menuStockStatusLabels,
  paymentStatusLabels,
  productionAreaLabels
} from "./labels";
import { getDineInOrderItems, getMenuItemMaximumOrderQuantity, getMenuItemMinimumOrderQuantity, getMenuItemTaxIncludedPriceJpy, isMenuItemSpecialOfferActive } from "./store";
import type {
  DineInMenuItem,
  DineInOrder,
  DineInOrderItem,
  DineInPayment,
  DineInState,
  FacilityUnit,
  MenuStockStatus,
  ProductionArea
} from "./types";

export function DineInStatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "green" | "yellow" | "red" | "purple" | "neutral" }) {
  const toneClass = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    yellow: "bg-amber-50 text-amber-700 border-amber-100",
    red: "bg-rose-50 text-rose-700 border-rose-100",
    purple: "bg-violet-50 text-violet-700 border-violet-100",
    neutral: "bg-paper text-ink/62 border-line"
  }[tone];

  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black", toneClass)}>{children}</span>;
}

export function getOrderTone(status: DineInOrder["status"]) {
  if (status === "PENDING") {
    return "red" as const;
  }

  if (status === "CHECKOUT_REQUESTED") {
    return "yellow" as const;
  }

  if (status === "PAID" || status === "COMPLETED") {
    return "green" as const;
  }

  if (status.includes("READY") || status.includes("SERVED")) {
    return "purple" as const;
  }

  return "neutral" as const;
}

export function getFacilityTone(status: FacilityUnit["status"]) {
  if (status === "AVAILABLE") {
    return "green" as const;
  }

  if (status === "PAYMENT_PENDING" || status === "CHECKOUT_REQUESTED") {
    return "red" as const;
  }

  if (status === "CLEANING" || status === "BLOCKED") {
    return "neutral" as const;
  }

  return "yellow" as const;
}

export function ProductionAreaBadge({ value }: { value: ProductionArea }) {
  return <DineInStatusPill tone={value === "KITCHEN" ? "yellow" : value === "BAR" ? "purple" : "neutral"}>{productionAreaLabels[value]}</DineInStatusPill>;
}

export function MenuStockBadge({ value }: { value: MenuStockStatus }) {
  return <DineInStatusPill tone={value === "AVAILABLE" ? "green" : value === "SOLD_OUT" ? "red" : "yellow"}>{menuStockStatusLabels[value]}</DineInStatusPill>;
}

export function DineInMetricGrid({ items }: { items: Array<[label: string, value: string | number]> }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {items.map(([label, value]) => (
        <div className="rounded-lg border border-line bg-white px-3 py-3" key={label}>
          <p className="text-[11px] font-bold text-ink/45">{label}</p>
          <strong className="mt-1 block text-lg font-black">{value}</strong>
        </div>
      ))}
    </div>
  );
}

export function DineInOrderCard({
  compact = false,
  facility,
  items,
  onAccept,
  onCheckout,
  onView,
  order
}: {
  compact?: boolean;
  facility?: FacilityUnit;
  items: DineInOrderItem[];
  onAccept?: () => void;
  onCheckout?: () => void;
  onView?: () => void;
  order: DineInOrder;
}) {
  return (
    <article className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-ink/35">{order.orderNo}</p>
          <h3 className="mt-1 truncate text-base font-black">{facility?.label ?? order.facilityUnitId}</h3>
          <p className="mt-1 text-xs font-bold text-ink/45">{order.guestLabel} · {new Date(order.createdAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
        <DineInStatusPill tone={getOrderTone(order.status)}>{dineInOrderStatusLabels[order.status]}</DineInStatusPill>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span className="rounded-full bg-paper px-2.5 py-1 text-xs font-bold text-ink/60" key={item.id}>
            {item.nameSnapshot} x{item.quantity}
          </span>
        ))}
      </div>
      {!compact ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {order.alertFlags.map((flag) => <Badge key={flag} tone="yellow">{flag}</Badge>)}
          <span className="ml-auto text-base font-black">{yen(order.totalJpy)}</span>
        </div>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {onAccept ? (
          <Button disabled={order.status !== "PENDING"} onClick={onAccept} size="sm">
            接单
          </Button>
        ) : null}
        {onCheckout ? (
          <Button onClick={onCheckout} size="sm" variant="secondary">
            发起结账
          </Button>
        ) : null}
        {onView ? (
          <Button className={cn(!onAccept && !onCheckout ? "col-span-2" : "")} onClick={onView} size="sm" variant="secondary">
            查看详情
          </Button>
        ) : null}
      </div>
    </article>
  );
}

export function DineInItemQueueCard({
  item,
  order,
  facility,
  onPreparing,
  onReady,
  onServed
}: {
  item: DineInOrderItem;
  order: DineInOrder;
  facility?: FacilityUnit;
  onPreparing?: () => void;
  onReady?: () => void;
  onServed?: () => void;
}) {
  return (
    <article className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black">{item.nameSnapshot} x{item.quantity}</h3>
          <p className="mt-1 text-xs font-bold text-ink/45">{facility?.label ?? order.facilityUnitId} · {order.orderNo}</p>
        </div>
        <ProductionAreaBadge value={item.productionArea} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <DineInStatusPill>{dineInOrderItemStatusLabels[item.status]}</DineInStatusPill>
        {item.note ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-700">{item.note}</span> : null}
        {item.optionsSnapshot.map((option) => <span className="rounded-full bg-paper px-2.5 py-1 text-xs font-bold text-ink/55" key={option}>{option}</span>)}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button disabled={item.status !== "CONFIRMED"} onClick={onPreparing} size="sm" variant="secondary">制作中</Button>
        <Button disabled={item.status !== "PREPARING"} onClick={onReady} size="sm" variant="secondary">已出品</Button>
        <Button disabled={item.status !== "READY"} onClick={onServed} size="sm">已上菜</Button>
      </div>
    </article>
  );
}

export function DineInMenuItemCard({
  item,
  onAdd,
  onEdit,
  onStockChange,
  quantity = 0
}: {
  item: DineInMenuItem;
  onAdd?: () => void;
  onEdit?: () => void;
  onStockChange?: (nextStatus: MenuStockStatus) => void;
  quantity?: number;
}) {
  const hasSpecialOffer = isMenuItemSpecialOfferActive(item);
  const minimumOrderQuantity = getMenuItemMinimumOrderQuantity(item);
  const maximumOrderQuantity = getMenuItemMaximumOrderQuantity(item);

  return (
    <article className="overflow-hidden rounded-lg border border-line bg-white shadow-panel">
      <div className="grid grid-cols-[96px,1fr] gap-3 p-3">
        <img alt={item.name.zh} className="h-24 w-24 rounded-lg object-cover" src={item.imageUrl} />
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-base font-black">{item.name.zh}</h3>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink/48">{item.description.zh}</p>
            </div>
            <MenuStockBadge value={item.stockStatus} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex items-baseline gap-1.5">
              {hasSpecialOffer ? <span className="text-xs font-black text-ink/38 line-through">{yen(item.basePriceJpy)}</span> : null}
              <strong className={cn("text-base", hasSpecialOffer ? "text-coral" : "")}>{yen(getMenuItemTaxIncludedPriceJpy(item))}</strong>
              <span className="text-[10px] font-black text-ink/42">税入</span>
            </div>
            {hasSpecialOffer ? (
              <span className="animate-pulse rounded-full border border-coral/25 bg-coral/10 px-2 py-0.5 text-[11px] font-black text-coral shadow-[0_0_18px_rgba(238,111,87,0.22)]">
                {item.specialOffer?.label ?? "特价"}
              </span>
            ) : null}
            {minimumOrderQuantity > 1 ? <DineInStatusPill>{minimumOrderQuantity} 个起售</DineInStatusPill> : null}
            {maximumOrderQuantity ? <DineInStatusPill>最多 {maximumOrderQuantity} 个</DineInStatusPill> : null}
            {item.restrictionFlags?.map((flag) => (
              <DineInStatusPill key={flag}>{menuItemRestrictionFlagLabels[flag]}</DineInStatusPill>
            ))}
            <ProductionAreaBadge value={item.productionArea} />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-line bg-paper px-3 py-2">
        {onStockChange ? (
          <>
            <Button onClick={() => onStockChange(item.stockStatus === "SOLD_OUT" ? "AVAILABLE" : "SOLD_OUT")} size="sm" variant="secondary">
              {item.stockStatus === "SOLD_OUT" ? "恢复供应" : "售罄"}
            </Button>
            <Button onClick={() => onStockChange("LIMITED")} size="sm" variant="secondary">
              限量
            </Button>
          </>
        ) : null}
        {onEdit ? (
          <Button className="ml-auto" onClick={onEdit} size="sm" variant="dark">
            编辑
          </Button>
        ) : null}
        {onAdd ? (
          <Button className={cn(!onEdit ? "ml-auto" : "")} disabled={item.stockStatus === "SOLD_OUT"} onClick={onAdd} size="sm">
            {quantity > 0 ? `已加 ${quantity}` : "加入"}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

export function DineInFacilityCard({
  facility,
  sessionTotal,
  openCallCount,
  onClean,
  onBlock
}: {
  facility: FacilityUnit;
  sessionTotal: number;
  openCallCount: number;
  onClean?: () => void;
  onBlock?: () => void;
}) {
  return (
    <article className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black text-ink/35">{facilityTypeLabels[facility.type]} · {facility.capacity} 人</p>
          <h3 className="mt-1 text-lg font-black">{facility.label}</h3>
        </div>
        <DineInStatusPill tone={getFacilityTone(facility.status)}>{facilityStatusLabels[facility.status]}</DineInStatusPill>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-paper px-2 py-2">
          <p className="font-bold text-ink/42">消费</p>
          <strong className="mt-1 block">{yen(sessionTotal)}</strong>
        </div>
        <div className="rounded-lg bg-paper px-2 py-2">
          <p className="font-bold text-ink/42">呼叫</p>
          <strong className="mt-1 block">{openCallCount}</strong>
        </div>
        <div className="rounded-lg bg-paper px-2 py-2">
          <p className="font-bold text-ink/42">QR</p>
          <strong className="mt-1 block">已绑定</strong>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button onClick={onClean} size="sm" variant="secondary">标记清洁</Button>
        <Button onClick={onBlock} size="sm" variant="secondary">停用</Button>
      </div>
    </article>
  );
}

export function DineInCashierCard({
  order,
  payment,
  facility,
  onConfirm
}: {
  order: DineInOrder;
  payment?: DineInPayment;
  facility?: FacilityUnit;
  onConfirm?: () => void;
}) {
  return (
    <article className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black text-ink/35">{facility?.label ?? order.facilityUnitId}</p>
          <h3 className="mt-1 text-lg font-black">{yen(order.totalJpy)}</h3>
        </div>
        <DineInStatusPill tone={payment?.status === "CONFIRMED" ? "green" : "yellow"}>
          {payment ? paymentStatusLabels[payment.status] : dineInOrderStatusLabels[order.status]}
        </DineInStatusPill>
      </div>
      <p className="mt-2 text-sm font-bold text-ink/48">{order.orderNo} · {order.guestLabel}</p>
      <Button className="mt-3 w-full" disabled={!payment || payment.status === "CONFIRMED"} onClick={onConfirm} size="sm">
        确认已收款
      </Button>
    </article>
  );
}

export function buildOrderSummary(state: DineInState, order: DineInOrder) {
  return getDineInOrderItems(state, order.id)
    .map((item) => `${item.nameSnapshot} x${item.quantity}`)
    .join("、");
}
