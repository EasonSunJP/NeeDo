import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppIcon, PrimaryButton, SecondaryButton } from "../../components/client-ui/AppScaffold";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { MobileShell } from "../../components/mobile/MobileShell";
import { Badge } from "../../components/ui/Badge";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { services } from "../../data/mock";
import { cn, statusLabel } from "../../lib/utils";
import { ServiceReviewPrompt, type ServiceReviewSubmission, type ServiceReviewTag } from "../../shared/order-detail/ServiceSessionUi";
import { SocialProfileMiniCard } from "../../shared/profile-card";
import { useEntityStore } from "../../state/entityStore";
import { dismissOrderServiceReview, submitOrderServiceUserReview } from "../../state/orderServiceSessionStore";
import { useUserOrders } from "../../state/userOrderStore";
import type { Order, ServiceItem, Store, Technician } from "../../types/domain";

const fullscreenHeaderClassName =
  "";
const surfaceCardClassName =
  "rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_92%,#f7f7f2)] p-2.5 shadow-panel";
const deletedOrdersStorageKey = "needo.user.orders.deleted.v1";
const deleteAnimationDurationMs = 360;
const initialOrderRenderCount = 12;
const orderRenderBatchSize = 12;
const orderReviewTags: ServiceReviewTag[] = [
  { label: "氛围很好", count: 8, kind: "chip" },
  { label: "服务细致", count: 6, kind: "chip" },
  { label: "还会再约", count: 5, kind: "chip" },
  { label: "准时到达", count: 4, kind: "chip" }
];

type OrderProvider =
  | { type: "store"; store: Store }
  | { type: "technician"; technician: Technician };

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

function getModeLabel(mode: Order["mode"]) {
  return mode === "home" ? "上门服务" : "到店服务";
}

function normalizeOrderServiceName(value: string) {
  return value.replace(/\s+\d+\s*分钟/g, "").trim();
}

function findServiceForOrder(order: Order): ServiceItem {
  const normalizedOrderName = normalizeOrderServiceName(order.itemName);

  return services.find((service) =>
    order.itemName.includes(service.name) ||
    service.name.includes(normalizedOrderName) ||
    service.packages.some((item) => order.itemName.includes(item.name))
  ) ?? services[0]!;
}

function findPackageForOrder(order: Order, service: ServiceItem) {
  const durationMatch = order.itemName.match(/(\d+)\s*分钟/);
  const duration = durationMatch ? Number(durationMatch[1]) : undefined;

  return service.packages.find((item) =>
    order.itemName.includes(item.name) ||
    item.price === order.amount ||
    (typeof duration === "number" && item.durationMinutes === duration)
  ) ?? service.packages[0];
}

function resolveOrderProvider(order: Order, stores: Store[], technicians: Technician[]): OrderProvider | null {
  if (order.mode === "store") {
    const store = stores.find((item) => item.name === order.storeName);
    return store ? { type: "store", store } : null;
  }

  const technician = technicians.find((item) => item.name === order.technicianName || item.nickname === order.technicianName);
  return technician ? { type: "technician", technician } : null;
}

function getProviderDetailPath(provider: OrderProvider | null) {
  if (!provider) {
    return null;
  }

  return provider.type === "store" ? `/stores/${provider.store.id}` : `/profiles/technician/${provider.technician.id}`;
}

function getOrderBaseDurationMinutes(order: Order) {
  const service = findServiceForOrder(order);
  return findPackageForOrder(order, service)?.durationMinutes ?? 60;
}

function getOrderReviewRewardMaxNdp(order: Order) {
  return Math.max(0, Math.round(order.amount / 100));
}

function getRebookPath(order: Order, provider: OrderProvider | null) {
  const service = findServiceForOrder(order);
  const selectedPackage = findPackageForOrder(order, service);
  const params = new URLSearchParams();

  if (selectedPackage?.id) {
    params.set("package", selectedPackage.id);
  }

  if (provider?.type === "store") {
    params.set("store", provider.store.id);
  } else if (provider?.type === "technician") {
    params.set("mode", "home");
    params.set("technician", provider.technician.id);
  }

  const query = params.toString();
  return `/checkout/${service.id}${query ? `?${query}` : ""}`;
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

function OrderProviderInfoCard({
  className,
  detailTo,
  orderNo,
  provider
}: {
  className?: string;
  detailTo?: string | null;
  orderNo?: string;
  provider: OrderProvider | null;
}) {
  if (!provider) {
    return null;
  }

  const sharedProps = {
    className: cn("user-orders-provider-card shadow-none", className),
    detailTo: detailTo ?? undefined
  };

  return (
    <div className="relative">
      {orderNo ? (
        <span className="pointer-events-none absolute left-4 top-3 z-30 max-w-[calc(100%-8rem)] truncate text-[11px] font-normal leading-none text-white/72">
          {orderNo}
        </span>
      ) : null}
      {provider.type === "store" ? (
        <SocialProfileMiniCard store={provider.store} {...sharedProps} />
      ) : (
        <SocialProfileMiniCard technician={provider.technician} {...sharedProps} />
      )}
    </div>
  );
}

function OrderActionButton({
  icon,
  label,
  onClick,
  tone
}: {
  icon: "calendar" | "chat" | "check" | "star";
  label: string;
  onClick: () => void;
  tone: "primary" | "secondary";
}) {
  const ButtonComponent = tone === "primary" ? PrimaryButton : SecondaryButton;

  return (
    <ButtonComponent
      className={cn(
        "user-orders-action-button h-11 w-full rounded-[16px] px-2 text-[12px]",
        tone === "primary" && "user-orders-primary-action-button"
      )}
      onClick={onClick}
    >
      <AppIcon className="h-4 w-4 shrink-0" name={icon} />
      <span className="min-w-0 truncate">{label}</span>
    </ButtonComponent>
  );
}

function OrderDeleteIcon({ className }: { className?: string }) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={cn("user-orders-delete-icon pointer-events-none block object-contain", className)}
      decoding="async"
      src="/images/generated/ui/order-delete-ai-icon.png"
    />
  );
}

export function UserOrdersPage() {
  const navigate = useNavigate();
  const { stores, technicians } = useEntityStore();
  const [deletedOrderIds, setDeletedOrderIds] = useState<string[]>(() => readDeletedOrderIds());
  const [deletingOrderIds, setDeletingOrderIds] = useState<string[]>([]);
  const [renderedOrderLimit, setRenderedOrderLimit] = useState(initialOrderRenderCount);
  const [reviewingOrderId, setReviewingOrderId] = useState<string | null>(null);
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
  const reviewingOrder = useMemo(() => visibleOrders.find((order) => order.id === reviewingOrderId) ?? null, [reviewingOrderId, visibleOrders]);
  const reviewingProvider = useMemo(
    () => (reviewingOrder ? resolveOrderProvider(reviewingOrder, stores, technicians) : null),
    [reviewingOrder, stores, technicians]
  );
  const closeReviewPrompt = () => {
    if (reviewingOrder) {
      dismissOrderServiceReview(reviewingOrder.id, getOrderBaseDurationMinutes(reviewingOrder), "user");
    }

    setReviewingOrderId(null);
  };
  const submitReviewPrompt = (submission: ServiceReviewSubmission) => {
    if (!reviewingOrder) {
      return;
    }

    submitOrderServiceUserReview(reviewingOrder.id, getOrderBaseDurationMinutes(reviewingOrder), {
      rating: submission.rating,
      tags: submission.tags,
      maxRewardNdp: getOrderReviewRewardMaxNdp(reviewingOrder)
    });
    setReviewingOrderId(null);
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
          <section>
            {visibleOrders.length > 0 ? (
              <>
                {renderedOrders.map((order) => {
                  const isDeleting = deletingOrderIds.includes(order.id);
                  const provider = resolveOrderProvider(order, stores, technicians);
                  const providerDetailPath = getProviderDetailPath(provider);

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
                        <div className={cn("transition-opacity", isDeleting && "opacity-70")}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <Badge tone={getStatusTone(order.status)}>{statusLabel(order.status)}</Badge>
                              <span className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1.5 text-[11px] font-black text-[color:var(--client-primary)]">
                                {getModeLabel(order.mode)}
                              </span>
                            </div>
                            <button
                              aria-label={`${isDeleting ? "删除中" : "删除订单"} ${order.orderNo}`}
                              className={cn(
                                "user-orders-delete-button grid h-10 w-10 shrink-0 place-items-center appearance-none rounded-full border bg-transparent outline-none ring-0 transition active:scale-[0.97]",
                                isDeleting
                                  ? "opacity-50"
                                  : "opacity-100"
                              )}
                              disabled={isDeleting}
                              onClick={() => deleteOrder(order.id)}
                              type="button"
                            >
                              <OrderDeleteIcon />
                            </button>
                          </div>

                          <div className="mt-2.5">
                            <OrderProviderInfoCard
                              detailTo={providerDetailPath}
                              orderNo={order.orderNo}
                              provider={provider}
                            />
                          </div>

                          <div className="user-orders-action-row mt-2.5 grid grid-cols-3 gap-1.5">
                            <OrderActionButton icon="chat" label="评论" onClick={() => setReviewingOrderId(order.id)} tone="secondary" />
                            <OrderActionButton icon="check" label="详细" onClick={() => navigate(`/orders/${order.id}`)} tone="secondary" />
                            <OrderActionButton
                              icon="calendar"
                              label="再次预约"
                              onClick={() => navigate(getRebookPath(order, provider))}
                              tone="primary"
                            />
                          </div>
                        </div>
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
        {reviewingOrder ? (
          <ServiceReviewPrompt
            message={`${reviewingOrder.storeName ?? reviewingOrder.technicianName ?? reviewingOrder.itemName} 的本次体验。`}
            onSkip={closeReviewPrompt}
            onSubmit={submitReviewPrompt}
            submitHint={`评价后预计可获得 0~${getOrderReviewRewardMaxNdp(reviewingOrder)}NDP`}
            submitLabel="提交评价"
            tagOptions={orderReviewTags}
            title="写评论"
            topContent={
              <OrderProviderInfoCard
                provider={reviewingProvider}
              />
            }
          />
        ) : null}
      </MobileFullscreenPage>
    </MobileShell>
  );
}
