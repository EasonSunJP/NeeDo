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
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { getAuthenticatedPersistentCacheScope } from "../../lib/persistentCacheScope";
import { cn, statusLabel, yen } from "../../lib/utils";
import type { Order } from "../../types/domain";
import { getRebookAction } from "./rebookRoute";

const fullscreenHeaderClassName = "";
const surfaceCardClassName =
  "rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_92%,#f7f7f2)] p-2.5 shadow-panel";
const initialOrderRenderCount = 12;
const orderRenderBatchSize = 12;

function parseOrderDateTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value.trim());

  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }

  return date;
}

function getOrderSortValue(order: Order) {
  const bookedTime = parseOrderDateTime(order.bookedAt)?.getTime();

  if (bookedTime !== undefined && bookedTime > 0) return bookedTime;
  return parseOrderDateTime(order.createdAt)?.getTime() ?? 0;
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

function formatOrderPaymentSummary(order: Order) {
  if (order.paymentChannel === "ndp") {
    if (order.checkoutPaymentAmountNdp !== undefined && order.ndpCurrency !== undefined) {
      const unit = order.ndpCurrency === "TEST_NDP" ? "Test NDP" : "NDP";
      return `${order.checkoutPaymentAmountNdp.toLocaleString("ja-JP")} ${unit}`;
    }
    return "NDP · UNKNOWN UNIT";
  }
  if (order.paymentChannel === "bank_transfer") return "银行转账";
  if (order.paymentChannel === "cash") return "现金";
  if (order.paymentChannel === "other") return order.otherPaymentMethodLabel ?? "其他方式";
  if (order.paymentChannel === "onsite") return "现金支付";
  return null;
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
  const { language } = useOptionalI18n();
  const detailTo = getProviderDetailPath(order);
  const providerName = getProviderName(order);
  const paymentSummary = formatOrderPaymentSummary(order);
  const serviceName = order.itemName.trim() || translateText("未设置", language);
  const shopName = order.storeName?.trim() || translateText("未设置", language);
  const appointmentTime = parseOrderDateTime(order.bookedAt) ? order.bookedAt.trim() : null;
  const avatar =
    order.mode === "store"
      ? "/images/generated/stores/store-cafe-consult.jpg"
      : "/images/generated/profiles/ai-profile-01.jpg";
  const card = (
    <div className="user-orders-provider-card grid grid-cols-[58px_minmax(0,1fr)] gap-3 rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,var(--client-bg)_14%)] p-3 shadow-none">
      <AvatarImage alt={providerName} className="col-start-1 row-start-1 h-[58px] w-[58px]" src={avatar} />
      <div className="col-start-2 row-start-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <dl className="min-w-0 flex-1 space-y-1.5">
            <div className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)] items-baseline gap-2" data-testid="user-order-service-field">
              <dt className="text-[10px] font-black text-[color:var(--client-primary)]" data-no-i18n>{translateText("服务", language)}</dt>
              <dd className="min-w-0 truncate text-sm font-black text-[color:var(--client-text)]" data-no-i18n title={serviceName}>{serviceName}</dd>
            </div>
            <div className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)] items-baseline gap-2" data-testid="user-order-shop-field">
              <dt className="text-[10px] font-black text-[color:var(--client-primary)]" data-no-i18n>{translateText("店铺", language)}</dt>
              <dd className="min-w-0 truncate text-xs font-bold text-[color:var(--client-text)]" data-no-i18n title={shopName}>{shopName}</dd>
            </div>
          </dl>
          <strong className="shrink-0 text-sm font-black text-[color:var(--client-primary)]">{yen(order.amount)}</strong>
        </div>
        <div className="mt-2 flex min-w-0 items-center justify-between gap-3 text-[10px] font-bold text-[color:var(--client-muted)]">
          <span className="truncate">{order.city} · {order.area}</span>
          <span className="max-w-36 shrink-0 truncate font-normal">{order.orderNo}</span>
        </div>
        {paymentSummary ? (
          <p className="user-orders-payment-summary mt-1 text-right text-[10px] font-bold text-[color:var(--client-muted)]">
            {paymentSummary}
          </p>
        ) : null}
        {appointmentTime ? (
          <dl className="user-orders-appointment-time mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 rounded-[12px] bg-[color:var(--client-primary-soft)] px-2.5 py-2 text-[11px]">
            <dt className="whitespace-nowrap font-black text-[color:var(--client-primary)]">预约时间</dt>
            <dd className="min-w-0 whitespace-nowrap text-right font-black text-[color:var(--client-text)]">
              <time data-no-i18n dateTime={appointmentTime}>{appointmentTime}</time>
            </dd>
          </dl>
        ) : null}
      </div>
    </div>
  );

  return detailTo ? <Link className="block" to={detailTo}>{card}</Link> : card;
}

function OrderActionButton({
  disabled = false,
  icon,
  label,
  onClick,
  tone
}: {
  disabled?: boolean;
  icon: "calendar" | "check";
  label: string;
  onClick: () => void;
  tone: "primary" | "secondary";
}) {
  const ButtonComponent = tone === "primary" ? PrimaryButton : SecondaryButton;
  const content = (
    <>
      <AppIcon className="h-4 w-4 shrink-0" name={icon} />
      <span className="min-w-0 truncate">{label}</span>
    </>
  );
  const className = cn(
    "user-orders-action-button h-11 w-full rounded-[16px] px-2 text-[12px]",
    tone === "primary" && "user-orders-primary-action-button"
  );

  if (disabled) {
    return (
      <button
        aria-disabled="true"
        className={cn(className, "cursor-not-allowed opacity-55")}
        disabled
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <ButtonComponent className={className} onClick={onClick}>{content}</ButtonComponent>
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
                const rebook = getRebookAction(order.rebook);

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

                      <div className="user-orders-action-row mt-2.5 grid grid-cols-2 gap-1.5">
                        <OrderActionButton icon="check" label="详细" onClick={() => navigate(`/orders/${order.id}`)} tone="secondary" />
                        <OrderActionButton
                          disabled={!rebook.enabled}
                          icon="calendar"
                          label={rebook.label}
                          onClick={() => {
                            if (!rebook.path) return;
                            navigate(rebook.path, rebook.notice ? { state: { notice: rebook.notice } } : undefined);
                          }}
                          tone="primary"
                        />
                      </div>
                      {rebook.notice ? (
                        <p className="mt-2 text-center text-[11px] font-bold text-[color:var(--client-muted)]" role="status">
                          {rebook.notice}
                        </p>
                      ) : null}
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
