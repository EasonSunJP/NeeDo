import { Link } from "react-router-dom";
import { AppIcon } from "../../components/client-ui/AppScaffold";
import { FloatingHomeHeader } from "../../components/mobile/FloatingHomeHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { roleBasedTabConfig, userNavItems } from "../../components/mobile/navItems";
import { SharedHomeHeader } from "../../components/mobile/SharedHomeHeader";
import { UnifiedUserCalendar } from "../../components/scheduling/UnifiedUserCalendar";
import { useAuth } from "../../auth/AuthProvider";
import { cn } from "../../lib/utils";
import { getCustomerLevelLabel } from "../../shared/profile-card/customerMembership";
import { useEntityStore } from "../../state/entityStore";
import { useHomeLayoutStore } from "../../state/homeLayoutStore";
import { useClientTheme } from "../../theme/ClientThemeProvider";
import { TechnicianScheduleWorkspace, type TechnicianScheduleWorkspaceCopy } from "../../features/technician-schedule/route-pages";

const userScheduleCopy: TechnicianScheduleWorkspaceCopy = {
  summaryLabels: {
    confirmedHours: "已确认",
    bookedHours: "预约",
    freeHours: "空闲",
    tentativeHours: "待定"
  },
  tableInfo: "按当前日 / 周 / 月视图查看同一套日程数据，统计与下方列表会跟随当前周期同步。",
  tableInfoLabel: "查看日程表说明",
  tableTitle: "日程表",
  countLabel: "行程数",
  countValue: (brief) => `${brief.itemCount} 个`,
  revenueLabel: "创建",
  createButtonLabel: "创建",
  displayInfoEntries: "只展示已有行程，列表更紧凑。",
  displayInfoAll: "显示完整时间轴，可直接点击空白时间新建行程。",
  displayInfoLabel: "查看日程展示区说明",
  displayTitle: "日程展示区",
  dayHeadingSuffix: "日程",
  emptyCaption: "可以直接在空白时间新建预约、休息、移动、会议或私人安排。",
  emptyTitle: "这一天还没有日程"
};

export function UserSchedulePage() {
  const userPortalConfig = roleBasedTabConfig.user;
  const { session } = useAuth();
  const { customers } = useEntityStore();
  const { config } = useHomeLayoutStore();
  const { isNight } = useClientTheme();
  const currentCustomer = customers.find((customer) => customer.id === session?.linkedCustomerId) ?? customers[0];
  const selectedLocation = config.locations.find((item) => item.id === config.selectedLocationId) ?? config.locations[0];

  if (!currentCustomer || !selectedLocation) {
    return null;
  }

  return (
    <MobileShell navItems={userNavItems}>
      <FloatingHomeHeader panelClassName="rounded-none border-transparent bg-transparent px-0 pb-0 shadow-none backdrop-blur-none" stacked>
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

        <Link
          className="focus-ring flex h-12 items-center gap-3 rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,transparent)] px-3 shadow-[0_12px_30px_rgba(0,0,0,0.07)]"
          to="/schedule"
        >
          <span
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              isNight ? "bg-white/12 text-[color:var(--client-primary)]" : "bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]"
            )}
          >
            <AppIcon className="h-4 w-4" name="search" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[14px] font-black text-[color:var(--client-text)]">行程搜索</span>
        </Link>
      </FloatingHomeHeader>

      <div className="space-y-3 px-4 pb-28 pt-2">
        <UnifiedUserCalendar currentCustomer={currentCustomer} />

        <details className="group rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)] px-3 py-2 shadow-[0_12px_30px_rgba(0,0,0,0.05)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-black text-[color:var(--client-text)] [&::-webkit-details-marker]:hidden">
            <span>舊版日程工作區</span>
            <span className="grid h-7 w-7 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] text-[color:var(--client-muted)] transition group-open:rotate-180">
              ˅
            </span>
          </summary>
          <div className="pt-2">
            <TechnicianScheduleWorkspace
              basePath="/schedule"
              copy={userScheduleCopy}
              detailActor="user"
              revenueSlot="create"
            />
          </div>
        </details>
      </div>
    </MobileShell>
  );
}
