import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../auth/AuthProvider";
import { MerchantAdminLayout } from "../../../components/merchant-admin/MerchantAdminLayout";
import { MerchantDispatchCenterShell } from "../../../components/merchant-admin/MerchantDispatchCenterShell";
import { ManualSchedulingWorkspace } from "../../../components/scheduling/ManualSchedulingWorkspace";
import { SmartSchedulingWorkspace } from "../../../components/scheduling/SmartSchedulingWorkspace";
import { DispatchOverviewWorkspace } from "../../../features/dispatch-center/components/OverviewWorkspace";
import { AutomationWizard } from "../../../features/scheduling/automation/AutomationWizard";
import { MerchantAppointmentScheduleWorkspace } from "../../../features/technician-schedule/route-pages";
import { cn } from "../../../lib/utils";

function useCurrentStoreId() {
  const { session } = useAuth();

  return session?.linkedStoreId ?? "store-1";
}

export function MerchantAdminDispatchCenterIndexRedirectPage() {
  return <Navigate replace to="/merchant-admin/dispatch-center/current" />;
}

export function MerchantAdminDispatchCenterCurrentPage() {
  const storeId = useCurrentStoreId();

  return (
    <MerchantAdminLayout>
      <MerchantDispatchCenterShell
        breadcrumb="调度中心 / 现状确认"
        description="查看当前正在执行或即将执行的排班周期，处理异常、临时调整、员工状态和 confirmed_slots 投影。"
        tab="current"
        title="现状确认"
      >
        <DispatchOverviewWorkspace operatorId={storeId} staffLabel="员工" storeId={storeId} surface="desktop" />
      </MerchantDispatchCenterShell>
    </MerchantAdminLayout>
  );
}

export function MerchantAdminDispatchCenterAppointmentsPage() {
  const storeId = useCurrentStoreId();

  return (
    <MerchantAdminLayout>
      <MerchantDispatchCenterShell
        breadcrumb="调度中心 / 预约一览"
        description="与商户端前台保持同一套预约日程能力，并针对电脑后台优化日/周/月视图、筛选和详情处理。"
        tab="appointments"
        title="预约一览"
      >
        <MerchantAppointmentScheduleWorkspace storeId={storeId} surface="desktop" />
      </MerchantDispatchCenterShell>
    </MerchantAdminLayout>
  );
}

type ScheduleMode = "manual" | "auto" | "smart";

function getScheduleMode(value?: string | null): ScheduleMode {
  if (value === "manual") {
    return "manual";
  }

  if (value === "smart") {
    return "smart";
  }

  return "auto";
}

function ScheduleModeTabs({
  mode,
  onChange
}: {
  mode: ScheduleMode;
  onChange: (mode: ScheduleMode) => void;
}) {
  const items: Array<{ mode: ScheduleMode; label: string; caption: string; badge?: string }> = [
    { mode: "manual", label: "手动", caption: "店长直接排每个人" },
    { mode: "auto", label: "自动", caption: "规则 + 员工反馈 + 商户确认" },
    { mode: "smart", label: "智能", caption: "预测 + 自动优化 + 异常队列", badge: "test" }
  ];

  return (
    <section className="merchant-dispatch-surface rounded-[26px] border p-4">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            className={cn(
              "merchant-dispatch-toggle min-w-[128px] rounded-full border px-4 py-2 text-left text-sm font-black transition",
              mode === item.mode && "is-active"
            )}
            key={item.mode}
            onClick={() => onChange(item.mode)}
            type="button"
          >
            <span className="flex items-center gap-2">
              {item.label}
              {item.badge ? (
                <span className="inline-flex h-5 items-center rounded-full bg-red-500 px-2 text-[10px] font-black lowercase leading-none text-white shadow-[0_0_0_2px_rgba(255,255,255,0.22)]">
                  {item.badge}
                </span>
              ) : null}
            </span>
            <span className="mt-1 block text-[11px] font-semibold opacity-70">{item.caption}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function MerchantAdminDispatchCenterSchedulePage() {
  const storeId = useCurrentStoreId();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = getScheduleMode(searchParams.get("mode") ?? searchParams.get("tab"));

  const updateMode = (nextMode: ScheduleMode) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("mode", nextMode);
    nextParams.delete("tab");
    setSearchParams(nextParams);
  };

  return (
    <MerchantAdminLayout>
      <MerchantDispatchCenterShell
        breadcrumb="调度中心 / 排班"
        description="排班内部统一承载手动、自动、智能三种方式；不会拆成三套无关页面，最终都回到现状确认。"
        tab="schedule"
        title="排班"
      >
        <div className="space-y-5">
          <ScheduleModeTabs mode={mode} onChange={updateMode} />
          {mode === "manual" ? <ManualSchedulingWorkspace mode="merchant" operatorId={storeId} storeId={storeId} surface="desktop" /> : null}
          {mode === "auto" ? <AutomationWizard operatorId={storeId} storeId={storeId} surface="desktop" /> : null}
          {mode === "smart" ? <SmartSchedulingWorkspace operatorId={storeId} storeId={storeId} surface="desktop" /> : null}
        </div>
      </MerchantDispatchCenterShell>
    </MerchantAdminLayout>
  );
}

export function MerchantAdminDispatchCenterOverviewPage() {
  return <Navigate replace to="/merchant-admin/dispatch-center/current" />;
}

export function MerchantAdminDispatchCenterAutomationPage() {
  return <Navigate replace to="/merchant-admin/dispatch-center/schedule?mode=auto" />;
}

export function MerchantAdminDispatchCenterManualPage() {
  return <Navigate replace to="/merchant-admin/dispatch-center/schedule?mode=manual" />;
}
