import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  bookingApi,
  formatApiOrderDateTime,
  type BookingOrder,
  type BookingOrderStatus
} from "../../features/booking/api";
import { describeBookingOrderMutationError } from "../../features/booking/orderMutationError";
import { loadEveryTechnicianOrder } from "../../features/scheduling/window-loader";
import { useProvidedI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { cn, yen } from "../../lib/utils";
import { Button } from "../ui/Button";

type OrderFilter = "active" | "completed" | "cancelled";
type OrderAction = "confirm" | "cancel";

function orderMatchesFilter(status: BookingOrderStatus, filter: OrderFilter) {
  if (filter === "completed") return status === "completed";
  if (filter === "cancelled") return status === "cancelled";
  return status === "pending" || status === "confirmed" || status === "inService" || status === "awaitingCheckout" || status === "awaitingPaymentConfirmation";
}

function primaryActionLabel(status: BookingOrderStatus) {
  if (status === "pending") return "确认接单";
  return null;
}

function orderStatusLabel(status: BookingOrderStatus) {
  if (status === "pending") return "待确认";
  if (status === "confirmed") return "已确认";
  if (status === "inService") return "服务中";
  if (status === "awaitingCheckout") return "等待客户结账";
  if (status === "awaitingPaymentConfirmation") return "等待确认收款";
  if (status === "completed") return "已完成";
  return "已取消";
}

function paymentLabel(order: BookingOrder) {
  const method = order.paymentMethod === "onsite" ? "现场支付" : order.paymentMethod === "bank_transfer" ? "银行转账" : order.paymentMethod === "cash" ? "现金" : order.paymentMethod === "ndp" ? "NDP" : "其他方式";
  const status = order.paymentStatus === "confirmed"
    ? "已确认收款"
    : order.paymentStatus === "refundPending"
      ? "退款处理中"
      : order.paymentStatus === "refunded"
        ? "已退款"
        : "待确认收款";
  return `${method} · ${status}`;
}

export function FormalTechnicianOrdersPanel() {
  const language = useProvidedI18n()?.language ?? "zh";
  const t = (source: string) => translateText(source, language);
  const [orders, setOrders] = useState<BookingOrder[]>([]);
  const [loadStatus, setLoadStatus] = useState<"loading" | "success" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState<OrderFilter>("active");
  const [actionOrderId, setActionOrderId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [cancelConfirmOrderId, setCancelConfirmOrderId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setLoadStatus("loading");
    setLoadError("");

    loadEveryTechnicianOrder()
      .then((data) => {
        if (!active) return;
        setOrders(data);
        setLoadStatus("success");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setOrders([]);
        setLoadError(describeBookingOrderMutationError(error, language));
        setLoadStatus("error");
      });

    return () => {
      active = false;
    };
  }, [language, revision]);

  const visibleOrders = useMemo(
    () => orders
      .filter((order) => orderMatchesFilter(order.status, filter))
      .sort((left, right) => right.startsAt.localeCompare(left.startsAt)),
    [filter, orders]
  );

  const runAction = async (order: BookingOrder, action: OrderAction) => {
    if (actionOrderId !== null) return;
    setActionOrderId(order.id);
    setActionError("");
    try {
      let updated: BookingOrder;
      if (action === "confirm") updated = await bookingApi.confirmOrder(order.id);
      else updated = await bookingApi.cancelOrder(order.id, "技师端取消正式预约");

      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setCancelConfirmOrderId(null);
    } catch (error) {
      setActionError(describeBookingOrderMutationError(error, language));
    } finally {
      setActionOrderId(null);
    }
  };

  const runPrimaryAction = (order: BookingOrder) => {
    if (order.status === "pending") return runAction(order, "confirm");
    return Promise.resolve();
  };

  if (loadStatus === "loading") {
    return (
      <section className="rounded-[24px] border border-white/10 bg-white/[0.06] px-4 py-8 text-center" aria-live="polite">
        <p className="text-sm font-black text-white">正在加载正式订单</p>
      </section>
    );
  }

  if (loadStatus === "error") {
    return (
      <section className="rounded-[24px] border border-red-400/30 bg-red-500/10 px-4 py-6 text-center" role="alert">
        <h3 className="text-base font-black text-white">正式订单加载失败</h3>
        <p className="mt-2 text-xs font-bold leading-5 text-white/60">{loadError}</p>
        <Button className="mt-4 w-full" onClick={() => setRevision((current) => current + 1)}>
          重新加载订单
        </Button>
      </section>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {([
          ["active", "待处理"],
          ["completed", "已完成"],
          ["cancelled", "已取消"]
        ] as const).map(([value, label]) => (
          <button
            className={cn(
              "rounded-full border px-2 py-2 text-xs font-black transition",
              filter === value
                ? "border-transparent bg-[color:var(--client-primary)] text-[#090806]"
                : "border-white/10 bg-white/[0.06] text-white/62"
            )}
            key={value}
            onClick={() => setFilter(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {actionError ? (
        <section className="rounded-[20px] border border-red-400/30 bg-red-500/10 px-4 py-3" role="alert">
          <p className="text-xs font-black text-red-300">{actionError}</p>
          {actionError ? (
            <Button className="mt-3 w-full" onClick={() => setRevision((current) => current + 1)} size="sm" variant="secondary">
              重新加载订单
            </Button>
          ) : null}
        </section>
      ) : null}

      {visibleOrders.length === 0 ? (
        <section className="rounded-[24px] border border-dashed border-white/15 bg-white/[0.04] px-4 py-8 text-center">
          <p className="text-sm font-black text-white">当前没有正式订单</p>
          <p className="mt-1 text-xs font-bold text-white/50">新订单和状态变化会从服务器同步到这里。</p>
        </section>
      ) : (
        visibleOrders.map((order) => {
          const primaryLabel = primaryActionLabel(order.status);
          const actionPending = actionOrderId === order.id;
          const canCancel = order.status === "pending" || order.status === "confirmed";
          const cancelArmed = cancelConfirmOrderId === order.id;

          return (
            <article className="rounded-[24px] border border-white/10 bg-white/[0.06] p-4" key={order.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-black text-white/70">{orderStatusLabel(order.status)}</span>
                    <span className="text-[10px] font-bold text-white/45">{order.orderNo}</span>
                  </div>
                  <h3 className="mt-3 text-base font-black text-white">{order.serviceName}</h3>
                  <p className="mt-1 text-xs font-bold text-white/55">{order.shopName} · 用户 #{order.customerUserId}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="block text-[10px] font-bold text-white/45">
                    {t(order.amountSource === "checkout" || order.amountSource === "order_payment" || order.amountSource === "accepted_add_ons" ? "顾客支付总额" : "订单金额")}
                  </span>
                  <strong className="mt-1 block text-base font-black text-[color:var(--client-primary)]">
                    {yen(order.paymentAmountJpy)}
                  </strong>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-[16px] bg-black/15 px-3 py-2.5">
                  <dt className="font-bold text-white/45">预约时间</dt>
                  <dd className="mt-1 font-black text-white">{formatApiOrderDateTime(order.startsAt)}</dd>
                </div>
                <div className="rounded-[16px] bg-black/15 px-3 py-2.5">
                  <dt className="font-bold text-white/45">付款</dt>
                  <dd className="mt-1 font-black text-white">{paymentLabel(order)}</dd>
                </div>
              </dl>

              <div className="mt-4 border-t border-white/10 pt-3">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">状态记录</p>
                <div className="mt-2 space-y-2">
                  {order.statusHistory.map((history) => (
                    <div className="flex items-start justify-between gap-3 text-[11px]" key={history.id}>
                      <span className="font-black text-white/75">{orderStatusLabel(history.toStatus)}</span>
                      <span className="text-right font-bold text-white/45">
                        {formatApiOrderDateTime(history.createdAt)}{history.reason ? ` · ${history.reason}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <Link
                className="mt-4 grid h-9 place-items-center rounded-full border border-white/15 text-xs font-black text-white"
                to={`/technician/orders/${order.id}`}
              >
                查看详情
              </Link>

              {primaryLabel || canCancel ? (
                <div className={cn("mt-4 grid gap-2", primaryLabel && canCancel ? "grid-cols-2" : "grid-cols-1")}>
                  {canCancel ? (
                    <Button
                      disabled={actionOrderId !== null}
                      onClick={() => {
                        if (!cancelArmed) {
                          setCancelConfirmOrderId(order.id);
                          return;
                        }
                        void runAction(order, "cancel");
                      }}
                      variant="danger"
                    >
                      {actionPending ? "操作处理中" : cancelArmed ? "再次点击确认取消" : "取消预约"}
                    </Button>
                  ) : null}
                  {primaryLabel ? (
                    <Button disabled={actionOrderId !== null} onClick={() => void runPrimaryAction(order)}>
                      {actionPending ? "操作处理中" : primaryLabel}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })
      )}
    </div>
  );
}
