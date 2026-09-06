import { useMemo } from "react";
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

  const selectScope = (nextScope: typeof scope) => {
    const params = new URLSearchParams();
    params.set("country", nextScope.country);
    if (nextScope.admin1) params.set("admin1", nextScope.admin1);
    if (nextScope.admin2) params.set("admin2", nextScope.admin2);
    params.set("period", nextScope.period);
    navigate({ pathname: location.pathname, search: `?${params.toString()}` });
  };

  const header = (
    <div className="live-dashboard-heading">
      <div>
        <p className="live-dashboard-eyebrow">{t("NeeDo 指挥中心")}</p>
        <h1>{t("NeeDo 实时运营数据")}</h1>
      </div>
      <div className="live-dashboard-connection" role="status">
        <span aria-hidden="true" className={`live-dashboard-connection-dot is-${state.realtimeStatus}`} />
        {t(state.realtimeStatus === "connected" ? "实时连接正常" : state.realtimeStatus === "recovering" ? "实时连接恢复中" : "正在连接实时数据")}
      </div>
    </div>
  );

  return (
    <LiveDashboardShell header={header}>
      {state.snapshot ? (
        <LiveDashboardPanels
          map={(
            <JapanRegionMap
              breadcrumbs={state.snapshot.scope.breadcrumbs}
              children={state.snapshot.children}
              onSelectRegion={selectScope}
              scope={scope}
            />
          )}
          snapshot={state.snapshot}
        />
      ) : (
        <section className="live-dashboard-placeholder" aria-busy={state.status === "loading"}>
          <h2>{t("日本运营地图")}</h2>
          <p>{t(state.status === "loading" ? "正在读取实时经营数据" : "地图数据已就绪")}</p>
          {state.error ? <button onClick={() => void retry()} type="button">{t("重试")}</button> : null}
        </section>
      )}
    </LiveDashboardShell>
  );
}
