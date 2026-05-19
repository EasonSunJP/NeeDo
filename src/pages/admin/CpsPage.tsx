import { createContext, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { AdminToggleSwitch } from "../../components/admin/AdminToggleSwitch";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { findCpsSidebarPageByPath, normalizeCpsAdminPath, type CpsSidebarPage, type CpsWorkspaceModuleKey } from "../../components/cps/sidebar/cpsSidebarMenus";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { FilterBar } from "../../components/ui/FilterBar";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import {
	  businessCpsAttributionConfigs,
	  businessCpsAttributionRecords,
	  businessCpsAdjustments,
	  businessCpsChannels,
	  businessCpsFlowSteps,
	  businessCpsMaterials,
	  businessCpsMerchantLeads,
	  businessCpsRiskRules,
	  businessCpsTrackingEvents,
	  businessCpsWalletLedgers,
	  campaignStatusLabels,
	  campaignTypeLabels,
	  carrierStatusLabels,
	  commissionBasisLabels,
	  commissionStatusDescriptions,
	  commissionStatusLabels,
	  businessCpsMaxCommissionTierCount,
	  businessCpsTierRequirementLabels,
	  getBusinessCpsTeamNodeCommissionProfile,
	  getBusinessCpsTierConditionSnapshot,
	  getPlanWizardCopy,
	  getBudgetUsage,
	  getCampaignById,
	  getCampaignRules,
	  getChannelById,
	  getMaterialById,
	  getPromotionLinkById,
	  merchantLeadStatusLabels,
	  phaseOneAcceptanceItems,
	  createInitialPlanWizardFlatRatePayoutDraft,
	  planWizardFlatRatePayoutItems,
	  planWizardFlatRatePeriodOptions,
	  planWizardPayoutValueModeOptions,
	  planWizardSteps,
	  settlementBatchStatusLabels,
	  sponsorLabels,
	  translatePlanCategoryDraft,
	  trackingEventLabels,
	  type BusinessCpsBudgetMode,
	  type BusinessCpsCampaign,
	  type BusinessCpsCampaignStatus,
	  type BusinessCpsCarrierStatus,
	  type BusinessCpsCommissionBasis,
	  type BusinessCpsCommissionRecord,
	  type BusinessCpsCommissionConditionRule,
	  type BusinessCpsMerchantLead,
	  type BusinessCpsPromoter,
	  type BusinessCpsRole,
	  type BusinessCpsCommissionTierRule,
	  type BusinessCpsDowngradeCondition,
	  type BusinessCpsLevelPromotionCondition,
	  type BusinessCpsPreferentialCondition,
	  type BusinessCpsSettlementBatchStatus,
	  type CommissionStatus,
	  type MerchantLeadStatus,
	  type PlanWizardFieldConfig,
	  type PlanWizardFlatRatePayoutDraft,
	  type PlanWizardFlatRatePeriodKey,
	  type PlanWizardFlatRatePayoutKey,
	  type PlanWizardLocale,
	  type PlanWizardLocalizedText,
	  type PlanWizardPayoutValueMode,
	  type RiskSeverity
	} from "../../features/business-cps/model";
import {
  applyCreateSubPromoter,
  applyCampaignAction,
  applyCarrierAction,
  applyCommissionAction,
  applyUpdatePromoter,
  applyRiskAction,
  applySettlementAction,
  buildBusinessCpsDashboard,
  buildBusinessCpsLogicDiagnostics,
  businessCpsRuntimeStorageKey,
  campaignActionLabels,
  carrierActionLabels,
  commissionActionLabels,
  getAvailableCampaignActions,
  getAvailableCarrierActions,
  getAvailableCommissionActions,
  getAvailableRiskActions,
  getAvailableSettlementActions,
  legacyBusinessCpsRuntimeStorageKey,
  normalizeBusinessCpsRuntimeState,
  riskActionLabels,
  settlementActionLabels,
  validatePromotionLink,
  type BusinessCpsCampaignAction,
  type BusinessCpsCarrierAction,
  type BusinessCpsCommissionAction,
  type BusinessCpsDashboardSnapshot,
  type BusinessCpsNoticeTone,
  type BusinessCpsRiskAction,
  type BusinessCpsRuntimeState,
  type BusinessCpsSubPromoterInput,
  type BusinessCpsPromoterUpdateInput,
  type BusinessCpsSettlementAction
} from "../../features/business-cps/logic";
import { parseBrowserStorageJson, writeBrowserStorage } from "../../lib/browserStorage";
import { cn, percent, yen } from "../../lib/utils";
import { useI18n } from "../../i18n/I18nProvider";
import { AdminDocsWorkspace } from "../../features/admin-docs/AdminDocsWorkspace";
import { AdminNotificationComposeContent } from "./AdminNotificationComposePage";
import { AdminNotificationsContent } from "./AdminNotificationsPage";
import { CpsAccountManagementPage } from "../cps-admin/CpsAccountManagementPage";
import { CpsPlaceholderPage } from "../cps-admin/CpsPlaceholderPage";

export type CpsWorkspaceScope = "ops-sync" | "business-admin";

type CpsModule = CpsWorkspaceModuleKey;

const opsSyncModuleTitles: Record<CpsModule, { title: string; description: string }> = {
  dashboard: {
    title: "Afirieito 数据同步总览",
    description: "产运后台同步独立 Afirieito 系统的所有数据，用于总控、复核、财务和风控裁决。"
  },
  linkData: {
    title: "Afirieito 链接数据同步",
    description: "同步每条发行链接的曝光、点击、注册、认证、首购、复购、返佣和风险数据。"
  },
  plans: {
    title: "Afirieito 推广计划数据",
    description: "从独立 NDA管理后台同步推广计划、商户、达人、地区、状态、类型和预算数据。"
  },
  wizard: {
    title: "Afirieito 计划配置镜像",
    description: "产运后台只展示 NDA管理后台的计划配置镜像，用于复核关键配置与发布版本。"
  },
  team: {
    title: "Afirieito 组织同步",
    description: "同步推广者组织层级、层级权限、预算继承、目标拆分和组织风险状态。"
  },
  links: {
    title: "Afirieito 链接 / 码 / QR 同步",
    description: "同步短链、推广码、二维码、落地页、素材绑定、状态和追踪签名。"
  },
  materials: {
    title: "Afirieito 素材与渠道同步",
    description: "同步素材库、分类渠道、素材 ROI、渠道异常率和 PR 合规状态。"
  },
  crm: {
    title: "Afirieito 招商 CRM 数据",
    description: "同步 NDA管理后台中的招商 CRM 状态流，供产运后台跟进和复核。"
  },
  tracking: {
    title: "Afirieito 原始追踪事件",
    description: "同步曝光、点击、扫码、注册、eKYC、订单、支付、退款和返佣事件流水。"
  },
  attribution: {
    title: "Afirieito 归因与佣金结算数据",
    description: "同步每笔 Booking、Request、SaaS 或会员订单的来源路径、证据和佣金状态机。"
  },
  settlement: {
    title: "Afirieito 结算与财务对账数据",
    description: "同步预估、冻结、可结算、已支付、冲正和导出批次。"
  },
  wallet: {
    title: "Afirieito NDP 与钱包账本数据",
    description: "同步 Afirieito 钱包账本，区分推广者收益、商户预算、平台增长预算、NDP 点数和冻结资产。"
  },
  risk: {
    title: "Afirieito 风控审计数据",
    description: "同步 Afirieito 风险事件，产运后台负责最终冻结、解冻、驳回、追回和审计留痕。"
  },
  promoters: {
    title: "Afirieito 推广者数据",
    description: "同步认证达人、BD、区域代理、商户老板和技师招募者的收益、渠道、身份和风险视图。"
  },
  serviceRules: {
    title: "Afirieito 规则",
    description: "同步店铺活跃数、一周订单数和阶梯分成引用的公共判定条件。"
  }
};

const businessAdminModuleTitles: Record<CpsModule, { title: string; description: string }> = {
  dashboard: {
    title: "统计数据",
    description: "查看 Afirieito 整体统计、增长趋势、归因 GMV、佣金成本、ROI 和风险冻结数据。"
  },
  linkData: {
    title: "链接数据",
    description: "按发行链接查看曝光、点击、注册、认证、首购、复购、返佣和风险数据。"
  },
  plans: {
    title: "推广计划管理",
    description: "创建、审核、暂停和复用 Afirieito 推广计划，管理预算、地区、参与者和佣金规则。"
  },
  wizard: {
    title: "新建推广计划",
    description: "在 NDA管理后台配置计划、佣金、归因、素材、预算、风控和发布版本。"
  },
  team: {
    title: "组织与推广者层级",
    description: "管理多级推广组织、层级权限、预算继承、目标拆分和下级风险。"
  },
  links: {
    title: "推广链接生成",
    description: "配置最终 URL、追踪参数、落地页选项和页面弹窗规则，生成可投放的 Afirieito 推广链接。"
  },
  materials: {
    title: "推广素材生成",
    description: "按落地页、组件和嵌入部件管理 Afirieito 推广素材，生成可投放、可复制、可追踪的前端组件。"
  },
  crm: {
    title: "招商 CRM",
    description: "管理商户招商线索、跟进状态、eKYC、首单和 SaaS 购买进度。"
  },
  tracking: {
    title: "追踪记录",
    description: "查看原始事件流水，按活动、推广者、链接、码、QR、素材和渠道追溯。"
  },
  attribution: {
    title: "订单归因与佣金结算",
    description: "处理 Booking、Request、SaaS 或会员订单的来源路径、证据和佣金状态机。"
  },
  settlement: {
    title: "返佣结算与财务对账",
    description: "处理结算批次、冻结释放、冲正、付款状态和导出审计。"
  },
  wallet: {
    title: "NDP 与钱包账本",
    description: "管理推广者收益、商户预算、平台增长预算、NDP 点数和冻结资产。"
  },
  risk: {
    title: "风控审计",
    description: "处理风险事件、冻结解冻、驳回追回、违规素材和审计留痕。"
  },
  promoters: {
    title: "推广者管理",
    description: "管理认证达人、BD、区域代理、商户老板和技师招募者的收益、渠道、身份和风险视图。"
  },
  serviceRules: {
    title: "规则",
    description: "设置店铺活跃数、一周订单量和阶梯分成引用的服务规则。"
  }
};

const campaignStatusTone: Record<BusinessCpsCampaignStatus, BadgeTone> = {
  draft: "neutral",
  reviewing: "yellow",
  scheduled: "blue",
  active: "green",
  paused: "neutral",
  budget_exhausted: "red",
  risk_paused: "red",
  ended: "dark",
  archived: "neutral"
};

const carrierStatusTone: Record<BusinessCpsCarrierStatus, BadgeTone> = {
  active: "green",
  paused: "yellow",
  expired: "neutral",
  discarded: "dark",
  risk_frozen: "red"
};

const commissionStatusTone: Record<CommissionStatus, BadgeTone> = {
  estimated: "blue",
  pending: "yellow",
  locked: "neutral",
  withdrawable: "green",
  withdrawing: "blue",
  paid: "green",
  risk_frozen: "red",
  cancelled: "red",
  clawed_back: "red"
};

const leadStatusTone: Record<MerchantLeadStatus, BadgeTone> = {
  lead: "neutral",
  contacted: "blue",
  docs_submitted: "yellow",
  onboarded: "green",
  first_order: "green",
  saas_purchased: "dark"
};

const settlementStatusTone: Record<BusinessCpsSettlementBatchStatus, BadgeTone> = {
  draft: "neutral",
  reviewing: "yellow",
  approved: "green",
  paid: "blue",
  rejected: "red"
};

const riskTone: Record<RiskSeverity, BadgeTone> = {
  low: "yellow",
  medium: "red",
  high: "red"
};

type CpsRuntimeNotice = {
  tone: BusinessCpsNoticeTone;
  message: string;
} | null;

type PromoterEditorMode =
  | { type: "create"; parentPromoterId?: string; level?: number }
  | { type: "edit"; promoterId: string };

type CpsRuntimeContextValue = {
  state: BusinessCpsRuntimeState;
  dashboard: BusinessCpsDashboardSnapshot;
  diagnostics: ReturnType<typeof buildBusinessCpsLogicDiagnostics>;
  notice: CpsRuntimeNotice;
  onCreateSubPromoter: (input: BusinessCpsSubPromoterInput) => void;
  onUpdatePromoter: (input: BusinessCpsPromoterUpdateInput) => void;
  onCampaignAction: (campaign: BusinessCpsCampaign, action: BusinessCpsCampaignAction) => void;
  onCarrierAction: (linkId: string, action: BusinessCpsCarrierAction) => void;
  onCommissionAction: (commissionId: string, action: BusinessCpsCommissionAction) => void;
  onRiskAction: (riskId: string, action: BusinessCpsRiskAction) => void;
  onSettlementAction: (batchId: string, action: BusinessCpsSettlementAction) => void;
  onUpdateServiceRule: (ruleId: string, patch: { activeShopWeeklyOrders?: number; status?: "active" | "draft" | "paused" }) => void;
  onUpdateCommissionConditionRule: (ruleId: string, patch: Partial<BusinessCpsCommissionConditionRule>) => void;
};

const CpsRuntimeContext = createContext<CpsRuntimeContextValue | null>(null);

function readInitialCpsRuntimeState() {
  const stored = parseBrowserStorageJson<Partial<BusinessCpsRuntimeState> | null>(businessCpsRuntimeStorageKey, null, { removeOnError: true, silent: true });
  const legacyStored = parseBrowserStorageJson<Partial<BusinessCpsRuntimeState> | null>(legacyBusinessCpsRuntimeStorageKey, null, { removeOnError: true, silent: true });

  return normalizeBusinessCpsRuntimeState(stored ?? legacyStored ?? {});
}

function useCpsRuntime() {
  const context = useContext(CpsRuntimeContext);

  if (!context) {
    throw new Error("CpsRuntimeContext is missing");
  }

  return context;
}

function askOperationReason(action: string, target: string) {
  if (typeof window === "undefined") {
    return `${action}: ${target}`;
  }

  return window.prompt(`请输入「${action}」的操作原因\\n对象：${target}\\n原因会写入 Afirieito 操作日志。`, `${action}：业务复核通过`) ?? "";
}

function CpsNoticeBanner() {
  const { notice } = useCpsRuntime();

  if (!notice) {
    return null;
  }

  const toneClassName = {
    success: "border-moss/30 bg-mint/15 text-ink",
    warning: "border-amber-300 bg-amber-50 text-amber-900",
    error: "border-coral/40 bg-coral/10 text-ink"
  }[notice.tone];

  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm font-semibold shadow-panel", toneClassName)}>
      {notice.message}
    </div>
  );
}

function LogicDiagnosticsPanel() {
  const { diagnostics } = useCpsRuntime();

  return (
    <AdminCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-moss">Logic Gate</p>
          <h2 className="mt-1 text-lg font-black">业务逻辑校验</h2>
        </div>
        <Badge tone={diagnostics.some((item) => item.tone === "error") ? "red" : diagnostics.some((item) => item.tone === "warning") ? "yellow" : "green"}>
          {diagnostics.some((item) => item.tone === "error") ? "需要处理" : diagnostics.some((item) => item.tone === "warning") ? "有提醒" : "通过"}
        </Badge>
      </div>
      <div className="mt-4 grid gap-2 lg:grid-cols-2">
        {diagnostics.slice(0, 6).map((item) => (
          <div className="rounded-lg bg-paper p-3" key={item.id}>
            <div className="flex items-center justify-between gap-3">
              <strong className="text-sm">{item.title}</strong>
              <Badge tone={item.tone === "error" ? "red" : item.tone === "warning" ? "yellow" : "green"}>
                {item.tone === "error" ? "错误" : item.tone === "warning" ? "提醒" : "正常"}
              </Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-ink/55">{item.detail}</p>
          </div>
        ))}
      </div>
    </AdminCard>
  );
}

function ActionChip({
  children,
  onClick,
  tone = "default"
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      className={cn(
        "focus-ring inline-flex h-8 items-center rounded-full border px-3 text-xs font-black transition",
        tone === "danger" ? "border-coral/40 bg-coral/10 text-coral hover:bg-coral hover:text-white" : "border-line bg-white text-ink/65 hover:border-moss hover:text-moss"
      )}
      data-no-drag-scroll="true"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      type="button"
    >
      {children}
    </button>
  );
}

function getActiveModule(value: string | null): CpsModule {
  if (value === "linkData" || value === "link-data" || value === "link-data-report" || value === "issued-links") {
    return "linkData";
  }

  if (value === "plans" || value === "campaigns") {
    return "plans";
  }

  if (value === "wizard" || value === "create") {
    return "wizard";
  }

  if (value === "team" || value === "sub-promoters" || value === "tree") {
    return "team";
  }

  if (value === "links" || value === "codes" || value === "qr" || value === "qrcode" || value === "carriers") {
    return "links";
  }

  if (value === "materials" || value === "channels" || value === "assets") {
    return "materials";
  }

  if (value === "crm" || value === "leads" || value === "sales") {
    return "crm";
  }

  if (value === "tracking" || value === "events" || value === "logs") {
    return "tracking";
  }

  if (value === "attribution" || value === "commissions") {
    return "attribution";
  }

  if (value === "settlement" || value === "finance-settlement" || value === "payouts" || value === "reconcile") {
    return "settlement";
  }

  if (value === "wallet" || value === "ndp" || value === "budget") {
    return "wallet";
  }

  if (value === "risk" || value === "audit") {
    return "risk";
  }

  if (value === "promoters" || value === "brokers" || value === "channels" || value === "agents") {
    return "promoters";
  }

  if (value === "serviceRules" || value === "service-rules" || value === "management-service") {
    return "serviceRules";
  }

  return "dashboard";
}

function AdminCard({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("rounded-lg border border-line bg-white p-4 shadow-panel", className)}>{children}</section>;
}

function MetricCard({
  label,
  value,
  caption,
  tone = "default",
  className,
  ...articleProps
}: {
  label: string;
  value: string;
  caption?: string;
  tone?: "default" | "green" | "red" | "dark";
} & HTMLAttributes<HTMLElement>) {
  const toneClassName = {
    default: "bg-white",
    green: "bg-mint/20",
    red: "bg-coral/10",
    dark: "bg-ink text-white"
  }[tone];

  return (
    <article {...articleProps} className={cn("rounded-lg border border-line p-4 shadow-panel", toneClassName, className)}>
      <p className={cn("text-sm", tone === "dark" ? "text-white/60" : "text-ink/55")}>{label}</p>
      <strong className="mt-2 block break-words text-2xl font-black">{value}</strong>
      {caption ? <p className={cn("mt-2 text-xs", tone === "dark" ? "text-white/55" : "text-ink/50")}>{caption}</p> : null}
    </article>
  );
}

function getModulePath(routeBase: string, moduleId: CpsModule) {
  return moduleId === "dashboard" ? routeBase : `${routeBase}?module=${moduleId}`;
}

function ProgressBar({ value, label }: { value: number; label?: string }) {
  const safeValue = Math.min(100, Math.max(0, value));

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3">
      <div className="h-2 overflow-hidden rounded-full bg-black/5">
        <div className="h-full rounded-full bg-moss" style={{ width: `${safeValue}%` }} />
      </div>
      <span className="min-w-[3.2rem] text-right text-xs font-black text-ink/55">{label ?? `${Math.round(safeValue)}%`}</span>
    </div>
  );
}

type CpsTrendChartType = "line" | "bar";
type CpsTrendSeriesKey = "gmv" | "orders" | "registrations" | "commission" | "roi" | "riskFrozen";
type CpsTrendRow = Record<CpsTrendSeriesKey, number> & { label: string };
type CpsTrendSeriesStats = {
  first: number;
  latest: number;
  max: number;
  min: number;
  total: number;
  growth: number;
  peak: CpsTrendRow;
};

const cpsTrendSeriesOrder: CpsTrendSeriesKey[] = ["gmv", "orders", "registrations", "commission", "roi", "riskFrozen"];
const cpsTrendChartHeight = 280;
const cpsTrendChartFallbackWidth = 960;
const cpsTrendChartPadding = {
  top: 28,
  right: 24,
  bottom: 40,
  left: 76
};

const cpsTrendSeriesMeta: Record<CpsTrendSeriesKey, { label: string; unit: string; color: string; soft: string }> = {
  gmv: {
    label: "归因 GMV",
    unit: "JPY",
    color: "var(--admin-accent, #4b7cff)",
    soft: "color-mix(in srgb, var(--admin-accent, #4b7cff) 18%, transparent)"
  },
  orders: {
    label: "Afirieito 订单",
    unit: "单",
    color: "#ff5c72",
    soft: "rgba(255, 92, 114, 0.18)"
  },
  registrations: {
    label: "新增注册",
    unit: "人",
    color: "#69e6c4",
    soft: "rgba(105, 230, 196, 0.18)"
  },
  commission: {
    label: "佣金成本",
    unit: "JPY",
    color: "var(--admin-warning, #ffb84d)",
    soft: "color-mix(in srgb, var(--admin-warning, #ffb84d) 20%, transparent)"
  },
  roi: {
    label: "ROI",
    unit: "x",
    color: "#9f7aff",
    soft: "rgba(159, 122, 255, 0.18)"
  },
  riskFrozen: {
    label: "风险冻结",
    unit: "JPY",
    color: "#ff7a45",
    soft: "rgba(255, 122, 69, 0.18)"
  }
};

function buildCpsTrendRows(dashboard: BusinessCpsDashboardSnapshot): CpsTrendRow[] {
  const labels = ["5/11", "5/12", "5/13", "5/14", "5/15", "5/16", "5/17"];
  const gmvFactors = [0.58, 0.65, 0.74, 0.82, 0.91, 0.96, 1];
  const orderFactors = [0.56, 0.61, 0.72, 0.84, 0.88, 0.94, 1];
  const registrationFactors = [0.5, 0.58, 0.69, 0.77, 0.9, 0.97, 1];
  const commissionFactors = [0.52, 0.6, 0.7, 0.8, 0.87, 0.94, 1];
  const riskFactors = [0.72, 0.66, 0.6, 0.54, 0.49, 0.46, 1];

  return labels.map((label, index) => ({
    label,
    gmv: Math.round(dashboard.todayGmv * gmvFactors[index]),
    orders: Math.round(dashboard.cpsOrders * orderFactors[index]),
    registrations: Math.round(dashboard.newUsers * registrationFactors[index]),
    commission: Math.round(dashboard.commissionSpend * commissionFactors[index]),
    roi: Number((3.7 + index * 0.25 + (index >= 4 ? 0.3 : 0)).toFixed(1)),
    riskFrozen: Math.round(dashboard.riskFrozenAmount * riskFactors[index])
  }));
}

function getCpsTrendValue(row: CpsTrendRow, series: CpsTrendSeriesKey) {
  return row[series];
}

function normalizeCpsTrendValue(value: number, min: number, max: number) {
  if (max === min) {
    return 56;
  }

  return 10 + ((value - min) / (max - min)) * 84;
}

function formatCompactYen(value: number) {
  const absoluteValue = Math.abs(value);

  if (absoluteValue >= 1000000) {
    return `¥${(value / 1000000).toFixed(1)}M`;
  }

  if (absoluteValue >= 10000) {
    return `¥${(value / 10000).toFixed(1)}万`;
  }

  return yen(value);
}

function formatCpsTrendValue(series: CpsTrendSeriesKey, value: number) {
  if (series === "gmv" || series === "commission" || series === "riskFrozen") {
    return formatCompactYen(value);
  }

  if (series === "roi") {
    return `${value.toFixed(1)}x`;
  }

  return `${value.toLocaleString("ja-JP")}${series === "orders" ? "单" : "人"}`;
}

function getCpsTrendPoint(
  row: CpsTrendRow,
  series: CpsTrendSeriesKey,
  stats: CpsTrendSeriesStats,
  index: number,
  total: number,
  chartWidth: number
) {
  const plotWidth = chartWidth - cpsTrendChartPadding.left - cpsTrendChartPadding.right;
  const plotHeight = cpsTrendChartHeight - cpsTrendChartPadding.top - cpsTrendChartPadding.bottom;
  const x = cpsTrendChartPadding.left + (index / Math.max(1, total - 1)) * plotWidth;
  const normalizedValue = normalizeCpsTrendValue(getCpsTrendValue(row, series), stats.min, stats.max);
  const y = cpsTrendChartPadding.top + plotHeight - (normalizedValue / 100) * plotHeight;

  return { x, y };
}

function ChartTypeIcon({ type }: { type: CpsTrendChartType }) {
  return type === "bar" ? (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M5 19V9M12 19V5M19 19v-7" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
    </svg>
  ) : (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="m4 16 5-5 4 3 7-8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
      <path d="M4 20h16" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function CpsTrendChart() {
  const { dashboard } = useCpsRuntime();
  const [chartType, setChartType] = useState<CpsTrendChartType>("line");
  const [selectedSeries, setSelectedSeries] = useState<CpsTrendSeriesKey[]>(cpsTrendSeriesOrder);
  const [selectedIndex, setSelectedIndex] = useState(6);
  const chartHostRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(cpsTrendChartFallbackWidth);
  const rows = useMemo(() => buildCpsTrendRows(dashboard), [dashboard]);
  const selectedRow = rows[selectedIndex] ?? rows[rows.length - 1];
  const plotWidth = chartWidth - cpsTrendChartPadding.left - cpsTrendChartPadding.right;
  const plotHeight = cpsTrendChartHeight - cpsTrendChartPadding.top - cpsTrendChartPadding.bottom;
  const seriesStats = useMemo(
    () =>
      cpsTrendSeriesOrder.reduce(
        (result, series) => {
          const values = rows.map((row) => getCpsTrendValue(row, series));
          const first = values[0];
          const latest = values[values.length - 1];
          const max = Math.max(...values);
          const min = Math.min(...values);
          const peak = rows.reduce((best, row) => (getCpsTrendValue(row, series) > getCpsTrendValue(best, series) ? row : best), rows[0]);

          result[series] = {
            first,
            latest,
            max,
            min,
            total: values.reduce((sum, value) => sum + value, 0),
            growth: first === 0 ? 0 : ((latest - first) / first) * 100,
            peak
          };

          return result;
        },
        {} as Record<CpsTrendSeriesKey, CpsTrendSeriesStats>
      ),
    [rows]
  );
  const totals = useMemo(
    () => ({
      gmv: rows.reduce((sum, row) => sum + row.gmv, 0),
      orders: rows.reduce((sum, row) => sum + row.orders, 0),
      registrations: rows.reduce((sum, row) => sum + row.registrations, 0),
      commission: rows.reduce((sum, row) => sum + row.commission, 0),
      roi: rows.reduce((sum, row) => sum + row.roi, 0) / rows.length,
      riskFrozen: rows[rows.length - 1]?.riskFrozen ?? 0
    }),
    [rows]
  );

  useEffect(() => {
    const host = chartHostRef.current;

    if (!host) {
      return;
    }

    const syncWidth = () => setChartWidth(Math.max(720, Math.round(host.clientWidth)));

    syncWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncWidth);

      return () => window.removeEventListener("resize", syncWidth);
    }

    const observer = new ResizeObserver(syncWidth);

    observer.observe(host);

    return () => observer.disconnect();
  }, []);

  const toggleSeries = (series: CpsTrendSeriesKey) => {
    setSelectedSeries((current) => {
      if (current.includes(series)) {
        return current.length === 1 ? current : current.filter((item) => item !== series);
      }

      return cpsTrendSeriesOrder.filter((item) => current.includes(item) || item === series);
    });
  };

  const summaryCards: Array<{ label: string; value: string; caption: string }> = [
    { label: "近 7 日 GMV", value: formatCompactYen(totals.gmv), caption: "Afirieito 归因确认交易额" },
    { label: "Afirieito 订单", value: `${totals.orders.toLocaleString("ja-JP")}单`, caption: "Booking / Request / SaaS" },
    { label: "新增注册", value: `${totals.registrations.toLocaleString("ja-JP")}人`, caption: "推广链路注册用户" },
    { label: "佣金成本", value: formatCompactYen(totals.commission), caption: `平均 ROI ${totals.roi.toFixed(1)}x` },
    { label: "最新 ROI", value: formatCpsTrendValue("roi", selectedRow.roi), caption: `${selectedRow.label} 综合回报` },
    { label: "风险冻结", value: formatCompactYen(totals.riskFrozen), caption: "当前待复核资产" }
  ];
  const trendInfo = (
    <div className="space-y-2">
      <p>近 7 日 Afirieito 归因 GMV、订单、新增注册、佣金成本、ROI 与风险冻结金额。纵轴按每个指标在当前区间内归一化，底部卡片展示真实数值。</p>
      <div className="grid gap-1.5 text-xs font-semibold leading-5 text-ink/65">
        {summaryCards.map((item) => (
          <p className="flex gap-2" key={item.label}>
            <span className="min-w-[68px] font-black text-ink">{item.label}</span>
            <span>{item.caption}</span>
          </p>
        ))}
      </div>
    </div>
  );

  return (
    <AdminCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <TitleWithInfo
          as="h2"
          info={trendInfo}
          label="Afirieito增长趋势说明"
          title="Afirieito 增长趋势"
          titleClassName="text-lg font-black"
        />
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs font-black">
          {(["bar", "line"] as CpsTrendChartType[]).map((type) => (
            <button
              aria-label={type === "bar" ? "柱状图" : "折线图"}
              className={cn(
                "grid h-9 w-9 place-items-center rounded-lg border transition",
                chartType === type ? "border-[color:var(--admin-accent)] bg-ink text-white shadow-[0_0_0_2px_color-mix(in_srgb,var(--admin-accent)_24%,transparent)]" : "border-line bg-paper text-ink/55"
              )}
              key={type}
              onClick={() => setChartType(type)}
              title={type === "bar" ? "柱状图" : "折线图"}
              type="button"
            >
              <ChartTypeIcon type={type} />
            </button>
          ))}
          {cpsTrendSeriesOrder.map((series) => {
            const selected = selectedSeries.includes(series);

            return (
              <button
                aria-pressed={selected}
                className={cn("rounded-lg border px-3 py-2 transition", selected ? "border-transparent bg-[color:var(--admin-accent)] text-white" : "border-line bg-paper text-ink/55")}
                key={series}
                onClick={() => toggleSeries(series)}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="mr-1.5 inline-block size-2 rounded-full align-middle"
                  style={{ background: selected ? "#ffffff" : cpsTrendSeriesMeta[series].color }}
                />
                {cpsTrendSeriesMeta[series].label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        {summaryCards.map((item) => (
          <article className="rounded-lg border border-line bg-paper px-3 py-2.5" key={item.label}>
            <p className="text-xs font-black text-ink/55">{item.label}</p>
            <strong className="mt-1 block text-lg text-ink" data-no-i18n>
              {item.value}
            </strong>
          </article>
        ))}
      </div>

      <div className="mt-5 rounded-lg border border-line bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-ink/50">
          <span>单位：金额 JPY / 订单 单 / 注册 人 / ROI x</span>
          <span data-no-i18n>
            选中 {selectedRow.label} · {selectedSeries.map((series) => `${cpsTrendSeriesMeta[series].label} ${formatCpsTrendValue(series, selectedRow[series])}`).join(" / ")}
          </span>
        </div>

        <div className="min-w-0" ref={chartHostRef}>
          <svg className="block h-[280px] w-full overflow-visible" height={cpsTrendChartHeight} role="img" viewBox={`0 0 ${chartWidth} ${cpsTrendChartHeight}`} width="100%">
            <text fill="currentColor" fontSize="12" fontWeight="800" opacity="0.55" x="0" y="14">
              趋势指数
            </text>
            {[100, 75, 50, 25, 0].map((tick) => {
              const y = cpsTrendChartPadding.top + ((100 - tick) / 100) * plotHeight;

              return (
                <g key={tick}>
                  <text fill="currentColor" fontSize="11" fontWeight="800" opacity="0.44" textAnchor="end" x={cpsTrendChartPadding.left - 14} y={y + 4}>
                    {tick}
                  </text>
                  <line
                    stroke="currentColor"
                    strokeDasharray="5 7"
                    strokeOpacity="0.18"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                    x1={cpsTrendChartPadding.left}
                    x2={chartWidth - cpsTrendChartPadding.right}
                    y1={y}
                    y2={y}
                  />
                </g>
              );
            })}
            <line
              stroke="currentColor"
              strokeOpacity="0.28"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              x1={cpsTrendChartPadding.left}
              x2={cpsTrendChartPadding.left}
              y1={cpsTrendChartPadding.top}
              y2={cpsTrendChartPadding.top + plotHeight}
            />
            <line
              stroke="currentColor"
              strokeOpacity="0.28"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              x1={cpsTrendChartPadding.left}
              x2={chartWidth - cpsTrendChartPadding.right}
              y1={cpsTrendChartPadding.top + plotHeight}
              y2={cpsTrendChartPadding.top + plotHeight}
            />

            {chartType === "line"
              ? selectedSeries.map((series) => (
                  <polyline
                    fill="none"
                    key={series}
                    points={rows
                      .map((row, index) => {
                        const point = getCpsTrendPoint(row, series, seriesStats[series], index, rows.length, chartWidth);

                        return `${point.x},${point.y}`;
                      })
                      .join(" ")}
                    stroke={cpsTrendSeriesMeta[series].color}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="4"
                    vectorEffect="non-scaling-stroke"
                  />
                ))
              : rows.map((row, rowIndex) => {
                  const groupWidth = plotWidth / rows.length;
                  const barGap = 4;
                  const barWidth = Math.max(5, Math.min(26, (groupWidth - 18) / selectedSeries.length - barGap));
                  const groupX = cpsTrendChartPadding.left + groupWidth * rowIndex + groupWidth / 2 - (selectedSeries.length * barWidth + (selectedSeries.length - 1) * barGap) / 2;

                  return selectedSeries.map((series, seriesIndex) => {
                    const normalizedValue = normalizeCpsTrendValue(getCpsTrendValue(row, series), seriesStats[series].min, seriesStats[series].max);
                    const height = (normalizedValue / 100) * plotHeight;
                    const x = groupX + seriesIndex * (barWidth + barGap);
                    const y = cpsTrendChartPadding.top + plotHeight - height;

                    return (
                      <rect
                        fill={cpsTrendSeriesMeta[series].color}
                        height={height}
                        key={`${row.label}-${series}`}
                        opacity={selectedIndex === rowIndex ? "1" : "0.82"}
                        rx="5"
                        width={barWidth}
                        x={x}
                        y={y}
                      />
                    );
                  });
                })}

            {rows.map((row, index) => {
              const x = cpsTrendChartPadding.left + (index / Math.max(1, rows.length - 1)) * plotWidth;

              return (
                <g
                  className="cursor-pointer outline-none"
                  key={row.label}
                  onClick={() => setSelectedIndex(index)}
                  onFocus={() => setSelectedIndex(index)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      setSelectedIndex(index);
                    }
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  role="button"
                  tabIndex={0}
                >
                  <rect fill="transparent" height={plotHeight + 18} width="86" x={x - 43} y={cpsTrendChartPadding.top - 8} />
                  {selectedIndex === index ? (
                    <line
                      stroke="currentColor"
                      strokeDasharray="4 6"
                      strokeOpacity="0.36"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                      x1={x}
                      x2={x}
                      y1={cpsTrendChartPadding.top}
                      y2={cpsTrendChartPadding.top + plotHeight}
                    />
                  ) : null}
                  {chartType === "line"
                    ? selectedSeries.map((series) => {
                        const point = getCpsTrendPoint(row, series, seriesStats[series], index, rows.length, chartWidth);

                        return (
                          <circle
                            cx={point.x}
                            cy={point.y}
                            fill={cpsTrendSeriesMeta[series].color}
                            key={series}
                            r={selectedIndex === index ? "6.5" : "4.5"}
                            stroke="var(--admin-surface, #ffffff)"
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                          />
                        );
                      })
                    : null}
                  <text fill="currentColor" fontSize="12" fontWeight="800" opacity={selectedIndex === index ? "0.92" : "0.62"} textAnchor="middle" x={x} y={cpsTrendChartHeight - 14}>
                    {row.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        {selectedSeries.map((series) => {
          const stats = seriesStats[series];
          const latestValue = getCpsTrendValue(selectedRow, series);
          const peakValue = getCpsTrendValue(stats.peak, series);
          const growthValue = series === "riskFrozen" ? formatCompactYen(stats.latest - stats.first) : percent(stats.growth);
          const compactLabel = cpsTrendSeriesMeta[series].label.replace(/\s+/g, "");

          return (
            <article className="rounded-lg border border-line bg-paper px-2.5 py-2" key={series}>
              <div className="flex min-w-0 items-start justify-between gap-1.5">
                <span className="min-w-0 whitespace-nowrap text-[11px] font-black text-ink/65" title={cpsTrendSeriesMeta[series].label}>
                  <span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full" style={{ background: cpsTrendSeriesMeta[series].color }} />
                  {compactLabel}
                </span>
                <strong className="shrink-0 whitespace-nowrap text-[15px] leading-5 text-ink" data-no-i18n>
                  {formatCpsTrendValue(series, latestValue)}
                </strong>
              </div>
              <div className="mt-1.5 space-y-0.5 border-t border-line pt-1.5 text-[11px] font-black leading-4 text-ink/52">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="shrink-0 whitespace-nowrap">最高 {stats.peak.label}</span>
                  <span className="min-w-0 text-right" data-no-i18n>
                    {formatCpsTrendValue(series, peakValue)}
                  </span>
                </div>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="shrink-0 whitespace-nowrap">较首日</span>
                  <span className="min-w-0 text-right" data-no-i18n>
                    {growthValue}
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </AdminCard>
  );
}

type DashboardMetricTone = "default" | "green" | "red" | "dark";

type DashboardMetric = {
  id: string;
  label: string;
  value: string;
  caption: string;
  tone?: DashboardMetricTone;
};

type MetricDragSession = {
  active: boolean;
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
};

type MetricDragPreview = {
  id: string;
  width: number;
  height: number;
  grabX: number;
  grabY: number;
  x: number;
  y: number;
};

const dashboardMetricOrderStorageKey = "needo.afirieito.dashboard.metrics.order";
const dashboardMetricVisibleStorageKey = "needo.afirieito.dashboard.metrics.visible";
const metricLongPressDelay = 280;
const metricDragMoveTolerance = 8;
const defaultDashboardVisibleMetricIds = [
  "today-clicks",
  "today-scans",
  "today-registrations",
  "valid-registrations",
  "today-ekyc",
  "first-orders",
  "today-gmv",
  "platform-revenue",
  "cps-orders",
  "commission-spend",
  "roi",
  "risk-frozen"
];

function MetricPlusIcon({ open }: { open: boolean }) {
  return (
    <span aria-hidden="true" className={cn("relative block h-4 w-4 transition-transform", open ? "rotate-45" : "")}>
      <span className="absolute left-1/2 top-0 h-4 w-0.5 -translate-x-1/2 rounded-full bg-current" />
      <span className="absolute left-0 top-1/2 h-0.5 w-4 -translate-y-1/2 rounded-full bg-current" />
    </span>
  );
}

function normalizeMetricIds(ids: readonly string[], allowedIds: readonly string[]) {
  const allowed = new Set(allowedIds);
  const seen = new Set<string>();
  const normalized: string[] = [];

  ids.forEach((id) => {
    if (!allowed.has(id) || seen.has(id)) {
      return;
    }

    seen.add(id);
    normalized.push(id);
  });

  return normalized;
}

function normalizeMetricOrder(ids: readonly string[], metricIds: readonly string[]) {
  const normalized = normalizeMetricIds(ids, metricIds);
  const seen = new Set(normalized);

  metricIds.forEach((id) => {
    if (!seen.has(id)) {
      normalized.push(id);
    }
  });

  return normalized;
}

function readStoredDashboardMetricIds(storageKey: string, fallback: readonly string[], allowedIds: readonly string[], allowEmpty = false) {
  if (typeof window === "undefined") {
    return normalizeMetricIds(fallback, allowedIds);
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "null");

    if (Array.isArray(parsed)) {
      const storedIds = normalizeMetricIds(parsed.filter((item): item is string => typeof item === "string"), allowedIds);

      if (storedIds.length > 0 || allowEmpty) {
        return storedIds;
      }
    }
  } catch {
    // Ignore broken local preferences and fall back to the current dashboard contract.
  }

  return normalizeMetricIds(fallback, allowedIds);
}

function moveDashboardMetric(order: readonly string[], draggedId: string, targetId: string, placement: "before" | "after", metricIds: readonly string[]) {
  if (draggedId === targetId) {
    return normalizeMetricOrder(order, metricIds);
  }

  const normalized = normalizeMetricOrder(order, metricIds);
  const withoutDragged = normalized.filter((id) => id !== draggedId);
  const targetIndex = withoutDragged.indexOf(targetId);

  if (targetIndex === -1) {
    return normalized;
  }

  const next = [...withoutDragged];
  next.splice(placement === "after" ? targetIndex + 1 : targetIndex, 0, draggedId);

  return next;
}

function getMetricDropPlacement(element: HTMLElement, event: ReactPointerEvent<HTMLElement>): "before" | "after" {
  const rect = element.getBoundingClientRect();
  const verticalCenter = rect.top + rect.height / 2;
  const horizontalCenter = rect.left + rect.width / 2;

  if (Math.abs(event.clientY - verticalCenter) <= rect.height * 0.28) {
    return event.clientX > horizontalCenter ? "after" : "before";
  }

  return event.clientY > verticalCenter ? "after" : "before";
}

function getMetricDragTarget(clientX: number, clientY: number, draggedId: string) {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("[data-dashboard-metric-id]")).filter((element) => element.dataset.dashboardMetricId !== draggedId);
  let nearest: { element: HTMLElement; distance: number } | null = null;

  for (const element of candidates) {
    const rect = element.getBoundingClientRect();
    const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;

    if (inside) {
      return element;
    }

    const distance = Math.hypot(clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2));

    if (!nearest || distance < nearest.distance) {
      nearest = { element, distance };
    }
  }

  return nearest?.element ?? null;
}

function DashboardMetricBoard({ metrics }: { metrics: DashboardMetric[] }) {
  const metricIds = useMemo(() => metrics.map((metric) => metric.id), [metrics]);
  const metricById = useMemo(() => new Map(metrics.map((metric) => [metric.id, metric])), [metrics]);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [metricOrder, setMetricOrder] = useState(() => readStoredDashboardMetricIds(dashboardMetricOrderStorageKey, metricIds, metricIds));
  const [visibleMetricIds, setVisibleMetricIds] = useState(() => readStoredDashboardMetricIds(dashboardMetricVisibleStorageKey, defaultDashboardVisibleMetricIds, metricIds, true));
  const [draggingMetricId, setDraggingMetricId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<MetricDragPreview | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const dragSessionRef = useRef<MetricDragSession | null>(null);
  const orderedMetricIds = useMemo(() => normalizeMetricOrder(metricOrder, metricIds), [metricIds, metricOrder]);
  const visibleMetricSet = useMemo(() => new Set(visibleMetricIds), [visibleMetricIds]);
  const orderedMetrics = orderedMetricIds.flatMap((id) => {
    const metric = metricById.get(id);

    return metric ? [metric] : [];
  });
  const visibleMetrics = orderedMetrics.filter((metric) => visibleMetricSet.has(metric.id));
  const draggedMetric = draggingMetricId ? metricById.get(draggingMetricId) ?? null : null;

  useEffect(() => {
    setMetricOrder((current) => normalizeMetricOrder(current, metricIds));
    setVisibleMetricIds((current) => {
      const normalized = normalizeMetricIds(current, metricIds);

      return current.length > 0 && normalized.length === 0 ? normalizeMetricIds(defaultDashboardVisibleMetricIds, metricIds) : normalized;
    });
  }, [metricIds]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(dashboardMetricOrderStorageKey, JSON.stringify(orderedMetricIds));
  }, [orderedMetricIds]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(dashboardMetricVisibleStorageKey, JSON.stringify(visibleMetricIds));
  }, [visibleMetricIds]);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current === null || typeof window === "undefined") {
      return;
    }

    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  const finishMetricDrag = (event?: ReactPointerEvent<HTMLElement>) => {
    clearLongPressTimer();

    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragSessionRef.current = null;
    setDraggingMetricId(null);
    setDragPreview(null);
  };

  const startMetricLongPress = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const target = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;

    clearLongPressTimer();
    dragSessionRef.current = {
      active: false,
      id,
      pointerId: event.pointerId,
      startX,
      startY
    };

    target.setPointerCapture(event.pointerId);
    longPressTimerRef.current = window.setTimeout(() => {
      const session = dragSessionRef.current;

      if (!session || session.id !== id || session.pointerId !== event.pointerId) {
        return;
      }

      const rect = target.getBoundingClientRect();

      session.active = true;
      setDraggingMetricId(id);
      setDragPreview({
        id,
        width: rect.width,
        height: rect.height,
        grabX: startX - rect.left,
        grabY: startY - rect.top,
        x: startX,
        y: startY
      });
    }, metricLongPressDelay);
  };

  const moveMetricDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const session = dragSessionRef.current;

    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    const distance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY);

    if (!session.active && distance > metricDragMoveTolerance) {
      finishMetricDrag(event);

      return;
    }

    if (!session.active) {
      return;
    }

    event.preventDefault();
    setDragPreview((current) => current && current.id === session.id ? { ...current, x: event.clientX, y: event.clientY } : current);

    const target = getMetricDragTarget(event.clientX, event.clientY, session.id);
    const targetId = target?.dataset.dashboardMetricId;

    if (!target || !targetId || targetId === session.id) {
      return;
    }

    const placement = getMetricDropPlacement(target, event);
    setMetricOrder((current) => moveDashboardMetric(current, session.id, targetId, placement, metricIds));
  };

  const toggleMetric = (id: string) => {
    setVisibleMetricIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return orderedMetricIds.filter((metricId) => next.has(metricId));
    });
  };

  return (
    <section className="relative min-h-[120px] pr-0 sm:pr-14">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 2xl:grid-cols-6">
        {visibleMetrics.map((metric) => {
          const dragging = draggingMetricId === metric.id;

          return (
            <MetricCard
              aria-grabbed={dragging}
              caption={metric.caption}
              className={cn(
                "min-h-[148px] select-none transition duration-150",
                dragging ? "cursor-grabbing border-dashed opacity-25" : "cursor-grab hover:-translate-y-0.5 hover:border-moss/50"
              )}
              data-dashboard-metric-id={metric.id}
              key={metric.id}
              label={metric.label}
              onPointerCancel={finishMetricDrag}
              onPointerDown={(event) => startMetricLongPress(event, metric.id)}
              onPointerMove={moveMetricDrag}
              onPointerUp={finishMetricDrag}
              title="长按拖拽排序"
              tone={metric.tone ?? "default"}
              value={metric.value}
            />
          );
        })}
      </div>

      <button
        aria-expanded={selectorOpen}
        aria-label="打开指标显示设置"
        className={cn(
          "focus-ring absolute right-0 top-0 z-20 grid h-11 w-11 place-items-center rounded-full border border-line bg-white text-ink shadow-[0_18px_40px_rgba(0,0,0,0.18)] transition hover:border-moss hover:text-moss",
          selectorOpen ? "border-moss text-moss" : ""
        )}
        onClick={() => setSelectorOpen((open) => !open)}
        type="button"
      >
        <MetricPlusIcon open={selectorOpen} />
      </button>

      {selectorOpen ? (
        <div className="absolute right-0 top-14 z-30 w-[min(560px,calc(100vw-2rem))] rounded-lg border border-line bg-white/95 p-3 shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur">
          <div className="flex flex-wrap gap-2">
            {orderedMetrics.map((metric) => {
              const selected = visibleMetricSet.has(metric.id);

              return (
                <button
                  aria-pressed={selected}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-black transition",
                    selected ? "border-transparent bg-[color:var(--admin-accent)] text-white shadow-panel" : "border-line bg-paper text-ink/55 hover:border-moss hover:text-moss"
                  )}
                  key={metric.id}
                  onClick={() => toggleMetric(metric.id)}
                  type="button"
                >
                  <span className={cn("h-2 w-2 rounded-full", selected ? "bg-white" : "bg-ink/30")} />
                  {metric.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {dragPreview && draggedMetric ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[80]"
          style={{
            height: dragPreview.height,
            left: dragPreview.x - dragPreview.grabX,
            top: dragPreview.y - dragPreview.grabY,
            width: dragPreview.width
          }}
        >
          <MetricCard
            caption={draggedMetric.caption}
            className="h-full w-full scale-[1.025] cursor-grabbing border-[color:var(--admin-accent)] shadow-[0_28px_70px_rgba(0,0,0,0.34)] ring-2 ring-[color:var(--admin-accent)]"
            label={draggedMetric.label}
            tone={draggedMetric.tone ?? "default"}
            value={draggedMetric.value}
          />
        </div>
      ) : null}
    </section>
  );
}

function DashboardModule() {
  const { dashboard, state } = useCpsRuntime();
  const metrics = useMemo<DashboardMetric[]>(
    () => [
      { id: "today-clicks", label: "今日点击", value: dashboard.todayClicks.toLocaleString("ja-JP"), caption: "短链与落地页点击" },
      { id: "today-scans", label: "今日扫码", value: dashboard.todayScans.toLocaleString("ja-JP"), caption: "QR / 线下海报扫码" },
      { id: "today-registrations", label: "今日注册", value: dashboard.todayRegistrations.toLocaleString("ja-JP"), caption: "推广链路注册" },
      { id: "valid-registrations", label: "有效注册", value: dashboard.todayValidRegistrations.toLocaleString("ja-JP"), caption: "去重后可计佣注册" },
      { id: "today-ekyc", label: "今日 eKYC", value: dashboard.todayEkyc.toLocaleString("ja-JP"), caption: "实名通过或提交" },
      { id: "first-orders", label: "今日首单", value: dashboard.todayFirstOrders.toLocaleString("ja-JP"), caption: "首单完成事件" },
      { id: "today-gmv", label: "今日 GMV", value: yen(dashboard.todayGmv), caption: "Afirieito 归因可确认交易额" },
      { id: "platform-revenue", label: "平台收入", value: yen(dashboard.todayPlatformRevenue), caption: "计佣基数优先按平台收入" },
      { id: "cps-orders", label: "Afirieito 订单", value: dashboard.cpsOrders.toLocaleString("ja-JP"), caption: "Booking / Request / SaaS" },
      { id: "new-users", label: "新增用户", value: dashboard.newUsers.toLocaleString("ja-JP"), caption: "通过推广链路注册" },
      { id: "new-merchants", label: "新增商户", value: dashboard.newMerchants.toLocaleString("ja-JP"), caption: "招商链路已入驻" },
      { id: "new-technicians", label: "新增技师", value: dashboard.newTechnicians.toLocaleString("ja-JP"), caption: "供给侧招募" },
      { id: "commission-spend", label: "佣金支出", value: yen(dashboard.commissionSpend), caption: "今日产生或确认" },
      { id: "estimated-commission", label: "预估返佣", value: yen(dashboard.estimatedCommission), caption: "事件发生后待确认" },
      { id: "withdrawable-commission", label: "可结算返佣", value: yen(dashboard.withdrawableCommission), caption: "已过风控和结算延迟" },
      { id: "settled-commission", label: "已结算返佣", value: yen(dashboard.settledCommission), caption: "财务确认支付" },
      { id: "roi", label: "ROI", value: `${dashboard.roi.toFixed(1)}x`, caption: "平台与商户综合", tone: "green" },
      { id: "request-ratio", label: "Request 占比", value: percent(dashboard.requestRatio), caption: "高价值订单占比" },
      { id: "risk-frozen", label: "风险冻结金额", value: yen(dashboard.riskFrozenAmount), caption: "风控冻结资产", tone: "red" },
      { id: "budget-usage", label: "预算消耗率", value: percent(dashboard.budgetUsageRate), caption: "活动预算使用情况" },
      { id: "target-completion", label: "目标完成率", value: percent(dashboard.targetCompletionRate), caption: "组织首单目标完成", tone: "green" },
      { id: "abnormal-promoters", label: "异常推广者", value: dashboard.abnormalPromoters.toLocaleString("ja-JP"), caption: "风险分大于等于 30", tone: "red" },
      { id: "abnormal-orders", label: "异常订单", value: dashboard.abnormalOrders.toLocaleString("ja-JP"), caption: "进入风险审核队列", tone: "red" }
    ],
    [dashboard]
  );

  return (
    <div className="space-y-5">
      <DashboardMetricBoard metrics={metrics} />

      <LogicDiagnosticsPanel />

      <section className="grid items-start gap-5 xl:grid-cols-[1.45fr_0.85fr]">
        <CpsTrendChart />

        <AdminCard>
          <h2 className="text-lg font-black">核心闭环</h2>
          <div className="mt-4 grid gap-2">
            {businessCpsFlowSteps.map((step, index) => (
              <div className="grid grid-cols-[36px_1fr] gap-3 rounded-lg bg-paper p-3" key={step.step}>
                <span className="grid h-9 w-9 place-items-center rounded-full bg-moss text-sm font-black text-white">{index + 1}</span>
                <div>
                  <strong className="text-sm">{step.step}</strong>
                  <p className="mt-1 text-xs text-ink/55">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </AdminCard>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <AdminCard>
          <h2 className="text-lg font-black">Top 推广计划</h2>
          <div className="mt-4 space-y-3">
            {state.campaigns.map((campaign) => (
              <article className="rounded-lg bg-paper p-3" key={campaign.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="text-sm">{campaign.name}</strong>
                    <p className="mt-1 text-xs text-ink/55">{campaign.region} · {campaign.commissionSummary}</p>
                  </div>
                  <Badge tone={campaignStatusTone[campaign.status]}>{campaignStatusLabels[campaign.status]}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <span>GMV <b>{yen(campaign.gmv)}</b></span>
                  <span>ROI <b>{campaign.roi.toFixed(1)}x</b></span>
                  <span>预算 <b>{getBudgetUsage(campaign)}%</b></span>
                </div>
                <div className="mt-2"><ProgressBar value={getBudgetUsage(campaign)} /></div>
              </article>
            ))}
          </div>
        </AdminCard>

        <AdminCard>
          <h2 className="text-lg font-black">主系统同步</h2>
          <div className="mt-4 grid gap-3">
            {[
              ["NeeDo 主订单", "Booking / Request 创建、取消、完成、退款、投诉、服务时长、LBS 摘要"],
              ["NDP 钱包", "付费 NDP、赠送 NDP、抵扣券、冻结 NDP、商户预算、佣金发放"],
              ["eKYC / 会员 / Boost", "实名结果、会员购买、Boost 购买和商户 SaaS 订阅"],
              ["产运后台", "计划、推广者、渠道、点击、注册、归因、佣金、提现、风险和 ROI 总控"]
            ].map(([title, detail]) => (
              <div className="rounded-lg border border-line bg-white p-3" key={title}>
                <strong className="text-sm">{title}</strong>
                <p className="mt-1 text-xs text-ink/55">{detail}</p>
              </div>
            ))}
          </div>
        </AdminCard>
      </section>
    </div>
  );
}

function CampaignPlansModule() {
  const { state, onCampaignAction } = useCpsRuntime();

  return (
    <div className="space-y-5">
      <FilterBar
        searchPlaceholder="搜索计划名、商户、达人、地区"
        filters={[
          { label: "状态", options: Object.entries(campaignStatusLabels).map(([value, label]) => ({ value, label })) },
          { label: "类型", options: Object.entries(campaignTypeLabels).map(([value, label]) => ({ value, label })) },
          { label: "广告主", options: Object.entries(sponsorLabels).map(([value, label]) => ({ value, label })) }
        ]}
      />
      <DataTable<BusinessCpsCampaign>
        columns={[
          {
            key: "name",
            title: "推广计划",
            render: (row) => (
              <div>
                <strong className="block text-ink">{row.name}</strong>
                <span className="mt-1 block text-xs text-ink/45">{row.target}</span>
              </div>
            ),
            filterValue: (row) => row.name,
            sortValue: (row) => row.name,
            width: "280px"
          },
          { key: "status", title: "状态", render: (row) => <Badge tone={campaignStatusTone[row.status]}>{campaignStatusLabels[row.status]}</Badge>, filterValue: (row) => campaignStatusLabels[row.status], width: "120px" },
          { key: "type", title: "类型", render: (row) => campaignTypeLabels[row.type], filterValue: (row) => campaignTypeLabels[row.type] },
          { key: "sponsor", title: "广告主", render: (row) => sponsorLabels[row.sponsor], filterValue: (row) => sponsorLabels[row.sponsor] },
          { key: "region", title: "地区 / 类目", render: (row) => `${row.region} / ${row.category}`, width: "220px" },
          { key: "commission", title: "佣金摘要", render: (row) => row.commissionSummary, width: "260px" },
          {
            key: "budget",
            title: "预算",
            render: (row) => (
              <div className="w-[180px]">
                <div className="flex justify-between text-xs font-bold text-ink/55">
                  <span>{yen(row.budgetUsed)}</span>
                  <span>{getBudgetUsage(row)}%</span>
                </div>
                <div className="mt-2"><ProgressBar value={getBudgetUsage(row)} /></div>
              </div>
            ),
            sortValue: (row) => getBudgetUsage(row),
            width: "220px"
          },
          { key: "roi", title: "ROI", render: (row) => `${row.roi.toFixed(1)}x`, sortValue: (row) => row.roi },
          {
            key: "actions",
            title: "状态操作",
            render: (row) => (
              <div className="flex flex-wrap gap-1.5">
                {getAvailableCampaignActions(row).length ? (
                  getAvailableCampaignActions(row).map((action) => (
                    <ActionChip key={action} onClick={() => onCampaignAction(row, action)} tone={action === "end" || action === "archive" ? "danger" : "default"}>
                      {campaignActionLabels[action]}
                    </ActionChip>
                  ))
                ) : (
                  <Badge>只读</Badge>
                )}
              </div>
            ),
            width: "240px"
          }
        ]}
        rows={state.campaigns}
        pageSize={8}
      />
    </div>
  );
}

function getInitialPlanCategoryOptions() {
  return planWizardSteps.flatMap((step) => step.fields).find((field) => field.key === "category")?.options ?? [];
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

const planWizardDraftStorageKey = "needo.afirieito.plan-wizard.localized-drafts.v1";
const planWizardLocaleOrder: PlanWizardLocale[] = ["ja", "en", "ko", "zh-Hant", "zh"];

function resolvePlanWizardLocale(language: string): PlanWizardLocale {
  if (language === "ja" || language === "en" || language === "ko" || language === "zh-Hant" || language === "zh") {
    return language;
  }

  return "zh";
}

function normalizePlanWizardText(text: PlanWizardLocalizedText): PlanWizardLocalizedText {
  const fallback = planWizardLocaleOrder.map((locale) => text[locale]).find((value) => value?.trim())?.trim() ?? "";

  return {
    ja: text.ja ?? fallback,
    en: text.en ?? fallback,
    ko: text.ko ?? fallback,
    "zh-Hant": text["zh-Hant"] ?? fallback,
    zh: text.zh ?? fallback
  };
}

function getPlanWizardFieldDraftKey(stepIndex: number, fieldIndex: number, field: PlanWizardFieldConfig) {
  return `step-${stepIndex}-${field.key ?? fieldIndex}`;
}

function createInitialPlanWizardDrafts(storedDrafts: Record<string, PlanWizardLocalizedText> = {}) {
  return planWizardSteps.reduce<Record<string, PlanWizardLocalizedText>>((drafts, step, stepIndex) => {
    step.fields.forEach((field, fieldIndex) => {
      const key = getPlanWizardFieldDraftKey(stepIndex, fieldIndex, field);
      drafts[key] = normalizePlanWizardText({ ...field.defaultValue, ...storedDrafts[key] });
    });

    return drafts;
  }, {});
}

function readInitialPlanWizardDrafts() {
  const storedDrafts = parseBrowserStorageJson<Record<string, PlanWizardLocalizedText>>(planWizardDraftStorageKey, {}, { removeOnError: true, silent: true });

  return createInitialPlanWizardDrafts(storedDrafts);
}

function getPlanWizardValue(text: PlanWizardLocalizedText, locale: PlanWizardLocale) {
  return getPlanWizardCopy(text, locale);
}

function getPlanWizardSourceLocale(text: PlanWizardLocalizedText, preferredLocale: PlanWizardLocale) {
  if (text[preferredLocale]?.trim()) {
    return preferredLocale;
  }

  return planWizardLocaleOrder.find((locale) => text[locale]?.trim()) ?? null;
}

function createPlanWizardSourceDraft(text: PlanWizardLocalizedText, preferredLocale: PlanWizardLocale): PlanWizardLocalizedText | null {
  const sourceLocale = getPlanWizardSourceLocale(text, preferredLocale);

  if (!sourceLocale) {
    return null;
  }

  return {
    ...createEmptyPlanCategoryDraft(),
    [sourceLocale]: text[sourceLocale]?.trim() ?? ""
  };
}

function PlanWizardModule() {
  const { state } = useCpsRuntime();
  const { language } = useI18n();
  const [activeStep, setActiveStep] = useState(0);
  const [fieldEditLocale, setFieldEditLocale] = useState<PlanWizardLocale>(() => resolvePlanWizardLocale(language));
  const [planDraftValues, setPlanDraftValues] = useState<Record<string, PlanWizardLocalizedText>>(() => readInitialPlanWizardDrafts());
  const [planDraftSaveMessage, setPlanDraftSaveMessage] = useState("");
  const [isPlanDraftTranslating, setPlanDraftTranslating] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<PlanWizardLocalizedText[]>(getInitialPlanCategoryOptions);
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
  const previewCampaign = state.campaigns[0];

  useEffect(() => {
    setFieldEditLocale(resolvePlanWizardLocale(language));
  }, [language]);

  if (!previewCampaign) {
    return null;
  }

  const copy = (text: Parameters<typeof getPlanWizardCopy>[0]) => getPlanWizardCopy(text, language);
  const activeWizardStep = planWizardSteps[activeStep] ?? planWizardSteps[0];
  const activeStepPercent = Math.round(((activeStep + 1) / planWizardSteps.length) * 100);
  const isTrackingLinkStep = activeWizardStep.step.zh === "设定追踪与链接";
  const isPayoutStep = activeWizardStep.step.zh === "设定计费与佣金";
  const isCreativeStep = activeWizardStep.step.zh === "准备推广素材";
  const isLaunchTestStep = activeWizardStep.step.zh === "测试与上线";
  const selectedCreativePreset = planWizardCreativePresets.find(
    (preset) => String(preset.width) === creativeDraft.width && String(preset.height) === creativeDraft.height
  );
  const creativeCurrentSize = creativeDraft.width && creativeDraft.height
    ? formatPlanWizardCreativeSize(creativeDraft.width, creativeDraft.height)
    : "--";
  const showPlanStepLanguageTools = !isTrackingLinkStep && !isPayoutStep && !isCreativeStep && !isLaunchTestStep;
  const uiCopy = {
    aiMode: copy({ zh: "AI Offer Builder", en: "AI Offer Builder", ja: "AI Offer Builder" }),
    creationSteps: copy({ zh: "AI 创建步骤", en: "AI creation steps", ja: "AI 作成ステップ" }),
    languageScope: copy({
      ja: "日本語 / English / 한국어 / 繁體中文 / 简体中文",
      en: "Japanese / English / Korean / Traditional Chinese / Simplified Chinese",
      ko: "일본어 / English / 한국어 / 繁體中文 / 简体中文",
      "zh-Hant": "日語 / English / 韓語 / 繁體中文 / 简体中文",
      zh: "日语 / English / 韩语 / 繁体中文 / 简体中文"
    }),
    currentStep: copy({ zh: "当前步骤", en: "Current step", ja: "現在のステップ" }),
    saveDraft: copy({ zh: "保存 AI 草稿", en: "Save AI draft", ja: "AI 下書きを保存" }),
    formTitle: copy({ zh: "本步设定项", en: "Settings in this step", ja: "このステップの設定項目" }),
    aiChecks: copy({ zh: "AI 检查", en: "AI checks", ja: "AI チェック" }),
    stepOutput: copy({ zh: "本步输出", en: "Step output", ja: "このステップの出力" }),
    ruleSnapshot: copy({ zh: "规则快照", en: "Rule snapshot", ja: "ルールスナップショット" }),
    launchPreview: copy({ zh: "发布预览", en: "Launch preview", ja: "公開プレビュー" }),
    days: copy({ zh: "天", en: "days", ja: "日" }),
    editLanguage: copy({ ja: "編集言語", en: "Edit language", ko: "편집 언어", "zh-Hant": "編輯語言", zh: "编辑语言" }),
    save: copy({ ja: "保存", en: "Save", ko: "저장", "zh-Hant": "保存", zh: "保存" }),
    saved: copy({ ja: "草稿を保存しました", en: "Draft saved", ko: "초안이 저장되었습니다", "zh-Hant": "草稿已保存", zh: "草稿已保存" }),
    saveFailed: copy({ ja: "保存できませんでした", en: "Save failed", ko: "저장하지 못했습니다", "zh-Hant": "保存失敗", zh: "保存失败" }),
    translateStep: copy({ ja: "このステップを翻訳", en: "Translate step", ko: "이 단계 번역", "zh-Hant": "翻譯本步", zh: "翻译本步" }),
    translatingStep: copy({ ja: "翻訳中", en: "Translating", ko: "번역 중", "zh-Hant": "翻譯中", zh: "翻译中" }),
    translatedStep: copy({ ja: "このステップの多言語草稿を更新しました", en: "Multilingual draft updated for this step", ko: "이 단계의 다국어 초안이 업데이트되었습니다", "zh-Hant": "本步多語言草稿已更新", zh: "本步多语言草稿已更新" }),
    applicableTarget: copy({ zh: "适用对象", en: "Target actions", ja: "対象アクション" }),
    participants: copy({ zh: "参与人群", en: "Eligible affiliates", ja: "参加対象" }),
    userBenefit: copy({ zh: "用户优惠", en: "User benefit", ja: "ユーザー特典" }),
    budgetLimit: copy({ zh: "预算上限", en: "Budget limit", ja: "予算上限" }),
    attributionRisk: copy({ zh: "归因与风控", en: "Attribution and risk", ja: "帰属計測とリスク" }),
    daily: copy({ zh: "每日", en: "daily", ja: "日次" })
  };
  const categoryCopy = {
    currentList: copy({ ja: "現在のカテゴリー一覧", en: "Current categories", ko: "현재 카테고리 목록", "zh-Hant": "目前類別列表", zh: "目前类别列表" }),
    addCategory: copy({ ja: "カテゴリーを追加", en: "Add category", ko: "카테고리 추가", "zh-Hant": "添加類別", zh: "添加类别" }),
    manageCategory: copy({ ja: "カテゴリーを追加 / 管理", en: "Add / manage categories", ko: "카테고리 추가 / 관리", "zh-Hant": "添加 / 管理類別", zh: "添加 / 管理类别" }),
    translate: copy({ ja: "翻訳", en: "Translate", ko: "번역", "zh-Hant": "翻譯", zh: "翻译" }),
    translating: copy({ ja: "翻訳中", en: "Translating", ko: "번역 중", "zh-Hant": "翻譯中", zh: "翻译中" }),
    confirmAdd: copy({ ja: "追加を確定", en: "Confirm add", ko: "추가 확정", "zh-Hant": "確定添加", zh: "确定添加" }),
    deleteCategory: copy({ ja: "カテゴリーを削除", en: "Delete category", ko: "카테고리 삭제", "zh-Hant": "刪除類別", zh: "删除类别" }),
    editCategory: copy({ ja: "既存カテゴリーを編集", en: "Edit existing categories", ko: "기존 카테고리 편집", "zh-Hant": "編輯現有類別", zh: "编辑已有类别" })
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
  const previewRows = [
    {
      label: uiCopy.applicableTarget,
      value: copy({
        zh: previewCampaign.target,
        en: "New signup, eKYC, first Booking / Request order",
        ja: "新規登録、eKYC、Booking / Request 初回注文"
      })
    },
    {
      label: uiCopy.participants,
      value: copy({
        zh: previewCampaign.participants,
        en: "Certified creators, high-rated staff, and selected community partners",
        ja: "認証済みクリエイター、高評価スタッフ、指定コミュニティ Partner"
      })
    },
    {
      label: uiCopy.userBenefit,
      value: copy({
        zh: previewCampaign.userBenefit,
        en: "500 NDP Request coupon",
        ja: "500 NDP Request クーポン"
      })
    },
    {
      label: uiCopy.budgetLimit,
      value: `${yen(previewCampaign.budgetTotal)} / ${uiCopy.daily} ${yen(previewCampaign.dailyCap)}`
    },
    {
      label: uiCopy.attributionRisk,
      value: copy({
        zh: `${previewCampaign.attributionWindowDays} 天窗口，${previewCampaign.riskRules.length} 条风险规则`,
        en: `${previewCampaign.attributionWindowDays}-day window, ${previewCampaign.riskRules.length} risk rules`,
        ja: `${previewCampaign.attributionWindowDays}日ウィンドウ、${previewCampaign.riskRules.length}件のリスクルール`
      })
    }
  ];
  const activeFieldEntries = activeWizardStep.fields.map((field, fieldIndex) => ({ field, fieldIndex }));
  const hasCategoryField = activeFieldEntries.some(({ field }) => field.key === "category");
  const hasFlatRatePayoutField = activeFieldEntries.some(({ field }) => field.key === "flatRatePayout");
  const midpoint = Math.ceil(activeFieldEntries.length / 2);
  const formColumns = hasCategoryField
    ? [
        activeFieldEntries.filter(({ field }) => field.key !== "category"),
        activeFieldEntries.filter(({ field }) => field.key === "category")
      ].filter((column) => column.length > 0)
    : hasFlatRatePayoutField || isTrackingLinkStep || isCreativeStep
      ? [activeFieldEntries]
    : [
        activeFieldEntries.slice(0, midpoint),
        activeFieldEntries.slice(midpoint)
      ].filter((column) => column.length > 0);
  const hasTranslatablePlanFields = activeFieldEntries.some(({ field }) => field.key !== "category" && field.key !== "flatRatePayout");
  const updatePlanFieldDraft = (stepIndex: number, fieldIndex: number, field: PlanWizardFieldConfig, locale: PlanWizardLocale, value: string) => {
    const fieldKey = getPlanWizardFieldDraftKey(stepIndex, fieldIndex, field);

    setPlanDraftSaveMessage("");
    setPlanDraftValues((current) => ({
      ...current,
      [fieldKey]: normalizePlanWizardText({
        ...(current[fieldKey] ?? field.defaultValue),
        [locale]: value
      })
    }));
  };
  const updatePlanFieldOption = (stepIndex: number, fieldIndex: number, field: PlanWizardFieldConfig, value: string) => {
    const option = (field.options ?? []).find((item) => getPlanWizardValue(normalizePlanWizardText(item), fieldEditLocale) === value);

    if (!option) {
      updatePlanFieldDraft(stepIndex, fieldIndex, field, fieldEditLocale, value);
      return;
    }

    const fieldKey = getPlanWizardFieldDraftKey(stepIndex, fieldIndex, field);

    setPlanDraftSaveMessage("");
    setPlanDraftValues((current) => ({
      ...current,
      [fieldKey]: normalizePlanWizardText(option)
    }));
  };
  const savePlanWizardDrafts = () => {
    const normalizedDrafts = createInitialPlanWizardDrafts(planDraftValues);
    const saved = writeBrowserStorage(planWizardDraftStorageKey, JSON.stringify(normalizedDrafts), { silent: true });

    if (saved) {
      setPlanDraftValues(normalizedDrafts);
    }

    setPlanDraftSaveMessage(saved ? uiCopy.saved : uiCopy.saveFailed);
  };
  const translateActiveStepDrafts = async () => {
    if (!hasTranslatablePlanFields || isPlanDraftTranslating) {
      return;
    }

    setPlanDraftSaveMessage("");
    setPlanDraftTranslating(true);

    try {
      const translatedEntries = await Promise.all(
        activeFieldEntries.map(async ({ field, fieldIndex }) => {
          if (field.key === "category" || field.key === "flatRatePayout") {
            return null;
          }

          const fieldKey = getPlanWizardFieldDraftKey(activeStep, fieldIndex, field);
          const sourceDraft = createPlanWizardSourceDraft(planDraftValues[fieldKey] ?? field.defaultValue, fieldEditLocale);

          if (!sourceDraft) {
            return null;
          }

          const translatedDraft = await translatePlanCategoryDraft(sourceDraft, field.options ?? []);

          return [fieldKey, normalizePlanWizardText(translatedDraft)] as const;
        })
      );

      setPlanDraftValues((current) => {
        const nextDrafts = { ...current };

        translatedEntries.forEach((entry) => {
          if (!entry) {
            return;
          }

          const [fieldKey, translatedDraft] = entry;
          nextDrafts[fieldKey] = translatedDraft;
        });

        return nextDrafts;
      });
      setPlanDraftSaveMessage(uiCopy.translatedStep);
    } finally {
      setPlanDraftTranslating(false);
    }
  };

  return (
    <>
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <AdminCard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-moss">{uiCopy.aiMode}</p>
            <h2 className="mt-1 text-lg font-black">{uiCopy.creationSteps}</h2>
          </div>
          <Badge tone="blue">{uiCopy.languageScope}</Badge>
        </div>
        <div className="mt-4">
          <ProgressBar value={activeStepPercent} />
        </div>
        <div className="mt-4 space-y-2">
          {planWizardSteps.map((step, index) => (
            <button
              className={cn(
                "grid w-full grid-cols-[36px_1fr] gap-3 rounded-lg p-3 text-left transition",
                activeStep === index ? "bg-moss text-white" : "bg-paper text-ink hover:bg-mint/15"
              )}
              key={copy(step.step)}
              onClick={() => setActiveStep(index)}
              type="button"
            >
              <span className={cn("grid h-9 w-9 place-items-center rounded-full text-sm font-black", activeStep === index ? "bg-white text-moss" : "bg-white text-ink")}>{index + 1}</span>
              <span>
                <strong className="block text-sm">{copy(step.step)}</strong>
                <span className={cn("mt-1 block text-xs", activeStep === index ? "text-white/65" : "text-ink/50")}>{copy(step.caption)}</span>
                <span className={cn("mt-1 block text-[11px] leading-4", activeStep === index ? "text-white/55" : "text-ink/45")}>
                  {step.fields.slice(0, 2).map((field) => copy(field.label)).join(" / ")}
                </span>
              </span>
            </button>
          ))}
        </div>
      </AdminCard>

      <div className="space-y-5">
        <AdminCard>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-ink/45">{uiCopy.currentStep} {activeStep + 1}</p>
              <h2 className="mt-1 text-2xl font-black">{copy(activeWizardStep.step)}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">{copy(activeWizardStep.summary)}</p>
            </div>
            <Badge tone="green">{uiCopy.saveDraft}</Badge>
          </div>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-ink/70">{uiCopy.formTitle}</h3>
              {showPlanStepLanguageTools ? <p className="mt-1 text-xs font-bold text-ink/45">{uiCopy.editLanguage}</p> : null}
            </div>
            {showPlanStepLanguageTools ? (
              <div className="flex flex-wrap items-center gap-2">
                {categoryLocaleFields.map((field) => (
                  <button
                    aria-pressed={fieldEditLocale === field.locale}
                    className={cn(
                      "focus-ring inline-flex h-8 items-center rounded-full border px-3 text-xs font-black transition",
                      fieldEditLocale === field.locale ? "border-moss bg-moss text-white" : "border-line bg-white text-ink/60 hover:border-moss hover:text-moss"
                    )}
                    key={field.locale}
                    onClick={() => setFieldEditLocale(field.locale)}
                    type="button"
                  >
                    {field.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {showPlanStepLanguageTools ? (
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              {planDraftSaveMessage ? <span className="mr-auto text-xs font-bold text-moss">{planDraftSaveMessage}</span> : null}
              <Button
                disabled={!hasTranslatablePlanFields || isPlanDraftTranslating}
                onClick={() => void translateActiveStepDrafts()}
                size="sm"
                variant="secondary"
              >
                {isPlanDraftTranslating ? uiCopy.translatingStep : uiCopy.translateStep}
              </Button>
              <Button onClick={savePlanWizardDrafts} size="sm" variant="dark">
                {uiCopy.save}
              </Button>
            </div>
          ) : null}
          <div className={cn("mt-3 grid items-start gap-3", formColumns.length > 1 && "lg:grid-cols-2")}>
            {formColumns.map((column, columnIndex) => (
              <div className="grid min-w-0 gap-3" key={`plan-form-column-${activeStep}-${columnIndex}`}>
                {column.map(({ field, fieldIndex }) => {
                  const fieldKey = getPlanWizardFieldDraftKey(activeStep, fieldIndex, field);
                  const fieldDraft = planDraftValues[fieldKey] ?? normalizePlanWizardText(field.defaultValue);
                  const fieldOptions = field.key === "category" ? categoryOptions : field.options ?? [field.defaultValue];
                  const fieldValue = getPlanWizardValue(fieldDraft, fieldEditLocale);
                  const normalizedOptions = fieldOptions.map((option) => normalizePlanWizardText(option));
                  const selectOptions = normalizedOptions.some((option) => getPlanWizardValue(option, fieldEditLocale) === fieldValue)
                    ? normalizedOptions
                    : [fieldDraft, ...normalizedOptions];

                  return (
                    <div className="relative rounded-lg border border-line bg-paper p-3" key={fieldKey}>
                      {field.allowOptionManagement ? (
                        <button
                          aria-label={categoryCopy.addCategory}
                          className="focus-ring absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border border-line bg-white text-[#111827] shadow-panel transition hover:border-moss hover:text-moss"
                          onClick={() => setCategoryManagerOpen(true)}
                          title={categoryCopy.addCategory}
                          type="button"
                        >
                          <MetricPlusIcon open={false} />
                        </button>
                      ) : null}
                      <label className="block">
                        <span className={cn("block text-sm font-black text-ink", field.allowOptionManagement && "pr-12")}>{copy(field.label)}</span>
                        <span className="mt-1 block min-h-[42px] text-xs font-semibold leading-5 text-ink/55">{copy(field.description)}</span>
                        {field.key === "category" ? (
                          <div className="mt-3 grid gap-2">
                            {normalizedOptions.map((option, optionIndex) => {
                              const selected = selectedCategoryIndexes.includes(optionIndex);
                              const optionLabel = getPlanWizardValue(option, fieldEditLocale);

                              return (
                                <button
                                  aria-pressed={selected}
                                  className={cn(
                                    "focus-ring flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm font-black transition",
                                    selected ? "border-moss bg-mint/20 text-ink" : "border-line bg-white text-ink/65 hover:border-moss hover:text-ink"
                                  )}
                                  key={`${optionLabel}-${optionIndex}`}
                                  onClick={() => toggleCategoryOption(optionIndex)}
                                  type="button"
                                >
                                  <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px]", selected ? "border-moss bg-moss text-white" : "border-line bg-paper text-transparent")}>
                                    ✓
                                  </span>
                                  <span className="min-w-0 break-words">{optionLabel}</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : field.key === "flatRatePayout" ? (
                          <div className="mt-3 grid gap-2">
                            {planWizardFlatRatePayoutItems.map((item) => {
                              const draft = flatRatePayoutDraft[item.key];
                              const activeValue = draft.mode === "amount" ? draft.amountValue : draft.percentageValue;
                              const selectedPeriodOption = planWizardFlatRatePeriodOptions.find((option) => option.value === draft.period);
                              const selectedPeriodLabel = selectedPeriodOption ? copy(selectedPeriodOption.label) : flatRateCopy.period;
                              const isForeverPeriod = item.allowPeriod && draft.period === "forever";

                              return (
                                <div className="rounded-lg border border-line bg-white p-3" key={item.key}>
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <strong className="text-sm">{copy(item.label)}</strong>
                                      <p className="mt-1 text-xs font-semibold leading-5 text-ink/55">{copy(item.description)}</p>
                                    </div>
                                    <Badge className={isForeverPeriod ? "font-black" : undefined} tone={isForeverPeriod ? "red" : "blue"}>
                                      {item.allowPeriod ? selectedPeriodLabel : flatRateCopy.fixedPeriod}
                                    </Badge>
                                  </div>
                                  <div className={cn("mt-3 grid gap-2", item.allowPeriod ? "sm:grid-cols-[180px_1fr_160px]" : "sm:grid-cols-[180px_1fr]")}>
                                    <div className="text-[11px] font-black text-ink/45">
                                      {flatRateCopy.mode}
                                      <div className="mt-1 grid h-10 grid-cols-2 rounded-lg border border-line bg-paper p-1">
                                        {planWizardPayoutValueModeOptions.map((option) => {
                                          const selected = draft.mode === option.value;

                                          return (
                                            <button
                                              aria-label={`${copy(item.label)}-${copy(option.label)}`}
                                              aria-pressed={selected}
                                              className={cn(
                                                "focus-ring rounded-md text-xs font-black transition",
                                                selected ? "bg-white text-ink shadow-sm" : "text-ink/45 hover:text-ink"
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
                                    <label className="text-[11px] font-black text-ink/45">
                                      {flatRateCopy.value}
                                      <span className="mt-1 flex h-10 items-center rounded-lg border border-line bg-paper px-3 focus-within:border-moss">
                                        {draft.mode === "amount" ? <span className="mr-2 text-sm font-black text-ink/45">¥</span> : null}
                                        <input
                                          className="h-full min-w-0 flex-1 bg-transparent text-sm font-black text-ink outline-none"
                                          inputMode="decimal"
                                          max={draft.mode === "percentage" ? 100 : undefined}
                                          min={0}
                                          onChange={(event) => updateFlatRatePayoutValue(item.key, event.target.value)}
                                          step={draft.mode === "percentage" ? "0.1" : "1"}
                                          type="number"
                                          value={activeValue}
                                        />
                                        {draft.mode === "percentage" ? <span className="ml-2 text-sm font-black text-ink/45">%</span> : null}
                                      </span>
                                    </label>
                                    {item.allowPeriod ? (
                                      <label className="text-[11px] font-black text-ink/45">
                                        {flatRateCopy.period}
                                        <select
                                          className={cn(
                                            "mt-1 h-10 w-full rounded-lg border bg-paper px-3 text-xs font-black outline-none focus:border-moss",
                                            isForeverPeriod ? "border-coral/50 bg-coral/10 text-coral" : "border-line text-ink"
                                          )}
                                          onChange={(event) => updateFlatRatePayoutPeriod(item.key, event.target.value as PlanWizardFlatRatePeriodKey)}
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
	                          <div className="mt-3 grid gap-3">
	                            <div className="grid gap-2 lg:grid-cols-[1fr_1fr_180px]">
	                              <label className="text-[11px] font-black text-ink/45">
	                                {creativeCopy.width}
	                                <span className="mt-1 flex h-10 items-center rounded-lg border border-line bg-white px-3 focus-within:border-moss">
	                                  <input
	                                    aria-label={creativeCopy.width}
	                                    className="h-full min-w-0 flex-1 bg-transparent text-sm font-black text-ink outline-none"
	                                    inputMode="numeric"
	                                    min={1}
	                                    onChange={(event) => updateCreativeDimension("width", event.target.value)}
	                                    type="text"
	                                    value={creativeDraft.width}
	                                  />
	                                  <span className="ml-2 text-xs font-black text-ink/45">px</span>
	                                </span>
	                              </label>
	                              <label className="text-[11px] font-black text-ink/45">
	                                {creativeCopy.height}
	                                <span className="mt-1 flex h-10 items-center rounded-lg border border-line bg-white px-3 focus-within:border-moss">
	                                  <input
	                                    aria-label={creativeCopy.height}
	                                    className="h-full min-w-0 flex-1 bg-transparent text-sm font-black text-ink outline-none"
	                                    inputMode="numeric"
	                                    min={1}
	                                    onChange={(event) => updateCreativeDimension("height", event.target.value)}
	                                    type="text"
	                                    value={creativeDraft.height}
	                                  />
	                                  <span className="ml-2 text-xs font-black text-ink/45">px</span>
	                                </span>
	                              </label>
	                              <div className="text-[11px] font-black text-ink/45">
	                                {creativeCopy.type}
	                                <div className="mt-1 grid h-10 grid-cols-2 rounded-lg border border-line bg-white p-1">
	                                  {(["image", "video"] as const).map((mediaType) => {
	                                    const selected = creativeDraft.mediaType === mediaType;

	                                    return (
	                                      <button
	                                        aria-pressed={selected}
	                                        className={cn(
	                                          "focus-ring rounded-md text-xs font-black transition",
	                                          selected ? "bg-ink text-white shadow-sm" : "text-ink/45 hover:text-ink"
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
	                            <div className="rounded-lg border border-line bg-white p-3">
	                              <div className="flex flex-wrap items-center justify-between gap-2">
	                                <strong className="text-xs font-black text-ink">{creativeCopy.presets}</strong>
	                                <span className="text-[11px] font-semibold text-ink/45">{creativeCopy.freeSize}</span>
	                              </div>
	                              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
	                                {planWizardCreativePresets.map((preset) => {
	                                  const active = selectedCreativePreset ? getPlanWizardCreativePresetKey(selectedCreativePreset) === getPlanWizardCreativePresetKey(preset) : false;
	                                  const label = `${formatPlanWizardCreativeSize(preset.width, preset.height)}${preset.name ? ` ${preset.name}` : ""}`;

	                                  return (
	                                    <button
	                                      aria-pressed={active}
	                                      className={cn(
	                                        "focus-ring min-h-10 rounded-lg border px-3 py-2 text-left text-xs font-black leading-5 transition",
	                                        active ? "border-moss bg-mint/20 text-ink" : "border-line bg-paper text-ink/60 hover:border-moss hover:text-ink"
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
	                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white px-3 py-2.5">
	                              <div>
	                                <p className="text-[11px] font-black text-ink/45">{creativeCopy.current}</p>
	                                <p className="mt-1 text-sm font-black text-ink">
	                                  {creativeCurrentSize} px · {creativeDraft.mediaType === "image" ? creativeCopy.image : creativeCopy.video}
	                                  {selectedCreativePreset?.name ? ` · ${selectedCreativePreset.name}` : ` · ${creativeCopy.custom}`}
	                                </p>
	                              </div>
	                              <button
	                                aria-pressed={creativeDraft.prEnabled}
	                                className={cn(
	                                  "focus-ring rounded-lg border px-3 py-2 text-xs font-black transition",
	                                  creativeDraft.prEnabled ? "border-moss bg-mint/20 text-moss" : "border-line bg-paper text-ink/55"
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
                            className="mt-3 min-h-[132px] w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold leading-5 text-ink outline-none focus:border-moss"
                            onChange={(event) => updatePlanFieldDraft(activeStep, fieldIndex, field, fieldEditLocale, event.target.value)}
                            value={fieldValue}
                          />
                        ) : field.inputType === "select" ? (
                          <select
                            className="mt-3 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm font-bold text-ink outline-none focus:border-moss"
                            onChange={(event) => updatePlanFieldOption(activeStep, fieldIndex, field, event.target.value)}
                            value={fieldValue}
                          >
                            {selectOptions.map((option, optionIndex) => {
                              const optionLabel = getPlanWizardValue(option, fieldEditLocale);

                              return (
                                <option key={`${optionLabel}-${optionIndex}`} value={optionLabel}>
                                  {optionLabel}
                                </option>
                              );
                            })}
                          </select>
                        ) : (
                          <input
                            className="mt-3 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm font-bold text-ink outline-none focus:border-moss"
                            onChange={(event) => updatePlanFieldDraft(activeStep, fieldIndex, field, fieldEditLocale, event.target.value)}
                            type={field.inputType === "url" ? "url" : field.inputType === "number" ? "number" : "text"}
                            value={fieldValue}
                          />
                        )}
                      </label>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_0.82fr]">
            <div className="rounded-lg border border-moss/15 bg-mint/10 p-3">
              <h3 className="text-sm font-black text-moss">{uiCopy.aiChecks}</h3>
              <div className="mt-3 grid gap-2">
                {activeWizardStep.aiChecks.map((item) => (
                  <div className="flex gap-2 rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold leading-5 text-ink/65" key={copy(item)}>
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-moss" />
                    <span>{copy(item)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-white p-3">
              <h3 className="text-sm font-black text-ink">{uiCopy.stepOutput}</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-ink/60">{copy(activeWizardStep.output)}</p>
            </div>
          </div>
        </AdminCard>

        <section className="grid gap-5 lg:grid-cols-2">
          <AdminCard>
            <h3 className="text-lg font-black">{uiCopy.ruleSnapshot}</h3>
            <div className="mt-4 space-y-3">
              {getCampaignRules(previewCampaign).map((rule) => (
                <div className="rounded-lg bg-paper p-3" key={rule.id}>
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-sm">{rule.model} · {rule.trigger}</strong>
                    <Badge tone="blue">{rule.settlementDelayDays} {uiCopy.days}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink/55">{rule.releaseCondition}</p>
                </div>
              ))}
            </div>
          </AdminCard>

          <AdminCard>
            <h3 className="text-lg font-black">{uiCopy.launchPreview}</h3>
            <div className="mt-4 space-y-3 text-sm">
              {previewRows.map(({ label, value }) => (
                <div className="rounded-lg bg-paper p-3" key={label}>
                  <p className="text-xs font-bold text-ink/45">{label}</p>
                  <strong className="mt-1 block">{value}</strong>
                </div>
              ))}
            </div>
          </AdminCard>
        </section>
      </div>
    </div>
    <Drawer
      defaultWidth={720}
      maxWidth={920}
      onClose={() => setCategoryManagerOpen(false)}
      open={categoryManagerOpen}
      title={categoryCopy.manageCategory}
    >
      <div className="space-y-5">
        <section className="rounded-lg border border-line bg-paper p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-ink/45">{categoryCopy.currentList}</p>
              <h3 className="mt-1 text-lg font-black">{categoryCopy.editCategory}</h3>
            </div>
            <Badge tone="blue">{categoryOptions.length}</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {categoryOptions.map((option, optionIndex) => (
              <div className="rounded-lg border border-line bg-white p-3" key={`${copy(option)}-${optionIndex}`}>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                  {categoryLocaleFields.map((field) => (
                    <label className="text-[11px] font-black text-ink/45" key={field.locale}>
                      {field.label}
                      <input
                        className="mt-1 h-10 w-full rounded-lg border border-line bg-paper px-3 text-xs font-bold text-ink outline-none focus:border-moss"
                        onChange={(event) => updateCategoryOption(optionIndex, field.locale, event.target.value)}
                        value={option[field.locale] ?? ""}
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    className="focus-ring inline-flex h-9 items-center rounded-lg border border-coral/40 bg-coral/10 px-3 text-xs font-black text-coral transition hover:bg-coral hover:text-white disabled:opacity-35"
                    disabled={categoryOptions.length <= 1}
                    onClick={() => removeCategoryOption(optionIndex)}
                    type="button"
                  >
                    {categoryCopy.deleteCategory}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-white p-4">
          <h3 className="text-lg font-black">{categoryCopy.addCategory}</h3>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {categoryLocaleFields.map((field) => (
              <label className="text-[11px] font-black text-ink/45" key={field.locale}>
                {field.label}
                <input
                  className="mt-1 h-10 w-full rounded-lg border border-line bg-paper px-3 text-xs font-bold text-ink outline-none focus:border-moss"
                  onChange={(event) => setCategoryDraft((current) => ({ ...current, [field.locale]: event.target.value }))}
                  placeholder={field.placeholder}
                  value={categoryDraft[field.locale] ?? ""}
                />
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              className="focus-ring inline-flex h-11 items-center rounded-lg border border-line bg-paper px-5 text-sm font-black text-[#111827] transition hover:border-moss hover:text-moss disabled:opacity-40"
              disabled={!hasCategoryDraftInput || isCategoryTranslating}
              onClick={() => void translateCategoryDraft()}
              type="button"
            >
              {isCategoryTranslating ? categoryCopy.translating : categoryCopy.translate}
            </button>
            <button
              className="focus-ring inline-flex h-11 items-center rounded-lg bg-[#111827] px-5 text-sm font-black text-white transition hover:bg-moss disabled:opacity-40"
              disabled={!hasCategoryDraftInput || isCategoryTranslating}
              onClick={addCategoryOption}
              type="button"
            >
              {categoryCopy.confirmAdd}
            </button>
          </div>
        </section>
      </div>
    </Drawer>
    </>
  );
}

const minimumOrganizationLevelCount = 2;
const platformOrganizationLabel = "本平台";

function getOrganizationMaxLevel(nodes: BusinessCpsRuntimeState["promoterTeamNodes"]) {
  const existingLevels = nodes.map((node) => node.level).filter((level) => level > 0);

  return Math.max(1, ...existingLevels);
}

function getOrganizationLevelNumbers(nodes: BusinessCpsRuntimeState["promoterTeamNodes"], visibleLevelCount?: number) {
  const maxLevel = Math.max(minimumOrganizationLevelCount, getOrganizationMaxLevel(nodes), visibleLevelCount ?? 0);

  return Array.from({ length: maxLevel }, (_, index) => index + 1);
}

function getOrganizationLevelOptions(nodes: BusinessCpsRuntimeState["promoterTeamNodes"]) {
  const levels = getOrganizationLevelNumbers(nodes);
  const nextLevel = levels[levels.length - 1] + 1;

  return [...levels, nextLevel];
}

function TeamModule({
  onCreateSubPromoter,
  onEditPromoter
}: {
  onCreateSubPromoter: (parentPromoterId?: string, level?: number) => void;
  onEditPromoter: (promoterId: string) => void;
}) {
  const { state } = useCpsRuntime();
  const findPromoter = (promoterId: string) => state.promoters.find((promoter) => promoter.id === promoterId);
  const findCampaign = (campaignId: string) => state.campaigns.find((campaign) => campaign.id === campaignId);
  const defaultParentNode = state.promoterTeamNodes.find((node) => node.level === 1) ?? state.promoterTeamNodes[0];
  const minimumVisibleLevelCount = Math.max(minimumOrganizationLevelCount, getOrganizationMaxLevel(state.promoterTeamNodes));
  const [visibleLevelCount, setVisibleLevelCount] = useState(minimumVisibleLevelCount);
  const [levelEditorOpen, setLevelEditorOpen] = useState(false);
  const canReduceVisibleLevel = visibleLevelCount > minimumVisibleLevelCount;
  const levelSummary = getOrganizationLevelNumbers(state.promoterTeamNodes, visibleLevelCount).map((level) => ({
    level,
    nodes: state.promoterTeamNodes.filter((node) => node.level === level)
  }));
  const activeLevelOneCommissionCondition = state.commissionConditionRules.find((rule) => rule.appliesToLevel === 1 && rule.status === "active") ?? null;

  useEffect(() => {
    setVisibleLevelCount((current) => Math.max(current, minimumVisibleLevelCount));
  }, [minimumVisibleLevelCount]);

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="组织节点" value={state.promoterTeamNodes.length.toLocaleString("ja-JP")} caption="新增后会进入组织层级和推广者列表" />
        <MetricCard label="下级推广者" value={state.promoterTeamNodes.filter((node) => node.parentPromoterId).length.toLocaleString("ja-JP")} caption="按真实组织上下级关系统计" />
        <MetricCard label="组织预算消耗" value={yen(state.promoterTeamNodes.reduce((sum, node) => sum + node.budgetUsed, 0))} caption="独立预算与占用上级预算合计" />
        <MetricCard label="组织风险节点" value={state.promoterTeamNodes.filter((node) => node.riskLevel !== "low").length.toLocaleString("ja-JP")} caption="观察 / 高风险组织需人工复核" tone="red" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="min-w-0 space-y-3">
          <AdminCard>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-black">组织层级</h2>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Badge tone="blue">当前展示 1 / {visibleLevelCount} 级</Badge>
                <Button onClick={() => setLevelEditorOpen((current) => !current)} size="sm" variant="secondary">
                  编辑层级
                </Button>
              </div>
            </div>
            {levelEditorOpen ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3 py-2">
                <p className="text-xs font-bold text-ink/50">增加或收起展示层级；减少层级不会删除已有组织节点。</p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setVisibleLevelCount((current) => current + 1)} size="sm">
                    增加层级
                  </Button>
                  <Button disabled={!canReduceVisibleLevel} onClick={() => setVisibleLevelCount((current) => Math.max(minimumVisibleLevelCount, current - 1))} size="sm" variant="secondary">
                    减少层级
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="mt-4 space-y-3">
              {levelSummary.map(({ level, nodes }) => (
                <div className="rounded-lg bg-paper p-3" key={level}>
                  <div className="flex items-center justify-between gap-3">
                    <strong>{level}级</strong>
                    <Badge tone={level === 1 ? "green" : "blue"}>{nodes.length} 个节点</Badge>
                  </div>
                  <div className="mt-3 space-y-2">
                    {nodes.length === 0 ? <p className="rounded-lg border border-dashed border-line bg-white p-3 text-xs text-ink/45">暂无该组织层级推广者</p> : null}
                    {nodes.map((node) => {
                      const promoter = findPromoter(node.promoterId);
                      const parent = node.parentPromoterId ? findPromoter(node.parentPromoterId) : null;
                      const conditionSnapshot = getBusinessCpsTierConditionSnapshot(node, state.commissionConditionRules);
                      const commissionProfile = conditionSnapshot.profile;
                      const currentTier = conditionSnapshot.currentTier;
                      const settledTier = conditionSnapshot.settledTier;

                      return (
                        <div className="rounded-lg border border-line bg-white p-3" key={node.id}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <strong className="text-sm">{promoter?.name ?? node.promoterId}</strong>
                            <Badge tone={riskTone[node.riskLevel]}>{node.riskLevel}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-ink/55">
                            {parent ? `上级组织 ${parent.name}` : `广告主 ${platformOrganizationLabel}`} · 组织 {node.teamSize} 人 · 下级 {node.directChildren} 人
                          </p>
                          <p className="mt-1 text-xs text-ink/45">
                            分成 {currentTier ? percent(currentTier.commissionRate) : percent(node.commissionRate)} · {commissionBasisLabels[commissionProfile.commissionBasis]} · {commissionProfile.settlementDelayDays} 天后可结算
                          </p>
                          <div className="mt-2">
                            <ProgressBar label={`${conditionSnapshot.progress}%`} value={conditionSnapshot.progress} />
                          </div>
                          <p className="mt-1 text-[11px] font-bold text-ink/45">
                            {commissionProfile.source === "rule" ? `规则：${commissionProfile.name} · ` : ""}
                            当前 {currentTier?.name ?? "阶梯"} 条件进度
                            {settledTier ? ` · 已锁定 ${settledTier.name} 结算` : " · 未达成首个阶梯"}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <ActionChip onClick={() => onEditPromoter(node.promoterId)}>编辑</ActionChip>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </AdminCard>

          <AdminCard>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black">当前生效分成条件</h2>
                <p className="mt-1 text-sm text-ink/55">这里仅显示平台当前用于 1级账号判定的生效阶梯条件。</p>
              </div>
              <Badge tone={activeLevelOneCommissionCondition ? "green" : "neutral"}>{activeLevelOneCommissionCondition ? "生效" : "未设置"}</Badge>
            </div>
            {activeLevelOneCommissionCondition ? (
              <div className="mt-4 rounded-lg border border-line bg-paper p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">{activeLevelOneCommissionCondition.name}</strong>
                  <span className="text-xs font-black text-ink/45">{commissionBasisLabels[activeLevelOneCommissionCondition.commissionBasis]} · {activeLevelOneCommissionCondition.settlementDelayDays} 天后可结算</span>
                </div>
                <div className="mt-3 grid gap-2">
                  {cloneCommissionTiers(activeLevelOneCommissionCondition.commissionTiers).map((tier) => (
                    <div className="rounded-md border border-line bg-white px-3 py-2" key={tier.id}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="text-xs text-ink">{tier.name}</strong>
                        <span className="text-xs font-black text-moss">分成 {percent(tier.commissionRate)}</span>
                      </div>
                      <p className="mt-1 text-xs font-bold leading-5 text-ink/50">
                        注册 {tier.requirements.registrations} 人 · 店铺活跃 {tier.requirements.activeShops} 家 · 每周 {tier.requirements.activeShopWeeklyOrders} 单 · 首单 {tier.requirements.firstOrders} 单 · 流水 {yen(tier.requirements.paymentGmv)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-line bg-paper p-3 text-xs font-bold text-ink/45">暂无生效分成条件。</p>
            )}
          </AdminCard>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white p-4 shadow-panel">
            <div>
              <h2 className="text-lg font-black">组织推广者列表</h2>
              <p className="mt-1 text-sm text-ink/55">默认推广渠道可直接用表头筛选；添加按钮集中在列表区域。</p>
            </div>
            <Button onClick={() => onCreateSubPromoter(defaultParentNode?.promoterId, defaultParentNode ? defaultParentNode.level + 1 : 1)} size="sm">
              添加下级推广者
            </Button>
          </div>
          <DataTable
            columns={[
            {
              key: "promoter",
              title: "推广者 / 组织关系",
              render: (row) => {
                const promoter = findPromoter(row.promoterId);
                const parent = row.parentPromoterId ? findPromoter(row.parentPromoterId) : null;

                return (
                  <div>
                    <strong>{promoter?.name ?? row.promoterId}</strong>
                    <span className="mt-1 block text-xs text-ink/45">{parent ? `上级组织：${parent.name}` : `广告主：${platformOrganizationLabel}`}</span>
                  </div>
                );
              },
              width: "260px"
            },
            { key: "campaign", title: "活动", render: (row) => findCampaign(row.campaignId)?.name ?? row.campaignId, width: "260px" },
            { key: "level", title: "组织层级", render: (row) => `${row.level}级`, filterValue: (row) => `${row.level}级`, sortValue: (row) => row.level },
            {
              key: "defaultChannel",
              title: "默认推广渠道",
              render: (row) => findPromoter(row.promoterId)?.primaryChannel || "未设置",
              filterValue: (row) => findPromoter(row.promoterId)?.primaryChannel || "未设置",
              width: "180px"
            },
            { key: "team", title: "组织人数", render: (row) => `${row.teamSize} / 直属 ${row.directChildren}`, sortValue: (row) => row.teamSize },
            {
              key: "commissionRate",
              title: "分成",
              render: (row) => {
                const snapshot = getBusinessCpsTierConditionSnapshot(row, state.commissionConditionRules);
                const profile = snapshot.profile;

                return `${snapshot.currentTier ? percent(snapshot.currentTier.commissionRate) : percent(row.commissionRate)} · ${commissionBasisLabels[profile.commissionBasis]}`;
              },
              sortValue: (row) => getBusinessCpsTierConditionSnapshot(row, state.commissionConditionRules).currentTier?.commissionRate ?? row.commissionRate,
              width: "190px"
            },
            { key: "budget", title: "预算模式", render: (row) => row.budgetMode === "inherit_parent" ? "占用上级预算" : "独立预算", width: "140px" },
            {
              key: "budgetUsed",
              title: "预算消耗",
              render: (row) => (
                <div className="w-[180px]">
                  <div className="flex justify-between text-xs font-bold text-ink/55">
                    <span>{yen(row.budgetUsed)}</span>
                    <span>{percent((row.budgetUsed / Math.max(1, row.budgetTotal)) * 100)}</span>
                  </div>
                  <div className="mt-2"><ProgressBar value={(row.budgetUsed / Math.max(1, row.budgetTotal)) * 100} /></div>
                </div>
              ),
              width: "220px"
            },
            {
              key: "targets",
              title: "条件进度",
              render: (row) => {
                const snapshot = getBusinessCpsTierConditionSnapshot(row, state.commissionConditionRules);
                const tier = snapshot.currentTier;

                return (
                  <div className="w-[240px]">
                    <ProgressBar label={`${snapshot.progress}%`} value={snapshot.progress} />
                    <p className="mt-1 text-xs font-bold text-ink/45">
                      {tier?.name ?? "阶梯"} · 注册 {row.completedRegisters}/{tier?.requirements.registrations ?? row.targetRegisters} · 首单 {row.completedFirstOrders}/{tier?.requirements.firstOrders ?? row.targetFirstOrders}
                    </p>
                  </div>
                );
              },
              width: "280px"
            },
            {
              key: "conditions",
              title: "分成条件",
              render: (row) => {
                const profile = getBusinessCpsTeamNodeCommissionProfile(row, state.commissionConditionRules);

                return `${profile.source === "rule" ? `${profile.name} / ` : ""}${profile.releaseCondition} / ${profile.riskCondition}`;
              },
              width: "360px"
            },
            { key: "risk", title: "风险", render: (row) => <Badge tone={riskTone[row.riskLevel]}>{row.riskLevel}</Badge> },
            {
              key: "actions",
              title: "操作",
              render: (row) => (
                <div className="flex flex-wrap gap-2">
                  <ActionChip onClick={() => onEditPromoter(row.promoterId)}>编辑</ActionChip>
                  <ActionChip onClick={() => onCreateSubPromoter(row.promoterId, row.level + 1)}>添加下级</ActionChip>
                </div>
              ),
              width: "170px"
            }
          ]}
            rows={state.promoterTeamNodes}
            pageSize={8}
          />
        </div>
      </section>
    </div>
  );
}

type LinkDataRow = {
  id: string;
  group: string;
  shortUrl: string;
  campaignName: string;
  promoterName: string;
  channelName: string;
  materialName: string;
  status: BusinessCpsCarrierStatus;
  impressions: number;
  clicks: number;
  ctr: number;
  signups: number;
  signupRate: number;
  verifiedSignups: number;
  verifiedSignupRate: number;
  paidLeads: number;
  firstPurchaseAmount: number;
  firstPurchases: number;
  firstPurchaseRate: number;
  rebillAmount: number;
  rebills: number;
  uniqueSpenders: number;
  rebillRate: number;
  riskEvents: number;
  lastEventAt: string;
};

function rateOf(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

function sumLinkData(rows: LinkDataRow[], key: keyof Pick<LinkDataRow, "impressions" | "clicks" | "signups" | "verifiedSignups" | "firstPurchases" | "rebills" | "rebillAmount" | "riskEvents">) {
  return rows.reduce((total, row) => total + Number(row[key]), 0);
}

const linkDataDatePresets = ["今天", "昨天", "最近 7 天", "最近 30 天", "本月", "上月", "最近 90 天", "本季度", "上季度", "最近 365 天", "今年", "去年"];
const linkDataPresetAnchorDate = "2025-12-12";

function parseDateInputValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDaysToDateInputValue(value: string, offset: number) {
  const date = parseDateInputValue(value);
  date.setDate(date.getDate() + offset);

  return formatDateInputValue(date);
}

function getMonthBoundaryDate(value: string, offset: number, boundary: "start" | "end") {
  const anchorDate = parseDateInputValue(value);
  const month = anchorDate.getMonth() + offset;
  const date = boundary === "start"
    ? new Date(anchorDate.getFullYear(), month, 1)
    : new Date(anchorDate.getFullYear(), month + 1, 0);

  return formatDateInputValue(date);
}

function getQuarterBoundaryDate(value: string, offset: number, boundary: "start" | "end") {
  const anchorDate = parseDateInputValue(value);
  const currentQuarterStartMonth = Math.floor(anchorDate.getMonth() / 3) * 3;
  const startMonth = currentQuarterStartMonth + offset * 3;
  const date = boundary === "start"
    ? new Date(anchorDate.getFullYear(), startMonth, 1)
    : new Date(anchorDate.getFullYear(), startMonth + 3, 0);

  return formatDateInputValue(date);
}

function getYearBoundaryDate(value: string, offset: number, boundary: "start" | "end") {
  const anchorDate = parseDateInputValue(value);
  const year = anchorDate.getFullYear() + offset;
  const date = boundary === "start" ? new Date(year, 0, 1) : new Date(year, 11, 31);

  return formatDateInputValue(date);
}

function getLinkDataPresetRange(preset: string) {
  const anchor = linkDataPresetAnchorDate;

  if (preset === "今天") {
    return { startDate: anchor, endDate: anchor };
  }

  if (preset === "昨天") {
    const yesterday = addDaysToDateInputValue(anchor, -1);

    return { startDate: yesterday, endDate: yesterday };
  }

  if (preset === "最近 7 天") {
    return { startDate: addDaysToDateInputValue(anchor, -7), endDate: anchor };
  }

  if (preset === "最近 30 天") {
    return { startDate: addDaysToDateInputValue(anchor, -30), endDate: anchor };
  }

  if (preset === "本月") {
    return { startDate: getMonthBoundaryDate(anchor, 0, "start"), endDate: anchor };
  }

  if (preset === "上月") {
    return {
      startDate: getMonthBoundaryDate(anchor, -1, "start"),
      endDate: getMonthBoundaryDate(anchor, -1, "end")
    };
  }

  if (preset === "最近 90 天") {
    return { startDate: addDaysToDateInputValue(anchor, -90), endDate: anchor };
  }

  if (preset === "本季度") {
    return { startDate: getQuarterBoundaryDate(anchor, 0, "start"), endDate: anchor };
  }

  if (preset === "上季度") {
    return {
      startDate: getQuarterBoundaryDate(anchor, -1, "start"),
      endDate: getQuarterBoundaryDate(anchor, -1, "end")
    };
  }

  if (preset === "最近 365 天") {
    return { startDate: addDaysToDateInputValue(anchor, -365), endDate: anchor };
  }

  if (preset === "今年") {
    return { startDate: getYearBoundaryDate(anchor, 0, "start"), endDate: anchor };
  }

  if (preset === "去年") {
    return {
      startDate: getYearBoundaryDate(anchor, -1, "start"),
      endDate: getYearBoundaryDate(anchor, -1, "end")
    };
  }

  return { startDate: addDaysToDateInputValue(anchor, -7), endDate: anchor };
}

function formatLinkDataDateLabel(value: string) {
  const [year, month, day] = value.split("-");

  return `${year}/${month}/${day}`;
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={cn("h-4 w-4", className)} fill="none" viewBox="0 0 24 24">
      <path d="M7 3v3M17 3v3M4.5 9.5h15" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M6.5 5.5h11A2.5 2.5 0 0 1 20 8v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18V8a2.5 2.5 0 0 1 2.5-2.5Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function LinkDataDateField({
  label,
  max,
  min,
  onChange,
  value
}: {
  label: string;
  max?: string;
  min?: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openPicker = () => {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    input.focus({ preventScroll: true });
    input.showPicker?.();
  };

  return (
    <label className="relative flex w-[172px] shrink-0 flex-col gap-1.5">
      <span className="text-[11px] font-black text-ink/50">{label}</span>
      <button
        className="focus-ring flex h-12 w-full items-center justify-between rounded-[18px] border border-line bg-paper px-4 text-left text-sm font-black text-ink shadow-sm transition hover:border-[color:var(--admin-accent)] hover:bg-white"
        onClick={openPicker}
        type="button"
      >
        <span>{formatLinkDataDateLabel(value)}</span>
        <CalendarIcon className="text-ink/55" />
      </button>
      <input
        ref={inputRef}
        aria-label={label}
        className="sr-only"
        max={max}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        tabIndex={-1}
        type="date"
        value={value}
      />
    </label>
  );
}

const linkDataReportSections = [
  {
    key: "affiliate",
    title: "Afirieito 推广追踪",
    items: ["推广活动", "推广素材", "推广渠道", "自定义追踪参数 #1", "自定义追踪参数 #2", "自定义追踪参数 #3", "来源页面"]
  },
  {
    key: "client",
    title: "用户设备数据",
    items: ["国家 / 地区", "IP 类型", "用户语言", "浏览器", "浏览器版本", "设备", "客户端设备", "设备型号", "设备品牌", "操作系统", "系统版本", "网站", "会员"]
  },
  {
    key: "smartlinks",
    title: "智能推广链接",
    items: ["活动类型", "流量方向", "流量子类型", "流量类型"]
  },
  {
    key: "calendar",
    title: "日历维度",
    items: ["小时", "天", "周", "月", "季度", "年", "星期几", "一天中的小时"]
  }
];

function LinkDataModule() {
  const { state } = useCpsRuntime();
  const [searchValue, setSearchValue] = useState("");
  const [groupSearchValue, setGroupSearchValue] = useState("");
  const [reportBuilderOpen, setReportBuilderOpen] = useState(false);
  const [activeDatePreset, setActiveDatePreset] = useState("最近 7 天");
  const [dateRange, setDateRange] = useState(() => getLinkDataPresetRange("最近 7 天"));
  const [rowLimit, setRowLimit] = useState("12");
  const [activeReportChips, setActiveReportChips] = useState<Set<string>>(() => new Set(["按天", "推广活动", "推广渠道", "国家 / 地区", "设备", "包含曝光数据", "包含点击数据"]));
  const rowLimitNumber = Number(rowLimit);
  const rows = useMemo<LinkDataRow[]>(
    () =>
      state.promotionLinks.map((link) => {
        const campaign = getCampaignById(link.campaignId);
        const promoter = state.promoters.find((item) => item.id === link.promoterId);
        const channel = getChannelById(link.channelId);
        const material = getMaterialById(link.materialId);
        const qrs = state.qrCodes.filter((qr) => qr.linkId === link.id);
        const events = businessCpsTrackingEvents.filter((event) => event.linkId === link.id);
        const scans = qrs.reduce((total, qr) => total + qr.scans, 0);
        const qrRegistrations = qrs.reduce((total, qr) => total + qr.registrations, 0);
        const qrEkyc = qrs.reduce((total, qr) => total + qr.ekycCompletions, 0);
        const eventImpressions = events.filter((event) => event.eventType === "impression").length;
        const impressions = Math.max(eventImpressions, Math.round(link.clicks * 9.4 + scans * 2.7));
        const clicks = link.clicks + scans;
        const signups = link.registrations + qrRegistrations;
        const verifiedSignups = Math.min(signups, qrEkyc + Math.round(link.registrations * 0.62));
        const firstPurchases = link.firstOrders;
        const rebills = Math.max(0, link.orders - link.firstOrders);
        const uniqueSpenders = Math.max(firstPurchases, Math.round(link.orders * 0.76));
        const firstPurchaseAmount = firstPurchases > 0 ? Math.round(link.gmv * Math.min(0.72, firstPurchases / Math.max(1, link.orders))) : 0;
        const lastEventAt = events.length ? [...events].sort((left, right) => left.createdAt.localeCompare(right.createdAt))[events.length - 1].createdAt : link.createdAt;

        return {
          id: link.id,
          group: link.name,
          shortUrl: link.shortUrl,
          campaignName: campaign?.name ?? link.campaignId,
          promoterName: promoter?.name ?? link.promoterId,
          channelName: channel?.name ?? link.channelId,
          materialName: material?.title ?? link.materialId,
          status: link.status,
          impressions,
          clicks,
          ctr: rateOf(clicks, impressions),
          signups,
          signupRate: rateOf(signups, clicks),
          verifiedSignups,
          verifiedSignupRate: rateOf(verifiedSignups, Math.max(1, signups)),
          paidLeads: Math.max(firstPurchases, Math.round(link.orders * 0.42)),
          firstPurchaseAmount,
          firstPurchases,
          firstPurchaseRate: rateOf(firstPurchases, Math.max(1, signups)),
          rebillAmount: Math.max(0, link.gmv - firstPurchaseAmount),
          rebills,
          uniqueSpenders,
          rebillRate: rateOf(rebills, Math.max(1, uniqueSpenders)),
          riskEvents: link.riskEvents + qrs.reduce((total, qr) => total + qr.abnormalScans, 0),
          lastEventAt
        };
      }),
    [state]
  );
  const filteredRows = useMemo(() => {
    const query = searchValue.trim().toLowerCase();

    if (!query) {
      return rows;
    }

    return rows.filter((row) =>
      [row.group, row.shortUrl, row.campaignName, row.promoterName, row.channelName, row.materialName, row.status].some((value) =>
        value.toLowerCase().includes(query)
      )
    );
  }, [rows, searchValue]);
  const visibleRows = useMemo(() => filteredRows.slice(0, rowLimitNumber), [filteredRows, rowLimitNumber]);
  const totalImpressions = sumLinkData(filteredRows, "impressions");
  const totalClicks = sumLinkData(filteredRows, "clicks");
  const totalSignups = sumLinkData(filteredRows, "signups");
  const totalVerifiedSignups = sumLinkData(filteredRows, "verifiedSignups");
  const totalFirstPurchases = sumLinkData(filteredRows, "firstPurchases");
  const totalRebills = sumLinkData(filteredRows, "rebills");
  const totalRiskEvents = sumLinkData(filteredRows, "riskEvents");
  const totalRebillAmount = sumLinkData(filteredRows, "rebillAmount");
  const toolbarControlClassName = "h-10 rounded-md border border-white/10 bg-white/10 px-3 text-sm font-bold text-white outline-none transition placeholder:text-white/45 focus:border-[color:var(--admin-accent-strong)]";
  const toggleReportChip = (chip: string) => {
    setActiveReportChips((current) => {
      const next = new Set(current);

      if (next.has(chip)) {
        next.delete(chip);
      } else {
        next.add(chip);
      }

      return next;
    });
  };
  const reportChipClassName = (chip: string) =>
    cn(
      "focus-ring inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-black transition",
      activeReportChips.has(chip) ? "border-[color:var(--admin-accent)] bg-[color:var(--admin-accent)] text-white shadow-panel" : "border-line bg-[#eef3ff] text-[#4863a0] hover:border-[color:var(--admin-accent)]"
    );
  const updateDateRange = (key: "startDate" | "endDate", value: string) => {
    if (!value) {
      return;
    }

    setDateRange((current) => {
      const next = { ...current, [key]: value };

      if (key === "startDate" && value > current.endDate) {
        next.endDate = value;
      }

      if (key === "endDate" && value < current.startDate) {
        next.startDate = value;
      }

      return next;
    });
    setActiveDatePreset("");
  };
  const applyDatePreset = (preset: string) => {
    setDateRange(getLinkDataPresetRange(preset));
    setActiveDatePreset(preset);
  };

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        <MetricCard label="发行链接" value={filteredRows.length.toLocaleString("ja-JP")} caption="按短链归集 QR / 码 / 事件" />
        <MetricCard label="展示" value={totalImpressions.toLocaleString("ja-JP")} caption="展示次数" />
        <MetricCard label="点击" value={totalClicks.toLocaleString("ja-JP")} caption={`CTR ${percent(rateOf(totalClicks, totalImpressions))}`} />
        <MetricCard label="注册" value={totalSignups.toLocaleString("ja-JP")} caption={`注册转化 ${percent(rateOf(totalSignups, totalClicks))}`} />
        <MetricCard label="认证注册" value={totalVerifiedSignups.toLocaleString("ja-JP")} caption={percent(rateOf(totalVerifiedSignups, totalSignups))} tone="green" />
        <MetricCard label="首购 / 复购" value={`${totalFirstPurchases.toLocaleString("ja-JP")} / ${totalRebills.toLocaleString("ja-JP")}`} caption={`复购金额 ${yen(totalRebillAmount)}`} />
        <MetricCard label="风险事件" value={totalRiskEvents.toLocaleString("ja-JP")} caption="异常扫码与链路风险" tone={totalRiskEvents > 0 ? "red" : "default"} />
      </section>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-ink p-2 shadow-panel">
        <button
          aria-expanded={reportBuilderOpen}
          className="focus-ring inline-flex h-10 items-center justify-center rounded-md bg-white/10 px-3 text-sm font-black text-white transition hover:bg-white/18"
          onClick={() => setReportBuilderOpen((open) => !open)}
          type="button"
        >
          搜索条件
        </button>
        <select aria-label="视图模式" className={toolbarControlClassName} defaultValue="simple">
          <option value="simple">简易模式</option>
          <option value="conversion">转化模式</option>
          <option value="rebill">复购模式</option>
        </select>
        <select aria-label="行数限制" className={toolbarControlClassName} onChange={(event) => setRowLimit(event.target.value)} value={rowLimit}>
          <option value="8">8 行限制</option>
          <option value="12">12 行限制</option>
          <option value="24">24 行限制</option>
          <option value="48">48 行限制</option>
        </select>
        <input
          aria-label="搜索链接数据"
          className={cn(toolbarControlClassName, "min-w-[220px] flex-1")}
          onFocus={() => setReportBuilderOpen(true)}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder="搜索..."
          type="search"
          value={searchValue}
        />
        <span className="ml-auto inline-flex h-10 items-center rounded-md bg-white/10 px-3 text-xs font-black text-white/75">列设置 {18}</span>
        <span className="inline-flex h-10 items-center rounded-md bg-white/10 px-3 text-xs font-black text-white/75">标签</span>
      </div>

      {reportBuilderOpen ? (
        <AdminCard className="overflow-hidden p-0">
          <div className="flex flex-wrap items-end gap-2 border-b border-line bg-white px-4 py-3">
            <LinkDataDateField
              label="开始日期"
              max={dateRange.endDate}
              onChange={(value) => updateDateRange("startDate", value)}
              value={dateRange.startDate}
            />
            <LinkDataDateField
              label="结束日期"
              min={dateRange.startDate}
              onChange={(value) => updateDateRange("endDate", value)}
              value={dateRange.endDate}
            />
            <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2 pb-0.5">
              {linkDataDatePresets.map((preset) => (
                <button
                  className={cn(
                    "focus-ring h-8 rounded-full px-3 text-xs font-black transition",
                    activeDatePreset === preset ? "bg-[color:var(--admin-accent)] text-white shadow-panel" : "bg-[#eef3ff] text-[#5a6f9f] hover:bg-[#dfe8ff]"
                  )}
                  key={preset}
                  onClick={() => applyDatePreset(preset)}
                  type="button"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-[244px_minmax(0,1fr)]">
            <aside className="border-b border-line bg-[#f8fafc] p-4 lg:border-b-0 lg:border-r">
              <div className="space-y-4">
                <section>
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#50638a]">分组</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className={reportChipClassName("按天")} onClick={() => toggleReportChip("按天")} type="button">按天 ×</button>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-ink/45">最多 5 层嵌套</p>
                </section>

                <section className="rounded-lg border border-line bg-white p-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-ink/45">筛选条件</p>
                  <div className="mt-3 grid gap-2">
                    {["状态：启用", "风险 < 30", "已设置渠道"].map((chip) => (
                      <button className={reportChipClassName(chip)} key={chip} onClick={() => toggleReportChip(chip)} type="button">{chip}</button>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-line bg-white p-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-ink/45">选项</p>
                  <div className="mt-3 grid gap-2">
                    {["包含曝光数据", "包含点击数据", "包含 QR 扫码"].map((chip) => (
                      <button className={reportChipClassName(chip)} key={chip} onClick={() => toggleReportChip(chip)} type="button">{chip} ×</button>
                    ))}
                  </div>
                </section>
              </div>
            </aside>

            <div className="p-4">
              <input
                aria-label="搜索分组"
                className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink outline-none transition placeholder:text-ink/35 focus:border-[color:var(--admin-accent)]"
                onChange={(event) => setGroupSearchValue(event.target.value)}
                placeholder="搜索分组"
                value={groupSearchValue}
              />

              <div className="mt-4 divide-y divide-line">
                {linkDataReportSections.map((section) => {
                  const visibleItems = groupSearchValue.trim()
                    ? section.items.filter((item) => item.toLowerCase().includes(groupSearchValue.trim().toLowerCase()))
                    : section.items;

                  return visibleItems.length ? (
                    <section className="py-4 first:pt-0" key={section.key}>
                      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-ink/45">{section.title}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {visibleItems.map((chip) => (
                          <button className={reportChipClassName(chip)} key={chip} onClick={() => toggleReportChip(chip)} type="button">
                            {chip}
                          </button>
                        ))}
                      </div>
                    </section>
                  ) : null;
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper px-4 py-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => {
                setSearchValue("");
                setGroupSearchValue("");
                setActiveDatePreset("最近 7 天");
                setDateRange(getLinkDataPresetRange("最近 7 天"));
                setActiveReportChips(new Set(["按天", "推广活动", "推广渠道", "国家 / 地区", "设备", "包含曝光数据", "包含点击数据"]));
              }}>
                重置筛选条件
              </Button>
              <Button onClick={() => setReportBuilderOpen(false)}>生成分析报表</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary">获取外部 API</Button>
              <Button variant="secondary">保存为预设</Button>
            </div>
          </div>
        </AdminCard>
      ) : null}

      <DataTable<LinkDataRow>
        columns={[
          {
            key: "group",
            title: "分组 / 发行链接",
            render: (row) => (
              <div>
                <strong>{row.group}</strong>
                <span className="mt-1 block text-xs text-ink/45" data-no-i18n>{row.shortUrl}</span>
              </div>
            ),
            filterValue: (row) => row.group,
            width: "280px"
          },
          { key: "impressions", title: "展示次数", render: (row) => row.impressions.toLocaleString("ja-JP"), sortValue: (row) => row.impressions },
          { key: "clicks", title: "点击数", render: (row) => row.clicks.toLocaleString("ja-JP"), sortValue: (row) => row.clicks },
          { key: "ctr", title: "点击率", render: (row) => percent(row.ctr), sortValue: (row) => row.ctr },
          { key: "signups", title: "注册数", render: (row) => row.signups.toLocaleString("ja-JP"), sortValue: (row) => row.signups },
          { key: "signupRate", title: "注册率", render: (row) => percent(row.signupRate), sortValue: (row) => row.signupRate, width: "150px" },
          { key: "verifiedSignups", title: "已验证注册数", render: (row) => row.verifiedSignups.toLocaleString("ja-JP"), sortValue: (row) => row.verifiedSignups, width: "180px" },
          { key: "verifiedRate", title: "验证率", render: (row) => percent(row.verifiedSignupRate), sortValue: (row) => row.verifiedSignupRate, width: "160px" },
          { key: "paidLeads", title: "付费线索", render: (row) => row.paidLeads.toLocaleString("ja-JP"), sortValue: (row) => row.paidLeads, width: "140px" },
          { key: "firstPurchaseAmount", title: "首次购买金额", render: (row) => yen(row.firstPurchaseAmount), sortValue: (row) => row.firstPurchaseAmount, width: "190px" },
          { key: "firstPurchases", title: "首次购买", render: (row) => row.firstPurchases.toLocaleString("ja-JP"), sortValue: (row) => row.firstPurchases, width: "170px" },
          { key: "firstPurchaseRate", title: "首次购买率", render: (row) => percent(row.firstPurchaseRate), sortValue: (row) => row.firstPurchaseRate, width: "190px" },
          { key: "rebillAmount", title: "续费金额", render: (row) => yen(row.rebillAmount), sortValue: (row) => row.rebillAmount, width: "160px" },
          { key: "rebills", title: "续费 / 复购", render: (row) => row.rebills.toLocaleString("ja-JP"), sortValue: (row) => row.rebills },
          { key: "uniqueSpenders", title: "独立消费人数", render: (row) => row.uniqueSpenders.toLocaleString("ja-JP"), sortValue: (row) => row.uniqueSpenders, width: "180px" },
          { key: "rebillRate", title: "续费 / 复购率", render: (row) => percent(row.rebillRate), sortValue: (row) => row.rebillRate, width: "150px" },
          { key: "risk", title: "风险", render: (row) => <Badge tone={row.riskEvents >= 10 ? "red" : row.riskEvents > 0 ? "yellow" : "green"}>{row.riskEvents}</Badge>, sortValue: (row) => row.riskEvents },
          { key: "status", title: "状态", render: (row) => <Badge tone={carrierStatusTone[row.status]}>{carrierStatusLabels[row.status]}</Badge>, filterValue: (row) => carrierStatusLabels[row.status] },
          { key: "campaign", title: "推广计划", render: (row) => row.campaignName, filterValue: (row) => row.campaignName, width: "260px" },
          { key: "promoter", title: "推广者", render: (row) => row.promoterName, filterValue: (row) => row.promoterName, width: "170px" },
          { key: "channel", title: "渠道 / 素材", render: (row) => `${row.channelName} / ${row.materialName}`, filterValue: (row) => row.channelName, width: "260px" },
          { key: "lastEvent", title: "最后事件", render: (row) => row.lastEventAt, sortValue: (row) => row.lastEventAt, width: "170px" }
        ]}
        footerPlacement="inline"
        pageSize={rowLimitNumber}
        rows={visibleRows}
      />
    </div>
  );
}

const linksBuilderFieldClassName = "h-11 w-full rounded-lg border border-line bg-white px-3 text-sm font-bold text-ink outline-none transition focus:border-moss";

const linksBuilderTrackingFields = [
  { key: "click-id", label: "回传点击 ID", placeholder: "设置回传点击 ID" },
  { key: "campaign", label: "推广活动", placeholder: "设置推广活动" },
  { key: "creative", label: "推广素材", placeholder: "设置推广素材" },
  { key: "source", label: "推广渠道", placeholder: "设置推广渠道" }
];

function LinksBuilderModule() {
  return (
    <div className="grid w-full gap-5 2xl:grid-cols-[minmax(0,1.25fr)_minmax(380px,0.75fr)]">
      <AdminCard className="p-0 2xl:col-span-2">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-xl font-black text-ink">最终推广链接</h2>
        </div>
        <div className="p-5">
          <input className={linksBuilderFieldClassName} defaultValue="https://go.needo.jp/l" aria-label="最终推广链接" />
        </div>
      </AdminCard>

      <AdminCard className="p-0">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-xl font-black text-ink">追踪参数</h2>
        </div>
        <div className="grid gap-4 p-5">
          {linksBuilderTrackingFields.map((field) => (
            <label className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center" key={field.key}>
              <span className="text-xs font-black uppercase tracking-[0.08em] text-ink/45">{field.label}</span>
              <input className={linksBuilderFieldClassName} placeholder={field.placeholder} />
            </label>
          ))}
        </div>
      </AdminCard>

      <div className="grid content-start gap-5">
        <AdminCard className="p-0">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-xl font-black text-ink">落地页设置</h2>
          </div>
          <div className="grid gap-4 p-5">
            <label className="grid gap-3 xl:grid-cols-[140px_minmax(0,1fr)] xl:items-center">
              <span className="text-xs font-black uppercase tracking-[0.08em] text-ink/45">跳转页面</span>
              <select className={linksBuilderFieldClassName} defaultValue="main">
                <option value="main">NeeDo 主页</option>
                <option value="akira">Akira 落地页</option>
                <option value="experience">Experience 落地页</option>
                <option value="campaign">活动页</option>
              </select>
            </label>
          </div>
        </AdminCard>

        <AdminCard className="p-0">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-xl font-black text-ink">页面设置</h2>
          </div>
          <div className="grid gap-4 p-5">
            <label className="grid gap-3 xl:grid-cols-[140px_minmax(0,1fr)] xl:items-center">
              <span className="text-xs font-black uppercase tracking-[0.08em] text-ink/45">进入页面后显示弹窗</span>
              <select className={linksBuilderFieldClassName} defaultValue="">
                <option value="">选择弹窗 / 落地页选项</option>
                <option value="signup">打开注册弹窗</option>
                <option value="coupon">显示优惠券弹窗</option>
                <option value="chat">打开聊天入口</option>
                <option value="none">不显示弹窗</option>
              </select>
            </label>
          </div>
        </AdminCard>
      </div>
    </div>
  );
}

function LinkCodeQrModule() {
  const { state, onCarrierAction } = useCpsRuntime();
  const findPromoter = (promoterId: string) => state.promoters.find((promoter) => promoter.id === promoterId);

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="短链" value={state.promotionLinks.length.toLocaleString("ja-JP")} caption="每条短链携带活动、推广者、素材、渠道和签名" />
        <MetricCard label="推广码" value={state.promotionCodes.length.toLocaleString("ja-JP")} caption="注册、线下归因、客服补录" />
        <MetricCard label="QR 码" value={state.qrCodes.length.toLocaleString("ja-JP")} caption="支持下载 PNG / SVG / 打印场景" />
        <MetricCard label="短链点击" value={state.promotionLinks.reduce((sum, link) => sum + link.clicks, 0).toLocaleString("ja-JP")} caption="继续追踪暂停活动的点击" />
        <MetricCard label="扫码" value={state.qrCodes.reduce((sum, qr) => sum + qr.scans, 0).toLocaleString("ja-JP")} caption="线下与海报扫码" />
        <MetricCard label="风险载体" value={state.promotionLinks.filter((link) => link.status === "risk_frozen").length.toLocaleString("ja-JP")} caption="链接 / 码 / QR 风控冻结" tone="red" />
      </section>

      <DataTable
        columns={[
          {
            key: "name",
            title: "推广链接",
            render: (row) => (
              <div>
                <strong>{row.name}</strong>
                <span className="mt-1 block text-xs text-ink/45" data-no-i18n>{row.shortUrl}</span>
              </div>
            ),
            width: "260px"
          },
          { key: "status", title: "状态", render: (row) => <Badge tone={carrierStatusTone[row.status]}>{carrierStatusLabels[row.status]}</Badge> },
          { key: "campaign", title: "活动", render: (row) => getCampaignById(row.campaignId)?.name ?? row.campaignId, width: "240px" },
          { key: "promoter", title: "推广者", render: (row) => findPromoter(row.promoterId)?.name ?? row.promoterId, width: "190px" },
          { key: "material", title: "素材 / 渠道", render: (row) => `${getMaterialById(row.materialId)?.title ?? row.materialId} / ${getChannelById(row.channelId)?.name ?? row.channelId}`, width: "260px" },
          { key: "landing", title: "落地页", render: (row) => row.landingType, width: "140px" },
          {
            key: "logic",
            title: "校验",
            render: (row) => {
              const issues = validatePromotionLink(row, state);

              return issues.length ? <Badge tone="red">{issues.length} 项</Badge> : <Badge tone="green">通过</Badge>;
            }
          },
          { key: "commissionEnabled", title: "新增返佣", render: (row) => <Badge tone={row.allowCommission ? "green" : "neutral"}>{row.allowCommission ? "允许" : "停止"}</Badge> },
          { key: "clicks", title: "点击", render: (row) => row.clicks.toLocaleString("ja-JP"), sortValue: (row) => row.clicks },
          { key: "registrations", title: "注册", render: (row) => row.registrations.toLocaleString("ja-JP"), sortValue: (row) => row.registrations },
          { key: "orders", title: "订单 / GMV", render: (row) => `${row.orders} / ${yen(row.gmv)}`, sortValue: (row) => row.gmv, width: "160px" },
          { key: "commission", title: "返佣", render: (row) => yen(row.commission), sortValue: (row) => row.commission },
          { key: "risk", title: "风险", render: (row) => row.riskEvents, sortValue: (row) => row.riskEvents },
          { key: "valid", title: "有效期", render: (row) => row.validTo, width: "170px" },
          {
            key: "actions",
            title: "操作",
            render: (row) => (
              <div className="flex flex-wrap gap-1.5">
                {getAvailableCarrierActions(row.status).length ? (
                  getAvailableCarrierActions(row.status).map((action) => (
                    <ActionChip key={action} onClick={() => onCarrierAction(row.id, action)} tone={action === "freeze" || action === "discard" ? "danger" : "default"}>
                      {carrierActionLabels[action]}
                    </ActionChip>
                  ))
                ) : (
                  <Badge>只读</Badge>
                )}
              </div>
            ),
            width: "220px"
          }
        ]}
        rows={state.promotionLinks}
        pageSize={8}
      />

      <section className="grid gap-5 xl:grid-cols-2">
        <DataTable
          columns={[
            { key: "code", title: "推广码", render: (row) => <strong>{row.code}</strong> },
            { key: "status", title: "状态", render: (row) => <Badge tone={carrierStatusTone[row.status]}>{carrierStatusLabels[row.status]}</Badge> },
            { key: "promoter", title: "推广者", render: (row) => findPromoter(row.promoterId)?.name ?? row.promoterId, width: "170px" },
            { key: "purpose", title: "用途", render: (row) => row.purpose },
            { key: "used", title: "使用 / 注册", render: (row) => `${row.usedCount} / ${row.registrations}`, sortValue: (row) => row.usedCount },
            { key: "orders", title: "订单 / 佣金", render: (row) => `${row.orders} / ${yen(row.commission)}`, width: "150px" },
            { key: "risk", title: "风险", render: (row) => row.riskEvents }
          ]}
          rows={state.promotionCodes}
          pageSize={5}
        />

        <DataTable
          columns={[
            { key: "id", title: "QR", render: (row) => <strong>{row.id}</strong>, width: "170px" },
            { key: "status", title: "状态", render: (row) => <Badge tone={carrierStatusTone[row.status]}>{carrierStatusLabels[row.status]}</Badge> },
            { key: "style", title: "样式", render: (row) => row.styleType },
            { key: "promoter", title: "推广者", render: (row) => findPromoter(row.promoterId)?.name ?? row.promoterId, width: "170px" },
            { key: "scans", title: "扫码 / 注册", render: (row) => `${row.scans} / ${row.registrations}`, sortValue: (row) => row.scans },
            { key: "orders", title: "订单 / GMV", render: (row) => `${row.orders} / ${yen(row.gmv)}`, width: "150px" },
            { key: "abnormal", title: "异常扫码", render: (row) => row.abnormalScans, sortValue: (row) => row.abnormalScans }
          ]}
          rows={state.qrCodes}
          pageSize={5}
        />
      </section>
    </div>
  );
}

type CreativeBuilderItem = {
  key: string;
  title: string;
  category: "landings" | "widgets" | "parts";
  description: string;
  meta: string[];
  preview: "akira" | "experience" | "universal" | "mobile-slider" | "video-slider" | "parts";
};

const creativeBuilderSections: Array<{ key: CreativeBuilderItem["category"]; title: string; items: CreativeBuilderItem[] }> = [
  {
    key: "landings",
    title: "LANDINGS",
    items: [
      {
        key: "akira",
        title: "Akira",
        category: "landings",
        description: "1+4 格式的落地页模板。可以为每个占位位选择实际直播流或服务者内容，也可以把用户直接送到对应达人 / 服务者房间。",
        meta: ["LP 1+4", "可替换占位内容", "支持直达房间"],
        preview: "akira"
      },
      {
        key: "experience",
        title: "Experience",
        category: "landings",
        description: "预录视频型落地页，只有一个主占位位。适合选择 SFW 内容并自定义落地页颜色，作为轻量活动入口。",
        meta: ["单主视觉", "SFW 内容", "可配置主题色"],
        preview: "experience"
      }
    ]
  },
  {
    key: "widgets",
    title: "WIDGETS",
    items: [
      {
        key: "universal",
        title: "Universal",
        category: "widgets",
        description: "通用推广组件，可用于不同发布渠道的占位位。支持自适应，也可以严格设置缩略图网格和每个缩略图尺寸。",
        meta: ["自适应网格", "缩略图尺寸", "多渠道占位"],
        preview: "universal"
      },
      {
        key: "mobile-slider",
        title: "Mobile slider",
        category: "widgets",
        description: "面向移动流量的滑动组件，逻辑接近 Universal，但保留移动端专用的滑动、尺寸和触控配置。",
        meta: ["移动端优先", "滑动交互", "触控配置"],
        preview: "mobile-slider"
      },
      {
        key: "video-slider",
        title: "Video slider",
        category: "widgets",
        description: "可关闭的视频缩略组件，默认固定在 HTML 页面右下角。配置完成后复制 Widget JS 代码嵌入到目标 HTML 元素中。",
        meta: ["可关闭浮层", "右下角挂载", "复制 JS 代码"],
        preview: "video-slider"
      }
    ]
  },
  {
    key: "parts",
    title: "PARTS",
    items: [
      {
        key: "liteframe-player-chat",
        title: "LPLiteIframe・Player・Chat",
        category: "parts",
        description: "可独立调用的页面部件，用于模拟达人 / 服务者房间中的核心区域。允许在任意线上落地页嵌入 iframe、播放器或聊天启动入口。",
        meta: ["Iframe", "Player", "Chat launcher"],
        preview: "parts"
      }
    ]
  }
];

function CreativePreview({ variant }: { variant: CreativeBuilderItem["preview"] }) {
  const cellClassName = "rounded-md bg-gradient-to-br from-slate-600 via-slate-500 to-cyan-400";

  if (variant === "akira") {
    return (
      <div className="grid h-full min-h-[86px] grid-cols-[1.35fr_0.65fr] gap-1.5 rounded-lg bg-[#1b2434] p-2">
        <div className="rounded-md bg-gradient-to-br from-[#263449] via-[#526273] to-[#c64848]" />
        <div className="grid gap-1.5">
          <span className="rounded-md bg-[#ef4444]" />
          <span className="rounded-md bg-[#374151]" />
        </div>
        <div className="col-span-2 grid grid-cols-4 gap-1.5">
          {Array.from({ length: 4 }).map((_, index) => (
            <span className={cellClassName} key={index} />
          ))}
        </div>
      </div>
    );
  }

  if (variant === "experience") {
    return (
      <div className="relative h-full min-h-[86px] overflow-hidden rounded-lg bg-gradient-to-br from-sky-200 via-slate-500 to-rose-300 p-2">
        <span className="absolute left-3 top-3 h-2 w-14 rounded-full bg-red-500" />
        <span className="absolute bottom-3 left-3 h-5 w-14 rounded-full bg-[#111827]/78" />
        <span className="absolute bottom-3 right-3 h-5 w-10 rounded-full bg-lime-400" />
      </div>
    );
  }

  if (variant === "universal") {
    return (
      <div className="grid h-full min-h-[86px] grid-cols-3 gap-1.5 rounded-lg bg-white/70 p-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <span className={cn(cellClassName, index === 0 && "col-span-2 row-span-2")} key={index} />
        ))}
      </div>
    );
  }

  if (variant === "mobile-slider" || variant === "video-slider") {
    return (
      <div className="relative h-full min-h-[86px] overflow-hidden rounded-lg bg-gradient-to-br from-slate-700 via-slate-500 to-emerald-300 p-2">
        <span className="absolute left-3 top-3 h-2 w-10 rounded-full bg-emerald-400" />
        <span className="absolute bottom-3 left-3 h-2 w-16 rounded-full bg-white/70" />
        <span className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/38 text-white">
          {variant === "video-slider" ? "▶" : "‹ ›"}
        </span>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-[86px] grid-cols-[1.3fr_0.7fr] gap-2 rounded-lg bg-[#172033] p-2">
      <span className="rounded-md bg-gradient-to-br from-slate-500 to-cyan-300" />
      <div className="grid gap-1.5">
        <span className="rounded-md bg-white/70" />
        <span className="rounded-md bg-white/30" />
        <span className="rounded-md bg-emerald-400" />
      </div>
    </div>
  );
}

function AdCreativesBuilderModule() {
  return (
    <div className="space-y-6">
      {creativeBuilderSections.map((section) => (
        <section className="space-y-3" key={section.key}>
          <div className="flex items-center gap-3">
            <h2 className="shrink-0 text-[11px] font-black uppercase tracking-[0.16em] text-ink/45">{section.title}</h2>
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {section.items.map((item) => (
              <AdminCard className="min-h-[150px]" key={item.key}>
                <div className="grid gap-4 md:grid-cols-[170px_minmax(0,1fr)]">
                  <CreativePreview variant={item.preview} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <h3 className="text-xl font-black text-ink">{item.title}</h3>
                      <Badge tone={item.category === "landings" ? "blue" : item.category === "widgets" ? "green" : "yellow"}>{section.title}</Badge>
                    </div>
                    <p className="mt-2 text-sm font-semibold leading-6 text-ink/58">{item.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {item.meta.map((meta) => (
                        <span className="rounded-full border border-line bg-paper px-3 py-1 text-xs font-black text-ink/55" key={meta}>
                          {meta}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </AdminCard>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MaterialsChannelsModule() {
  return (
    <div className="space-y-5">
      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <DataTable
          columns={[
            { key: "title", title: "素材", render: (row) => <strong>{row.title}</strong>, width: "220px" },
            { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "approved" ? "green" : row.status === "reviewing" ? "yellow" : "red"}>{row.status}</Badge> },
            { key: "type", title: "类型", render: (row) => row.type, width: "170px" },
            { key: "campaign", title: "活动", render: (row) => getCampaignById(row.campaignId)?.name ?? row.campaignId, width: "240px" },
            { key: "channel", title: "渠道 / 语言", render: (row) => `${getChannelById(row.channelId)?.name ?? "未绑定"} / ${row.language ?? "multi"}`, width: "180px" },
            { key: "usage", title: "使用", render: (row) => row.usageCount?.toLocaleString("ja-JP") ?? "0", sortValue: (row) => row.usageCount ?? 0 },
            { key: "conversion", title: "注册 / 首单", render: (row) => `${row.registrations ?? 0} / ${row.firstOrders ?? 0}` },
            { key: "gmv", title: "GMV / ROI", render: (row) => `${yen(row.gmv ?? 0)} / ${(row.roi ?? 0).toFixed(1)}x`, sortValue: (row) => row.gmv ?? 0, width: "160px" },
            { key: "risk", title: "异常率", render: (row) => percent(row.anomalyRate ?? 0), sortValue: (row) => row.anomalyRate ?? 0 },
            { key: "pr", title: "PR", render: (row) => row.prRequired ? <Badge tone="yellow">必填</Badge> : <Badge tone="neutral">无需</Badge> }
          ]}
          rows={businessCpsMaterials}
          pageSize={8}
        />

        <AdminCard>
          <h2 className="text-lg font-black">渠道 ROI 排名</h2>
          <div className="mt-4 space-y-3">
            {[...businessCpsChannels].sort((a, b) => b.roi - a.roi).map((channel, index) => (
              <article className="rounded-lg bg-paper p-3" key={channel.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="text-sm">{index + 1}. {channel.name}</strong>
                    <p className="mt-1 text-xs text-ink/55">{channel.description}</p>
                  </div>
                  <Badge tone={channel.status === "active" ? "green" : "yellow"}>{channel.status}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <span>GMV <b>{yen(channel.gmv)}</b></span>
                  <span>ROI <b>{channel.roi.toFixed(1)}x</b></span>
                  <span>异常 <b>{percent(channel.anomalyRate)}</b></span>
                </div>
              </article>
            ))}
          </div>
        </AdminCard>
      </section>

      <DataTable
        columns={[
          { key: "name", title: "渠道", render: (row) => <strong>{row.name}</strong> },
          { key: "code", title: "编码", render: (row) => row.code },
          { key: "type", title: "类型", render: (row) => row.type },
          { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "active" ? "green" : "yellow"}>{row.status}</Badge> },
          { key: "clicks", title: "点击 / 扫码", render: (row) => `${row.clicks.toLocaleString("ja-JP")} / ${row.scans.toLocaleString("ja-JP")}`, sortValue: (row) => row.clicks },
          { key: "conversion", title: "注册 / 首单 / 订单", render: (row) => `${row.registrations} / ${row.firstOrders} / ${row.orders}`, width: "180px" },
          { key: "gmv", title: "GMV / 返佣", render: (row) => `${yen(row.gmv)} / ${yen(row.commission)}`, sortValue: (row) => row.gmv, width: "180px" },
          { key: "roi", title: "ROI", render: (row) => `${row.roi.toFixed(1)}x`, sortValue: (row) => row.roi },
          { key: "risk", title: "异常率", render: (row) => percent(row.anomalyRate), sortValue: (row) => row.anomalyRate }
        ]}
        rows={businessCpsChannels}
        pageSize={8}
      />
    </div>
  );
}

function MerchantCrmModule() {
  const grouped = Object.keys(merchantLeadStatusLabels).map((status) => ({
    status: status as MerchantLeadStatus,
    items: businessCpsMerchantLeads.filter((lead) => lead.status === status)
  }));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 lg:grid-cols-6">
        {grouped.map(({ status, items }) => (
          <AdminCard className="min-h-[180px]" key={status}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-black">{merchantLeadStatusLabels[status]}</h3>
              <Badge tone={leadStatusTone[status]}>{items.length}</Badge>
            </div>
            <div className="mt-3 space-y-2">
              {items.slice(0, 2).map((lead) => (
                <article className="rounded-lg bg-paper p-2" key={lead.id}>
                  <strong className="block text-xs">{lead.storeName}</strong>
                  <span className="mt-1 block text-[11px] text-ink/50">{lead.region} · {lead.owner}</span>
                </article>
              ))}
            </div>
          </AdminCard>
        ))}
      </div>

      <DataTable<BusinessCpsMerchantLead>
        columns={[
          { key: "store", title: "商户", render: (row) => <strong>{row.storeName}</strong>, sortValue: (row) => row.storeName, width: "210px" },
          { key: "status", title: "状态", render: (row) => <Badge tone={leadStatusTone[row.status]}>{merchantLeadStatusLabels[row.status]}</Badge>, filterValue: (row) => merchantLeadStatusLabels[row.status] },
          { key: "region", title: "地区 / 类目", render: (row) => `${row.region} / ${row.category}` },
          { key: "contact", title: "联系人", render: (row) => row.contact, width: "190px" },
          { key: "source", title: "来源", render: (row) => row.source },
          { key: "owner", title: "负责人", render: (row) => row.owner },
          { key: "ekyc", title: "eKYC", render: (row) => row.ekycStatus },
          { key: "commission", title: "预计佣金", render: (row) => yen(row.estimatedCommission), sortValue: (row) => row.estimatedCommission },
          { key: "next", title: "下次跟进", render: (row) => row.nextFollowUpAt, width: "180px" }
        ]}
        rows={businessCpsMerchantLeads}
        pageSize={8}
      />
    </div>
  );
}

function TrackingModule() {
  const { state } = useCpsRuntime();
  const findPromoter = (promoterId: string) => state.promoters.find((promoter) => promoter.id === promoterId);
  const funnelEvents = ["impression", "click", "scan", "landing_view", "register", "ekyc_complete", "first_order", "order_complete", "commission_created"] as const;

  return (
    <div className="space-y-5">
      <section className="grid gap-2 md:grid-cols-3 xl:grid-cols-9">
        {funnelEvents.map((eventType) => {
          const count = businessCpsTrackingEvents.filter((event) => event.eventType === eventType).length;

          return (
            <article className="rounded-lg border border-line bg-white p-3 shadow-panel" key={eventType}>
              <p className="text-[11px] font-black text-ink/45">{trackingEventLabels[eventType]}</p>
              <strong className="mt-1 block text-xl text-ink">{count}</strong>
            </article>
          );
        })}
      </section>

      <DataTable
        columns={[
          { key: "event", title: "事件", render: (row) => <Badge tone={row.riskScore >= 60 ? "red" : row.riskScore >= 30 ? "yellow" : "green"}>{trackingEventLabels[row.eventType]}</Badge>, filterValue: (row) => trackingEventLabels[row.eventType] },
          { key: "created", title: "发生时间", render: (row) => row.createdAt, width: "170px" },
          { key: "campaign", title: "活动", render: (row) => getCampaignById(row.campaignId)?.name ?? row.campaignId, width: "240px" },
          { key: "promoter", title: "推广者 / 上级", render: (row) => `${findPromoter(row.promoterId)?.name ?? row.promoterId}${row.parentPromoterId ? ` / ${findPromoter(row.parentPromoterId)?.name ?? row.parentPromoterId}` : ""}`, width: "240px" },
          { key: "carrier", title: "载体", render: (row) => [getPromotionLinkById(row.linkId)?.shortUrl, row.codeId, row.qrId].filter(Boolean).join(" / ") || "直接事件", width: "260px" },
          { key: "material", title: "素材 / 渠道", render: (row) => `${getMaterialById(row.materialId)?.title ?? "未绑定"} / ${getChannelById(row.channelId)?.name ?? "未绑定"}`, width: "260px" },
          { key: "subject", title: "对象", render: (row) => `${row.subjectType} / ${row.subjectId}`, width: "190px" },
          { key: "device", title: "设备 / IP", render: (row) => `${row.deviceId} / ${row.ip}`, width: "220px" },
          { key: "region", title: "地区", render: (row) => row.region },
          { key: "risk", title: "风险分", render: (row) => row.riskScore, sortValue: (row) => row.riskScore },
          { key: "landing", title: "落地页", render: (row) => row.landingUrl, width: "320px" }
        ]}
        rows={businessCpsTrackingEvents}
        pageSize={8}
      />
    </div>
  );
}

function AttributionModule() {
  const { state, onCommissionAction } = useCpsRuntime();
  const findPromoter = (promoterId: string) => state.promoters.find((promoter) => promoter.id === promoterId);

  return (
    <div className="space-y-5">
      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <AdminCard>
          <h2 className="text-lg font-black">归因载体优先级</h2>
          <div className="mt-4 space-y-2">
            {businessCpsAttributionConfigs.map((config) => (
              <div className="grid grid-cols-[52px_1fr_auto] items-center gap-3 rounded-lg bg-paper p-3" key={config.carrier}>
                <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-sm font-black text-moss">{config.priority}</span>
                <div>
                  <strong className="text-sm">{config.carrier}</strong>
                  <p className="mt-1 text-xs text-ink/55">{config.usage}</p>
                </div>
                <Badge tone={config.requiresAuditLog ? "yellow" : "green"}>{config.windowDays} 天</Badge>
              </div>
            ))}
          </div>
        </AdminCard>

        <AdminCard>
          <h2 className="text-lg font-black">佣金状态机</h2>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {Object.entries(commissionStatusLabels).map(([status, label]) => (
              <div className="rounded-lg bg-paper p-3" key={status}>
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-sm">{label}</strong>
                  <Badge tone={commissionStatusTone[status as CommissionStatus]}>
                    {state.commissionRecords.filter((record) => record.status === status).length}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-ink/55">{commissionStatusDescriptions[status as CommissionStatus]}</p>
              </div>
            ))}
          </div>
        </AdminCard>
      </section>

      <DataTable
        columns={[
          { key: "subject", title: "归因对象", render: (row) => <strong>{row.subject}</strong>, sortValue: (row) => row.subject, width: "180px" },
          { key: "campaign", title: "推广计划", render: (row) => getCampaignById(row.campaignId)?.name ?? row.campaignId, width: "260px" },
          { key: "path", title: "来源路径", render: (row) => row.sourcePath, width: "360px" },
          { key: "carrier", title: "载体", render: (row) => row.carrier },
          { key: "order", title: "订单", render: (row) => `${row.orderType} / ${row.orderId}`, width: "220px" },
          { key: "amount", title: "订单金额", render: (row) => yen(row.orderAmount), sortValue: (row) => row.orderAmount },
          { key: "promoter", title: "主推广者", render: (row) => findPromoter(row.primaryPromoterId)?.name ?? row.primaryPromoterId, width: "190px" },
          { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "risk_hold" ? "red" : row.status === "settled" ? "green" : "yellow"}>{row.status}</Badge> }
        ]}
        rows={businessCpsAttributionRecords}
        pageSize={8}
      />

      <DataTable<BusinessCpsCommissionRecord>
        columns={[
          { key: "id", title: "佣金记录", render: (row) => <strong>{row.id}</strong>, width: "150px" },
          { key: "campaign", title: "计划", render: (row) => getCampaignById(row.campaignId)?.name ?? row.campaignId, width: "260px" },
          { key: "promoter", title: "推广者", render: (row) => findPromoter(row.promoterId)?.name ?? row.promoterId, width: "190px" },
          { key: "model", title: "模型", render: (row) => row.model },
          { key: "base", title: "计佣基数", render: (row) => yen(row.baseAmount), sortValue: (row) => row.baseAmount },
          { key: "commission", title: "佣金", render: (row) => yen(row.commissionAmount), sortValue: (row) => row.commissionAmount },
          { key: "ndp", title: "NDP券", render: (row) => row.ndpCouponAmount ? yen(row.ndpCouponAmount) : "无" },
          { key: "status", title: "状态", render: (row) => <Badge tone={commissionStatusTone[row.status]}>{commissionStatusLabels[row.status]}</Badge>, filterValue: (row) => commissionStatusLabels[row.status] },
          { key: "date", title: "预计结算日", render: (row) => row.expectedSettlementDate },
          {
            key: "actions",
            title: "操作",
            render: (row) => (
              <div className="flex flex-wrap gap-1.5">
                {getAvailableCommissionActions(row.status).length ? (
                  getAvailableCommissionActions(row.status).map((action) => (
                    <ActionChip key={action} onClick={() => onCommissionAction(row.id, action)} tone={action === "freeze" || action === "cancel" || action === "clawback" ? "danger" : "default"}>
                      {commissionActionLabels[action]}
                    </ActionChip>
                  ))
                ) : (
                  <Badge>只读</Badge>
                )}
              </div>
            ),
            width: "260px"
          }
        ]}
        rows={state.commissionRecords}
        pageSize={8}
      />
    </div>
  );
}

function SettlementModule() {
  const { dashboard, state, onSettlementAction } = useCpsRuntime();
  const findPromoter = (promoterId: string) => state.promoters.find((promoter) => promoter.id === promoterId);
  const settlementFlow = [
    ["预估中", "事件发生后生成返佣快照"],
    ["待确认", "订单完成但仍处于退款 / 风控观察期"],
    ["冻结中", "命中风险、退款、异常或人工冻结"],
    ["可结算", "通过风控期和结算延迟期"],
    ["已申请提现", "推广者发起提现或转入 NDP"],
    ["已支付", "财务确认支付完成"],
    ["已冲正", "已支付后发生退款或异常，生成负向记录"]
  ];

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="预估返佣" value={yen(dashboard.estimatedCommission)} caption="事件发生后未确认" />
        <MetricCard label="待确认 / 锁定" value={yen(dashboard.pendingCommission)} caption="退款期与风控期内" />
        <MetricCard label="冻结中" value={yen(dashboard.riskFrozenAmount)} caption="风险事件涉及金额" tone="red" />
        <MetricCard label="可结算" value={yen(dashboard.withdrawableCommission)} caption="可进入财务批次" tone="green" />
        <MetricCard label="已支付" value={yen(dashboard.settledCommission)} caption="已完成付款确认" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <AdminCard>
          <h2 className="text-lg font-black">结算状态流转</h2>
          <div className="mt-4 space-y-2">
            {settlementFlow.map(([label, detail], index) => (
              <div className="grid grid-cols-[34px_1fr] gap-3 rounded-lg bg-paper p-3" key={label}>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-xs font-black text-moss">{index + 1}</span>
                <div>
                  <strong className="text-sm">{label}</strong>
                  <p className="mt-1 text-xs text-ink/55">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </AdminCard>

        <DataTable
          columns={[
            { key: "id", title: "结算批次", render: (row) => <strong>{row.id}</strong>, width: "180px" },
            { key: "cycle", title: "周期", render: (row) => row.cycle, width: "190px" },
            { key: "promoter", title: "推广者", render: (row) => findPromoter(row.promoterId)?.name ?? row.promoterId, width: "180px" },
            { key: "campaign", title: "活动", render: (row) => getCampaignById(row.campaignId)?.name ?? row.campaignId, width: "240px" },
            { key: "gross", title: "总额", render: (row) => yen(row.grossAmount), sortValue: (row) => row.grossAmount },
            { key: "frozen", title: "冻结", render: (row) => yen(row.frozenAmount), sortValue: (row) => row.frozenAmount },
            { key: "adjust", title: "调整", render: (row) => yen(row.adjustmentAmount), sortValue: (row) => row.adjustmentAmount },
            { key: "payable", title: "可支付", render: (row) => yen(row.payableAmount), sortValue: (row) => row.payableAmount },
            { key: "status", title: "状态", render: (row) => <Badge tone={settlementStatusTone[row.status]}>{settlementBatchStatusLabels[row.status]}</Badge>, filterValue: (row) => settlementBatchStatusLabels[row.status] },
            { key: "reviewer", title: "复核人", render: (row) => row.reviewer },
            { key: "method", title: "支付方式", render: (row) => row.payoutMethod },
            {
              key: "actions",
              title: "操作",
              render: (row) => (
                <div className="flex flex-wrap gap-1.5">
                  {getAvailableSettlementActions(row.status).length ? (
                    getAvailableSettlementActions(row.status).map((action) => (
                      <ActionChip key={action} onClick={() => onSettlementAction(row.id, action)} tone={action === "reject" ? "danger" : "default"}>
                        {settlementActionLabels[action]}
                      </ActionChip>
                    ))
                  ) : (
                    <Badge>只读</Badge>
                  )}
                </div>
              ),
              width: "220px"
            }
          ]}
          rows={state.settlementBatches}
          pageSize={8}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <DataTable
          columns={[
            { key: "id", title: "调整记录", render: (row) => <strong>{row.id}</strong> },
            { key: "commission", title: "佣金", render: (row) => row.commissionId },
            { key: "promoter", title: "推广者", render: (row) => findPromoter(row.promoterId)?.name ?? row.promoterId, width: "180px" },
            { key: "type", title: "类型", render: (row) => row.type, width: "150px" },
            { key: "amount", title: "金额", render: (row) => yen(row.amount), sortValue: (row) => row.amount },
            { key: "reason", title: "原因", render: (row) => row.reason, width: "320px" },
            { key: "operator", title: "操作人", render: (row) => row.operator },
            { key: "created", title: "时间", render: (row) => row.createdAt, width: "160px" }
          ]}
          rows={businessCpsAdjustments}
          pageSize={5}
        />

        <AdminCard>
          <h2 className="text-lg font-black">导出与对账要求</h2>
          <div className="mt-4 grid gap-2">
            {["按活动导出 CSV / Excel", "按推广者和组织汇总结算", "冻结、取消、冲正必须保留原因", "已支付后退款生成负向冲正", "所有财务动作写入审计日志"].map((item) => (
              <div className="flex items-start gap-3 rounded-lg bg-paper p-3" key={item}>
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-moss text-[10px] font-black text-white">✓</span>
                <p className="text-sm font-semibold text-ink/75">{item}</p>
              </div>
            ))}
          </div>
        </AdminCard>
      </section>
    </div>
  );
}

function WalletModule() {
  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {businessCpsWalletLedgers.map((wallet) => (
          <MetricCard
            caption={`${wallet.purpose}，冻结 ${yen(wallet.frozen)}`}
            key={wallet.id}
            label={wallet.wallet}
            value={yen(wallet.balance)}
          />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <AdminCard>
          <h2 className="text-lg font-black">钱包分账</h2>
          <div className="mt-4 space-y-3">
            {businessCpsWalletLedgers.map((wallet) => (
              <div className="rounded-lg bg-paper p-3" key={wallet.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="text-sm">{wallet.wallet}</strong>
                    <p className="mt-1 text-xs text-ink/55">{wallet.purpose}</p>
                  </div>
                  <Badge tone="green">{yen(wallet.balance)}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <span>流入 <b>{yen(wallet.inflow)}</b></span>
                  <span>流出 <b>{yen(wallet.outflow)}</b></span>
                  <span>冻结 <b>{yen(wallet.frozen)}</b></span>
                </div>
              </div>
            ))}
          </div>
        </AdminCard>

        <AdminCard>
          <h2 className="text-lg font-black">第一版验收闭环</h2>
          <div className="mt-4 grid gap-2">
            {phaseOneAcceptanceItems.map((item) => (
              <div className="flex items-start gap-3 rounded-lg bg-paper p-3" key={item}>
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-moss text-[10px] font-black text-white">✓</span>
                <p className="text-sm font-semibold text-ink/75">{item}</p>
              </div>
            ))}
          </div>
        </AdminCard>
      </section>
    </div>
  );
}

function RiskModule() {
  const { dashboard, state, onRiskAction } = useCpsRuntime();

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="启用风控规则" value={businessCpsRiskRules.filter((rule) => rule.enabled).length.toLocaleString("ja-JP")} caption="阈值和动作由后台配置，不写死在单一活动" />
        <MetricCard label="人工审核队列" value={state.riskEvents.filter((event) => event.status === "new" || event.status === "reviewing").length.toLocaleString("ja-JP")} caption="通过 / 冻结 / 取消 / 驳回" tone="red" />
        <MetricCard label="冻结返佣" value={yen(dashboard.riskFrozenAmount)} caption="订单、推广者、链接、QR 汇总" tone="red" />
        <MetricCard label="严重风险规则" value={businessCpsRiskRules.filter((rule) => rule.score >= 40).length.toLocaleString("ja-JP")} caption="超过阈值自动冻结或限制提现" />
      </section>

      <DataTable
        columns={[
          { key: "name", title: "风控规则", render: (row) => <strong>{row.name}</strong>, width: "260px" },
          { key: "code", title: "编码", render: (row) => row.code, width: "220px" },
          { key: "target", title: "对象", render: (row) => row.targetType },
          { key: "condition", title: "条件", render: (row) => row.condition, width: "300px" },
          { key: "score", title: "加分", render: (row) => `+${row.score}`, sortValue: (row) => row.score },
          { key: "action", title: "动作", render: (row) => row.action, width: "280px" },
          { key: "enabled", title: "启用", render: (row) => <Badge tone={row.enabled ? "green" : "neutral"}>{row.enabled ? "启用" : "停用"}</Badge> }
        ]}
        rows={businessCpsRiskRules}
        pageSize={8}
      />

      <DataTable
        columns={[
          { key: "type", title: "风险类型", render: (row) => <strong>{row.type}</strong>, width: "160px" },
          { key: "severity", title: "等级", render: (row) => <Badge tone={riskTone[row.severity]}>{row.severity}</Badge> },
          { key: "subject", title: "对象", render: (row) => row.subject, width: "220px" },
          { key: "example", title: "触发例子", render: (row) => row.example, width: "360px" },
          { key: "action", title: "系统动作", render: (row) => row.systemAction, width: "280px" },
          { key: "amount", title: "冻结金额", render: (row) => yen(row.amountFrozen), sortValue: (row) => row.amountFrozen },
          { key: "owner", title: "负责人", render: (row) => row.owner },
          { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "released" ? "green" : row.status === "rejected" ? "red" : "yellow"}>{row.status}</Badge> },
          {
            key: "ops",
            title: "人工动作",
            render: (row) => (
              <div className="flex flex-wrap gap-1.5">
                {getAvailableRiskActions(row.status).length ? (
                  getAvailableRiskActions(row.status).map((action) => (
                    <ActionChip key={action} onClick={() => onRiskAction(row.id, action)} tone={action === "freeze" || action === "reject" ? "danger" : "default"}>
                      {riskActionLabels[action]}
                    </ActionChip>
                  ))
                ) : (
                  <Badge>已处理</Badge>
                )}
              </div>
            ),
            width: "260px"
          }
        ]}
        rows={state.riskEvents}
        pageSize={8}
      />

      <AdminCard>
        <h2 className="text-lg font-black">审计日志</h2>
        <div className="mt-4 space-y-3">
          {state.auditLogs.map((log) => (
            <article className="rounded-lg bg-paper p-3" key={log.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <strong>{log.action} · {log.target}</strong>
                <span className="text-xs font-bold text-ink/45">{log.createdAt}</span>
              </div>
	              <p className="mt-1 text-sm text-ink/65">{log.reason}</p>
	              <div className="mt-2 grid gap-2 text-xs font-bold text-ink/45 md:grid-cols-3">
	                <span>{log.actor}</span>
	                <span>{log.targetType}</span>
	                <span>{log.ip}</span>
	              </div>
	              {log.beforeValue || log.afterValue ? (
	                <div className="mt-2 grid gap-2 text-xs text-ink/55 md:grid-cols-2">
	                  <p className="rounded-md bg-white p-2">Before: {log.beforeValue ?? "-"}</p>
	                  <p className="rounded-md bg-white p-2">After: {log.afterValue ?? "-"}</p>
	                </div>
	              ) : null}
	            </article>
	          ))}
	        </div>
      </AdminCard>
    </div>
  );
}

function PromotersModule({
  onCreateSubPromoter,
  onEditPromoter,
  routeBase,
  onOpenPromoter
}: {
  onCreateSubPromoter: (parentPromoterId?: string, level?: number) => void;
  onEditPromoter: (promoterId: string) => void;
  routeBase: string;
  onOpenPromoter: (promoter: BusinessCpsPromoter) => void;
}) {
  const { state } = useCpsRuntime();
  const defaultParentNode = state.promoterTeamNodes.find((node) => node.level === 1) ?? state.promoterTeamNodes[0];

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="认证推广者" value={state.promoters.length.toLocaleString("ja-JP")} caption="达人 / BD / 区域代理 / 商户老板" />
        <MetricCard label="本月推广者收益" value={yen(state.promoters.reduce((sum, item) => sum + item.monthIncome, 0))} caption="包含待确认与已锁定" />
        <MetricCard label="可提现" value={yen(state.promoters.reduce((sum, item) => sum + item.withdrawable, 0))} caption="现金或转入 NDP 钱包" />
        <MetricCard label="冻结中" value={yen(state.promoters.reduce((sum, item) => sum + item.frozen, 0))} caption="风控待复核" tone="red" />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white p-4 shadow-panel">
        <div>
          <h2 className="text-lg font-black">推广者资料与分成规则</h2>
          <p className="mt-1 text-sm text-ink/55">新增下级会同步写入推广者列表、组织层级、权限和审计日志。</p>
        </div>
        <Button onClick={() => onCreateSubPromoter(defaultParentNode?.promoterId, defaultParentNode ? defaultParentNode.level + 1 : 1)}>
          添加下级推广者
        </Button>
      </div>

      <DataTable<BusinessCpsPromoter>
        columns={[
          {
            key: "name",
            title: "推广者",
            render: (row) => (
              <a
                className="group block min-w-0 text-left"
                data-no-drag-scroll="true"
                href={`#${routeBase}?module=promoters&promoter=${encodeURIComponent(row.id)}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onOpenPromoter(row);
                }}
                title="点击查看详细信息"
              >
                <strong className="block text-ink group-hover:text-moss">{row.name}</strong>
                <span className="mt-1 block text-xs text-ink/45">{row.identity}</span>
              </a>
            ),
            filterValue: (row) => row.name,
            sortValue: (row) => row.name,
            width: "260px"
          },
          { key: "role", title: "身份", render: (row) => row.role },
          { key: "roleLabel", title: "Afirieito 身份", render: (row) => row.roleLabel, width: "190px" },
          { key: "region", title: "地区", render: (row) => row.region },
          { key: "invite", title: "邀请码", render: (row) => row.inviteCode },
          { key: "channel", title: "默认推广渠道", render: (row) => row.primaryChannel, filterValue: (row) => row.primaryChannel, width: "180px" },
          { key: "income", title: "本月收益", render: (row) => yen(row.monthIncome), sortValue: (row) => row.monthIncome },
          { key: "withdraw", title: "可提现", render: (row) => yen(row.withdrawable), sortValue: (row) => row.withdrawable },
          { key: "frozen", title: "冻结", render: (row) => yen(row.frozen), sortValue: (row) => row.frozen },
          { key: "risk", title: "风险分", render: (row) => row.riskScore, sortValue: (row) => row.riskScore },
          { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "active" ? "green" : row.status === "restricted" ? "red" : "yellow"}>{row.status}</Badge> },
          {
            key: "actions",
            title: "操作",
            render: (row) => (
              <div className="flex flex-wrap gap-2">
                <ActionChip onClick={() => onEditPromoter(row.id)}>编辑</ActionChip>
                <ActionChip onClick={() => {
                  const rowNode = state.promoterTeamNodes.find((node) => node.promoterId === row.id);
                  onCreateSubPromoter(row.id, rowNode ? rowNode.level + 1 : undefined);
                }}>添加下级</ActionChip>
              </div>
            ),
            width: "170px"
          }
        ]}
        rows={state.promoters}
        pageSize={8}
      />
    </div>
  );
}

function PromoterDrawer({
  promoter,
  onCreateSubPromoter,
  onEditPromoter,
  onClose
}: {
  promoter: BusinessCpsPromoter | null;
  onCreateSubPromoter: (parentPromoterId?: string, level?: number) => void;
  onEditPromoter: (promoterId: string) => void;
  onClose: () => void;
}) {
  const { state } = useCpsRuntime();
  const relatedRecords = promoter ? state.commissionRecords.filter((record) => record.promoterId === promoter.id) : [];
  const relatedLinks = promoter ? state.promotionLinks.filter((link) => link.promoterId === promoter.id) : [];
  const teamNode = promoter ? state.promoterTeamNodes.find((node) => node.promoterId === promoter.id) : null;
  const childNodes = promoter ? state.promoterTeamNodes.filter((node) => node.parentPromoterId === promoter.id) : [];
  const permission = promoter ? state.promoterPermissions.find((item) => item.promoterId === promoter.id) : null;

  return (
    <Drawer open={Boolean(promoter)} title={promoter ? `${promoter.name} 详情` : "推广者详情"} onClose={onClose}>
      {promoter ? (
        <div className="space-y-4">
          <AdminCard>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-ink/45">{promoter.role} · {promoter.region}</p>
                <h3 className="mt-1 text-xl font-black">{promoter.name}</h3>
                <p className="mt-2 text-sm text-ink/60">{promoter.identity}</p>
              </div>
              <Badge tone={promoter.status === "active" ? "green" : "yellow"}>{promoter.status}</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => onEditPromoter(promoter.id)} size="sm" variant="secondary">
                编辑资料
              </Button>
              <Button onClick={() => onCreateSubPromoter(promoter.id, teamNode ? teamNode.level + 1 : undefined)} size="sm">
                添加下级推广者
              </Button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              {[
                ["本月收益", yen(promoter.monthIncome)],
                ["可提现", yen(promoter.withdrawable)],
                ["冻结", yen(promoter.frozen)],
                ["风险分", promoter.riskScore.toString()]
              ].map(([label, value]) => (
                <div className="rounded-lg bg-paper p-3" key={label}>
                  <p className="text-[11px] font-bold text-ink/45">{label}</p>
                  <strong className="mt-1 block text-sm">{value}</strong>
                </div>
              ))}
            </div>
          </AdminCard>

	          <AdminCard>
	            <h3 className="font-black">今日转化</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              {[
                ["点击", promoter.clicksToday.toLocaleString("ja-JP")],
                ["注册", promoter.registrationsToday.toLocaleString("ja-JP")],
                ["首单", promoter.firstOrdersToday.toLocaleString("ja-JP")],
                ["佣金", yen(promoter.commissionToday)]
              ].map(([label, value]) => (
                <div className="rounded-lg bg-paper p-3" key={label}>
                  <p className="text-[11px] font-bold text-ink/45">{label}</p>
                  <strong className="mt-1 block text-sm">{value}</strong>
                </div>
              ))}
            </div>
	          </AdminCard>

	          <AdminCard>
	            <h3 className="font-black">组织与权限</h3>
	            <div className="mt-3 grid gap-2 sm:grid-cols-4">
	              {[
	                ["层级", teamNode ? `L${teamNode.level}` : "-"],
	                ["组织人数", teamNode ? teamNode.teamSize.toLocaleString("ja-JP") : "0"],
	                ["直属下级", childNodes.length.toLocaleString("ja-JP")],
	                ["预算模式", teamNode?.budgetMode === "inherit_parent" ? "占上级" : "独立"]
	              ].map(([label, value]) => (
	                <div className="rounded-lg bg-paper p-3" key={label}>
	                  <p className="text-[11px] font-bold text-ink/45">{label}</p>
	                  <strong className="mt-1 block text-sm">{value}</strong>
	                </div>
	              ))}
	            </div>
	            {permission ? (
	              <div className="mt-3 flex flex-wrap gap-2">
	                {([
	                  ["创建链接", permission.canCreateLink],
	                  ["创建推广码", permission.canCreateCode],
	                  ["创建 QR", permission.canCreateQr],
	                  ["添加下级", permission.canCreateSubPromoter],
	                  ["查看组织", permission.canViewSubData],
	                  ["查看返佣", permission.canViewCommission],
	                  ["提现", permission.canWithdraw],
	                  ["上传素材", permission.canUploadMaterial]
	                ] as Array<[string, boolean]>).map(([label, enabled]) => (
	                  <Badge key={label} tone={enabled ? "green" : "neutral"}>{label}</Badge>
	                ))}
	              </div>
	            ) : null}
	            {teamNode ? (() => {
                const snapshot = getBusinessCpsTierConditionSnapshot(teamNode, state.commissionConditionRules);
                const profile = snapshot.profile;

                return (
                  <div className="mt-4 rounded-lg border border-line bg-paper p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-sm">分成与条件</strong>
                      <Badge tone="blue">{snapshot.currentTier ? percent(snapshot.currentTier.commissionRate) : percent(teamNode.commissionRate)} · {commissionBasisLabels[profile.commissionBasis]}</Badge>
                    </div>
                    <div className="mt-3">
                      <ProgressBar label={`${snapshot.progress}%`} value={snapshot.progress} />
                      <p className="mt-1 text-xs font-bold text-ink/45">
                        {profile.source === "rule" ? `当前生效规则：${profile.name} · ` : ""}
                        当前 {snapshot.currentTier?.name ?? "阶梯"}，{snapshot.settledTier ? `按 ${snapshot.settledTier.name} 结算` : "未达成首个阶梯"}
                      </p>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-ink/60 sm:grid-cols-2">
                      <p><span className="font-bold text-ink/45">释放条件：</span>{profile.releaseCondition}</p>
                      <p><span className="font-bold text-ink/45">风控条件：</span>{profile.riskCondition}</p>
                      <p><span className="font-bold text-ink/45">结算延迟：</span>{profile.settlementDelayDays} 天</p>
                      <p><span className="font-bold text-ink/45">有效期：</span>{teamNode.validFrom} - {teamNode.validTo}</p>
                      <p><span className="font-bold text-ink/45">优待条件：</span>{profile.preferentialCondition.enabled ? `${profile.preferentialCondition.validFrom} - ${profile.preferentialCondition.validTo}，达到 ${percent(profile.preferentialCondition.baseCommissionRate)} 后 +${percent(profile.preferentialCondition.extraCommissionRate)}` : "未启用"}</p>
                      <p><span className="font-bold text-ink/45">降级条件：</span>{profile.downgradeCondition.enabled ? `未达成当前阶梯 ${profile.downgradeCondition.missedCycleCount} 个周期，降到阶梯 ${profile.downgradeCondition.fallbackTierLevel}` : "未启用"}</p>
                    </div>
                  </div>
                );
              })() : null}
	            {childNodes.length > 0 ? (
	              <div className="mt-4">
	                <p className="text-xs font-black uppercase tracking-[0.14em] text-ink/40">Direct Sub Promoters</p>
	                <div className="mt-2 space-y-2">
	                  {childNodes.map((node) => {
	                    const child = state.promoters.find((item) => item.id === node.promoterId);

	                    return (
	                      <div className="rounded-lg bg-paper p-3" key={node.id}>
	                        <div className="flex flex-wrap items-center justify-between gap-2">
	                          <strong>{child?.name ?? node.promoterId}</strong>
	                          <span className="text-xs font-bold text-ink/45">{percent(getBusinessCpsTierConditionSnapshot(node, state.commissionConditionRules).currentTier?.commissionRate ?? node.commissionRate)} · {commissionBasisLabels[getBusinessCpsTeamNodeCommissionProfile(node, state.commissionConditionRules).commissionBasis]}</span>
	                        </div>
	                        <p className="mt-1 text-xs text-ink/45">{getBusinessCpsTeamNodeCommissionProfile(node, state.commissionConditionRules).releaseCondition}</p>
	                      </div>
	                    );
	                  })}
	                </div>
	              </div>
	            ) : null}
	          </AdminCard>

	          <AdminCard>
	            <h3 className="font-black">推广载体</h3>
	            <div className="mt-3 space-y-2">
	              {relatedLinks.map((link) => (
	                <div className="rounded-lg bg-paper p-3" key={link.id}>
	                  <div className="flex items-center justify-between gap-3">
	                    <strong>{link.name}</strong>
	                    <Badge tone={carrierStatusTone[link.status]}>{carrierStatusLabels[link.status]}</Badge>
	                  </div>
	                  <p className="mt-1 text-sm text-ink/60" data-no-i18n>{link.shortUrl}</p>
	                  <p className="mt-1 text-xs text-ink/45">{getChannelById(link.channelId)?.name ?? link.channelId} · {yen(link.commission)} · 风险 {link.riskEvents}</p>
	                </div>
	              ))}
	            </div>
	          </AdminCard>

	          <AdminCard>
            <h3 className="font-black">佣金记录</h3>
            <div className="mt-3 space-y-2">
              {relatedRecords.map((record) => (
                <div className="rounded-lg bg-paper p-3" key={record.id}>
                  <div className="flex items-center justify-between gap-3">
                    <strong>{record.sourceOrder}</strong>
                    <Badge tone={commissionStatusTone[record.status]}>{commissionStatusLabels[record.status]}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink/60">{record.model} · {yen(record.commissionAmount)} · {record.expectedSettlementDate}</p>
                </div>
              ))}
            </div>
          </AdminCard>
        </div>
      ) : null}
    </Drawer>
  );
}

type PromoterFormValues = {
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
  commissionTiers: BusinessCpsCommissionTierRule[];
  preferentialCondition: BusinessCpsPreferentialCondition;
  downgradeCondition: BusinessCpsDowngradeCondition;
  promotionCondition: BusinessCpsLevelPromotionCondition;
  releaseCondition: string;
  riskCondition: string;
  settlementDelayDays: number;
  validFrom: string;
  validTo: string;
  permissions: BusinessCpsSubPromoterInput["permissions"];
};

const promoterRoleOptions: Array<{ value: BusinessCpsRole; label: string }> = [
  { value: "creator", label: "达人 / 内容推广者" },
  { value: "bd", label: "BD / 招商推广者" },
  { value: "agent", label: "区域代理" },
  { value: "merchant", label: "商户自营" },
  { value: "platform", label: "平台运营" }
];

const promoterStatusOptions: Array<{ value: BusinessCpsPromoter["status"]; label: string }> = [
  { value: "active", label: "启用" },
  { value: "reviewing", label: "审核中" },
  { value: "restricted", label: "限制中" }
];

const promoterPermissionLabels: Array<[keyof BusinessCpsSubPromoterInput["permissions"], string]> = [
  ["canCreateLink", "创建链接"],
  ["canCreateCode", "创建推广码"],
  ["canCreateQr", "创建 QR"],
  ["canCreateSubPromoter", "添加下级"],
  ["canViewSubData", "查看组织数据"],
  ["canViewCommission", "查看返佣"],
  ["canWithdraw", "提现"],
  ["canUploadMaterial", "上传素材"]
];

const promoterFieldClassName = "mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-moss";
const promoterTextareaClassName = "mt-1 min-h-[76px] w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-moss";

function todayInputValue() {
  const date = new Date();
  const pad = (value: number) => value.toString().padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function cloneCommissionTiers(tiers: BusinessCpsCommissionTierRule[]) {
  return tiers.map((tier) => ({ ...tier, requirements: { ...tier.requirements } })).sort((a, b) => a.level - b.level);
}

function tierHasCalculationData(tier: BusinessCpsCommissionTierRule | undefined) {
  return Boolean(
    tier &&
      tier.commissionRate > 0 &&
      tier.requirements.registrations > 0 &&
      tier.requirements.activeShops > 0 &&
      tier.requirements.activeShopWeeklyOrders > 0 &&
      tier.requirements.firstOrders > 0 &&
      tier.requirements.paymentGmv > 0
  );
}

function createBlankCommissionTier(level: number, seed?: BusinessCpsCommissionTierRule): BusinessCpsCommissionTierRule {
  return {
    id: `draft-tier-${level}-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    name: `阶梯 ${level}`,
    level,
    commissionRate: seed ? Math.min(100, Math.round((seed.commissionRate + 1) * 10) / 10) : 0,
    requirements: {
      registrations: 0,
      activeShops: 0,
      activeShopWeeklyOrders: seed?.requirements.activeShopWeeklyOrders ?? 0,
      firstOrders: 0,
      paymentGmv: 0
    }
  };
}

function interpolateNumber(start: number, end: number, ratio: number, integer = true) {
  const value = start + (end - start) * ratio;

  return integer ? Math.max(0, Math.round(value)) : Math.max(0, Math.round(value * 10) / 10);
}

function calculateTierBetweenBounds(
  tier: BusinessCpsCommissionTierRule,
  lowerTier: BusinessCpsCommissionTierRule,
  upperTier: BusinessCpsCommissionTierRule
) {
  const ratio = (tier.level - lowerTier.level) / Math.max(1, upperTier.level - lowerTier.level);

  return {
    ...tier,
    name: tier.name || `阶梯 ${tier.level}`,
    commissionRate: interpolateNumber(lowerTier.commissionRate, upperTier.commissionRate, ratio, false),
    requirements: {
      registrations: interpolateNumber(lowerTier.requirements.registrations, upperTier.requirements.registrations, ratio),
      activeShops: interpolateNumber(lowerTier.requirements.activeShops, upperTier.requirements.activeShops, ratio),
      activeShopWeeklyOrders: interpolateNumber(lowerTier.requirements.activeShopWeeklyOrders, upperTier.requirements.activeShopWeeklyOrders, ratio),
      firstOrders: interpolateNumber(lowerTier.requirements.firstOrders, upperTier.requirements.firstOrders, ratio),
      paymentGmv: interpolateNumber(lowerTier.requirements.paymentGmv, upperTier.requirements.paymentGmv, ratio)
    }
  };
}

function findCalculationBounds(tiers: BusinessCpsCommissionTierRule[], tier: BusinessCpsCommissionTierRule) {
  const sortedTiers = cloneCommissionTiers(tiers);
  const lowerTier = [...sortedTiers].reverse().find((item) => item.level < tier.level && tierHasCalculationData(item));
  const upperTier = sortedTiers.find((item) => item.level > tier.level && tierHasCalculationData(item));

  return lowerTier && upperTier ? { lowerTier, upperTier } : null;
}

function defaultPreferentialCondition(rate: number): BusinessCpsPreferentialCondition {
  return {
    enabled: false,
    validFrom: todayInputValue(),
    validTo: "2026-12-31",
    baseCommissionRate: rate,
    extraCommissionRate: 0,
    note: "指定时间内达到起始分成后，在已完成阶梯比例上增加优待比例。"
  };
}

function defaultDowngradeCondition(): BusinessCpsDowngradeCondition {
  return {
    enabled: true,
    missedCycleCount: 1,
    fallbackTierLevel: 1,
    note: "没有达成当前阶梯条件时，降到下一可结算阶梯。"
  };
}

function defaultPromotionCondition(): BusinessCpsLevelPromotionCondition {
  return {
    enabled: false,
    consecutiveCycles: 3,
    requiredTierLevel: 3,
    targetLevel: 1,
    note: "连续几个周期达到指定阶梯后，可升级为 1 级。"
  };
}

function buildPromoterFormValues(state: BusinessCpsRuntimeState, mode: PromoterEditorMode): PromoterFormValues {
  const requestedParent = mode.type === "create" ? mode.parentPromoterId : undefined;
  const requestedParentNode = requestedParent ? state.promoterTeamNodes.find((node) => node.promoterId === requestedParent) : undefined;
  const requestedLevel = mode.type === "create"
    ? Math.max(1, Math.floor(Number(mode.level ?? (requestedParentNode ? requestedParentNode.level + 1 : 1))))
    : 1;
  const firstParentForLevel = requestedLevel > 1 ? state.promoterTeamNodes.find((node) => node.level === requestedLevel - 1)?.promoterId : "";
  const parentPromoterId = requestedLevel <= 1
    ? ""
    : requestedParentNode?.level === requestedLevel - 1
      ? requestedParentNode.promoterId
      : firstParentForLevel ?? "";
  const parent = state.promoters.find((promoter) => promoter.id === parentPromoterId);
  const parentNode = state.promoterTeamNodes.find((node) => node.promoterId === parentPromoterId);
  const defaultCampaignId = parentNode?.campaignId ?? state.campaigns[0]?.id ?? "";
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
      campaignId: node?.campaignId ?? defaultCampaignId,
      budgetMode: node?.budgetMode ?? "inherit_parent",
      budgetTotal: node?.budgetTotal ?? 0,
      targetRegisters: node?.targetRegisters ?? 0,
      targetActiveShops: node?.targetActiveShops ?? 0,
      targetFirstOrders: node?.targetFirstOrders ?? 0,
      targetPaymentGmv: node?.targetPaymentGmv ?? 0,
      commissionConditionRuleId: node?.level === 1 ? (profile?.source === "rule" ? profile.rule.id : state.commissionConditionRules.find((rule) => rule.appliesToLevel === 1 && rule.status === "active")?.id ?? null) : node?.commissionConditionRuleId ?? null,
      commissionRate: defaultRate,
      commissionBasis: profile?.commissionBasis ?? node?.commissionBasis ?? "net_revenue",
      commissionTiers: cloneCommissionTiers(profile?.commissionTiers ?? node?.commissionTiers ?? []),
      preferentialCondition: profile?.preferentialCondition ?? node?.preferentialCondition ?? defaultPreferentialCondition(defaultRate),
      downgradeCondition: profile?.downgradeCondition ?? node?.downgradeCondition ?? defaultDowngradeCondition(),
      promotionCondition: profile?.promotionCondition ?? node?.promotionCondition ?? defaultPromotionCondition(),
      releaseCondition: profile?.releaseCondition ?? node?.releaseCondition ?? "归因订单完成支付且未退款后释放",
      riskCondition: profile?.riskCondition ?? node?.riskCondition ?? "同设备、同电话、异常 LBS 或重复支付命中后冻结",
      settlementDelayDays: profile?.settlementDelayDays ?? node?.settlementDelayDays ?? 7,
      validFrom: node?.validFrom ?? todayInputValue(),
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
    campaignId: defaultCampaignId,
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
        id: `draft-tier-1-${Date.now()}`,
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
    preferentialCondition: defaultPreferentialCondition(8),
    downgradeCondition: defaultDowngradeCondition(),
    promotionCondition: defaultPromotionCondition(),
    releaseCondition: "归因用户完成支付且 7 天内无退款后释放",
    riskCondition: "同设备、同电话、异常 LBS 或重复支付命中后冻结",
    settlementDelayDays: 7,
    validFrom: todayInputValue(),
    validTo: "2026-12-31",
    permissions: defaultPermissions
  };
}

function PromoterFormDrawer({
  mode,
  onClose
}: {
  mode: PromoterEditorMode | null;
  onClose: () => void;
}) {
  const { state, onCreateSubPromoter, onUpdatePromoter } = useCpsRuntime();
  const [values, setValues] = useState<PromoterFormValues | null>(null);
  const organizationLevelOptions = getOrganizationLevelOptions(state.promoterTeamNodes);
  const parentOptions = (values && values.level > 1 ? state.promoterTeamNodes.filter((node) => node.level === values.level - 1) : [])
    .map((node) => state.promoters.find((promoter) => promoter.id === node.promoterId))
    .filter((promoter): promoter is BusinessCpsPromoter => Boolean(promoter));

  useEffect(() => {
    if (!mode) {
      setValues(null);
      return;
    }

    setValues(buildPromoterFormValues(state, mode));
  }, [mode, state]);

  const updateValue = <Key extends keyof PromoterFormValues>(key: Key, value: PromoterFormValues[Key]) => {
    setValues((current) => current ? { ...current, [key]: value } : current);
  };

  const updateLevel = (level: number) => {
    const normalizedLevel = Math.max(1, Math.floor(level));
    const parentNode = normalizedLevel > 1 ? state.promoterTeamNodes.find((node) => node.level === normalizedLevel - 1) : undefined;

    setValues((current) => current
      ? {
          ...current,
          level: normalizedLevel,
          parentPromoterId: parentNode?.promoterId ?? "",
          commissionConditionRuleId: normalizedLevel === 1 ? state.commissionConditionRules.find((rule) => rule.appliesToLevel === 1 && rule.status === "active")?.id ?? null : current.commissionConditionRuleId
        }
      : current);
  };

  const updatePermission = (key: keyof BusinessCpsSubPromoterInput["permissions"], checked: boolean) => {
    setValues((current) => current ? { ...current, permissions: { ...current.permissions, [key]: checked } } : current);
  };

  const updateTier = <Key extends keyof BusinessCpsCommissionTierRule>(tierIndex: number, key: Key, value: BusinessCpsCommissionTierRule[Key]) => {
    setValues((current) => current ? {
      ...current,
      commissionTiers: current.commissionTiers.map((tier, index) => index === tierIndex ? { ...tier, [key]: value } : tier)
    } : current);
  };

  const updateTierRequirement = (
    tierIndex: number,
    key: keyof BusinessCpsCommissionTierRule["requirements"],
    value: number
  ) => {
    setValues((current) => current ? {
      ...current,
      commissionTiers: current.commissionTiers.map((tier, index) =>
        index === tierIndex ? { ...tier, requirements: { ...tier.requirements, [key]: value } } : tier
      )
    } : current);
  };

  const addCommissionTier = () => {
    setValues((current) => {
      if (!current || current.commissionTiers.length >= businessCpsMaxCommissionTierCount) {
        return current;
      }

      const lastTier = current.commissionTiers[current.commissionTiers.length - 1];
      const nextLevel = current.commissionTiers.length + 1;

      return {
        ...current,
        commissionTiers: [
          ...current.commissionTiers,
          {
            id: `draft-tier-${nextLevel}-${Date.now()}`,
            name: `阶梯 ${nextLevel}`,
            level: nextLevel,
            commissionRate: Math.min(100, (lastTier?.commissionRate ?? current.commissionRate) + 1),
            requirements: {
              registrations: Math.ceil((lastTier?.requirements.registrations ?? current.targetRegisters) * 1.25),
              activeShops: Math.ceil((lastTier?.requirements.activeShops ?? current.targetActiveShops) * 1.25),
              activeShopWeeklyOrders: lastTier?.requirements.activeShopWeeklyOrders ?? 5,
              firstOrders: Math.ceil((lastTier?.requirements.firstOrders ?? current.targetFirstOrders) * 1.25),
              paymentGmv: Math.ceil((lastTier?.requirements.paymentGmv ?? current.targetPaymentGmv) * 1.25)
            }
          }
        ]
      };
    });
  };

  const removeCommissionTier = (tierIndex: number) => {
    setValues((current) => {
      if (!current || current.commissionTiers.length <= 1) {
        return current;
      }

      return {
        ...current,
        commissionTiers: current.commissionTiers.filter((_, index) => index !== tierIndex).map((tier, index) => ({ ...tier, level: index + 1, name: tier.name || `阶梯 ${index + 1}` }))
      };
    });
  };

  const submitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!mode || !values) {
      return;
    }

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
      commissionRate: Number(values.commissionRate) || 0,
      commissionBasis: values.commissionBasis,
      commissionTiers: cloneCommissionTiers(values.commissionTiers),
      preferentialCondition: { ...values.preferentialCondition },
      downgradeCondition: { ...values.downgradeCondition },
      promotionCondition: { ...values.promotionCondition },
      releaseCondition: values.releaseCondition,
      riskCondition: values.riskCondition,
      settlementDelayDays: Number(values.settlementDelayDays) || 0,
      validFrom: values.validFrom,
      validTo: values.validTo,
      permissions: values.permissions
    };

    if (mode.type === "create") {
      onCreateSubPromoter({
        ...baseInput,
        parentPromoterId: values.level > 1 ? values.parentPromoterId : null,
        level: values.level,
        allowAdminLevelOverride: true
      });
      return;
    }

    onUpdatePromoter({
      ...baseInput,
      promoterId: mode.promoterId
    });
  };

  return (
    <Drawer open={Boolean(mode)} title={mode?.type === "edit" ? "编辑推广者与分成条件" : "添加下级推广者"} onClose={onClose} defaultWidth={860} maxWidth={1040}>
      {values ? (
        <form className="space-y-5" onSubmit={submitForm}>
          <AdminCard>
            <h3 className="font-black">推广者资料</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-bold text-ink/70">
                推广者名称
                <input className={promoterFieldClassName} onChange={(event) => updateValue("name", event.target.value)} value={values.name} />
              </label>
              <label className="text-sm font-bold text-ink/70">
                邀请码
                <input className={promoterFieldClassName} onChange={(event) => updateValue("inviteCode", event.target.value)} value={values.inviteCode} />
              </label>
              <label className="text-sm font-bold text-ink/70">
                身份类型
                <select className={promoterFieldClassName} onChange={(event) => updateValue("role", event.target.value as BusinessCpsRole)} value={values.role}>
                  {promoterRoleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold text-ink/70">
                Afirieito 身份标签
                <input className={promoterFieldClassName} onChange={(event) => updateValue("roleLabel", event.target.value)} value={values.roleLabel} />
              </label>
              <label className="text-sm font-bold text-ink/70">
                地区
                <input className={promoterFieldClassName} onChange={(event) => updateValue("region", event.target.value)} value={values.region} />
              </label>
              <label className="text-sm font-bold text-ink/70">
                默认推广渠道
                <input className={promoterFieldClassName} onChange={(event) => updateValue("primaryChannel", event.target.value)} value={values.primaryChannel} />
              </label>
              <label className="text-sm font-bold text-ink/70">
                状态
                <select className={promoterFieldClassName} onChange={(event) => updateValue("status", event.target.value as BusinessCpsPromoter["status"])} value={values.status}>
                  {promoterStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold text-ink/70">
                组织层级
                <select className={promoterFieldClassName} disabled={mode?.type === "edit"} onChange={(event) => updateLevel(Number(event.target.value))} value={values.level}>
                  {organizationLevelOptions.map((level, index) => (
                    <option key={level} value={level}>
                      {level}级{index === organizationLevelOptions.length - 1 && !state.promoterTeamNodes.some((node) => node.level === level) ? "（新增层级）" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-bold text-ink/70">
                上级组织
                <select
                  className={promoterFieldClassName}
                  disabled={mode?.type === "edit" || values.level <= 1}
                  onChange={(event) => updateValue("parentPromoterId", event.target.value)}
                  value={values.parentPromoterId}
                >
                  {values.level <= 1 ? <option value="">{platformOrganizationLabel}</option> : null}
                  {values.level > 1 && parentOptions.length === 0 ? <option value="">请先添加上一层组织</option> : null}
                  {values.level > 1 ? parentOptions.map((promoter) => <option key={promoter.id} value={promoter.id}>{promoter.name}</option>) : null}
                </select>
              </label>
              <label className="text-sm font-bold text-ink/70 sm:col-span-2">
                身份说明
                <textarea className={promoterTextareaClassName} onChange={(event) => updateValue("identity", event.target.value)} value={values.identity} />
              </label>
            </div>
          </AdminCard>

          <AdminCard>
            <h3 className="font-black">分成百分比与条件</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-bold text-ink/70">
                绑定推广计划
                <select className={promoterFieldClassName} onChange={(event) => updateValue("campaignId", event.target.value)} value={values.campaignId}>
                  {state.campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold text-ink/70">
                预算模式
                <select className={promoterFieldClassName} onChange={(event) => updateValue("budgetMode", event.target.value as BusinessCpsBudgetMode)} value={values.budgetMode}>
                  <option value="inherit_parent">占用上级预算</option>
                  <option value="independent">独立预算</option>
                </select>
              </label>
              {values.level === 1 ? (
                <label className="text-sm font-bold text-ink/70 sm:col-span-2">
                  1级全局分成条件
                  <select
                    className={promoterFieldClassName}
                    onChange={(event) => updateValue("commissionConditionRuleId", event.target.value || null)}
                    value={values.commissionConditionRuleId ?? ""}
                  >
                    {state.commissionConditionRules.filter((rule) => rule.appliesToLevel === 1).map((rule) => (
                      <option key={rule.id} value={rule.id}>{rule.name}{rule.status === "active" ? "（当前生效）" : ""}</option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-ink/45">保存后会写入“规则 / 分成条件”；所有 1级账号同一时间只会使用一个生效阶梯条件。</span>
                </label>
              ) : null}
              <label className="text-sm font-bold text-ink/70">
                分成百分比
                <input className={promoterFieldClassName} min={0} max={100} onChange={(event) => updateValue("commissionRate", Number(event.target.value))} step="0.1" type="number" value={values.commissionRate} />
              </label>
              <label className="text-sm font-bold text-ink/70">
                分成计算基准
                <select className={promoterFieldClassName} onChange={(event) => updateValue("commissionBasis", event.target.value as BusinessCpsCommissionBasis)} value={values.commissionBasis}>
                  {Object.entries(commissionBasisLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold text-ink/70">
                组织预算
                <input className={promoterFieldClassName} min={0} onChange={(event) => updateValue("budgetTotal", Number(event.target.value))} step={1000} type="number" value={values.budgetTotal} />
              </label>
              <label className="text-sm font-bold text-ink/70">
                结算延迟天数
                <input className={promoterFieldClassName} min={0} max={365} onChange={(event) => updateValue("settlementDelayDays", Number(event.target.value))} type="number" value={values.settlementDelayDays} />
              </label>
              <label className="text-sm font-bold text-ink/70">
                目标注册
                <input className={promoterFieldClassName} min={0} onChange={(event) => updateValue("targetRegisters", Number(event.target.value))} type="number" value={values.targetRegisters} />
              </label>
              <label className="text-sm font-bold text-ink/70">
                目标店铺活跃数
                <input className={promoterFieldClassName} min={0} onChange={(event) => updateValue("targetActiveShops", Number(event.target.value))} type="number" value={values.targetActiveShops} />
              </label>
              <label className="text-sm font-bold text-ink/70">
                目标首单
                <input className={promoterFieldClassName} min={0} onChange={(event) => updateValue("targetFirstOrders", Number(event.target.value))} type="number" value={values.targetFirstOrders} />
              </label>
              <label className="text-sm font-bold text-ink/70">
                目标流水额度
                <input className={promoterFieldClassName} min={0} onChange={(event) => updateValue("targetPaymentGmv", Number(event.target.value))} step={10000} type="number" value={values.targetPaymentGmv} />
              </label>
              <label className="text-sm font-bold text-ink/70">
                规则开始日
                <input className={promoterFieldClassName} onChange={(event) => updateValue("validFrom", event.target.value)} type="date" value={values.validFrom} />
              </label>
              <label className="text-sm font-bold text-ink/70">
                规则结束日
                <input className={promoterFieldClassName} onChange={(event) => updateValue("validTo", event.target.value)} type="date" value={values.validTo} />
              </label>
              <div className="sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-black text-ink">阶梯分成条件</h4>
                    <p className="mt-1 text-xs font-bold text-ink/45">最高支持设定到 {businessCpsMaxCommissionTierCount} 级；完成一个阶梯自动进入下一个阶梯，结算周期内未完成下一阶梯任务时按上一阶梯结算。</p>
                  </div>
                  <Button disabled={values.commissionTiers.length >= businessCpsMaxCommissionTierCount} onClick={addCommissionTier} size="sm" type="button" variant="secondary">
                    添加阶梯
                  </Button>
                </div>
                <div className="mt-3 space-y-3">
                  {values.commissionTiers.map((tier, tierIndex) => (
                    <div className="rounded-lg border border-line bg-paper p-3" key={tier.id}>
                      <div className="grid gap-2 md:grid-cols-[1fr_110px_90px]">
                        <label className="text-[11px] font-black text-ink/45">
                          阶梯名称
                          <input className={promoterFieldClassName} onChange={(event) => updateTier(tierIndex, "name", event.target.value)} value={tier.name} />
                        </label>
                        <label className="text-[11px] font-black text-ink/45">
                          分成比例
                          <input className={promoterFieldClassName} min={0} max={100} onChange={(event) => updateTier(tierIndex, "commissionRate", Number(event.target.value))} step="0.1" type="number" value={tier.commissionRate} />
                        </label>
                        <div className="flex items-end">
                          <Button disabled={values.commissionTiers.length <= 1} onClick={() => removeCommissionTier(tierIndex)} size="sm" type="button" variant="secondary">
                            删除
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                        {([
                          ["registrations", businessCpsTierRequirementLabels.registrations],
                          ["activeShops", businessCpsTierRequirementLabels.activeShops],
                          ["activeShopWeeklyOrders", businessCpsTierRequirementLabels.activeShopWeeklyOrders],
                          ["firstOrders", businessCpsTierRequirementLabels.firstOrders],
                          ["paymentGmv", businessCpsTierRequirementLabels.paymentGmv]
                        ] as Array<[keyof BusinessCpsCommissionTierRule["requirements"], string]>).map(([key, label]) => (
                          <label className="text-[11px] font-black text-ink/45" key={key}>
                            {label}
                            <input className={promoterFieldClassName} min={0} onChange={(event) => updateTierRequirement(tierIndex, key, Number(event.target.value))} step={key === "paymentGmv" ? 10000 : 1} type="number" value={tier.requirements[key]} />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-line bg-paper p-3 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm font-black text-ink">
                  <input
                    checked={values.preferentialCondition.enabled}
                    onChange={(event) => updateValue("preferentialCondition", { ...values.preferentialCondition, enabled: event.target.checked })}
                    type="checkbox"
                  />
                  可设定优待条件
                </label>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-[11px] font-black text-ink/45">
                    开始时间
                    <input className={promoterFieldClassName} onChange={(event) => updateValue("preferentialCondition", { ...values.preferentialCondition, validFrom: event.target.value })} type="date" value={values.preferentialCondition.validFrom} />
                  </label>
                  <label className="text-[11px] font-black text-ink/45">
                    结束时间
                    <input className={promoterFieldClassName} onChange={(event) => updateValue("preferentialCondition", { ...values.preferentialCondition, validTo: event.target.value })} type="date" value={values.preferentialCondition.validTo} />
                  </label>
                  <label className="text-[11px] font-black text-ink/45">
                    起始分成比例
                    <input className={promoterFieldClassName} min={0} max={100} onChange={(event) => updateValue("preferentialCondition", { ...values.preferentialCondition, baseCommissionRate: Number(event.target.value) })} step="0.1" type="number" value={values.preferentialCondition.baseCommissionRate} />
                  </label>
                  <label className="text-[11px] font-black text-ink/45">
                    增加比例
                    <input className={promoterFieldClassName} min={0} max={100} onChange={(event) => updateValue("preferentialCondition", { ...values.preferentialCondition, extraCommissionRate: Number(event.target.value) })} step="0.1" type="number" value={values.preferentialCondition.extraCommissionRate} />
                  </label>
                </div>
              </div>
              <div className="grid gap-3 sm:col-span-2 lg:grid-cols-2">
                <div className="rounded-lg border border-line bg-paper p-3">
                  <label className="flex items-center gap-2 text-sm font-black text-ink">
                    <input
                      checked={values.downgradeCondition.enabled}
                      onChange={(event) => updateValue("downgradeCondition", { ...values.downgradeCondition, enabled: event.target.checked })}
                      type="checkbox"
                    />
                    可设定降低层级条件
                  </label>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <label className="text-[11px] font-black text-ink/45">
                      未达周期数
                      <input className={promoterFieldClassName} min={1} onChange={(event) => updateValue("downgradeCondition", { ...values.downgradeCondition, missedCycleCount: Number(event.target.value) })} type="number" value={values.downgradeCondition.missedCycleCount} />
                    </label>
                    <label className="text-[11px] font-black text-ink/45">
                      降到阶梯
                      <input className={promoterFieldClassName} min={1} onChange={(event) => updateValue("downgradeCondition", { ...values.downgradeCondition, fallbackTierLevel: Number(event.target.value) })} type="number" value={values.downgradeCondition.fallbackTierLevel} />
                    </label>
                  </div>
                </div>
                <div className="rounded-lg border border-line bg-paper p-3">
                  <label className="flex items-center gap-2 text-sm font-black text-ink">
                    <input
                      checked={values.promotionCondition.enabled}
                      onChange={(event) => updateValue("promotionCondition", { ...values.promotionCondition, enabled: event.target.checked })}
                      type="checkbox"
                    />
                    连续达标升级为 1级
                  </label>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <label className="text-[11px] font-black text-ink/45">
                      连续周期
                      <input className={promoterFieldClassName} min={1} onChange={(event) => updateValue("promotionCondition", { ...values.promotionCondition, consecutiveCycles: Number(event.target.value) })} type="number" value={values.promotionCondition.consecutiveCycles} />
                    </label>
                    <label className="text-[11px] font-black text-ink/45">
                      达到阶梯
                      <input className={promoterFieldClassName} min={1} onChange={(event) => updateValue("promotionCondition", { ...values.promotionCondition, requiredTierLevel: Number(event.target.value) })} type="number" value={values.promotionCondition.requiredTierLevel} />
                    </label>
                  </div>
                </div>
              </div>
              <label className="text-sm font-bold text-ink/70 sm:col-span-2">
                返佣释放条件
                <textarea className={promoterTextareaClassName} onChange={(event) => updateValue("releaseCondition", event.target.value)} value={values.releaseCondition} />
              </label>
              <label className="text-sm font-bold text-ink/70 sm:col-span-2">
                风控冻结条件
                <textarea className={promoterTextareaClassName} onChange={(event) => updateValue("riskCondition", event.target.value)} value={values.riskCondition} />
              </label>
            </div>
          </AdminCard>

          <AdminCard>
            <h3 className="font-black">权限</h3>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {promoterPermissionLabels.map(([key, label]) => (
                <label className="flex items-center gap-3 rounded-lg border border-line bg-paper px-3 py-2 text-sm font-bold text-ink/70" key={key}>
                  <input checked={values.permissions[key]} onChange={(event) => updatePermission(key, event.target.checked)} type="checkbox" />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </AdminCard>

          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={onClose} type="button" variant="secondary">
              取消
            </Button>
            <Button disabled={mode?.type === "create" && values.level > 1 && !values.parentPromoterId} type="submit">
              保存
            </Button>
          </div>
        </form>
      ) : null}
    </Drawer>
  );
}

function ServiceRulesModule() {
  const { state, onUpdateServiceRule, onUpdateCommissionConditionRule } = useCpsRuntime();
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const editingRule = editingRuleId ? state.commissionConditionRules.find((rule) => rule.id === editingRuleId) ?? null : null;
  const [ruleDraft, setRuleDraft] = useState<BusinessCpsCommissionConditionRule | null>(null);
  const [highestTierLevelInput, setHighestTierLevelInput] = useState(businessCpsMaxCommissionTierCount);

  useEffect(() => {
    setRuleDraft(editingRule ? { ...editingRule, commissionTiers: cloneCommissionTiers(editingRule.commissionTiers) } : null);
    setHighestTierLevelInput(editingRule ? Math.min(businessCpsMaxCommissionTierCount, Math.max(...editingRule.commissionTiers.map((tier) => tier.level), 1) + 1) : businessCpsMaxCommissionTierCount);
  }, [editingRule]);

  const updateRuleDraft = <Key extends keyof BusinessCpsCommissionConditionRule>(key: Key, value: BusinessCpsCommissionConditionRule[Key]) => {
    setRuleDraft((current) => current ? { ...current, [key]: value } : current);
  };

  const updateRuleDraftTier = <Key extends keyof BusinessCpsCommissionTierRule>(tierIndex: number, key: Key, value: BusinessCpsCommissionTierRule[Key]) => {
    setRuleDraft((current) => current ? {
      ...current,
      commissionTiers: current.commissionTiers.map((tier, index) => index === tierIndex ? { ...tier, [key]: value } : tier)
    } : current);
  };

  const updateRuleDraftTierRequirement = (
    tierIndex: number,
    key: keyof BusinessCpsCommissionTierRule["requirements"],
    value: number
  ) => {
    setRuleDraft((current) => current ? {
      ...current,
      commissionTiers: current.commissionTiers.map((tier, index) =>
        index === tierIndex ? { ...tier, requirements: { ...tier.requirements, [key]: value } } : tier
      )
    } : current);
  };

  const addRuleDraftTier = () => {
    setRuleDraft((current) => {
      if (!current) {
        return current;
      }

      const sortedTiers = cloneCommissionTiers(current.commissionTiers);
      const maxLevel = Math.max(...sortedTiers.map((tier) => tier.level), 0);
      const nextLevel = maxLevel + 1;

      if (nextLevel > businessCpsMaxCommissionTierCount || sortedTiers.some((tier) => tier.level === nextLevel)) {
        return current;
      }

      return {
        ...current,
        commissionTiers: [...sortedTiers, createBlankCommissionTier(nextLevel, sortedTiers[sortedTiers.length - 1])]
      };
    });
  };

  const addRuleDraftTiersToHighestLevel = () => {
    setRuleDraft((current) => {
      if (!current) {
        return current;
      }

      const targetLevel = Math.min(businessCpsMaxCommissionTierCount, Math.max(1, Math.floor(highestTierLevelInput)));
      const existingLevels = new Set(current.commissionTiers.map((tier) => tier.level));
      const maxLevel = Math.max(...current.commissionTiers.map((tier) => tier.level), 0);
      const nextTiers = cloneCommissionTiers(current.commissionTiers);
      let seed = nextTiers[nextTiers.length - 1];

      for (let level = maxLevel + 1; level <= targetLevel; level += 1) {
        if (!existingLevels.has(level)) {
          const nextTier = createBlankCommissionTier(level, seed);
          nextTiers.push(nextTier);
          existingLevels.add(level);
          seed = nextTier;
        }
      }

      return {
        ...current,
        commissionTiers: cloneCommissionTiers(nextTiers)
      };
    });
  };

  const calculateRuleDraftTier = (tierIndex: number) => {
    setRuleDraft((current) => {
      if (!current) {
        return current;
      }

      const sortedTiers = cloneCommissionTiers(current.commissionTiers);
      const tier = sortedTiers[tierIndex];
      const bounds = findCalculationBounds(sortedTiers, tier);

      if (!bounds) {
        return current;
      }

      return {
        ...current,
        commissionTiers: sortedTiers.map((item, index) => index === tierIndex ? calculateTierBetweenBounds(item, bounds.lowerTier, bounds.upperTier) : item)
      };
    });
  };

  const calculateAllRuleDraftTiers = () => {
    setRuleDraft((current) => {
      if (!current) {
        return current;
      }

      const sortedTiers = cloneCommissionTiers(current.commissionTiers);

      return {
        ...current,
        commissionTiers: sortedTiers.map((tier) => {
          if (tierHasCalculationData(tier)) {
            return tier;
          }

          const bounds = findCalculationBounds(sortedTiers, tier);

          return bounds ? calculateTierBetweenBounds(tier, bounds.lowerTier, bounds.upperTier) : tier;
        })
      };
    });
  };

  const saveRuleDraft = () => {
    if (!ruleDraft) {
      return;
    }

    onUpdateCommissionConditionRule(ruleDraft.id, {
      name: ruleDraft.name,
      commissionBasis: ruleDraft.commissionBasis,
      settlementDelayDays: ruleDraft.settlementDelayDays,
      releaseCondition: ruleDraft.releaseCondition,
      riskCondition: ruleDraft.riskCondition,
      commissionTiers: cloneCommissionTiers(ruleDraft.commissionTiers)
    });
    setEditingRuleId(null);
  };
  const sortedRuleDraftTiers = ruleDraft ? cloneCommissionTiers(ruleDraft.commissionTiers) : [];
  const currentHighestTierLevel = sortedRuleDraftTiers.length ? Math.max(...sortedRuleDraftTiers.map((tier) => tier.level)) : 0;
  const canAddRuleDraftTier = currentHighestTierLevel < businessCpsMaxCommissionTierCount;
  const canAutoCalculateAllRuleDraftTiers = sortedRuleDraftTiers.some((tier) => !tierHasCalculationData(tier) && Boolean(findCalculationBounds(sortedRuleDraftTiers, tier)));

  return (
    <div className="space-y-5">
      <AdminCard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">规则</h2>
            <p className="mt-1 text-sm text-ink/55">这里就是平台当前用于判定店铺活跃数的规则。</p>
          </div>
          <Badge tone="blue">管理和服务</Badge>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {state.serviceRules.map((rule) => (
            <div className="rounded-lg border border-line bg-paper p-4" key={rule.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{rule.name}</strong>
                <AdminToggleSwitch
                  ariaLabel={`${rule.name}${rule.status === "active" ? "关闭" : "开启"}`}
                  checked={rule.status === "active"}
                  onChange={(checked) => onUpdateServiceRule(rule.id, { status: checked ? "active" : "paused" })}
                />
              </div>
              <p className="mt-2 text-sm text-ink/60">{rule.description}</p>
              <div className="mt-4">
                <label className="text-sm font-bold text-ink/70">
                  一周 x 单
                  <input
                    className={promoterFieldClassName}
                    min={0}
                    onChange={(event) => onUpdateServiceRule(rule.id, { activeShopWeeklyOrders: Number(event.target.value) })}
                    type="number"
                    value={rule.activeShopWeeklyOrders}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </AdminCard>

      <AdminCard>
        <h2 className="text-lg font-black">分成条件</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {state.commissionConditionRules.map((rule) => (
            <div className="rounded-lg border border-line bg-paper p-3" key={rule.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm">{rule.name}</strong>
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs font-black", rule.status === "active" ? "text-moss" : "text-ink/45")}>{rule.status === "active" ? "生效" : "失效"}</span>
                  <AdminToggleSwitch
                    ariaLabel={`${rule.name}${rule.status === "active" ? "设为失效" : "设为生效"}`}
                    checked={rule.status === "active"}
                    onChange={(checked) => onUpdateCommissionConditionRule(rule.id, { status: checked ? "active" : "paused" })}
                  />
                  <Button onClick={() => setEditingRuleId(rule.id)} size="sm" type="button" variant="secondary">
                    编辑
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                {cloneCommissionTiers(rule.commissionTiers).map((tier) => (
                  <div className="rounded-md border border-line bg-white px-3 py-2" key={tier.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-xs text-ink">{tier.name}</strong>
                      <span className="text-xs font-black text-moss">分成 {percent(tier.commissionRate)}</span>
                    </div>
                    <p className="mt-1 text-xs font-bold leading-5 text-ink/50">
                      注册 {tier.requirements.registrations} 人 · 店铺活跃 {tier.requirements.activeShops} 家 · 每周 {tier.requirements.activeShopWeeklyOrders} 单 · 首单 {tier.requirements.firstOrders} 单 · 流水 {yen(tier.requirements.paymentGmv)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </AdminCard>

      <Drawer open={Boolean(ruleDraft)} title="编辑分成条件" onClose={() => setEditingRuleId(null)} defaultWidth={760} maxWidth={920}>
        {ruleDraft ? (
          <div className="space-y-5">
            <AdminCard>
              <h3 className="font-black">基础条件</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-bold text-ink/70">
                  分成条件名称
                  <input className={promoterFieldClassName} onChange={(event) => updateRuleDraft("name", event.target.value)} value={ruleDraft.name} />
                </label>
                <label className="text-sm font-bold text-ink/70">
                  分成计算基准
                  <select className={promoterFieldClassName} onChange={(event) => updateRuleDraft("commissionBasis", event.target.value as BusinessCpsCommissionBasis)} value={ruleDraft.commissionBasis}>
                    {Object.entries(commissionBasisLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="text-sm font-bold text-ink/70">
                  结算延迟天数
                  <input className={promoterFieldClassName} min={0} max={365} onChange={(event) => updateRuleDraft("settlementDelayDays", Number(event.target.value))} type="number" value={ruleDraft.settlementDelayDays} />
                </label>
              </div>
            </AdminCard>

            <AdminCard>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-black">阶梯条件</h3>
                  <p className="mt-1 text-xs font-bold text-ink/45">最高支持设定到 {businessCpsMaxCommissionTierCount} 级。设定最高级后，会自动补齐当前最高级到目标最高级之间的所有等级。</p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <Button disabled={!canAddRuleDraftTier} onClick={addRuleDraftTier} size="sm" type="button" variant="secondary">
                    添加阶梯等级
                  </Button>
                  <label className="text-[11px] font-black text-ink/45">
                    最高级
                    <input
                      className="mt-1 h-9 w-24 rounded-lg border border-line bg-white px-3 text-sm font-black text-ink outline-none transition focus:border-moss"
                      max={businessCpsMaxCommissionTierCount}
                      min={1}
                      onChange={(event) => setHighestTierLevelInput(Number(event.target.value))}
                      type="number"
                      value={highestTierLevelInput}
                    />
                  </label>
                  <Button disabled={highestTierLevelInput <= currentHighestTierLevel || highestTierLevelInput > businessCpsMaxCommissionTierCount} onClick={addRuleDraftTiersToHighestLevel} size="sm" type="button">
                    设定最高级阶梯等级
                  </Button>
                  <Button disabled={!canAutoCalculateAllRuleDraftTiers} onClick={calculateAllRuleDraftTiers} size="sm" type="button" variant="secondary">
                    自动计算全部
                  </Button>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {sortedRuleDraftTiers.map((tier, tierIndex) => {
                  const canCalculateTier = Boolean(findCalculationBounds(sortedRuleDraftTiers, tier));

                  return (
                  <div className="rounded-lg border border-line bg-paper p-3" key={tier.id}>
                    <div className="grid gap-2 md:grid-cols-[1fr_120px_auto]">
                      <label className="text-[11px] font-black text-ink/45">
                        阶梯名称
                        <input className={promoterFieldClassName} onChange={(event) => updateRuleDraftTier(tierIndex, "name", event.target.value)} value={tier.name} />
                      </label>
                      <label className="text-[11px] font-black text-ink/45">
                        分成比例
                        <input className={promoterFieldClassName} min={0} max={100} onChange={(event) => updateRuleDraftTier(tierIndex, "commissionRate", Number(event.target.value))} step="0.1" type="number" value={tier.commissionRate} />
                      </label>
                      <div className="flex items-end">
                        <Button disabled={!canCalculateTier} onClick={() => calculateRuleDraftTier(tierIndex)} size="sm" type="button" variant="secondary">
                          自动计算
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                      {([
                        ["registrations", businessCpsTierRequirementLabels.registrations],
                        ["activeShops", businessCpsTierRequirementLabels.activeShops],
                        ["activeShopWeeklyOrders", businessCpsTierRequirementLabels.activeShopWeeklyOrders],
                        ["firstOrders", businessCpsTierRequirementLabels.firstOrders],
                        ["paymentGmv", businessCpsTierRequirementLabels.paymentGmv]
                      ] as Array<[keyof BusinessCpsCommissionTierRule["requirements"], string]>).map(([key, label]) => (
                        <label className="text-[11px] font-black text-ink/45" key={key}>
                          {label}
                          <input className={promoterFieldClassName} min={0} onChange={(event) => updateRuleDraftTierRequirement(tierIndex, key, Number(event.target.value))} step={key === "paymentGmv" ? 10000 : 1} type="number" value={tier.requirements[key]} />
                        </label>
                      ))}
                    </div>
                  </div>
                  );
                })}
              </div>
            </AdminCard>

            <AdminCard>
              <h3 className="font-black">释放 / 风控</h3>
              <div className="mt-4 grid gap-3">
                <label className="text-sm font-bold text-ink/70">
                  返佣释放条件
                  <textarea className={promoterTextareaClassName} onChange={(event) => updateRuleDraft("releaseCondition", event.target.value)} value={ruleDraft.releaseCondition} />
                </label>
                <label className="text-sm font-bold text-ink/70">
                  风控冻结条件
                  <textarea className={promoterTextareaClassName} onChange={(event) => updateRuleDraft("riskCondition", event.target.value)} value={ruleDraft.riskCondition} />
                </label>
              </div>
            </AdminCard>

            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={() => setEditingRuleId(null)} type="button" variant="secondary">取消</Button>
              <Button onClick={saveRuleDraft} type="button">保存</Button>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

export function CpsWorkspace({
  routeBase = "/admin/afirieito",
  scope = "ops-sync"
}: {
  routeBase?: string;
  scope?: CpsWorkspaceScope;
}) {
  const [runtimeState, setRuntimeState] = useState<BusinessCpsRuntimeState>(() => readInitialCpsRuntimeState());
  const [notice, setNotice] = useState<CpsRuntimeNotice>(null);
  const dashboard = useMemo(() => buildBusinessCpsDashboard(runtimeState), [runtimeState]);
  const diagnostics = useMemo(() => buildBusinessCpsLogicDiagnostics(runtimeState), [runtimeState]);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const normalizedPath = scope === "business-admin" ? normalizeCpsAdminPath(location.pathname) : location.pathname;
  const isBusinessAnnouncementsComposeRoute = scope === "business-admin" && normalizedPath === "/NDA-admin/announcements/compose";
  const routePage = scope === "business-admin" ? findCpsSidebarPageByPath(location.pathname) : null;
  const hasModuleQuery = searchParams.has("module");
  const unknownRoutePage = scope === "business-admin" && !routePage && !isBusinessAnnouncementsComposeRoute
    ? ({
        key: "unknown-cps-route",
        label: "未配置模块",
        path: location.pathname,
        description: "当前 NDA管理后台路由还没有挂载到菜单配置，请返回 Afirieito 总览或从左侧菜单选择一个模块。",
        features: ["菜单配置检查", "路由挂载", "页面占位", "后续模块扩展"]
      } satisfies CpsSidebarPage)
    : null;
  const placeholderPage = !hasModuleQuery ? (routePage && !routePage.workspaceModule ? routePage : null) ?? unknownRoutePage : null;
  const activeModule = hasModuleQuery ? getActiveModule(searchParams.get("module")) : routePage?.workspaceModule ?? "dashboard";
  const [selectedPromoter, setSelectedPromoter] = useState<BusinessCpsPromoter | null>(null);
  const [promoterEditorMode, setPromoterEditorMode] = useState<PromoterEditorMode | null>(null);
  const selectedPromoterId = searchParams.get("promoter");
  const moduleTitles = scope === "business-admin" ? businessAdminModuleTitles : opsSyncModuleTitles;
  const header = placeholderPage ? { title: placeholderPage.label, description: placeholderPage.description } : moduleTitles[activeModule];

  useEffect(() => {
    writeBrowserStorage(businessCpsRuntimeStorageKey, JSON.stringify(runtimeState), { silent: true });
  }, [runtimeState]);

  useEffect(() => {
    if (!selectedPromoterId) {
      return;
    }

    const promoter = runtimeState.promoters.find((item) => item.id === selectedPromoterId);

    if (promoter) {
      setSelectedPromoter(promoter);
    }
  }, [runtimeState.promoters, selectedPromoterId]);

  const closePromoter = () => {
    setSelectedPromoter(null);
    const nextParams = new URLSearchParams(searchParams);

    nextParams.delete("promoter");
    setSearchParams(nextParams, { replace: true });
  };

  const openPromoter = (promoter: BusinessCpsPromoter) => {
    setSelectedPromoter(promoter);
    const nextParams = new URLSearchParams(searchParams);

    nextParams.set("module", "promoters");
    nextParams.set("promoter", promoter.id);
    setSearchParams(nextParams, { replace: true });
  };

  const openCreateSubPromoter = (parentPromoterId?: string, level?: number) => {
    setPromoterEditorMode({ type: "create", parentPromoterId, level });
  };

  const openEditPromoter = (promoterId: string) => {
    setPromoterEditorMode({ type: "edit", promoterId });
  };

  const closePromoterEditor = () => {
    setPromoterEditorMode(null);
  };

  const onCreateSubPromoter = (input: BusinessCpsSubPromoterInput) => {
    setRuntimeState((current) => {
      const result = applyCreateSubPromoter(current, input, "NDA管理后台新增下级推广者");

      setNotice(result.notice);

      if (result.notice.tone === "success") {
        setPromoterEditorMode(null);
      }

      return result.state;
    });
  };

  const onUpdatePromoter = (input: BusinessCpsPromoterUpdateInput) => {
    setRuntimeState((current) => {
      const result = applyUpdatePromoter(current, input, "NDA管理后台编辑推广者资料和分成条件");

      setNotice(result.notice);

      if (result.notice.tone === "success") {
        setPromoterEditorMode(null);
      }

      return result.state;
    });
  };

  const onCampaignAction = (campaign: BusinessCpsCampaign, action: BusinessCpsCampaignAction) => {
    const reason = askOperationReason(campaignActionLabels[action], campaign.name);

    setRuntimeState((current) => {
      const result = applyCampaignAction(current, campaign.id, action, reason);

      setNotice(result.notice);
      return result.state;
    });
  };

  const onCarrierAction = (linkId: string, action: BusinessCpsCarrierAction) => {
    const reason = askOperationReason(carrierActionLabels[action], linkId);

    setRuntimeState((current) => {
      const result = applyCarrierAction(current, linkId, action, reason);

      setNotice(result.notice);
      return result.state;
    });
  };

  const onCommissionAction = (commissionId: string, action: BusinessCpsCommissionAction) => {
    const reason = askOperationReason(commissionActionLabels[action], commissionId);

    setRuntimeState((current) => {
      const result = applyCommissionAction(current, commissionId, action, reason);

      setNotice(result.notice);
      return result.state;
    });
  };

  const onRiskAction = (riskId: string, action: BusinessCpsRiskAction) => {
    const reason = askOperationReason(riskActionLabels[action], riskId);

    setRuntimeState((current) => {
      const result = applyRiskAction(current, riskId, action, reason);

      setNotice(result.notice);
      return result.state;
    });
  };

  const onSettlementAction = (batchId: string, action: BusinessCpsSettlementAction) => {
    const reason = askOperationReason(settlementActionLabels[action], batchId);

    setRuntimeState((current) => {
      const result = applySettlementAction(current, batchId, action, reason);

      setNotice(result.notice);
      return result.state;
    });
  };

  const onUpdateServiceRule = (ruleId: string, patch: { activeShopWeeklyOrders?: number; status?: "active" | "draft" | "paused" }) => {
    setRuntimeState((current) => ({
      ...current,
      serviceRules: current.serviceRules.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              activeShopWeeklyOrders: patch.activeShopWeeklyOrders === undefined ? rule.activeShopWeeklyOrders : Math.max(0, Math.floor(patch.activeShopWeeklyOrders)),
              status: patch.status ?? rule.status
            }
          : rule
      )
    }));
    setNotice({ tone: "success", message: "规则已更新，平台当前店铺活跃数判定会用于分成条件。" });
  };

  const onUpdateCommissionConditionRule = (ruleId: string, patch: Partial<BusinessCpsCommissionConditionRule>) => {
    setRuntimeState((current) => {
      const targetRule = current.commissionConditionRules.find((rule) => rule.id === ruleId);

      if (!targetRule) {
        return current;
      }

      return {
        ...current,
        commissionConditionRules: current.commissionConditionRules.map((rule) => {
          if (rule.id === ruleId) {
            return {
              ...rule,
              ...patch,
              status: patch.status ?? rule.status,
              commissionTiers: patch.commissionTiers ? cloneCommissionTiers(patch.commissionTiers) : rule.commissionTiers
            };
          }

          if (patch.status === "active" && rule.appliesToLevel === targetRule.appliesToLevel && rule.status === "active") {
            return { ...rule, status: "paused" };
          }

          return rule;
        })
      };
    });
    setNotice({ tone: "success", message: "分成条件已更新。" });
  };

  const runtimeContext = useMemo<CpsRuntimeContextValue>(
    () => ({
      state: runtimeState,
      dashboard,
      diagnostics,
      notice,
      onCreateSubPromoter,
      onUpdatePromoter,
      onCampaignAction,
      onCarrierAction,
      onCommissionAction,
      onRiskAction,
      onSettlementAction,
      onUpdateServiceRule,
      onUpdateCommissionConditionRule
    }),
    [dashboard, diagnostics, notice, runtimeState]
  );

  const actions = useMemo(
    () => (
      <div className="flex flex-wrap gap-2">
        {scope === "ops-sync" ? (
          <>
            <a className="focus-ring inline-flex h-10 items-center justify-center rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink transition hover:border-moss" href="/NDA-admin">
              打开 NDA管理后台
            </a>
            <button className="focus-ring inline-flex h-10 items-center justify-center rounded-full border border-line bg-paper px-4 text-sm font-semibold text-ink transition hover:border-moss" type="button">
              同步全部 Afirieito 数据
            </button>
          </>
        ) : (
          <>
            <a className="focus-ring inline-flex h-10 items-center justify-center rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink transition hover:border-moss" href="/afirieito.html#/afirieito">
              打开 Afirieito H5
            </a>
            <Button to={getModulePath(routeBase, "wizard")}>新建推广计划</Button>
          </>
        )}
      </div>
    ),
    [routeBase, scope]
  );
  const businessAnnouncementContent = scope === "business-admin"
    ? isBusinessAnnouncementsComposeRoute
      ? (
          <AdminNotificationComposeContent
            deliveryTargets={["全体用户", "用户端", "技师端", "商户端", "NDA管理后台"]}
            description="编辑 NDA管理后台公告，支持标题、图文视频、下载文件、分段排版和精确到秒的定时发送。"
            returnLabel="返回公告列表"
            returnPath="/NDA-admin/announcements"
            savedChannel="NDA 公告"
            sendLabel="发送公告"
            title="发送公告"
          />
        )
      : placeholderPage && placeholderPage.key === "announcements"
        ? (
            <AdminNotificationsContent
              composeLabel="发送公告"
              composePath="/NDA-admin/announcements/compose"
              description="查看 NDA管理后台公告、系统通知、结算提醒和需要 Afirieito 运营确认的后台消息。功能与产运后台官方通知保持一致，但不会离开 NDA管理后台。"
              drawerTitle="公告详情"
              listInfo="点击公告可打开详情。铃铛右上角的红点数字对应这里的未读件数。Afirieito 更新、交互优化与流程修正会在这里持续归档。"
              listTitle="公告列表"
              settingsLabel="公告设置"
              title="公告"
            />
          )
        : null
    : null;
  const businessDocsContent = scope === "business-admin" && placeholderPage?.key === "operation-docs"
    ? <AdminDocsWorkspace mode="operation" surface="afirieito" />
    : scope === "business-admin" && placeholderPage?.key === "api-docs"
      ? <AdminDocsWorkspace mode="api" surface="afirieito" />
      : null;

  return (
    <CpsRuntimeContext.Provider value={runtimeContext}>
      {businessAnnouncementContent ?? businessDocsContent ?? (
        <ModuleShell actions={actions} description={header.description} title={header.title}>
        <CpsNoticeBanner />
        {scope === "ops-sync" ? (
          <AdminCard className="border-moss/30 bg-mint/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-moss">Afirieito Sync</p>
                <h3 className="mt-1 text-lg font-black">产运后台只同步和复核 Afirieito 独立系统数据</h3>
                <p className="mt-1 text-sm text-ink/60">推广计划、素材、归因、佣金、钱包、风控、推广者资料都从 NDA管理后台同步到这里。</p>
              </div>
              <Badge tone="blue">同步镜像</Badge>
            </div>
          </AdminCard>
        ) : null}
        {placeholderPage && placeholderPage.key === "account" ? (
          <CpsAccountManagementPage />
        ) : placeholderPage ? (
          <CpsPlaceholderPage page={placeholderPage} />
        ) : (
          <>
            {activeModule === "dashboard" ? <DashboardModule /> : null}
            {activeModule === "linkData" ? <LinkDataModule /> : null}
            {activeModule === "plans" ? <CampaignPlansModule /> : null}
            {activeModule === "wizard" ? <PlanWizardModule /> : null}
            {activeModule === "team" ? <TeamModule onCreateSubPromoter={openCreateSubPromoter} onEditPromoter={openEditPromoter} /> : null}
            {activeModule === "links" ? scope === "business-admin" ? <LinksBuilderModule /> : <LinkCodeQrModule /> : null}
            {activeModule === "materials" ? scope === "business-admin" ? <AdCreativesBuilderModule /> : <MaterialsChannelsModule /> : null}
            {activeModule === "crm" ? <MerchantCrmModule /> : null}
            {activeModule === "tracking" ? <TrackingModule /> : null}
            {activeModule === "attribution" ? <AttributionModule /> : null}
            {activeModule === "settlement" ? <SettlementModule /> : null}
            {activeModule === "wallet" ? <WalletModule /> : null}
            {activeModule === "risk" ? <RiskModule /> : null}
            {activeModule === "promoters" ? <PromotersModule onCreateSubPromoter={openCreateSubPromoter} onEditPromoter={openEditPromoter} onOpenPromoter={openPromoter} routeBase={routeBase} /> : null}
            {activeModule === "serviceRules" ? <ServiceRulesModule /> : null}
          </>
        )}
        </ModuleShell>
      )}

      <PromoterDrawer onClose={closePromoter} onCreateSubPromoter={openCreateSubPromoter} onEditPromoter={openEditPromoter} promoter={selectedPromoter} />
      <PromoterFormDrawer mode={promoterEditorMode} onClose={closePromoterEditor} />
    </CpsRuntimeContext.Provider>
  );
}

export function CpsPage() {
  return (
    <AdminLayout>
      <CpsWorkspace routeBase="/admin/afirieito" scope="ops-sync" />
    </AdminLayout>
  );
}
