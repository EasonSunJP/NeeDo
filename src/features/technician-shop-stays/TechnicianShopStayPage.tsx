import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { useCoreReadQuery } from "../core-read/hooks";
import { technicianProfileApi } from "../core-read/technicianProfileApi";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { getAuthenticatedPersistentCacheScope } from "../../lib/persistentCacheScope";
import {
  workStatusApi,
  type WorkStatusShopSwitch,
  type WorkStatusSnapshot,
} from "../technician-work-status/api";
import { ApiClientError } from "../../api/httpClient";

const workStatusLabel = {
  active: "合作中",
  on_leave: "休假中",
  suspended: "已暂停",
} as const;

export function TechnicianShopStayPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);
  const profile = useCoreReadQuery(
    () => technicianProfileApi.getMine(),
    [],
    {
      key: "technician:self",
      scope: getAuthenticatedPersistentCacheScope()
    }
  );
  const workStatus = useCoreReadQuery(
    () => workStatusApi.snapshot({ scope: "technician" }),
    [],
    {
      key: "technician:work-status:current-shop",
      scope: getAuthenticatedPersistentCacheScope(),
    },
  );
  const [snapshot, setSnapshot] = useState<WorkStatusSnapshot | null>(null);
  const [switchingShopId, setSwitchingShopId] = useState<number | null>(null);
  const [switchError, setSwitchError] = useState("");
  const pendingSwitch = useRef<WorkStatusShopSwitch | null>(null);
  useEffect(() => {
    if (workStatus.data) setSnapshot(workStatus.data);
  }, [workStatus.data]);
  const returnTo = (
    location.state as { technicianShopStayReturnTo?: unknown } | null
  )?.technicianShopStayReturnTo;
  const returnToPreSwitchPage = () => {
    if (typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
      navigate(returnTo, { replace: true });
      return;
    }
    navigate("/technician/me");
  };
  const switchCurrentShop = async (shopId: number) => {
    if (!snapshot || switchingShopId !== null) return;
    const input =
      pendingSwitch.current?.shopId === shopId
        ? pendingSwitch.current
        : {
            shopId,
            idempotencyKey: crypto.randomUUID(),
          };
    pendingSwitch.current = input;
    setSwitchingShopId(shopId);
    setSwitchError("");
    try {
      const next = await workStatusApi.switchCurrentShop(input);
      pendingSwitch.current = null;
      setSnapshot(next);
    } catch (error) {
      setSwitchError(t("店铺切换失败，请重试。"));
      if (error instanceof ApiClientError && error.status === 409) {
        pendingSwitch.current = null;
        try {
          setSnapshot(await workStatusApi.snapshot({ scope: "technician" }));
        } catch {
          // Keep the last server-confirmed snapshot while the refresh is unavailable.
        }
      }
    } finally {
      setSwitchingShopId(null);
    }
  };

  return (
    <MobileShell navItems={[]} navPanelStyle="plain" showBottomNav={false}>
      <MobileFullscreenHeader
        onBack={returnToPreSwitchPage}
        onClose={() => navigate("/technician", { replace: true })}
        title={t("入住店铺")}
      />
      <main className="client-app-gutter w-full space-y-4 pb-32 pt-4">
        {profile.error ? (
          <section className="rounded-[22px] border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-600">
            {t("店铺信息暂时无法获取，请稍后重试。")}
          </section>
        ) : null}
        {workStatus.error || switchError ? (
          <section className="rounded-[22px] border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-600" role="alert">
            {switchError || t("操作店铺状态暂时无法获取，请稍后重试。")}
          </section>
        ) : null}
        {!profile.data && !profile.error ? (
          <p className="py-12 text-center text-sm font-bold text-[color:var(--client-muted)]">
            {t("正在读取入住店铺…")}
          </p>
        ) : null}
        {profile.data?.shopAccessStatus === "requires_shop" ? (
          <section
            aria-atomic="true"
            className="rounded-[22px] border border-[#ff4d5e] bg-[#26060b] p-4 text-white shadow-[0_12px_32px_rgba(255,36,64,0.26)]"
            data-testid="technician-shop-required-notice"
            role="alert"
          >
            <h2 className="text-base font-black text-white">
              {t("需要入住店铺")}
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#ffd6dc]">
              {t(
                "当前没有有效合作店铺。你仍可进入技师端查看内容；提交入住申请并经店铺通过后，才可开启出勤、可排班和手动预约。",
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
            <p className="rounded-[18px] border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm font-bold text-sky-700">
              {t("切换只会改变当前操作店铺，不会改变其他店铺的出勤状态。每家店铺都需要单独出勤后才能接单。")}
            </p>
            {profile.data.shopAffiliations.map((affiliation) => {
              const isPrimary = affiliation.shopId === profile.data?.shopId;
              const isCurrent = affiliation.shopId === snapshot?.currentShop?.id;
              return (
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
                      {isPrimary ? (
                        <span className="rounded-full bg-[color:var(--client-primary-soft)] px-2 py-1 text-[10px] font-black text-[color:var(--client-primary-strong)]">
                          {t("主要展示店铺")}
                        </span>
                      ) : null}
                      {isCurrent ? (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-black text-emerald-700">
                          {t("当前操作店铺")}
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
                {!isCurrent ? (
                  <button
                    className="mt-4 min-h-11 w-full rounded-full border border-[color:var(--client-primary)] px-4 text-sm font-black text-[color:var(--client-primary-strong)] disabled:cursor-not-allowed disabled:opacity-45"
                    data-switch-current-shop={affiliation.shopId}
                    disabled={
                      !snapshot ||
                      switchingShopId !== null ||
                      affiliation.workStatus !== "active"
                    }
                    onClick={() => void switchCurrentShop(affiliation.shopId)}
                    type="button"
                  >
                    {switchingShopId === affiliation.shopId
                      ? t("正在切换…")
                      : t("切换为当前操作店铺")}
                  </button>
                ) : null}
              </article>
              );
            })}
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
