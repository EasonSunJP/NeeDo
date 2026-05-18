import { useEffect, useState } from "react";
import { MobileFullscreenHeader } from "../mobile/MobileFullscreenHeader";
import { StatusToggleButton } from "../mobile/StatusToggleButton";
import { Button } from "../ui/Button";
import { CloseIconButton } from "../ui/CloseIconButton";
import { TitleWithInfo } from "../ui/TitleWithInfo";
import { useI18n } from "../../i18n/I18nProvider";
import { orders } from "../../data/mock";
import { cn } from "../../lib/utils";
import type { AutoDispatchSettings } from "../../state/scheduleStore";
import type { FulfillmentMode, Technician } from "../../types/domain";

const pillClassName =
  "rounded-full border border-line bg-white px-4 py-2 text-sm font-black text-ink/60 transition";
const pillActiveClassName = "border-moss bg-moss text-white";

function toggleValue(values: string[], target: string) {
  return values.includes(target) ? values.filter((value) => value !== target) : [...values, target];
}

export function AutoDispatchModal({
  open,
  settings,
  technicians,
  staffLabel = "技师",
  onClose,
  onSave
}: {
  open: boolean;
  settings: AutoDispatchSettings;
  technicians: Technician[];
  staffLabel?: "技师" | "员工";
  onClose: () => void;
  onSave: (settings: AutoDispatchSettings) => void;
}) {
  const { language } = useI18n();
  const [draft, setDraft] = useState<AutoDispatchSettings>(settings);
  const areaOptions = Array.from(new Set([...orders.map((order) => order.area), ...technicians.flatMap((technician) => technician.serviceAreas)]));

  useEffect(() => {
    if (open) {
      setDraft(settings);
    }
  }, [open, settings]);

  if (!open) {
    return null;
  }

  const priorityCopy = {
    balanced: "综合平衡",
    longIdle: "优先长时间空闲",
    highRating: "优先高评价",
    preferredTechnician: `优先指定${staffLabel}`
  } as const;
  const staffCopy = {
    headerDescription: `开启后，系统会按照你设好的日期区间、时间区间和优先策略，把可自动处理的预约分配给最合适的${staffLabel}。`,
    conditionTitle: `${staffLabel}条件与优先规则`,
    poolLabel: `指定${staffLabel}池`,
    preferredLabel: `指定优先${staffLabel}`,
    maxDailyLabel: `单${staffLabel}每日自动派单上限`,
    strictWindowNote: `开启后，窗口外${staffLabel}不会再参与自动派单候选。`,
    dispatchDescription: `到店服务会优先派给时间冲突最少、评分与接单率更稳的人；如果你选了指定${staffLabel}，会优先把订单留给指定对象。`
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/50">
      <button aria-label="关闭自动派单" className="absolute inset-0" onClick={onClose} type="button" />
      <section className="absolute inset-0 flex flex-col bg-white shadow-soft sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[90vh] sm:w-[min(720px,calc(100vw-24px))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border sm:border-line">
        <div className="sm:hidden">
          <MobileFullscreenHeader
            onClose={onClose}
            subtitle={`${draft.enabled ? "已开启" : "已关闭"} · ${draft.dateFrom} - ${draft.dateTo}`}
            title="自动派单"
          />
        </div>
        <div className="hidden gap-3 border-b border-line p-4 sm:flex sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-4">
          <div>
            <p className="text-xs font-black text-moss">自动派单</p>
            <TitleWithInfo
              as="h2"
              className="mt-1"
              info={staffCopy.headerDescription}
              label="自动化派单规则说明"
              title="自动化派单规则"
              titleClassName="text-2xl font-black"
              variant="paper"
            />
          </div>
          <CloseIconButton label="关闭自动派单" onClick={onClose} />
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-28 sm:p-5">
          <div className="space-y-4">
            <section className="rounded-lg border border-line bg-paper p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <TitleWithInfo
                  as="h3"
                  info="开启后会按下方规则持续检查可派订单，并自动写入共享排班。"
                  label="自动派单开关说明"
                  title="自动派单开关"
                  titleClassName="font-black"
                  variant="paper"
                />
                <StatusToggleButton checked={draft.enabled} onClick={() => setDraft((current) => ({ ...current, enabled: !current.enabled }))} className="min-w-[108px] shadow-soft" />
              </div>
            </section>

            <section className="rounded-lg border border-line bg-paper p-4">
              <h3 className="font-black">处理区间</h3>
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

            <section className="rounded-lg border border-line bg-paper p-4">
              <h3 className="font-black">{staffCopy.conditionTitle}</h3>
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black text-ink/50">{staffCopy.poolLabel}</p>
                  {draft.eligibleTechnicianIds.length > 0 ? (
                    <button className="text-xs font-black text-moss" onClick={() => setDraft((current) => ({ ...current, eligibleTechnicianIds: [] }))} type="button">
                      选择全部
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {technicians.map((technician) => (
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
                      {technician.nickname ? `${technician.nickname} / ${technician.name}` : technician.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-black text-ink/50">
                  最低评分
                  <select
                    className="mt-1 h-11 w-full rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none focus:border-moss"
                    onChange={(event) => setDraft((current) => ({ ...current, minimumRating: Number(event.target.value) }))}
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
                    onChange={(event) => setDraft((current) => ({ ...current, minimumAcceptRate: Number(event.target.value) }))}
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
                    onChange={(event) => setDraft((current) => ({ ...current, maximumCancelRate: Number(event.target.value) }))}
                    value={draft.maximumCancelRate}
                  >
                    {[100, 10, 6, 3].map((value) => (
                      <option key={value} value={value}>
                        {value === 100 ? "不限制" : `${value}% 以下`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-4 grid gap-2">
                {(Object.keys(priorityCopy) as Array<keyof typeof priorityCopy>).map((priority) => (
                  <button
                    className={`rounded-lg border px-4 py-3 text-left text-sm font-black ${
                      draft.priority === priority ? "border-moss bg-white text-moss" : "border-line bg-white text-ink/60"
                    }`}
                    key={priority}
                    onClick={() => setDraft((current) => ({ ...current, priority }))}
                    type="button"
                  >
                    {priorityCopy[priority]}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-black text-ink/50">
                  {staffCopy.preferredLabel}
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
                    {technicians.map((technician) => (
                      <option key={technician.id} value={technician.id}>
                        {technician.nickname ? `${technician.nickname} / ${technician.name}` : technician.name}
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
                    {[2, 3, 4, 5].map((minutes) => (
                      <option key={minutes} value={minutes}>{minutes} 分钟 / km</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-black text-ink/50">
                  {staffCopy.maxDailyLabel}
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
              <div className="mt-3 flex items-start justify-between gap-3 rounded-lg bg-white px-4 py-3">
                <div>
                  <h4 className="text-sm font-black text-ink">严格遵守班次窗口</h4>
                  <p className="mt-1 text-xs leading-5 text-ink/55">{staffCopy.strictWindowNote}</p>
                </div>
                <StatusToggleButton checked={draft.strictAvailabilityWindow} className="min-w-[88px]" onClick={() => setDraft((current) => ({ ...current, strictAvailabilityWindow: !current.strictAvailabilityWindow }))} />
              </div>
            </section>

            <section className="rounded-lg border border-line bg-paper p-4 text-sm leading-6 text-ink/60">
              <h3 className="font-black text-ink">当前自动派单说明</h3>
              <p className="mt-2">{staffCopy.dispatchDescription}</p>
              <p className="mt-2">上门服务会额外把移动时间算进排班，避免表面空闲但实际上赶不到的情况。</p>
              <p className="mt-2">
                {{
                  zh: "保存后会作为共享规则生效，后台管理中心和店铺端排班会看到同一套自动派单结果。",
                  "zh-Hant": "儲存後會作為共享規則生效，後台管理中心和店鋪端排班會看到同一套自動派單結果。",
                  ja: "保存後は共通ルールとして反映され、PF管理センターと店舗端のシフトで同じ結果が見えるようになります。",
                  en: "After saving, the same shared rule will be applied to both the PF management center and the merchant mobile shift view.",
                  ko: "저장 후에는 공통 규칙으로 반영되어 PF 관리 센터와 매장 모바일 근무표에서 동일한 자동 배차 결과를 보게 됩니다."
                }[language]}
              </p>
            </section>
          </div>
        </main>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-white via-white/95 to-transparent px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-6">
          <div className="flex justify-center">
            <Button className="pointer-events-auto h-12 min-w-[240px] px-8 shadow-soft" onClick={() => onSave(draft)}>
              保存自动派单规则
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
