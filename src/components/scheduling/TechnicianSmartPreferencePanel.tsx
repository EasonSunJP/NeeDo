import { useMemo } from "react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { TitleWithInfo } from "../ui/TitleWithInfo";
import { AppIcon } from "../client-ui/AppScaffold";
import { SmartScheduleLimitedFreeBadge } from "./SmartScheduleLimitedFreeBadge";
import {
  upsertSmartTechnicianPreference,
  useDispatchCenterStore
} from "../../features/dispatch-center/store";
import type { TechnicianSchedulePreference } from "../../features/dispatch-center/domain";
import { cn } from "../../lib/utils";

const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function PreferenceTimeInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0 text-[11px] font-black text-[color:var(--client-muted)]">
      <span className="block">{label}</span>
      <span className="relative mt-1 block h-9 min-w-0">
        <input
          aria-label={label}
          className="peer absolute inset-0 z-10 h-full w-full min-w-0 cursor-pointer opacity-0"
          onChange={(event) => onChange(event.target.value)}
          type="time"
          value={value}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex min-w-0 items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)] px-3 text-left text-xs font-black text-[color:var(--client-text)] transition peer-focus-visible:border-[color:var(--client-primary)] peer-focus-visible:ring-2 peer-focus-visible:ring-[color:color-mix(in_srgb,var(--client-primary)_18%,transparent)]"
        >
          <span className="min-w-0 flex-1 truncate text-left">{value}</span>
          <AppIcon className="h-3.5 w-3.5 shrink-0 text-[color:var(--client-muted)]" name="clock" />
        </span>
      </span>
    </label>
  );
}

function buildFallbackPreference(storeId: string, technicianId: string, weekday: number): TechnicianSchedulePreference {
  return {
    id: `smart-pref-fallback-${storeId}-${technicianId}-${weekday}`,
    technicianId,
    shopId: storeId,
    weekday,
    startTime: weekday === 5 || weekday === 6 ? "12:00" : "10:00",
    endTime: weekday === 5 || weekday === 6 ? "22:00" : "21:00",
    available: weekday !== 3,
    maxHoursDay: 8,
    maxHoursWeek: 42,
    acceptOvertime: false,
    acceptHoliday: true,
    acceptTempShift: true,
    bufferMinutes: 20,
    autoSubmitEnabled: true,
    priority: 2,
    createdAt: "",
    updatedAt: ""
  };
}

export function TechnicianSmartPreferencePanel({
  storeId,
  technicianId
}: {
  storeId: string;
  technicianId: string;
}) {
  const dispatchCenter = useDispatchCenterStore();
  const rows = useMemo(
    () =>
      weekdayLabels.map((_, weekday) =>
        dispatchCenter.smartTechnicianPreferences.find(
          (preference) => preference.shopId === storeId && preference.technicianId === technicianId && preference.weekday === weekday
        ) ?? buildFallbackPreference(storeId, technicianId, weekday)
      ),
    [dispatchCenter.smartTechnicianPreferences, storeId, technicianId]
  );
  const autoSubmitEnabled = rows.some((row) => row.autoSubmitEnabled);
  const availableDays = rows.filter((row) => row.available).length;

  const updateRow = (weekday: number, patch: Parameters<typeof upsertSmartTechnicianPreference>[0]["patch"]) => {
    upsertSmartTechnicianPreference({
      storeId,
      technicianId,
      weekday,
      patch
    });
  };

  const toggleAutoSubmit = () => {
    rows.forEach((row) => updateRow(row.weekday, { autoSubmitEnabled: !autoSubmitEnabled }));
  };

  return (
    <section className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="blue">智能排班接入</Badge>
            <SmartScheduleLimitedFreeBadge surface="mobile" />
            <Badge tone={autoSubmitEnabled ? "green" : "yellow"}>{autoSubmitEnabled ? "自动提交已开" : "自动提交关闭"}</Badge>
          </div>
          <TitleWithInfo
            className="mt-2"
            info="开启后，系统会根据你的常规可上班时间、不可用时间、历史反馈和店铺规则生成自动反馈；商户最终确认前不会直接影响用户端可预约时间。"
            infoClassName="h-5 w-5 border-[color:color-mix(in_srgb,var(--client-line)_80%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,transparent)] text-[color:var(--client-muted)]"
            label="我的排班偏好说明"
            title={<span className="text-[18px] font-black tracking-[-0.02em] text-[color:var(--client-text)]">我的排班偏好</span>}
            titleClassName="min-w-0"
            variant="client"
          />
        </div>
        <Button
          className="border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] text-[color:var(--client-text)]"
          onClick={toggleAutoSubmit}
          size="sm"
          variant="secondary"
        >
          {autoSubmitEnabled ? "关闭自动提交" : "开启自动提交"}
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ["可上班日", `${availableDays} 天`],
          ["临时补位", `${rows.filter((row) => row.acceptTempShift).length} 天`],
          ["节假日", `${rows.filter((row) => row.acceptHoliday).length} 天`]
        ].map(([label, value]) => (
          <div className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,transparent)] px-3 py-3" key={label}>
            <p className="text-[11px] font-black text-[color:var(--client-muted)]">{label}</p>
            <strong className="mt-1 block text-sm font-black text-[color:var(--client-text)]">{value}</strong>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <article
            className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_82%,transparent)] p-3"
            key={row.weekday}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm font-black text-[color:var(--client-text)]">{weekdayLabels[row.weekday]}</strong>
                  <Badge tone={row.available ? "green" : "neutral"}>{row.available ? "可上班" : "不想工作"}</Badge>
                </div>
                <p className="mt-1 text-xs font-semibold text-[color:var(--client-muted)]">{row.startTime}-{row.endTime} · 日 {row.maxHoursDay}h / 周 {row.maxHoursWeek}h · 缓冲 {row.bufferMinutes} 分</p>
              </div>
              <button
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-black transition",
                  row.available
                    ? "border-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)]"
                    : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] text-[color:var(--client-muted)]"
                )}
                onClick={() => updateRow(row.weekday, { available: !row.available })}
                type="button"
              >
                {row.available ? "设为不可" : "设为可上班"}
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <PreferenceTimeInput label="开始" onChange={(value) => updateRow(row.weekday, { startTime: value })} value={row.startTime} />
              <PreferenceTimeInput label="结束" onChange={(value) => updateRow(row.weekday, { endTime: value })} value={row.endTime} />
              <button
                className={cn("rounded-full border px-3 py-2 text-xs font-black", row.acceptTempShift ? "border-[color:var(--client-primary)] text-[color:var(--client-primary-strong)]" : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] text-[color:var(--client-muted)]")}
                onClick={() => updateRow(row.weekday, { acceptTempShift: !row.acceptTempShift })}
                type="button"
              >
                临时补位
              </button>
              <button
                className={cn("rounded-full border px-3 py-2 text-xs font-black", row.acceptOvertime ? "border-[color:var(--client-warm)] text-[color:color-mix(in_srgb,var(--client-warm)_82%,var(--client-text)_18%)]" : "border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] text-[color:var(--client-muted)]")}
                onClick={() => updateRow(row.weekday, { acceptOvertime: !row.acceptOvertime })}
                type="button"
              >
                可加班
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
