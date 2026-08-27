import { SettingsArrow, SettingsSection } from "../../components/client-ui/SettingsDirectory";
import { InfoTooltipTrigger } from "../../components/ui/TitleWithInfo";
import { cn } from "../../lib/utils";

const testOnlyBackendPortalEntries = [
  {
    id: "merchant-admin",
    title: "商户后台",
    subtitle: "店铺订单、排班、员工、财务与门店设置",
    href: "/store-admin.html#/login/merchant-admin"
  },
  {
    id: "operations-admin",
    title: "运营后台",
    subtitle: "平台运营、店铺、技师、订单、财务与全局规则",
    href: "/pf-admin.html#/login/admin"
  },
  {
    id: "afirieito-admin",
    title: "NDA管理后台",
    subtitle: "推广计划、归因、分佣、风险与增长数据管理",
    href: "/afirieito-admin.html#/NDA-admin"
  }
] as const;

function TestOnlyBackendPortalLink({
  entry,
  t
}: {
  entry: (typeof testOnlyBackendPortalEntries)[number];
  t: (source: string) => string;
}) {
  const actionLabel = `${t("进入后台")}：${t(entry.title)}`;

  return (
    <div className="group relative flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left">
      <a
        aria-label={actionLabel}
        className={cn(
          "absolute inset-x-1 inset-y-1.5 z-10 rounded-[18px] transition",
          "hover:bg-[color:color-mix(in_srgb,var(--client-primary)_6%,transparent)]",
          "focus:outline-none focus-visible:bg-[color:color-mix(in_srgb,var(--client-primary)_8%,transparent)]"
        )}
        href={entry.href}
        rel="noopener noreferrer"
        target="_blank"
      >
        <span className="sr-only">{actionLabel}</span>
      </a>
      <div className="pointer-events-none relative z-20 min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[15px] font-black text-[color:var(--client-text)]">{t(entry.title)}</span>
          <span className="pointer-events-auto relative z-30">
            <InfoTooltipTrigger
              className="h-4 w-4 text-[10px]"
              content={t(entry.subtitle)}
              label={t("查看后台入口说明")}
              panelClassName="font-medium"
              panelMode="tooltip"
            />
          </span>
        </div>
      </div>
      <SettingsArrow className="pointer-events-none relative z-20" />
    </div>
  );
}

export function TestOnlyBackendPortalEntries({ t }: { t: (source: string) => string }) {
  return (
    <SettingsSection
      description={t("后台入口独立进入，不会改变当前前台身份。")}
      panelClassName="divide-y divide-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)]"
      title={t("后台入口")}
    >
      {testOnlyBackendPortalEntries.map((entry) => (
        <TestOnlyBackendPortalLink entry={entry} key={entry.id} t={t} />
      ))}
    </SettingsSection>
  );
}
