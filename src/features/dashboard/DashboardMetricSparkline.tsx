export interface DashboardMetricSparklinePoint {
  key: string;
  label: string;
  value: number;
}

export function DashboardMetricSparkline({
  points
}: {
  points: DashboardMetricSparklinePoint[];
}) {
  if (points.length !== 3 || points.some((point) => !Number.isFinite(point.value))) return null;

  const values = points.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const y = (value: number) =>
    maximum === minimum ? 24 : 40 - ((value - minimum) / (maximum - minimum)) * 32;
  const x = (index: number) => 8 + index * 40;
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(point.value)}`)
    .join(" ");

  return (
    <div
      className="shrink-0 text-moss"
      data-dashboard-sparkline="true"
      data-sparkline-values={values.join(",")}
    >
      <svg aria-hidden="true" className="h-12 w-24" viewBox="0 0 96 48">
        <line className="text-line" stroke="currentColor" x1="8" x2="88" y1="40" y2="40" />
        <path d={path} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
        {points.map((point, index) => (
          <circle
            cx={x(index)}
            cy={y(point.value)}
            data-dashboard-sparkline-node="true"
            fill="currentColor"
            key={point.key}
            r="2.75"
          />
        ))}
      </svg>
      <ul className="sr-only">
        {points.map((point) => <li key={point.key}>{point.label}: {point.value}</li>)}
      </ul>
    </div>
  );
}
