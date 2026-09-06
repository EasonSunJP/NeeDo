import { WorkStatusMetrics } from "../../features/technician-work-status/WorkStatusMetrics";
import { WorkTimeline } from "../../features/technician-work-status/WorkTimeline";
import type { WorkStatusTarget } from "../../features/technician-work-status/api";
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from "react";
import type {
  BackofficeAccountPayload,
  BackofficeAuditEventPayload,
  BackofficeCompensationProfilePayload,
  BackofficeCustomerDetailPayload,
  BackofficeCustomerTimelinePayload,
  BackofficeIdentityPayload,
  BackofficeOrderPayload,
  BackofficeReviewSummaryPayload,
  BackofficeRolePayload,
  BackofficeScheduleSlotPayload,
  BackofficeTechnicianDetailPayload,
  BackofficeTechnicianServiceDetailPayload
} from "../../api/backofficeRealData";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import {
  languageLocales,
  translateText,
  type Language
} from "../../i18n/translations";
import { AdminEventTimeline } from "./AdminEventTimeline";
import { cn } from "../../lib/utils";
import type { PlatformManagedUserDetail } from "../../features/platform-user-management/types";
import { membershipTierText, privacyModeText, privacyScopeText } from "../../features/platform-user-management/i18n";
import {
  type ContactEventTimelineEntry
} from "../mobile/ContactEventTimeline";
import { Badge, type BadgeTone } from "../ui/Badge";
import { DetailGrid } from "./DetailGrid";
import {
  FormalTimelinePagination,
  type FormalTimelinePageSize,
} from "./FormalTimelinePagination";

type TechnicianDetailTab =
  | "基础资料"
  | "状态与数据"
  | "技能与服务"
  | "排班偏好"
  | "薪酬设置"
  | "权限与账号"
  | "时间线";

export type CustomerDetailTab = "基础资料" | "会员等级" | "预约与消费" | "评价" | "权限与账号" | "用户LOG";

export type FormalLocalization = {
  language: Language;
  locale: string;
  t: (source: string) => string;
};

type MetricItem = {
  id: string;
  label: string;
  value: ReactNode;
};

const technicianTabs: TechnicianDetailTab[] = [
  "基础资料",
  "状态与数据",
  "技能与服务",
  "排班偏好",
  "薪酬设置",
  "权限与账号",
  "时间线"
];

const customerTabs: CustomerDetailTab[] = ["基础资料", "会员等级", "预约与消费", "评价", "权限与账号", "用户LOG"];

export function resolveFormalTabKeyboardIndex(
  key: string,
  currentIndex: number,
  itemCount: number
) {
  if (itemCount <= 0) {
    return null;
  }

  if (key === "ArrowRight") {
    return (currentIndex + 1) % itemCount;
  }

  if (key === "ArrowLeft") {
    return (currentIndex - 1 + itemCount) % itemCount;
  }

  if (key === "Home") {
    return 0;
  }

  if (key === "End") {
    return itemCount - 1;
  }

  return null;
}

export function formatFormalScheduleMinutes(minutes: number, language: Language) {
  const locale = languageLocales[language];
  const wholeMinutes = Math.max(0, Math.trunc(minutes));
  const hours = Math.floor(wholeMinutes / 60);
  const remainingMinutes = wholeMinutes % 60;
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
  const joinUnit = (value: number, unitKey: "小时" | "分钟") => {
    const unit = translateText(unitKey, language);
    return `${number(value)}${language === "en" ? " " : ""}${unit}`;
  };

  if (hours === 0) {
    return joinUnit(remainingMinutes, "分钟");
  }

  if (remainingMinutes === 0) {
    return joinUnit(hours, "小时");
  }

  return `${joinUnit(hours, "小时")} ${joinUnit(remainingMinutes, "分钟")}`;
}

export function FormalTechnicianDetailPanel({
  actionContent,
  detail,
  editContent,
  initialTab = "基础资料",
  workStatusScope = "backoffice"
}: {
  actionContent?: ReactNode;
  detail: BackofficeTechnicianDetailPayload;
  editContent?: ReactNode;
  initialTab?: TechnicianDetailTab;
  workStatusScope?: "backoffice" | "merchant-admin";
}) {
  const localization = useFormalLocalization();
  const [activeTab, setActiveTab] = useState<TechnicianDetailTab>(initialTab);
  const panelId = useId();

  return (
    <article className="min-w-0 overflow-hidden rounded-[22px] border border-line bg-paper shadow-panel">
      <FormalIdentityHeader
        accountActive={detail.account.isActive}
        actionContent={actionContent}
        avatarUrl={detail.account.avatarUrl}
        badges={[
          { label: technicianStatusLabel(detail.status, localization), tone: technicianStatusTone(detail.status) },
          ...(detail.verifiedAt ? [{ label: localization.t("已验证"), tone: "green" as const }] : []),
          ...(detail.isRecommended ? [{ label: localization.t("推荐技师"), tone: "yellow" as const }] : [])
        ]}
        city={detail.city}
        displayName={detail.displayName}
        identityLabel={localization.t("技师账号")}
        localization={localization}
        needoId={detail.needoId}
        rating={detail.reviewSummary}
        shopLabel={detail.shopName ?? localization.t("未绑定店铺")}
      />

      <FormalTabs
        active={activeTab}
        idPrefix={panelId}
        items={technicianTabs}
        localization={localization}
        onChange={setActiveTab}
      />

      <FormalTabPanels active={activeTab} idPrefix={panelId} items={technicianTabs}>
        {(tab) => renderTechnicianTab(tab, detail, editContent, localization, { scope: workStatusScope, technicianProfileId: detail.id })}
      </FormalTabPanels>
    </article>
  );
}

export function FormalCustomerDetailPanel({
  actionContent,
  detail,
  editContent,
  membershipEditContent,
  initialTab = "基础资料",
  onRetryTimeline,
  onTimelinePageChange,
  onTimelinePageSizeChange,
  timeline,
  timelineError = "",
  timelineLoading = false,
}: {
  actionContent?: ReactNode;
  detail: BackofficeCustomerDetailPayload;
  editContent?: ReactNode;
  membershipEditContent?: ReactNode;
  initialTab?: CustomerDetailTab;
  onRetryTimeline?: () => void;
  onTimelinePageChange?: (page: number) => void;
  onTimelinePageSizeChange?: (pageSize: FormalTimelinePageSize) => void;
  timeline?: BackofficeCustomerTimelinePayload | null;
  timelineError?: string;
  timelineLoading?: boolean;
}) {
  const localization = useFormalLocalization();
  const [activeTab, setActiveTab] = useState<CustomerDetailTab>(initialTab);
  const panelId = useId();

  return (
    <article className="min-w-0 overflow-hidden rounded-[22px] border border-line bg-paper shadow-panel">
      <FormalIdentityHeader
        accountActive={detail.account.isActive}
        actionContent={actionContent}
        avatarUrl={detail.account.avatarUrl}
        badges={[
          {
            label: localization.t(detail.account.isActive ? "账号启用" : "账号停用"),
            tone: detail.account.isActive ? "green" : "red"
          },
          { label: membershipLabel(detail.membershipLevel, localization), tone: "yellow" },
          {
            label: localization.t(detail.isPublic ? "资料公开" : "资料非公开"),
            tone: detail.isPublic ? "blue" : "neutral"
          }
        ]}
        city={detail.city ?? localization.t("城市未设置")}
        displayName={detail.displayName}
        identityLabel={localization.t("用户账号")}
        localization={localization}
        needoId={detail.account.needoId}
        rating={detail.reviewSummary}
        shopLabel={localization.t("平台用户")}
      />

      <FormalTabs
        active={activeTab}
        idPrefix={panelId}
        items={customerTabs}
        localization={localization}
        onChange={setActiveTab}
      />

      <FormalTabPanels active={activeTab} idPrefix={panelId} items={customerTabs}>
        {(tab) =>
          renderCustomerTab(
            tab,
            detail,
            editContent,
            membershipEditContent,
            localization,
            tab === "用户LOG" ? (
              <CustomerTimelinePanel
                detail={detail}
                error={timelineError}
                loading={timelineLoading}
                onPageChange={onTimelinePageChange}
                onPageSizeChange={onTimelinePageSizeChange}
                onRetry={onRetryTimeline}
                timeline={timeline}
              />
            ) : undefined,
          )
        }
      </FormalTabPanels>
    </article>
  );
}

export function FormalManagedUserDetailPanel({
  actionContent,
  detail,
  initialTab = "基础资料",
  membershipActions,
  reviewContent,
  usageContent,
  accountContent,
  activityContent
}: {
  actionContent?: ReactNode;
  detail: PlatformManagedUserDetail;
  initialTab?: CustomerDetailTab;
  membershipActions?: { tier?: ReactNode; multiplier?: ReactNode };
  reviewContent?: ReactNode;
  usageContent?: ReactNode;
  accountContent?: ReactNode;
  activityContent?: ReactNode;
}) {
  const localization = useFormalLocalization();
  const [activeTab, setActiveTab] = useState<CustomerDetailTab>(initialTab);
  const panelId = useId();
  const credit = detail.metrics.credit;
  const review = credit.reviewCount > 0 ? {
    ratingAverage: credit.ratingAverage,
    reviewCount: credit.reviewCount,
    latestReviewAt: credit.latestReviewAt,
    highlights: []
  } : null;

  return (
    <article className="min-w-0 overflow-hidden rounded-[22px] border border-line bg-paper shadow-panel">
      <FormalIdentityHeader
        accountActive={detail.isActive}
        actionContent={actionContent}
        avatarUrl={detail.avatarUrl}
        badges={[
          { label: localization.t(detail.isActive ? "账号启用" : "账号停用"), tone: detail.isActive ? "green" : "red" },
          { label: membershipTierText(detail.membership.tierCode, localization.language), tone: "yellow" },
          { label: privacyModeText(detail.privacyMode, localization.language), tone: detail.privacyMode ? "neutral" : "blue" }
        ]}
        city={detail.city ?? localization.t("城市未设置")}
        displayName={detail.displayName}
        identityLabel={localization.t("用户账号")}
        localization={localization}
        needoId={detail.needoId}
        rating={review}
        shopLabel={localization.t("平台用户")}
      />

      <section className="border-b border-line bg-white px-4 py-4 sm:px-5">
        <MetricGrid items={[
          { id: "ndp", label: localization.t("积分"), value: formatInteger(detail.metrics.ndpAvailable, localization) },
          { id: "usage", label: localization.t("利用次数"), value: formatInteger(detail.metrics.usageCount, localization) },
          { id: "credit", label: localization.t("信用值"), value: `${formatDecimal(credit.ratingAverage, localization)} / 5` },
          { id: "privacy", label: localization.t("隐私模式"), value: detail.privacyScope ? privacyScopeText(detail.privacyScope, localization.language) : privacyModeText(false, localization.language) }
        ]} />
        <div className="mt-3 grid gap-2 rounded-lg border border-line bg-paper p-3 sm:grid-cols-2 lg:grid-cols-4">
          <ManagedHeaderFact action={membershipActions?.tier} label={localization.t("会员类型")} value={membershipTierText(detail.membership.tierCode, localization.language)} />
          <ManagedHeaderFact action={membershipActions?.multiplier} label={localization.t("会员倍率")} value={`×${formatDecimal(detail.membership.experienceMultiplier, localization)}`} />
          <ManagedHeaderFact label={localization.t("当前等级")} value={detail.experience ? `Lv.${formatInteger(detail.experience.currentLevel, localization)}` : "—"} />
          <ManagedHeaderFact label={localization.t("累计经验")} value={detail.experience ? `${formatInteger(Number(detail.experience.totalExpUnits), localization)} EXP` : "—"} />
        </div>
      </section>

      <FormalTabs active={activeTab} idPrefix={panelId} items={customerTabs} localization={localization} onChange={setActiveTab} />
      <FormalTabPanels active={activeTab} idPrefix={panelId} items={customerTabs}>
        {(tab) => renderManagedUserTab(tab, detail, review, localization, reviewContent, usageContent, accountContent, activityContent)}
      </FormalTabPanels>
    </article>
  );
}

function ManagedHeaderFact({ action, label, value }: { action?: ReactNode; label: string; value: ReactNode }) {
  return <div className="flex min-w-0 items-center justify-between gap-2"><div className="min-w-0"><p className="text-[11px] font-black text-ink/45">{label}</p><p className="mt-1 truncate text-sm font-black text-ink">{value}</p></div>{action}</div>;
}

function renderManagedUserTab(
  tab: CustomerDetailTab,
  detail: PlatformManagedUserDetail,
  review: BackofficeReviewSummaryPayload | null,
  localization: FormalLocalization,
  reviewContent?: ReactNode,
  usageContent?: ReactNode,
  accountContent?: ReactNode,
  activityContent?: ReactNode
) {
  if (tab === "基础资料") return <FormalSectionCard localization={localization} title="基础资料"><DetailGrid items={localizeDetailItems([
    { label: "用户名", value: detail.username },
    { label: "邮箱", value: detail.email },
    { label: "手机号", value: detail.phone ?? localization.t("未设置") },
    { label: "所在城市", value: detail.city ?? localization.t("未设置") },
    { label: "eKYC", value: localization.t(detail.ekycVerified ? "已验证" : "未验证") },
    { label: "注册时间", value: formatDateTime(detail.createdAt, localization) }
  ], localization)} /></FormalSectionCard>;

  if (tab === "会员等级") return <FormalSectionCard localization={localization} title="会员等级"><DetailGrid items={localizeDetailItems([
    { label: "当前会员等级", value: membershipTierText(detail.membership.tierCode, localization.language) },
    { label: "会员倍率", value: `×${formatDecimal(detail.membership.experienceMultiplier, localization)}` },
    { label: "当前等级", value: detail.experience ? `Lv.${detail.experience.currentLevel}` : "—" },
    { label: "累计经验", value: detail.experience ? `${detail.experience.totalExpUnits} EXP` : "—" },
    { label: "到期时间", value: formatDateTime(detail.membership.expiresAt, localization) }
  ], localization)} /></FormalSectionCard>;

  if (tab === "预约与消费") return <FormalSectionCard localization={localization} title="预约与消费"><MetricGrid items={[
    { id: "all", label: localization.t("预约总数"), value: formatInteger(detail.bookingSpend.totalBookings, localization) },
    { id: "completed", label: localization.t("已完成"), value: formatInteger(detail.bookingSpend.completedBookings, localization) },
    { id: "spend", label: localization.t("已完成消费"), value: formatMoney(detail.bookingSpend.completedSpendJpy, "JPY", localization) }
  ]} /></FormalSectionCard>;

  if (tab === "评价") return reviewContent ?? <ReviewSummaryCard localization={localization} review={review} />;

  if (tab === "权限与账号") return accountContent ?? <>
    <FormalSectionCard localization={localization} title="角色"><div className="flex flex-wrap gap-2">{detail.account.roles.flatMap((role) => [<Badge key={`${role.code}-role`} tone="dark">{role.name}</Badge>, ...role.permissions.map((permission) => <Badge key={`${role.code}-${permission}`}>{permission}</Badge>)])}</div></FormalSectionCard>
    <FormalSectionCard localization={localization} title="身份"><div className="flex flex-wrap gap-2">{detail.identities.map((identity, index) => <Badge key={`${identity.type}-${identity.scopeId ?? index}`} tone="blue">{identity.displayName ?? identity.type}</Badge>)}</div></FormalSectionCard>
  </>;

  return <>{usageContent}{activityContent ?? <AuditTimeline events={detail.audit.list.map((event) => ({
    ...event,
    metadata: event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata as Record<string, unknown> : null
  }))} localization={localization} title="用户LOG" />}</>;
}

function useFormalLocalization(): FormalLocalization {
  const { language } = useOptionalI18n();

  return {
    language,
    locale: languageLocales[language],
    t: (source) => translateText(source, language)
  };
}

export function FormalTabs<TTab extends string>({
  active,
  idPrefix,
  items,
  localization,
  onChange
}: {
  active: TTab;
  idPrefix: string;
  items: TTab[];
  localization: FormalLocalization;
  onChange: (tab: TTab) => void;
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const nextIndex = resolveFormalTabKeyboardIndex(event.key, currentIndex, items.length);

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    onChange(items[nextIndex]);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="border-b border-line bg-white px-4 py-3 sm:px-5">
      <div
        aria-label={localization.t("详情分类")}
        className="scrollbar-none flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-full border border-line bg-paper p-1"
        role="tablist"
      >
        {items.map((item, index) => {
          const selected = item === active;

          return (
            <button
              aria-controls={`${idPrefix}-panel-${index}`}
              aria-selected={selected}
              className={cn(
                "focus-ring h-9 shrink-0 rounded-full border border-transparent px-4 text-sm font-black transition",
                selected
                  ? "bg-[color:var(--admin-text,#172033)] text-[color:var(--admin-bg-soft,#fff)] shadow-sm"
                  : "bg-transparent text-ink/60 hover:bg-white hover:text-ink"
              )}
              id={`${idPrefix}-tab-${index}`}
              key={item}
              onClick={() => onChange(item)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              {localization.t(item)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FormalTabPanels<TTab extends string>({
  active,
  children,
  idPrefix,
  items
}: {
  active: TTab;
  children: (tab: TTab) => ReactNode;
  idPrefix: string;
  items: TTab[];
}) {
  return (
    <>
      {items.map((tab, index) => {
        const selected = tab === active;

        return (
          <div
            aria-labelledby={`${idPrefix}-tab-${index}`}
            className={cn("min-w-0 gap-4 p-4 sm:p-5", selected ? "grid" : "hidden")}
            hidden={!selected}
            id={`${idPrefix}-panel-${index}`}
            key={tab}
            role="tabpanel"
            tabIndex={selected ? 0 : -1}
          >
            {children(tab)}
          </div>
        );
      })}
    </>
  );
}

function FormalIdentityHeader({
  accountActive,
  actionContent,
  avatarUrl,
  badges,
  city,
  displayName,
  identityLabel,
  localization,
  needoId,
  rating,
  shopLabel
}: {
  accountActive: boolean;
  actionContent?: ReactNode;
  avatarUrl: string | null;
  badges: Array<{ label: string; tone: BadgeTone }>;
  city: string;
  displayName: string;
  identityLabel: string;
  localization: FormalLocalization;
  needoId: string;
  rating: BackofficeReviewSummaryPayload | null;
  shopLabel: string;
}) {
  return (
    <header className="relative overflow-hidden bg-[linear-gradient(135deg,#162521,#23473e)] px-4 py-5 text-white sm:px-6 sm:py-6">
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-moss" />
      <div className="relative flex min-w-0 flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[18px] border border-white/20 bg-white/10 text-xl font-black shadow-[0_12px_32px_rgba(0,0,0,0.2)] sm:h-20 sm:w-20">
            {avatarUrl ? (
              <img alt={`${displayName} ${localization.t("头像")}`} className="h-full w-full object-cover" src={avatarUrl} />
            ) : (
              <span aria-label={localization.t("未提供头像")} role="img">
                <NeutralProfileIcon />
              </span>
            )}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5">
              {badges.map((badge, index) => (
                <Badge className="border border-white/10" key={`${badge.label}-${badge.tone}-${index}`} tone={badge.tone}>
                  {badge.label}
                </Badge>
              ))}
            </div>
            <h2 className="mt-3 break-words text-2xl font-black tracking-[-0.025em] sm:text-3xl">{displayName}</h2>
            <p className="mt-2 break-words text-sm font-bold text-white/65">{shopLabel} · {city}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.08em] text-white/70">
              <span className="rounded-md border border-white/15 bg-black/15 px-2 py-1">NeeDoID {needoId}</span>
              <span className="rounded-md border border-white/15 bg-black/15 px-2 py-1">{identityLabel}</span>
              <span className="rounded-md border border-white/15 bg-black/15 px-2 py-1">{localization.t(accountActive ? "账号启用" : "账号停用")}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 lg:justify-end">
          <div className="min-w-[150px] rounded-[16px] border border-white/15 bg-black/15 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/55">{localization.t("正式评价摘要")}</p>
            {rating ? (
              <p className="mt-1 text-lg font-black tabular-nums">★ {formatDecimal(rating.ratingAverage, localization)} <span className="text-xs text-white/60">/ {formatInteger(rating.reviewCount, localization)} {localization.t("条")}</span></p>
            ) : (
              <p className="mt-1 text-sm font-black text-white/75">{localization.t("暂无评价")}</p>
            )}
          </div>
          {actionContent ? <div className="flex flex-wrap gap-2">{actionContent}</div> : null}
        </div>
      </div>
    </header>
  );
}

function NeutralProfileIcon() {
  return (
    <svg aria-hidden="true" className="h-8 w-8 text-white/65" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5.5 19c.7-3.3 3-5 6.5-5s5.8 1.7 6.5 5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}

function renderTechnicianTab(
  tab: TechnicianDetailTab,
  detail: BackofficeTechnicianDetailPayload,
  editContent: ReactNode | undefined,
  localization: FormalLocalization,
  workStatusTarget: WorkStatusTarget
) {
  if (tab === "基础资料") {
    return (
      <>
        <FormalSectionCard caption="只展示正式技师档案与账号合同中已有的字段。" localization={localization} title="身份与基础资料">
          <DetailGrid items={localizeDetailItems([
            { label: "档案状态", value: technicianStatusLabel(detail.status, localization) },
            { label: "联系邮箱", value: detail.email },
            { label: "服务城市", value: detail.city },
            { label: "服务范围", value: detail.serviceArea ?? localization.t("未设置") },
            { label: "从业年限", value: formatCountWithUnit(detail.yearsExperience, "年", localization) },
            { label: "所属店铺", value: detail.shopName ?? localization.t("未绑定店铺") },
            { label: "验证时间", value: formatDateTime(detail.verifiedAt, localization) },
            { label: "档案更新时间", value: formatDateTime(detail.updatedAt, localization) }
          ], localization)} />
          <div className="mt-4 rounded-lg border border-line bg-paper p-4">
            <p className="text-xs font-black text-ink/45">{localization.t("个人简介")}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6 text-ink">{detail.bio ?? localization.t("未填写")}</p>
          </div>
        </FormalSectionCard>
        {editContent ? <FormalSectionCard localization={localization} title="资料编辑">{editContent}</FormalSectionCard> : null}
      </>
    );
  }

  if (tab === "状态与数据") {
    return (
      <>
        <FormalSectionCard caption="预约、营收与排班分钟数均来自正式详情合同。" localization={localization} title="业务状态与正式指标">
          <MetricGrid items={[
            { id: "booking-count", label: localization.t("预约总数"), value: formatInteger(detail.statistics.bookingCount, localization) },
            { id: "completed-count", label: localization.t("已完成"), value: formatInteger(detail.statistics.completedCount, localization) },
            { id: "cancelled-count", label: localization.t("已取消"), value: formatInteger(detail.statistics.cancelledCount, localization) },
            { id: "completed-revenue", label: localization.t("已完成服务收入"), value: formatMoney(detail.statistics.completedRevenueJpy, "JPY", localization) },
            { id: "today-schedule", label: localization.t("今日排班"), value: formatFormalScheduleMinutes(detail.statistics.todayScheduleMinutes, localization.language) },
            { id: "week-schedule", label: localization.t("本周排班"), value: formatFormalScheduleMinutes(detail.statistics.weekScheduleMinutes, localization.language) },
            { id: "month-schedule", label: localization.t("本月排班"), value: formatFormalScheduleMinutes(detail.statistics.monthScheduleMinutes, localization.language) }
          ]}><div className="min-w-0"><WorkStatusMetrics target={workStatusTarget} /></div></MetricGrid>
        </FormalSectionCard>
        <ReviewSummaryCard localization={localization} review={detail.reviewSummary} />
        <UnavailableCard localization={localization} title="接单率" />

      </>
    );
  }

  if (tab === "技能与服务") {
    const truncatedMessage = localization
      .t("仅显示前 {count} 项，请到服务管理查看全部")
      .replace("{count}", formatInteger(detail.servicesLimit, localization));

    return (
      <FormalSectionCard caption={localization.t("以下项目来自正式服务合同。") } localization={localization} title="正式启用服务">
        {detail.services.length > 0
          ? <TechnicianServiceList localization={localization} services={detail.services} />
          : <UnavailableState localization={localization} />}
        {detail.servicesTruncated ? (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black leading-5 text-amber-800">
            {truncatedMessage}
          </p>
        ) : null}
      </FormalSectionCard>
    );
  }

  if (tab === "排班偏好") {
    return (
      <>
        <UnavailableCard localization={localization} title="排班偏好" />
        <FormalSectionCard caption="以下时段直接来自正式排班库存。" localization={localization} title="近期正式排班">
          {detail.upcomingSchedule.length > 0
            ? <ScheduleList localization={localization} slots={detail.upcomingSchedule} />
            : <EmptyRecord label="当前没有近期正式排班" localization={localization} />}
        </FormalSectionCard>
      </>
    );
  }

  if (tab === "薪酬设置") {
    return detail.compensationProfile
      ? <CompensationCard localization={localization} profile={detail.compensationProfile} />
      : <UnavailableCard localization={localization} title="薪酬设置" />;
  }

  if (tab === "权限与账号") {
    return <AccountAccessCards account={detail.account} localization={localization} />;
  }

  return <WorkTimeline target={workStatusTarget} />;
}

function renderCustomerTab(
  tab: CustomerDetailTab,
  detail: BackofficeCustomerDetailPayload,
  editContent: ReactNode | undefined,
  membershipEditContent: ReactNode | undefined,
  localization: FormalLocalization,
  timelineContent?: ReactNode,
) {
  if (tab === "基础资料") {
    return (
      <>
        <FormalSectionCard caption="只展示正式用户资料合同中已有的字段。" localization={localization} title="基础资料">
          <DetailGrid items={localizeDetailItems([
            { label: "联系邮箱", value: detail.email },
            { label: "所在城市", value: detail.city ?? localization.t("未设置") },
            { label: "资料可见性", value: localization.t(detail.isPublic ? "公开" : "非公开") },
            { label: "正式预约总数", value: formatInteger(detail.bookingCount, localization) },
            { label: "档案创建时间", value: formatDateTime(detail.createdAt, localization) },
            { label: "档案更新时间", value: formatDateTime(detail.updatedAt, localization) }
          ], localization)} />
          <div className="mt-4 rounded-lg border border-line bg-paper p-4">
            <p className="text-xs font-black text-ink/45">{localization.t("用户简介")}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6 text-ink">{detail.bio ?? localization.t("未填写")}</p>
          </div>
        </FormalSectionCard>
        {editContent ? <FormalSectionCard localization={localization} title="资料编辑">{editContent}</FormalSectionCard> : null}
      </>
    );
  }

  if (tab === "会员等级") {
    return (
      <>
        <FormalSectionCard
          caption="会员等级以正式用户资料中的当前有效状态为准。"
          localization={localization}
          title="会员等级"
        >
          <DetailGrid
            items={localizeDetailItems(
              [
                { label: "当前会员等级", value: membershipLabel(detail.membershipLevel, localization) },
                {
                  label: "获得方式",
                  value: detail.membershipGrantMode === "operator_complimentary"
                    ? "运营免费赋予"
                    : "用户自行开通"
                },
                {
                  label: "免费期限",
                  value: detail.membershipDurationUnit === "forever"
                    ? "永久免费"
                    : detail.membershipDurationUnit && detail.membershipDurationValue
                      ? `${formatInteger(detail.membershipDurationValue, localization)}${localization.t(detail.membershipDurationUnit === "day" ? "天" : "个月")}`
                      : "不适用"
                },
                {
                  label: "生效时间",
                  value: detail.membershipStartsAt
                    ? formatDateTime(detail.membershipStartsAt, localization)
                    : "未记录"
                },
                {
                  label: "到期时间",
                  value: detail.membershipExpiresAt
                    ? formatDateTime(detail.membershipExpiresAt, localization)
                    : detail.membershipDurationUnit === "forever" ? "永久有效" : "未记录"
                },
                {
                  label: "赋予人员",
                  value: detail.membershipGrantedBy
                    ? `${detail.membershipGrantedBy.username} · NeeDoID ${detail.membershipGrantedBy.needoId}`
                    : "系统或用户"
                }
              ],
              localization,
            )}
          />
        </FormalSectionCard>
        {membershipEditContent ? (
          <FormalSectionCard
            caption="此操作只记录会员权益，不会触发扣款或自动续费。"
            localization={localization}
            title="运营赋予会员等级"
          >
            {membershipEditContent}
          </FormalSectionCard>
        ) : null}
      </>
    );
  }

  if (tab === "预约与消费") {
    const statusMetrics: MetricItem[] = Object.entries(detail.bookingStatusTotals).map(([status, total]) => ({
      id: `booking-status-${status}`,
      label: bookingStatusLabel(status, localization),
      value: formatInteger(total, localization)
    }));

    return (
      <>
        <FormalSectionCard caption="消费额仅统计正式合同返回的已完成预约。" localization={localization} title="预约与消费汇总">
          <MetricGrid items={[
            { id: "booking-total", label: localization.t("累计预约"), value: formatInteger(detail.bookingCount, localization) },
            { id: "completed-spend", label: localization.t("已完成消费"), value: formatMoney(detail.completedSpendJpy, "JPY", localization) },
            ...statusMetrics
          ]} />
        </FormalSectionCard>
        <FormalSectionCard localization={localization} title="下次预约">
          {detail.nextBooking
            ? <BookingRow booking={detail.nextBooking} localization={localization} />
            : <UnavailableState label="暂无下次预约" localization={localization} />}
        </FormalSectionCard>
        <FormalSectionCard localization={localization} title="近期预约">
          {detail.recentBookings.length > 0 ? (
            <div className="grid gap-2">
              {detail.recentBookings.map((booking) => <BookingRow booking={booking} key={booking.id} localization={localization} />)}
            </div>
          ) : <UnavailableState label="暂无近期预约" localization={localization} />}
        </FormalSectionCard>
        <ReviewSummaryCard localization={localization} review={detail.reviewSummary} />
      </>
    );
  }

  if (tab === "评价") {
    return <ReviewSummaryCard localization={localization} review={detail.reviewSummary} />;
  }

  if (tab === "权限与账号") {
    return <AccountAccessCards account={detail.account} localization={localization} />;
  }

  return timelineContent ?? <AuditTimeline events={detail.timeline} localization={localization} />;
}

function CustomerTimelinePanel({
  detail,
  error,
  loading,
  onPageChange,
  onPageSizeChange,
  onRetry,
  timeline,
}: {
  detail: BackofficeCustomerDetailPayload;
  error: string;
  loading: boolean;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: FormalTimelinePageSize) => void;
  onRetry?: () => void;
  timeline?: BackofficeCustomerTimelinePayload | null;
}) {
  const localization = useFormalLocalization();
  if (loading && !timeline) {
    return (
      <div className="rounded-[18px] border border-line bg-white p-6 text-sm font-black text-ink/50">
        {localization.t("正在读取用户LOG...")}
      </div>
    );
  }

  if (error && !timeline) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-coral/35 bg-coral/10 p-4 text-sm font-black text-[#9b3f35]">
        <span>{error}</span>
        {onRetry ? (
          <button
            className="focus-ring rounded-full border border-current/25 px-3 py-1.5 text-xs font-black"
            onClick={onRetry}
            type="button"
          >
            {localization.t("重试")}
          </button>
        ) : null}
      </div>
    );
  }

  const events = timeline?.list ?? detail.timeline;
  return (
    <div>
      <AuditTimeline events={events} localization={localization} title="用户LOG" />
      {timeline && onPageChange && onPageSizeChange ? (
        <FormalTimelinePagination
          ariaLabel="用户LOG翻页"
          disabled={loading}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          page={timeline.page}
          pageSize={timeline.page_size}
          total={timeline.total}
        />
      ) : null}
      {error ? <p className="mt-3 text-xs font-black text-coral">{error}</p> : null}
    </div>
  );
}

function FormalSectionCard({
  caption,
  children,
  localization,
  title
}: {
  caption?: string;
  children: ReactNode;
  localization: FormalLocalization;
  title: string;
}) {
  return (
    <section className="min-w-0 rounded-[18px] border border-line bg-white p-4 shadow-[0_8px_24px_rgba(22,23,26,0.05)] sm:p-5">
      <div className="mb-4 border-l-[3px] border-moss pl-3">
        <h3 className="text-base font-black tracking-tight text-ink">{localization.t(title)}</h3>
        {caption ? <p className="mt-1 text-xs font-bold leading-5 text-ink/50">{localization.t(caption)}</p> : null}
      </div>
      {children}
    </section>
  );
}

function MetricGrid({ items, children }: { items: MetricItem[]; children?: ReactNode }) {
  return (
    <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {items.map((item) => (
        <div className="min-w-0 rounded-lg border border-line bg-paper px-3 py-3" key={item.id}>
          <dt className="text-[11px] font-black text-ink/45">{item.label}</dt>
          <dd className="mt-1 break-words text-lg font-black tracking-tight text-ink tabular-nums">{item.value}</dd>
        </div>
      ))}
      {children}
    </dl>
  );
}

function UnavailableCard({ localization, title }: { localization: FormalLocalization; title: string }) {
  return (
    <FormalSectionCard localization={localization} title={title}>
      <UnavailableState localization={localization} />
    </FormalSectionCard>
  );
}

function UnavailableState({
  label = "尚未接入正式数据",
  localization,
}: {
  label?: string;
  localization: FormalLocalization;
}) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-paper px-4 py-6 text-center">
      <p className="text-sm font-black text-ink/55">{localization.t(label)}</p>
    </div>
  );
}

function EmptyRecord({ label, localization }: { label: string; localization: FormalLocalization }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-paper px-4 py-6 text-center text-sm font-black text-ink/55">
      {localization.t(label)}
    </div>
  );
}

function ReviewSummaryCard({ localization, review }: { localization: FormalLocalization; review: BackofficeReviewSummaryPayload | null }) {
  return (
    <FormalSectionCard localization={localization} title="正式评价摘要">
      {review ? (
        <div className="grid gap-4 lg:grid-cols-[180px,minmax(0,1fr)]">
          <div className="rounded-lg bg-ink p-4 text-white">
            <p className="text-xs font-black text-white/55">{localization.t("综合评分")}</p>
            <strong className="mt-2 block text-3xl font-black tabular-nums">{formatDecimal(review.ratingAverage, localization)}</strong>
            <p className="mt-1 text-xs font-bold text-white/65">{formatInteger(review.reviewCount, localization)} {localization.t("条正式评价")}</p>
          </div>
          <div className="min-w-0 rounded-lg border border-line bg-paper p-4">
            <p className="text-xs font-black text-ink/45">{localization.t("评价亮点")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {review.highlights.length > 0
                ? review.highlights.map((highlight, index) => <Badge key={`${highlight}-${index}`} tone="green">{highlight}</Badge>)
                : <span className="text-sm font-bold text-ink/55">{localization.t("暂无正式亮点记录")}</span>}
            </div>
            <p className="mt-3 text-xs font-bold text-ink/45">{localization.t("最近评价")}：{formatDateTime(review.latestReviewAt, localization)}</p>
          </div>
        </div>
      ) : <UnavailableState label="暂无评价" localization={localization} />}
    </FormalSectionCard>
  );
}

function TechnicianServiceList({ localization, services }: { localization: FormalLocalization; services: BackofficeTechnicianServiceDetailPayload[] }) {
  return (
    <div className="grid gap-2">
      {services.map((service) => (
        <article className="grid min-w-0 gap-3 rounded-lg border border-line bg-paper p-4 md:grid-cols-[minmax(0,1fr),auto] md:items-center" key={`${service.source}-${service.id}`}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="break-words text-sm font-black text-ink">{service.name}</h4>
              {service.isRecommended ? <Badge tone="yellow">{localization.t("推荐")}</Badge> : null}
              <Badge tone="neutral">{localization.t(service.source === "technician_service" ? "技师服务" : "店铺服务")}</Badge>
            </div>
            <p className="mt-1 text-xs font-bold leading-5 text-ink/50">{service.description ?? localization.t("未填写服务说明")}</p>
          </div>
          <div className="shrink-0 text-left md:text-right">
            <strong className="block text-base font-black text-ink tabular-nums">{formatMoney(service.priceAmount, service.currency, localization)}</strong>
            <span className="mt-1 block text-xs font-bold text-ink/45">{formatCountWithUnit(service.durationMinutes, "分钟", localization)}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function ScheduleList({ localization, slots }: { localization: FormalLocalization; slots: BackofficeScheduleSlotPayload[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[680px] border-collapse text-left text-sm">
        <thead className="bg-paper text-xs font-black text-ink/50">
          <tr>{["开始", "服务", "店铺", "容量", "状态"].map((label) => <th className="px-4 py-3" key={label}>{localization.t(label)}</th>)}</tr>
        </thead>
        <tbody>
          {slots.map((slot) => {
            const status = scheduleStatus(slot.status, localization);
            return (
              <tr className="border-t border-line bg-white" key={slot.id}>
                <td className="px-4 py-3 font-bold text-ink"><span className="block">{formatDateTime(slot.startsAt, localization)}</span><span className="mt-1 block text-xs text-ink/45">{localization.t("至")} {formatDateTime(slot.endsAt, localization)}</span></td>
                <td className="px-4 py-3 font-black text-ink">{slot.serviceName}</td>
                <td className="px-4 py-3 font-bold text-ink/65">{slot.shopName}</td>
                <td className="px-4 py-3 font-black text-ink tabular-nums">{formatInteger(slot.bookedCount, localization)}/{formatInteger(slot.capacity, localization)}</td>
                <td className="px-4 py-3"><Badge tone={status.tone}>{status.label}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CompensationCard({ localization, profile }: { localization: FormalLocalization; profile: BackofficeCompensationProfilePayload }) {
  const caption = `${localization.t("版本")} ${formatInteger(profile.version, localization)} · ${compensationStatusLabel(profile.status, localization)}`;
  return (
    <FormalSectionCard caption={caption} localization={{ ...localization, t: (value) => value }} title={localization.t("薪酬设置")}>
      <DetailGrid items={localizeDetailItems([
        { label: "方案名称", value: profile.name },
        { label: "计薪模式", value: compensationModeLabel(profile.wageMode, localization) },
        { label: "基础月薪", value: formatMoney(profile.baseSalaryJpy, "JPY", localization) },
        { label: "时薪", value: formatMoney(profile.hourlyRateJpy, "JPY", localization) },
        { label: "日薪", value: formatMoney(profile.dailyRateJpy, "JPY", localization) },
        { label: "固定单次报酬", value: formatMoney(profile.fixedOrderPayJpy, "JPY", localization) },
        { label: "提成比例", value: `${formatDecimal(profile.commissionRatePercent, localization)}%` },
        { label: "保障最低额", value: formatMoney(profile.guaranteedMinimumJpy, "JPY", localization) },
        { label: "NDP 费用承担方", value: profile.ndpFeeBearer },
        { label: "技师 NDP 分成", value: `${formatDecimal(profile.technicianNdpSharePercent, localization)}%` },
        { label: "生效时间", value: `${formatDateTime(profile.effectiveFrom, localization)} — ${formatDateTime(profile.effectiveTo, localization)}` },
        { label: "更新时间", value: formatDateTime(profile.updatedAt, localization) }
      ], localization)} />
    </FormalSectionCard>
  );
}

function AccountAccessCards({ account, localization }: { account: BackofficeAccountPayload; localization: FormalLocalization }) {
  return (
    <>
      <FormalSectionCard localization={localization} title="账号状态">
        <DetailGrid items={localizeDetailItems([
          { label: "用户名", value: account.username },
          { label: "邮箱", value: account.email },
          { label: "手机号", value: account.phone ?? localization.t("未设置") },
          { label: "账号状态", value: localization.t(account.isActive ? "启用" : "停用") },
          { label: "最近登录", value: formatDateTime(account.lastLoginAt, localization) }
        ], localization)} />
      </FormalSectionCard>
      <FormalSectionCard caption="角色作用域来自正式 RBAC 合同。" localization={localization} title="角色">
        <RoleList localization={localization} roles={account.roles} />
      </FormalSectionCard>
      <FormalSectionCard caption="身份及作用域来自正式 User Identity 合同。" localization={localization} title="身份">
        <IdentityList identities={account.identities} localization={localization} />
      </FormalSectionCard>
    </>
  );
}

function RoleList({ localization, roles }: { localization: FormalLocalization; roles: BackofficeRolePayload[] }) {
  if (roles.length === 0) return <EmptyRecord label="当前没有正式角色记录" localization={localization} />;
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {roles.map((role, index) => (
        <article className="rounded-lg border border-line bg-paper p-4" key={`${role.code}-${role.scopeType}-${role.scopeId}-${index}`}>
          <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-black text-ink">{role.name}</h4><Badge tone="dark">{role.code}</Badge></div>
          <p className="mt-2 text-xs font-bold text-ink/50">{scopeLabel(role.scopeType, role.scopeId, localization)}</p>
        </article>
      ))}
    </div>
  );
}

function IdentityList({ identities, localization }: { identities: BackofficeIdentityPayload[]; localization: FormalLocalization }) {
  if (identities.length === 0) return <EmptyRecord label="当前没有正式身份记录" localization={localization} />;
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {identities.map((identity, index) => (
        <article className="rounded-lg border border-line bg-paper p-4" key={`${identity.type}-${identity.scopeType}-${identity.scopeId}-${index}`}>
          <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-black text-ink">{identity.displayName ?? identityTypeLabel(identity.type, localization)}</h4><Badge tone="blue">{identityTypeLabel(identity.type, localization)}</Badge></div>
          <p className="mt-2 text-xs font-bold text-ink/50">{scopeLabel(identity.scopeType, identity.scopeId, localization)}</p>
        </article>
      ))}
    </div>
  );
}

function BookingRow({ booking, localization }: { booking: BackofficeOrderPayload; localization: FormalLocalization }) {
  return (
    <article className="grid min-w-0 gap-3 rounded-lg border border-line bg-paper p-4 lg:grid-cols-[minmax(0,1fr),auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><h4 className="break-words text-sm font-black text-ink">{booking.serviceName}</h4><Badge tone={bookingStatusTone(booking.status)}>{bookingStatusLabel(booking.status, localization)}</Badge><Badge tone={paymentStatusTone(booking.paymentStatus)}>{paymentStatusLabel(booking.paymentStatus, localization)}</Badge></div>
        <p className="mt-2 text-xs font-bold leading-5 text-ink/50">{booking.orderNo} · {booking.shopName} · {formatDateTime(booking.startsAt, localization)}</p>
      </div>
      <strong className="shrink-0 text-base font-black text-ink tabular-nums">{formatMoney(booking.priceAmount, booking.currency, localization)}</strong>
    </article>
  );
}

export function AuditTimeline({ events, localization, title = "正式审计时间线" }: { events: BackofficeAuditEventPayload[]; localization: FormalLocalization; title?: string }) {
  return (
    <AdminEventTimeline
      className="rounded-[18px]"
      emptyLabel={localization.t("暂无正式审计记录")}
      events={events.map((event) => mapAuditEvent(event, localization))}
      showCommentComposer={false}
      title={localization.t(title)}
    />
  );
}

function formatAuditTimestamp(value: string, localization: FormalLocalization) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${new Intl.DateTimeFormat(localization.locale, { dateStyle: "medium" }).format(date)}\n${new Intl.DateTimeFormat(localization.locale, { timeStyle: "medium" }).format(date)}`;
}

function mapAuditEvent(event: BackofficeAuditEventPayload, localization: FormalLocalization): ContactEventTimelineEntry {
  const action = auditAction(event.action, localization);
  return {
    actorAvatarSrc: event.actorAvatarUrl ?? undefined,
    actorName: event.actorName,
    actorRole: action.label,
    atLabel: formatAuditTimestamp(event.createdAt, localization),
    icon: event.actorAvatarUrl ? undefined : <NeutralProfileIcon />,
    id: event.id,
    message: (
      <AuditMetadata
        fallback={auditActionMessage(event.action, localization)}
        metadata={event.metadata}
        localization={localization}
      />
    ),
    preserveAtLabel: true,
    title: action.label,
    tone: action.tone
  };
}

function AuditMetadata({
  fallback,
  metadata,
  localization,
}: {
  fallback: string | null;
  metadata: Record<string, unknown> | null;
  localization: FormalLocalization;
}) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return <span>{fallback ?? localization.t("尚未接入正式数据")}</span>;
  }

  const message = typeof metadata.message === "string" && metadata.message.trim() ? metadata.message : null;
  const entries = visibleAuditMetadataEntries(metadata);
  return (
    <span className="grid gap-2">
      {message ? <span>{message}</span> : null}
      {entries.length > 0 ? (
        <span className="audit-event-metadata grid gap-1.5 rounded-lg px-2.5 py-2 text-[11px] leading-4">
          {entries.map(([key, value]) => (
            <span className="grid grid-cols-[minmax(72px,auto),minmax(0,1fr)] gap-2" key={key}>
              <strong>{auditMetadataLabel(key, localization)}</strong>
              <span className="min-w-0 break-words">{renderAuditMetadataValue(value, localization)}</span>
            </span>
          ))}
        </span>
      ) : null}
      {!message && entries.length === 0 ? <span>{fallback ?? localization.t("尚未接入正式数据")}</span> : null}
    </span>
  );
}

function auditActionMessage(action: string, localization: FormalLocalization) {
  const messages: Record<string, string> = {
    "customer.created": "用户档案已创建",
    "profile.created": "用户档案已创建",
    "customer.profile.updated": "用户基础资料已更新",
    "backoffice.customer.update": "用户基础资料已更新",
    "customer.deleted": "用户档案已停用",
    "backoffice.customer.delete": "用户档案已停用",
  };
  return messages[action] ? localization.t(messages[action]) : null;
}

function renderAuditMetadataValue(value: unknown, localization: FormalLocalization): ReactNode {
  if (typeof value === "string") return value.trim() ? value : localization.t("尚未接入正式数据");
  if (typeof value === "number") return new Intl.NumberFormat(localization.locale).format(value);
  if (typeof value === "boolean") return localization.t(value ? "是" : "否");
  if (value === null || value === undefined) return localization.t("尚未接入正式数据");
  if (Array.isArray(value)) {
    if (value.length === 0) return localization.t("尚未接入正式数据");
    return <span>{value.map((item, index) => <span key={index}>{index > 0 ? " · " : null}{renderAuditMetadataValue(item, localization)}</span>)}</span>;
  }
  if (typeof value === "object") {
    const entries = visibleAuditMetadataEntries(value as Record<string, unknown>);
    if (entries.length === 0) return localization.t("尚未接入正式数据");
    return (
      <span className="grid gap-1">
        {entries.map(([key, nestedValue]) => (
          <span key={key}><strong>{key}:</strong> {renderAuditMetadataValue(nestedValue, localization)}</span>
        ))}
      </span>
    );
  }
  return localization.t("尚未接入正式数据");
}

function localizeDetailItems(items: Array<{ label: string; value: ReactNode }>, localization: FormalLocalization) {
  return items.map((item) => ({ ...item, label: localization.t(item.label) }));
}

function formatDateTime(value: string | null, localization: FormalLocalization) {
  if (!value) return localization.t("未记录");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localization.locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatInteger(value: number, localization: FormalLocalization) {
  return new Intl.NumberFormat(localization.locale, { maximumFractionDigits: 0 }).format(value);
}

function formatDecimal(value: number, localization: FormalLocalization) {
  return new Intl.NumberFormat(localization.locale, { maximumFractionDigits: 2 }).format(value);
}

function formatMoney(value: number, currency: string, localization: FormalLocalization) {
  const amount = new Intl.NumberFormat(localization.locale, { maximumFractionDigits: currency === "JPY" ? 0 : 2 }).format(value);
  return currency === "JPY" ? `¥${amount}` : `${currency} ${amount}`;
}

function formatCountWithUnit(value: number, unit: string, localization: FormalLocalization) {
  const separator = localization.language === "en" ? " " : "";
  return `${formatInteger(value, localization)}${separator}${localization.t(unit)}`;
}

function technicianStatusLabel(status: string, localization: FormalLocalization) {
  const labels: Record<string, string> = { draft: "草稿", pending_review: "待审核", published: "已发布", paused: "已暂停", rejected: "未通过" };
  return labels[status] ? localization.t(labels[status]) : status;
}

function technicianStatusTone(status: string): BadgeTone {
  if (status === "published") return "green";
  if (status === "rejected") return "red";
  if (status === "pending_review") return "yellow";
  return "neutral";
}

function membershipLabel(level: string, localization: FormalLocalization) {
  const labels: Record<string, string> = { standard: "标准会员", premium: "Premium", vip: "VIP", black: "Black" };
  return labels[level.toLowerCase()] ? localization.t(labels[level.toLowerCase()]) : level;
}

function bookingStatusLabel(status: string, localization: FormalLocalization) {
  const labels: Record<string, string> = { pending: "待确认", confirmed: "已确认", in_service: "服务中", inService: "服务中", completed: "已完成", cancelled: "已取消" };
  return labels[status] ? localization.t(labels[status]) : status;
}

function bookingStatusTone(status: string): BadgeTone {
  if (status === "completed") return "green";
  if (status === "cancelled") return "red";
  if (status === "in_service" || status === "inService") return "blue";
  return "yellow";
}

function paymentStatusLabel(status: BackofficeOrderPayload["paymentStatus"], localization: FormalLocalization) {
  return localization.t({ pending: "待确认收款", confirmed: "已确认收款", refundPending: "待退款", refunded: "已退款" }[status]);
}

function paymentStatusTone(status: BackofficeOrderPayload["paymentStatus"]): BadgeTone {
  if (status === "confirmed") return "green";
  if (status === "refundPending") return "yellow";
  if (status === "refunded") return "neutral";
  return "red";
}

function scheduleStatus(status: string, localization: FormalLocalization): { label: string; tone: BadgeTone } {
  if (status === "available") return { label: localization.t("可预约"), tone: "green" };
  if (status === "booked") return { label: localization.t("已预约"), tone: "blue" };
  if (status === "blocked") return { label: localization.t("已阻塞"), tone: "red" };
  return { label: status, tone: "neutral" };
}

function compensationModeLabel(mode: string, localization: FormalLocalization) {
  const labels: Record<string, string> = { monthly: "月薪", hourly: "时薪", daily: "日薪", fixed_order: "按单固定", commission: "提成", hybrid: "混合" };
  return labels[mode] ? localization.t(labels[mode]) : mode;
}

function compensationStatusLabel(status: string, localization: FormalLocalization) {
  const labels: Record<string, string> = { draft: "草稿", active: "生效中", archived: "已归档" };
  return labels[status] ? localization.t(labels[status]) : status;
}

function scopeLabel(scopeType: string | null, scopeId: number | null, localization: FormalLocalization) {
  if (!scopeType || scopeType === "global") return localization.t("全局作用域");
  return scopeId === null ? scopeType : `${scopeType} #${String(scopeId)}`;
}

function identityTypeLabel(type: string, localization: FormalLocalization) {
  const labels: Record<string, string> = { platform: "平台身份", customer: "用户身份", technician: "技师身份", merchant: "商户身份", merchant_owner: "店铺负责人", merchant_staff: "店铺员工", broker: "经纪人", scout: "介绍人" };
  return labels[type] ? localization.t(labels[type]) : type;
}

function auditAction(action: string, localization: FormalLocalization): { label: string; tone: ContactEventTimelineEntry["tone"] } {
  const labels: Record<string, string> = {
    "technician.created": "技师档案创建",
    "technician.approved": "技师审核通过",
    "technician.profile.updated": "技师资料更新",
    "technician.deleted": "技师软删除",
    "customer.created": "用户档案创建",
    "profile.created": "用户档案创建",
    "customer.profile.updated": "用户资料更新",
    "backoffice.customer.update": "用户资料更新",
    "backoffice.customer.membership.assign": "会员等级变更",
    "customer.deleted": "用户软删除",
    "backoffice.customer.delete": "用户软删除"
  };
  const danger = /deleted|disabled|rejected|cancelled|failed/i.test(action);
  return {
    label: labels[action] ? localization.t(labels[action]) : action,
    tone: danger ? "red" : "green"
  };
}

function auditMetadataLabel(key: string, localization: FormalLocalization) {
  const labels: Record<string, string> = {
    reason: "原因",
    changedFields: "变更字段",
    approved: "已批准",
    source: "来源",
    membershipLevel: "会员等级",
    grantMode: "赋予方式",
    durationUnit: "免费期限单位",
    durationValue: "免费期限",
    startsAt: "生效时间",
    expiresAt: "到期时间"
  };
  return labels[key] ? localization.t(labels[key]) : key;
}

function visibleAuditMetadataEntries(metadata: Record<string, unknown>) {
  return Object.entries(metadata).filter(([key]) => {
    if (key === "message") return false;
    const normalized = key.toLowerCase();
    if (normalized === "needoid" || normalized === "publicid") return true;
    return normalized !== "id" && !normalized.endsWith("id");
  });
}
