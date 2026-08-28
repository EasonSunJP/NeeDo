import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { affiliateProfileApi, type AffiliateProfile } from "../../api/affiliateProfile";
import { useAuth } from "../../auth/AuthProvider";
import { AppIcon } from "../../components/client-ui/AppScaffold";
import { businessNavItems } from "../../components/mobile/businessNavItems";
import {
  FloatingHomeHeader,
  floatingHeaderGlassPanelClassName,
  floatingHeaderInnerClassName,
  floatingHeaderSearchFieldClassName,
  floatingHeaderSearchIconClassName,
  floatingHeaderSearchTextClassName
} from "../../components/mobile/FloatingHomeHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { SharedHomeHeader } from "../../components/mobile/SharedHomeHeader";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";

export function BusinessCpsPage() {
  const { language } = useI18n();
  const { session } = useAuth();
  const [profile, setProfile] = useState<AffiliateProfile | null>(null);
  const t = (source: string) => translateText(source, language);

  useEffect(() => {
    let cancelled = false;

    void affiliateProfileApi.getMine()
      .then((nextProfile) => {
        if (!cancelled) setProfile(nextProfile);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = profile?.displayName ?? session?.username ?? t("联盟营销");
  const needoId = profile?.needoId ?? session?.needoId ?? "NeeDo ID";

  return (
    <MobileShell className="business-cps-shell" navItems={businessNavItems}>
      <FloatingHomeHeader panelClassName={floatingHeaderGlassPanelClassName} stacked>
        <div className={`${floatingHeaderInnerClassName} space-y-3`}>
          <SharedHomeHeader
            avatarAlt={displayName}
            avatarLabel={t("打开联盟营销资料")}
            avatarSrc={profile?.avatarUrl ?? session?.avatarUrl ?? ""}
            avatarTo="/afirieito/me"
            locationCaption={`${t("当前身份")} · ${needoId}`}
            locationIcon="manager"
            locationLabel={t("联盟营销")}
            locationTo="/afirieito/settings/portal"
            settingsLabel={t("切换其他身份")}
            settingsTo="/afirieito/settings/portal"
          />

          <Link className={floatingHeaderSearchFieldClassName} to="/afirieito/plan">
            <AppIcon className={floatingHeaderSearchIconClassName} name="search" />
            <span className={floatingHeaderSearchTextClassName}>{t("搜索推荐任务")}</span>
          </Link>
        </div>
      </FloatingHomeHeader>
      <main className="px-4 pb-28 pt-2">
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
