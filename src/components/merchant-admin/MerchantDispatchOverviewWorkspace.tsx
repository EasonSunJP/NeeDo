import { useMemo, useState } from "react";
import { DetailGrid } from "../admin/DetailGrid";
import { GoogleScheduleCalendar } from "../admin/GoogleScheduleCalendar";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { DataTable } from "../ui/DataTable";
import { Drawer } from "../ui/Drawer";
import { TitleWithInfo } from "../ui/TitleWithInfo";
import { fieldJobs, orders } from "../../data/mock";
import { getMerchantAdminDemo } from "../../data/merchantAdmin";
import { buildStorePolicySummary, getActiveModeConfigForStore, getActivePolicyForStore, getStoreScheduleModeLabel } from "../../lib/shiftPlanning";
import { statusLabel } from "../../lib/utils";
import { useEntityStore } from "../../state/entityStore";
import { useScheduleStore } from "../../state/scheduleStore";
import { useShiftPlanningStore } from "../../state/shiftPlanningStore";
import type { Schedule, Technician } from "../../types/domain";

const employeeStatusText: Record<Technician["status"], string> = {
  available: "空闲",
  busy: "服务中",
  off: "休息"
};

export function MerchantDispatchOverviewWorkspace({ storeId }: { storeId: string }) {
  const { stores, technicians } = useEntityStore();
  const { schedules } = useScheduleStore();
  const shiftPlanning = useShiftPlanningStore();
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const currentStore = stores.find((store) => store.id === storeId) ?? getMerchantAdminDemo().store;
  const scopedTechnicians = useMemo(() => technicians.filter((technician) => technician.storeId === storeId), [storeId, technicians]);
  const scopedSchedules = useMemo(
    () => schedules.filter((schedule) => scopedTechnicians.some((technician) => technician.id === schedule.staffId)),
    [schedules, scopedTechnicians]
  );
  const todaySchedules = useMemo(() => scopedSchedules.filter((schedule) => schedule.date === "2026-04-14"), [scopedSchedules]);
  const selectedTechnician = selectedSchedule ? scopedTechnicians.find((technician) => technician.id === selectedSchedule.staffId) : undefined;
  const activePolicy = useMemo(
    () => getActivePolicyForStore(storeId, shiftPlanning.policies),
    [shiftPlanning.policies, storeId]
  );
  const activeModeConfig = useMemo(
    () => getActiveModeConfigForStore(storeId, shiftPlanning.modeConfigs),
    [storeId, shiftPlanning.modeConfigs]
  );
  const storeTemplate = useMemo(
    () => (activePolicy ? shiftPlanning.templates.find((template) => template.ownerType === "store" && template.policyId === activePolicy.id) ?? null : null),
    [activePolicy, shiftPlanning.templates]
  );
  const schedulingSummary = useMemo(
    () =>
      activePolicy && storeTemplate
        ? buildStorePolicySummary({
            policy: activePolicy,
            storeTemplate,
            responses: shiftPlanning.responses.filter((response) => response.policyId === activePolicy.id),
            responseTemplates: shiftPlanning.templates.filter((template) => template.ownerType === "technician" && template.policyId === activePolicy.id),
            overrides: shiftPlanning.slotOverrides,
            confirmedShifts: shiftPlanning.confirmedShifts.filter((shift) => shift.policyId === activePolicy.id),
            capacityRules: shiftPlanning.capacityRules.filter((rule) => !rule.policyId || rule.policyId === activePolicy.id)
          })
        : null,
    [activePolicy, shiftPlanning.capacityRules, shiftPlanning.confirmedShifts, shiftPlanning.policies, shiftPlanning.responses, shiftPlanning.slotOverrides, shiftPlanning.templates, storeTemplate]
  );
  const ordersForStore = useMemo(
    () => orders.filter((order) => !order.storeName || order.storeName === currentStore.name),
    [currentStore.name]
  );
  const scopedFinalSlots = useMemo(
    () => shiftPlanning.finalBookableSlots.filter((slot) => slot.storeId === storeId),
    [shiftPlanning.finalBookableSlots, storeId]
  );
  const currentMode = activeModeConfig?.mode ?? "STORE_CONFIRM_REQUIRED";
  const isSelfManagedMode = currentMode === "TECHNICIAN_SELF_FINAL";

  const summaryCards = [
    { label: "当前模式", value: getStoreScheduleModeLabel(currentMode), tone: isSelfManagedMode ? "green" as const : "blue" as const },
    { label: "当前排班状态概览", value: isSelfManagedMode ? `${scopedFinalSlots.filter((slot) => slot.status === "available").length} 格可约` : schedulingSummary ? `${schedulingSummary.confirmedCount} 格已确认` : "-", tone: "blue" as const },
    { label: isSelfManagedMode ? "允许自排时段" : "开放时段", value: schedulingSummary ? `${schedulingSummary.openHourCount} 格` : "-", tone: "green" as const },
    { label: "今日排班表", value: `${todaySchedules.length} 段`, tone: "yellow" as const },
    { label: "本店员工状态", value: `${scopedTechnicians.length} 人`, tone: "neutral" as const },
    { label: isSelfManagedMode ? "冲突 / 屏蔽" : "待反馈员工", value: isSelfManagedMode ? `${scopedFinalSlots.filter((slot) => slot.status === "conflict").length} / ${scopedFinalSlots.filter((slot) => slot.status === "blocked_by_store").length}` : schedulingSummary ? `${schedulingSummary.feedbackPendingCount} 人` : "-", tone: "yellow" as const },
    { label: "待派任务", value: `${fieldJobs.filter((job) => job.status === "pendingDispatch").length} 单`, tone: "red" as const }
  ];

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map((item) => (
          <article className="rounded-[22px] border border-line bg-white p-4 shadow-panel" key={item.label}>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-ink/45">{item.label}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <strong className="text-2xl font-black">{item.value}</strong>
              <Badge tone={item.tone}>{item.label}</Badge>
            </div>
          </article>
        ))}
      </section>

      <section className="mt-5 rounded-[24px] border border-line bg-white p-4 shadow-panel">
        <div className="flex items-center justify-between gap-3">
          <TitleWithInfo
            as="h2"
            info="以原调度中心为基础保留当前日历视图，专注查看本店实时排班、订单占用和当前班表分布。"
            label="目前的日程表说明"
            title="目前的日程表"
            titleClassName="text-lg font-black"
            variant="paper"
          />
          <div className="flex flex-wrap gap-2">
            <Badge tone="blue">{currentStore.name}</Badge>
            <Button size="sm" to="/merchant-admin/dispatch-center/schedule?mode=auto" variant="secondary">去排班</Button>
          </div>
        </div>
        <div className="mt-4">
          <GoogleScheduleCalendar
            onScheduleClick={setSelectedSchedule}
            orders={ordersForStore}
            staffLabel="员工"
            technicians={scopedTechnicians}
          />
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="rounded-[24px] border border-line bg-white p-4 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <TitleWithInfo
              as="h2"
              info="查看今天的班次、绑定订单和空档情况，适合开店前和高峰前快速检查。"
              label="今日排班表说明"
              title="今日排班表"
              titleClassName="text-lg font-black"
              variant="paper"
            />
            <Badge tone="yellow">{todaySchedules.length} 段</Badge>
          </div>
          <div className="mt-4">
            <DataTable<Schedule>
              columns={[
                {
                  key: "staffId",
                  title: "员工",
                  render: (row) => {
                    const technician = scopedTechnicians.find((item) => item.id === row.staffId);
                    return technician ? (technician.nickname ? `${technician.nickname} / ${technician.name}` : technician.name) : row.staffId;
                  }
                },
                { key: "time", title: "时间", render: (row) => `${row.startTime}-${row.endTime}` },
                { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "free" ? "green" : row.status === "blocked" ? "red" : "yellow"}>{statusLabel(row.status)}</Badge> },
                { key: "orderId", title: "订单", render: (row) => row.orderId ?? "未绑定" }
              ]}
              footerPlacement="inline"
              onView={setSelectedSchedule}
              pageSize={10}
              rows={todaySchedules}
            />
          </div>
        </section>

        <section className="rounded-[24px] border border-line bg-white p-4 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <TitleWithInfo
              as="h2"
              info="保留原调度中心的当班监控能力，便于快速判断谁可接单、谁已忙碌、谁处于休息。"
              label="本店员工状态说明"
              title="本店员工状态"
              titleClassName="text-lg font-black"
              variant="paper"
            />
            <Button size="sm" to="/merchant-admin/people?module=staff" variant="secondary">去员工列表</Button>
          </div>
          <div className="mt-4">
            <DataTable<Technician>
              columns={[
                { key: "name", title: "员工", render: (row) => row.nickname ? `${row.nickname} / ${row.name}` : row.name },
                { key: "status", title: "当前状态", render: (row) => <Badge tone={row.status === "available" ? "green" : row.status === "busy" ? "yellow" : "neutral"}>{employeeStatusText[row.status]}</Badge> },
                { key: "rating", title: "评分", render: (row) => row.rating.toFixed(2) },
                { key: "acceptRate", title: "接单率", render: (row) => `${row.acceptRate}%` },
                { key: "serviceAreas", title: "服务范围", render: (row) => row.serviceAreas.slice(0, 2).join(" / ") }
              ]}
              footerPlacement="inline"
              pageSize={10}
              rows={scopedTechnicians}
            />
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr,0.95fr]">
        <section className="rounded-[24px] border border-line bg-white p-4 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <TitleWithInfo
              as="h2"
              info="保留原调度中心的待派任务区，方便店长从当前排班视角继续调度订单与人工分派。"
              label="待派任务池说明"
              title="待派任务池"
              titleClassName="text-lg font-black"
              variant="paper"
            />
            <Button size="sm" to="/merchant-admin/orders" variant="secondary">去订单中心</Button>
          </div>
          <div className="mt-4">
            <DataTable
              columns={[
                { key: "content", title: "服务内容", render: (row) => row.serviceContent },
                { key: "time", title: "预约时间", render: (row) => row.serviceTime },
                { key: "address", title: "地址", render: (row) => row.address },
                { key: "tech", title: "员工", render: (row) => row.technicianName ?? "待分配" },
                { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "pendingDispatch" ? "yellow" : "green"}>{statusLabel(row.status)}</Badge> }
              ]}
              footerPlacement="inline"
              pageSize={6}
              rows={fieldJobs}
            />
          </div>
        </section>

        <section className="rounded-[24px] border border-line bg-white p-4 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <TitleWithInfo
              as="h2"
              info="把当前手动、自动或智能排班结果压缩成监控摘要，便于在当前周期确认里快速发现问题。"
              label="排班监控摘要说明"
              title="排班监控摘要"
              titleClassName="text-lg font-black"
              variant="paper"
            />
            <Button size="sm" to="/merchant-admin/dispatch-center/schedule?mode=auto" variant="secondary">调整规则</Button>
          </div>
          <div className="mt-4 space-y-2">
            {[
              [isSelfManagedMode ? "最终可约" : "已确认班次", isSelfManagedMode ? `${scopedFinalSlots.filter((slot) => slot.status === "available").length} 格` : schedulingSummary ? `${schedulingSummary.confirmedCount} 格` : "-"],
              [isSelfManagedMode ? "已预约占用" : "候补班次", isSelfManagedMode ? `${scopedFinalSlots.filter((slot) => slot.status === "booked").length} 格` : schedulingSummary ? `${schedulingSummary.waitlistedCount} 格` : "-"],
              [isSelfManagedMode ? "冲突提示" : "缺人提示", isSelfManagedMode ? `${scopedFinalSlots.filter((slot) => slot.status === "conflict").length} 格` : schedulingSummary ? `${schedulingSummary.shortageCount} 处` : "-"],
              [isSelfManagedMode ? "店铺屏蔽" : "超额反馈", isSelfManagedMode ? `${scopedFinalSlots.filter((slot) => slot.status === "blocked_by_store").length} 格` : schedulingSummary ? `${schedulingSummary.overflowCount} 处` : "-"],
              [isSelfManagedMode ? "已发布员工" : "已提交反馈", isSelfManagedMode ? `${new Set(scopedFinalSlots.filter((slot) => slot.status === "available").map((slot) => slot.technicianId)).size} 人` : schedulingSummary ? `${schedulingSummary.feedbackSubmittedCount + schedulingSummary.feedbackUpdatedCount} 人` : "-"]
            ].map(([label, value]) => (
              <div className="flex items-center justify-between rounded-2xl bg-paper px-4 py-3" key={label}>
                <span className="text-sm font-semibold text-ink/60">{label}</span>
                <strong className="text-sm font-black">{value}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <Drawer onClose={() => setSelectedSchedule(null)} open={Boolean(selectedSchedule)} title="排班详情">
        {selectedSchedule ? (
          <div className="space-y-5">
            <DetailGrid
              items={[
                { label: "员工", value: selectedTechnician ? (selectedTechnician.nickname ? `${selectedTechnician.nickname} / ${selectedTechnician.name}` : selectedTechnician.name) : selectedSchedule.staffId },
                { label: "日期", value: selectedSchedule.date },
                { label: "时间", value: `${selectedSchedule.startTime}-${selectedSchedule.endTime}` },
                { label: "状态", value: statusLabel(selectedSchedule.status) },
                { label: "绑定订单", value: selectedSchedule.orderId ?? "未绑定" },
                { label: "可服务区域", value: selectedTechnician?.serviceAreas.join(" / ") ?? "-" }
              ]}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Button to="/merchant-admin/dispatch-center/current">留在当前周期确认</Button>
              <Button to="/merchant-admin/dispatch-center/schedule?mode=auto" variant="secondary">去排班</Button>
            </div>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
