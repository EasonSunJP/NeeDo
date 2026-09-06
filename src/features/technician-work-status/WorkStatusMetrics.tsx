import { useState } from "react";
import { Drawer } from "../../components/ui/Drawer";
import { Badge } from "../../components/ui/Badge";
import type { WorkStatus, WorkStatusTarget } from "./api";
import { useWorkStatus } from "./hooks";
import { useWorkText } from "./i18n";
import { WorkTimeline } from "./WorkTimeline";
import { workStatusRange, type WorkStatusPeriod } from "./model";
export function WorkStatusBadge({ status }: { status?: WorkStatus }) {
  const { t } = useWorkText();
  return (
    <Badge
      tone={
        status === "on_duty"
          ? "green"
          : status === "in_service"
            ? "yellow"
            : status === "traveling"
              ? "blue"
              : "neutral"
      }
    >
      {t(status ?? "unsynced")}
    </Badge>
  );
}
export function WorkStatusMetrics({ target }: { target: WorkStatusTarget }) {
  const { t } = useWorkText();
  const { snapshot, error, loading, reload } = useWorkStatus(target);
  const [open, setOpen] = useState(false),
    [period, setPeriod] = useState<WorkStatusPeriod>("month"),
    [kind, setKind] = useState<"all" | "late" | "early_leave">("all"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  let range: { from: string; to: string } | null = null;
  try {
    range = workStatusRange(period, new Date(), from, to);
  } catch {
    range = null;
  }
  return (
    <>
      <button
        type="button"
        data-testid="work-status-month-metrics"
        onClick={() => {
          setPeriod("month");
          setKind("all");
          setOpen(true);
        }}
        className="w-full rounded-xl border border-line bg-paper p-4 text-left text-ink transition hover:border-moss"
      >
        <span className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-ink/60">
          {t("incidents")}
          <WorkStatusBadge status={snapshot?.status} />
        </span>
        <span className="mt-3 block" aria-live="polite">
          {error ? (
            t("error")
          ) : snapshot ? (
            <>
              <span className="block text-xs text-ink/60">{t("month")}</span>
              <strong
                aria-hidden="true"
                className="mt-1 block text-2xl font-black tabular-nums"
              >
                {snapshot.month.lateCount} / {snapshot.month.earlyLeaveCount}
              </strong>
              <span className="sr-only">
                {t("monthCaption", {
                  late: snapshot.month.lateCount,
                  early: snapshot.month.earlyLeaveCount,
                })}
              </span>
            </>
          ) : loading ? (
            t("loading")
          ) : (
            "—"
          )}
        </span>
      </button>
      {error ? (
        <button
          className="text-sm underline"
          onClick={() => void reload()}
          type="button"
        >
          {t("retry")}
        </button>
      ) : null}
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={t("incidents")}
        layer="overlay"
        minWidth={320}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <label className="text-sm font-bold">
              {t("timeRange")}
              <select
                aria-label={t("timeRange")}
                value={period}
                onChange={(event) =>
                  setPeriod(event.target.value as WorkStatusPeriod)
                }
                className="ml-2 rounded-lg border border-line bg-paper p-2"
              >
                {(
                  [
                    "today",
                    "last7days",
                    "last30days",
                    "week",
                    "month",
                    "year",
                    "custom",
                  ] as const
                ).map((value) => (
                  <option value={value} key={value}>
                    {t(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-bold">
              {t("incidents")}
              <select
                aria-label={t("incidents")}
                value={kind}
                onChange={(event) => setKind(event.target.value as typeof kind)}
                className="ml-2 rounded-lg border border-line bg-paper p-2"
              >
                {(["all", "late", "early_leave"] as const).map((value) => (
                  <option value={value} key={value}>
                    {t(value)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {period === "custom" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="min-w-0 text-sm">
                {t("from")}
                <input
                  aria-label={t("from")}
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="mt-1 block w-full min-w-0 rounded-lg border border-line bg-paper p-2"
                />
              </label>
              <label className="min-w-0 text-sm">
                {t("to")}
                <input
                  aria-label={t("to")}
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="mt-1 block w-full min-w-0 rounded-lg border border-line bg-paper p-2"
                />
              </label>
            </div>
          ) : null}
          {open && range ? (
            <WorkTimeline
              key={`${period}:${range.from}:${range.to}:${kind}`}
              target={target}
              query={{
                ...range,
                incidentsOnly: true,
                ...(kind === "all" ? {} : { kind }),
              }}
              comments={false}
            />
          ) : open ? (
            <p role="alert" className="text-red-500">
              {t("invalidRange")}
            </p>
          ) : null}
        </div>
      </Drawer>
    </>
  );
}
