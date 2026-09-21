import { useEffect, useRef, useState } from "react";
import {
  backofficeRealDataApi,
  formatBackofficeOrderPaymentSummary,
  type BackofficeOrderDetailPayload,
  type BackofficeOrderPayload
} from "../../api/backofficeRealData";
import { ApiClientError } from "../../api/httpClient";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { AdminEventTimeline } from "../../components/admin/AdminEventTimeline";
import {
  OrderRelatedEntityDrawer,
  type OrderRelatedEntity
} from "../../components/admin/OrderRelatedEntityDrawer";
import { MerchantAdminLayout } from "../../components/merchant-admin/MerchantAdminLayout";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import {
  bookingApi,
  createBookingIdempotencyKey,
  type ManualPaymentMethod,
} from "../../features/booking/api";
import { mapBackofficeOrderTimeline } from "../../features/booking/backofficeOrderTimeline";
import { describeBookingOrderMutationError } from "../../features/booking/orderMutationError";
import { useProvidedI18n } from "../../i18n/I18nProvider";
import { statusLabel, yen } from "../../lib/utils";

type StatusFilter = "all" | "pending" | "confirmed" | "inService" | "completed" | "cancelled";
type ConfirmIntent = "cancel" | "service-end" | "payment-confirm" | "payment-refund" | null;
type PlatformFeeAcceptanceWarning = {
  availableBalanceNdp: number;
  feeAmountNdp: number;
  idempotencyKey: string;
  previewVersion: string;
  shortfallNdp: number;
};

const pageSize = 20;
const statusFilters: Array<{ label: string; value: StatusFilter }> = [
  { label: "全部", value: "all" },
  { label: "待确认", value: "pending" },
  { label: "已确认", value: "confirmed" },
  { label: "服务中", value: "inService" },
  { label: "已完成", value: "completed" },
  { label: "已取消", value: "cancelled" }
];

function isAmbiguousOrderMutationError(error: unknown) {
  return !(error instanceof ApiClientError) || error.status === 408 || error.status === 429 || error.status >= 500;
}

function readPlatformFeeAcceptanceWarning(
  error: unknown
): Omit<PlatformFeeAcceptanceWarning, "idempotencyKey"> | null {
  if (!(error instanceof ApiClientError) || error.code !== 40936 || !error.data || typeof error.data !== "object") {
    return null;
  }
  const data = error.data as Record<string, unknown>;
  if (
    typeof data.availableBalanceNdp !== "number" ||
    typeof data.feeAmountNdp !== "number" ||
    typeof data.shortfallNdp !== "number" ||
    typeof data.previewVersion !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(data.previewVersion)
  ) {
    return null;
  }
  return {
    availableBalanceNdp: data.availableBalanceNdp,
    feeAmountNdp: data.feeAmountNdp,
    previewVersion: data.previewVersion,
    shortfallNdp: data.shortfallNdp
  };
}

function paymentLabel(status: BackofficeOrderPayload["paymentStatus"]) {
  if (status === "confirmed") return "已确认收款";
  if (status === "refundPending") return "退款待处理";
  if (status === "refunded") return "已退款";
  return "待确认收款";
}

function paymentTone(status: BackofficeOrderPayload["paymentStatus"]) {
  if (status === "confirmed") return "green" as const;
  if (status === "refundPending") return "red" as const;
  if (status === "refunded") return "neutral" as const;
  return "yellow" as const;
}

export function MerchantAdminOrdersPage() {
  const language = useProvidedI18n()?.language ?? "zh";
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<BackofficeOrderDetailPayload | null>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [detailRevision, setDetailRevision] = useState(0);
  const [participant, setParticipant] = useState<OrderRelatedEntity>(null);
  const [orderRows, setOrderRows] = useState<BackofficeOrderPayload[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadStatus, setLoadStatus] = useState<"loading" | "success" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [mutationStatus, setMutationStatus] = useState<"idle" | "saving">("idle");
  const [mutationError, setMutationError] = useState("");
  const [acceptanceWarning, setAcceptanceWarning] = useState<PlatformFeeAcceptanceWarning | null>(null);
  const [confirmIntent, setConfirmIntent] = useState<ConfirmIntent>(null);
  const [cancelReason, setCancelReason] = useState("店铺无法按预约内容提供服务");
  const [paymentMethod, setPaymentMethod] = useState<ManualPaymentMethod>("onsite");
  const [paymentReference, setPaymentReference] = useState("");
  const [refundReason, setRefundReason] = useState("已核实退款原因并完成线下退款");
  const [verificationCode, setVerificationCode] = useState("");
  const transitionInFlightRef = useRef(false);
  const transitionKeys = useRef(new Map<"start" | "complete" | "receipt", { key: string; semantics: string }>());

  useEffect(() => {
    let current = true;
    setLoadStatus("loading");
    setLoadError("");
    backofficeRealDataApi.orders("merchant-admin", {
      page,
      pageSize,
      status: statusFilter === "all" ? undefined : statusFilter
    }).then((response) => {
      if (!current) return;
      setOrderRows(response.list);
      setTotal(response.total);
      setLoadStatus("success");
    }).catch((error: unknown) => {
      if (!current) return;
      setOrderRows([]);
      setTotal(0);
      setLoadError(describeBookingOrderMutationError(error, language));
      setLoadStatus("error");
    });
    return () => {
      current = false;
    };
  }, [language, page, revision, statusFilter]);

  useEffect(() => {
    if (selectedOrderId === null) return;
    let current = true;
    setDetailStatus("loading");
    setMutationError("");
    void backofficeRealDataApi.orderDetail("merchant-admin", selectedOrderId)
      .then((detail) => {
        if (!current) return;
        setSelectedOrder(detail);
        setDetailStatus("success");
      })
      .catch((error: unknown) => {
        if (!current) return;
        setSelectedOrder(null);
        setMutationError(describeBookingOrderMutationError(error, language));
        setDetailStatus("error");
      });
    return () => { current = false; };
  }, [detailRevision, language, selectedOrderId]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const openOrder = (order: BackofficeOrderPayload) => {
    setSelectedOrderId(order.id);
    setSelectedOrder(null);
    setDetailStatus("loading");
    setParticipant(null);
    setMutationError("");
    setAcceptanceWarning(null);
    setConfirmIntent(null);
    setPaymentReference("");
    setVerificationCode("");
  };
  const closeOrder = () => {
    if (mutationStatus === "saving") return;
    setParticipant(null);
    setSelectedOrderId(null);
    setSelectedOrder(null);
    setDetailStatus("idle");
    setMutationError("");
    setAcceptanceWarning(null);
    setConfirmIntent(null);
    setVerificationCode("");
  };
  const finishMutation = () => {
    setParticipant(null);
    setSelectedOrderId(null);
    setSelectedOrder(null);
    setDetailStatus("idle");
    setConfirmIntent(null);
    setMutationError("");
    setAcceptanceWarning(null);
    setVerificationCode("");
    setRevision((value) => value + 1);
  };

  const retainedTransitionKey = (action: "start" | "complete" | "receipt", semantics: string) => {
    const retained = transitionKeys.current.get(action);
    if (retained?.semantics === semantics) return retained.key;
    const key = createBookingIdempotencyKey();
    transitionKeys.current.set(action, { key, semantics });
    return key;
  };

  const runTransition = async (action: "confirm" | "start" | "complete" | "cancel") => {
    if (!selectedOrder || mutationStatus === "saving" || transitionInFlightRef.current) return;
    if (action === "cancel" && confirmIntent !== "cancel") {
      setConfirmIntent("cancel");
      return;
    }
    if (action === "complete" && confirmIntent !== "service-end") {
      setConfirmIntent("service-end");
      return;
    }
    const serviceAction = action === "start" || action === "complete" ? action : null;
    const serviceKey = serviceAction
      ? retainedTransitionKey(
          serviceAction,
          JSON.stringify([selectedOrder.id, serviceAction, serviceAction === "start" ? verificationCode : "店铺确认服务已结束"])
        )
      : null;
    transitionInFlightRef.current = true;
    setMutationStatus("saving");
    setMutationError("");
    try {
      if (action === "confirm") {
        await bookingApi.confirmOrder(
          selectedOrder.id,
          acceptanceWarning
            ? {
                insufficientBalanceConfirmation: {
                  confirmed: true,
                  idempotencyKey: acceptanceWarning.idempotencyKey,
                  previewVersion: acceptanceWarning.previewVersion
                }
              }
            : undefined
        );
      } else if (action === "start") {
        await bookingApi.startService(selectedOrder.id, {
          actor: "merchant",
          verificationCode,
          idempotencyKey: serviceKey!
        });
      } else if (action === "complete") {
        await bookingApi.endService(selectedOrder.id, {
          reason: "店铺确认服务已结束",
          idempotencyKey: serviceKey!
        });
      }
      else await bookingApi.cancelOrder(selectedOrder.id, cancelReason.trim() || "店铺取消正式预约");
      if (serviceAction) transitionKeys.current.delete(serviceAction);
      finishMutation();
    } catch (error: unknown) {
      const warning = action === "confirm" ? readPlatformFeeAcceptanceWarning(error) : null;
      if (warning) {
        setAcceptanceWarning((current) => ({
          ...warning,
          idempotencyKey:
            current?.previewVersion === warning.previewVersion
              ? current.idempotencyKey
              : createBookingIdempotencyKey()
        }));
      } else {
        if (serviceAction && !isAmbiguousOrderMutationError(error)) {
          transitionKeys.current.delete(serviceAction);
        }
        setMutationError(describeBookingOrderMutationError(error, language));
        setConfirmIntent(null);
      }
    } finally {
      transitionInFlightRef.current = false;
      setMutationStatus("idle");
    }
  };

  const confirmPayment = async () => {
    if (!selectedOrder || mutationStatus === "saving" || transitionInFlightRef.current) return;
    if (confirmIntent !== "payment-confirm") {
      setConfirmIntent("payment-confirm");
      return;
    }
    const isFormalCheckoutReceipt =
      selectedOrder.status === "awaiting_payment_confirmation" &&
      selectedOrder.effectivePaymentMethod === "cash";
    const receiptKey = isFormalCheckoutReceipt
      ? retainedTransitionKey(
          "receipt",
          JSON.stringify([selectedOrder.id, "merchant_receipt_override"])
        )
      : null;
    transitionInFlightRef.current = true;
    setMutationStatus("saving");
    setMutationError("");
    try {
      if (isFormalCheckoutReceipt) {
        await bookingApi.confirmMerchantReceipt(selectedOrder.id, {
          reason: "店铺收银台已当面确认收到现金",
          idempotencyKey: receiptKey!
        });
        transitionKeys.current.delete("receipt");
      } else {
        await bookingApi.confirmManualPayment("merchant-admin", selectedOrder.id, {
          amountJpy: Math.round(selectedOrder.totalAmountJpy),
          method: paymentMethod,
          reference: paymentReference.trim() || null,
          note: "店铺后台确认线下收款"
        });
      }
      finishMutation();
    } catch (error: unknown) {
      if (isFormalCheckoutReceipt && !isAmbiguousOrderMutationError(error)) {
        transitionKeys.current.delete("receipt");
      }
      setMutationError(describeBookingOrderMutationError(error, language));
      setConfirmIntent(null);
    } finally {
      transitionInFlightRef.current = false;
      setMutationStatus("idle");
    }
  };

  const refundPayment = async () => {
    if (!selectedOrder || mutationStatus === "saving") return;
    if (confirmIntent !== "payment-refund") {
      setConfirmIntent("payment-refund");
      return;
    }
    setMutationStatus("saving");
    setMutationError("");
    try {
      await bookingApi.refundManualPayment("merchant-admin", selectedOrder.id, {
        reason: refundReason.trim() || "店铺确认线下退款",
        reference: paymentReference.trim() || null
      });
      finishMutation();
    } catch (error: unknown) {
      setMutationError(describeBookingOrderMutationError(error, language));
      setConfirmIntent(null);
    } finally {
      setMutationStatus("idle");
    }
  };

  const changeFilter = (value: StatusFilter) => {
    setStatusFilter(value);
    setPage(1);
    closeOrder();
  };

  return (
    <MerchantAdminLayout>
      <ModuleShell
        title="订单中心"
        description="订单范围由当前登录店铺身份在服务端强制隔离；状态变更、线下收款与退款都写入正式订单和审计链路。"
        actions={(
          <div className="flex flex-wrap gap-2">
            {statusFilters.map(({ value, label }) => (
              <Button key={value} onClick={() => changeFilter(value)} variant={statusFilter === value ? "primary" : "secondary"}>{label}</Button>
            ))}
          </div>
        )}
      >
        {loadStatus === "loading" ? (
          <section className="rounded-lg border border-line bg-white px-5 py-10 text-center shadow-panel" aria-live="polite">
            <p className="text-sm font-black text-ink">正在加载本店正式订单</p>
          </section>
        ) : null}
        {loadStatus === "error" ? (
          <section className="rounded-lg border border-coral/30 bg-coral/5 px-5 py-8 text-center shadow-panel" role="alert">
            <h2 className="font-black text-ink">本店订单加载失败</h2>
            <p className="mt-2 text-sm font-bold text-ink/55">{loadError}</p>
            <Button className="mt-4" onClick={() => setRevision((value) => value + 1)}>重新加载本店订单</Button>
          </section>
        ) : null}
        {loadStatus === "success" && orderRows.length === 0 ? (
          <section className="rounded-lg border border-dashed border-line bg-white px-5 py-10 text-center">
            <p className="text-sm font-black text-ink/55">本店当前没有符合条件的正式订单</p>
          </section>
        ) : null}
        {loadStatus === "success" && orderRows.length > 0 ? (
          <>
            <DataTable<BackofficeOrderPayload>
              columns={[
                { key: "orderNo", title: "订单号", render: (row) => row.orderNo },
                { key: "customer", title: "用户", render: (row) => row.customerName },
                { key: "service", title: "服务 / 技师", render: (row) => `${row.serviceName} / ${row.technicianName ?? "待安排"}` },
                { key: "time", title: "预约时间", render: (row) => new Date(row.startsAt).toLocaleString("ja-JP") },
                { key: "payment", title: "支付", render: (row) => (
                  <span className="flex flex-col gap-1">
                    <Badge tone={paymentTone(row.paymentStatus)}>{paymentLabel(row.paymentStatus)}</Badge>
                    <span className="text-xs font-bold text-ink/45">{formatBackofficeOrderPaymentSummary(row)}</span>
                  </span>
                ) },
                { key: "status", title: "状态", render: (row) => <Badge tone="yellow">{statusLabel(row.status)}</Badge> },
                { key: "amount", title: "金额", render: (row) => yen(row.totalAmountJpy) },
                { key: "detail", title: "详情", render: (row) => <Button size="sm" variant="secondary" onClick={() => openOrder(row)}>查看</Button> }
              ]}
              paginationMode="server"
              rows={orderRows}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-paper px-4 py-3">
              <span className="text-sm font-bold text-ink/55">服务器共 {total} 条，第 {page} / {totalPages} 页</span>
              <div className="flex gap-2">
                <Button disabled={page <= 1} size="sm" variant="secondary" onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</Button>
                <Button disabled={page >= totalPages} size="sm" variant="secondary" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>下一页</Button>
              </div>
            </div>
          </>
        ) : null}
      </ModuleShell>

      <Drawer onClose={closeOrder} open={selectedOrderId !== null} title="本店正式订单详情">
        {detailStatus === "loading" ? (
          <p className="rounded-lg border border-line bg-white px-4 py-6 text-center text-sm font-black text-ink/55">
            正在加载最新订单详情
          </p>
        ) : null}
        {detailStatus === "error" ? (
          <div className="rounded-lg border border-coral/30 bg-coral/5 px-4 py-5 text-sm font-black text-coral" role="alert">
            <p>{mutationError}</p>
            <Button className="mt-3" onClick={() => setDetailRevision((value) => value + 1)}>重新加载订单详情</Button>
          </div>
        ) : null}
        {selectedOrder ? (
          <div className="space-y-5">
            <section className="rounded-lg bg-paper p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-ink/45">订单编号</p>
                  <h2 className="mt-1 text-xl font-black">{selectedOrder.orderNo}</h2>
                </div>
                <Badge tone="yellow">{statusLabel(selectedOrder.status)}</Badge>
              </div>
              <p className="mt-3 text-sm font-bold leading-6 text-ink/60">{selectedOrder.serviceName} · {new Date(selectedOrder.startsAt).toLocaleString("ja-JP")}</p>
            </section>

            <DetailGrid items={[
              {
                label: "用户",
                value: (
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{selectedOrder.customerName}</span>
                    <Button
                      aria-label="查看用户资料"
                      disabled={!selectedOrder.customerProfileId}
                      onClick={() => setParticipant("customer")}
                      size="sm"
                      variant="secondary"
                    >
                      查看
                    </Button>
                  </span>
                )
              },
              {
                label: "服务",
                value: (
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{selectedOrder.serviceName}</span>
                    <Button aria-label="查看服务资料" disabled={!selectedOrder.serviceId} onClick={() => setParticipant("service")} size="sm" variant="secondary">查看</Button>
                  </span>
                )
              },
              { label: "预约方式", value: selectedOrder.fulfillmentMode === "store" ? "到店服务" : "技师上门" },
              {
                label: "门店",
                value: (
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{selectedOrder.shopName}</span>
                    <Button aria-label="查看门店资料" onClick={() => setParticipant("shop")} size="sm" variant="secondary">查看</Button>
                  </span>
                )
              },
              {
                label: "技师",
                value: (
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{selectedOrder.technicianName ?? "待安排"}</span>
                    <Button
                      aria-label="查看员工资料"
                      disabled={!selectedOrder.technicianProfileId}
                      onClick={() => setParticipant("technician")}
                      size="sm"
                      variant="secondary"
                    >
                      查看
                    </Button>
                  </span>
                )
              },
              { label: "支付状态", value: (
                <span className="flex flex-col gap-1">
                  <Badge tone={paymentTone(selectedOrder.paymentStatus)}>{paymentLabel(selectedOrder.paymentStatus)}</Badge>
                  <span className="text-xs font-bold text-ink/45">{formatBackofficeOrderPaymentSummary({
                    effectivePaymentMethod: selectedOrder.effectivePaymentMethod,
                    otherMethodLabel: selectedOrder.otherMethodLabel,
                    checkoutPaymentAmountNdp: selectedOrder.checkoutPaymentAmountNdp,
                    ndpCurrency: selectedOrder.ndpCurrency
                  })}</span>
                </span>
              ) },
              { label: "订单金额", value: yen(selectedOrder.totalAmountJpy) },
              { label: "预约结束", value: new Date(selectedOrder.endsAt).toLocaleString("ja-JP") },
              { label: "备注", value: selectedOrder.note ?? selectedOrder.cancelReason ?? "无备注" }
            ]} />

            {acceptanceWarning ? (
              <section className="rounded-lg border border-amber-400/45 bg-amber-400/10 px-4 py-3" role="alert">
                <h3 className="text-sm font-black text-amber-600">店铺平台费余额不足</h3>
                <p className="mt-1 text-sm font-bold leading-6 text-ink/65">
                  本次确认需冻结 {acceptanceWarning.feeAmountNdp.toLocaleString("ja-JP")} NDP，店铺可用余额 {acceptanceWarning.availableBalanceNdp.toLocaleString("ja-JP")} NDP，还差 {acceptanceWarning.shortfallNdp.toLocaleString("ja-JP")} NDP。再次确认后将记录欠费并继续预约。
                </p>
              </section>
            ) : null}
            {mutationError ? <p className="rounded-lg border border-coral/30 bg-coral/5 px-4 py-3 text-sm font-black text-coral" role="alert">{mutationError}</p> : null}

            <AdminEventTimeline
              emptyLabel="该订单还没有时间线记录。"
              events={mapBackofficeOrderTimeline(selectedOrder.timelineEvents, language)}
              showCommentComposer={false}
              title="订单时间线"
            />

            <section className="rounded-lg border border-line bg-white p-4">
              <h3 className="font-black text-ink">订单状态</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedOrder.status === "pending" ? <Button disabled={mutationStatus === "saving"} onClick={() => void runTransition("confirm")}>{acceptanceWarning ? "余额不足，仍确认预约" : "确认预约"}</Button> : null}
                {selectedOrder.status === "confirmed" ? (
                  <div className="w-full space-y-2">
                    <label className="block text-xs font-black text-ink/60" htmlFor="merchant-service-verification-code">用户服务验证码</label>
                    <input
                      autoComplete="one-time-code"
                      className="focus-ring h-10 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold text-ink"
                      id="merchant-service-verification-code"
                      inputMode="numeric"
                      maxLength={6}
                      onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="输入 6 位验证码"
                      value={verificationCode}
                    />
                    <Button disabled={mutationStatus === "saving" || !/^\d{6}$/.test(verificationCode)} onClick={() => void runTransition("start")}>开始服务</Button>
                  </div>
                ) : null}
                {selectedOrder.status === "inService" ? (
                  <Button disabled={mutationStatus === "saving"} onClick={() => void runTransition("complete")}>
                    {confirmIntent === "service-end" ? "再次点击确认完成服务" : "完成服务"}
                  </Button>
                ) : null}
                {selectedOrder.status === "pending" || selectedOrder.status === "confirmed" ? (
                  <Button disabled={mutationStatus === "saving"} variant="danger" onClick={() => void runTransition("cancel")}>
                    {confirmIntent === "cancel" ? "再次点击确认取消订单" : "取消订单"}
                  </Button>
                ) : null}
              </div>
              {confirmIntent === "cancel" ? (
                <textarea className="focus-ring mt-3 min-h-20 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm font-bold text-ink" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
              ) : null}
            </section>

            <section className="rounded-lg border border-line bg-white p-4">
              <h3 className="font-black text-ink">线下收款与退款</h3>
              {selectedOrder.status === "awaiting_payment_confirmation" && selectedOrder.effectivePaymentMethod === "cash" ? (
                <div className="mt-3 space-y-3">
                  <p className="text-sm font-bold leading-6 text-ink/60">客户已选择现金支付。请仅在店铺实际收到订单全额后确认。</p>
                  <Button disabled={mutationStatus === "saving"} onClick={() => void confirmPayment()}>
                    {confirmIntent === "payment-confirm" ? `再次点击确认收款 ${yen(selectedOrder.totalAmountJpy)}` : `确认已收款 ${yen(selectedOrder.totalAmountJpy)}`}
                  </Button>
                </div>
              ) : null}
              {selectedOrder.paymentStatus === "pending" && ["confirmed", "inService", "completed"].includes(selectedOrder.status) ? (
                <div className="mt-3 space-y-3">
                  <select className="focus-ring h-10 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold text-ink" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as ManualPaymentMethod)}>
                    <option value="onsite">现场收款</option>
                    <option value="bank_transfer">银行转账</option>
                  </select>
                  <input className="focus-ring h-10 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold text-ink" placeholder="银行流水号或收款凭证编号（可选）" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} />
                  <Button disabled={mutationStatus === "saving"} onClick={() => void confirmPayment()}>
                    {confirmIntent === "payment-confirm" ? `再次点击确认收款 ${yen(selectedOrder.totalAmountJpy)}` : `确认已收款 ${yen(selectedOrder.totalAmountJpy)}`}
                  </Button>
                </div>
              ) : null}
              {(selectedOrder.status === "completed" && selectedOrder.paymentStatus === "confirmed") || (selectedOrder.status === "cancelled" && selectedOrder.paymentStatus === "refundPending") ? (
                <div className="mt-3 space-y-3">
                  <textarea className="focus-ring min-h-20 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm font-bold text-ink" value={refundReason} onChange={(event) => setRefundReason(event.target.value)} />
                  <input className="focus-ring h-10 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold text-ink" placeholder="退款凭证编号（可选）" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} />
                  <Button disabled={mutationStatus === "saving"} variant="danger" onClick={() => void refundPayment()}>
                    {confirmIntent === "payment-refund" ? "再次点击确认退款" : "确认已完成线下退款"}
                  </Button>
                </div>
              ) : null}
              {selectedOrder.paymentStatus === "refunded" ? <p className="mt-3 text-sm font-bold text-ink/55">该订单已完成退款，不能再次退款。</p> : null}
            </section>
          </div>
        ) : null}
      </Drawer>
      <OrderRelatedEntityDrawer
        entity={participant}
        onClose={() => setParticipant(null)}
        order={selectedOrder}
        scope="merchant-admin"
      />
    </MerchantAdminLayout>
  );
}
