import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { MobileShell } from "../../components/mobile/MobileShell";
import { Badge } from "../../components/ui/Badge";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { services } from "../../data/mock";
import { cn, statusLabel, yen } from "../../lib/utils";
import { useEntityStore } from "../../state/entityStore";
import { useUserOrders } from "../../state/userOrderStore";
import type { Order } from "../../types/domain";

type OrderTab = "all" | "pending" | "active" | "history";

const fullscreenHeaderClassName =
  "";
const surfaceCardClassName =
  "rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_92%,#f7f7f2)] p-4 shadow-panel";
const deletedOrdersStorageKey = "needo.user.orders.deleted.v1";
const deleteAnimationDurationMs = 360;
const initialOrderRenderCount = 12;
const orderRenderBatchSize = 12;

function filterOrders(orderList: Order[], tab: OrderTab) {
  if (tab === "pending") {
    return orderList.filter((item) => ["pending", "unpaid", "confirmed", "scheduled"].includes(item.status));
  }

  if (tab === "active") {
    return orderList.filter((item) => item.status === "inService");
  }

  if (tab === "history") {
    return orderList.filter((item) => ["completed", "cancelled", "refunded", "refunding"].includes(item.status));
  }

  return orderList;
}

function parseOrderDateTime(value: string) {
  const [datePart, timePart = "00:00"] = value.split(" ");
  const [year = "1970", month = "01", day = "01"] = datePart.split("-");
  const [hour = "00", minute = "00"] = timePart.split(":");

  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
}

function getOrderSortValue(order: Order) {
  const bookedTime = parseOrderDateTime(order.bookedAt).getTime();

  if (Number.isFinite(bookedTime) && bookedTime > 0) {
    return bookedTime;
  }

  const createdTime = parseOrderDateTime(order.createdAt).getTime();
  return Number.isFinite(createdTime) ? createdTime : 0;
}

function sortOrdersNewestFirst(orderList: Order[]) {
  return [...orderList].sort((left, right) => getOrderSortValue(right) - getOrderSortValue(left));
}

function getPaymentCopy(paymentStatus: Order["paymentStatus"], mode: Order["mode"]) {
  if (paymentStatus === "paid") {
    return "平台已支付";
  }

  if (paymentStatus === "depositPaid") {
    return "平台定金 + 线下尾款";
  }

  if (paymentStatus === "refunded") {
    return "平台原路退款";
  }

  return mode === "store" ? "到店后确认付款" : "待平台支付";
}

function getPaymentTone(paymentStatus: Order["paymentStatus"]) {
  if (paymentStatus === "paid") {
    return "green" as const;
  }

  if (paymentStatus === "depositPaid") {
    return "blue" as const;
  }

  if (paymentStatus === "refunded") {
    return "neutral" as const;
  }

  return "yellow" as const;
}

function getStatusTone(status: Order["status"]) {
  if (status === "completed") {
    return "green" as const;
  }

  if (status === "cancelled" || status === "refunded" || status === "refunding") {
    return "red" as const;
  }

  if (status === "inService") {
    return "blue" as const;
  }

  return "yellow" as const;
}

function getSourceLabel(source: Order["source"]) {
  if (source === "app") {
    return "App";
  }

  if (source === "web") {
    return "Web";
  }

  if (source === "line") {
    return "LINE";
  }

  return "Partner";
}

function getModeLabel(mode: Order["mode"]) {
  return mode === "home" ? "上门服务" : "到店预约";
}

function resolveOrderCover(order: Order, stores: ReturnType<typeof useEntityStore>["stores"]) {
  const service = services.find((item) => order.itemName.includes(item.name) || item.name.includes(order.itemName));
  const store = stores.find((item) => item.name === order.storeName);

  return service?.cover ?? store?.cover ?? services[0]?.cover ?? "";
}

function readDeletedOrderIds() {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  try {
    const raw = window.localStorage.getItem(deletedOrdersStorageKey);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return Array.from(new Set(parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)));
  } catch {
    return [];
  }
}

function OrderSummaryCard({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <div className="rounded-[20px] bg-white/10 px-3 py-3">
      <p className="text-[11px] font-black text-white/58">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <strong className="text-[26px] font-black leading-none tracking-[-0.04em] text-white">{value}</strong>
        <span className="text-[11px] font-bold text-white/55">{helper}</span>
      </div>
    </div>
  );
}

export function UserOrdersPage() {
  const navigate = useNavigate();
  const { stores } = useEntityStore();
  const [deletedOrderIds, setDeletedOrderIds] = useState<string[]>(() => readDeletedOrderIds());
  const [deletingOrderIds, setDeletingOrderIds] = useState<string[]>([]);
  const [renderedOrderLimit, setRenderedOrderLimit] = useState(initialOrderRenderCount);
  const orders = useUserOrders();
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const deletingOrderIdSetRef = useRef<Set<string>>(new Set());
  const deleteTimerIdsRef = useRef<number[]>([]);
  const deletedOrderIdSet = useMemo(() => new Set(deletedOrderIds), [deletedOrderIds]);
  const visibleOrders = useMemo(() => sortOrdersNewestFirst(orders.filter((order) => !deletedOrderIdSet.has(order.id))), [deletedOrderIdSet, orders]);
  const renderedOrders = useMemo(
    () => visibleOrders.slice(0, Math.min(renderedOrderLimit, visibleOrders.length)),
    [renderedOrderLimit, visibleOrders]
  );
  const counts = useMemo(
    () => ({
      all: filterOrders(visibleOrders, "all").length,
      pending: filterOrders(visibleOrders, "pending").length,
      active: filterOrders(visibleOrders, "active").length,
      history: filterOrders(visibleOrders, "history").length
    }),
    [visibleOrders]
  );

  const loadMoreOrders = useCallback(() => {
    setRenderedOrderLimit((current) => Math.min(current + orderRenderBatchSize, visibleOrders.length));
  }, [visibleOrders.length]);

  useEffect(() => {
    setRenderedOrderLimit((current) => Math.min(Math.max(current, initialOrderRenderCount), Math.max(visibleOrders.length, initialOrderRenderCount)));
  }, [visibleOrders.length]);

  useEffect(() => {
    const trigger = loadMoreTriggerRef.current;

    if (!trigger || renderedOrderLimit >= visibleOrders.length || typeof window === "undefined" || typeof window.IntersectionObserver !== "function") {
      return;
    }

    const observer = new window.IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreOrders();
        }
      },
      {
        root: scrollRootRef.current,
        rootMargin: "720px 0px",
        threshold: 0.01
      }
    );

    observer.observe(trigger);

    return () => observer.disconnect();
  }, [loadMoreOrders, renderedOrderLimit, visibleOrders.length]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(deletedOrdersStorageKey, JSON.stringify(deletedOrderIds));
  }, [deletedOrderIds]);

  useEffect(
    () => () => {
      deletingOrderIdSetRef.current.clear();
      deleteTimerIdsRef.current.forEach((timerId) => window.clearTimeout(timerId));
    },
    []
  );

  const closePage = () => {
    if (typeof window !== "undefined" && typeof window.history.state?.idx === "number" && window.history.state.idx > 0) {
      navigate(-1);
      return;
    }

    navigate("/", { replace: true });
  };

  const deleteOrder = (orderId: string) => {
    if (deletedOrderIdSet.has(orderId) || deletingOrderIdSetRef.current.has(orderId)) {
      return;
    }

    deletingOrderIdSetRef.current.add(orderId);
    setDeletingOrderIds((current) => [...current, orderId]);

    if (typeof window === "undefined") {
      setDeletedOrderIds((current) => (current.includes(orderId) ? current : [...current, orderId]));
      setDeletingOrderIds((current) => current.filter((item) => item !== orderId));
      deletingOrderIdSetRef.current.delete(orderId);
      return;
    }

    const timerId = window.setTimeout(() => {
      setDeletedOrderIds((current) => (current.includes(orderId) ? current : [...current, orderId]));
      setDeletingOrderIds((current) => current.filter((item) => item !== orderId));
      deletingOrderIdSetRef.current.delete(orderId);
      deleteTimerIdsRef.current = deleteTimerIdsRef.current.filter((item) => item !== timerId);
    }, deleteAnimationDurationMs);

    deleteTimerIdsRef.current.push(timerId);
  };

  return (
    <MobileShell navItems={[]}>
      <MobileFullscreenPage>
        <MobileFullscreenHeader
          className={fullscreenHeaderClassName}
          info="确认后的订单、待服务记录与历史履约都统一收口在这里。"
          onBack={closePage}
          title="预约一览"
        />

        <main ref={scrollRootRef} className="scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-8">
          <section className="overflow-hidden rounded-[28px] bg-ink text-white shadow-soft">
            <div className="p-4">
              <div className="grid grid-cols-2 gap-2">
                <OrderSummaryCard helper="全部" label="订单总数" value={counts.all} />
                <OrderSummaryCard helper="待跟进" label="待服务" value={counts.pending} />
                <OrderSummaryCard helper="履约中" label="进行中" value={counts.active} />
                <OrderSummaryCard helper="已归档" label="历史记录" value={counts.history} />
              </div>
            </div>
          </section>

          <section>
            {visibleOrders.length > 0 ? (
              <>
                {renderedOrders.map((order, index) => {
                  const cover = resolveOrderCover(order, stores);
                  const isDeleting = deletingOrderIds.includes(order.id);

                  return (
                    <div
                      className={cn(
                        "user-orders-delete-item mb-3 origin-top overflow-hidden",
                        isDeleting && "pointer-events-none",
                        "last:mb-0"
                      )}
                      data-deleting={isDeleting ? "true" : "false"}
                      key={order.id}
                    >
                      <div className={cn(surfaceCardClassName, "user-orders-delete-card relative overflow-hidden")}>
                        <button
                          aria-label={`删除订单 ${order.orderNo}`}
                          className={cn(
                            "absolute right-4 top-4 z-10 appearance-none rounded-full border border-transparent px-3 py-1.5 text-[11px] font-black text-white outline-none ring-0 transition active:scale-[0.97]",
                            isDeleting
                              ? "bg-[#8f1d1d] shadow-[0_10px_22px_rgba(110,24,24,0.24)]"
                              : "bg-[#c62828] shadow-[0_10px_22px_rgba(162,24,24,0.28)]"
                          )}
                          disabled={isDeleting}
                          onClick={() => deleteOrder(order.id)}
                          type="button"
                        >
                          {isDeleting ? "删除中" : "删除"}
                        </button>
                        <button
                          className={cn("block w-full text-left transition-opacity", isDeleting && "opacity-70")}
                          disabled={isDeleting}
                          onClick={() => navigate(`/orders/${order.id}`)}
                          type="button"
                        >
                          <div className="flex items-start gap-3 pr-[88px]">
                            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[22px] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]">
                              {cover ? (
                                <img
                                  alt={order.itemName}
                                  className="h-full w-full object-cover"
                                  decoding="async"
                                  loading={index < 2 ? "eager" : "lazy"}
                                  src={cover}
                                />
                              ) : null}
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-8">
                                <span className="text-[10px] font-black text-white">{order.bookedAt.split(" ")[0]}</span>
                              </div>
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge tone={getStatusTone(order.status)}>{statusLabel(order.status)}</Badge>
                                <Badge tone={getPaymentTone(order.paymentStatus)}>{getPaymentCopy(order.paymentStatus, order.mode)}</Badge>
                              </div>

                              <h2 className="mt-3 text-lg font-black leading-6 text-[color:var(--client-text)]">{order.itemName}</h2>
                              <p className="mt-2 text-sm leading-6 text-[color:var(--client-muted)]">{order.bookedAt} · {order.city} {order.area}</p>

                              <div className="mt-3 flex flex-wrap gap-2">
                                <span className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1.5 text-[11px] font-black text-[color:var(--client-primary)]">
                                  {getModeLabel(order.mode)}
                                </span>
                                <span className="rounded-full bg-[color:color-mix(in_srgb,var(--client-surface)_70%,transparent)] px-3 py-1.5 text-[11px] font-black text-[color:var(--client-muted)]">
                                  {order.technicianName ?? order.storeName ?? "待分配"}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2">
                            {[
                              ["订单编号", order.orderNo],
                              ["来源", getSourceLabel(order.source)],
                              ["支付状态", getPaymentCopy(order.paymentStatus, order.mode)],
                              ["订单金额", yen(order.amount)]
                            ].map(([label, value]) => (
                              <div className="rounded-[18px] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-3 py-3" key={label}>
                                <p className="text-[11px] font-black text-[color:var(--client-muted)]">{label}</p>
                                <p className="mt-1 truncate text-sm font-black text-[color:var(--client-text)]">{value}</p>
                              </div>
                            ))}
                          </div>

                          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] pt-4">
                            <p className="text-xs font-bold text-[color:var(--client-muted)]">{order.remark?.trim() ? "已写入预约备注" : "当前没有额外备注"}</p>
                            <span className="shrink-0 text-sm font-black text-[color:var(--client-primary)]">查看详情 ›</span>
                          </div>
                        </button>
                      </div>
                    </div>
                  );
                })}
                {renderedOrderLimit < visibleOrders.length ? (
                  <div ref={loadMoreTriggerRef} className="pt-1">
                    <button
                      className="focus-ring h-11 w-full rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] px-4 text-sm font-black text-[color:var(--client-primary)]"
                      onClick={loadMoreOrders}
                      type="button"
                    >
                      加载更多预约
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <section className={cn(surfaceCardClassName, "text-center")}>
                <TitleWithInfo
                  as="h2"
                  className="justify-center"
                  info="等有新的预约进入当前状态后，这里会自动同步显示。"
                  label="空订单说明"
                  title="这一栏暂时还没有订单"
                  titleClassName="text-xl font-black text-[color:var(--client-text)]"
                />
              </section>
            )}
          </section>
        </main>
      </MobileFullscreenPage>
    </MobileShell>
  );
}
