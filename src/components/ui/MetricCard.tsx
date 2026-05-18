import { cn } from "../../lib/utils";
import type { Metric } from "../../types/domain";

const tones = {
  good: "text-[#2f6846]",
  warn: "text-[#9a6f00]",
  bad: "text-[#a63f32]",
  neutral: "text-ink/60"
};

export function MetricCard({ metric, dense = false }: { metric: Metric; dense?: boolean }) {
  return (
    <article className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink/60">{metric.label}</p>
        <span className={cn("rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-semibold", tones[metric.tone])}>
          {metric.change}
        </span>
      </div>
      <strong className={cn("mt-3 block font-bold tracking-[-0.03em] text-ink", dense ? "text-xl" : "text-2xl")}>{metric.value}</strong>
    </article>
  );
}
