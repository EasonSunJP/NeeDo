import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppIcon } from "../../components/client-ui/AppScaffold";
import {
  UnifiedUserCalendar,
  type UnifiedCalendarTechnician
} from "../../components/scheduling/UnifiedUserCalendar";
import { FormalTechnicianOrdersPanel } from "../../components/technician/FormalTechnicianOrdersPanel";
import { cn } from "../../lib/utils";

type WorkspaceTab = "calendar" | "settings";

const schedulePanelClass =
  "rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] shadow-[var(--client-shadow)]";

export function FormalTechnicianScheduleWorkspace({
  profileAvatarUrl,
  profileId,
  profileName,
  shopId,
  shopName
}: {
  profileAvatarUrl?: string | null;
  profileId: number;
  profileName: string;
  shopId: number;
  shopName: string;
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<WorkspaceTab>("calendar");
  const [searchQuery, setSearchQuery] = useState("");
  const calendarTechnician = useMemo<UnifiedCalendarTechnician>(() => ({
    avatar: profileAvatarUrl ?? "",
    id: String(profileId),
    name: profileName,
    storeId: String(shopId)
  }), [profileAvatarUrl, profileId, profileName, shopId]);

  return (
    <div className="space-y-4 text-[color:var(--client-text)]" data-testid="formal-technician-schedule-workspace">
      <section className={cn(schedulePanelClass, "overflow-hidden p-3")}>
        <div className="grid grid-cols-2 gap-2 rounded-full bg-[color:color-mix(in_srgb,var(--client-elevated)_84%,transparent)] p-1">
          {([["calendar", "我的排班"], ["settings", "排班设置"]] as const).map(([value, label]) => (
            <button
              className={cn(
                "rounded-full px-4 py-2.5 text-sm font-black transition",
                tab === value
                  ? "bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)]"
                  : "text-[color:var(--client-muted)]"
              )}
              key={value}
              onClick={() => setTab(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <label className="relative mt-3 block">
          <AppIcon className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-[color:var(--client-muted)]" name="search" />
          <input
            aria-label="行程搜索"
            className="h-11 w-full rounded-full border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] pl-11 pr-4 text-sm font-bold outline-none"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="行程搜索"
            value={searchQuery}
          />
        </label>
      </section>

      {tab === "settings" ? (
        <div className="space-y-4" data-testid="formal-schedule-settings-surface">
          <section className={cn(schedulePanelClass, "p-4")}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black text-[color:var(--client-muted)]">{shopName}</p>
                <h2 className="mt-1 text-xl font-black">正式排班设置</h2>
              </div>
              <Link
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[color:var(--client-primary)] px-4 text-sm font-black text-[color:var(--client-needo-text)]"
                to="/technician/schedule/new"
              >
                <AppIcon className="h-4 w-4" name="plus" />新建正式排班
              </Link>
            </div>
            <p className="mt-3 text-xs font-bold leading-5 text-[color:var(--client-muted)]">
              新增、编辑和锁定都会写入当前技师身份的正式排班接口；本页不创建浏览器排班记录。
            </p>
          </section>
          <section
            className="client-feature-panel rounded-[28px] border p-4 text-white shadow-[var(--client-shadow)]"
            data-testid="formal-schedule-orders-surface"
          >
            <div className="mb-4">
              <p className="text-[11px] font-black text-white/50">正式服务器数据</p>
              <h2 className="mt-1 text-xl font-black">预约订单</h2>
            </div>
            <FormalTechnicianOrdersPanel />
          </section>
        </div>
      ) : (
        <>
          <UnifiedUserCalendar
            currentTechnician={calendarTechnician}
            displayMode="parallel"
            formalOnly
            scope="technician"
            searchQuery={searchQuery}
            showSourceDrawer
          />
          <button
            aria-label="新建正式排班"
            className="fixed bottom-[calc(env(safe-area-inset-bottom)+112px)] right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)] shadow-[0_18px_42px_color-mix(in_srgb,var(--client-primary)_40%,transparent)]"
            onClick={() => navigate("/technician/schedule/new")}
            type="button"
          >
            <AppIcon name="plus" />
          </button>
        </>
      )}
    </div>
  );
}
