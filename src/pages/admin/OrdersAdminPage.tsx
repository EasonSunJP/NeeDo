import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  backofficeRealDataApi,
  type BackofficeOrderDetailPayload,
  type BackofficeOrderPayload
} from "../../api/backofficeRealData";
import { ApiClientError } from "../../api/httpClient";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { AdminEventTimeline } from "../../components/admin/AdminEventTimeline";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { ModuleShell } from "../../components/admin/ModuleShell";
import {
  OrderRelatedEntityDrawer,
  type OrderRelatedEntity
} from "../../components/admin/OrderRelatedEntityDrawer";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { bookingApi, type ManualPaymentMethod } from "../../features/booking/api";
import { mapBackofficeOrderTimeline } from "../../features/booking/backofficeOrderTimeline";
import { useProvidedI18n } from "../../i18n/I18nProvider";
import { statusLabel, yen } from "../../lib/utils";

type StatusFilter = "all" | "pending" | "confirmed" | "inService" | "completed" | "cancelled";
type ConfirmIntent = "cancel" | "payment-confirm" | "payment-refund" | null;
type PerformanceAction = "classify-uncompleted" | "apply-special" | "revoke-special";

const pageSize = 20;
const statusFilters: Array<{ label: string; value: StatusFilter }> = [
  { label: "全部", value: "all" },
  { label: "待确认", value: "pending" },
  { label: "已确认", value: "confirmed" },
  { label: "服务中", value: "inService" },
  { label: "已完成", value: "completed" },
  { label: "已取消", value: "cancelled" }
];
const statusFilterValues = new Set<StatusFilter>(statusFilters.map(({ value }) => value));

function readStatusFilter(searchParams: URLSearchParams): StatusFilter {
  const status = searchParams.get("status");
  return status && statusFilterValues.has(status as StatusFilter)
    ? (status as StatusFilter)
    : "all";
}

function readOrderId(searchParams: URLSearchParams) {
  const value = searchParams.get("orderId");
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function describeOperationsOrderError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前身份没有管理全平台订单的权限";
    if (error.status === 404) return "订单不存在或已不可见";
    if (error.status === 409) return "订单或支付状态已经变化，请重新加载后再操作";
    if (error.status >= 500) return "运营订单服务暂时不可用，请稍后重试";
  }
  return "运营订单操作失败，请检查网络后重试";
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

function formatOrderDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(new Date(value));
}

function performanceActionForOrder(order: BackofficeOrderDetailPayload): PerformanceAction | null {
  if (!order.performanceAssessment) {
    return order.status === "cancelled" && order.technicianProfileId
      ? "classify-uncompleted"
      : null;
  }
  return order.performanceAssessment.treatment === "special_excluded"
    ? "revoke-special"
    : "apply-special";
}

function performanceActionLabel(action: PerformanceAction) {
  if (action === "classify-uncompleted") return "标记为技师未完单";
  if (action === "revoke-special") return "撤销特殊取消并恢复计入";
  return "设为特殊取消并排除计算";
}

function createPerformanceIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}

export function OrdersAdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const language = useProvidedI18n()?.language ?? "zh";
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => readStatusFilter(searchParams));
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(() => readOrderId(searchParams));
  const [selectedOrder, setSelectedOrder] = useState<BackofficeOrderDetailPayload | null>(null);
  const [relatedEntity, setRelatedEntity] = useState<OrderRelatedEntity>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [detailRevision, setDetailRevision] = useState(0);
  const [orderRows, setOrderRows] = useState<BackofficeOrderPayload[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadStatus, setLoadStatus] = useState<"loading" | "success" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [mutationStatus, setMutationStatus] = useState<"idle" | "saving">("idle");
  const [mutationError, setMutationError] = useState("");
  const [confirmIntent, setConfirmIntent] = useState<ConfirmIntent>(null);
  const [cancelReason, setCancelReason] = useState("运营复核后取消订单");
  const [paymentMethod, setPaymentMethod] = useState<ManualPaymentMethod>("onsite");
  const [paymentReference, setPaymentReference] = useState("");
  const [refundReason, setRefundReason] = useState("运营已复核退款凭证并确认线下退款完成");
  const [performancePublicReason, setPerformancePublicReason] = useState("");
  const [performanceInternalNote, setPerformanceInternalNote] = useState("");
  const [performanceConflictReviewRequired, setPerformanceConflictReviewRequired] = useState(false);
  const performanceIntentRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);

  const writeRouteState = (status: StatusFilter, orderId: number | null) => {
    const next = new URLSearchParams();
    if (status !== "all") next.set("status", status);
    if (orderId !== null) next.set("orderId", String(orderId));
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    let current = true;
    setLoadStatus("loading");
    setLoadError("");
    backofficeRealDataApi.orders("backoffice", {
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
      setLoadError(describeOperationsOrderError(error));
      setLoadStatus("error");
    });
    return () => {
      current = false;
    };
  }, [page, revision, statusFilter]);

  useEffect(() => {
    if (selectedOrderId === null) return;
    let current = true;
    setDetailStatus("loading");
    backofficeRealDataApi
      .orderDetail("backoffice", selectedOrderId)
      .then((detail) => {
        if (!current) return;
        setSelectedOrder(detail);
        setDetailStatus("success");
      })
      .catch((error: unknown) => {
        if (!current) return;
        setSelectedOrder(null);
        setMutationError(describeOperationsOrderError(error));
        setDetailStatus("error");
      });
    return () => {
      current = false;
    };
  }, [detailRevision, selectedOrderId]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const openOrder = (order: BackofficeOrderPayload) => {
    setSelectedOrderId(order.id);
    setSelectedOrder(null);
    setRelatedEntity(null);
    setDetailStatus("loading");
    setMutationError("");
    setConfirmIntent(null);
    setPaymentReference("");
    setPerformancePublicReason("");
    setPerformanceInternalNote("");
    setPerformanceConflictReviewRequired(false);
    performanceIntentRef.current = null;
    writeRouteState(statusFilter, order.id);
  };
  const closeOrder = () => {
    if (mutationStatus === "saving") return;
    setSelectedOrderId(null);
    setSelectedOrder(null);
    setRelatedEntity(null);
    setDetailStatus("idle");
    setMutationError("");
    setConfirmIntent(null);
    writeRouteState(statusFilter, null);
  };
  const finishMutation = () => {
    setSelectedOrderId(null);
    setSelectedOrder(null);
    setRelatedEntity(null);
    setConfirmIntent(null);
    setMutationError("");
    setRevision((value) => value + 1);
    writeRouteState(statusFilter, null);
  };

  const runTransition = async (action: "confirm" | "start" | "complete" | "cancel") => {
    if (!selectedOrder || mutationStatus === "saving") return;
    if (action === "cancel" && confirmIntent !== "cancel") {
      setConfirmIntent("cancel");
      return;
    }
    setMutationStatus("saving");
    setMutationError("");
    try {
      if (action === "confirm") await bookingApi.confirmOrder(selectedOrder.id);
      else if (action === "start") await bookingApi.startOrder(selectedOrder.id);
      else if (action === "complete") await bookingApi.completeOrder(selectedOrder.id);
      else await bookingApi.cancelOrder(selectedOrder.id, cancelReason.trim() || "运营取消正式预约");
      finishMutation();
    } catch (error: unknown) {
      setMutationError(describeOperationsOrderError(error));
      setConfirmIntent(null);
    } finally {
      setMutationStatus("idle");
    }
  };

  const confirmPayment = async () => {
    if (!selectedOrder || mutationStatus === "saving") return;
    if (confirmIntent !== "payment-confirm") {
      setConfirmIntent("payment-confirm");
      return;
    }
    setMutationStatus("saving");
    setMutationError("");
    try {
      await bookingApi.confirmManualPayment("backoffice", selectedOrder.id, {
        amountJpy: Math.round(selectedOrder.priceAmount),
        method: paymentMethod,
        reference: paymentReference.trim() || null,
        note: "运营后台确认线下收款"
      });
      finishMutation();
    } catch (error: unknown) {
      setMutationError(describeOperationsOrderError(error));
      setConfirmIntent(null);
    } finally {
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
      await bookingApi.refundManualPayment("backoffice", selectedOrder.id, {
        reason: refundReason.trim() || "运营确认线下退款",
        reference: paymentReference.trim() || null
      });
      finishMutation();
    } catch (error: unknown) {
      setMutationError(describeOperationsOrderError(error));
      setConfirmIntent(null);
    } finally {
      setMutationStatus("idle");
    }
  };

  const runPerformanceAction = async () => {
    if (!selectedOrder || mutationStatus === "saving") return;
    const action = performanceActionForOrder(selectedOrder);
    const publicReason = performancePublicReason.trim();
    const internalNote = performanceInternalNote.trim() || null;
    if (!action) return;
    if (!publicReason) {
      setMutationError("请填写公开原因后再提交");
      return;
    }
    if (performanceConflictReviewRequired) {
      setMutationError("请先查看最新版本并确认后再重新提交");
      return;
    }

    const expectedRevision = selectedOrder.performanceAssessment?.version ?? 0;
    const fingerprint = JSON.stringify({
      action,
      expectedRevision,
      internalNote,
      publicReason
    });
    if (performanceIntentRef.current?.fingerprint !== fingerprint) {
      performanceIntentRef.current = {
        fingerprint,
        idempotencyKey: createPerformanceIdempotencyKey()
      };
    }

    setMutationStatus("saving");
    setMutationError("");
    const input = {
      expectedRevision,
      idempotencyKey: performanceIntentRef.current.idempotencyKey,
      internalNote,
      publicReason
    };
    try {
      if (action === "classify-uncompleted") {
        await backofficeRealDataApi.classifyTechnicianUncompleted(selectedOrder.id, input);
      } else if (action === "revoke-special") {
        await backofficeRealDataApi.revokeSpecialCancellation(selectedOrder.id, input);
      } else {
        await backofficeRealDataApi.applySpecialCancellation(selectedOrder.id, input);
      }
      performanceIntentRef.current = null;
      setPerformancePublicReason("");
      setPerformanceInternalNote("");
      setPerformanceConflictReviewRequired(false);
      setDetailRevision((value) => value + 1);
      setRevision((value) => value + 1);
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.status === 409) {
        performanceIntentRef.current = null;
        setPerformanceConflictReviewRequired(true);
        setMutationError("订单绩效版本已经变化。已保留填写内容，请查看最新记录后确认再提交。");
        setDetailRevision((value) => value + 1);
      } else {
        setMutationError(describeOperationsOrderError(error));
      }
    } finally {
      setMutationStatus("idle");
    }
  };

  const updatePerformancePublicReason = (value: string) => {
    performanceIntentRef.current = null;
    setPerformancePublicReason(value);
  };

  const updatePerformanceInternalNote = (value: string) => {
    performanceIntentRef.current = null;
    setPerformanceInternalNote(value);
  };

  const changeFilter = (value: StatusFilter) => {
    setStatusFilter(value);
    setPage(1);
    setSelectedOrderId(null);
    setSelectedOrder(null);
    setDetailStatus("idle");
    setMutationError("");
    setConfirmIntent(null);
    writeRouteState(value, null);
  };

  return (
    <AdminLayout>
      <ModuleShell
        title="订单中心"
        description="全平台订单通过正式分页接口读取；状态流转、线下收款和退款写入订单、财务记录与审计链路。未实现的改期、派单、改价和打印操作不再展示。"
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
            <p className="text-sm font-black text-ink">正在加载全平台正式订单</p>
          </section>
        ) : null}
        {loadStatus === "error" ? (
          <section className="rounded-lg border border-coral/30 bg-coral/5 px-5 py-8 text-center shadow-panel" role="alert">
            <h2 className="font-black text-ink">运营订单加载失败</h2>
            <p className="mt-2 text-sm font-bold text-ink/55">{loadError}</p>
            <Button className="mt-4" onClick={() => setRevision((value) => value + 1)}>重新加载运营订单</Button>
          </section>
        ) : null}
        {loadStatus === "success" && orderRows.length === 0 ? (
          <section className="rounded-lg border border-dashed border-line bg-white px-5 py-10 text-center">
            <p className="text-sm font-black text-ink/55">当前没有符合条件的正式订单</p>
          </section>
        ) : null}
        {loadStatus === "success" && orderRows.length > 0 ? (
          <>
            <DataTable<BackofficeOrderPayload>
              columns={[
                { key: "orderNo", title: "订单编号", render: (row) => row.orderNo },
                { key: "customer", title: "用户", render: (row) => row.customerName },
                { key: "service", title: "服务", render: (row) => row.serviceName },
                { key: "provider", title: "门店 / 技师", render: (row) => `${row.shopName} / ${row.technicianName ?? "待安排"}` },
                { key: "created", title: "下单时间", render: (row) => formatOrderDateTime(row.createdAt) },
                { key: "appointment", title: "预约时间", render: (row) => formatOrderDateTime(row.startsAt) },
                { key: "payment", title: "支付", render: (row) => <Badge tone={paymentTone(row.paymentStatus)}>{paymentLabel(row.paymentStatus)}</Badge> },
                { key: "status", title: "状态", render: (row) => <Badge tone="yellow">{statusLabel(row.status)}</Badge> },
                { key: "detail", title: "详情", render: (row) => <Button size="sm" variant="secondary" onClick={() => openOrder(row)}>查看</Button> }
              ]}
              footerPlacement="inline"
              pageSize={pageSize}
              rows={orderRows}
              showFooterActions={false}
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

      <Drawer open={selectedOrderId !== null} title="全平台正式订单详情" onClose={closeOrder}>
        {detailStatus === "loading" ? (
          <p className="rounded-lg border border-line bg-white px-4 py-6 text-center text-sm font-black text-ink/55">
            正在加载最新订单详情
          </p>
        ) : null}
        {detailStatus === "error" ? (
          <div className="rounded-lg border border-coral/30 bg-coral/5 px-4 py-5 text-sm font-black text-coral">
            <p>{mutationError}</p>
            <Button className="mt-3" onClick={() => setDetailRevision((value) => value + 1)}>
              重新加载订单详情
            </Button>
          </div>
        ) : null}
        {selectedOrder ? (
          <div className="space-y-5">
            <DetailGrid items={[
              { label: "订单编号", value: selectedOrder.orderNo },
              {
                label: "用户",
                value: (
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{selectedOrder.customerName}</span>
                    <Button aria-label="查看用户资料" disabled={!selectedOrder.customerProfileId} onClick={() => setRelatedEntity("customer")} size="sm" variant="secondary">查看</Button>
                  </span>
                )
              },
              {
                label: "服务",
                value: (
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{selectedOrder.serviceName}</span>
                    <Button aria-label="查看服务资料" disabled={!selectedOrder.serviceId} onClick={() => setRelatedEntity("service")} size="sm" variant="secondary">查看</Button>
                  </span>
                )
              },
              {
                label: "门店",
                value: (
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{selectedOrder.shopName}</span>
                    <Button aria-label="查看门店资料" onClick={() => setRelatedEntity("shop")} size="sm" variant="secondary">查看</Button>
                  </span>
                )
              },
              {
                label: "技师",
                value: (
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{selectedOrder.technicianName ?? "待安排"}</span>
                    <Button aria-label="查看技师资料" disabled={!selectedOrder.technicianProfileId} onClick={() => setRelatedEntity("technician")} size="sm" variant="secondary">查看</Button>
                  </span>
                )
              },
              { label: "金额", value: yen(selectedOrder.priceAmount) },
              { label: "支付状态", value: <Badge tone={paymentTone(selectedOrder.paymentStatus)}>{paymentLabel(selectedOrder.paymentStatus)}</Badge> },
              { label: "预约时间", value: new Date(selectedOrder.startsAt).toLocaleString("ja-JP") },
              { label: "备注", value: selectedOrder.note ?? selectedOrder.cancelReason ?? "无备注" }
            ]} />

            {mutationError ? <p className="rounded-lg border border-coral/30 bg-coral/5 px-4 py-3 text-sm font-black text-coral" role="alert">{mutationError}</p> : null}

            <AdminEventTimeline
              emptyLabel="该订单还没有时间线记录。"
              events={mapBackofficeOrderTimeline(selectedOrder.timelineEvents, language)}
              showCommentComposer={false}
              title="订单时间线与绩效判定"
            />

            <section className="rounded-lg border border-line bg-white p-4">
              <p className="text-sm font-black text-ink">当前绩效判定</p>
              {selectedOrder.performanceAssessment ? (
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-paper p-3">
                    <dt className="text-xs font-black text-ink/45">当前结果</dt>
                    <dd className="mt-1 text-sm font-black text-ink">
                      {selectedOrder.performanceAssessment.outcome === "technician_cancelled"
                        ? "技师原因取消"
                        : "技师未完单"}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-paper p-3">
                    <dt className="text-xs font-black text-ink/45">当前处理</dt>
                    <dd className="mt-1 text-sm font-black text-ink">
                      {selectedOrder.performanceAssessment.treatment === "special_excluded"
                        ? "特殊取消（不计入）"
                        : "正常计入"}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-paper p-3">
                    <dt className="text-xs font-black text-ink/45">版本</dt>
                    <dd className="mt-1 text-sm font-black text-ink">
                      {selectedOrder.performanceAssessment.version}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-3 text-sm font-bold text-ink/55">当前订单尚无技师绩效判定。</p>
              )}

              {performanceActionForOrder(selectedOrder) ? (
                <div className="mt-4 space-y-3 border-t border-line pt-4">
                  <label className="grid gap-1 text-sm font-black text-ink">
                    公开原因
                    <textarea
                      aria-label="特殊取消公开原因"
                      className="focus-ring min-h-20 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm font-bold text-ink"
                      maxLength={500}
                      placeholder="会显示在订单时间线中"
                      value={performancePublicReason}
                      onChange={(event) => updatePerformancePublicReason(event.target.value)}
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-black text-ink">
                    内部备注（仅运营可见）
                    <textarea
                      aria-label="特殊取消内部备注"
                      className="focus-ring min-h-20 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm font-bold text-ink"
                      maxLength={1000}
                      placeholder="证据、投诉工单或复核说明（可选）"
                      value={performanceInternalNote}
                      onChange={(event) => updatePerformanceInternalNote(event.target.value)}
                    />
                  </label>
                  {performanceConflictReviewRequired ? (
                    <Button
                      onClick={() => {
                        performanceIntentRef.current = null;
                        setPerformanceConflictReviewRequired(false);
                        setMutationError("");
                      }}
                      variant="secondary"
                    >
                      已查看最新版本，可以重新提交
                    </Button>
                  ) : null}
                  <Button
                    disabled={mutationStatus === "saving" || performanceConflictReviewRequired}
                    onClick={() => void runPerformanceAction()}
                    variant={
                      performanceActionForOrder(selectedOrder) === "revoke-special"
                        ? "danger"
                        : "primary"
                    }
                  >
                    {mutationStatus === "saving"
                      ? "正在提交绩效判定"
                      : performanceActionLabel(performanceActionForOrder(selectedOrder)!)}
                  </Button>
                </div>
              ) : null}
            </section>

            <section className="rounded-lg border border-line bg-white p-4">
              <h3 className="font-black text-ink">订单状态</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedOrder.status === "pending" ? <Button disabled={mutationStatus === "saving"} onClick={() => void runTransition("confirm")}>确认订单</Button> : null}
                {selectedOrder.status === "confirmed" ? <Button disabled={mutationStatus === "saving"} onClick={() => void runTransition("start")}>开始服务</Button> : null}
                {selectedOrder.status === "inService" ? <Button disabled={mutationStatus === "saving"} onClick={() => void runTransition("complete")}>完成服务</Button> : null}
                {selectedOrder.status === "pending" || selectedOrder.status === "confirmed" ? (
                  <Button disabled={mutationStatus === "saving"} variant="danger" onClick={() => void runTransition("cancel")}>
                    {confirmIntent === "cancel" ? "再次点击确认取消订单" : "取消订单"}
                  </Button>
                ) : null}
              </div>
              {confirmIntent === "cancel" ? <textarea className="focus-ring mt-3 min-h-20 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm font-bold text-ink" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /> : null}
            </section>

            <section className="rounded-lg border border-line bg-white p-4">
              <h3 className="font-black text-ink">运营线下收款与退款</h3>
              {selectedOrder.paymentStatus === "pending" && ["confirmed", "inService", "completed"].includes(selectedOrder.status) ? (
                <div className="mt-3 space-y-3">
                  <select className="focus-ring h-10 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold text-ink" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as ManualPaymentMethod)}>
                    <option value="onsite">现场收款</option>
                    <option value="bank_transfer">银行转账</option>
                  </select>
                  <input className="focus-ring h-10 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold text-ink" placeholder="银行流水号或收款凭证编号（可选）" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} />
                  <Button disabled={mutationStatus === "saving"} onClick={() => void confirmPayment()}>
                    {confirmIntent === "payment-confirm" ? `再次点击确认收款 ${yen(selectedOrder.priceAmount)}` : `确认已收款 ${yen(selectedOrder.priceAmount)}`}
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
        entity={relatedEntity}
        onClose={() => setRelatedEntity(null)}
        order={selectedOrder}
        scope="backoffice"
      />
    </AdminLayout>
  );
}
