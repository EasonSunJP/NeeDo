import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiClientError } from "../../api/httpClient";
import { useAuth } from "../../auth/AuthProvider";
import {
  AppIcon,
  AppTopBar,
  IconButton,
  PageScaffold,
  PrimaryButton
} from "../../components/client-ui/AppScaffold";
import { ClientEdgeMask } from "../../components/mobile/ClientEdgeMask";
import { ContactEventTimelinePanel } from "../../components/mobile/ContactEventTimeline";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { services } from "../../data/mock";
import {
  bookingApi,
  formatApiOrderDateTime,
  isBookingApiId,
  mapBookingOrderToDomainOrder,
  type BookingOrder
} from "../../features/booking/api";
import { getMessagePath, getUserConversationId } from "../../lib/messageCenter";
import { canShowServiceStartCode, getServiceStartCode } from "../../lib/serviceStartCode";
import { cn, statusLabel, yen } from "../../lib/utils";
import { OrderDynamicStatusCard } from "../../shared/order-detail/OrderDynamicStatusCard";
import { ContactInfoDetailText, ServiceCountdownPill, ServiceReviewPrompt, ServiceRingAlert, type ServiceReviewSubmission } from "../../shared/order-detail/ServiceSessionUi";
import { serviceReviewSpecialTags } from "../../shared/order-detail/serviceReviewTagCatalog";
import { SocialProfileMiniCard, buildServiceMiniCardData, type SocialProfileMiniData } from "../../shared/profile-card";
import {
  dismissOrderExtensionNotice,
  dismissOrderServiceReview,
  dismissOrderServiceAlert,
  endOrderService,
  getLatestDeclinedOrderExtensionRequest,
  getOrderServiceRemainingSeconds,
  getPendingOrderExtensionRequest,
  requestOrderExtension,
  startOrderService,
  submitOrderServiceUserReview,
  type OrderServiceSession,
  useOrderServiceSession
} from "../../state/orderServiceSessionStore";
import { useEntityStore } from "../../state/entityStore";
import { useUserOrders } from "../../state/userOrderStore";
import type { Customer, Order, ServiceItem, Store, Technician } from "../../types/domain";

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

function getOrderSourceLabel(order: Order) {
  const labels: Record<Order["source"], string> = {
    app: "App",
    line: "LINE",
    partner: "Partner",
    web: "Web"
  };

  return labels[order.source];
}

function findServiceForOrder(order: Order) {
  const normalizedOrderName = order.itemName.replace(/\s+\d+\s*分钟/g, "").trim();

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

function resolveSessionOrderStatus(order: Order, serviceStatus: "waiting" | "inService" | "completed"): Order["status"] {
  if (serviceStatus === "inService") {
    return "inService";
  }

  if (serviceStatus === "completed") {
    return "completed";
  }

  return order.status;
}

function getOrderReviewRewardMaxNdp(order: Order) {
  return Math.max(0, Math.round(order.amount / 100));
}

function getOrderDateTime(order: Order) {
  const [date = "", time = ""] = order.bookedAt.split(" ");

  return { date, time };
}

function buildUserOrderServiceCardData(order: Order, service: ServiceItem, store: Store): SocialProfileMiniData {
  const baseData = buildServiceMiniCardData(service, store);
  const modeLabel = order.mode === "home" ? "上门服务" : "到店预约";

  return {
    ...baseData,
    addressValue: order.mode === "home" ? `${order.city} · ${order.area}` : order.storeName ?? store.name,
    detailPath: `/services/${service.id}`,
    displayName: order.itemName,
    headline: service.summary,
    id: order.id,
    regionLabel: order.area,
    serviceTags: [modeLabel, yen(order.amount), ...service.tags].slice(0, 6)
  };
}

function getReservationInfoRows(order: Order, service: ServiceItem, store: Store, technician: Technician): Array<[string, string]> {
  const { date, time } = getOrderDateTime(order);
  const selectedPackage = findPackageForOrder(order, service);
  const venueLabel = order.mode === "home" ? "服务方" : "门店";
  const placeLabel = order.mode === "home" ? "服务地点" : "到店位置";
  const placeValue = order.mode === "home" ? `${order.city} · ${order.area}（详细地址服务前确认）` : store.address;

  return [
    ["预约状态", statusLabel(order.status)],
    ["预约编号", order.orderNo],
    [venueLabel, order.storeName ?? store.name],
    ["服务方式", order.mode === "home" ? "上门服务" : "到店预约"],
    ["预约日", date],
    ["预约时刻", time],
    ["服务时长", `${selectedPackage.durationMinutes} 分钟`],
    ["套餐/项目", `${order.itemName} / ${selectedPackage.name}`],
    [placeLabel, placeValue],
    ["担当", order.technicianName ?? technician.name],
    ["注意事项", service.notice.join(" / ") || "请按预约时间到场，如需变更请提前联系。"],
    ["备注", order.remark ?? "无特别备注"]
  ];
}

type ContactInfoEvent = { actorAvatarSrc?: string; at: string; detail: string; operator: string; title: string; tone?: "green" | "red" };

function getUserReviewRewardDetail(review: NonNullable<OrderServiceSession["userReview"]>) {
  if (review.rewardStatus === "issued") {
    return `用户完成评价，平台已收到技师或店铺支付的平台使用费，已向用户发放 ${review.awardedNdp ?? review.maxRewardNdp}NDP。`;
  }

  if (review.rewardStatus === "failed") {
    return "用户完成评价，因技师或者店铺未支付平台使用费，导致获得NDP失败。";
  }

  return `用户完成评价，将在结算后获得0~${review.maxRewardNdp}NDP。`;
}

function formatSessionEventTime(timestamp?: number) {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

function getOrderServiceSessionEvents(order: Order, technician: Technician, customer: Customer, session: OrderServiceSession): ContactInfoEvent[] {
  const technicianName = order.technicianName ?? technician.name;
  const events: ContactInfoEvent[] = [];

  if (session.startedAt) {
    events.push({
      at: formatSessionEventTime(session.startedAt),
      actorAvatarSrc: customer.avatar,
      detail: `客户确认开始服务，服务倒计时已开始计算。预计服务时长 ${session.baseDurationMinutes + session.addedDurationMinutes} 分钟。`,
      operator: order.customerName,
      title: "服务开始"
    });
  }

  session.extensionRequests.forEach((request) => {
    events.push({
      at: formatSessionEventTime(request.requestedAt),
      actorAvatarSrc: customer.avatar,
      detail: `客户申请追加服务：${request.title}，追加 ${request.durationMinutes} 分钟，金额 ${yen(request.price)}。`,
      operator: order.customerName,
      title: "追加服务申请"
    });

    if (request.status === "accepted" && request.respondedAt) {
      events.push({
        at: formatSessionEventTime(request.respondedAt),
        actorAvatarSrc: technician.avatar,
        detail: `技师已接受追加服务，倒计时增加 ${request.durationMinutes} 分钟。`,
        operator: technicianName,
        title: "追加服务已接受"
      });
    }

    if ((request.status === "declined" || request.status === "dismissed") && request.respondedAt) {
      events.push({
        at: formatSessionEventTime(request.respondedAt),
        actorAvatarSrc: technician.avatar,
        detail: "技师无法提供追加服务，非常抱歉。倒计时时间未追加。",
        operator: technicianName,
        title: "追加服务已拒绝",
        tone: "red"
      });
    }
  });

  if (session.completedAt) {
    events.push({
      at: formatSessionEventTime(session.completedAt),
      detail: "服务已结束，订单进入服务完成确认。",
      operator: "系统同步",
      title: "服务结束"
    });
  }

  if (session.userReview) {
    events.push({
      at: formatSessionEventTime(session.userReview.submittedAt),
      actorAvatarSrc: customer.avatar,
      detail: getUserReviewRewardDetail(session.userReview),
      operator: order.customerName,
      title: "用户评价"
    });
  }

  return events;
}

function getContactInfoEvents(order: Order, store: Store, technician: Technician, customer: Customer, session?: OrderServiceSession) {
  const providerName = order.storeName ?? store.name;
  const acceptedAt = order.createdAt.replace(/(\d{2}):(\d{2})$/, (_match, hour: string, minute: string) => {
    const nextMinute = Number(minute) + 3;
    return `${hour}:${String(nextMinute).padStart(2, "0")}`;
  });

  const events: ContactInfoEvent[] = [
    {
      at: order.createdAt,
      actorAvatarSrc: customer.avatar,
      detail: `${getOrderSourceLabel(order)} 创建预约，金额 ${yen(order.amount)}，支付状态 ${getPaymentCopy(order.paymentStatus, order.mode)}。`,
      operator: order.customerName,
      title: "预约创建"
    },
    {
      at: acceptedAt,
      actorAvatarSrc: store.cover,
      detail: `${providerName} 接单，预约状态更新为 ${statusLabel(order.status)}。`,
      operator: providerName,
      title: "服务方接单"
    },
    {
      at: order.bookedAt,
      actorAvatarSrc: store.cover,
      detail: `预约担当：${order.technicianName ?? technician.name}。`,
      operator: providerName,
      title: "担当信息"
    }
  ];

  if (session) {
    events.push(...getOrderServiceSessionEvents(order, technician, customer, session));
  }

  return events.filter((event) => event.at).sort((left, right) => left.at.localeCompare(right.at));
}

function InfoTable({ rows, title }: { rows: Array<[string, string]>; title: string }) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_90%,var(--client-bg)_10%)] shadow-panel">
      <h2 className="border-b border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] px-4 py-3 text-base font-black text-[color:var(--client-text)]">{title}</h2>
      <div className="divide-y divide-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)]">
        {rows.map(([label, value]) => (
          <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-3 px-4 py-3 text-sm" key={label}>
            <span className="font-black text-[color:var(--client-muted)]">{label}</span>
            <strong className="min-w-0 whitespace-pre-line break-words font-black leading-6 text-[color:var(--client-text)]">{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function ContactInfoTimeline({
  events
}: {
  events: ContactInfoEvent[];
}) {
  return (
    <ContactEventTimelinePanel
      events={events.map((event, index) => ({
        actorName: event.operator,
        actorRole: event.title,
        actorAvatarSrc: event.actorAvatarSrc,
        atLabel: event.at,
        id: `${event.at}-${event.title}-${index}`,
        message: <ContactInfoDetailText text={event.detail} />,
        title: event.title,
        tone: event.tone ?? "green"
      }))}
      commentAuthorAvatarSrc={events[0]?.actorAvatarSrc}
      title="联系信息"
    />
  );
}

function OrderDetailBottomActionMask({ children }: { children: ReactNode }) {
  return (
    <>
      <ClientEdgeMask
        edge="bottom"
        style={{
          "--client-edge-mask-bottom-height": "calc(env(safe-area-inset-bottom,0px) + 8.75rem)",
          "--client-edge-mask-bottom-mid-opacity": "0.66",
          "--client-edge-mask-bottom-mid-stop": "38%",
          "--client-edge-mask-bottom-strong-opacity": "0.98",
          "--client-edge-mask-bottom-strong-stop": "72%",
          zIndex: 80
        } as CSSProperties}
      />
      <footer
        className="pointer-events-none fixed inset-x-0 z-[90] mx-auto w-full max-w-[880px] px-4"
        style={{ bottom: "calc(env(safe-area-inset-bottom,0px) + 18px)" }}
      >
        <div className="pointer-events-auto space-y-2">
          {children}
        </div>
      </footer>
    </>
  );
}

function describeFormalOrderError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前身份没有查看该预约的权限";
    if (error.status === 404) return "预约不存在或已不可见";
    if (error.status === 409) return "预约状态已经变化，请重新加载后再操作";
    if (error.status >= 500) return "预约服务暂时不可用，请稍后重试";
  }

  return "预约详情加载失败，请检查网络后重试";
}

function formalPaymentStatusLabel(order: BookingOrder) {
  if (order.paymentStatus === "confirmed") return "已确认收款";
  if (order.paymentStatus === "refundPending") return "退款处理中";
  if (order.paymentStatus === "refunded") return "已退款";
  return "待确认收款";
}

function FormalUserOrderDetailPage({ orderId }: { orderId: number }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [order, setOrder] = useState<BookingOrder | null>(null);
  const [queryStatus, setQueryStatus] = useState<"loading" | "success" | "error">("loading");
  const [queryError, setQueryError] = useState("");
  const [queryRevision, setQueryRevision] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState("");
  const routeState = location.state as { notice?: string } | null;

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

    return () => {
      active = false;
    };
  }, [orderId, queryRevision]);

  const closeDetail = () => navigate("/", { replace: true });
  const handleBack = () => navigate(-1);
  const canCancel = order?.status === "pending" || order?.status === "confirmed";
  const cancelOrder = async () => {
    if (!order || !canCancel || cancelling) return;
    setCancelling(true);
    setActionError("");
    try {
      const updated = await bookingApi.cancelOrder(orderId, "客户从预约详情取消");
      setOrder(updated);
    } catch (error) {
      setActionError(describeFormalOrderError(error));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <PageScaffold contentClassName="space-y-4 pb-36" navItems={[]}>
      <AppTopBar
        closeLabel="关闭预约详情"
        controlButtonClassName="border-transparent bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,var(--client-bg)_18%)]"
        onBack={handleBack}
        onClose={closeDetail}
        title="预约详情"
      />

      {routeState?.notice ? (
        <section className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-primary)_32%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] px-4 py-3 text-sm font-black leading-6 text-[color:var(--client-text)]">
          {routeState.notice}
        </section>
      ) : null}

      {queryStatus === "loading" ? (
        <section className="rounded-[24px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-6 text-center shadow-panel" aria-live="polite">
          <AppIcon className="mx-auto h-7 w-7 animate-spin text-[color:var(--client-primary)]" name="clock" />
          <p className="mt-3 text-sm font-black text-[color:var(--client-text)]">正在加载预约详情</p>
        </section>
      ) : null}

      {queryStatus === "error" ? (
        <section className="rounded-[24px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-6 text-center shadow-panel" role="alert">
          <h2 className="text-lg font-black text-[color:var(--client-text)]">预约详情加载失败</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-[color:var(--client-muted)]">{queryError}</p>
          <PrimaryButton className="mt-4 w-full" onClick={() => setQueryRevision((current) => current + 1)}>
            重新加载预约详情
          </PrimaryButton>
        </section>
      ) : null}

      {queryStatus === "success" && order ? (
        <>
          <OrderDynamicStatusCard
            order={mapBookingOrderToDomainOrder(order)}
            providerName={order.shopName}
          />

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

          <InfoTable
            title="预约情报"
            rows={[
              ["预约状态", statusLabel(order.status)],
              ["预约编号", order.orderNo],
              ["服务方式", order.fulfillmentMode === "home" ? "上门服务" : "到店预约"],
              ["预约时间", formatApiOrderDateTime(order.startsAt)],
              ["结束时间", formatApiOrderDateTime(order.endsAt)],
              ["店铺", order.shopName],
              ["担当", order.technicianName ?? "尚未指定"],
              ["支付方式", order.paymentMethod === "onsite" ? "现场支付" : "银行转账"],
              ["收款状态", formalPaymentStatusLabel(order)],
              ["备注", order.note ?? "无特别备注"]
            ]}
          />

          <ContactEventTimelinePanel
            title="状态记录"
            events={order.statusHistory.map((history) => ({
              actorName: history.actorUserId ? `用户 #${history.actorUserId}` : "系统",
              actorRole: "预约状态",
              atLabel: formatApiOrderDateTime(history.createdAt),
              id: String(history.id),
              message: history.reason ?? `${history.fromStatus ?? "created"} → ${history.toStatus}`,
              title: statusLabel(history.toStatus),
              tone: history.toStatus === "cancelled" ? "red" : "green"
            }))}
          />

          {actionError ? (
            <section className="rounded-[20px] border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm font-black text-red-500" role="alert">
              {actionError}
            </section>
          ) : null}

          {canCancel ? (
            <OrderDetailBottomActionMask>
              <button
                className="focus-ring h-12 w-full rounded-[20px] bg-[linear-gradient(180deg,#ff7d72_0%,#f04f47_58%,#df332f_100%)] text-sm font-black text-white disabled:cursor-wait disabled:opacity-60"
                disabled={cancelling}
                onClick={() => void cancelOrder()}
                type="button"
              >
                {cancelling ? "取消处理中" : "取消预约"}
              </button>
            </OrderDetailBottomActionMask>
          ) : null}
        </>
      ) : null}
    </PageScaffold>
  );
}

function LegacyUserOrderDetailPage() {
  const { orderId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { customers, stores, technicians } = useEntityStore();
  const userOrders = useUserOrders();
  const [apiOrder, setApiOrder] = useState<Order | null>(null);
  const order = apiOrder ?? userOrders.find((item) => item.id === orderId) ?? userOrders[0];
  const routeState = location.state as { notice?: string } | null;
  const service = findServiceForOrder(order);
  const selectedPackage = findPackageForOrder(order, service);
  const baseDurationMinutes = selectedPackage.durationMinutes;
  const store = stores.find((item) => item.name === order.storeName) ?? stores[0];
  const technician = technicians.find((item) => item.name === order.technicianName) ?? technicians[0];
  const customer = customers.find((item) => item.id === order.customerId) ?? customers[0];
  const [now, setNow] = useState(() => Date.now());
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [serviceReviewOpen, setServiceReviewOpen] = useState(false);
  const [extensionPickerOpen, setExtensionPickerOpen] = useState(false);
  const [selectedExtensionPackageId, setSelectedExtensionPackageId] = useState(service.packages[0]?.id ?? "");
  const serviceSession = useOrderServiceSession(order.id, baseDurationMinutes);
  const displayOrder = useMemo<Order>(
    () => ({
      ...order,
      status: resolveSessionOrderStatus(order, serviceSession.status)
    }),
    [order, serviceSession.status]
  );
  const showServiceCode = canShowServiceStartCode(displayOrder.status);
  const isServiceInProgress = serviceSession.status === "inService";
  const isServiceCompleted = serviceSession.status === "completed";
  const remainingSeconds = getOrderServiceRemainingSeconds(serviceSession, now);
  const pendingExtensionRequest = getPendingOrderExtensionRequest(serviceSession);
  const declinedExtensionRequest = getLatestDeclinedOrderExtensionRequest(serviceSession);
  const selectedExtensionPackage = service.packages.find((item) => item.id === selectedExtensionPackageId) ?? service.packages[0];
  const reviewRewardMaxNdp = getOrderReviewRewardMaxNdp(order);
  const showEndedAlert = isServiceInProgress && remainingSeconds <= 0 && !serviceSession.endedAlertDismissedAt;
  const showTenMinuteAlert =
    isServiceInProgress &&
    remainingSeconds > 0 &&
    remainingSeconds <= 600 &&
    !serviceSession.tenMinuteAlertDismissedAt &&
    !showEndedAlert;
  const showServiceReview = isServiceCompleted && !serviceSession.userReviewClosedAt;
  const merchantContactPath = getMessagePath(
    "user",
    getUserConversationId(order.mode === "home" ? "technician" : "store"),
    `/orders/${order.id}`
  );
  const closeDetail = () => {
    navigate("/", { replace: true });
  };
  const handleBack = () => {
    navigate(-1);
  };

  useEffect(() => {
    if (!isAuthenticated || !isBookingApiId(orderId)) {
      setApiOrder(null);
      return;
    }

    let active = true;

    bookingApi
      .getOrder(Number(orderId))
      .then((data) => {
        if (active) {
          setApiOrder(mapBookingOrderToDomainOrder(data));
        }
      })
      .catch(() => {
        if (active) {
          setApiOrder(null);
        }
      });

    return () => {
      active = false;
    };
  }, [isAuthenticated, orderId]);

  const serviceCardData = buildUserOrderServiceCardData(displayOrder, service, store);
  const paymentSummaryItems = [
    ["金额", yen(order.amount)],
    ["支付手段", getPaymentCopy(order.paymentStatus, order.mode)],
    ["来源", getOrderSourceLabel(order)]
  ];
  const openExtensionPicker = () => {
    if (!isServiceInProgress || pendingExtensionRequest) {
      return;
    }

    setSelectedExtensionPackageId(selectedExtensionPackage?.id ?? service.packages[0]?.id ?? "");
    setExtensionPickerOpen(true);
  };
  const confirmExtensionRequest = () => {
    if (!selectedExtensionPackage) {
      return;
    }

    requestOrderExtension(order.id, baseDurationMinutes, {
      packageId: selectedExtensionPackage.id,
      title: `${service.name} · ${selectedExtensionPackage.name}`,
      durationMinutes: selectedExtensionPackage.durationMinutes,
      price: selectedExtensionPackage.price
    });
    setExtensionPickerOpen(false);
  };
  const startService = () => {
    startOrderService(order.id, baseDurationMinutes);
    setStartConfirmOpen(false);
    setNow(Date.now());
  };
  const finishService = () => {
    endOrderService(order.id, baseDurationMinutes);
    setEndConfirmOpen(false);
    setServiceReviewOpen(true);
    setNow(Date.now());
  };
  const requestFinishService = () => {
    if (remainingSeconds > 0) {
      setEndConfirmOpen(true);
      return;
    }

    finishService();
  };
  const closeServiceReview = () => {
    dismissOrderServiceReview(order.id, baseDurationMinutes, "user");
    setServiceReviewOpen(false);
  };
  const submitServiceReview = (submission: ServiceReviewSubmission) => {
    submitOrderServiceUserReview(order.id, baseDurationMinutes, {
      rating: submission.rating,
      tags: submission.tags,
      maxRewardNdp: reviewRewardMaxNdp
    });
    setServiceReviewOpen(false);
  };

  useEffect(() => {
    if (!isServiceInProgress) {
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isServiceInProgress]);

  return (
    <PageScaffold contentClassName="space-y-4 pb-36" navItems={[]}>
      <AppTopBar
        actions={
          <>
            <IconButton
              className="border-transparent bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,var(--client-bg)_18%)]"
              icon="support"
              label="联系客服"
              to="/support"
            />
            <IconButton
              className="border-transparent bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,var(--client-bg)_18%)]"
              icon="manager"
              label="联系担当者"
              to={merchantContactPath}
            />
          </>
        }
        closeLabel="关闭预约详情"
        controlButtonClassName="border-transparent bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,var(--client-bg)_18%)]"
        onBack={handleBack}
        onClose={closeDetail}
        title="预约详情"
      />

      {routeState?.notice ? (
        <section className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-primary)_32%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] px-4 py-3 text-sm font-black leading-6 text-[color:var(--client-text)]">
          {routeState.notice}
        </section>
      ) : null}

      <OrderDynamicStatusCard order={displayOrder} providerName={displayOrder.storeName ?? store.name} />

      <section>
        <h2 className="mb-2 text-sm font-black text-[color:var(--client-muted)]">服务</h2>
        <SocialProfileMiniCard
          data={serviceCardData}
          showAction={false}
          topTags={[{ label: statusLabel(displayOrder.status), tone: "yellow" }]}
        />
        <div className="mt-2 grid grid-cols-3 gap-2">
          {paymentSummaryItems.map(([label, value]) => (
            <div
              className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,var(--client-bg)_14%)] px-3 py-3"
              key={label}
            >
              <p className="text-[10px] font-black text-[color:var(--client-muted)]">{label}</p>
              <strong className="mt-1 block truncate text-xs font-black text-[color:var(--client-text)]">{value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-black text-[color:var(--client-muted)]">店铺 / 服务方</h2>
        <SocialProfileMiniCard detailTo={`/stores/${store.id}`} showAction={false} store={store} topTags={[{ label: "服务方", tone: "purple" }]} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-black text-[color:var(--client-muted)]">技师 / 担当</h2>
        <SocialProfileMiniCard
          detailTo={`/profiles/technician/${technician.id}`}
          showAction={false}
          technician={technician}
          topTags={[{ label: displayOrder.mode === "home" ? "担当技师" : "门店担当", tone: "green" }]}
        />
      </section>

      <InfoTable rows={getReservationInfoRows(displayOrder, service, store, technician)} title="预约情报" />

      {showServiceCode ? (
        <section className="overflow-hidden rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-primary)_36%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,var(--client-surface)_88%)] px-4 py-5 text-center shadow-panel">
          <h2 className="text-base font-black text-[color:var(--client-text)]">服务验证码</h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--client-muted)]">服务开始前出示给技师，用于确认双方已到场。</p>
          <p className="mt-5 text-[42px] font-black tracking-[0.32em] text-[color:var(--client-primary)]">{getServiceStartCode(displayOrder.id)}</p>
        </section>
      ) : null}

      <ContactInfoTimeline events={getContactInfoEvents(displayOrder, store, technician, customer, serviceSession)} />

      <OrderDetailBottomActionMask>
        {isServiceInProgress ? (
          <div className="flex justify-center">
            <ServiceCountdownPill seconds={remainingSeconds} />
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <button
            className={cn(
              "focus-ring inline-flex h-12 min-w-0 items-center justify-center rounded-[20px] px-3 text-[13px] font-black shadow-[0_14px_30px_rgba(0,0,0,0.18)] transition sm:text-sm",
              isServiceInProgress && !pendingExtensionRequest
                ? "border border-[color:color-mix(in_srgb,var(--client-primary)_34%,var(--client-line)_66%)] bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,var(--client-bg)_8%)] text-[color:var(--client-text)] hover:-translate-y-0.5"
                : "cursor-not-allowed border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,var(--client-bg)_26%)] text-[color:var(--client-muted)] shadow-none"
            )}
            disabled={!isServiceInProgress || Boolean(pendingExtensionRequest)}
            onClick={openExtensionPicker}
            type="button"
          >
            {pendingExtensionRequest ? "等待确认" : "追加服务"}
          </button>
          <button
            className={cn(
              "focus-ring inline-flex h-12 min-w-0 items-center justify-center rounded-[20px] px-3 text-[13px] font-black transition sm:text-sm",
              isServiceInProgress
                ? "bg-[linear-gradient(180deg,#ff7d72_0%,#f04f47_58%,#df332f_100%)] text-white shadow-[0_18px_38px_rgba(244,76,68,0.34)] hover:-translate-y-0.5"
                : isServiceCompleted
                  ? "cursor-not-allowed border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,var(--client-bg)_26%)] text-[color:var(--client-muted)] shadow-none"
                  : "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)] shadow-[0_16px_34px_color-mix(in_srgb,var(--client-primary)_30%,transparent)] hover:-translate-y-0.5"
            )}
            disabled={isServiceCompleted}
            onClick={isServiceInProgress ? requestFinishService : () => setStartConfirmOpen(true)}
            type="button"
          >
            {isServiceInProgress ? "服务结束" : isServiceCompleted ? "服务已完成" : "服务开始"}
          </button>
        </div>
      </OrderDetailBottomActionMask>

      {startConfirmOpen ? (
        <div className="fixed -inset-y-20 inset-x-0 z-[130] grid place-items-center bg-black/55 px-4 backdrop-blur-sm">
          <section className="w-full max-w-[360px] rounded-[28px] bg-[color:color-mix(in_srgb,var(--client-elevated)_94%,var(--client-bg)_6%)] p-5 text-[color:var(--client-text)] shadow-[0_24px_70px_rgba(0,0,0,0.34)]">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_18%,transparent)] text-[color:var(--client-primary)]">
                <AppIcon name="clock" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-black">现在开始服务？</h2>
                <p className="mt-1 text-xs font-bold leading-5 text-[color:var(--client-muted)]">确认后服务时间会立刻开始计算。</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-[0.85fr_1fr] gap-3">
              <button
                className="focus-ring h-11 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] text-sm font-black text-[color:var(--client-text)]"
                onClick={() => setStartConfirmOpen(false)}
                type="button"
              >
                取消
              </button>
              <PrimaryButton className="h-11" onClick={startService}>
                开始计算
              </PrimaryButton>
            </div>
          </section>
        </div>
      ) : null}

      {endConfirmOpen ? (
        <div className="fixed -inset-y-20 inset-x-0 z-[135] grid place-items-center bg-black/55 px-4 backdrop-blur-sm">
          <section className="w-full max-w-[360px] rounded-[28px] bg-[color:color-mix(in_srgb,var(--client-elevated)_94%,var(--client-bg)_6%)] p-5 text-[color:var(--client-text)] shadow-[0_24px_70px_rgba(0,0,0,0.34)]">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[color:color-mix(in_srgb,#ff6b61_18%,transparent)] text-[#ff867c]">
                <AppIcon name="clock" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-black">服务时间还没有到</h2>
                <p className="mt-1 text-xs font-bold leading-5 text-[color:var(--client-muted)]">是否提前结束本次服务？取消后会继续服务。</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-[0.85fr_1fr] gap-3">
              <button
                className="focus-ring h-11 rounded-full bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] text-sm font-black text-[color:var(--client-text)]"
                onClick={() => setEndConfirmOpen(false)}
                type="button"
              >
                取消
              </button>
              <button
                className="focus-ring h-11 rounded-full bg-[linear-gradient(180deg,#ff7d72_0%,#f04f47_58%,#df332f_100%)] text-sm font-black text-white shadow-[0_14px_30px_rgba(244,76,68,0.32)]"
                onClick={finishService}
                type="button"
              >
                结束服务
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {extensionPickerOpen ? (
        <MobileFullscreenPage>
          <MobileFullscreenHeader
            onClose={() => setExtensionPickerOpen(false)}
            title="追加服务"
          />
          <main className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {service.packages.map((item) => {
              const active = item.id === selectedExtensionPackage?.id;

              return (
                <button
                  className={cn(
                    "focus-ring w-full rounded-[24px] border p-4 text-left shadow-panel transition",
                    active
                      ? "border-[color:color-mix(in_srgb,var(--client-primary)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_15%,var(--client-surface)_85%)]"
                      : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,var(--client-bg)_12%)]"
                  )}
                  key={item.id}
                  onClick={() => setSelectedExtensionPackageId(item.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-black text-[color:var(--client-text)]">{item.name}</h2>
                      <p className="mt-2 text-xs font-bold leading-5 text-[color:var(--client-muted)]">{item.description}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_18%,transparent)] px-3 py-1 text-xs font-black text-[color:var(--client-primary)]">
                      +{item.durationMinutes}分钟
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <strong className="rounded-full bg-white/10 px-3 py-1 text-sm font-black text-[color:var(--client-text)]">{yen(item.price)}</strong>
                    {item.includes.slice(0, 3).map((include) => (
                      <span className="rounded-full bg-white/8 px-3 py-1 text-xs font-bold text-[color:var(--client-muted)]" key={include}>
                        {include}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </main>
          <footer className="px-4 pb-[calc(max(env(safe-area-inset-bottom),12px)+12px)] pt-2">
            <button
              className="focus-ring inline-flex h-12 w-full items-center justify-center rounded-[20px] bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] shadow-[0_16px_34px_color-mix(in_srgb,var(--client-primary)_30%,transparent)]"
              onClick={confirmExtensionRequest}
              type="button"
            >
              确认追加
            </button>
          </footer>
        </MobileFullscreenPage>
      ) : null}

      {showTenMinuteAlert ? (
        <ServiceRingAlert
          message="服务即将结束，请确认是否需要追加服务或准备收尾。"
          onDismiss={() => dismissOrderServiceAlert(order.id, baseDurationMinutes, "tenMinute")}
          title="服务即将结束"
        />
      ) : null}

      {showEndedAlert ? (
        <ServiceRingAlert
          message="预约服务时间已经结束，请确认服务完成或与担当沟通。"
          onDismiss={() => dismissOrderServiceAlert(order.id, baseDurationMinutes, "ended")}
          title="服务结束"
        />
      ) : null}

      {declinedExtensionRequest ? (
        <ServiceRingAlert
          actionLabel="我知道了"
          message="技师无法提供追加服务，非常抱歉。"
          onDismiss={() => dismissOrderExtensionNotice(order.id, baseDurationMinutes, declinedExtensionRequest.id)}
          title="追加服务无法提供"
        />
      ) : null}

      {showServiceReview || serviceReviewOpen ? (
        <ServiceReviewPrompt
          message="请对本次服务进行评价。可以直接跳过，也可以点亮星星和标签。"
          onSkip={closeServiceReview}
          onSubmit={submitServiceReview}
          submitHint={`评价后可能获得0~${reviewRewardMaxNdp}NDP`}
          tagOptions={serviceReviewSpecialTags}
          title="服务已经结束"
          topContent={
            <section className="grid gap-2">
              <SocialProfileMiniCard
                detailTo={`/stores/${store.id}`}
                showAction={false}
                store={store}
                topTags={[{ label: "店铺", tone: "purple" }]}
              />
              <SocialProfileMiniCard
                detailTo={`/profiles/technician/${technician.id}`}
                showAction={false}
                technician={technician}
                topTags={[{ label: "技师", tone: "green" }]}
              />
            </section>
          }
        />
      ) : null}
    </PageScaffold>
  );
}

export function UserOrderDetailPage() {
  const { orderId } = useParams();

  return isBookingApiId(orderId) ? <FormalUserOrderDetailPage orderId={Number(orderId)} /> : <LegacyUserOrderDetailPage />;
}
