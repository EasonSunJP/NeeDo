import type { Customer, Order, OrderStatus, Settlement, Store, Technician } from "../../types/domain";

export type AnalyticsGranularity = "hour" | "day" | "week" | "month";
export type AnalyticsRangePreset = "today" | "week" | "month" | "last7" | "last30" | "custom";
export type AnalyticsCompareMode = "previous_period" | "previous_year" | "none";
export type AnalyticsOrderType = "booking" | "request";
export type AnalyticsMetricUnit = "jpy" | "count" | "percent" | "minutes" | "ndp";
export type AnalyticsMetricStatus = "normal" | "warning" | "danger";
export type AnalyticsAlertSeverity = "info" | "warning" | "high" | "critical";
export type AnalyticsNdpStatus = "healthy" | "warning" | "negative" | "frozen";
export type AnalyticsSettlementStatus = "pending" | "confirmed" | "abnormal";
export type AnalyticsDateRangeAnchor = "start" | "end";

export interface AnalyticsFilterState {
  startDate: string;
  endDate: string;
  timezone: "Asia/Tokyo";
  granularity: AnalyticsGranularity;
  compareMode?: AnalyticsCompareMode;
  preset?: AnalyticsRangePreset;
  shopIds?: string[];
  castIds?: string[];
  brokerIds?: string[];
  scoutIds?: string[];
  serviceCategoryIds?: string[];
  orderTypes?: AnalyticsOrderType[];
  orderStatuses?: OrderStatus[];
  customerSegments?: string[];
  areas?: string[];
  ndpBalanceStatus?: AnalyticsNdpStatus[];
  settlementStatus?: AnalyticsSettlementStatus[];
  manualIntervention?: boolean | null;
}

export interface MetricValue {
  value: number;
  unit: AnalyticsMetricUnit;
  previousValue?: number;
  delta?: number;
  deltaPercent?: number;
  status?: AnalyticsMetricStatus;
  explanation?: string;
}

export interface TimeSeriesPoint {
  bucket: string;
  label: string;
  grossRevenue: number;
  netProfit: number;
  createdOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  ndpCost: number;
}

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  conversionRate: number;
  dropOffRate: number;
}

export interface CastRankItem {
  castId: string;
  castName: string;
  avatar: string;
  completedOrders: number;
  revenue: number;
  incomeTrend: TimeSeriesPoint[];
  workTrend: TimeSeriesPoint[];
  rating: number;
  completionRate: number;
  cancellationRate: number;
  onlineMinutes: number;
  serviceMinutes: number;
  ndpBalance: number;
  ndpStatus: AnalyticsNdpStatus;
  riskLabel: string;
  suggestion: string;
}

export interface CustomerSegmentItem {
  key: string;
  label: string;
  count: number;
  share: number;
  revenue: number;
  tone: AnalyticsMetricStatus;
}

export interface FinanceBreakdownItem {
  key: string;
  label: string;
  amount: number;
  type: "income" | "cost" | "net";
  explanation: string;
}

export interface NdpSummary {
  balance: number;
  ndpDebited: number;
  ndpReleased: number;
  ndpCompensated: number;
  ndpTopup: number;
  ndpNetCost: number;
  costSharePercent: number;
  negativeAccounts: number;
  trend: TimeSeriesPoint[];
}

export interface DashboardAlert {
  id: string;
  alertType: string;
  severity: AnalyticsAlertSeverity;
  target: string;
  title: string;
  message: string;
  suggestion: string;
  actionLabel: string;
  actionTo: string;
}

export interface ShopAnalyticsOverview {
  timezone: "Asia/Tokyo";
  filters: AnalyticsFilterState;
  summary: {
    grossRevenue: MetricValue;
    netProfit: MetricValue;
    completedOrders: MetricValue;
    completionRate: MetricValue;
    cancellationRate: MetricValue;
    avgOrderValue: MetricValue;
    onlineCasts: MetricValue;
    ndpCost: MetricValue;
    firstResponseTime: MetricValue;
    manualInterventionRate: MetricValue;
  };
  revenueTrend: TimeSeriesPoint[];
  orderTrend: TimeSeriesPoint[];
  orderFunnel: FunnelStep[];
  topCasts: CastRankItem[];
  customerSegments: CustomerSegmentItem[];
  financeBreakdown: FinanceBreakdownItem[];
  ndpSummary: NdpSummary;
  alerts: DashboardAlert[];
  scopedOrders: Order[];
  recentOrders: Order[];
  insightText: string;
  rangeLabel: string;
  selectedFilterCount: number;
}

export interface BuildShopAnalyticsInput {
  store: Store;
  stores: Store[];
  technicians: Technician[];
  customers: Customer[];
  orders: Order[];
  settlements: Settlement[];
  filters: AnalyticsFilterState;
  personnelMonthlyCost?: number;
}

const timezone = "Asia/Tokyo" as const;
const emptyFilterArrays: Array<keyof AnalyticsFilterState> = [
  "shopIds",
  "castIds",
  "brokerIds",
  "scoutIds",
  "serviceCategoryIds",
  "orderTypes",
  "orderStatuses",
  "customerSegments",
  "areas",
  "ndpBalanceStatus",
  "settlementStatus"
];

function parseDateParts(date: string) {
  const [year = "2026", month = "1", day = "1"] = date.split("-");

  return {
    year: Number(year),
    month: Number(month),
    day: Number(day)
  };
}

function toUtcDate(date: string) {
  const { year, month, day } = parseDateParts(date);

  return new Date(Date.UTC(year, month - 1, day));
}

function toUtcHour(value: string) {
  const { year, month, day } = parseDateParts(value.slice(0, 10));
  const hour = Number(value.slice(11, 13) || "0");

  return new Date(Date.UTC(year, month - 1, day, Number.isFinite(hour) ? hour : 0));
}

function formatDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(date: string, days: number) {
  const next = toUtcDate(date);
  next.setUTCDate(next.getUTCDate() + days);

  return formatDate(next);
}

function countInclusiveDays(startDate: string, endDate: string) {
  const start = toUtcDate(startDate).getTime();
  const end = toUtcDate(endDate).getTime();

  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

export const shopAnalyticsMaxRangeDays = 60;

export function getShopAnalyticsRangeDayCount(startDate: string, endDate: string) {
  return countInclusiveDays(startDate, endDate);
}

function normalizeShopAnalyticsDateRange(filter: AnalyticsFilterState, anchor: AnalyticsDateRangeAnchor = "start"): AnalyticsFilterState {
  let startDate = filter.startDate;
  let endDate = filter.endDate;

  if (endDate < startDate) {
    if (anchor === "end") {
      startDate = endDate;
    } else {
      endDate = startDate;
    }
  }

  if (countInclusiveDays(startDate, endDate) > shopAnalyticsMaxRangeDays) {
    if (anchor === "end") {
      startDate = addDays(endDate, -(shopAnalyticsMaxRangeDays - 1));
    } else {
      endDate = addDays(startDate, shopAnalyticsMaxRangeDays - 1);
    }
  }

  return { ...filter, startDate, endDate };
}

export function getAllowedShopAnalyticsGranularities(filter: AnalyticsFilterState): AnalyticsGranularity[] {
  const normalizedFilter = normalizeShopAnalyticsDateRange(filter);

  if (normalizedFilter.preset === "today") {
    return ["hour"];
  }

  if (normalizedFilter.preset === "week" || normalizedFilter.preset === "last7") {
    return ["day"];
  }

  if (normalizedFilter.preset === "month" || normalizedFilter.preset === "last30") {
    return ["day", "week"];
  }

  const rangeDays = countInclusiveDays(normalizedFilter.startDate, normalizedFilter.endDate);

  if (rangeDays <= 1) {
    return ["hour"];
  }

  if (rangeDays < 14) {
    return ["day"];
  }

  if (rangeDays < shopAnalyticsMaxRangeDays) {
    return ["day", "week"];
  }

  return ["day", "week", "month"];
}

export function canUseShopAnalyticsGranularity(filter: AnalyticsFilterState, granularity: AnalyticsGranularity) {
  return getAllowedShopAnalyticsGranularities(filter).includes(granularity);
}

function getDefaultShopAnalyticsGranularity(filter: AnalyticsFilterState) {
  return getAllowedShopAnalyticsGranularities(filter)[0] ?? "day";
}

export function normalizeShopAnalyticsFilter(
  filter: AnalyticsFilterState,
  options: { anchor?: AnalyticsDateRangeAnchor; forceDefaultGranularity?: boolean } = {}
): AnalyticsFilterState {
  const normalizedFilter = normalizeShopAnalyticsDateRange(filter, options.anchor);
  const allowedGranularities = getAllowedShopAnalyticsGranularities(normalizedFilter);
  const shouldUseDefaultGranularity = options.forceDefaultGranularity || !allowedGranularities.includes(normalizedFilter.granularity);

  return {
    ...normalizedFilter,
    granularity: shouldUseDefaultGranularity ? getDefaultShopAnalyticsGranularity(normalizedFilter) : normalizedFilter.granularity
  };
}

function formatDateHour(date: Date) {
  return `${formatDate(date)} ${String(date.getUTCHours()).padStart(2, "0")}:00`;
}

function addHours(value: string, hours: number) {
  const next = toUtcHour(value);
  next.setUTCHours(next.getUTCHours() + hours);

  return formatDateHour(next);
}

function startOfWeek(date: string) {
  const value = toUtcDate(date);
  const day = value.getUTCDay();
  const distanceFromMonday = day === 0 ? 6 : day - 1;
  value.setUTCDate(value.getUTCDate() - distanceFromMonday);

  return formatDate(value);
}

function startOfMonth(date: string) {
  const { year, month } = parseDateParts(date);

  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function monthBucket(date: string) {
  return date.slice(0, 7);
}

function getOrderDate(order: Order) {
  return order.bookedAt.slice(0, 10);
}

function getLatestOrderDate(orders: Order[]) {
  return orders.map(getOrderDate).sort().at(-1) ?? "2026-04-12";
}

export function createDefaultShopAnalyticsFilter(orders: Order[] = []): AnalyticsFilterState {
  const latestDate = getLatestOrderDate(orders);

  return {
    startDate: latestDate,
    endDate: latestDate,
    timezone,
    granularity: "hour",
    compareMode: "previous_period",
    preset: "today",
    manualIntervention: null
  };
}

export function createShopAnalyticsPresetFilter(
  preset: AnalyticsRangePreset,
  orders: Order[],
  previousFilter?: AnalyticsFilterState
): AnalyticsFilterState {
  const latestDate = getLatestOrderDate(orders);
  const base: AnalyticsFilterState = {
    ...(previousFilter ?? createDefaultShopAnalyticsFilter(orders)),
    timezone,
    compareMode: previousFilter?.compareMode ?? "previous_period",
    preset
  };

  if (preset === "today") {
    return normalizeShopAnalyticsFilter({ ...base, startDate: latestDate, endDate: latestDate }, { forceDefaultGranularity: true });
  }

  if (preset === "week") {
    return normalizeShopAnalyticsFilter({ ...base, startDate: startOfWeek(latestDate), endDate: latestDate }, { forceDefaultGranularity: true });
  }

  if (preset === "month") {
    return normalizeShopAnalyticsFilter({ ...base, startDate: startOfMonth(latestDate), endDate: latestDate }, { forceDefaultGranularity: true });
  }

  if (preset === "last7") {
    return normalizeShopAnalyticsFilter({ ...base, startDate: addDays(latestDate, -6), endDate: latestDate }, { forceDefaultGranularity: true });
  }

  if (preset === "last30") {
    return normalizeShopAnalyticsFilter({ ...base, startDate: addDays(latestDate, -29), endDate: latestDate }, { forceDefaultGranularity: true });
  }

  return normalizeShopAnalyticsFilter(base, { forceDefaultGranularity: true });
}

function getDateRangeLength(startDate: string, endDate: string) {
  const start = toUtcDate(startDate).getTime();
  const end = toUtcDate(endDate).getTime();

  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function getPreviousPeriod(filter: AnalyticsFilterState) {
  const length = getDateRangeLength(filter.startDate, filter.endDate);
  const previousEnd = addDays(filter.startDate, -1);
  const previousStart = addDays(previousEnd, -(length - 1));

  return { startDate: previousStart, endDate: previousEnd };
}

export function createPreviousPeriodShopAnalyticsFilter(filter: AnalyticsFilterState): AnalyticsFilterState {
  const previousPeriod = getPreviousPeriod(filter);

  return {
    ...filter,
    startDate: previousPeriod.startDate,
    endDate: previousPeriod.endDate,
    preset: "custom"
  };
}

function isDateInRange(date: string, startDate: string, endDate: string) {
  return date >= startDate && date <= endDate;
}

function getOrderType(order: Order): AnalyticsOrderType {
  return order.source === "line" || order.source === "partner" ? "request" : "booking";
}

function isManualInterventionOrder(order: Order) {
  return order.source === "line" || order.source === "partner" || ["refunding", "refunded", "cancelled"].includes(order.status);
}

function isCancelledOrder(order: Order) {
  return ["cancelled", "refunding", "refunded"].includes(order.status);
}

function isAcceptedOrder(order: Order) {
  return !["pending", "unpaid"].includes(order.status);
}

function isRevenueOrder(order: Order) {
  return !isCancelledOrder(order) && order.paymentStatus !== "refunded";
}

function getLatestMatchingOrder(orders: Order[], predicate: (order: Order) => boolean) {
  return [...orders].filter(predicate).sort((left, right) => right.bookedAt.localeCompare(left.bookedAt))[0];
}

function getMerchantOrderDetailPath(order?: Order) {
  return order ? `/merchant/orders/${encodeURIComponent(order.id)}` : "/merchant/orders";
}

function getOrderNdpCost(order: Order) {
  const base = getOrderType(order) === "request" ? 520 : 360;
  const manualCost = isManualInterventionOrder(order) ? 120 : 0;

  return isRevenueOrder(order) ? base + manualCost : 0;
}

function getNetProfit(grossRevenue: number, ndpCost: number, fixedPersonnelCost = 0) {
  const castCommission = Math.round(grossRevenue * 0.46);
  const personnelCost = getPersonnelCost(grossRevenue, fixedPersonnelCost);
  const brokerCommission = Math.round(grossRevenue * 0.07);
  const scoutCommission = Math.round(grossRevenue * 0.025);
  const guaranteeTopup = Math.round(grossRevenue * 0.018);
  const refundImpact = Math.round(grossRevenue * 0.012);

  return Math.max(0, grossRevenue - castCommission - personnelCost - brokerCommission - scoutCommission - guaranteeTopup - ndpCost - refundImpact);
}

function getPersonnelCost(grossRevenue: number, fixedPersonnelCost = 0) {
  return Math.round(grossRevenue * 0.12) + fixedPersonnelCost;
}

function getPeriodPersonnelCost(monthlyCost: number | undefined, startDate: string, endDate: string) {
  if (!monthlyCost || monthlyCost <= 0) {
    return 0;
  }

  return Math.round((monthlyCost / 30) * countInclusiveDays(startDate, endDate));
}

function createMetric(
  value: number,
  previousValue: number,
  unit: AnalyticsMetricUnit,
  status: AnalyticsMetricStatus,
  explanation: string
): MetricValue {
  const delta = value - previousValue;
  const deltaPercent = previousValue === 0 ? (value > 0 ? 100 : 0) : (delta / previousValue) * 100;

  return {
    value,
    previousValue,
    delta,
    deltaPercent,
    unit,
    status,
    explanation
  };
}

function getMetricStatusForRate(value: number, warning: number, danger: number, inverted = false): AnalyticsMetricStatus {
  if (inverted) {
    if (value <= danger) {
      return "danger";
    }

    if (value <= warning) {
      return "warning";
    }

    return "normal";
  }

  if (value >= danger) {
    return "danger";
  }

  if (value >= warning) {
    return "warning";
  }

  return "normal";
}

export function getScopedShopOrders(store: Store, stores: Store[], technicians: Technician[], orders: Order[], filters?: AnalyticsFilterState) {
  const requestedStoreIds = filters?.shopIds?.length ? filters.shopIds : [store.id];
  const allowedStores = stores.filter((item) => requestedStoreIds.includes(item.id));
  const scopedStores = allowedStores.length > 0 ? allowedStores : [store];
  const storeIdSet = new Set(scopedStores.map((item) => item.id));
  const storeNameSet = new Set(scopedStores.map((item) => item.name));
  const scopedTechnicians = technicians.filter((technician) => storeIdSet.has(technician.storeId));
  const technicianNameSet = new Set(scopedTechnicians.map((technician) => technician.name));

  return orders.filter((order) => {
    if (order.storeName && storeNameSet.has(order.storeName)) {
      return true;
    }

    return Boolean(order.technicianName && technicianNameSet.has(order.technicianName));
  });
}

function applyAdvancedFilters(
  orders: Order[],
  technicians: Technician[],
  filters: AnalyticsFilterState
) {
  const castNameSet = filters.castIds?.length
    ? new Set(technicians.filter((technician) => filters.castIds?.includes(technician.id)).map((technician) => technician.name))
    : null;

  return orders.filter((order) => {
    if (filters.orderTypes?.length && !filters.orderTypes.includes(getOrderType(order))) {
      return false;
    }

    if (filters.orderStatuses?.length && !filters.orderStatuses.includes(order.status)) {
      return false;
    }

    if (filters.areas?.length && !filters.areas.includes(order.area)) {
      return false;
    }

    if (castNameSet && !order.technicianName) {
      return false;
    }

    if (castNameSet && order.technicianName && !castNameSet.has(order.technicianName)) {
      return false;
    }

    if (filters.manualIntervention !== null && filters.manualIntervention !== undefined && isManualInterventionOrder(order) !== filters.manualIntervention) {
      return false;
    }

    return true;
  });
}

function summarizeOrders(orders: Order[], technicians: Technician[], fixedPersonnelCost = 0) {
  const createdOrders = orders.length;
  const acceptedOrders = orders.filter(isAcceptedOrder).length;
  const completedOrders = orders.filter((order) => order.status === "completed").length;
  const cancelledOrders = orders.filter(isCancelledOrder).length;
  const manualInterventionOrders = orders.filter(isManualInterventionOrder).length;
  const grossRevenue = orders.filter(isRevenueOrder).reduce((sum, order) => sum + order.amount, 0);
  const ndpCost = orders.reduce((sum, order) => sum + getOrderNdpCost(order), 0);
  const netProfit = getNetProfit(grossRevenue, ndpCost, fixedPersonnelCost);
  const onlineCasts = technicians.filter((technician) => technician.status !== "off").length;
  const acceptedOrCompletedOrders = Math.max(completedOrders, acceptedOrders, 1);
  const firstResponseTime = createdOrders === 0 ? 0 : Math.round(4 + manualInterventionOrders * 1.7 + cancelledOrders * 0.8);

  return {
    createdOrders,
    acceptedOrders,
    completedOrders,
    cancelledOrders,
    manualInterventionOrders,
    grossRevenue,
    ndpCost,
    netProfit,
    onlineCasts,
    avgOrderValue: Math.round(grossRevenue / acceptedOrCompletedOrders),
    completionRate: createdOrders === 0 ? 0 : (completedOrders / createdOrders) * 100,
    cancellationRate: createdOrders === 0 ? 0 : (cancelledOrders / createdOrders) * 100,
    manualInterventionRate: createdOrders === 0 ? 0 : (manualInterventionOrders / createdOrders) * 100,
    firstResponseTime
  };
}

function getBucketStart(date: string, granularity: AnalyticsGranularity) {
  if (granularity === "hour") {
    return `${date.slice(0, 13)}:00`;
  }

  if (granularity === "week") {
    return startOfWeek(date);
  }

  if (granularity === "month") {
    return monthBucket(date);
  }

  return date;
}

function getBucketLabel(bucket: string, granularity: AnalyticsGranularity) {
  if (granularity === "hour") {
    const { month, day } = parseDateParts(bucket.slice(0, 10));
    const hour = Number(bucket.slice(11, 13) || "0");

    return `${month}/${day} ${hour}时`;
  }

  if (granularity === "month") {
    const [, month = ""] = bucket.split("-");

    return `${Number(month)}月`;
  }

  if (granularity === "week") {
    const { month, day } = parseDateParts(bucket);

    return `${month}/${day}周`;
  }

  const { month, day } = parseDateParts(bucket);

  return `${month}/${day}`;
}

function buildEmptyBuckets(filter: AnalyticsFilterState) {
  const buckets: TimeSeriesPoint[] = [];

  if (filter.granularity === "hour") {
    let cursor = `${filter.startDate} 00:00`;
    const end = `${filter.endDate} 23:00`;

    while (cursor <= end) {
      buckets.push({
        bucket: cursor,
        label: getBucketLabel(cursor, filter.granularity),
        grossRevenue: 0,
        netProfit: 0,
        createdOrders: 0,
        completedOrders: 0,
        cancelledOrders: 0,
        ndpCost: 0
      });
      cursor = addHours(cursor, 1);
    }

    return buckets;
  }

  let cursor = filter.startDate;

  while (cursor <= filter.endDate) {
    const bucket = getBucketStart(cursor, filter.granularity);
    if (!buckets.some((item) => item.bucket === bucket)) {
      buckets.push({
        bucket,
        label: getBucketLabel(bucket, filter.granularity),
        grossRevenue: 0,
        netProfit: 0,
        createdOrders: 0,
        completedOrders: 0,
        cancelledOrders: 0,
        ndpCost: 0
      });
    }

    cursor = addDays(cursor, 1);
  }

  return buckets;
}

function buildTrend(orders: Order[], filter: AnalyticsFilterState, fixedPersonnelCost = 0) {
  const buckets = buildEmptyBuckets(filter);
  const bucketMap = new Map(buckets.map((bucket) => [bucket.bucket, bucket]));
  const personnelCostPerBucket = buckets.length === 0 ? 0 : Math.round(fixedPersonnelCost / buckets.length);

  orders.forEach((order) => {
    const bucketKey = getBucketStart(filter.granularity === "hour" ? order.bookedAt : getOrderDate(order), filter.granularity);
    const bucket = bucketMap.get(bucketKey);

    if (!bucket) {
      return;
    }

    bucket.createdOrders += 1;
    bucket.completedOrders += order.status === "completed" ? 1 : 0;
    bucket.cancelledOrders += isCancelledOrder(order) ? 1 : 0;
    bucket.grossRevenue += isRevenueOrder(order) ? order.amount : 0;
    bucket.ndpCost += getOrderNdpCost(order);
  });

  buckets.forEach((bucket) => {
    bucket.netProfit = getNetProfit(bucket.grossRevenue, bucket.ndpCost, personnelCostPerBucket);
  });

  return buckets;
}

function buildFunnel(orders: Order[]): FunnelStep[] {
  const created = orders.length;
  const stages = [
    { key: "created", label: "预约创建", count: created },
    { key: "accepted", label: "接单确认", count: orders.filter(isAcceptedOrder).length },
    { key: "arrived", label: "到达/进店", count: orders.filter((order) => ["inService", "completed"].includes(order.status)).length },
    { key: "started", label: "开始服务", count: orders.filter((order) => ["inService", "completed"].includes(order.status)).length },
    { key: "completed", label: "完成结算", count: orders.filter((order) => order.status === "completed").length },
    { key: "cancelled", label: "取消/退款", count: orders.filter(isCancelledOrder).length }
  ];

  return stages.map((stage, index) => {
    const previousCount = index === 0 ? stage.count : stages[index - 1]?.count ?? 0;

    return {
      ...stage,
      conversionRate: created === 0 ? 0 : (stage.count / created) * 100,
      dropOffRate: previousCount === 0 ? 0 : Math.max(0, ((previousCount - stage.count) / previousCount) * 100)
    };
  });
}

function getNdpStatus(balance: number): AnalyticsNdpStatus {
  if (balance < 0) {
    return "negative";
  }

  if (balance < 1200) {
    return "warning";
  }

  return "healthy";
}

function buildTopCasts(orders: Order[], technicians: Technician[], filters: AnalyticsFilterState) {
  return technicians
    .map((technician, index): CastRankItem => {
      const castOrders = orders.filter((order) => order.technicianName === technician.name);
      const completedOrders = castOrders.filter((order) => order.status === "completed").length;
      const cancelledOrders = castOrders.filter(isCancelledOrder).length;
      const acceptedOrders = castOrders.filter(isAcceptedOrder).length;
      const revenue = castOrders.filter(isRevenueOrder).reduce((sum, order) => sum + order.amount, 0);
      const cancellationRate = castOrders.length === 0 ? technician.cancelRate : (cancelledOrders / castOrders.length) * 100;
      const completionRate = castOrders.length === 0 ? technician.acceptRate : (completedOrders / castOrders.length) * 100;
      const onlineMinutes = technician.status === "off" ? 0 : 360 + (index % 5) * 38;
      const serviceMinutes = Math.min(onlineMinutes, acceptedOrders * 58 + completedOrders * 42 + (index % 4) * 26);
      const ndpBalance = Math.round(4600 + index * 180 - cancellationRate * 160 - acceptedOrders * 48);
      const ndpStatus = getNdpStatus(ndpBalance);
      const riskLabel = ndpStatus === "negative"
        ? "NDP负余额"
        : cancellationRate >= 12
          ? "取消偏高"
          : technician.status === "off"
            ? "供给不足"
            : serviceMinutes < onlineMinutes * 0.25
              ? "低利用"
              : "健康";
      const suggestion = riskLabel === "健康"
        ? "保持当前排班与推荐权重"
        : riskLabel === "NDP负余额"
          ? "提醒补点并限制高风险接单"
          : riskLabel === "取消偏高"
            ? "联系确认排班，必要时暂停新客推荐"
            : "调整高峰班次或优化名片标签";

      return {
        castId: technician.id,
        castName: technician.nickname ? `${technician.nickname} / ${technician.name}` : technician.name,
        avatar: technician.avatar,
        completedOrders,
        revenue,
        incomeTrend: buildTrend(castOrders, filters),
        workTrend: buildTrend(castOrders, filters),
        rating: technician.rating,
        completionRate,
        cancellationRate,
        onlineMinutes,
        serviceMinutes,
        ndpBalance,
        ndpStatus,
        riskLabel,
        suggestion
      };
    })
    .sort((left, right) => right.revenue - left.revenue || right.completedOrders - left.completedOrders)
    .slice(0, 10);
}

function buildCustomerSegments(orders: Order[], customers: Customer[]): CustomerSegmentItem[] {
  const activeCustomerIds = new Set(orders.map((order) => order.customerId));
  const activeCustomers = customers.filter((customer) => activeCustomerIds.has(customer.id));
  const total = Math.max(activeCustomers.length, 1);
  const revenueByCustomer = new Map<string, number>();

  orders.forEach((order) => {
    revenueByCustomer.set(order.customerId, (revenueByCustomer.get(order.customerId) ?? 0) + (isRevenueOrder(order) ? order.amount : 0));
  });

  const definitions = [
    {
      key: "new",
      label: "新客",
      predicate: (customer: Customer) => customer.orderCount <= 1,
      tone: "normal" as const
    },
    {
      key: "repeat",
      label: "复购客",
      predicate: (customer: Customer) => customer.orderCount > 1 && customer.orderCount < 12,
      tone: "normal" as const
    },
    {
      key: "vip",
      label: "高价值",
      predicate: (customer: Customer) => customer.ltv >= 180000 || customer.memberLevel.includes("黑卡"),
      tone: "normal" as const
    },
    {
      key: "risk",
      label: "流失风险",
      predicate: (customer: Customer) => customer.churnRisk === "high",
      tone: "warning" as const
    }
  ];

  return definitions.map((definition) => {
    const segmentCustomers = activeCustomers.filter(definition.predicate);
    const revenue = segmentCustomers.reduce((sum, customer) => sum + (revenueByCustomer.get(customer.id) ?? 0), 0);

    return {
      key: definition.key,
      label: definition.label,
      count: segmentCustomers.length,
      share: (segmentCustomers.length / total) * 100,
      revenue,
      tone: definition.tone
    };
  });
}

function buildFinanceBreakdown(grossRevenue: number, ndpCost: number, cancelledOrders: number, fixedPersonnelCost = 0): FinanceBreakdownItem[] {
  const castCommission = Math.round(grossRevenue * 0.46);
  const personnelCost = getPersonnelCost(grossRevenue, fixedPersonnelCost);
  const brokerCommission = Math.round(grossRevenue * 0.07);
  const scoutCommission = Math.round(grossRevenue * 0.025);
  const guaranteeTopup = Math.round(grossRevenue * 0.018);
  const refundImpact = Math.round(cancelledOrders * 1800 + grossRevenue * 0.012);
  const netProfit = Math.max(0, grossRevenue - castCommission - personnelCost - brokerCommission - scoutCommission - guaranteeTopup - ndpCost - refundImpact);

  return [
    { key: "gross", label: "线下服务总额", amount: grossRevenue, type: "income", explanation: "已确认和今日预估服务金额" },
    { key: "cast", label: "技师分成", amount: -castCommission, type: "cost", explanation: "固定费、比例分成与阶梯抽佣" },
    { key: "personnel", label: "人件费", amount: -personnelCost, type: "cost", explanation: "厨师、司机、财务、总务等非技师员工薪资与固定人力成本" },
    { key: "broker", label: "经纪人返佣", amount: -brokerCommission, type: "cost", explanation: "经纪人管理技师组收益" },
    { key: "scout", label: "介绍人返佣", amount: -scoutCommission, type: "cost", explanation: "Scout CPA/CPS 预留成本" },
    { key: "guarantee", label: "保底补差", amount: -guaranteeTopup, type: "cost", explanation: "保底工资不足时补差" },
    { key: "ndp", label: "平台 NDP 扣费", amount: -ndpCost, type: "cost", explanation: "Booking/Request 完单技术费" },
    { key: "refund", label: "退款/赔付影响", amount: -refundImpact, type: "cost", explanation: "退款、投诉赔付和人工处理成本" },
    { key: "net", label: "店铺净收益", amount: netProfit, type: "net", explanation: "扣除分成、人件费、返佣、NDP 后的经营收益" }
  ];
}

function buildAlerts(summary: ReturnType<typeof summarizeOrders>, topCasts: CastRankItem[], store: Store, orders: Order[]): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];
  const riskiestCast = topCasts.find((cast) => cast.riskLabel !== "健康");
  const latestCancelledOrder = getLatestMatchingOrder(orders, isCancelledOrder);
  const latestManualOrder =
    getLatestMatchingOrder(orders, (order) => isManualInterventionOrder(order) && !isCancelledOrder(order)) ??
    getLatestMatchingOrder(orders, isManualInterventionOrder);

  if (summary.cancellationRate >= 12) {
    alerts.push({
      id: "cancellation-spike",
      alertType: "cancellation_spike",
      severity: summary.cancellationRate >= 20 ? "high" : "warning",
      target: store.name,
      title: "取消率异常",
      message: `当前取消/退款率 ${summary.cancellationRate.toFixed(1)}%，高于安全线。`,
      suggestion: "优先查看取消阶段，确认是否集中在技师或晚高峰时段。",
      actionLabel: "查看该订单",
      actionTo: getMerchantOrderDetailPath(latestCancelledOrder)
    });
  }

  if (summary.manualInterventionRate >= 15) {
    alerts.push({
      id: "manual-intervention",
      alertType: "manual_intervention_high",
      severity: "warning",
      target: "订单中心",
      title: "人工介入偏高",
      message: `人工介入率 ${summary.manualInterventionRate.toFixed(1)}%，会拖慢首响和履约。`,
      suggestion: "检查 LINE / partner 来源订单，并设置自动兜底派单规则。",
      actionLabel: latestManualOrder ? "查看该订单" : "去处理订单",
      actionTo: getMerchantOrderDetailPath(latestManualOrder)
    });
  }

  if (riskiestCast) {
    alerts.push({
      id: `cast-risk-${riskiestCast.castId}`,
      alertType: "cast_risk",
      severity: riskiestCast.riskLabel === "NDP负余额" ? "high" : "warning",
      target: riskiestCast.castName,
      title: `员工风险：${riskiestCast.riskLabel}`,
      message: `${riskiestCast.castName} 取消率 ${riskiestCast.cancellationRate.toFixed(1)}%，NDP 余额 ${riskiestCast.ndpBalance}。`,
      suggestion: riskiestCast.suggestion,
      actionLabel: "查看员工",
      actionTo: `/merchant/staff?staffId=${encodeURIComponent(riskiestCast.castId)}`
    });
  }

  if (summary.onlineCasts < 4) {
    alerts.push({
      id: "peak-supply",
      alertType: "peak_supply_shortage",
      severity: "warning",
      target: "晚高峰排班",
      title: "高峰供给不足",
      message: `当前在线员工 ${summary.onlineCasts} 人，晚高峰可能出现排队。`,
      suggestion: "补排 18:00-22:00 班次，或开启自动派单兜底。",
      actionLabel: "调整排班",
      actionTo: "/merchant/schedule?tab=planning"
    });
  }

  alerts.push({
    id: "ndp-watch",
    alertType: "ndp_low",
    severity: summary.ndpCost > summary.grossRevenue * 0.05 ? "warning" : "info",
    target: "NDP账本",
    title: "NDP 成本需要跟踪",
    message: `本周期平台成本 ${summary.ndpCost.toLocaleString("zh-CN")} NDP。`,
    suggestion: "按 Booking / Request 分拆看扣费，避免负余额技师持续接单。",
    actionLabel: "查看财务",
    actionTo: "/merchant-admin/finance"
  });

  return alerts.slice(0, 5);
}

function getRangeLabel(filter: AnalyticsFilterState) {
  const labels: Record<AnalyticsRangePreset, string> = {
    today: "今日",
    week: "本周",
    month: "本月",
    last7: "最近7天",
    last30: "最近30天",
    custom: "自定义"
  };
  const presetLabel = filter.preset ? labels[filter.preset] : "自定义";
  const granularityLabel = filter.granularity === "hour" ? "按小时" : filter.granularity === "day" ? "按日" : filter.granularity === "week" ? "按周" : "按月";
  const dateLabel = filter.startDate === filter.endDate ? filter.endDate : `${filter.startDate} - ${filter.endDate}`;

  return `${presetLabel} · ${granularityLabel} · ${dateLabel}`;
}

export function countSelectedAnalyticsFilters(filters: AnalyticsFilterState) {
  const arrayCount = emptyFilterArrays.reduce((count, key) => {
    const value = filters[key];

    return count + (Array.isArray(value) ? value.length : 0);
  }, 0);

  return arrayCount + (filters.manualIntervention === null || filters.manualIntervention === undefined ? 0 : 1);
}

export function buildShopAnalyticsOverview({
  store,
  stores,
  technicians,
  customers,
  orders,
  filters,
  personnelMonthlyCost
}: BuildShopAnalyticsInput): ShopAnalyticsOverview {
  const scopedOrders = getScopedShopOrders(store, stores, technicians, orders, filters);
  const requestedStoreIds = filters.shopIds?.length ? filters.shopIds : [store.id];
  const storeTechnicians = technicians.filter((technician) => requestedStoreIds.includes(technician.storeId));
  const activeOrders = applyAdvancedFilters(scopedOrders, storeTechnicians, filters).filter((order) =>
    isDateInRange(getOrderDate(order), filters.startDate, filters.endDate)
  );
  const previousPeriod = getPreviousPeriod(filters);
  const previousOrders = applyAdvancedFilters(scopedOrders, storeTechnicians, filters).filter((order) =>
    isDateInRange(getOrderDate(order), previousPeriod.startDate, previousPeriod.endDate)
  );
  const personnelPeriodCost = getPeriodPersonnelCost(personnelMonthlyCost, filters.startDate, filters.endDate);
  const previousPersonnelPeriodCost = getPeriodPersonnelCost(personnelMonthlyCost, previousPeriod.startDate, previousPeriod.endDate);
  const summary = summarizeOrders(activeOrders, storeTechnicians, personnelPeriodCost);
  const previousSummary = summarizeOrders(previousOrders, storeTechnicians, previousPersonnelPeriodCost);
  const revenueTrend = buildTrend(activeOrders, filters, personnelPeriodCost);
  const topCasts = buildTopCasts(activeOrders, storeTechnicians, filters);
  const customerSegments = buildCustomerSegments(activeOrders, customers);
  const ndpReleased = activeOrders.filter(isCancelledOrder).length * 180;
  const ndpCompensated = activeOrders.filter((order) => order.status === "refunding").length * 320;
  const ndpTopup = Math.max(2800, Math.round(summary.ndpCost * 1.4));
  const ndpNetCost = Math.max(0, summary.ndpCost + ndpCompensated - ndpReleased);
  const ndpBalance = 12800 + ndpTopup - ndpNetCost;
  const negativeAccounts = topCasts.filter((cast) => cast.ndpStatus === "negative").length;
  const completionStatus = getMetricStatusForRate(summary.completionRate, 55, 35, true);
  const cancellationStatus = getMetricStatusForRate(summary.cancellationRate, 10, 18);
  const firstResponseStatus = getMetricStatusForRate(summary.firstResponseTime, 5, 8);
  const manualStatus = getMetricStatusForRate(summary.manualInterventionRate, 15, 24);
  const recentOrders = [...activeOrders].sort((left, right) => right.bookedAt.localeCompare(left.bookedAt)).slice(0, 12);
  const alerts = buildAlerts(summary, topCasts, store, recentOrders);
  const revenueLeadBucket = revenueTrend.reduce((best, item) => item.grossRevenue > best.grossRevenue ? item : best, revenueTrend[0] ?? {
    bucket: "",
    label: "",
    grossRevenue: 0,
    netProfit: 0,
    createdOrders: 0,
    completedOrders: 0,
    cancelledOrders: 0,
    ndpCost: 0
  });

  return {
    timezone,
    filters,
    summary: {
      grossRevenue: createMetric(
        summary.grossRevenue,
        previousSummary.grossRevenue,
        "jpy",
        summary.grossRevenue > previousSummary.grossRevenue ? "normal" : "warning",
        revenueLeadBucket.grossRevenue > 0 ? `${revenueLeadBucket.label} 贡献最高，建议同步检查高峰排班。` : "当前筛选下暂无确认流水。"
      ),
      netProfit: createMetric(
        summary.netProfit,
        previousSummary.netProfit,
        "jpy",
        summary.netProfit >= previousSummary.netProfit ? "normal" : "warning",
        `扣除分成、人件费、返佣和 ${summary.ndpCost.toLocaleString("zh-CN")} NDP 后的净收益。`
      ),
      completedOrders: createMetric(
        summary.completedOrders,
        previousSummary.completedOrders,
        "count",
        summary.completedOrders >= previousSummary.completedOrders ? "normal" : "warning",
        `本周期创建 ${summary.createdOrders} 单，已完成 ${summary.completedOrders} 单。`
      ),
      completionRate: createMetric(
        summary.completionRate,
        previousSummary.completionRate,
        "percent",
        completionStatus,
        completionStatus === "normal" ? "履约健康，继续保持当前派单节奏。" : "完单率偏低，建议查看漏斗流失阶段。"
      ),
      cancellationRate: createMetric(
        summary.cancellationRate,
        previousSummary.cancellationRate,
        "percent",
        cancellationStatus,
        cancellationStatus === "normal" ? "取消率处于安全范围。" : "取消/退款偏高，需要定位技师或订单来源。"
      ),
      avgOrderValue: createMetric(
        summary.avgOrderValue,
        previousSummary.avgOrderValue,
        "jpy",
        summary.avgOrderValue >= previousSummary.avgOrderValue ? "normal" : "warning",
        "用当前筛选下可计入经营额的订单计算。"
      ),
      onlineCasts: createMetric(
        summary.onlineCasts,
        previousSummary.onlineCasts,
        "count",
        summary.onlineCasts >= 4 ? "normal" : "warning",
        summary.onlineCasts >= 4 ? "在线供给可以覆盖常规预约。" : "在线员工偏少，晚高峰需要补班。"
      ),
      ndpCost: createMetric(
        summary.ndpCost,
        previousSummary.ndpCost,
        "ndp",
        summary.ndpCost > summary.grossRevenue * 0.06 ? "warning" : "normal",
        `NDP 成本占营业额 ${summary.grossRevenue === 0 ? "0.0" : ((summary.ndpCost / summary.grossRevenue) * 100).toFixed(1)}%。`
      ),
      firstResponseTime: createMetric(
        summary.firstResponseTime,
        previousSummary.firstResponseTime,
        "minutes",
        firstResponseStatus,
        firstResponseStatus === "normal" ? "首响速度稳定。" : "首响偏慢，建议开启自动兜底提醒。"
      ),
      manualInterventionRate: createMetric(
        summary.manualInterventionRate,
        previousSummary.manualInterventionRate,
        "percent",
        manualStatus,
        manualStatus === "normal" ? "人工介入口径健康。" : "人工介入偏高，会影响接单速度。"
      )
    },
    revenueTrend,
    orderTrend: revenueTrend,
    orderFunnel: buildFunnel(activeOrders),
    topCasts,
    customerSegments,
    financeBreakdown: buildFinanceBreakdown(summary.grossRevenue, summary.ndpCost, summary.cancelledOrders, personnelPeriodCost),
    ndpSummary: {
      balance: ndpBalance,
      ndpDebited: summary.ndpCost,
      ndpReleased,
      ndpCompensated,
      ndpTopup,
      ndpNetCost,
      costSharePercent: summary.grossRevenue === 0 ? 0 : (summary.ndpCost / summary.grossRevenue) * 100,
      negativeAccounts,
      trend: revenueTrend
    },
    alerts,
    scopedOrders: activeOrders,
    recentOrders,
    insightText: alerts.length > 0
      ? `${getRangeLabel(filters)} 有 ${alerts.length} 个经营事项需要处理：${alerts.slice(0, 3).map((alert) => alert.title).join("、")}。`
      : `${getRangeLabel(filters)} 经营状态稳定，继续观察晚高峰供给和 NDP 成本。`,
    rangeLabel: getRangeLabel(filters),
    selectedFilterCount: countSelectedAnalyticsFilters(filters)
  };
}
