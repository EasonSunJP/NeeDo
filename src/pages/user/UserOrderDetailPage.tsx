import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiClientError } from "../../api/httpClient";
import { AppTopBar, PageScaffold, PrimaryButton } from "../../components/client-ui/AppScaffold";
import { ContactEventTimelinePanel } from "../../components/mobile/ContactEventTimeline";
import {
  bookingApi,
  createBookingIdempotencyKey,
  formatApiOrderDateTime,
  isBookingApiId,
  mapBookingOrderToDomainOrder,
  type BookingOrder,
  type BookingOrderAddOn,
  type OrderCheckout,
  type OrderReview
} from "../../features/booking/api";
import { coreReadApi, type CoreServiceCard } from "../../features/core-read/api";
import { buildFormalOrderTimelineEvents } from "../../features/order-performance/timeline";
import { statusLabel, yen } from "../../lib/utils";
import { OrderDynamicStatusCard } from "../../shared/order-detail/OrderDynamicStatusCard";
import { ServiceCountdownPill, ServiceReviewPrompt, type ServiceReviewSubmission } from "../../shared/order-detail/ServiceSessionUi";
import { useUserOrders } from "../../state/userOrderStore";

function describeFormalOrderError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 400) return "提交内容不符合要求，请检查后重试";
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前身份没有处理该预约的权限";
    if (error.status === 404) return "预约或结算记录不存在";
    if (error.status === 409) return "预约状态已经变化，请重新加载后再操作";
    if (error.status >= 500) return "预约服务暂时不可用，请稍后重试";
  }
  return "预约操作失败，请检查网络后重试";
}

function isAmbiguousMutationError(error: unknown) {
  return !(error instanceof ApiClientError) || error.status === 408 || error.status === 429 || error.status >= 500;
}

function formalStatusLabel(status: BookingOrder["status"]) {
  if (status === "awaitingCheckout") return "等待结账";
  if (status === "awaitingPaymentConfirmation") return "等待确认收款";
  return statusLabel(status);
}

function paymentMethodLabel(method: OrderCheckout["paymentMethod"]) {
  if (method === "cash") return "现金支付";
  if (method === "ndp") return "NDP 支付";
  if (method === "other") return "其他方式支付";
  return "尚未选择";
}

function paymentEvidenceLabel(evidence: OrderCheckout["paymentEvidence"]) {
  if (evidence === "ndp_ledger") return "NDP 账本已结算";
  if (evidence === "technician_receipt_confirmation") return "技师已确认收款";
  if (evidence === "operations_receipt_override") return "运营已确认收款";
  return "尚无收款凭证";
}

function getRemainingSeconds(expectedEndsAt: string | null | undefined, now: number) {
  if (!expectedEndsAt) return 0;
  const target = new Date(expectedEndsAt).getTime();
  return Number.isFinite(target) ? Math.max(0, Math.ceil((target - now) / 1000)) : 0;
}

function DetailRows({ rows, title }: { rows: Array<[string, ReactNode]>; title: string }) {
  return (
    <section className="rounded-[24px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-panel">
      <h2 className="text-base font-black text-[color:var(--client-text)]">{title}</h2>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div className="rounded-[16px] bg-[color:var(--client-elevated)] px-3 py-3" key={label}>
            <dt className="text-[11px] font-black text-[color:var(--client-muted)]">{label}</dt>
            <dd className="mt-1 text-sm font-black text-[color:var(--client-text)]">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function AddOnRow({ addOn, actions }: { addOn: BookingOrderAddOn; actions?: ReactNode }) {
  return (
    <article className="rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-[color:var(--client-text)]">{addOn.serviceNameSnapshot}</h3>
          <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">+{addOn.durationMinutes} 分钟 · {yen(addOn.priceAmountJpy)}</p>
        </div>
        <span className="rounded-full bg-[color:var(--client-surface)] px-2.5 py-1 text-[10px] font-black text-[color:var(--client-muted)]">
          {addOn.status === "accepted" ? "已接受" : addOn.status === "rejected" ? "已拒绝" : addOn.proposedBy === "customer" ? "等待技师确认" : "等待你的确认"}
        </span>
      </div>
      {actions ? <div className="mt-3 grid grid-cols-2 gap-2">{actions}</div> : null}
    </article>
  );
}

function FormalUserOrderDetailPage({ orderId }: { orderId: number }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [order, setOrder] = useState<BookingOrder | null>(null);
  const [checkout, setCheckout] = useState<OrderCheckout | null>(null);
  const [checkoutStatus, setCheckoutStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutRevision, setCheckoutRevision] = useState(0);
  const [projectionError, setProjectionError] = useState("");
  const [projectionPending, setProjectionPending] = useState(false);
  const [services, setServices] = useState<CoreServiceCard[]>([]);
  const [queryStatus, setQueryStatus] = useState<"loading" | "success" | "error">("loading");
  const [queryError, setQueryError] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [ownReview, setOwnReview] = useState<OrderReview | null>(null);
  const [reviewStatus, setReviewStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [reviewError, setReviewError] = useState("");
  const [reviewPending, setReviewPending] = useState(false);
  const [reviewSkipped, setReviewSkipped] = useState(false);
  const [reviewRevision, setReviewRevision] = useState(0);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [queryRevision, setQueryRevision] = useState(0);
  const mutationKeys = useRef(new Map<string, string>());
  const retainedReviewCommand = useRef<{ fingerprint: string; key: string } | null>(null);
  const routeState = location.state as { notice?: string } | null;

  useEffect(() => {
    setReviewSkipped(false);
    setOwnReview(null);
    setReviewStatus("idle");
    setReviewError("");
    setReviewPending(false);
    setReviewRevision(0);
    retainedReviewCommand.current = null;
  }, [orderId]);

  const loadOrder = useCallback(async () => {
    const data = await bookingApi.getOrder(orderId);
    setOrder(data);
    return data;
  }, [orderId]);

  useEffect(() => {
    let active = true;
    setQueryStatus("loading");
    setQueryError("");
    bookingApi.getOrder(orderId)
      .then((data) => {
        if (!active) return;
        setOrder(data);
        setQueryStatus("success");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setOrder(null);
        setQueryError(describeFormalOrderError(error));
        setQueryStatus("error");
      });
    return () => { active = false; };
  }, [orderId, queryRevision]);

  useEffect(() => {
    if (!order || !["awaitingCheckout", "awaitingPaymentConfirmation", "completed"].includes(order.status)) {
      setCheckout(null);
      setCheckoutStatus("idle");
      setCheckoutError("");
      return;
    }
    let active = true;
    setCheckout(null);
    setCheckoutStatus("loading");
    setCheckoutError("");
    bookingApi.getCheckout(order.id)
      .then((data) => {
        if (!active) return;
        setCheckout(data);
        setCheckoutStatus("success");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCheckoutError(describeFormalOrderError(error));
        setCheckoutStatus("error");
      });
    return () => { active = false; };
  }, [checkoutRevision, order]);

  const reviewEligible =
    order?.status === "completed" &&
    checkoutStatus === "success" &&
    checkout?.status === "completed" &&
    checkout.paymentEvidence !== null;

  useEffect(() => {
    if (!reviewEligible || !order) {
      setOwnReview(null);
      setReviewStatus("idle");
      setReviewError("");
      return;
    }
    let active = true;
    setReviewStatus("loading");
    setReviewError("");
    bookingApi.getOwnReview(order.id)
      .then(({ review }) => {
        if (!active) return;
        setOwnReview(review);
        setReviewStatus("success");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setReviewError(describeFormalOrderError(error));
        setReviewStatus("error");
      });
    return () => { active = false; };
  }, [order?.id, reviewEligible, reviewRevision]);

  useEffect(() => {
    if (order?.status !== "inService") {
      setServices([]);
      return;
    }
    let active = true;
    coreReadApi.listServices({ shopId: order.shopId, page: 1, pageSize: 100 })
      .then((data) => { if (active) setServices(data.list); })
      .catch((error: unknown) => { if (active) setActionError(describeFormalOrderError(error)); });
    return () => { active = false; };
  }, [order?.shopId, order?.status]);

  useEffect(() => {
    if (order?.status !== "inService") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [order?.status]);

  const runMutation = async <T,>(slot: string, operation: (idempotencyKey: string) => Promise<T>, apply: (value: T) => void | Promise<void>) => {
    if (pendingAction) return;
    const key = mutationKeys.current.get(slot) ?? createBookingIdempotencyKey();
    mutationKeys.current.set(slot, key);
    setPendingAction(slot);
    setActionError("");
    try {
      const value = await operation(key);
      mutationKeys.current.delete(slot);
      await apply(value);
    } catch (error) {
      if (!isAmbiguousMutationError(error)) mutationKeys.current.delete(slot);
      setActionError(describeFormalOrderError(error));
    } finally {
      setPendingAction(null);
    }
  };

  const runOrderMutation = (slot: string, operation: (idempotencyKey: string) => Promise<BookingOrder>) =>
    runMutation(slot, operation, setOrder);

  const startService = () => {
    setStartConfirmOpen(false);
    void runOrderMutation("customer-start", (idempotencyKey) => bookingApi.startService(orderId, { actor: "customer", idempotencyKey }));
  };
  const finishService = () => {
    setEndConfirmOpen(false);
    void runOrderMutation("customer-end", (idempotencyKey) => bookingApi.endService(orderId, { reason: "客户确认提前结束服务", idempotencyKey }));
  };
  const applyCheckoutMutation = async (value: OrderCheckout) => {
    setCheckout(value);
    setCheckoutStatus("success");
    setCheckoutError("");
    try {
      await loadOrder();
      setProjectionError("");
    } catch {
      setProjectionError("订单状态读取失败，支付结果已经保存，请重新读取订单状态。");
    }
  };
  const selectPayment = (method: "cash" | "other") => {
    void runMutation(`payment-${method}`, (idempotencyKey) => bookingApi.selectPaymentMethod(orderId, method === "cash"
      ? { method: "cash", idempotencyKey }
      : { method: "other", otherMethodCode: "other_manual", otherMethodLabel: "其他方式", idempotencyKey }), async (value) => {
      await applyCheckoutMutation(value);
    });
  };

  const retryOrderProjection = async () => {
    if (projectionPending) return;
    setProjectionPending(true);
    try {
      await loadOrder();
      setProjectionError("");
    } catch {
      setProjectionError("订单状态读取失败，支付结果已经保存，请重新读取订单状态。");
    } finally {
      setProjectionPending(false);
    }
  };

  const submitReview = async (submission: ServiceReviewSubmission) => {
    if (reviewPending) return;
    const tags = [...submission.tags].sort((left, right) =>
      new TextEncoder().encode(left).join(",").localeCompare(new TextEncoder().encode(right).join(","))
    );
    const comment = submission.comment?.normalize("NFKC").trim() || null;
    const fingerprint = JSON.stringify({ orderId, targetType: "technician", rating: submission.rating, tags, comment });
    const retained = retainedReviewCommand.current;
    const key = retained?.fingerprint === fingerprint ? retained.key : createBookingIdempotencyKey();
    retainedReviewCommand.current = { fingerprint, key };
    setReviewPending(true);
    setReviewError("");
    try {
      const result = await bookingApi.createReview(orderId, {
        targetType: "technician",
        rating: submission.rating,
        tags,
        comment,
        idempotencyKey: key
      });
      retainedReviewCommand.current = null;
      setOwnReview(result.review);
      setReviewStatus("success");
    } catch (error) {
      if (!isAmbiguousMutationError(error)) retainedReviewCommand.current = null;
      setReviewError(`评价提交失败：${describeFormalOrderError(error)}`);
    } finally {
      setReviewPending(false);
    }
  };

  const remaining = getRemainingSeconds(order?.serviceSession?.expectedEndsAt, now);
  const canChoosePayment =
    order?.status === "awaitingCheckout" &&
    checkoutStatus === "success" &&
    checkout?.status === "awaitingCheckout" &&
    checkout.paymentMethod === null &&
    checkout.paymentEvidence === null;
  const closeDetail = () => navigate("/", { replace: true });
  const handleBack = () => {
    navigate(-1);
  };
  const canCancel = order?.status === "pending" || order?.status === "confirmed";

  return (
    <PageScaffold contentClassName="space-y-4 pb-36" navItems={[]}>
      <AppTopBar closeLabel="关闭预约详情" onBack={handleBack} onClose={closeDetail} title="预约详情" />
      {routeState?.notice ? <section className="rounded-[20px] bg-[color:var(--client-primary-soft)] px-4 py-3 text-sm font-black">{routeState.notice}</section> : null}
      {queryStatus === "loading" ? <section className="rounded-[24px] bg-[color:var(--client-surface)] p-6 text-center font-black">正在加载预约详情</section> : null}
      {queryStatus === "error" ? (
        <section className="rounded-[24px] bg-[color:var(--client-surface)] p-6 text-center" role="alert">
          <h2 className="text-lg font-black">预约详情加载失败</h2>
          <p className="mt-2 text-sm font-bold text-[color:var(--client-muted)]">{queryError}</p>
          <PrimaryButton className="mt-4 w-full" onClick={() => setQueryRevision((value) => value + 1)}>重新加载预约详情</PrimaryButton>
        </section>
      ) : null}
      {queryStatus === "success" && order ? (
        <>
          <OrderDynamicStatusCard order={mapBookingOrderToDomainOrder(order)} providerName={order.shopName} />

          <section className="rounded-[24px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-panel">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-black text-[color:var(--client-muted)]">正式预约</p>
                <h2 className="mt-1 text-xl font-black text-[color:var(--client-text)]">{order.serviceName}</h2>
                <p className="mt-2 text-sm font-bold text-[color:var(--client-muted)]">{order.shopName}</p>
              </div>
              <strong className="shrink-0 text-lg font-black text-[color:var(--client-primary)]">
                {yen(order.paymentAmountJpy)}
              </strong>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {order.serviceId ? (
                <Link className="focus-ring rounded-[16px] border border-[color:var(--client-line)] px-3 py-3 text-center text-xs font-black text-[color:var(--client-text)]" to={`/services/${order.serviceId}`}>
                  查看服务
                </Link>
              ) : <span />}
              <Link className="focus-ring rounded-[16px] border border-[color:var(--client-line)] px-3 py-3 text-center text-xs font-black text-[color:var(--client-text)]" to={`/stores/${order.shopId}`}>
                查看店铺
              </Link>
            </div>
          </section>

          <DetailRows title="预约情报" rows={[
            ["预约状态", formalStatusLabel(order.status)],
            ["预约编号", order.orderNo],
            ["服务", order.serviceName],
            ["服务方式", order.fulfillmentMode === "home" ? "上门服务" : "到店预约"],
            ["店铺", order.shopName],
            ["预约时间", formatApiOrderDateTime(order.startsAt)],
            ["结束时间", formatApiOrderDateTime(order.endsAt)],
            ["担当", order.technicianName ?? "尚未指定"],
            ["备注", order.note ?? "无特别备注"]
          ]} />

          <ContactEventTimelinePanel
            title="状态记录"
            events={buildFormalOrderTimelineEvents(order)}
          />

          {order.status === "confirmed" && /^\d{6}$/.test(order.serviceVerificationCode ?? "") ? (
            <section className="rounded-[24px] border border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] p-5 text-center">
              <h2 className="text-base font-black">服务验证码</h2>
              <p className="mt-2 text-xs font-bold text-[color:var(--client-muted)]">请在服务开始前向技师出示</p>
              <strong className="mt-4 block text-4xl font-black tracking-[0.3em] text-[color:var(--client-primary)]">{order.serviceVerificationCode}</strong>
            </section>
          ) : null}

          {order.status === "inService" && order.serviceSession ? (
            <section className="space-y-3 rounded-[24px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4">
              <div className="text-center"><ServiceCountdownPill seconds={remaining} /></div>
              {order.serviceSession.addOns.map((addOn) => (
                <AddOnRow key={addOn.id} addOn={addOn} actions={addOn.status === "proposed" && addOn.proposedBy === "technician" ? (
                  <>
                    <button className="h-10 rounded-full border border-red-400/40 text-xs font-black text-red-500" onClick={() => void runOrderMutation(`reject-${addOn.id}`, (idempotencyKey) => bookingApi.rejectAddOn(orderId, addOn.id, { idempotencyKey }))} type="button">拒绝</button>
                    <button className="h-10 rounded-full bg-[color:var(--client-primary)] text-xs font-black text-[color:var(--client-primary-contrast)]" onClick={() => void runOrderMutation(`accept-${addOn.id}`, (idempotencyKey) => bookingApi.acceptAddOn(orderId, addOn.id, { idempotencyKey }))} type="button">接受追加</button>
                  </>
                ) : undefined} />
              ))}
              <div>
                <h2 className="text-sm font-black">追加正式服务</h2>
                <div className="mt-2 grid gap-2">
                  {services.map((service) => (
                    <button className="flex items-center justify-between rounded-[16px] bg-[color:var(--client-elevated)] px-3 py-3 text-left" disabled={Boolean(pendingAction)} key={service.id} onClick={() => void runOrderMutation(`addon-${service.id}`, (idempotencyKey) => bookingApi.createAddOn(orderId, { serviceId: service.id, idempotencyKey }))} type="button">
                      <span><strong className="block text-sm">{service.name}</strong><small className="text-[color:var(--client-muted)]">+{service.durationMinutes} 分钟</small></span>
                      <strong>{yen(Number(service.priceAmount))}</strong>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {checkoutStatus === "loading" ? <section className="rounded-[24px] bg-[color:var(--client-surface)] p-5 text-center text-sm font-black">正在加载正式结算</section> : null}
          {checkoutStatus === "error" ? <section className="rounded-[24px] border border-red-400/35 bg-red-500/10 p-5 text-center" role="alert"><h2 className="text-base font-black text-red-500">正式结算加载失败</h2><p className="mt-2 text-sm font-bold text-[color:var(--client-muted)]">{checkoutError}</p><button className="mt-4 h-11 w-full rounded-full bg-[color:var(--client-primary)] text-sm font-black text-[color:var(--client-primary-contrast)]" onClick={() => setCheckoutRevision((value) => value + 1)} type="button">重新加载正式结算</button></section> : null}
          {checkoutStatus === "success" && checkout ? <DetailRows title="正式结算" rows={[
            ["基础金额", yen(checkout.baseAmountJpy)],
            ["追加服务", yen(checkout.addOnAmountJpy)],
            ["优惠", `-${yen(checkout.discountAmountJpy)}`],
            ["应付总额", yen(checkout.checkoutAmountJpy)],
            ["NDP 应付", `${checkout.payableNdp.toLocaleString("ja-JP")} NDP`],
            ["固定换算", `${checkout.rate.ndpUnits} NDP = ${checkout.rate.jpyUnits} JPY`],
            ["支付方式", paymentMethodLabel(checkout.paymentMethod)],
            ["支付凭证", paymentEvidenceLabel(checkout.paymentEvidence)]
          ]} /> : null}

          {order.status === "awaitingPaymentConfirmation" ? <section className="rounded-[24px] bg-[color:var(--client-surface)] p-5 text-center"><h2 className="text-lg font-black">等待技师确认收款</h2><p className="mt-2 text-sm font-bold text-[color:var(--client-muted)]">订单会在技师确认现金或其他方式收款后完成。</p></section> : null}
          {order.status === "completed" ? <section className="rounded-[24px] bg-[color:var(--client-surface)] p-5 text-center"><h2 className="text-lg font-black">服务与结算已完成</h2><p className="mt-2 text-sm font-bold text-[color:var(--client-muted)]">{checkout ? paymentEvidenceLabel(checkout.paymentEvidence) : "正在读取支付凭证"}</p></section> : null}

          {projectionError ? <section className="rounded-[20px] border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm font-black text-red-500" role="alert"><p>{projectionError}</p><button className="mt-3 h-10 w-full rounded-full border border-red-400/40" disabled={projectionPending} onClick={() => void retryOrderProjection()} type="button">{projectionPending ? "正在读取订单状态" : "重新读取订单状态"}</button></section> : null}
          {actionError ? <section className="rounded-[20px] border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm font-black text-red-500" role="alert">{actionError}</section> : null}
          {reviewEligible && reviewStatus === "loading" ? <section className="rounded-[20px] bg-[color:var(--client-surface)] px-4 py-3 text-center text-sm font-black">正在读取评价状态</section> : null}
          {reviewEligible && reviewStatus === "error" && !reviewPending ? <section className="rounded-[20px] border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm font-black text-red-500" role="alert"><p>{reviewError}</p><button className="mt-3 h-10 w-full rounded-full border border-red-400/40" onClick={() => setReviewRevision((value) => value + 1)} type="button">重新读取评价状态</button></section> : null}
          {order.status === "confirmed" ? <button className="h-12 w-full rounded-[20px] bg-[color:var(--client-primary)] text-sm font-black text-[color:var(--client-primary-contrast)] disabled:opacity-50" disabled={Boolean(pendingAction)} onClick={() => setStartConfirmOpen(true)} type="button">开始服务</button> : null}
          {order.status === "inService" && remaining > 0 ? <button className="h-12 w-full rounded-[20px] bg-red-500 text-sm font-black text-white" disabled={Boolean(pendingAction)} onClick={() => setEndConfirmOpen(true)} type="button">提前结束服务</button> : null}
          {order.status === "inService" && remaining === 0 ? <p className="rounded-[20px] bg-[color:var(--client-surface)] px-4 py-3 text-center text-sm font-black">服务时间已到，等待系统完成结算准备</p> : null}
          {canChoosePayment ? <div className="grid grid-cols-3 gap-2"><button className="h-12 rounded-[18px] bg-[color:var(--client-elevated)] text-xs font-black" disabled={Boolean(pendingAction)} onClick={() => selectPayment("cash")} type="button">现金支付</button><button className="h-12 rounded-[18px] bg-[color:var(--client-primary)] text-xs font-black text-[color:var(--client-primary-contrast)]" disabled={Boolean(pendingAction)} onClick={() => void runMutation("payment-ndp", (idempotencyKey) => bookingApi.payWithNdp(orderId, { idempotencyKey }), applyCheckoutMutation)} type="button">NDP 支付</button><button className="h-12 rounded-[18px] bg-[color:var(--client-elevated)] text-xs font-black" disabled={Boolean(pendingAction)} onClick={() => selectPayment("other")} type="button">其他方式</button></div> : null}
          {canCancel ? <button className="h-12 w-full rounded-[20px] border border-red-400/40 text-sm font-black text-red-500" disabled={Boolean(pendingAction)} onClick={() => void runOrderMutation("cancel", async () => bookingApi.cancelOrder(orderId, "客户从预约详情取消"))} type="button">取消预约</button> : null}
        </>
      ) : null}

      {startConfirmOpen ? <div className="fixed inset-0 z-[130] grid place-items-center bg-black/55 px-4"><section className="w-full max-w-[360px] rounded-[28px] bg-[color:var(--client-elevated)] p-5"><h2 className="text-lg font-black">现在开始服务？</h2><p className="mt-2 text-sm font-bold text-[color:var(--client-muted)]">确认后以服务器记录的开始时间计算。</p><div className="mt-5 grid grid-cols-2 gap-3"><button className="h-11 rounded-full bg-[color:var(--client-surface)] font-black" onClick={() => setStartConfirmOpen(false)} type="button">取消</button><PrimaryButton onClick={startService}>开始计算</PrimaryButton></div></section></div> : null}
      {endConfirmOpen ? <div className="fixed inset-0 z-[130] grid place-items-center bg-black/55 px-4"><section className="w-full max-w-[360px] rounded-[28px] bg-[color:var(--client-elevated)] p-5"><h2 className="text-lg font-black">服务时间还没有到</h2><p className="mt-2 text-sm font-bold text-[color:var(--client-muted)]">是否提前结束本次服务？此理由会写入正式状态记录。</p><div className="mt-5 grid grid-cols-2 gap-3"><button className="h-11 rounded-full bg-[color:var(--client-surface)] font-black" onClick={() => setEndConfirmOpen(false)} type="button">取消</button><button className="h-11 rounded-full bg-red-500 font-black text-white" onClick={finishService} type="button">确认结束服务</button></div></section></div> : null}
      {reviewEligible && reviewStatus === "success" && ownReview === null && !reviewSkipped ? (
        <ServiceReviewPrompt
          commentEnabled
          error={reviewError || undefined}
          helperMessage="本次订单评价提交后不可修改"
          integerRating
          message="请根据本次已完成服务评价担当技师"
          onSkip={() => setReviewSkipped(true)}
          onSubmit={(submission) => void submitReview(submission)}
          pending={reviewPending}
          showTagCounts={false}
          tagOptions={["魅力值", "服务精神", "情绪价值", "元气"]}
          title="评价技师"
        />
      ) : null}
    </PageScaffold>
  );
}

function LegacyUserOrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const orders = useUserOrders();
  const order = orders.find((item) => item.id === orderId) ?? orders[0];
  const handleBack = () => {
    navigate(-1);
  };
  const closeDetail = () => navigate("/", { replace: true });
  if (!order) return <PageScaffold navItems={[]}><p className="p-6 text-center font-black">旧预约记录不可用</p></PageScaffold>;
  return (
    <PageScaffold contentClassName="space-y-4 pb-8" navItems={[]}>
      <AppTopBar closeLabel="关闭预约详情" onBack={handleBack} onClose={closeDetail} title="预约详情" />
      <section className="rounded-[24px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5"><p className="text-xs font-black text-[color:var(--client-muted)]">历史只读预约</p><h2 className="mt-2 text-xl font-black">{order.itemName}</h2><p className="mt-2 text-sm font-bold text-[color:var(--client-muted)]">{order.storeName} · {order.bookedAt}</p><p className="mt-4 text-sm font-black">{statusLabel(order.status)} · {yen(order.amount)}</p></section>
      <p className="rounded-[20px] bg-[color:var(--client-elevated)] px-4 py-3 text-sm font-bold text-[color:var(--client-muted)]">此旧记录仅供查看，不支持开始、追加、结束、结算或评价操作。</p>
      {order.serviceId ? <Link className="text-center text-sm font-black text-[color:var(--client-primary)]" to={`/services/${order.serviceId}`}>查看服务</Link> : null}
    </PageScaffold>
  );
}

export function UserOrderDetailPage() {
  const { orderId } = useParams();
  return isBookingApiId(orderId) ? <FormalUserOrderDetailPage key={orderId} orderId={Number(orderId)} /> : <LegacyUserOrderDetailPage />;
}
