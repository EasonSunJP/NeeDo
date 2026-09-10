import { Navigate, useSearchParams } from "react-router-dom";
import { MerchantAdminLayout } from "../../../components/merchant-admin/MerchantAdminLayout";
import { MerchantDispatchCenterShell } from "../../../components/merchant-admin/MerchantDispatchCenterShell";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { cn } from "../../../lib/utils";
import { MerchantScheduleManagementPanel } from "./MerchantScheduleManagementPanel";

export function MerchantAdminDispatchCenterIndexRedirectPage() {
  return <Navigate replace to="/merchant-admin/dispatch-center/current" />;
}

export function MerchantAdminDispatchCenterCurrentPage() {
  return (
    <MerchantAdminLayout>
      <MerchantDispatchCenterShell
        breadcrumb="调度中心 / 现状确认"
        description="分页读取当前店铺范围内的真实排班库存；不会混入浏览器演示周期、模拟员工或静态订单。"
        tab="current"
        title="现状确认"
      >
        <MerchantScheduleManagementPanel readOnly />
      </MerchantDispatchCenterShell>
    </MerchantAdminLayout>
  );
}

export function MerchantAdminDispatchCenterAppointmentsPage() {
  return <Navigate replace to="/merchant-admin/orders" />;
}

type ScheduleMode = "manual" | "auto" | "smart";

function getScheduleMode(value?: string | null): ScheduleMode {
  if (value === "auto" || value === "smart") return value;
  return "manual";
}

function ScheduleModeTabs({ mode, onChange }: { mode: ScheduleMode; onChange: (mode: ScheduleMode) => void }) {
  const items: Array<{ mode: ScheduleMode; label: string; caption: string; badge?: string }> = [
    { mode: "manual", label: "正式排班", caption: "创建、阻塞和软删除时段" },
    { mode: "auto", label: "自动", caption: "等待规则与审批合同" },
    { mode: "smart", label: "智能", caption: "等待优化器与外部信号合同", badge: "未启用" }
  ];

  return (
    <section className="merchant-dispatch-surface rounded-[26px] border p-4">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button className={cn("merchant-dispatch-toggle min-w-[160px] rounded-full border px-4 py-2 text-left text-sm font-black transition", mode === item.mode && "is-active")} key={item.mode} onClick={() => onChange(item.mode)} type="button">
            <span className="flex items-center gap-2">{item.label}{item.badge ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">{item.badge}</span> : null}</span>
            <span className="mt-1 block text-[11px] font-semibold opacity-70">{item.caption}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ScheduleAutomationCapabilityGate({ mode }: { mode: "auto" | "smart" }) {
  const requirements = mode === "auto"
    ? ["ScheduleRule、ScheduleCycle、StaffFeedback 与审批版本表", "生成、冲突检测、技师自主发布与商户直接排班状态机", "幂等任务、并发锁、失败恢复、通知和完整审计"]
    : ["可版本化的优化目标、约束、特征与模型回执", "ExternalSignalAdapter、超时、降级和 provider_unavailable 合同", "离线评估、人工确认、可解释结果和回滚"];

  return (
    <section className="rounded-[22px] border border-line bg-white p-6 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h3 className="text-xl font-black text-ink">{mode === "auto" ? "自动排班" : "智能排班"}尚未启用</h3>
          <p className="mt-3 text-sm font-bold leading-7 text-ink/60">当前不会生成模拟排班、虚构预测或仅保存在浏览器中的确认结果。正式合同完成前，请使用已接数据库和审计日志的正式排班。</p>
        </div>
        <Badge tone="yellow">生产保护</Badge>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {requirements.map((requirement, index) => <article className="rounded-lg border border-line bg-paper p-4" key={requirement}><span className="text-xs font-black text-moss">上线条件 {index + 1}</span><p className="mt-2 text-sm font-black leading-6 text-ink">{requirement}</p></article>)}
      </div>
      <div className="mt-5"><Button to="/merchant-admin/dispatch-center/schedule?mode=manual" variant="secondary">进入正式排班</Button></div>
    </section>
  );
}

export function MerchantAdminDispatchCenterSchedulePage() {
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
      <MerchantDispatchCenterShell breadcrumb="调度中心 / 排班" description="正式排班直接写入 ScheduleSlot、Availability 与审计日志；未完成正式合同的自动能力保持关闭。" tab="schedule" title="排班">
        <div className="space-y-5">
          <ScheduleModeTabs mode={mode} onChange={updateMode} />
          {mode === "manual" ? <MerchantScheduleManagementPanel /> : <ScheduleAutomationCapabilityGate mode={mode} />}
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
