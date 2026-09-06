import type { LiveDashboardSnapshot } from "../../api/liveDashboard";

interface LiveTrendChartProps {
  points: LiveDashboardSnapshot["trend"];
  ordersLabel: string;
  paymentsLabel: string;
}

const linePoints = (values: readonly number[], maximum: number) => values.map((value, index) => {
  const x = values.length === 1 ? 200 : 18 + index * (364 / (values.length - 1));
  const y = 104 - (value / maximum) * 82;
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}).join(" ");

export function LiveTrendChart({ ordersLabel, paymentsLabel, points }: LiveTrendChartProps) {
  if (points.length === 0) return null;
  const maxOrders = Math.max(1, ...points.map((point) => point.orderCount));
  const maxPayments = Math.max(1, ...points.map((point) => point.confirmedPayments.jpy));
  return (
    <div className="live-dashboard-trend-chart">
      <div className="live-dashboard-chart-legend">
        <span><i className="is-orders" />{ordersLabel}</span>
        <span><i className="is-payments" />{paymentsLabel}</span>
      </div>
      <svg aria-label={`${ordersLabel} / ${paymentsLabel}`} preserveAspectRatio="none" role="img" viewBox="0 0 400 130">
        <path className="live-dashboard-chart-grid" d="M18 22H382M18 63H382M18 104H382" />
        <polyline className="live-dashboard-chart-line is-orders" points={linePoints(points.map((point) => point.orderCount), maxOrders)} />
        <polyline className="live-dashboard-chart-line is-payments" points={linePoints(points.map((point) => point.confirmedPayments.jpy), maxPayments)} />
        {points.map((point, index) => {
          const x = points.length === 1 ? 200 : 18 + index * (364 / (points.length - 1));
          return <text className="live-dashboard-chart-label" key={point.key} textAnchor="middle" x={x} y="124">{point.label}</text>;
        })}
      </svg>
    </div>
  );
}
