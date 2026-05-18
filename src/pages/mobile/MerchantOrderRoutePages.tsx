import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { MobileShell } from "../../components/mobile/MobileShell";
import { Button } from "../../components/ui/Button";
import { orders, services } from "../../data/mock";
import { parseBrowserStorageJson, writeBrowserStorage } from "../../lib/browserStorage";
import { getMerchantCustomerConversationId } from "../../lib/messageCenter";
import { cn, statusLabel, yen } from "../../lib/utils";
import { OrderDynamicStatusCard } from "../../shared/order-detail/OrderDynamicStatusCard";
import { getScopedProfileDetailPath } from "../../shared/profile-detail";
import { SocialProfileMiniCard, buildServiceMiniCardData, type SocialProfileMiniData } from "../../shared/profile-card";
import { useEntityStore } from "../../state/entityStore";
import { addSharedSchedules, removeSharedSchedule, useScheduleStore } from "../../state/scheduleStore";
import type { Customer, Order, Schedule, ServiceItem, Store, Technician } from "../../types/domain";

type StaffStatus = "出勤" | "休息" | "服务中" | "可指派";

const staffStatusSeeds: StaffStatus[] = ["可指派", "服务中", "出勤"];
const fullscreenHeaderClassName =
  "";
const orderChangeInputClassName =
  "w-full rounded-[14px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:var(--client-bg)] px-3 py-2 text-sm font-black text-[color:var(--client-text)] outline-none focus:border-[color:var(--client-accent)]";
const orderChangeStorageKey = "needo.merchant.order.changeDrafts.v3";

type MerchantOrderChangeLog = {
  at: string;
  detail: string;
  operator: string;
  title: string;
};

type MerchantOrderChangeDraft = {
  assignedTechnicianId?: string;
  changeLogs?: MerchantOrderChangeLog[];
  itemName: string;
  bookedDate: string;
  bookedTime: string;
  partySize: string;
  durationMinutes: string;
  seatOrSpace: string;
  assignedName: string;
  amount: string;
  paymentMethod: string;
  source: Order["source"];
  notice: string;
  cancellationPolicy: string;
  memberBenefit: string;
  manualRemark: string;
  packageId?: string;
  remark: string;
  serviceId?: string;
  updatedAt?: string;
};

type ServicePackageSelection = {
  amount: number;
  durationMinutes: number;
  itemName: string;
  packageId: string;
  packageName: string;
  service: ServiceItem;
  serviceId: string;
};

type OrderContactInfoEvent = {
  at: string;
  title: string;
  detail: string;
  operator: string;
  tone?: "default" | "accent";
};

const paymentMethodOptions = [
  ["platform", "平台支付"],
  ["offline", "线下支付"],
  ["prepay", "预付"],
  ["cash", "现金"],
  ["paypay", "PayPay"],
  ["paypal", "PayPal"],
  ["wechatpay", "微信支付"],
  ["alipay", "支付宝"]
] as const;

function addMinutesToClock(time: string, minutesToAdd: number) {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const totalMinutes = hour * 60 + minute + minutesToAdd;
  const safeMinutes = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const nextHour = Math.floor(safeMinutes / 60);
  const nextMinute = safeMinutes % 60;

  return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`;
}

function parseOrderSchedule(order: Order, durationMinutes = 90) {
  const [date = "2026-04-14", startTime = "12:00"] = order.bookedAt.split(" ");

  return {
    date,
    startTime,
    endTime: addMinutesToClock(startTime, durationMinutes)
  };
}

function timeToMinutes(time: string) {
  const [hour = 0, minute = 0] = time.split(":").map(Number);

  return hour * 60 + minute;
}

function schedulesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return Math.max(timeToMinutes(startA), timeToMinutes(startB)) < Math.min(timeToMinutes(endA), timeToMinutes(endB));
}

function getMerchantOrder(orderId?: string) {
  return orders.find((item) => item.id === orderId) ?? orders[0];
}

function buildStaffStatuses(technicians: Technician[]) {
  return Object.fromEntries(
    technicians.map((tech, index) => [tech.id, staffStatusSeeds[index % staffStatusSeeds.length]])
  ) as Record<string, StaffStatus>;
}

function getAssignedSchedule(orderId: string, schedules: Schedule[]) {
  return [...schedules].reverse().find((schedule) => schedule.orderId === orderId && schedule.status === "booked");
}

function findMatchedServiceForOrder(order: Order) {
  const normalizedOrderName = order.itemName.replace(/\s+\d+\s*分钟/g, "").trim();

  return services.find((service) =>
    order.itemName.includes(service.name) ||
    service.name.includes(normalizedOrderName) ||
    service.packages.some((item) => order.itemName.includes(item.name))
  );
}

function findServiceForOrder(order: Order) {
  return findMatchedServiceForOrder(order) ?? services[0]!;
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

function getOrderDateTime(order: Order) {
  const [date = "", time = ""] = order.bookedAt.split(" ");

  return { date, time };
}

function getOrderScenario(order: Order, service?: ServiceItem) {
  const targetText = `${order.itemName} ${service?.categoryId ?? ""} ${service?.name ?? ""}`;

  if (/居酒屋|餐|席|レストラン|restaurant|bar|酒屋/i.test(targetText)) {
    return "restaurant";
  }

  if (/按摩|肩颈|舒缓|理疗|massage/i.test(targetText)) {
    return "massage";
  }

  if (order.mode === "home") {
    return "home";
  }

  return "store";
}

function getOrderPartySize(order: Order) {
  if (/双人|2人|二人/.test(order.itemName)) {
    return "2 名";
  }

  if (/三人|3人/.test(order.itemName)) {
    return "3 名";
  }

  if (/四人|4人/.test(order.itemName)) {
    return "4 名";
  }

  return order.mode === "store" ? "1 名" : "1 名 / 1 名担当";
}

function getPaymentMethodLabel(order: Order) {
  const methodLabels: Record<string, string> = {
    platform: "平台支付",
    offline: "线下支付",
    prepay: "预付",
    cash: "现金",
    paypay: "PayPay",
    paypal: "PayPal",
    wechatpay: "微信支付",
    alipay: "支付宝"
  };

  if (order.paymentMethod) {
    return methodLabels[order.paymentMethod] ?? order.paymentMethod;
  }

  if (order.paymentStatus === "depositPaid") {
    return "订金预付";
  }

  if (order.paymentStatus === "unpaid") {
    return "未支付";
  }

  if (order.paymentStatus === "refunded") {
    return "已退款";
  }

  return "平台支付";
}

function getOrderSourceLabel(order: Order) {
  const labels: Record<Order["source"], string> = {
    app: "App",
    web: "Web",
    line: "LINE",
    partner: "Partner"
  };

  return labels[order.source];
}

function readOrderChangeDrafts() {
  return parseBrowserStorageJson<Record<string, MerchantOrderChangeDraft>>(orderChangeStorageKey, {}, {
    removeOnError: true,
    silent: true
  });
}

function getStoredOrderChangeDraft(orderId: string) {
  return readOrderChangeDrafts()[orderId];
}

function writeOrderChangeDraft(orderId: string, draft: MerchantOrderChangeDraft) {
  const drafts = readOrderChangeDrafts();

  writeBrowserStorage(orderChangeStorageKey, JSON.stringify({
    ...drafts,
    [orderId]: draft
  }), {
    silent: true
  });
}

function formatOrderLogDateTime(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function addMinutesToOrderDateTime(value: string, minutesToAdd: number) {
  const normalized = value.replace(" ", "T");
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    const [orderDate = "", orderTime = ""] = value.split(" ");
    return `${orderDate} ${addMinutesToClock(orderTime || "00:00", minutesToAdd)}`.trim();
  }

  date.setMinutes(date.getMinutes() + minutesToAdd);
  return formatOrderLogDateTime(date);
}

function getDurationMinutes(order: Order, service: ServiceItem, scenario: ReturnType<typeof getOrderScenario>) {
  const matchedService = findMatchedServiceForOrder(order);
  const selectedPackage = matchedService ? findPackageForOrder(order, service) : undefined;

  if (selectedPackage) {
    return selectedPackage.durationMinutes;
  }

  return scenario === "restaurant" ? 120 : 90;
}

function formatDurationLabel(durationMinutes: string, scenario: ReturnType<typeof getOrderScenario>) {
  const duration = Number(durationMinutes);

  if (!Number.isFinite(duration) || duration <= 0) {
    return scenario === "restaurant" ? "2 小时" : "90 分钟";
  }

  if (scenario === "restaurant" && duration % 60 === 0) {
    return `${duration / 60} 小时`;
  }

  return `${duration} 分钟`;
}

function getSeatOrSpaceValue(order: Order, store: Store, scenario: ReturnType<typeof getOrderScenario>) {
  if (scenario === "restaurant") {
    return "未指定 / 包间费：无";
  }

  if (order.mode === "home") {
    return `${order.city} · ${order.area}（详细地址服务前确认）`;
  }

  return store.address;
}

function getAssignedLabel(assignedTechnician: Technician | undefined, scenario: ReturnType<typeof getOrderScenario>) {
  if (assignedTechnician) {
    return assignedTechnician.name;
  }

  return scenario === "restaurant" ? "到店后门店安排" : "待手动派单";
}

function getMemberBenefitLabel(customer: Customer) {
  return `${customer.memberLevel} · ${customer.points?.toLocaleString("zh-CN") ?? 0} pt · 优惠券 ${customer.couponCount ?? 0} 张`;
}

function applyOrderChangeDraft(order: Order, draft?: MerchantOrderChangeDraft): Order {
  if (!draft) {
    return order;
  }

  const amount = Number(draft.amount);
  const bookedDate = draft.bookedDate || getOrderDateTime(order).date;
  const bookedTime = draft.bookedTime || getOrderDateTime(order).time;

  return {
    ...order,
    amount: Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : order.amount,
    bookedAt: `${bookedDate} ${bookedTime}`.trim(),
    itemName: draft.itemName.trim() || order.itemName,
    paymentMethod: draft.paymentMethod ? draft.paymentMethod as Order["paymentMethod"] : order.paymentMethod,
    remark: draft.remark.trim() || undefined,
    source: draft.source || order.source
  };
}

function getServicePackageSelections(order: Order) {
  const matchedService = findMatchedServiceForOrder(order);
  const targetScenario = getOrderScenario(order, matchedService);
  const allSelections = services.flatMap((service) =>
    service.packages.map((servicePackage) => ({
      amount: servicePackage.price,
      durationMinutes: servicePackage.durationMinutes,
      itemName: `${service.name} ${servicePackage.durationMinutes} 分钟`,
      packageId: servicePackage.id,
      packageName: servicePackage.name,
      service,
      serviceId: service.id
    }))
  );
  const relevantSelections = allSelections.filter((selection) =>
    selection.service.id === matchedService?.id ||
    getOrderScenario({
      ...order,
      amount: selection.amount,
      itemName: selection.itemName
    }, selection.service) === targetScenario
  );
  const compactSelections = (relevantSelections.length > 0 ? relevantSelections : allSelections).slice(0, 12);
  const exactSelection = allSelections.find((selection) => selection.itemName === order.itemName && selection.amount === order.amount);

  if (exactSelection) {
    return compactSelections.some((selection) => selection.serviceId === exactSelection.serviceId && selection.packageId === exactSelection.packageId)
      ? compactSelections
      : [exactSelection, ...compactSelections].slice(0, 12);
  }
  const currentService = findServiceForOrder(order);
  const currentScenario = getOrderScenario(order, currentService);

  return [
    {
      amount: order.amount,
      durationMinutes: getDurationMinutes(order, currentService, currentScenario),
      itemName: order.itemName,
      packageId: `current-${order.id}`,
      packageName: "当前预约",
      service: currentService,
      serviceId: `current-${order.id}`
    },
    ...compactSelections
  ].slice(0, 12);
}

function findServiceSelectionForDraft(order: Order, draft: MerchantOrderChangeDraft) {
  const selections = getServicePackageSelections(order);

  return selections.find((selection) => selection.serviceId === draft.serviceId && selection.packageId === draft.packageId) ??
    selections.find((selection) => selection.itemName === draft.itemName && String(selection.amount) === draft.amount) ??
    selections[0];
}

function buildServiceSelectionCardData(selection: ServicePackageSelection, store: Store): SocialProfileMiniData {
  const baseData = buildServiceMiniCardData(selection.service, store);

  return {
    ...baseData,
    id: `${selection.serviceId}-${selection.packageId}`,
    displayName: selection.itemName,
    headline: `${selection.packageName} · ${selection.durationMinutes} 分钟 · ${yen(selection.amount)}`,
    serviceTags: [selection.packageName, yen(selection.amount), ...selection.service.tags].slice(0, 6),
    detailPath: undefined
  };
}

function getEffectiveAssignedTechnician(
  draft: MerchantOrderChangeDraft | undefined,
  fallbackTechnician: Technician | undefined,
  technicians: Technician[]
) {
  return draft?.assignedTechnicianId
    ? technicians.find((technician) => technician.id === draft.assignedTechnicianId) ?? fallbackTechnician
    : fallbackTechnician;
}

function formatChangePair(beforeValue: string, afterValue: string) {
  return `从「${beforeValue || "未设置"}」改为「${afterValue || "未设置"}」`;
}

function buildOrderChangeLogEntries({
  at,
  next,
  operator,
  previous,
  scenario
}: {
  at: string;
  next: MerchantOrderChangeDraft;
  operator: string;
  previous: MerchantOrderChangeDraft;
  scenario: ReturnType<typeof getOrderScenario>;
}) {
  const entries: MerchantOrderChangeLog[] = [];
  const previousDateTime = `${previous.bookedDate} ${previous.bookedTime}`.trim();
  const nextDateTime = `${next.bookedDate} ${next.bookedTime}`.trim();

  if (previousDateTime !== nextDateTime) {
    entries.push({
      at,
      detail: `预约时间${formatChangePair(previousDateTime, nextDateTime)}。`,
      operator,
      title: "商户改期"
    });
  }

  if (previous.assignedName !== next.assignedName) {
    entries.push({
      at,
      detail: `${scenario === "restaurant" ? "门店担当" : "担当技师"}${formatChangePair(previous.assignedName, next.assignedName)}。`,
      operator,
      title: scenario === "restaurant" ? "担当变更" : "技师变更"
    });
  }

  if (previous.seatOrSpace !== next.seatOrSpace) {
    entries.push({
      at,
      detail: `${scenario === "restaurant" ? "席位" : next.seatOrSpace.includes("地址") || scenario === "home" ? "地址" : "到店位置"}${formatChangePair(previous.seatOrSpace, next.seatOrSpace)}。`,
      operator,
      title: scenario === "restaurant" ? "席位变更" : "地址变更"
    });
  }

  if (previous.itemName !== next.itemName || previous.amount !== next.amount || previous.durationMinutes !== next.durationMinutes) {
    const details = [
      previous.itemName !== next.itemName ? `服务${formatChangePair(previous.itemName, next.itemName)}` : "",
      previous.durationMinutes !== next.durationMinutes ? `时长${formatChangePair(formatDurationLabel(previous.durationMinutes, scenario), formatDurationLabel(next.durationMinutes, scenario))}` : "",
      previous.amount !== next.amount ? `金额${formatChangePair(yen(Number(previous.amount) || 0), yen(Number(next.amount) || 0))}` : ""
    ].filter(Boolean);

    entries.push({
      at,
      detail: `${details.join("；")}。`,
      operator,
      title: "价格服务变更"
    });
  }

  if (previous.paymentMethod !== next.paymentMethod) {
    const previousPayment = paymentMethodOptions.find(([value]) => value === previous.paymentMethod)?.[1] ?? previous.paymentMethod;
    const nextPayment = paymentMethodOptions.find(([value]) => value === next.paymentMethod)?.[1] ?? next.paymentMethod;

    entries.push({
      at,
      detail: `支付手段${formatChangePair(previousPayment, nextPayment)}。`,
      operator,
      title: "支付信息变更"
    });
  }

  if (previous.partySize !== next.partySize) {
    entries.push({
      at,
      detail: `${scenario === "restaurant" ? "来店人数" : "服务人数"}${formatChangePair(previous.partySize, next.partySize)}。`,
      operator,
      title: "人数变更"
    });
  }

  if (previous.notice !== next.notice || previous.cancellationPolicy !== next.cancellationPolicy) {
    entries.push({
      at,
      detail: "注意事项或取消政策已按当前预约内容自动更新。",
      operator,
      title: "预约规则更新"
    });
  }

  if (previous.remark !== next.remark || previous.manualRemark !== next.manualRemark) {
    entries.push({
      at,
      detail: next.manualRemark || next.remark || "商户清空了备注。",
      operator,
      title: "商户备注"
    });
  }

  return entries;
}

function getReservationNotice(order: Order, service: ServiceItem, scenario: ReturnType<typeof getOrderScenario>) {
  const serviceNotice = service.notice.join(" / ");

  if (scenario === "restaurant") {
    return "桌位、吧台或包间会尽量按希望安排，无法保证时会电话确认；超过预约时间 15 分钟且联系不上时，可能按取消处理。";
  }

  if (scenario === "massage") {
    return `${serviceNotice}；请提前确认酒店/公寓门禁、可服务空间和是否需要女性技师。`;
  }

  if (scenario === "home") {
    return `${serviceNotice}；请提前确认地址、门禁、停车或设备型号，超出标准范围会现场确认报价。`;
  }

  return serviceNotice || "请按预约时间到店，如需指定担当或变更时间，请提前联系门店。";
}

function getCancellationPolicy(scenario: ReturnType<typeof getOrderScenario>) {
  if (scenario === "restaurant") {
    return "来店前 2 小时内取消或无联系未到店，订金可能不退；多人预约以门店规则为准。";
  }

  if (scenario === "home") {
    return "上门前 3 小时内取消，可能产生交通/准备成本；技师出发后请优先联系平台处理。";
  }

  return "预约开始前 2 小时内取消或变更，可能产生取消费；已支付金额按商户规则原路退回。";
}

function buildOrderServiceCardData(order: Order, service: ServiceItem, store: Store, matchedService?: ServiceItem): SocialProfileMiniData {
  const scenario = getOrderScenario(order, matchedService ?? service);
  const baseData = buildServiceMiniCardData(service, store);
  const modeLabel = order.mode === "home" ? "上门服务" : scenario === "restaurant" ? "到店餐饮" : "到店预约";
  const fallbackTags = scenario === "restaurant"
    ? [modeLabel, "席位预约", order.area]
    : [modeLabel, order.area, "平台确认"];

  return {
    ...baseData,
    id: order.id,
    displayName: order.itemName,
    avatar: matchedService ? baseData.avatar : store.cover,
    coverImage: matchedService ? baseData.coverImage : store.gallery[0] || store.cover,
    headline: matchedService ? service.summary : `${order.storeName ?? store.name} 的预约项目`,
    regionLabel: order.area,
    addressLabel: order.area,
    addressValue: order.mode === "home" ? `${order.city} · ${order.area}` : order.storeName ?? store.name,
    serviceTags: (matchedService ? [modeLabel, ...service.tags] : fallbackTags).slice(0, 6),
    usageCount: matchedService ? service.sales : undefined,
    detailPath: undefined
  };
}

function buildUnassignedStaffCardData(order: Order, store: Store, scenario: ReturnType<typeof getOrderScenario>): SocialProfileMiniData {
  const staffLabel = scenario === "restaurant" ? "门店担当" : "担当技师";

  return {
    id: `unassigned-${order.id}`,
    entityType: "technician",
    displayName: `${staffLabel}待分配`,
    avatar: store.cover,
    coverImage: store.gallery[0] || store.cover,
    headline: scenario === "restaurant" ? "到店后由门店安排接待人员" : "确认后可从员工列表指派担当",
    genderLabel: staffLabel,
    regionLabel: order.area,
    addressValue: order.mode === "home" ? `${order.city} · ${order.area}` : store.address,
    primaryLabel: staffLabel,
    kycVerified: false,
    serviceTags: [order.mode === "home" ? "上门担当" : "到店担当", "待分配"],
    levelLabel: "",
    scoreLabel: "状态",
    scoreValue: "待定",
    followerCount: 0,
    followingCount: 0
  };
}

function getReservationInfoRows({
  assignedTechnician,
  changeDraft,
  customer,
  order,
  service,
  store
}: {
  assignedTechnician?: Technician;
  changeDraft?: MerchantOrderChangeDraft;
  customer: Customer;
  order: Order;
  service: ServiceItem;
  store: Store;
}) {
  const { date, time } = getOrderDateTime(order);
  const scenario = getOrderScenario(order, service);
  const matchedService = findMatchedServiceForOrder(order);
  const selectedPackage = matchedService ? findPackageForOrder(order, service) : undefined;
  const durationLabel = changeDraft?.durationMinutes
    ? formatDurationLabel(changeDraft.durationMinutes, scenario)
    : selectedPackage ? `${selectedPackage.durationMinutes} 分钟` : scenario === "restaurant" ? "2 小时" : "90 分钟";
  const partySizeLabel = changeDraft?.partySize.trim() || getOrderPartySize(order);
  const venueLabel = scenario === "restaurant" ? "餐饮店" : order.mode === "home" ? "服务方" : "门店";
  const venueName = order.storeName ?? store.name;
  const courseLabel = scenario === "restaurant" ? "餐食/套餐" : "套餐/项目";
  const seatOrSpaceLabel = scenario === "restaurant" ? "席位" : order.mode === "home" ? "服务地点" : "到店位置";
  const seatOrSpaceValue = changeDraft?.seatOrSpace.trim() || getSeatOrSpaceValue(order, store, scenario);
  const itemName = changeDraft?.itemName.trim() || order.itemName;
  const notice = changeDraft?.notice.trim() || getReservationNotice(order, service, scenario);
  const cancellationPolicy = changeDraft?.cancellationPolicy.trim() || getCancellationPolicy(scenario);
  const memberBenefit = changeDraft?.memberBenefit.trim() || getMemberBenefitLabel(customer);
  const assignedLabel = changeDraft?.assignedName.trim() || getAssignedLabel(assignedTechnician, scenario);
  const baseRemark = changeDraft?.remark.trim() || order.remark;
  const manualRemark = changeDraft?.manualRemark?.trim();
  const remark = [baseRemark, manualRemark ? `商户备注：${manualRemark}` : ""].filter(Boolean).join("\n") || "无特别备注";

  return [
    ["预约状态", statusLabel(order.status)],
    ["预约编号", order.orderNo],
    ["预约者", order.customerName],
    [venueLabel, venueName],
    [scenario === "restaurant" ? "来店人数" : "服务人数", partySizeLabel],
    [scenario === "restaurant" ? "来店日" : "预约日", changeDraft?.bookedDate || date],
    [scenario === "restaurant" ? "来店时刻" : "预约时刻", changeDraft?.bookedTime || time],
    [scenario === "restaurant" ? "滞在可能时间" : "服务时长", durationLabel],
    [courseLabel, `${itemName}${selectedPackage && itemName === order.itemName ? ` / ${selectedPackage.name}` : ""}`],
    [seatOrSpaceLabel, seatOrSpaceValue],
    ["担当", assignedLabel],
    ["注意事项", notice],
    ["取消政策", cancellationPolicy],
    ["会员权益", memberBenefit],
    ["备注", remark]
  ];
}

function buildOrderChangeDraft({
  assignedTechnician,
  customer,
  order,
  service,
  store,
  storedDraft
}: {
  assignedTechnician?: Technician;
  customer: Customer;
  order: Order;
  service: ServiceItem;
  store: Store;
  storedDraft?: MerchantOrderChangeDraft;
}) {
  const scenario = getOrderScenario(order, service);
  const { date, time } = getOrderDateTime(order);
  const initialSelection = getServicePackageSelections(order).find((selection) =>
    selection.itemName === order.itemName && selection.amount === order.amount
  );
  const baseDraft: MerchantOrderChangeDraft = {
    assignedTechnicianId: assignedTechnician?.id,
    changeLogs: [],
    itemName: order.itemName,
    bookedDate: date,
    bookedTime: time,
    partySize: getOrderPartySize(order),
    durationMinutes: String(initialSelection?.durationMinutes ?? getDurationMinutes(order, service, scenario)),
    seatOrSpace: getSeatOrSpaceValue(order, store, scenario),
    assignedName: getAssignedLabel(assignedTechnician, scenario),
    amount: String(order.amount),
    paymentMethod: order.paymentMethod ?? (order.paymentStatus === "depositPaid" ? "prepay" : "platform"),
    source: order.source,
    notice: getReservationNotice(order, service, scenario),
    cancellationPolicy: getCancellationPolicy(scenario),
    memberBenefit: getMemberBenefitLabel(customer),
    manualRemark: "",
    packageId: initialSelection?.packageId,
    remark: order.remark ?? "",
    serviceId: initialSelection?.serviceId ?? service.id,
    updatedAt: undefined
  };

  return {
    ...baseDraft,
    ...storedDraft,
    changeLogs: storedDraft?.changeLogs ?? [],
    manualRemark: storedDraft?.manualRemark ?? ""
  };
}

function getOrderContactInfoEvents({
  assignedTechnician,
  changeDraft,
  order,
  service,
  store
}: {
  assignedTechnician?: Technician;
  changeDraft?: MerchantOrderChangeDraft;
  order: Order;
  service: ServiceItem;
  store: Store;
}) {
  const scenario = getOrderScenario(order, service);
  const providerName = order.storeName ?? store.name;
  const acceptedAt = addMinutesToOrderDateTime(order.createdAt, order.source === "line" ? 8 : 3);
  const events: OrderContactInfoEvent[] = [
    {
      at: order.createdAt,
      detail: `${getOrderSourceLabel(order)} 创建预约，金额 ${yen(order.amount)}，支付手段 ${getPaymentMethodLabel(order)}。`,
      operator: order.customerName,
      title: "预约创建"
    },
    {
      at: acceptedAt,
      detail: `${providerName} 接单，预约状态更新为 ${statusLabel(order.status)}。`,
      operator: providerName,
      title: "服务方接单",
      tone: "accent"
    }
  ];

  if (assignedTechnician) {
    events.push({
      at: addMinutesToOrderDateTime(acceptedAt, 7),
      detail: `${scenario === "restaurant" ? "门店担当" : "担当技师"}变更为 ${assignedTechnician.name}。`,
      operator: providerName,
      title: "担当确认"
    });
  }

  if (order.remark) {
    events.push({
      at: addMinutesToOrderDateTime(order.createdAt, 12),
      detail: `用户备注：${order.remark}`,
      operator: order.customerName,
      title: "备注同步"
    });
  }

  if (order.status === "cancelled") {
    events.push({
      at: addMinutesToOrderDateTime(order.createdAt, 18),
      detail: "用户取消预约，系统保留订单状态和退款处理线索。",
      operator: order.customerName,
      title: "用户取消",
      tone: "accent"
    });
  }

  if (changeDraft?.changeLogs?.length) {
    changeDraft.changeLogs.forEach((log) => {
      events.push({
        at: log.at,
        detail: log.detail,
        operator: log.operator,
        title: log.title,
        tone: "accent"
      });
    });
  }

  return events.sort((left, right) => left.at.localeCompare(right.at));
}

function DispatchStatusBadge({
  label,
  tone = "red",
  floating = false
}: {
  label: string;
  tone?: "red" | "muted";
  floating?: boolean;
}) {
  return (
    <span
      className={cn(
        "pointer-events-none z-20 inline-flex h-8 items-center rounded-full border px-3 text-[12px] font-black leading-none shadow-[0_5px_14px_rgba(255,86,79,0.28)]",
        floating && "absolute -right-1.5 -top-2 h-6 px-2.5 text-[11px]",
        tone === "red"
          ? "border-white/75 bg-[linear-gradient(180deg,#ff8b7f_0%,#ff5f58_48%,#ff453f_100%)] text-white"
          : "border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,transparent)] text-[color:var(--client-muted)] shadow-panel"
      )}
    >
      {label}
    </span>
  );
}

function DispatchOrderMiniCard({ order, store }: { order: Order; store: Store }) {
  const service = findServiceForOrder(order);
  const modeLabel = order.mode === "home" ? "上门服务" : "到店预约";
  const serviceCardData = {
    ...buildServiceMiniCardData(service, store),
    id: order.id,
    displayName: order.itemName,
    headline: `${order.bookedAt} · ${order.area} · ${yen(order.amount)}`,
    regionLabel: order.area,
    addressLabel: order.area,
    addressValue: order.storeName ?? store.address,
    serviceTags: [modeLabel, yen(order.amount), ...service.tags].slice(0, 4),
    detailPath: `/merchant/orders/${order.id}`
  };

  return (
    <SocialProfileMiniCard
      actionSlot={<DispatchStatusBadge label="待分配" />}
      data={serviceCardData}
      detailTo={`/merchant/orders/${order.id}`}
    />
  );
}

function DispatchTechnicianMiniCard({
  available,
  distanceMinutes,
  hasConflict,
  isFirstChoice,
  onAssign,
  statusLabel,
  technician
}: {
  available: boolean;
  distanceMinutes: number;
  hasConflict: boolean;
  isFirstChoice: boolean;
  onAssign: () => void;
  statusLabel: StaffStatus;
  technician: Technician;
}) {
  const recommendationLabel = available ? (isFirstChoice ? "建议首选" : "可指派") : hasConflict ? "时间冲突" : statusLabel;

  return (
    <div className={cn("relative", available ? "cursor-pointer" : "cursor-not-allowed opacity-60")}>
      <SocialProfileMiniCard
        actionSlot={<DispatchStatusBadge label={recommendationLabel} tone={available || hasConflict ? "red" : "muted"} />}
        detailTo=""
        onOpenDetails={available ? onAssign : undefined}
        technician={technician}
      />
      <div className="mt-2 rounded-[18px] bg-[color:color-mix(in_srgb,var(--client-elevated)_72%,transparent)] px-3 py-2 text-xs font-bold text-[color:var(--client-muted)]">
        ★ {technician.rating} · 接单率 {technician.acceptRate}% · 距离约 {distanceMinutes} 分钟
        {hasConflict ? <span className="mt-1 block text-[11px] text-coral">该时段已有工作，建议改派其他员工</span> : null}
      </div>
    </div>
  );
}

function OrderContactInfoTimeline({ events }: { events: OrderContactInfoEvent[] }) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_90%,var(--client-bg)_10%)] shadow-panel">
      <h2 className="border-b border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] px-4 py-3 text-base font-black text-[color:var(--client-text)]">联系信息</h2>
      <div className="space-y-0 px-4 py-2">
        {events.map((event, index) => (
          <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-3" key={`${event.at}-${event.title}`}>
            <span className="pt-1 text-[11px] font-black text-[color:var(--client-muted)]">{event.at}</span>
            <div className="relative border-l border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] pl-4">
              <span
                className={cn(
                  "absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border border-white/70",
                  event.tone === "accent" ? "bg-coral" : "bg-[color:var(--client-accent)]"
                )}
              />
              <strong className="block text-sm font-black text-[color:var(--client-text)]">{event.title}</strong>
              <p className="mt-1 whitespace-pre-line text-xs font-bold leading-5 text-[color:var(--client-muted)]">{event.detail}</p>
              <p className="mt-1 text-[11px] font-black text-[color:color-mix(in_srgb,var(--client-text)_78%,var(--client-muted)_22%)]">操作人：{event.operator}</p>
              {index === events.length - 1 ? <span className="absolute bottom-0 left-[-1px] h-3 w-px bg-[color:var(--client-surface)]" /> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ChangeField({
  children,
  help,
  label
}: {
  children: ReactNode;
  help?: string;
  label: string;
}) {
  return (
    <label className="block rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,var(--client-bg)_14%)] px-3 py-3">
      <span className="block text-[11px] font-black text-[color:var(--client-muted)]">{label}</span>
      <div className="mt-2">{children}</div>
      {help ? <span className="mt-2 block text-[10px] font-bold leading-4 text-[color:var(--client-muted)]">{help}</span> : null}
    </label>
  );
}

function ReadOnlyInfoGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(([label, value]) => (
        <div
          className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_66%,transparent)] px-3 py-3"
          key={label}
        >
          <p className="text-[10px] font-black text-[color:var(--client-muted)]">{label}</p>
          <strong className="mt-1 block break-words text-xs font-black leading-5 text-[color:var(--client-text)]">{value}</strong>
        </div>
      ))}
    </div>
  );
}

function ChangeLogPreview({ entries }: { entries: MerchantOrderChangeLog[] }) {
  return (
    <section className="rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_82%,transparent)] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black text-[color:var(--client-text)]">系统自动变更记录</h3>
        <span className="rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] px-2.5 py-1 text-[10px] font-black text-[color:var(--client-muted)]">
          {entries.length} 条
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {entries.length > 0 ? entries.map((entry) => (
          <div className="rounded-[16px] bg-[color:color-mix(in_srgb,var(--client-elevated)_70%,transparent)] px-3 py-2" key={`${entry.title}-${entry.detail}`}>
            <strong className="block text-xs font-black text-[color:var(--client-text)]">{entry.title}</strong>
            <p className="mt-1 text-[11px] font-bold leading-5 text-[color:var(--client-muted)]">{entry.detail}</p>
          </div>
        )) : (
          <p className="rounded-[16px] bg-[color:color-mix(in_srgb,var(--client-elevated)_70%,transparent)] px-3 py-2 text-xs font-bold text-[color:var(--client-muted)]">
            修改服务、担当、时间、地址、价格或备注后，系统会在保存时自动写入联系信息。
          </p>
        )}
      </div>
    </section>
  );
}

function LockedInfoRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_90%,var(--client-bg)_10%)] shadow-panel">
      <h2 className="border-b border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] px-4 py-3 text-base font-black text-[color:var(--client-text)]">不可变更信息</h2>
      <div className="divide-y divide-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)]">
        {rows.map(([label, value]) => (
          <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 px-4 py-3 text-sm" key={label}>
            <span className="font-black text-[color:var(--client-muted)]">{label}</span>
            <strong className="min-w-0 break-words font-black text-[color:var(--client-text)]">{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function MerchantOrderDetailContent() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const baseOrder = getMerchantOrder(orderId);
  const storedDraft = getStoredOrderChangeDraft(baseOrder.id);
  const order = applyOrderChangeDraft(baseOrder, storedDraft);
  const { session } = useAuth();
  const { customers, stores, technicians } = useEntityStore();
  const { schedules: liveSchedules } = useScheduleStore();
  const customer = customers.find((item) => item.id === order.customerId) ?? customers[0];
  const store = stores.find((item) => item.id === session?.linkedStoreId) ?? stores[0];
  const assignedSchedule = getAssignedSchedule(order.id, liveSchedules);
  const customerDetailPath = getScopedProfileDetailPath("merchant", "user", customer.id);
  const scheduledTechnician =
    technicians.find((item) => item.id === assignedSchedule?.staffId) ??
    technicians.find((item) => item.name === order.technicianName);
  const assignedTechnician = getEffectiveAssignedTechnician(storedDraft, scheduledTechnician, technicians);
  const selectedService = storedDraft?.serviceId ? services.find((item) => item.id === storedDraft.serviceId) : undefined;
  const matchedService = selectedService ?? findMatchedServiceForOrder(order);
  const service = matchedService ?? findServiceForOrder(order);
  const scenario = getOrderScenario(order, service);
  const serviceCardData = buildOrderServiceCardData(order, service, store, matchedService);
  const staffCardData = assignedTechnician ? undefined : buildUnassignedStaffCardData(order, store, scenario);
  const reservationInfoRows = getReservationInfoRows({ assignedTechnician, changeDraft: storedDraft, customer, order, service, store });
  const contactInfoEvents = getOrderContactInfoEvents({ assignedTechnician, changeDraft: storedDraft, order, service, store });
  const paymentSummaryItems = [
    ["金额", yen(order.amount)],
    ["支付手段", getPaymentMethodLabel(order)],
    ["来源", getOrderSourceLabel(order)]
  ];

  return (
    <MobileFullscreenPage>
      <MobileFullscreenHeader
        className={fullscreenHeaderClassName}
        onBack={() => navigate(-1)}
        title="预约订单详情"
      />
      <main className="scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-28">
        <OrderDynamicStatusCard order={order} providerName={order.storeName ?? store.name} />

        <section>
          <h2 className="mb-2 text-sm font-black text-[color:var(--client-muted)]">服务</h2>
          <SocialProfileMiniCard
            data={serviceCardData}
            showAction={false}
            topTags={[{ label: statusLabel(order.status), tone: "yellow" }]}
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
          <h2 className="mb-2 text-sm font-black text-[color:var(--client-muted)]">用户</h2>
          <SocialProfileMiniCard
            customer={customer}
            detailTo={customerDetailPath}
            showAction={false}
            topTags={[{ label: "预约者", tone: "purple" }]}
          />
        </section>

        <section>
          <h2 className="mb-2 text-sm font-black text-[color:var(--client-muted)]">技师 / 担当</h2>
          {assignedTechnician ? (
            <SocialProfileMiniCard
              detailTo={`/merchant/staff/${encodeURIComponent(assignedTechnician.id)}`}
              showAction={false}
              technician={assignedTechnician}
              topTags={[{ label: scenario === "restaurant" ? "门店担当" : "担当技师", tone: "green" }]}
            />
          ) : (
            <SocialProfileMiniCard
              data={staffCardData!}
              showAction={false}
              topTags={[{ label: "待分配", tone: "yellow" }]}
            />
          )}
        </section>

        <section className="overflow-hidden rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_90%,var(--client-bg)_10%)] shadow-panel">
          <h2 className="border-b border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] px-4 py-3 text-base font-black text-[color:var(--client-text)]">预约情报</h2>
          <div className="divide-y divide-[color:color-mix(in_srgb,var(--client-line)_64%,transparent)]">
            {reservationInfoRows.map(([label, value]) => (
              <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-3 px-4 py-3 text-sm" key={label}>
                <span className="font-black text-[color:var(--client-muted)]">{label}</span>
                <strong className="min-w-0 whitespace-pre-line break-words font-black leading-6 text-[color:var(--client-text)]">{value}</strong>
              </div>
            ))}
          </div>
        </section>

        <OrderContactInfoTimeline events={contactInfoEvents} />
      </main>
      <footer className="grid grid-cols-3 gap-2 border-t border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)] bg-[color:var(--client-bg)] p-3">
        <Button
          icon={
            <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
              <path d="M6 6.5h12a2.5 2.5 0 0 1 2.5 2.5v5A2.5 2.5 0 0 1 18 16.5H11l-4 3v-3H6A2.5 2.5 0 0 1 3.5 14V9A2.5 2.5 0 0 1 6 6.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.9" />
              <path d="M8.5 11h7M8.5 13.8h4.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
            </svg>
          }
          to={`/merchant/messages?chat=${getMerchantCustomerConversationId(order.customerId)}`}
          variant="secondary"
        >
          聊天
        </Button>
        <Button to={`/merchant/orders/${order.id}/change`} variant="secondary">变更</Button>
        <Button to={`/merchant/orders/${order.id}/dispatch`}>派单给员工</Button>
      </footer>
    </MobileFullscreenPage>
  );
}

function MerchantOrderChangeContent() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const order = getMerchantOrder(orderId);
  const { session } = useAuth();
  const { customers, stores, technicians } = useEntityStore();
  const { schedules: liveSchedules } = useScheduleStore();
  const customer = customers.find((item) => item.id === order.customerId) ?? customers[0];
  const store = stores.find((item) => item.id === session?.linkedStoreId) ?? stores[0];
  const assignedSchedule = getAssignedSchedule(order.id, liveSchedules);
  const assignedTechnician =
    technicians.find((item) => item.id === assignedSchedule?.staffId) ??
    technicians.find((item) => item.name === order.technicianName);
  const service = findMatchedServiceForOrder(order) ?? findServiceForOrder(order);
  const scenario = getOrderScenario(order, service);
  const storedDraft = getStoredOrderChangeDraft(order.id);
  const [draft, setDraft] = useState<MerchantOrderChangeDraft>(() =>
    buildOrderChangeDraft({ assignedTechnician, customer, order, service, store, storedDraft })
  );
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const [staffPickerOpen, setStaffPickerOpen] = useState(false);
  const storeTechnicians = useMemo(() => {
    const scoped = technicians.filter((technician) => technician.storeId === store.id);

    return scoped.length > 0 ? scoped : technicians;
  }, [store.id, technicians]);
  const serviceSelections = useMemo(() => getServicePackageSelections(order), [order]);
  const selectedServiceSelection = findServiceSelectionForDraft(order, draft);
  const selectedTechnician = getEffectiveAssignedTechnician(draft, assignedTechnician, technicians);
  const previousDraft = buildOrderChangeDraft({ assignedTechnician, customer, order, service, store, storedDraft });
  const draftOrder = applyOrderChangeDraft(order, draft);
  const draftScenario = getOrderScenario(draftOrder, selectedServiceSelection?.service ?? service);
  const selectedServiceCardData = selectedServiceSelection
    ? buildServiceSelectionCardData(selectedServiceSelection, store)
    : buildOrderServiceCardData(draftOrder, service, store, findMatchedServiceForOrder(draftOrder));
  const pendingChangeLogs = buildOrderChangeLogEntries({
    at: "保存时",
    next: draft,
    operator: order.storeName ?? store.name,
    previous: previousDraft,
    scenario: draftScenario
  });

  const updateDraft = <Key extends keyof MerchantOrderChangeDraft>(key: Key, value: MerchantOrderChangeDraft[Key]) => {
    setDraft((current) => ({
      ...current,
      [key]: value
    }));
  };

  const selectServicePackage = (selection: ServicePackageSelection) => {
    const nextOrder = {
      ...order,
      amount: selection.amount,
      itemName: selection.itemName
    };
    const nextScenario = getOrderScenario(nextOrder, selection.service);

    setDraft((current) => ({
      ...current,
      amount: String(selection.amount),
      durationMinutes: String(selection.durationMinutes),
      itemName: selection.itemName,
      notice: getReservationNotice(nextOrder, selection.service, nextScenario),
      packageId: selection.packageId,
      paymentMethod: current.paymentMethod,
      serviceId: selection.serviceId
    }));
    setServicePickerOpen(false);
  };

  const selectTechnician = (technician: Technician) => {
    setDraft((current) => ({
      ...current,
      assignedName: technician.name,
      assignedTechnicianId: technician.id
    }));
    setStaffPickerOpen(false);
  };

  const saveDraft = () => {
    const savedAt = formatOrderLogDateTime(new Date());
    const savedDraft: MerchantOrderChangeDraft = {
      ...draft,
      amount: draft.amount.trim() || String(order.amount),
      assignedName: draft.assignedName.trim() || getAssignedLabel(assignedTechnician, scenario),
      bookedDate: draft.bookedDate || getOrderDateTime(order).date,
      bookedTime: draft.bookedTime || getOrderDateTime(order).time,
      durationMinutes: draft.durationMinutes.trim() || String(getDurationMinutes(order, service, scenario)),
      itemName: draft.itemName.trim() || order.itemName,
      memberBenefit: getMemberBenefitLabel(customer),
      manualRemark: draft.manualRemark.trim(),
      notice: draft.notice.trim() || getReservationNotice(order, service, scenario),
      paymentMethod: draft.paymentMethod || order.paymentMethod || "platform",
      partySize: draft.partySize.trim() || getOrderPartySize(order),
      remark: order.remark ?? "",
      seatOrSpace: draft.seatOrSpace.trim() || getSeatOrSpaceValue(order, store, scenario),
      source: order.source,
      updatedAt: savedAt
    };
    const savedLogs = buildOrderChangeLogEntries({
      at: savedAt,
      next: savedDraft,
      operator: order.storeName ?? store.name,
      previous: previousDraft,
      scenario: draftScenario
    });

    writeOrderChangeDraft(order.id, {
      ...savedDraft,
      changeLogs: [
        ...(storedDraft?.changeLogs ?? []),
        ...savedLogs
      ]
    });
    navigate(`/merchant/orders/${order.id}`);
  };

  const lockedRows: Array<[string, string]> = [
    ["用户信息", `${customer.name} · ${customer.phone}`],
    ["预约状态", statusLabel(order.status)],
    ["预约编号", order.orderNo],
    [scenario === "restaurant" ? "餐饮店" : order.mode === "home" ? "服务方" : "门店", order.storeName ?? store.name]
  ];
  const readOnlyRows: Array<[string, string]> = [
    ["会员权益", getMemberBenefitLabel(customer)],
    ["来源信息", getOrderSourceLabel(order)]
  ];

  return (
    <MobileFullscreenPage>
      <MobileFullscreenHeader
        className={fullscreenHeaderClassName}
        onBack={() => navigate(-1)}
        title="变更预约"
      />
      <main className="scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-28">
        <LockedInfoRows rows={lockedRows} />

        <section className="space-y-3 rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_90%,var(--client-bg)_10%)] p-4 shadow-panel">
          <h2 className="text-base font-black text-[color:var(--client-text)]">可变更预约情报</h2>

          <div className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,var(--client-bg)_14%)] px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-black text-[color:var(--client-muted)]">{scenario === "restaurant" ? "餐食/套餐" : "服务/套餐"}</span>
              <Button onClick={() => setServicePickerOpen((open) => !open)} size="sm" variant="secondary">
                {servicePickerOpen ? "收起" : "选择"}
              </Button>
            </div>
            <div className="mt-3">
              <SocialProfileMiniCard data={selectedServiceCardData} showAction={false} />
            </div>
            {servicePickerOpen ? (
              <div className="mt-3 space-y-3">
                {serviceSelections.map((selection) => (
                  <div
                    className={cn(
                      "rounded-[24px] border p-1 transition",
                      selection.serviceId === draft.serviceId && selection.packageId === draft.packageId
                        ? "border-[color:var(--client-accent)] bg-[color:color-mix(in_srgb,var(--client-accent)_12%,transparent)]"
                        : "border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)]"
                    )}
                    key={`${selection.serviceId}-${selection.packageId}`}
                  >
                    <SocialProfileMiniCard
                      data={buildServiceSelectionCardData(selection, store)}
                      onOpenDetails={() => selectServicePackage(selection)}
                      showAction={false}
                      topTags={[{ label: selection.serviceId === draft.serviceId && selection.packageId === draft.packageId ? "已选择" : "可选择", tone: "purple" }]}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ChangeField label={scenario === "restaurant" ? "来店日" : "预约日"}>
              <input
                className={orderChangeInputClassName}
                onChange={(event) => updateDraft("bookedDate", event.target.value)}
                onInput={(event) => updateDraft("bookedDate", event.currentTarget.value)}
                type="date"
                value={draft.bookedDate}
              />
            </ChangeField>
            <ChangeField label={scenario === "restaurant" ? "来店时刻" : "预约时刻"}>
              <input
                className={orderChangeInputClassName}
                onChange={(event) => updateDraft("bookedTime", event.target.value)}
                onInput={(event) => updateDraft("bookedTime", event.currentTarget.value)}
                type="time"
                value={draft.bookedTime}
              />
            </ChangeField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ChangeField label={scenario === "restaurant" ? "来店人数" : "服务人数"}>
              <input
                className={orderChangeInputClassName}
                onChange={(event) => updateDraft("partySize", event.target.value)}
                value={draft.partySize}
              />
            </ChangeField>
            <ChangeField label={scenario === "restaurant" ? "滞在时间（分钟）" : "服务时长（分钟）"}>
              <input
                className={orderChangeInputClassName}
                inputMode="numeric"
                onChange={(event) => updateDraft("durationMinutes", event.target.value)}
                value={draft.durationMinutes}
              />
            </ChangeField>
          </div>

          <ChangeField label={scenario === "restaurant" ? "席位" : order.mode === "home" ? "服务地点" : "到店位置"}>
            <textarea
              className={cn(orderChangeInputClassName, "min-h-20 resize-none leading-5")}
              onChange={(event) => updateDraft("seatOrSpace", event.target.value)}
              value={draft.seatOrSpace}
            />
          </ChangeField>

          <div className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,var(--client-bg)_14%)] px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-black text-[color:var(--client-muted)]">{scenario === "restaurant" ? "门店担当" : "担当技师"}</span>
              <Button onClick={() => setStaffPickerOpen((open) => !open)} size="sm" variant="secondary">
                {staffPickerOpen ? "收起" : "选择"}
              </Button>
            </div>
            <div className="mt-3">
              {selectedTechnician ? (
                <SocialProfileMiniCard showAction={false} technician={selectedTechnician} topTags={[{ label: "当前担当", tone: "green" }]} />
              ) : (
                <SocialProfileMiniCard data={buildUnassignedStaffCardData(order, store, scenario)} showAction={false} topTags={[{ label: "待分配", tone: "yellow" }]} />
              )}
            </div>
            {staffPickerOpen ? (
              <div className="mt-3 space-y-3">
                {storeTechnicians.map((technician) => (
                  <div
                    className={cn(
                      "rounded-[24px] border p-1 transition",
                      technician.id === draft.assignedTechnicianId
                        ? "border-[color:var(--client-accent)] bg-[color:color-mix(in_srgb,var(--client-accent)_12%,transparent)]"
                        : "border-[color:color-mix(in_srgb,var(--client-line)_58%,transparent)]"
                    )}
                    key={technician.id}
                  >
                    <SocialProfileMiniCard
                      onOpenDetails={() => selectTechnician(technician)}
                      showAction={false}
                      technician={technician}
                      topTags={[{ label: technician.id === draft.assignedTechnicianId ? "已选择" : "可选择", tone: "green" }]}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ChangeField label="金额">
              <input
                className={orderChangeInputClassName}
                inputMode="numeric"
                onChange={(event) => updateDraft("amount", event.target.value)}
                value={draft.amount}
              />
            </ChangeField>
            <ChangeField label="支付手段">
              <select
                className={orderChangeInputClassName}
                onChange={(event) => updateDraft("paymentMethod", event.target.value)}
                value={draft.paymentMethod}
              >
                {paymentMethodOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </ChangeField>
          </div>

          <ReadOnlyInfoGrid items={readOnlyRows} />

          <ChangeField label="注意事项">
            <textarea
              className={cn(orderChangeInputClassName, "min-h-24 resize-none leading-5")}
              onChange={(event) => updateDraft("notice", event.target.value)}
              value={draft.notice}
            />
          </ChangeField>

          <ChangeField label="取消政策">
            <textarea
              className={cn(orderChangeInputClassName, "min-h-24 resize-none leading-5")}
              onChange={(event) => updateDraft("cancellationPolicy", event.target.value)}
              value={draft.cancellationPolicy}
            />
          </ChangeField>

          <ChangeField
            help="这部分是人工补充说明；真正的变更记录会由系统根据字段差异自动写入。"
            label="手动备注"
          >
            <textarea
              className={cn(orderChangeInputClassName, "min-h-24 resize-none leading-5")}
              onChange={(event) => updateDraft("manualRemark", event.target.value)}
              placeholder="例如：已电话确认门禁，用户希望技师到达前 10 分钟联系。"
              value={draft.manualRemark}
            />
          </ChangeField>

          <ChangeLogPreview entries={pendingChangeLogs} />
        </section>
      </main>
      <footer className="grid grid-cols-2 gap-2 border-t border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)] bg-[color:var(--client-bg)] p-3">
        <Button onClick={() => navigate(-1)} variant="secondary">取消</Button>
        <Button onClick={saveDraft}>保存变更</Button>
      </footer>
    </MobileFullscreenPage>
  );
}

function MerchantOrderDispatchContent() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const order = getMerchantOrder(orderId);
  const { session } = useAuth();
  const { stores, technicians } = useEntityStore();
  const { schedules: liveSchedules } = useScheduleStore();
  const store = stores.find((item) => item.id === session?.linkedStoreId) ?? stores[0];
  const storeTechnicians = useMemo(() => {
    const scoped = technicians.filter((tech) => tech.storeId === store.id);

    return scoped.length > 0 ? scoped : technicians;
  }, [store.id, technicians]);
  const staffStatuses = useMemo(() => buildStaffStatuses(technicians), [technicians]);
  const dispatchCandidates = useMemo(() => {
    const target = parseOrderSchedule(order);

    return storeTechnicians
      .map((tech, index) => {
        const daySchedules = liveSchedules.filter((schedule) => schedule.staffId === tech.id && schedule.date === target.date);
        const hasConflict = daySchedules.some((schedule) => schedulesOverlap(schedule.startTime, schedule.endTime, target.startTime, target.endTime));
        const distanceMinutes = 8 + index * 4;
        const available = staffStatuses[tech.id] !== "休息" && staffStatuses[tech.id] !== "服务中" && !hasConflict;
        const score = (available ? 200 : 0) + tech.acceptRate - tech.cancelRate - distanceMinutes / 2;

        return {
          tech,
          hasConflict,
          distanceMinutes,
          available,
          score
        };
      })
      .sort((left, right) => right.score - left.score);
  }, [liveSchedules, order, staffStatuses, storeTechnicians]);

  const assignOrderToTechnician = (technicianId: string) => {
    const technician = storeTechnicians.find((tech) => tech.id === technicianId);

    if (!technician) {
      return;
    }

    const target = parseOrderSchedule(order);
    liveSchedules
      .filter((schedule) => schedule.orderId === order.id)
      .forEach((schedule) => removeSharedSchedule(schedule.id));
    addSharedSchedules([
      {
        id: `sched-${order.id}`,
        staffId: technician.id,
        date: target.date,
        startTime: target.startTime,
        endTime: target.endTime,
        status: "booked",
        orderId: order.id
      }
    ]);
    navigate(`/merchant/orders/${order.id}`);
  };

  return (
    <MobileFullscreenPage>
      <MobileFullscreenHeader
        className={fullscreenHeaderClassName}
        info="从店铺旗下员工里手动指派本次预约"
        onBack={() => navigate(-1)}
        title="手动派单"
      />
      <main className="scrollbar-none min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <DispatchOrderMiniCard order={order} store={store} />
        {dispatchCandidates.map(({ tech, available, distanceMinutes, hasConflict }, index) => (
          <DispatchTechnicianMiniCard
            available={available}
            distanceMinutes={distanceMinutes}
            hasConflict={hasConflict}
            isFirstChoice={index === 0}
            key={tech.id}
            onAssign={() => assignOrderToTechnician(tech.id)}
            statusLabel={staffStatuses[tech.id]}
            technician={tech}
          />
        ))}
      </main>
    </MobileFullscreenPage>
  );
}

export function MerchantOrderDetailRoutePage() {
  return (
    <MobileShell navItems={[]}>
      <MerchantOrderDetailContent />
    </MobileShell>
  );
}

export function MerchantOrderChangeRoutePage() {
  return (
    <MobileShell navItems={[]}>
      <MerchantOrderChangeContent />
    </MobileShell>
  );
}

export function MerchantOrderDispatchRoutePage() {
  return (
    <MobileShell navItems={[]}>
      <MerchantOrderDispatchContent />
    </MobileShell>
  );
}
