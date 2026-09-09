import { Link, useNavigate } from "react-router-dom";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { useCoreReadQuery } from "../core-read/hooks";
import { technicianProfileApi } from "../core-read/technicianProfileApi";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";

const workStatusLabel = {
  active: "合作中",
  on_leave: "休假中",
  suspended: "已暂停",
} as const;

export function TechnicianShopStayPage() {
  const navigate = useNavigate();
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);
  const profile = useCoreReadQuery(() => technicianProfileApi.getMine(), []);

  return (
    <MobileShell navItems={[]} navPanelStyle="plain" showBottomNav={false}>
      <MobileFullscreenHeader
        maxWidth="880px"
        onBack={() => navigate("/technician/me")}
        onClose={() => navigate("/technician/me")}
        title={t("入住店铺")}
      />
      <main className="mx-auto w-full max-w-[880px] space-y-4 px-4 pb-32 pt-4">
        {profile.error ? (
          <section className="rounded-[22px] border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-600">
            {t("店铺信息暂时无法获取，请稍后重试。")}
          </section>
        ) : null}
        {!profile.data && !profile.error ? (
          <p className="py-12 text-center text-sm font-bold text-[color:var(--client-muted)]">
            {t("正在读取入住店铺…")}
          </p>
        ) : null}
        {profile.data?.shopAccessStatus === "requires_shop" ? (
          <section
            className="rounded-[22px] border border-amber-500/35 bg-amber-500/10 p-4"
            data-testid="technician-shop-required-notice"
          >
            <h2 className="text-base font-black text-[color:var(--client-text)]">
              {t("需要入住店铺")}
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-[color:var(--client-muted)]">
              {t(
                "当前没有有效合作店铺，技师身份已暂停工作功能。提交申请并由店铺通过后即可继续使用。",
              )}
            </p>
          </section>
        ) : null}
        {profile.data ? (
          <section
            className="space-y-3"
            data-testid="technician-shop-affiliations"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-[color:var(--client-text)]">
                  {t("已入住店铺")}
                </h2>
                <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">
                  {profile.data.shopAffiliations.length} {t("家有效合作店铺")}
                </p>
              </div>
              <Link
                className="focus-ring inline-flex min-h-11 min-w-24 items-center justify-center rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)]"
                to="/technician/shop-stays/apply"
              >
                {t("追加")}
              </Link>
            </div>
            {profile.data.shopAffiliations.map((affiliation, index) => (
              <article
                className="rounded-[24px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-[var(--client-shadow)]"
                key={affiliation.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-black text-[color:var(--client-text)]">
                        {affiliation.name}
                      </h3>
                      {index === 0 ? (
                        <span className="rounded-full bg-[color:var(--client-primary-soft)] px-2 py-1 text-[10px] font-black text-[color:var(--client-primary-strong)]">
                          {t("首家店铺")}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs font-bold text-[color:var(--client-muted)]">
                      {affiliation.publicId ?? t("店铺公开 ID 待补齐")}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[color:var(--client-muted)]">
                      {affiliation.address || affiliation.city}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-[color:var(--client-line)] px-2.5 py-1 text-xs font-black text-[color:var(--client-text)]">
                    {t(workStatusLabel[affiliation.workStatus])}
                  </span>
                </div>
              </article>
            ))}
            {profile.data.shopAffiliations.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-[color:var(--client-line)] p-8 text-center text-sm font-bold text-[color:var(--client-muted)]">
                {t("暂无有效入住店铺")}
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
    </MobileShell>
  );
}
