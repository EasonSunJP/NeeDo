import { useNavigate } from "react-router-dom";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { useClientTheme } from "../../theme/ClientThemeProvider";

export function MerchantAutoDispatchRoutePage() {
  const navigate = useNavigate();
  const { isNight } = useClientTheme();

  return (
    <MobileShell>
      <MobileFullscreenHeader
        dark={isNight}
        onBack={() => navigate(-1)}
        subtitle="正式调度服务"
        title="自动派单"
      />
      <main className="px-4 pb-28 pt-4">
        <section className="rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5 text-[color:var(--client-text)]">
          <p className="text-xs font-black text-[color:var(--client-primary)]">功能暂未开放</p>
          <h1 className="mt-2 text-xl font-black">等待正式派单状态机与审计接口</h1>
          <p className="mt-3 text-sm font-semibold leading-7 text-[color:var(--client-muted)]">
            当前不会根据浏览器本地订单、员工或排班生成预览结果，也不会保存本地派单规则。完成真实订单、技师可用性、事务、权限与审计后再开放。
          </p>
        </section>
      </main>
    </MobileShell>
  );
}
