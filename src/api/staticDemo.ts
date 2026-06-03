import { demoAuthAccount } from "../auth/demoAccount";
import { getPortalFeaturePermissions } from "../auth/featurePermissions";
import type { AuthMePayload } from "../auth/rbac";
import {
  customers,
  dashboardMetrics,
  orders,
  schedules,
  serviceCategories,
  services,
  settlements,
  stores,
  technicians
} from "../data/mock";
import type {
  BackofficeDashboardPayload,
  BackofficeFinanceSettlementPayload,
  BackofficeOrderPayload,
  BackofficeScheduleSlotPayload,
  BackofficeShopPayload,
  BackofficeTechnicianPayload,
  CsvExportPayload,
  PaginatedApiPayload
} from "./backofficeRealData";
import type { HttpClientRequestOptions } from "./httpClient";
import type {
  ShopFinanceBonusRulePayload,
  ShopFinanceDeductionRulePayload,
  ShopFinanceRulePreviewInput,
  ShopFinanceRulePreviewResult,
  ShopFinanceRuleSetInput,
  ShopFinanceRuleSetPayload
} from "./merchantFinanceRules";
import type {
  CompensationPreviewPayload,
  CompensationProfilePreviewInput,
  CompensationProfilePreviewResult,
  MoneyTimelineEvent,
  OrderFinanceDetailPayload,
  ServiceIncomeReportInput,
  ServiceIncomeStatus,
  ServicePaymentChannel,
  TechnicianCompensationProfileInput,
  TechnicianCompensationProfilePayload
} from "./merchantFinanceCenter";
import type {
  PayRunPayload,
  PayRunStatus,
  PayrollCsvExportPayload,
  PayrollAdjustmentRequestPayload,
  PayrollAdjustmentStatus,
  PayrollAdjustmentType,
  PayrollListPayload,
  PayoutMethod,
  PayslipPayload,
  PayslipStatus
} from "./merchantPayrollCenter";
import type { PaginatedBookingData, BookingOrder, BookingScheduleSlot } from "../features/booking/api";
import type {
  CoreCategory,
  CoreCustomerProfile,
  CoreHomeRecommendations,
  CoreMediaAsset,
  CoreServiceCard,
  CoreServiceDetail,
  CoreShopCard,
  CoreShopDetail,
  CoreTechnicianCard,
  CoreTechnicianDetail
} from "../features/core-read/api";
import type {
  PaginatedData,
  PermissionPayload,
  PermissionTreePayload,
  PermissionType,
  RolePayload,
  UserPayload,
  UserRolePayload
} from "./userManagement";
import type { GoogleAccountConnectionStatus } from "../lib/googleAccountApi";
import type {
  GoogleCalendarApiExportResponse,
  GoogleCalendarApiImportResponse,
  GoogleCalendarConnectionStatus
} from "../lib/googleCalendarApi";

type StaticDemoResult<TData> =
  | { handled: true; data: TData }
  | { handled: false };

const staticTimestamp = "2026-05-29T00:00:00.000Z";
const staticAccessToken = "static-demo-access-token";
const staticRefreshToken = "static-demo-refresh-token";
const staticShopPricingModes = new Map<number, {
  pricingMode: "merchant" | "technician";
  technicianPricingRatePercent: number;
  updatedAt: string;
}>();
const staticShopFinanceRuleSets = new Map<number, ShopFinanceRuleSetPayload>();
const staticTechnicianCompensationProfiles = new Map<string, TechnicianCompensationProfilePayload>();
const staticPayRuns = new Map<number, PayRunPayload>();
const staticPayrollAdjustments = new Map<number, PayrollAdjustmentRequestPayload>();
let staticPayRunIdSeed = 9001;
let staticPayslipIdSeed = 8001;
let staticPayoutRecordIdSeed = 7001;
let staticPayrollAdjustmentIdSeed = 501;
const staticOrderIncomeReports = new Map<number, {
  serviceAmountJpy: number;
  platformCollectedServiceAmountJpy: number;
  offlineReportedServiceAmountJpy: number;
  unknownOrUnreportedServiceAmountJpy: number;
  paymentChannel: ServicePaymentChannel;
  serviceIncomeStatus: ServiceIncomeStatus;
  note: string | null;
  proofUrl: string | null;
  reportedAt: string;
  confirmedAt: string | null;
  moneyTimeline: MoneyTimelineEvent[];
}>();

function isEnabledFlag(value: string | undefined) {
  return ["1", "static", "true", "yes"].includes((value ?? "").trim().toLowerCase());
}

export function isStaticDemoMode() {
  return isEnabledFlag(import.meta.env.VITE_NEEDO_STATIC_DEMO) || isEnabledFlag(import.meta.env.VITE_STATIC_DEMO);
}

function clone<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function normalizeStaticTechnicianPricingRatePercent(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(200, Math.max(10, Math.round(value)))
    : 100;
}

function getStaticShopPricingMode(shopId: number) {
  return staticShopPricingModes.get(shopId) ?? {
    pricingMode: "merchant" as const,
    technicianPricingRatePercent: 100,
    updatedAt: new Date().toISOString()
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBodyRecord(options: HttpClientRequestOptions): Record<string, unknown> {
  return isRecord(options.body) ? options.body : {};
}

function readBodyNumber(body: Record<string, unknown>, key: string, fallback: number) {
  const value = body[key];

  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBodyString(body: Record<string, unknown>, key: string, fallback: string) {
  const value = body[key];

  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readStaticWageMode(value: unknown, fallback: ShopFinanceRuleSetInput["wageMode"]) {
  return value === "fixed_per_order" || value === "commission" || value === "base_plus_commission" || value === "hourly"
    ? value
    : fallback;
}

function readStaticNdpFeeBearer(value: unknown, fallback: ShopFinanceRuleSetInput["ndpFeeBearer"]) {
  return value === "shop" || value === "technician" || value === "split" ? value : fallback;
}

function readStaticBonusRules(
  value: unknown,
  fallback: ShopFinanceBonusRulePayload[]
): ShopFinanceBonusRulePayload[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value.filter(isRecord).map((item, index) => ({
    id: readBodyString(item, "id", `bonus-${index + 1}`),
    name: readBodyString(item, "name", "月单量奖金"),
    triggerType: item.triggerType === "monthly_service_gmv" || item.triggerType === "rating_average"
      ? item.triggerType
      : "monthly_order_count",
    threshold: readBodyNumber(item, "threshold", 100),
    amountJpy: readBodyNumber(item, "amountJpy", 3000),
    active: item.active !== false
  }));
}

function readStaticDeductionRules(
  value: unknown,
  fallback: ShopFinanceDeductionRulePayload[]
): ShopFinanceDeductionRulePayload[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value.filter(isRecord).map((item, index) => ({
    id: readBodyString(item, "id", `deduction-${index + 1}`),
    name: readBodyString(item, "name", "控除ルール"),
    triggerType: item.triggerType === "rating_average_below"
      ? "rating_average_below"
      : "late_cancellation_count",
    threshold: readBodyNumber(item, "threshold", 1),
    amountJpy: readBodyNumber(item, "amountJpy", 500),
    active: item.active !== false
  }));
}

function defaultStaticShopFinanceRuleSet(shopId: number): ShopFinanceRuleSetPayload {
  return {
    id: shopId,
    shopId,
    name: "商户财务规则中心 v1",
    status: "active",
    wageMode: "base_plus_commission",
    baseSalaryJpy: 0,
    hourlyRateJpy: 0,
    dailyRateJpy: 0,
    fixedOrderPayJpy: 1000,
    commissionRatePercent: 50,
    guaranteedMinimumJpy: 0,
    ndpFeeBearer: "split",
    technicianNdpSharePercent: 30,
    bonusRules: [
      {
        id: "monthly-100",
        name: "月 100 单突破奖金",
        triggerType: "monthly_order_count",
        threshold: 100,
        amountJpy: 3000,
        active: true
      }
    ],
    deductionRules: [],
    effectiveFrom: "2026-06-01T00:00:00.000Z",
    effectiveTo: null,
    createdById: 1,
    updatedById: 1,
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp
  };
}

function getStaticShopFinanceRuleSet(shopId: number): ShopFinanceRuleSetPayload {
  return staticShopFinanceRuleSets.get(shopId) ?? defaultStaticShopFinanceRuleSet(shopId);
}

function updateStaticShopFinanceRuleSet(
  shopId: number,
  body: ShopFinanceRuleSetInput
): ShopFinanceRuleSetPayload {
  const previous = getStaticShopFinanceRuleSet(shopId);
  const next: ShopFinanceRuleSetPayload = {
    ...previous,
    ...body,
    id: previous.id + 1,
    shopId,
    status: "active",
    bonusRules: body.bonusRules ?? previous.bonusRules,
    deductionRules: body.deductionRules ?? previous.deductionRules,
    updatedAt: new Date().toISOString()
  };

  staticShopFinanceRuleSets.set(shopId, next);
  return next;
}

function readStaticShopFinanceRuleInput(
  shopId: number,
  body: Record<string, unknown>
): ShopFinanceRuleSetInput {
  const current = getStaticShopFinanceRuleSet(shopId);

  return {
    name: readBodyString(body, "name", current.name),
    wageMode: readStaticWageMode(body.wageMode, current.wageMode),
    baseSalaryJpy: readBodyNumber(body, "baseSalaryJpy", current.baseSalaryJpy),
    hourlyRateJpy: readBodyNumber(body, "hourlyRateJpy", current.hourlyRateJpy),
    dailyRateJpy: readBodyNumber(body, "dailyRateJpy", current.dailyRateJpy),
    fixedOrderPayJpy: readBodyNumber(body, "fixedOrderPayJpy", current.fixedOrderPayJpy),
    commissionRatePercent: readBodyNumber(
      body,
      "commissionRatePercent",
      current.commissionRatePercent
    ),
    guaranteedMinimumJpy: readBodyNumber(
      body,
      "guaranteedMinimumJpy",
      current.guaranteedMinimumJpy
    ),
    ndpFeeBearer: readStaticNdpFeeBearer(body.ndpFeeBearer, current.ndpFeeBearer),
    technicianNdpSharePercent: readBodyNumber(
      body,
      "technicianNdpSharePercent",
      current.technicianNdpSharePercent
    ),
    bonusRules: readStaticBonusRules(body.bonusRules, current.bonusRules),
    deductionRules: current.deductionRules,
    effectiveFrom: current.effectiveFrom,
    effectiveTo: current.effectiveTo
  };
}

function previewStaticShopFinanceRule(
  shopId: number,
  input: ShopFinanceRulePreviewInput
): ShopFinanceRulePreviewResult {
  const ruleSet = getStaticShopFinanceRuleSet(shopId);
  const serviceAmountJpy = Math.round(input.serviceAmountJpy);
  const platformFeeNdp = Math.round(input.platformFeeNdp ?? 500);
  const basePayJpy = ruleSet.wageMode === "fixed_per_order" || ruleSet.wageMode === "base_plus_commission"
    ? ruleSet.fixedOrderPayJpy
    : ruleSet.wageMode === "hourly"
      ? Math.round(((input.workedMinutes ?? 60) / 60) * ruleSet.hourlyRateJpy)
      : 0;
  const commissionPayJpy = ruleSet.wageMode === "commission" || ruleSet.wageMode === "base_plus_commission"
    ? Math.round(serviceAmountJpy * (ruleSet.commissionRatePercent / 100))
    : 0;
  const appliedBonusRules = ruleSet.bonusRules
    .filter((rule) => rule.active && (input.monthlyCompletedOrders ?? 0) >= rule.threshold)
    .map((rule) => ({ id: rule.id, name: rule.name, amountJpy: rule.amountJpy }));
  const bonusPayJpy = appliedBonusRules.reduce((sum, rule) => sum + rule.amountJpy, 0);
  const technicianGrossIncomeJpy = basePayJpy + commissionPayJpy + bonusPayJpy;
  const technicianNdpShareNdp = ruleSet.ndpFeeBearer === "technician"
    ? platformFeeNdp
    : ruleSet.ndpFeeBearer === "split"
      ? Math.round(platformFeeNdp * (ruleSet.technicianNdpSharePercent / 100))
      : 0;
  const shopNdpShareNdp = platformFeeNdp - technicianNdpShareNdp;

  return {
    shopId,
    ruleSet,
    preview: {
      serviceAmountJpy,
      platformFeeNdp,
      basePayJpy,
      commissionPayJpy,
      minimumGuaranteeAdjustmentJpy: 0,
      bonusPayJpy,
      deductionJpy: 0,
      technicianGrossIncomeJpy,
      technicianNdpShareNdp,
      shopNdpShareNdp,
      technicianNetIncomeJpy: Math.max(0, technicianGrossIncomeJpy - technicianNdpShareNdp),
      shopGrossMarginJpy: serviceAmountJpy - technicianGrossIncomeJpy - shopNdpShareNdp,
      appliedBonusRules,
      appliedDeductionRules: [],
      explanation: [`wage_mode:${ruleSet.wageMode}`, `ndp_fee_bearer:${ruleSet.ndpFeeBearer}`]
    }
  };
}

function compensationProfileKey(shopId: number, technicianProfileId: number) {
  return `${shopId}:${technicianProfileId}`;
}

function defaultStaticTechnicianCompensationProfile(
  shopId: number,
  technicianProfileId: number
): TechnicianCompensationProfilePayload {
  const ruleSet = getStaticShopFinanceRuleSet(shopId);

  return {
    id: 0,
    sourceType: "shop_default",
    shopId,
    technicianProfileId,
    name: `${ruleSet.name} / 技师默认`,
    status: "active",
    version: 0,
    wageMode: ruleSet.wageMode,
    baseSalaryJpy: ruleSet.baseSalaryJpy,
    hourlyRateJpy: ruleSet.hourlyRateJpy,
    dailyRateJpy: ruleSet.dailyRateJpy,
    fixedOrderPayJpy: ruleSet.fixedOrderPayJpy,
    commissionRatePercent: ruleSet.commissionRatePercent,
    guaranteedMinimumJpy: ruleSet.guaranteedMinimumJpy,
    ndpFeeBearer: ruleSet.ndpFeeBearer,
    technicianNdpSharePercent: ruleSet.technicianNdpSharePercent,
    bonusRules: ruleSet.bonusRules,
    deductionRules: ruleSet.deductionRules,
    effectiveFrom: ruleSet.effectiveFrom,
    effectiveTo: ruleSet.effectiveTo,
    createdById: ruleSet.createdById,
    updatedById: ruleSet.updatedById,
    createdAt: ruleSet.createdAt,
    updatedAt: ruleSet.updatedAt
  };
}

function getStaticTechnicianCompensationProfile(
  shopId: number,
  technicianProfileId: number
): TechnicianCompensationProfilePayload {
  return staticTechnicianCompensationProfiles.get(compensationProfileKey(shopId, technicianProfileId))
    ?? defaultStaticTechnicianCompensationProfile(shopId, technicianProfileId);
}

function readStaticCompensationProfileInput(
  shopId: number,
  technicianProfileId: number,
  body: Record<string, unknown>
): TechnicianCompensationProfileInput {
  const current = getStaticTechnicianCompensationProfile(shopId, technicianProfileId);

  return {
    name: readBodyString(body, "name", current.name),
    wageMode: readStaticWageMode(body.wageMode, current.wageMode),
    baseSalaryJpy: readBodyNumber(body, "baseSalaryJpy", current.baseSalaryJpy),
    hourlyRateJpy: readBodyNumber(body, "hourlyRateJpy", current.hourlyRateJpy),
    dailyRateJpy: readBodyNumber(body, "dailyRateJpy", current.dailyRateJpy),
    fixedOrderPayJpy: readBodyNumber(body, "fixedOrderPayJpy", current.fixedOrderPayJpy),
    commissionRatePercent: readBodyNumber(
      body,
      "commissionRatePercent",
      current.commissionRatePercent
    ),
    guaranteedMinimumJpy: readBodyNumber(
      body,
      "guaranteedMinimumJpy",
      current.guaranteedMinimumJpy
    ),
    ndpFeeBearer: readStaticNdpFeeBearer(body.ndpFeeBearer, current.ndpFeeBearer),
    technicianNdpSharePercent: readBodyNumber(
      body,
      "technicianNdpSharePercent",
      current.technicianNdpSharePercent
    ),
    bonusRules: readStaticBonusRules(body.bonusRules, current.bonusRules),
    deductionRules: readStaticDeductionRules(body.deductionRules, current.deductionRules),
    effectiveFrom: current.effectiveFrom,
    effectiveTo: current.effectiveTo
  };
}

function updateStaticTechnicianCompensationProfile(
  shopId: number,
  technicianProfileId: number,
  body: TechnicianCompensationProfileInput
): TechnicianCompensationProfilePayload {
  const previous = getStaticTechnicianCompensationProfile(shopId, technicianProfileId);
  const next: TechnicianCompensationProfilePayload = {
    ...previous,
    ...body,
    id: previous.sourceType === "shop_default" ? technicianProfileId : previous.id + 1,
    sourceType: "technician_override",
    shopId,
    technicianProfileId,
    status: "active",
    version: previous.version + 1,
    bonusRules: body.bonusRules ?? previous.bonusRules,
    deductionRules: body.deductionRules ?? previous.deductionRules,
    updatedAt: new Date().toISOString()
  };

  staticTechnicianCompensationProfiles.set(compensationProfileKey(shopId, technicianProfileId), next);
  return next;
}

function calculateStaticCompensationPreview(
  profile: TechnicianCompensationProfilePayload,
  input: CompensationProfilePreviewInput
): CompensationPreviewPayload {
  const serviceAmountJpy = Math.round(input.serviceAmountJpy);
  const platformFeeNdp = Math.round(input.platformFeeNdp ?? 500);
  const workedMinutes = Math.max(0, input.workedMinutes ?? 60);
  const basePayJpy = profile.wageMode === "fixed_per_order" || profile.wageMode === "base_plus_commission"
    ? profile.fixedOrderPayJpy
    : profile.wageMode === "hourly"
      ? Math.round((workedMinutes / 60) * profile.hourlyRateJpy)
      : 0;
  const commissionPayJpy = profile.wageMode === "commission" || profile.wageMode === "base_plus_commission"
    ? Math.round(serviceAmountJpy * (profile.commissionRatePercent / 100))
    : 0;
  const minimumGuaranteeAdjustmentJpy = Math.max(
    0,
    profile.guaranteedMinimumJpy - basePayJpy - commissionPayJpy
  );
  const appliedBonusRules = profile.bonusRules
    .filter((rule) => rule.active)
    .filter((rule) => {
      if (rule.triggerType === "monthly_service_gmv") {
        return (input.monthlyServiceGmvJpy ?? 0) >= rule.threshold;
      }
      if (rule.triggerType === "rating_average") {
        return (input.ratingAverage ?? 0) >= rule.threshold;
      }

      return (input.monthlyCompletedOrders ?? 0) >= rule.threshold;
    })
    .map((rule) => ({ id: rule.id, name: rule.name, amountJpy: rule.amountJpy }));
  const appliedDeductionRules = profile.deductionRules
    .filter((rule) => rule.active)
    .filter((rule) => {
      if (rule.triggerType === "rating_average_below") {
        return (input.ratingAverage ?? 5) < rule.threshold;
      }

      return (input.lateCancellationCount ?? 0) >= rule.threshold;
    })
    .map((rule) => ({ id: rule.id, name: rule.name, amountJpy: rule.amountJpy }));
  const bonusPayJpy = appliedBonusRules.reduce((sum, rule) => sum + rule.amountJpy, 0);
  const deductionJpy = appliedDeductionRules.reduce((sum, rule) => sum + rule.amountJpy, 0);
  const technicianGrossIncomeJpy = Math.max(
    0,
    basePayJpy + commissionPayJpy + minimumGuaranteeAdjustmentJpy + bonusPayJpy - deductionJpy
  );
  const technicianNdpShareNdp = profile.ndpFeeBearer === "technician"
    ? platformFeeNdp
    : profile.ndpFeeBearer === "split"
      ? Math.round(platformFeeNdp * (profile.technicianNdpSharePercent / 100))
      : 0;
  const shopNdpShareNdp = platformFeeNdp - technicianNdpShareNdp;
  const technicianNetIncomeJpy = Math.max(0, technicianGrossIncomeJpy - technicianNdpShareNdp);

  return {
    serviceAmountJpy,
    platformFeeNdp,
    basePayJpy,
    commissionPayJpy,
    minimumGuaranteeAdjustmentJpy,
    bonusPayJpy,
    deductionJpy,
    technicianGrossIncomeJpy,
    technicianNdpShareNdp,
    shopNdpShareNdp,
    technicianNetIncomeJpy,
    shopEstimatedGrossProfitJpy: serviceAmountJpy - technicianGrossIncomeJpy - shopNdpShareNdp,
    appliedBonusRules,
    appliedDeductionRules,
    explanation: [
      `source:${profile.sourceType}`,
      `wage_mode:${profile.wageMode}`,
      `ndp_fee_bearer:${profile.ndpFeeBearer}`
    ]
  };
}

function previewStaticCompensationProfile(
  shopId: number,
  technicianProfileId: number,
  input: CompensationProfilePreviewInput
): CompensationProfilePreviewResult {
  const profile = getStaticTechnicianCompensationProfile(shopId, technicianProfileId);

  return {
    shopId,
    technicianProfileId,
    profile,
    preview: calculateStaticCompensationPreview(profile, input)
  };
}

function normalizePath(path: string) {
  try {
    const url = new URL(path, "http://static-demo.local");
    return url.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return path.split("?")[0]?.replace(/\/+$/, "") || "/";
  }
}

function numberFromText(value: string | number | null | undefined, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const match = String(value ?? "").match(/\d+/);
  const parsed = match ? Number(match[0]) : fallback;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readNumberQuery(options: HttpClientRequestOptions, key: string, fallback: number) {
  const value = options.query?.[key];
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readStringQuery(options: HttpClientRequestOptions, key: string) {
  const value = options.query?.[key];

  return typeof value === "string" ? value.trim() : "";
}

function paginate<TItem>(list: TItem[], options: HttpClientRequestOptions): PaginatedData<TItem> {
  const page = readNumberQuery(options, "page", 1);
  const pageSize = readNumberQuery(options, "pageSize", readNumberQuery(options, "page_size", 20));
  const start = (page - 1) * pageSize;

  return {
    list: list.slice(start, start + pageSize),
    page,
    page_size: pageSize,
    total: list.length
  };
}

const staticCoreCategories: CoreCategory[] = serviceCategories.map((category, index) => ({
  id: index + 1,
  code: category.id,
  name: category.name,
  nameEn: null,
  nameJa: category.name,
  parentId: null,
  iconUrl: null,
  sortOrder: index + 1,
  isActive: category.hot,
  createdAt: staticTimestamp,
  updatedAt: staticTimestamp
}));

function getCoreCategoryByCode(code: string) {
  return staticCoreCategories.find((category) => category.code === code) ?? staticCoreCategories[0]!;
}

function reviewSummary(rating: number, count: number, highlights: string[]) {
  return {
    ratingAverage: rating.toFixed(2),
    reviewCount: count,
    latestReviewAt: staticTimestamp,
    highlights: highlights.slice(0, 4)
  };
}

function mediaAsset(url: string | null | undefined, sortOrder: number): CoreMediaAsset | null {
  if (!url) {
    return null;
  }

  return {
    id: sortOrder,
    url,
    mimeType: "image/jpeg",
    usageType: sortOrder === 1 ? "cover" : "gallery",
    width: 1200,
    height: 800,
    altText: null,
    sortOrder
  };
}

function mediaAssetsFromUrls(urls: Array<string | null | undefined>) {
  return urls.map((url, index) => mediaAsset(url, index + 1)).filter((asset): asset is CoreMediaAsset => Boolean(asset));
}

function shopCard(index: number): CoreShopCard {
  const store = stores[index % stores.length] ?? stores[0]!;

  return {
    id: index + 1,
    name: store.name,
    city: store.area,
    address: store.address,
    coverUrl: store.cover,
    reviewSummary: reviewSummary(store.rating, store.reviewCount, store.tags)
  };
}

function technicianCard(index: number): CoreTechnicianCard {
  const technician = technicians[index % technicians.length] ?? technicians[0]!;

  return {
    id: index + 1,
    displayName: technician.name,
    city: technician.serviceAreas[0] ?? "东京",
    avatarUrl: technician.avatar,
    reviewSummary: reviewSummary(technician.rating, technician.reviewCount, technician.skills)
  };
}

function serviceCard(index: number): CoreServiceCard {
  const service = services[index % services.length] ?? services[0]!;
  const category = getCoreCategoryByCode(service.categoryId);
  const shop = shopCard(index);
  const technician = technicianCard(index);
  const firstPackage = service.packages[0];

  return {
    id: index + 1,
    name: service.name,
    description: service.summary,
    category,
    shop,
    technician,
    city: service.serviceAreas[0] ?? shop.city,
    priceAmount: service.priceFrom.toFixed(2),
    currency: "JPY",
    durationMinutes: firstPackage?.durationMinutes ?? 60,
    coverUrl: service.cover,
    reviewSummary: reviewSummary(service.rating, service.sales, service.tags)
  };
}

function serviceDetail(id: number): CoreServiceDetail {
  const index = Math.max(0, id - 1);
  const card = serviceCard(index);
  const source = services[index % services.length] ?? services[0]!;

  return {
    ...card,
    serviceMode: source.mode,
    mediaAssets: mediaAssetsFromUrls([source.cover]),
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp
  };
}

function shopDetail(id: number): CoreShopDetail {
  const index = Math.max(0, id - 1);
  const source = stores[index % stores.length] ?? stores[0]!;
  const card = shopCard(index);

  return {
    ...card,
    description: source.description,
    phone: null,
    latitude: null,
    longitude: null,
    mediaAssets: mediaAssetsFromUrls([source.cover, ...source.gallery]),
    services: services.slice(0, 6).map((_, serviceIndex) => serviceCard(serviceIndex)),
    technicians: technicians.slice(0, 6).map((_, technicianIndex) => technicianCard(technicianIndex)),
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp
  };
}

function technicianDetail(id: number): CoreTechnicianDetail {
  const index = Math.max(0, id - 1);
  const source = technicians[index % technicians.length] ?? technicians[0]!;
  const card = technicianCard(index);

  return {
    ...card,
    bio: source.bio ?? null,
    serviceArea: source.serviceAreas.join(", "),
    yearsExperience: Math.max(1, Math.round(source.orderCount / 180)),
    mediaAssets: mediaAssetsFromUrls([source.avatar, ...(source.gallery ?? [])]),
    services: services.slice(0, 6).map((_, serviceIndex) => serviceCard(serviceIndex)),
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp
  };
}

function customerProfile(id: number): CoreCustomerProfile {
  const index = Math.max(0, id - 1);
  const source = customers[index % customers.length] ?? customers[0]!;

  return {
    id,
    displayName: source.nickname ? `${source.nickname} / ${source.name}` : source.name,
    city: source.tags[0] ?? null,
    bio: source.bio ?? null,
    avatarUrl: source.avatar,
    membershipLevel: source.memberLevel,
    reviewSummary: reviewSummary(source.activeScore / 20, source.orderCount, source.tags),
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp
  };
}

function filteredServices(options: HttpClientRequestOptions) {
  const keyword = readStringQuery(options, "keyword").toLowerCase();
  const categoryId = Number(options.query?.categoryId);
  let list = services.map((_, index) => serviceCard(index));

  if (Number.isFinite(categoryId) && categoryId > 0) {
    list = list.filter((service) => service.category.id === categoryId);
  }

  if (keyword) {
    list = list.filter((service) => {
      const text = [
        service.name,
        service.description ?? "",
        service.category.name,
        service.city,
        service.shop.name,
        service.technician?.displayName ?? "",
        ...service.reviewSummary.highlights
      ].join(" ").toLowerCase();

      return text.includes(keyword);
    });
  }

  return list;
}

const staticPermissionSeed: Array<Pick<PermissionPayload, "code" | "module" | "name" | "type">> = [
  { code: "page:dashboard", module: "admin", name: "数据大盘", type: "page" },
  { code: "page:user-management", module: "admin", name: "账号管理", type: "page" },
  { code: "page:role-management", module: "admin", name: "角色管理", type: "page" },
  { code: "page:permission-management", module: "admin", name: "权限管理", type: "page" },
  { code: "menu:dashboard", module: "admin", name: "数据大盘菜单", type: "menu" },
  { code: "menu:user-management", module: "admin", name: "账号管理菜单", type: "menu" },
  { code: "menu:role-management", module: "admin", name: "角色管理菜单", type: "menu" },
  { code: "menu:permission-management", module: "admin", name: "权限管理菜单", type: "menu" },
  { code: "menu:admin-settings", module: "admin", name: "系统设置菜单", type: "menu" },
  { code: "button:user:create", module: "admin", name: "创建账号", type: "button" },
  { code: "button:user:disable", module: "admin", name: "停用账号", type: "button" },
  { code: "button:user:delete", module: "admin", name: "删除账号", type: "button" },
  { code: "button:user:assign-role", module: "admin", name: "分配角色", type: "button" },
  { code: "button:role:create", module: "admin", name: "创建角色", type: "button" },
  { code: "button:role:delete", module: "admin", name: "删除角色", type: "button" },
  { code: "button:role:assign-permission", module: "admin", name: "分配权限", type: "button" },
  { code: "button:permission:create", module: "admin", name: "创建权限", type: "button" },
  { code: "button:permission:delete", module: "admin", name: "删除权限", type: "button" },
  { code: "page:client-app", module: "client", name: "用户端", type: "page" },
  { code: "page:merchant-app", module: "merchant", name: "商户端", type: "page" },
  { code: "page:technician-app", module: "technician", name: "技师端", type: "page" },
  { code: "page:business-app", module: "business", name: "Afirieito 端", type: "page" },
  { code: "menu:client-app", module: "client", name: "用户端菜单", type: "menu" },
  { code: "menu:merchant-app", module: "merchant", name: "商户端菜单", type: "menu" },
  { code: "menu:technician-app", module: "technician", name: "技师端菜单", type: "menu" },
  { code: "menu:business-app", module: "business", name: "Afirieito 菜单", type: "menu" },
  ...getPortalFeaturePermissions("merchant").map((code) => ({
    code,
    module: "merchant",
    name: code,
    type: "button" as PermissionType
  }))
];

let staticPermissions = staticPermissionSeed.map<PermissionPayload>((permission, index) => ({
  id: index + 1,
  code: permission.code,
  module: permission.module,
  name: permission.name,
  type: permission.type,
  description: "静态演示权限",
  isSystem: true,
  createdAt: staticTimestamp,
  updatedAt: staticTimestamp,
  deletedAt: null
}));

function permissionsByCode(codes: string[]) {
  const codeSet = new Set(codes);

  return staticPermissions.filter((permission) => codeSet.has(permission.code));
}

function allPermissionCodes() {
  return staticPermissions.map((permission) => permission.code);
}

let staticRoles: RolePayload[] = [
  {
    id: 1,
    code: "admin",
    name: "超级管理员",
    description: "静态演示超级管理员",
    isSystem: true,
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp,
    deletedAt: null,
    permissions: staticPermissions
  },
  {
    id: 2,
    code: "merchant_owner",
    name: "商户店长",
    description: "静态演示商户角色",
    isSystem: true,
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp,
    deletedAt: null,
    permissions: permissionsByCode(["page:merchant-app", "menu:merchant-app", ...getPortalFeaturePermissions("merchant")])
  },
  {
    id: 3,
    code: "technician",
    name: "技师",
    description: "静态演示技师角色",
    isSystem: true,
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp,
    deletedAt: null,
    permissions: permissionsByCode(["page:technician-app", "menu:technician-app"])
  },
  {
    id: 4,
    code: "customer",
    name: "用户",
    description: "静态演示 C 端角色",
    isSystem: true,
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp,
    deletedAt: null,
    permissions: permissionsByCode(["page:client-app", "menu:client-app"])
  }
];

function roleAssignments(roleIds: number[]): UserRolePayload[] {
  return roleIds.map((roleId) => {
    const role = staticRoles.find((item) => item.id === roleId)!;

    return {
      id: roleId,
      roleId,
      code: role.code,
      name: role.name,
      scopeType: "global",
      scopeId: null
    };
  });
}

let staticUsers: UserPayload[] = [
  {
    id: 1,
    email: demoAuthAccount.adminEmail,
    phone: null,
    username: demoAuthAccount.username,
    avatarUrl: customers[0]?.avatar ?? null,
    isActive: true,
    lastLoginAt: staticTimestamp,
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp,
    deletedAt: null,
    roleAssignments: roleAssignments([1, 2, 3, 4]),
    roles: ["admin", "merchant_owner", "technician", "customer", "scout"]
  },
  {
    id: 2,
    email: demoAuthAccount.merchantAdminEmail,
    phone: null,
    username: "store-admin",
    avatarUrl: technicians[0]?.avatar ?? null,
    isActive: true,
    lastLoginAt: staticTimestamp,
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp,
    deletedAt: null,
    roleAssignments: roleAssignments([2]),
    roles: ["merchant_owner"]
  }
];

const staticAuthMe: AuthMePayload = {
  id: 1,
  email: demoAuthAccount.adminEmail,
  username: demoAuthAccount.username,
  avatarUrl: customers[0]?.avatar ?? null,
  isActive: true,
  currentIdentity: {
    id: 1,
    scopeId: 1,
    scopeType: "platform",
    type: "platform_admin"
  },
  identities: [
    { id: 1, scopeId: 1, scopeType: "platform", type: "platform_admin" },
    { id: 2, scopeId: 1, scopeType: "store", type: "merchant_owner" },
    { id: 3, scopeId: 1, scopeType: "technician_profile", type: "technician" },
    { id: 4, scopeId: 1, scopeType: "customer_profile", type: "customer" },
    { id: 5, scopeId: null, scopeType: "global", type: "scout" }
  ],
  roles: ["admin", "merchant_owner", "technician", "customer", "scout"],
  permissions: allPermissionCodes(),
  menus: staticPermissions.filter((permission) => permission.type === "menu").map((permission) => permission.code)
};

function permissionTree(): PermissionTreePayload {
  const modules = Array.from(new Set(staticPermissions.map((permission) => permission.module))).map((module) => {
    const modulePermissions = staticPermissions.filter((permission) => permission.module === module);
    const children = Array.from(new Set(modulePermissions.map((permission) => permission.type))).map((type) => ({
      type,
      permissions: modulePermissions.filter((permission) => permission.type === type)
    }));

    return { module, children };
  });

  return { modules };
}

function handleUserManagement<TData>(path: string, options: HttpClientRequestOptions): StaticDemoResult<TData> {
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");

  if (path === "/users" && method === "GET") {
    return { handled: true, data: clone(paginate(staticUsers.filter((user) => !user.deletedAt), options)) as TData };
  }

  if (path === "/users" && method === "POST") {
    const body = options.body as Partial<UserPayload> & { password?: string };
    const user: UserPayload = {
      id: Math.max(...staticUsers.map((item) => item.id), 0) + 1,
      email: String(body.email ?? ""),
      phone: body.phone ?? null,
      username: String(body.username ?? body.email ?? "static-user"),
      avatarUrl: body.avatarUrl ?? null,
      isActive: body.isActive ?? true,
      lastLoginAt: null,
      createdAt: staticTimestamp,
      updatedAt: staticTimestamp,
      deletedAt: null,
      roleAssignments: roleAssignments([4]),
      roles: ["customer"]
    };
    staticUsers = [user, ...staticUsers];

    return { handled: true, data: clone(user) as TData };
  }

  const userAction = path.match(/^\/users\/(\d+)(?:\/(enable|disable|roles))?$/);
  if (userAction) {
    const userId = Number(userAction[1]);
    const action = userAction[2];
    const user = staticUsers.find((item) => item.id === userId);

    if (!user) {
      return { handled: true, data: {} as TData };
    }

    if (method === "DELETE") {
      user.deletedAt = staticTimestamp;
      return { handled: true, data: {} as TData };
    }

    if (action === "enable") {
      user.isActive = true;
    } else if (action === "disable") {
      user.isActive = false;
    } else if (action === "roles") {
      const body = options.body as { roles?: Array<{ roleId: number }> };
      const roleIds = body.roles?.map((role) => role.roleId).filter(Boolean) ?? [];
      user.roleAssignments = roleAssignments(roleIds);
      user.roles = user.roleAssignments.map((role) => role.code);
    } else if (method === "PATCH") {
      Object.assign(user, options.body, { updatedAt: staticTimestamp });
    }

    return { handled: true, data: clone(user) as TData };
  }

  if (path === "/roles" && method === "GET") {
    return { handled: true, data: clone(paginate(staticRoles.filter((role) => !role.deletedAt), options)) as TData };
  }

  if (path === "/roles" && method === "POST") {
    const body = options.body as Partial<RolePayload>;
    const role: RolePayload = {
      id: Math.max(...staticRoles.map((item) => item.id), 0) + 1,
      code: String(body.code ?? `static_role_${Date.now()}`),
      name: String(body.name ?? "静态角色"),
      description: body.description ?? null,
      isSystem: false,
      createdAt: staticTimestamp,
      updatedAt: staticTimestamp,
      deletedAt: null,
      permissions: []
    };
    staticRoles = [role, ...staticRoles];

    return { handled: true, data: clone(role) as TData };
  }

  const roleAction = path.match(/^\/roles\/(\d+)(?:\/permissions)?$/);
  if (roleAction) {
    const roleId = Number(roleAction[1]);
    const role = staticRoles.find((item) => item.id === roleId);

    if (!role) {
      return { handled: true, data: {} as TData };
    }

    if (method === "DELETE") {
      role.deletedAt = staticTimestamp;
      return { handled: true, data: {} as TData };
    }

    if (path.endsWith("/permissions")) {
      const body = options.body as { permissionIds?: number[] };
      const permissionIds = new Set(body.permissionIds ?? []);
      role.permissions = staticPermissions.filter((permission) => permissionIds.has(permission.id));
    } else if (method === "PATCH") {
      Object.assign(role, options.body, { updatedAt: staticTimestamp });
    }

    return { handled: true, data: clone(role) as TData };
  }

  if (path === "/permissions/tree") {
    return { handled: true, data: clone(permissionTree()) as TData };
  }

  if (path === "/permissions" && method === "GET") {
    return { handled: true, data: clone(paginate(staticPermissions.filter((permission) => !permission.deletedAt), options)) as TData };
  }

  if (path === "/permissions" && method === "POST") {
    const body = options.body as Partial<PermissionPayload>;
    const permission: PermissionPayload = {
      id: Math.max(...staticPermissions.map((item) => item.id), 0) + 1,
      code: String(body.code ?? `static:permission:${Date.now()}`),
      module: String(body.module ?? "static"),
      name: String(body.name ?? "静态权限"),
      type: body.type ?? "button",
      description: body.description ?? null,
      isSystem: false,
      createdAt: staticTimestamp,
      updatedAt: staticTimestamp,
      deletedAt: null
    };
    staticPermissions = [permission, ...staticPermissions];

    return { handled: true, data: clone(permission) as TData };
  }

  const permissionAction = path.match(/^\/permissions\/(\d+)$/);
  if (permissionAction) {
    const permissionId = Number(permissionAction[1]);
    const permission = staticPermissions.find((item) => item.id === permissionId);

    if (!permission) {
      return { handled: true, data: {} as TData };
    }

    if (method === "DELETE") {
      permission.deletedAt = staticTimestamp;
      return { handled: true, data: {} as TData };
    }

    if (method === "PATCH") {
      Object.assign(permission, options.body, { updatedAt: staticTimestamp });
    }

    return { handled: true, data: clone(permission) as TData };
  }

  return { handled: false };
}

function backofficeOrderPayload(orderIndex: number): BackofficeOrderPayload {
  const order = orders[orderIndex % orders.length] ?? orders[0]!;

  return {
    id: orderIndex + 1,
    orderNo: order.orderNo,
    status: order.status,
    paymentStatus: "unpaid",
    customerUserId: numberFromText(order.customerId, 1),
    customerName: order.customerName,
    serviceId: orderIndex + 1,
    serviceName: order.itemName,
    shopId: numberFromText(stores[orderIndex % stores.length]?.id, 1),
    shopName: order.storeName ?? stores[0]?.name ?? "静态店铺",
    technicianProfileId: order.technicianName ? orderIndex + 1 : null,
    technicianName: order.technicianName ?? null,
    fulfillmentMode: order.mode,
    priceAmount: order.amount,
    currency: "JPY",
    startsAt: staticTimestamp,
    endsAt: staticTimestamp,
    note: order.remark ?? null,
    cancelReason: null,
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp
  };
}

function scheduleSlotPayload(scheduleIndex: number): BackofficeScheduleSlotPayload {
  const schedule = schedules[scheduleIndex % schedules.length] ?? schedules[0]!;
  const service = services[scheduleIndex % services.length] ?? services[0]!;
  const store = stores[scheduleIndex % stores.length] ?? stores[0]!;
  const technician = technicians[scheduleIndex % technicians.length] ?? technicians[0]!;

  return {
    id: scheduleIndex + 1,
    serviceId: scheduleIndex + 1,
    serviceName: service.name,
    shopId: numberFromText(store.id, scheduleIndex + 1),
    shopName: store.name,
    technicianProfileId: numberFromText(technician.id, scheduleIndex + 1),
    technicianName: technician.name,
    startsAt: `${schedule.date}T${schedule.startTime}:00.000Z`,
    endsAt: `${schedule.date}T${schedule.endTime}:00.000Z`,
    capacity: 1,
    bookedCount: schedule.status === "booked" ? 1 : 0,
    status: schedule.status === "free" ? "available" : schedule.status
  };
}

function financeSettlementPayload(settlementIndex: number): BackofficeFinanceSettlementPayload {
  const settlement = settlements[settlementIndex % settlements.length] ?? settlements[0]!;
  const technician = technicians[settlementIndex % technicians.length] ?? technicians[0]!;
  const serviceIncomeStatus = settlement.status === "paid" ? "confirmed" : "unreported";
  const technicianEstimatedIncomeJpy = Math.max(0, settlement.grossAmount - settlement.platformFee - 500);

  return {
    id: settlementIndex + 1,
    bookingOrderId: settlementIndex + 1,
    orderNo: `STATIC-ORDER-${String(settlementIndex + 1).padStart(4, "0")}`,
    referenceType: "booking_order",
    referenceId: settlementIndex + 1,
    status: settlement.status === "paid" ? "settled" : "holding",
    shopId: settlementIndex + 1,
    shopName: settlement.merchantName,
    technicianProfileId: numberFromText(technician.id, settlementIndex + 1),
    technicianName: technician.name,
    estimatedServiceGmvJpy: settlement.grossAmount,
    platformCollectedServiceAmountJpy: 0,
    offlineReportedServiceAmountJpy: serviceIncomeStatus === "confirmed" ? settlement.grossAmount : 0,
    unknownOrUnreportedServiceAmountJpy: serviceIncomeStatus === "confirmed" ? 0 : settlement.grossAmount,
    serviceIncomeStatus,
    paymentChannel: serviceIncomeStatus === "confirmed" ? "offline_cash" : "unknown",
    platformNdpRevenue: settlement.platformFee,
    userRewardNdpCost: settlement.refundAmount,
    pendingHoldNdp: settlement.status === "paid" ? 0 : settlement.platformFee,
    campaignDiscountNdp: 0,
    releasedNdp: 0,
    penaltyNdp: 0,
    compensationToUserNdp: 0,
    technicianEstimatedIncomeJpy,
    shopEstimatedGrossProfitJpy: settlement.grossAmount - technicianEstimatedIncomeJpy - settlement.platformFee,
    appliedFeeRuleIds: ["static:default-booking"],
    moneyTimeline: [
      {
        type: "technician_income_estimated",
        label: "技师收入预估",
        amountJpy: technicianEstimatedIncomeJpy,
        actorType: "system",
        occurredAt: staticTimestamp,
        status: "estimated",
        metadata: {
          shopEstimatedGrossProfitJpy: settlement.grossAmount - technicianEstimatedIncomeJpy - settlement.platformFee
        }
      }
    ],
    moneyTimelineStatus: serviceIncomeStatus === "confirmed" ? "complete" : "needs_income_report",
    createdAt: staticTimestamp
  };
}

function staticOrderFinanceDetail(bookingOrderId: number): OrderFinanceDetailPayload {
  const index = Math.max(0, bookingOrderId - 1);
  const settlement = financeSettlementPayload(index);
  const report = staticOrderIncomeReports.get(bookingOrderId);
  const shopId = settlement.shopId;
  const technicianProfileId = settlement.technicianProfileId ?? 1;
  const preview = previewStaticCompensationProfile(shopId, technicianProfileId, {
    serviceAmountJpy: report?.serviceAmountJpy ?? settlement.estimatedServiceGmvJpy,
    platformFeeNdp: settlement.platformNdpRevenue + settlement.userRewardNdpCost,
    workedMinutes: 60,
    monthlyCompletedOrders: 101,
    monthlyServiceGmvJpy: 900_000,
    ratingAverage: 4.8,
    lateCancellationCount: 0
  }).preview;
  const serviceIncomeStatus = report?.serviceIncomeStatus ?? settlement.serviceIncomeStatus as ServiceIncomeStatus;
  const paymentChannel = report?.paymentChannel ?? settlement.paymentChannel as ServicePaymentChannel;
  const serviceAmountJpy = report?.serviceAmountJpy ?? settlement.estimatedServiceGmvJpy;
  const platformCollectedServiceAmountJpy = report?.platformCollectedServiceAmountJpy ?? settlement.platformCollectedServiceAmountJpy;
  const offlineReportedServiceAmountJpy = report?.offlineReportedServiceAmountJpy ?? settlement.offlineReportedServiceAmountJpy;
  const unknownOrUnreportedServiceAmountJpy = report?.unknownOrUnreportedServiceAmountJpy ?? settlement.unknownOrUnreportedServiceAmountJpy;
  const reportTimeline = report?.moneyTimeline ?? [];
  const moneyTimeline: MoneyTimelineEvent[] = [
    {
      type: "order_created",
      label: "订单创建",
      amountJpy: serviceAmountJpy,
      actorType: "customer",
      occurredAt: staticTimestamp,
      status: "completed"
    },
    {
      type: "platform_fee_captured",
      label: "平台费实扣",
      amountNdp: settlement.platformNdpRevenue + settlement.userRewardNdpCost,
      actorType: "system",
      occurredAt: staticTimestamp,
      status: "captured"
    },
    ...reportTimeline,
    ...(serviceIncomeStatus === "unreported"
      ? [
          {
            type: "service_income_unreported",
            label: "服务收入待上报",
            amountJpy: unknownOrUnreportedServiceAmountJpy,
            actorType: "merchant" as const,
            occurredAt: staticTimestamp,
            status: "pending"
          }
        ]
      : []),
    {
      type: "technician_income_estimated",
      label: "技师收入预估",
      amountJpy: preview.technicianNetIncomeJpy,
      actorType: "system",
      occurredAt: staticTimestamp,
      status: "estimated",
      metadata: {
        shopEstimatedGrossProfitJpy: preview.shopEstimatedGrossProfitJpy,
        compensationRuleExplanation: preview.explanation
      }
    }
  ];

  return {
    bookingOrderId,
    orderNo: settlement.orderNo,
    orderStatus: "completed",
    shopId,
    shopName: settlement.shopName,
    technicianProfileId,
    technicianName: settlement.technicianName,
    serviceName: services[index % services.length]?.name ?? "Aroma Treatment",
    estimatedServiceGmvJpy: serviceAmountJpy,
    platformCollectedServiceAmountJpy,
    offlineReportedServiceAmountJpy,
    unknownOrUnreportedServiceAmountJpy,
    paymentChannel,
    serviceIncomeStatus,
    serviceIncomeReportedById: report ? 1 : null,
    serviceIncomeReportedAt: report?.reportedAt ?? null,
    serviceIncomeConfirmedById: report?.confirmedAt ? 1 : null,
    serviceIncomeConfirmedAt: report?.confirmedAt ?? null,
    serviceIncomeNote: report?.note ?? null,
    serviceIncomeProofUrl: report?.proofUrl ?? null,
    platformNdpRevenue: settlement.platformNdpRevenue,
    userRewardNdpCost: settlement.userRewardNdpCost,
    pendingHoldNdp: settlement.pendingHoldNdp,
    campaignDiscountNdp: settlement.campaignDiscountNdp,
    releasedNdp: settlement.releasedNdp,
    penaltyNdp: settlement.penaltyNdp,
    compensationToUserNdp: settlement.compensationToUserNdp,
    appliedFeeRuleIds: settlement.appliedFeeRuleIds,
    moneyTimeline,
    moneyTimelineStatus: serviceIncomeStatus === "confirmed"
      ? "complete"
      : serviceIncomeStatus === "reported"
        ? "needs_review"
        : "needs_income_report",
    technicianIncomePreview: preview,
    createdAt: settlement.createdAt,
    updatedAt: report?.reportedAt ?? settlement.createdAt
  };
}

function reportStaticServiceIncome(
  bookingOrderId: number,
  body: Record<string, unknown>
): OrderFinanceDetailPayload {
  const current = staticOrderFinanceDetail(bookingOrderId);
  const serviceAmountJpy = readBodyNumber(body, "serviceAmountJpy", current.estimatedServiceGmvJpy);
  const platformCollectedServiceAmountJpy = readBodyNumber(body, "platformCollectedServiceAmountJpy", 0);
  const offlineReportedServiceAmountJpy = readBodyNumber(body, "offlineReportedServiceAmountJpy", serviceAmountJpy);
  const paymentChannel = body.paymentChannel === "platform_online" ||
    body.paymentChannel === "offline_card" ||
    body.paymentChannel === "bank_transfer" ||
    body.paymentChannel === "other"
      ? body.paymentChannel
      : body.paymentChannel === "unknown"
        ? "unknown"
        : "offline_cash";
  const unknownOrUnreportedServiceAmountJpy = Math.max(
    0,
    serviceAmountJpy - platformCollectedServiceAmountJpy - offlineReportedServiceAmountJpy
  );
  const confirmedAt = body.confirmNow === true ? new Date().toISOString() : null;
  const reportedAt = new Date().toISOString();
  const serviceIncomeStatus: ServiceIncomeStatus = confirmedAt ? "confirmed" : "reported";
  const moneyTimeline: MoneyTimelineEvent[] = [
    {
      type: "service_income_reported",
      label: "服务收入已上报",
      amountJpy: serviceAmountJpy,
      actorType: "merchant",
      occurredAt: reportedAt,
      status: serviceIncomeStatus,
      metadata: { paymentChannel }
    },
    ...(confirmedAt
      ? [
          {
            type: "service_income_confirmed",
            label: "服务收入已确认",
            amountJpy: serviceAmountJpy,
            actorType: "merchant" as const,
            occurredAt: confirmedAt,
            status: "confirmed",
            metadata: { paymentChannel }
          }
        ]
      : [])
  ];

  staticOrderIncomeReports.set(bookingOrderId, {
    serviceAmountJpy,
    platformCollectedServiceAmountJpy,
    offlineReportedServiceAmountJpy,
    unknownOrUnreportedServiceAmountJpy,
    paymentChannel,
    serviceIncomeStatus,
    note: typeof body.note === "string" ? body.note : null,
    proofUrl: typeof body.proofUrl === "string" ? body.proofUrl : null,
    reportedAt,
    confirmedAt,
    moneyTimeline
  });

  return staticOrderFinanceDetail(bookingOrderId);
}

function staticPayRunPayload(status: PayRunStatus = "draft"): PayRunPayload {
  const existing = staticPayRuns.values().next().value as PayRunPayload | undefined;
  if (existing) {
    return existing;
  }

  const settlement = financeSettlementPayload(0);
  const orderFinance = staticOrderFinanceDetail(settlement.bookingOrderId);
  const preview = orderFinance.technicianIncomePreview;
  const baseSalaryJpy = preview?.basePayJpy ?? 1000;
  const commissionJpy = preview?.commissionPayJpy ?? 4400;
  const bonusJpy = preview?.bonusPayJpy ?? 500;
  const platformFeeShareDeductionJpy = preview?.technicianNdpShareNdp ?? 150;
  const deductionJpy = (preview?.deductionJpy ?? 0) + platformFeeShareDeductionJpy;
  const netPayJpy = preview?.technicianNetIncomeJpy ?? Math.max(0, baseSalaryJpy + commissionJpy + bonusJpy - deductionJpy);
  const payRunId = staticPayRunIdSeed++;
  const payslipId = staticPayslipIdSeed++;
  const payslip: PayslipPayload = {
    id: payslipId,
    payRunId,
    shopId: settlement.shopId,
    shopName: settlement.shopName,
    technicianProfileId: settlement.technicianProfileId ?? 1,
    technicianName: settlement.technicianName ?? "Misaki",
    technicianUserId: 31,
    compensationProfileId: 8,
    periodStart: "2026-06-01T00:00:00.000Z",
    periodEnd: "2026-06-30T23:59:59.000Z",
    status,
    disputeStatus: "none",
    disputeReason: null,
    baseSalaryJpy,
    annualSalaryProratedJpy: 0,
    dailyWageJpy: 0,
    hourlyWageJpy: 0,
    commissionJpy,
    guaranteeTopupJpy: preview?.minimumGuaranteeAdjustmentJpy ?? 0,
    bonusJpy,
    allowanceJpy: 0,
    deductionJpy,
    platformFeeShareDeductionJpy,
    netPayJpy,
    paidAmountJpy: 0,
    unpaidAmountJpy: netPayJpy,
    confirmedAt: null,
    disputedAt: null,
    disputeResolvedAt: null,
    disputeResolvedById: null,
    disputeResolutionNote: null,
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp,
    lines: [
      {
        id: 1,
        payslipId,
        lineType: "commission",
        title: `${settlement.orderNo} 订单分成`,
        amountJpy: commissionJpy,
        quantity: 1,
        unitAmountJpy: commissionJpy,
        formulaText: "服务金额 x 分成比例",
        sourceType: "order",
        sourceId: settlement.bookingOrderId,
        ruleId: "static-compensation-v1",
        orderId: settlement.bookingOrderId,
        explanation: orderFinance.serviceName,
        createdById: 1,
        createdAt: staticTimestamp,
        updatedAt: staticTimestamp
      },
      {
        id: 2,
        payslipId,
        lineType: "platform_fee_share_deduction",
        title: `${settlement.orderNo} NDP 平台费分摊`,
        amountJpy: -platformFeeShareDeductionJpy,
        quantity: 1,
        unitAmountJpy: -platformFeeShareDeductionJpy,
        formulaText: "平台费 x 技师承担比例",
        sourceType: "order",
        sourceId: settlement.bookingOrderId,
        ruleId: "static-compensation-v1",
        orderId: settlement.bookingOrderId,
        explanation: "1 NDP = 1 JPY",
        createdById: 1,
        createdAt: staticTimestamp,
        updatedAt: staticTimestamp
      },
      {
        id: 3,
        payslipId,
        lineType: "bonus",
        title: "店铺手动奖金",
        amountJpy: bonusJpy,
        quantity: 1,
        unitAmountJpy: bonusJpy,
        formulaText: null,
        sourceType: "manual",
        sourceId: null,
        ruleId: "static-manual-bonus",
        orderId: null,
        explanation: "月度表现奖励",
        createdById: 1,
        createdAt: staticTimestamp,
        updatedAt: staticTimestamp
      }
    ],
    payoutRecords: []
  };
  const payRun: PayRunPayload = {
    id: payRunId,
    shopId: settlement.shopId,
    shopName: settlement.shopName,
    periodStart: payslip.periodStart,
    periodEnd: payslip.periodEnd,
    status,
    totalBaseSalaryJpy: baseSalaryJpy,
    totalCommissionJpy: commissionJpy,
    totalBonusJpy: bonusJpy,
    totalAllowanceJpy: 0,
    totalDeductionJpy: deductionJpy,
    totalNetPayJpy: netPayJpy,
    paidAmountJpy: 0,
    unpaidAmountJpy: netPayJpy,
    generatedById: 1,
    approvedById: null,
    lockedAt: null,
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp,
    payslips: [payslip]
  };

  staticPayRuns.set(payRun.id, payRun);
  return payRun;
}

function staticPayRunList(options: HttpClientRequestOptions): PayrollListPayload<PayRunPayload> {
  const rows = Array.from(staticPayRuns.values());
  const list = rows.length > 0 ? rows : [staticPayRunPayload("draft")];
  const paged = paginate(list, options);

  return {
    list: paged.list,
    total: paged.total,
    page: paged.page,
    page_size: paged.page_size
  };
}

function staticPayRunCsvExport(options: HttpClientRequestOptions): PayrollCsvExportPayload {
  const payRuns = staticPayRunList(options).list;
  const headers = [
    "shop_name",
    "period_start",
    "period_end",
    "status",
    "total_net_pay_jpy",
    "paid_amount_jpy",
    "unpaid_amount_jpy",
    "payslip_count",
    "disputed_payslips"
  ];
  const rows = payRuns.map((payRun) => [
    payRun.shopName,
    payRun.periodStart,
    payRun.periodEnd,
    payRun.status,
    payRun.totalNetPayJpy,
    payRun.paidAmountJpy,
    payRun.unpaidAmountJpy,
    payRun.payslips.length,
    payRun.payslips.filter((payslip) => payslip.disputeStatus === "disputed").length
  ]);

  return {
    filename: "static-pay-runs.csv",
    contentType: "text/csv; charset=utf-8",
    csv: [headers, ...rows].map((row) => row.map((cell) => staticCsvCell(cell)).join(",")).join("\n")
  };
}

function staticPayslipCsvExport(): PayrollCsvExportPayload {
  const payRun = staticPayRunPayload("published");
  const payslips = payRun.payslips;
  const headers = [
    "shop_name",
    "technician_name",
    "period_start",
    "period_end",
    "status",
    "net_pay_jpy",
    "paid_amount_jpy",
    "unpaid_amount_jpy",
    "dispute_status",
    "line_count"
  ];
  const rows = payslips.map((payslip) => [
    payslip.shopName,
    payslip.technicianName,
    payslip.periodStart,
    payslip.periodEnd,
    payslip.status,
    payslip.netPayJpy,
    payslip.paidAmountJpy,
    payslip.unpaidAmountJpy,
    payslip.disputeStatus,
    payslip.lines.length
  ]);

  return {
    filename: "static-technician-payslips.csv",
    contentType: "text/csv; charset=utf-8",
    csv: [headers, ...rows].map((row) => row.map((cell) => staticCsvCell(cell)).join(",")).join("\n")
  };
}

function staticCsvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function staticPayrollAdjustmentPayload(
  status: PayrollAdjustmentStatus = "draft"
): PayrollAdjustmentRequestPayload {
  const existing = staticPayrollAdjustments.values().next().value as PayrollAdjustmentRequestPayload | undefined;
  if (existing) {
    return existing;
  }

  const payRun = staticPayRunPayload();
  const payslip = payRun.payslips[0]!;
  const adjustment: PayrollAdjustmentRequestPayload = {
    id: staticPayrollAdjustmentIdSeed++,
    shopId: payslip.shopId,
    shopName: payslip.shopName,
    technicianProfileId: payslip.technicianProfileId,
    technicianName: payslip.technicianName,
    technicianUserId: payslip.technicianUserId,
    periodStart: payRun.periodStart,
    periodEnd: payRun.periodEnd,
    adjustmentType: "bonus",
    title: "客户好评奖金",
    amountJpy: 1200,
    reason: "本周期收到 5 星好评",
    proofUrl: null,
    status,
    requestedById: 1,
    submittedAt: status === "draft" ? null : new Date().toISOString(),
    approvedById: status === "approved" || status === "applied" ? 1 : null,
    approvedAt: status === "approved" || status === "applied" ? new Date().toISOString() : null,
    rejectedById: status === "rejected" ? 1 : null,
    rejectedAt: status === "rejected" ? new Date().toISOString() : null,
    rejectionReason: status === "rejected" ? "金额重复" : null,
    appliedPayRunId: status === "applied" ? payRun.id : null,
    appliedPayslipLineId: null,
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp
  };

  staticPayrollAdjustments.set(adjustment.id, adjustment);
  return adjustment;
}

function staticPayrollAdjustmentList(
  options: HttpClientRequestOptions
): PayrollListPayload<PayrollAdjustmentRequestPayload> {
  const rows = Array.from(staticPayrollAdjustments.values());
  const list = rows.length > 0 ? rows : [staticPayrollAdjustmentPayload("draft")];
  const paged = paginate(list, options);

  return {
    list: paged.list,
    total: paged.total,
    page: paged.page,
    page_size: paged.page_size
  };
}

function createStaticPayrollAdjustment(body: Record<string, unknown>): PayrollAdjustmentRequestPayload {
  const payRun = staticPayRunPayload();
  const payslip = payRun.payslips[0]!;
  const adjustmentType: PayrollAdjustmentType =
    body.adjustmentType === "allowance" ||
    body.adjustmentType === "deduction" ||
    body.adjustmentType === "adjustment"
      ? body.adjustmentType
      : "bonus";
  const adjustment: PayrollAdjustmentRequestPayload = {
    id: staticPayrollAdjustmentIdSeed++,
    shopId: readBodyNumber(body, "shopId", payslip.shopId),
    shopName: payslip.shopName,
    technicianProfileId: readBodyNumber(body, "technicianProfileId", payslip.technicianProfileId),
    technicianName: payslip.technicianName,
    technicianUserId: payslip.technicianUserId,
    periodStart: typeof body.periodStart === "string" ? body.periodStart : payRun.periodStart,
    periodEnd: typeof body.periodEnd === "string" ? body.periodEnd : payRun.periodEnd,
    adjustmentType,
    title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : "工资调整",
    amountJpy: readBodyNumber(body, "amountJpy", 1200),
    reason: typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "工资周期调整",
    proofUrl: typeof body.proofUrl === "string" ? body.proofUrl : null,
    status: "draft",
    requestedById: 1,
    submittedAt: null,
    approvedById: null,
    approvedAt: null,
    rejectedById: null,
    rejectedAt: null,
    rejectionReason: null,
    appliedPayRunId: null,
    appliedPayslipLineId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  staticPayrollAdjustments.set(adjustment.id, adjustment);
  return adjustment;
}

function transitionStaticPayrollAdjustment(
  adjustmentId: number,
  status: PayrollAdjustmentStatus,
  body: Record<string, unknown> = {}
): PayrollAdjustmentRequestPayload {
  const current = staticPayrollAdjustments.get(adjustmentId) ?? staticPayrollAdjustmentPayload();
  const timestamp = new Date().toISOString();
  const next: PayrollAdjustmentRequestPayload = {
    ...current,
    status,
    submittedAt: status === "submitted" ? timestamp : current.submittedAt,
    approvedById: status === "approved" ? 1 : current.approvedById,
    approvedAt: status === "approved" ? timestamp : current.approvedAt,
    rejectedById: status === "rejected" ? 1 : current.rejectedById,
    rejectedAt: status === "rejected" ? timestamp : current.rejectedAt,
    rejectionReason:
      status === "rejected"
        ? typeof body.reason === "string" && body.reason.trim()
          ? body.reason.trim()
          : "金额需要复核"
        : current.rejectionReason,
    updatedAt: timestamp
  };

  staticPayrollAdjustments.set(adjustmentId, next);
  return next;
}

function transitionStaticPayRun(payRunId: number, status: PayRunStatus): PayRunPayload {
  const current = staticPayRuns.get(payRunId) ?? staticPayRunPayload();
  const next: PayRunPayload = {
    ...current,
    status,
    approvedById: status === "approved" ? 1 : current.approvedById,
    lockedAt: status === "locked" ? new Date().toISOString() : current.lockedAt,
    updatedAt: new Date().toISOString(),
    payslips: current.payslips.map((payslip) => ({
      ...payslip,
      status: status === "published" && payslip.status === "draft" ? "published" : status === "approved" || status === "locked" ? status : payslip.status,
      updatedAt: new Date().toISOString()
    }))
  };

  staticPayRuns.set(payRunId, next);
  return next;
}

function findStaticPayslip(payslipId: number): PayslipPayload {
  const payRun = staticPayRunPayload();
  const current = Array.from(staticPayRuns.values())
    .flatMap((item) => item.payslips)
    .find((payslip) => payslip.id === payslipId) ?? payRun.payslips[0]!;

  return current;
}

function updateStaticPayslip(payslipId: number, updater: (payslip: PayslipPayload) => PayslipPayload): PayslipPayload {
  let updated = findStaticPayslip(payslipId);
  staticPayRuns.forEach((payRun, payRunId) => {
    const nextPayslips = payRun.payslips.map((payslip) => {
      if (payslip.id !== payslipId) {
        return payslip;
      }

      updated = updater(payslip);
      return updated;
    });
    const paidAmountJpy = nextPayslips.reduce((sum, item) => sum + item.paidAmountJpy, 0);
    const unpaidAmountJpy = nextPayslips.reduce((sum, item) => sum + item.unpaidAmountJpy, 0);
    staticPayRuns.set(payRunId, {
      ...payRun,
      paidAmountJpy,
      unpaidAmountJpy,
      status: unpaidAmountJpy === 0 ? "paid" : payRun.status,
      updatedAt: new Date().toISOString(),
      payslips: nextPayslips
    });
  });

  return updated;
}

function reportStaticPayslipDispute(payslipId: number, body: Record<string, unknown>): PayslipPayload {
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "工资单金额需要复核";

  return updateStaticPayslip(payslipId, (payslip) => ({
    ...payslip,
    status: "disputed",
    disputeStatus: "disputed",
    disputeReason: reason,
    disputedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
}

function resolveStaticPayslipDispute(payslipId: number, body: Record<string, unknown>): PayslipPayload {
  const resolutionNote =
    typeof body.resolutionNote === "string" && body.resolutionNote.trim()
      ? body.resolutionNote.trim()
      : "商户已复核工资单并重新发布";

  return updateStaticPayslip(payslipId, (payslip) => ({
    ...payslip,
    status: "published",
    disputeStatus: "resolved",
    disputeResolvedAt: new Date().toISOString(),
    disputeResolvedById: 1,
    disputeResolutionNote: resolutionNote,
    updatedAt: new Date().toISOString()
  }));
}

function confirmStaticPayslip(payslipId: number): PayslipPayload {
  return updateStaticPayslip(payslipId, (payslip) => ({
    ...payslip,
    status: "confirmed",
    disputeStatus: "confirmed",
    disputeReason: null,
    confirmedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
}

function recordStaticPayout(payslipId: number, body: Record<string, unknown>): PayslipPayload {
  const payoutAmount = readBodyNumber(body, "amountJpy", findStaticPayslip(payslipId).unpaidAmountJpy);
  const payoutMethod: PayoutMethod =
    body.payoutMethod === "cash" ||
    body.payoutMethod === "ndp" ||
    body.payoutMethod === "external" ||
    body.payoutMethod === "mixed" ||
    body.payoutMethod === "other"
      ? body.payoutMethod
      : "bank_transfer";

  return updateStaticPayslip(payslipId, (payslip) => {
    const amountJpy = Math.min(payslip.unpaidAmountJpy, Math.max(1, payoutAmount));
    const paidAmountJpy = payslip.paidAmountJpy + amountJpy;
    const unpaidAmountJpy = Math.max(0, payslip.unpaidAmountJpy - amountJpy);

    return {
      ...payslip,
      status: unpaidAmountJpy === 0 ? "paid" : "scheduled",
      paidAmountJpy,
      unpaidAmountJpy,
      updatedAt: new Date().toISOString(),
      payoutRecords: [
        ...payslip.payoutRecords,
        {
          id: staticPayoutRecordIdSeed++,
          payslipId,
          shopId: payslip.shopId,
          technicianProfileId: payslip.technicianProfileId,
          amountJpy,
          payoutMethod,
          payoutDate: typeof body.payoutDate === "string" ? body.payoutDate : new Date().toISOString(),
          referenceNo: typeof body.referenceNo === "string" ? body.referenceNo : null,
          proofUrl: typeof body.proofUrl === "string" ? body.proofUrl : null,
          note: typeof body.note === "string" ? body.note : null,
          status: "completed",
          confirmedByTechnician: false,
          technicianConfirmedAt: null,
          createdById: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]
    };
  });
}

function confirmStaticPayoutRecord(payslipId: number, payoutRecordId: number): PayslipPayload {
  return updateStaticPayslip(payslipId, (payslip) => ({
    ...payslip,
    payoutRecords: payslip.payoutRecords.map((record) =>
      record.id === payoutRecordId
        ? {
            ...record,
            confirmedByTechnician: true,
            technicianConfirmedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        : record
    ),
    updatedAt: new Date().toISOString()
  }));
}

function technicianPayload(index: number): BackofficeTechnicianPayload {
  const technician = technicians[index % technicians.length] ?? technicians[0]!;
  const store = stores.find((item) => item.id === technician.storeId);

  return {
    id: index + 1,
    userId: index + 10,
    displayName: technician.name,
    email: technician.accountUsername ?? `${technician.id}@static-demo.needo.jp`,
    shopId: store ? numberFromText(store.id, index + 1) : null,
    shopName: store?.name ?? null,
    city: technician.serviceAreas[0] ?? "东京",
    serviceArea: technician.serviceAreas.join(", "),
    status: technician.status === "off" ? "draft" : "published",
    verifiedAt: staticTimestamp,
    createdAt: staticTimestamp
  };
}

function shopPayload(index: number): BackofficeShopPayload {
  const store = stores[index % stores.length] ?? stores[0]!;

  return {
    id: index + 1,
    ownerUserId: index + 20,
    ownerEmail: store.accountUsername ? `${store.accountUsername}@needo.jp` : null,
    name: store.name,
    city: store.area,
    address: store.address,
    phone: null,
    status: store.openStatus === "closed" ? "suspended" : "published",
    isRecommended: index < 4,
    createdAt: staticTimestamp
  };
}

function dashboardPayload(): BackofficeDashboardPayload {
  const orderRows = orders.slice(0, 8).map((_, index) => backofficeOrderPayload(index));
  const scheduleRows = schedules.slice(0, 12).map((_, index) => scheduleSlotPayload(index));
  const settlementRows = settlements.map((_, index) => financeSettlementPayload(index));

  return {
    metrics: dashboardMetrics.slice(0, 8),
    orders: orderRows,
    schedule: {
      total: scheduleRows.length,
      available: scheduleRows.filter((item) => item.status === "available").length,
      booked: scheduleRows.filter((item) => item.status === "booked").length
    },
    finance: {
      estimatedServiceGmvJpy: settlementRows.reduce((total, item) => total + item.estimatedServiceGmvJpy, 0),
      platformNdpRevenue: settlementRows.reduce((total, item) => total + item.platformNdpRevenue, 0),
      userRewardNdpCost: settlementRows.reduce((total, item) => total + item.userRewardNdpCost, 0),
      pendingHoldNdp: settlementRows.reduce((total, item) => total + item.pendingHoldNdp, 0),
      campaignDiscountNdp: settlementRows.reduce((total, item) => total + item.campaignDiscountNdp, 0),
      unknownOrUnreportedServiceAmountJpy: settlementRows.reduce((total, item) => total + item.unknownOrUnreportedServiceAmountJpy, 0)
    },
    technicians: technicians.slice(0, 8).map((_, index) => technicianPayload(index)),
    shops: stores.slice(0, 8).map((_, index) => shopPayload(index))
  };
}

function backofficeList<TItem>(list: TItem[], options: HttpClientRequestOptions): PaginatedApiPayload<TItem> {
  return paginate(list, options);
}

function handleBackoffice<TData>(path: string, options: HttpClientRequestOptions): StaticDemoResult<TData> {
  const scopeMatch = path.match(/^\/(backoffice|merchant-admin|technician)(\/.*)?$/);

  if (!scopeMatch) {
    return { handled: false };
  }

  const suffix = scopeMatch[2] || "";

  if (suffix === "/dashboard") {
    return { handled: true, data: clone(dashboardPayload()) as TData };
  }

  if (suffix === "/orders") {
    return { handled: true, data: clone(backofficeList(orders.map((_, index) => backofficeOrderPayload(index)), options)) as TData };
  }

  if (suffix === "/schedule") {
    return { handled: true, data: clone(backofficeList(schedules.map((_, index) => scheduleSlotPayload(index)), options)) as TData };
  }

  if (
    (scopeMatch[1] === "merchant-admin" || scopeMatch[1] === "backoffice") &&
    suffix === "/pay-runs/export"
  ) {
    return { handled: true, data: clone(staticPayRunCsvExport(options)) as TData };
  }

  if ((scopeMatch[1] === "merchant-admin" || scopeMatch[1] === "backoffice") && suffix === "/pay-runs") {
    if (scopeMatch[1] === "merchant-admin" && options.method === "POST") {
      const payRun = staticPayRunPayload("draft");
      staticPayRuns.set(payRun.id, { ...payRun, updatedAt: new Date().toISOString() });
      return { handled: true, data: clone(staticPayRuns.get(payRun.id)!) as TData };
    }

    return { handled: true, data: clone(staticPayRunList(options)) as TData };
  }

  if (scopeMatch[1] === "merchant-admin" && suffix === "/payroll-adjustments") {
    if (options.method === "POST") {
      return {
        handled: true,
        data: clone(createStaticPayrollAdjustment(readBodyRecord(options))) as TData
      };
    }

    return { handled: true, data: clone(staticPayrollAdjustmentList(options)) as TData };
  }

  const payrollAdjustmentActionMatch = suffix.match(/^\/payroll-adjustments\/(\d+)\/(submit|approve|reject)$/);
  if (scopeMatch[1] === "merchant-admin" && payrollAdjustmentActionMatch) {
    const adjustmentId = Number(payrollAdjustmentActionMatch[1]);
    const action = payrollAdjustmentActionMatch[2];
    const nextStatus: PayrollAdjustmentStatus =
      action === "approve" ? "approved" : action === "reject" ? "rejected" : "submitted";
    return {
      handled: true,
      data: clone(
        transitionStaticPayrollAdjustment(adjustmentId, nextStatus, readBodyRecord(options))
      ) as TData
    };
  }

  const payRunActionMatch = suffix.match(/^\/pay-runs\/(\d+)(?:\/(recalculate|publish|approve|lock))?$/);
  if (scopeMatch[1] === "merchant-admin" && payRunActionMatch) {
    const payRunId = Number(payRunActionMatch[1]);
    const action = payRunActionMatch[2];
    if (!action) {
      return { handled: true, data: clone(staticPayRuns.get(payRunId) ?? staticPayRunPayload()) as TData };
    }
    const nextStatus: PayRunStatus =
      action === "publish"
        ? "published"
        : action === "approve"
          ? "approved"
          : action === "lock"
            ? "locked"
            : "draft";
    return { handled: true, data: clone(transitionStaticPayRun(payRunId, nextStatus)) as TData };
  }

  const merchantPayoutMatch = suffix.match(/^\/payslips\/(\d+)\/payout-records$/);
  if (scopeMatch[1] === "merchant-admin" && merchantPayoutMatch && options.method === "POST") {
    return {
      handled: true,
      data: clone(recordStaticPayout(Number(merchantPayoutMatch[1]), readBodyRecord(options))) as TData
    };
  }

  const merchantDisputeResolveMatch = suffix.match(/^\/payslips\/(\d+)\/resolve-dispute$/);
  if (
    scopeMatch[1] === "merchant-admin" &&
    merchantDisputeResolveMatch &&
    options.method === "POST"
  ) {
    return {
      handled: true,
      data: clone(
        resolveStaticPayslipDispute(
          Number(merchantDisputeResolveMatch[1]),
          readBodyRecord(options)
        )
      ) as TData
    };
  }

  if (scopeMatch[1] === "technician" && suffix === "/payslips") {
    const payRun = staticPayRunPayload("published");
    const payload: PayrollListPayload<PayslipPayload> = {
      list: payRun.payslips,
      total: payRun.payslips.length,
      page: 1,
      page_size: 20
    };

    return { handled: true, data: clone(payload) as TData };
  }

  if (scopeMatch[1] === "technician" && suffix === "/payslips/export") {
    return { handled: true, data: clone(staticPayslipCsvExport()) as TData };
  }

  const technicianPayoutConfirmMatch = suffix.match(
    /^\/payslips\/(\d+)\/payout-records\/(\d+)\/confirm$/
  );
  if (
    scopeMatch[1] === "technician" &&
    technicianPayoutConfirmMatch &&
    options.method === "POST"
  ) {
    return {
      handled: true,
      data: clone(
        confirmStaticPayoutRecord(
          Number(technicianPayoutConfirmMatch[1]),
          Number(technicianPayoutConfirmMatch[2])
        )
      ) as TData
    };
  }

  const technicianPayslipMatch = suffix.match(/^\/payslips\/(\d+)(?:\/(confirm|dispute))?$/);
  if (scopeMatch[1] === "technician" && technicianPayslipMatch) {
    const payslipId = Number(technicianPayslipMatch[1]);
    const action = technicianPayslipMatch[2];

    if (action === "confirm") {
      return { handled: true, data: clone(confirmStaticPayslip(payslipId)) as TData };
    }
    if (action === "dispute") {
      return {
        handled: true,
        data: clone(reportStaticPayslipDispute(payslipId, readBodyRecord(options))) as TData
      };
    }

    return { handled: true, data: clone(findStaticPayslip(payslipId)) as TData };
  }

  const orderFinanceMatch = suffix.match(/^\/finance\/orders\/(\d+)(\/service-income-report)?$/);
  if (orderFinanceMatch) {
    const bookingOrderId = Number(orderFinanceMatch[1]);
    const isReport = Boolean(orderFinanceMatch[2]);

    if (scopeMatch[1] === "merchant-admin" && isReport && options.method === "PUT") {
      return {
        handled: true,
        data: clone(reportStaticServiceIncome(bookingOrderId, readBodyRecord(options))) as TData
      };
    }

    if (!isReport) {
      return { handled: true, data: clone(staticOrderFinanceDetail(bookingOrderId)) as TData };
    }
  }

  const financeRulesMatch = suffix.match(/^\/shops\/(\d+)\/finance\/rules(\/preview)?$/);
  if (scopeMatch[1] === "merchant-admin" && financeRulesMatch) {
    const shopId = Number(financeRulesMatch[1]);
    const isPreview = Boolean(financeRulesMatch[2]);

    if (isPreview) {
      const body = readBodyRecord(options);
      return {
        handled: true,
        data: clone(
          previewStaticShopFinanceRule(shopId, {
            serviceAmountJpy: readBodyNumber(body, "serviceAmountJpy", 8800),
            platformFeeNdp: readBodyNumber(body, "platformFeeNdp", 500),
            workedMinutes: readBodyNumber(body, "workedMinutes", 60),
            monthlyCompletedOrders: readBodyNumber(body, "monthlyCompletedOrders", 101),
            monthlyServiceGmvJpy: readBodyNumber(body, "monthlyServiceGmvJpy", 900_000),
            ratingAverage: readBodyNumber(body, "ratingAverage", 4.8),
            lateCancellationCount: readBodyNumber(body, "lateCancellationCount", 0)
          })
        ) as TData
      };
    }

    if (options.method === "PUT") {
      return {
        handled: true,
        data: clone(
          updateStaticShopFinanceRuleSet(
            shopId,
            readStaticShopFinanceRuleInput(shopId, readBodyRecord(options))
          )
        ) as TData
      };
    }

    return { handled: true, data: clone(getStaticShopFinanceRuleSet(shopId)) as TData };
  }

  const compensationProfileMatch = suffix.match(
    /^\/shops\/(\d+)\/technicians\/(\d+)\/compensation-profile(\/preview)?$/
  );
  if (scopeMatch[1] === "merchant-admin" && compensationProfileMatch) {
    const shopId = Number(compensationProfileMatch[1]);
    const technicianProfileId = Number(compensationProfileMatch[2]);
    const isPreview = Boolean(compensationProfileMatch[3]);

    if (isPreview) {
      const body = readBodyRecord(options);
      return {
        handled: true,
        data: clone(
          previewStaticCompensationProfile(shopId, technicianProfileId, {
            serviceAmountJpy: readBodyNumber(body, "serviceAmountJpy", 8800),
            platformFeeNdp: readBodyNumber(body, "platformFeeNdp", 500),
            workedMinutes: readBodyNumber(body, "workedMinutes", 60),
            monthlyCompletedOrders: readBodyNumber(body, "monthlyCompletedOrders", 101),
            monthlyServiceGmvJpy: readBodyNumber(body, "monthlyServiceGmvJpy", 900_000),
            ratingAverage: readBodyNumber(body, "ratingAverage", 4.8),
            lateCancellationCount: readBodyNumber(body, "lateCancellationCount", 0)
          })
        ) as TData
      };
    }

    if (options.method === "PUT") {
      return {
        handled: true,
        data: clone(
          updateStaticTechnicianCompensationProfile(
            shopId,
            technicianProfileId,
            readStaticCompensationProfileInput(shopId, technicianProfileId, readBodyRecord(options))
          )
        ) as TData
      };
    }

    return {
      handled: true,
      data: clone(getStaticTechnicianCompensationProfile(shopId, technicianProfileId)) as TData
    };
  }

  if (suffix === "/finance/settlements") {
    return { handled: true, data: clone(backofficeList(settlements.map((_, index) => financeSettlementPayload(index)), options)) as TData };
  }

  if (suffix === "/finance/settlements/export") {
    const exportPayload: CsvExportPayload = {
      filename: "needo-static-demo-settlements.csv",
      contentType: "text/csv; charset=utf-8",
      content: "transaction_no,status,amount\nSTATIC-TXN-0001,pending,0\n"
    };

    return { handled: true, data: clone(exportPayload) as TData };
  }

  if (suffix === "/technicians") {
    return { handled: true, data: clone(backofficeList(technicians.map((_, index) => technicianPayload(index)), options)) as TData };
  }

  if (suffix === "/shops" || suffix === "/shop") {
    return { handled: true, data: clone(backofficeList(stores.map((_, index) => shopPayload(index)), options)) as TData };
  }

  return { handled: false };
}

function bookingOrder(index: number, patch: Partial<BookingOrder> = {}): BookingOrder {
  const order = orders[index % orders.length] ?? orders[0]!;
  const service = services[index % services.length] ?? services[0]!;
  const store = stores[index % stores.length] ?? stores[0]!;
  const technician = technicians[index % technicians.length] ?? technicians[0]!;

  return {
    id: index + 1,
    orderNo: order.orderNo,
    orderType: "booking",
    status: order.status === "scheduled" || order.status === "unpaid" || order.status === "refunding" || order.status === "refunded"
      ? "pending"
      : order.status,
    paymentStatus: "unpaid",
    customerUserId: numberFromText(order.customerId, 1),
    serviceId: index + 1,
    technicianServiceId: null,
    shopId: numberFromText(store.id, index + 1),
    technicianProfileId: numberFromText(technician.id, index + 1),
    scheduleSlotId: index + 1,
    fulfillmentMode: order.mode,
    serviceName: service.name,
    pricingModeSnapshot: "merchant",
    serviceOwnerType: "shop",
    serviceOwnerId: index + 1,
    serviceNameSnapshot: service.name,
    servicePriceSnapshot: service.priceFrom.toFixed(2),
    serviceDurationSnapshot: service.packages[0]?.durationMinutes ?? 60,
    serviceSnapshot: null,
    shopName: store.name,
    technicianName: technician.name,
    priceAmount: service.priceFrom.toFixed(2),
    currency: "JPY",
    startsAt: staticTimestamp,
    endsAt: staticTimestamp,
    note: order.remark ?? null,
    cancelReason: null,
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp,
    statusHistory: [
      {
        id: 1,
        orderId: index + 1,
        fromStatus: null,
        toStatus: "pending",
        actorUserId: 1,
        reason: "static-demo",
        createdAt: staticTimestamp
      }
    ],
    ...patch
  };
}

function bookingSlot(index: number): BookingScheduleSlot {
  const service = services[index % services.length] ?? services[0]!;
  const store = stores[index % stores.length] ?? stores[0]!;
  const technician = technicians[index % technicians.length] ?? technicians[0]!;

  return {
    id: index + 1,
    serviceId: index + 1,
    technicianServiceId: null,
    shopId: numberFromText(store.id, index + 1),
    technicianProfileId: numberFromText(technician.id, index + 1),
    startsAt: staticTimestamp,
    endsAt: staticTimestamp,
    capacity: 1,
    bookedCount: 0,
    status: "available",
    serviceName: service.name,
    shopName: store.name,
    technicianName: technician.name,
    priceAmount: service.priceFrom.toFixed(2),
    currency: "JPY",
    durationMinutes: service.packages[0]?.durationMinutes ?? 60
  };
}

function bookingPage<TItem>(list: TItem[], options: HttpClientRequestOptions): PaginatedBookingData<TItem> {
  return paginate(list, options);
}

function handleBooking<TData>(path: string, options: HttpClientRequestOptions): StaticDemoResult<TData> {
  if (path === "/schedule/availability") {
    return { handled: true, data: clone(bookingPage(services.slice(0, 8).map((_, index) => bookingSlot(index)), options)) as TData };
  }

  if (path === "/bookings") {
    return { handled: true, data: clone(bookingOrder(0)) as TData };
  }

  if (path === "/orders") {
    return { handled: true, data: clone(bookingPage(orders.map((_, index) => bookingOrder(index)), options)) as TData };
  }

  const orderAction = path.match(/^\/orders\/(\d+)(?:\/(confirm|cancel|start|complete))?$/);
  if (orderAction) {
    const id = Number(orderAction[1]);
    const action = orderAction[2];
    const status = action === "confirm"
      ? "confirmed"
      : action === "cancel"
        ? "cancelled"
        : action === "start"
          ? "inService"
          : action === "complete"
            ? "completed"
            : undefined;

    return { handled: true, data: clone(bookingOrder(Math.max(0, id - 1), status ? { status } : {})) as TData };
  }

  return { handled: false };
}

function handleCoreRead<TData>(path: string, options: HttpClientRequestOptions): StaticDemoResult<TData> {
  if (path === "/categories") {
    return { handled: true, data: clone(paginate(staticCoreCategories, options)) as TData };
  }

  const pricingModeMatch = path.match(/^\/shops\/(\d+)\/pricing-mode$/);
  if (pricingModeMatch) {
    const shopId = Number(pricingModeMatch[1]);
    const current = getStaticShopPricingMode(shopId);
    const body = options.body as { pricingMode?: "merchant" | "technician"; technicianPricingRatePercent?: number } | undefined;
    const next = {
      pricingMode: body?.pricingMode ?? current.pricingMode,
      technicianPricingRatePercent: normalizeStaticTechnicianPricingRatePercent(
        body?.technicianPricingRatePercent ?? current.technicianPricingRatePercent
      ),
      updatedAt: new Date().toISOString()
    };
    staticShopPricingModes.set(shopId, next);
    return {
      handled: true,
      data: clone({
        shopId,
        ...next,
        updatedBy: 1
      }) as TData
    };
  }

  const bookingNavigationMatch = path.match(/^\/shops\/(\d+)\/booking-navigation$/);
  if (bookingNavigationMatch) {
    const shopId = Number(bookingNavigationMatch[1]);
    const pricingMode = getStaticShopPricingMode(shopId);
    const serviceNavigation = paginate(services.slice(0, 6).map((_, index) => ({
      id: index + 1,
      name: services[index]?.name ?? "服务",
      priceAmount: String(services[index]?.priceFrom ?? 0),
      currency: "JPY",
      durationMinutes: services[index]?.packages[0]?.durationMinutes ?? 60,
      coverUrl: services[index]?.cover ?? null
    })), options);
    const technicianNavigation = paginate(technicians.slice(0, 6).map((technician, index) => ({
      id: index + 1,
      displayName: technician.name,
      city: technician.serviceAreas[0] ?? "东京",
      avatarUrl: technician.avatar,
      reviewSummary: null
    })), options);
    return {
      handled: true,
      data: clone({
        shopId,
        pricingMode: pricingMode.pricingMode,
        technicianPricingRatePercent: pricingMode.technicianPricingRatePercent,
        ...(pricingMode.pricingMode === "technician"
          ? { entry: "technician_list", technicians: technicianNavigation }
          : { entry: "service_menu", services: serviceNavigation })
      }) as TData
    };
  }

  const publicTechnicianServicesMatch = path.match(/^\/shops\/(\d+)\/technicians\/(\d+)\/services$/);
  if (publicTechnicianServicesMatch || path.match(/^\/technicians\/me\/shops\/(\d+)\/services(?:\/\d+)?$/)) {
    const shopId = Number(publicTechnicianServicesMatch?.[1] ?? 1);
    const technician = technicians[(Number(publicTechnicianServicesMatch?.[2] ?? 1) - 1) % technicians.length] ?? technicians[0]!;
    const service = services[0]!;
    const pricingMode = getStaticShopPricingMode(shopId);
    const publicPriceAmount = publicTechnicianServicesMatch && pricingMode.pricingMode === "technician"
      ? Math.round((service.priceFrom * pricingMode.technicianPricingRatePercent) / 100)
      : service.priceFrom;
    const list = [
      {
        id: 1,
        shopId,
        technicianId: Number(publicTechnicianServicesMatch?.[2] ?? 1),
        sourceShopServiceId: null,
        name: service.name,
        description: `${technician.name} · ${service.summary}`,
        categoryId: 1,
        priceAmount: publicPriceAmount,
        currency: "JPY",
        durationMinutes: service.packages[0]?.durationMinutes ?? 60,
        coverImageUrl: service.cover,
        images: [service.cover],
        tags: technician.skills.slice(0, 3),
        isActive: true,
        isBookable: true,
        isRecommended: true,
        sortOrder: 0,
        reviewStatus: "approved",
        rejectionReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    if ((options.method ?? "GET") === "GET") {
      return { handled: true, data: clone(paginate(list, options)) as TData };
    }

    return { handled: true, data: clone(list[0]) as TData };
  }

  if (path === "/services" || path === "/search") {
    return { handled: true, data: clone(paginate(filteredServices(options), options)) as TData };
  }

  if (path === "/home/recommendations") {
    const limit = readNumberQuery(options, "limit", 20);
    const data: CoreHomeRecommendations = {
      categories: staticCoreCategories.slice(0, 10),
      services: services.slice(0, limit).map((_, index) => serviceCard(index)),
      shops: stores.slice(0, Math.min(8, limit)).map((_, index) => shopCard(index)),
      technicians: technicians.slice(0, Math.min(8, limit)).map((_, index) => technicianCard(index))
    };

    return { handled: true, data: clone(data) as TData };
  }

  const serviceMatch = path.match(/^\/services\/(\d+)$/);
  if (serviceMatch) {
    return { handled: true, data: clone(serviceDetail(Number(serviceMatch[1]))) as TData };
  }

  const shopMatch = path.match(/^\/shops\/(\d+)$/);
  if (shopMatch) {
    return { handled: true, data: clone(shopDetail(Number(shopMatch[1]))) as TData };
  }

  const technicianMatch = path.match(/^\/technicians\/(\d+)$/);
  if (technicianMatch) {
    return { handled: true, data: clone(technicianDetail(Number(technicianMatch[1]))) as TData };
  }

  const customerMatch = path.match(/^\/profiles\/customers\/(\d+)$/);
  if (customerMatch) {
    return { handled: true, data: clone(customerProfile(Number(customerMatch[1]))) as TData };
  }

  return { handled: false };
}

function emptyStaticFallback<TData>(path: string, options: HttpClientRequestOptions): TData {
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");

  if (method === "GET" && /s$/.test(path.split("/").pop() ?? "")) {
    return paginate([], options) as TData;
  }

  return {} as TData;
}

export async function resolveStaticDemoRequest<TData>(
  rawPath: string,
  options: HttpClientRequestOptions
): Promise<StaticDemoResult<TData>> {
  if (!isStaticDemoMode()) {
    return { handled: false };
  }

  const path = normalizePath(rawPath);

  if (["/auth/login", "/login", "/auth/otp/verify"].includes(path)) {
    return {
      handled: true,
      data: clone({
        accessToken: staticAccessToken,
        refreshToken: staticRefreshToken,
        expiresIn: 900,
        me: staticAuthMe
      }) as TData
    };
  }

  if (path === "/auth/refresh") {
    return { handled: true, data: clone({ accessToken: staticAccessToken, expiresIn: 900 }) as TData };
  }

  if (path === "/auth/logout") {
    return { handled: true, data: {} as TData };
  }

  if (path === "/auth/me") {
    return { handled: true, data: clone(staticAuthMe) as TData };
  }

  if (path === "/auth/otp/send") {
    return { handled: true, data: clone({ expiresIn: 600, cooldownSeconds: 60 }) as TData };
  }

  const userManagement = handleUserManagement<TData>(path, options);
  if (userManagement.handled) {
    return userManagement;
  }

  const coreRead = handleCoreRead<TData>(path, options);
  if (coreRead.handled) {
    return coreRead;
  }

  const booking = handleBooking<TData>(path, options);
  if (booking.handled) {
    return booking;
  }

  const backoffice = handleBackoffice<TData>(path, options);
  if (backoffice.handled) {
    return backoffice;
  }

  return { handled: true, data: clone(emptyStaticFallback<TData>(path, options)) };
}

export function resolveStaticDemoDataUrl(rawPath: string): StaticDemoResult<string> {
  if (!isStaticDemoMode()) {
    return { handled: false };
  }

  const path = normalizePath(rawPath);
  const label = path.includes("captcha") ? "NeeDo static demo" : "NeeDo static asset";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="64" viewBox="0 0 180 64"><rect width="180" height="64" rx="12" fill="#162118"/><text x="90" y="39" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700" fill="#d8c27a">${label}</text></svg>`;

  return { handled: true, data: `data:image/svg+xml;base64,${globalThis.btoa(svg)}` };
}

function actorIdFromPath(path: string) {
  const url = new URL(path, "http://static-demo.local");

  return url.searchParams.get("actorId") || "needo:static:demo";
}

function googleStatus(actorId: string): GoogleAccountConnectionStatus & GoogleCalendarConnectionStatus {
  return {
    ok: true,
    actorId,
    configured: false,
    connected: false,
    message: "static_demo.google_unconfigured",
    redirectUri: undefined,
    scopes: [],
    profile: null
  };
}

export function resolveStaticDemoGoogleAccountApi<TData>(path: string): StaticDemoResult<TData> {
  if (!isStaticDemoMode()) {
    return { handled: false };
  }

  const actorId = actorIdFromPath(path);
  const status = googleStatus(actorId);

  if (normalizePath(path) === "/api/google-account/auth-url") {
    return { handled: true, data: { ...status, authUrl: "#static-demo-google-account" } as TData };
  }

  return { handled: true, data: status as TData };
}

async function parseRequestJson(init: RequestInit = {}) {
  if (typeof init.body === "string") {
    try {
      return JSON.parse(init.body) as unknown;
    } catch {
      return null;
    }
  }

  return null;
}

export async function resolveStaticDemoGoogleCalendarApi<TData>(
  path: string,
  init: RequestInit = {}
): Promise<StaticDemoResult<TData>> {
  if (!isStaticDemoMode()) {
    return { handled: false };
  }

  const normalizedPath = normalizePath(path);
  const actorId = actorIdFromPath(path);
  const status = googleStatus(actorId);

  if (normalizedPath === "/api/google-calendar/auth-url") {
    return { handled: true, data: { ...status, authUrl: "#static-demo-google-calendar" } as TData };
  }

  if (normalizedPath === "/api/google-calendar/export") {
    const body = await parseRequestJson(init) as { events?: unknown[] } | null;
    const data: GoogleCalendarApiExportResponse = {
      ok: true,
      count: Array.isArray(body?.events) ? body.events.length : 0,
      message: "static_demo.exported_locally"
    };

    return { handled: true, data: data as TData };
  }

  if (normalizedPath === "/api/google-calendar/import") {
    const data: GoogleCalendarApiImportResponse<unknown> = {
      ok: true,
      count: 0,
      message: "static_demo.no_remote_calendar",
      events: []
    };

    return { handled: true, data: data as TData };
  }

  return { handled: true, data: status as TData };
}

export function createStaticDemoPlanCategoryTranslations<TLocale extends string>(
  locales: TLocale[],
  sourceText: string
) {
  return Object.fromEntries(locales.map((locale) => [locale, sourceText])) as Partial<Record<TLocale, string>>;
}

function responseJson(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status
  });
}

async function resolveStaticDemoFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url, window.location.origin);

  if (url.pathname.startsWith("/api/im")) {
    return null;
  }

  if (url.pathname === "/api/translate") {
    const body = await parseRequestJson(init) as { targets?: string[]; text?: string } | null;
    const targets = body?.targets ?? ["ja", "en", "ko", "zh-Hant", "zh"];
    const text = body?.text ?? "";

    return responseJson({ translations: createStaticDemoPlanCategoryTranslations(targets, text) });
  }

  if (url.pathname.startsWith("/api/google-account")) {
    const result = resolveStaticDemoGoogleAccountApi(url.toString());
    return result.handled ? responseJson(result.data) : null;
  }

  if (url.pathname.startsWith("/api/google-calendar")) {
    const result = await resolveStaticDemoGoogleCalendarApi(url.toString(), init);
    return result.handled ? responseJson(result.data) : null;
  }

  if (url.pathname.startsWith("/api/v1")) {
    const result = await resolveStaticDemoRequest(url.pathname.replace(/^\/api\/v1/, "") || "/", {
      body: init?.body,
      method: (init?.method as HttpClientRequestOptions["method"]) ?? "GET"
    });

    return result.handled ? responseJson({ code: 0, message: "success", data: result.data }) : null;
  }

  if (url.hostname.endsWith("googleapis.com")) {
    return responseJson([[[url.searchParams.get("q") ?? ""]]]);
  }

  if (url.pathname.startsWith("/api/")) {
    return responseJson({ ok: true, message: "static_demo.local_response" });
  }

  return null;
}

let staticDemoFetchGuardInstalled = false;

export function installStaticDemoFetchGuard() {
  if (!isStaticDemoMode() || typeof window === "undefined" || staticDemoFetchGuardInstalled) {
    return;
  }

  const originalFetch = window.fetch.bind(window);
  staticDemoFetchGuardInstalled = true;
  document.documentElement.dataset.needoStaticDemo = "true";

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await resolveStaticDemoFetch(input, init);

    return response ?? originalFetch(input, init);
  }) as typeof window.fetch;
}
