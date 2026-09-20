import { useMemo } from "react";
import type { ScheduleViewSegmentedValue } from "../../../components/client-ui/AppScaffold";
import { useI18n } from "../../../i18n/I18nProvider";
import { translateText } from "../../../i18n/translations";
import { cn } from "../../../lib/utils";
import type { BookingScheduleSlot } from "../../booking/api";
import { ScheduleStatusChart } from "../../dashboard/ScheduleStatusChart";
import { buildFormalScheduleStatusStatistics } from "../../scheduling/formalScheduleStatistics";

function compactRange(start: string, end: string) {
  return `${start.slice(5).replace("-", ".")} - ${end.slice(5).replace("-", ".")}`;
}

export default function FormalScheduleOverviewMetrics({
  cardClass,
  cycleRange,
  dateKey,
  fallbackConfirmedDayLabel,
  fallbackConfirmedOrderLabel,
  fallbackTechnicianCountLabel,
  formalScheduleAvailable,
  labelTextClass,
  loading,
  modeLabel,
  slots,
  technicianCount,
  usesFormalMerchantSchedule,
  view
}: {
  cardClass: string;
  cycleRange: { periodEnd: string; periodStart: string };
  dateKey: string;
  fallbackConfirmedDayLabel: string;
  fallbackConfirmedOrderLabel: string;
  fallbackTechnicianCountLabel: string;
  formalScheduleAvailable: boolean;
  labelTextClass: string;
  loading: boolean;
  modeLabel: string;
  slots: BookingScheduleSlot[];
  technicianCount: number;
  usesFormalMerchantSchedule: boolean;
  view: ScheduleViewSegmentedValue;
}) {
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);
  const statistics = useMemo(
    () => buildFormalScheduleStatusStatistics({ cycleRange, dateKey, slots, view }),
    [cycleRange, dateKey, slots, view]
  );
  const cards = [
    ["排班人员", formalScheduleAvailable ? `${statistics.summary.scheduledTechnicianCount}/${technicianCount}` : fallbackTechnicianCountLabel],
    ["确定天数", formalScheduleAvailable ? `${statistics.summary.scheduledDayCount}/${statistics.range.dayCount} 天` : fallbackConfirmedDayLabel],
    [usesFormalMerchantSchedule ? "有预约时段" : "确定订单", formalScheduleAvailable ? `${statistics.summary.bookedSlotCount}` : fallbackConfirmedOrderLabel]
  ];

  return <>
    <div className="grid grid-cols-2 gap-2 text-sm font-black text-ink">
      <div className={cn("rounded-[18px] border px-3 py-2.5", cardClass)}><p className={cn("text-[10px] uppercase tracking-[0.14em]", labelTextClass)}>周期</p><p className="mt-1 text-[15px]">{loading ? t("加载中") : compactRange(statistics.range.start, statistics.range.end)}</p></div>
      <div className={cn("rounded-[18px] border px-3 py-2.5", cardClass)}><p className={cn("text-[10px] uppercase tracking-[0.14em]", labelTextClass)}>模式</p><p className="mt-1 truncate text-[15px]">{modeLabel}</p></div>
    </div>
    <div className="grid grid-cols-3 gap-2">
      {cards.map(([label, value]) => <article className="min-w-0 rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-3 py-2.5" key={label}><p className={cn("truncate text-[10px] font-black leading-none", labelTextClass)}>{label}</p><strong className="mt-2 block truncate text-[14px] font-black leading-none text-ink">{loading ? t("加载中") : value}</strong></article>)}
    </div>
    <ScheduleStatusChart buckets={statistics.buckets} description={t("空闲、已预约时长与出勤人数")} title={t("排班状态")} />
  </>;
}
