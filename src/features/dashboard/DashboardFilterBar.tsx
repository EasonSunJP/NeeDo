import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { DashboardPeriod } from "../../api/backofficeRealData";

export type DashboardFilterValue = {
  period: DashboardPeriod;
  from?: string;
  to?: string;
  city?: string;
};

const periodOptions: Array<{ label: string; value: DashboardPeriod }> = [
  { label: "今日", value: "today" },
  { label: "近 7 天", value: "last7days" },
  { label: "近 30 天", value: "last30days" },
  { label: "本周", value: "week" },
  { label: "本月", value: "month" },
  { label: "今年", value: "year" },
  { label: "自定义日期", value: "custom" }
];

const fieldClassName =
  "h-10 min-w-0 rounded-xl border border-line bg-white px-3 text-sm font-bold text-ink outline-none transition focus-visible:border-moss focus-visible:ring-2 focus-visible:ring-moss/30";

function normalizeValue(value: DashboardFilterValue, hasCityFilter: boolean): DashboardFilterValue {
  return {
    period: value.period || "last7days",
    ...(value.period === "custom" && value.from ? { from: value.from } : {}),
    ...(value.period === "custom" && value.to ? { to: value.to } : {}),
    ...(hasCityFilter && value.city ? { city: value.city } : {})
  };
}

function filterKey(value: DashboardFilterValue, hasCityFilter: boolean) {
  const normalized = normalizeValue(value, hasCityFilter);
  return [normalized.period, normalized.from ?? "", normalized.to ?? "", normalized.city ?? ""].join("|");
}

export function DashboardFilterBar({
  value,
  cities,
  loading,
  onApply,
  onReset
}: {
  value: DashboardFilterValue;
  cities?: string[];
  loading: boolean;
  onApply(value: DashboardFilterValue): void;
  onReset(): void;
}) {
  const hasCityFilter = cities !== undefined;
  const externalKey = useMemo(() => filterKey(value, hasCityFilter), [hasCityFilter, value]);
  const [draft, setDraft] = useState<DashboardFilterValue>(() => normalizeValue(value, hasCityFilter));

  useEffect(() => {
    setDraft(normalizeValue(value, hasCityFilter));
  }, [externalKey, hasCityFilter]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onApply(normalizeValue(draft, hasCityFilter));
  }

  function reset() {
    setDraft({ period: "last7days" });
    onReset();
  }

  return (
    <form
      aria-label="数据大盘筛选"
      className="grid min-w-0 gap-3 rounded-2xl border border-line bg-white p-4 shadow-panel lg:grid-cols-[minmax(150px,0.8fr)_minmax(0,1.6fr)_auto] lg:items-end"
      onSubmit={submit}
    >
      <label className="grid min-w-0 gap-1.5 text-xs font-black text-ink/60">
        统计期间
        <select
          aria-label="统计期间"
          className={fieldClassName}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              period: event.target.value as DashboardPeriod,
              ...(event.target.value === "custom" ? {} : { from: undefined, to: undefined })
            }))
          }
          value={draft.period}
        >
          {periodOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {draft.period === "custom" ? (
          <>
            <label className="grid min-w-0 gap-1.5 text-xs font-black text-ink/60">
              开始日期
              <input
                aria-label="开始日期"
                className={fieldClassName}
                onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
                required
                type="date"
                value={draft.from ?? ""}
              />
            </label>
            <label className="grid min-w-0 gap-1.5 text-xs font-black text-ink/60">
              结束日期
              <input
                aria-label="结束日期"
                className={fieldClassName}
                onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
                required
                type="date"
                value={draft.to ?? ""}
              />
            </label>
          </>
        ) : (
          <p className="self-end rounded-xl bg-paper px-3 py-2.5 text-xs font-bold text-ink/50 sm:col-span-2">
            按东京时区统计
          </p>
        )}

        {hasCityFilter ? (
          <label className="grid min-w-0 gap-1.5 text-xs font-black text-ink/60">
            所属城市
            <select
              aria-label="所属城市"
              className={fieldClassName}
              onChange={(event) =>
                setDraft((current) => ({ ...current, city: event.target.value || undefined }))
              }
              value={draft.city ?? ""}
            >
              <option value="">全部城市</option>
              {cities.map((city) => (
                <option data-no-i18n key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="flex items-center gap-2 lg:justify-end">
        <button
          className="h-10 rounded-full border border-line bg-white px-4 text-sm font-black text-ink transition hover:border-moss focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
          onClick={reset}
          type="button"
        >
          重置
        </button>
        <button
          className="h-10 rounded-full bg-moss px-5 text-sm font-black text-white transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
          type="submit"
        >
          {loading ? "查询中…" : "查询"}
        </button>
      </div>
    </form>
  );
}
