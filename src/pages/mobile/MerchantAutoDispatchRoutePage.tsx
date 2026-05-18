import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { MobileBottomActionBar } from "../../components/mobile/MobileBottomActionBar";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { StatusToggleButton } from "../../components/mobile/StatusToggleButton";
import { MobileShell } from "../../components/mobile/MobileShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { orders } from "../../data/mock";
import { buildAutoDispatchDrafts } from "../../lib/scheduleAutomation";
import { cn, statusLabel, yen } from "../../lib/utils";
import { useEntityStore } from "../../state/entityStore";
import { updateAutoDispatchSettings, useScheduleStore, type AutoDispatchSettings } from "../../state/scheduleStore";
import type { FulfillmentMode } from "../../types/domain";

const fullscreenHeaderClassName =
  "";
const sectionClassName =
  "rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_92%,#f7f7f2)] p-4 shadow-panel";
const pillClassName =
  "rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-4 py-2 text-sm font-black text-[color:var(--client-muted)] transition";
const pillActiveClassName =
  "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[#090806] shadow-[0_10px_22px_color-mix(in_srgb,var(--client-primary)_26%,transparent)]";

function toggleValue(values: string[], target: string) {
  return values.includes(target) ? values.filter((value) => value !== target) : [...values, target];
}

function updateNumericDraft(
  setDraft: Dispatch<SetStateAction<AutoDispatchSettings>>,
  key: "minimumRating" | "minimumAcceptRate" | "maximumCancelRate",
  value: string
) {
  setDraft((current) => ({
    ...current,
    [key]: Number(value)
  }));
}

export function MerchantAutoDispatchRoutePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { stores, technicians } = useEntityStore();
  const { schedules, availabilityOverrides, autoDispatchSettings, generatedScheduleSources } = useScheduleStore();
  const store = stores.find((item) => item.id === session?.linkedStoreId) ?? stores[0];
  const storeTechnicians = useMemo(() => {
    const scoped = technicians.filter((tech) => tech.storeId === store.id);

    return scoped.length > 0 ? scoped : technicians;
  }, [store.id, technicians]);
  const [draft, setDraft] = useState<AutoDispatchSettings>(autoDispatchSettings);

  useEffect(() => {
    setDraft(autoDispatchSettings);
  }, [autoDispatchSettings]);

  const areaOptions = useMemo(
    () =>
      Array.from(
        new Set([...orders.map((order) => order.area), ...storeTechnicians.flatMap((technician) => technician.serviceAreas)])
      ).sort((left, right) => left.localeCompare(right, "zh-CN")),
    [storeTechnicians]
  );
  const schedulesWithoutAutoDispatch = useMemo(
    () => schedules.filter((schedule) => generatedScheduleSources[schedule.id] !== "autoDispatch"),
    [generatedScheduleSources, schedules]
  );
  const candidateTechnicians = useMemo(
    () =>
      storeTechnicians.filter((technician) => {
        if (draft.eligibleTechnicianIds.length > 0 && !draft.eligibleTechnicianIds.includes(technician.id)) {
          return false;
        }

        return (
          technician.rating >= draft.minimumRating
          && technician.acceptRate >= draft.minimumAcceptRate
          && technician.cancelRate <= draft.maximumCancelRate
        );
      }),
    [draft.eligibleTechnicianIds, draft.maximumCancelRate, draft.minimumAcceptRate, draft.minimumRating, storeTechnicians]
  );
  const pendingOrders = useMemo(
    () =>
      orders.filter((order) => {
        if (!["pending", "confirmed", "scheduled"].includes(order.status)) {
          return false;
        }

        const [date = draft.dateFrom, time = "00:00"] = order.bookedAt.split(" ");

        if (date < draft.dateFrom || date > draft.dateTo || time < draft.startTime || time > draft.endTime) {
          return false;
        }

        if (!draft.orderModes.includes(order.mode)) {
          return false;
        }

        if (draft.eligibleAreas.length > 0 && !draft.eligibleAreas.includes(order.area)) {
          return false;
        }

        return true;
      }),
    [draft.dateFrom, draft.dateTo, draft.eligibleAreas, draft.endTime, draft.orderModes, draft.startTime]
  );
  const previewAssignments = useMemo(
    () =>
      draft.enabled
        ? buildAutoDispatchDrafts({
            orders,
            technicians: storeTechnicians,
            schedules: schedulesWithoutAutoDispatch,
            availabilityOverrides,
            settings: draft
          })
        : [],
    [availabilityOverrides, draft, schedulesWithoutAutoDispatch, storeTechnicians]
  );
  const previewRows = useMemo(
    () =>
      previewAssignments.slice(0, 4).map((schedule) => ({
        schedule,
        order: orders.find((item) => item.id === schedule.orderId),
        technician: storeTechnicians.find((item) => item.id === schedule.staffId)
      })),
    [previewAssignments, storeTechnicians]
  );
  const activeConditions = [
    draft.orderModes.length === 2 ? "到店 + 上门" : draft.orderModes[0] === "home" ? "仅上门" : "仅到店",
    draft.eligibleAreas.length > 0 ? `${draft.eligibleAreas.length} 个区域` : "全部区域",
    draft.eligibleTechnicianIds.length > 0 ? `${draft.eligibleTechnicianIds.length} 位员工` : "全部员工",
    draft.strictAvailabilityWindow ? "严格班次窗口" : "允许窗口外回退"
  ];

  const saveDraft = () => {
    updateAutoDispatchSettings(draft);
    navigate(-1);
  };

  return (
    <MobileShell navItems={[]}>
      <MobileFullscreenPage>
        <MobileFullscreenHeader
          className={fullscreenHeaderClassName}
          info="自动给符合条件的预约匹配合适员工"
          onBack={() => navigate(-1)}
          subtitle={store.name}
          title="自动派单设置"
        />
        <main className="scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-32">
          <section className={sectionClassName}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <TitleWithInfo
                  as="h1"
                  info="这里控制的是“订单自动分配给员工”的规则，不是自动排班。保存后会和后台管理中心共用同一套派单条件。"
                  label="店铺自动派单规则说明"
                  title="店铺自动派单规则"
                  titleClassName="text-[24px] font-black tracking-[-0.03em]"
                />
              </div>
              <StatusToggleButton checked={draft.enabled} className="shrink-0 shadow-soft" onClick={() => setDraft((current) => ({ ...current, enabled: !current.enabled }))} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {activeConditions.map((label) => (
                <Badge key={label} tone="neutral">
                  {label}
                </Badge>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                ["待处理预约", `${pendingOrders.length} 单`],
                ["预计自动派出", `${previewAssignments.length} 单`],
                ["候选员工", `${candidateTechnicians.length} 人`]
              ].map(([label, value]) => (
                <div
                  className="rounded-[20px] bg-[color:color-mix(in_srgb,var(--client-elevated)_92%,transparent)] px-3 py-3"
                  key={label}
                >
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-ink/45">{label}</p>
                  <strong className="mt-1 block text-base font-black text-ink">{value}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className={sectionClassName}>
            <h2 className="text-lg font-black">订单范围条件</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-black text-ink/50">
                开始日期
                <input
                  className="mt-1 h-11 w-full rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none focus:border-moss"
                  onChange={(event) => setDraft((current) => ({ ...current, dateFrom: event.target.value }))}
                  type="date"
                  value={draft.dateFrom}
                />
              </label>
              <label className="text-xs font-black text-ink/50">
                结束日期
                <input
                  className="mt-1 h-11 w-full rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none focus:border-moss"
                  onChange={(event) => setDraft((current) => ({ ...current, dateTo: event.target.value }))}
                  type="date"
                  value={draft.dateTo}
                />
              </label>
              <label className="text-xs font-black text-ink/50">
                开始时间
                <input
                  className="mt-1 h-11 w-full rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none focus:border-moss"
                  onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))}
                  type="time"
                  value={draft.startTime}
                />
              </label>
              <label className="text-xs font-black text-ink/50">
                结束时间
                <input
                  className="mt-1 h-11 w-full rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none focus:border-moss"
                  onChange={(event) => setDraft((current) => ({ ...current, endTime: event.target.value }))}
                  type="time"
                  value={draft.endTime}
                />
              </label>
            </div>

            <div className="mt-4">
              <p className="text-xs font-black text-ink/50">订单类型</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {([
                  ["store", "到店预约"],
                  ["home", "上门服务"]
                ] as const).map(([mode, label]) => (
                  <button
                    className={cn(pillClassName, draft.orderModes.includes(mode) && pillActiveClassName)}
                    key={mode}
                    onClick={() =>
                      setDraft((current) => {
                        const nextModes = toggleValue(current.orderModes, mode as FulfillmentMode).filter(
                          (value): value is FulfillmentMode => value === "home" || value === "store"
                        );

                        return {
                          ...current,
                          orderModes: nextModes.length > 0 ? nextModes : current.orderModes
                        };
                      })
                    }
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black text-ink/50">服务区域筛选</p>
                {draft.eligibleAreas.length > 0 ? (
                  <button className="text-xs font-black text-moss" onClick={() => setDraft((current) => ({ ...current, eligibleAreas: [] }))} type="button">
                    清空区域
                  </button>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {areaOptions.map((area) => (
                  <button
                    className={cn(pillClassName, draft.eligibleAreas.includes(area) && pillActiveClassName)}
                    key={area}
                    onClick={() => setDraft((current) => ({ ...current, eligibleAreas: toggleValue(current.eligibleAreas, area) }))}
                    type="button"
                  >
                    {area}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className={sectionClassName}>
            <h2 className="text-lg font-black">员工筛选条件</h2>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs font-black text-ink/50">指定员工池</p>
              {draft.eligibleTechnicianIds.length > 0 ? (
                <button className="text-xs font-black text-moss" onClick={() => setDraft((current) => ({ ...current, eligibleTechnicianIds: [] }))} type="button">
                  选择全部
                </button>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {storeTechnicians.map((technician) => (
                <button
                  className={cn(pillClassName, draft.eligibleTechnicianIds.includes(technician.id) && pillActiveClassName)}
                  key={technician.id}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      eligibleTechnicianIds: toggleValue(current.eligibleTechnicianIds, technician.id)
                    }))
                  }
                  type="button"
                >
                  {technician.nickname?.trim() || technician.name}
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-black text-ink/50">
                最低评分
                <select
                  className="mt-1 h-11 w-full rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none focus:border-moss"
                  onChange={(event) => updateNumericDraft(setDraft, "minimumRating", event.target.value)}
                  value={draft.minimumRating}
                >
                  {[0, 4, 4.3, 4.5, 4.8].map((value) => (
                    <option key={value} value={value}>
                      {value === 0 ? "不限制" : `${value.toFixed(1)} 分以上`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-black text-ink/50">
                最低接单率
                <select
                  className="mt-1 h-11 w-full rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none focus:border-moss"
                  onChange={(event) => updateNumericDraft(setDraft, "minimumAcceptRate", event.target.value)}
                  value={draft.minimumAcceptRate}
                >
                  {[0, 85, 90, 95].map((value) => (
                    <option key={value} value={value}>
                      {value === 0 ? "不限制" : `${value}% 以上`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-black text-ink/50">
                最高取消率
                <select
                  className="mt-1 h-11 w-full rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none focus:border-moss"
                  onChange={(event) => updateNumericDraft(setDraft, "maximumCancelRate", event.target.value)}
                  value={draft.maximumCancelRate}
                >
                  {[100, 10, 6, 3].map((value) => (
                    <option key={value} value={value}>
                      {value === 100 ? "不限制" : `${value}% 以下`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-black text-ink/50">
                单员工每日自动派单上限
                <select
                  className="mt-1 h-11 w-full rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none focus:border-moss"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      maxDailyOrdersPerTechnician: event.target.value === "ignore" ? "ignore" : Number(event.target.value)
                    }))
                  }
                  value={draft.maxDailyOrdersPerTechnician}
                >
                  <option value="ignore">不限制</option>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      每天最多 {value} 单
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className={sectionClassName}>
            <h2 className="text-lg font-black">分配策略</h2>
            <div className="mt-4 grid gap-2">
              {([
                ["balanced", "综合平衡", "综合考虑评分、接单率、空闲程度和移动成本。"],
                ["longIdle", "优先长时间空闲", "尽量把单派给今天排班更空的员工。"],
                ["highRating", "优先高评价", "更看重评分与履约稳定度。"],
                ["preferredTechnician", "优先指定员工", "有固定主力员工时优先留单给他。"]
              ] as const).map(([value, title, description]) => (
                <button
                  className={cn(
                    "rounded-[20px] border px-4 py-4 text-left transition",
                    draft.priority === value
                      ? "border-[color:var(--client-primary)] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)]"
                      : "border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_88%,transparent)]"
                  )}
                  key={value}
                  onClick={() => setDraft((current) => ({ ...current, priority: value }))}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-sm font-black">{title}</strong>
                    {draft.priority === value ? <Badge tone="green">当前策略</Badge> : null}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-ink/60">{description}</p>
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-black text-ink/50">
                指定优先员工
                <select
                  className="mt-1 h-11 w-full rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none focus:border-moss"
                  disabled={draft.priority !== "preferredTechnician"}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      preferredTechnicianId: event.target.value ? event.target.value : null
                    }))
                  }
                  value={draft.preferredTechnicianId ?? ""}
                >
                  <option value="">不指定</option>
                  {storeTechnicians.map((technician) => (
                    <option key={technician.id} value={technician.id}>
                      {technician.nickname?.trim() || technician.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-black text-ink/50">
                上门每公里移动时间
                <select
                  className="mt-1 h-11 w-full rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none focus:border-moss"
                  onChange={(event) => setDraft((current) => ({ ...current, travelMinutesPerKm: Number(event.target.value) }))}
                  value={draft.travelMinutesPerKm}
                >
                  {[2, 3, 4, 5, 6].map((value) => (
                    <option key={value} value={value}>
                      {value} 分钟 / km
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 flex items-start justify-between gap-3 rounded-[20px] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-4 py-4">
              <TitleWithInfo
                as="h3"
                className="min-w-0"
                info="开启后，系统只会在员工可上班时段内自动派单；关闭时，仍会优先班次内员工，但必要时允许窗口外回退。"
                label="严格遵守班次窗口说明"
                title="严格遵守班次窗口"
                titleClassName="text-sm font-black"
              />
              <StatusToggleButton checked={draft.strictAvailabilityWindow} className="min-w-[88px] shrink-0" onClick={() => setDraft((current) => ({ ...current, strictAvailabilityWindow: !current.strictAvailabilityWindow }))} />
            </div>
          </section>

          <section className={sectionClassName}>
            <div className="flex items-start justify-between gap-3">
              <TitleWithInfo
                as="h2"
                className="min-w-0"
                info="下面是按当前条件模拟出的自动派单结果。保存后，共享排班仓库会按这套条件持续生成自动派单结果。"
                label="预览结果说明"
                title="预览结果"
                titleClassName="text-lg font-black"
              />
              <Badge tone={draft.enabled ? "green" : "neutral"}>
                {draft.enabled ? "规则已启用" : "当前关闭"}
              </Badge>
            </div>
            <div className="mt-4 space-y-3">
              {previewRows.length > 0 ? (
                previewRows.map(({ schedule, order, technician }) => (
                  <article
                    className="rounded-[20px] bg-[color:color-mix(in_srgb,var(--client-elevated)_90%,transparent)] px-4 py-4"
                    key={schedule.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-black text-moss">{order?.mode === "home" ? "上门服务" : "到店预约"}</p>
                        <h3 className="mt-1 truncate text-sm font-black">{order?.itemName ?? "预约订单"}</h3>
                        <p className="mt-1 text-xs text-ink/55">{order?.bookedAt} · {order?.area} · {order ? yen(order.amount) : ""}</p>
                      </div>
                      {order ? <Badge tone="yellow">{statusLabel(order.status)}</Badge> : null}
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <img alt={technician?.name ?? "员工"} className="avatar-shape h-12 w-12 object-cover" src={technician?.avatar} />
                      <div className="min-w-0 flex-1">
                        <strong className="truncate text-sm font-black">{technician?.nickname?.trim() || technician?.name}</strong>
                        <p className="mt-1 text-xs text-ink/55">★ {technician?.rating} · 接单率 {technician?.acceptRate}% · {schedule.startTime} - {schedule.endTime}</p>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-[20px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] px-4 py-5 text-sm leading-6 text-ink/60">
                  当前条件下还没有可以被自动派出的预约。你可以放宽时间、区域或员工筛选条件再试。
                </div>
              )}
            </div>
          </section>
        </main>

        <MobileBottomActionBar contentClassName="grid grid-cols-2 gap-2">
          <Button className="w-full" onClick={() => setDraft(autoDispatchSettings)} variant="secondary">
            恢复当前规则
          </Button>
          <Button className="w-full" onClick={saveDraft}>
            保存自动派单
          </Button>
        </MobileBottomActionBar>
      </MobileFullscreenPage>
    </MobileShell>
  );
}
