import { useMemo } from "react";
import {
  UnifiedUserCalendar,
  type UnifiedCalendarTechnician
} from "../../components/scheduling/UnifiedUserCalendar";
import { TechnicianAutomationSettingsPanel } from "./TechnicianAutomationSettingsPanel";
import { TechnicianScheduleCycleInbox } from "./TechnicianScheduleCycleInbox";

export type WorkspaceTab = "calendar" | "bookingSettings" | "requestSettings";

export function FormalTechnicianScheduleWorkspace({
  dataCenterPeriod,
  initialSelectedDate,
  profileAvatarUrl,
  profileId,
  profileName,
  searchQuery = "",
  shopId,
  tab,
  onDirtyChange
}: {
  dataCenterPeriod?: "last7days" | "last30days" | "week" | "month" | "year";
  initialSelectedDate?: string;
  profileAvatarUrl?: string | null;
  profileId: number;
  profileName: string;
  searchQuery?: string;
  shopId: number | null;
  shopName: string;
  tab: WorkspaceTab;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const calendarTechnician = useMemo<UnifiedCalendarTechnician>(() => ({
    avatar: profileAvatarUrl ?? "",
    id: String(profileId),
    name: profileName,
    storeId: shopId === null ? "" : String(shopId)
  }), [profileAvatarUrl, profileId, profileName, shopId]);
  const dataCenterPeriodLabel = dataCenterPeriod === "last30days"
    ? "近30天"
    : dataCenterPeriod === "week"
      ? "本周"
      : dataCenterPeriod === "month"
        ? "本月"
        : dataCenterPeriod === "year"
          ? "今年"
          : dataCenterPeriod === "last7days"
            ? "近7天"
            : null;

  return (
    <div className="text-[color:var(--client-text)]" data-testid="formal-technician-schedule-workspace">
      <div className="space-y-4">
        {dataCenterPeriodLabel ? <p className="rounded-2xl border border-[color:var(--client-line)] bg-[color:color-mix(in_srgb,var(--client-elevated)_72%,transparent)] px-4 py-2.5 text-xs font-black text-[color:var(--client-muted)]">数据中心期间：{dataCenterPeriodLabel}</p> : null}
        {tab === "bookingSettings" || tab === "requestSettings" ? (
          <TechnicianAutomationSettingsPanel
            kind={tab === "bookingSettings" ? "booking" : "request"}
            onDirtyChange={onDirtyChange}
          />
        ) : (
          <>
            <TechnicianScheduleCycleInbox profileId={profileId} />
            <UnifiedUserCalendar
              currentTechnician={calendarTechnician}
              displayMode="personal"
              formalOnly
              initialSelectedDate={initialSelectedDate}
              scope="technician"
              searchQuery={searchQuery}
              showSourceDrawer
            />
          </>
        )}
      </div>
    </div>
  );
}
