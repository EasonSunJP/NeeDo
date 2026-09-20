import { useEffect, useMemo, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { createDispatchCenterApi } from "../dispatch-center/api";
import { enumerateDateKeys, getWeekday, type DispatchCycle } from "../dispatch-center/domain";

function enabledHours(cycle: DispatchCycle, date: string, dateIndex: number) {
  const row = cycle.templateType === "day" ? 0 : cycle.templateType === "week" ? getWeekday(date) : Math.min(dateIndex, 27);
  return (cycle.templateMatrix[row] ?? [])
    .map((enabled, hour) => enabled ? hour : -1)
    .filter((hour) => hour >= 0);
}

function initialSelectedDates(cycle: DispatchCycle) {
  const submitted = new Set((cycle.feedbackRows ?? []).filter((entry) => entry.status !== "unavailable").map((entry) => entry.date));
  return submitted.size > 0 ? submitted : new Set(enumerateDateKeys(cycle.periodStart, cycle.periodEnd));
}

export function TechnicianScheduleCycleInbox({ profileId }: { profileId: number }) {
  const api = useMemo(() => createDispatchCenterApi(`technician:${profileId}`), [profileId]);
  const [cycles, setCycles] = useState<DispatchCycle[]>([]);
  const [selectedByCycle, setSelectedByCycle] = useState<Record<string, Set<string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.listTechnicianCycles()
      .then((page) => {
        if (!active) return;
        setCycles(page.list);
        setSelectedByCycle(Object.fromEntries(page.list.map((cycle) => [cycle.id, initialSelectedDates(cycle)])));
      })
      .catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : "下一周期读取失败。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [api]);

  const toggleDate = (cycleId: string, date: string) => {
    setSelectedByCycle((current) => {
      const next = new Set(current[cycleId] ?? []);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return { ...current, [cycleId]: next };
    });
  };

  const submit = async (cycle: DispatchCycle) => {
    if (!cycle.version) return;
    const selected = selectedByCycle[cycle.id] ?? new Set<string>();
    const entries = enumerateDateKeys(cycle.periodStart, cycle.periodEnd).flatMap((date, dateIndex) =>
      enabledHours(cycle, date, dateIndex).map((hour) => ({
        date,
        hour,
        status: selected.has(date) ? "AVAILABLE" as const : "UNAVAILABLE" as const,
        note: selected.has(date) ? "" : "技师选择该日不可上班"
      }))
    );
    if (entries.length === 0) {
      setMessage("该周期尚未配置可反馈时段。");
      return;
    }
    try {
      const saved = await api.submitTechnicianFeedback(cycle.id, cycle.version, entries);
      setCycles((current) => current.map((item) => item.id === saved.id ? saved : item));
      setMessage("下一周期可上班时间已保存到服务端，商户端可立即查看。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "下一周期反馈保存失败。");
    }
  };

  if (loading) {
    return <p className="rounded-[20px] border border-[color:var(--client-line)] px-4 py-3 text-sm font-bold">正在读取下一周期…</p>;
  }
  if (cycles.length === 0 && !message) return null;

  return (
    <section className="rounded-[24px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-[var(--client-shadow)]" data-testid="technician-schedule-cycle-inbox">
      <h2 className="text-base font-black">下一周期反馈</h2>
      <p className="mt-1 text-xs font-bold leading-5 text-[color:var(--client-muted)]">选择可以上班的日期并提交；反馈由服务端保存，同店铺商户端会读取同一份数据。</p>
      <div className="mt-3 space-y-4">
        {cycles.map((cycle) => {
          const dates = enumerateDateKeys(cycle.periodStart, cycle.periodEnd).filter((date, index) => enabledHours(cycle, date, index).length > 0);
          const selected = selectedByCycle[cycle.id] ?? new Set<string>();
          return (
            <article className="rounded-[20px] border border-[color:var(--client-line)] p-3" key={cycle.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><strong className="text-sm font-black">{cycle.name}</strong><p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">{cycle.periodStart} ～ {cycle.periodEnd}</p></div>
                <Badge tone="yellow">{cycle.mode === "TECH_SELF_FINAL" ? "自主排班" : "店铺排班确认"}</Badge>
              </div>
              <div className="mt-3 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                {dates.map((date) => (
                  <button aria-pressed={selected.has(date)} className={`rounded-full border px-3 py-2 text-xs font-black ${selected.has(date) ? "border-[color:var(--client-primary)] bg-[color:color-mix(in_srgb,var(--client-primary)_16%,transparent)]" : "border-[color:var(--client-line)] text-[color:var(--client-muted)]"}`} key={date} onClick={() => toggleDate(cycle.id, date)} type="button">{date.slice(5)}</button>
                ))}
              </div>
              <Button className="mt-3 w-full" disabled={dates.length === 0} onClick={() => submit(cycle)}>提交下一周期反馈</Button>
            </article>
          );
        })}
      </div>
      {message ? <p className="mt-3 rounded-2xl bg-[color:var(--client-elevated)] px-4 py-3 text-xs font-bold">{message}</p> : null}
    </section>
  );
}
