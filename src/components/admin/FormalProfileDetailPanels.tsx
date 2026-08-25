import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from "react";
import type {
  BackofficeAuditEventPayload,
  BackofficeCompensationProfilePayload,
  BackofficeCustomerDetailPayload,
  BackofficeIdentityPayload,
  BackofficeOrderPayload,
  BackofficeReviewSummaryPayload,
  BackofficeRolePayload,
  BackofficeScheduleSlotPayload,
  BackofficeTechnicianDetailPayload,
  BackofficeTechnicianServiceDetailPayload
} from "../../api/backofficeRealData";
import { cn } from "../../lib/utils";
import {
  ContactEventTimelinePanel,
  type ContactEventTimelineEntry
} from "../mobile/ContactEventTimeline";
import { Badge, type BadgeTone } from "../ui/Badge";
import { DetailGrid } from "./DetailGrid";

type TechnicianDetailTab =
  | "基础资料"
  | "状态与数据"
  | "技能与服务"
  | "排班偏好"
  | "薪酬设置"
  | "权限与账号"
  | "时间线";

type CustomerDetailTab = "基础资料" | "预约与消费" | "权限与账号" | "时间线";

const technicianTabs: TechnicianDetailTab[] = [
  "基础资料",
  "状态与数据",
  "技能与服务",
  "排班偏好",
  "薪酬设置",
  "权限与账号",
  "时间线"
];

const customerTabs: CustomerDetailTab[] = ["基础资料", "预约与消费", "权限与账号", "时间线"];

const unavailableMetricLabels: Record<BackofficeTechnicianDetailPayload["unavailableMetrics"][number], string> = {
  acceptanceRate: "接单率",
  lateness: "迟到情况",
  shiftPreferences: "排班偏好"
};

export function FormalTechnicianDetailPanel({
  actionContent,
  detail,
  editContent,
  initialTab = "基础资料"
}: {
  actionContent?: ReactNode;
  detail: BackofficeTechnicianDetailPayload;
  editContent?: ReactNode;
  initialTab?: TechnicianDetailTab;
}) {
  const [activeTab, setActiveTab] = useState<TechnicianDetailTab>(initialTab);
  const panelId = useId();

  return (
    <article className="min-w-0 overflow-hidden rounded-[22px] border border-line bg-paper shadow-panel">
      <FormalIdentityHeader
        accountActive={detail.account.isActive}
        accountId={detail.userId}
        actionContent={actionContent}
        avatarUrl={detail.account.avatarUrl}
        badges={[
          { label: technicianStatusLabel(detail.status), tone: technicianStatusTone(detail.status) },
          ...(detail.verifiedAt ? [{ label: "已验证", tone: "green" as const }] : []),
          ...(detail.isRecommended ? [{ label: "推荐技师", tone: "yellow" as const }] : [])
        ]}
        city={detail.city}
        displayName={detail.displayName}
        entityLabel="技师档案"
        profileId={detail.id}
        rating={detail.reviewSummary}
        shopLabel={detail.shopName ?? "未绑定店铺"}
      />

      <div className="border-b border-line bg-white px-4 py-3 sm:px-5">
        <FormalTabs
          active={activeTab}
          idPrefix={panelId}
          items={technicianTabs}
          onChange={setActiveTab}
        />
      </div>

      <div
        aria-labelledby={`${panelId}-tab-${technicianTabs.indexOf(activeTab)}`}
        className="grid min-w-0 gap-4 p-4 sm:p-5"
        id={`${panelId}-panel-${technicianTabs.indexOf(activeTab)}`}
        role="tabpanel"
        tabIndex={0}
      >
        {renderTechnicianTab(activeTab, detail, editContent)}
      </div>
    </article>
  );
}

export function FormalCustomerDetailPanel({
  actionContent,
  detail,
  editContent,
  initialTab = "基础资料"
}: {
  actionContent?: ReactNode;
  detail: BackofficeCustomerDetailPayload;
  editContent?: ReactNode;
  initialTab?: CustomerDetailTab;
}) {
  const [activeTab, setActiveTab] = useState<CustomerDetailTab>(initialTab);
  const panelId = useId();

  return (
    <article className="min-w-0 overflow-hidden rounded-[22px] border border-line bg-paper shadow-panel">
      <FormalIdentityHeader
        accountActive={detail.account.isActive}
        accountId={detail.userId}
        actionContent={actionContent}
        avatarUrl={detail.account.avatarUrl}
        badges={[
          { label: detail.account.isActive ? "账号启用" : "账号停用", tone: detail.account.isActive ? "green" : "red" },
          { label: membershipLabel(detail.membershipLevel), tone: "yellow" },
          { label: detail.isPublic ? "资料公开" : "资料非公开", tone: detail.isPublic ? "blue" : "neutral" }
        ]}
        city={detail.city ?? "城市未设置"}
        displayName={detail.displayName}
        entityLabel="客户档案"
        profileId={detail.id}
        rating={detail.reviewSummary}
        shopLabel="平台客户"
      />

      <div className="border-b border-line bg-white px-4 py-3 sm:px-5">
        <FormalTabs
          active={activeTab}
          idPrefix={panelId}
          items={customerTabs}
          onChange={setActiveTab}
        />
      </div>

      <div
        aria-labelledby={`${panelId}-tab-${customerTabs.indexOf(activeTab)}`}
        className="grid min-w-0 gap-4 p-4 sm:p-5"
        id={`${panelId}-panel-${customerTabs.indexOf(activeTab)}`}
        role="tabpanel"
        tabIndex={0}
      >
        {renderCustomerTab(activeTab, detail, editContent)}
      </div>
    </article>
  );
}

function FormalTabs<TTab extends string>({
  active,
  idPrefix,
  items,
  onChange
}: {
  active: TTab;
  idPrefix: string;
  items: TTab[];
  onChange: (tab: TTab) => void;
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const changeByKeyboard = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % items.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + items.length) % items.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = items.length - 1;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    onChange(items[nextIndex]);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      aria-label="详情分类"
      className="scrollbar-none flex max-w-full gap-2 overflow-x-auto pb-0.5"
      role="tablist"
    >
      {items.map((item, index) => {
        const selected = item === active;

        return (
          <button
            aria-controls={`${idPrefix}-panel-${index}`}
            aria-selected={selected}
            className={cn(
              "focus-ring h-9 shrink-0 rounded-lg border px-3 text-sm font-black transition",
              selected
                ? "border-ink bg-ink text-white shadow-[inset_0_-3px_0_#6e9b79]"
                : "border-line bg-paper text-ink/60 hover:border-moss hover:text-ink"
            )}
            id={`${idPrefix}-tab-${index}`}
            key={item}
            onClick={() => onChange(item)}
            onKeyDown={(event) => changeByKeyboard(event, index)}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            role="tab"
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}

function FormalIdentityHeader({
  accountActive,
  accountId,
  actionContent,
  avatarUrl,
  badges,
  city,
  displayName,
  entityLabel,
  profileId,
  rating,
  shopLabel
}: {
  accountActive: boolean;
  accountId: number;
  actionContent?: ReactNode;
  avatarUrl: string | null;
  badges: Array<{ label: string; tone: BadgeTone }>;
  city: string;
  displayName: string;
  entityLabel: string;
  profileId: number;
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
              <img alt={`${displayName}头像`} className="h-full w-full object-cover" src={avatarUrl} />
            ) : (
              <span aria-hidden="true">{displayName.slice(0, 1) || "N"}</span>
            )}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5">
              {badges.map((badge) => (
                <Badge className="border border-white/10" key={`${badge.label}-${badge.tone}`} tone={badge.tone}>
                  {badge.label}
                </Badge>
              ))}
            </div>
            <h2 className="mt-3 break-words text-2xl font-black tracking-[-0.025em] sm:text-3xl">{displayName}</h2>
            <p className="mt-2 break-words text-sm font-bold text-white/65">{shopLabel} · {city}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.08em] text-white/70">
              <span className="rounded-md border border-white/15 bg-black/15 px-2 py-1">{entityLabel} #{profileId}</span>
              <span className="rounded-md border border-white/15 bg-black/15 px-2 py-1">账号 #{accountId}</span>
              <span className="rounded-md border border-white/15 bg-black/15 px-2 py-1">{accountActive ? "Active" : "Inactive"}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 lg:justify-end">
          <div className="min-w-[150px] rounded-[16px] border border-white/15 bg-black/15 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/55">正式评价摘要</p>
            {rating ? (
              <p className="mt-1 text-lg font-black tabular-nums">★ {rating.ratingAverage.toFixed(1)} <span className="text-xs text-white/60">/ {rating.reviewCount} 条</span></p>
            ) : (
              <p className="mt-1 text-sm font-black text-white/75">尚未接入正式数据</p>
            )}
          </div>
          {actionContent ? <div className="flex flex-wrap gap-2">{actionContent}</div> : null}
        </div>
      </div>
    </header>
  );
}

function renderTechnicianTab(
  tab: TechnicianDetailTab,
  detail: BackofficeTechnicianDetailPayload,
  editContent?: ReactNode
) {
  if (tab === "基础资料") {
    return (
      <>
        <FormalSectionCard caption="只展示正式技师档案与账号合同中已有的字段。" title="身份与基础资料">
          <DetailGrid items={[
            { label: "档案状态", value: technicianStatusLabel(detail.status) },
            { label: "联系邮箱", value: detail.email },
            { label: "服务城市", value: detail.city },
            { label: "服务范围", value: detail.serviceArea ?? "未设置" },
            { label: "从业年限", value: `${detail.yearsExperience} 年` },
            { label: "所属店铺", value: detail.shopName ?? "未绑定店铺" },
            { label: "验证时间", value: formatDateTime(detail.verifiedAt) },
            { label: "档案更新时间", value: formatDateTime(detail.updatedAt) }
          ]} />
          <div className="mt-4 rounded-lg border border-line bg-paper p-4">
            <p className="text-xs font-black text-ink/45">个人简介</p>
            <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6 text-ink">{detail.bio ?? "未填写"}</p>
          </div>
        </FormalSectionCard>
        {editContent ? <FormalSectionCard title="资料编辑">{editContent}</FormalSectionCard> : null}
      </>
    );
  }

  if (tab === "状态与数据") {
    return (
      <>
        <FormalSectionCard caption="预约、营收与排班分钟数均来自正式详情合同。" title="业务状态与正式指标">
          <MetricGrid items={[
            { label: "预约总数", value: formatInteger(detail.statistics.bookingCount) },
            { label: "已完成", value: formatInteger(detail.statistics.completedCount) },
            { label: "已取消", value: formatInteger(detail.statistics.cancelledCount) },
            { label: "已完成服务收入", value: formatMoney(detail.statistics.completedRevenueJpy, "JPY") },
            { label: "今日排班", value: formatMinutes(detail.statistics.todayScheduleMinutes) },
            { label: "本周排班", value: formatMinutes(detail.statistics.weekScheduleMinutes) },
            { label: "本月排班", value: formatMinutes(detail.statistics.monthScheduleMinutes) }
          ]} />
        </FormalSectionCard>
        <ReviewSummaryCard review={detail.reviewSummary} />
        {detail.unavailableMetrics.filter((metric) => metric !== "shiftPreferences").map((metric) => (
          <UnavailableCard key={metric} title={unavailableMetricLabels[metric]} />
        ))}
      </>
    );
  }

  if (tab === "技能与服务") {
    return (
      <FormalSectionCard caption={`正式合同返回 ${detail.services.length} 项服务。`} title="正式启用服务">
        {detail.services.length > 0 ? <TechnicianServiceList services={detail.services} /> : <UnavailableState />}
      </FormalSectionCard>
    );
  }

  if (tab === "排班偏好") {
    return (
      <>
        {detail.unavailableMetrics.includes("shiftPreferences") ? <UnavailableCard title="排班偏好" /> : null}
        <FormalSectionCard caption="以下时段直接来自正式排班库存。" title="近期正式排班">
          {detail.upcomingSchedule.length > 0 ? <ScheduleList slots={detail.upcomingSchedule} /> : <EmptyRecord label="当前没有近期正式排班" />}
        </FormalSectionCard>
      </>
    );
  }

  if (tab === "薪酬设置") {
    return detail.compensationProfile ? <CompensationCard profile={detail.compensationProfile} /> : <UnavailableCard title="薪酬设置" />;
  }

  if (tab === "权限与账号") {
    return <AccountAccessCards account={detail.account} />;
  }

  return <AuditTimeline events={detail.timeline} />;
}

function renderCustomerTab(
  tab: CustomerDetailTab,
  detail: BackofficeCustomerDetailPayload,
  editContent?: ReactNode
) {
  if (tab === "基础资料") {
    return (
      <>
        <FormalSectionCard caption="只展示正式客户档案合同中已有的字段。" title="身份与基础资料">
          <DetailGrid items={[
            { label: "联系邮箱", value: detail.email },
            { label: "所在城市", value: detail.city ?? "未设置" },
            { label: "会员等级", value: membershipLabel(detail.membershipLevel) },
            { label: "资料可见性", value: detail.isPublic ? "公开" : "非公开" },
            { label: "正式预约总数", value: formatInteger(detail.bookingCount) },
            { label: "档案创建时间", value: formatDateTime(detail.createdAt) },
            { label: "档案更新时间", value: formatDateTime(detail.updatedAt) }
          ]} />
          <div className="mt-4 rounded-lg border border-line bg-paper p-4">
            <p className="text-xs font-black text-ink/45">客户简介</p>
            <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6 text-ink">{detail.bio ?? "未填写"}</p>
          </div>
        </FormalSectionCard>
        {editContent ? <FormalSectionCard title="资料编辑">{editContent}</FormalSectionCard> : null}
      </>
    );
  }

  if (tab === "预约与消费") {
    const statusMetrics = Object.entries(detail.bookingStatusTotals).map(([status, total]) => ({
      label: bookingStatusLabel(status),
      value: formatInteger(total)
    }));

    return (
      <>
        <FormalSectionCard caption="消费额仅统计正式合同返回的已完成预约。" title="预约与消费汇总">
          <MetricGrid items={[
            { label: "累计预约", value: formatInteger(detail.bookingCount) },
            { label: "已完成消费", value: formatMoney(detail.completedSpendJpy, "JPY") },
            ...statusMetrics
          ]} />
        </FormalSectionCard>
        <FormalSectionCard title="下次预约">
          {detail.nextBooking ? <BookingRow booking={detail.nextBooking} /> : <UnavailableState />}
        </FormalSectionCard>
        <FormalSectionCard title="近期预约">
          {detail.recentBookings.length > 0 ? (
            <div className="grid gap-2">{detail.recentBookings.map((booking) => <BookingRow booking={booking} key={booking.id} />)}</div>
          ) : <UnavailableState />}
        </FormalSectionCard>
        <ReviewSummaryCard review={detail.reviewSummary} />
      </>
    );
  }

  if (tab === "权限与账号") {
    return <AccountAccessCards account={detail.account} />;
  }

  return <AuditTimeline events={detail.timeline} />;
}

function FormalSectionCard({
  caption,
  children,
  title
}: {
  caption?: string;
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="min-w-0 rounded-[18px] border border-line bg-white p-4 shadow-[0_8px_24px_rgba(22,23,26,0.05)] sm:p-5">
      <div className="mb-4 border-l-[3px] border-moss pl-3">
        <h3 className="text-base font-black tracking-tight text-ink">{title}</h3>
        {caption ? <p className="mt-1 text-xs font-bold leading-5 text-ink/50">{caption}</p> : null}
      </div>
      {children}
    </section>
  );
}

function MetricGrid({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {items.map((item) => (
        <div className="min-w-0 rounded-lg border border-line bg-paper px-3 py-3" key={item.label}>
          <dt className="text-[11px] font-black text-ink/45">{item.label}</dt>
          <dd className="mt-1 break-words text-lg font-black tracking-tight text-ink tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function UnavailableCard({ title }: { title: string }) {
  return (
    <FormalSectionCard title={title}>
      <UnavailableState />
    </FormalSectionCard>
  );
}

function UnavailableState() {
  return (
    <div className="rounded-lg border border-dashed border-line bg-paper px-4 py-6 text-center">
      <p className="text-sm font-black text-ink/55">尚未接入正式数据</p>
    </div>
  );
}

function EmptyRecord({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-paper px-4 py-6 text-center text-sm font-black text-ink/55">
      {label}
    </div>
  );
}

function ReviewSummaryCard({ review }: { review: BackofficeReviewSummaryPayload | null }) {
  return (
    <FormalSectionCard title="正式评价摘要">
      {review ? (
        <div className="grid gap-4 lg:grid-cols-[180px,minmax(0,1fr)]">
          <div className="rounded-lg bg-ink p-4 text-white">
            <p className="text-xs font-black text-white/55">综合评分</p>
            <strong className="mt-2 block text-3xl font-black tabular-nums">{review.ratingAverage.toFixed(1)}</strong>
            <p className="mt-1 text-xs font-bold text-white/65">{formatInteger(review.reviewCount)} 条正式评价</p>
          </div>
          <div className="min-w-0 rounded-lg border border-line bg-paper p-4">
            <p className="text-xs font-black text-ink/45">评价亮点</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {review.highlights.length > 0
                ? review.highlights.map((highlight) => <Badge key={highlight} tone="green">{highlight}</Badge>)
                : <span className="text-sm font-bold text-ink/55">暂无正式亮点记录</span>}
            </div>
            <p className="mt-3 text-xs font-bold text-ink/45">最近评价：{formatDateTime(review.latestReviewAt)}</p>
          </div>
        </div>
      ) : <UnavailableState />}
    </FormalSectionCard>
  );
}

function TechnicianServiceList({ services }: { services: BackofficeTechnicianServiceDetailPayload[] }) {
  return (
    <div className="grid gap-2">
      {services.map((service) => (
        <article className="grid min-w-0 gap-3 rounded-lg border border-line bg-paper p-4 md:grid-cols-[minmax(0,1fr),auto] md:items-center" key={`${service.source}-${service.id}`}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="break-words text-sm font-black text-ink">{service.name}</h4>
              {service.isRecommended ? <Badge tone="yellow">推荐</Badge> : null}
              <Badge tone="neutral">{service.source === "technician_service" ? "技师服务" : "店铺服务"}</Badge>
            </div>
            <p className="mt-1 text-xs font-bold leading-5 text-ink/50">{service.description ?? "未填写服务说明"}</p>
          </div>
          <div className="shrink-0 text-left md:text-right">
            <strong className="block text-base font-black text-ink tabular-nums">{formatMoney(service.priceAmount, service.currency)}</strong>
            <span className="mt-1 block text-xs font-bold text-ink/45">{service.durationMinutes} 分钟</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function ScheduleList({ slots }: { slots: BackofficeScheduleSlotPayload[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[680px] border-collapse text-left text-sm">
        <thead className="bg-paper text-xs font-black text-ink/50">
          <tr>
            <th className="px-4 py-3">开始</th>
            <th className="px-4 py-3">服务</th>
            <th className="px-4 py-3">店铺</th>
            <th className="px-4 py-3">容量</th>
            <th className="px-4 py-3">状态</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <tr className="border-t border-line bg-white" key={slot.id}>
              <td className="px-4 py-3 font-bold text-ink"><span className="block">{formatDateTime(slot.startsAt)}</span><span className="mt-1 block text-xs text-ink/45">至 {formatDateTime(slot.endsAt)}</span></td>
              <td className="px-4 py-3 font-black text-ink">{slot.serviceName}</td>
              <td className="px-4 py-3 font-bold text-ink/65">{slot.shopName}</td>
              <td className="px-4 py-3 font-black text-ink tabular-nums">{slot.bookedCount}/{slot.capacity}</td>
              <td className="px-4 py-3"><Badge tone={slot.status === "booked" ? "blue" : "green"}>{scheduleStatusLabel(slot.status)}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompensationCard({ profile }: { profile: BackofficeCompensationProfilePayload }) {
  return (
    <FormalSectionCard caption={`版本 ${profile.version} · ${compensationStatusLabel(profile.status)}`} title="薪酬设置">
      <DetailGrid items={[
        { label: "方案名称", value: profile.name },
        { label: "计薪模式", value: compensationModeLabel(profile.wageMode) },
        { label: "基础月薪", value: formatMoney(profile.baseSalaryJpy, "JPY") },
        { label: "时薪", value: formatMoney(profile.hourlyRateJpy, "JPY") },
        { label: "日薪", value: formatMoney(profile.dailyRateJpy, "JPY") },
        { label: "固定单次报酬", value: formatMoney(profile.fixedOrderPayJpy, "JPY") },
        { label: "提成比例", value: `${profile.commissionRatePercent}%` },
        { label: "保障最低额", value: formatMoney(profile.guaranteedMinimumJpy, "JPY") },
        { label: "NDP 费用承担方", value: profile.ndpFeeBearer },
        { label: "技师 NDP 分成", value: `${profile.technicianNdpSharePercent}%` },
        { label: "生效时间", value: `${formatDateTime(profile.effectiveFrom)} — ${formatDateTime(profile.effectiveTo)}` },
        { label: "更新时间", value: formatDateTime(profile.updatedAt) }
      ]} />
    </FormalSectionCard>
  );
}

function AccountAccessCards({ account }: { account: BackofficeTechnicianDetailPayload["account"] }) {
  return (
    <>
      <FormalSectionCard title="账号状态">
        <DetailGrid items={[
          { label: "用户名", value: account.username },
          { label: "邮箱", value: account.email },
          { label: "手机号", value: account.phone ?? "未设置" },
          { label: "账号状态", value: account.isActive ? "启用" : "停用" },
          { label: "最近登录", value: formatDateTime(account.lastLoginAt) }
        ]} />
      </FormalSectionCard>
      <FormalSectionCard caption="角色作用域来自正式 RBAC 合同。" title="角色">
        <RoleList roles={account.roles} />
      </FormalSectionCard>
      <FormalSectionCard caption="身份及作用域来自正式 User Identity 合同。" title="身份">
        <IdentityList identities={account.identities} />
      </FormalSectionCard>
    </>
  );
}

function RoleList({ roles }: { roles: BackofficeRolePayload[] }) {
  if (roles.length === 0) {
    return <EmptyRecord label="当前没有正式角色记录" />;
  }

  return (
    <div className="grid gap-2 md:grid-cols-2">
      {roles.map((role, index) => (
        <article className="rounded-lg border border-line bg-paper p-4" key={`${role.code}-${role.scopeType}-${role.scopeId}-${index}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-black text-ink">{role.name}</h4>
            <Badge tone="dark">{role.code}</Badge>
          </div>
          <p className="mt-2 text-xs font-bold text-ink/50">{scopeLabel(role.scopeType, role.scopeId)}</p>
        </article>
      ))}
    </div>
  );
}

function IdentityList({ identities }: { identities: BackofficeIdentityPayload[] }) {
  if (identities.length === 0) {
    return <EmptyRecord label="当前没有正式身份记录" />;
  }

  return (
    <div className="grid gap-2 md:grid-cols-2">
      {identities.map((identity, index) => (
        <article className="rounded-lg border border-line bg-paper p-4" key={`${identity.type}-${identity.scopeType}-${identity.scopeId}-${index}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-black text-ink">{identity.displayName ?? identityTypeLabel(identity.type)}</h4>
            <Badge tone="blue">{identityTypeLabel(identity.type)}</Badge>
          </div>
          <p className="mt-2 text-xs font-bold text-ink/50">{scopeLabel(identity.scopeType, identity.scopeId)}</p>
        </article>
      ))}
    </div>
  );
}

function BookingRow({ booking }: { booking: BackofficeOrderPayload }) {
  return (
    <article className="grid min-w-0 gap-3 rounded-lg border border-line bg-paper p-4 lg:grid-cols-[minmax(0,1fr),auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="break-words text-sm font-black text-ink">{booking.serviceName}</h4>
          <Badge tone={bookingStatusTone(booking.status)}>{bookingStatusLabel(booking.status)}</Badge>
          <Badge tone={paymentStatusTone(booking.paymentStatus)}>{paymentStatusLabel(booking.paymentStatus)}</Badge>
        </div>
        <p className="mt-2 text-xs font-bold leading-5 text-ink/50">{booking.orderNo} · {booking.shopName} · {formatDateTime(booking.startsAt)}</p>
      </div>
      <strong className="shrink-0 text-base font-black text-ink tabular-nums">{formatMoney(booking.priceAmount, booking.currency)}</strong>
    </article>
  );
}

function AuditTimeline({ events }: { events: BackofficeAuditEventPayload[] }) {
  return (
    <ContactEventTimelinePanel
      className="rounded-[18px] border-line bg-white text-ink shadow-[0_8px_24px_rgba(22,23,26,0.05)]"
      emptyLabel="暂无正式审计记录"
      events={events.map(mapAuditEvent)}
      showCommentComposer={false}
      title="正式审计时间线"
    />
  );
}

function mapAuditEvent(event: BackofficeAuditEventPayload): ContactEventTimelineEntry {
  const actionLabel = auditActionLabel(event.action);
  const metadataMessage = typeof event.metadata?.message === "string" ? event.metadata.message : null;

  return {
    actorAvatarSrc: event.actorAvatarUrl ?? undefined,
    actorName: event.actorName,
    actorRole: actionLabel,
    atLabel: formatDateTime(event.createdAt),
    id: event.id,
    message: metadataMessage ?? `记录了 ${actionLabel}`,
    title: actionLabel,
    tone: auditTone(event.action)
  };
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "未记录";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}

function formatMoney(value: number, currency: string) {
  if (currency === "JPY") {
    return `¥${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 }).format(value)}`;
  }

  return `${currency} ${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value)}`;
}

function formatMinutes(minutes: number) {
  const hours = minutes / 60;
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(hours)}小时`;
}

function technicianStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "草稿",
    pending_review: "待审核",
    published: "已发布",
    paused: "已暂停",
    rejected: "未通过"
  };
  return labels[status] ?? status;
}

function technicianStatusTone(status: string): BadgeTone {
  if (status === "published") return "green";
  if (status === "rejected") return "red";
  if (status === "pending_review") return "yellow";
  return "neutral";
}

function membershipLabel(level: string) {
  const labels: Record<string, string> = {
    standard: "标准会员",
    premium: "Premium",
    vip: "VIP",
    black: "Black"
  };
  return labels[level.toLowerCase()] ?? level;
}

function bookingStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "待确认",
    confirmed: "已确认",
    in_service: "服务中",
    inService: "服务中",
    completed: "已完成",
    cancelled: "已取消"
  };
  return labels[status] ?? status;
}

function bookingStatusTone(status: string): BadgeTone {
  if (status === "completed") return "green";
  if (status === "cancelled") return "red";
  if (status === "in_service" || status === "inService") return "blue";
  return "yellow";
}

function paymentStatusLabel(status: BackofficeOrderPayload["paymentStatus"]) {
  return {
    pending: "待确认收款",
    confirmed: "已确认收款",
    refundPending: "待退款",
    refunded: "已退款"
  }[status];
}

function paymentStatusTone(status: BackofficeOrderPayload["paymentStatus"]): BadgeTone {
  if (status === "confirmed") return "green";
  if (status === "refundPending") return "yellow";
  if (status === "refunded") return "neutral";
  return "red";
}

function scheduleStatusLabel(status: string) {
  const labels: Record<string, string> = {
    available: "可预约",
    booked: "已预约",
    blocked: "已阻塞"
  };
  return labels[status] ?? status;
}

function compensationModeLabel(mode: string) {
  const labels: Record<string, string> = {
    monthly: "月薪",
    hourly: "时薪",
    daily: "日薪",
    fixed_order: "按单固定",
    commission: "提成",
    hybrid: "混合"
  };
  return labels[mode] ?? mode;
}

function compensationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "草稿",
    active: "生效中",
    archived: "已归档"
  };
  return labels[status] ?? status;
}

function scopeLabel(scopeType: string | null, scopeId: number | null) {
  if (!scopeType || scopeType === "global") {
    return "全局作用域";
  }
  return `${scopeType} 作用域${scopeId === null ? "" : ` #${scopeId}`}`;
}

function identityTypeLabel(type: string) {
  const labels: Record<string, string> = {
    platform: "平台身份",
    customer: "客户身份",
    technician: "技师身份",
    merchant: "商户身份",
    merchant_owner: "店铺负责人",
    merchant_staff: "店铺员工",
    broker: "经纪人",
    scout: "介绍人"
  };
  return labels[type] ?? type;
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    "technician.created": "技师档案创建",
    "technician.approved": "技师审核通过",
    "technician.profile.updated": "技师资料更新",
    "technician.deleted": "技师软删除",
    "customer.created": "客户档案创建",
    "customer.profile.updated": "客户资料更新",
    "customer.deleted": "客户软删除"
  };
  return labels[action] ?? action;
}

function auditTone(action: string): ContactEventTimelineEntry["tone"] {
  return /deleted|disabled|rejected|cancelled|failed/i.test(action) ? "red" : "green";
}
