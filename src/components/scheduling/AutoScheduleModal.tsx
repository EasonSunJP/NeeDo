import { useEffect, useState } from "react";
import { MobileFullscreenHeader } from "../mobile/MobileFullscreenHeader";
import { StatusToggleButton } from "../mobile/StatusToggleButton";
import { Button } from "../ui/Button";
import { CloseIconButton } from "../ui/CloseIconButton";
import { TitleWithInfo } from "../ui/TitleWithInfo";
import type { AutoScheduleSettings } from "../../state/scheduleStore";
import { formatFullDateLabel, formatRangeDuration, getWeekdayLabels, type OneClickScheduleSlot } from "../../lib/oneClickSchedule";
import { useI18n } from "../../i18n/I18nProvider";

export function AutoScheduleModal({
  open,
  technicianCount,
  settings,
  onClose,
  onSave
}: {
  open: boolean;
  technicianCount: number;
  settings: AutoScheduleSettings;
  onClose: () => void;
  onSave: (settings: AutoScheduleSettings) => void;
}) {
  const { language } = useI18n();
  const weekdayLabels = getWeekdayLabels(language);
  const [draft, setDraft] = useState<AutoScheduleSettings>(settings);

  useEffect(() => {
    if (open) {
      setDraft(settings);
    }
  }, [open, settings]);

  if (!open) {
    return null;
  }

  const updateSlot = (slotId: string, changes: Partial<OneClickScheduleSlot>) => {
    setDraft((current) => ({
      ...current,
      slots: current.slots.map((slot) =>
        slot.id === slotId
          ? {
              ...slot,
              ...changes,
              minStaff: changes.minStaff ?? slot.minStaff,
              maxStaff: Math.max(changes.minStaff ?? slot.minStaff, changes.maxStaff ?? slot.maxStaff)
            }
          : slot
      )
    }));
  };

  const toggleWeekday = (weekday: number) => {
    setDraft((current) => ({
      ...current,
      weekdays: current.weekdays.includes(weekday)
        ? current.weekdays.filter((item) => item !== weekday)
        : [...current.weekdays, weekday].sort((left, right) => left - right)
    }));
  };

  const selectedWeekdayLabel = draft.weekdays.length > 0 ? draft.weekdays.map((weekday) => weekdayLabels[weekday]).join(" / ") : "未选择";

  return (
    <div className="fixed inset-0 z-[90] bg-black/50">
      <button aria-label="关闭自动排班" className="absolute inset-0" onClick={onClose} type="button" />
      <section className="absolute inset-0 flex flex-col bg-white shadow-soft sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[90vh] sm:w-[min(760px,calc(100vw-24px))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border sm:border-line">
        <div className="sm:hidden">
          <MobileFullscreenHeader
            onClose={onClose}
            subtitle={`基准日期：${formatFullDateLabel(new Date(draft.baseDate), language)} · ${draft.enabled ? "已开启" : "已关闭"}`}
            title="自动排班"
          />
        </div>
        <div className="hidden gap-3 border-b border-line p-4 sm:flex sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-4">
          <div>
            <p className="text-xs font-black text-moss">自动排班</p>
            <TitleWithInfo
              as="h2"
              className="mt-1"
              info={`只要开启，系统就会按设定好的日期、时段、循环规则和最高工作时间自动补排空档。当前可排技师 ${technicianCount} 人。`}
              label="自动化排班规则说明"
              title="自动化排班规则"
              titleClassName="text-2xl font-black"
              variant="paper"
            />
          </div>
          <CloseIconButton label="关闭自动排班" onClick={onClose} />
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-28 sm:p-5">
          <div className="space-y-4">
            <section className="rounded-lg border border-line bg-paper p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <TitleWithInfo
                  as="h3"
                  info="开启后会按下面这套规则持续生成店铺排班；关闭后只保留手动排班。"
                  label="自动排班开关说明"
                  title="自动排班开关"
                  titleClassName="font-black"
                  variant="paper"
                />
                <StatusToggleButton checked={draft.enabled} onClick={() => setDraft((current) => ({ ...current, enabled: !current.enabled }))} className="min-w-[108px] shadow-soft" />
              </div>
            </section>

            <section className="rounded-lg border border-line bg-paper p-4">
              <h3 className="font-black">基准日期</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr,1fr]">
                <label className="text-xs font-black text-ink/50">
                  从这一天开始自动排班
                  <input
                    className="mt-1 h-11 w-full rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none focus:border-moss"
                    onChange={(event) => setDraft((current) => ({ ...current, baseDate: event.target.value }))}
                    type="date"
                    value={draft.baseDate}
                  />
                </label>
                <div className="rounded-lg bg-white p-4 text-sm leading-6 text-ink/60">
                  当前会从 <strong className="text-ink">{draft.baseDate}</strong> 开始，按设定好的周循环和星期规则补排班表。
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-line bg-paper p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="font-black">时段设定</h3>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      slots: [
                        ...current.slots,
                        { id: `slot-${current.slots.length + 1}`, startTime: "12:00", endTime: "16:00", minStaff: 1, maxStaff: 3 }
                      ]
                    }))
                  }
                >
                  新增时段
                </Button>
              </div>
              <div className="mt-4 space-y-3">
                {draft.slots.map((slot, index) => (
                  <article className="rounded-lg border border-line bg-white p-3" key={slot.id}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <strong className="text-sm">时段 {index + 1}</strong>
                        <p className="mt-1 text-xs font-bold text-ink/45">
                          {slot.startTime} - {slot.endTime} · {formatRangeDuration(slot.startTime, slot.endTime)}
                        </p>
                      </div>
                      {draft.slots.length > 1 ? (
                        <button
                          className="text-xs font-black text-coral"
                          onClick={() => setDraft((current) => ({ ...current, slots: current.slots.filter((item) => item.id !== slot.id) }))}
                          type="button"
                        >
                          删除
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <label className="text-xs font-black text-ink/50">
                        开始
                        <input
                          className="mt-1 h-11 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none focus:border-moss"
                          onChange={(event) => updateSlot(slot.id, { startTime: event.target.value })}
                          type="time"
                          value={slot.startTime}
                        />
                      </label>
                      <label className="text-xs font-black text-ink/50">
                        结束
                        <input
                          className="mt-1 h-11 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none focus:border-moss"
                          onChange={(event) => updateSlot(slot.id, { endTime: event.target.value })}
                          type="time"
                          value={slot.endTime}
                        />
                      </label>
                      <label className="text-xs font-black text-ink/50">
                        至少人数
                        <input
                          className="mt-1 h-11 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none focus:border-moss"
                          max={technicianCount}
                          min={1}
                          onChange={(event) => updateSlot(slot.id, { minStaff: Number(event.target.value) || 1 })}
                          type="number"
                          value={slot.minStaff}
                        />
                      </label>
                      <label className="text-xs font-black text-ink/50">
                        最多人数
                        <input
                          className="mt-1 h-11 w-full rounded-full border border-line bg-paper px-4 text-sm font-black text-ink outline-none focus:border-moss"
                          max={technicianCount}
                          min={slot.minStaff}
                          onChange={(event) => updateSlot(slot.id, { maxStaff: Number(event.target.value) || slot.minStaff })}
                          type="number"
                          value={slot.maxStaff}
                        />
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-line bg-paper p-4">
              <h3 className="font-black">循环规则</h3>
              <div className="mt-4 space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    className={`w-full rounded-lg border px-4 py-3 text-left text-sm font-black ${draft.cycle === "single" ? "border-moss bg-white text-moss" : "border-line bg-white text-ink/60"}`}
                    onClick={() => setDraft((current) => ({ ...current, cycle: "single" }))}
                    type="button"
                  >
                    仅排这一天
                  </button>
                  <button
                    className={`w-full rounded-lg border px-4 py-3 text-left text-sm font-black ${draft.cycle === "weekly" ? "border-moss bg-white text-moss" : "border-line bg-white text-ink/60"}`}
                    onClick={() => setDraft((current) => ({ ...current, cycle: "weekly" }))}
                    type="button"
                  >
                    每周循环同样排班
                  </button>
                </div>
                <label className="block text-xs font-black text-ink/50">
                  循环周数
                  <select
                    className="mt-1 h-11 w-full rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none focus:border-moss"
                    disabled={draft.cycle !== "weekly"}
                    onChange={(event) => setDraft((current) => ({ ...current, repeatWeeks: Number(event.target.value) }))}
                    value={draft.repeatWeeks}
                  >
                    {[2, 4, 6, 8].map((week) => (
                      <option key={week} value={week}>{week} 周</option>
                    ))}
                  </select>
                </label>
                <div>
                  <p className="text-xs font-black text-ink/50">星期几</p>
                  <div className="mt-2 grid grid-cols-7 gap-2">
                    {weekdayLabels.map((label, index) => {
                      const active = draft.weekdays.includes(index);

                      return (
                        <button
                          className={`rounded-full px-0 py-3 text-sm font-black transition ${
                            draft.cycle !== "weekly"
                              ? "cursor-not-allowed border border-line bg-paper text-ink/25"
                              : active
                                ? "border border-moss bg-moss text-white"
                                : "border border-line bg-white text-ink/55 hover:border-moss hover:text-moss"
                          }`}
                          disabled={draft.cycle !== "weekly"}
                          key={label}
                          onClick={() => toggleWeekday(index)}
                          type="button"
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-ink/45">
                    {draft.cycle === "weekly" ? `已选择：${selectedWeekdayLabel}` : "单天模式固定使用基准日期，不需要额外选择星期。"}
                  </p>
                </div>
                <label className="block text-xs font-black text-ink/50">
                  最高工作时间
                  <select
                    className="mt-1 h-11 w-full rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none focus:border-moss"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        maxWorkHoursPerDay: event.target.value === "ignore" ? "ignore" : Number(event.target.value)
                      }))
                    }
                    value={String(draft.maxWorkHoursPerDay)}
                  >
                    <option value="ignore">忽略</option>
                    {[4, 6, 8, 10, 12].map((hours) => (
                      <option key={hours} value={hours}>{hours} 小时 / 天</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
          </div>
        </main>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-white via-white/95 to-transparent px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-6">
          <div className="flex justify-center">
            <Button
              className="pointer-events-auto h-12 min-w-[240px] px-8 shadow-soft"
              disabled={draft.cycle === "weekly" && draft.weekdays.length === 0}
              onClick={() => onSave(draft)}
            >
              保存自动排班规则
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
