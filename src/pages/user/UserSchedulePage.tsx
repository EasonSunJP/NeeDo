import { useState } from "react";
import { FloatingHomeHeader } from "../../components/mobile/FloatingHomeHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { roleBasedTabConfig, userNavItems } from "../../components/mobile/navItems";
import { SharedHomeHeader } from "../../components/mobile/SharedHomeHeader";
import { ScheduleSearchField } from "../../components/scheduling/ScheduleSearchField";
import { UnifiedUserCalendar } from "../../components/scheduling/UnifiedUserCalendar";
import { useAuth } from "../../auth/AuthProvider";
import { getCustomerLevelLabel } from "../../shared/profile-card/customerMembership";
import { useEntityStore } from "../../state/entityStore";
import { useHomeLayoutStore } from "../../state/homeLayoutStore";

export function UserSchedulePage() {
  const userPortalConfig = roleBasedTabConfig.user;
  const { session } = useAuth();
  const { customers } = useEntityStore();
  const { config } = useHomeLayoutStore();
  const [scheduleSearchQuery, setScheduleSearchQuery] = useState("");
  const currentCustomer = customers.find((customer) => customer.id === session?.linkedCustomerId) ?? customers[0];
  const selectedLocation = config.locations.find((item) => item.id === config.selectedLocationId) ?? config.locations[0];

  if (!currentCustomer || !selectedLocation) {
    return null;
  }

  return (
    <MobileShell navItems={userNavItems}>
      <FloatingHomeHeader
        panelClassName="client-floating-header-glass-frame rounded-none border-transparent px-0 pb-0 shadow-none"
        stacked
      >
        <SharedHomeHeader
          avatarAlt={currentCustomer.name}
          avatarLevelLabel={getCustomerLevelLabel(currentCustomer.activeScore)}
          avatarMembershipLevel={currentCustomer.memberLevel}
          avatarSrc={currentCustomer.avatar}
          avatarTo={userPortalConfig.myPath}
          locationLabel={selectedLocation.label}
          locationCaption="当前服务区域"
          settingsLabel="系统设置"
          settingsTo={userPortalConfig.settingsPath}
        />

        <ScheduleSearchField onChange={setScheduleSearchQuery} value={scheduleSearchQuery} />
      </FloatingHomeHeader>

      <div className="space-y-3 px-4 pb-28 pt-2">
        <UnifiedUserCalendar currentCustomer={currentCustomer} searchQuery={scheduleSearchQuery} />
      </div>
    </MobileShell>
  );
}
