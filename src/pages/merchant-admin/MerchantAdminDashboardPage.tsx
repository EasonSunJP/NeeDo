import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  backofficeRealDataApi,
  type BackofficeDashboardPayload,
  type DashboardMerchantSnapshot,
  type ManageableMerchantShopPayload,
  type PaginatedApiPayload
} from "../../api/backofficeRealData";
import {
  MerchantAdminLayout,
  type MerchantAdminDashboardResource
} from "../../components/merchant-admin/MerchantAdminLayout";
import { Button } from "../../components/ui/Button";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { useAuth } from "../../auth/AuthProvider";
import { DualAxisLineChart, GroupedBarChart } from "../../features/dashboard/DashboardCharts";
import {
  DashboardFilterBar,
  type DashboardFilterValue
} from "../../features/dashboard/DashboardFilterBar";
import { DashboardMetricCard } from "../../features/dashboard/DashboardMetricCard";
import { formatDashboardNumber } from "../../features/dashboard/dashboardFormat";
import { describeMerchantReadError } from "../../features/merchant-admin/merchantReadError";
import { useI18n } from "../../i18n/I18nProvider";
import { translateTextForContext, type Language } from "../../i18n/translations";

type ManageableShopLoader = (
  page: number,
  pageSize: number,
  options: { signal: AbortSignal }
) => Promise<PaginatedApiPayload<ManageableMerchantShopPayload>>;

type ShopSwitchResult = { ok: true; shopPublicId?: string } | { ok: false; message: string };

export type MerchantShopSwitcherProps = {
  currentShopPublicId: string;
  loadPage?: ManageableShopLoader;
  onSwitch: (shopPublicId: string) => Promise<ShopSwitchResult>;
};

function mergeShops(
  current: ManageableMerchantShopPayload[],
  incoming: ManageableMerchantShopPayload[]
) {
  const merged = new Map(current.map((shop) => [shop.publicId, shop]));
  incoming.forEach((shop) => merged.set(shop.publicId, shop));
  return [...merged.values()];
}

export function MerchantShopSwitcher({
  currentShopPublicId,
  loadPage = backofficeRealDataApi.manageableMerchantShops,
  onSwitch
}: MerchantShopSwitcherProps) {
  const { language } = useI18n();
  const t = (source: string) => translateTextForContext(source, language, { portal: "merchant" });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [shops, setShops] = useState<ManageableMerchantShopPayload[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [switchingShop, setSwitchingShop] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setShops([]);
    setPage(0);
    setTotal(0);
    setError("");
    void loadPage(1, 20, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setShops(result.list);
        setPage(result.page);
        setPageSize(result.page_size);
        setTotal(result.total);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "error.api");
      });
    return () => controller.abort();
  }, [currentShopPublicId, loadPage]);

  function closeAndRestoreFocus() {
    setOpen(false);
    setError("");
    queueMicrotask(() => triggerRef.current?.focus());
  }

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeAndRestoreFocus();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  async function loadMore() {
    if (loadingMore || shops.length >= total) return;
    const controller = new AbortController();
    setLoadingMore(true);
    setError("");
    try {
      const result = await loadPage(page + 1, 20, {
        signal: controller.signal
      });
      setShops((current) => mergeShops(current, result.list));
      setPage(result.page);
      setPageSize(result.page_size);
      setTotal(result.total);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "error.api");
    } finally {
      setLoadingMore(false);
    }
  }

  async function selectShop(shopPublicId: string) {
    if (shopPublicId === currentShopPublicId || switchingShop) return;
    setSwitchingShop(shopPublicId);
    setError("");
    const result = await onSwitch(shopPublicId);
    if (!result.ok) {
      setError(result.message);
      setSwitchingShop(null);
      return;
    }
    setOpen(false);
  }

  if (total <= 1) return null;

  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className="focus-ring rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-black text-white transition hover:bg-white/15"
        onClick={() => {
          setError("");
          setOpen((current) => !current);
        }}
        ref={triggerRef}
        type="button"
      >
        {t("切换店铺")}
      </button>
      {open ? (
        <section
          aria-label={t("选择店铺")}
          className="absolute right-0 top-12 z-30 w-[min(88vw,360px)] rounded-2xl border border-line bg-white p-3 text-ink shadow-soft"
          role="dialog"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-1 pb-3">
            <div>
              <h3 className="text-sm font-black">{t("选择店铺")}</h3>
              <p className="mt-1 text-xs font-bold text-ink/45">
                {t("切换后所有商户数据将按新店铺重新加载")}
              </p>
            </div>
            <button
              aria-label={t("关闭店铺列表")}
              className="focus-ring grid h-8 w-8 place-items-center rounded-full bg-paper text-sm font-black"
              onClick={closeAndRestoreFocus}
              type="button"
            >
              ×
            </button>
          </div>
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {shops.map((shop) => {
              const selected = shop.publicId === currentShopPublicId || shop.selected;
              return (
                <button
                  aria-current={selected ? "true" : undefined}
                  className="focus-ring flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-paper px-3 py-3 text-left transition hover:border-moss disabled:cursor-wait disabled:opacity-60"
                  disabled={selected || Boolean(switchingShop)}
                  key={shop.publicId}
                  onClick={() => void selectShop(shop.publicId)}
                  type="button"
                >
                  <span className="min-w-0">
                    <strong className="block truncate text-sm">{shop.name}</strong>
                    <span className="mt-1 block truncate text-xs font-bold text-ink/45">
                      {shop.city} · {shop.status}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-black text-moss">
                    {selected
                      ? t("当前店铺")
                      : switchingShop === shop.publicId
                        ? t("切换中…")
                        : "→"}
                  </span>
                </button>
              );
            })}
          </div>
          {error ? (
            <p
              className="mt-3 rounded-xl bg-coral/10 px-3 py-2 text-xs font-bold text-coral"
              role="alert"
            >
              {t("店铺切换失败，当前店铺和数据保持不变")}
            </p>
          ) : null}
          {shops.length < total ? (
            <button
              className="focus-ring mt-3 w-full rounded-xl border border-line bg-white px-3 py-2 text-xs font-black text-moss disabled:opacity-60"
              disabled={loadingMore}
              onClick={() => void loadMore()}
              type="button"
            >
              {loadingMore ? t("加载中…") : t("加载更多")}
            </button>
          ) : null}
          <p className="mt-2 text-center text-[11px] font-bold text-ink/40" data-no-i18n>
            {shops.length} / {total} · {pageSize}
          </p>
        </section>
      ) : null}
    </div>
  );
}

export function formatBillingAccountLabel(
  billing: DashboardMerchantSnapshot["billing"],
  t: (source: string) => string
) {
  if (!billing || billing.state === "free" || billing.cadence === "free") return t("免费账号");
  if (billing.state === "overdue") return t("欠费账号");
  if (billing.state === "trial") return t("试用期间");
  return billing.cadence === "annual" ? t("年费账号") : t("月费账号");
}

function ShopInformationCard({
  dashboard,
  language,
  allowSwitch,
  onSwitch
}: {
  dashboard: BackofficeDashboardPayload;
  language: Language;
  allowSwitch: boolean;
  onSwitch: MerchantShopSwitcherProps["onSwitch"];
}) {
  const t = (source: string) => translateTextForContext(source, language, { portal: "merchant" });
  if (!dashboard.shop) return null;
  const available = dashboard.shop.wallet.availableBalance;
  const frozen = dashboard.shop.wallet.frozenBalance;
  const billingDetail =
    dashboard.shop.billing?.state === "trial"
      ? dashboard.shop.billing.trialEndsAt
      : dashboard.shop.billing?.paidThrough;

  return (
    <section className="relative overflow-visible rounded-2xl border border-emerald-400/20 bg-[linear-gradient(135deg,#102620_0%,#183a32_55%,#24314b_100%)] p-5 text-white shadow-panel md:p-6">
      <div
        className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/60 to-transparent"
        aria-hidden="true"
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-200/70">
            {t("店铺信息")}
          </p>
          <h2 className="mt-2 truncate text-2xl font-black tracking-tight md:text-3xl" data-no-i18n>
            {dashboard.shop.name}
          </h2>
          <p className="mt-2 text-sm font-bold leading-6 text-white/60" data-no-i18n>
            {dashboard.shop.city} · {dashboard.shop.address}
          </p>
        </div>
        {allowSwitch ? (
          <MerchantShopSwitcher currentShopPublicId={dashboard.shop.publicId} onSwitch={onSwitch} />
        ) : null}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/8 px-4 py-3">
          <p className="text-xs font-bold text-white/50">{t("营业状态")}</p>
          <strong className="mt-1 block text-base" data-no-i18n>
            {dashboard.shop.status}
          </strong>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/8 px-4 py-3">
          <p className="text-xs font-bold text-white/50">{t("账户类型")}</p>
          <strong className="mt-1 block text-base">
            {formatBillingAccountLabel(dashboard.shop.billing, t)}
          </strong>
          {billingDetail ? (
            <span className="mt-1 block text-[11px] font-bold text-white/45" data-no-i18n>
              {billingDetail}
            </span>
          ) : null}
        </div>
        {dashboard.shop.wallet.status === "not_opened" ? (
          <div className="rounded-xl border border-white/10 bg-white/8 px-4 py-3 sm:col-span-2">
            <p className="text-xs font-bold text-white/50">{t("当前余额")}</p>
            <strong className="mt-1 block text-base">{t("未开通钱包")}</strong>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-white/10 bg-white/8 px-4 py-3">
              <p className="text-xs font-bold text-white/50">
                {t("可用余额")} · {t("当前余额")}
              </p>
              <strong className="mt-1 block text-lg" data-no-i18n>
                {available === null ? "—" : formatDashboardNumber(available, language)} NDP
              </strong>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/8 px-4 py-3">
              <p className="text-xs font-bold text-white/50">
                {t("冻结余额")} · {t("当前余额")}
              </p>
              <strong className="mt-1 block text-lg" data-no-i18n>
                {frozen === null ? "—" : formatDashboardNumber(frozen, language)} NDP
              </strong>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function NdpCostCard({
  dashboard,
  language
}: {
  dashboard: BackofficeDashboardPayload;
  language: Language;
}) {
  const t = (source: string) => translateTextForContext(source, language, { portal: "merchant" });
  const cost = dashboard.finance.shopNdpCost;
  return (
    <article className="relative overflow-hidden rounded-2xl border border-line bg-white p-4 shadow-panel">
      <span className="absolute inset-y-0 right-0 w-1 bg-purple-500" aria-hidden="true" />
      <h3 className="text-sm font-black text-ink/60">{t("NDP 成本")}</h3>
      <div className="mt-4 flex items-baseline gap-1.5">
        <strong className="text-3xl font-black tracking-tight text-ink" data-no-i18n>
          {cost ? formatDashboardNumber(cost.totalNdp, language) : "—"}
        </strong>
        <span className="text-xs font-black text-ink/45">NDP</span>
      </div>
      {cost ? (
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3">
          <div className="rounded-xl bg-paper px-3 py-2">
            <p className="text-xs font-bold text-ink/45">{t("平台")}</p>
            <strong className="mt-1 block text-sm text-ink" data-no-i18n>
              {formatDashboardNumber(cost.platformNdp, language)} NDP
            </strong>
          </div>
          <div className="rounded-xl bg-paper px-3 py-2">
            <p className="text-xs font-bold text-ink/45">{t("用户返点")}</p>
            <strong className="mt-1 block text-sm text-ink" data-no-i18n>
              {formatDashboardNumber(cost.userRewardNdp, language)} NDP
            </strong>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs font-bold text-ink/45">{t("数据暂不可用")}</p>
      )}
    </article>
  );
}

function MerchantAdminDashboardContent({ resource }: { resource: MerchantAdminDashboardResource }) {
  const { language } = useI18n();
  const { session, switchMerchantShop } = useAuth();
  const t = (source: string) => translateTextForContext(source, language, { portal: "merchant" });
  const [committedDashboard, setCommittedDashboard] = useState<BackofficeDashboardPayload | null>(
    resource.dashboard
  );

  useEffect(() => {
    if (resource.dashboard) setCommittedDashboard(resource.dashboard);
  }, [resource.dashboard]);

  const dashboard = resource.dashboard ?? committedDashboard;
  const ownerSwitchPending = !resource.dashboard && Boolean(committedDashboard);
  const loadError = resource.error ? describeMerchantReadError(resource.error, language) : "";
  const completedCustomerCount = dashboard
    ? dashboard.membership?.completedCustomerCount
    : undefined;

  function applyFilter(value: DashboardFilterValue) {
    resource.setQuery(value);
  }

  function resetFilter() {
    resource.setQuery({ period: "last7days" });
  }

  return (
    <div aria-busy={resource.status === "loading"} className="relative min-w-0 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-moss">{t("NeeDo 店铺经营")}</p>
          <TitleWithInfo
            as="h1"
            className="mt-1"
            info={t("订单、排班、技师、钱包与财务指标均来自当前签名店铺范围。")}
            label={t("数据大盘说明")}
            title={t("数据大盘")}
            titleClassName="text-3xl font-black"
            variant="paper"
          />
        </div>
        <div className="flex gap-2">
          <Link
            className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-black text-ink"
            to="/merchant-admin/orders"
          >
            {t("处理订单")}
          </Link>
          <Link
            className="rounded-xl bg-moss px-4 py-2 text-sm font-black text-white"
            to="/merchant-admin/finance"
          >
            {t("财务中心")}
          </Link>
        </div>
      </header>

      <DashboardFilterBar
        loading={resource.status === "loading"}
        onApply={applyFilter}
        onReset={resetFilter}
        value={resource.query}
      />

      {resource.status === "loading" && !dashboard ? (
        <section
          aria-live="polite"
          className="rounded-2xl border border-line bg-white px-5 py-12 text-center shadow-panel"
        >
          <p className="text-sm font-black text-ink">{t("正在加载真实经营数据")}</p>
        </section>
      ) : null}

      {resource.status === "error" ? (
        <section
          className="rounded-2xl border border-coral/30 bg-coral/5 px-5 py-6 text-center shadow-panel"
          role="alert"
        >
          <h2 className="text-lg font-black text-ink">{t("数据大盘加载失败")}</h2>
          <p className="mt-2 text-sm font-bold text-ink/55">{loadError}</p>
          {dashboard ? (
            <p className="mt-2 text-xs font-bold text-ink/45">{t("以下仍显示上次成功结果")}</p>
          ) : null}
          <Button className="mt-4" onClick={resource.reload}>
            {t("重新加载数据大盘")}
          </Button>
        </section>
      ) : null}

      {dashboard ? (
        <>
          <ShopInformationCard
            allowSwitch={session?.portal === "merchant"}
            dashboard={dashboard}
            language={language}
            onSwitch={switchMerchantShop}
          />

          <section
            aria-label={t("核心经营数据")}
            className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            <DashboardMetricCard
              accent="blue"
              comparison={dashboard.summary.availableScheduleSlots}
              icon="◇"
              title={t("可排班")}
              unit="slots"
            />
            <DashboardMetricCard
              accent="green"
              comparison={dashboard.summary.activeTechnicians}
              icon="●"
              title={t("活跃技师")}
              unit="people"
            />
            <DashboardMetricCard
              accent="purple"
              comparison={dashboard.summary.registeredTechnicians}
              icon="◎"
              title={t("注册技师")}
              unit="people"
            />
            <DashboardMetricCard
              accent="orange"
              icon="♡"
              secondary={
                completedCustomerCount === undefined
                  ? undefined
                  : {
                      label: t("利用者数"),
                      unit: "people",
                      value: completedCustomerCount
                    }
              }
              statusMessage={t("会员功能尚未开放")}
              title={t("会员数")}
              unit="people"
              value={dashboard.membership?.memberCount}
            />
          </section>

          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs font-bold text-ink/45">
            <p>
              {t("当前范围")} <span data-no-i18n>{dashboard.filter.from}</span> –{" "}
              <span data-no-i18n>{dashboard.filter.to}</span>
            </p>
            <p>
              {t("上期范围")} <span data-no-i18n>{dashboard.filter.previousFrom}</span> –{" "}
              <span data-no-i18n>{dashboard.filter.previousTo}</span>
            </p>
          </div>

          <section aria-label={t("店铺经营趋势")} className="grid min-w-0 gap-5 xl:grid-cols-3">
            <DualAxisLineChart
              buckets={dashboard.series.buckets}
              description={t("订单与服务金额趋势")}
              left={{ key: "orderCount", label: t("订单总量"), unit: t("单") }}
              right={{
                key: "serviceGmvJpy",
                label: t("服务 GMV"),
                unit: "JPY"
              }}
              title={t("订单总量和服务 GMV")}
            />
            <DualAxisLineChart
              buckets={dashboard.series.buckets}
              description={t("已完成服务的店铺预估毛利润")}
              left={{
                key: "shopEstimatedGrossProfitJpy",
                label: t("利润"),
                unit: "JPY"
              }}
              title={t("利润")}
            />
            <GroupedBarChart
              buckets={dashboard.series.buckets}
              description={t("总排班、空闲可预约与已预约时长")}
              series={[
                {
                  key: "scheduleTotalHours",
                  label: t("总排班时长"),
                  unit: t("小时")
                },
                {
                  key: "scheduleAvailableHours",
                  label: t("空闲可预约时长"),
                  unit: t("小时")
                },
                {
                  key: "scheduleBookedHours",
                  label: t("已预约时长"),
                  unit: t("小时")
                }
              ]}
              title={t("排班状态")}
            />
          </section>

          <section aria-label={t("NDP 汇总")} className="grid min-w-0 gap-3 md:grid-cols-2">
            <NdpCostCard dashboard={dashboard} language={language} />
            <DashboardMetricCard
              accent="cyan"
              testNdp={dashboard.finance.frozen.testNdp}
              title={t("冻结 NDP")}
              unit="ndp"
              value={dashboard.finance.frozen.ndp}
            />
          </section>
        </>
      ) : null}

      {ownerSwitchPending ? (
        <div
          className="absolute inset-0 z-40 grid min-h-[420px] place-items-center rounded-2xl bg-paper/95 backdrop-blur-sm"
          data-dashboard-switch-blocker
          role="status"
        >
          <div className="rounded-2xl border border-line bg-white px-6 py-5 text-center shadow-soft">
            <p className="text-sm font-black text-ink">{t("正在切换店铺并重新加载数据")}</p>
            <p className="mt-2 text-xs font-bold text-ink/45">
              {t("新店铺数据确认前，当前数据已冻结")}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MerchantAdminDashboardPage() {
  return (
    <MerchantAdminLayout>
      {(resource) => <MerchantAdminDashboardContent resource={resource} />}
    </MerchantAdminLayout>
  );
}
