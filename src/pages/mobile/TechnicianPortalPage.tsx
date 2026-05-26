import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import {
  createCustomContactCategoryDraft,
  CustomContactCategoryEditor,
  ContactDirectorySection,
  ContactShortcutGrid,
  ContactShortcutPanel,
  type ContactShortcut,
  type CustomContactCategory,
  type ContactShortcutPanelItem,
  type DirectoryContactItem,
  matchesCustomContactCategory,
  useCustomContactCategories
} from "../../components/mobile/ContactDirectory";
import { AppIcon, AppTopBar, FeatureSegmentedTabs, IconButton, PageScaffold, ScheduleViewSegmentedTabs } from "../../components/client-ui/AppScaffold";
import { FeatureCarousel, type FeatureCarouselSlide } from "../../components/client-ui/FeatureCarousel";
import { FloatingHomeHeader, floatingHeaderGlassPanelClassName, floatingHeaderInnerClassName } from "../../components/mobile/FloatingHomeHeader";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { ChatConversationInfoCard } from "../../components/mobile/ChatConversationInfoCard";
import { ContactEventTimelinePanel, type ContactEventTimelineEntry, type ContactEventTimelineTone } from "../../components/mobile/ContactEventTimeline";
import { FloatingActionButton } from "../../components/mobile/FloatingActionButton";
import { MobileShell } from "../../components/mobile/MobileShell";
import { MobileMessageCenter } from "../../components/mobile/MobileMessageCenter";
import { OrderServiceMiniCard, findOrderService } from "../../components/mobile/OrderServiceMiniCard";
import { SharedHomeHeader } from "../../components/mobile/SharedHomeHeader";
import { SectionTitle } from "../../components/mobile/SectionTitle";
import { roleBasedTabConfig, technicianNavItems } from "../../components/mobile/navItems";
import {
  TechnicianScheduleSetupModal,
  type TechnicianScheduleSetupConfig,
  type TechnicianScheduleSetupType
} from "../../components/scheduling/TechnicianScheduleSetupModal";
import { ScheduleSearchField } from "../../components/scheduling/ScheduleSearchField";
import { TechnicianShiftPlanningPanel, type TechnicianPlanningStep } from "../../components/scheduling/TechnicianShiftPlanningPanel";
import { UnifiedUserCalendar } from "../../components/scheduling/UnifiedUserCalendar";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { Button } from "../../components/ui/Button";
import { ChartPointerTooltip, resolveChartPointerState, type ChartPointerState } from "../../components/ui/ChartPointerTooltip";
import { ImageGalleryManager } from "../../components/ui/ImageGalleryManager";
import { NotificationBadge } from "../../components/ui/NotificationBadge";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { fieldJobs, orders } from "../../data/mock";
import { ImContactsListPage, ImMessagesEntryPage } from "../../features/im/pages";
import { ImScopeProvider } from "../../features/im/scope";
import { useSocial } from "../../features/social/context";
import { IdentityBadge, VerificationBadge } from "../../features/social/components/SocialUi";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText, type Language } from "../../i18n/translations";
import { partitionDirectoryContacts } from "../../lib/contactDirectory";
import { OrderDynamicStatusCard } from "../../shared/order-detail/OrderDynamicStatusCard";
import { SocialProfileMiniCard, buildShopInfoCardData, buildTechnicianInfoCardData, buildUserInfoCardData } from "../../shared/profile-card";
import { getScopedProfileDetailPath } from "../../shared/profile-detail";
import {
  getMessagePath,
  getTechnicianCustomerConversationId,
  getTechnicianStaffConversationId,
  getTechnicianStoreConversationId,
  getTechnicianSupportConversationId
} from "../../lib/messageCenter";
import { getOneClickTargetDates } from "../../lib/oneClickSchedule";
import { getNeedoAppBookingTitle } from "../../lib/scheduleBookingTitle";
import { getServiceStartCode } from "../../lib/serviceStartCode";
import { shareContent } from "../../lib/share";
import { getActivePolicyForStore, getPolicyStatusLabel, getResponseStatusLabel, getScheduleContextLabel, resolveScheduleContext } from "../../lib/shiftPlanning";
import { buildTechnicianWorkAnalyticsSeed } from "../../lib/technicianWorkAnalytics";
import { updateCustomerEntity, updateTechnicianEntity, useEntityStore } from "../../state/entityStore";
import {
  dismissOrderServiceReview,
  endOrderService,
  getOrderServiceRemainingSeconds,
  getPendingOrderExtensionRequest,
  respondOrderExtensionRequest,
  startOrderService,
  type OrderServiceSession,
  useOrderServiceSession,
  useOrderServiceSessions
} from "../../state/orderServiceSessionStore";
import {
  addSharedSchedules,
  removeSharedSchedule,
  updateSharedAvailabilityWindow,
  updateSharedSchedulePlanTag,
  useScheduleStore
} from "../../state/scheduleStore";
import { markShiftPlanningNotificationRead, useShiftPlanningStore } from "../../state/shiftPlanningStore";
import { getClientThemeClassName, useClientTheme } from "../../theme/ClientThemeProvider";
import { cn, statusLabel, yen } from "../../lib/utils";
import type { NotificationType } from "../../types/shiftPlanning";
import type { Customer, Order, ServiceItem, ServicePaymentMethod, Store, Technician } from "../../types/domain";
import { ContactInfoDetailText, ServiceCountdownPill, ServiceReviewPrompt, type ServiceReviewTag } from "../../shared/order-detail/ServiceSessionUi";

type TechnicianView = "tasks" | "schedule" | "moments" | "contacts" | "messages" | "me" | "workDetail";
type WorkStatus = "出勤" | "移动中" | "服务中" | "休息" | "退勤";
type TechnicianTasksPanelTab = "schedule" | "orders";
type TechnicianTaskOrderTab = "pending" | "active" | "done";
type TechnicianMeTab = "info" | "data";
type ScheduleScope = "day" | "week" | "month";
type ScheduleDisplayMode = ScheduleScope | "list";
type TechWorkMode = "store" | "personal";
type TechnicianPlanType = TechnicianScheduleSetupType | "travel" | "break" | "expectedTravel" | "expectedBreak";
type TechnicianPaymentOption = ServicePaymentMethod;
type TechnicianContact = DirectoryContactItem & { followed: boolean };
type DayTimelineDisplayMode = "all" | "scheduled";
type DayScheduleAdjustmentType = "travel" | "break";
type DayScheduleEditorState = {
  date: string;
  type: DayScheduleAdjustmentType;
  startTime: string;
  endTime: string;
};
type TechnicianScheduleEvent = {
  id: string;
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "free" | "booked" | "blocked";
  orderId?: string;
  workMode: TechWorkMode;
  title: string;
  place: string;
  customer: string;
  amount: number;
  note: string;
  planType?: TechnicianPlanType;
  isEstimated?: boolean;
};
type TechnicianStatusTimelineRecord = {
  actorName: string;
  actorRole: string;
  atLabel: string;
  id: string;
  message: ReactNode;
  sortAt: number;
  title: string;
  tone: ContactEventTimelineTone;
};
type TechnicianStatusLogOptions = Partial<Pick<TechnicianStatusTimelineRecord, "actorName" | "actorRole" | "title" | "tone">> & {
  messageNode?: ReactNode;
};

const technicianCustomerReviewTags: ServiceReviewTag[] = [
  { label: "准时", count: 8, kind: "chip" },
  { label: "礼貌", count: 6, kind: "chip" },
  { label: "沟通好", count: 5, kind: "chip" },
  { label: "好配合", count: 4, kind: "chip" },
  { label: "守规则", count: 3, kind: "chip" },
  { label: "会再接", count: 2, kind: "chip" }
];

type TechnicianProfile = {
  nickname: string;
  legalName: string;
  avatar: string;
  gallery: string[];
  identityLabel: "店铺所属技师" | "个人技师";
  age: string;
  height: string;
  bio: string;
  languages: string[];
  tags: string[];
  serviceAreas: string[];
  canServeForeigners: boolean;
  bidBudgetMin: string;
  bidBudgetMax: string;
  paymentMethods: TechnicianPaymentOption[];
};

type TechnicianProfileDraft = {
  nickname: string;
  avatar: string;
  gallery: string[];
  identityLabel: "店铺所属技师" | "个人技师";
  age: string;
  height: string;
  bio: string;
  selectedCountry: string;
  selectedPrefecture: string;
  selectedArea: string;
  selectedLine: string;
  selectedStations: string[];
  languages: string[];
  tags: string[];
  serviceAreas: string[];
  canServeForeigners: boolean;
  bidBudgetMin: string;
  bidBudgetMax: string;
  paymentMethods: TechnicianPaymentOption[];
  visibility: "privateAll" | "limited" | "network";
};

type TechnicianKycDraft = {
  surname: string;
  givenName: string;
  surnameKana: string;
  givenKana: string;
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  email: string;
  phone: string;
  documentType: string;
  idFrontPreview: string;
  idFrontName: string;
  idBackPreview: string;
  idBackName: string;
  selfiePreview: string;
  selfieName: string;
  agreed: boolean;
};

type WorkDetailScope = ScheduleScope;

type WorkTrendPoint = {
  key: string;
  label: string;
  subLabel?: string;
  income: number;
  hours: number;
  jobs: number;
  future: boolean;
};

const statusButtons: WorkStatus[] = ["出勤", "移动中", "服务中", "休息", "退勤"];
const scheduleRequirementNotificationTypes = new Set<NotificationType>([
  "store_opened_period",
  "store_updated_period",
  "store_locked_period",
  "mode_switch_announced",
  "shift_confirmed",
  "shift_waitlisted"
]);
const statusButtonMeta: Record<WorkStatus, { icon: string; caption: string; toneClassName: string }> = {
  出勤: { icon: "●", caption: "开始接收门店派单", toneClassName: "technician-work-status--duty" },
  移动中: { icon: "↗", caption: "同步路线和预计到达", toneClassName: "technician-work-status--travel" },
  服务中: { icon: "▶", caption: "需输入客人验证码", toneClassName: "technician-work-status--service" },
  休息: { icon: "☾", caption: "暂停接单并同步休息中", toneClassName: "technician-work-status--rest" },
  退勤: { icon: "■", caption: "下班后无法收到订单", toneClassName: "technician-work-status--off" }
};

function getCompactStatusLabelClass(label: string) {
  const length = Array.from(label.replace(/\s/g, "")).length;

  if (length <= 3) {
    return "inline-block max-w-full whitespace-nowrap text-[12px]";
  }

  if (length <= 5) {
    return "inline-block max-w-full whitespace-nowrap text-[10px]";
  }

  if (length <= 8) {
    return "inline-block max-w-full whitespace-nowrap text-[9px]";
  }

  return "line-clamp-2 max-w-full whitespace-normal break-words text-[9px] leading-[1.08]";
}

function ScheduleNewBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/80 bg-[linear-gradient(180deg,#ff8b7f_0%,#ff5f58_48%,#ff453f_100%)] text-[8px] font-black leading-none text-white shadow-[0_5px_14px_rgba(255,86,79,0.28)]",
        className
      )}
    >
      New
    </span>
  );
}

function getTaskOrderTabLabel(tab: TechnicianTaskOrderTab) {
  return tab === "active" ? "进行中" : tab === "pending" ? "待确认" : "已收尾";
}

function getTaskOrderTabTone(tab: TechnicianTaskOrderTab): "green" | "yellow" | "neutral" {
  return tab === "active" ? "green" : tab === "pending" ? "yellow" : "neutral";
}

function getTechnicianOrderAddress(order: Order) {
  return order.mode === "home" ? `${order.city}${order.area}` : order.storeName ?? order.area;
}

function getTaskOrderPaymentLabel(order: Order) {
  if (order.paymentStatus === "paid") {
    return "平台已支付";
  }

  if (order.paymentStatus === "depositPaid") {
    return "已支付定金";
  }

  if (order.paymentStatus === "refunded") {
    return "已退款";
  }

  return order.mode === "store" ? "到店后确认付款" : "待平台支付";
}

function getOrderDetailPaymentCopy(paymentStatus: Order["paymentStatus"], mode: Order["mode"]) {
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

function getOrderDetailSourceLabel(order: Order) {
  const labels: Record<Order["source"], string> = {
    app: "App",
    line: "LINE",
    partner: "Partner",
    web: "Web"
  };

  return labels[order.source];
}

function isInteractiveTaskCardTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("a,button,input,textarea,select,label"));
}

function getOrderDetailDateTime(order: Order) {
  const [date = "", time = ""] = order.bookedAt.split(" ");

  return { date, time };
}

function findOrderPackage(order: Order, service: ServiceItem) {
  const durationMatch = order.itemName.match(/(\d+)\s*分钟/);
  const duration = durationMatch ? Number(durationMatch[1]) : undefined;

  return service.packages.find((item) =>
    order.itemName.includes(item.name) ||
    item.price === order.amount ||
    (typeof duration === "number" && item.durationMinutes === duration)
  ) ?? service.packages[0];
}

type TechnicianOrderContactEvent = { actorAvatarSrc?: string; at: string; detail: string; operator: string; title: string; tone?: "green" | "red" };

function getTechnicianOrderDetailRows(order: Order, service: ServiceItem, store: Store, technician: Technician): Array<[string, string]> {
  const { date, time } = getOrderDetailDateTime(order);
  const selectedPackage = findOrderPackage(order, service);
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

function formatTechnicianSessionEventTime(timestamp?: number) {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

function formatTechnicianStatusTimelineTime(timestamp: number) {
  const date = new Date(timestamp);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}\n${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatTechnicianStatusDateTime(timestamp: number) {
  const date = new Date(timestamp);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function parseTechnicianDateTime(value?: string) {
  if (!value) {
    return Number.NaN;
  }

  return new Date(value.replace(" ", "T")).getTime();
}

function formatTechnicianOrderSubjectText(order: Order) {
  return `订单ID ${order.orderNo}（${order.id}），客人 ${order.customerName}`;
}

function TechnicianTimelineLink({ children, to }: { children: ReactNode; to: string }) {
  return (
    <Link
      className="font-black text-[color:var(--client-primary)] underline decoration-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] decoration-2 underline-offset-2"
      to={to}
    >
      {children}
    </Link>
  );
}

function TechnicianTimelineOrderSubject({ order }: { order: Order }) {
  return (
    <>
      订单ID{" "}
      <TechnicianTimelineLink to={`/technician/orders/${order.id}`}>
        {order.orderNo}（{order.id}）
      </TechnicianTimelineLink>
      ，客人{" "}
      <TechnicianTimelineLink to={getScopedProfileDetailPath("technician", "user", order.customerId)}>
        {order.customerName}
      </TechnicianTimelineLink>
    </>
  );
}

function createTechnicianStatusTimelineRecord({
  actorName,
  actorRole,
  message,
  idSeed,
  sortAt,
  title,
  tone = "green"
}: {
  actorName: string;
  actorRole: string;
  idSeed: string;
  message: ReactNode;
  sortAt: number;
  title: string;
  tone?: ContactEventTimelineTone;
}): TechnicianStatusTimelineRecord {
  return {
    actorName,
    actorRole,
    atLabel: formatTechnicianStatusTimelineTime(sortAt),
    id: `system-${title}-${sortAt}-${idSeed}`,
    message,
    sortAt,
    title,
    tone
  };
}

function getTechnicianStatusTimelineMeta(message: string): Pick<TechnicianStatusTimelineRecord, "actorName" | "actorRole" | "title" | "tone"> {
  if (/SOS|不正确|请输入|无法|不能|过去|需要|未输入|不完整|拒绝|取消|错误|失败|异常/.test(message)) {
    return {
      actorName: "系统",
      actorRole: "异常信息",
      title: "异常信息",
      tone: "red"
    };
  }

  if (/聊天|电话|分享|转发|同步给用户|同步给门店|通知/.test(message)) {
    return {
      actorName: "我",
      actorRole: "联系执行",
      title: "联系执行",
      tone: "green"
    };
  }

  if (/资料|头像|本人确认|认证|文件|KYC|信息卡/.test(message)) {
    return {
      actorName: "我",
      actorRole: "资料执行",
      title: "资料执行",
      tone: "green"
    };
  }

  if (/排班|时段|出勤|移动|休息|退勤|共享排班|锁定|派单/.test(message)) {
    return {
      actorName: "系统",
      actorRole: "排班执行",
      title: "排班执行",
      tone: "green"
    };
  }

  if (/服务|验证码|订单|承接|评价|追加/.test(message)) {
    return {
      actorName: "我",
      actorRole: "履约执行",
      title: "履约执行",
      tone: "green"
    };
  }

  return {
    actorName: "系统",
    actorRole: "执行信息",
    title: "执行信息",
    tone: "green"
  };
}

function buildTechnicianOperationalStatusRecords({
  orders,
  referenceTimestamp,
  scheduleEvents,
  sessions
}: {
  orders: Order[];
  referenceTimestamp: number;
  scheduleEvents: TechnicianScheduleEvent[];
  sessions: Record<string, OrderServiceSession>;
}) {
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const records: TechnicianStatusTimelineRecord[] = [];

  orders.forEach((order) => {
    const session = sessions[order.id];

    if (session?.startedAt) {
      records.push(createTechnicianStatusTimelineRecord({
        actorName: "系统",
        actorRole: "开始服务",
        idSeed: `${order.id}-started-${session.startedAt}`,
        message: <>开始服务：<TechnicianTimelineOrderSubject order={order} />，项目 {order.itemName}，开始时间 {formatTechnicianStatusDateTime(session.startedAt)}。</>,
        sortAt: session.startedAt,
        title: "开始服务"
      }));
    } else if (order.status === "inService") {
      const startedAt = parseTechnicianDateTime(order.bookedAt);

      if (Number.isFinite(startedAt)) {
        records.push(createTechnicianStatusTimelineRecord({
          actorName: "系统",
          actorRole: "开始服务",
          idSeed: `${order.id}-started-fallback-${startedAt}`,
          message: <>开始服务：<TechnicianTimelineOrderSubject order={order} />，项目 {order.itemName}，开始时间 {order.bookedAt}。</>,
          sortAt: startedAt,
          title: "开始服务"
        }));
      }
    }

    session?.extensionRequests.forEach((request) => {
      records.push(createTechnicianStatusTimelineRecord({
        actorName: order.customerName,
        actorRole: "加钟申请",
        idSeed: `${order.id}-extension-request-${request.id}`,
        message: <>客人申请加钟：<TechnicianTimelineOrderSubject order={order} />，加钟项目 {request.title}，追加 {request.durationMinutes} 分钟，金额 {yen(request.price)}。</>,
        sortAt: request.requestedAt,
        title: "加钟申请"
      }));

      if (request.status === "accepted" && request.respondedAt) {
        records.push(createTechnicianStatusTimelineRecord({
          actorName: "我",
          actorRole: "开始加钟",
          idSeed: `${order.id}-extension-accepted-${request.id}`,
          message: <>开始加钟：<TechnicianTimelineOrderSubject order={order} />，加钟项目 {request.title}，追加 {request.durationMinutes} 分钟，开始时间 {formatTechnicianStatusDateTime(request.respondedAt)}。</>,
          sortAt: request.respondedAt,
          title: "开始加钟"
        }));
      }

      if ((request.status === "declined" || request.status === "dismissed") && request.respondedAt) {
        records.push(createTechnicianStatusTimelineRecord({
          actorName: "我",
          actorRole: "加钟异常",
          idSeed: `${order.id}-extension-declined-${request.id}`,
          message: <>加钟未开始：<TechnicianTimelineOrderSubject order={order} />，加钟项目 {request.title} 已拒绝，请确认用户端提示。</>,
          sortAt: request.respondedAt,
          title: "加钟异常",
          tone: "red"
        }));
      }
    });

    if (session?.completedAt) {
      records.push(createTechnicianStatusTimelineRecord({
        actorName: "系统",
        actorRole: "结束服务",
        idSeed: `${order.id}-completed-${session.completedAt}`,
        message: <>结束服务：<TechnicianTimelineOrderSubject order={order} />，项目 {order.itemName}，结束时间 {formatTechnicianStatusDateTime(session.completedAt)}。</>,
        sortAt: session.completedAt,
        title: "结束服务"
      }));
    }

    const bookedAt = parseTechnicianDateTime(order.bookedAt);
    const lateAt = bookedAt + 10 * 60_000;

    if (
      Number.isFinite(bookedAt) &&
      referenceTimestamp > lateAt &&
      !session?.startedAt &&
      ["pending", "confirmed", "scheduled"].includes(order.status)
    ) {
      records.push(createTechnicianStatusTimelineRecord({
        actorName: "系统",
        actorRole: "迟到异常",
        idSeed: `${order.id}-late-${lateAt}`,
        message: <>还没开始服务，已经迟到：<TechnicianTimelineOrderSubject order={order} />，预约时间 {order.bookedAt}，请立即联系客人确认到达和开始服务。</>,
        sortAt: lateAt,
        title: "迟到异常",
        tone: "red"
      }));
    }
  });

  scheduleEvents.forEach((event) => {
    const eventStartsAt = parseTechnicianDateTime(`${event.date} ${event.startTime}`);

    if (!Number.isFinite(eventStartsAt)) {
      return;
    }

    if (event.planType === "leave") {
      records.push(createTechnicianStatusTimelineRecord({
        actorName: "我",
        actorRole: "请假",
        idSeed: `${event.id}-leave-${eventStartsAt}`,
        message: `请假：${event.date} ${event.startTime}-${event.endTime}，${event.note || "该时段不可安排服务"}。`,
        sortAt: eventStartsAt,
        title: "请假",
        tone: "red"
      }));
    }

    if (event.status === "booked" && event.orderId) {
      const order = orderById.get(event.orderId);
      const session = sessions[event.orderId];
      const customerLateAt = eventStartsAt + 15 * 60_000;

      if (
        order &&
        referenceTimestamp > customerLateAt &&
        !session?.startedAt &&
        /未到|客人迟到|联系客人|待确认/.test(event.note)
      ) {
        records.push(createTechnicianStatusTimelineRecord({
          actorName: "系统",
          actorRole: "客人迟到",
          idSeed: `${order.id}-customer-late-${customerLateAt}`,
          message: <>客人迟到，请联系客人：<TechnicianTimelineOrderSubject order={order} />，排班时间 {event.date} {event.startTime}-{event.endTime}，当前说明：{event.note}。</>,
          sortAt: customerLateAt,
          title: "客人迟到",
          tone: "red"
        }));
      }
    }
  });

  return records
    .sort((left, right) => right.sortAt - left.sortAt)
    .filter((record, index, sortedRecords) => sortedRecords.findIndex((item) => item.id === record.id) === index)
    .slice(0, 20);
}

function getTechnicianOrderSessionEvents(order: Order, technician: Technician, customer: Customer, session: OrderServiceSession): TechnicianOrderContactEvent[] {
  const technicianName = order.technicianName ?? technician.name;
  const events: TechnicianOrderContactEvent[] = [];

  if (session.startedAt) {
    events.push({
      at: formatTechnicianSessionEventTime(session.startedAt),
      actorAvatarSrc: session.status === "inService" ? technician.avatar : undefined,
      detail: `服务已开始，倒计时同步启动。预计服务时长 ${session.baseDurationMinutes + session.addedDurationMinutes} 分钟。`,
      operator: session.status === "inService" ? technicianName : "系统同步",
      title: "服务开始"
    });
  }

  session.extensionRequests.forEach((request) => {
    events.push({
      at: formatTechnicianSessionEventTime(request.requestedAt),
      actorAvatarSrc: customer.avatar,
      detail: `客户申请追加服务：${request.title}，追加 ${request.durationMinutes} 分钟，金额 ${yen(request.price)}。`,
      operator: order.customerName,
      title: "追加服务申请"
    });

    if (request.status === "accepted" && request.respondedAt) {
      events.push({
        at: formatTechnicianSessionEventTime(request.respondedAt),
        actorAvatarSrc: technician.avatar,
        detail: `已接受追加服务，倒计时增加 ${request.durationMinutes} 分钟。`,
        operator: technicianName,
        title: "追加服务已接受"
      });
    }

    if ((request.status === "declined" || request.status === "dismissed") && request.respondedAt) {
      events.push({
        at: formatTechnicianSessionEventTime(request.respondedAt),
        actorAvatarSrc: technician.avatar,
        detail: "已拒绝追加服务，用户端已收到无法提供追加服务的提示。",
        operator: technicianName,
        title: "追加服务已拒绝",
        tone: "red"
      });
    }
  });

  if (session.completedAt) {
    events.push({
      at: formatTechnicianSessionEventTime(session.completedAt),
      detail: "服务已结束，状态已同步到订单详情。",
      operator: "系统同步",
      title: "服务结束"
    });
  }

  return events;
}

function getTechnicianOrderDetailEvents(order: Order, store: Store, technician: Technician, customer: Customer, session?: OrderServiceSession) {
  const providerName = order.storeName ?? store.name;
  const acceptedAt = order.createdAt.replace(/(\d{2}):(\d{2})$/, (_match, hour: string, minute: string) => {
    const nextMinute = Number(minute) + 3;
    return `${hour}:${String(nextMinute).padStart(2, "0")}`;
  });

  const events: TechnicianOrderContactEvent[] = [
    {
      at: order.createdAt,
      actorAvatarSrc: customer.avatar,
      detail: `${getOrderDetailSourceLabel(order)} 创建预约，金额 ${yen(order.amount)}，支付状态 ${getOrderDetailPaymentCopy(order.paymentStatus, order.mode)}。`,
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
    events.push(...getTechnicianOrderSessionEvents(order, technician, customer, session));
  }

  return events.filter((event) => event.at).sort((left, right) => left.at.localeCompare(right.at));
}

function TechnicianOrderInfoTable({ rows, title }: { rows: Array<[string, string]>; title: string }) {
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

function TechnicianOrderContactTimeline({
  commentAuthorAvatarSrc,
  events
}: {
  commentAuthorAvatarSrc?: string;
  events: TechnicianOrderContactEvent[];
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
      commentAuthorAvatarSrc={commentAuthorAvatarSrc}
      title="联系信息"
    />
  );
}

function getOrderEstimatedDurationMinutes(order: Order) {
  const explicitMinutes = order.itemName.match(/(\d+)\s*分钟/)?.[1];

  if (explicitMinutes) {
    return Number(explicitMinutes);
  }

  const service = findOrderService(order);
  const packageMinutes = service.packages[0]?.durationMinutes;

  if (typeof packageMinutes === "number" && packageMinutes > 0) {
    return packageMinutes;
  }

  return order.mode === "store" ? 90 : 120;
}

function addMinutesToDateTime(value: string, minutes: number) {
  const parsed = parseScheduleDateTime(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  parsed.setMinutes(parsed.getMinutes() + minutes);

  return `${formatInputDate(parsed)} ${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
}
const todayDate = "2026-04-13";
const technicianHomeReferenceTime = `${todayDate} 09:30`;
const scheduleScopeOptions: Array<{ label: string; value: ScheduleScope }> = [
  { label: "日", value: "day" },
  { label: "周", value: "week" },
  { label: "月", value: "month" }
];
const scheduleDisplayOptions: Array<{ label: string; value: ScheduleDisplayMode }> = [
  { label: "日视图", value: "day" },
  { label: "周视图", value: "week" },
  { label: "月视图", value: "month" },
  { label: "列表视图", value: "list" }
];
const workModeLabels: Record<TechWorkMode, string> = {
  store: "店铺工作",
  personal: "个人工作"
};
const paymentOptionLabels: Record<TechnicianPaymentOption, string> = {
  platform: "平台支付",
  offline: "线下支付",
  prepay: "需要预付",
  cash: "现金支付",
  paypay: "PayPay",
  paypal: "PayPal",
  wechatpay: "WeChat Pay",
  alipay: "Alipay"
};
const paymentOptions: TechnicianPaymentOption[] = ["platform", "offline", "cash", "prepay", "paypay", "paypal", "wechatpay", "alipay"];
const languageOptions = ["日本語", "中文", "English", "한국어", "ไทย", "Tiếng Việt", "Español"];
const serviceAreaCatalog = {
  日本: {
    東京都: ["銀座", "新宿", "渋谷", "池袋", "六本木"],
    大阪府: ["梅田", "難波", "心斎橋"],
    神奈川県: ["横浜", "川崎", "みなとみらい"]
  },
  中国: {
    上海市: ["静安区", "徐汇区", "浦东新区"],
    北京市: ["朝阳区", "海淀区", "望京"]
  },
  美国: {
    California: ["Los Angeles", "Irvine", "San Jose"],
    "New York": ["Manhattan", "Brooklyn", "Queens"]
  },
  韩国: {
    "서울특별시": ["강남구", "마포구", "송파구"],
    "부산광역시": ["해운대구", "수영구", "서면"]
  }
} as const;
const railLineCatalog = {
  山手線: ["新宿駅", "渋谷駅", "池袋駅", "上野駅", "東京駅", "品川駅"],
  中央線快速: ["東京駅", "御茶ノ水駅", "四ツ谷駅", "新宿駅", "中野駅", "吉祥寺駅"],
  日比谷線: ["上野駅", "秋葉原駅", "銀座駅", "六本木駅", "恵比寿駅"],
  東横線: ["渋谷駅", "中目黒駅", "自由が丘駅", "武蔵小杉駅", "横浜駅"],
  御堂筋線: ["梅田駅", "本町駅", "心斎橋駅", "なんば駅", "天王寺駅"]
} as const;
const kycBirthYearOptions = Array.from({ length: 46 }, (_, index) => String(2008 - index));
const kycBirthMonthOptions = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
const kycBirthDayOptions = Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, "0"));
const kycDocumentTypeValues = [
  "none",
  "driverLicense",
  "myNumberFront",
  "passport",
  "residentCard",
  "residenceCard",
  "studentId"
] as const;
type KycDocumentTypeValue = (typeof kycDocumentTypeValues)[number];
const tagGroups = [
  { title: "身材", tags: ["👠 高挑", "🧘 匀称", "💃 曲线感", "🏃 运动系", "🌿 纤细"] },
  { title: "相貌", tags: ["✨ 清秀", "🌸 甜美", "🖤 冷艳", "😊 治愈系", "🎀 上镜感"] },
  { title: "性格", tags: ["🤝 亲和", "🫧 安静", "🎯 专业", "🌞 开朗", "🧠 细心"] },
  { title: "技术", tags: ["💆 肩颈调理", "🛌 睡眠放松", "🔥 热石", "🪷 深层舒缓", "🫶 沟通细致"] },
  { title: "语言", tags: ["🗾 日本語", "🀄 中文", "🌍 English", "🇰🇷 한국어", "🧳 外国人対応"] }
] as const;
const technicianPlanMeta: Record<
  TechnicianPlanType,
  {
    title: string;
    caption: string;
    status: "free" | "blocked";
    tone: string;
    accent: string;
    dot: string;
  }
> = {
  availability: {
    title: "可接单 / 可出勤",
    caption: "设为你预计可以接受工作、允许店铺安排的时段",
    status: "free",
    tone: "border border-[#2b4f79] bg-[linear-gradient(180deg,rgba(59,98,160,0.20),rgba(20,23,31,0.98))] text-[#8ebcff]",
    accent: "text-[#aacdff]",
    dot: "bg-[#6ea8ff]"
  },
  leave: {
    title: "请假",
    caption: "整段请假，店铺不可安排工作",
    status: "blocked",
    tone: "border border-[#7c4347] bg-[linear-gradient(180deg,rgba(170,76,84,0.18),rgba(27,18,20,0.98))] text-[#ff9c96]",
    accent: "text-[#ffc0bb]",
    dot: "bg-[#ff8279]"
  },
  locked: {
    title: "锁定",
    caption: "保留给培训、移动或私人安排，不允许被覆盖",
    status: "blocked",
    tone: "border border-[#705522] bg-[linear-gradient(180deg,rgba(232,196,108,0.16),rgba(28,23,14,0.98))] text-[#f0c76d]",
    accent: "text-[#f4deab]",
    dot: "bg-[#e8c46c]"
  },
  travel: {
    title: "移动时间",
    caption: "预留给往返路程或跨区移动，期间不可接单。",
    status: "blocked",
    tone: "border border-[#6f5236] bg-[linear-gradient(180deg,rgba(215,152,82,0.16),rgba(31,20,12,0.98))] text-[#f1b66f]",
    accent: "text-[#f6d0a3]",
    dot: "bg-[#e6a35a]"
  },
  expectedTravel: {
    title: "预计移动时间",
    caption: "系统预计需要预留的移动时间，确认后会转成正式移动时段。",
    status: "blocked",
    tone: "border border-dashed border-[#6f5236] bg-[linear-gradient(180deg,rgba(215,152,82,0.10),rgba(31,20,12,0.82))] text-[#f1b66f]",
    accent: "text-[#f6d0a3]",
    dot: "bg-[#e6a35a]"
  },
  break: {
    title: "休息时间",
    caption: "用于补休和恢复状态，期间暂停接单。",
    status: "blocked",
    tone: "border border-[#7d4a52] bg-[linear-gradient(180deg,rgba(217,118,130,0.14),rgba(28,17,20,0.98))] text-[#ff9fac]",
    accent: "text-[#ffc7ce]",
    dot: "bg-[#ff8f9f]"
  },
  expectedBreak: {
    title: "预计休息时间",
    caption: "系统预计需要补休的时段，确认后会转成正式休息时段。",
    status: "blocked",
    tone: "border border-dashed border-[#7d4a52] bg-[linear-gradient(180deg,rgba(217,118,130,0.10),rgba(28,17,20,0.82))] text-[#ff9fac]",
    accent: "text-[#ffc7ce]",
    dot: "bg-[#ff8f9f]"
  }
};

function formatPaymentMethodLabels(values: TechnicianPaymentOption[]) {
  if (values.length === 0) {
    return "未设置";
  }

  return paymentOptions.filter((option) => values.includes(option)).map((option) => paymentOptionLabels[option]).join("、");
}

function ScheduleSetupButtonIcon({
  type,
  className
}: {
  type: TechnicianScheduleSetupType;
  className?: string;
}) {
  if (type === "locked") {
    return (
      <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
        <path d="M8 10V7.5A4 4 0 0 1 12 3.5a4 4 0 0 1 4 4V10" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        <rect height="9" rx="2" stroke="currentColor" strokeWidth="2" width="12" x="6" y="10" />
        <circle cx="12" cy="14.5" fill="currentColor" r="1.3" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className={cn("h-5 w-5", className)} fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="2" />
      {type === "availability" ? (
        <path d="m8.8 12 2.2 2.3 4.4-4.7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
      ) : (
        <>
          <path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
        </>
      )}
    </svg>
  );
}

function parseDate(date: string) {
  return new Date(`${date}T00:00:00`);
}

function formatInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isValidInputDate(value?: string | null) {
  if (!value) {
    return false;
  }

  const parsed = parseDate(value);

  return !Number.isNaN(parsed.getTime()) && formatInputDate(parsed) === value;
}

function clockToMinutes(time: string) {
  const [hour = 0, minute = 0] = time.split(":").map(Number);

  return hour * 60 + minute;
}

function minutesToClock(minutes: number) {
  const clampedMinutes = Math.max(0, Math.min(23 * 60 + 59, minutes));
  const hour = Math.floor(clampedMinutes / 60);
  const minute = clampedMinutes % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function addClockMinutes(time: string, deltaMinutes: number) {
  return minutesToClock(clockToMinutes(time) + deltaMinutes);
}

function getDefaultSlotEndTime(hour: number) {
  return hour >= 23 ? "23:59" : `${String(hour + 1).padStart(2, "0")}:00`;
}

function addDays(date: string, amount: number) {
  const next = parseDate(date);
  next.setDate(next.getDate() + amount);

  return formatInputDate(next);
}

function getWeekDates(date: string) {
  return Array.from({ length: 7 }, (_, index) => addDays(date, index));
}

function getMonthGridDates(date: string) {
  const current = parseDate(date);
  const first = new Date(current.getFullYear(), current.getMonth(), 1);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = formatInputDate(new Date(current.getFullYear(), current.getMonth(), 1 - startOffset));

  return Array.from({ length: 35 }, (_, index) => addDays(gridStart, index));
}

function getRangeDates(date: string, scope: ScheduleScope) {
  if (scope === "week") {
    return getWeekDates(date);
  }

  if (scope === "month") {
    return Array.from({ length: 31 }, (_, index) => addDays(date, index));
  }

  return [date];
}

function overlapsHourRange(event: TechnicianScheduleEvent, hour: number) {
  const hourStart = hour * 60;
  const hourEnd = hourStart + 60;
  const startMinutes = clockToMinutes(event.startTime);
  const endMinutes = clockToMinutes(event.endTime);

  return startMinutes < hourEnd && endMinutes > hourStart;
}

function getVisibleTimelineHours(events: TechnicianScheduleEvent[], mode: DayTimelineDisplayMode) {
  if (mode === "all" || events.length === 0) {
    return Array.from({ length: 24 }, (_, hour) => hour);
  }

  return Array.from({ length: 24 }, (_, hour) => hour).filter((hour) => events.some((event) => overlapsHourRange(event, hour)));
}

function getTimelineBlockPosition(event: TechnicianScheduleEvent, visibleHours: number[], rowHeight: number) {
  const startMinutes = clockToMinutes(event.startTime);
  const endMinutes = clockToMinutes(event.endTime);
  let minutesBeforeStart = 0;
  let visibleMinutes = 0;

  visibleHours.forEach((hour) => {
    const hourStart = hour * 60;
    const hourEnd = hourStart + 60;
    if (hourEnd <= startMinutes) {
      minutesBeforeStart += 60;
      return;
    }

    if (hourStart >= endMinutes) {
      return;
    }

    if (hourStart < startMinutes && hourEnd > startMinutes) {
      minutesBeforeStart += startMinutes - hourStart;
    }

    const overlapStart = Math.max(startMinutes, hourStart);
    const overlapEnd = Math.min(endMinutes, hourEnd);
    const overlap = Math.max(0, overlapEnd - overlapStart);
    visibleMinutes += overlap;
  });

  if (visibleMinutes <= 0) {
    return null;
  }

  return {
    top: (minutesBeforeStart / 60) * rowHeight,
    height: Math.max((visibleMinutes / 60) * rowHeight, 44)
  };
}

function mergeTimeRanges(ranges: Array<{ start: number; end: number }>) {
  if (ranges.length === 0) {
    return [];
  }

  const sorted = [...ranges].sort((left, right) => left.start - right.start);
  const merged = [sorted[0]];

  sorted.slice(1).forEach((range) => {
    const last = merged[merged.length - 1];

    if (range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
      return;
    }

    merged.push({ ...range });
  });

  return merged;
}

function getConflictRangesByEvent(events: TechnicianScheduleEvent[]) {
  const conflictMap: Record<string, Array<{ start: number; end: number }>> = {};

  events.forEach((event, index) => {
    for (let nextIndex = index + 1; nextIndex < events.length; nextIndex += 1) {
      const other = events[nextIndex];
      const eventStart = clockToMinutes(event.startTime);
      const eventEnd = clockToMinutes(event.endTime);
      const otherStart = clockToMinutes(other.startTime);
      const otherEnd = clockToMinutes(other.endTime);
      const overlapStart = Math.max(eventStart, otherStart);
      const overlapEnd = Math.min(eventEnd, otherEnd);

      if (overlapEnd <= overlapStart) {
        continue;
      }

      conflictMap[event.id] = [...(conflictMap[event.id] ?? []), { start: overlapStart, end: overlapEnd }];
      conflictMap[other.id] = [...(conflictMap[other.id] ?? []), { start: overlapStart, end: overlapEnd }];
    }
  });

  return Object.fromEntries(
    Object.entries(conflictMap).map(([eventId, ranges]) => [eventId, mergeTimeRanges(ranges)])
  ) as Record<string, Array<{ start: number; end: number }>>;
}

function formatMinutesRange(start: number, end: number) {
  return `${minutesToClock(start)} - ${minutesToClock(end)}`;
}

function getDayTimelineEventCardClassName(event: TechnicianScheduleEvent, isNight: boolean) {
  if (event.planType === "availability" || event.status === "free") {
    return isNight
      ? "border-[#3e6aa0] bg-[#111a28] text-[#b3d2ff]"
      : "border-[#8ccfb8] bg-[#eef9f4] text-[#227a5a]";
  }

  if (event.planType === "leave") {
    return isNight
      ? "border-[#7d4a52] bg-[#2a161b] text-[#ffadb6]"
      : "border-[#efc1c6] bg-[#fff2f3] text-[#cf6572]";
  }

  if (event.planType === "locked") {
    return isNight
      ? "border-[#866a2f] bg-[#2a2112] text-[#f0c76d]"
      : "border-[#ead5a0] bg-[#fff8e7] text-[#ad8425]";
  }

  if (event.planType === "travel") {
    return isNight
      ? "border-[#8a6644] bg-[#2a1f12] text-[#f2bf82]"
      : "border-[#efc39b] bg-[#fff3e9] text-[#bc7335]";
  }

  if (event.planType === "expectedTravel") {
    return isNight
      ? "border-dashed border-[#8a6644] bg-[#241b12] text-[#f2bf82]"
      : "border-dashed border-[#efc39b] bg-[#fff8f0] text-[#bc7335]";
  }

  if (event.planType === "break") {
    return isNight
      ? "border-[#82576a] bg-[#27161d] text-[#ffb7c8]"
      : "border-[#edc5d3] bg-[#fff3f7] text-[#c76d8a]";
  }

  if (event.planType === "expectedBreak") {
    return isNight
      ? "border-dashed border-[#82576a] bg-[#23171b] text-[#ffb7c8]"
      : "border-dashed border-[#edc5d3] bg-[#fff8fb] text-[#c76d8a]";
  }

  return isNight
    ? "border-[#51401c] bg-[#19130a] text-[#f0d89e]"
    : "border-[#dbe8e2] bg-white text-ink";
}

function getDayTimelineEventStatusTone(event: TechnicianScheduleEvent) {
  if (event.planType === "leave") {
    return "red";
  }

  if (event.planType === "availability" || event.status === "free") {
    return "blue";
  }

  if (event.planType === "travel" || event.planType === "expectedTravel") {
    return "yellow";
  }

  if (event.planType === "break" || event.planType === "expectedBreak") {
    return "red";
  }

  if (event.status === "blocked") {
    return "neutral";
  }

  return "yellow";
}

function groupScheduleEventsByDate(events: TechnicianScheduleEvent[]) {
  const grouped = new Map<string, TechnicianScheduleEvent[]>();

  events.forEach((event) => {
    const existing = grouped.get(event.date) ?? [];
    existing.push(event);
    grouped.set(event.date, existing);
  });

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, dateEvents]) => ({
      date,
      events: [...dateEvents].sort((left, right) => left.startTime.localeCompare(right.startTime))
    }));
}

function getLocalizedWeekday(date: string, language: Language) {
  const weekdayIndex = (parseDate(date).getDay() + 6) % 7;
  const weekdayMap: Record<Language, string[]> = {
    zh: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
    "zh-Hant": ["週一", "週二", "週三", "週四", "週五", "週六", "週日"],
    ja: ["月", "火", "水", "木", "金", "土", "日"],
    en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    ko: ["월", "화", "수", "목", "금", "토", "일"]
  };

  return weekdayMap[language][weekdayIndex];
}

function getLocalizedWeekdayHeaders(language: Language) {
  const weekdayHeaderMap: Record<Language, string[]> = {
    zh: ["一", "二", "三", "四", "五", "六", "日"],
    "zh-Hant": ["一", "二", "三", "四", "五", "六", "日"],
    ja: ["月", "火", "水", "木", "金", "土", "日"],
    en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    ko: ["월", "화", "수", "목", "금", "토", "일"]
  };

  return weekdayHeaderMap[language];
}

function formatDisplayDate(date: string, language: Language = "ja") {
  const current = parseDate(date);
  const month = String(current.getMonth() + 1).padStart(2, "0");
  const day = String(current.getDate()).padStart(2, "0");

  return `${month}/${day}(${getLocalizedWeekday(date, language)})`;
}

function parseScheduleDateTime(value: string) {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const withSeconds = normalized.length === 16 ? `${normalized}:00` : normalized;

  return new Date(withSeconds);
}

function getScheduleCountdown(targetTime: string, referenceTime: string, language: Language): { label: string; tone: BadgeTone } {
  const target = parseScheduleDateTime(targetTime);
  const reference = parseScheduleDateTime(referenceTime);

  if (Number.isNaN(target.getTime()) || Number.isNaN(reference.getTime())) {
    return {
      label: {
        zh: "时间待确认",
        "zh-Hant": "時間待確認",
        ja: "時刻確認待ち",
        en: "Time to confirm",
        ko: "시간 확인 대기"
      }[language],
      tone: "neutral"
    };
  }

  const diffMinutes = Math.round((target.getTime() - reference.getTime()) / 60000);
  const absoluteMinutes = Math.abs(diffMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  const parts = [];

  if (hours > 0) {
    parts.push(
      {
        zh: `${hours}小时`,
        "zh-Hant": `${hours}小時`,
        ja: `${hours}時間`,
        en: `${hours}h`,
        ko: `${hours}시간`
      }[language]
    );
  }

  if (minutes > 0 || parts.length === 0) {
    parts.push(
      {
        zh: `${minutes}分钟`,
        "zh-Hant": `${minutes}分鐘`,
        ja: `${minutes}分`,
        en: `${minutes}m`,
        ko: `${minutes}분`
      }[language]
    );
  }

  if (diffMinutes > 0) {
    return {
      label:
        language === "en"
          ? `${parts.join(" ")} later`
          : language === "ko"
            ? `${parts.join(" ")} 후`
            : `${parts.join("")}${language === "ja" ? "後" : language === "zh-Hant" ? "後" : "后"}`,
      tone: diffMinutes <= 60 ? "yellow" : "blue"
    };
  }

  if (diffMinutes < 0) {
    return {
      label:
        language === "en"
          ? `${parts.join(" ")} ago`
          : language === "ja"
            ? `${parts.join("")}経過`
            : language === "ko"
              ? `${parts.join(" ")} 지남`
              : language === "zh-Hant"
                ? `已過${parts.join("")}`
              : `已过${parts.join("")}`,
      tone: "neutral"
    };
  }

  return {
    label: {
      zh: "即将开始",
      "zh-Hant": "即將開始",
      ja: "まもなく開始",
      en: "Starting soon",
      ko: "곧 시작"
    }[language],
    tone: "red"
  };
}

function getTaskPanelBadgeClassName(tone: BadgeTone) {
  switch (tone) {
    case "green":
      return "border border-[color:color-mix(in_srgb,var(--client-primary)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_16%,transparent)] text-[color:color-mix(in_srgb,var(--client-primary-strong)_34%,white)]";
    case "yellow":
      return "border border-[color:color-mix(in_srgb,var(--client-warning)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--client-warning)_18%,transparent)] text-[color:var(--client-warning-text)]";
    case "red":
      return "border border-[color:color-mix(in_srgb,var(--client-accent)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--client-accent)_16%,transparent)] text-[color:color-mix(in_srgb,var(--client-accent)_28%,white)]";
    case "blue":
      return "border border-[color:color-mix(in_srgb,var(--client-warm)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--client-warm)_14%,transparent)] text-[color:color-mix(in_srgb,var(--client-warm)_30%,white)]";
    case "dark":
      return "bg-white text-[#090806]";
    case "neutral":
    default:
      return "border border-white/10 bg-white/10 text-white/78";
  }
}

function googleRouteUrl(destination: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=transit`;
}

function getSchedulePhase(date: string) {
  if (date < todayDate) {
    return "历史";
  }

  if (date > todayDate) {
    return "未来";
  }

  return "今天";
}

function getScheduleStatusLabel(event: TechnicianScheduleEvent) {
  if (event.planType) {
    return technicianPlanMeta[event.planType].title;
  }

  if (event.status === "free") {
    return "可接单";
  }

  if (event.status === "blocked") {
    return "不可排";
  }

  return event.date < todayDate ? "已完成" : "已预约";
}

function isEstimatedSchedulePlanType(planType?: TechnicianPlanType) {
  return planType === "expectedTravel" || planType === "expectedBreak";
}

function getConfirmedPlanType(planType: TechnicianPlanType) {
  return planType === "expectedTravel" ? "travel" : "break";
}

function getEventDurationHours(event: TechnicianScheduleEvent) {
  const [startHour, startMinute] = event.startTime.split(":").map(Number);
  const [endHour, endMinute] = event.endTime.split(":").map(Number);

  return Math.max(0.5, (endHour * 60 + endMinute - (startHour * 60 + startMinute)) / 60);
}

function getWorkDetailEvents(events: TechnicianScheduleEvent[], scope: WorkDetailScope, anchorDate: string) {
  const validDates = new Set(getRangeDates(anchorDate, scope));

  return events
    .filter((event) => validDates.has(event.date))
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
}

function getWorkTrendLabel(date: string) {
  const current = parseDate(date);
  const month = String(current.getMonth() + 1);
  const day = String(current.getDate());
  const weekday = getLocalizedWeekdayHeaders("zh")[(current.getDay() + 6) % 7];

  return {
    label: `${month}/${day}`,
    subLabel: `（${weekday}）`
  };
}

function getWorkTrendPoints(events: TechnicianScheduleEvent[], scope: WorkDetailScope, anchorDate: string): WorkTrendPoint[] {
  if (scope === "day") {
    return Array.from({ length: 24 }, (_, hour): WorkTrendPoint => {
      const bucketEvents = events.filter((event) => Number(event.startTime.slice(0, 2)) === hour);

      return {
        key: `${anchorDate}-${hour}`,
        label: `${String(hour).padStart(2, "0")}:00`,
        subLabel: undefined,
        income: bucketEvents.reduce((sum, event) => sum + event.amount, 0),
        hours: bucketEvents.reduce((sum, event) => sum + getEventDurationHours(event), 0),
        jobs: bucketEvents.filter((event) => event.status === "booked").length,
        future: anchorDate > todayDate
      };
    });
  }

  return getRangeDates(anchorDate, scope).map((date) => {
    const bucketEvents = events.filter((event) => event.date === date);
    const trendLabel = getWorkTrendLabel(date);

    return {
      key: date,
      ...trendLabel,
      income: bucketEvents.reduce((sum, event) => sum + event.amount, 0),
      hours: bucketEvents.reduce((sum, event) => sum + getEventDurationHours(event), 0),
      jobs: bucketEvents.filter((event) => event.status === "booked").length,
      future: date > todayDate
    };
  });
}

function buildTrendPolyline(points: WorkTrendPoint[], values: number[], width: number, height: number, left: number, top: number, bottom: number) {
  const maxValue = Math.max(...values, 1);
  const usableHeight = height - top - bottom;
  const usableWidth = width - left - 18;
  const step = points.length > 1 ? usableWidth / (points.length - 1) : 0;

  return points.map((point, index) => {
    const value = values[index] ?? 0;
    const x = left + step * index;
    const y = top + usableHeight - (value / maxValue) * usableHeight;

    return `${x},${y}`;
  }).join(" ");
}

function splitTrendPoints(points: WorkTrendPoint[]) {
  const firstFutureIndex = points.findIndex((point) => point.future);

  if (firstFutureIndex === -1) {
    return { solid: points, dashed: [] as WorkTrendPoint[] };
  }

  if (firstFutureIndex === 0) {
    return { solid: [] as WorkTrendPoint[], dashed: points };
  }

  return {
    solid: points.slice(0, firstFutureIndex),
    dashed: points.slice(firstFutureIndex - 1)
  };
}

function getTrendLabelInterval(pointCount: number, compact = false) {
  if (pointCount <= (compact ? 8 : 10)) {
    return 1;
  }

  if (pointCount <= 16) {
    return 2;
  }

  return compact ? 4 : 3;
}

function shouldShowTrendLabel(pointCount: number, index: number, compact = false) {
  const interval = getTrendLabelInterval(pointCount, compact);

  return interval === 1 || index === 0 || index === pointCount - 1 || index % interval === 0;
}

function getWorkTrendTooltipDetail(point: WorkTrendPoint) {
  return `${point.label}${point.subLabel ?? ""}${point.jobs > 0 ? ` · ${point.jobs}单` : ""}`;
}

function WorkTrendChart({
  title,
  color,
  points,
  valueKey,
  formatter
}: {
  title: string;
  color: string;
  points: WorkTrendPoint[];
  valueKey: "income" | "hours";
  formatter: (value: number) => string;
}) {
  const values = points.map((point) => point[valueKey]);
  const maxValue = Math.max(...values, 1);
  const width = Math.max(360, points.length * (valueKey === "income" ? 34 : 30));
  const height = 192;
  const left = 22;
  const top = 18;
  const bottom = points.some((point) => point.subLabel) ? 48 : 34;
  const pointGroups = splitTrendPoints(points);
  const solidValues = pointGroups.solid.map((point) => point[valueKey]);
  const dashedValues = pointGroups.dashed.map((point) => point[valueKey]);
  const solidPolyline = pointGroups.solid.length > 0 ? buildTrendPolyline(pointGroups.solid, solidValues, width, height, left, top, bottom) : "";
  const dashedPolyline = pointGroups.dashed.length > 0 ? buildTrendPolyline(pointGroups.dashed, dashedValues, width, height, left, top, bottom) : "";
  const usableHeight = height - top - bottom;
  const usableWidth = width - left - 18;
  const step = points.length > 1 ? usableWidth / (points.length - 1) : 0;
  const [activePoint, setActivePoint] = useState<ChartPointerState | null>(null);
  const [pointerDown, setPointerDown] = useState(false);
  const activeIndex = activePoint?.index ?? -1;
  const activeTrendPoint = activeIndex >= 0 ? points[activeIndex] : undefined;
  const activeValue = activeIndex >= 0 ? values[activeIndex] : undefined;
  const updateActivePoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const nextPoint = resolveChartPointerState(event, {
      width,
      height,
      pointCount: points.length,
      xFor: (index) => left + step * index
    });

    if (nextPoint) {
      setActivePoint(nextPoint);
    }
  };

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <TitleWithInfo
          as="h3"
          info="历史数据为实线，未来安排为虚线。"
          label={`${title}说明`}
          title={title}
          titleClassName="font-black"
          variant="paper"
        />
        <Badge tone="neutral">{formatter(maxValue)} 峰值</Badge>
      </div>
      <div className="relative mt-3 min-w-0">
        <svg
          className="h-[192px] w-full cursor-crosshair select-none overflow-visible"
          onPointerCancel={(event) => {
            setPointerDown(false);
            event.currentTarget.releasePointerCapture?.(event.pointerId);
          }}
          onPointerDown={(event) => {
            setPointerDown(true);
            event.currentTarget.setPointerCapture?.(event.pointerId);
            updateActivePoint(event);
          }}
          onPointerLeave={() => {
            if (!pointerDown) {
              setActivePoint(null);
            }
          }}
          onPointerMove={(event) => {
            if (pointerDown || event.pointerType === "mouse") {
              updateActivePoint(event);
            }
          }}
          onPointerUp={(event) => {
            setPointerDown(false);
            event.currentTarget.releasePointerCapture?.(event.pointerId);
            updateActivePoint(event);
          }}
          preserveAspectRatio="none"
          style={{ touchAction: "pan-y" }}
          viewBox={`0 0 ${width} ${height}`}
        >
          <rect fill="transparent" height={height} width={width} x="0" y="0" />
          {Array.from({ length: 4 }, (_, index) => {
            const y = top + (usableHeight / 3) * index;

            return <line key={index} stroke="rgba(32,38,56,0.08)" strokeDasharray="4 4" strokeWidth="1" x1={left} x2={width - 18} y1={y} y2={y} />;
          })}
          {points.map((point, index) => {
            if (!shouldShowTrendLabel(points.length, index)) {
              return null;
            }

            const x = left + step * index;

            return (
              <line
                key={`${point.key}-guide`}
                stroke="rgba(32,38,56,0.1)"
                strokeDasharray="4 5"
                strokeWidth="1"
                x1={x}
                x2={x}
                y1={top}
                y2={height - bottom + 4}
              />
            );
          })}
          {solidPolyline ? <polyline fill="none" points={solidPolyline} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" /> : null}
          {dashedPolyline ? <polyline fill="none" points={dashedPolyline} stroke={color} strokeDasharray="8 7" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8" strokeWidth="3" /> : null}
          {activeTrendPoint && activeValue !== undefined ? (
            <line
              stroke={color}
              strokeDasharray="4 5"
              strokeOpacity="0.45"
              strokeWidth="1.4"
              x1={left + step * activeIndex}
              x2={left + step * activeIndex}
              y1={top}
              y2={height - bottom + 4}
            />
          ) : null}
          {points.map((point, index) => {
            const value = point[valueKey];
            const x = left + step * index;
            const y = top + usableHeight - (value / maxValue) * usableHeight;
            const showLabel = shouldShowTrendLabel(points.length, index);
            const textAnchor = index === 0 ? "start" : index === points.length - 1 ? "end" : "middle";

            return (
              <g key={point.key}>
                <circle cx={x} cy={y} fill="#ffffff" r="5" stroke={color} strokeWidth="2.5" />
                {showLabel ? (
                  <>
                    <text fill="rgba(23,24,23,0.5)" fontSize="9" fontWeight="800" textAnchor={textAnchor} x={x} y={height - (point.subLabel ? 22 : 10)}>
                      {point.label}
                    </text>
                    {point.subLabel ? (
                      <text fill="rgba(23,24,23,0.42)" fontSize="8.5" fontWeight="800" textAnchor={textAnchor} x={x} y={height - 9}>
                        {point.subLabel}
                      </text>
                    ) : null}
                  </>
                ) : null}
              </g>
            );
          })}
          {activeTrendPoint && activeValue !== undefined ? (
            <circle
              cx={left + step * activeIndex}
              cy={top + usableHeight - (activeValue / maxValue) * usableHeight}
              fill={color}
              r="7"
              stroke="#ffffff"
              strokeWidth="3"
            />
          ) : null}
        </svg>
        <ChartPointerTooltip
          items={
            activeTrendPoint && activeValue !== undefined
              ? [
                  {
                    color,
                    detail: getWorkTrendTooltipDetail(activeTrendPoint),
                    label: valueKey === "income" ? "金额" : "工时",
                    value: formatter(activeValue)
                  }
                ]
              : []
          }
          state={activePoint}
          strategy="fixed"
        />
      </div>
    </section>
  );
}

function CompactWorkTrendPreview({
  label,
  color,
  points,
  valueKey,
  formatter,
  className,
  isNight = false
}: {
  label: string;
  color: string;
  points: WorkTrendPoint[];
  valueKey: "income" | "hours";
  formatter: (value: number) => string;
  className?: string;
  isNight?: boolean;
}) {
  const values = points.map((point) => point[valueKey]);
  const maxValue = Math.max(...values, 1);
  const width = Math.max(points.length > 10 ? 340 : 300, points.length * (valueKey === "income" ? 28 : 26));
  const height = 136;
  const left = 14;
  const top = 14;
  const bottom = points.some((point) => point.subLabel) ? 40 : 28;
  const pointGroups = splitTrendPoints(points);
  const solidValues = pointGroups.solid.map((point) => point[valueKey]);
  const dashedValues = pointGroups.dashed.map((point) => point[valueKey]);
  const solidPolyline = pointGroups.solid.length > 0 ? buildTrendPolyline(pointGroups.solid, solidValues, width, height, left, top, bottom) : "";
  const dashedPolyline = pointGroups.dashed.length > 0 ? buildTrendPolyline(pointGroups.dashed, dashedValues, width, height, left, top, bottom) : "";
  const usableHeight = height - top - bottom;
  const usableWidth = width - left - 14;
  const step = points.length > 1 ? usableWidth / (points.length - 1) : 0;
  const labelColor = isNight ? "rgba(255,255,255,0.5)" : "rgba(23,24,23,0.48)";
  const gridStroke = isNight ? "rgba(255,255,255,0.12)" : "rgba(32,38,56,0.12)";
  const pointFill = isNight ? "#0f1211" : "#ffffff";
  const [activePoint, setActivePoint] = useState<ChartPointerState | null>(null);
  const [pointerDown, setPointerDown] = useState(false);
  const activeIndex = activePoint?.index ?? -1;
  const activeTrendPoint = activeIndex >= 0 ? points[activeIndex] : undefined;
  const activeValue = activeIndex >= 0 ? values[activeIndex] : undefined;
  const updateActivePoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const nextPoint = resolveChartPointerState(event, {
      width,
      height,
      pointCount: points.length,
      xFor: (index) => left + step * index
    });

    if (nextPoint) {
      setActivePoint(nextPoint);
    }
  };

  return (
    <div
      className={cn(
        "min-w-0 max-w-full overflow-visible rounded-[20px] border px-3 py-3",
        isNight
          ? "border-transparent bg-[linear-gradient(180deg,rgba(19,24,23,0.96),rgba(14,18,17,0.98))]"
          : "border-line bg-white",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={cn("text-[11px] font-bold", isNight ? "text-white/55" : "text-ink/48")}>{label}</p>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black",
            isNight ? "bg-white/8 text-white/78" : "bg-black/5 text-ink/72"
          )}
        >
          {formatter(maxValue)} 峰值
        </span>
      </div>
      <div className="relative mt-3 min-w-0">
        <svg
          className="h-[136px] w-full cursor-crosshair select-none overflow-visible"
          onClick={(event) => event.stopPropagation()}
          onPointerCancel={(event) => {
            setPointerDown(false);
            event.currentTarget.releasePointerCapture?.(event.pointerId);
          }}
          onPointerDown={(event) => {
            setPointerDown(true);
            event.currentTarget.setPointerCapture?.(event.pointerId);
            updateActivePoint(event);
          }}
          onPointerLeave={() => {
            if (!pointerDown) {
              setActivePoint(null);
            }
          }}
          onPointerMove={(event) => {
            if (pointerDown || event.pointerType === "mouse") {
              updateActivePoint(event);
            }
          }}
          onPointerUp={(event) => {
            setPointerDown(false);
            event.currentTarget.releasePointerCapture?.(event.pointerId);
            updateActivePoint(event);
          }}
          preserveAspectRatio="none"
          style={{ touchAction: "pan-y" }}
          viewBox={`0 0 ${width} ${height}`}
        >
          <rect fill="transparent" height={height} width={width} x="0" y="0" />
          {Array.from({ length: 3 }, (_, index) => {
            const y = top + (usableHeight / 2) * index;

            return <line key={index} stroke={gridStroke} strokeDasharray="4 4" strokeWidth="1" x1={left} x2={width - 14} y1={y} y2={y} />;
          })}
          {points.map((point, index) => {
            if (!shouldShowTrendLabel(points.length, index, true)) {
              return null;
            }

            const x = left + step * index;

            return (
              <line
                key={`${point.key}-guide`}
                stroke={gridStroke}
                strokeDasharray="4 5"
                strokeWidth="1"
                x1={x}
                x2={x}
                y1={top}
                y2={height - bottom + 4}
              />
            );
          })}
          {solidPolyline ? <polyline fill="none" points={solidPolyline} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" /> : null}
          {dashedPolyline ? <polyline fill="none" points={dashedPolyline} stroke={color} strokeDasharray="8 7" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.82" strokeWidth="3.5" /> : null}
          {activeTrendPoint && activeValue !== undefined ? (
            <line
              stroke={color}
              strokeDasharray="4 5"
              strokeOpacity="0.48"
              strokeWidth="1.4"
              x1={left + step * activeIndex}
              x2={left + step * activeIndex}
              y1={top}
              y2={height - bottom + 4}
            />
          ) : null}
          {points.map((point, index) => {
            const value = point[valueKey];
            const x = left + step * index;
            const y = top + usableHeight - (value / maxValue) * usableHeight;
            const showLabel = shouldShowTrendLabel(points.length, index, true);
            const textAnchor = index === 0 ? "start" : index === points.length - 1 ? "end" : "middle";

            return (
              <g key={point.key}>
                <circle cx={x} cy={y} fill={pointFill} r="4.5" stroke={color} strokeWidth="2.5" />
                {showLabel ? (
                  <>
                    <text fill={labelColor} fontSize="8.5" fontWeight="800" textAnchor={textAnchor} x={x} y={height - (point.subLabel ? 20 : 10)}>
                      {point.label}
                    </text>
                    {point.subLabel ? (
                      <text fill={labelColor} fontSize="8" fontWeight="800" opacity="0.88" textAnchor={textAnchor} x={x} y={height - 8}>
                        {point.subLabel}
                      </text>
                    ) : null}
                  </>
                ) : null}
              </g>
            );
          })}
          {activeTrendPoint && activeValue !== undefined ? (
            <circle
              cx={left + step * activeIndex}
              cy={top + usableHeight - (activeValue / maxValue) * usableHeight}
              fill={color}
              r="6.4"
              stroke={isNight ? "#0f1211" : "#ffffff"}
              strokeWidth="3"
            />
          ) : null}
        </svg>
        <ChartPointerTooltip
          dark={isNight}
          items={
            activeTrendPoint && activeValue !== undefined
              ? [
                  {
                    color,
                    detail: getWorkTrendTooltipDetail(activeTrendPoint),
                    label: valueKey === "income" ? "金额" : "工时",
                    value: formatter(activeValue)
                  }
                ]
              : []
          }
          state={activePoint}
          strategy="fixed"
        />
      </div>
    </div>
  );
}

function WorkStatisticsCard({
  mode,
  description,
  income,
  completedCount,
  hours,
  availableCount,
  trendPoints,
  scope,
  onClick,
  active,
  footer,
  isNight = false
}: {
  mode: TechWorkMode;
  description: string;
  income: number;
  completedCount: number;
  hours: number;
  availableCount: number;
  trendPoints: WorkTrendPoint[];
  scope: WorkDetailScope;
  onClick: () => void;
  active?: boolean;
  footer: string;
  isNight?: boolean;
}) {
  const color = mode === "store" ? "var(--client-primary)" : "var(--client-warm)";
  const accentClassName =
    isNight
      ? mode === "store"
        ? "border-[color:color-mix(in_srgb,var(--client-primary)_24%,transparent)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--client-surface)_82%,transparent),color-mix(in_srgb,var(--client-bg)_86%,var(--client-primary)_14%))]"
        : "border-[color:color-mix(in_srgb,var(--client-warm)_24%,transparent)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--client-surface)_82%,transparent),color-mix(in_srgb,var(--client-bg)_86%,var(--client-warm)_14%))]"
      : mode === "store"
        ? "border-[color:color-mix(in_srgb,var(--client-primary)_24%,transparent)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--client-surface)_90%,var(--client-primary)_10%),color-mix(in_srgb,white_94%,var(--client-primary)_6%))]"
        : "border-[color:color-mix(in_srgb,var(--client-warm)_24%,transparent)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--client-surface)_90%,var(--client-warm)_10%),color-mix(in_srgb,white_94%,var(--client-warm)_6%))]";
  const scopePrefix = scope === "day" ? "当日" : scope === "week" ? "本周" : "本月";
  const chartSurfaceClassName =
    isNight
      ? mode === "store"
        ? "border-[color:color-mix(in_srgb,var(--client-primary)_16%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--client-surface)_76%,transparent),color-mix(in_srgb,var(--client-bg)_94%,transparent))]"
        : "border-[color:color-mix(in_srgb,var(--client-warm)_16%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--client-surface)_76%,transparent),color-mix(in_srgb,var(--client-bg)_94%,transparent))]"
      : mode === "store"
        ? "border-[color:color-mix(in_srgb,var(--client-primary)_16%,transparent)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),color-mix(in_srgb,white_92%,var(--client-primary)_8%))]"
        : "border-[color:color-mix(in_srgb,var(--client-warm)_16%,transparent)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),color-mix(in_srgb,white_92%,var(--client-warm)_8%))]";

  return (
    <button
      className={cn(
        "min-w-0 w-full max-w-full overflow-hidden rounded-[28px] border p-3 text-left shadow-panel transition sm:p-4",
        active
          ? accentClassName
          : isNight
            ? "border-transparent bg-[linear-gradient(145deg,rgba(15,18,18,0.98),rgba(18,21,21,0.96),rgba(13,15,15,0.98))] hover:shadow-[0_22px_38px_rgba(0,0,0,0.22)]"
            : "border-line bg-white hover:shadow-[0_22px_38px_rgba(0,0,0,0.08)]"
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          <h3 className={cn("text-[18px] font-black tracking-[-0.03em]", isNight ? "text-white" : "text-ink")}>{workModeLabels[mode]}</h3>
          <p className={cn("mt-1 text-xs leading-5", isNight ? "text-white/60" : "text-ink/55")}>{description}</p>
        </div>
        <span
          className={cn(
            "w-fit rounded-full px-3 py-1 text-[11px] font-black",
            active
              ? mode === "store"
                ? "bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] text-[color:var(--client-primary-strong)]"
                : "bg-[color:color-mix(in_srgb,var(--client-warm)_14%,transparent)] text-[color:var(--client-warm)]"
              : isNight
                ? "bg-white/8 text-white/72"
                : "bg-black/5 text-ink/48"
          )}
        >
          {active ? "当前查看" : "查看详情"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["收入", yen(income)],
          ["单量", String(completedCount)],
          ["工时", `${hours.toFixed(1)}h`],
          ["可排", `${availableCount}段`]
        ].map(([label, value]) => (
          <div
            className={cn(
              "min-w-0 rounded-[20px] border px-3 py-3",
              isNight ? "border-transparent bg-white/[0.05]" : "border-black/5 bg-white/80"
            )}
            key={label}
          >
            <p className={cn("text-[11px] font-bold", isNight ? "text-white/48" : "text-ink/45")}>{label}</p>
            <strong className={cn("mt-1 block truncate text-[15px] font-black tracking-[-0.03em] sm:text-base", isNight ? "text-white" : "text-ink")}>
              {value}
            </strong>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3">
        <CompactWorkTrendPreview
          className={cn("shadow-none", chartSurfaceClassName)}
          color={color}
          formatter={(value) => yen(value)}
          isNight={isNight}
          label={`${scopePrefix}收入趋势`}
          points={trendPoints}
          valueKey="income"
        />
        <CompactWorkTrendPreview
          className={cn("shadow-none", chartSurfaceClassName)}
          color={color}
          formatter={(value) => `${value.toFixed(1)}h`}
          isNight={isNight}
          label={`${scopePrefix}工时趋势`}
          points={trendPoints}
          valueKey="hours"
        />
      </div>

      <div
        className={cn(
          "mt-3 rounded-[20px] border px-3 py-3 text-xs leading-5",
          isNight ? "border-transparent bg-white/[0.04] text-white/70" : "border-black/5 bg-white/74 text-ink/58"
        )}
      >
        {footer}
      </div>
    </button>
  );
}

function getTechnicianView(view?: string): TechnicianView {
  if (view === "jobs") {
    return "me";
  }

  if (view === "work-detail") {
    return "workDetail";
  }

  if (view === "schedule" || view === "moments" || view === "contacts" || view === "messages" || view === "me") {
    return view;
  }

  return "tasks";
}

function getRouteWorkMode(_value?: string | null): TechWorkMode {
  return "store";
}

function getTechnicianMeTab(value?: string | null): TechnicianMeTab {
  if (value === "data") {
    return value;
  }

  return "info";
}

function getRouteWorkDetailScope(value?: string | null): WorkDetailScope {
  if (value === "day" || value === "month") {
    return value;
  }

  return "week";
}

function getDefaultAreaSelection() {
  const country = "日本";
  const prefecture = Object.keys(serviceAreaCatalog[country])[0] as keyof typeof serviceAreaCatalog["日本"];
  const area = serviceAreaCatalog[country][prefecture][0];

  return {
    country,
    prefecture,
    area
  };
}

function getDefaultLineSelection() {
  const line = "山手線";
  const station = railLineCatalog[line][0];

  return {
    line,
    stations: [station]
  };
}

function simplifyServiceArea(area: string) {
  return area.split(" / ").filter(Boolean).pop() ?? area;
}

function buildTechnicianProfile(baseTech: TechnicianProfileSource, storeName: string): TechnicianProfile {
  const nicknameFallback = baseTech.name.split(" ").slice(-1)[0] || baseTech.name;
  const normalizedServiceAreas = Array.from(
    new Set(
      (baseTech.serviceAreas.length ? baseTech.serviceAreas : ["銀座", "新宿", "新宿駅"]).map((area) => simplifyServiceArea(area))
    )
  );

  return {
    nickname: baseTech.nickname?.trim() || nicknameFallback,
    legalName: baseTech.name,
    avatar: baseTech.avatar,
    gallery: [...(baseTech.gallery ?? [])],
    identityLabel: baseTech.identityLabel ?? "店铺所属技师",
    age: baseTech.age ?? "25",
    height: baseTech.height ?? "164cm",
    bio:
      baseTech.bio ??
      `擅长肩颈调理和睡眠放松，可 ${storeName ? "日本語 / 中文" : ""}沟通。店铺工作由 ${storeName} 管理，退勤后的预约自动进入个人工单清单。`,
    languages: [...baseTech.languages],
    tags: [...(baseTech.profileTags ?? ["💆 肩颈调理", "🪷 深层舒缓", "🤝 亲和", "🗾 日本語", "🀄 中文"])],
    serviceAreas: normalizedServiceAreas,
    canServeForeigners: baseTech.canServeForeigners ?? true,
    bidBudgetMin: baseTech.bidBudgetMin ?? "12000",
    bidBudgetMax: baseTech.bidBudgetMax ?? "28000",
    paymentMethods: [...(baseTech.paymentMethods?.length ? baseTech.paymentMethods : (["platform", "offline"] satisfies TechnicianPaymentOption[]))]
  };
}

function buildTechnicianProfileDraft(
  profile: TechnicianProfile,
  visibility: "privateAll" | "limited" | "network",
  defaultAreaSelection: { country: string; prefecture: string; area: string },
  defaultLineSelection: { line: string; stations: string[] }
): TechnicianProfileDraft {
  return {
    nickname: profile.nickname,
    avatar: profile.avatar,
    gallery: [...profile.gallery],
    identityLabel: profile.identityLabel,
    age: profile.age,
    height: profile.height,
    bio: profile.bio,
    selectedCountry: defaultAreaSelection.country,
    selectedPrefecture: defaultAreaSelection.prefecture,
    selectedArea: defaultAreaSelection.area,
    selectedLine: defaultLineSelection.line,
    selectedStations: [...defaultLineSelection.stations],
    languages: [...profile.languages],
    tags: [...profile.tags],
    serviceAreas: [...profile.serviceAreas],
    canServeForeigners: profile.canServeForeigners,
    bidBudgetMin: profile.bidBudgetMin,
    bidBudgetMax: profile.bidBudgetMax,
    paymentMethods: [...profile.paymentMethods],
    visibility
  };
}

function getVisibilityLabel(visibility: TechnicianProfileDraft["visibility"]) {
  switch (visibility) {
    case "limited":
      return "仅对指定对象可见";
    case "network":
      return "仅对指定对象及关联可见";
    default:
      return "完全隐私模式";
  }
}

function buildTechnicianKycDraft(profile: TechnicianProfile): TechnicianKycDraft {
  return {
    surname: "",
    givenName: "",
    surnameKana: "",
    givenKana: "",
    birthYear: "1998",
    birthMonth: "04",
    birthDay: "15",
    email: "admin@lifedance.jp",
    phone: "09012345678",
    documentType: "none",
    idFrontPreview: "",
    idFrontName: "",
    idBackPreview: "",
    idBackName: "",
    selfiePreview: profile.avatar,
    selfieName: "",
    agreed: false
  };
}

function getKycCopy(language: Language) {
  const documentTypeLabels: Record<KycDocumentTypeValue, string> = language === "ja"
    ? {
        none: "証明書の種類を選択",
        driverLicense: "運転免許証",
        myNumberFront: "マイナンバーカード（表面）",
        passport: "パスポート",
        residentCard: "写真付き住民基本台帳カード",
        residenceCard: "在留カード / 特別永住者証明書",
        studentId: "学生証（写真と氏名が鮮明なもの）"
      }
    : language === "en"
      ? {
          none: "Select document type",
          driverLicense: "Driver's license",
          myNumberFront: "My Number card (front)",
          passport: "Passport",
        residentCard: "Resident Basic Register card with photo",
        residenceCard: "Residence card / special permanent resident certificate",
        studentId: "Student ID (clear photo and name)"
      }
    : language === "ko"
      ? {
          none: "신분증 종류를 선택하세요",
          driverLicense: "운전면허증",
          myNumberFront: "마이넘버 카드(앞면)",
          passport: "여권",
          residentCard: "사진이 있는 주민기본대장 카드",
          residenceCard: "재류카드 / 특별영주자증명서",
          studentId: "학생증(사진과 이름이 선명한 것)"
        }
    : {
        none: "请选择证件类型",
        driverLicense: "驾驶证",
        myNumberFront: "个人号码卡（正面）",
          passport: "护照",
          residentCard: "带照片住民基本台账卡",
          residenceCard: "在留卡 / 特别永住者证明书",
          studentId: "学生证（照片与姓名清晰）"
        };

  return language === "ja"
    ? {
        documentTypeLabels,
        subtitle: "本人確認資料提出",
        title: "証明書アップロード",
        basicInfo: "基本情報",
        required: "必須",
        confirm: "確認",
        surnamePlaceholder: "例：佐藤",
        givenNamePlaceholder: "例：美咲",
        surnameKanaPlaceholder: "サトウ",
        givenKanaPlaceholder: "ミサキ",
        surname: "姓（漢字）",
        givenName: "名（漢字）",
        surnameKana: "フリガナ（姓）",
        givenKana: "フリガナ（名）",
        birthDate: "生年月日",
        yearSuffix: "年",
        monthSuffix: "月",
        daySuffix: "日",
        email: "メールアドレス",
        phone: "電話番号",
        identitySection: "本人確認資料",
        identityHint: "証明書の表面・裏面、そして本人が証明書を持っている写真をアップロードしてください。jpg / png 推奨、各 10MB 以内。",
        frontCardTitle: "証明書表面",
        frontCardHint: "クリックして表面をアップロード",
        backCardTitle: "証明書裏面",
        backCardHint: "クリックして裏面をアップロード",
        selfieCardTitle: "証明書 + 本人写真",
        selfieCardHint: "クリックして本人持ち写真をアップロード",
        selfieDefaultName: "現在のプロフィール画像",
        documentTypeLabel: "身分証明書の種類",
        agreementTitle: "利用規約確認",
        agreementHint: "提出前に本人確認資料と利用規約内容をご確認ください。",
        agreementContent: [
          "1. 提出された氏名・生年月日・連絡先・証明書資料は、NeeDo の本人確認、安全対策、精算審査、紛争対応および法令順守のためにのみ利用されます。",
          "2. アップロードする資料は有効期限内で、本人のもの、かつ鮮明である必要があります。虚偽・改ざん・不一致が判明した場合は、接客権限停止や精算保留の対象となります。",
          "3. 本人確認資料は前台で公開されませんが、重大な安全対応・返金調査・法的要請があった場合に限り、必要範囲で参照されます。",
          "4. あなたは技師向け利用規約、履約ルール、顧客プライバシー保護ルールおよび決済ルールに同意し、違反時にアカウント制限が行われる可能性を理解します。"
        ],
        agreementToggle: "上記内容を確認し、NeeDo の利用規約と本人確認資料の取扱いに同意します",
        submit: "本人確認資料を提出",
        incomplete: "証明書種類、表面・裏面・本人写真のアップロード、および利用規約同意を完了してください。",
        submitted: "本人確認資料を提出しました："
      }
    : language === "en"
      ? {
          documentTypeLabels,
          subtitle: "Identity verification submission",
          title: "Upload ID documents",
          basicInfo: "Basic information",
          required: "Required",
          confirm: "Confirm",
          surnamePlaceholder: "e.g. Sato",
          givenNamePlaceholder: "e.g. Misaki",
          surnameKanaPlaceholder: "SATO",
          givenKanaPlaceholder: "MISAKI",
          surname: "Last name",
          givenName: "First name",
          surnameKana: "Last name kana",
          givenKana: "First name kana",
          birthDate: "Date of birth",
          yearSuffix: "",
          monthSuffix: "",
          daySuffix: "",
          email: "Email address",
          phone: "Phone number",
          identitySection: "Identity verification documents",
          identityHint: "Upload the front side, back side, and a selfie holding the ID. jpg / png recommended, up to 10MB each.",
          frontCardTitle: "Front side of ID",
          frontCardHint: "Tap to upload the front side",
          backCardTitle: "Back side of ID",
          backCardHint: "Tap to upload the back side",
          selfieCardTitle: "Selfie with ID",
          selfieCardHint: "Tap to upload your selfie holding the ID",
          selfieDefaultName: "Current profile image",
          documentTypeLabel: "Document type",
          agreementTitle: "Terms confirmation",
          agreementHint: "Please review the verification details and terms before submitting.",
          agreementContent: [
            "1. Your name, birth date, contact details, and ID documents are used only for NeeDo identity verification, safety operations, settlement review, dispute handling, and legal compliance.",
            "2. Uploaded documents must be valid, clear, and belong to you. False, altered, or inconsistent information may result in suspension of booking access or settlement hold.",
            "3. Identity verification documents are not shown on the public frontend, but may be reviewed internally for serious safety incidents, refund investigations, or legal requests.",
            "4. By submitting, you agree to the technician terms of use, fulfillment rules, customer privacy rules, and payment / settlement rules, and understand that violations may lead to account restrictions."
          ],
          agreementToggle: "I confirm the above and agree to NeeDo's terms of use and identity verification handling rules",
          submit: "Submit verification documents",
          incomplete: "Please choose a document type, upload front / back / selfie images, and agree to the terms.",
          submitted: "Verification documents submitted:"
        }
      : language === "ko"
        ? {
            documentTypeLabels,
            subtitle: "본인 확인 자료 제출",
            title: "신분증 업로드",
            basicInfo: "기본 정보",
            required: "필수",
            confirm: "확인",
            surnamePlaceholder: "예: 사토",
            givenNamePlaceholder: "예: 미사키",
            surnameKanaPlaceholder: "サトウ",
            givenKanaPlaceholder: "ミサキ",
            surname: "성(한자)",
            givenName: "이름(한자)",
            surnameKana: "후리가나(성)",
            givenKana: "후리가나(이름)",
            birthDate: "생년월일",
            yearSuffix: "년",
            monthSuffix: "월",
            daySuffix: "일",
            email: "이메일 주소",
            phone: "전화번호",
            identitySection: "본인 확인 자료",
            identityHint: "신분증 앞면, 뒷면, 그리고 본인이 신분증을 들고 있는 사진을 업로드해 주세요. jpg / png 권장, 각 10MB 이하.",
            frontCardTitle: "신분증 앞면",
            frontCardHint: "탭하여 앞면 업로드",
            backCardTitle: "신분증 뒷면",
            backCardHint: "탭하여 뒷면 업로드",
            selfieCardTitle: "신분증 + 본인 사진",
            selfieCardHint: "탭하여 본인 확인 사진 업로드",
            selfieDefaultName: "현재 프로필 이미지",
            documentTypeLabel: "신분증 종류",
            agreementTitle: "이용약관 확인",
            agreementHint: "제출 전에 본인 확인 자료와 이용약관 내용을 확인해 주세요.",
            agreementContent: [
              "1. 제출한 이름, 생년월일, 연락처와 신분증 자료는 NeeDo의 본인 확인, 안전 운영, 정산 심사, 분쟁 처리 및 법규 준수를 위해서만 사용됩니다.",
              "2. 업로드 자료는 유효기간 내의 본인 서류여야 하며 선명해야 합니다. 허위, 변조, 불일치가 확인되면 예약 수락 권한 정지나 정산 보류 대상이 될 수 있습니다.",
              "3. 본인 확인 자료는 공개 프런트엔드에 표시되지 않지만, 중대한 안전 사고, 환불 조사 또는 법적 요청이 있을 때 필요한 범위에서 내부 검토될 수 있습니다.",
              "4. 제출함으로써 기술자 이용약관, 이행 규칙, 고객 프라이버시 보호 규칙 및 결제/정산 규칙에 동의하며, 위반 시 계정 제한이 발생할 수 있음을 이해합니다."
            ],
            agreementToggle: "위 내용을 확인했으며 NeeDo 이용약관과 본인 확인 자료 처리 규칙에 동의합니다",
            submit: "본인 확인 자료 제출",
            incomplete: "신분증 종류를 선택하고 앞면/뒷면/본인 사진을 업로드한 뒤 약관에 동의해 주세요.",
            submitted: "본인 확인 자료가 제출되었습니다:"
          }
      : {
          documentTypeLabels,
          subtitle: "本人确认资料提交",
          title: "上传证件",
          basicInfo: "基本信息",
          required: "必填",
          confirm: "确认",
          surnamePlaceholder: "例如：佐藤",
          givenNamePlaceholder: "例如：美咲",
          surnameKanaPlaceholder: "サトウ",
          givenKanaPlaceholder: "ミサキ",
          surname: "姓（汉字）",
          givenName: "名（汉字）",
          surnameKana: "フリガナ（姓）",
          givenKana: "フリガナ（名）",
          birthDate: "生年月日",
          yearSuffix: "年",
          monthSuffix: "月",
          daySuffix: "日",
          email: "邮件地址",
          phone: "电话号码",
          identitySection: "本人确认资料",
          identityHint: "请上传证件正面、反面，以及本人手持证件照片。图片建议使用 jpg / png，单张不超过 10MB。",
          frontCardTitle: "证件正面",
          frontCardHint: "点击上传证件正面",
          backCardTitle: "证件反面",
          backCardHint: "点击上传证件反面",
          selfieCardTitle: "证件 + 本人照片",
          selfieCardHint: "点击上传本人持证照片",
          selfieDefaultName: "当前头像预览",
          documentTypeLabel: "证件类型",
          agreementTitle: "利用规约确认",
          agreementHint: "提交前请确认本人确认资料和利用规约内容。",
          agreementContent: [
            "1. 提交的姓名、生日、联系方式与证件资料将仅用于 NeeDo 的本人确认、服务安全、结算审核、争议处理与法令遵守。",
            "2. 上传资料必须真实、清晰、在有效期内；如发现伪造、冒用或重要信息不一致，平台有权暂停接单、冻结结算或要求补交资料。",
            "3. 本人确认资料不会在前台公开展示，但在发生订单纠纷、退款调查、执法配合或重大安全事件时，平台会在必要范围内调取使用。",
            "4. 你同意遵守平台技师利用规约、预约履约规则、客户隐私保护规则与支付结算规则，并理解违规可能导致接单权限限制或账号停用。"
          ],
          agreementToggle: "我已确认上述内容，并同意 NeeDo 利用规约与本人确认资料处理规则",
          submit: "提交本人确认资料",
          incomplete: "请先补全证件类型、上传正反面及本人持证照片，并确认利用规约。",
          submitted: "本人确认资料已提交："
        };
}

type TechnicianProfileSource = {
  name: string;
  avatar: string;
  gallery?: string[];
  languages: string[];
  serviceAreas: string[];
  nickname?: string;
  bio?: string;
  age?: string;
  height?: string;
  identityLabel?: "店铺所属技师" | "个人技师";
  profileTags?: string[];
  canServeForeigners?: boolean;
  bidBudgetMin?: string;
  bidBudgetMax?: string;
  paymentMethods?: TechnicianPaymentOption[];
};

export function TechnicianPortalPage() {
  const technicianPortalConfig = roleBasedTabConfig.technician;
  const navigate = useNavigate();
  const { view } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profiles, getActorForScope } = useSocial();
  const activeView = getTechnicianView(view);
  const activeMeTab = getTechnicianMeTab(searchParams.get("meTab"));
  const { session } = useAuth();
  const { theme, isNight } = useClientTheme();
  const { language } = useI18n();
  const { customers, stores, technicians } = useEntityStore();
  const baseTech = technicians.find((technician) => technician.id === session?.linkedTechnicianId) ?? technicians[0];
  const linkedCustomer = customers.find((customer) => customer.id === session?.linkedCustomerId);
  const defaultAreaSelection = useRef(getDefaultAreaSelection()).current;
  const defaultLineSelection = useRef(getDefaultLineSelection()).current;
  const scheduleThemeRootClass = cn(
    isNight ? "client-theme-night" : "client-theme-day",
    getClientThemeClassName(theme)
  );
  const nextJob = fieldJobs[0];
  const store = stores.find((item) => item.id === session?.linkedStoreId) ?? stores[0];
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const taskOrderCodeSectionRef = useRef<HTMLElement | null>(null);
  const taskOrderCodeInputRef = useRef<HTMLInputElement | null>(null);
  const idFrontInputRef = useRef<HTMLInputElement | null>(null);
  const idBackInputRef = useRef<HTMLInputElement | null>(null);
  const selfieInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<WorkStatus>("休息");
  const [tasksPanelTab, setTasksPanelTab] = useState<TechnicianTasksPanelTab>("schedule");
  const [taskOrderTab, setTaskOrderTab] = useState<TechnicianTaskOrderTab>("pending");
  const [selectedTaskOrder, setSelectedTaskOrder] = useState<Order | null>(null);
  const [acceptedTaskOrderIds, setAcceptedTaskOrderIds] = useState<string[]>([]);
  const [statusTimelineRecords, setStatusTimelineRecords] = useState<TechnicianStatusTimelineRecord[]>([]);
  const [activeDirectoryShortcut, setActiveDirectoryShortcut] = useState<string | null>(null);
  const [schedulePrimaryTab, setSchedulePrimaryTab] = useState<"mySchedule" | "planning">("mySchedule");
  const [scheduleSearchQuery, setScheduleSearchQuery] = useState("");
  const [schedulePlanningStep, setSchedulePlanningStep] = useState<TechnicianPlanningStep>("mode");
  const [schedulePlanningMethod, setSchedulePlanningMethod] = useState<Extract<TechnicianPlanningStep, "oneClick" | "manual">>("oneClick");
  const [scheduleDisplayMode, setScheduleDisplayMode] = useState<ScheduleDisplayMode>("day");
  const [scheduleScope, setScheduleScope] = useState<ScheduleScope>("day");
  const [scheduleAnchorDate, setScheduleAnchorDate] = useState(todayDate);
  const [scheduleSelectedDate, setScheduleSelectedDate] = useState<string | null>(todayDate);
  const [profileVisibility, setProfileVisibility] = useState<TechnicianProfileDraft["visibility"]>("privateAll");
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [documentUploadOpen, setDocumentUploadOpen] = useState(false);
  const [techProfile, setTechProfile] = useState<TechnicianProfile>(() => buildTechnicianProfile(baseTech, store.name));
  const [profileDraft, setProfileDraft] = useState<TechnicianProfileDraft>(() =>
    buildTechnicianProfileDraft(buildTechnicianProfile(baseTech, store.name), "privateAll", defaultAreaSelection, defaultLineSelection)
  );
  const [kycDraft, setKycDraft] = useState<TechnicianKycDraft>(() => buildTechnicianKycDraft(buildTechnicianProfile(baseTech, store.name)));
  const [jobShareOpen, setJobShareOpen] = useState(false);
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [serviceCodeTargetOrderId, setServiceCodeTargetOrderId] = useState<string | null>(null);
  const [serviceCode, setServiceCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [serviceSessionNow, setServiceSessionNow] = useState(() => Date.now());
  const [taskOrderEndConfirmOpen, setTaskOrderEndConfirmOpen] = useState(false);
  const [technicianServiceReviewOpen, setTechnicianServiceReviewOpen] = useState(false);
  const [extensionRequestCollapsed, setExtensionRequestCollapsed] = useState(false);
  const [scheduleSetupOpen, setScheduleSetupOpen] = useState(false);
  const [scheduleSetupType, setScheduleSetupType] = useState<TechnicianScheduleSetupType>("availability");
  const [dayTimelineDisplayMode, setDayTimelineDisplayMode] = useState<DayTimelineDisplayMode>("all");
  const [dayScheduleEditor, setDayScheduleEditor] = useState<DayScheduleEditorState | null>(null);
  const [nextCustomerCardOpen, setNextCustomerCardOpen] = useState(false);
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false);
  const setContactLog = (message: string, options: TechnicianStatusLogOptions = {}) => {
    setStatusTimelineRecords((current) => {
      const meta = getTechnicianStatusTimelineMeta(message);
      const timestamp = Date.now();

      return [
        ...current,
        {
          actorName: options.actorName ?? meta.actorName,
          actorRole: options.actorRole ?? meta.actorRole,
          atLabel: formatTechnicianStatusTimelineTime(timestamp),
          id: `technician-status-${timestamp}-${current.length}`,
          message: options.messageNode ?? message,
          sortAt: timestamp,
          title: options.title ?? meta.title,
          tone: options.tone ?? meta.tone
        }
      ].slice(-24);
    });
  };
  const setOrderContactLog = (
    prefix: string,
    order: Order,
    suffix = "",
    options: TechnicianStatusLogOptions = {}
  ) => {
    setContactLog(`${prefix}${formatTechnicianOrderSubjectText(order)}${suffix}`, {
      ...options,
      messageNode: (
        <>
          {prefix}
          <TechnicianTimelineOrderSubject order={order} />
          {suffix}
        </>
      )
    });
  };
  const kycCopy = getKycCopy(language);
  const kycDocumentTypeLabels = kycCopy.documentTypeLabels;
  const selectedCountryCatalog =
    serviceAreaCatalog[profileDraft.selectedCountry as keyof typeof serviceAreaCatalog] ?? serviceAreaCatalog["日本"];
  const availablePrefectures = Object.keys(selectedCountryCatalog) as string[];
  const availableAreas = (selectedCountryCatalog[profileDraft.selectedPrefecture as keyof typeof selectedCountryCatalog] ?? []) as readonly string[];
  const availableLines = Object.keys(railLineCatalog) as Array<keyof typeof railLineCatalog>;
  const availableStations = railLineCatalog[profileDraft.selectedLine as keyof typeof railLineCatalog] ?? railLineCatalog["山手線"];
  const activeOrder = orders[0];
  const activeCustomer = customers.find((customer) => customer.id === activeOrder.customerId) ?? customers[0];
  const socialActorKey = getActorForScope("technician");
  const socialActor = profiles[socialActorKey];
  const {
    schedules: sharedSchedules,
    schedulePlanTags
  } = useScheduleStore();
  const shiftPlanning = useShiftPlanningStore();
  const activeScheduleContext = useMemo(
    () =>
      resolveScheduleContext({
        technician: baseTech,
        storeId: store.id,
        modeConfigs: shiftPlanning.modeConfigs,
        atDate: new Date().toISOString()
      }),
    [baseTech, shiftPlanning.modeConfigs, store.id]
  );
  const activeShiftPolicy = useMemo(() => getActivePolicyForStore(store.id, shiftPlanning.policies), [shiftPlanning.policies, store.id]);
  const activeShiftResponse = useMemo(
    () => activeShiftPolicy ? shiftPlanning.responses.find((item) => item.policyId === activeShiftPolicy.id && item.technicianId === baseTech.id) ?? null : null,
    [activeShiftPolicy, baseTech.id, shiftPlanning.responses]
  );
  const activeShiftConfirmedCount = useMemo(
    () =>
      activeShiftPolicy
        ? shiftPlanning.confirmedShifts.filter((item) => item.policyId === activeShiftPolicy.id && item.technicianId === baseTech.id && item.shiftStatus === "confirmed").length
        : 0,
    [activeShiftPolicy, baseTech.id, shiftPlanning.confirmedShifts]
  );
  const activeShiftWaitlistedCount = useMemo(
    () =>
      activeShiftPolicy
        ? shiftPlanning.confirmedShifts.filter((item) => item.policyId === activeShiftPolicy.id && item.technicianId === baseTech.id && item.shiftStatus === "waitlisted").length
        : 0,
    [activeShiftPolicy, baseTech.id, shiftPlanning.confirmedShifts]
  );
  const activeScheduleRequirementNotifications = useMemo(
    () =>
      shiftPlanning.notifications.filter(
        (item) =>
          item.targetType === "technician" &&
          item.targetId === baseTech.id &&
          item.storeId === store.id &&
          item.status !== "read" &&
          scheduleRequirementNotificationTypes.has(item.notificationType)
      ),
    [baseTech.id, shiftPlanning.notifications, store.id]
  );
  const scheduleRequirementVersionKey = useMemo(
    () => activeScheduleRequirementNotifications.map((item) => `${item.id}:${item.scheduledAt}`).join("|"),
    [activeScheduleRequirementNotifications]
  );
  const [seenScheduleRequirementVersionKey, setSeenScheduleRequirementVersionKey] = useState("");
  const hasSchedulePlanningNew = activeScheduleRequirementNotifications.length > 0 && scheduleRequirementVersionKey !== seenScheduleRequirementVersionKey;
  const markScheduleRequirementsSeen = () => {
    setSeenScheduleRequirementVersionKey(scheduleRequirementVersionKey);
    activeScheduleRequirementNotifications.forEach((item) => {
      markShiftPlanningNotificationRead(item.id);
    });
  };
  const updateSchedulePlanningStep = (nextStep: TechnicianPlanningStep) => {
    if (nextStep === "oneClick" || nextStep === "manual") {
      setSchedulePlanningMethod(nextStep);
    }

    setSchedulePlanningStep(nextStep);
  };
  const updateSchedulePlanningMethod = (nextMethod: Extract<TechnicianPlanningStep, "oneClick" | "manual">) => {
    setSchedulePlanningMethod(nextMethod);
    setSchedulePlanningStep((currentStep) => (currentStep === "oneClick" || currentStep === "manual" ? nextMethod : currentStep));
  };
  const effectiveSchedulePlanningStep =
    activeScheduleContext.context === "STORE_DIRECT_ASSIGN" && schedulePlanningStep === "mode"
      ? "rules"
      : schedulePlanningStep;
  const schedulePlanningProgressSteps: Array<{
    value: TechnicianPlanningStep;
    step: string;
    label: string;
  }> =
    activeScheduleContext.context === "STORE_DIRECT_ASSIGN"
      ? [
          { value: "rules", step: "1", label: "查看排班" },
          { value: "oneClick", step: "2", label: "确认收到" },
          { value: "manual", step: "3", label: "申请更改" }
        ]
      : [
          {
            value: "mode",
            step: "1",
            label: "模式选择"
          },
          {
            value: "rules",
            step: "2",
            label: schedulePlanningMethod === "manual"
              ? activeScheduleContext.context === "STORE_CONFIRM_REQUIRED" ? "排班设置" : "发布设置"
              : activeScheduleContext.context === "STORE_CONFIRM_REQUIRED" ? "规则设定" : "发布规则设定"
          },
          {
            value: schedulePlanningMethod,
            step: "3",
            label: schedulePlanningMethod === "manual"
              ? activeScheduleContext.context === "STORE_CONFIRM_REQUIRED" ? "生成反馈" : "生成上班"
              : activeScheduleContext.context === "STORE_CONFIRM_REQUIRED" ? "自动生成反馈" : "自动生成上班"
          },
          {
            value: "confirm",
            step: "4",
            label: activeScheduleContext.context === "STORE_CONFIRM_REQUIRED" ? "确定排班" : "最终可预约结果"
          }
        ];
  const activeSchedulePlanningStepIndex = Math.max(
    0,
    schedulePlanningProgressSteps.findIndex((item) => item.value === effectiveSchedulePlanningStep)
  );
  const baseScheduleEvents: TechnicianScheduleEvent[] = sharedSchedules
    .filter((schedule) => schedule.staffId === baseTech.id)
    .map((schedule, index) => {
      const order = orders.find((item) => item.id === schedule.orderId) ?? orders[index % orders.length];
      const planType = schedule.status === "booked"
        ? undefined
        : schedulePlanTags[schedule.id] === "leave"
          ? "leave"
          : schedulePlanTags[schedule.id] === "locked"
            ? "locked"
            : schedulePlanTags[schedule.id] === "travel"
              ? "travel"
              : schedulePlanTags[schedule.id] === "break"
                ? "break"
                : schedulePlanTags[schedule.id] === "expectedTravel"
                  ? "expectedTravel"
                  : schedulePlanTags[schedule.id] === "expectedBreak"
                    ? "expectedBreak"
                    : schedulePlanTags[schedule.id] === "expected"
                      ? "availability"
                      : undefined;
      const planMeta = planType ? technicianPlanMeta[planType] : null;

      return {
        ...schedule,
        workMode: "store",
        title: planMeta?.title ?? (schedule.status === "free" ? "门店可接单空档" : getNeedoAppBookingTitle(schedule.orderId, order.itemName) ?? order.itemName),
        place: store.name,
        customer: schedule.status === "free" ? "待分配" : order.customerName,
        amount: schedule.status === "booked" ? order.amount : 0,
        note: planMeta?.caption ?? (schedule.status === "free" ? "来自门店排班，可被系统派单" : "来自门店正式预约"),
        planType,
        isEstimated: isEstimatedSchedulePlanType(planType)
      };
    });
  const acceptedTaskOrderIdSet = new Set(acceptedTaskOrderIds);
  const acceptedTaskScheduleEvents: TechnicianScheduleEvent[] = orders
    .filter((order) => acceptedTaskOrderIdSet.has(order.id))
    .map((order, index) => {
      const [, rawStartTime = "10:00"] = order.bookedAt.split(" ");
      const startTime = rawStartTime.slice(0, 5) || "10:00";

      return {
        id: `accepted-task-${order.id}`,
        staffId: baseTech.id,
        date: todayDate,
        startTime,
        endTime: addClockMinutes(startTime, order.itemName.includes("90") ? 90 : 120),
        status: "booked",
        orderId: order.id,
        workMode: "store",
        title: getNeedoAppBookingTitle(order.id, order.itemName) ?? order.itemName,
        place: getTechnicianOrderAddress(order),
        customer: order.customerName,
        amount: order.amount,
        note: index === 0 ? "已承接，下一步可以打开导航并同步到达状态。" : "已承接，已进入今日排班展示。"
      };
    });
  const scheduleEvents = [...baseScheduleEvents, ...acceptedTaskScheduleEvents]
    .filter((event) => event.staffId === baseTech.id)
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
  const workAnalyticsSeedEvents = useMemo<TechnicianScheduleEvent[]>(
    () =>
      buildTechnicianWorkAnalyticsSeed({
        technicianId: baseTech.id,
        storeName: store.name,
        customerNames: customers.slice(0, 4).map((customer) => customer.name),
        anchorDate: todayDate
      }),
    [baseTech.id, customers, store.name]
  );
  const workAnalyticsEvents = useMemo(
    () =>
      [...scheduleEvents, ...workAnalyticsSeedEvents].sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)),
    [scheduleEvents, workAnalyticsSeedEvents]
  );
  const taskOrderGroups = {
    pending: orders.filter((order) => ["scheduled", "confirmed", "pendingDispatch", "dispatched", "pending"].includes(order.status) && !acceptedTaskOrderIdSet.has(order.id)),
    active: orders.filter((order) => ["inService", "active"].includes(order.status)),
    done: orders.filter((order) => !["scheduled", "confirmed", "pendingDispatch", "dispatched", "pending", "inService", "active"].includes(order.status))
  };
  const visibleTaskOrders = taskOrderGroups[taskOrderTab].slice(0, 4);
  const canAcceptSelectedTaskOrder = Boolean(
    selectedTaskOrder && tasksPanelTab === "orders" && taskOrderTab === "pending" && !acceptedTaskOrderIdSet.has(selectedTaskOrder.id)
  );
  const handleAcceptTaskOrder = (order: Order) => {
    setAcceptedTaskOrderIds((current) => current.includes(order.id) ? current : [...current, order.id]);
    setSelectedTaskOrder(null);
    setTasksPanelTab("schedule");
    setOrderContactLog(`已承接 ${order.itemName}：`, order, "，订单已加入今日仅排班展示。");
  };
  const shareTaskOrder = (order: Order) => {
    void shareContent({
      title: order.itemName,
      text: `${order.itemName}\n${order.bookedAt} · ${order.area}\n${yen(order.amount)}`,
      url: `/technician/tasks?order=${order.id}`,
      copiedMessage: "服务卡链接已复制，可以转发给联系人"
    });
  };
  const dashboardMonth = todayDate.slice(0, 7);
  const dashboardMonthlyOrders = workAnalyticsEvents.filter((event) => event.status === "booked" && event.date.startsWith(dashboardMonth)).length;
  const dashboardStoreName = techProfile.identityLabel === "个人技师" ? "个人" : store.name;
  const dashboardIdentityTag = techProfile.identityLabel === "个人技师"
    ? "个人"
    : (baseTech.profileTags ?? []).some((tag) => tag.includes("兼职"))
      ? "兼职"
      : "专属";
  const dashboardMetrics = [
    { label: "接单率", value: `${baseTech.acceptRate}%` },
    { label: "服务评价", value: typeof baseTech.rating === "number" ? baseTech.rating.toFixed(2) : "--" },
    { label: "本月订单", value: `${dashboardMonthlyOrders} 单` }
  ];
  const getScheduleEventsForDate = (date: string) => scheduleEvents.filter((event) => event.date === date);
  const todaySchedulePreviewEvents = getScheduleEventsForDate(todayDate).slice(0, 5);
  const nextBookedScheduleEvent = scheduleEvents.find((event) => event.status === "booked" && `${event.date} ${event.startTime}` >= technicianHomeReferenceTime)
    ?? scheduleEvents.find((event) => event.status === "booked" && event.date >= todayDate)
    ?? scheduleEvents.find((event) => event.status === "booked")
    ?? null;
  const currentServiceOrder = orders.find((order) => ["inService", "active"].includes(order.status)) ?? null;
  const upcomingServiceOrder = nextBookedScheduleEvent?.orderId
    ? orders.find((order) => order.id === nextBookedScheduleEvent.orderId) ?? activeOrder
    : activeOrder;
  const nextServiceOrder = currentServiceOrder ?? upcomingServiceOrder;
  const codeModalTargetOrder = serviceCodeTargetOrderId
    ? orders.find((order) => order.id === serviceCodeTargetOrderId) ?? nextServiceOrder
    : nextServiceOrder;
  const secondaryNextServiceOrder = currentServiceOrder && upcomingServiceOrder.id !== currentServiceOrder.id ? upcomingServiceOrder : null;
  const isCurrentServiceFocused = currentServiceOrder?.id === nextServiceOrder.id;
  const nextServiceJob = fieldJobs.find((job) => job.orderId === nextServiceOrder.id) ?? null;
  const nextServiceAddress = nextServiceJob?.address ?? `${nextServiceOrder.city}${nextServiceOrder.area}`;
  const nextServiceTime = nextServiceJob?.serviceTime ?? nextServiceOrder.bookedAt ?? `${todayDate} ${nextBookedScheduleEvent?.startTime ?? "10:00"}`;
  const nextServiceCountdown = getScheduleCountdown(nextServiceTime, technicianHomeReferenceTime, language);
  const currentServiceStageLabel = status === "服务中" ? "服务中" : "进行中";
  const currentServiceStageTone: BadgeTone = status === "服务中" ? "green" : "yellow";
  const nextServiceEstimatedEndTime = addMinutesToDateTime(nextServiceTime, getOrderEstimatedDurationMinutes(nextServiceOrder));
  const nextServiceCustomer = customers.find((customer) => customer.id === nextServiceOrder.customerId) ?? activeCustomer;
  const secondaryNextServiceJob = secondaryNextServiceOrder ? fieldJobs.find((job) => job.orderId === secondaryNextServiceOrder.id) ?? null : null;
  const secondaryNextServiceAddress = secondaryNextServiceOrder
    ? secondaryNextServiceJob?.address ?? `${secondaryNextServiceOrder.city}${secondaryNextServiceOrder.area}`
    : "";
  const secondaryNextServiceTime = secondaryNextServiceOrder
    ? secondaryNextServiceJob?.serviceTime ?? secondaryNextServiceOrder.bookedAt
    : "";
  const secondaryNextServiceEstimatedEndTime = secondaryNextServiceOrder && secondaryNextServiceTime
    ? addMinutesToDateTime(secondaryNextServiceTime, getOrderEstimatedDurationMinutes(secondaryNextServiceOrder))
    : "";
  const secondaryNextServiceCustomer = secondaryNextServiceOrder
    ? customers.find((customer) => customer.id === secondaryNextServiceOrder.customerId) ?? activeCustomer
    : activeCustomer;
  const selectedTaskOrderCustomer = selectedTaskOrder
    ? customers.find((customer) => customer.id === selectedTaskOrder.customerId) ?? activeCustomer
    : null;
  const selectedTaskOrderStore = selectedTaskOrder
    ? stores.find((item) => item.name === selectedTaskOrder.storeName) ?? store
    : store;
  const selectedTaskOrderTechnician = selectedTaskOrder
    ? technicians.find((item) => item.name === selectedTaskOrder.technicianName) ?? baseTech
    : baseTech;
  const selectedTaskOrderService = selectedTaskOrder ? findOrderService(selectedTaskOrder) : null;
  const selectedTaskOrderPackage = selectedTaskOrder && selectedTaskOrderService ? findOrderPackage(selectedTaskOrder, selectedTaskOrderService) : null;
  const selectedTaskOrderBaseDurationMinutes = selectedTaskOrderPackage?.durationMinutes ?? (selectedTaskOrder ? getOrderEstimatedDurationMinutes(selectedTaskOrder) : 60);
  const selectedTaskOrderSession = useOrderServiceSession(selectedTaskOrder?.id, selectedTaskOrderBaseDurationMinutes);
  const orderServiceSessions = useOrderServiceSessions();
  const selectedTaskOrderDisplay: Order | null = selectedTaskOrder
    ? {
        ...selectedTaskOrder,
        status:
          selectedTaskOrderSession.status === "inService"
            ? "inService"
            : selectedTaskOrderSession.status === "completed"
              ? "completed"
              : selectedTaskOrder.status
      }
    : null;
  const selectedTaskOrderRemainingSeconds = getOrderServiceRemainingSeconds(selectedTaskOrderSession, serviceSessionNow);
  const selectedTaskOrderPendingExtensionRequest = getPendingOrderExtensionRequest(selectedTaskOrderSession);
  const showTechnicianServiceReview = Boolean(
    selectedTaskOrder &&
    selectedTaskOrderSession.status === "completed" &&
    !selectedTaskOrderSession.technicianReviewClosedAt
  );
  const selectedTaskOrderPaymentItems = selectedTaskOrderDisplay
    ? [
        ["金额", yen(selectedTaskOrderDisplay.amount)],
        ["支付手段", getOrderDetailPaymentCopy(selectedTaskOrderDisplay.paymentStatus, selectedTaskOrderDisplay.mode)],
        ["来源", getOrderDetailSourceLabel(selectedTaskOrderDisplay)]
      ]
    : [];
  const technicianStatusOrderIds = new Set<string>();
  scheduleEvents.forEach((event) => {
    if (event.orderId) {
      technicianStatusOrderIds.add(event.orderId);
    }
  });
  acceptedTaskOrderIds.forEach((orderId) => technicianStatusOrderIds.add(orderId));
  technicianStatusOrderIds.add(nextServiceOrder.id);
  technicianStatusOrderIds.add(upcomingServiceOrder.id);
  if (currentServiceOrder) {
    technicianStatusOrderIds.add(currentServiceOrder.id);
  }
  if (secondaryNextServiceOrder) {
    technicianStatusOrderIds.add(secondaryNextServiceOrder.id);
  }
  if (selectedTaskOrder) {
    technicianStatusOrderIds.add(selectedTaskOrder.id);
  }
  const technicianStatusOrders = orders.filter((order) => technicianStatusOrderIds.has(order.id));
  const operationalStatusTimelineRecords = buildTechnicianOperationalStatusRecords({
    orders: technicianStatusOrders,
    referenceTimestamp: parseTechnicianDateTime(technicianHomeReferenceTime),
    scheduleEvents,
    sessions: orderServiceSessions
  });
  const statusTimelineEntries = [...operationalStatusTimelineRecords, ...statusTimelineRecords]
    .sort((left, right) => right.sortAt - left.sortAt)
    .slice(0, 24)
    .map<ContactEventTimelineEntry>((event) => ({
      actorAvatarSrc: event.actorName === "我" ? techProfile.avatar : undefined,
      actorName: event.actorName === "我" ? techProfile.nickname : event.actorName,
      actorRole: event.actorRole,
      atLabel: event.atLabel,
      id: event.id,
      message: event.message,
      title: event.title,
      tone: event.tone
    }));
  const renderTechnicianStatusTimeline = (className?: string) => (
    <ContactEventTimelinePanel
      className={className}
      commentAuthorAvatarSrc={techProfile.avatar}
      commentAuthorName={techProfile.nickname}
      commentAuthorRole="补充记录"
      commentButtonLabel="补充记录"
      commentPlaceholder="记录执行经过、异常原因或后续处理..."
      emptyLabel="暂无执行 / 异常记录"
      events={statusTimelineEntries}
      onCommentSubmit={(comment) => setContactLog(comment, { actorName: "我", actorRole: "补充记录", title: "补充记录", tone: "green" })}
      title="状态记录"
    />
  );
  const rangeDates = getRangeDates(scheduleAnchorDate, scheduleScope);
  const rangeEvents = scheduleEvents.filter((event) => rangeDates.includes(event.date));
  const timelineBaseDate = scheduleScope === "day" ? scheduleAnchorDate : (scheduleSelectedDate ?? null);
  const isShowingEntireScheduleRange = scheduleScope !== "day" && !timelineBaseDate;
  const recentReviewCards = [
    {
      id: "review-1",
      customer: customers[0]?.name ?? "Aki",
      rating: 4.9,
      date: "2026-04-12",
      content: "到达前确认很及时，手法稳定，沟通也很舒服，下次还会继续约。"
    },
    {
      id: "review-2",
      customer: customers[1]?.name ?? "Mia",
      rating: 4.8,
      date: "2026-04-09",
      content: "时间安排很准，途中状态同步清楚，服务结束后的建议也很专业。"
    },
    {
      id: "review-3",
      customer: customers[2]?.name ?? "Luna",
      rating: 4.7,
      date: "2026-04-05",
      content: "语言沟通顺畅，照顾到我的临时需求，整体体验很安心。"
    }
  ];
  const timelineEvents = timelineBaseDate ? getScheduleEventsForDate(timelineBaseDate) : rangeEvents;
  const isSingleDateTimeline = Boolean(timelineBaseDate);
  const monthGridDates = getMonthGridDates(scheduleAnchorDate);
  const selectedMonth = scheduleAnchorDate.slice(0, 7);
  const monthWindowDates = new Set(getRangeDates(scheduleAnchorDate, "month"));
  const completedEvents = scheduleEvents.filter((event) => event.status === "booked" && event.date < todayDate);
  const futureEvents = scheduleEvents.filter((event) => event.date > todayDate);
  const periodRevenue = timelineEvents.reduce((sum, event) => sum + event.amount, 0);
  const workDetailBaseDate = timelineBaseDate ?? scheduleAnchorDate;
  const routeWorkDetailMode = getRouteWorkMode(searchParams.get("mode"));
  const routeWorkDetailScope = getRouteWorkDetailScope(searchParams.get("scope"));
  const routeWorkDetailDate = isValidInputDate(searchParams.get("date")) ? (searchParams.get("date") as string) : workDetailBaseDate;
  const timelineTitle = scheduleScope === "day"
    ? `${formatDisplayDate(scheduleAnchorDate, language)} 排班`
    : timelineBaseDate
      ? `${formatDisplayDate(timelineBaseDate, language)} 排班`
      : scheduleScope === "week"
        ? "7天内排班"
        : "31天内排班";
  const listViewEvents = scheduleScope === "day" ? getScheduleEventsForDate(scheduleAnchorDate) : rangeEvents;
  const groupedListViewDays = groupScheduleEventsByDate(listViewEvents);
  const listViewTitle = scheduleScope === "day"
    ? `${formatDisplayDate(scheduleAnchorDate, language)} 列表`
    : scheduleScope === "week"
      ? "本周列表"
      : "本月列表";
  const dayTimelineEvents = isSingleDateTimeline
    ? [...timelineEvents].sort((left, right) => left.startTime.localeCompare(right.startTime))
    : [];
  const groupedTimelineDays = !isSingleDateTimeline ? groupScheduleEventsByDate(timelineEvents) : [];
  const dayVisibleHours = isSingleDateTimeline ? getVisibleTimelineHours(dayTimelineEvents, dayTimelineDisplayMode) : [];
  const dayTimelineRowHeight = 68;
  const dayTimelineHeight = Math.max(dayVisibleHours.length, 1) * dayTimelineRowHeight;
  const routeWorkDetailEvents = getWorkDetailEvents(
    workAnalyticsEvents.filter((event) => event.workMode === routeWorkDetailMode),
    routeWorkDetailScope,
    routeWorkDetailDate
  );
  const routeWorkTrendPoints = getWorkTrendPoints(routeWorkDetailEvents, routeWorkDetailScope, routeWorkDetailDate);
  const routeWorkDetailIncome = routeWorkDetailEvents.reduce((sum, event) => sum + event.amount, 0);
  const routeWorkDetailHours = routeWorkDetailEvents.reduce((sum, event) => sum + getEventDurationHours(event), 0);
  const routeWorkDetailBookedCount = routeWorkDetailEvents.filter((event) => event.status === "booked").length;
  const routeWorkDetailAvailableCount = routeWorkDetailEvents.filter((event) => event.planType === "availability" || event.status === "free").length;
  const routeWorkDetailBlockedCount = routeWorkDetailEvents.filter((event) => event.planType === "leave" || event.planType === "locked" || event.status === "blocked").length;
  const routeWorkDetailCompletionRate = routeWorkDetailBookedCount === 0 ? 100 : Math.max(88, baseTech.acceptRate);
  const routeWorkDetailAverageIncome = routeWorkDetailBookedCount === 0 ? 0 : Math.round(routeWorkDetailIncome / routeWorkDetailBookedCount);
  const routeWorkDetailScopeLabel = routeWorkDetailScope === "day"
    ? formatDisplayDate(routeWorkDetailDate, language)
    : routeWorkDetailScope === "week"
      ? `${getWeekDates(routeWorkDetailDate)[0]} - ${getWeekDates(routeWorkDetailDate)[6]}`
      : routeWorkDetailDate.slice(0, 7);
  const routeComparisonCards = (["store"] as TechWorkMode[]).map((mode) => {
    const scopedEvents = getWorkDetailEvents(
      workAnalyticsEvents.filter((event) => event.workMode === mode),
      routeWorkDetailScope,
      routeWorkDetailDate
    );
    const bookedEvents = scopedEvents.filter((event) => event.status === "booked");
    const availableCount = scopedEvents.filter((event) => event.planType === "availability" || event.status === "free").length;
    const nextEvent =
      scopedEvents.find((event) => `${event.date} ${event.startTime}` >= `${routeWorkDetailDate} 00:00` && event.status !== "blocked") ??
      scopedEvents.find((event) => event.status !== "blocked") ??
      null;

    return {
      mode,
      events: scopedEvents,
      trendPoints: getWorkTrendPoints(scopedEvents, routeWorkDetailScope, routeWorkDetailDate),
      income: bookedEvents.reduce((sum, event) => sum + event.amount, 0),
      completedCount: bookedEvents.length,
      hours: bookedEvents.reduce((sum, event) => sum + getEventDurationHours(event), 0),
      availableCount,
      nextEvent
    };
  });
  const routeVisibleComparisonCards = routeComparisonCards.filter((card) => card.mode === routeWorkDetailMode);
  const activeRouteWorkCard = routeComparisonCards.find((card) => card.mode === routeWorkDetailMode) ?? routeComparisonCards[0];
  const routeActiveModeDescription = `${store.name} 自动派单与店铺预约`;
  const routeActiveNextLabel = activeRouteWorkCard?.nextEvent
    ? `${activeRouteWorkCard.nextEvent.date} ${activeRouteWorkCard.nextEvent.startTime} · ${activeRouteWorkCard.nextEvent.title}`
    : "当前范围暂无新的工作安排";
  const selectedScheduleBorderClass = isNight ? "border-[#e8c46c]" : "border-[#43a07b]";
  const selectedScheduleArrowClass = isNight ? "text-[#e8c46c]" : "text-[#43a07b]";
  const dayTimelineShellClass = isNight ? "border-[#4a3a1d]/60 bg-[#0f0c09] shadow-[inset_0_1px_0_rgba(255,233,174,0.05)]" : "border-line bg-white";
  const dayTimelineHourColumnClass = isNight ? "border-[#3e3118]/55 bg-[#15110d]" : "border-line bg-white/75";
  const dayTimelineGridClass = isNight ? "bg-[linear-gradient(180deg,#110e0b_0%,#0c0a08_100%)]" : "bg-white";
  const dayTimelineRowClass = isNight ? "border-[#4a3a1d]/60" : "border-line";
  const dayTimelineEmptyRowClass = isNight ? "bg-transparent hover:bg-[#15110c]" : "bg-paper/55";
  const floatingActionShellClass = isNight
    ? "border-[#4a3a1d]/60 bg-[rgba(12,10,8,0.92)]"
    : "border-[#d6e6df] bg-[rgba(255,255,255,0.96)]";
  const dataCenterWorkMode: TechWorkMode = "store";
  const dataCenterWorkEvents = workAnalyticsEvents.filter((event) => event.workMode === dataCenterWorkMode);
  const dataCenterCompletedEvents = dataCenterWorkEvents.filter((event) => event.status === "booked" && event.date <= todayDate);
  const dataCenterFutureEvents = dataCenterWorkEvents.filter((event) => event.date >= todayDate);
  const dataCenterNextEvent = dataCenterFutureEvents.find((event) => event.status !== "blocked");
  const dataCenterTrendPoints = getWorkTrendPoints(getWorkDetailEvents(dataCenterWorkEvents, "week", todayDate), "week", todayDate);
  const dataCenterIncome = dataCenterCompletedEvents.reduce((sum, event) => sum + event.amount, 0);
  const dataCenterWorkProfile = {
    title: workModeLabels[dataCenterWorkMode],
    caption: `${store.name} 的固定排班、培训和门店预约`,
    settlement: "店铺月结 / 含指名奖励",
    income: yen(Math.max(dataCenterIncome, baseTech.income)),
    completed: dataCenterCompletedEvents.length,
    future: dataCenterFutureEvents.length,
    next: dataCenterNextEvent ? `${dataCenterNextEvent.date} ${dataCenterNextEvent.startTime} · ${dataCenterNextEvent.title}` : "暂无未来安排",
    trendPoints: dataCenterTrendPoints
  };
  const dataCenterWorkTrendPoints = dataCenterWorkProfile.trendPoints;
  const dataCenterWorkColor = "var(--client-primary)";
  const activeIncomeTrendShellClass =
    isNight
      ? "border-[color:color-mix(in_srgb,var(--client-primary)_18%,transparent)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--client-surface)_82%,transparent),color-mix(in_srgb,var(--client-bg)_86%,var(--client-primary)_14%))]"
      : "border-line bg-paper";
  const activeIncomeMetricClass = isNight ? "border-transparent bg-white/[0.05]" : "border-black/5 bg-white";
  const activeIncomeNextClass = isNight ? "border-transparent bg-white/[0.04] text-white/70" : "border-black/5 bg-white text-ink/58";
  const activeIncomeChartClass =
    isNight
      ? "border-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--client-surface)_76%,transparent),color-mix(in_srgb,var(--client-bg)_94%,transparent))]"
      : "border-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),color-mix(in_srgb,white_92%,var(--client-primary)_8%))]";
  const recentWorkRecords = [...dataCenterWorkEvents]
    .filter((event) => event.status === "booked" || event.status === "free" || event.planType)
    .sort((left, right) => `${right.date} ${right.startTime}`.localeCompare(`${left.date} ${left.startTime}`))
    .slice(0, 6);
  const { categories: customDirectoryCategories, setCategories: setCustomDirectoryCategories } = useCustomContactCategories("technician");
  const [editingDirectoryCategoryId, setEditingDirectoryCategoryId] = useState<string | null>(null);
  const technicianContacts: Array<DirectoryContactItem & { followed: boolean }> = [
    {
      id: "store-main",
      systemId: store.systemId,
      name: store.name,
      username: "store_ginza_calm",
      remark: "主业门店",
      avatar: store.cover,
      title: "店铺",
      badgeTone: "green" as const,
      tags: ["店铺", "主业", "排班"],
      meta: `${store.area} · 今日 ${timelineEvents.length} 件安排`,
      followed: true,
      to: getMessagePath("technician", getTechnicianStoreConversationId()),
      todayPriority: true,
      entityCardData: {
        ...buildShopInfoCardData(store, technicians),
        detailPath: getScopedProfileDetailPath("technician", "shop", store.id)
      },
      entityCardVariant: "compact" as const
    },
    {
      id: "customer-active",
      systemId: activeCustomer.systemId,
      name: activeOrder.customerName,
      username: "cus_today_001",
      remark: "今日服务客户",
      avatar: activeCustomer.avatar,
      title: "顾客",
      badgeTone: "yellow" as const,
      tags: ["顾客", "当日订单", activeOrder.status],
      meta: `${activeOrder.bookedAt} · ${activeOrder.itemName}`,
      followed: true,
      to: getMessagePath("technician", getTechnicianCustomerConversationId(activeOrder.customerId)),
      todayPriority: true,
      entityCardData: {
        ...buildUserInfoCardData(activeCustomer),
        detailPath: getScopedProfileDetailPath("technician", "user", activeCustomer.id)
      },
      entityCardVariant: "compact" as const
    },
    {
      id: "dispatch",
      name: "平台调度",
      username: "needo_dispatch",
      remark: "异常与派单联系",
      avatar: "/images/generated/profiles/profile-16.jpg",
      title: "平台",
      badgeTone: "red" as const,
      tags: ["平台", "派单", "紧急"],
      meta: "24h 在线 · 可处理改期、异常、退款协助",
      followed: true,
      to: getMessagePath("technician", getTechnicianSupportConversationId()),
      todayPriority: true
    },
    ...technicians.filter((item) => item.id !== baseTech.id).slice(0, 4).map((item, index) => ({
      id: item.id,
      systemId: item.systemId,
      name: item.name,
      username: `tech_peer_${index + 1}`,
      remark: index === 0 ? "同班协作" : "可互相支援",
      avatar: item.avatar,
      title: "同事",
      badgeTone: "green" as const,
      tags: ["同事", ...item.skills.slice(0, 2)],
      meta: `★ ${item.rating} · ${item.serviceAreas.join(" / ")}`,
      followed: index < 2,
      to: getMessagePath("technician", getTechnicianStaffConversationId(item.id)),
      todayPriority: index === 0,
      entityCardData: {
        ...buildTechnicianInfoCardData(item),
        detailPath: getScopedProfileDetailPath("technician", "technician", item.id)
      },
      entityCardVariant: "compact" as const
    }))
  ];
  const availableDirectoryTags = Array.from(new Set(technicianContacts.flatMap((contact) => contact.tags))).sort((left, right) =>
    left.localeCompare(right, "ja")
  );
  const editingDirectoryCategory = editingDirectoryCategoryId
    ? customDirectoryCategories.find((category) => category.id === editingDirectoryCategoryId)
    : null;
  const technicianDirectoryShortcuts: ContactShortcut[] = [
    { id: "all", title: "全部", caption: "查看全部", icon: "all", tone: "bg-[#171717] text-lemon" },
    { id: "new", title: "新朋友", caption: "3 个申请", icon: "new", tone: "bg-[#171717] text-lemon" },
    { id: "group", title: "群聊", caption: "5 个群", icon: "group", tone: "bg-[#171717] text-lemon" },
    { id: "service", title: "服务号", caption: "4 个通知", icon: "service", tone: "bg-[#171717] text-lemon" },
    ...customDirectoryCategories.map((category) => ({
      id: category.id,
      title: category.title,
      caption: category.ruleTags.length === 0 ? "暂无规则" : `${category.ruleTags.length} 个标签`,
      icon: "add",
      tone: "bg-[#171717] text-lemon",
      badge: technicianContacts.filter((contact) => matchesCustomContactCategory(contact, category)).length
    })),
    { id: "custom-add", title: "添加自定义分类", caption: "新建分类", icon: "add", tone: "bg-[#171717] text-lemon" }
  ];
  const { followed: followedTechnicianContacts, regular: regularTechnicianContacts } = partitionDirectoryContacts(technicianContacts);
  const technicianBaseShortcutPanels: Record<string, { title: string; caption: string; items: ContactShortcutPanelItem[] }> = {
    new: {
      title: "新朋友申请",
      caption: "新来的顾客、同事和平台联系人会集中显示在这里。",
      items: [
        {
          id: "tech-new-customer",
          title: customers[2]?.name ?? activeCustomer.name,
          caption: "顾客申请 · 希望加入常用联系",
          meta: `${(customers[2]?.tags ?? activeCustomer.tags).slice(0, 2).join(" / ")} · ID ${customers[2]?.systemId ?? activeCustomer.systemId}`,
          avatar: customers[2]?.avatar ?? activeCustomer.avatar,
          badge: "顾客",
          to: getMessagePath("technician", getTechnicianCustomerConversationId(customers[2]?.id ?? activeCustomer.id), "/technician/contacts"),
          entityCardData: {
            ...buildUserInfoCardData(customers[2] ?? activeCustomer),
            detailPath: getScopedProfileDetailPath("technician", "user", customers[2]?.id ?? activeCustomer.id)
          },
          entityCardVariant: "compact" as const
        },
        {
          id: "tech-new-staff",
          title: "门店排班员",
          caption: "同事申请 · 需要同步本周排班",
          meta: "门店排班、培训通知与当日协作",
          icon: "staff",
          badge: "同事",
          to: getMessagePath("technician", getTechnicianStaffConversationId(technicians[1]?.id ?? technicians[0].id), "/technician/contacts")
        },
        {
          id: "tech-new-support",
          title: "NeeDo 技师支持",
          caption: "平台申请 · 开启技师协作与售后入口",
          meta: "处理申诉、售后、风控和账号协助",
          icon: "service",
          badge: "平台",
          to: getMessagePath("technician", getTechnicianSupportConversationId(), "/technician/contacts")
        }
      ]
    },
    group: {
      title: "群聊",
      caption: "常用工作群与临时协作群统一放在这里。",
      items: [
        {
          id: "tech-group-shift",
          title: "今日排班群",
          caption: "6 人 · 同步门店排班与上钟安排",
          meta: "店长、排班员、当班技师",
          icon: "group",
          badge: "群聊",
          to: "/technician/messages"
        },
        {
          id: "tech-group-night",
          title: "夜班联络群",
          caption: "5 人 · 深夜预约与安全联络",
          meta: "夜班技师、门店支持、平台客服",
          icon: "group",
          badge: "群聊",
          to: "/technician/messages"
        }
      ]
    },
    service: {
      title: "服务号",
      caption: "平台客服、售后和应急支持入口集中在这里。",
      items: [
        {
          id: "tech-service-support",
          title: "NeeDo 客服",
          caption: "售后、申诉、风控和紧急协助",
          meta: "处理纠纷、改期、验证码问题与账号支援",
          icon: "service",
          badge: "服务号",
          to: getMessagePath("technician", getTechnicianSupportConversationId(), "/technician/contacts")
        },
        {
          id: "tech-service-store",
          title: "门店协作台",
          caption: "排班、请假、锁定与到店同步",
          meta: "门店工作联络入口，会同步到当前排班",
          icon: "service",
          badge: "服务号",
          to: getMessagePath("technician", getTechnicianStoreConversationId(), "/technician/contacts")
        }
      ]
    }
  };
  const technicianShortcutPanels: Record<string, { title: string; caption: string; items: ContactShortcutPanelItem[] }> = {
    all: {
      title: "全部分类",
      caption: "把所有快捷分类内容汇总在这里，方便一次查看。",
      items: Object.values(technicianBaseShortcutPanels).flatMap((panel) => panel.items)
    },
    ...technicianBaseShortcutPanels,
    ...Object.fromEntries(
      customDirectoryCategories.map((category) => [
        category.id,
        {
          title: category.title,
          caption: `命中标签：${category.ruleTags.join(" / ")}`,
          items: technicianContacts
            .filter((contact) => matchesCustomContactCategory(contact, category))
            .map((contact) => ({
              id: contact.id,
              title: contact.name,
              caption: contact.remark,
              meta: `${contact.meta}${contact.tags.length > 0 ? ` · ${contact.tags.join(" / ")}` : ""}`,
              avatar: contact.avatar,
              badge: contact.title,
              to: contact.to,
              entityCardData: contact.entityCardData,
              entityCardVariant: "compact" as const
            }))
        }
      ])
    )
  };

  useEffect(() => {
    const nextProfile = buildTechnicianProfile(baseTech, store.name);
    setTechProfile(nextProfile);

    if (!profileEditorOpen) {
      setProfileDraft(buildTechnicianProfileDraft(nextProfile, profileVisibility, defaultAreaSelection, defaultLineSelection));
    }
  }, [baseTech, defaultAreaSelection, defaultLineSelection, profileEditorOpen, profileVisibility, store.name]);

  useEffect(() => {
    if (scheduleScope === "day") {
      if (scheduleSelectedDate !== scheduleAnchorDate) {
        setScheduleSelectedDate(scheduleAnchorDate);
      }
      return;
    }

    if (scheduleSelectedDate && !rangeDates.includes(scheduleSelectedDate)) {
      setScheduleSelectedDate(null);
    }
  }, [rangeDates, scheduleAnchorDate, scheduleScope, scheduleSelectedDate]);

  useEffect(() => {
    if (scheduleDisplayMode !== "list" && scheduleDisplayMode !== scheduleScope) {
      setScheduleDisplayMode(scheduleScope);
    }
  }, [scheduleDisplayMode, scheduleScope]);

  useEffect(() => {
    if (activeView !== "workDetail" || searchParams.get("mode") !== "personal") {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("mode", "store");
    setSearchParams(nextParams, { replace: true });
  }, [activeView, searchParams, setSearchParams]);

  useEffect(() => {
    if (selectedTaskOrderSession.status !== "inService") {
      return;
    }

    const timer = window.setInterval(() => {
      setServiceSessionNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [selectedTaskOrderSession.status]);

  useEffect(() => {
    setExtensionRequestCollapsed(false);
  }, [selectedTaskOrderPendingExtensionRequest?.id]);

  const contact = (name: string, mode: "chat" | "phone") => {
    setContactLog(`${mode === "chat" ? "已打开聊天" : "已发起电话"}：${name}`);
  };

  const updateScheduleAnchorDate = (nextDate: string) => {
    setScheduleAnchorDate(nextDate);
    if (scheduleScope === "day") {
      setScheduleSelectedDate(nextDate);
      return;
    }

    if (scheduleSelectedDate && !getRangeDates(nextDate, scheduleScope).includes(scheduleSelectedDate)) {
      setScheduleSelectedDate(null);
    }
  };

  const changeScheduleScope = (nextScope: ScheduleScope) => {
    const nextBaseDate = nextScope === "day" ? (scheduleSelectedDate ?? scheduleAnchorDate) : scheduleAnchorDate;
    setScheduleScope(nextScope);
    setScheduleAnchorDate(nextBaseDate);
    setScheduleSelectedDate(nextScope === "day" ? nextBaseDate : null);
  };

  const changeScheduleDisplayMode = (nextMode: ScheduleDisplayMode) => {
    setScheduleDisplayMode(nextMode);

    if (nextMode === "list") {
      return;
    }

    changeScheduleScope(nextMode);
  };

  const openProfileEditor = () => {
    navigate("/technician/settings/profile");
  };

  const openDocumentUpload = () => {
    setKycDraft((current) => ({
      ...buildTechnicianKycDraft(techProfile),
      surname: current.surname,
      givenName: current.givenName,
      surnameKana: current.surnameKana,
      givenKana: current.givenKana,
      birthYear: current.birthYear,
      birthMonth: current.birthMonth,
      birthDay: current.birthDay,
      email: current.email,
      phone: current.phone,
      documentType: current.documentType,
      idFrontPreview: current.idFrontPreview,
      idFrontName: current.idFrontName,
      idBackPreview: current.idBackPreview,
      idBackName: current.idBackName,
      selfiePreview: current.selfiePreview || techProfile.avatar,
      selfieName: current.selfieName || kycCopy.selfieDefaultName,
      agreed: current.agreed
    }));
    setDocumentUploadOpen(true);
  };

  const saveProfile = () => {
    const nextProfile = {
      nickname: profileDraft.nickname.trim() || techProfile.nickname,
      legalName: techProfile.legalName,
      avatar: profileDraft.avatar.trim() || techProfile.avatar,
      gallery: profileDraft.gallery.slice(0, 5),
      identityLabel: profileDraft.identityLabel,
      age: profileDraft.age.trim() || techProfile.age,
      height: profileDraft.height.trim() || techProfile.height,
      bio: profileDraft.bio.trim() || techProfile.bio,
      languages: [...profileDraft.languages],
      tags: [...profileDraft.tags],
      serviceAreas: [...profileDraft.serviceAreas],
      canServeForeigners: profileDraft.canServeForeigners,
      bidBudgetMin: profileDraft.bidBudgetMin,
      bidBudgetMax: profileDraft.bidBudgetMax,
      paymentMethods: [...profileDraft.paymentMethods]
    };

    setTechProfile(nextProfile);
    updateTechnicianEntity(baseTech.id, {
      avatar: nextProfile.avatar,
      gallery: nextProfile.gallery,
      languages: [...nextProfile.languages],
      serviceAreas: [...nextProfile.serviceAreas],
      nickname: nextProfile.nickname,
      bio: nextProfile.bio,
      age: nextProfile.age,
      height: nextProfile.height,
      identityLabel: nextProfile.identityLabel,
      profileTags: [...nextProfile.tags],
      canServeForeigners: nextProfile.canServeForeigners,
      bidBudgetMin: nextProfile.bidBudgetMin,
      bidBudgetMax: nextProfile.bidBudgetMax,
      paymentMethods: [...nextProfile.paymentMethods]
    });

    if (linkedCustomer && linkedCustomer.accountUsername && linkedCustomer.accountUsername === baseTech.accountUsername) {
      updateCustomerEntity(linkedCustomer.id, {
        avatar: nextProfile.avatar,
        nickname: nextProfile.nickname,
        age: nextProfile.age,
        height: nextProfile.height,
        languages: [...nextProfile.languages],
        bio: nextProfile.bio
      });
    }

    setProfileVisibility(profileDraft.visibility);
    setProfileEditorOpen(false);
    setContactLog("技师资料已保存，信息卡与分享资料已同步更新。");
  };

  const handleAvatarUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        return;
      }

      setProfileDraft((current) => ({ ...current, avatar: reader.result as string }));
      setContactLog(`已上传头像：${file.name}`);
    };

    reader.readAsDataURL(file);
  };

  const handleKycImageUpload = (field: "idFront" | "idBack" | "selfie", event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        return;
      }

      setKycDraft((current) => ({
        ...current,
        ...(field === "idFront"
          ? { idFrontPreview: reader.result as string, idFrontName: file.name }
          : field === "idBack"
            ? { idBackPreview: reader.result as string, idBackName: file.name }
            : { selfiePreview: reader.result as string, selfieName: file.name })
      }));
      setContactLog(`已选择本人确认文件：${file.name}`);
    };

    reader.readAsDataURL(file);
  };

  const submitKycDraft = () => {
    if (!kycDraft.agreed || !kycDraft.idFrontPreview || !kycDraft.idBackPreview || !kycDraft.selfiePreview || kycDraft.documentType === "none") {
      setContactLog(kycCopy.incomplete);
      return;
    }

    setDocumentUploadOpen(false);
    setContactLog(`${kycCopy.submitted} ${kycDraft.surname || "—"} ${kycDraft.givenName || ""} / ${kycDocumentTypeLabels[kycDraft.documentType as KycDocumentTypeValue]}`);
  };

  const toggleDraftLanguage = (language: string) => {
    setProfileDraft((current) => ({
      ...current,
      languages: current.languages.includes(language)
        ? current.languages.filter((item) => item !== language)
        : [...current.languages, language]
    }));
  };

  const toggleDraftPaymentMethod = (method: TechnicianPaymentOption) => {
    setProfileDraft((current) => ({
      ...current,
      paymentMethods: current.paymentMethods.includes(method)
        ? current.paymentMethods.filter((item) => item !== method)
        : [...current.paymentMethods, method]
    }));
  };

  const toggleDraftTag = (tag: string) => {
    setProfileDraft((current) => ({
      ...current,
      tags: current.tags.includes(tag)
        ? current.tags.filter((item) => item !== tag)
        : [...current.tags, tag]
    }));
  };

  const addServiceAreaToDraft = () => {
    const nextArea = simplifyServiceArea(profileDraft.selectedArea);

    setProfileDraft((current) => ({
      ...current,
      serviceAreas: current.serviceAreas.includes(nextArea) ? current.serviceAreas : [...current.serviceAreas, nextArea]
    }));
  };

  const addLineServiceAreaToDraft = () => {
    setProfileDraft((current) => ({
      ...current,
      serviceAreas: Array.from(
        new Set([
          ...current.serviceAreas,
          ...current.selectedStations.map((station) => simplifyServiceArea(station))
        ])
      )
    }));
  };

  const toggleDraftStation = (station: string) => {
    setProfileDraft((current) => ({
      ...current,
      selectedStations: current.selectedStations.includes(station)
        ? current.selectedStations.filter((item) => item !== station)
        : [...current.selectedStations, station]
    }));
  };

  const removeServiceAreaFromDraft = (area: string) => {
    setProfileDraft((current) => ({
      ...current,
      serviceAreas: current.serviceAreas.filter((item) => item !== area)
    }));
  };

  const openScheduleSetup = (type: TechnicianScheduleSetupType) => {
    setScheduleSetupType(type);
    setScheduleSetupOpen(true);
  };

  const openDayScheduleEditor = (
    type: DayScheduleAdjustmentType,
    date: string,
    startTime: string,
    endTime: string
  ) => {
    setDayScheduleEditor({
      type,
      date,
      startTime,
      endTime
    });
  };

  const openDayScheduleEditorForHour = (hour: number) => {
    const targetDate = timelineBaseDate ?? scheduleAnchorDate;

    if (targetDate < todayDate) {
      setContactLog("过去的时段无法新增或修改。");
      return;
    }

    openDayScheduleEditor("travel", targetDate, `${String(hour).padStart(2, "0")}:00`, getDefaultSlotEndTime(hour));
  };

  const openDayScheduleEditorForEvent = (event: TechnicianScheduleEvent) => {
    if (event.date < todayDate) {
      setContactLog("过去的行程无法修改。");
      return;
    }

    const defaultStartTime = event.endTime === "23:59" ? event.startTime : event.endTime;
    const defaultEndTime = event.endTime === "23:59" ? "23:59" : addClockMinutes(event.endTime, 30);

    openDayScheduleEditor("travel", event.date, defaultStartTime, defaultEndTime);
  };

  const openWorkDetail = () => {
    const nextSearchParams = new URLSearchParams({
      mode: "store",
      scope: scheduleScope,
      date: workDetailBaseDate
    });

    navigate(`/technician/work-detail?${nextSearchParams.toString()}`);
  };

  const updateWorkDetailRoute = (updates: Partial<{ scope: WorkDetailScope; date: string }>) => {
    const nextScope = updates.scope ?? routeWorkDetailScope;
    const nextDate = updates.date ?? routeWorkDetailDate;

    setSearchParams({
      mode: "store",
      scope: nextScope,
      date: nextDate
    });
  };

  const updateTechnicianMeTab = (nextTab: TechnicianMeTab) => {
    const nextParams = new URLSearchParams(searchParams);

    if (nextTab === "info") {
      nextParams.delete("meTab");
    } else {
      nextParams.set("meTab", nextTab);
    }

    setSearchParams(nextParams);
  };

  const applyScheduleSetup = (config: TechnicianScheduleSetupConfig) => {
    const targetDates = getOneClickTargetDates(parseDate(scheduleAnchorDate), config);
    const planMeta = technicianPlanMeta[config.type];
    const nextSchedules = targetDates.flatMap((dateKey, dateIndex) => (
      config.slots.map((slot, slotIndex) => ({
        id: `tech-plan-${config.type}-${dateKey}-${slot.id}-${dateIndex}-${slotIndex}-${Date.now()}`,
        staffId: baseTech.id,
        date: dateKey,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: planMeta.status
      }))
    ));

    addSharedSchedules(nextSchedules);
    nextSchedules.forEach((schedule) => {
      updateSharedSchedulePlanTag(schedule.id, config.type === "availability" ? "expected" : config.type);
    });

    if (config.type === "availability" && config.slots.length > 0) {
      const sortedSlots = [...config.slots].sort((left, right) => left.startTime.localeCompare(right.startTime));
      const mergedWindow = {
        startTime: sortedSlots[0].startTime,
        endTime: [...sortedSlots].sort((left, right) => right.endTime.localeCompare(left.endTime))[0].endTime
      };

      targetDates.forEach((dateKey) => {
        updateSharedAvailabilityWindow(baseTech.id, dateKey, mergedWindow);
      });
    }

    updateScheduleAnchorDate(targetDates[0] ?? scheduleAnchorDate);
    setScheduleSetupOpen(false);
    setContactLog(`${planMeta.title} 已同步到共享排班仓库：${targetDates.length} 天，共 ${nextSchedules.length} 段时段。`);
  };

  const saveDayScheduleEditor = () => {
    if (!dayScheduleEditor) {
      return;
    }

    if (clockToMinutes(dayScheduleEditor.endTime) <= clockToMinutes(dayScheduleEditor.startTime)) {
      setContactLog("结束时间需要晚于开始时间。");
      return;
    }

    const nextId = `tech-${dayScheduleEditor.type}-${dayScheduleEditor.date}-${dayScheduleEditor.startTime.replace(":", "")}-${Date.now()}`;

    addSharedSchedules([
      {
        id: nextId,
        staffId: baseTech.id,
        date: dayScheduleEditor.date,
        startTime: dayScheduleEditor.startTime,
        endTime: dayScheduleEditor.endTime,
        status: "blocked"
      }
    ]);
    updateSharedSchedulePlanTag(nextId, dayScheduleEditor.type === "travel" ? "expectedTravel" : "expectedBreak");
    updateScheduleAnchorDate(dayScheduleEditor.date);
    setDayScheduleEditor(null);
    setContactLog(
      `${dayScheduleEditor.type === "travel" ? "预计移动时间" : "预计休息时间"}已加入共享排班：${dayScheduleEditor.date} ${dayScheduleEditor.startTime}-${dayScheduleEditor.endTime}。确认后会转成正式时段。`
    );
  };

  const confirmEstimatedDaySchedule = (event: TechnicianScheduleEvent) => {
    if (!event.planType || !isEstimatedSchedulePlanType(event.planType)) {
      return;
    }

    updateSharedSchedulePlanTag(event.id, getConfirmedPlanType(event.planType));
    setContactLog(`${event.planType === "expectedTravel" ? "预计移动时间" : "预计休息时间"}已确认并转成正式时段。`);
  };

  const cancelEstimatedDaySchedule = (event: TechnicianScheduleEvent) => {
    if (!event.planType || !isEstimatedSchedulePlanType(event.planType)) {
      return;
    }

    removeSharedSchedule(event.id);
    setContactLog(`${event.planType === "expectedTravel" ? "预计移动时间" : "预计休息时间"}已取消并从共享排班中删除。`);
  };

  const shareNextJob = (contactItem: TechnicianContact) => {
    setJobShareOpen(false);
    setContactLog(`已把下一单服务卡和定位追迹信息分享给 ${contactItem.name}。`);
  };

  const openTaskOrderDetails = (order: Order) => {
    setSelectedTaskOrder(order);
    setServiceCode("");
    setCodeError("");
    setTaskOrderEndConfirmOpen(false);
    setTechnicianServiceReviewOpen(false);
  };

  const handleTaskCardClick = (event: ReactMouseEvent<HTMLElement>, order: Order) => {
    if (isInteractiveTaskCardTarget(event.target)) {
      return;
    }

    openTaskOrderDetails(order);
  };

  const handleTaskCardKeyDown = (event: ReactKeyboardEvent<HTMLElement>, order: Order) => {
    if (isInteractiveTaskCardTarget(event.target)) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openTaskOrderDetails(order);
    }
  };

  const openServiceCodeModal = (order: Order) => {
    setServiceCodeTargetOrderId(order.id);
    setServiceCode("");
    setCodeError("");
    setCodeModalOpen(true);
  };

  const requestTaskOrderChange = (order: Order) => {
    setOrderContactLog(`已为 ${order.itemName} 发起预约变更申请：`, order, "，系统会同步给用户和门店担当。");
  };

  const requestTaskOrderCancel = (order: Order) => {
    setOrderContactLog(`已为 ${order.itemName} 提交取消处理申请：`, order, "。");
  };

  const focusTaskOrderServiceCodeInput = () => {
    window.requestAnimationFrame(() => {
      taskOrderCodeSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      taskOrderCodeInputRef.current?.focus({ preventScroll: true });
    });
  };

  const submitServiceCode = (targetOrder: Order) => {
    if (!serviceCode.trim()) {
      setCodeError("请输入服务验证码后再开始服务。");
      setOrderContactLog(`${targetOrder.itemName} 服务验证码未输入，无法开始服务：`, targetOrder, "。");

      if (selectedTaskOrder?.id === targetOrder.id) {
        focusTaskOrderServiceCodeInput();
      }

      return;
    }

    if (serviceCode.trim() !== getServiceStartCode(targetOrder.id)) {
      setCodeError("验证码不正确，请让用户在用户端订单详情中出示验证码后再开始服务。");
      setOrderContactLog(`${targetOrder.itemName} 服务验证码不正确，开始服务已阻止：`, targetOrder, "。");
      return;
    }

    setCodeModalOpen(false);
    setServiceCodeTargetOrderId(null);
    setCodeError("");
    setServiceCode("");
    startOrderService(targetOrder.id, getOrderEstimatedDurationMinutes(targetOrder));
    setServiceSessionNow(Date.now());
    setStatus("服务中");
    setOrderContactLog(`${targetOrder.itemName} 验证码通过，服务已开始并写入状态记录：`, targetOrder, "。");
  };

  const finishTaskOrderService = (targetOrder: Order) => {
    endOrderService(targetOrder.id, getOrderEstimatedDurationMinutes(targetOrder));
    setTaskOrderEndConfirmOpen(false);
    setTechnicianServiceReviewOpen(true);
    setServiceSessionNow(Date.now());
    setStatus("出勤");
    setOrderContactLog(`${targetOrder.itemName} 已标记服务结束，状态已同步给用户端：`, targetOrder, "。");
  };

  const requestFinishTaskOrderService = (targetOrder: Order) => {
    if (selectedTaskOrderRemainingSeconds > 0) {
      setTaskOrderEndConfirmOpen(true);
      return;
    }

    finishTaskOrderService(targetOrder);
  };

  const closeTechnicianServiceReview = () => {
    if (!selectedTaskOrder) {
      return;
    }

    dismissOrderServiceReview(selectedTaskOrder.id, selectedTaskOrderBaseDurationMinutes, "technician");
    setTechnicianServiceReviewOpen(false);
  };

  const respondTaskOrderExtension = (accepted: boolean) => {
    if (!selectedTaskOrder || !selectedTaskOrderPendingExtensionRequest) {
      return;
    }

    respondOrderExtensionRequest(
      selectedTaskOrder.id,
      selectedTaskOrderBaseDurationMinutes,
      selectedTaskOrderPendingExtensionRequest.id,
      accepted
    );
    setExtensionRequestCollapsed(false);
    setServiceSessionNow(Date.now());
    if (accepted) {
      setOrderContactLog(
        `已接受 ${selectedTaskOrderPendingExtensionRequest.title}，倒计时追加 ${selectedTaskOrderPendingExtensionRequest.durationMinutes} 分钟：`,
        selectedTaskOrder,
        "。"
      );
    } else {
      setOrderContactLog(
        `已拒绝 ${selectedTaskOrderPendingExtensionRequest.title}：`,
        selectedTaskOrder,
        "，用户端已收到无法提供追加服务的提示。"
      );
    }
  };

  const handleStatusSync = (nextStatus: WorkStatus) => {
    setStatus(nextStatus);

    const nextMessage =
      nextStatus === "出勤"
        ? "已同步为出勤，门店现在可以给你派单。"
        : nextStatus === "移动中"
          ? "已同步为移动中，门店和聊天页都会看到你正在前往。"
          : nextStatus === "服务中"
            ? "已同步为服务中，当前订单会进入履约状态。"
            : nextStatus === "休息"
              ? "已同步为休息，系统会暂缓新的派单。"
              : "已同步为退勤，门店派单会先停止。";

    setContactLog(nextMessage);
  };

  const renderScheduledTimelineRows = (events: TechnicianScheduleEvent[]) => {
    const conflictRangesByEvent = getConflictRangesByEvent(events);

    return (
      <div className={cn("overflow-hidden rounded-[22px] border", dayTimelineShellClass)}>
        {events.map((event, index) => {
          const isEstimatedAdjustment = isEstimatedSchedulePlanType(event.planType);
          const eventCardClassName = getDayTimelineEventCardClassName(event, isNight);
          const eventStatusTone = getDayTimelineEventStatusTone(event);
          const conflictRanges = conflictRangesByEvent[event.id] ?? [];
          const eventStartMinutes = clockToMinutes(event.startTime);
          const eventEndMinutes = clockToMinutes(event.endTime);
          const eventDurationMinutes = Math.max(30, eventEndMinutes - eventStartMinutes);

          return (
            <div className={cn("grid grid-cols-[84px,1fr]", index !== events.length - 1 && "border-b", dayTimelineRowClass)} key={event.id}>
              <div className={cn("border-r px-3 py-4", dayTimelineHourColumnClass)}>
                <strong className="block text-[20px] font-black leading-none">{event.startTime}</strong>
                <span className={cn("mt-2 block text-xs font-bold", isNight ? "text-[#f7ead0]/65" : "text-ink/55")}>{event.endTime}</span>
              </div>

              <div className="p-3">
                <button
                  className={cn(
                    "relative w-full overflow-hidden rounded-[20px] border p-4 text-left shadow-panel",
                    eventCardClassName
                  )}
                  onClick={() => openDayScheduleEditorForEvent(event)}
                  type="button"
                >
                  {conflictRanges.length > 0 ? (
                    <div className="absolute inset-x-3 top-2 h-2 rounded-full bg-white/10">
                      {conflictRanges.map((range, rangeIndex) => {
                        const overlapStart = Math.max(range.start, eventStartMinutes);
                        const overlapEnd = Math.min(range.end, eventEndMinutes);
                        const left = ((overlapStart - eventStartMinutes) / eventDurationMinutes) * 100;
                        const width = ((overlapEnd - overlapStart) / eventDurationMinutes) * 100;

                        return (
                          <span
                            className="absolute top-0 h-full rounded-full bg-[#ff6464]"
                            key={`${event.id}-scheduled-conflict-${rangeIndex}`}
                            style={{ left: `${left}%`, width: `${Math.max(width, 8)}%` }}
                          />
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={event.workMode === "store" ? "green" : "yellow"}>{workModeLabels[event.workMode]}</Badge>
                        <Badge tone={eventStatusTone}>{getScheduleStatusLabel(event)}</Badge>
                        {isEstimatedAdjustment ? <Badge tone="neutral">待确认</Badge> : null}
                        {conflictRanges.length > 0 ? <Badge tone="red">撞车</Badge> : null}
                      </div>
                      <h3 className="mt-2 text-sm font-black leading-5">{event.title}</h3>
                      <p className="mt-1 text-xs font-bold opacity-75">
                        {event.startTime} - {event.endTime} · {event.place}
                      </p>
                    </div>
                    <strong className="text-xs font-black">{event.amount ? yen(event.amount) : "无收入"}</strong>
                  </div>
                  <p className="mt-2 text-xs leading-5 opacity-80">{event.customer} · {event.note}</p>
                  {conflictRanges.length > 0 ? (
                    <p className="mt-2 text-[11px] font-black text-[#ff7c7c]">
                      冲突时段：{conflictRanges.map((range) => formatMinutesRange(range.start, range.end)).join(" / ")}
                    </p>
                  ) : null}
                  {isEstimatedAdjustment ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        className={cn(isNight ? "bg-[#e8c46c] text-[#14110b]" : "bg-[#43a07b] text-white")}
                        size="sm"
                        onClick={(eventTarget) => {
                          eventTarget.stopPropagation();
                          confirmEstimatedDaySchedule(event);
                        }}
                      >
                        确定
                      </Button>
                      <Button
                        className={cn(isNight ? "border-[#8f5550] text-[#ffb1aa] hover:border-[#a45b55]" : "border-[#efc1c6] text-[#cf6572] hover:border-[#d97f8c]")}
                        size="sm"
                        variant="secondary"
                        onClick={(eventTarget) => {
                          eventTarget.stopPropagation();
                          cancelEstimatedDaySchedule(event);
                        }}
                      >
                        取消
                      </Button>
                    </div>
                  ) : null}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (activeView === "workDetail") {
    const workDetailStepDays = routeWorkDetailScope === "month" ? 31 : routeWorkDetailScope === "week" ? 7 : 1;

    return (
      <PageScaffold contentClassName="space-y-4 pb-28" navItems={technicianNavItems}>
        <AppTopBar
          backTo="/technician/me"
          subtitle={routeWorkDetailScopeLabel}
          title={`${workModeLabels[routeWorkDetailMode]}详细数据`}
        />

        <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
          <SectionTitle caption="已改成独立页面展示，切换范围后图表与明细会一起更新。" title="统计范围">
            <Badge tone={routeWorkDetailMode === "store" ? "green" : "yellow"}>{workModeLabels[routeWorkDetailMode]}</Badge>
          </SectionTitle>
          <div className="mt-4">
            <ScheduleViewSegmentedTabs onChange={(scope) => updateWorkDetailRoute({ scope })} value={routeWorkDetailScope} />
          </div>
          <div className="mt-3 grid grid-cols-[auto,1fr,auto] gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => updateWorkDetailRoute({ date: addDays(routeWorkDetailDate, -workDetailStepDays) })}
            >
              前一段
            </Button>
            <input
              className="h-10 min-w-0 rounded-lg border border-line bg-paper px-3 text-center text-sm font-black outline-none"
              onChange={(event) => updateWorkDetailRoute({ date: event.target.value || routeWorkDetailDate })}
              type="date"
              value={routeWorkDetailDate}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => updateWorkDetailRoute({ date: addDays(routeWorkDetailDate, workDetailStepDays) })}
            >
              后一段
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
          <SectionTitle caption="历史数据为实线，未来安排为虚线，图表和统计会跟着范围一起切换。" title="收入趋势">
            <Badge tone={routeWorkDetailMode === "store" ? "green" : "yellow"}>{workModeLabels[routeWorkDetailMode]}</Badge>
          </SectionTitle>
          <div
            className={cn(
              "mt-4 rounded-[28px] border p-4",
              routeWorkDetailMode === "store"
                ? isNight
                  ? "border-[color:color-mix(in_srgb,var(--client-primary)_18%,transparent)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--client-surface)_82%,transparent),color-mix(in_srgb,var(--client-bg)_86%,var(--client-primary)_14%))]"
                  : "border-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--client-surface)_90%,var(--client-primary)_10%),color-mix(in_srgb,white_94%,var(--client-primary)_6%))]"
                : isNight
                  ? "border-[color:color-mix(in_srgb,var(--client-warm)_18%,transparent)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--client-surface)_82%,transparent),color-mix(in_srgb,var(--client-bg)_86%,var(--client-warm)_14%))]"
                  : "border-[color:color-mix(in_srgb,var(--client-warm)_14%,transparent)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--client-surface)_90%,var(--client-warm)_10%),color-mix(in_srgb,white_94%,var(--client-warm)_6%))]"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className={cn("text-[18px] font-black tracking-[-0.03em]", isNight ? "text-white" : "text-ink")}>{workModeLabels[routeWorkDetailMode]}</h3>
                <p className={cn("mt-1 text-xs leading-5", isNight ? "text-white/60" : "text-ink/55")}>{routeActiveModeDescription}</p>
              </div>
              <Badge tone="neutral">{routeWorkDetailScope === "day" ? "日视图" : routeWorkDetailScope === "week" ? "周视图" : "月视图"}</Badge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["收入", yen(routeWorkDetailIncome)],
                ["单量", `${routeWorkDetailBookedCount}`],
                ["工时", `${routeWorkDetailHours.toFixed(1)}h`],
                ["履约", `${routeWorkDetailCompletionRate}%`]
              ].map(([label, value]) => (
                <div
                  className={cn(
                    "rounded-[20px] border p-3",
                    isNight ? "border-transparent bg-white/[0.05]" : "border-black/5 bg-white"
                  )}
                  key={label}
                >
                  <p className={cn("text-[11px] font-bold", isNight ? "text-white/48" : "text-ink/45")}>{label}</p>
                  <strong className={cn("mt-1 block text-base font-black tracking-[-0.03em]", isNight ? "text-white" : "text-ink")}>{value}</strong>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {[
                { label: "可排班", value: `${routeWorkDetailAvailableCount} 段`, tone: "blue" as const },
                { label: "锁定 / 请假", value: `${routeWorkDetailBlockedCount} 段`, tone: "red" as const },
                { label: "客单价", value: routeWorkDetailBookedCount > 0 ? yen(routeWorkDetailAverageIncome) : "—", tone: "neutral" as const }
              ].map(({ label, value, tone }) => (
                <div
                  className={cn(
                    "rounded-[20px] border px-3 py-3",
                    isNight ? "border-transparent bg-white/[0.04]" : "border-black/5 bg-white"
                  )}
                  key={label}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn("text-[11px] font-bold", isNight ? "text-white/48" : "text-ink/45")}>{label}</p>
                    <Badge tone={tone}>{value}</Badge>
                  </div>
                </div>
              ))}
            </div>
            <div
              className={cn(
                "mt-3 rounded-[20px] border px-3 py-3 text-xs leading-5",
                isNight ? "border-transparent bg-white/[0.04] text-white/70" : "border-black/5 bg-white text-ink/58"
              )}
            >
              下一条安排：{routeActiveNextLabel}
            </div>
            <CompactWorkTrendPreview
              className={cn(
                "mt-4 shadow-none",
                routeWorkDetailMode === "store"
                  ? isNight
                    ? "border-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--client-surface)_76%,transparent),color-mix(in_srgb,var(--client-bg)_94%,transparent))]"
                    : "border-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),color-mix(in_srgb,white_92%,var(--client-primary)_8%))]"
                  : isNight
                    ? "border-[color:color-mix(in_srgb,var(--client-warm)_14%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--client-surface)_76%,transparent),color-mix(in_srgb,var(--client-bg)_94%,transparent))]"
                    : "border-[color:color-mix(in_srgb,var(--client-warm)_14%,transparent)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),color-mix(in_srgb,white_92%,var(--client-warm)_8%))]"
              )}
              color={routeWorkDetailMode === "store" ? "var(--client-primary)" : "var(--client-warm)"}
              formatter={(value) => yen(value)}
              isNight={isNight}
              label={routeWorkDetailScope === "day" ? "当日收入趋势" : routeWorkDetailScope === "week" ? "近7天收入趋势" : "本月收入趋势"}
              points={routeWorkTrendPoints}
              valueKey="income"
            />
          </div>
        </section>

        <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
          <SectionTitle caption="仅展示店铺工作的统计卡片，便于核对门店收入、排班和履约表现。" title="数据统计">
            <Badge tone={routeWorkDetailMode === "store" ? "green" : "yellow"}>{workModeLabels[routeWorkDetailMode]}</Badge>
          </SectionTitle>
          <div className="mt-3 grid gap-3">
            {routeVisibleComparisonCards.map((card) => (
              <WorkStatisticsCard
                active={card.mode === routeWorkDetailMode}
                availableCount={card.availableCount}
                completedCount={card.completedCount}
                description={`${store.name} 自动派单与店铺预约`}
                footer={`可查看 ${workModeLabels[card.mode]} 的日 / 周 / 月趋势、收入构成、工时分布、履约表现和详细工作记录。`}
                hours={card.hours}
                income={card.income}
                isNight={isNight}
                key={card.mode}
                mode={card.mode}
                onClick={() => updateWorkDetailRoute({})}
                scope={routeWorkDetailScope}
                trendPoints={card.trendPoints}
              />
            ))}
          </div>
        </section>

        <WorkTrendChart
          color={routeWorkDetailMode === "store" ? "var(--client-primary)" : "var(--client-warm)"}
          formatter={(value) => `${value.toFixed(1)}h`}
          points={routeWorkTrendPoints}
          title="工时趋势"
          valueKey="hours"
        />

        <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
          <SectionTitle caption="按当前范围展示收入、状态和地点，方便核对经营情况。" title="详细工作记录">
            <Badge tone="neutral">{routeWorkDetailEvents.length} 条</Badge>
          </SectionTitle>
          <div className="mt-4 space-y-3">
            {routeWorkDetailEvents.length > 0 ? routeWorkDetailEvents.map((event) => (
              <article className="rounded-lg bg-paper p-3" key={event.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={event.workMode === "store" ? "green" : "yellow"}>{workModeLabels[event.workMode]}</Badge>
                      <Badge tone={event.planType === "leave" ? "red" : event.planType === "availability" || event.status === "free" ? "blue" : event.status === "blocked" ? "red" : "green"}>
                        {getScheduleStatusLabel(event)}
                      </Badge>
                    </div>
                    <h3 className="mt-2 font-black">{event.title}</h3>
                    <p className="mt-1 text-xs text-ink/55">{event.date} · {event.startTime}-{event.endTime} · {event.place}</p>
                  </div>
                  <strong className="text-sm text-moss">{event.amount ? yen(event.amount) : "—"}</strong>
                </div>
                <div className="mt-3 rounded-lg bg-white px-3 py-2 text-xs leading-5 text-ink/55">
                  <strong className="text-ink">{event.customer}</strong>
                  <span> · {getEventDurationHours(event).toFixed(1)}h</span>
                  <p>{event.note}</p>
                </div>
              </article>
            )) : (
              <div className="rounded-lg bg-paper p-4 text-sm leading-6 text-ink/55">
                当前范围没有工作记录，可以切换日 / 周 / 月或调整日期查看别的时段。
              </div>
            )}
          </div>
        </section>

        {renderTechnicianStatusTimeline()}
      </PageScaffold>
    );
  }

  const technicianInfoCardSlides = useMemo<FeatureCarouselSlide[]>(
    () =>
      Array.from(new Set((techProfile.gallery.length > 0 ? techProfile.gallery : [techProfile.avatar]).filter(Boolean)))
        .slice(0, 5)
        .map((image, index) => ({
          id: `technician-info-${index + 1}`,
          image,
          title: techProfile.nickname,
          cta: "查看大图"
        })),
    [techProfile.avatar, techProfile.gallery, techProfile.nickname]
  );
  const scheduleTopTabs: Array<{ label: ReactNode; value: "mySchedule" | "planning" }> = [
    { label: "我的排班", value: "mySchedule" },
    {
      label: (
        <span className="inline-flex items-center justify-center gap-1">
          <span>排班设置</span>
          {hasSchedulePlanningNew ? <ScheduleNewBadge className="h-6 w-6 text-[7px]" /> : null}
        </span>
      ),
      value: "planning"
    }
  ];

  const scheduleTopControls = (
    <FloatingHomeHeader
      className="relative z-10"
      panelClassName="relative overflow-hidden"
    >
      <FeatureSegmentedTabs
        items={scheduleTopTabs}
        onChange={setSchedulePrimaryTab}
        value={schedulePrimaryTab}
        variant="header"
      />
      {schedulePrimaryTab === "mySchedule" ? (
        <ScheduleSearchField onChange={setScheduleSearchQuery} value={scheduleSearchQuery} />
      ) : null}
    </FloatingHomeHeader>
  );

  const schedulePlanningProgressCard = (
    <section className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.16)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] px-3.5 py-3 text-sm font-semibold text-[color:var(--client-muted)]">
        <span className="min-w-0 truncate">{getScheduleContextLabel(activeScheduleContext.context)}</span>
        <span className="min-w-0 truncate text-right">{activeScheduleContext.uiHints.primaryAction}</span>
      </div>
      <ol
        className="mt-3 isolate grid overflow-hidden rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)] px-2 py-3"
        style={{ gridTemplateColumns: `repeat(${schedulePlanningProgressSteps.length}, minmax(0, 1fr))` }}
      >
        {schedulePlanningProgressSteps.map((item, index) => {
          const active = index === activeSchedulePlanningStepIndex;
          const completed = index < activeSchedulePlanningStepIndex;

          return (
            <li className="relative min-w-0" key={`${item.step}-${item.value}`}>
              {index < schedulePlanningProgressSteps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute left-[calc(50%+18px)] right-[calc(-50%+18px)] top-[18px] h-0.5",
                    completed ? "bg-[color:var(--client-primary)]" : "bg-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)]"
                  )}
                />
              ) : null}
              <button
                aria-current={active ? "step" : undefined}
                aria-label={`切换到步骤 ${item.step}：${item.label}`}
                className="relative z-[1] flex w-full min-w-0 flex-col items-center rounded-[14px] px-1 py-1 text-center transition hover:bg-[color:color-mix(in_srgb,var(--client-elevated)_72%,transparent)]"
                onClick={() => updateSchedulePlanningStep(item.value)}
                type="button"
              >
                <span
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-full border text-sm font-black transition",
                    active
                      ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[#090806]"
                      : completed
                        ? "border-[color:color-mix(in_srgb,var(--client-primary)_44%,transparent)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)]"
                        : "border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] text-[color:var(--client-muted)]"
                  )}
                >
                  {item.step}
                </span>
                <strong
                  className={cn(
                    "mt-2 block w-full min-w-0 px-1 text-[11px] font-black leading-4",
                    active ? "text-[color:var(--client-text)]" : "text-[color:var(--client-muted)]"
                  )}
                >
                  {item.label}
                </strong>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );

  return (
    <MobileShell navItems={technicianNavItems} navPanelStyle={activeView === "me" ? "plain" : "default"}>
      {activeView === "tasks" ? (
        <FloatingHomeHeader
          panelClassName={floatingHeaderGlassPanelClassName}
        >
          <div className={floatingHeaderInnerClassName}>
            <SharedHomeHeader
              avatarAlt={techProfile.nickname}
              avatarLabel="打开我的页面"
              avatarSrc={techProfile.avatar}
              avatarTo="/technician/me"
              locationLabel={activeOrder?.area ? `东京 · ${activeOrder.area}` : "东京 · 新宿区"}
              locationTo="/technician/settings/service-range"
              settingsLabel="打开技师设置"
              settingsTo={technicianPortalConfig.settingsPath}
            />
          </div>
        </FloatingHomeHeader>
      ) : null}
      {activeView === "me" ? (
        <FloatingHomeHeader
          panelClassName="relative overflow-hidden"
          stacked
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Link className="shrink-0" to="/technician/me">
                <AvatarImage
                  alt={socialActor?.displayName ?? techProfile.nickname}
                  className="h-12 w-12 border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)]"
                  src={socialActor?.avatar ?? techProfile.avatar}
                />
              </Link>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="truncate text-[22px] font-black tracking-[-0.04em] text-[color:var(--client-text)] sm:text-[24px]">
                    {socialActor?.displayName ?? techProfile.nickname}
                  </h1>
                  {socialActor ? <VerificationBadge status={socialActor.verifiedStatus} /> : <Badge tone="green">已认证</Badge>}
                  {socialActor ? <IdentityBadge entityType={socialActor.entityType} /> : <Badge tone="yellow">技师</Badge>}
                </div>
                <p className="mt-1 text-[12px] font-semibold leading-none text-[color:var(--client-muted)]">
                  信息卡与数据中心
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center">
              <IconButton icon="settings" label="打开技师设置" to={technicianPortalConfig.settingsPath} />
            </div>
          </div>
          <FeatureSegmentedTabs
            items={[
              { label: "信息卡", value: "info" },
              { label: "数据中心", value: "data" }
            ]}
            onChange={(value) => updateTechnicianMeTab(value as TechnicianMeTab)}
            value={activeMeTab}
            variant="header"
          />
        </FloatingHomeHeader>
      ) : null}

      <div
        className={cn(
          activeView === "me"
            ? "space-y-0 pt-0"
            : activeView === "schedule"
              ? "w-full min-w-0 max-w-full overflow-x-hidden px-4 pb-4 pt-0 [overflow-x:clip]"
              : activeView === "tasks"
                ? "space-y-5 px-4 pb-4 pt-2"
                : "space-y-5 px-4 py-4",
          activeView === "schedule" &&
            (schedulePrimaryTab === "planning" && (schedulePlanningStep === "oneClick" || schedulePlanningStep === "manual")
              ? "pb-[calc(332px+env(safe-area-inset-bottom))]"
              : "pb-[calc(220px+env(safe-area-inset-bottom))]")
        )}
      >
        {activeView === "tasks" && (
          <>
            <section className="client-feature-panel overflow-hidden rounded-[24px] border text-white">
              <div className="relative p-4">
                <div className="client-feature-aura absolute inset-0" />
                <div className="relative">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="max-w-[190px] truncate text-[13px] font-semibold text-white/70">{dashboardStoreName}</p>
                        <span className="client-feature-pill-green inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold">
                          {dashboardIdentityTag}
                        </span>
                      </div>
                      <p className="mt-3 text-[12px] font-semibold text-white/52">本月收入</p>
                      <p className="mt-1 text-[30px] font-black tracking-[-0.05em] text-white">{yen(baseTech.income)}</p>
                    </div>
                    <button
                      className="sos-danger-action rounded-full px-3.5 py-2 text-xs font-black shadow-soft"
                      onClick={() => setContactLog("SOS 已通知门店、平台和紧急联系人，并开始追迹当前位置。")}
                      type="button"
                    >
                      SOS
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-3 rounded-[18px] border border-white/10 bg-white/[0.08] py-3 backdrop-blur">
                    {dashboardMetrics.map((item, index) => (
                      <div className={cn("min-w-0 px-2 text-center", index > 0 && "border-l border-white/10")} key={item.label}>
                        <p className="text-[10px] font-bold text-white/50">{item.label}</p>
                        <strong className="mt-1.5 block text-[15px] font-black tracking-[-0.03em] text-white">{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-line bg-white p-4 shadow-panel">
              <SectionTitle caption="把当前出勤状态同步给门店与调度，首页会高亮当前已同步状态。" title="状态同步">
                <Link
                  aria-label={hasSchedulePlanningNew ? "排班，有新的店铺排班要求" : "排班"}
                  className="focus-ring relative inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-transparent bg-[linear-gradient(180deg,color-mix(in_srgb,var(--client-primary)_96%,white_4%)_0%,var(--client-primary)_100%)] px-4 text-xs font-black text-[#090806] shadow-[0_14px_30px_color-mix(in_srgb,var(--client-primary)_30%,transparent)] transition hover:brightness-105 active:scale-[0.98]"
                  onClick={markScheduleRequirementsSeen}
                  to="/technician/schedule"
                >
                  <AppIcon className="h-4 w-4" name="calendar" />
                  排班
                  {hasSchedulePlanningNew ? <ScheduleNewBadge className="absolute -right-2 -top-2" /> : null}
                </Link>
              </SectionTitle>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {statusButtons.map((item) => {
                  const active = status === item;
                  const meta = statusButtonMeta[item];
                  const label = translateText(item, language);

                  return (
                    <button
                      className={cn(
                        "technician-work-status-button focus-ring flex min-h-[88px] min-w-0 flex-col items-center justify-center rounded-[20px] border px-1.5 py-3 text-center transition",
                        meta.toneClassName,
                        active ? "technician-work-status-button--active" : "technician-work-status-button--idle"
                      )}
                      key={item}
                      onClick={() => handleStatusSync(item)}
                      type="button"
                    >
                      <span className="technician-work-status-icon inline-flex h-9 w-9 items-center justify-center rounded-[14px] text-base font-black">{meta.icon}</span>
                      <span className="mt-2 flex min-h-[28px] w-full items-center justify-center overflow-hidden">
                        <span className={cn("w-full font-black leading-[14px] tracking-normal", getCompactStatusLabelClass(label))}>
                          {label}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 rounded-[20px] bg-paper px-4 py-3">
                <div>
                  <p className="text-[11px] font-bold text-ink/45">当前已同步状态</p>
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-1 text-sm font-black text-ink">
                    <span>{status}：</span>
                    <span className="text-[11px] font-bold leading-4 text-ink/55">{statusButtonMeta[status].caption}</span>
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-3 text-white">
              <div className="flex items-center justify-between gap-3">
                <TitleWithInfo
                  as="h2"
                  info="默认先看今天的仅排班展示，下一单会补充用户资料、地址、导航和沟通入口，也可以切回今日订单处理。"
                  label="今日安排 简介"
                  title="今日安排"
                  titleClassName="text-lg font-bold text-white"
                  variant="dark"
                />
              </div>

              <FeatureSegmentedTabs
                items={[
                  { label: "今日仅排班展示", value: "schedule" },
                  { label: "今日订单", value: "orders" }
                ]}
                onChange={setTasksPanelTab}
                value={tasksPanelTab}
              />

              {tasksPanelTab === "schedule" ? (
                <div className="space-y-3">
                  <article
                    className="focus-ring cursor-pointer overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] shadow-[0_18px_36px_rgba(0,0,0,0.2)] transition hover:border-white/20 hover:bg-white/[0.07]"
                    onClick={(event) => handleTaskCardClick(event, nextServiceOrder)}
                    onKeyDown={(event) => handleTaskCardKeyDown(event, nextServiceOrder)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="relative p-4">
                      <div className="client-feature-aura client-feature-aura--soft absolute inset-0" />
                      <div className="relative">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap gap-2">
                              {isCurrentServiceFocused ? (
                                <Badge className={getTaskPanelBadgeClassName(currentServiceStageTone)} tone={currentServiceStageTone}>
                                  {currentServiceStageLabel}
                                </Badge>
                              ) : (
                                <>
                                  <Badge className={getTaskPanelBadgeClassName("blue")} tone="blue">
                                    {nextBookedScheduleEvent ? "下一单" : "最近一单"}
                                  </Badge>
                                  <Badge className={getTaskPanelBadgeClassName(nextServiceCountdown.tone)} tone={nextServiceCountdown.tone}>
                                    {nextServiceCountdown.label}
                                  </Badge>
                                </>
                              )}
                              <Badge className={getTaskPanelBadgeClassName("neutral")} tone="neutral">
                                {nextServiceOrder.mode === "home" ? "上门服务" : "到店服务"}
                              </Badge>
                            </div>
                            <h3 className="mt-3 text-[18px] font-black tracking-[-0.03em] text-white">
                              {nextServiceJob?.serviceContent ?? nextServiceOrder.itemName}
                            </h3>
                            <p className="mt-2 text-xs leading-5 text-white/60">开始时间：{nextServiceTime}</p>
                            {nextServiceEstimatedEndTime ? (
                              <p className="text-xs leading-5 text-white/60">预计结束：{nextServiceEstimatedEndTime}</p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            {isCurrentServiceFocused ? (
                              <div className="flex items-center gap-1.5">
                                <Link
                                  aria-label="联系用户"
                                  className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/32 text-white shadow-[0_10px_24px_rgba(0,0,0,0.24)] backdrop-blur-md transition hover:bg-white/16 active:scale-[0.96]"
                                  to={getMessagePath("technician", getTechnicianCustomerConversationId(nextServiceOrder.customerId), "/technician/tasks")}
                                >
                                  <AppIcon className="h-4 w-4" name="chat" />
                                </Link>
                                <button
                                  aria-label="转发服务卡"
                                  className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/32 text-white shadow-[0_10px_24px_rgba(0,0,0,0.24)] backdrop-blur-md transition hover:bg-white/16 active:scale-[0.96]"
                                  onClick={() => shareTaskOrder(nextServiceOrder)}
                                  type="button"
                                >
                                  <AppIcon className="h-4 w-4" name="share" />
                                </button>
                                <button
                                  aria-label="取消处理"
                                  className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#ff8b7f]/60 bg-[linear-gradient(180deg,#ff7f72_0%,#ff5f58_52%,#ef3f3a_100%)] text-white shadow-[0_10px_24px_rgba(255,78,70,0.32)] transition hover:brightness-105 active:scale-[0.96]"
                                  onClick={() => requestTaskOrderCancel(nextServiceOrder)}
                                  type="button"
                                >
                                  <AppIcon className="h-4 w-4" name="close" />
                                </button>
                              </div>
                            ) : null}
                            <div className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,transparent)] px-4 py-3 text-right text-[color:var(--client-text)] shadow-soft">
                              <p className="text-[10px] font-bold text-[color:var(--client-muted)]">预估收入</p>
                              <strong className="mt-1 block text-[18px] font-black text-[color:var(--client-accent-text)]">
                                {yen(nextServiceJob?.quote ?? nextServiceOrder.amount)}
                              </strong>
                            </div>
                          </div>
                        </div>

                        <SocialProfileMiniCard
                          actionLabel="好友"
                          className="mt-4"
                          customer={nextServiceCustomer}
                          dark
                          onOpenDetails={() => openTaskOrderDetails(nextServiceOrder)}
                        />

                        <div className="mt-3 rounded-[20px] border border-white/10 bg-white/[0.06] px-4 py-3">
                          <p className="text-[11px] font-bold text-white/45">服务地址</p>
                          <p className="mt-1 text-sm font-black text-white">{nextServiceAddress}</p>
                        </div>

                        {isCurrentServiceFocused ? (
                          <div className="mt-4 grid grid-cols-3 gap-2">
                            <button
                              className="focus-ring inline-flex h-10 items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.06] text-sm font-black text-white transition hover:bg-white/[0.1]"
                              onClick={() => handleStatusSync("移动中")}
                              type="button"
                            >
                              移动
                            </button>
                            <a
                              className="focus-ring inline-flex h-10 items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.06] text-sm font-black text-white transition hover:bg-white/[0.1]"
                              href={googleRouteUrl(nextServiceAddress)}
                              rel="noreferrer"
                              target="_blank"
                            >
                              导航
                            </a>
                            <button
                              className="focus-ring inline-flex h-10 items-center justify-center rounded-[16px] bg-[color:var(--client-primary)] px-3 text-sm font-black text-[#090806] transition hover:brightness-95"
                              onClick={() => openServiceCodeModal(nextServiceOrder)}
                              type="button"
                            >
                              开始服务
                            </button>
                          </div>
                        ) : (
                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <a
                              className="focus-ring inline-flex h-10 items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.06] text-sm font-black text-white transition hover:bg-white/[0.1]"
                              href={googleRouteUrl(nextServiceAddress)}
                              rel="noreferrer"
                              target="_blank"
                            >
                              打开导航
                            </a>
                            <Link
                              className="focus-ring inline-flex h-10 items-center justify-center rounded-[16px] bg-[color:var(--client-primary)] px-3 text-sm font-black text-[#090806] transition hover:brightness-95"
                              to={getMessagePath("technician", getTechnicianCustomerConversationId(nextServiceOrder.customerId), "/technician/tasks")}
                            >
                              用户聊天
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>

                  {secondaryNextServiceOrder ? (
                    <article
                      className="focus-ring cursor-pointer overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] shadow-[0_18px_36px_rgba(0,0,0,0.2)] transition hover:border-white/20 hover:bg-white/[0.07]"
                      onClick={(event) => handleTaskCardClick(event, secondaryNextServiceOrder)}
                      onKeyDown={(event) => handleTaskCardKeyDown(event, secondaryNextServiceOrder)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="relative p-4">
                        <div className="client-feature-aura client-feature-aura--soft absolute inset-0" />
                        <div className="relative">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap gap-2">
                                <Badge className={getTaskPanelBadgeClassName("blue")} tone="blue">
                                  下一单
                                </Badge>
                                <Badge className={getTaskPanelBadgeClassName("neutral")} tone="neutral">
                                  {secondaryNextServiceOrder.mode === "home" ? "上门服务" : "到店服务"}
                                </Badge>
                              </div>
                              <h3 className="mt-3 text-[18px] font-black tracking-[-0.03em] text-white">
                                {secondaryNextServiceJob?.serviceContent ?? secondaryNextServiceOrder.itemName}
                              </h3>
                              <p className="mt-2 text-xs leading-5 text-white/60">开始时间：{secondaryNextServiceTime}</p>
                              {secondaryNextServiceEstimatedEndTime ? (
                                <p className="text-xs leading-5 text-white/60">预计结束：{secondaryNextServiceEstimatedEndTime}</p>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-2">
                              <div className="flex items-center gap-1.5">
                                <Link
                                  aria-label="联系用户"
                                  className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/32 text-white shadow-[0_10px_24px_rgba(0,0,0,0.24)] backdrop-blur-md transition hover:bg-white/16 active:scale-[0.96]"
                                  to={getMessagePath("technician", getTechnicianCustomerConversationId(secondaryNextServiceOrder.customerId), "/technician/tasks")}
                                >
                                  <AppIcon className="h-4 w-4" name="chat" />
                                </Link>
                                <button
                                  aria-label="转发服务卡"
                                  className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/32 text-white shadow-[0_10px_24px_rgba(0,0,0,0.24)] backdrop-blur-md transition hover:bg-white/16 active:scale-[0.96]"
                                  onClick={() => shareTaskOrder(secondaryNextServiceOrder)}
                                  type="button"
                                >
                                  <AppIcon className="h-4 w-4" name="share" />
                                </button>
                                <button
                                  aria-label="取消处理"
                                  className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#ff8b7f]/60 bg-[linear-gradient(180deg,#ff7f72_0%,#ff5f58_52%,#ef3f3a_100%)] text-white shadow-[0_10px_24px_rgba(255,78,70,0.32)] transition hover:brightness-105 active:scale-[0.96]"
                                  onClick={() => requestTaskOrderCancel(secondaryNextServiceOrder)}
                                  type="button"
                                >
                                  <AppIcon className="h-4 w-4" name="close" />
                                </button>
                              </div>
                              <div className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,transparent)] px-4 py-3 text-right text-[color:var(--client-text)] shadow-soft">
                                <p className="text-[10px] font-bold text-[color:var(--client-muted)]">预估收入</p>
                                <strong className="mt-1 block text-[18px] font-black text-[color:var(--client-accent-text)]">
                                  {yen(secondaryNextServiceJob?.quote ?? secondaryNextServiceOrder.amount)}
                                </strong>
                              </div>
                            </div>
                          </div>

                          <SocialProfileMiniCard
                            actionLabel="好友"
                            className="mt-4"
                            customer={secondaryNextServiceCustomer}
                            dark
                            onOpenDetails={() => openTaskOrderDetails(secondaryNextServiceOrder)}
                          />

                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <a
                              className="focus-ring inline-flex h-10 items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.06] text-sm font-black text-white transition hover:bg-white/[0.1]"
                              href={googleRouteUrl(secondaryNextServiceAddress)}
                              rel="noreferrer"
                              target="_blank"
                            >
                              打开导航
                            </a>
                            <button
                              className="focus-ring inline-flex h-10 items-center justify-center rounded-[16px] bg-[color:var(--client-primary)] px-3 text-sm font-black text-[#090806] transition hover:brightness-95"
                              onClick={() => openTaskOrderDetails(secondaryNextServiceOrder)}
                              type="button"
                            >
                              查看预约
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  ) : null}

                  <div className="space-y-3">
                    {todaySchedulePreviewEvents.length > 0 ? (
                      todaySchedulePreviewEvents.map((event) => (
                        <article className="rounded-[22px] border border-white/8 bg-white/[0.05] px-4 py-4" key={event.id}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap gap-2">
                                <Badge className={getTaskPanelBadgeClassName(getDayTimelineEventStatusTone(event))} tone={getDayTimelineEventStatusTone(event)}>
                                  {getScheduleStatusLabel(event)}
                                </Badge>
                                <Badge className={getTaskPanelBadgeClassName("neutral")} tone="neutral">
                                  {event.startTime} - {event.endTime}
                                </Badge>
                              </div>
                              <h3 className="mt-2 text-sm font-black text-white">{event.title}</h3>
                              <p className="mt-1 text-xs text-white/58">{event.place} · {event.customer}</p>
                              <p className="mt-2 text-xs leading-5 text-white/50">{event.note}</p>
                            </div>
                            <strong className="shrink-0 text-xs font-black text-white/72">{event.amount > 0 ? yen(event.amount) : "待派单"}</strong>
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="rounded-[16px] border border-white/[0.04] bg-white/[0.025] px-3 py-2.5 text-[11px] leading-5 text-white/45">
                        今天暂未写入新的排班安排，可以去排班里补充出勤、移动、休息或锁定时段。
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["pending", "待确认"],
                      ["done", "已收尾"]
                    ] as const).map(([value, label]) => (
                      <button
                        className={cn(
                          "flex w-full items-center justify-center rounded-full border px-3 py-2 text-sm font-black transition",
                          taskOrderTab === value
                            ? "border-transparent bg-[color:var(--client-primary)] text-[#090806]"
                            : "border-white/10 bg-white/[0.06] text-white/62 hover:bg-white/[0.1]"
                        )}
                        key={value}
                        onClick={() => setTaskOrderTab(value)}
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-3">
                    {visibleTaskOrders.map((order) => (
                      <div className="space-y-2" key={order.id}>
                        <OrderServiceMiniCard
                          contactTo={getMessagePath("technician", getTechnicianCustomerConversationId(order.customerId), "/technician/tasks")}
                          dark
                          onOpenDetails={() => openTaskOrderDetails(order)}
                          order={order}
                          provider={baseTech}
                          topTags={[{ label: getTaskOrderTabLabel(taskOrderTab), tone: getTaskOrderTabTone(taskOrderTab) }]}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {renderTechnicianStatusTimeline()}
          </>
        )}

        {activeView === "schedule" && (
          <>
            {scheduleTopControls}

            <div className={cn(scheduleThemeRootClass, "w-full min-w-0 max-w-full overflow-x-hidden [overflow-x:clip]")}>
              {schedulePrimaryTab === "mySchedule" ? (
                <div className="space-y-4">
                  <UnifiedUserCalendar currentTechnician={baseTech} displayMode="parallel" scope="technician" searchQuery={scheduleSearchQuery} />
                </div>
              ) : null}

              {schedulePrimaryTab === "planning" ? (
                <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden [overflow-x:clip]">
                  {schedulePlanningProgressCard}
                  <TechnicianShiftPlanningPanel
                    activeStep={effectiveSchedulePlanningStep}
                    onPlanningMethodChange={updateSchedulePlanningMethod}
                    onStepChange={updateSchedulePlanningStep}
                    selectedPlanningMethod={schedulePlanningMethod}
                    storeId={store.id}
                    technicianId={baseTech.id}
                  />
                </div>
              ) : null}
            </div>

            {renderTechnicianStatusTimeline("mt-4 mb-[calc(220px+env(safe-area-inset-bottom))]")}
          </>
        )}

        {activeView === "moments" && renderTechnicianStatusTimeline()}

        {activeView === "contacts" && (
          <>
            <ImScopeProvider scope="technician">
              <ImContactsListPage />
            </ImScopeProvider>
            {renderTechnicianStatusTimeline()}
          </>
        )}

        {activeView === "messages" && (
          <>
            <ImScopeProvider scope="technician">
              <ImMessagesEntryPage />
            </ImScopeProvider>
            {renderTechnicianStatusTimeline()}
          </>
        )}

        {activeView === "me" && (
          <>
            <div className="space-y-4 px-4 pb-32">
              {activeMeTab === "info" && (
                <>
                  <section className="overflow-hidden rounded-[28px] border border-line bg-white shadow-panel">
                    <div className="relative">
                      <FeatureCarousel cardHeightClassName="h-[248px]" slides={technicianInfoCardSlides} />
                    </div>
                    <div className="-mt-12 px-4 pb-5">
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <AvatarImage alt={techProfile.nickname} className="h-24 w-24 border-4 border-white shadow-soft" src={techProfile.avatar} />
                        <div className="flex flex-wrap gap-2">
                          <Button to={`/technician/profiles/technician/${baseTech.id}`} variant="secondary">
                            查看公开主页
                          </Button>
                          <Button onClick={openProfileEditor}>编辑信息卡</Button>
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-[30px] font-black tracking-[-0.04em] text-ink">{techProfile.nickname}</h2>
                          <Badge tone="green">已认证</Badge>
                          <Badge tone="yellow">{techProfile.identityLabel}</Badge>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-moss">ID：{baseTech.systemId}</p>
                        <p className="mt-3 text-sm leading-7 text-ink/70">{techProfile.bio}</p>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {techProfile.tags.concat(techProfile.languages).slice(0, 10).map((tag: string) => (
                          <span className="rounded-full bg-paper px-3 py-1.5 text-xs font-bold text-ink/65" key={tag}>
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[
                          ["身高", techProfile.height],
                          ["年龄", techProfile.age],
                          ["状态", status],
                          ["语言", techProfile.languages.slice(0, 2).join(" / ")]
                        ].map(([label, value]) => (
                          <div className="min-w-0 rounded-[18px] bg-paper p-3" key={label}>
                            <p className="text-[11px] text-ink/45">{label}</p>
                            <strong className="mt-1 block break-words text-sm">{value}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                    <SectionTitle caption="编辑时仍然使用当前全屏编辑模式，这里只负责预览和进入编辑。轮播图会跟公开主页顶部头图同步。" title="信息卡设置">
                      <Badge tone="green">{Math.max(techProfile.gallery.length, 1)} 张轮播图</Badge>
                    </SectionTitle>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <Button onClick={openProfileEditor}>打开编辑模式</Button>
                      <Button to="/technician/settings/profile" variant="secondary">进入设置页补充资料</Button>
                    </div>
                  </section>
                </>
              )}

              {activeMeTab === "data" && (
                <>
                  <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                    <SectionTitle caption="集中查看店铺工作的趋势、结算和下一单安排。" title="收入趋势">
                      <Badge tone="green">{workModeLabels[dataCenterWorkMode]}</Badge>
                    </SectionTitle>
                    <div className={cn("mt-4 rounded-[24px] border p-4", activeIncomeTrendShellClass)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className={cn("text-[18px] font-black tracking-[-0.03em]", isNight ? "text-white" : "text-ink")}>{dataCenterWorkProfile.title}</h3>
                          <p className={cn("mt-1 text-xs leading-5", isNight ? "text-white/60" : "text-ink/55")}>{dataCenterWorkProfile.caption}</p>
                        </div>
                        <Badge tone="neutral">{dataCenterWorkProfile.settlement}</Badge>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        {[
                          ["累计收入", dataCenterWorkProfile.income],
                          ["已完成", `${dataCenterWorkProfile.completed} 单`],
                          ["未来安排", `${dataCenterWorkProfile.future} 条`]
                        ].map(([label, value]) => (
                          <div className={cn("rounded-[18px] border p-3", activeIncomeMetricClass)} key={label}>
                            <p className={cn("text-[11px] font-bold", isNight ? "text-white/48" : "text-ink/45")}>{label}</p>
                            <strong className={cn("mt-1 block text-sm font-black", isNight ? "text-white" : "text-ink")}>{value}</strong>
                          </div>
                        ))}
                      </div>
                      <div className={cn("mt-3 rounded-[18px] border px-3 py-3 text-xs leading-5", activeIncomeNextClass)}>
                        下一条安排：{dataCenterWorkProfile.next}
                      </div>
                      <CompactWorkTrendPreview
                        className={cn("mt-3 shadow-none", activeIncomeChartClass)}
                        color={dataCenterWorkColor}
                        formatter={(value) => yen(value)}
                        isNight={isNight}
                        label="近7天收入趋势"
                        points={dataCenterWorkTrendPoints}
                        valueKey="income"
                      />
                    </div>
                  </section>

                  <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                    <SectionTitle caption="店铺工作的核心数据会显示在这里，点卡片进入完整详细页。" title="数据统计">
                      <Badge tone="green">{workModeLabels[dataCenterWorkMode]}</Badge>
                    </SectionTitle>
                    <div className="mt-3 grid gap-3">
                      {([dataCenterWorkMode] as TechWorkMode[]).map((mode) => {
                        const events = workAnalyticsEvents.filter((event) => event.workMode === mode);
                        const completed = events.filter((event) => event.status === "booked" && event.date <= todayDate);
                        const income = completed.reduce((sum, event) => sum + event.amount, 0);
                        const hours = completed.reduce((sum, event) => sum + getEventDurationHours(event), 0);
                        const available = events.filter((event) => event.planType === "availability" || event.status === "free").length;
                        const previewPoints = getWorkTrendPoints(getWorkDetailEvents(events, "week", todayDate), "week", todayDate);

                        return (
                          <WorkStatisticsCard
                            availableCount={available}
                            completedCount={completed.length}
                            description={`${store.name} 自动派单与店铺预约`}
                            footer={`可查看 ${workModeLabels[mode]} 的日 / 周 / 月趋势、收入构成、工时分布、履约表现和详细工作记录。`}
                            hours={hours}
                            income={income}
                            isNight={isNight}
                            key={mode}
                            mode={mode}
                            onClick={openWorkDetail}
                            scope="week"
                            trendPoints={previewPoints}
                          />
                        );
                      })}
                    </div>
                  </section>

                  <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                    <SectionTitle caption="最近的店铺工作会归档在这里，方便核对排班和收入记录。" title="详细工作记录">
                      <Badge tone="neutral">{recentWorkRecords.length} 条</Badge>
                    </SectionTitle>
                    <div className="mt-4 space-y-3">
                      {recentWorkRecords.map((event) => (
                        <article className="rounded-lg bg-paper p-3" key={event.id}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap gap-2">
                                <Badge tone={event.workMode === "store" ? "green" : "yellow"}>{workModeLabels[event.workMode]}</Badge>
                                <Badge tone={event.planType === "leave" ? "red" : event.planType === "availability" || event.status === "free" ? "blue" : event.status === "blocked" ? "red" : "green"}>
                                  {getScheduleStatusLabel(event)}
                                </Badge>
                              </div>
                              <h3 className="mt-2 text-sm font-black text-ink">{event.title}</h3>
                              <p className="mt-1 text-xs leading-5 text-ink/55">{event.date} · {event.startTime}-{event.endTime} · {event.place}</p>
                            </div>
                            <strong className="shrink-0 text-sm text-moss">{event.amount ? yen(event.amount) : "—"}</strong>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-ink/58">{event.customer} · {event.note}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                </>
              )}
              {renderTechnicianStatusTimeline()}
            </div>
          </>
        )}

        {profileEditorOpen && (
          <MobileFullscreenPage>
              <MobileFullscreenHeader
                action={(
                  <button
                    className="rounded-full bg-moss px-3 py-2 text-xs font-black text-white"
                    onClick={saveProfile}
                    type="button"
                  >
                    保存
                  </button>
                )}
                onClose={() => setProfileEditorOpen(false)}
                title="编辑技师资料"
              />
              <main className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <section className="rounded-lg bg-white p-4 shadow-panel">
                  {(() => {
                    const previewImages = Array.from(
                      new Set((profileDraft.gallery.length > 0 ? profileDraft.gallery : [profileDraft.avatar || techProfile.avatar]).filter(Boolean))
                    )
                      .slice(0, 5)
                      .map((image, index) => ({
                        id: `tech-profile-preview-${index + 1}`,
                        image,
                        title: profileDraft.nickname || techProfile.nickname,
                        cta: "查看大图"
                      }));

                    return previewImages.length > 0 ? <FeatureCarousel cardHeightClassName="h-[188px]" slides={previewImages} /> : null;
                  })()}
                  <div className="flex items-center gap-3">
                    <AvatarImage alt={profileDraft.nickname} className="h-20 w-20" src={profileDraft.avatar || techProfile.avatar} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-moss">实时预览</p>
                      <h3 className="mt-1 truncate text-lg font-black">{profileDraft.nickname || techProfile.nickname}</h3>
                      <p className="mt-1 text-xs text-ink/50">
                        {profileDraft.identityLabel} · {profileDraft.canServeForeigners ? "服务外国人" : "不服务外国人"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge tone={profileDraft.visibility === "privateAll" ? "neutral" : "yellow"}>
                          {getVisibilityLabel(profileDraft.visibility)}
                        </Badge>
                        <Badge tone="yellow">★ {baseTech.rating}</Badge>
                        <Badge tone="green">{Math.max(profileDraft.gallery.length, 1)} 张轮播图</Badge>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-lg bg-white p-4 shadow-panel">
                  <h3 className="font-black">基础资料</h3>
                  <div className="mt-3 grid gap-3">
                    <input accept="image/*" className="hidden" onChange={handleAvatarUpload} ref={avatarInputRef} type="file" />
                    <div className="rounded-lg border border-line bg-paper p-3">
                      <div className="flex items-center gap-3">
                        <AvatarImage alt={profileDraft.nickname} className="h-16 w-16" src={profileDraft.avatar || techProfile.avatar} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black">头像上传</p>
                          <p className="mt-1 text-xs leading-5 text-ink/50">支持从手机相册选择。真实姓名请在 KYC 验证中维护，不在这里编辑。</p>
                        </div>
                        <Button size="sm" variant="secondary" onClick={() => avatarInputRef.current?.click()}>
                          上传头像
                        </Button>
                      </div>
                    </div>
                    <ImageGalleryManager
                      coverHint="最多 5 张，保存后会同步到技师公开主页顶部轮播和【我的】-信息卡预览。"
                      description="编辑模式保持不变，只在这里补充轮播图设置。"
                      images={profileDraft.gallery}
                      label="信息卡轮播图"
                      maxImages={5}
                      onChange={(gallery) => setProfileDraft((current) => ({ ...current, gallery: gallery.slice(0, 5) }))}
                    />
                    <label>
                      <span className="mb-1 block text-xs font-bold text-ink/45">昵称</span>
                      <input
                        className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                        onChange={(event) => setProfileDraft((current) => ({ ...current, nickname: event.target.value }))}
                        value={profileDraft.nickname}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label>
                        <span className="mb-1 block text-xs font-bold text-ink/45">身份显示</span>
                        <select
                          className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                          onChange={(event) =>
                            setProfileDraft((current) => ({
                              ...current,
                              identityLabel: event.target.value as TechnicianProfile["identityLabel"]
                            }))}
                          value={profileDraft.identityLabel}
                        >
                          <option value="店铺所属技师">店铺所属技师</option>
                          <option value="个人技师">个人技师</option>
                        </select>
                      </label>
                      <div className="col-span-2">
                        <span className="mb-1 block text-xs font-bold text-ink/45">隐私模式</span>
                        <div className="grid gap-2">
                          {([
                            ["privateAll", "完全隐私模式", "除本人、平台审核与必要安全场景外，不对前台其他人显示。"],
                            ["limited", "仅对指定人 / 分类 / 群组可见", "仅你手动选择的对象可见，不向其关联联系人扩散。"],
                            ["network", "仅对指定人 / 分类 / 群组以及关联联系人可见", "允许指定对象及其关联联系人看到资料。"]
                          ] as const).map(([value, label, description]) => {
                            const checked = profileDraft.visibility === value;

                            return (
                              <button
                                className={cn(
                                  "rounded-lg border px-3 py-3 text-left transition",
                                  checked ? "border-lemon bg-lemon/10" : "border-line bg-paper"
                                )}
                                key={value}
                                onClick={() => setProfileDraft((current) => ({ ...current, visibility: value }))}
                                type="button"
                              >
                                <div className="flex items-start gap-3">
                                  <span
                                    className={cn(
                                      "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] font-black",
                                      checked ? "border-lemon bg-lemon text-[#5b4300]" : "border-line text-transparent"
                                    )}
                                  >
                                    ●
                                  </span>
                                  <div>
                                    <p className="text-sm font-black text-ink">{label}</p>
                                    <p className="mt-1 text-xs leading-5 text-ink/50">{description}</p>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        className={cn(
                          "rounded-lg border px-3 py-3 text-left text-sm font-black",
                          profileDraft.canServeForeigners ? "border-moss bg-moss/10 text-moss" : "border-line bg-paper text-ink/55"
                        )}
                        onClick={() => setProfileDraft((current) => ({ ...current, canServeForeigners: true }))}
                        type="button"
                      >
                        服务外国人
                      </button>
                      <button
                        className={cn(
                          "rounded-lg border px-3 py-3 text-left text-sm font-black",
                          !profileDraft.canServeForeigners ? "border-coral bg-coral/10 text-coral" : "border-line bg-paper text-ink/55"
                        )}
                        onClick={() => setProfileDraft((current) => ({ ...current, canServeForeigners: false }))}
                        type="button"
                      >
                        不服务外国人
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label>
                        <span className="mb-1 block text-xs font-bold text-ink/45">年龄</span>
                        <input
                          className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                          onChange={(event) => setProfileDraft((current) => ({ ...current, age: event.target.value }))}
                          value={profileDraft.age}
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-xs font-bold text-ink/45">身高</span>
                        <input
                          className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                          onChange={(event) => setProfileDraft((current) => ({ ...current, height: event.target.value }))}
                          value={profileDraft.height}
                        />
                      </label>
                    </div>
                  </div>
                </section>

                <section className="rounded-lg bg-white p-4 shadow-panel">
                  <h3 className="font-black">服务资料</h3>
                  <div className="mt-3 grid gap-3">
                    <div>
                      <span className="mb-1 block text-xs font-bold text-ink/45">服务区域范围</span>
                      <div className="rounded-lg border border-line bg-paper p-3">
                        <p className="text-xs font-black text-ink/55">行政区域</p>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <select
                            className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm font-bold outline-none"
                            onChange={(event) => {
                              const nextCountry = event.target.value;
                              const nextPrefecture = Object.keys(serviceAreaCatalog[nextCountry as keyof typeof serviceAreaCatalog] ?? serviceAreaCatalog["日本"])[0] ?? "";
                              const nextArea = (serviceAreaCatalog[nextCountry as keyof typeof serviceAreaCatalog] ?? serviceAreaCatalog["日本"])[
                                nextPrefecture as keyof (typeof serviceAreaCatalog)[keyof typeof serviceAreaCatalog]
                              ]?.[0] ?? "";
                              setProfileDraft((current) => ({
                                ...current,
                                selectedCountry: nextCountry,
                                selectedPrefecture: nextPrefecture,
                                selectedArea: nextArea
                              }));
                            }}
                            value={profileDraft.selectedCountry}
                          >
                            {Object.keys(serviceAreaCatalog).map((country) => (
                              <option key={country} value={country}>{country}</option>
                            ))}
                          </select>
                          <select
                            className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm font-bold outline-none"
                            onChange={(event) => {
                              const nextPrefecture = event.target.value;
                              setProfileDraft((current) => ({
                                ...current,
                                selectedPrefecture: nextPrefecture,
                                selectedArea: (selectedCountryCatalog[nextPrefecture as keyof typeof selectedCountryCatalog] ?? [])[0] ?? ""
                              }));
                            }}
                            value={profileDraft.selectedPrefecture}
                          >
                            {availablePrefectures.map((prefecture) => (
                              <option key={prefecture} value={prefecture}>{prefecture}</option>
                            ))}
                          </select>
                          <select
                            className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm font-bold outline-none"
                            onChange={(event) => setProfileDraft((current) => ({ ...current, selectedArea: event.target.value }))}
                            value={profileDraft.selectedArea}
                          >
                            {availableAreas.map((area) => (
                              <option key={area} value={area}>{area}</option>
                            ))}
                          </select>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Button size="sm" variant="secondary" onClick={addServiceAreaToDraft}>添加当前区域到服务范围</Button>
                          <p className="text-xs text-ink/50">把上面选中的国家 / 都道府县 / 区域加入服务范围。</p>
                        </div>
                      </div>

                      <div className="mt-3 rounded-lg border border-line bg-paper p-3">
                        <p className="text-xs font-black text-ink/55">沿线 / 车站服务</p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <select
                            className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm font-bold outline-none"
                            onChange={(event) => {
                              const nextLine = event.target.value;
                              setProfileDraft((current) => ({
                                ...current,
                                selectedLine: nextLine,
                                selectedStations: (railLineCatalog[nextLine as keyof typeof railLineCatalog] ?? []).slice(0, 1)
                              }));
                            }}
                            value={profileDraft.selectedLine}
                          >
                            {availableLines.map((line) => (
                              <option key={line} value={line}>{line}</option>
                            ))}
                          </select>
                          <div className="rounded-lg border border-line bg-white p-2">
                            <p className="text-[11px] font-bold text-ink/45">可多选车站</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {availableStations.map((station) => (
                                <button
                                  className={cn(
                                    "rounded-full border px-3 py-2 text-xs font-black",
                                    profileDraft.selectedStations.includes(station) ? "border-moss bg-moss/10 text-moss" : "border-line bg-paper text-ink/60"
                                  )}
                                  key={station}
                                  onClick={() => toggleDraftStation(station)}
                                  type="button"
                                >
                                  {station}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Button size="sm" variant="secondary" onClick={addLineServiceAreaToDraft}>添加当前车站到服务范围</Button>
                          <p className="text-xs text-ink/50">例如山手线、中央线、御堂筋线沿线的指定车站，也可以直接加入。</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {profileDraft.serviceAreas.map((area) => (
                          <button
                            className="rounded-full border border-line bg-paper px-3 py-1 text-xs font-bold text-ink/65"
                            key={area}
                            onClick={() => removeServiceAreaFromDraft(area)}
                            type="button"
                          >
                            {area} ×
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="mb-1 block text-xs font-bold text-ink/45">语言能力</span>
                      <div className="flex flex-wrap gap-2">
                        {languageOptions.map((language) => (
                          <button
                            className={cn(
                              "rounded-full border px-3 py-2 text-xs font-black",
                              profileDraft.languages.includes(language) ? "border-moss bg-moss/10 text-moss" : "border-line bg-paper text-ink/60"
                            )}
                            key={language}
                            onClick={() => toggleDraftLanguage(language)}
                            type="button"
                          >
                            {language}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="mb-1 block text-xs font-bold text-ink/45">标签</span>
                      <div className="space-y-3">
                        {tagGroups.map((group) => (
                          <div key={group.title}>
                            <p className="text-xs font-black text-ink/45">{group.title}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {group.tags.map((tag) => (
                                <button
                                  className={cn(
                                    "rounded-full border px-3 py-2 text-xs font-black",
                                    profileDraft.tags.includes(tag) ? "border-lemon bg-lemon/15 text-[#8a6800]" : "border-line bg-paper text-ink/60"
                                  )}
                                  key={tag}
                                  onClick={() => toggleDraftTag(tag)}
                                  type="button"
                                >
                                  {tag}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label>
                        <span className="mb-1 block text-xs font-bold text-ink/45">抢单预算下限</span>
                        <input
                          className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                          onChange={(event) => setProfileDraft((current) => ({ ...current, bidBudgetMin: event.target.value }))}
                          value={profileDraft.bidBudgetMin}
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-xs font-bold text-ink/45">抢单预算上限</span>
                        <input
                          className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                          onChange={(event) => setProfileDraft((current) => ({ ...current, bidBudgetMax: event.target.value }))}
                          value={profileDraft.bidBudgetMax}
                        />
                      </label>
                    </div>
                    <div>
                      <span className="mb-1 block text-xs font-bold text-ink/45">支持支付方式</span>
                      <p className="mb-2 text-xs text-ink/50">可多选，勾选后会同步显示在技师信息卡与分享资料中。</p>
                      <div className="grid grid-cols-3 gap-2">
                        {(paymentOptions.map((value) => [value, paymentOptionLabels[value]] as const)).map(([value, label]) => (
                          <button
                            className={cn(
                              "rounded-lg border px-3 py-3 text-sm font-black",
                              profileDraft.paymentMethods.includes(value) ? "border-moss bg-moss/10 text-moss" : "border-line bg-paper text-ink/60"
                            )}
                            key={value}
                            onClick={() => toggleDraftPaymentMethod(value)}
                            type="button"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label>
                      <span className="mb-1 block text-xs font-bold text-ink/45">自我介绍</span>
                      <textarea
                        className="min-h-[120px] w-full rounded-lg border border-line bg-paper px-3 py-3 text-sm leading-6 outline-none"
                        onChange={(event) => setProfileDraft((current) => ({ ...current, bio: event.target.value }))}
                        value={profileDraft.bio}
                      />
                    </label>
                  </div>
                </section>
              </main>
          </MobileFullscreenPage>
        )}

        {documentUploadOpen && (
          <MobileFullscreenPage>
              <MobileFullscreenHeader
                info={kycCopy.subtitle}
                onClose={() => setDocumentUploadOpen(false)}
                title={kycCopy.title}
              />
              <main className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-28">
                <section className="rounded-lg bg-white p-4 shadow-panel">
                  <h3 className="font-black">{kycCopy.basicInfo}</h3>
                  <div className="mt-3 grid gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <label>
                        <span className="mb-1 block text-xs font-bold text-ink/45">{kycCopy.surname}</span>
                        <input
                          className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                          onChange={(event) => setKycDraft((current) => ({ ...current, surname: event.target.value }))}
                          placeholder={kycCopy.surnamePlaceholder}
                          value={kycDraft.surname}
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-xs font-bold text-ink/45">{kycCopy.givenName}</span>
                        <input
                          className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                          onChange={(event) => setKycDraft((current) => ({ ...current, givenName: event.target.value }))}
                          placeholder={kycCopy.givenNamePlaceholder}
                          value={kycDraft.givenName}
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label>
                        <span className="mb-1 block text-xs font-bold text-ink/45">{kycCopy.surnameKana}</span>
                        <input
                          className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                          onChange={(event) => setKycDraft((current) => ({ ...current, surnameKana: event.target.value }))}
                          placeholder={kycCopy.surnameKanaPlaceholder}
                          value={kycDraft.surnameKana}
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-xs font-bold text-ink/45">{kycCopy.givenKana}</span>
                        <input
                          className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                          onChange={(event) => setKycDraft((current) => ({ ...current, givenKana: event.target.value }))}
                          placeholder={kycCopy.givenKanaPlaceholder}
                          value={kycDraft.givenKana}
                        />
                      </label>
                    </div>
                    <div>
                      <span className="mb-1 block text-xs font-bold text-ink/45">{kycCopy.birthDate}</span>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                          onChange={(event) => setKycDraft((current) => ({ ...current, birthYear: event.target.value }))}
                          value={kycDraft.birthYear}
                        >
                          {kycBirthYearOptions.map((year) => (
                            <option key={year} value={year}>{`${year}${kycCopy.yearSuffix}`}</option>
                          ))}
                        </select>
                        <select
                          className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                          onChange={(event) => setKycDraft((current) => ({ ...current, birthMonth: event.target.value }))}
                          value={kycDraft.birthMonth}
                        >
                          {kycBirthMonthOptions.map((month) => (
                            <option key={month} value={month}>{`${month}${kycCopy.monthSuffix}`}</option>
                          ))}
                        </select>
                        <select
                          className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                          onChange={(event) => setKycDraft((current) => ({ ...current, birthDay: event.target.value }))}
                          value={kycDraft.birthDay}
                        >
                          {kycBirthDayOptions.map((day) => (
                            <option key={day} value={day}>{`${day}${kycCopy.daySuffix}`}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <label>
                      <span className="mb-1 block text-xs font-bold text-ink/45">{kycCopy.email}</span>
                      <input
                        className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                        onChange={(event) => setKycDraft((current) => ({ ...current, email: event.target.value }))}
                        placeholder="example@gmail.com"
                        type="email"
                        value={kycDraft.email}
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-bold text-ink/45">{kycCopy.phone}</span>
                      <input
                        className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                        onChange={(event) => setKycDraft((current) => ({ ...current, phone: event.target.value }))}
                        placeholder="09012345678"
                        value={kycDraft.phone}
                      />
                    </label>
                  </div>
                </section>

                <section className="rounded-lg bg-white p-4 shadow-panel">
                  <div className="flex items-start justify-between gap-3">
                    <TitleWithInfo
                      as="h3"
                      info={kycCopy.identityHint}
                      label={`${kycCopy.identitySection}说明`}
                      title={kycCopy.identitySection}
                      titleClassName="font-black"
                      variant="paper"
                    />
                    <Badge tone="red">{kycCopy.required}</Badge>
                  </div>
                  <input accept="image/*" className="hidden" onChange={(event) => handleKycImageUpload("idFront", event)} ref={idFrontInputRef} type="file" />
                  <input accept="image/*" className="hidden" onChange={(event) => handleKycImageUpload("idBack", event)} ref={idBackInputRef} type="file" />
                  <input accept="image/*" className="hidden" onChange={(event) => handleKycImageUpload("selfie", event)} ref={selfieInputRef} type="file" />
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <button
                      className="overflow-hidden rounded-lg border border-line bg-paper text-left"
                      onClick={() => idFrontInputRef.current?.click()}
                      type="button"
                    >
                      <div className="aspect-[4/3] bg-[#f6f4ee]">
                        {kycDraft.idFrontPreview ? (
                          <img alt={kycCopy.frontCardTitle} className="h-full w-full object-cover" src={kycDraft.idFrontPreview} />
                        ) : (
                          <div className="flex h-full items-center justify-center px-3 text-center text-sm font-black text-ink/35">{kycCopy.frontCardTitle}</div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-black">{kycCopy.frontCardTitle}</p>
                        <p className="mt-1 text-xs text-ink/50">{kycDraft.idFrontName || kycCopy.frontCardHint}</p>
                      </div>
                    </button>
                    <button
                      className="overflow-hidden rounded-lg border border-line bg-paper text-left"
                      onClick={() => idBackInputRef.current?.click()}
                      type="button"
                    >
                      <div className="aspect-[4/3] bg-[#f6f4ee]">
                        {kycDraft.idBackPreview ? (
                          <img alt={kycCopy.backCardTitle} className="h-full w-full object-cover" src={kycDraft.idBackPreview} />
                        ) : (
                          <div className="flex h-full items-center justify-center px-3 text-center text-sm font-black text-ink/35">{kycCopy.backCardTitle}</div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-black">{kycCopy.backCardTitle}</p>
                        <p className="mt-1 text-xs text-ink/50">{kycDraft.idBackName || kycCopy.backCardHint}</p>
                      </div>
                    </button>
                    <button
                      className="overflow-hidden rounded-lg border border-line bg-paper text-left"
                      onClick={() => selfieInputRef.current?.click()}
                      type="button"
                    >
                      <div className="aspect-[4/3] bg-[#f6f4ee]">
                        {kycDraft.selfiePreview ? (
                          <img alt={kycCopy.selfieCardTitle} className="h-full w-full object-cover" src={kycDraft.selfiePreview} />
                        ) : (
                          <div className="flex h-full items-center justify-center px-3 text-center text-sm font-black text-ink/35">{kycCopy.selfieCardTitle}</div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-black">{kycCopy.selfieCardTitle}</p>
                        <p className="mt-1 text-xs text-ink/50">{kycDraft.selfieName || kycCopy.selfieCardHint}</p>
                      </div>
                    </button>
                  </div>

                  <label className="mt-4 block">
                    <span className="mb-1 block text-xs font-bold text-ink/45">{kycCopy.documentTypeLabel}</span>
                    <select
                      className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                      onChange={(event) => setKycDraft((current) => ({ ...current, documentType: event.target.value }))}
                      value={kycDraft.documentType}
                    >
                      {kycDocumentTypeValues.map((option) => (
                        <option key={option} value={option}>{kycDocumentTypeLabels[option]}</option>
                      ))}
                    </select>
                  </label>
                </section>

                <section className="rounded-lg bg-white p-4 shadow-panel">
                  <div className="flex items-start justify-between gap-3">
                    <TitleWithInfo
                      as="h3"
                      info={kycCopy.agreementHint}
                      label={`${kycCopy.agreementTitle}说明`}
                      title={kycCopy.agreementTitle}
                      titleClassName="font-black"
                      variant="paper"
                    />
                    <Badge tone="yellow">{kycCopy.confirm}</Badge>
                  </div>
                  <div className="mt-3 rounded-lg border border-line bg-paper p-3 text-xs leading-6 text-ink/60">
                    {kycCopy.agreementContent.map((line) => (
                      <p className="mt-2 first:mt-0" key={line}>{line}</p>
                    ))}
                  </div>
                  <button
                    className={cn(
                      "mt-4 flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left",
                      kycDraft.agreed ? "border-moss bg-moss/10 text-moss" : "border-line bg-paper text-ink/70"
                    )}
                    onClick={() => setKycDraft((current) => ({ ...current, agreed: !current.agreed }))}
                    type="button"
                  >
                    <span className={cn("grid h-5 w-5 place-items-center rounded-full border text-[11px] font-black", kycDraft.agreed ? "border-moss bg-moss text-white" : "border-line")}>
                      {kycDraft.agreed ? "✓" : ""}
                    </span>
                    <span className="text-sm font-bold">{kycCopy.agreementToggle}</span>
                  </button>
                </section>
              </main>
              <footer className="border-t border-line bg-white/95 px-4 py-3 backdrop-blur">
                <Button className="w-full" onClick={submitKycDraft}>
                  {kycCopy.submit}
                </Button>
              </footer>
          </MobileFullscreenPage>
        )}

        {reviewPanelOpen && (
          <MobileFullscreenPage>
              <MobileFullscreenHeader
                onClose={() => setReviewPanelOpen(false)}
                subtitle={`当前评分 ${baseTech.rating.toFixed(2)} · ${baseTech.reviewCount} 人评价`}
                title="最近用户评价"
              />
              <main className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <section className="grid grid-cols-3 gap-2">
                  {[
                    ["当前评分", baseTech.rating.toFixed(2)],
                    ["评价人数", `${baseTech.reviewCount} 人`],
                    ["取消率", `${baseTech.cancelRate}%`]
                  ].map(([label, value]) => (
                    <div className="rounded-lg border border-line bg-white p-3 shadow-panel" key={label}>
                      <p className="text-[11px] font-bold text-ink/45">{label}</p>
                      <strong className="mt-1 block text-sm">{value}</strong>
                    </div>
                  ))}
                </section>
                <section className="space-y-3">
                  {recentReviewCards.map((review) => (
                    <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={review.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-black">{review.customer}</h3>
                          <p className="mt-1 text-xs text-ink/45">{review.date}</p>
                        </div>
                        <Badge tone="yellow">★ {review.rating.toFixed(1)}</Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-ink/65">{review.content}</p>
                    </article>
                  ))}
                </section>
              </main>
          </MobileFullscreenPage>
        )}

        <TechnicianScheduleSetupModal
          baseDate={parseDate(scheduleAnchorDate)}
          initialType={scheduleSetupType}
          onApply={applyScheduleSetup}
          onClose={() => setScheduleSetupOpen(false)}
          open={scheduleSetupOpen}
        />

        {dayScheduleEditor && (
          <MobileFullscreenPage>
              <MobileFullscreenHeader
                info="先生成系统预计时段，再由技师或店铺确认"
                onClose={() => setDayScheduleEditor(null)}
                subtitle={formatDisplayDate(dayScheduleEditor.date, language)}
                title={dayScheduleEditor.type === "travel" ? "添加预计移动时间" : "添加预计休息时间"}
              />
              <main className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-28">
                <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["travel", "移动时间"],
                      ["break", "休息时间"]
                    ] as Array<[DayScheduleAdjustmentType, string]>).map(([type, label]) => (
                      <button
                        className={cn(
                          "rounded-lg border px-3 py-3 text-sm font-black",
                          dayScheduleEditor.type === type
                            ? type === "travel"
                              ? "border-[#d39354] bg-[#fff2e4] text-[#b76d1d]"
                              : "border-[#e2b4c3] bg-[#fff1f5] text-[#c86b88]"
                            : "border-line bg-paper text-ink/60"
                        )}
                        key={type}
                        onClick={() => setDayScheduleEditor((current) => current ? { ...current, type } : current)}
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-ink/55">
                    {dayScheduleEditor.type === "travel"
                      ? "保存后会先以系统预计的移动时间写入共享排班，技师或店铺确认后才会转成正式移动时段。"
                      : "保存后会先以系统预计的休息时间写入共享排班，技师或店铺确认后才会转成正式休息时段。"}
                  </p>
                </section>

                <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                  <h3 className="font-black">日期与时间</h3>
                  <div className="mt-4 grid gap-3">
                    <label>
                      <span className="mb-1 block text-xs font-bold text-ink/45">日期</span>
                      <input
                        className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-black outline-none"
                        onChange={(event) =>
                          setDayScheduleEditor((current) => current ? { ...current, date: event.target.value || scheduleAnchorDate } : current)
                        }
                        type="date"
                        value={dayScheduleEditor.date}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label>
                        <span className="mb-1 block text-xs font-bold text-ink/45">开始时间</span>
                        <input
                          className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-black outline-none"
                          onChange={(event) =>
                            setDayScheduleEditor((current) => current ? { ...current, startTime: event.target.value } : current)
                          }
                          step={1800}
                          type="time"
                          value={dayScheduleEditor.startTime}
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-xs font-bold text-ink/45">结束时间</span>
                        <input
                          className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-black outline-none"
                          onChange={(event) =>
                            setDayScheduleEditor((current) => current ? { ...current, endTime: event.target.value } : current)
                          }
                          step={1800}
                          type="time"
                          value={dayScheduleEditor.endTime}
                        />
                      </label>
                    </div>
                  </div>
                </section>
              </main>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-white via-white/95 to-transparent px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-6">
                <div className="flex justify-center">
                  <Button className="pointer-events-auto h-12 min-w-[240px] px-8 shadow-soft" onClick={saveDayScheduleEditor}>
                    保存到共享排班
                  </Button>
                </div>
              </div>
          </MobileFullscreenPage>
        )}

        {nextCustomerCardOpen && (
          <MobileFullscreenPage innerClassName="relative">
              <MobileFullscreenHeader
                className="absolute inset-x-0 top-0 z-40 border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:var(--client-bg)] shadow-[0_16px_36px_rgba(0,0,0,0.18)]"
                onClose={() => setNextCustomerCardOpen(false)}
                title="用户信息卡"
              />
              <main className="scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+128px)] pt-[calc(env(safe-area-inset-top)+88px)]">
                <SocialProfileMiniCard
                  className="shadow-panel"
                  customer={nextServiceCustomer}
                  dark={isNight}
                  showAction={false}
                  topTags={[
                    { label: "下一单用户", tone: "yellow" },
                    {
                      label: nextServiceCustomer.churnRisk === "low" ? "稳定客户" : nextServiceCustomer.churnRisk === "medium" ? "需跟进" : "高流失风险",
                      tone: nextServiceCustomer.churnRisk === "low" ? "green" : nextServiceCustomer.churnRisk === "medium" ? "yellow" : "purple"
                    },
                    { label: `LTV ${yen(nextServiceCustomer.ltv)}`, tone: "neutral" }
                  ]}
                />

                <section className="rounded-lg bg-white p-4 shadow-panel">
                  <h3 className="font-black">本次预约</h3>
                  <div className="mt-3 space-y-2 text-sm">
                    {[
                      ["服务项目", nextServiceOrder.itemName],
                      ["预约时间", nextServiceTime],
                      ["服务地址", nextServiceAddress],
                      ["支付方式", nextServiceOrder.paymentStatus === "paid" ? "平台支付" : nextServiceOrder.paymentStatus === "depositPaid" ? "需要预付" : "线下支付"],
                      ["联系", "平台内通话，保护双方隐私"]
                    ].map(([label, value]) => (
                      <div className="grid grid-cols-[76px,1fr] gap-3 rounded-lg bg-paper px-3 py-3" key={label}>
                        <span className="font-black text-ink/45">{label}</span>
                        <strong className="min-w-0 text-ink">{value}</strong>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg bg-white p-4 shadow-panel">
                  <h3 className="font-black">客户标签</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {nextServiceCustomer.tags.map((tag) => (
                      <span className="rounded-full bg-paper px-3 py-1 text-xs font-bold text-ink/65" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg bg-white p-4 shadow-panel">
                  <h3 className="font-black">备注与安排</h3>
                  <div className="mt-3 rounded-lg bg-paper p-3 text-sm leading-6 text-ink/60">
                    <p><strong className="text-ink">本单备注：</strong>{nextServiceOrder.remark ?? "无特别备注"}</p>
                    <p className="mt-2"><strong className="text-ink">下次预约：</strong>{nextServiceCustomer.nextBookingAt ?? "暂未预约下一次"}</p>
                    <p className="mt-2"><strong className="text-ink">最近下单：</strong>{nextServiceCustomer.lastOrderAt}</p>
                  </div>
                </section>
              </main>
              <footer
                className="pointer-events-none absolute inset-x-0 bottom-0 z-40 px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-8"
                style={{
                  background:
                    "linear-gradient(180deg, rgb(var(--client-edge-mask-rgb) / 0) 0%, rgb(var(--client-edge-mask-rgb) / 0.84) 42%, rgb(var(--client-edge-mask-rgb) / 0.98) 100%)"
                }}
              >
                <div className="pointer-events-auto grid grid-cols-2 gap-3">
                  <Button
                    className="h-12 min-w-0 px-3 text-sm font-black"
                    variant="secondary"
                    onClick={() => {
                      contact(nextServiceCustomer.name, "phone");
                      setNextCustomerCardOpen(false);
                    }}
                  >
                    平台内通话
                  </Button>
                  <Button
                    className="h-12 min-w-0 px-3 text-sm font-black"
                    to={getMessagePath("technician", getTechnicianCustomerConversationId(nextServiceCustomer.id), "/technician/tasks")}
                  >
                    去聊天
                  </Button>
                </div>
              </footer>
          </MobileFullscreenPage>
        )}

        {selectedTaskOrder && selectedTaskOrderDisplay && selectedTaskOrderCustomer && selectedTaskOrderService && (
          <MobileFullscreenPage innerClassName="relative">
            <MobileFullscreenHeader
              action={
                <>
                  <button
                    aria-label="取消预约"
                    className="focus-ring inline-flex h-11 min-w-[58px] items-center justify-center rounded-full border border-[#ff8b7f]/58 bg-[linear-gradient(180deg,#ff7f72_0%,#ff5f58_54%,#ef3f3a_100%)] px-3 text-sm font-black text-white shadow-[0_14px_30px_rgba(255,78,70,0.32)] transition hover:brightness-105 active:scale-[0.96]"
                    onClick={() => requestTaskOrderCancel(selectedTaskOrder)}
                    type="button"
                  >
                    {translateText("取消", language)}
                  </button>
                  <Link
                    aria-label="联系担当"
                    className="focus-ring inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,var(--client-bg)_12%)] text-[color:var(--client-text)] shadow-[0_12px_28px_rgba(0,0,0,0.14)] transition hover:bg-[color:var(--client-elevated)]"
                    to={getMessagePath("technician", getTechnicianStoreConversationId(), "/technician/tasks")}
                  >
                    <AppIcon className="h-5 w-5" name="manager" />
                  </Link>
                </>
              }
              className="absolute inset-x-0 top-0 z-40 border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:var(--client-bg)] shadow-[0_16px_36px_rgba(0,0,0,0.18)]"
              onClose={() => {
                setSelectedTaskOrder(null);
              }}
              title="预约详情"
            />
            <main className="scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+132px)] pt-[calc(env(safe-area-inset-top)+88px)]">
              <OrderDynamicStatusCard order={selectedTaskOrderDisplay} providerName={selectedTaskOrderDisplay.storeName ?? selectedTaskOrderStore.name} />

              <section>
                <h2 className="mb-2 text-sm font-black text-[color:var(--client-muted)]">服务</h2>
                <OrderServiceMiniCard
                  contactTo={getMessagePath("technician", getTechnicianCustomerConversationId(selectedTaskOrder.customerId), "/technician/tasks")}
                  dark={isNight}
                  order={selectedTaskOrderDisplay}
                  provider={selectedTaskOrderStore}
                  topTags={[{ label: statusLabel(selectedTaskOrderDisplay.status), tone: "yellow" }]}
                />
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {selectedTaskOrderPaymentItems.map(([label, value]) => (
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
                <SocialProfileMiniCard
                  detailTo={getScopedProfileDetailPath("technician", "shop", selectedTaskOrderStore.id)}
                  showAction={false}
                  store={selectedTaskOrderStore}
                  topTags={[{ label: "服务方", tone: "purple" }]}
                />
              </section>

              <section>
                <h2 className="mb-2 text-sm font-black text-[color:var(--client-muted)]">预约用户</h2>
                <SocialProfileMiniCard
                  actionLabel="好友"
                  customer={selectedTaskOrderCustomer}
                  dark={isNight}
                  detailTo={getScopedProfileDetailPath("technician", "user", selectedTaskOrderCustomer.id)}
                  showAction={false}
                />
              </section>

              <TechnicianOrderInfoTable
                rows={getTechnicianOrderDetailRows(selectedTaskOrderDisplay, selectedTaskOrderService, selectedTaskOrderStore, selectedTaskOrderTechnician)}
                title="预约情报"
              />

              {selectedTaskOrderSession.status === "inService" || selectedTaskOrderSession.status === "completed" ? null : (
                <section
                  className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,var(--client-surface)_88%)] p-4 shadow-panel"
                  ref={taskOrderCodeSectionRef}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-base font-black text-[color:var(--client-text)]">服务验证码</h2>
                    <Badge tone="blue">手动输入</Badge>
                  </div>
                  <input
                    aria-label="服务验证码"
                    className="mt-3 h-14 w-full rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-primary)_38%,var(--client-line)_62%)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,var(--client-bg)_14%)] px-4 text-center text-[22px] font-black tracking-[0.24em] text-[color:var(--client-text)] outline-none transition placeholder:tracking-normal placeholder:text-[color:var(--client-muted)] focus:border-[color:var(--client-primary)] focus:ring-4 focus:ring-[color:color-mix(in_srgb,var(--client-primary)_18%,transparent)]"
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(event) => {
                      setServiceCode(event.target.value);
                      setCodeError("");
                    }}
                    placeholder="请输入验证码"
                    ref={taskOrderCodeInputRef}
                    value={serviceCode}
                  />
                  {codeError ? (
                    <p className="mt-2 text-xs font-bold text-coral">{codeError}</p>
                  ) : (
                    <p className="mt-2 text-xs leading-5 text-[color:var(--client-muted)]">请让用户出示订单详情中的验证码，技师端需手动输入后开始服务。</p>
                  )}
                </section>
              )}

              <TechnicianOrderContactTimeline
                commentAuthorAvatarSrc={baseTech.avatar}
                events={getTechnicianOrderDetailEvents(selectedTaskOrderDisplay, selectedTaskOrderStore, selectedTaskOrderTechnician, selectedTaskOrderCustomer, selectedTaskOrderSession)}
              />
            </main>
            <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-40 px-4 pb-[calc(max(env(safe-area-inset-bottom),12px)+10px)] pt-12">
              <div
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-full bg-[linear-gradient(180deg,transparent_0%,color-mix(in_srgb,var(--client-bg)_82%,transparent)_52%,var(--client-bg)_100%)]"
              />
              <div className="pointer-events-auto relative space-y-2">
                {selectedTaskOrderSession.status === "inService" ? (
                  <div className="flex justify-center">
                    <ServiceCountdownPill seconds={selectedTaskOrderRemainingSeconds} />
                  </div>
                ) : null}
                <div className="grid grid-cols-[1fr_0.82fr_1fr] gap-2.5">
                  <Link
                    className="focus-ring inline-flex h-12 min-w-0 items-center justify-center rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,var(--client-bg)_10%)] px-2 text-[13px] font-black text-[color:var(--client-text)] shadow-[0_14px_30px_rgba(0,0,0,0.16)] transition hover:bg-[color:var(--client-elevated)]"
                    to={getMessagePath("technician", getTechnicianCustomerConversationId(selectedTaskOrder.customerId), "/technician/tasks")}
                  >
                    联系用户
                  </Link>
                  <button
                    className="focus-ring inline-flex h-12 min-w-0 items-center justify-center rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,var(--client-bg)_18%)] px-2 text-[13px] font-black text-[color:var(--client-text)] shadow-[0_14px_30px_rgba(0,0,0,0.14)] transition hover:bg-[color:var(--client-elevated)]"
                    onClick={() => requestTaskOrderChange(selectedTaskOrder)}
                    type="button"
                  >
                    变更
                  </button>
                  <button
                    className={cn(
                      "focus-ring inline-flex h-12 min-w-0 items-center justify-center rounded-[20px] px-2 text-[13px] font-black transition",
                      selectedTaskOrderSession.status === "inService"
                        ? "bg-[linear-gradient(180deg,#ff7d72_0%,#f04f47_58%,#df332f_100%)] text-white shadow-[0_18px_38px_rgba(244,76,68,0.34)] hover:brightness-105"
                        : selectedTaskOrderSession.status === "completed"
                          ? "cursor-not-allowed border border-[#4a4764] bg-[#343149] text-[#928dab] shadow-none"
                          : "bg-[color:var(--client-primary)] text-[#090806] shadow-[0_16px_34px_color-mix(in_srgb,var(--client-primary)_34%,transparent)] hover:brightness-95"
                    )}
                    disabled={selectedTaskOrderSession.status === "completed"}
                    onClick={() => {
                      if (selectedTaskOrderSession.status === "inService") {
                        requestFinishTaskOrderService(selectedTaskOrder);
                        return;
                      }

                      submitServiceCode(selectedTaskOrder);
                    }}
                    type="button"
                  >
                    {selectedTaskOrderSession.status === "inService" ? "服务结束" : selectedTaskOrderSession.status === "completed" ? "服务已完成" : "开始服务"}
                  </button>
                </div>
              </div>
            </footer>
            {taskOrderEndConfirmOpen ? (
              <div className="fixed -inset-y-20 inset-x-0 z-[55] grid place-items-center bg-black/55 px-4 backdrop-blur-sm">
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
                      onClick={() => setTaskOrderEndConfirmOpen(false)}
                      type="button"
                    >
                      取消
                    </button>
                    <button
                      className="focus-ring h-11 rounded-full bg-[linear-gradient(180deg,#ff7d72_0%,#f04f47_58%,#df332f_100%)] text-sm font-black text-white shadow-[0_14px_30px_rgba(244,76,68,0.32)]"
                      onClick={() => finishTaskOrderService(selectedTaskOrder)}
                      type="button"
                    >
                      结束服务
                    </button>
                  </div>
                </section>
              </div>
            ) : null}
            {selectedTaskOrderPendingExtensionRequest && !extensionRequestCollapsed ? (
              <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 backdrop-blur-sm">
                <section className="w-full max-w-[360px] rounded-[28px] border border-white/12 bg-[color:color-mix(in_srgb,var(--client-elevated)_94%,var(--client-bg)_6%)] p-5 text-[color:var(--client-text)] shadow-[0_24px_70px_rgba(0,0,0,0.36)]">
                  <div className="flex items-start gap-3">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[color:color-mix(in_srgb,var(--client-primary)_18%,transparent)] text-[color:var(--client-primary)]">
                      <AppIcon name="clock" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-lg font-black">用户申请追加服务</h2>
                      <p className="mt-1 text-sm font-black leading-6 text-[color:var(--client-text)]">{selectedTaskOrderPendingExtensionRequest.title}</p>
                      <p className="mt-1 text-xs font-bold leading-5 text-[color:var(--client-muted)]">
                        追加 {selectedTaskOrderPendingExtensionRequest.durationMinutes} 分钟 · {yen(selectedTaskOrderPendingExtensionRequest.price)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-[0.9fr_0.9fr_1fr] gap-2">
                    <button
                      className="focus-ring h-11 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] text-xs font-black text-[color:var(--client-text)]"
                      onClick={() => setExtensionRequestCollapsed(true)}
                      type="button"
                    >
                      暂时折叠
                    </button>
                    <button
                      className="focus-ring h-11 rounded-full border border-[color:color-mix(in_srgb,#ff6b61_48%,transparent)] bg-[color:color-mix(in_srgb,#ff6b61_14%,transparent)] text-xs font-black text-[#ff8f86]"
                      onClick={() => respondTaskOrderExtension(false)}
                      type="button"
                    >
                      拒绝
                    </button>
                    <button
                      className="focus-ring h-11 rounded-full bg-[color:var(--client-primary)] text-xs font-black text-[#090806] shadow-[0_14px_30px_color-mix(in_srgb,var(--client-primary)_28%,transparent)]"
                      onClick={() => respondTaskOrderExtension(true)}
                      type="button"
                    >
                      接受
                    </button>
                  </div>
                </section>
              </div>
            ) : null}
            {selectedTaskOrderPendingExtensionRequest && extensionRequestCollapsed ? (
              <FloatingActionButton
                ariaLabel="展开追加服务请求"
                onClick={() => setExtensionRequestCollapsed(false)}
                storageKey="needo.fab.technician-extension-request"
              >
                <AppIcon name="clock" />
              </FloatingActionButton>
            ) : null}
            {showTechnicianServiceReview || technicianServiceReviewOpen ? (
              <ServiceReviewPrompt
                message="请对本次客人进行评价。可以直接跳过，也可以点亮星星和标签。"
                onSkip={() => {
                  closeTechnicianServiceReview();
                  setContactLog("已跳过本次客人评价。");
                }}
                onSubmit={(submission) => {
                  closeTechnicianServiceReview();
                  setContactLog(`已提交 ${submission.rating} 星客人评价，标签 ${submission.tags.length} 个。`);
                }}
                tagOptions={technicianCustomerReviewTags}
                title="服务已经结束"
              />
            ) : null}
          </MobileFullscreenPage>
        )}

        {jobShareOpen && (
          <MobileFullscreenPage>
              <MobileFullscreenHeader
                onClose={() => {
                  setJobShareOpen(false);
                }}
                title="分享下一单服务卡"
              />
              <main className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                <section className="rounded-lg bg-white p-4 shadow-panel">
                  <h3 className="font-black">{nextJob.serviceContent}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink/60">
                    {`${nextJob.serviceTime} · ${nextJob.address} · 分享后门店可追迹服务安全状态。`}
                  </p>
                </section>
                <section className="rounded-lg bg-white p-4 shadow-panel">
                  <h3 className="font-black">选择发送给谁</h3>
                  <div className="mt-3 space-y-2">
                    {technicianContacts.map((contactItem) => (
                      <button
                        className="flex w-full items-center gap-3 rounded-lg bg-paper p-3 text-left"
                        key={contactItem.id}
                        onClick={() => shareNextJob(contactItem)}
                        type="button"
                      >
                        <img alt={contactItem.name} className="avatar-shape h-12 w-12 object-cover" src={contactItem.avatar} />
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-sm">{contactItem.name}</strong>
                          <span className="mt-1 block truncate text-xs text-ink/50">{contactItem.title} · {contactItem.remark}</span>
                        </span>
                        <span className="text-lg font-black text-ink/30">›</span>
                      </button>
                    ))}
                  </div>
                </section>
              </main>
          </MobileFullscreenPage>
        )}

        {codeModalOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-4">
            <section className="w-full max-w-[420px] rounded-lg bg-white p-5 text-ink shadow-soft">
              <TitleWithInfo
                as="h2"
                info="服务开始前必须输入用户端提供给技师的服务验证码。请让用户打开订单详情并出示当前验证码，防止误开始或冒领订单。"
                label="输入服务验证码说明"
                title="输入服务验证码"
                titleClassName="text-xl font-black"
                variant="paper"
              />
              <input
                className="mt-4 h-14 w-full rounded-full border border-line bg-paper px-5 text-center text-2xl font-black tracking-[0.4em] outline-none"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => {
                  setServiceCode(event.target.value);
                  setCodeError("");
                }}
                placeholder="079"
                value={serviceCode}
              />
              {codeError ? <p className="mt-2 text-xs font-bold text-coral">{codeError}</p> : <p className="mt-2 text-xs text-ink/45">验证码由用户端订单详情提供，技师端不直接显示。</p>}
              <div className="mt-5 grid grid-cols-[112px,1fr] gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCodeModalOpen(false);
                    setServiceCodeTargetOrderId(null);
                    setCodeError("");
                  }}
                >
                  取消
                </Button>
                <Button onClick={() => submitServiceCode(codeModalTargetOrder)}>验证并开始</Button>
              </div>
            </section>
          </div>
        )}

      </div>
    </MobileShell>
  );
}
