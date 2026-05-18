import { useMemo, useState } from "react";
import { TitleWithInfo } from "../../../components/ui/TitleWithInfo";
import { cn } from "../../../lib/utils";

const weekLabels = ["日", "月", "火", "水", "木", "金", "土"];

const recentTwoWeekSlots = Array.from({ length: 14 }, (_, index) => {
  const day = index + 14;
  const week = weekLabels[new Date(2026, 3, day).getDay()];
  const marks = ["◎", "○", "○", "△", "○", "○", "TEL", "○", "◎", "△", "○", "○", "○", "△"];

  return {
    day,
    week,
    mark: marks[index],
    left: index % 4 === 0 ? "余裕あり" : index % 4 === 1 ? "残り 4 枠" : index % 4 === 2 ? "残り 2 枠" : "要確認"
  };
});

export function RecentTwoWeekAvailability({
  selectedDay,
  onSelectDay,
  onOpenMonth,
  title = "最近两周预约",
  caption = "◎ 余裕あり · ○ 可预约 · △ 少量空位 · TEL 请咨询"
}: {
  selectedDay?: number;
  onSelectDay?: (day: number) => void;
  onOpenMonth?: () => void;
  title?: string;
  caption?: string;
}) {
  const [internalSelectedDay, setInternalSelectedDay] = useState(recentTwoWeekSlots[0]?.day ?? 14);
  const resolvedSelectedDay = selectedDay ?? internalSelectedDay;
  const selectedSlot = useMemo(
    () => recentTwoWeekSlots.find((slot) => slot.day === resolvedSelectedDay),
    [resolvedSelectedDay]
  );

  const handleSelectDay = (day: number) => {
    if (onSelectDay) {
      onSelectDay(day);
      return;
    }

    setInternalSelectedDay(day);
  };

  return (
    <section className="rounded-[28px] bg-[#11110f] p-5 text-white shadow-soft">
      <TitleWithInfo
        as="h3"
        info={caption}
        infoClassName="h-5 w-5 text-[11px]"
        label={`${title} 说明`}
        title={title}
        titleClassName="text-2xl font-black"
        variant="dark"
      />

      <div className="mt-5 grid grid-cols-7 gap-2">
        {recentTwoWeekSlots.map((slot) => (
          <button
            className={cn(
              "focus-ring flex min-h-[82px] flex-col items-center justify-center rounded-lg border px-1 py-2 text-center transition",
              resolvedSelectedDay === slot.day ? "border-lemon bg-lemon/25 text-lemon" : "border-[#2d2819] bg-black text-white"
            )}
            key={slot.day}
            onClick={() => handleSelectDay(slot.day)}
            type="button"
          >
            <span className={cn("text-xs font-black", slot.week === "日" && "text-coral", slot.week === "土" && "text-[#3a91df]")}>{slot.week}</span>
            <strong className="mt-1 text-lg">{slot.day}</strong>
            <span className={cn("mt-1 text-sm font-black", slot.mark === "TEL" ? "text-[#b9b2a2]" : "text-[#f08a00]")}>{slot.mark}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 rounded-lg bg-black px-4 py-4">
        <p className="text-sm font-black text-[#b9b2a2]">
          4 月 {resolvedSelectedDay} 日：<span className="text-white">{selectedSlot?.left ?? "可预约"}</span>
        </p>
        {onOpenMonth ? (
          <button className="rounded-full bg-[#17130b] px-4 py-3 text-sm font-black text-lemon shadow-panel" onClick={onOpenMonth} type="button">
            更多预约情况
          </button>
        ) : null}
      </div>
    </section>
  );
}
