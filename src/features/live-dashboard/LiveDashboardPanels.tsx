import type { ReactNode } from "react";
import type { LiveDashboardSnapshot } from "../../api/liveDashboard";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateTextForContext } from "../../i18n/translations";
import { AutoScrollList } from "./AutoScrollList";
import { LiveTrendChart } from "./LiveTrendChart";

interface LiveDashboardPanelsProps {
  map: ReactNode;
  snapshot: LiveDashboardSnapshot;
}

type Money = LiveDashboardSnapshot["confirmedPayments"];

const numberFormat = (value: number, locale: string) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
const jpyFormat = (value: number, locale: string) => new Intl.NumberFormat(locale, { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value);

function PanelHeading({ scopeLabel, title }: { scopeLabel: string; title: string }) {
  return (
    <header className="live-dashboard-panel-heading">
      <h2>{title}</h2>
      <span data-scope-label={scopeLabel}>{scopeLabel}</span>
    </header>
  );
}

function MoneyRows({ locale, money }: { locale: string; money: Money }) {
  return (
    <div className="live-dashboard-money-rows">
      <strong>{jpyFormat(money.jpy, locale)}</strong>
      <span>{numberFormat(money.ndp, locale)} NDP</span>
      <span>{numberFormat(money.testNdp, locale)} Test NDP</span>
    </div>
  );
}

export function LiveDashboardPanels({ map, snapshot }: LiveDashboardPanelsProps) {
  const { language } = useOptionalI18n();
  const t = (source: string) => translateTextForContext(source, language, { portal: "admin" });
  const locale = language === "ja" ? "ja-JP" : language === "ko" ? "ko-KR" : language === "en" ? "en-US" : "zh-CN";
  const scopeLabel = snapshot.scope.breadcrumbs.map((item) => item.name).join(" / ");
  const empty = <p className="live-dashboard-empty">{t("暂无数据")}</p>;
  const metrics = [
    [t("新增订单"), snapshot.headline.newOrders],
    [t("完成订单"), snapshot.headline.completedOrders],
    [t("新增用户"), snapshot.headline.newCustomers],
    [t("入驻技师"), snapshot.headline.onboardedTechnicians]
  ] as const;

  const renderOrder = (order: LiveDashboardSnapshot["activity"][number]) => (
    <article className="live-dashboard-order-row" data-order-row>
      <div><strong data-no-i18n>{order.orderNo}</strong><span>{order.status}</span></div>
      <p>{order.serviceName}</p>
      <time dateTime={order.occurredAt}>{new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }).format(new Date(order.occurredAt))}</time>
      <b>{jpyFormat(order.amountJpy, locale)}</b>
    </article>
  );

  const renderRanking = (item: LiveDashboardSnapshot["serviceRanking"][number]) => (
    <article className="live-dashboard-ranking-row">
      <span className="live-dashboard-rank">{String(item.rank).padStart(2, "0")}</span>
      <div><strong>{item.displayName}</strong><small>{item.completedCount} {t("单完成")}</small></div>
      <b>{jpyFormat(item.gmvJpy, locale)}</b>
    </article>
  );

  return (
    <div className="live-dashboard-canvas">
      <aside className="live-dashboard-column is-left">
        <section className="live-dashboard-panel is-headline">
          <PanelHeading scopeLabel={scopeLabel} title={t("实时概览")} />
          <div className="live-dashboard-metric-grid">
            {metrics.map(([label, value]) => <article key={label}><span>{label}</span><strong>{numberFormat(value, locale)}</strong></article>)}
          </div>
        </section>
        <section className="live-dashboard-panel is-order-overview">
          <PanelHeading scopeLabel={scopeLabel} title={t("订单经营")} />
          <article className="live-dashboard-total-order"><span>{t("订单总量")}</span><strong>{numberFormat(snapshot.orders.total, locale)}</strong></article>
          <div className="live-dashboard-finance-stack">
            <article><span>{t("服务 GMV")}</span><MoneyRows locale={locale} money={snapshot.orders.serviceGmv} /></article>
            <article><span>{t("平台净收入")}</span><MoneyRows locale={locale} money={snapshot.orders.platformNetRevenue} /></article>
            <article><span>{t("代理商分佣")}</span>{snapshot.orders.agentCommission ? <MoneyRows locale={locale} money={snapshot.orders.agentCommission} /> : <strong className="live-dashboard-unavailable">{t("代理商分佣暂不可用")}</strong>}</article>
          </div>
        </section>
        <section className="live-dashboard-panel is-coverage">
          <PanelHeading scopeLabel={scopeLabel} title={t("区域归因完整度")} />
          <div className="live-dashboard-coverage-value"><strong>{snapshot.coverage.completenessPercent.toFixed(1)}%</strong><span>{snapshot.coverage.attributed} / {snapshot.coverage.total}</span></div>
          <div className="live-dashboard-coverage-track"><i style={{ width: `${snapshot.coverage.completenessPercent}%` }} /></div>
          <p>{t("未归因")} {snapshot.coverage.unresolved}</p>
        </section>
      </aside>

      <section className="live-dashboard-center">
        <section className="live-dashboard-confirmed-payments">
          <div><span>{t("已确认服务支付")}</span><small data-scope-label={scopeLabel}>{scopeLabel}</small></div>
          <MoneyRows locale={locale} money={snapshot.confirmedPayments} />
        </section>
        {map}
        <section className="live-dashboard-panel is-trend">
          <PanelHeading scopeLabel={scopeLabel} title={t("订单与支付趋势")} />
          {snapshot.trend.length ? <LiveTrendChart ordersLabel={t("订单数")} paymentsLabel={t("已确认支付 JPY")} points={snapshot.trend} /> : empty}
        </section>
      </section>

      <aside className="live-dashboard-column is-right">
        <section className="live-dashboard-panel is-realtime">
          <PanelHeading scopeLabel={scopeLabel} title={t("实时订单")} />
          {snapshot.realtimeOrders.list.length ? (
            <AutoScrollList className="live-dashboard-scroll-list" getKey={(item) => item.orderNo} intervalMs={3000} items={snapshot.realtimeOrders.list} renderItem={renderOrder} visibleCount={3} />
          ) : empty}
        </section>
        <section className="live-dashboard-panel is-activity">
          <PanelHeading scopeLabel={scopeLabel} title={t("订单与支付动态")} />
          {snapshot.activity.length ? (
            <AutoScrollList className="live-dashboard-scroll-list" getKey={(item) => `${item.orderNo}:${item.occurredAt}`} intervalMs={3500} items={snapshot.activity} renderItem={renderOrder} visibleCount={2} />
          ) : empty}
        </section>
        <section className="live-dashboard-panel is-ranking">
          <PanelHeading scopeLabel={scopeLabel} title={t("服务 TOP10")} />
          {snapshot.serviceRanking.length ? (
            <AutoScrollList className="live-dashboard-scroll-list" getKey={(item) => item.entityPublicId} intervalMs={4000} items={snapshot.serviceRanking} renderItem={renderRanking} visibleCount={3} />
          ) : empty}
        </section>
        <section className="live-dashboard-panel is-ranking">
          <PanelHeading scopeLabel={scopeLabel} title={t("技师 TOP10")} />
          {snapshot.technicianRanking.length ? (
            <AutoScrollList className="live-dashboard-scroll-list" getKey={(item) => item.entityPublicId} intervalMs={4000} items={snapshot.technicianRanking} renderItem={renderRanking} visibleCount={3} />
          ) : empty}
        </section>
      </aside>
    </div>
  );
}
