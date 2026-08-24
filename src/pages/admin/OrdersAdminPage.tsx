import { useEffect, useState } from "react";
import { backofficeRealDataApi, type BackofficeOrderPayload } from "../../api/backofficeRealData";
import { ApiClientError } from "../../api/httpClient";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { bookingApi, type ManualPaymentMethod } from "../../features/booking/api";
import { statusLabel, yen } from "../../lib/utils";

type StatusFilter = "all" | "pending" | "confirmed" | "inService" | "completed" | "cancelled";
type ConfirmIntent = "cancel" | "payment-confirm" | "payment-refund" | null;

const pageSize = 20;
const statusFilters: Array<{ label: string; value: StatusFilter }> = [
  { label: "全部", value: "all" },
  { label: "待确认", value: "pending" },
  { label: "已确认", value: "confirmed" },
  { label: "服务中", value: "inService" },
  { label: "已完成", value: "completed" },
  { label: "已取消", value: "cancelled" }
];

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

export function OrdersAdminPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedOrder, setSelectedOrder] = useState<BackofficeOrderPayload | null>(null);
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const openOrder = (order: BackofficeOrderPayload) => {
    setSelectedOrder(order);
    setMutationError("");
    setConfirmIntent(null);
    setPaymentReference("");
  };
  const closeOrder = () => {
    if (mutationStatus === "saving") return;
    setSelectedOrder(null);
    setMutationError("");
    setConfirmIntent(null);
  };
  const finishMutation = () => {
    setSelectedOrder(null);
    setConfirmIntent(null);
    setMutationError("");
    setRevision((value) => value + 1);
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

  const changeFilter = (value: StatusFilter) => {
    setStatusFilter(value);
    setPage(1);
    closeOrder();
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
                { key: "time", title: "预约时间", render: (row) => new Date(row.startsAt).toLocaleString("ja-JP") },
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

      <Drawer open={Boolean(selectedOrder)} title="全平台正式订单详情" onClose={closeOrder}>
        {selectedOrder ? (
          <div className="space-y-5">
            <DetailGrid items={[
              { label: "订单编号", value: selectedOrder.orderNo },
              { label: "用户", value: `${selectedOrder.customerName} / #${selectedOrder.customerUserId}` },
              { label: "服务", value: selectedOrder.serviceName },
              { label: "门店 / 技师", value: `${selectedOrder.shopName} / ${selectedOrder.technicianName ?? "待安排"}` },
              { label: "金额", value: yen(selectedOrder.priceAmount) },
              { label: "支付状态", value: <Badge tone={paymentTone(selectedOrder.paymentStatus)}>{paymentLabel(selectedOrder.paymentStatus)}</Badge> },
              { label: "预约时间", value: new Date(selectedOrder.startsAt).toLocaleString("ja-JP") },
              { label: "备注", value: selectedOrder.note ?? selectedOrder.cancelReason ?? "无备注" }
            ]} />

            {mutationError ? <p className="rounded-lg border border-coral/30 bg-coral/5 px-4 py-3 text-sm font-black text-coral" role="alert">{mutationError}</p> : null}

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
    </AdminLayout>
  );
}
