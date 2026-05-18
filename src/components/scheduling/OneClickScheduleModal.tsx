import { useEffect, useState } from "react";
import { MobileFullscreenHeader } from "../mobile/MobileFullscreenHeader";
import { Button } from "../ui/Button";
import { CloseIconButton } from "../ui/CloseIconButton";
import { TitleWithInfo } from "../ui/TitleWithInfo";
import {
  formatFullDateLabel,
  formatRangeDuration,
  getWeekdayLabels,
  type OneClickScheduleConfig,
  type OneClickScheduleSlot,
  type OneClickScheduleCycle
} from "../../lib/oneClickSchedule";
import { useI18n } from "../../i18n/I18nProvider";

export function OneClickScheduleModal({
  open,
  baseDate,
  technicianCount,
  onClose,
  onApply
}: {
  open: boolean;
  baseDate: Date;
  technicianCount: number;
  onClose: () => void;
  onApply: (config: OneClickScheduleConfig) => void;
}) {
  const { language } = useI18n();
  const weekdayLabels = getWeekdayLabels(language);
  const [cycle, setCycle] = useState<OneClickScheduleCycle>("single");
  const [repeatWeeks, setRepeatWeeks] = useState(4);
  const [maxWorkHoursPerDay, setMaxWorkHoursPerDay] = useState<OneClickScheduleConfig["maxWorkHoursPerDay"]>(8);
  const [weekdays, setWeekdays] = useState<number[]>([baseDate.getDay()]);
  const [slots, setSlots] = useState<OneClickScheduleSlot[]>([
    { id: "slot-1", startTime: "10:00", endTime: "14:00", minStaff: 2, maxStaff: 4 },
    { id: "slot-2", startTime: "18:00", endTime: "22:00", minStaff: 2, maxStaff: 5 }
  ]);

  useEffect(() => {
    if (open) {
      setWeekdays([baseDate.getDay()]);
    }
  }, [baseDate, open]);

  if (!open) {
    return null;
  }

  const updateSlot = (slotId: string, changes: Partial<OneClickScheduleSlot>) => {
    setSlots((current) =>
      current.map((slot) =>
        slot.id === slotId
          ? {
              ...slot,
              ...changes,
              minStaff: changes.minStaff ?? slot.minStaff,
              maxStaff: Math.max(changes.minStaff ?? slot.minStaff, changes.maxStaff ?? slot.maxStaff)
            }
          : slot
      )
    );
  };

  const toggleWeekday = (weekday: number) => {
    setWeekdays((current) => {
      if (current.includes(weekday)) {
        return current.filter((item) => item !== weekday);
      }

      return [...current, weekday].sort((left, right) => left - right);
    });
  };

  const selectedWeekdayLabel = weekdays.length > 0
    ? weekdays.map((weekday) => weekdayLabels[weekday]).join(" / ")
    : "未选择";

  return (
    <div className="fixed inset-0 z-[90] bg-black/50">
      <button aria-label="关闭一键排班" className="absolute inset-0" onClick={onClose} type="button" />
      <section className="absolute inset-0 flex flex-col bg-white shadow-soft sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[90vh] sm:w-[min(760px,calc(100vw-24px))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border sm:border-line">
        <div className="sm:hidden">
          <MobileFullscreenHeader
            onClose={onClose}
            subtitle={`基准日期：${formatFullDateLabel(baseDate, language)} · 可排技师 ${technicianCount} 人`}
            title="一键排班"
          />
        </div>
        <div className="hidden gap-3 border-b border-line p-4 sm:flex sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-4">
          <div>
            <p className="text-xs font-black text-moss">一键排班</p>
            <TitleWithInfo
              as="h2"
              className="mt-1"
              info={`基准日期：${formatFullDateLabel(baseDate, language)}。当前可排技师 ${technicianCount} 人，可为同一日期生成多个时间段，也可以按周重复同样班表。`}
              label="排班设定窗口说明"
              title="排班设定窗口"
              titleClassName="text-2xl font-black"
              variant="paper"
            />
          </div>
          <CloseIconButton label="关闭一键排班" onClick={onClose} />
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-28 sm:p-5">
          <div className="space-y-4 sm:grid sm:gap-4 xl:grid-cols-[1fr,280px] xl:space-y-0">
          <section className="rounded-lg border border-line bg-paper p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-black">时间段设定</h3>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setSlots((current) => [
                    ...current,
                    {
                      id: `slot-${current.length + 1}`,
                      startTime: "12:00",
                      endTime: "16:00",
                      minStaff: 1,
                      maxStaff: 3
                    }
                  ])
                }
              >
                新增时段
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {slots.map((slot, index) => (
                <article className="rounded-lg border border-line bg-white p-3" key={slot.id}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <strong className="text-sm">时段 {index + 1}</strong>
                      <p className="mt-1 text-xs font-bold text-ink/45">
                        {slot.startTime} - {slot.endTime} · {formatRangeDuration(slot.startTime, slot.endTime)}
                      </p>
                    </div>
                    {slots.length > 1 ? (
                      <button
                        className="text-xs font-black text-coral"
                        onClick={() => setSlots((current) => current.filter((item) => item.id !== slot.id))}
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
              <button
                className={`w-full rounded-lg border px-4 py-3 text-left text-sm font-black ${cycle === "single" ? "border-moss bg-white text-moss" : "border-line bg-white text-ink/60"}`}
                onClick={() => setCycle("single")}
                type="button"
              >
                仅排这一天
                <span className="mt-1 block text-xs font-bold text-ink/45">只对 {formatFullDateLabel(baseDate, language)} 生效。</span>
              </button>
              <button
                className={`w-full rounded-lg border px-4 py-3 text-left text-sm font-black ${cycle === "weekly" ? "border-moss bg-white text-moss" : "border-line bg-white text-ink/60"}`}
                onClick={() => setCycle("weekly")}
                type="button"
              >
                每周循环同样排班
                <span className="mt-1 block text-xs font-bold text-ink/45">按相同星期复制，适合固定班表。</span>
              </button>
              <label className="block text-xs font-black text-ink/50">
                循环周数
                <select
                  className="mt-1 h-11 w-full rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none focus:border-moss"
                  disabled={cycle !== "weekly"}
                  onChange={(event) => setRepeatWeeks(Number(event.target.value))}
                  value={repeatWeeks}
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
                    const active = weekdays.includes(index);

                    return (
                      <button
                        className={`rounded-full px-0 py-3 text-sm font-black transition ${
                          cycle !== "weekly"
                            ? "cursor-not-allowed border border-line bg-paper text-ink/25"
                            : active
                              ? "border border-moss bg-moss text-white"
                              : "border border-line bg-white text-ink/55 hover:border-moss hover:text-moss"
                        }`}
                        disabled={cycle !== "weekly"}
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
                  {cycle === "weekly"
                    ? `已选择：${selectedWeekdayLabel}。周循环只会生成这些星期的班表。`
                    : `单天模式固定为 ${weekdayLabels[baseDate.getDay()]}，不需要额外选择星期。`}
                </p>
              </div>
              <label className="block text-xs font-black text-ink/50">
                最高工作时间
                <select
                  className="mt-1 h-11 w-full rounded-full border border-line bg-white px-4 text-sm font-black text-ink outline-none focus:border-moss"
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setMaxWorkHoursPerDay(nextValue === "ignore" ? "ignore" : Number(nextValue));
                  }}
                  value={String(maxWorkHoursPerDay)}
                >
                  <option value="ignore">忽略</option>
                  {[4, 6, 8, 10, 12].map((hours) => (
                    <option key={hours} value={hours}>{hours} 小时 / 天</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 rounded-lg bg-white p-3 text-sm leading-6 text-ink/60">
              <p>系统会优先选择当前可见技师，自动避开已有预约、锁定和冲突时间。</p>
              <p className="mt-2">
                {maxWorkHoursPerDay === "ignore"
                  ? "当前会忽略单个技师单天最高工作时间，系统只会继续检查冲突和时段重叠。"
                  : `单个技师单天最多工作 ${maxWorkHoursPerDay} 小时。超过上限后，系统会自动改派给其他人。`}
              </p>
              <p className="mt-2">如果某个时段可用技师少于最低人数，会先优先排入“可上班窗口”内的技师，仍不够时才补入超窗排班，方便你后续检查。</p>
            </div>
          </section>
          </div>
        </main>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-white via-white/95 to-transparent px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-6">
          <div className="flex justify-center">
            <Button
              className="pointer-events-auto h-12 min-w-[240px] px-8 shadow-soft"
              disabled={cycle === "weekly" && weekdays.length === 0}
              onClick={() => onApply({ cycle, repeatWeeks, weekdays: cycle === "single" ? [baseDate.getDay()] : weekdays, maxWorkHoursPerDay, slots })}
            >
              生成班表
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
