import { useEffect, useState } from "react";
import { MobileFullscreenHeader } from "../mobile/MobileFullscreenHeader";
import { Button } from "../ui/Button";
import {
  formatFullDateLabel,
  formatRangeDuration,
  getWeekdayLabels,
  type OneClickScheduleCycle
} from "../../lib/oneClickSchedule";
import { useI18n } from "../../i18n/I18nProvider";

export type TechnicianScheduleSetupType = "availability" | "leave" | "locked";

export type TechnicianScheduleSetupSlot = {
  id: string;
  startTime: string;
  endTime: string;
};

export type TechnicianScheduleSetupConfig = {
  type: TechnicianScheduleSetupType;
  cycle: OneClickScheduleCycle;
  repeatWeeks: number;
  weekdays: number[];
  note: string;
  slots: TechnicianScheduleSetupSlot[];
};

const setupCopy: Record<TechnicianScheduleSetupType, { title: string; caption: string; defaultNote: string }> = {
  availability: {
    title: "可接单 / 可出勤",
    caption: "设定你预计可以接受工作、允许店铺安排或愿意出勤的时段。",
    defaultNote: "技师本人开放的可接单时段"
  },
  leave: {
    title: "请假",
    caption: "请假时段会整段锁住，店铺不能再安排工作。",
    defaultNote: "技师本人请假"
  },
  locked: {
    title: "锁定",
    caption: "锁定时段用于保留培训、移动或私人安排，不允许被覆盖。",
    defaultNote: "技师本人锁定时段"
  }
};

function getDefaultSlots(type: TechnicianScheduleSetupType) {
  if (type === "leave") {
    return [{ id: "slot-1", startTime: "00:00", endTime: "23:59" }];
  }

  if (type === "locked") {
    return [{ id: "slot-1", startTime: "18:00", endTime: "22:00" }];
  }

  return [{ id: "slot-1", startTime: "10:00", endTime: "18:00" }];
}

export function TechnicianScheduleSetupModal({
  open,
  baseDate,
  initialType,
  onClose,
  onApply
}: {
  open: boolean;
  baseDate: Date;
  initialType: TechnicianScheduleSetupType;
  onClose: () => void;
  onApply: (config: TechnicianScheduleSetupConfig) => void;
}) {
  const { language } = useI18n();
  const weekdayLabels = getWeekdayLabels(language);
  const [type, setType] = useState<TechnicianScheduleSetupType>(initialType);
  const [cycle, setCycle] = useState<OneClickScheduleCycle>("single");
  const [repeatWeeks, setRepeatWeeks] = useState(4);
  const [weekdays, setWeekdays] = useState<number[]>([baseDate.getDay()]);
  const [note, setNote] = useState(setupCopy[initialType].defaultNote);
  const [slots, setSlots] = useState<TechnicianScheduleSetupSlot[]>(getDefaultSlots(initialType));

  useEffect(() => {
    if (!open) {
      return;
    }

    setType(initialType);
    setCycle("single");
    setRepeatWeeks(4);
    setWeekdays([baseDate.getDay()]);
    setNote(setupCopy[initialType].defaultNote);
    setSlots(getDefaultSlots(initialType));
  }, [baseDate, initialType, open]);

  if (!open) {
    return null;
  }

  const updateSlot = (slotId: string, changes: Partial<TechnicianScheduleSetupSlot>) => {
    setSlots((current) =>
      current.map((slot) => (
        slot.id === slotId
          ? { ...slot, ...changes }
          : slot
      ))
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

  const canApply = slots.every((slot) => slot.endTime > slot.startTime) && (cycle === "single" || weekdays.length > 0);
  const selectedWeekdayLabel = weekdays.length > 0 ? weekdays.map((weekday) => weekdayLabels[weekday]).join(" / ") : "未选择";

  return (
    <div className="fixed inset-0 z-[90] bg-black/55">
      <button aria-label="关闭排班设定" className="absolute inset-0" onClick={onClose} type="button" />
      <section className="relative mx-auto flex h-full w-full max-w-[480px] flex-col overflow-hidden bg-white text-ink shadow-soft sm:my-6 sm:h-[calc(100%-48px)] sm:rounded-[24px] sm:border sm:border-line">
        <MobileFullscreenHeader
          info={setupCopy[type].caption}
          onClose={onClose}
          title={setupCopy[type].title}
        />

        <main className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-28">
          <section className="rounded-lg border border-line bg-paper p-4">
            <div className="grid grid-cols-3 gap-2">
              {([
                ["availability", "可接单"],
                ["leave", "请假"],
                ["locked", "锁定"]
              ] as Array<[TechnicianScheduleSetupType, string]>).map(([itemType, label]) => (
                <button
                  className={`rounded-full px-3 py-3 text-sm font-black ${
                    type === itemType ? "bg-moss text-white" : "bg-white text-ink/60"
                  }`}
                  key={itemType}
                  onClick={() => {
                    setType(itemType);
                    setNote(setupCopy[itemType].defaultNote);
                    setSlots(getDefaultSlots(itemType));
                  }}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-ink/55">{setupCopy[type].caption}</p>
          </section>

          <section className="rounded-lg border border-line bg-paper p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-black">时段设定</h3>
                <p className="mt-1 text-xs text-ink/45">基准日期：{formatFullDateLabel(baseDate, language)}</p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setSlots((current) => [...current, { id: `slot-${current.length + 1}`, startTime: "12:00", endTime: "16:00" }])}
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
                  <div className="mt-3 grid grid-cols-2 gap-3">
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
                只设这一天
                <span className="mt-1 block text-xs font-bold text-ink/45">仅对 {formatFullDateLabel(baseDate, language)} 生效。</span>
              </button>
              <button
                className={`w-full rounded-lg border px-4 py-3 text-left text-sm font-black ${cycle === "weekly" ? "border-moss bg-white text-moss" : "border-line bg-white text-ink/60"}`}
                onClick={() => setCycle("weekly")}
                type="button"
              >
                按周循环
                <span className="mt-1 block text-xs font-bold text-ink/45">适合固定的出勤、请假和锁定规则。</span>
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
                    ? `已选择：${selectedWeekdayLabel}。只会把这些星期加入排班。`
                    : `单天模式固定为 ${weekdayLabels[baseDate.getDay()]}。`}
                </p>
              </div>
              <label className="block text-xs font-black text-ink/50">
                备注
                <textarea
                  className="mt-1 min-h-[110px] w-full rounded-lg border border-line bg-white px-3 py-3 text-sm leading-6 outline-none"
                  onChange={(event) => setNote(event.target.value)}
                  value={note}
                />
              </label>
            </div>
          </section>
        </main>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-white via-white/95 to-transparent px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-6">
          <div className="flex justify-center">
            <Button
              className="pointer-events-auto h-12 min-w-[240px] px-8 shadow-soft"
              disabled={!canApply}
              onClick={() => onApply({ type, cycle, repeatWeeks, weekdays: cycle === "single" ? [baseDate.getDay()] : weekdays, note, slots })}
            >
              保存排班设定
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
