import { InfoTooltipTrigger } from "../../components/ui/TitleWithInfo";
import { TestFeatureBadge } from "../../components/ui/TestFeatureBadge";
import { cn } from "../../lib/utils";
import type { WorkspaceTab } from "./FormalTechnicianScheduleWorkspace";

const tabs: Array<{
  value: WorkspaceTab;
  label: string;
  description?: string;
}> = [
  { value: "calendar", label: "我的排班" },
  {
    value: "bookingSettings",
    label: "接单设置",
    description: "当新预约同时满足全部规则时，系统会调用正式接单流程；不符合时保持待处理，不会自动拒绝。"
  },
  {
    value: "requestSettings",
    label: "抢单设置",
    description: "当新 Request 同时满足全部规则时，系统会正式提交应募；用户仍需选择服务方，不会自动成交。"
  }
];

export function TechnicianScheduleAutomationTabs({
  onChange,
  value
}: {
  onChange: (value: WorkspaceTab) => void;
  value: WorkspaceTab;
}) {
  return (
    <div
      aria-label="技师排班页面"
      className="grid grid-cols-3 gap-2 pt-1"
      role="tablist"
    >
      {tabs.map((item) => (
        <div className="relative min-w-0" key={item.value}>
          <button
            aria-selected={value === item.value}
            className={cn(
              "flex min-h-12 w-full items-center justify-center rounded-full px-2 text-[15px] font-black transition",
              value === item.value
                ? "bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)] shadow-sm"
                : "text-[color:var(--client-muted)]"
            )}
            onClick={() => onChange(item.value)}
            role="tab"
            type="button"
          >
            <span className="truncate">{item.label}</span>
          </button>
          {item.description ? (
            <>
              <span
                className="pointer-events-none absolute right-5 top-0 z-10 -translate-y-1/2"
                data-testid="automation-tab-corner-badge"
              >
                <TestFeatureBadge className="min-h-4 px-1.5 py-0 text-[8px]" />
              </span>
              <InfoTooltipTrigger
                className="absolute left-[calc(50%+34px)] top-1/2 h-4 w-4 -translate-y-1/2 text-[9px]"
                content={item.description}
                iconClassName="text-[9px]"
                label={`${item.label}说明`}
                panelMode="sheet"
              />
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}
