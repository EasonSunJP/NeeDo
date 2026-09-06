import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { LiveDashboardShell } from "../../features/live-dashboard/LiveDashboardShell";
import { parseLiveDashboardSearch } from "../../features/live-dashboard/liveDashboardState";
import { useLiveDashboard } from "../../features/live-dashboard/useLiveDashboard";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateTextForContext } from "../../i18n/translations";

export function LiveDashboardPage() {
  const location = useLocation();
  const { language } = useOptionalI18n();
  const t = (source: string) => translateTextForContext(source, language, { portal: "admin" });
  const scope = useMemo(() => parseLiveDashboardSearch(location.search), [location.search]);
  const { state, retry } = useLiveDashboard(scope);

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
      <section className="live-dashboard-placeholder" aria-busy={state.status === "loading"}>
        <h2>{t("日本运营地图")}</h2>
        <p>{t(state.status === "loading" ? "正在读取实时经营数据" : "地图数据已就绪")}</p>
        {state.error ? <button onClick={() => void retry()} type="button">{t("重试")}</button> : null}
      </section>
    </LiveDashboardShell>
  );
}
