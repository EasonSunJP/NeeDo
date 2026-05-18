import { useMemo, useState, type ReactNode } from "react";
import { DetailGrid } from "./DetailGrid";
import { MonthlyScheduleCalendar } from "./MonthlyScheduleCalendar";
import { Badge } from "../ui/Badge";
import { Tabs } from "../ui/Tabs";
import { technicianMoments } from "../../data/mock";
import { buildStaffCompensationRule, calculateStaffCompensation } from "../../lib/staffCompensation";
import { yen } from "../../lib/utils";
import { useEntityStore } from "../../state/entityStore";
import { useScheduleStore } from "../../state/scheduleStore";
import type { Technician } from "../../types/domain";

type TechnicianProfileLike = Technician & {
  virtual?: true;
  scenario?: string;
  createdAt?: string;
  enabled?: boolean;
};

type TechnicianProfileContext = "platform" | "merchant";
type StaffDetailTab = "基础资料" | "状态与数据" | "技能与服务" | "排班偏好" | "薪酬设置" | "权限与账号" | "时间线";

const staffDetailTabs: StaffDetailTab[] = ["基础资料", "状态与数据", "技能与服务", "排班偏好", "薪酬设置", "权限与账号", "时间线"];

const statusText: Record<Technician["status"], string> = {
  available: "空闲",
  busy: "服务中",
  off: "休息"
};

const roleText: Record<Technician["role"], string> = {
  storeManager: "店长",
  staff: "门店员工",
  therapist: "护理担当",
  driver: "移动担当",
  cleaner: "清洁担当"
};

const momentStatusText = {
  visible: "展示中",
  reviewing: "审核中",
  hidden: "已隐藏"
};

function getStoreName(stores: ReturnType<typeof useEntityStore>["stores"], storeId: string) {
  return stores.find((store) => store.id === storeId)?.name ?? "未绑定门店";
}

function getStableIndex(value: string) {
  return value.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function formatHours(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}h`;
}

function getSeniorityLabel(technician: TechnicianProfileLike) {
  if (technician.rating >= 4.9 || technician.orderCount >= 900) {
    return "高级";
  }

  if (technician.rating >= 4.8 || technician.orderCount >= 500) {
    return "中级";
  }

  return "成长中";
}

function PanelSection({
  title,
  caption,
  children
}: {
  title: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-black">{title}</h4>
          {caption ? <p className="mt-1 text-sm leading-6 text-ink/55">{caption}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function MetricTiles({ items }: { items: Array<{ label: string; value: ReactNode; caption?: string; tone?: "green" | "yellow" | "red" | "blue" | "neutral" }> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div className="rounded-lg border border-line bg-paper p-3" key={item.label}>
          <p className="text-xs font-semibold text-ink/50">{item.label}</p>
          <strong className="mt-1 block text-xl font-black text-ink">{item.value}</strong>
          {item.caption ? <p className="mt-1 text-xs leading-5 text-ink/45">{item.caption}</p> : null}
          {item.tone ? <span className={`mt-3 block h-1 rounded-full ${item.tone === "green" ? "bg-mint" : item.tone === "yellow" ? "bg-lemon" : item.tone === "red" ? "bg-coral" : item.tone === "blue" ? "bg-sky" : "bg-line"}`} /> : null}
        </div>
      ))}
    </div>
  );
}

function TagList({ items, emptyLabel = "未设置" }: { items: string[]; emptyLabel?: string }) {
  if (items.length === 0) {
    return <span className="text-sm font-bold text-ink/45">{emptyLabel}</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Badge key={item} tone="neutral">{item}</Badge>
      ))}
    </div>
  );
}

function Timeline({ entries }: { entries: Array<{ title: string; time: string; detail: string; tone?: "green" | "yellow" | "red" | "blue" | "neutral" }> }) {
  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <article className="rounded-lg border border-line bg-paper p-3" key={`${entry.title}-${entry.time}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge tone={entry.tone ?? "neutral"}>{entry.title}</Badge>
              <strong className="text-sm text-ink">{entry.time}</strong>
            </div>
          </div>
          <p className="mt-2 text-sm leading-6 text-ink/60">{entry.detail}</p>
        </article>
      ))}
    </div>
  );
}

export function TechnicianProfilePanel({
  technician,
  context = "platform",
  showSummaryCard = true
}: {
  technician: TechnicianProfileLike;
  context?: TechnicianProfileContext;
  showSummaryCard?: boolean;
}) {
  const { stores } = useEntityStore();
  const { schedules } = useScheduleStore();
  const [activeTab, setActiveTab] = useState<StaffDetailTab>("基础资料");
  const isVirtual = "virtual" in technician && Boolean(technician.virtual);
  const staffLabel = context === "merchant" ? "员工" : "技师";
  const staffIndex = getStableIndex(technician.id);
  const storeName = getStoreName(stores, technician.storeId);
  const moments = isVirtual ? [] : technicianMoments.filter((post) => post.technicianId === technician.id);
  const momentLikes = moments.reduce((sum, post) => sum + post.likes, 0);
  const momentComments = moments.reduce((sum, post) => sum + post.comments.length, 0);
  const staffSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.staffId === technician.id),
    [schedules, technician.id]
  );
  const scheduleHours = staffSchedules.reduce((sum, schedule) => {
    const start = Number(schedule.startTime.split(":")[0]);
    const end = Number(schedule.endTime.split(":")[0]);

    return sum + Math.max(0, end - start);
  }, 0);
  const completedOrders = Math.max(0, Math.round(technician.orderCount * (1 - technician.cancelRate / 100)));
  const canceledOrders = Math.max(1, Math.round(technician.orderCount * (technician.cancelRate / 100)));
  const weekHours = Math.max(18, Math.min(46, scheduleHours + 18 + (staffIndex % 8)));
  const monthHours = weekHours * 4 + (staffIndex % 12);
  const preferredDays = ["月", "火", "水", "木", "金", "土", "日"].filter((_, index) => (index + staffIndex) % 4 !== 0);
  const blockedDays = ["第 2 火曜", "第 4 木曜", "月末日"].slice(0, 1 + (staffIndex % 2));
  const workModes = [
    "可上门",
    technician.role === "cleaner" ? "现场服务" : "可到店",
    technician.status === "off" ? "需提前确认" : "当日确认"
  ];
  const contactProfile = {
    phone: `+81 90-${String(1200 + (staffIndex % 7000)).padStart(4, "0")}-${String(3000 + ((staffIndex * 7) % 6000)).padStart(4, "0")}`,
    line: `needo.${technician.id.replace(/[^a-z0-9-]/gi, "")}.${String(100 + (staffIndex % 900))}`,
    address: `${technician.serviceAreas[0] ?? "东京"} 服务圈 / ${storeName}`,
    emergency: `紧急联系人 ${String.fromCharCode(65 + (staffIndex % 26))} · +81 80-${String(2200 + (staffIndex % 7000)).padStart(4, "0")}-${String(4400 + ((staffIndex * 5) % 5000)).padStart(4, "0")}`,
    joinedAt: `202${2 + (staffIndex % 4)}-${String(1 + (staffIndex % 9)).padStart(2, "0")}-15`,
    credentialExpiresAt: `2027-${String(1 + (staffIndex % 12)).padStart(2, "0")}-28`
  };
  const timelineEntries = [
    {
      title: "资料修改",
      time: "今天 10:24",
      detail: `${staffLabel}更新了联系方式、语言或服务区域，系统已同步到派单资料。`,
      tone: "blue" as const
    },
    {
      title: "排班确认",
      time: "昨天 18:12",
      detail: `确认 ${preferredDays.slice(0, 3).join(" / ")} 可上班，影响下周期自动排班候选池。`,
      tone: "green" as const
    },
    {
      title: "请假",
      time: "4 天前",
      detail: `${blockedDays.join("、")} 已加入不可上班日，排班冲突会提前提示。`,
      tone: "yellow" as const
    },
    {
      title: "转让",
      time: "7 天前",
      detail: "一笔预约完成转让交接，原订单备注、顾客要求和移动时间已留痕。",
      tone: "neutral" as const
    },
    {
      title: "派单拒绝",
      time: "12 天前",
      detail: "拒绝原因：移动时间不足。系统已计入派单质量判断。",
      tone: "red" as const
    },
    {
      title: "奖惩",
      time: "本月",
      detail: `${technician.rating >= 4.9 ? "高评分奖励已计入阶梯奖金。" : "迟到 / 取消记录会进入本月扣罚试算。"}`,
      tone: technician.rating >= 4.9 ? "green" as const : "yellow" as const
    }
  ];
  const compensationPenaltyCount = staffIndex % 4;
  const compensationRule = buildStaffCompensationRule(technician, {
    settlementBasis: context === "merchant" ? "商户后台导出" : "平台财务导出"
  });
  const compensationEstimate = calculateStaffCompensation(compensationRule, {
    salesAmount: technician.income,
    nominatedSalesAmount: Math.round(technician.income * 0.18),
    completedOrders,
    visitCount: Math.round(completedOrders * 0.12),
    penaltyCount: compensationPenaltyCount,
    rating: technician.rating
  });

  return (
    <div className="space-y-5">
      {showSummaryCard ? (
        <section className="rounded-lg bg-ink p-4 text-white">
          <div className="flex gap-4">
            <img alt={technician.name} className="avatar-shape h-24 w-24 object-cover" src={technician.avatar} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={isVirtual ? "yellow" : "green"}>{isVirtual ? "虚拟技师" : `认证${staffLabel}`}</Badge>
                <Badge tone={technician.status === "available" ? "green" : technician.status === "busy" ? "yellow" : "neutral"}>
                  {statusText[technician.status]}
                </Badge>
                {technician.accountUsername ? <Badge tone="blue">测试账号 {technician.accountUsername}</Badge> : null}
              </div>
              <h3 className="mt-3 text-2xl font-black">{technician.nickname ? `${technician.nickname} / ${technician.name}` : technician.name}</h3>
              <p className="mt-2 text-sm text-white/65">
                ID {technician.systemId} · {storeName} · {technician.serviceAreas.join(" / ")}
              </p>
              <p className="mt-2 text-sm font-bold text-[#f5d26b]">★ {technician.rating.toFixed(2)} · {technician.reviewCount.toLocaleString("ja-JP")} 人评价</p>
              <p className="mt-1 text-xs text-white/60">
                接单率 {technician.acceptRate}% · 取消率 {technician.cancelRate}% · {technician.languages.join(" / ")}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <Tabs
        active={activeTab}
        items={staffDetailTabs}
        onChange={(item) => setActiveTab(item as StaffDetailTab)}
      />

      {activeTab === "基础资料" ? (
        <PanelSection title="基础资料" caption="姓名、电话、LINE、地址、eKYC、紧急联系人和入职时间集中管理。">
          <DetailGrid
            items={[
              { label: "系统ID", value: technician.systemId },
              { label: "姓名", value: technician.name },
              ...(technician.nickname ? [{ label: "昵称", value: technician.nickname }] : []),
              { label: "所属门店", value: storeName },
              { label: "角色", value: roleText[technician.role] },
              { label: "电话", value: contactProfile.phone },
              { label: "LINE", value: contactProfile.line },
              { label: "地址", value: contactProfile.address },
              { label: "eKYC", value: <Badge tone={isVirtual ? "yellow" : "green"}>{isVirtual ? "虚拟账号免审" : "实名已通过"}</Badge> },
              { label: "证件有效期", value: contactProfile.credentialExpiresAt },
              { label: "紧急联系人", value: contactProfile.emergency },
              { label: "入职时间", value: contactProfile.joinedAt }
            ]}
          />
        </PanelSection>
      ) : null}

      {activeTab === "状态与数据" ? (
        <PanelSection title="状态与数据" caption="今日 / 本周 / 本月工时、接单、完单、取消、评分和迟到，用于运营与排班质量判断。">
          <div className="space-y-4">
            <MetricTiles
              items={[
                { label: "今日工时", value: formatHours(Math.max(2, staffSchedules.length + (staffIndex % 3))), caption: "当前已发布班次", tone: "blue" },
                { label: "本周工时", value: formatHours(weekHours), caption: "含已预约与空闲时段", tone: "green" },
                { label: "本月工时", value: formatHours(monthHours), caption: "用于结算和容量预估", tone: "green" },
                { label: "迟到", value: `${staffIndex % 4} 次`, caption: "近 30 天", tone: staffIndex % 4 === 0 ? "neutral" : "yellow" }
              ]}
            />
            <DetailGrid
              items={[
                { label: "当前状态", value: <Badge tone={technician.status === "available" ? "green" : technician.status === "busy" ? "yellow" : "neutral"}>{statusText[technician.status]}</Badge> },
                { label: "接单", value: `${technician.orderCount.toLocaleString("ja-JP")} 单` },
                { label: "完单", value: `${completedOrders.toLocaleString("ja-JP")} 单` },
                { label: "取消", value: `${canceledOrders.toLocaleString("ja-JP")} 单 · ${technician.cancelRate}%` },
                { label: "评分", value: `★ ${technician.rating.toFixed(2)} · ${technician.reviewCount.toLocaleString("ja-JP")} 人评价` },
                { label: "接单率", value: `${technician.acceptRate}%` },
                { label: "收入", value: yen(technician.income) },
                { label: "排班质量", value: technician.acceptRate >= 95 && technician.cancelRate <= 2 ? "优先派单" : "需要观察" }
              ]}
            />
          </div>
        </PanelSection>
      ) : null}

      {activeTab === "技能与服务" ? (
        <PanelSection title="技能与服务" caption="可提供服务、熟练等级、可上门 / 到店、语言和可服务区域，影响派单和服务管理。">
          <div className="space-y-4">
            <DetailGrid
              items={[
                { label: "熟练等级", value: getSeniorityLabel(technician) },
                { label: "服务方式", value: workModes.join("、") },
                { label: "外语服务", value: technician.canServeForeigners || technician.languages.length > 1 ? "可接待外国客人" : "以日本語为主" },
                { label: "指名预算", value: technician.bidBudgetMin && technician.bidBudgetMax ? `${yen(Number(technician.bidBudgetMin))} - ${yen(Number(technician.bidBudgetMax))}` : "跟随门店标准" }
              ]}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-line bg-paper p-4">
                <h5 className="mb-3 text-sm font-black">可提供服务</h5>
                <TagList items={technician.skills} />
              </div>
              <div className="rounded-lg border border-line bg-paper p-4">
                <h5 className="mb-3 text-sm font-black">语言</h5>
                <TagList items={technician.languages} />
              </div>
              <div className="rounded-lg border border-line bg-paper p-4">
                <h5 className="mb-3 text-sm font-black">可服务区域</h5>
                <TagList items={technician.serviceAreas} />
              </div>
              <div className="rounded-lg border border-line bg-paper p-4">
                <h5 className="mb-3 text-sm font-black">员工标签</h5>
                <TagList items={technician.profileTags ?? technician.skills} />
              </div>
            </div>
          </div>
        </PanelSection>
      ) : null}

      {activeTab === "排班偏好" ? (
        <PanelSection title="排班偏好" caption="可上班日、不可上班日、期望工时、休息偏好和提前假期，影响自动 / 智能排班。">
          <div className="space-y-4">
            <DetailGrid
              items={[
                { label: "可上班日", value: preferredDays.join("、") },
                { label: "不可上班日", value: blockedDays.join("、") },
                { label: "期望工时", value: `${weekHours - 4} - ${weekHours + 6}h / 周` },
                { label: "休息偏好", value: staffIndex % 2 === 0 ? "连续休息优先" : "分散休息优先" },
                { label: "提前假期", value: `${1 + (staffIndex % 3)} 件待确认` },
                { label: "排班确认", value: technician.status === "off" ? "需店长复核" : "可进入自动排班" }
              ]}
            />
            <MonthlyScheduleCalendar compact schedules={staffSchedules} technicians={[technician]} />
          </div>
        </PanelSection>
      ) : null}

      {activeTab === "薪酬设置" ? (
        <PanelSection title="薪酬设置" caption="工资、分成、指名料、奖金金额、条件、扣罚和交通补贴会影响结算与导出。">
          <DetailGrid
            items={[
              { label: "工资", value: `${yen(compensationRule.salaryMonthly)} / 月` },
              { label: "分成", value: `${compensationRule.commissionRate}%` },
              { label: "指名料", value: `${compensationRule.nominationFeeRate}%` },
              { label: "奖金金额", value: yen(compensationRule.bonusAmount) },
              { label: "条件", value: compensationRule.bonusCondition },
              { label: "保险", value: compensationRule.insuranceLabel },
              { label: "扣罚", value: `${compensationPenaltyCount} 件 · ${yen(compensationEstimate.penaltyAmount)} 进入试算` },
              { label: "交通补贴", value: `${yen(compensationRule.transportAllowancePerVisit)} / 次上门` },
              { label: "结算口径", value: compensationRule.settlementBasis },
              { label: "本月预估", value: yen(compensationEstimate.totalAmount) }
            ]}
          />
        </PanelSection>
      ) : null}

      {activeTab === "权限与账号" ? (
        <PanelSection title="权限与账号" caption="角色、可查看数据范围、手动改排班和订单处理权限对应 RBAC 权限控制。">
          <DetailGrid
            items={[
              { label: "角色", value: roleText[technician.role] },
              { label: "联动账号", value: technician.accountUsername ?? "未绑定登录账号" },
              { label: "可查看数据范围", value: context === "merchant" ? `${storeName} / 本人订单与排班` : "平台授权范围 / 所属门店数据" },
              { label: "是否可手动改排班", value: technician.role === "storeManager" || technician.acceptRate >= 95 ? "是" : "需店长确认" },
              { label: "是否可处理订单", value: technician.status === "off" ? "暂停处理" : "可处理本人订单" },
              { label: "数据导出", value: context === "merchant" ? "不可导出跨店数据" : "按运营角色授权" },
              { label: "账号状态", value: <Badge tone={isVirtual ? "yellow" : "green"}>{isVirtual ? "测试启用" : "正常"}</Badge> },
              { label: "RBAC 备注", value: "权限变更会写入时间线并同步后台审计。" }
            ]}
          />
        </PanelSection>
      ) : null}

      {activeTab === "时间线" ? (
        <div className="space-y-5">
          <PanelSection title="时间线" caption="资料修改、排班确认、请假、转让、派单拒绝和奖惩全链路留痕。">
            <Timeline entries={timelineEntries} />
          </PanelSection>

          <PanelSection title="动态投稿" caption={`查看${staffLabel}在动态里发布过的内容，以及用户点赞和留言反馈。`}>
            <div className="mb-4 grid grid-cols-3 gap-2 text-center text-xs">
              {[
                ["投稿", moments.length],
                ["点赞", momentLikes],
                ["留言", momentComments]
              ].map(([label, value]) => (
                <span className="rounded-lg bg-paper px-3 py-2" key={label}>
                  <strong className="block text-base text-ink">{value}</strong>
                  <span className="text-ink/45">{label}</span>
                </span>
              ))}
            </div>

            <div className="space-y-4">
              {moments.length > 0 ? moments.map((post) => (
                <article className="rounded-lg border border-line bg-paper p-4" key={post.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={post.status === "visible" ? "green" : post.status === "reviewing" ? "yellow" : "neutral"}>
                          {momentStatusText[post.status]}
                        </Badge>
                        <Badge tone="neutral">{post.visibility}</Badge>
                        <span className="text-xs font-bold text-ink/45">{post.postedAt} · {post.location}</span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-ink/75">{post.content}</p>
                    </div>
                    <div className="rounded-lg bg-white px-3 py-2 text-right text-xs shadow-soft">
                      <p className="font-black text-moss">{post.serviceTitle}</p>
                      <p className="mt-1 text-ink/55">{yen(post.servicePrice)} 起</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {post.images.map((image, index) => (
                      <img alt={`${post.technicianName}动态图片${index + 1}`} className="h-24 w-full rounded-lg object-cover" key={`${post.id}-${image}`} src={image} />
                    ))}
                  </div>

                  <div className="mt-3 rounded-lg bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-black text-ink">点赞 {post.likes}</p>
                      <p className="text-xs text-ink/50">{post.likedUsers.join("、")}</p>
                    </div>
                    <div className="mt-3 space-y-2 border-t border-line pt-3">
                      {post.comments.map((comment) => (
                        <div className="rounded-lg bg-paper px-3 py-2" key={comment.id}>
                          <div className="flex items-center justify-between gap-2">
                            <strong className="text-sm text-ink">{comment.userName}</strong>
                            <span className="text-xs text-ink/40">{comment.at}</span>
                          </div>
                          <p className="mt-1 text-sm leading-5 text-ink/65">{comment.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              )) : (
                <div className="rounded-lg bg-paper p-4 text-sm text-ink/55">暂无动态投稿记录。</div>
              )}
            </div>
          </PanelSection>
        </div>
      ) : null}

      {isVirtual ? (
        <section className="rounded-lg border border-line bg-paper p-4">
          <h4 className="font-black">虚拟账号说明</h4>
          <p className="mt-2 text-sm leading-6 text-ink/60">
            场景：{technician.scenario}。虚拟技师用于测试排班、订单链路、冷启动供给和活动展示，不会真实派单给用户。
          </p>
        </section>
      ) : null}
    </div>
  );
}
