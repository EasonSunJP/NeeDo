import { businessNavItems } from "../../components/mobile/businessNavItems";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { useClientTheme } from "../../theme/ClientThemeProvider";

export function BusinessCpsPage() {
  const { isNight } = useClientTheme();

  return (
    <MobileShell className="business-cps-shell" navItems={businessNavItems}>
      <MobileFullscreenHeader dark={isNight} title="NeeDoAfirieito" />
      <main className="px-4 pb-28 pt-4">
        <section className="rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5 text-[color:var(--client-text)]">
          <p className="text-xs font-black text-[color:var(--client-primary)]">功能暂未开放</p>
          <h1 className="mt-2 text-xl font-black">等待正式推广与结算 API</h1>
          <p className="mt-3 text-sm font-semibold leading-7 text-[color:var(--client-muted)]">
            推广计划、素材、链接、团队、收益、报表和风控不会再读取浏览器本地数据。正式数据库、权限、归因和审计链路验收后再开放。
          </p>
        </section>
      </main>
    </MobileShell>
  );
}
