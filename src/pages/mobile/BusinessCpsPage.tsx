import { createContext, useContext, useEffect, useMemo, useState, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AppIcon } from "../../components/client-ui/AppScaffold";
import { businessNavItems } from "../../components/mobile/businessNavItems";
import { FloatingHomeHeader } from "../../components/mobile/FloatingHomeHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { SharedHomeHeader } from "../../components/mobile/SharedHomeHeader";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import {
  businessCpsAttributionRecords,
  businessCpsCampaigns,
  businessCpsCommissionRecords,
  businessCpsMaterials,
  businessCpsMobileTasks,
  businessCpsPromoterTeamNodes,
  businessCpsPromoters,
  businessCpsPromotionCodes,
  businessCpsPromotionLinks,
  businessCpsQrCodes,
  businessCpsRiskEvents,
  businessCpsRiskRules,
  businessCpsSettlementBatches,
  campaignStatusLabels,
  campaignTypeLabels,
  carrierStatusLabels,
  commissionBasisLabels,
  createInitialPlanWizardFlatRatePayoutDraft,
  commissionStatusLabels,
  getPlanWizardCopy,
  getBudgetUsage,
  getCampaignById,
  getChannelById,
  getMaterialById,
  getBusinessCpsTeamNodeCommissionProfile,
  getPromoterById,
  getPromoterChildren,
  getPromoterPermission,
  getPromotionLinkById,
  merchantLeadStatusLabels,
  planWizardFlatRatePayoutItems,
  planWizardFlatRatePeriodOptions,
  planWizardPayoutValueModeOptions,
  planWizardSteps,
  settlementBatchStatusLabels,
  sponsorLabels,
  translatePlanCategoryDraft,
  type BusinessCpsBudgetMode,
  type BusinessCpsCampaign,
  type BusinessCpsCommissionBasis,
  type BusinessCpsMaterial,
  type BusinessCpsPromoter,
  type BusinessCpsRole,
  type PlanWizardFlatRatePayoutDraft,
  type PlanWizardFlatRatePayoutKey,
  type PlanWizardFlatRatePeriodKey,
  type PlanWizardLocale,
  type PlanWizardLocalizedText,
  type PlanWizardPayoutValueMode,
} from "../../features/business-cps/model";
import {
  applyCreateSubPromoter,
  applyUpdatePromoter,
  buildBusinessCpsDashboard,
  businessCpsRuntimeStorageKey,
  createInitialBusinessCpsState,
  legacyBusinessCpsRuntimeStorageKey,
  normalizeBusinessCpsRuntimeState,
  validatePromotionLink,
  type BusinessCpsPromoterUpdateInput,
  type BusinessCpsRuntimeState,
  type BusinessCpsSubPromoterInput
} from "../../features/business-cps/logic";
import { parseBrowserStorageJson, writeBrowserStorage } from "../../lib/browserStorage";
import { cn, percent, yen } from "../../lib/utils";
import { useI18n } from "../../i18n/I18nProvider";

type PartnerModule = "home" | "plan" | "data" | "organization" | "me";
type PlanTab = "settings" | "links" | "materials";
type DataTab = "monitor" | "risk";
type OrganizationTab = "performance" | "settings";
type MeTab = "income" | "settlement";

type PartnerNavItem = {
  id: string;
  label: string;
  to: string;
};

const partnerNavItems: PartnerNavItem[] = [
  { id: "plan-settings", label: "方案设定", to: "/afirieito/plan?tab=settings" },
  { id: "plan-links", label: "链接 / 邀请码 / QR", to: "/afirieito/plan?tab=links" },
  { id: "plan-materials", label: "素材中心", to: "/afirieito/plan?tab=materials" },
  { id: "data-monitor", label: "数据监控", to: "/afirieito/data?tab=monitor" },
  { id: "data-risk", label: "防作弊中心", to: "/afirieito/data?tab=risk" },
  { id: "org-performance", label: "组织表现", to: "/afirieito/organization?tab=performance" },
  { id: "org-settings", label: "组织设定", to: "/afirieito/organization?tab=settings" },
  { id: "me-income", label: "收益", to: "/afirieito/me?tab=income" },
  { id: "me-settlement", label: "资金结算", to: "/afirieito/me?tab=settlement" }
];

const runtimeState = createInitialBusinessCpsState();
const dashboard = buildBusinessCpsDashboard(runtimeState);
const currentPromoter = businessCpsPromoters[0];

type BusinessCpsMobileNotice = {
  tone: "success" | "warning" | "error";
  message: string;
} | null;

type BusinessCpsMobileRuntimeContextValue = {
  state: BusinessCpsRuntimeState;
  dashboard: ReturnType<typeof buildBusinessCpsDashboard>;
  notice: BusinessCpsMobileNotice;
  onCreateSubPromoter: (input: BusinessCpsSubPromoterInput) => void;
  onUpdatePromoter: (input: BusinessCpsPromoterUpdateInput) => void;
};

type MobilePromoterEditorMode =
  | { type: "create"; parentPromoterId?: string }
  | { type: "edit"; promoterId: string };

const BusinessCpsMobileRuntimeContext = createContext<BusinessCpsMobileRuntimeContextValue | null>(null);

function readInitialBusinessCpsMobileState() {
  const stored = parseBrowserStorageJson<Partial<BusinessCpsRuntimeState> | null>(businessCpsRuntimeStorageKey, null, { removeOnError: true, silent: true });
  const legacyStored = parseBrowserStorageJson<Partial<BusinessCpsRuntimeState> | null>(legacyBusinessCpsRuntimeStorageKey, null, { removeOnError: true, silent: true });

  return normalizeBusinessCpsRuntimeState(stored ?? legacyStored ?? {});
}

function useBusinessCpsMobileRuntime() {
  const context = useContext(BusinessCpsMobileRuntimeContext);

  if (!context) {
    throw new Error("BusinessCpsMobileRuntimeContext is missing");
  }

  return context;
}

const permissionLabels: Record<string, string> = {
  canCreateLink: "创建链接",
  canCreateCode: "创建推广码",
  canCreateQr: "生成 QR",
  canCreateSubPromoter: "添加下级",
  canViewSubData: "查看组织",
  canViewCommission: "查看佣金",
  canWithdraw: "提现",
  canUploadMaterial: "上传素材"
};

function getActiveModule(pathname: string): PartnerModule {
  if (pathname.startsWith("/afirieito/plan") || pathname.startsWith("/afirieito/promotions") || pathname.startsWith("/afirieito/links") || pathname.startsWith("/afirieito/materials")) return "plan";
  if (pathname.startsWith("/afirieito/data") || pathname.startsWith("/afirieito/reporting") || pathname.startsWith("/afirieito/risk")) return "data";
  if (pathname.startsWith("/afirieito/organization") || pathname.startsWith("/afirieito/team") || pathname.startsWith("/afirieito/referrals")) return "organization";
  if (pathname.startsWith("/afirieito/me") || pathname.startsWith("/afirieito/earnings") || pathname.startsWith("/afirieito/settlement")) return "me";
  if (pathname.startsWith("/afirieito/more")) return "home";

  return "home";
}

function getQueryTab(search: string) {
  return new URLSearchParams(search).get("tab");
}

function getPlanTab(pathname: string, search: string): PlanTab {
  const tab = getQueryTab(search);

  if (tab === "links" || pathname.startsWith("/afirieito/links")) return "links";
  if (tab === "materials" || pathname.startsWith("/afirieito/materials")) return "materials";

  return "settings";
}

function getDataTab(pathname: string, search: string): DataTab {
  const tab = getQueryTab(search);

  if (tab === "risk" || pathname.startsWith("/afirieito/risk")) return "risk";

  return "monitor";
}

function getOrganizationTab(pathname: string, search: string): OrganizationTab {
  const tab = getQueryTab(search);

  if (tab === "settings") return "settings";

  return "performance";
}

function getMeTab(pathname: string, search: string): MeTab {
  const tab = getQueryTab(search);

  if (tab === "settlement" || pathname.startsWith("/afirieito/settlement")) return "settlement";

  return "income";
}

function PageTitle(_: {
  title: string;
  subtitle: string;
}) {
  return null;
}

function PartnerPanel({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("business-cps-surface min-w-0 rounded-[24px] p-4 md:p-6", className)}>{children}</section>;
}

function MiniMetricChart({
  points,
  tone = "green",
  unit = "",
  markerLabel = "今日"
}: {
  points: number[];
  tone?: "green" | "red" | "orange" | "default";
  unit?: string;
  markerLabel?: string;
}) {
  const width = 240;
  const height = 108;
  const chart = {
    left: 34,
    right: 12,
    top: 16,
    bottom: 24
  };
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(1, max - min);
  const lastPoint = points[points.length - 1] ?? 0;
  const firstPoint = points[0] ?? lastPoint;
  const delta = firstPoint === 0 ? 0 : ((lastPoint - firstPoint) / firstPoint) * 100;
  const ticks = [max, min + range / 2, min];
  const formatTick = (value: number) => {
    if (unit === "¥") {
      if (value >= 10000) return `${Math.round(value / 10000)}万`;
      if (value >= 1000) return `${Math.round(value / 1000)}k`;
    }

    if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;

    return Math.round(value).toString();
  };
  const getX = (index: number) => chart.left + (index / Math.max(1, points.length - 1)) * (width - chart.left - chart.right);
  const getY = (point: number) => height - chart.bottom - ((point - min) / range) * (height - chart.top - chart.bottom);
  const linePoints = points
    .map((point, index) => {
      return `${getX(index).toFixed(1)},${getY(point).toFixed(1)}`;
    })
    .join(" ");
  const baselineY = height - chart.bottom;
  const lastX = getX(points.length - 1);
  const lastY = getY(lastPoint);
  const areaPoints = `${chart.left},${baselineY} ${linePoints} ${width - chart.right},${baselineY}`;
  const toneClassName = {
    green: "business-cps-accent",
    red: "business-cps-risk-text",
    orange: "text-[color:var(--client-warning-text)]",
    default: "business-cps-muted"
  }[tone];

  return (
    <div className={cn("business-cps-chart mt-3 overflow-hidden border", toneClassName)}>
      <svg aria-hidden="true" className="h-full w-full" preserveAspectRatio="xMidYMid meet" viewBox={`0 0 ${width} ${height}`}>
        {ticks.map((tick) => {
          const y = getY(tick);

          return (
            <g key={tick.toFixed(2)}>
              <line className="business-cps-chart-grid" x1={chart.left} x2={width - chart.right} y1={y} y2={y} />
              <text className="business-cps-chart-scale" dominantBaseline="middle" x="4" y={y}>{formatTick(tick)}</text>
            </g>
          );
        })}
        <line className="business-cps-chart-axis" x1={chart.left} x2={chart.left} y1={chart.top} y2={baselineY} />
        <line className="business-cps-chart-axis" x1={chart.left} x2={width - chart.right} y1={baselineY} y2={baselineY} />
        <polygon fill="currentColor" opacity="0.12" points={areaPoints} />
        <polyline fill="none" points={linePoints} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        <circle cx={lastX} cy={lastY} fill="currentColor" r="4" vectorEffect="non-scaling-stroke" />
        <text className="business-cps-chart-marker" textAnchor="end" x={Math.min(width - 8, lastX)} y={Math.max(12, lastY - 8)}>{markerLabel}</text>
        <text className="business-cps-chart-scale" textAnchor="start" x={chart.left} y={height - 5}>D-6</text>
        <text className="business-cps-chart-scale" textAnchor="end" x={width - chart.right} y={height - 5}>今日</text>
      </svg>
      <span className="business-cps-chart-caption">7日 {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%</span>
    </div>
  );
}

function PartnerMetric({
  label,
  value,
  tone = "green",
  series,
  unit
}: {
  label: string;
  value: string;
  tone?: "green" | "red" | "orange" | "default";
  series?: number[];
  unit?: string;
}) {
  const toneClassName = {
    green: "business-cps-accent",
    red: "business-cps-risk-text",
    orange: "text-[color:var(--client-warning-text)]",
    default: "business-cps-title"
  }[tone];

  return (
    <article className="business-cps-metric rounded-[18px] px-2.5 py-3 md:px-4 md:py-4">
      <p className="business-cps-muted text-[11px] font-black md:text-sm">{label}</p>
      <strong className={cn("mt-1 block truncate text-[clamp(1.05rem,3.8vw,1.65rem)] font-black leading-tight", toneClassName)}>{value}</strong>
      {series ? <MiniMetricChart points={series} tone={tone} unit={unit} /> : null}
    </article>
  );
}

function GreenButton({
  children,
  className,
  ...buttonProps
}: {
  children: ReactNode;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...buttonProps} className={cn("business-cps-primary-action rounded-full px-5 py-2.5 text-sm font-black transition", className)} type="button">
      {children}
    </button>
  );
}

function SoftButton({
  children,
  active = false,
  className,
  ...buttonProps
}: {
  children: ReactNode;
  active?: boolean;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...buttonProps}
      className={cn(
        "rounded-full border px-5 py-2.5 text-sm font-black transition",
        active ? "business-cps-primary-action border-transparent" : "business-cps-soft-action hover:opacity-90",
        className
      )}
      type="button"
    >
      {children}
    </button>
  );
}

function SectionTabs<T extends string>({
  tabs,
  activeTab,
  onChange
}: {
  tabs: Array<{ id: T; label: string }>;
  activeTab: T;
  onChange: (tab: T) => void;
}) {
  return (
    <div className="business-cps-segmented-tabs-shell">
      <div className="business-cps-segmented-tabs grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((tab) => (
          <button
            className={cn("business-cps-segmented-tab", tab.id === activeTab && "business-cps-segmented-tab-active")}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StatusText({
  children,
  tone = "green"
}: {
  children: ReactNode;
  tone?: "green" | "orange" | "red" | "default";
}) {
  const toneClassName = {
    green: "business-cps-accent",
    orange: "text-[color:var(--client-warning-text)]",
    red: "business-cps-risk-text",
    default: "business-cps-muted"
  }[tone];

  return <span className={cn("font-black", toneClassName)}>{children}</span>;
}

type MobilePromoterFormValues = {
  name: string;
  role: BusinessCpsRole;
  roleLabel: string;
  identity: string;
  region: string;
  inviteCode: string;
  primaryChannel: string;
  status: BusinessCpsPromoter["status"];
  parentPromoterId: string;
  level: number;
  campaignId: string;
  budgetMode: BusinessCpsBudgetMode;
  budgetTotal: number;
  targetRegisters: number;
  targetActiveShops: number;
  targetFirstOrders: number;
  targetPaymentGmv: number;
  commissionConditionRuleId: string | null;
  commissionRate: number;
  commissionBasis: BusinessCpsCommissionBasis;
  commissionTiers: BusinessCpsSubPromoterInput["commissionTiers"];
  preferentialCondition: BusinessCpsSubPromoterInput["preferentialCondition"];
  downgradeCondition: BusinessCpsSubPromoterInput["downgradeCondition"];
  promotionCondition: BusinessCpsSubPromoterInput["promotionCondition"];
  releaseCondition: string;
  riskCondition: string;
  settlementDelayDays: number;
  validFrom: string;
  validTo: string;
  permissions: BusinessCpsSubPromoterInput["permissions"];
};

const mobilePromoterFieldClassName = "h-11 w-full rounded-[8px] border border-[#dbe5ef] bg-white px-3 text-sm font-semibold text-[#172234] outline-none focus:border-[#16a34a]";
const mobilePromoterTextareaClassName = "min-h-[76px] w-full rounded-[8px] border border-[#dbe5ef] bg-white px-3 py-2 text-sm font-semibold text-[#172234] outline-none focus:border-[#16a34a]";

function dateInputValue() {
  const date = new Date();
  const pad = (value: number) => value.toString().padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function cloneMobileCommissionTiers(tiers: BusinessCpsSubPromoterInput["commissionTiers"] = []) {
  return tiers.map((tier) => ({ ...tier, requirements: { ...tier.requirements } }));
}

function defaultMobilePreferentialCondition(rate: number): NonNullable<BusinessCpsSubPromoterInput["preferentialCondition"]> {
  return {
    enabled: false,
    validFrom: dateInputValue(),
    validTo: "2026-12-31",
    baseCommissionRate: rate,
    extraCommissionRate: 0,
    note: "指定时间内达到起始分成后，在阶梯比例上增加优待比例。"
  };
}

function defaultMobileDowngradeCondition(): NonNullable<BusinessCpsSubPromoterInput["downgradeCondition"]> {
  return {
    enabled: true,
    missedCycleCount: 1,
    fallbackTierLevel: 1,
    note: "未达成当前阶梯时，降到下一可结算阶梯。"
  };
}

function defaultMobilePromotionCondition(): NonNullable<BusinessCpsSubPromoterInput["promotionCondition"]> {
  return {
    enabled: false,
    consecutiveCycles: 3,
    requiredTierLevel: 3,
    targetLevel: 1,
    note: "连续多个周期达到指定阶梯后，可升级为 1级。"
  };
}

function normalizeMobilePreferentialCondition(condition: MobilePromoterFormValues["preferentialCondition"], rate: number): NonNullable<BusinessCpsSubPromoterInput["preferentialCondition"]> {
  return {
    ...defaultMobilePreferentialCondition(rate),
    ...(condition ?? {})
  };
}

function normalizeMobileDowngradeCondition(condition: MobilePromoterFormValues["downgradeCondition"]): NonNullable<BusinessCpsSubPromoterInput["downgradeCondition"]> {
  return {
    ...defaultMobileDowngradeCondition(),
    ...(condition ?? {})
  };
}

function normalizeMobilePromotionCondition(condition: MobilePromoterFormValues["promotionCondition"]): NonNullable<BusinessCpsSubPromoterInput["promotionCondition"]> {
  return {
    ...defaultMobilePromotionCondition(),
    ...(condition ?? {})
  };
}

const minimumOrganizationLevelCount = 2;

function getOrganizationLevelOptions(nodes: BusinessCpsRuntimeState["promoterTeamNodes"]) {
  const existingLevels = nodes.map((node) => node.level).filter((level) => level > 0);
  const maxLevel = Math.max(minimumOrganizationLevelCount, ...existingLevels);
  const levels = Array.from({ length: maxLevel }, (_, index) => index + 1);

  return [...levels, maxLevel + 1];
}

function buildMobilePromoterFormValues(state: BusinessCpsRuntimeState, mode: MobilePromoterEditorMode): MobilePromoterFormValues {
  const requestedParentNode = mode.type === "create" && mode.parentPromoterId ? state.promoterTeamNodes.find((node) => node.promoterId === mode.parentPromoterId) : undefined;
  const requestedLevel = mode.type === "create" ? Math.max(1, Math.floor(Number(requestedParentNode ? requestedParentNode.level + 1 : 1))) : 1;
  const defaultParentId = requestedLevel > 1
    ? state.promoterTeamNodes.find((node) =>
        node.level === requestedLevel - 1 && state.promoterPermissions.find((permission) => permission.promoterId === node.promoterId)?.canCreateSubPromoter
      )?.promoterId ?? ""
    : "";
  const parentPromoterId = requestedLevel <= 1
    ? ""
    : requestedParentNode?.level === requestedLevel - 1
      ? requestedParentNode.promoterId
      : defaultParentId;
  const parent = state.promoters.find((promoter) => promoter.id === parentPromoterId);
  const parentNode = state.promoterTeamNodes.find((node) => node.promoterId === parentPromoterId);
  const defaultPermissions: BusinessCpsSubPromoterInput["permissions"] = {
    canCreateLink: true,
    canCreateCode: true,
    canCreateQr: true,
    canCreateSubPromoter: false,
    canViewSubData: true,
    canViewCommission: true,
    canWithdraw: false,
    canUploadMaterial: false
  };

  if (mode.type === "edit") {
    const promoter = state.promoters.find((item) => item.id === mode.promoterId);
    const node = state.promoterTeamNodes.find((item) => item.promoterId === mode.promoterId);
    const permission = state.promoterPermissions.find((item) => item.promoterId === mode.promoterId);
    const profile = node ? getBusinessCpsTeamNodeCommissionProfile(node, state.commissionConditionRules) : null;
    const defaultRate = profile?.commissionTiers[0]?.commissionRate ?? node?.commissionRate ?? 8;

    return {
      name: promoter?.name ?? "",
      role: promoter?.role ?? "bd",
      roleLabel: promoter?.roleLabel ?? "下级推广者",
      identity: promoter?.identity ?? "",
      region: promoter?.region ?? "",
      inviteCode: promoter?.inviteCode ?? "",
      primaryChannel: promoter?.primaryChannel ?? "",
      status: promoter?.status ?? "active",
      parentPromoterId: node?.parentPromoterId ?? "",
      level: node?.level ?? 1,
      campaignId: node?.campaignId ?? parentNode?.campaignId ?? state.campaigns[0]?.id ?? "",
      budgetMode: node?.budgetMode ?? "inherit_parent",
      budgetTotal: node?.budgetTotal ?? 0,
      targetRegisters: node?.targetRegisters ?? 0,
      targetActiveShops: node?.targetActiveShops ?? 0,
      targetFirstOrders: node?.targetFirstOrders ?? 0,
      targetPaymentGmv: node?.targetPaymentGmv ?? 0,
      commissionConditionRuleId: node?.level === 1 ? (profile?.source === "rule" ? profile.rule.id : state.commissionConditionRules.find((rule) => rule.appliesToLevel === 1 && rule.status === "active")?.id ?? null) : node?.commissionConditionRuleId ?? null,
      commissionRate: defaultRate,
      commissionBasis: profile?.commissionBasis ?? node?.commissionBasis ?? "net_revenue",
      commissionTiers: cloneMobileCommissionTiers(profile?.commissionTiers ?? node?.commissionTiers ?? []),
      preferentialCondition: profile?.preferentialCondition ?? node?.preferentialCondition ?? defaultMobilePreferentialCondition(defaultRate),
      downgradeCondition: profile?.downgradeCondition ?? node?.downgradeCondition ?? defaultMobileDowngradeCondition(),
      promotionCondition: profile?.promotionCondition ?? node?.promotionCondition ?? defaultMobilePromotionCondition(),
      releaseCondition: profile?.releaseCondition ?? node?.releaseCondition ?? "归因订单完成支付且未退款后释放",
      riskCondition: profile?.riskCondition ?? node?.riskCondition ?? "同设备、同电话或异常 LBS 命中后冻结",
      settlementDelayDays: profile?.settlementDelayDays ?? node?.settlementDelayDays ?? 7,
      validFrom: node?.validFrom ?? dateInputValue(),
      validTo: node?.validTo ?? "2026-12-31",
      permissions: permission ? { ...permission } : defaultPermissions
    };
  }

  return {
    name: "",
    role: "bd",
    roleLabel: "下级推广者",
    identity: "",
    region: parent?.region ?? "",
    inviteCode: `SUB${Math.round(Date.now() % 100000)}`,
    primaryChannel: parent?.primaryChannel ?? "",
    status: "active",
    parentPromoterId,
    level: requestedLevel,
    campaignId: parentNode?.campaignId ?? state.campaigns[0]?.id ?? "",
    budgetMode: "inherit_parent",
    budgetTotal: 100000,
    targetRegisters: 50,
    targetActiveShops: 3,
    targetFirstOrders: 10,
    targetPaymentGmv: 300000,
    commissionConditionRuleId: requestedLevel === 1 ? state.commissionConditionRules.find((rule) => rule.appliesToLevel === 1 && rule.status === "active")?.id ?? null : null,
    commissionRate: 8,
    commissionBasis: "net_revenue",
    commissionTiers: [
      {
        id: `mobile-draft-tier-1-${Date.now()}`,
        name: "阶梯 1",
        level: 1,
        commissionRate: 8,
        requirements: {
          registrations: 50,
          activeShops: 3,
          activeShopWeeklyOrders: 5,
          firstOrders: 10,
          paymentGmv: 300000
        }
      }
    ],
    preferentialCondition: defaultMobilePreferentialCondition(8),
    downgradeCondition: defaultMobileDowngradeCondition(),
    promotionCondition: defaultMobilePromotionCondition(),
    releaseCondition: "归因用户完成支付且 7 天内无退款后释放",
    riskCondition: "同设备、同电话、异常 LBS 或重复支付命中后冻结",
    settlementDelayDays: 7,
    validFrom: dateInputValue(),
    validTo: "2026-12-31",
    permissions: defaultPermissions
  };
}

function MobilePromoterFormModal({
  mode,
  onClose
}: {
  mode: MobilePromoterEditorMode | null;
  onClose: () => void;
}) {
  const { state, onCreateSubPromoter, onUpdatePromoter } = useBusinessCpsMobileRuntime();
  const [values, setValues] = useState<MobilePromoterFormValues | null>(null);
  const organizationLevelOptions = getOrganizationLevelOptions(state.promoterTeamNodes);
  const parentOptions = (values && values.level > 1 ? state.promoterTeamNodes.filter((node) =>
    node.level === values.level - 1 && state.promoterPermissions.find((permission) => permission.promoterId === node.promoterId)?.canCreateSubPromoter
  ) : [])
    .map((node) => state.promoters.find((promoter) => promoter.id === node.promoterId))
    .filter((promoter): promoter is BusinessCpsPromoter => Boolean(promoter));

  useEffect(() => {
    if (!mode) {
      setValues(null);
      return;
    }

    setValues(buildMobilePromoterFormValues(state, mode));
  }, [mode, state]);

  if (!mode || !values) {
    return null;
  }

  const updateValue = <Key extends keyof MobilePromoterFormValues>(key: Key, value: MobilePromoterFormValues[Key]) => {
    setValues((current) => current ? { ...current, [key]: value } : current);
  };

  const updateLevel = (level: number) => {
    const normalizedLevel = Math.max(1, Math.floor(level));
    const parentNode = normalizedLevel > 1
      ? state.promoterTeamNodes.find((node) =>
          node.level === normalizedLevel - 1 && state.promoterPermissions.find((permission) => permission.promoterId === node.promoterId)?.canCreateSubPromoter
        )
      : undefined;

    setValues((current) => current
      ? {
          ...current,
          level: normalizedLevel,
          parentPromoterId: parentNode?.promoterId ?? "",
          commissionConditionRuleId: normalizedLevel === 1 ? state.commissionConditionRules.find((rule) => rule.appliesToLevel === 1 && rule.status === "active")?.id ?? null : current.commissionConditionRuleId
        }
      : current);
  };
  const submitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedCommissionRate = Number(values.commissionRate) || 0;
    const baseInput = {
      name: values.name,
      role: values.role,
      roleLabel: values.roleLabel,
      identity: values.identity,
      region: values.region,
      inviteCode: values.inviteCode,
      primaryChannel: values.primaryChannel,
      status: values.status,
      campaignId: values.campaignId,
      budgetMode: values.budgetMode,
      budgetTotal: Number(values.budgetTotal) || 0,
      targetRegisters: Number(values.targetRegisters) || 0,
      targetActiveShops: Number(values.targetActiveShops) || 0,
      targetFirstOrders: Number(values.targetFirstOrders) || 0,
      targetPaymentGmv: Number(values.targetPaymentGmv) || 0,
      commissionConditionRuleId: values.commissionConditionRuleId,
      commissionRate: normalizedCommissionRate,
      commissionBasis: values.commissionBasis,
      commissionTiers: cloneMobileCommissionTiers(values.commissionTiers),
      preferentialCondition: normalizeMobilePreferentialCondition(values.preferentialCondition, normalizedCommissionRate),
      downgradeCondition: normalizeMobileDowngradeCondition(values.downgradeCondition),
      promotionCondition: normalizeMobilePromotionCondition(values.promotionCondition),
      releaseCondition: values.releaseCondition,
      riskCondition: values.riskCondition,
      settlementDelayDays: Number(values.settlementDelayDays) || 0,
      validFrom: values.validFrom,
      validTo: values.validTo,
      permissions: values.permissions
    };

    if (mode.type === "create") {
      onCreateSubPromoter({ ...baseInput, parentPromoterId: values.level > 1 ? values.parentPromoterId : null, level: values.level });
      onClose();
      return;
    }

    onUpdatePromoter({ ...baseInput, promoterId: mode.promoterId });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/55 px-4 py-6 backdrop-blur-sm">
      <form className="mx-auto max-w-[720px] rounded-[24px] bg-white p-5 shadow-[0_28px_90px_rgba(0,0,0,0.28)]" onSubmit={submitForm}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black text-[#16a34a]">AFIRIEITO TEAM</p>
            <h2 className="mt-1 text-2xl font-black text-[#172234]">{mode.type === "edit" ? "编辑推广者" : "添加下级推广者"}</h2>
          </div>
          <button className="business-cps-soft-action h-10 w-10 rounded-full text-lg font-black" onClick={onClose} type="button">x</button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <input className={mobilePromoterFieldClassName} onChange={(event) => updateValue("name", event.target.value)} placeholder="姓名 / 组织名" value={values.name} />
          <input className={mobilePromoterFieldClassName} onChange={(event) => updateValue("inviteCode", event.target.value)} placeholder="邀请码" value={values.inviteCode} />
          <select className={mobilePromoterFieldClassName} onChange={(event) => updateValue("role", event.target.value as BusinessCpsRole)} value={values.role}>
            <option value="bd">BD / 招商推广者</option>
            <option value="creator">达人 / 内容推广者</option>
            <option value="agent">区域代理</option>
            <option value="merchant">商户自营</option>
          </select>
          <input className={mobilePromoterFieldClassName} onChange={(event) => updateValue("roleLabel", event.target.value)} placeholder="Afirieito 身份标签" value={values.roleLabel} />
          <input className={mobilePromoterFieldClassName} onChange={(event) => updateValue("region", event.target.value)} placeholder="地区" value={values.region} />
          <input className={mobilePromoterFieldClassName} onChange={(event) => updateValue("primaryChannel", event.target.value)} placeholder="默认推广渠道" value={values.primaryChannel} />
          <select className={mobilePromoterFieldClassName} disabled={mode.type === "edit"} onChange={(event) => updateLevel(Number(event.target.value))} value={values.level}>
            {organizationLevelOptions.map((level, index) => (
              <option key={level} value={level}>
                {level}级{index === organizationLevelOptions.length - 1 && !state.promoterTeamNodes.some((node) => node.level === level) ? "（新增层级）" : ""}
              </option>
            ))}
          </select>
          <select className={mobilePromoterFieldClassName} disabled={mode.type === "edit" || values.level <= 1} onChange={(event) => updateValue("parentPromoterId", event.target.value)} value={values.parentPromoterId}>
            {values.level <= 1 ? <option value="">本平台</option> : null}
            {values.level > 1 && parentOptions.length === 0 ? <option value="">请先添加上一层组织</option> : null}
            {values.level > 1 ? parentOptions.map((promoter) => <option key={promoter.id} value={promoter.id}>{promoter.name}</option>) : null}
          </select>
          <select className={mobilePromoterFieldClassName} onChange={(event) => updateValue("campaignId", event.target.value)} value={values.campaignId}>
            {state.campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
          </select>
          <input className={mobilePromoterFieldClassName} min={0} max={100} onChange={(event) => updateValue("commissionRate", Number(event.target.value))} step="0.1" type="number" value={values.commissionRate} />
          <select className={mobilePromoterFieldClassName} onChange={(event) => updateValue("commissionBasis", event.target.value as BusinessCpsCommissionBasis)} value={values.commissionBasis}>
            {Object.entries(commissionBasisLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input className={mobilePromoterFieldClassName} min={0} onChange={(event) => updateValue("budgetTotal", Number(event.target.value))} placeholder="默认预算" type="number" value={values.budgetTotal} />
          <input className={mobilePromoterFieldClassName} min={0} max={365} onChange={(event) => updateValue("settlementDelayDays", Number(event.target.value))} placeholder="结算延迟天数" type="number" value={values.settlementDelayDays} />
          <input className={mobilePromoterFieldClassName} min={0} onChange={(event) => updateValue("targetRegisters", Number(event.target.value))} placeholder="目标注册" type="number" value={values.targetRegisters} />
          <input className={mobilePromoterFieldClassName} min={0} onChange={(event) => updateValue("targetFirstOrders", Number(event.target.value))} placeholder="目标首单" type="number" value={values.targetFirstOrders} />
          <textarea className={cn(mobilePromoterTextareaClassName, "md:col-span-2")} onChange={(event) => updateValue("identity", event.target.value)} placeholder="身份说明" value={values.identity} />
          <textarea className={cn(mobilePromoterTextareaClassName, "md:col-span-2")} onChange={(event) => updateValue("releaseCondition", event.target.value)} placeholder="返佣释放条件" value={values.releaseCondition} />
          <textarea className={cn(mobilePromoterTextareaClassName, "md:col-span-2")} onChange={(event) => updateValue("riskCondition", event.target.value)} placeholder="风控冻结条件" value={values.riskCondition} />
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <SoftButton onClick={onClose}>取消</SoftButton>
          <button className="business-cps-primary-action rounded-full px-5 py-2.5 text-sm font-black transition disabled:opacity-50" disabled={mode.type === "create" && values.level > 1 && !values.parentPromoterId} type="submit">
            保存
          </button>
        </div>
      </form>
    </div>
  );
}

function BusinessCpsFloatingHeader({ onOpenMore }: { onOpenMore: () => void }) {
  return (
    <FloatingHomeHeader
      panelClassName="business-cps-header-panel rounded-none border-transparent px-4 pb-4 shadow-none backdrop-blur-none"
      spacerClassName="h-[calc(env(safe-area-inset-top)+154px)]"
      stacked
    >
      <SharedHomeHeader
        avatarAlt={currentPromoter.name}
        avatarSrc="/images/generated/profiles/ai-profile-01.jpg"
        avatarTo="/afirieito/me"
        forceLight
        locationCaption="当前服务区域"
        locationLabel={`东京 / ${currentPromoter.region} / 麻布十番`}
        settingsLabel="系统设置"
        settingsTo="/afirieito/settings"
      />

      <button
        className="focus-ring flex h-12 items-center gap-3 rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] px-3 text-left text-[color:var(--client-text)] shadow-[0_12px_30px_rgba(0,0,0,0.07)]"
        onClick={onOpenMore}
        type="button"
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]">
          <AppIcon className="h-4 w-4" name="search" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-black text-[color:var(--client-text)]">搜索推广链接、素材、数据</span>
      </button>
    </FloatingHomeHeader>
  );
}

function MoreNavigationModal({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-4 py-8">
      <button aria-label="关闭更多入口" className="absolute inset-0 bg-black/48 backdrop-blur-sm" onClick={onClose} type="button" />
      <section className="business-cps-surface relative z-10 w-full max-w-[620px] rounded-[28px] p-5 shadow-[0_28px_80px_color-mix(in_srgb,var(--client-shadow)_46%,transparent)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="business-cps-accent-muted text-[11px] font-black">MORE</p>
            <h2 className="business-cps-title mt-1 text-2xl font-black">更多入口</h2>
          </div>
          <button className="business-cps-soft-action h-10 w-10 rounded-full text-lg font-black" onClick={onClose} type="button">x</button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {partnerNavItems.map((item) => (
            <Link className="business-cps-soft-action rounded-[18px] px-4 py-4 text-base font-black" key={item.id} onClick={onClose} to={item.to}>
              {item.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function HomePage() {
  const defaultLink = businessCpsPromotionLinks[0];
  const metrics = [
    { label: "点击", value: "1,248", series: [320, 460, 520, 710, 690, 880, 1248] },
    { label: "注册", value: "132", series: [28, 42, 51, 69, 84, 103, 132] },
    { label: "eKYC", value: "78", series: [14, 22, 31, 45, 52, 63, 78] },
    { label: "首单", value: "36", series: [6, 8, 14, 19, 23, 29, 36] },
    { label: "GMV", value: "¥1.82M", series: [220, 390, 580, 710, 1040, 1320, 1820], unit: "¥" },
    { label: "可结算", value: "¥86,400", series: [12800, 18600, 26400, 39800, 52200, 68400, 86400], unit: "¥" }
  ];
  const reminders = [
    "2 条佣金进入可结算",
    "1 个下级推广者待审核",
    "素材「技师招募海报A」ROI 最高",
    "活动预算消耗已达 82%"
  ];

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 md:gap-4">
        {metrics.map((metric) => (
          <PartnerMetric key={metric.label} label={metric.label} series={metric.series} unit={metric.unit} value={metric.value} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <PartnerPanel>
          <h3 className="text-xl font-black text-[#172234]">默认推广链接</h3>
          <div className="mt-4 flex flex-col gap-3 md:flex-row">
            <div className="flex min-h-12 flex-1 items-center rounded-[8px] border border-[#a8f0c2] bg-[#f1fff6] px-4 text-base font-semibold text-[#172234]">
              {defaultLink?.shortUrl.replace("AyM500", "eason2026") ?? "https://needo.jp/r/eason2026"}
            </div>
          <GreenButton>复制</GreenButton>
          </div>
          <p className="mt-4 text-sm font-semibold leading-6 text-[#4b5a6f]">
            推广码：EASON2026　QR码：下载 / 复制 / 打印海报
          </p>
        </PartnerPanel>

        <PartnerPanel>
          <h3 className="text-xl font-black text-[#172234]">待办提醒</h3>
          <ul className="mt-4 space-y-2 text-sm font-semibold leading-6 text-[#3f4f66]">
            {reminders.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </PartnerPanel>
      </section>
    </div>
  );
}

function createEmptyPlanCategoryDraft(): PlanWizardLocalizedText {
  return {
    ja: "",
    en: "",
    ko: "",
    "zh-Hant": "",
    zh: ""
  };
}

type PlanWizardCreativeDraft = {
  mediaType: "image" | "video";
  width: string;
  height: string;
  prEnabled: boolean;
};

type PlanWizardCreativePreset = {
  width: number;
  height: number;
  name?: string;
};

const planWizardCreativePresets: PlanWizardCreativePreset[] = [
  { width: 300, height: 250, name: "Medium Rectangle" },
  { width: 728, height: 90, name: "Leaderboard／PC" },
  { width: 320, height: 50, name: "Mobile Banner" },
  { width: 320, height: 100, name: "Large Mobile Banner" },
  { width: 336, height: 280 },
  { width: 160, height: 600 },
  { width: 300, height: 600 },
  { width: 970, height: 250 },
  { width: 970, height: 90 }
];

function getPlanWizardCreativePresetKey(preset: PlanWizardCreativePreset) {
  return `${preset.width}x${preset.height}`;
}

function formatPlanWizardCreativeSize(width: string | number, height: string | number) {
  return `${width}×${height}`;
}

function sanitizePlanWizardCreativeDimension(value: string) {
  return value.replace(/\D/g, "").slice(0, 5);
}

function CampaignWizardPage() {
  const { language } = useI18n();
  const [activeStep, setActiveStep] = useState(0);
  const [categoryOptions, setCategoryOptions] = useState<PlanWizardLocalizedText[]>(
    () => planWizardSteps.flatMap((step) => step.fields).find((field) => field.key === "category")?.options ?? []
  );
  const [selectedCategoryIndexes, setSelectedCategoryIndexes] = useState<number[]>([0]);
  const [categoryDraft, setCategoryDraft] = useState<PlanWizardLocalizedText>(createEmptyPlanCategoryDraft);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [isCategoryTranslating, setCategoryTranslating] = useState(false);
  const [flatRatePayoutDraft, setFlatRatePayoutDraft] = useState<PlanWizardFlatRatePayoutDraft>(createInitialPlanWizardFlatRatePayoutDraft);
  const [creativeDraft, setCreativeDraft] = useState<PlanWizardCreativeDraft>({
    mediaType: "image",
    width: "1080",
    height: "1350",
    prEnabled: true
  });
  const activeCampaign = businessCpsCampaigns[3] ?? businessCpsCampaigns[0];
  const usage = activeCampaign ? getBudgetUsage(activeCampaign) : 0;
  const copy = (text: Parameters<typeof getPlanWizardCopy>[0]) => getPlanWizardCopy(text, language);
  const activeWizardStep = planWizardSteps[activeStep] ?? planWizardSteps[0];
  const selectedCreativePreset = planWizardCreativePresets.find(
    (preset) => String(preset.width) === creativeDraft.width && String(preset.height) === creativeDraft.height
  );
  const creativeCurrentSize = creativeDraft.width && creativeDraft.height
    ? formatPlanWizardCreativeSize(creativeDraft.width, creativeDraft.height)
    : "--";
  const uiCopy = {
    subtitle: copy({
      zh: "保留 AI 创建步骤，把 Offer 基本信息、追踪链接、Payout、素材和上线检查拆到每一步",
      en: "Keep the AI creation flow and split offer profile, tracking, payout, creatives, and launch checks into separate steps",
      ja: "AI 作成フローを保ち、Offer 基本情報、計測リンク、報酬、素材、公開チェックを各ステップに分けます"
    }),
    title: copy({
      zh: "NeeDo 推广方案设定向导",
      en: "NeeDo promotion plan setup wizard",
      ja: "NeeDo 紹介プラン設定ウィザード"
    }),
    currentStep: copy({ zh: "第", en: "Step", ja: "ステップ" }),
    aiChecks: copy({ zh: "AI 检查", en: "AI checks", ja: "AI チェック" }),
    stepOutput: copy({ zh: "本步输出", en: "Step output", ja: "このステップの出力" }),
    activityPreview: copy({ zh: "活动预览", en: "Campaign preview", ja: "キャンペーンプレビュー" }),
    saveNext: copy({ zh: "保存并下一步", en: "Save and continue", ja: "保存して次へ" }),
    budget: copy({ zh: "预算消耗", en: "Budget usage", ja: "予算消化" }),
    stopAtFull: copy({
      zh: "预算达到 100% 后停止新增返佣但继续追踪数据。",
      en: "When budget reaches 100%, new commissions stop while tracking continues.",
      ja: "予算が100%に達すると新規報酬は停止し、計測のみ継続します。"
    })
  };
  const categoryCopy = {
    currentList: copy({ ja: "現在のカテゴリー一覧", en: "Current categories", ko: "현재 카테고리 목록", "zh-Hant": "目前類別列表", zh: "目前类别列表" }),
    addCategory: copy({ ja: "カテゴリーを追加", en: "Add category", ko: "카테고리 추가", "zh-Hant": "添加類別", zh: "添加类别" }),
    manageCategory: copy({ ja: "カテゴリーを追加 / 管理", en: "Add / manage categories", ko: "카테고리 추가 / 관리", "zh-Hant": "添加 / 管理類別", zh: "添加 / 管理类别" }),
    translate: copy({ ja: "翻訳", en: "Translate", ko: "번역", "zh-Hant": "翻譯", zh: "翻译" }),
    translating: copy({ ja: "翻訳中", en: "Translating", ko: "번역 중", "zh-Hant": "翻譯中", zh: "翻译中" }),
    confirmAdd: copy({ ja: "追加を確定", en: "Confirm add", ko: "추가 확정", "zh-Hant": "確定添加", zh: "确定添加" }),
    deleteCategory: copy({ ja: "カテゴリーを削除", en: "Delete category", ko: "카테고리 삭제", "zh-Hant": "刪除類別", zh: "删除类别" }),
    editCategory: copy({ ja: "既存カテゴリーを編集", en: "Edit existing categories", ko: "기존 카테고리 편집", "zh-Hant": "編輯現有類別", zh: "编辑已有类别" }),
    close: copy({ ja: "閉じる", en: "Close", ko: "닫기", "zh-Hant": "關閉", zh: "关闭" })
  };
  const creativeCopy = {
    type: copy({ ja: "素材タイプ", en: "Creative type", ko: "소재 유형", "zh-Hant": "素材類型", zh: "素材类型" }),
    image: copy({ ja: "画像", en: "Image", ko: "이미지", "zh-Hant": "视觉图", zh: "视觉图" }),
    video: copy({ ja: "動画", en: "Video", ko: "동영상", "zh-Hant": "視頻", zh: "视频" }),
    width: copy({ ja: "幅", en: "Width", ko: "너비", "zh-Hant": "寬", zh: "宽" }),
    height: copy({ ja: "高さ", en: "Height", ko: "높이", "zh-Hant": "高", zh: "高" }),
    presets: copy({ ja: "固定サイズ", en: "Preset sizes", ko: "고정 크기", "zh-Hant": "固有尺寸", zh: "固有尺寸" }),
    current: copy({ ja: "現在の設定", en: "Current setting", ko: "현재 설정", "zh-Hant": "当前设定", zh: "当前设定" }),
    custom: copy({ ja: "カスタム", en: "Custom", ko: "사용자 지정", "zh-Hant": "自定义", zh: "自定义" }),
    prOn: copy({ ja: "PR 表記オン", en: "PR label on", ko: "PR 표시 켬", "zh-Hant": "PR 標識已開", zh: "PR 标识已开" }),
    prOff: copy({ ja: "PR 表記オフ", en: "PR label off", ko: "PR 표시 끔", "zh-Hant": "PR 標識已關", zh: "PR 标识已关" }),
    freeSize: copy({
      ja: "幅と高さは任意入力できます。下のサイズは主要広告枠のショートカットです。",
      en: "Width and height are free inputs. The sizes below are shortcuts for common ad slots.",
      ko: "너비와 높이를 자유롭게 입력할 수 있습니다. 아래 크기는 주요 광고 슬롯 바로가기입니다.",
      "zh-Hant": "寬高可以自由輸入，下方尺寸是常用廣告版位的快捷選擇。",
      zh: "宽高可以自由输入，下方尺寸是常用广告版位的快捷选择。"
    })
  };
  const categoryLocaleFields: Array<{ locale: PlanWizardLocale; label: string; placeholder: string }> = [
    {
      locale: "ja",
      label: copy({ ja: "日本語", en: "Japanese", ko: "일본어", "zh-Hant": "日語", zh: "日语" }),
      placeholder: copy({ ja: "日本語のカテゴリー", en: "Japanese category", ko: "일본어 카테고리", "zh-Hant": "輸入日語類別", zh: "输入日语类别" })
    },
    {
      locale: "en",
      label: copy({ ja: "英語", en: "English", ko: "영어", "zh-Hant": "英文", zh: "英文" }),
      placeholder: copy({ ja: "英語のカテゴリー", en: "English category", ko: "영어 카테고리", "zh-Hant": "輸入英文類別", zh: "输入英文类别" })
    },
    {
      locale: "ko",
      label: copy({ ja: "韓国語", en: "Korean", ko: "한국어", "zh-Hant": "韓語", zh: "韩语" }),
      placeholder: copy({ ja: "韓国語のカテゴリー", en: "Korean category", ko: "한국어 카테고리", "zh-Hant": "輸入韓語類別", zh: "输入韩语类别" })
    },
    {
      locale: "zh-Hant",
      label: copy({ ja: "繁体字中国語", en: "Traditional Chinese", ko: "번체 중국어", "zh-Hant": "繁體中文", zh: "繁体中文" }),
      placeholder: copy({ ja: "繁体字中国語のカテゴリー", en: "Traditional Chinese category", ko: "번체 중국어 카테고리", "zh-Hant": "輸入繁體中文類別", zh: "输入繁体中文类别" })
    },
    {
      locale: "zh",
      label: copy({ ja: "簡体字中国語", en: "Simplified Chinese", ko: "간체 중국어", "zh-Hant": "簡體中文", zh: "简体中文" }),
      placeholder: copy({ ja: "簡体字中国語のカテゴリー", en: "Simplified Chinese category", ko: "간체 중국어 카테고리", "zh-Hant": "輸入簡體中文類別", zh: "输入简体中文类别" })
    }
  ];
  const updateCategoryOption = (categoryIndex: number, locale: keyof PlanWizardLocalizedText, value: string) => {
    setCategoryOptions((current) =>
      current.map((item, index) => (index === categoryIndex ? { ...item, [locale]: value } : item))
    );
  };
  const hasCategoryDraftInput = Boolean(categoryDraft.ja.trim() || categoryDraft.en.trim() || categoryDraft.ko?.trim() || categoryDraft["zh-Hant"]?.trim() || categoryDraft.zh.trim());
  const translateCategoryDraft = async () => {
    if (!hasCategoryDraftInput || isCategoryTranslating) {
      return;
    }

    setCategoryTranslating(true);

    try {
      const translatedDraft = await translatePlanCategoryDraft(categoryDraft, categoryOptions);

      setCategoryDraft(translatedDraft);
    } finally {
      setCategoryTranslating(false);
    }
  };
  const addCategoryOption = () => {
    const fallback = categoryDraft.ja.trim() || categoryDraft.en.trim() || categoryDraft.ko?.trim() || categoryDraft["zh-Hant"]?.trim() || categoryDraft.zh.trim();

    if (!fallback) {
      return;
    }

    const nextCategory = {
      ja: categoryDraft.ja.trim() || fallback,
      en: categoryDraft.en.trim() || fallback,
      ko: categoryDraft.ko?.trim() || fallback,
      "zh-Hant": categoryDraft["zh-Hant"]?.trim() || fallback,
      zh: categoryDraft.zh.trim() || fallback
    };

    setCategoryOptions((current) => {
      const duplicate = current.some((item) => copy(item).toLowerCase() === copy(nextCategory).toLowerCase());

      if (duplicate) {
        return current;
      }

      setSelectedCategoryIndexes((selectedIndexes) => Array.from(new Set([...selectedIndexes, current.length])));
      return [...current, nextCategory];
    });
    setCategoryDraft(createEmptyPlanCategoryDraft());
  };
  const removeCategoryOption = (categoryIndex: number) => {
    setCategoryOptions((current) => {
      if (current.length <= 1) {
        return current;
      }

      return current.filter((_, index) => index !== categoryIndex);
    });
    setSelectedCategoryIndexes((current) => {
      const nextIndexes = current
        .filter((index) => index !== categoryIndex)
        .map((index) => (index > categoryIndex ? index - 1 : index));

      return nextIndexes.length > 0 ? Array.from(new Set(nextIndexes)) : [0];
    });
  };
  const toggleCategoryOption = (categoryIndex: number) => {
    setSelectedCategoryIndexes((current) => {
      if (current.includes(categoryIndex)) {
        return current.length > 1 ? current.filter((index) => index !== categoryIndex) : current;
      }

      return [...current, categoryIndex];
    });
  };
  const flatRateCopy = {
    mode: copy({ ja: "計算方式", en: "Type", ko: "계산 방식", "zh-Hant": "計算方式", zh: "计算方式" }),
    value: copy({ ja: "数値", en: "Value", ko: "값", "zh-Hant": "數值", zh: "数值" }),
    period: copy({ ja: "適用期間", en: "Period", ko: "적용 기간", "zh-Hant": "適用期間", zh: "适用期间" }),
    fixedPeriod: copy({ ja: "初回のみ", en: "First order only", ko: "첫 주문만", "zh-Hant": "僅首單", zh: "仅首单" })
  };
  const updateFlatRatePayoutMode = (key: PlanWizardFlatRatePayoutKey, mode: PlanWizardPayoutValueMode) => {
    setFlatRatePayoutDraft((current) => ({
      ...current,
      [key]: {
        ...current[key],
        mode
      }
    }));
  };
  const updateFlatRatePayoutValue = (key: PlanWizardFlatRatePayoutKey, value: string) => {
    setFlatRatePayoutDraft((current) => ({
      ...current,
      [key]: {
        ...current[key],
        [current[key].mode === "amount" ? "amountValue" : "percentageValue"]: value
      }
    }));
  };
  const updateFlatRatePayoutPeriod = (key: PlanWizardFlatRatePayoutKey, period: PlanWizardFlatRatePeriodKey) => {
    setFlatRatePayoutDraft((current) => ({
      ...current,
      [key]: {
        ...current[key],
        period
      }
    }));
  };
  const updateCreativeDimension = (key: "width" | "height", value: string) => {
    setCreativeDraft((current) => ({
      ...current,
      [key]: sanitizePlanWizardCreativeDimension(value)
    }));
  };
  const applyCreativePreset = (preset: PlanWizardCreativePreset) => {
    setCreativeDraft((current) => ({
      ...current,
      width: String(preset.width),
      height: String(preset.height)
    }));
  };
  const setCreativeMediaType = (mediaType: PlanWizardCreativeDraft["mediaType"]) => {
    setCreativeDraft((current) => ({
      ...current,
      mediaType
    }));
  };
  const toggleCreativePr = () => {
    setCreativeDraft((current) => ({
      ...current,
      prEnabled: !current.prEnabled
    }));
  };

  return (
    <div className="space-y-7">
      <PageTitle
        subtitle={uiCopy.subtitle}
        title={uiCopy.title}
      />

      <div aria-label={uiCopy.title} className="business-cps-stepper">
        {planWizardSteps.map((step, index) => {
          const done = index <= activeStep;
          const active = index === activeStep;
          const stepLabel = copy(step.step);

          return (
            <div className="business-cps-stepper-item" key={stepLabel}>
              <button
                aria-label={`${uiCopy.currentStep} ${index + 1}: ${stepLabel}`}
                className={cn(
                  "business-cps-stepper-dot",
                  done && "business-cps-stepper-dot-done",
                  active && "business-cps-stepper-dot-active"
                )}
                onClick={() => setActiveStep(index)}
                title={stepLabel}
                type="button"
              >
                {index + 1}
              </button>
              {index < planWizardSteps.length - 1 ? <span className={cn("business-cps-stepper-line", index < activeStep && "business-cps-stepper-line-done")} /> : null}
            </div>
          );
        })}
      </div>

      <PartnerPanel className="p-6 md:p-10">
        <div className="grid gap-10 xl:grid-cols-[1fr_0.85fr]">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.14em] text-[#16a34a]">AI Offer Builder</p>
            <h2 className="mt-2 text-2xl font-black text-[#172234]">{uiCopy.currentStep} {activeStep + 1}: {copy(activeWizardStep.step)}</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#4b5a6f]">{copy(activeWizardStep.summary)}</p>
            <div className="mt-7 space-y-5">
              {activeWizardStep.fields.map((field) => {
                const fieldOptions = field.key === "category" ? categoryOptions : field.options ?? [field.defaultValue];

                return (
                  <div className="relative grid gap-3 md:grid-cols-[190px_1fr] md:items-start" key={copy(field.label)}>
                    {field.allowOptionManagement ? (
                      <button
                        aria-label={categoryCopy.addCategory}
                        className="absolute right-0 top-0 grid h-9 w-9 place-items-center rounded-full border border-[#dbe5ef] bg-white text-xl font-black leading-none text-[#111827] shadow-[0_12px_26px_rgba(23,34,52,0.12)] transition hover:border-[#16a34a] hover:text-[#16a34a]"
                        onClick={() => setCategoryManagerOpen(true)}
                        title={categoryCopy.addCategory}
                        type="button"
                      >
                        +
                      </button>
                    ) : null}
                    <label className="contents">
                      <span>
                        <span className={cn("block text-sm font-black text-[#4b5a6f]", field.allowOptionManagement && "pr-12")}>{copy(field.label)}</span>
                        <span className="mt-1 block text-xs font-semibold leading-5 text-[#6b7c91]">{copy(field.description)}</span>
                      </span>
                      {field.key === "category" ? (
                        <div className="grid gap-2">
                          {fieldOptions.map((option, optionIndex) => {
                            const selected = selectedCategoryIndexes.includes(optionIndex);

                            return (
                              <button
                                aria-pressed={selected}
                                className={cn(
                                  "flex min-h-12 w-full items-center gap-3 rounded-[8px] border px-4 py-2 text-left text-sm font-black transition",
                                  selected ? "border-[#16a34a] bg-[#effaf3] text-[#172234]" : "border-[#dbe5ef] bg-[#f8fafc] text-[#4b5a6f] hover:border-[#16a34a]"
                                )}
                                key={`${copy(option)}-${optionIndex}`}
                                onClick={() => toggleCategoryOption(optionIndex)}
                                type="button"
                              >
                                <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px]", selected ? "border-[#16a34a] bg-[#16a34a] text-white" : "border-[#dbe5ef] bg-white text-transparent")}>
                                  ✓
                                </span>
                                <span className="min-w-0 break-words">{copy(option)}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : field.key === "flatRatePayout" ? (
                        <div className="grid gap-2">
                          {planWizardFlatRatePayoutItems.map((item) => {
                            const draft = flatRatePayoutDraft[item.key];
                            const activeValue = draft.mode === "amount" ? draft.amountValue : draft.percentageValue;
                            const selectedPeriodOption = planWizardFlatRatePeriodOptions.find((option) => option.value === draft.period);
                            const selectedPeriodLabel = selectedPeriodOption ? copy(selectedPeriodOption.label) : flatRateCopy.period;
                            const isForeverPeriod = item.allowPeriod && draft.period === "forever";

                            return (
                              <div className="rounded-[12px] border border-[#dbe5ef] bg-[#f8fafc] p-3" key={item.key}>
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <strong className="text-sm font-black text-[#172234]">{copy(item.label)}</strong>
                                    <p className="mt-1 text-xs font-semibold leading-5 text-[#6b7c91]">{copy(item.description)}</p>
                                  </div>
                                  <span
                                    className={cn(
                                      "rounded-full bg-white px-2.5 py-1 text-[10px] font-black",
                                      isForeverPeriod ? "text-[#dc2626]" : "text-[#16a34a]"
                                    )}
                                  >
                                    {item.allowPeriod ? selectedPeriodLabel : flatRateCopy.fixedPeriod}
                                  </span>
                                </div>
                                <div className={cn("mt-3 grid gap-2", item.allowPeriod ? "sm:grid-cols-[160px_1fr_140px]" : "sm:grid-cols-[160px_1fr]")}>
                                  <div className="text-[11px] font-black text-[#6b7c91]">
                                    {flatRateCopy.mode}
                                    <div className="mt-1 grid h-11 grid-cols-2 rounded-[8px] border border-[#dbe5ef] bg-white p-1">
                                      {planWizardPayoutValueModeOptions.map((option) => {
                                        const selected = draft.mode === option.value;

                                        return (
                                          <button
                                            aria-label={`${copy(item.label)}-${copy(option.label)}`}
                                            aria-pressed={selected}
                                            className={cn(
                                              "rounded-[6px] text-xs font-black transition",
                                              selected ? "bg-[#172234] text-white" : "text-[#6b7c91] hover:text-[#172234]"
                                            )}
                                            key={option.value}
                                            onClick={() => updateFlatRatePayoutMode(item.key, option.value)}
                                            type="button"
                                          >
                                            {copy(option.label)}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  <label className="text-[11px] font-black text-[#6b7c91]">
                                    {flatRateCopy.value}
                                    <span className="mt-1 flex h-11 items-center rounded-[8px] border border-[#dbe5ef] bg-white px-3 focus-within:border-[#16a34a]">
                                      {draft.mode === "amount" ? <span className="mr-2 text-sm font-black text-[#6b7c91]">¥</span> : null}
                                      <input
                                        className="h-full min-w-0 flex-1 bg-transparent text-sm font-black text-[#172234] outline-none"
                                        inputMode="decimal"
                                        max={draft.mode === "percentage" ? 100 : undefined}
                                        min={0}
                                        onChange={(event) => updateFlatRatePayoutValue(item.key, event.target.value)}
                                        step={draft.mode === "percentage" ? "0.1" : "1"}
                                        type="number"
                                        value={activeValue}
                                      />
                                      {draft.mode === "percentage" ? <span className="ml-2 text-sm font-black text-[#6b7c91]">%</span> : null}
                                    </span>
                                  </label>
                                  {item.allowPeriod ? (
                                    <label className="text-[11px] font-black text-[#6b7c91]">
                                      {flatRateCopy.period}
                                      <select
                                        className={cn(
                                          "mt-1 h-11 w-full rounded-[8px] border bg-white px-3 text-xs font-black outline-none focus:border-[#16a34a]",
                                          isForeverPeriod ? "border-[#f87171] bg-[#fff1f2] text-[#dc2626]" : "border-[#dbe5ef] text-[#172234]"
                                        )}
                                        onChange={(event) => updateFlatRatePayoutPeriod(item.key, event.target.value as PlanWizardFlatRatePeriodKey)}
                                        style={isForeverPeriod ? { backgroundColor: "#fff1f2", borderColor: "#f87171", color: "#dc2626", fontWeight: 900 } : undefined}
                                        value={draft.period}
                                      >
                                        {planWizardFlatRatePeriodOptions.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {copy(option.label)}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : field.key === "creativeDimensions" ? (
                        <div className="grid gap-3">
                          <div className="grid gap-2 lg:grid-cols-[1fr_1fr_180px]">
                            <label className="text-[11px] font-black text-[#6b7c91]">
                              {creativeCopy.width}
                              <span className="mt-1 flex h-11 items-center rounded-[8px] border border-[#dbe5ef] bg-[#f8fafc] px-3 focus-within:border-[#16a34a]">
                                <input
                                  aria-label={creativeCopy.width}
                                  className="h-full min-w-0 flex-1 bg-transparent text-sm font-black text-[#172234] outline-none"
                                  inputMode="numeric"
                                  min={1}
                                  onChange={(event) => updateCreativeDimension("width", event.target.value)}
                                  type="text"
                                  value={creativeDraft.width}
                                />
                                <span className="ml-2 text-xs font-black text-[#6b7c91]">px</span>
                              </span>
                            </label>
                            <label className="text-[11px] font-black text-[#6b7c91]">
                              {creativeCopy.height}
                              <span className="mt-1 flex h-11 items-center rounded-[8px] border border-[#dbe5ef] bg-[#f8fafc] px-3 focus-within:border-[#16a34a]">
                                <input
                                  aria-label={creativeCopy.height}
                                  className="h-full min-w-0 flex-1 bg-transparent text-sm font-black text-[#172234] outline-none"
                                  inputMode="numeric"
                                  min={1}
                                  onChange={(event) => updateCreativeDimension("height", event.target.value)}
                                  type="text"
                                  value={creativeDraft.height}
                                />
                                <span className="ml-2 text-xs font-black text-[#6b7c91]">px</span>
                              </span>
                            </label>
                            <div className="text-[11px] font-black text-[#6b7c91]">
                              {creativeCopy.type}
                              <div className="mt-1 grid h-11 grid-cols-2 rounded-[8px] border border-[#dbe5ef] bg-[#f8fafc] p-1">
                                {(["image", "video"] as const).map((mediaType) => {
                                  const selected = creativeDraft.mediaType === mediaType;

                                  return (
                                    <button
                                      aria-pressed={selected}
                                      className={cn(
                                        "rounded-[6px] text-xs font-black transition",
                                        selected ? "bg-[#172234] text-white" : "text-[#6b7c91] hover:text-[#172234]"
                                      )}
                                      key={mediaType}
                                      onClick={() => setCreativeMediaType(mediaType)}
                                      type="button"
                                    >
                                      {mediaType === "image" ? creativeCopy.image : creativeCopy.video}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          <div className="rounded-[12px] border border-[#dbe5ef] bg-[#f8fafc] p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <strong className="text-xs font-black text-[#172234]">{creativeCopy.presets}</strong>
                              <span className="text-[11px] font-semibold text-[#6b7c91]">{creativeCopy.freeSize}</span>
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                              {planWizardCreativePresets.map((preset) => {
                                const active = selectedCreativePreset ? getPlanWizardCreativePresetKey(selectedCreativePreset) === getPlanWizardCreativePresetKey(preset) : false;
                                const label = `${formatPlanWizardCreativeSize(preset.width, preset.height)}${preset.name ? ` ${preset.name}` : ""}`;

                                return (
                                  <button
                                    aria-pressed={active}
                                    className={cn(
                                      "min-h-11 rounded-[8px] border px-3 py-2 text-left text-xs font-black leading-5 transition",
                                      active ? "border-[#16a34a] bg-white text-[#07583b] shadow-[0_10px_22px_rgba(22,163,74,0.12)]" : "border-[#dbe5ef] bg-white text-[#4b5a6f] hover:border-[#16a34a] hover:text-[#07583b]"
                                    )}
                                    key={getPlanWizardCreativePresetKey(preset)}
                                    onClick={() => applyCreativePreset(preset)}
                                    type="button"
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#dbe5ef] bg-white px-4 py-3">
                            <div>
                              <p className="text-[11px] font-black text-[#6b7c91]">{creativeCopy.current}</p>
                              <p className="mt-1 text-sm font-black text-[#172234]">
                                {creativeCurrentSize} px · {creativeDraft.mediaType === "image" ? creativeCopy.image : creativeCopy.video}
                                {selectedCreativePreset?.name ? ` · ${selectedCreativePreset.name}` : ` · ${creativeCopy.custom}`}
                              </p>
                            </div>
                            <button
                              aria-pressed={creativeDraft.prEnabled}
                              className={cn(
                                "rounded-[8px] border px-3 py-2 text-xs font-black transition",
                                creativeDraft.prEnabled ? "border-[#16a34a] bg-[#effaf3] text-[#07583b]" : "border-[#dbe5ef] bg-[#f8fafc] text-[#6b7c91]"
                              )}
                              onClick={toggleCreativePr}
                              type="button"
                            >
                              {creativeDraft.prEnabled ? creativeCopy.prOn : creativeCopy.prOff}
                            </button>
                          </div>
                        </div>
                      ) : field.inputType === "textarea" ? (
                        <textarea
                          className="min-h-[108px] resize-none rounded-[8px] border border-[#dbe5ef] bg-[#f8fafc] px-4 py-3 text-sm font-semibold leading-6 text-[#172234] outline-none focus:border-[#16a34a]"
                          defaultValue={copy(field.defaultValue)}
                          key={`${language}-${copy(field.label)}-textarea`}
                        />
                      ) : field.inputType === "select" ? (
                        <select
                          className="h-12 rounded-[8px] border border-[#dbe5ef] bg-[#f8fafc] px-4 text-sm font-semibold text-[#172234] outline-none focus:border-[#16a34a]"
                          defaultValue={copy(field.defaultValue)}
                          key={`${language}-${copy(field.label)}-select`}
                        >
                          {fieldOptions.map((option, optionIndex) => (
                            <option key={`${copy(option)}-${optionIndex}`} value={copy(option)}>
                              {copy(option)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="h-12 rounded-[8px] border border-[#dbe5ef] bg-[#f8fafc] px-4 text-sm font-semibold text-[#172234] outline-none focus:border-[#16a34a]"
                          defaultValue={copy(field.defaultValue)}
                          key={`${language}-${copy(field.label)}-input`}
                          type={field.inputType === "url" ? "url" : field.inputType === "number" ? "number" : "text"}
                        />
                      )}
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-[18px] border border-[#64e58e] bg-[#effaf3] p-6">
            <h3 className="text-2xl font-black text-[#07583b]">{uiCopy.aiChecks}</h3>
            <div className="mt-5 space-y-3 text-sm font-semibold leading-6 text-[#3f4f66]">
              {activeWizardStep.aiChecks.map((item) => (
                <p className="rounded-[8px] bg-white px-4 py-3" key={copy(item)}>{copy(item)}</p>
              ))}
            </div>
            <div className="mt-5 rounded-[8px] bg-white px-4 py-3 text-sm font-semibold leading-6 text-[#3f4f66]">
              <p className="font-black text-[#07583b]">{uiCopy.stepOutput}</p>
              <p className="mt-1">{copy(activeWizardStep.output)}</p>
            </div>
            <div className="mt-5 space-y-3 text-sm font-semibold leading-6 text-[#3f4f66]">
              <p className="font-black text-[#07583b]">{uiCopy.activityPreview}</p>
              <p className="rounded-[8px] bg-white px-4 py-3 text-sm">
                {activeCampaign?.name} · {uiCopy.budget} {usage}%<br />
                {uiCopy.stopAtFull}
              </p>
            </div>
            <GreenButton className="mt-8 w-full md:w-auto md:min-w-[260px]" onClick={() => setActiveStep((value) => Math.min(planWizardSteps.length - 1, value + 1))}>
              {uiCopy.saveNext}
            </GreenButton>
          </div>
        </div>
      </PartnerPanel>

      {categoryManagerOpen ? (
        <div className="fixed inset-0 z-[120] bg-[#0b1220]/55 px-4 py-6 backdrop-blur-sm">
          <div className="mx-auto flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.28)]">
            <div className="flex items-center justify-between gap-3 border-b border-[#dbe5ef] px-5 py-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[#6b7c91]">{categoryCopy.currentList}</p>
                <h3 className="mt-1 text-xl font-black text-[#172234]">{categoryCopy.manageCategory}</h3>
              </div>
              <button
                className="grid h-10 w-10 place-items-center rounded-[8px] border border-[#dbe5ef] text-sm font-black text-[#4b5a6f]"
                onClick={() => setCategoryManagerOpen(false)}
                type="button"
              >
                x
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <section className="rounded-[14px] border border-[#dbe5ef] bg-[#f8fafc] p-4">
                <h4 className="text-base font-black text-[#172234]">{categoryCopy.editCategory}</h4>
                <div className="mt-4 space-y-3">
                  {categoryOptions.map((option, optionIndex) => (
                    <div className="rounded-[12px] border border-[#dbe5ef] bg-white p-3" key={`${copy(option)}-${optionIndex}`}>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {categoryLocaleFields.map((field) => (
                          <label className="text-[11px] font-black text-[#6b7c91]" key={field.locale}>
                            {field.label}
                            <input
                              className="mt-1 h-10 w-full rounded-[8px] border border-[#dbe5ef] bg-[#f8fafc] px-3 text-xs font-bold text-[#172234] outline-none focus:border-[#16a34a]"
                              onChange={(event) => updateCategoryOption(optionIndex, field.locale, event.target.value)}
                              value={option[field.locale] ?? ""}
                            />
                          </label>
                        ))}
                      </div>
                      <button
                        className="mt-3 inline-flex h-9 items-center rounded-[8px] border border-[#ef4444]/35 bg-[#ef4444]/10 px-3 text-xs font-black text-[#ef4444] disabled:opacity-35"
                        disabled={categoryOptions.length <= 1}
                        onClick={() => removeCategoryOption(optionIndex)}
                        type="button"
                      >
                        {categoryCopy.deleteCategory}
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-4 rounded-[14px] border border-[#dbe5ef] bg-white p-4">
                <h4 className="text-base font-black text-[#172234]">{categoryCopy.addCategory}</h4>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {categoryLocaleFields.map((field) => (
                    <label className="text-[11px] font-black text-[#6b7c91]" key={field.locale}>
                      {field.label}
                      <input
                        className="mt-1 h-10 w-full rounded-[8px] border border-[#dbe5ef] bg-[#f8fafc] px-3 text-xs font-bold text-[#172234] outline-none focus:border-[#16a34a]"
                        onChange={(event) => setCategoryDraft((current) => ({ ...current, [field.locale]: event.target.value }))}
                        placeholder={field.placeholder}
                        value={categoryDraft[field.locale] ?? ""}
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    className="inline-flex h-10 items-center rounded-[8px] border border-[#dbe5ef] bg-[#f8fafc] px-4 text-xs font-black text-[#111827] transition hover:border-[#16a34a] hover:text-[#16a34a] disabled:opacity-40"
                    disabled={!hasCategoryDraftInput || isCategoryTranslating}
                    onClick={() => void translateCategoryDraft()}
                    type="button"
                  >
                    {isCategoryTranslating ? categoryCopy.translating : categoryCopy.translate}
                  </button>
                  <button
                    className="inline-flex h-10 items-center rounded-[8px] bg-[#172234] px-4 text-xs font-black text-white transition hover:bg-[#16a34a] disabled:opacity-40"
                    disabled={!hasCategoryDraftInput || isCategoryTranslating}
                    onClick={addCategoryOption}
                    type="button"
                  >
                    {categoryCopy.confirmAdd}
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PromotionLinksWorkspace() {
  const [activeTab, setActiveTab] = useState("默认链接");
  const linkRows = businessCpsPromotionLinks.map((link) => ({
    ...link,
    issues: validatePromotionLink(link, runtimeState)
  }));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-5">
        {["默认链接", "自定义链接", "推广码", "QR码", "Sub ID/渠道参数"].map((tab) => (
          <SoftButton active={tab === activeTab} key={tab} onClick={() => setActiveTab(tab)}>{tab}</SoftButton>
        ))}
      </div>

      <PartnerPanel>
        <h2 className="text-2xl font-black text-[#172234]">推广链接列表</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[860px] w-full text-left text-sm">
            <thead className="border-b border-[#dbe5ef] text-[#4b5a6f]">
              <tr>
                {["名称", "落地页", "渠道", "点击", "注册", "首单", "GMV", "状态", "操作"].map((header) => (
                  <th className="px-3 py-3 font-black" key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linkRows.map((link) => {
                const url = new URL(link.landingUrl);
                const channel = getChannelById(link.channelId)?.name ?? link.channelId;

                return (
                  <tr className="border-b border-[#edf2f7]" key={link.id}>
                    <td className="px-3 py-4 font-semibold">{link.name}</td>
                    <td className="px-3 py-4">{url.pathname}</td>
                    <td className="px-3 py-4">{channel}</td>
                    <td className="px-3 py-4">{link.clicks.toLocaleString("ja-JP")}</td>
                    <td className="px-3 py-4">{link.registrations}</td>
                    <td className="px-3 py-4">{link.firstOrders}</td>
                    <td className="px-3 py-4">{yen(link.gmv)}</td>
                    <td className="px-3 py-4"><StatusText tone={link.status === "active" ? "green" : link.status === "paused" ? "orange" : "red"}>{carrierStatusLabels[link.status]}</StatusText></td>
                    <td className="px-3 py-4">复制 QR 数据</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="ml-auto mt-8 max-w-[500px] rounded-[18px] border border-[#64e58e] bg-[#effaf3] p-6">
          <h3 className="text-xl font-black text-[#07583b]">创建自定义链接</h3>
          <div className="mt-4 space-y-2 text-sm font-semibold leading-6 text-[#3f4f66]">
            <p>选择活动：东京技师入驻</p>
            <p>落地页：/cast/apply</p>
            <p>渠道：TikTok</p>
            <p>绑定素材：短视频A</p>
            <p>Sub ID：tiktok_video_01</p>
          </div>
          <GreenButton className="mt-4 w-full">生成</GreenButton>
        </div>
      </PartnerPanel>
    </div>
  );
}

function LinksPage() {
  return (
    <div className="space-y-7">
      <PageTitle
        subtitle="参考 PartnerStack Links：默认链接、自定义链接、组织成员独立链接；NeeDo 增加推广码与线下 QR"
        title="NeeDo 链接 / 推广码 / QR 码页面"
      />
      <PromotionLinksWorkspace />
    </div>
  );
}

function AssetCard({ material }: { material: BusinessCpsMaterial }) {
  const channel = getChannelById(material.channelId);
  const clicks = material.clicks ?? 0;
  const registrations = material.registrations ?? 0;
  const roi = material.roi ?? 0;
  const typeLabel = {
    shop_poster: "图片/线下海报",
    technician_card: "图片/名片",
    line_copy: "文案/LINE",
    x_copy: "文案/X",
    short_video_script: "短视频/TikTok",
    field_qr: "海报/QR"
  }[material.type];

  return (
    <PartnerPanel className="flex min-h-[280px] flex-col">
      <div className="rounded-[8px] border border-[#a8f0c2] bg-[#dcfce7] px-5 py-8 text-xl font-black text-[#07583b]">素材预览</div>
      <div className="mt-5 flex-1">
        <h3 className="text-xl font-black text-[#172234]">{material.title}</h3>
        <p className="mt-1 text-base font-semibold text-[#66758b]">{typeLabel}</p>
        <p className="mt-1 text-base font-semibold text-[#3f4f66]">适用：{material.scene}</p>
        <p className="mt-1 text-sm font-black text-[#087443]">
          {material.type === "field_qr" ? "扫码" : "点击"} {clicks.toLocaleString("ja-JP")} | 注册 {registrations} | ROI {roi.toFixed(1)}
        </p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <GreenButton>生成链接</GreenButton>
        <SoftButton>QR码</SoftButton>
      </div>
    </PartnerPanel>
  );
}

function MaterialsPage() {
  return (
    <div className="space-y-7">
      <PageTitle
        subtitle="素材不是附件，而是“可生成专属链接与 QR 的推广工具”"
        title="NeeDo 推广素材中心（Resources / Assets 改造版）"
      />
      <div className="grid gap-4 md:grid-cols-5">
        {["对象：用户/技师/商户", "渠道：LINE/X/TikTok/线下", "语言：日/中/英/韩", "状态：启用/暂停", "风险：正常/观察"].map((filter) => (
          <div className="rounded-[8px] border border-[#dbe5ef] bg-white px-4 py-3 text-sm font-semibold text-[#3f4f66]" key={filter}>{filter}</div>
        ))}
      </div>
      <section className="grid gap-6 xl:grid-cols-3">
        {businessCpsMaterials.slice(0, 6).map((material) => <AssetCard key={material.id} material={material} />)}
      </section>
    </div>
  );
}

function PlanPage({ initialTab }: { initialTab: PlanTab }) {
  const [activeTab, setActiveTab] = useState<PlanTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <div className="space-y-7">
      <SectionTabs
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: "settings", label: "方案设定" },
          { id: "links", label: "链接 / 邀请码 / QR" },
          { id: "materials", label: "素材中心" }
        ]}
      />
      {activeTab === "settings" ? <CampaignWizardPage /> : null}
      {activeTab === "links" ? <LinksPage /> : null}
      {activeTab === "materials" ? <MaterialsPage /> : null}
    </div>
  );
}

function ReferralsPage() {
  const invited = [
    ["用户", "高桥 由美", "注册 + eKYC + Booking 首单", "佣金 ¥571"],
    ["技师/スタッフ", "山口 彩", "eKYC + 首单，风控复核中", "佣金 ¥8,000"],
    ["商户", "Aoyama Aroma Room", "审核通过 + SaaS 首购", "佣金 ¥19,200"],
    ["下级推广者", "LINE社群C", "产生首个转化，待授权", "组织分润 0.5%"]
  ];

  return (
    <div className="space-y-7">
      <PageTitle subtitle="被邀请对象扩展为用户、技师/スタッフ、商户、下级推广者四类" title="NeeDo 我的推荐 / 客户数据页面" />
      <PartnerPanel>
        <h2 className="text-2xl font-black text-[#172234]">客户 / 推荐明细</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[820px] w-full text-left text-sm">
            <thead className="border-b border-[#dbe5ef] text-[#4b5a6f]">
              <tr>
                {["对象类型", "对象", "状态路径", "佣金触发点", "归因证据"].map((header) => <th className="px-3 py-3 font-black" key={header}>{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {invited.map(([type, name, status, commission], index) => (
                <tr className="border-b border-[#edf2f7]" key={name}>
                  <td className="px-3 py-4 font-black text-[#07583b]">{type}</td>
                  <td className="px-3 py-4 font-semibold">{name}</td>
                  <td className="px-3 py-4">{status}</td>
                  <td className="px-3 py-4">{commission}</td>
                  <td className="px-3 py-4"><StatusText>已归因</StatusText> · {businessCpsAttributionRecords[index]?.evidence.join(" / ") ?? "短链 + eKYC + 订单"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PartnerPanel>
    </div>
  );
}

function TeamTree({
  selectedNodeId,
  onSelect
}: {
  selectedNodeId?: string;
  onSelect?: (nodeId: string) => void;
}) {
  const { state } = useBusinessCpsMobileRuntime();
  const nodes = state.promoterTeamNodes.map((node) => {
    const promoter = state.promoters.find((item) => item.id === node.promoterId);
    const label = node.level === 0 ? "本平台" : `${node.level}级：${promoter?.name ?? node.promoterId}`;

    return {
      ...node,
      label
    };
  });
  const indentClassNames = ["pl-0", "pl-4", "pl-8", "pl-12"];

  return (
    <PartnerPanel className="overflow-hidden">
      <h2 className="text-2xl font-black text-[#172234]">组织层级</h2>
      <p className="mt-1 text-sm font-semibold text-[#4b5a6f]">本平台 → 1级 → 2级，可继续添加层级，点击节点查看详情</p>
      <div className="mt-6 space-y-3">
        {nodes.map((node) => (
          <div className={cn("relative min-w-0", indentClassNames[Math.min(node.level, indentClassNames.length - 1)])} key={node.id}>
            {node.level > 0 ? <span aria-hidden="true" className="absolute left-1 top-1/2 h-px w-5 -translate-y-1/2 bg-[color:var(--client-primary)] opacity-70" /> : null}
            <button
              className={cn(
                "grid min-h-14 w-full min-w-0 grid-cols-[1fr_auto] items-center gap-3 rounded-[14px] border-2 px-4 py-3 text-left text-sm font-black transition md:text-base",
                selectedNodeId === node.id ? "business-cps-primary-action border-transparent" : "border-[#22c55e] bg-[#effaf3] text-[#07583b]"
              )}
              onClick={() => onSelect?.(node.id)}
              type="button"
            >
              <span className="min-w-0 truncate">{node.label}</span>
              <span className="shrink-0 rounded-full border border-current/20 px-2 py-1 text-[11px] font-black opacity-80">
                {node.teamSize}人
              </span>
            </button>
          </div>
        ))}
      </div>
    </PartnerPanel>
  );
}

function TeamPage() {
  const selectedNode = businessCpsPromoterTeamNodes[1] ?? businessCpsPromoterTeamNodes[0];
  const selectedPromoter = getPromoterById(selectedNode.promoterId);
  const childRows = [
    ["Tokyo BD A", "¥300,000", "注册300", "完成192"],
    ["KOL B", "¥200,000", "注册200", "完成91"],
    ["LINE社群C", "¥50,000", "注册80", "完成42"]
  ];

  return (
    <div className="space-y-7">
      <PageTitle
        subtitle="参考 PartnerStack Partner Team：组织成员独立登录、独立链接、不同权限；NeeDo 增加多级分销与预算拆分"
        title="NeeDo 组织 / 推广者数据页面"
      />
      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <TeamTree />
        <PartnerPanel className="p-8">
          <h2 className="text-2xl font-black text-[#172234]">选中推广者：{selectedPromoter?.name ?? "Tokyo BD A"}</h2>
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            <PartnerMetric label="直接下级" value={selectedNode.directChildren.toString()} />
            <PartnerMetric label="组织注册" value={selectedNode.completedRegisters.toString()} />
            <PartnerMetric label="首单" value={selectedNode.completedFirstOrders.toString()} />
            <PartnerMetric label="组织GMV" value="¥2.6M" />
            <PartnerMetric label="预计返佣" value="¥128k" />
            <PartnerMetric label="风险" value={selectedNode.riskLevel === "low" ? "正常" : "观察"} tone={selectedNode.riskLevel === "low" ? "green" : "orange"} />
          </div>
          <h3 className="mt-10 text-xl font-black text-[#172234]">预算/目标拆分</h3>
          <div className="mt-4 space-y-4">
            {childRows.map((row) => (
              <div className="grid gap-3 rounded-[8px] bg-[#f8fafc] px-5 py-4 text-base font-semibold md:grid-cols-4" key={row[0]}>
                {row.map((cell, index) => (
                  <span className={index === 3 ? "font-black text-[#087443]" : ""} key={cell}>{cell}</span>
                ))}
              </div>
            ))}
          </div>
          <GreenButton className="mt-10 w-full md:ml-auto md:block md:w-[300px]">添加下级推广者</GreenButton>
        </PartnerPanel>
      </section>
    </div>
  );
}

function OrganizationPerformancePage({
  onCreateSubPromoter,
  onEditPromoter
}: {
  onCreateSubPromoter: (parentPromoterId?: string) => void;
  onEditPromoter: (promoterId: string) => void;
}) {
  const { dashboard, state } = useBusinessCpsMobileRuntime();
  const [selectedNodeId, setSelectedNodeId] = useState(state.promoterTeamNodes[1]?.id ?? state.promoterTeamNodes[0]?.id ?? "");
  const selectedNode = state.promoterTeamNodes.find((node) => node.id === selectedNodeId) ?? state.promoterTeamNodes[0];
  const selectedPromoter = selectedNode ? state.promoters.find((promoter) => promoter.id === selectedNode.promoterId) : undefined;
  const childNodes = selectedNode ? state.promoterTeamNodes.filter((node) => node.parentPromoterId === selectedNode.promoterId) : [];

  return (
    <div className="space-y-7">
      <PageTitle subtitle="组织表现集中展示组织层级、节点详情和预算拆分" title="组织表现" />
      <section className="grid gap-6 xl:grid-cols-[0.86fr_1.14fr]">
        <TeamTree onSelect={setSelectedNodeId} selectedNodeId={selectedNodeId} />
        <PartnerPanel className="p-8">
          <h2 className="text-2xl font-black text-[#172234]">节点详情：{selectedPromoter?.name ?? "本平台"}</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <PartnerMetric label="组织规模" value={(selectedNode?.teamSize ?? businessCpsPromoters.length).toString()} />
            <PartnerMetric label="直接下级" value={(selectedNode?.directChildren ?? childNodes.length).toString()} />
            <PartnerMetric label="注册完成" value={(selectedNode?.completedRegisters ?? dashboard.newUsers).toLocaleString("ja-JP")} />
            <PartnerMetric label="首单完成" value={(selectedNode?.completedFirstOrders ?? dashboard.cpsOrders).toLocaleString("ja-JP")} />
            <PartnerMetric label="预算消耗" value={selectedNode ? `${Math.round((selectedNode.budgetUsed / selectedNode.budgetTotal) * 100)}%` : `${dashboard.budgetUsageRate}%`} />
            <PartnerMetric label="风险等级" value={selectedNode?.riskLevel === "high" ? "高" : selectedNode?.riskLevel === "medium" ? "中" : "低"} tone={selectedNode?.riskLevel === "high" ? "red" : selectedNode?.riskLevel === "medium" ? "orange" : "green"} />
          </div>
          <h3 className="mt-10 text-xl font-black text-[#172234]">预算拆分</h3>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[#4b5a6f]">上级预算、已分配预算、未分配预算、各下级预算消耗</p>
            <div className="flex flex-wrap gap-2">
              {selectedNode ? <SoftButton className="px-4 py-2 text-xs" onClick={() => onEditPromoter(selectedNode.promoterId)}>编辑</SoftButton> : null}
              {selectedNode ? <GreenButton className="px-4 py-2 text-xs" onClick={() => onCreateSubPromoter(selectedNode.promoterId)}>添加下级</GreenButton> : null}
            </div>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-[820px] w-full text-left text-sm">
              <thead className="border-b border-[#dbe5ef] text-[#4b5a6f]">
                <tr>{["下级", "上级预算", "已分配预算", "未分配预算", "预算消耗"].map((header) => <th className="px-3 py-3 font-black" key={header}>{header}</th>)}</tr>
              </thead>
              <tbody>
                {(childNodes.length ? childNodes : state.promoterTeamNodes.slice(1, 4)).map((node) => {
                  const promoter = state.promoters.find((item) => item.id === node.promoterId);
                  const remaining = Math.max(0, node.budgetTotal - node.budgetUsed);

                  return (
                    <tr className="border-b border-[#edf2f7]" key={node.id}>
                      <td className="px-3 py-4 font-semibold">{promoter?.name ?? node.promoterId}</td>
                      <td className="px-3 py-4">{yen(selectedNode?.budgetTotal ?? node.budgetTotal)}</td>
                      <td className="px-3 py-4">{yen(node.budgetUsed)}</td>
                      <td className="px-3 py-4">{yen(remaining)}</td>
                      <td className="px-3 py-4 font-black text-[#07583b]">{Math.round((node.budgetUsed / Math.max(1, node.budgetTotal)) * 100)}% / 分成 {percent(node.commissionRate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </PartnerPanel>
      </section>
    </div>
  );
}

function OrganizationSettingsPage({
  onCreateSubPromoter,
  onEditPromoter
}: {
  onCreateSubPromoter: (parentPromoterId?: string) => void;
  onEditPromoter: (promoterId: string) => void;
}) {
  const { state } = useBusinessCpsMobileRuntime();
  const permissionRows = state.promoters.slice(0, 5).map((promoter) => ({
    promoter,
    permission: state.promoterPermissions.find((item) => item.promoterId === promoter.id)
  }));
  const defaultParentId = state.promoterTeamNodes.find((node) =>
    state.promoterPermissions.find((permission) => permission.promoterId === node.promoterId)?.canCreateSubPromoter
  )?.promoterId;

  const permissionColumns: Array<[string, string]> = [
    ["canCreateLink", "链接"],
    ["canCreateCode", "推广码"],
    ["canCreateQr", "QR"],
    ["canUploadMaterial", "素材"],
    ["canCreateSubPromoter", "下级"],
    ["canWithdraw", "提现"]
  ];

  return (
    <div className="space-y-7">
      <PageTitle subtitle="组织设定覆盖权限控制与下级添加、删除、暂停操作" title="组织设定" />
      <PartnerPanel>
        <h2 className="text-2xl font-black text-[#172234]">权限控制</h2>
        <p className="mt-1 text-sm font-semibold text-[#4b5a6f]">能否创建链接、推广码、QR、素材、下级、提现</p>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[920px] w-full text-left text-sm">
            <thead className="border-b border-[#dbe5ef] text-[#4b5a6f]">
              <tr>
                <th className="px-3 py-3 font-black">推广者</th>
                {permissionColumns.map(([, label]) => <th className="px-3 py-3 font-black" key={label}>{label}</th>)}
                <th className="px-3 py-3 font-black">操作</th>
              </tr>
            </thead>
            <tbody>
              {permissionRows.map(({ promoter, permission }) => (
                <tr className="border-b border-[#edf2f7]" key={promoter.id}>
                  <td className="px-3 py-4">
                    <p className="font-black text-[#07583b]">{promoter.name}</p>
                    <p className="mt-1 text-xs font-semibold text-[#4b5a6f]">{promoter.roleLabel}</p>
                  </td>
                  {permissionColumns.map(([key]) => {
                    const enabled = Boolean(permission?.[key as keyof typeof permission]);

                    return (
                      <td className="px-3 py-4" key={key}>
                        <StatusText tone={enabled ? "green" : "default"}>{enabled ? "可" : "不可"}</StatusText>
                      </td>
                    );
                  })}
                  <td className="px-3 py-4">
                    <div className="flex flex-wrap gap-2">
                      <SoftButton className="px-3 py-2 text-xs" onClick={() => onEditPromoter(promoter.id)}>编辑</SoftButton>
                      <SoftButton className="px-3 py-2 text-xs">暂停</SoftButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PartnerPanel>
      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <PartnerPanel>
          <h2 className="text-2xl font-black text-[#172234]">添加下级</h2>
          <div className="mt-5 space-y-4">
            {["姓名 / 组织名", "角色：BD / KOL / 代理", "地区", "分成百分比", "释放条件 / 风控条件"].map((field) => (
              <div className="rounded-[8px] border border-[#dbe5ef] bg-[#f8fafc] px-4 py-3 text-sm font-semibold text-[#4b5a6f]" key={field}>{field}</div>
            ))}
          </div>
          <GreenButton className="mt-5 w-full" disabled={!defaultParentId} onClick={() => onCreateSubPromoter(defaultParentId)}>添加下级推广者</GreenButton>
        </PartnerPanel>
        <PartnerPanel>
          <h2 className="text-2xl font-black text-[#172234]">下级删除 / 移除</h2>
          <div className="mt-5 space-y-3">
            {state.promoterTeamNodes.slice(1).map((node) => {
              const promoter = state.promoters.find((item) => item.id === node.promoterId);

              return (
                <div className="grid gap-3 rounded-[8px] border border-[#dbe5ef] bg-[#f8fafc] px-4 py-4 text-sm font-semibold md:grid-cols-[1fr_auto_auto]" key={node.id}>
                  <span>{promoter?.name ?? node.promoterId} · {node.level}级 · 分成 {percent(node.commissionRate)} · 已用 {yen(node.budgetUsed)}</span>
                  <SoftButton className="px-3 py-2 text-xs" onClick={() => onEditPromoter(node.promoterId)}>编辑</SoftButton>
                  <SoftButton className="px-3 py-2 text-xs">删除</SoftButton>
                </div>
              );
            })}
          </div>
        </PartnerPanel>
      </section>
    </div>
  );
}

function OrganizationPage({ initialTab }: { initialTab: OrganizationTab }) {
  const [activeTab, setActiveTab] = useState<OrganizationTab>(initialTab);
  const [editorMode, setEditorMode] = useState<MobilePromoterEditorMode | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <div className="space-y-7">
      <SectionTabs
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: "performance", label: "组织表现" },
          { id: "settings", label: "组织设定" }
        ]}
      />
      {activeTab === "performance" ? (
        <OrganizationPerformancePage onCreateSubPromoter={(parentPromoterId) => setEditorMode({ type: "create", parentPromoterId })} onEditPromoter={(promoterId) => setEditorMode({ type: "edit", promoterId })} />
      ) : (
        <OrganizationSettingsPage onCreateSubPromoter={(parentPromoterId) => setEditorMode({ type: "create", parentPromoterId })} onEditPromoter={(promoterId) => setEditorMode({ type: "edit", promoterId })} />
      )}
      <MobilePromoterFormModal mode={editorMode} onClose={() => setEditorMode(null)} />
    </div>
  );
}

function EarningsPage() {
  const statusCards: Array<[string, string, BadgeTone]> = [
    ["预估中", yen(dashboard.estimatedCommission), "blue"],
    ["待确认", yen(dashboard.pendingCommission), "yellow"],
    ["冻结中", yen(dashboard.riskFrozenAmount), "red"],
    ["可结算", yen(dashboard.withdrawableCommission), "green"],
    ["已支付", yen(dashboard.settledCommission), "green"]
  ];

  return (
    <div className="space-y-7">
      <PageTitle subtitle="佣金不允许直接改金额，必须通过冻结、取消、冲正、补发等记录完成" title="NeeDo 佣金结算中心" />
      <section className="grid gap-4 md:grid-cols-5">
        {statusCards.map(([label, value, tone]) => (
          <PartnerPanel key={label}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#66758b]">{label}</p>
                <strong className="mt-2 block text-2xl font-black text-[#07583b]">{value}</strong>
              </div>
              <Badge tone={tone}>{label}</Badge>
            </div>
          </PartnerPanel>
        ))}
      </section>
      <PartnerPanel>
        <h2 className="text-2xl font-black text-[#172234]">结算批次 / 佣金明细</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="border-b border-[#dbe5ef] text-[#4b5a6f]">
              <tr>{["佣金ID", "订单", "推广者", "模型", "基数", "金额", "状态", "预计结算日"].map((header) => <th className="px-3 py-3 font-black" key={header}>{header}</th>)}</tr>
            </thead>
            <tbody>
              {businessCpsCommissionRecords.map((record) => (
                <tr className="border-b border-[#edf2f7]" key={record.id}>
                  <td className="px-3 py-4 font-black">{record.id}</td>
                  <td className="px-3 py-4">{record.sourceOrder}</td>
                  <td className="px-3 py-4">{getPromoterById(record.promoterId)?.name ?? record.promoterId}</td>
                  <td className="px-3 py-4">{record.model}</td>
                  <td className="px-3 py-4">{yen(record.baseAmount)}</td>
                  <td className="px-3 py-4 font-black text-[#07583b]">{yen(record.commissionAmount)}</td>
                  <td className="px-3 py-4">{commissionStatusLabels[record.status]}</td>
                  <td className="px-3 py-4">{record.expectedSettlementDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PartnerPanel>
    </div>
  );
}

function FunnelBar({
  label,
  value,
  max
}: {
  label: string;
  value: number;
  max: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="h-12 rounded-[8px] border border-[#22c55e] bg-[#bbf7d0]" style={{ width: `${Math.max(12, (value / max) * 100)}%` }} />
        <strong className="whitespace-nowrap text-base text-[#07583b]">{label} {value.toLocaleString("ja-JP")}</strong>
      </div>
    </div>
  );
}

function ReportingPage() {
  const reportTabs = ["活动表现", "链接表现", "素材表现", "组织表现", "佣金报表", "Sub ID / 渠道"];
  const max = 5200;
  const reportRows = [
    ["tech_apply_A", "TikTok", "1820", "168", "42", "890k", "42k", "4.8"],
    ["shop_trial_QR", "线下", "720", "42", "16", "320k", "22k", "3.1"],
    ["user_invite_LINE", "LINE", "1380", "210", "58", "760k", "38k", "3.9"],
    ["x_post_01", "X", "540", "38", "8", "120k", "8k", "1.4"]
  ];

  return (
    <div className="space-y-7">
      <PageTitle subtitle="参考 PartnerStack Reporting：按 Partnership / Link / Commission 分报表，支持筛选、分组、排序、导出" title="NeeDo 数据分析页（Reporting 改造版）" />
      <div className="grid gap-3 md:grid-cols-6">
        {reportTabs.map((tab, index) => <SoftButton active={index === 1} key={tab}>{tab}</SoftButton>)}
      </div>
      <PartnerPanel className="min-h-[680px]">
        <div className="grid gap-10 xl:grid-cols-[0.85fr_1.15fr]">
          <div>
            <h2 className="text-2xl font-black text-[#172234]">转化漏斗</h2>
            <div className="mt-7 space-y-6">
              <FunnelBar label="点击" max={max} value={5200} />
              <FunnelBar label="注册" max={max} value={680} />
              <FunnelBar label="eKYC" max={max} value={420} />
              <FunnelBar label="首单" max={max} value={160} />
              <FunnelBar label="复购" max={max} value={72} />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#172234]">链接表现报表</h2>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-[760px] w-full text-left text-sm">
                <thead className="border-b border-[#dbe5ef] text-[#4b5a6f]">
                  <tr>{["链接", "渠道", "点击", "注册", "首单", "GMV", "返佣", "ROI"].map((header) => <th className="px-3 py-3 font-black" key={header}>{header}</th>)}</tr>
                </thead>
                <tbody>
                  {reportRows.map((row) => (
                    <tr className="border-b border-[#edf2f7]" key={row[0]}>
                      {row.map((cell) => <td className="px-3 py-4" key={cell}>{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-4">
          {["时间: 近30天", "分组: 链接", "筛选: 渠道/活动", "导出 CSV"].map((action, index) => (
            <SoftButton active={index === 3} key={action}>{action}</SoftButton>
          ))}
        </div>
      </PartnerPanel>
    </div>
  );
}

function RiskPage() {
  const queueRows = [
    ["R-1028", "订单#8812", "Tokyo BD A", "同设备+订单时长不足", "78", "¥12,000", "冻结", "通过/取消"],
    ["R-1029", "用户#553", "KOL B", "同IP批量注册", "64", "¥6,000", "待审", "通过/冻结"],
    ["R-1030", "链接#A12", "LINE社群C", "点击异常但注册率极低", "52", "¥0", "观察", "标记/暂停"],
    ["R-1031", "佣金#776", "门店BD D", "退款后已支付需冲正", "88", "¥18,000", "冲正中", "确认冲正"]
  ];

  return (
    <div className="space-y-7">
      <PageTitle subtitle="PartnerStack 有 Reporting/Commissions；NeeDo 需要更强的线下服务风控、LBS、退款、刷单识别" title="NeeDo 防作弊与返佣结算中心" />
      <section className="grid gap-5 md:grid-cols-4">
        <PartnerMetric label="高风险推广者" value="12" tone="red" />
        <PartnerMetric label="冻结返佣" value="¥238k" tone="red" />
        <PartnerMetric label="待审核订单" value="46" tone="red" />
        <PartnerMetric label="退款套利嫌疑" value="8" tone="red" />
      </section>
      <PartnerPanel className="min-h-[620px]">
        <h2 className="text-2xl font-black text-[#172234]">人工审核队列</h2>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[10%]" />
              <col className="w-[13%]" />
              <col className="w-[14%]" />
              <col className="w-[24%]" />
              <col className="w-[9%]" />
              <col className="w-[12%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
            </colgroup>
            <thead className="border-b border-[#dbe5ef] text-[#4b5a6f]">
              <tr>{["风险ID", "对象", "推广者", "触发规则", "风险分", "涉及金额", "状态", "操作"].map((header) => <th className="px-3 py-3 font-black" key={header}>{header}</th>)}</tr>
            </thead>
            <tbody>
              {queueRows.map((row) => (
                <tr className="border-b border-[#edf2f7]" key={row[0]}>
                  {row.map((cell, index) => (
                    <td className={cn("break-words px-3 py-4", index === 4 || index === 6 ? "font-black text-[#c02626]" : "")} key={`${row[0]}-${cell}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ml-auto mt-20 max-w-[560px] rounded-[16px] border border-[#ff6b6b] bg-[#fff1f2] px-7 py-6 text-sm font-black leading-7 text-[#991b1b]">
          自动冻结条件：风险分≥60、订单未过退款期、LBS轨迹异常、同设备多账号、推广者处于观察状态。
        </div>
      </PartnerPanel>
    </div>
  );
}

function DataMonitoringPage() {
  const linkRows = businessCpsPromotionLinks.map((link) => {
    const landing = new URL(link.landingUrl);
    const channel = getChannelById(link.channelId);
    const material = getMaterialById(link.materialId);

    return {
      link,
      channelName: channel?.name ?? link.channelId,
      landingPath: landing.pathname,
      materialTitle: material?.title ?? link.materialId,
      uniqueClicks: Math.round(link.clicks * 0.82),
      referrer: channel?.type === "sns" ? channel.name : channel?.description ?? "direct"
    };
  });

  return (
    <div className="space-y-7">
      <PageTitle subtitle="按链接、落地页、Sub ID、渠道和素材追踪点击到佣金的完整链路" title="数据监控" />
      <section className="grid gap-4 md:grid-cols-4">
        <PartnerMetric label="点击" value={dashboard.todayClicks.toLocaleString("ja-JP")} />
        <PartnerMetric label="唯一点击" value={Math.round(dashboard.todayClicks * 0.82).toLocaleString("ja-JP")} />
        <PartnerMetric label="注册" value={dashboard.todayRegistrations.toLocaleString("ja-JP")} />
        <PartnerMetric label="GMV" value={yen(dashboard.todayGmv)} />
      </section>
      <PartnerPanel>
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-black text-[#172234]">链接表现</h2>
            <p className="mt-1 text-sm font-semibold text-[#4b5a6f]">点击、唯一点击、注册、首单、GMV、佣金、落地页、referrer</p>
          </div>
          <SoftButton>导出 CSV</SoftButton>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="border-b border-[#dbe5ef] text-[#4b5a6f]">
              <tr>{["链接", "点击", "唯一点击", "注册", "首单", "GMV", "佣金", "落地页", "referrer"].map((header) => <th className="px-3 py-3 font-black" key={header}>{header}</th>)}</tr>
            </thead>
            <tbody>
              {linkRows.map(({ link, landingPath, referrer, uniqueClicks }) => (
                <tr className="border-b border-[#edf2f7]" key={link.id}>
                  <td className="px-3 py-4 font-black text-[#07583b]">{link.shortUrl.replace("https://needo.jp/r/", "")}</td>
                  <td className="px-3 py-4">{link.clicks.toLocaleString("ja-JP")}</td>
                  <td className="px-3 py-4">{uniqueClicks.toLocaleString("ja-JP")}</td>
                  <td className="px-3 py-4">{link.registrations.toLocaleString("ja-JP")}</td>
                  <td className="px-3 py-4">{link.firstOrders.toLocaleString("ja-JP")}</td>
                  <td className="px-3 py-4">{yen(link.gmv)}</td>
                  <td className="px-3 py-4">{yen(link.commission)}</td>
                  <td className="px-3 py-4">{landingPath}</td>
                  <td className="px-3 py-4">{referrer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PartnerPanel>
      <PartnerPanel>
        <h2 className="text-2xl font-black text-[#172234]">链接资产</h2>
        <p className="mt-1 text-sm font-semibold text-[#4b5a6f]">链接、落地页、Sub ID、渠道、素材</p>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="border-b border-[#dbe5ef] text-[#4b5a6f]">
              <tr>{["链接", "落地页", "Sub ID", "渠道", "素材", "状态"].map((header) => <th className="px-3 py-3 font-black" key={header}>{header}</th>)}</tr>
            </thead>
            <tbody>
              {linkRows.map(({ link, landingPath, channelName, materialTitle }) => (
                <tr className="border-b border-[#edf2f7]" key={link.signature}>
                  <td className="px-3 py-4 font-semibold">{link.name}</td>
                  <td className="px-3 py-4">{landingPath}</td>
                  <td className="px-3 py-4">{link.signature}</td>
                  <td className="px-3 py-4">{channelName}</td>
                  <td className="px-3 py-4">{materialTitle}</td>
                  <td className="px-3 py-4"><StatusText tone={link.status === "active" ? "green" : link.status === "risk_frozen" ? "red" : "orange"}>{carrierStatusLabels[link.status]}</StatusText></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PartnerPanel>
    </div>
  );
}

function RiskCenterPage() {
  const severityLabels = {
    low: "低",
    medium: "中",
    high: "高"
  };
  const riskScoreBySeverity = {
    low: 28,
    medium: 64,
    high: 88
  };
  const reviewTimes = ["2026-05-16 13:24", "2026-05-16 10:06", "2026-05-15 19:08"];

  return (
    <div className="space-y-7">
      <PageTitle subtitle="按触发规则、风险分、涉及金额和处理状态承接防作弊复核" title="防作弊中心" />
      <section className="grid gap-4 md:grid-cols-4">
        <PartnerMetric label="触发规则" value={businessCpsRiskRules.filter((rule) => rule.enabled).length.toString()} tone="red" />
        <PartnerMetric label="高风险对象" value={businessCpsRiskEvents.filter((event) => event.severity === "high").length.toString()} tone="red" />
        <PartnerMetric label="涉及金额" value={yen(dashboard.riskFrozenAmount)} tone="red" />
        <PartnerMetric label="待处理" value={businessCpsRiskEvents.filter((event) => event.status === "new" || event.status === "reviewing").length.toString()} tone="orange" />
      </section>
      <PartnerPanel>
        <h2 className="text-2xl font-black text-[#172234]">风险报表</h2>
        <p className="mt-1 text-sm font-semibold text-[#4b5a6f]">触发规则、风险分、涉及金额、处理状态</p>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="border-b border-[#dbe5ef] text-[#4b5a6f]">
              <tr>{["对象", "触发规则", "风险分", "涉及金额", "处理状态", "系统动作"].map((header) => <th className="px-3 py-3 font-black" key={header}>{header}</th>)}</tr>
            </thead>
            <tbody>
              {businessCpsRiskEvents.map((event) => (
                <tr className="border-b border-[#edf2f7]" key={event.id}>
                  <td className="px-3 py-4 font-semibold">{event.subject}</td>
                  <td className="px-3 py-4">{event.type}</td>
                  <td className="px-3 py-4 font-black text-[#c02626]">{riskScoreBySeverity[event.severity]}</td>
                  <td className="px-3 py-4">{yen(event.amountFrozen)}</td>
                  <td className="px-3 py-4"><StatusText tone={event.status === "released" ? "green" : event.status === "rejected" ? "red" : "orange"}>{event.status === "new" ? "新触发" : event.status === "reviewing" ? "处理中" : event.status === "released" ? "已释放" : "已驳回"}</StatusText></td>
                  <td className="px-3 py-4">{event.systemAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PartnerPanel>
      <PartnerPanel>
        <h2 className="text-2xl font-black text-[#172234]">规则命中明细</h2>
        <p className="mt-1 text-sm font-semibold text-[#4b5a6f]">规则、对象、推广者、时间、风险等级</p>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="border-b border-[#dbe5ef] text-[#4b5a6f]">
              <tr>{["规则", "对象", "推广者", "时间", "风险等级", "动作"].map((header) => <th className="px-3 py-3 font-black" key={header}>{header}</th>)}</tr>
            </thead>
            <tbody>
              {businessCpsRiskRules.slice(0, 5).map((rule, index) => {
                const event = businessCpsRiskEvents[index % businessCpsRiskEvents.length];
                const promoter = businessCpsPromoters[index % businessCpsPromoters.length];
                const severity = event?.severity ?? "low";

                return (
                  <tr className="border-b border-[#edf2f7]" key={rule.id}>
                    <td className="px-3 py-4 font-semibold">{rule.name}</td>
                    <td className="px-3 py-4">{rule.targetType}</td>
                    <td className="px-3 py-4">{promoter?.name ?? currentPromoter.name}</td>
                    <td className="px-3 py-4">{reviewTimes[index % reviewTimes.length]}</td>
                    <td className="px-3 py-4 font-black text-[#c02626]">{severityLabels[severity]}</td>
                    <td className="px-3 py-4">{rule.action}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PartnerPanel>
    </div>
  );
}

function DataPage({ initialTab }: { initialTab: DataTab }) {
  const [activeTab, setActiveTab] = useState<DataTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <div className="space-y-7">
      <SectionTabs
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: "monitor", label: "数据监控" },
          { id: "risk", label: "防作弊中心" }
        ]}
      />
      {activeTab === "monitor" ? <DataMonitoringPage /> : <RiskCenterPage />}
    </div>
  );
}

function NotificationsPage() {
  const notices = [
    ["活动通知", "东京技师入驻活动已发布，默认链接与 QR 已生成。"],
    ["素材更新", "技师招募海报 A ROI 最高，建议优先使用。"],
    ["结算提醒", "2 条佣金进入可结算，1 条仍处于风控冻结。"],
    ["培训任务", "本周需要完成 PR 标识与违规词学习。"]
  ];

  return (
    <div className="space-y-7">
      <PageTitle subtitle="运营公告、素材更新、结算提醒、培训任务统一进入推广者消息中心" title="NeeDo 消息通知" />
      <section className="grid gap-4 xl:grid-cols-2">
        {notices.map(([title, detail]) => (
          <PartnerPanel key={title}>
            <h2 className="text-xl font-black text-[#172234]">{title}</h2>
            <p className="mt-2 text-base font-semibold leading-7 text-[#4b5a6f]">{detail}</p>
          </PartnerPanel>
        ))}
      </section>
    </div>
  );
}

function IncomePanel() {
  const statusCards: Array<[string, string, BadgeTone]> = [
    ["预估收益", yen(dashboard.estimatedCommission), "blue"],
    ["待确认", yen(dashboard.pendingCommission), "yellow"],
    ["冻结中", yen(dashboard.riskFrozenAmount), "red"],
    ["可提现", yen(dashboard.withdrawableCommission), "green"],
    ["已支付", yen(dashboard.settledCommission), "green"]
  ];

  return (
    <div className="space-y-7">
      <PageTitle subtitle="收益按预估、待确认、冻结、可提现、已支付拆分" title="收益" />
      <section className="grid gap-4 md:grid-cols-5">
        {statusCards.map(([label, value, tone]) => (
          <PartnerPanel key={label}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#66758b]">{label}</p>
                <strong className="mt-2 block text-2xl font-black text-[#07583b]">{value}</strong>
              </div>
              <Badge tone={tone}>{label}</Badge>
            </div>
          </PartnerPanel>
        ))}
      </section>
      <PartnerPanel>
        <h2 className="text-2xl font-black text-[#172234]">收益明细</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[920px] w-full text-left text-sm">
            <thead className="border-b border-[#dbe5ef] text-[#4b5a6f]">
              <tr>{["佣金ID", "订单", "推广者", "模型", "基数", "金额", "状态", "预计结算日"].map((header) => <th className="px-3 py-3 font-black" key={header}>{header}</th>)}</tr>
            </thead>
            <tbody>
              {businessCpsCommissionRecords.map((record) => (
                <tr className="border-b border-[#edf2f7]" key={record.id}>
                  <td className="px-3 py-4 font-black">{record.id}</td>
                  <td className="px-3 py-4">{record.sourceOrder}</td>
                  <td className="px-3 py-4">{getPromoterById(record.promoterId)?.name ?? record.promoterId}</td>
                  <td className="px-3 py-4">{record.model}</td>
                  <td className="px-3 py-4">{yen(record.baseAmount)}</td>
                  <td className="px-3 py-4 font-black text-[#07583b]">{yen(record.commissionAmount)}</td>
                  <td className="px-3 py-4">{commissionStatusLabels[record.status]}</td>
                  <td className="px-3 py-4">{record.expectedSettlementDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PartnerPanel>
    </div>
  );
}

function SettlementPanel() {
  return (
    <div className="space-y-7">
      <PageTitle subtitle="资金结算按批次、冻结、调整、出款方式和财务状态查看" title="资金结算" />
      <section className="grid gap-4 md:grid-cols-4">
        <PartnerMetric label="结算批次" value={businessCpsSettlementBatches.length.toString()} />
        <PartnerMetric label="本期总额" value={yen(businessCpsSettlementBatches.reduce((sum, batch) => sum + batch.grossAmount, 0))} />
        <PartnerMetric label="冻结金额" value={yen(businessCpsSettlementBatches.reduce((sum, batch) => sum + batch.frozenAmount, 0))} tone="red" />
        <PartnerMetric label="可支付" value={yen(businessCpsSettlementBatches.reduce((sum, batch) => sum + batch.payableAmount, 0))} />
      </section>
      <PartnerPanel>
        <h2 className="text-2xl font-black text-[#172234]">资金批次</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[960px] w-full text-left text-sm">
            <thead className="border-b border-[#dbe5ef] text-[#4b5a6f]">
              <tr>{["批次", "推广者", "活动", "总额", "冻结", "调整", "可支付", "状态", "出款方式"].map((header) => <th className="px-3 py-3 font-black" key={header}>{header}</th>)}</tr>
            </thead>
            <tbody>
              {businessCpsSettlementBatches.map((batch) => (
                <tr className="border-b border-[#edf2f7]" key={batch.id}>
                  <td className="px-3 py-4 font-black">{batch.cycle}</td>
                  <td className="px-3 py-4">{getPromoterById(batch.promoterId)?.name ?? batch.promoterId}</td>
                  <td className="px-3 py-4">{getCampaignById(batch.campaignId)?.name ?? batch.campaignId}</td>
                  <td className="px-3 py-4">{yen(batch.grossAmount)}</td>
                  <td className="px-3 py-4 text-[#c02626]">{yen(batch.frozenAmount)}</td>
                  <td className="px-3 py-4">{yen(batch.adjustmentAmount)}</td>
                  <td className="px-3 py-4 font-black text-[#07583b]">{yen(batch.payableAmount)}</td>
                  <td className="px-3 py-4">{settlementBatchStatusLabels[batch.status]}</td>
                  <td className="px-3 py-4">{batch.payoutMethod === "bank" ? "银行转账" : batch.payoutMethod === "ndp_wallet" ? "NDP 钱包" : "人工处理"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PartnerPanel>
      <PartnerPanel>
        <h2 className="text-2xl font-black text-[#172234]">收款设置</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {["收款身份：Afirieito 认证推广者", "默认方式：银行转账", "提现审核：T+7 / 风控通过后"].map((item) => (
            <div className="rounded-[8px] border border-[#dbe5ef] bg-[#f8fafc] px-4 py-4 text-sm font-black text-[#4b5a6f]" key={item}>{item}</div>
          ))}
        </div>
      </PartnerPanel>
    </div>
  );
}

function MePage({ initialTab }: { initialTab: MeTab }) {
  const [activeTab, setActiveTab] = useState<MeTab>(initialTab);
  const permission = getPromoterPermission(currentPromoter.id);
  const children = getPromoterChildren(currentPromoter.id);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <div className="space-y-7">
      <SectionTabs
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: "income", label: "收益" },
          { id: "settlement", label: "资金结算" }
        ]}
      />
      <PartnerPanel>
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-black text-[#172234]">{currentPromoter.name}</h2>
            <p className="mt-1 text-base font-semibold text-[#4b5a6f]">{currentPromoter.identity}</p>
          </div>
          <Badge tone={currentPromoter.status === "active" ? "green" : "yellow"}>{currentPromoter.roleLabel}</Badge>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <PartnerMetric label="邀请码" value={currentPromoter.inviteCode} />
          <PartnerMetric label="渠道" value={currentPromoter.primaryChannel} />
          <PartnerMetric label="直属下级" value={children.length.toString()} />
          <PartnerMetric label="风险分" value={currentPromoter.riskScore.toString()} tone={currentPromoter.riskScore >= 30 ? "orange" : "green"} />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {permission ? Object.entries(permission).filter(([key]) => key !== "promoterId").map(([key, enabled]) => (
            <Badge key={key} tone={enabled ? "green" : "neutral"}>{permissionLabels[key] ?? key}</Badge>
          )) : null}
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="business-cps-primary-action rounded-full px-5 py-2.5 text-sm font-black" to="/afirieito/settings/language">语言切换</Link>
          <Link className="business-cps-primary-action rounded-full px-5 py-2.5 text-sm font-black" to="/afirieito/settings/theme">UI 切换</Link>
          <Link className="business-cps-soft-action rounded-full px-5 py-2.5 text-sm font-black" to="/afirieito/settings/terms">利用规約</Link>
          <Link className="business-cps-soft-action rounded-full px-5 py-2.5 text-sm font-black" to="/afirieito/settings/privacy">個人情報保護方針</Link>
        </div>
      </PartnerPanel>
      {activeTab === "income" ? <IncomePanel /> : <SettlementPanel />}
    </div>
  );
}

function PartnerModuleContent({
  activeModule,
  pathname,
  search
}: {
  activeModule: PartnerModule;
  pathname: string;
  search: string;
}) {
  switch (activeModule) {
    case "plan":
      return <PlanPage initialTab={getPlanTab(pathname, search)} />;
    case "data":
      return <DataPage initialTab={getDataTab(pathname, search)} />;
    case "organization":
      return <OrganizationPage initialTab={getOrganizationTab(pathname, search)} />;
    case "me":
      return <MePage initialTab={getMeTab(pathname, search)} />;
    default:
      return <HomePage />;
  }
}

export function BusinessCpsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const [businessCpsState, setBusinessCpsState] = useState<BusinessCpsRuntimeState>(() => readInitialBusinessCpsMobileState());
  const [notice, setNotice] = useState<BusinessCpsMobileNotice>(null);
  const activeModule = useMemo(() => getActiveModule(location.pathname), [location.pathname]);
  const liveDashboard = useMemo(() => buildBusinessCpsDashboard(businessCpsState), [businessCpsState]);
  const routeRequestsMore = location.pathname.startsWith("/afirieito/more");
  const showHomeHeader = activeModule === "home";
  const onCreateSubPromoter = (input: BusinessCpsSubPromoterInput) => {
    setBusinessCpsState((current) => {
      const result = applyCreateSubPromoter(current, input, "Afirieito H5 新增下级推广者");

      setNotice(result.notice);
      return result.state;
    });
  };
  const onUpdatePromoter = (input: BusinessCpsPromoterUpdateInput) => {
    setBusinessCpsState((current) => {
      const result = applyUpdatePromoter(current, input, "Afirieito H5 编辑推广者资料和分成条件");

      setNotice(result.notice);
      return result.state;
    });
  };
  const runtimeContext = useMemo<BusinessCpsMobileRuntimeContextValue>(
    () => ({
      state: businessCpsState,
      dashboard: liveDashboard,
      notice,
      onCreateSubPromoter,
      onUpdatePromoter
    }),
    [businessCpsState, liveDashboard, notice]
  );
  const closeMore = () => {
    setMoreOpen(false);

    if (routeRequestsMore) {
      navigate("/afirieito");
    }
  };

  useEffect(() => {
    writeBrowserStorage(businessCpsRuntimeStorageKey, JSON.stringify(businessCpsState), { silent: true });
  }, [businessCpsState]);

  return (
    <BusinessCpsMobileRuntimeContext.Provider value={runtimeContext}>
      <MobileShell className="business-cps-shell [--client-bottom-nav-max-width:640px]" navItems={businessNavItems} showTopEdgeMask={false}>
        {showHomeHeader ? <BusinessCpsFloatingHeader onOpenMore={() => setMoreOpen(true)} /> : null}
        <div
          className={cn(
            "business-cps-page min-h-screen px-3 pb-[calc(env(safe-area-inset-bottom)+8rem)] md:px-8 md:pb-10 lg:px-7",
            showHomeHeader ? "pt-2" : "pt-0"
          )}
        >
          <div className="mx-auto max-w-[1180px]">
            <main className="min-w-0 flex-1 space-y-6">
              {notice ? (
                <div className={cn("rounded-[18px] px-4 py-3 text-sm font-black", notice.tone === "error" ? "bg-[#fff1f0] text-[#b42318]" : "bg-[#effaf3] text-[#07583b]")}>
                  {notice.message}
                </div>
              ) : null}
              <PartnerModuleContent activeModule={activeModule} pathname={location.pathname} search={location.search} />
            </main>
          </div>
        </div>
        <MoreNavigationModal onClose={closeMore} open={moreOpen || routeRequestsMore} />
      </MobileShell>
    </BusinessCpsMobileRuntimeContext.Provider>
  );
}
