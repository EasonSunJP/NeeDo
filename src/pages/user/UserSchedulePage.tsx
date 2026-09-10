import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MobileShell } from "../../components/mobile/MobileShell";
import { userNavItems } from "../../components/mobile/navItems";
import { SchedulePageHeader } from "../../components/scheduling/SchedulePageHeader";
import { UnifiedUserCalendar } from "../../components/scheduling/UnifiedUserCalendar";
import { useCustomerSelfProfile } from "../../features/core-read/useCustomerSelfProfile";

export function UserSchedulePage() {
  const navigate = useNavigate();
  const { profile, customer, loading, error, reload } = useCustomerSelfProfile();
  const [scheduleSearchQuery, setScheduleSearchQuery] = useState("");
  const handleBack = () => {
    const historyIndex = typeof window !== "undefined"
      ? (window.history.state as { idx?: number } | null)?.idx
      : undefined;
    if (typeof historyIndex === "number" && historyIndex > 0) {
      navigate(-1);
      return;
    }
    navigate("/");
  };
  const header = (
    <SchedulePageHeader
      ariaLabel="搜索日程"
      backLabel="返回用户首页"
      closeLabel="关闭日程"
      onBack={handleBack}
      onChange={setScheduleSearchQuery}
      onClose={() => navigate("/", { replace: true })}
      placeholder="搜索日程"
      value={scheduleSearchQuery}
    />
  );

  if (loading) {
    return (
      <MobileShell navItems={userNavItems} showBottomNav={false}>
        {header}
        <div aria-label="正在读取用户资料" className="mx-4 mt-6 rounded-[22px] border border-[color:var(--client-line)] px-4 py-5 text-sm font-black text-[color:var(--client-muted)]" role="status">
          正在读取用户资料...
        </div>
      </MobileShell>
    );
  }

  if (error || !profile || !customer) {
    return (
      <MobileShell navItems={userNavItems} showBottomNav={false}>
        {header}
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
    <MobileShell navItems={userNavItems} showBottomNav={false}>
      {header}

      <div className="space-y-3 px-4 pb-8 pt-2">
        <UnifiedUserCalendar
          currentCustomer={customer}
          formalOnly
          searchQuery={scheduleSearchQuery}
          showSourceDrawer
        />
      </div>
    </MobileShell>
  );
}
