import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiClientError } from "../../api/httpClient";
import { useAuth } from "../../auth/AuthProvider";
import { AppIcon, PrimaryButton, SecondaryButton } from "../../components/client-ui/AppScaffold";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { MobileShell } from "../../components/mobile/MobileShell";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { Badge } from "../../components/ui/Badge";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { bookingApi, mapBookingOrderToDomainOrder } from "../../features/booking/api";
import { useOrderRealtimeRefresh } from "../../features/booking/useOrderRealtimeRefresh";
import { useCoreReadQuery } from "../../features/core-read/hooks";
import { getAuthenticatedPersistentCacheScope } from "../../lib/persistentCacheScope";
import { cn, statusLabel, yen } from "../../lib/utils";
import type { Order } from "../../types/domain";
import { getRebookPath } from "./rebookRoute";

const fullscreenHeaderClassName = "";
const surfaceCardClassName =
  "rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_92%,#f7f7f2)] p-2.5 shadow-panel";
const initialOrderRenderCount = 12;
const orderRenderBatchSize = 12;

function parseOrderDateTime(value: string) {
  const [datePart, timePart = "00:00"] = value.split(" ");
  const [year = "1970", month = "01", day = "01"] = datePart.split("-");
  const [hour = "00", minute = "00"] = timePart.split(":");

  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
}

function getOrderSortValue(order: Order) {
  const bookedTime = parseOrderDateTime(order.bookedAt).getTime();

  if (Number.isFinite(bookedTime) && bookedTime > 0) return bookedTime;
  const createdTime = parseOrderDateTime(order.createdAt).getTime();
  return Number.isFinite(createdTime) ? createdTime : 0;
}

function sortOrdersNewestFirst(orderList: Order[]) {
  return [...orderList].sort((left, right) => getOrderSortValue(right) - getOrderSortValue(left));
}

function getStatusTone(status: Order["status"]) {
  if (status === "completed") return "green" as const;
  if (status === "cancelled" || status === "refunded" || status === "refunding") {
    return "red" as const;
  }
  if (status === "inService") return "blue" as const;
  return "yellow" as const;
}

function getModeLabel(mode: Order["mode"]) {
  return mode === "home" ? "上门服务" : "到店服务";
}

function getProviderName(order: Order) {
  return order.mode === "store"
    ? order.storeName ?? "服务店铺"
    : order.technicianName ?? order.storeName ?? "服务技师";
}

function getProviderDetailPath(order: Order) {
  if (order.mode === "store" && order.shopId) return `/stores/${order.shopId}`;
  if (order.technicianProfileId) return `/profiles/technician/${order.technicianProfileId}`;
  return null;
}

function describeOrderLoadError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前身份没有查看预约的权限";
    if (error.status >= 500) return "预约服务暂时不可用，请稍后重试";
  }

  return "预约加载失败，请检查网络后重试";
}

function OrderProviderInfoCard({ order }: { order: Order }) {
  const detailTo = getProviderDetailPath(order);
  const providerName = getProviderName(order);
  const avatar =
    order.mode === "store"
      ? "/images/generated/stores/store-cafe-consult.jpg"
      : "/images/generated/profiles/ai-profile-01.jpg";
  const card = (
    <div className="user-orders-provider-card grid grid-cols-[58px_minmax(0,1fr)] gap-3 rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,var(--client-bg)_14%)] p-3 shadow-none">
      <AvatarImage alt={providerName} className="h-[58px] w-[58px]" src={avatar} />
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-[color:var(--client-text)]">{providerName}</p>
            <p className="mt-1 line-clamp-1 text-xs font-bold text-[color:var(--client-muted)]">{order.itemName}</p>
          </div>
          <strong className="shrink-0 text-sm font-black text-[color:var(--client-primary)]">{yen(order.amount)}</strong>
        </div>
        <div className="mt-2 flex min-w-0 items-center justify-between gap-3 text-[10px] font-bold text-[color:var(--client-muted)]">
          <span className="truncate">{order.city} · {order.area}</span>
          <span className="max-w-36 shrink-0 truncate font-normal">{order.orderNo}</span>
        </div>
      </div>
    </div>
  );

  return detailTo ? <Link to={detailTo}>{card}</Link> : card;
}

function OrderActionButton({
  icon,
  label,
  onClick,
  tone
}: {
  icon: "calendar" | "check";
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

export function UserOrdersPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [queryRevision, setQueryRevision] = useState(0);
  const [renderedOrderLimit, setRenderedOrderLimit] = useState(initialOrderRenderCount);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const cacheScope = getAuthenticatedPersistentCacheScope();
  const ordersQuery = useCoreReadQuery(
    async () => {
      const data = await bookingApi.listOrders({ page: 1, pageSize: 100 });
      return data.list.map(mapBookingOrderToDomainOrder);
    },
    [isAuthenticated, queryRevision],
    {
      enabled: isAuthenticated,
      force: queryRevision > 0,
      key: "booking:customer-orders:page-1:size-100",
      scope: cacheScope
    }
  );
  const orders = ordersQuery.data ?? [];
  const queryStatus = !isAuthenticated
    ? "idle"
    : ordersQuery.loading
      ? "loading"
      : ordersQuery.error
        ? "error"
        : "success";
  const queryError = ordersQuery.error ? describeOrderLoadError(ordersQuery.error) : "";
  const visibleOrders = useMemo(() => sortOrdersNewestFirst(orders), [orders]);
  const renderedOrders = useMemo(
    () => visibleOrders.slice(0, Math.min(renderedOrderLimit, visibleOrders.length)),
    [renderedOrderLimit, visibleOrders]
  );
  const loadMoreOrders = useCallback(() => {
    setRenderedOrderLimit((current) => Math.min(current + orderRenderBatchSize, visibleOrders.length));
  }, [visibleOrders.length]);

  const refreshOrders = useCallback(() => {
    if (isAuthenticated) setQueryRevision((current) => current + 1);
  }, [isAuthenticated]);

  useOrderRealtimeRefresh({
    enabled: isAuthenticated,
    onRefresh: refreshOrders
  });

  useEffect(() => {
    setRenderedOrderLimit((current) =>
      Math.min(
        Math.max(current, initialOrderRenderCount),
        Math.max(visibleOrders.length, initialOrderRenderCount)
      )
    );
  }, [visibleOrders.length]);

  useEffect(() => {
    const trigger = loadMoreTriggerRef.current;

    if (
      !trigger ||
      renderedOrderLimit >= visibleOrders.length ||
      typeof window === "undefined" ||
      typeof window.IntersectionObserver !== "function"
    ) {
      return;
    }

    const observer = new window.IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMoreOrders();
      },
      { root: scrollRootRef.current, rootMargin: "720px 0px", threshold: 0.01 }
    );
    observer.observe(trigger);
    return () => observer.disconnect();
  }, [loadMoreOrders, renderedOrderLimit, visibleOrders.length]);

  const closePage = () => {
    if (
      typeof window !== "undefined" &&
      typeof window.history.state?.idx === "number" &&
      window.history.state.idx > 0
    ) {
      navigate(-1);
      return;
    }
    navigate("/", { replace: true });
  };

  return (
    <MobileShell navItems={[]}>
      <MobileFullscreenPage innerClassName="client-glass-page-surface">
        <MobileFullscreenHeader
          className={cn(fullscreenHeaderClassName, "needo-orders-glass-header")}
          info="确认后的订单、待服务记录与历史履约都统一收口在这里。"
          onBack={closePage}
          onClose={closePage}
          showSpacer={false}
          title="预约一览"
        />

        <main ref={scrollRootRef} className="client-app-gutter scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto pb-8 pt-[calc(env(safe-area-inset-top)+86px)]">
          {queryStatus === "loading" ? (
            <section className={cn(surfaceCardClassName, "text-center")} aria-live="polite">
              <AppIcon className="mx-auto h-6 w-6 animate-spin text-[color:var(--client-primary)]" name="clock" />
              <p className="mt-3 text-sm font-black text-[color:var(--client-text)]">正在加载预约</p>
            </section>
          ) : null}

          {queryStatus === "error" ? (
            <section className={cn(surfaceCardClassName, "text-center")} role="alert">
              <TitleWithInfo
                as="h2"
                className="justify-center"
                info={queryError}
                label="预约加载失败"
                title="暂时无法显示预约"
                titleClassName="text-xl font-black text-[color:var(--client-text)]"
              />
              <PrimaryButton className="mt-4 w-full" onClick={() => setQueryRevision((current) => current + 1)}>
                重新加载预约
              </PrimaryButton>
            </section>
          ) : null}

          {queryStatus === "success" && visibleOrders.length > 0 ? (
            <section>
              {renderedOrders.map((order) => {
                const rebookPath = getRebookPath(order);

                return (
                  <div className="user-orders-order-item mb-3 last:mb-0" key={order.id}>
                    <div className={cn(surfaceCardClassName, "relative overflow-hidden")}>
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Badge tone={getStatusTone(order.status)}>{statusLabel(order.status)}</Badge>
                        <span className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1.5 text-[11px] font-black text-[color:var(--client-primary)]">
                          {getModeLabel(order.mode)}
                        </span>
                      </div>

                      <div className="mt-2.5"><OrderProviderInfoCard order={order} /></div>

                      <div className={cn("user-orders-action-row mt-2.5 grid gap-1.5", rebookPath ? "grid-cols-2" : "grid-cols-1")}>
                        <OrderActionButton icon="check" label="详细" onClick={() => navigate(`/orders/${order.id}`)} tone="secondary" />
                        {rebookPath ? (
                          <OrderActionButton icon="calendar" label="再次预约" onClick={() => navigate(rebookPath)} tone="primary" />
                        ) : null}
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
            </section>
          ) : null}

          {queryStatus === "success" && visibleOrders.length === 0 ? (
            <section className={cn(surfaceCardClassName, "text-center")}>
              <TitleWithInfo
                as="h2"
                className="justify-center"
                info="新的预约创建后会从服务器自动同步到这里。"
                label="空订单说明"
                title="这一栏暂时还没有订单"
                titleClassName="text-xl font-black text-[color:var(--client-text)]"
              />
            </section>
          ) : null}
        </main>
      </MobileFullscreenPage>
    </MobileShell>
  );
}
