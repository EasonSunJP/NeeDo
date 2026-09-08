import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { JapanRegionMap } from "../../features/live-dashboard/JapanRegionMap";
import { LiveDashboardPanels } from "../../features/live-dashboard/LiveDashboardPanels";
import { LiveDashboardShell } from "../../features/live-dashboard/LiveDashboardShell";
import { parseLiveDashboardSearch } from "../../features/live-dashboard/liveDashboardState";
import { useLiveDashboard } from "../../features/live-dashboard/useLiveDashboard";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateTextForContext } from "../../i18n/translations";

export function LiveDashboardPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { language } = useOptionalI18n();
  const t = (source: string) => translateTextForContext(source, language, { portal: "admin" });
  const scope = useMemo(() => parseLiveDashboardSearch(location.search), [location.search]);
  const { state, retry } = useLiveDashboard(scope);
  const [now, setNow] = useState(() => new Date());
  const locale = language === "ja" ? "ja-JP" : language === "ko" ? "ko-KR" : language === "en" ? "en-US" : "zh-CN";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const selectScope = (nextScope: typeof scope) => {
    const params = new URLSearchParams();
    params.set("country", nextScope.country);
    if (nextScope.admin1) params.set("admin1", nextScope.admin1);
    if (nextScope.admin2) params.set("admin2", nextScope.admin2);
    params.set("period", nextScope.period);
    navigate({ pathname: location.pathname, search: `?${params.toString()}` });
  };

  const scopeLabel = state.snapshot?.scope.breadcrumbs.map((item) => item.name).join(" / ") ?? t("日本全国");
  const evaluatedAt = state.snapshot?.evaluatedAt
    ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Tokyo" }).format(new Date(state.snapshot.evaluatedAt))
    : "--:--:--";
  const tokyoClock = new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo"
  }).format(now);

  const header = (
    <div className="live-dashboard-heading">
      <div>
        <p className="live-dashboard-eyebrow">{t("NeeDo 指挥中心")}</p>
        <h1>{t("NeeDo 实时运营数据")}</h1>
      </div>
      <div className="live-dashboard-header-controls">
        <label>
          <span>{t("国家")}</span>
          <select aria-label={t("国家")} disabled value="JP"><option value="JP">{t("日本")}</option></select>
        </label>
        <label>
          <span>{t("统计周期")}</span>
          <select
            aria-label={t("统计周期")}
            onChange={(event) => selectScope({ ...scope, period: event.target.value as typeof scope.period })}
            value={scope.period}
          >
            <option value="today">{t("今日")}</option>
            <option value="last7days">{t("近 7 天")}</option>
            <option value="last30days">{t("近 30 天")}</option>
          </select>
        </label>
        <div className="live-dashboard-header-scope"><span>{t("当前范围")}</span><strong>{scopeLabel}</strong></div>
      </div>
      <div className="live-dashboard-connection" role="status">
        <span aria-hidden="true" className={`live-dashboard-connection-dot is-${state.realtimeStatus}`} />
        {t(state.realtimeStatus === "connected" ? "实时连接正常" : state.realtimeStatus === "recovering" ? "实时连接恢复中" : "正在连接实时数据")}
      </div>
      <div className="live-dashboard-clock" data-no-i18n>
        <span>JST</span><strong>{tokyoClock}</strong><small>{t("更新")} {evaluatedAt}</small>
      </div>
    </div>
  );

  return (
    <LiveDashboardShell header={header}>
      <div className="live-dashboard-workspace">
        {state.status === "loading" && state.snapshot ? (
          <p className="live-dashboard-state-banner" role="status">{t("正在切换区域，当前仍显示上次成功数据")} {state.pendingTargetLabel ?? ""}</p>
        ) : null}
        {state.status === "stale" && state.snapshot ? (
          <div className="live-dashboard-state-banner is-warning" role="alert"><span>{t("数据可能已过期")}</span><button onClick={() => void retry()} type="button">{t("重新读取")}</button></div>
        ) : null}
        {state.snapshot ? (
          <LiveDashboardPanels
            map={(
              <JapanRegionMap
                breadcrumbs={state.snapshot.scope.breadcrumbs}
                children={state.snapshot.children}
                evaluatedAt={state.snapshot.evaluatedAt}
                onSelectRegion={selectScope}
                scope={scope}
              />
            )}
            snapshot={state.snapshot}
          />
        ) : state.status === "error" ? (
          <section className="live-dashboard-first-error" role="alert">
            <p className="live-dashboard-eyebrow">{t("实时数据暂不可用")}</p>
            <h2>{t("无法读取运营数据")}</h2>
            <p>{t("请确认网络与权限后重试，页面不会显示推测数据")}</p>
            <div><button onClick={() => void retry()} type="button">{t("重试")}</button><a href="/pf-admin.html#/admin">{t("返回数据大盘")}</a></div>
          </section>
        ) : (
          <section className="live-dashboard-placeholder" aria-busy={state.status === "loading"}>
            <h2>{t("日本运营地图")}</h2>
            <p>{t("正在读取实时经营数据")}</p>
          </section>
        )}
      </div>
    </LiveDashboardShell>
  );
}
