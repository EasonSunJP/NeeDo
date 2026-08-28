import { useState } from "react";
import { FloatingHomeHeader, floatingHeaderGlassPanelClassName, floatingHeaderInnerClassName } from "../../components/mobile/FloatingHomeHeader";
import { cn } from "../../lib/utils";
import { MobileShell } from "../../components/mobile/MobileShell";
import { roleBasedTabConfig, userNavItems } from "../../components/mobile/navItems";
import { SharedHomeHeader } from "../../components/mobile/SharedHomeHeader";
import { ScheduleSearchField } from "../../components/scheduling/ScheduleSearchField";
import { UnifiedUserCalendar } from "../../components/scheduling/UnifiedUserCalendar";
import { useCustomerSelfProfile } from "../../features/core-read/useCustomerSelfProfile";
import { getCustomerLevelLabel } from "../../shared/profile-card/customerMembership";

export function UserSchedulePage() {
  const userPortalConfig = roleBasedTabConfig.user;
  const { profile, customer, loading, error, reload } = useCustomerSelfProfile();
  const [scheduleSearchQuery, setScheduleSearchQuery] = useState("");

  if (loading) {
    return (
      <MobileShell navItems={userNavItems}>
        <div aria-label="正在读取用户资料" className="mx-4 mt-6 rounded-[22px] border border-[color:var(--client-line)] px-4 py-5 text-sm font-black text-[color:var(--client-muted)]" role="status">
          正在读取用户资料...
        </div>
      </MobileShell>
    );
  }

  if (error || !profile || !customer) {
    return (
      <MobileShell navItems={userNavItems}>
        <div className="mx-4 mt-6 rounded-[22px] border border-red-300 bg-red-50 px-4 py-5 text-sm font-black text-red-700" role="alert">
          <p>用户资料读取失败：{error ?? "正式用户资料不可用"}</p>
          <button className="focus-ring mt-3 rounded-full border border-red-300 px-4 py-2" onClick={reload} type="button">
            重试
          </button>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell navItems={userNavItems}>
      <FloatingHomeHeader
        panelClassName={floatingHeaderGlassPanelClassName}
        stacked
      >
        <div className={cn(floatingHeaderInnerClassName, "space-y-3")}>
          <SharedHomeHeader
            avatarAlt={customer.name}
            avatarLevelLabel={getCustomerLevelLabel(customer.activeScore)}
            avatarMembershipLevel={customer.memberLevel}
            avatarSrc={customer.avatar}
            avatarTo={userPortalConfig.myPath}
            locationLabel={profile.city ?? "服务区域未设置"}
            locationCaption="当前服务区域"
            locationTo="/me/settings/service-range"
            settingsLabel="系统设置"
            settingsTo={userPortalConfig.settingsPath}
          />

          <ScheduleSearchField onChange={setScheduleSearchQuery} value={scheduleSearchQuery} />
        </div>
      </FloatingHomeHeader>

      <div className="space-y-3 px-4 pb-28 pt-2">
        <UnifiedUserCalendar currentCustomer={customer} formalOnly searchQuery={scheduleSearchQuery} />
      </div>
    </MobileShell>
  );
}
