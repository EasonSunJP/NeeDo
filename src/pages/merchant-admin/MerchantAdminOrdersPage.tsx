import { useEffect, useState } from "react";
import { backofficeRealDataApi, type BackofficeOrderPayload } from "../../api/backofficeRealData";
import { ApiClientError } from "../../api/httpClient";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { MerchantAdminLayout } from "../../components/merchant-admin/MerchantAdminLayout";
import {
  MerchantOrderParticipantDetailDrawer,
  type MerchantOrderParticipant,
} from "../../components/merchant-admin/MerchantOrderParticipantDetailDrawer";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import {
  bookingApi,
  createBookingIdempotencyKey,
  type ManualPaymentMethod,
} from "../../features/booking/api";
import { statusLabel, yen } from "../../lib/utils";

type StatusFilter = "all" | "pending" | "confirmed" | "inService" | "completed" | "cancelled";
type ConfirmIntent = "cancel" | "payment-confirm" | "payment-refund" | null;
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

function describeOrderError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前身份没有管理本店订单的权限";
    if (error.status === 404) return "订单不存在或不属于当前店铺";
    if (error.status === 409) return "订单或支付状态已经变化，请重新加载后再操作";
    if (error.status >= 500) return "本店订单服务暂时不可用，请稍后重试";
  }
  return "本店订单操作失败，请检查网络后重试";
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedOrder, setSelectedOrder] = useState<BackofficeOrderPayload | null>(null);
  const [participant, setParticipant] = useState<MerchantOrderParticipant>(null);
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
      setLoadError(describeOrderError(error));
      setLoadStatus("error");
    });
    return () => {
      current = false;
    };
  }, [page, revision, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const openOrder = (order: BackofficeOrderPayload) => {
    setSelectedOrder(order);
    setParticipant(null);
    setMutationError("");
    setAcceptanceWarning(null);
    setConfirmIntent(null);
    setPaymentReference("");
  };
  const closeOrder = () => {
    if (mutationStatus === "saving") return;
    setParticipant(null);
    setSelectedOrder(null);
    setMutationError("");
    setAcceptanceWarning(null);
    setConfirmIntent(null);
  };
  const finishMutation = () => {
    setParticipant(null);
    setSelectedOrder(null);
    setConfirmIntent(null);
    setMutationError("");
    setAcceptanceWarning(null);
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
      } else if (action === "start") await bookingApi.startOrder(selectedOrder.id);
      else if (action === "complete") await bookingApi.completeOrder(selectedOrder.id);
      else await bookingApi.cancelOrder(selectedOrder.id, cancelReason.trim() || "店铺取消正式预约");
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
        setMutationError(describeOrderError(error));
        setConfirmIntent(null);
      }
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
      await bookingApi.confirmManualPayment("merchant-admin", selectedOrder.id, {
        amountJpy: Math.round(selectedOrder.priceAmount),
        method: paymentMethod,
        reference: paymentReference.trim() || null,
        note: "店铺后台确认线下收款"
      });
      finishMutation();
    } catch (error: unknown) {
      setMutationError(describeOrderError(error));
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
      await bookingApi.refundManualPayment("merchant-admin", selectedOrder.id, {
        reason: refundReason.trim() || "店铺确认线下退款",
        reference: paymentReference.trim() || null
      });
      finishMutation();
    } catch (error: unknown) {
      setMutationError(describeOrderError(error));
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
                { key: "payment", title: "支付", render: (row) => <Badge tone={paymentTone(row.paymentStatus)}>{paymentLabel(row.paymentStatus)}</Badge> },
                { key: "status", title: "状态", render: (row) => <Badge tone="yellow">{statusLabel(row.status)}</Badge> },
                { key: "amount", title: "金额", render: (row) => yen(row.priceAmount) },
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

      <Drawer onClose={closeOrder} open={Boolean(selectedOrder)} title="本店正式订单详情">
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
              { label: "预约方式", value: selectedOrder.fulfillmentMode === "store" ? "到店服务" : "技师上门" },
              { label: "门店", value: selectedOrder.shopName },
              {
                label: "技师",
                value: (
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{selectedOrder.technicianName ?? "待安排"}</span>
                    <Button
                      aria-label="查看员工资料"
                      disabled={!selectedOrder.technicianNeedoId}
                      onClick={() => setParticipant("technician")}
                      size="sm"
                      variant="secondary"
                    >
                      查看
                    </Button>
                  </span>
                )
              },
              { label: "支付状态", value: <Badge tone={paymentTone(selectedOrder.paymentStatus)}>{paymentLabel(selectedOrder.paymentStatus)}</Badge> },
              { label: "订单金额", value: yen(selectedOrder.priceAmount) },
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

            <section className="rounded-lg border border-line bg-white p-4">
              <h3 className="font-black text-ink">订单状态</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedOrder.status === "pending" ? <Button disabled={mutationStatus === "saving"} onClick={() => void runTransition("confirm")}>{acceptanceWarning ? "余额不足，仍确认预约" : "确认预约"}</Button> : null}
                {selectedOrder.status === "confirmed" ? <Button disabled={mutationStatus === "saving"} onClick={() => void runTransition("start")}>开始服务</Button> : null}
                {selectedOrder.status === "inService" ? <Button disabled={mutationStatus === "saving"} onClick={() => void runTransition("complete")}>完成服务</Button> : null}
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
      <MerchantOrderParticipantDetailDrawer
        onClose={() => setParticipant(null)}
        order={selectedOrder}
        participant={participant}
      />
    </MerchantAdminLayout>
  );
}
