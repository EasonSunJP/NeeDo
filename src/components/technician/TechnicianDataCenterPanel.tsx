import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppIcon } from "../client-ui/AppScaffold";
import {
  technicianDataCenterApi,
  type TechnicianDataCenterPayload,
  type TechnicianDataCenterPeriod
} from "../../features/core-read/technicianDataCenterApi";
import { buildTrendCoordinates } from "../../lib/technicianWorkTrendChart";
import { cn, yen } from "../../lib/utils";

export type TechnicianDualTrendPoint = {
  key: string;
  label: string;
  incomeJpy: number;
  workedMinutes: number;
};

const periodOptions: Array<{ value: TechnicianDataCenterPeriod; label: string }> = [
  { value: "last7days", label: "近7天" },
  { value: "last30days", label: "近30天" },
  { value: "week", label: "本周" },
  { value: "month", label: "本月" },
  { value: "year", label: "今年" }
];

const panelClassName =
  "technician-data-center-panel rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-primary)_28%,var(--client-line))] bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--client-primary)_12%,transparent),transparent_40%),linear-gradient(145deg,color-mix(in_srgb,var(--client-surface)_94%,var(--client-bg)),color-mix(in_srgb,var(--client-elevated)_72%,var(--client-bg)))] text-[color:var(--client-text)] shadow-[var(--client-shadow)]";

function formatHours(minutes: number) {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1)}h`;
}

function formatDate(value: string | null) {
  if (!value) return "未设定";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function pointsAttribute(points: Array<{ x: number; y: number }>) {
  return points.map(({ x, y }) => `${x},${y}`).join(" ");
}

export function TechnicianDualTrendChart({ points }: { points: TechnicianDualTrendPoint[] }) {
  const [showIncome, setShowIncome] = useState(true);
  const [showWork, setShowWork] = useState(true);
  const titleId = useId();
  const dimensions = { width: 620, height: 260, left: 42, right: 24, top: 24, bottom: 54 };
  const incomeCoordinates = useMemo(
    () => buildTrendCoordinates(points.map((point) => point.incomeJpy), dimensions),
    [points]
  );
  const workCoordinates = useMemo(
    () => buildTrendCoordinates(points.map((point) => point.workedMinutes), dimensions),
    [points]
  );
  const incomePeak = Math.max(...points.map((point) => point.incomeJpy), 0);
  const workPeak = Math.max(...points.map((point) => point.workedMinutes), 0);
  const usableHeight = dimensions.height - dimensions.top - dimensions.bottom;

  return (
    <section className={cn(panelClassName, "overflow-hidden p-4")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-black" id={titleId}>收入趋势和工作趋势</h3>
          <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">同一期间 · 双独立刻度</p>
        </div>
        <div className="shrink-0 text-right text-[11px] font-black text-[color:var(--client-muted)]">
          <p>{yen(incomePeak)} 峰值</p>
          <p className="mt-1 text-[color:var(--client-accent)]">{formatHours(workPeak)} 峰值</p>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto" data-testid="technician-dual-trend-chart">
        <svg aria-labelledby={titleId} className="h-auto min-w-[520px] overflow-visible" role="img" viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}>
          {Array.from({ length: 4 }, (_, index) => {
            const y = dimensions.top + (usableHeight / 3) * index;
            return <line key={y} stroke="color-mix(in srgb, var(--client-line) 55%, transparent)" strokeDasharray="6 8" x1={dimensions.left} x2={dimensions.width - dimensions.right} y1={y} y2={y} />;
          })}
          {showIncome ? (
            <g data-series="income">
              <polyline fill="none" points={pointsAttribute(incomeCoordinates)} stroke="var(--client-primary)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
              {incomeCoordinates.map((coordinate, index) => <circle cx={coordinate.x} cy={coordinate.y} fill="var(--client-bg)" key={points[index]?.key} r="6" stroke="var(--client-primary)" strokeWidth="4" />)}
            </g>
          ) : null}
          {showWork ? (
            <g data-series="work">
              <polyline fill="none" points={pointsAttribute(workCoordinates)} stroke="var(--client-accent)" strokeDasharray="10 9" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
              {workCoordinates.map((coordinate, index) => <circle cx={coordinate.x} cy={coordinate.y} fill="var(--client-bg)" key={points[index]?.key} r="5" stroke="var(--client-accent)" strokeWidth="3" />)}
            </g>
          ) : null}
          {incomeCoordinates.map((coordinate, index) => (
            <text fill="var(--client-muted)" fontSize="13" fontWeight="800" key={points[index]?.key} textAnchor="middle" x={coordinate.x} y={dimensions.height - 18}>
              {points[index]?.label}
            </text>
          ))}
        </svg>
      </div>

      <div aria-label="趋势图例" className="mt-2 grid grid-cols-2 gap-2">
        <button
          aria-label={`${showIncome ? "隐藏" : "显示"}收入趋势`}
          aria-pressed={showIncome}
          className={cn("focus-ring flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-black", showIncome ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)]" : "border-[color:var(--client-line)] text-[color:var(--client-muted)] opacity-65")}
          onClick={() => setShowIncome((current) => !current)}
          type="button"
        >
          <span className="h-1 w-7 rounded-full bg-[color:var(--client-primary)]" />收入趋势
        </button>
        <button
          aria-label={`${showWork ? "隐藏" : "显示"}工作趋势`}
          aria-pressed={showWork}
          className={cn("focus-ring flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-black", showWork ? "border-[color:color-mix(in_srgb,var(--client-accent)_65%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-accent)_10%,transparent)] text-[color:var(--client-accent)]" : "border-[color:var(--client-line)] text-[color:var(--client-muted)] opacity-65")}
          onClick={() => setShowWork((current) => !current)}
          type="button"
        >
          <span className="h-1 w-7 rounded-full bg-[color:var(--client-accent)]" />工作趋势
        </button>
      </div>
    </section>
  );
}

function IncomeModelDialog({ data, onClose }: { data: TechnicianDataCenterPayload; onClose: () => void }) {
  const model = data.incomeModel;
  return (
    <div aria-modal="true" className="fixed inset-0 z-[150] grid place-items-end bg-black/70 p-3 backdrop-blur-sm sm:place-items-center" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="dialog">
      <section className={cn(panelClassName, "max-h-[82dvh] w-full max-w-md overflow-y-auto p-5")}>
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-black text-[color:var(--client-primary)]">当前正式设定</p><h2 className="mt-1 text-xl font-black">收入模型详情</h2></div>
          <button aria-label="关闭收入模型详情" className="focus-ring grid h-10 w-10 place-items-center rounded-full border border-[color:var(--client-line)]" onClick={onClose} type="button"><AppIcon name="close" /></button>
        </div>
        {model ? (
          <dl className="mt-5 divide-y divide-[color:var(--client-line)] text-sm">
            <div className="py-3"><dt className="text-xs font-bold text-[color:var(--client-muted)]">收入归属</dt><dd className="mt-1 font-black">{data.affiliation ? `${data.affiliation.shopName}店铺合作技师` : "当前技师收入模型"}</dd></div>
            <div className="py-3"><dt className="text-xs font-bold text-[color:var(--client-muted)]">入社日期</dt><dd className="mt-1 font-black">{formatDate(data.technician.employmentStartedAt ?? data.affiliation?.startsAt ?? null)}</dd></div>
            <div className="py-3"><dt className="text-xs font-bold text-[color:var(--client-muted)]">收入形式版本</dt><dd className="mt-1 font-black">{formatDate(model.updatedAt)}更新 · V{model.version}</dd></div>
            <div className="grid grid-cols-2 gap-x-4 py-3">
              <div><dt className="text-xs font-bold text-[color:var(--client-muted)]">基础工资</dt><dd className="mt-1 font-black">{yen(model.baseSalaryJpy)}</dd></div>
              <div><dt className="text-xs font-bold text-[color:var(--client-muted)]">服务完成分成</dt><dd className="mt-1 font-black">{model.serviceCommissionRatePercent}%</dd></div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 py-3">
              <div><dt className="text-xs font-bold text-[color:var(--client-muted)]">加钟分成</dt><dd className="mt-1 font-black">{model.extensionCommissionRatePercent}%</dd></div>
              <div><dt className="text-xs font-bold text-[color:var(--client-muted)]">指名费</dt><dd className="mt-1 font-black">{yen(model.nominationFeeJpy)}</dd></div>
            </div>
            <div className="py-3"><dt className="text-xs font-bold text-[color:var(--client-muted)]">奖金</dt><dd className="mt-1 font-black">{model.hasBonus ? "有" : "无"}</dd></div>
          </dl>
        ) : <p className="mt-5 rounded-2xl border border-[color:var(--client-line)] p-4 text-sm font-bold text-[color:var(--client-muted)]">店铺尚未为当前技师设定正式收入模型。</p>}
      </section>
    </div>
  );
}

function DataCenterContent({ data, onOpenModel, onPeriodChange }: {
  data: TechnicianDataCenterPayload;
  onOpenModel: () => void;
  onPeriodChange: (period: TechnicianDataCenterPeriod) => void;
}) {
  return (
    <div className="space-y-4" data-testid="technician-formal-data-center">
      <section className={cn(panelClassName, "p-4")}>
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-xs font-black text-[color:var(--client-muted)]">店铺工作</p><h2 className="mt-1 text-xl font-black">{data.affiliation?.shopName ?? "独立技师"}</h2></div>
          <select aria-label="数据中心期间" className="focus-ring h-10 rounded-xl border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] px-3 text-sm font-black" onChange={(event) => onPeriodChange(event.target.value as TechnicianDataCenterPeriod)} value={data.period}>
            {periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ["期间收入", yen(data.summary.recognizedIncomeJpy)],
            ["已完成", `${data.summary.completedOrderCount} 单`],
            ["未来安排", `${data.summary.upcomingOrderCount} 条`]
          ].map(([label, value]) => <div className="rounded-[18px] border border-[color:var(--client-line)] bg-[color:color-mix(in_srgb,var(--client-elevated)_72%,transparent)] p-3" key={label}><p className="text-[11px] font-bold text-[color:var(--client-muted)]">{label}</p><strong className="mt-1 block truncate text-[15px]">{value}</strong></div>)}
        </div>
        {data.nextOrder ? <p className="mt-3 rounded-2xl bg-[color:color-mix(in_srgb,var(--client-elevated)_72%,transparent)] px-3 py-2.5 text-xs font-bold text-[color:var(--client-muted)]">下一条安排：{formatDateTime(data.nextOrder.startsAt)} · {data.nextOrder.serviceName}</p> : null}
        <button className="focus-ring mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_48%,var(--client-line))] bg-[color:var(--client-primary-soft)] px-3 text-xs font-black text-[color:var(--client-primary-strong)]" onClick={onOpenModel} type="button"><AppIcon className="h-4 w-4" name="info" />收入模型详情</button>
      </section>

      <TechnicianDualTrendChart points={data.series} />

      <section className={cn(panelClassName, "p-4")}>
        <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-black text-[color:var(--client-muted)]">正式记录</p><h2 className="mt-1 text-lg font-black">最近订单记录</h2></div><span className="text-xs font-bold text-[color:var(--client-muted)]">最近 {data.recentOrders.length} 条</span></div>
        <div className="mt-3 space-y-2">
          {data.recentOrders.length ? data.recentOrders.map((order) => (
            <Link className="focus-ring flex min-h-16 items-center justify-between gap-3 rounded-[18px] border border-[color:var(--client-line)] bg-[color:color-mix(in_srgb,var(--client-elevated)_66%,transparent)] px-3 py-2.5" key={order.id} to={`/technician/orders/${order.id}`}>
              <div className="min-w-0"><p className="technician-data-center-primary-text truncate text-sm font-black">{order.serviceName}</p><p className="mt-1 truncate text-[11px] font-bold text-[color:var(--client-muted)]">{formatDateTime(order.startsAt)} · {order.shopName} · {order.orderNo}</p></div>
              <div className="shrink-0 text-right"><strong className="text-sm">{order.recognizedIncomeJpy === null ? "待确认" : yen(order.recognizedIncomeJpy)}</strong><span className="ml-2 text-[color:var(--client-muted)]">›</span></div>
            </Link>
          )) : <p className="rounded-[18px] border border-[color:var(--client-line)] p-5 text-center text-sm font-bold text-[color:var(--client-muted)]">当前没有正式订单记录</p>}
        </div>
      </section>
    </div>
  );
}

export function TechnicianDataCenterPanel({ period, onPeriodChange, onRangeLoaded }: {
  period: TechnicianDataCenterPeriod;
  onPeriodChange: (period: TechnicianDataCenterPeriod) => void;
  onRangeLoaded?: (range: TechnicianDataCenterPayload["range"]) => void;
}) {
  const [data, setData] = useState<TechnicianDataCenterPayload | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [showIncomeModel, setShowIncomeModel] = useState(false);

  useEffect(() => {
    let active = true;
    setError("");
    technicianDataCenterApi.getMine(period)
      .then((next) => {
        if (!active) return;
        setData(next);
        onRangeLoaded?.(next.range);
      })
      .catch(() => { if (active) { setData(null); setError("正式数据加载失败，请稍后重试"); } });
    return () => { active = false; };
  }, [onRangeLoaded, period, revision]);

  if (!data && !error) return <section aria-live="polite" className={cn(panelClassName, "p-7 text-center text-sm font-black")}>正在加载数据中心</section>;
  if (error || !data) return <section className={cn(panelClassName, "p-7 text-center")} role="alert"><p className="text-sm font-black">{error || "正式数据暂不可用"}</p><button className="focus-ring mt-4 rounded-full bg-[color:var(--client-primary)] px-5 py-2 text-sm font-black text-[color:var(--client-primary-contrast)]" onClick={() => setRevision((value) => value + 1)} type="button">重新加载</button></section>;
  return (
    <>
      <DataCenterContent data={data} onOpenModel={() => setShowIncomeModel(true)} onPeriodChange={onPeriodChange} />
      {showIncomeModel ? <IncomeModelDialog data={data} onClose={() => setShowIncomeModel(false)} /> : null}
    </>
  );
}
