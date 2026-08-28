import { useNavigate } from "react-router-dom";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { useClientTheme } from "../../theme/ClientThemeProvider";

export function ShopMemberCenterPage() {
  const navigate = useNavigate();
  const { isNight } = useClientTheme();

  return (
    <MobileShell>
      <MobileFullscreenHeader
        dark={isNight}
        onBack={() => navigate(-1)}
        subtitle="正式会员数据服务"
        title="店铺会员"
      />
      <main className="px-4 pb-28 pt-4">
        <section className="rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5 text-[color:var(--client-text)] shadow-[0_18px_44px_color-mix(in_srgb,var(--client-shadow)_12%,transparent)]">
          <p className="text-xs font-black text-[color:var(--client-primary)]">功能暂未开放</p>
          <h1 className="mt-2 text-xl font-black">等待正式会员数据库与权限接口</h1>
          <p className="mt-3 text-sm font-semibold leading-7 text-[color:var(--client-muted)]">
            会员卡、优惠券、核销、来源分析和消费统计不会再读取或写入浏览器本地数据。完成数据库、店铺范围权限、审计日志与正式 API 后再开放此入口。
          </p>
        </section>
      </main>
    </MobileShell>
  );
}
