import type {
  AnalyticsDataStatus,
  AnalyticsMetricPayload
} from "../../api/backofficeRealData";
import { DashboardMetricCard } from "./DashboardMetricCard";

export function AnalyticsMetricGrid({
  groupTitle,
  metrics,
  getMetricTitle,
  statusMessages,
  previousLabel,
  unavailableComparisonLabel,
  detailLabel,
  onNavigate
}: {
  groupTitle: string;
  metrics: readonly AnalyticsMetricPayload[];
  getMetricTitle: (metric: AnalyticsMetricPayload) => string;
  statusMessages: Record<AnalyticsDataStatus, string>;
  previousLabel: string;
  unavailableComparisonLabel?: string;
  detailLabel?: string;
  onNavigate?: (route: string, metric: AnalyticsMetricPayload) => void;
}) {
  return (
    <section className="min-w-0 space-y-3">
      <h2 className="text-base font-black text-ink">{groupTitle}</h2>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <DashboardMetricCard
            detailLabel={detailLabel}
            key={metric.metricKey}
            metric={metric}
            onDetail={onNavigate && metric.detailRoute
              ? (route) => onNavigate(route, metric)
              : undefined}
            previousLabel={previousLabel}
            statusMessage={statusMessages[metric.dataStatus]}
            title={getMetricTitle(metric)}
            unavailableComparisonLabel={unavailableComparisonLabel}
          />
        ))}
      </div>
    </section>
  );
}
