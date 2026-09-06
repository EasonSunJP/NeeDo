import type { LiveDashboardSnapshot } from "../../api/liveDashboard";

interface LiveTrendChartProps {
  points: LiveDashboardSnapshot["trend"];
  ordersLabel: string;
  paymentsLabel: string;
}

const CHART = { width: 400, height: 150, left: 22, right: 382, top: 18, baseline: 104, labelY: 136 } as const;
const pointX = (index: number, count: number) => count === 1 ? CHART.width / 2 : CHART.left + index * ((CHART.right - CHART.left) / (count - 1));
const valueY = (value: number, maximum: number) => CHART.baseline - (value / Math.max(1, maximum)) * (CHART.baseline - CHART.top);
const linePoints = (values: readonly number[], maximum: number) => values.map((value, index) => {
  const x = pointX(index, values.length);
  const y = valueY(value, maximum);
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
      <svg aria-label={`${ordersLabel} / ${paymentsLabel}`} preserveAspectRatio="xMidYMid meet" role="img" viewBox={`0 0 ${CHART.width} ${CHART.height}`}>
        <g data-chart-plot>
          <path className="live-dashboard-chart-grid" d={`M${CHART.left} ${CHART.top}H${CHART.right}M${CHART.left} ${(CHART.top + CHART.baseline) / 2}H${CHART.right}`} />
          <polyline className="live-dashboard-chart-line is-orders" points={linePoints(points.map((point) => point.orderCount), maxOrders)} />
          <polyline className="live-dashboard-chart-line is-payments" points={linePoints(points.map((point) => point.confirmedPayments.jpy), maxPayments)} />
          {points.length === 1 ? <>
            <circle className="live-dashboard-chart-line is-orders" data-chart-point cx={pointX(0, 1)} cy={valueY(points[0].orderCount, maxOrders)} r="2" />
            <circle className="live-dashboard-chart-line is-payments" data-chart-point cx={pointX(0, 1)} cy={valueY(points[0].confirmedPayments.jpy, maxPayments)} r="2" />
          </> : null}
        </g>
        <g data-chart-axis>
          <path className="live-dashboard-chart-grid" data-chart-baseline data-y={CHART.baseline} d={`M${CHART.left} ${CHART.baseline}H${CHART.right}`} />
          {points.map((point, index) => {
            const x = pointX(index, points.length);
            return <text className="live-dashboard-chart-label" key={point.key} textAnchor="middle" x={x} y={CHART.labelY}>{point.label}</text>;
          })}
        </g>
      </svg>
    </div>
  );
}
