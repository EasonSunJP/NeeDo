import { useEffect, useMemo, useRef, useState } from "react";
import { trendData } from "../../data/mock";
import { useI18n } from "../../i18n/I18nProvider";
import { type Language } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import { Button } from "../ui/Button";
import { HorizontalScrollArea } from "../ui/HorizontalScrollArea";
import { TitleWithInfo } from "../ui/TitleWithInfo";

type SeriesKey = "revenue" | "users" | "avgOrder";
type ChartType = "bar" | "line";
type DetailedRow = (typeof trendData)[number] & {
  actualRevenue: number;
  actualOrders: number;
  actualUsers: number;
  conversion: number;
  avgOrder: number;
};
type HourlyRow = {
  hour: string;
  traffic: number;
  orders: number;
  revenue: number;
  avgOrder: number;
};
type SeriesStats = {
  max: number;
  min: number;
  latest: number;
  growth: number;
  peak: DetailedRow;
};

const seriesOrder: SeriesKey[] = ["revenue", "users", "avgOrder"];
const lineChartFallbackWidth = 640;
const lineChartHeight = 300;
const lineChartPadding = {
  top: 34,
  right: 20,
  bottom: 38,
  left: 30
};
const lineChartPlotHeight = lineChartHeight - lineChartPadding.top - lineChartPadding.bottom;

const seriesMeta: Record<SeriesKey, { label: string; color: string; soft: string }> = {
  revenue: {
    label: "流水",
    color: "var(--admin-accent, #2f75ff)",
    soft: "color-mix(in srgb, var(--admin-accent, #2f75ff) 18%, transparent)"
  },
  users: {
    label: "客流量",
    color: "var(--admin-danger, #f25a68)",
    soft: "color-mix(in srgb, var(--admin-danger, #f25a68) 18%, transparent)"
  },
  avgOrder: {
    label: "客单价",
    color: "var(--admin-warning, #f4a840)",
    soft: "color-mix(in srgb, var(--admin-warning, #f4a840) 20%, transparent)"
  }
};

const numberLocales: Record<Language, string> = {
  zh: "zh-CN",
  "zh-Hant": "zh-Hant",
  ja: "ja-JP",
  en: "en-US",
  ko: "ko-KR"
};

function formatPeople(value: number, language: Language) {
  const formatted = value.toLocaleString(numberLocales[language]);

  if (language === "en") {
    return `${formatted} people`;
  }

  return `${formatted}${language === "ja" ? "名" : language === "ko" ? "명" : "人"}`;
}

function formatCurrency(value: number, language: Language) {
  return `¥${Math.round(value).toLocaleString(numberLocales[language])}`;
}

function formatSeriesValue(series: SeriesKey, value: number, language: Language) {
  if (series === "revenue") {
    return `¥${(value / 10).toFixed(1)}M`;
  }

  return series === "avgOrder" ? formatCurrency(value, language) : formatPeople(Math.round(value * 10), language);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function sortSeries(series: SeriesKey[]) {
  return seriesOrder.filter((item) => series.includes(item));
}

function getSeriesValue(row: DetailedRow, series: SeriesKey) {
  return row[series];
}

function getHourlySeriesValue(row: HourlyRow, series: SeriesKey) {
  if (series === "users") {
    return row.traffic;
  }

  return row[series];
}

function normalizeValue(value: number, min: number, max: number) {
  if (max === min) {
    return 62;
  }

  return 14 + ((value - min) / (max - min)) * 86;
}

function getLineChartPlotWidth(width: number) {
  return Math.max(1, width - lineChartPadding.left - lineChartPadding.right);
}

function getPoint(row: DetailedRow, series: SeriesKey, stats: SeriesStats, index: number, total: number, chartWidth: number) {
  const x = lineChartPadding.left + (index / Math.max(1, total - 1)) * getLineChartPlotWidth(chartWidth);
  const y = lineChartPadding.top + lineChartPlotHeight - (normalizeValue(getSeriesValue(row, series), stats.min, stats.max) / 100) * lineChartPlotHeight;

  return { x, y };
}

export function ChartPanel({
  title,
  caption,
  series = "revenue",
  defaultSeries
}: {
  title: string;
  caption?: string;
  series?: SeriesKey;
  defaultSeries?: SeriesKey[];
}) {
  const { language } = useI18n();
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [selectedSeries, setSelectedSeries] = useState<SeriesKey[]>(() => sortSeries(defaultSeries?.length ? defaultSeries : [series]));
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const lineChartHostRef = useRef<HTMLDivElement | null>(null);
  const [lineChartWidth, setLineChartWidth] = useState(lineChartFallbackWidth);

  const detailedRows = useMemo<DetailedRow[]>(
    () =>
      trendData.map((item, index) => {
        const revenue = item.revenue * 100000;
        const orders = item.orders * 10;
        const users = item.users * 10;
        const conversion = 12.4 + index * 0.7 + (item.orders - item.users) * 0.03;

        return {
          ...item,
          actualRevenue: revenue,
          actualOrders: orders,
          actualUsers: users,
          conversion,
          avgOrder: revenue / orders
        };
      }),
    []
  );

  const selectedRow = detailedRows.find((item) => item.label === selectedLabel) ?? null;
  const seriesStats = useMemo(
    () =>
      seriesOrder.reduce(
        (result, item) => {
          const values = detailedRows.map((row) => getSeriesValue(row, item));
          const max = Math.max(...values);
          const min = Math.min(...values);
          const peak = detailedRows.reduce((best, row) => (getSeriesValue(row, item) > getSeriesValue(best, item) ? row : best), detailedRows[0]);
          const latest = values[values.length - 1];
          const growth = ((latest - values[0]) / values[0]) * 100;

          result[item] = { max, min, latest, growth, peak };

          return result;
        },
        {} as Record<SeriesKey, SeriesStats>
      ),
    [detailedRows]
  );
  const totalTraffic = detailedRows.reduce((sum, item) => sum + item.actualUsers, 0);
  const totalRevenue = detailedRows.reduce((sum, item) => sum + item.actualRevenue, 0);
  const totalOrders = detailedRows.reduce((sum, item) => sum + item.actualOrders, 0);
  const averageOrderValue = totalRevenue / totalOrders;

  const hourlyData = useMemo<HourlyRow[]>(() => {
    if (!selectedRow) {
      return [];
    }

    const rawWeights = Array.from({ length: 24 }, (_, hour) => {
      const lunchPeak = Math.exp(-Math.pow(hour - 12, 2) / 18);
      const eveningPeak = Math.exp(-Math.pow(hour - 20, 2) / 14);
      const lateNight = hour >= 22 ? 0.38 : 0;

      return 0.22 + lunchPeak * 0.85 + eveningPeak * 1.45 + lateNight;
    });
    const totalWeight = rawWeights.reduce((sum, value) => sum + value, 0);

    return rawWeights.map((weight, hour) => {
      const share = weight / totalWeight;
      const traffic = Math.max(2, Math.round(selectedRow.actualUsers * share));
      const orders = Math.max(1, Math.round(selectedRow.actualOrders * share));
      const revenue = Math.round(selectedRow.actualRevenue * share);

      return {
        hour: `${String(hour).padStart(2, "0")}:00`,
        traffic,
        orders,
        revenue,
        avgOrder: revenue / orders
      };
    });
  }, [selectedRow]);

  const hourlyStats = useMemo(
    () =>
      seriesOrder.reduce(
        (result, item) => {
          const values = hourlyData.map((row) => getHourlySeriesValue(row, item));
          result[item] = {
            max: Math.max(1, ...values),
            min: values.length ? Math.min(...values) : 0
          };

          return result;
        },
        {} as Record<SeriesKey, { max: number; min: number }>
      ),
    [hourlyData]
  );

  const toggleSeries = (item: SeriesKey) => {
    setSelectedSeries((current) => {
      if (current.includes(item)) {
        return current.length === 1 ? current : current.filter((selected) => selected !== item);
      }

      return sortSeries([...current, item]);
    });
  };

  useEffect(() => {
    const host = lineChartHostRef.current;

    if (!host) {
      return;
    }

    const syncWidth = () => {
      setLineChartWidth(Math.max(320, Math.round(host.clientWidth)));
    };

    syncWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncWidth);

      return () => window.removeEventListener("resize", syncWidth);
    }

    const observer = new ResizeObserver(syncWidth);

    observer.observe(host);

    return () => observer.disconnect();
  }, [chartType]);

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <TitleWithInfo
          as="h2"
          info={caption}
          label={`${title}说明`}
          title={title}
          titleClassName="font-bold"
          variant="paper"
        />
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-ink/55">
          {(["bar", "line"] as ChartType[]).map((type) => (
            <button
              aria-label={type === "bar" ? "柱状图" : "折线图"}
              className={cn("grid h-8 w-8 place-items-center rounded-md font-bold", chartType === type ? "bg-ink text-white" : "bg-paper text-ink/55")}
              key={type}
              onClick={() => setChartType(type)}
              title={type === "bar" ? "柱状图" : "折线图"}
              type="button"
            >
              {type === "bar" ? (
                <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <path d="M5 19V9M12 19V5M19 19v-7" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
                </svg>
              ) : (
                <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <path d="m4 16 5-5 4 3 7-8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
                  <path d="M4 20h16" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
                </svg>
              )}
            </button>
          ))}
          {seriesOrder.map((item) => {
            const selected = selectedSeries.includes(item);

            return (
              <button
                className={cn("rounded-md px-2 py-1 font-bold transition", selected ? "bg-moss text-white" : "bg-paper text-ink/55")}
                key={item}
                onClick={() => toggleSeries(item)}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="mr-1 inline-block size-2 rounded-full align-middle"
                  style={{ background: selected ? "#ffffff" : seriesMeta[item].color }}
                />
                {seriesMeta[item].label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {[
          ["客流量", formatPeople(totalTraffic, language), "周期累计访问/下单客流"],
          ["流水", formatCurrency(totalRevenue, language), "已支付与定金合计"],
          ["客单价", formatCurrency(averageOrderValue, language), "流水 / 订单数"]
        ].map(([label, value, hint]) => (
          <article className="rounded-lg border border-line bg-paper p-3" key={label}>
            <p className="text-xs font-bold text-ink/50">{label}</p>
            <strong className="mt-1 block text-lg text-ink" data-no-i18n>
              {value}
            </strong>
            <p className="mt-1 text-xs text-ink/50">{hint}</p>
          </article>
        ))}
      </div>

      {chartType === "bar" ? (
        <div className="mt-6 rounded-lg border border-line bg-white p-4">
          <div className="flex h-64 items-end gap-3">
            {detailedRows.map((item) => (
              <button
                className="focus-ring flex min-w-0 flex-1 flex-col items-center gap-2 rounded-lg px-1 py-2 transition hover:bg-paper"
                key={item.label}
                onClick={() => setSelectedLabel(item.label)}
                type="button"
              >
                <div
                  className={cn(
                    "flex h-44 w-full max-w-16 items-end gap-1 rounded-md bg-paper p-1",
                    selectedLabel === item.label && "ring-2 ring-coral ring-offset-2"
                  )}
                >
                  {selectedSeries.map((metric) => {
                    const height = normalizeValue(getSeriesValue(item, metric), seriesStats[metric].min, seriesStats[metric].max);

                    return (
                      <span
                        aria-hidden="true"
                        className="min-w-1 flex-1 rounded-t-md transition-all"
                        key={metric}
                        style={{
                          background: seriesMeta[metric].color,
                          boxShadow: `0 0 0 1px ${seriesMeta[metric].soft}`,
                          height: `${height}%`
                        }}
                      />
                    );
                  })}
                </div>
                <span className={cn("text-xs font-semibold", selectedLabel === item.label ? "text-coral" : "text-ink/50")}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-line bg-white p-4">
          <div className="min-w-0" ref={lineChartHostRef}>
            <svg
              className="block h-[300px] w-full overflow-visible"
              height={lineChartHeight}
              viewBox={`0 0 ${lineChartWidth} ${lineChartHeight}`}
              role="img"
              width="100%"
            >
            {[0, 1, 2, 3, 4].map((line) => {
              const y = lineChartPadding.top + (lineChartPlotHeight * line) / 4;

              return (
                <line
                  key={line}
                  stroke="currentColor"
                  strokeDasharray="3 5"
                  strokeOpacity="0.22"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  x1={lineChartPadding.left - 6}
                  x2={lineChartWidth - lineChartPadding.right}
                  y1={y}
                  y2={y}
                />
              );
            })}
            {selectedSeries.map((metric) => (
              <polyline
                fill="none"
                key={metric}
                points={detailedRows
                  .map((item, index) => {
                    const { x, y } = getPoint(item, metric, seriesStats[metric], index, detailedRows.length, lineChartWidth);

                    return `${x},${y}`;
                  })
                  .join(" ")}
                stroke={seriesMeta[metric].color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="4"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {detailedRows.map((item, index) => {
              const x = lineChartPadding.left + (index / Math.max(1, detailedRows.length - 1)) * getLineChartPlotWidth(lineChartWidth);

              return (
                <g
                  className="cursor-pointer outline-none"
                  key={item.label}
                  onClick={() => setSelectedLabel(item.label)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      setSelectedLabel(item.label);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <rect fill="transparent" height={lineChartPlotHeight + 16} width="56" x={x - 28} y={lineChartPadding.top - 8} />
                  {selectedLabel === item.label && (
                    <line
                      stroke="currentColor"
                      strokeDasharray="3 5"
                      strokeOpacity="0.34"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                      x1={x}
                      x2={x}
                      y1={lineChartPadding.top}
                      y2={lineChartPadding.top + lineChartPlotHeight}
                    />
                  )}
                  {selectedSeries.map((metric) => {
                    const point = getPoint(item, metric, seriesStats[metric], index, detailedRows.length, lineChartWidth);

                    return (
                      <circle
                        cx={point.x}
                        cy={point.y}
                        fill={seriesMeta[metric].color}
                        key={metric}
                        r={selectedLabel === item.label ? "7" : "4.5"}
                        stroke="var(--admin-surface, #ffffff)"
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}
                  <text fill="currentColor" fontSize="11" textAnchor="middle" x={x} y={lineChartHeight - 10}>
                    {item.label}
                  </text>
                </g>
              );
            })}
            </svg>
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {selectedSeries.map((metric) => {
          const stats = seriesStats[metric];

          return (
            <article className="rounded-lg border border-line bg-paper px-3 py-2" key={metric}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-black text-ink/65">
                  <span aria-hidden="true" className="mr-2 inline-block size-2 rounded-full" style={{ background: seriesMeta[metric].color }} />
                  {seriesMeta[metric].label}
                </span>
                <strong className="text-sm text-ink" data-no-i18n>
                  {formatSeriesValue(metric, stats.latest, language)}
                </strong>
              </div>
              <p className="mt-1 text-xs font-semibold text-ink/50">
                最高{" "}
                <span data-no-i18n>
                  {stats.peak.label} · {formatSeriesValue(metric, getSeriesValue(stats.peak, metric), language)}
                </span>{" "}
                · 增长 <span data-no-i18n>{formatPercent(stats.growth)}</span>
              </p>
            </article>
          );
        })}
      </div>

      <p className="mt-3 text-xs font-semibold text-ink/50">选中的 KPI 会叠加在同一张图中，图形按区间归一化，弹窗显示真实数值。</p>

      {selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4">
          <section className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-lg border border-line bg-white shadow-soft">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper px-5 py-4">
              <div>
                <p className="text-xs font-bold text-moss">24 小时数据</p>
                <h3 className="mt-1 text-xl font-black">
                  <span data-no-i18n>{selectedRow.label}</span> 运营明细
                </h3>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setSelectedLabel(null)}>
                关闭
              </Button>
            </header>

            <div className="max-h-[calc(88vh-76px)] overflow-y-auto p-5">
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  ["客流量", formatPeople(selectedRow.actualUsers, language)],
                  ["流水", formatCurrency(selectedRow.actualRevenue, language)],
                  ["客单价", formatCurrency(selectedRow.avgOrder, language)]
                ].map(([label, value]) => (
                  <article className="rounded-lg border border-line bg-paper p-3" key={label}>
                    <p className="text-xs font-bold text-ink/50">{label}</p>
                    <strong className="mt-1 block text-lg" data-no-i18n>
                      {value}
                    </strong>
                  </article>
                ))}
              </div>

              <div className="mt-5 rounded-lg border border-line bg-paper p-3">
                <div className="flex h-56 items-end gap-1">
                  {hourlyData.map((item) => (
                    <div className="flex min-w-0 flex-1 flex-col items-center gap-2" key={item.hour}>
                      <div className="flex h-40 w-full items-end gap-px rounded-sm bg-white p-0.5">
                        {selectedSeries.map((metric) => (
                          <span
                            aria-hidden="true"
                            className="min-w-px flex-1 rounded-t-sm"
                            key={metric}
                            style={{
                              background: seriesMeta[metric].color,
                              height: `${normalizeValue(getHourlySeriesValue(item, metric), hourlyStats[metric].min, hourlyStats[metric].max)}%`
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] font-bold text-ink/45">{item.hour.slice(0, 2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-lg border border-line">
                <HorizontalScrollArea ariaLabel="小时明细表格横向滚动区域">
                  <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                    <thead className="bg-paper text-ink/50">
                      <tr>
                        {["时间", "客流量", "流水", "客单价"].map((column) => (
                          <th className="border-b border-line px-3 py-2 font-black" key={column}>
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {hourlyData.map((item) => (
                        <tr className="border-b border-line last:border-b-0" key={item.hour}>
                          <td className="px-3 py-2 font-bold">{item.hour}</td>
                          <td className="px-3 py-2" data-no-i18n>
                            {formatPeople(item.traffic, language)}
                          </td>
                          <td className="px-3 py-2" data-no-i18n>
                            {formatCurrency(item.revenue, language)}
                          </td>
                          <td className="px-3 py-2" data-no-i18n>
                            {formatCurrency(item.avgOrder, language)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </HorizontalScrollArea>
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
